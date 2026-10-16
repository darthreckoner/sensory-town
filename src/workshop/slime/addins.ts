// Instanced add-ins that stick to the slime surface and ride its deformation:
// sprinkles (candy capsules), stars and pearls — plus the crunchy slime's beads. Each instance is glued to one
// mesh vertex; every frame it is re-posed from that vertex's position + normal.
// Toggling on rains them down onto the slime; toggling off shrinks them away.
import * as THREE from 'three';
import { tuning } from '../../tuning';
import type { SlimeSim } from './slimeSim';

export type InstancedAddin = 'sprinkles' | 'stars' | 'pearls' | 'beads';

const SPRINKLE_COLORS = ['#ff2e88', '#ffc93c', '#00e5a0', '#00d4ff', '#ffffff', '#7c4dff', '#ff8a3d'];
const STAR_COLORS = ['#ffc93c', '#fff3a3', '#ffffff', '#ff8a3d', '#ff2e88', '#fff0c2'];
const PEARL_COLORS = ['#ffffff', '#ffe5f1', '#e5f3ff', '#fff4cc', '#e9e0ff', '#dffff3'];
const BEAD_COLORS = ['#ff2e88', '#00d4ff', '#b6ff3b', '#ffc93c', '#7c4dff', '#ffffff', '#ff8a3d'];

class Layer {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;
  readonly vert: Int32Array;
  readonly ang: Float32Array;
  readonly delay: Float32Array;
  readonly appear: Float32Array;
  readonly scl: Float32Array;
  /** 0..1 pop pulse (crunchy beads) */
  readonly pulse: Float32Array;
  on = false;
  /** surface offset along the normal so items sit slightly sunk in */
  lift: number;

