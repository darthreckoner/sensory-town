// ── v3 movement (W4) ── Ziplines: a few cables strung between high points of the island.
//
// Walk up to a start post (a glowing pad at its foot) and a big "Zip!" bubble appears (tap it, or E / F). You hop up, grab the
// pulley and ride the sag curve of the cable, speeding up as it drops, with the wind whooshing. Jump to let go (the glider
// opens if you are high); the cable ends over a landing pad. Cables are one-way (a little brake post at the low end).
//
// The line data is local (townLayout belongs to the world agent): anchors are given as x, z and the post heights are added to the
// real ground height at build time, so the lines follow the terrain (and the Mall's roof landing for the rooftop line).
// Visuals are 3 draw calls for ALL lines: one merged cable tube, one merged solid mesh (posts, platforms, flags), one glow mesh (pads).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { groundHeight } from '../world/heightfield';
import { bindTap, el } from '../ui/ui';
import { clamp } from './envUtils';
import type { Character } from '../art/character';
import type { FootPhysics } from './foot';

export interface ZipDef {
  id: string;
  name: string;
  /** start post (x, z): the foot of it is where you stand */
  a: [number, number];
  /** end post */
  b: [number, number];
  /** post heights above the ground (the start is tall, the end a short brake post) */
  poleA: number;
  poleB: number;
}

/**
 * The lines (checked against the real terrain and building boxes: the cable clears them with at least ~0.3 m under the
 * rider's feet). Summit: the high shelf above the lodge down to the lodge forecourt. Lookout: the plateau down to Cozy Hills.
 * Windmills: Bloom Meadow's ridge down across the flowers. Rooftop: the Mall's roof landing (up the back stairs) over the
 * downtown blocks to the Home Hills link road.
 */
export const ZIPS: ZipDef[] = [
  { id: 'summit', name: 'Summit Zip', a: [68, -236], b: [84, -160], poleA: 6.5, poleB: 2.1 },
  { id: 'lookout', name: 'Lookout Zip', a: [-96, -105], b: [-85, -22], poleA: 6.5, poleB: 2.1 },
  { id: 'windmills', name: 'Windmill Zip', a: [3, 171], b: [63, 192], poleA: 6.5, poleB: 2.1 },
  { id: 'rooftop', name: 'Rooftop Zip', a: [12, 30], b: [-60, 54], poleA: 6.5, poleB: 2.1 },
];

const HANG = 2.12; // from the cable (the pulley wheel) down to the feet: 1.92 to the grip + 0.2 of pulley
const N = 48; // points per cable

interface Zip {
  def: ZipDef;
  pts: THREE.Vector3[];
  cum: number[];
  len: number;
  /** arc length where the ride ends (a little before the post) */
  stopS: number;
  /** ground under the start post */
  base: THREE.Vector3;
  /** unit direction on the ground (a → b) */
  dx: number;
  dz: number;
}

export type ZipEnd = 'arrived' | 'dropped';

const eul = new THREE.Euler(0, 0, 0, 'YXZ');

export class ZipLines {
  readonly group = new THREE.Group();
  active = false;
  /** the line being ridden (or null) */
  zip: Zip | null = null;
  /** arc length / speed along the cable */
  s = 0;
  v = 0;
  /** heading of the cable (game convention) while riding */
  heading = 0;
  /** the walker's feet while riding (the hub mirrors it into FootPhysics) */
  readonly feet = new THREE.Vector3();

  private readonly zips: Zip[] = [];
  private phase: 'lift' | 'ride' = 'lift';
  private t = 0;
  private from = new THREE.Vector3();
  private cool = 0;
  private readonly pulley: THREE.Group;
  private readonly bubble: HTMLDivElement;
  private shown: Zip | null = null;
  private onTap: (() => void) | null = null;
  private tilt = 0;
  private roll = 0;
  private pos = new THREE.Vector3();
  private tan = new THREE.Vector3();

  constructor(ui: HTMLElement) {
    this.group.name = 'ziplines';
    this.build();
    // the "Zip!" bubble: the same big pill as the ride prompt
    this.bubble = el('div', 'drive-prompt interactive hidden v3-zip-prompt', ui) as HTMLDivElement;
    el('span', 'ico', this.bubble, '🚡');
    el('span', 'txt', this.bubble, 'Zip!');
    bindTap(this.bubble, () => this.onTap?.());
    this.pulley = makePulley();
    this.pulley.visible = false;
  }

