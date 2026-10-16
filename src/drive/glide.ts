// ── v3 movement (W4) ── Free fall + glider.
//
// Everything that happens once the walker's feet leave the ground for good:
//   rise   a launch pad boing (or any upward launch): ballistic, weak steering
//   dive   skydive: belly-down, fast fall, steerable. Ends in a glide
//   glide  the glider is open: slow sink, forward drift, stick = steer
// While one of these runs, THIS module owns the walker (x, y, z, heading); the foot
// physics is parked, then handed the walker back at touchdown (a soft landing, so the
// foot code does the normal landing flex / water splash / step events).
//
// Entry points:  launch() (pad), drop() (the bus), fall() (a long fall by itself).
// Locker: the glider comes from profile.locker.glider (makeGlider, src/art/gear; a simple parafoil if that ever throws),
// the contrail from profile.locker.contrail (makeContrail; nothing equipped = a faint wisp of wind).
import * as THREE from 'three';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { BOUNDS, WATER_Y } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import { surfaceBelow } from '../world/buildSpace';
import { type ColliderGrid, pushOut, res } from './physics';
import { clamp, lerpAngle, wrapAngle } from './envUtils';
import type { FootPhysics } from './foot';
import type { Character } from '../art/character';
import { makeGlider } from '../art/gear/gliders';
import { makeContrail, type Contrail } from '../art/gear/contrails';
import { disposeGear } from '../art/gear/gearKit';
import { hyp } from '../core/fastmath';   // ── v3 perf ── Math.hypot is ~12x slower than this

/** What a walker can stand on at (x, z) for a body at height yRef: ground, stairs, decks, and whatever the player built. */
export function surfaceY(x: number, z: number, yRef: number): number {
  const g = groundHeight(x, z, true);
  const s = surfaceBelow(x, z, yRef);
  return s > g ? s : g;
}

/** ...but a flyer lands on the WATER, not on the seabed. */
export function landLevel(x: number, z: number, yRef: number): number {
  const s = surfaceY(x, z, yRef);
  return s > WATER_Y ? s : WATER_Y;
}

export interface FlightInput {
  /** desired world direction (unit, or 0,0) */
  dx: number;
  dz: number;
  /** stick push 0..1 */
  mag: number;
}

type Phase = 'none' | 'rise' | 'dive' | 'glide';

const PALETTES: string[][] = [
  ['#ff2e88', '#ffffff', '#7c4dff', '#ffffff'],
  ['#00d4ff', '#ffffff', '#3d6bff', '#ffffff'],
  ['#ffc93c', '#ffffff', '#ff8a3d', '#ffffff'],
  ['#b6ff3b', '#ffffff', '#00b3a4', '#ffffff'],
  ['#ff2e88', '#ffc93c', '#00d4ff', '#7c4dff'],
];
const hashId = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
};

/** A simple parafoil: an arched, striped wing with lines down to the hands. Origin = the grip point, +z = forward. */
function makeParafoil(id: string): THREE.Group {
  const colors = PALETTES[id === 'starter' ? 0 : hashId(id) % PALETTES.length].map((c) => new THREE.Color(c));
  const g = new THREE.Group();
  g.name = 'glider-placeholder';
  const span = 4.6, chord = 2.0, rise = 2.5;
  const geo = new THREE.PlaneGeometry(span, chord, 12, 3);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const u = x / (span / 2), v = z / (chord / 2);
    p.setY(i, rise - 0.85 * u * u + 0.14 * (1 - v * v) - 0.12 * Math.max(0, v));
    const panel = Math.min(5, Math.floor(((u + 1) / 2) * 6));
    const c = colors[panel % colors.length];
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const canopy = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.06 }));
  g.add(canopy);
  // lines: a fan from each hand to the wing's front and back edge
  const pts: number[] = [];
  const edgeY = (x: number): number => rise - 0.85 * (x / (span / 2)) ** 2;
  for (const s of [-1, 1]) {
    for (const ax of [0.6, 1.4, 2.1]) {
      for (const z of [-chord * 0.4, chord * 0.4]) {
        pts.push(s * 0.28, 0.05, 0, s * ax, edgeY(ax) - 0.02, z);
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 })));
  return g;
}