  constructor(readonly kind: InstancedAddin, geo: THREE.BufferGeometry, mat: THREE.Material, count: number, colors: string[], lift: number) {
    this.count = count;
    this.lift = lift;
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.vert = new Int32Array(count);
    this.ang = new Float32Array(count);
    this.delay = new Float32Array(count);
    this.appear = new Float32Array(count);
    this.scl = new Float32Array(count);
    this.pulse = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
      this.scl[i] = 0.85 + Math.random() * 0.4;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class SlimeAddins {
  readonly group = new THREE.Group();
  private layers = new Map<InstancedAddin, Layer>();
  private list: Layer[] = [];
  private sim: SlimeSim;
  private cand: number[] = [];

  constructor(sim: SlimeSim) {
    this.sim = sim;
    // candidate vertices: the top of the dome, away from the rim
    for (let i = 0; i < sim.n; i++) {
      const u = sim.uv[2 * i], v = sim.uv[2 * i + 1];
      if (Math.hypot(u, v) < 0.86) this.cand.push(i);
    }
    const t = tuning.slime;

    const sprinkleMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15 });
    this.add('sprinkles', new THREE.CapsuleGeometry(0.024, 0.1, 3, 8), sprinkleMat, t.sprinkleCount, SPRINKLE_COLORS, 0.016);

    const starMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 });
    this.add('stars', makeStarGeometry(), starMat, t.starCount, STAR_COLORS, 0.012);

    const pearlMat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6, sheen: 0.3,
    });
    this.add('pearls', new THREE.SphereGeometry(0.05, 14, 10), pearlMat, t.pearlCount, PEARL_COLORS, 0.026);

    // crunchy slime: little foam beads poking out of the surface
    const beadMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    this.add('beads', new THREE.SphereGeometry(0.034, 10, 8), beadMat, t.beadCount, BEAD_COLORS, 0.014);
  }

  /** Crunch: beads near (x, z) (rest space) pop up for a moment. */
  crunchAt(x: number, z: number, r = 0.55): void {
    const l = this.layers.get('beads')!;
    if (!l.on) return;
    const rest = this.sim.rest, r2 = r * r;
    for (let i = 0; i < l.count; i++) {
      const v = l.vert[i];
      const dx = rest[3 * v] - x, dz = rest[3 * v + 2] - z;
      if (dx * dx + dz * dz < r2 && l.appear[i] >= 1) l.pulse[i] = 0.6 + Math.random() * 0.4;
    }
  }

  private add(kind: InstancedAddin, geo: THREE.BufferGeometry, mat: THREE.Material, count: number, colors: string[], lift: number): void {
    const l = new Layer(kind, geo, mat, count, colors, lift);
    this.layers.set(kind, l);
    this.list.push(l);
    this.group.add(l.mesh);
  }

  isOn(kind: InstancedAddin): boolean {
    return this.layers.get(kind)!.on;
  }

  /** Turn a kind on (fresh random scatter, raining in) or off (shrinks away). */
  set(kind: InstancedAddin, on: boolean): void {
    const l = this.layers.get(kind)!;
    if (l.on === on) return;
    l.on = on;
    if (on) {
      this.scatter(l);
      l.mesh.visible = true;
    }
  }

  /** Remove everything instantly. */
  clear(): void {
    for (const l of this.list) {
      l.on = false;
      l.appear.fill(0);
      l.mesh.visible = false;
    }
  }

  /** Pick well-spaced random vertices (dart throwing on the rest dome). */
  private scatter(l: Layer): void {
    const sim = this.sim, rest = sim.rest, cand = this.cand;
    const minD2 = Math.pow(0.9 * Math.sqrt((Math.PI * 1.6 * 1.6) / l.count), 2) * 0.5;
    const chosen: number[] = [];
    for (let tries = 0; chosen.length < l.count && tries < l.count * 40; tries++) {
      const v = cand[(Math.random() * cand.length) | 0];
      let ok = true;
      for (const c of chosen) {
        const dx = rest[3 * v] - rest[3 * c], dz = rest[3 * v + 2] - rest[3 * c + 2];
        if (dx * dx + dz * dz < minD2) { ok = false; break; }
      }
      if (ok) chosen.push(v);
    }
    while (chosen.length < l.count) chosen.push(cand[(Math.random() * cand.length) | 0]);
    for (let i = 0; i < l.count; i++) {
      l.vert[i] = chosen[i];
      l.ang[i] = Math.random() * Math.PI * 2;
      l.delay[i] = Math.random() * 0.45;
      l.appear[i] = -l.delay[i] / 0.5; // negative = waiting to drop
      l.scl[i] = 0.85 + Math.random() * 0.4;
    }
  }

  update(dt: number): void {
    const pos = this.sim.pos, nrm = this.sim.nrm, nbr = this.sim.nbr;
    const pulseDecay = Math.exp(-9 * dt);
    for (const l of this.list) {
      if (!l.mesh.visible) continue;
      const m = l.mesh.instanceMatrix.array as Float32Array;
      let alive = false;
      for (let i = 0; i < l.count; i++) {
        let a = l.appear[i];
        if (l.on) a = Math.min(1, a + dt / 0.5);
        else a = Math.max(0, a - dt / 0.22);
        l.appear[i] = a;
        const o = i * 16;
        if (a <= 0) {
          for (let k = 0; k < 16; k++) m[o + k] = 0;
          m[o + 15] = 1;
          continue;
        }
        alive = true;
        const e = 1 - Math.pow(1 - a, 3);
        let pu = l.pulse[i];
        if (pu > 0.002) { pu *= pulseDecay; l.pulse[i] = pu; } else pu = 0;
        const sc = l.scl[i] * e * (1 + 0.18 * Math.sin(Math.PI * a)) * (1 + 0.7 * pu);
        const vi = l.vert[i];
        const nx = nrm[3 * vi], ny = nrm[3 * vi + 1], nz = nrm[3 * vi + 2];
        // tangent along the grid's x direction, made perpendicular to the normal
        const r = nbr[4 * vi + 1] * 3, lft = nbr[4 * vi] * 3;
        let tx = pos[r] - pos[lft], ty = pos[r + 1] - pos[lft + 1], tz = pos[r + 2] - pos[lft + 2];
        const td = tx * nx + ty * ny + tz * nz;
        tx -= nx * td; ty -= ny * td; tz -= nz * td;
        let tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl < 1e-6) { tx = 1; ty = 0; tz = 0; tl = 1; }
        tx /= tl; ty /= tl; tz /= tl;
        // spin about the normal
        const ca = Math.cos(l.ang[i]), sa = Math.sin(l.ang[i]);
        const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx; // n × t
        const sx = tx * ca + bx * sa, sy = ty * ca + by * sa, sz = tz * ca + bz * sa;
        const qx = ny * sz - nz * sy, qy = nz * sx - nx * sz, qz = nx * sy - ny * sx; // n × s
        const lift = l.lift * sc + pu * 0.05;
        const drop = (1 - e) * (1 - e) * 0.9;
        const px = pos[3 * vi] + nx * lift;
        const py = pos[3 * vi + 1] + ny * lift + drop;
        const pz = pos[3 * vi + 2] + nz * lift;
        if (l.kind === 'sprinkles') {
          // capsule axis (local y) lies along the surface, local x points out of it
          set16(m, o, nx * sc, ny * sc, nz * sc, sx * sc, sy * sc, sz * sc, qx * sc, qy * sc, qz * sc, px, py, pz);
        } else if (l.kind === 'stars') {
          // star face (local z) points out of the surface
          set16(m, o, sx * sc, sy * sc, sz * sc, qx * sc, qy * sc, qz * sc, nx * sc, ny * sc, nz * sc, px, py, pz);
        } else {
          set16(m, o, sc, 0, 0, 0, sc, 0, 0, 0, sc, px, py, pz);
        }
      }
      l.mesh.instanceMatrix.needsUpdate = true;
      if (!alive && !l.on) l.mesh.visible = false;
    }
  }
}

function set16(m: Float32Array, o: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, px: number, py: number, pz: number): void {
  m[o] = ax; m[o + 1] = ay; m[o + 2] = az; m[o + 3] = 0;
  m[o + 4] = bx; m[o + 5] = by; m[o + 6] = bz; m[o + 7] = 0;
  m[o + 8] = cx; m[o + 9] = cy; m[o + 10] = cz; m[o + 11] = 0;
  m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
}

function makeStarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outer = 0.095, inner = 0.045;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.011, bevelSegments: 2, curveSegments: 1 });
  geo.center();
  return geo;
}
