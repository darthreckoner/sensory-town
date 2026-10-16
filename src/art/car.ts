// The player's car (v2): a sleek, real-proportioned roadster — long hood, low
// raked windshield, bucket seats side by side (driver on the left, a passenger
// on the right), alloy rims, LED head- and tail-lights, clearcoat paint with
// gloss / matte / chrome finishes, neon underglow and a boost flame.
//
// Local space faces -z (like a camera), so the scene positions it with
// setPose(x, y, z, heading, pitch, roll).
//
//   group            root: position + yaw + terrain tilt
//    ├ glow          neon underglow plane (additive)
//    ├ rig           everything that leans / pitches / bounces / squashes
//    │   ├ body, doors, seats, dash, glass, lights ...
//    │   ├ driver (Character, seated) and the passenger seat mount
//    └ wheels ×4     (front pair steer; all spin with speed)
import * as THREE from 'three';
import type { Outfit } from '../core/model';
import { tuning } from '../tuning';
import { mesh, roundedBox, toyMatUnique } from './materials';
import { Character } from './character';
import { bakeStatic, clamp, lathe } from '../drive/envUtils';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../drive/palette';
import { Mesher } from '../drive/mesher';
import { mat } from '../drive/kit';

export type CarFinish = 'gloss' | 'matte' | 'chrome';
export interface CarStyle {
  finish: CarFinish;
  neon: string | null;
  trail: boolean;
  rims: string;
}
export const DEFAULT_STYLE: CarStyle = { finish: 'gloss', neon: null, trail: false, rims: '#d9dce6' };

/** What the physics + scene tell the car's body each frame. */
export interface CarMotion {
  /** Signed forward speed, units / s. */
  speed: number;
  speed01: number;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  steer: number;
  /** Longitudinal acceleration, units / s². */
  accel: number;
  /** Cornering force proxy: yawRate × speed. Positive = turning right. */
  lateral: number;
  braking: boolean;
  /** 0..1 */
  boost: number;
  airborne: boolean;
  /** sideways slip speed */
  slip: number;
}

const WHEEL_R = 0.34;
const WHEEL_W = 0.26;
const WHEEL_X = 0.8;
const WHEEL_Z = 1.32;

function bodyShape(): THREE.Shape {
  // side profile in (forward distance, height); the nose is at +x
  const top: [number, number][] = [
    [2.2, 0.34], [2.22, 0.5], [2.12, 0.64], [1.8, 0.76], [1.3, 0.84], [0.8, 0.88], [0.45, 0.9],
    [0.4, 0.66], [0.36, 0.58], [-1.0, 0.58], [-1.1, 0.62], [-1.18, 0.88], [-1.7, 0.93], [-2.05, 0.92], [-2.2, 0.82],
    [-2.2, 0.5], [-2.15, 0.34], [-1.95, 0.25],
  ];
  const s = new THREE.Shape();
  top.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  // wheel arches: a semicircle over each wheel, walking tail → nose
  const arch = (cx: number): void => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      s.lineTo(cx - Math.cos(Math.PI * t) * 0.4, 0.34 + Math.sin(Math.PI * t) * 0.4);
    }
  };
  arch(-WHEEL_Z);
  s.lineTo(-0.92, 0.25);
  s.lineTo(0.92, 0.25);
  arch(WHEEL_Z);
  s.lineTo(1.9, 0.26);
  s.lineTo(2.15, 0.28);
  s.lineTo(2.2, 0.34);
  return s;
}

export class Car {
  readonly group = new THREE.Group();
  readonly driver: Character;
  /** Where a passenger sits (child of the leaning rig). */
  readonly seatRoot = new THREE.Object3D();
  passenger: Character | null = null;
  readonly paint: THREE.MeshPhysicalMaterial;
  private style: CarStyle = { ...DEFAULT_STYLE };
  private baseColor = new THREE.Color('#ff2e88');