  // ── building the lines ────────────────────────────────────────────────────
  private build(): void {
    const tubes: THREE.BufferGeometry[] = [];
    const solids: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    const col = new THREE.Color();
    const place = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rotY = 0, into = solids): void => {
      const g = geo.clone();
      g.rotateY(rotY);
      g.translate(x, y, z);
      const c = col.set(color);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      into.push(g);
    };
    const postGeo = (h: number, r: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r * 0.8, r, h, 10);
    const cap = new THREE.SphereGeometry(0.34, 12, 8);
    const arm = new THREE.BoxGeometry(0.22, 0.2, 1.7);
    const disc = new THREE.CylinderGeometry(1.7, 1.9, 2.2, 24); // deep, so it still sits flush on a steep slope
    const flag = new THREE.PlaneGeometry(1.5, 0.9);
    flag.translate(0.75, 0, 0);
    const ring = (r0: number, r1: number): THREE.BufferGeometry => new THREE.RingGeometry(r0, r1, 36).rotateX(-Math.PI / 2);

    for (const def of ZIPS) {
      const ga = groundHeight(def.a[0], def.a[1], true), gb = groundHeight(def.b[0], def.b[1], true);
      const ya = ga + def.poleA, yb = gb + def.poleB;
      const ddx = def.b[0] - def.a[0], ddz = def.b[1] - def.a[1];
      const gl = Math.hypot(ddx, ddz);
      const dx = ddx / gl, dz = ddz / gl;
      const sag = Math.min(4, gl * 0.022);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push(new THREE.Vector3(def.a[0] + ddx * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), def.a[1] + ddz * t));
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const len = cum[cum.length - 1];
      const stopS = len - 1.7;
      const zip: Zip = { def, pts, cum, len, stopS, base: new THREE.Vector3(def.a[0], ga, def.a[1]), dx, dz };
      this.zips.push(zip);

