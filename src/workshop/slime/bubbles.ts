// Air bubbles trapped in folds: glossy blisters that wobble on the slime surface (they ride the
// deformation) and pop — with a sound and a little spray — when touched, or by themselves after a while.
import * as THREE from 'three';
import { tuning } from '../../tuning';
import type { SlimeSim } from './slimeSim';

const FREE = 0, ALIVE = 1, POPPING = 2;

export class SlimeBubbles {
  readonly mesh: THREE.InstancedMesh;
  private sim: SlimeSim;
  private max: number;
  private state: Uint8Array;
  private vert: Int32Array;
  private size: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private popT: Float32Array;
  private phase: Float32Array;
  /** current centres (local space), for touch hit-tests */
  private cx: Float32Array;
  private cy: Float32Array;
  private cz: Float32Array;
  private cand: number[] = [];
  private tint = new THREE.Color();
  private time = 0;
  /** called with the bubble's local position, size and vertex index */
  onSpawn: ((x: number, y: number, z: number, size: number) => void) | null = null;
  onPop: ((x: number, y: number, z: number, size: number, vertex: number, byTouch: boolean) => void) | null = null;

  constructor(sim: SlimeSim) {
    this.sim = sim;
    this.max = tuning.slime.bubbleMax;
    const n = this.max;
    this.state = new Uint8Array(n);
    this.vert = new Int32Array(n);
    this.size = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.popT = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.cx = new Float32Array(n);
    this.cy = new Float32Array(n);
    this.cz = new Float32Array(n);
    for (let i = 0; i < sim.n; i++) {
      if (Math.hypot(sim.uv[2 * i], sim.uv[2 * i + 1]) < 0.9) this.cand.push(i);
    }
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.01, iridescence: 0.8, iridescenceIOR: 1.5, ior: 1.5, envMapIntensity: 2.2,
    });
    mat.onBeforeCompile = (sh) => {
      // dark-ish middle, bright rim: reads as a thin film of air under the surface
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         { float bR = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 2.0 );
           diffuseColor.rgb *= mix( 0.6, 1.0, bR );
           totalEmissiveRadiance += vec3( 1.0 ) * bR * 0.5; }`,
      );
    };
    mat.customProgramCacheKey = () => 'slime-bubble-v1';
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) m[i * 16 + 15] = 1;
  }

  /** Blister color: the slime color, lightened. */
  setColor(c: THREE.ColorRepresentation): void {
    this.tint.set(c).lerp(new THREE.Color('#ffffff'), 0.55);
    (this.mesh.material as THREE.MeshPhysicalMaterial).color.copy(this.tint);
  }

  /** Bubbles reflect the room too (a material envMap uses envMapIntensity instead of scene.environmentIntensity). */
  setEnv(env: THREE.Texture | null, intensity: number): void {
    const m = this.mesh.material as THREE.MeshPhysicalMaterial;
    if (m.envMap !== env) {
      m.envMap = env;
      m.needsUpdate = true;
    }
    m.envMapIntensity = 2.2 * intensity;
  }

  get count(): number {
    let k = 0;
    for (let i = 0; i < this.max; i++) if (this.state[i] === ALIVE) k++;
    return k;
  }

  /** Form `n` bubbles on the surface near a point of the rest dome. */
  spawn(x: number, z: number, n: number): void {
    const rest = this.sim.rest;
    for (let k = 0; k < n; k++) {
      let slot = -1;
      for (let i = 0; i < this.max; i++) if (this.state[i] === FREE) { slot = i; break; }
      if (slot < 0) {
        // full: the oldest one pops to make room
        let oldest = -1, best = -1;
        for (let i = 0; i < this.max; i++) if (this.state[i] === ALIVE && this.age[i] > best) { best = this.age[i]; oldest = i; }
        if (oldest < 0) return;
        this.pop(oldest, false);
        slot = oldest;
      }
      // a random vertex near (x, z)
      let v = this.cand[(Math.random() * this.cand.length) | 0];
      for (let tries = 0; tries < 24; tries++) {
        const c = this.cand[(Math.random() * this.cand.length) | 0];
        const dx = rest[3 * c] - x, dz = rest[3 * c + 2] - z;
        if (dx * dx + dz * dz < 0.28 * 0.28) { v = c; break; }
      }
      this.state[slot] = ALIVE;
      this.vert[slot] = v;
      this.size[slot] = 0.045 + Math.random() * 0.06;
      this.age[slot] = 0;
      this.life[slot] = tuning.slime.bubbleLife * (0.6 + Math.random() * 0.8);
      this.phase[slot] = Math.random() * 6.28;
      this.mesh.visible = true;
      this.updateCenter(slot);
      this.onSpawn?.(this.cx[slot], this.cy[slot], this.cz[slot], this.size[slot]);
    }
  }

  private updateCenter(i: number): void {
    const pos = this.sim.pos, nrm = this.sim.nrm, v = this.vert[i];
    const r = this.size[i];
    const off = r * 0.3;
    this.cx[i] = pos[3 * v] + nrm[3 * v] * off;
    this.cy[i] = pos[3 * v + 1] + nrm[3 * v + 1] * off;
    this.cz[i] = pos[3 * v + 2] + nrm[3 * v + 2] * off;
  }

  /** Pop bubble i (it swells and vanishes). */
  private pop(i: number, byTouch: boolean): void {
    if (this.state[i] !== ALIVE) return;
    this.state[i] = POPPING;
    this.popT[i] = 0;
    this.onPop?.(this.cx[i], this.cy[i], this.cz[i], this.size[i], this.vert[i], byTouch);
  }

  /** Pop the front-most bubble a ray (local space, normalised direction) touches. Returns true if one popped.
   *  `minAge`: a dragging finger shouldn't pop a bubble the instant the fold forms it. */
  hit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, minAge = 0.15): boolean {
    let best = -1, bestT = 1e9;
    for (let i = 0; i < this.max; i++) {
      if (this.state[i] !== ALIVE || this.age[i] < minAge) continue;
      const vx = this.cx[i] - ox, vy = this.cy[i] - oy, vz = this.cz[i] - oz;
      const t = vx * dx + vy * dy + vz * dz;
      if (t <= 0) continue;
      const rr = this.size[i] * 1.5 + 0.03;
      if (vx * vx + vy * vy + vz * vz - t * t < rr * rr && t < bestT) { bestT = t; best = i; }
    }
    if (best < 0) return false;
    this.pop(best, true);
    return true;
  }

  clear(): void {
    this.state.fill(FREE);
    this.mesh.visible = false;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.mesh.visible) return;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const o = i * 16;
      const st = this.state[i];
      if (st === FREE) {
        m[o] = m[o + 5] = m[o + 10] = 0;
        continue;
      }
      any = true;
      this.age[i] += dt;
      let sc = this.size[i];
      if (st === ALIVE) {
        const a = Math.min(1, this.age[i] / 0.3);
        const e = a >= 1 ? 1 : 1 - Math.pow(1 - a, 3) * (1 + 1.8 * (1 - a)); // pops in with a little overshoot
        sc *= e * (1 + 0.07 * Math.sin(this.time * 5 + this.phase[i]));
        this.updateCenter(i);
        if (this.age[i] > this.life[i]) this.pop(i, false);
      } else {
        this.popT[i] += dt / 0.09;
        const k = this.popT[i];
        sc *= 1 + 0.55 * k;
        this.updateCenter(i);
        if (k >= 1) {
          this.state[i] = FREE;
          m[o] = m[o + 5] = m[o + 10] = 0;
          continue;
        }
        sc *= 1 - k * k;
      }
      // flattened a little against the slime (a blister, not a ball)
      m[o] = sc; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = sc * 0.9; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sc; m[o + 11] = 0;
      m[o + 12] = this.cx[i]; m[o + 13] = this.cy[i]; m[o + 14] = this.cz[i]; m[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) this.mesh.visible = false;
  }
}