  private readonly rig = new THREE.Group();
  private readonly wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  private readonly swSpin = new THREE.Group();
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly tail: THREE.MeshBasicMaterial;
  private readonly wheelMat: THREE.MeshStandardMaterial;
  private readonly wheelGeo = new Map<number, WheelGeo>();
  private readonly flames: THREE.Mesh[] = [];
  private spinAngle = 0;
  private roll = 0;
  private pitch = 0;
  private bounceY = 0;
  private bounceVel = 0;
  private flicker = 0;

  constructor(color: string, outfit: Outfit, style?: Partial<CarStyle>) {
    this.paint = toyMatUnique(color, 'gloss');
    this.wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });
    this.tail = new THREE.MeshBasicMaterial({ color: '#8a1218', toneMapped: false });
    this.group.rotation.order = 'YXZ';
    // these are recoloured at runtime, so they must never be folded into look-alike materials
    for (const m of [this.paint, this.tail]) m.userData.keep = true;

    // soft contact shadow
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 5.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.4, depthWrite: false }),
    );
    shadow.position.y = 0.03;
    shadow.renderOrder = -1;
    this.group.add(shadow);

    // neon underglow
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(), color: '#00d4ff', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.8).rotateX(-Math.PI / 2), this.glowMat);
    this.glow.position.y = 0.06;
    this.glow.renderOrder = 2;
    this.glow.visible = false;
    this.group.add(this.glow);

    this.group.add(this.rig);
    this.buildBody();
    this.buildInterior();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * WHEEL_X, WHEEL_R, sz * WHEEL_Z);
      const spin = new THREE.Group();
      spin.add(this.buildWheel(sx));
      pivot.add(spin);
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, front: sz < 0 });
    }

    // seated driver + passenger seat
    const d = tuning.drive;
    // (no shadow casting for the seated people: 47 fewer draw calls in the shadow pass)
    this.driver = new Character(outfit, { seated: true, shadows: false });
    this.driver.group.position.set(-0.42, d.driverY - Character.SEAT_Y * d.driverScale, 0.36);
    this.driver.group.scale.setScalar(d.driverScale);
    this.driver.group.rotation.y = d.driverYaw;
    this.rig.add(this.driver.group);
    this.seatRoot.position.set(0.42, d.driverY, 0.36);
    this.rig.add(this.seatRoot);

    this.paint.color.set(color);
    this.baseColor.set(color);
    this.setStyle({ ...DEFAULT_STYLE, ...style });
  }

  // ── public API ───────────────────────────────────────────────────────────
  setPose(x: number, y: number, z: number, heading: number, pitch = 0, roll = 0): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(pitch, -heading, roll);
  }

  setColor(hex: string): void {
    this.baseColor.set(hex);
    this.applyFinish();
  }

  setStyle(s: Partial<CarStyle>): void {
    this.style = { ...this.style, ...s };
    this.applyFinish();
    this.recolorWheels();
    this.glow.visible = !!this.style.neon;
    if (this.style.neon) this.glowMat.color.set(this.style.neon);
  }
  get currentStyle(): CarStyle {
    return this.style;
  }

  private applyFinish(): void {
    const p = this.paint;
    switch (this.style.finish) {
      case 'matte':
        p.color.copy(this.baseColor);
        p.roughness = 0.78;
        p.metalness = 0.25;
        p.clearcoat = 0;
        p.envMapIntensity = 0.8;
        break;
      case 'chrome':
        p.color.copy(this.baseColor).lerp(new THREE.Color('#ffffff'), 0.4);
        p.roughness = 0.04;
        p.metalness = 1;
        p.clearcoat = 0;
        p.envMapIntensity = 1.7;
        break;
      default:
        p.color.copy(this.baseColor);
        p.roughness = 0.3;
        p.metalness = 0.28;
        p.clearcoat = 1;
        p.clearcoatRoughness = 0.08;
        p.envMapIntensity = 1.2;
    }
    p.needsUpdate = true;
    this.recolorWheels();
  }

  setOutfit(outfit: Outfit): void {
    this.driver.setOutfit(outfit);
  }

  /** Seat (or remove, with null) a passenger. The car owns its passenger: whoever leaves is disposed. */
  setPassenger(c: Character | null): void {
    const old = this.passenger;
    if (old) {
      this.seatRoot.remove(old.group);
      if (old !== c) old.dispose();
    }
    this.passenger = c;
    if (c) {
      const d = tuning.drive;
      c.group.position.set(0, -Character.SEAT_Y * d.driverScale, 0);
      c.group.scale.setScalar(d.driverScale);
      c.group.rotation.set(0, d.driverYaw, 0);
      this.seatRoot.add(c.group);
    }
  }

  seatWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.seatRoot.getWorldPosition(out);
  }

  /** Hide the seated driver (while the player is out walking). */
  setDriverVisible(v: boolean): void {
    this.driver.group.visible = v;
  }

  bump(strength: number): void {
    this.bounceVel += clamp(strength / 9, 0.25, 1.4) * tuning.drive.carBounceKick;
  }
  honk(): void {
    this.bounceVel += 0.9;
    this.driver.wave();
  }

  update(dt: number, t: number, m: CarMotion): void {
    const d = tuning.drive;
    const rollT = clamp(m.lateral / (d.turnRate * d.topSpeed * 0.7), -1, 1) * d.carLean + clamp(m.slip * 0.03, -0.1, 0.1);
    const acc = clamp(m.accel / 10, -1, 1);
    const k = 1 - Math.exp(-9 * dt);
    this.roll += (rollT - this.roll) * k;
    this.pitch += (acc * d.carPitch - this.pitch) * k;

    // suspension: a damped spring that bumps, landings and honks kick
    this.bounceVel += (-170 * this.bounceY - 11 * this.bounceVel) * dt;
    this.bounceY += this.bounceVel * dt;
    const buzz = Math.sin(t * 47) * 0.005 + Math.sin(t * 31 + 1) * 0.003;
    this.rig.position.y = Math.max(-0.06, this.bounceY) + (m.airborne ? 0 : buzz * (0.25 + m.speed01));
    this.rig.rotation.set(this.pitch, 0, this.roll);
    const sy = 1 - Math.abs(acc) * d.carSquash + clamp(this.bounceVel * 0.012, -0.05, 0.05);
    const sxz = 1 + Math.abs(acc) * d.carSquash * 0.5 - clamp(this.bounceVel * 0.006, -0.025, 0.025);
    this.rig.scale.set(sxz, sy, sxz);

    // wheels
    this.spinAngle += (m.speed / WHEEL_R) * dt;
    const yaw = -m.steer * d.wheelSteerAngle;
    for (const w of this.wheels) {
      w.spin.rotation.x = -this.spinAngle;
      if (w.front) w.pivot.rotation.y = yaw;
    }
    this.swSpin.rotation.z = -m.steer * 1.6;

    // brake lights, boost flames, underglow pulse
    this.tail.color.set(m.braking ? '#ff3a30' : '#8a1218');
    this.flicker += dt * 40;
    for (const f of this.flames) {
      f.visible = m.boost > 0.05;
      if (f.visible) {
        const s = (0.7 + 0.5 * Math.random()) * m.boost;
        f.scale.set(s, s, s * (1 + Math.sin(this.flicker) * 0.15));
      }
    }
    if (this.glow.visible) this.glowMat.opacity = 0.8 + Math.sin(t * 3) * 0.15;

    this.driver.setSteer(m.steer);
    this.driver.update(dt, t);
    this.passenger?.update(dt, t);
  }

  // ── construction ─────────────────────────────────────────────────────────
  // Draw-call diet: everything static is baked into ONE mesh per finish class —
  // paint (body shell + painted trim), flat colours, chrome, glow, glass — plus the
  // tail lights (recoloured when braking), the steering wheel and four one-piece
  // wheels. About 12 meshes, one shadow caster.
  private buildBody(): void {
    const detail = new THREE.Group();
    // the extruded, bevelled shell with real wheel arches
    const geo = new THREE.ExtrudeGeometry(bodyShape(), {
      depth: 1.5, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.1, bevelOffset: -0.1, bevelSegments: 3, curveSegments: 8,
    });
    // shape x = forward distance, shape z = width → car x = width, car z = -forward
    geo.rotateY(Math.PI / 2);
    geo.translate(-0.75, 0, 0);
    const body = new THREE.Mesh(geo, this.paint);
    detail.add(body);

    const m = new Mesher();
    m.push(0, 0, 0);
    const flat = (c: string): THREE.Material => mat.std(c, 0.55, 0.1);
    const trim = flat(PAL.trim);
    const dark = flat('#16151c');
    const chrome = mat.chrome();
    const paint = this.paint;
    // door panels / sills along the open cockpit
    for (const sx of [-1, 1]) {
      m.box(paint, sx * 0.86, 0.74, 0.36, 0.13, 0.34, 1.52);
      m.box(chrome, sx * 0.86, 0.93, 0.36, 0.1, 0.03, 1.5);
    }
    // cockpit tub floor + rear bulkhead
    m.box(dark, 0, 0.56, 0.32, 1.62, 0.04, 1.4);
    m.box(dark, 0, 0.78, 1.08, 1.6, 0.4, 0.08);
    // cowl dash
    m.box(dark, 0, 0.78, -0.3, 1.62, 0.26, 0.4);
    m.box(mat.neon('#00d4ff'), 0, 0.93, -0.12, 0.7, 0.025, 0.02);
    // raked windshield: glass between two A-pillars
    const glass = new THREE.MeshStandardMaterial({ color: '#8fc4e8', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    m.quad(glass, [-0.8, 0.9, -0.42], [0.8, 0.9, -0.42], [0.8, 1.3, -0.08], [-0.8, 1.3, -0.08]);
    for (const sx of [-1, 1]) {
      m.quad(trim, [sx * 0.82, 0.9, -0.43], [sx * 0.82, 1.3, -0.09], [sx * 0.76, 1.3, -0.09], [sx * 0.76, 0.9, -0.43]);
      m.box(dark, sx * 0.97, 1.0, -0.3, 0.12, 0.08, 0.2);   // mirror
    }
    m.box(chrome, 0, 1.3, -0.085, 1.62, 0.04, 0.05);
    // front: grille, splitter, headlights (glowing), DRL strip, fog lights
    m.box(dark, 0, 0.45, -2.2, 0.95, 0.15, 0.1);
    m.box(dark, 0, 0.27, -2.08, 1.7, 0.04, 0.34);
    for (const sx of [-1, 1]) {
      m.box(mat.neon('#e6f4ff'), sx * 0.62, 0.7, -2.0, 0.5, 0.09, 0.12);
      m.box(mat.neon('#ffb347'), sx * 0.62, 0.62, -2.04, 0.5, 0.025, 0.06);
      m.box(dark, sx * 0.62, 0.7, -1.95, 0.56, 0.14, 0.04);
      m.box(mat.neon('#ffffff'), sx * 0.74, 0.37, -2.15, 0.1, 0.06, 0.04);
    }
    // hood vents
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) m.box(dark, sx * 0.4, 0.88 - i * 0.0, -1.0 - i * 0.14 + 0.0, 0.34, 0.012, 0.05);
    // rear: LED bar + clusters, plate, diffuser, exhausts
    m.box(this.tail, 0, 0.9, 2.2, 1.5, 0.07, 0.04);
    for (const sx of [-1, 1]) {
      m.box(this.tail, sx * 0.72, 0.84, 2.18, 0.28, 0.1, 0.05);
      m.box(mat.neon('#ffffff'), sx * 0.52, 0.6, 2.2, 0.1, 0.05, 0.03);
    }
    m.box(flat('#f3f2ee'), 0, 0.62, 2.21, 0.62, 0.2, 0.025);
    m.box(dark, 0, 0.3, 2.12, 1.5, 0.12, 0.2);
    // roll hoops (chrome) behind the seats + a small deck spoiler lip
    for (const sx of [-1, 1]) {
      m.box(chrome, sx * 0.44, 1.02, 0.98, 0.07, 0.34, 0.07);
      m.box(mat.neon('#ffffff'), sx * 0.44, 1.2, 0.98, 0.09, 0.03, 0.09);
    }
    m.box(paint, 0, 0.99, 2.0, 1.4, 0.04, 0.2);
    detail.add(m.build('car-detail'));

    // exhaust tips and boost flames (cones pointing back)
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 12).rotateX(Math.PI / 2), chrome);
      tip.position.set(sx * 0.5, 0.36, 2.2);
      detail.add(tip);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.2, 8, 1, true).translate(0, 0.6, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8fd9ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      f.position.set(sx * 0.5, 0.36, 2.3);
      f.visible = false;
      this.rig.add(f);
      this.flames.push(f);
    }

    // seats, console, steering column (static)
    const seat = flat('#1d1b26');
    const accent = flat('#ff2e88');
    for (const sx of [-1, 1]) {
      const base = mesh(roundedBox(0.52, 0.14, 0.56, 0.05, 2), seat, false, false);
      base.position.set(sx * 0.42, 0.62 - 0.05, 0.38);
      const back = mesh(roundedBox(0.52, 0.44, 0.12, 0.05, 2), seat, false, false);
      back.position.set(sx * 0.42, 0.86, 0.72);
      back.rotation.x = -0.2;
      const stripe = mesh(roundedBox(0.08, 0.34, 0.02, 0.01, 1), accent, false, false);
      stripe.position.set(sx * 0.42, 0.86, 0.65);
      stripe.rotation.x = -0.2;
      detail.add(base, back, stripe);
    }
    const con = mesh(roundedBox(0.18, 0.16, 0.9, 0.04, 2), flat('#2e2b3a'), false, false);
    con.position.set(0, 0.66, 0.2);
    detail.add(con);
    const colHolder = new THREE.Group();
    colHolder.position.set(-0.42, 1.0, -0.05);
    colHolder.rotation.x = 1.1;
    const col = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8).rotateX(Math.PI / 2), dark, false, false);
    col.position.z = -0.17;
    colHolder.add(col);
    detail.add(colHolder);

    // Normalise the shadow flags so the pieces fold together: only the paint casts (one caster for the whole car),
    // and the car never receives shadows (smooth shell, no acne).
    detail.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      mm.castShadow = mm.material === this.paint;
      mm.receiveShadow = false;
    });
    this.rig.add(bakeStatic(detail));
  }

  private buildInterior(): void {
    // steering wheel (animated): a thick ring + spokes, one mesh
    const flat = (c: string): THREE.Material => mat.std(c, 0.55, 0.1);
    const sw = new THREE.Group();
    sw.position.set(-0.42, 1.0, -0.05);
    sw.rotation.x = 1.1;
    const parts = new THREE.Group();
    parts.add(mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 22), flat('#16151c'), false, false));
    parts.add(mesh(roundedBox(0.34, 0.03, 0.03, 0.01, 1), flat('#8d8b96'), false, false));
    parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12).rotateX(Math.PI / 2), flat('#ff2e88'), false, false));
    const mark = mesh(roundedBox(0.03, 0.06, 0.03, 0.01, 1), flat('#ffffff'), false, false);
    mark.position.set(0, 0.17, 0);
    parts.add(mark);
    parts.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) mm.castShadow = mm.receiveShadow = false;
    });
    for (const c of [...bakeStatic(parts).children]) this.swSpin.add(c);
    sw.add(this.swSpin);
    this.rig.add(sw);
  }

  /** Low-profile tyre, 5-spoke alloy and centre cap as ONE vertex-coloured mesh (rim + cap colours change with the paint sheet). */
  private buildWheel(side: number): THREE.Object3D {
    let rec = this.wheelGeo.get(side);
    if (!rec) {
      rec = makeWheelGeometry(side);
      this.wheelGeo.set(side, rec);
      this.recolorWheels();
    }
    const m = new THREE.Mesh(rec.geo, this.wheelMat);
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  private recolorWheels(): void {
    const tire = new THREE.Color('#1b1a22');
    const rim = new THREE.Color(this.style.rims);
    const cap = this.baseColor;
    for (const rec of this.wheelGeo.values()) {
      const a = rec.geo.attributes.color as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const put = (from: number, to: number, c: THREE.Color): void => {
        for (let i = from; i < to; i++) {
          arr[i * 3] = c.r;
          arr[i * 3 + 1] = c.g;
          arr[i * 3 + 2] = c.b;
        }
      };
      put(0, rec.tireEnd, tire);
      put(rec.tireEnd, rec.rimEnd, rim);
      put(rec.rimEnd, rec.count, cap);
      a.needsUpdate = true;
    }
  }
}