      // the cable: a thin tube along the sag curve
      tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.045, 4, false));
      const yaw = Math.atan2(dx, dz); // the arm / flag point along the cable (rotateY: +z forward)
      // start post: a tall striped pole on a round platform, with a cap, a cross arm and a flag
      place(disc, '#2a2350', def.a[0], ga + 0.22 - 1.1, def.a[1], 0);
      place(postGeo(def.poleA, 0.22), '#ff2e88', def.a[0], ga + def.poleA / 2, def.a[1]);
      place(postGeo(1.0, 0.25), '#ffffff', def.a[0], ga + 1.2, def.a[1]);
      place(postGeo(1.0, 0.24), '#ffffff', def.a[0], ga + 3.0, def.a[1]);
      place(cap, '#ffc93c', def.a[0], ya + 0.12, def.a[1]);
      place(arm, '#00d4ff', def.a[0] + dx * 0.8, ya - 0.05, def.a[1] + dz * 0.8, yaw);
      place(flag, '#ffc93c', def.a[0], ya - 1.0, def.a[1], yaw + Math.PI / 2);
      // the glowing pad you stand on (where the Zip! bubble appears)
      place(ring(0.9, 1.5), '#00d4ff', def.a[0], ga + 0.3, def.a[1], 0, glows);
      place(ring(0.25, 0.55), '#ffffff', def.a[0], ga + 0.3, def.a[1], 0, glows);
      // end: a short brake post at the cable's end, and a landing pad under where the ride stops
      place(postGeo(def.poleB, 0.2), '#ff2e88', def.b[0], gb + def.poleB / 2, def.b[1]);
      place(cap, '#ffc93c', def.b[0], yb + 0.1, def.b[1]);
      const sp = pointAt(zip, stopS);
      const gs = groundHeight(sp.x, sp.z, true);
      place(ring(1.0, 2.0), '#b6ff3b', sp.x, gs + 0.06, sp.z, 0, glows);
      place(ring(0.3, 0.6), '#ffffff', sp.x, gs + 0.06, sp.z, 0, glows);
    }

    const cable = new THREE.Mesh(mergeGeometries(tubes, false), new THREE.MeshStandardMaterial({ color: '#2a2a35', roughness: 0.4, metalness: 0.6 }));
    const solid = new THREE.Mesh(mergeGeometries(solids, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }));
    const glow = new THREE.Mesh(mergeGeometries(glows, false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    cable.castShadow = solid.castShadow = true;
    cable.name = 'zip-cable';
    solid.name = 'zip-posts';
    glow.name = 'zip-pads';
    for (const m of [cable, solid, glow]) {
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    for (const g of [...tubes, ...solids, ...glows]) g.dispose();
  }

  /** The pulley hangs on the character's hands for the ride. */
  attach(w: Character): void {
    if (this.pulley.parent !== w.gliderAnchor) w.gliderAnchor.add(this.pulley);
  }

  // ── "Zip!" bubble ─────────────────────────────────────────────────────────
  /** The start post the walker is standing at (or null). */
  near(f: FootPhysics): Zip | null {
    if (this.active || this.cool > 0 || !f.grounded || f.swimming) return null;
    const R = tuning.movement3.zipRadius;
    for (const z of this.zips) {
      if (Math.hypot(f.x - z.base.x, f.z - z.base.z) < R && Math.abs(f.y - z.base.y) < 2.2) return z;
    }
    return null;
  }

  /** Show / hide the bubble. `can` = on foot and free to go. */
  tick(dt: number, f: FootPhysics, can: boolean, go: () => void): void {
    this.cool = Math.max(0, this.cool - dt);
    const z = can ? this.near(f) : null;
    if (z === this.shown) return;
    this.shown = z;
    this.onTap = z ? go : null;
    this.bubble.classList.toggle('hidden', !z);
  }

  /** The line under the bubble, if it is showing. */
  get ready(): Zip | null {
    return this.shown;
  }

  // ── the ride ──────────────────────────────────────────────────────────────
  start(zip: Zip, f: FootPhysics): void {
    this.active = true;
    this.zip = zip;
    this.phase = 'lift';
    this.t = 0;
    this.s = 0;
    this.v = tuning.movement3.zipStart;
    this.from.set(f.x, f.y, f.z);
    this.heading = Math.atan2(zip.dx, -zip.dz);
    f.heading = this.heading;
    this.tilt = 0;
    this.roll = 0;
    this.pulley.visible = true;
    this.hangAt(0, this.feet);
    this.shown = null;
    this.bubble.classList.add('hidden');
    bus.emit('zipStart', { pos: { x: f.x, y: f.y + 1, z: f.z } });
    bus.emit('airStart', {});
  }

  /** The point on the cable where the feet hang when the rider is at arc length s. */
  private hangAt(s: number, out: THREE.Vector3): void {
    const z = this.zip!;
    const p = pointAt(z, s, this.tan);
    out.set(p.x - z.dx * 0.2, p.y - HANG, p.z - z.dz * 0.2);
  }

  /** One frame. Returns how it ended ('arrived' at the pad, 'dropped' by a jump), or null while it goes on. */
  update(dt: number, jumpEdge: boolean, steer: number): ZipEnd | null {
    if (!this.active || !this.zip) return null;
    const m = tuning.movement3;
    const z = this.zip;
    this.t += dt;
    if (this.phase === 'lift') {
      // hop up and grab the pulley
      const u = clamp(this.t / m.zipLiftSeconds, 0, 1);
      const e = u * u * (3 - 2 * u);
      this.hangAt(0, this.pos);
      this.feet.set(
        this.from.x + (this.pos.x - this.from.x) * e,
        this.from.y + (this.pos.y - this.from.y) * e + Math.sin(u * Math.PI) * 0.7,
        this.from.z + (this.pos.z - this.from.z) * e,
      );
      if (u >= 1) this.phase = 'ride';
      return null;
    }
    // gravity along the cable: the tangent's slope
    pointAt(z, this.s, this.tan);
    const slope = -this.tan.y; // positive = going downhill
    this.v = clamp(this.v + (slope * m.zipGravity - 0.12 * this.v * 0.1) * dt, m.zipMinSpeed, m.zipMax);
    this.s += this.v * dt;
    // a little sway from the stick
    this.roll += (clamp(-steer * 0.25, -0.3, 0.3) + Math.sin(this.t * 2.1) * 0.05 * (this.v / m.zipMax) - this.roll) * Math.min(1, dt * 4);
    if (jumpEdge && this.t > 0.7) return 'dropped';
    if (this.s >= z.stopS) {
      this.s = z.stopS;
      this.hangAt(this.s, this.feet);
      return 'arrived';
    }
    this.hangAt(this.s, this.feet);
    bus.emit('airUpdate', { speed01: clamp(this.v / 18, 0, 1), dive: 0 });
    return null;
  }

  /** The ride is over: tidy up. */
  finish(w: Character, how: ZipEnd): void {
    this.active = false;
    this.zip = null;
    this.pulley.visible = false;
    this.cool = 1.5;
    bus.emit('airStop', {});
    if (how === 'arrived') bus.emit('zipEnd', { pos: { x: this.feet.x, y: this.feet.y + 0.3, z: this.feet.z } });
    void w;
  }

  /** Pose the walker hanging from the pulley: arms up, legs dangling, swinging a little. */
  applyPose(w: Character, dt: number): void {
    const z = this.zip;
    if (!z) return;
    const g = w.group;
    const lean = this.phase === 'ride' ? clamp(-this.tan.y * 0.5, -0.25, 0.25) - 0.08 : 0;
    this.tilt += (lean - this.tilt) * (1 - Math.exp(-6 * dt));
    eul.set(this.tilt, Math.PI - this.heading, this.roll, 'YXZ');
    g.rotation.copy(eul);
    g.position.copy(this.feet);
    w.setMove(0.1, false);
    w.setGliding(true); // arms up on the handle, legs dangling
    w.lookAt(null);
  }

  /** Cancel (scene exit, F1). */
  cancel(w?: Character): void {
    if (this.active) bus.emit('airStop', {});
    this.active = false;
    this.zip = null;
    this.pulley.visible = false;
    this.shown = null;
    this.bubble.classList.add('hidden');
    if (w) w.setGliding(false);
  }

  /** (x, z, ground, heading) of a line's start, for the minimap / debugging. */
  get lines(): { id: string; name: string; a: [number, number]; b: [number, number] }[] {
    return ZIPS.map((z) => ({ id: z.id, name: z.name, a: z.a, b: z.b }));
  }

  /** The cable's world position at arc length s (a debugging / test helper). */
  at(id: string, s: number): THREE.Vector3 | null {
    const z = this.zips.find((q) => q.def.id === id);
    return z ? pointAt(z, s).clone() : null;
  }

  /** Start a ride by line id (console / tests): puts the walker at its start post. */
  go(id: string, f: FootPhysics): boolean {
    const z = this.zips.find((q) => q.def.id === id);
    if (!z) return false;
    f.reset(z.base.x + 1.2, z.base.z, Math.atan2(z.dx, -z.dz));
    this.cool = 0;
    this.start(z, f);
    return true;
  }

  dispose(): void {
    this.bubble.remove();
  }
}

const _p = new THREE.Vector3();
/** Point on a cable at arc length s; optionally the unit tangent. */
function pointAt(z: Zip, s: number, tan?: THREE.Vector3): THREE.Vector3 {
  const ss = clamp(s, 0, z.len);
  let i = 1;
  while (i < z.cum.length - 1 && z.cum[i] < ss) i++;
  const a = z.pts[i - 1], b = z.pts[i];
  const seg = z.cum[i] - z.cum[i - 1] || 1;
  const k = (ss - z.cum[i - 1]) / seg;
  _p.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  if (tan) tan.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
  return _p;
}

/** A hand pulley: a grip bar, two hangers and a little wheel that sits on the cable. Origin = the hands' grip point; +z forward. */
function makePulley(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'pulley';
  const gold = new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.35, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2a35', roughness: 0.4, metalness: 0.6 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.56, 8), gold);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), dark);
    h.position.set(s * 0.12, 0.1, 0);
    h.rotation.z = s * 0.45;
    g.add(h);
  }
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 14), dark);
  wheel.position.y = 0.21;
  wheel.rotation.z = Math.PI / 2;
  g.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), gold);
  hub.position.y = 0.21;
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  return g;
}