// ── the contrail: a camera-facing ribbon that follows the feet ──────────────────────────────
const TRAIL_PALETTES: Record<string, string[]> = {
  sparkle: ['#ffffff', '#ffc93c', '#ff2e88'],
  rainbow: ['#ff2e88', '#ff8a3d', '#ffc93c', '#b6ff3b', '#00d4ff', '#7c4dff'],
  pink: ['#ffffff', '#ff6fb5', '#ff2e88'],
  ice: ['#ffffff', '#9fe8ff', '#3d9bff'],
  flame: ['#fff3a0', '#ffb347', '#ff4d2e'],
  neon: ['#b6ff3b', '#00d4a0', '#00d4ff'],
  starter: ['#ffffff', '#9fe8ff', '#7c4dff'],
};
const TRAIL_FALLBACK = ['#ffffff', '#ffc93c', '#ff2e88', '#00d4ff'];
const TRAIL_WISP = ['#ffffff', '#cfe8ff'];

class Ribbon {
  readonly mesh: THREE.Mesh;
  private readonly N = 56;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private pts: { x: number; y: number; z: number; age: number }[] = [];
  private acc = 0;
  private palette: THREE.Color[] = [new THREE.Color('#ffffff')];
  private id = '__none__';
  private wisp = true;
  private readonly side = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly tmp = new THREE.Color();