interface WheelGeo {
  geo: THREE.BufferGeometry;
  tireEnd: number;
  rimEnd: number;
  count: number;
}

/** A wheel's geometry in one non-indexed buffer: [tyre | rim lip + spokes | cap], with a colour attribute to fill. */
function makeWheelGeometry(side: number): WheelGeo {
  const R = WHEEL_R, W = WHEEL_W, rr = 0.09;
  const prof: [number, number][] = [[0, -W / 2]];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    prof.push([R - rr + rr * Math.cos(a), -W / 2 + rr + rr * Math.sin(a)]);
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    prof.push([R - rr + rr * Math.cos(a), W / 2 - rr + rr * Math.sin(a)]);
  }
  prof.push([0, W / 2]);
  const piece = (g: THREE.BufferGeometry, m4: THREE.Matrix4): THREE.BufferGeometry => {
    let c = g.clone().applyMatrix4(m4);
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    if (c.index) c = c.toNonIndexed();
    return c;
  };
  const xo = side * (W / 2 - 0.015);
  const T = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);
  const tire = [piece(lathe(prof, 28), new THREE.Matrix4().makeRotationZ(Math.PI / 2))];
  const rim = [piece(new THREE.CylinderGeometry(0.255, 0.255, 0.04, 28).rotateZ(Math.PI / 2), T(xo, 0, 0))];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(xo + side * 0.01, Math.cos(a) * 0.125, Math.sin(a) * 0.125), new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)), new THREE.Vector3(1, 1, 1));
    rim.push(piece(roundedBox(0.04, 0.22, 0.055, 0.012, 1), m4));
  }
  const cap = [piece(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).rotateZ(Math.PI / 2), T(xo + side * 0.02, 0, 0))];
  const n = (l: THREE.BufferGeometry[]): number => l.reduce((s, g) => s + g.attributes.position.count, 0);
  const geo = mergeGeometries([...tire, ...rim, ...cap], false)!;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  geo.computeBoundingSphere();
  return { geo, tireEnd: n(tire), rimEnd: n(tire) + n(rim), count: geo.attributes.position.count };
}

// ── small canvas textures ───────────────────────────────────────────────────
let contactTex: THREE.CanvasTexture | null = null;
function contactTexture(): THREE.CanvasTexture {
  if (!contactTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 64, 4, 32, 64, 60);
    g.addColorStop(0, 'rgba(20,16,30,1)');
    g.addColorStop(1, 'rgba(20,16,30,0)');
    x.fillStyle = g;
    x.save();
    x.scale(1, 1);
    x.fillRect(0, 0, 64, 128);
    x.restore();
    contactTex = new THREE.CanvasTexture(c);
  }
  return contactTex;
}
let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const x = c.getContext('2d')!;
    // a soft rounded-rectangle halo (brighter at the edge of the car, fading outward)
    const g = x.createRadialGradient(64, 128, 20, 64, 128, 124);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 256);
    glowTex = new THREE.CanvasTexture(c);
    glowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return glowTex;
}