  constructor() {
    const N = this.N;
    this.pos = new Float32Array(N * 2 * 3);
    this.col = new Float32Array(N * 2 * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: true }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /** `id` null = nothing equipped: just a faint, short wisp of wind so the fall never looks bare. */
  setStyle(id: string | null): void {
    const key = id ?? '';
    if (key === this.id) return;
    this.id = key;
    this.wisp = !id;
    const list = id ? TRAIL_PALETTES[id] ?? TRAIL_FALLBACK : TRAIL_WISP;
    this.palette = list.map((c) => new THREE.Color(c));
  }

  clear(): void {
    this.pts.length = 0;
    this.mesh.visible = false;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  update(dt: number, emitting: boolean, x: number, y: number, z: number, cam: THREE.Vector3): void {
    const life = tuning.movement3.trailLife * (this.wisp ? 0.4 : 1);
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[0].age > life) this.pts.shift();
    if (emitting) {
      this.acc += dt;
      if (this.acc >= 0.02 || this.pts.length === 0) {
        this.acc = 0;
        this.pts.push({ x, y, z, age: 0 });
        if (this.pts.length > this.N) this.pts.shift();
      }
    }
    const n = this.pts.length;
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const pal = this.palette;
    for (let k = 0; k < n; k++) {
      // newest point first in the buffer
      const p = this.pts[n - 1 - k];
      const a = this.pts[Math.min(n - 1, n - k)], b = this.pts[Math.max(0, n - 2 - k)];
      this.dir.set(a.x - b.x, a.y - b.y, a.z - b.z);
      if (this.dir.lengthSq() < 1e-8) this.dir.set(0, 0, 1);
      this.view.set(cam.x - p.x, cam.y - p.y, cam.z - p.z);
      this.side.crossVectors(this.dir, this.view);
      if (this.side.lengthSq() < 1e-8) this.side.set(1, 0, 0);
      this.side.normalize();
      const u = p.age / life;
      const w = (this.wisp ? 0.16 : 0.42) * (1 - u * 0.85);
      const i6 = k * 6;
      this.pos[i6] = p.x - this.side.x * w;
      this.pos[i6 + 1] = p.y - this.side.y * w;
      this.pos[i6 + 2] = p.z - this.side.z * w;
      this.pos[i6 + 3] = p.x + this.side.x * w;
      this.pos[i6 + 4] = p.y + this.side.y * w;
      this.pos[i6 + 5] = p.z + this.side.z * w;
      // colour walks the palette along the trail; alpha fades out
      const f = clamp(u, 0, 0.999) * (pal.length - 1);
      const i0 = Math.floor(f);
      this.tmp.copy(pal[i0]).lerp(pal[Math.min(pal.length - 1, i0 + 1)], f - i0);
      const alpha = Math.pow(1 - u, 1.5) * (this.wisp ? 0.3 : 0.85);
      const i8 = k * 8;
      this.col[i8] = this.col[i8 + 4] = this.tmp.r;
      this.col[i8 + 1] = this.col[i8 + 5] = this.tmp.g;
      this.col[i8 + 2] = this.col[i8 + 6] = this.tmp.b;
      this.col[i8 + 3] = this.col[i8 + 7] = alpha;
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, (n - 1) * 6);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ── the flyer ───────────────────────────────────────────────────────────────────────────────
export interface GlideContext {
  foot: FootPhysics;
  /** the player's character: the glider hangs on its gliderAnchor (between the hands) */
  walker: Character;
  grid: () => ColliderGrid;
  /** the scene's camera position (the contrail faces it) */
  camPos: THREE.Vector3;
}

const BODY_PIVOT = 0.95; // the walker tilts about the middle of the torso
const GRIP_Y = 1.8; // hands up on the handles

export class Glide {
  phase: Phase = 'none';
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  heading = 0;
  /** seconds since this flight started */
  age = 0;
  readonly root = new THREE.Group();

  private speedH = 0;
  private tilt = 0;
  private roll = 0;
  private yawRate = 0;
  private open = 0; // glider canopy 0..1 (0 = hidden)
  private openT = 0;
  private closeT = 0;
  private peak = 0;
  private deployFall = Infinity;
  private deployAlt = 0;
  private landPending = false;
  private landStrength = 0;
  private glider: THREE.Object3D | null = null;
  private gliderId = '';
  private readonly ribbon = new Ribbon();
  private readonly eul = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly off = new THREE.Vector3();
  private trailId: string | null = null;
  private trailInit = false;
  private contrail: Contrail | null = null;
  private readonly trailAt = new THREE.Vector3();
  private readonly trailVel = new THREE.Vector3();
  private airOn = false;

  constructor(private readonly ctx: GlideContext) {
    this.root.name = 'glide';
    this.root.add(this.ribbon.mesh);
  }

  get active(): boolean {
    return this.phase !== 'none';
  }
  get gliding(): boolean {
    return this.phase === 'glide';
  }

  /** the player's glider + contrail choices (profile.locker) */
  setGear(gliderId: string, trailId: string | null): void {
    if (trailId !== this.trailId || !this.trailInit) {
      this.trailInit = true;
      this.trailId = trailId;
      this.ribbon.setStyle(null); // the wisp (shown only when no contrail is equipped)
      if (this.contrail) {
        this.root.remove(this.contrail.object);
        this.contrail.dispose();
        this.contrail = null;
      }
      if (trailId) {
        try {
          this.contrail = makeContrail(trailId);
          this.contrail.object.frustumCulled = false;
          this.root.add(this.contrail.object);
        } catch (e) {
          console.warn('[glide] makeContrail failed, using the wisp', e);
        }
      }
    }
    if (gliderId === this.gliderId && this.glider) return;
    this.gliderId = gliderId;
    if (this.glider) {
      this.glider.removeFromParent();
      disposeGear(this.glider);
    }
    let g: THREE.Object3D | null = null;
    try {
      g = makeGlider(gliderId);
    } catch (e) {
      console.warn('[glide] makeGlider failed, using the placeholder', e);
    }
    this.glider = g ?? makeParafoil(gliderId);
    this.glider.visible = false;
    // origin = the hands' grip point, canopy above: exactly what the character's anchor is
    this.ctx.walker.gliderAnchor.add(this.glider);
  }

  // ── entry points ───────────────────────────────────────────────────────────
  /** Boing: shoot up from a launch pad. */
  launch(x: number, y: number, z: number, vy: number, heading: number): void {
    const m = tuning.movement3;
    this.begin('rise', x, y, z, 0, vy, 0, heading);
    this.deployFall = m.padDeployFall;
    this.deployAlt = 0;
  }

  /** Off the bus (or any high place): skydive, then the glider opens `deployAlt` above the ground. */
  drop(x: number, y: number, z: number, vx: number, vz: number, vy: number, heading: number): void {
    const m = tuning.movement3;
    this.begin('dive', x, y, z, vx, vy, vz, heading);
    this.deployFall = Infinity;
    this.deployAlt = m.deployAlt;
  }

  /** A long fall (a cliff, a roof, a ramp launch): open the glider straight away. */
  fall(): void {
    const f = this.ctx.foot;
    const sp = Math.max(f.speed, 2);
    const hv = f.heading;
    this.begin('glide', f.x, f.y, f.z, Math.sin(hv) * sp, Math.min(f.vy, -2), -Math.cos(hv) * sp, hv);
    this.speedH = sp;
    this.deploy();
  }

  private begin(p: Phase, x: number, y: number, z: number, vx: number, vy: number, vz: number, heading: number): void {
    this.phase = p;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.heading = heading;
    this.speedH = hyp(vx, vz);
    this.peak = y;
    this.age = 0;
    this.yawRate = 0;
    this.roll = 0;
    this.open = 0;
    this.openT = 0;
    this.closeT = 0;
    this.landPending = false;
    this.ribbon.clear();
    this.contrail?.clear();
    if (this.glider) this.glider.visible = false;
    this.startAir();
  }

  private startAir(): void {
    if (this.airOn) return;
    this.airOn = true;
    bus.emit('airStart', {});
  }
  private stopAir(): void {
    if (!this.airOn) return;
    this.airOn = false;
    bus.emit('airStop', {});
  }

  private deploy(): void {
    this.phase = 'glide';
    this.open = 0.001;
    this.openT = 0;
    this.closeT = 0;
    if (this.glider) this.glider.visible = true;
    bus.emit('gliderDeploy', { pos: { x: this.x, y: this.y + GRIP_Y, z: this.z } });
  }

  /** Altitude above whatever we would land on. */
  altitude(): number {
    return this.y - landLevel(this.x, this.z, this.y);
  }

  // ── the per-frame flight ──────────────────────────────────────────────────
  update(dt: number, inp: FlightInput, jumpEdge: boolean): void {
    if (this.phase === 'none') return;
    const m = tuning.movement3;
    this.age += dt;
    const hasIn = inp.mag > 0.08;
    const lastHeading = this.heading;

    // horizontal
    if (this.phase === 'rise') {
      const k = 1 - Math.exp(-2.2 * dt);
      const sp = 4.5 * inp.mag;
      this.vx += (inp.dx * sp - this.vx) * k;
      this.vz += (inp.dz * sp - this.vz) * k;
      if (hyp(this.vx, this.vz) > 1) this.heading = lerpAngle(this.heading, Math.atan2(this.vx, -this.vz), 1 - Math.exp(-6 * dt));
    } else {
      const diving = this.phase === 'dive';
      const turn = (diving ? m.diveTurn : m.glideTurn) * dt * (0.45 + 0.55 * inp.mag);
      if (hasIn) {
        const diff = wrapAngle(Math.atan2(inp.dx, -inp.dz) - this.heading);
        this.heading += clamp(diff, -turn, turn);
      }
      const target = diving
        ? hasIn ? m.diveSpeedMin + (m.diveSpeedMax - m.diveSpeedMin) * inp.mag : m.diveSpeedMin * 0.8
        : hasIn ? m.glideSpeedMin + (m.glideSpeedMax - m.glideSpeedMin) * inp.mag : m.glideSpeedIdle;
      this.speedH += (target - this.speedH) * (1 - Math.exp(-m.glideAccel * dt));
      this.vx = Math.sin(this.heading) * this.speedH;
      this.vz = -Math.cos(this.heading) * this.speedH;
    }
    this.yawRate += (wrapAngle(this.heading - lastHeading) / Math.max(dt, 1e-4) - this.yawRate) * Math.min(1, dt * 8);

    // vertical
    const lvl = landLevel(this.x, this.z, this.y);
    const alt = this.y - lvl;
    if (this.phase === 'rise') {
      this.vy -= m.airGravity * dt;
      if (this.vy <= 0) {
        this.phase = 'dive';
        this.peak = this.y;
      }
    } else if (this.phase === 'dive') {
      this.vy = Math.max(this.vy - m.diveGravity * dt, -m.diveTerminal);
      this.peak = Math.max(this.peak, this.y);
      const early = this.age > 0.5;
      if ((early && jumpEdge) || this.peak - this.y >= this.deployFall || (this.deployAlt > 0 && alt <= this.deployAlt) || alt <= m.safeAlt) this.deploy();
    } else {
      let tgt = -(m.glideSink + m.glideSinkPush * inp.mag);
      if (alt < m.glideFlareAlt) {
        const k = clamp(alt / m.glideFlareAlt, 0, 1);
        tgt = -(m.glideLandSink + (-tgt - m.glideLandSink) * k);
      }
      this.vy += (tgt - this.vy) * (1 - Math.exp(-4 * dt));
    }
    this.peak = Math.max(this.peak, this.y);

    // move
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;
    const lim = BOUNDS - m.airBound;
    this.x = clamp(this.x, -lim, lim);
    this.z = clamp(this.z, -lim, lim);
    // buildings: slide around them, over the roof when high enough
    const r = tuning.drive.footRadius;
    const cols = this.ctx.grid().near(this.x, this.z, r + 2);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.only === 'car') continue;
      if (c.h !== undefined && this.y > c.h - 0.4) continue;
      if (c.y0 !== undefined && c.y0 > this.y + 1.75) continue;
      if (!pushOut(c, this.x, this.z, r)) continue;
      this.x += res.nx * res.pen;
      this.z += res.nz * res.pen;
      this.speedH *= 0.7;
    }

    // touchdown: hand the walker back to the foot physics (a soft landing, or a splash in the sea)
    const now = landLevel(this.x, this.z, this.y);
    if (this.vy <= 0 && this.y <= now + 0.3) this.land();

    // the canopy pops open with a little overshoot
    if (this.phase === 'glide' && this.open < 1) {
      this.openT += dt;
      const k = clamp(this.openT / m.glideOpenSeconds, 0, 1);
      this.open = Math.max(0.001, k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 9) * 0.9 : 1);
      if (k >= 1) this.open = 1;
    }

    bus.emit('airUpdate', { speed01: clamp(Math.hypot(this.vx, this.vz, this.vy) / 22, 0, 1), dive: this.phase === 'glide' ? 0 : 1 });
  }

  private land(): void {
    const f = this.ctx.foot;
    f.x = this.x;
    f.z = this.z;
    f.y = this.y;
    f.vy = this.vy;
    f.grounded = false;
    f.heading = this.heading;
    f.setVelocity(this.vx * 0.55, this.vz * 0.55);
    this.landStrength = clamp(-this.vy / 4.5, 0.3, 1.8);
    this.landPending = true;
    this.phase = 'none';
    this.closeT = 0.0001;
    this.stopAir();
  }

  /** Called every frame (flying or not): the touchdown thud once the feet are really down, the canopy folding, the contrail. */
  post(dt: number): void {
    const f = this.ctx.foot;
    if (this.landPending && f.grounded) {
      this.landPending = false;
      if (f.wet < 0.1 && !f.swimming) bus.emit('glideLand', { pos: { x: f.x, y: f.y, z: f.z }, strength: this.landStrength });
    } else if (this.landPending && (f.swimming || f.wet > 0.15)) this.landPending = false;
    // fold the canopy away after landing
    if (this.phase === 'none' && this.closeT > 0 && this.glider) {
      this.closeT += dt;
      const k = clamp(this.closeT / 0.25, 0, 1);
      this.open = 1 - k;
      if (k >= 1) {
        this.closeT = 0;
        this.glider.visible = false;
      }
    }
    // the contrail streams from the feet while flying (the equipped one, else a faint wisp); the glider animates itself (flaps, spins)
    if (this.contrail) {
      this.trailAt.set(this.x, this.y + 0.2, this.z);
      this.trailVel.set(this.vx, this.vy, this.vz);
      this.contrail.update(dt, this.trailAt, this.active, this.trailVel);
    } else this.ribbon.update(dt, this.active, this.x, this.y + 0.15, this.z, this.ctx.camPos);
    const tick = this.glider?.visible ? (this.glider.userData.tick as ((t: number) => void) | undefined) : undefined;
    if (tick) tick(performance.now() / 1000);
  }

  /** Pose the walker + the glider for this frame. */
  applyPose(walker: Character, dt: number): void {
    const m = tuning.movement3;
    const g = walker.group;
    const tiltT = this.phase === 'dive' ? m.diveTilt : this.phase === 'rise' ? 0.22 : 0.1;
    this.tilt += (tiltT - this.tilt) * (1 - Math.exp(-8 * dt));
    const rollT = clamp(-this.yawRate * 0.2, -0.55, 0.55);
    this.roll += (rollT - this.roll) * (1 - Math.exp(-7 * dt));
    this.eul.set(this.tilt, Math.PI - this.heading, this.roll * (this.phase === 'glide' ? 0.6 : 1), 'YXZ');
    g.rotation.copy(this.eul);
    this.off.set(0, BODY_PIVOT, 0).applyEuler(this.eul);
    g.position.set(this.x - this.off.x, this.y + BODY_PIVOT - this.off.y, this.z - this.off.z);
    walker.setMove(0.2, false);
    walker.setGliding(this.phase === 'glide');
    walker.setSkydive(this.phase === 'dive'); // ── v3 character ── belly-down skydive pose (the tilt above is still yours)
    this.poseGlider();
  }

  /** The canopy's open / fold scale (it rides on the character's gliderAnchor, so it follows her tilt and bank by itself). */
  poseGlider(): void {
    const gl = this.glider;
    if (!gl || !gl.visible) return;
    gl.scale.setScalar(Math.max(0.001, this.open));
  }

  /** The walker is back on the ground and the normal pose code runs again: undo the tilt. */
  restoreWalker(walker: Character): void {
    const g = walker.group;
    g.rotation.order = 'XYZ';
    g.rotation.set(0, g.rotation.y, 0);
    walker.setGliding(false);
    walker.setSkydive(false); // ── v3 character ──
    this.tilt = 0;
    this.roll = 0;
  }

  /** Abort any flight (scene exit / reset): the caller puts the walker down. */
  cancel(): void {
    this.phase = 'none';
    this.landPending = false;
    this.closeT = 0;
    this.open = 0;
    if (this.glider) this.glider.visible = false;
    this.ribbon.clear();
    this.contrail?.clear();
    this.stopAir();
  }
}
