// Slime soft-body core. Pure math on typed arrays (no three.js) so it can be
// exercised headless; SlimeStation owns the mesh / input and feeds this.
//
// The blob is a (N+1)² grid mapped onto a disc and domed (top surface only).
// Everything the player sees is the sum of a few layers:
//
//  1. STRANDS   – every finger holds a "grab": an anchor on the rest dome and a
//                 tip that chases the finger. Slime within `reach` of the anchor
//                 is remapped onto a tapered horn (flared base → thin neck →
//                 gooey drop at the tip) whose centerline runs anchor → tip.
//                 The neck thins as the tip gets farther away. The strand body
//                 trails the tip through a chain of lagged copies (a whip).
//  2. SPRINGS   – each vertex follows its target through a damped spring, so
//                 the surface is smooth and slightly lagged, never snapped.
//  3. MEMORY    – plasticity: a fraction of every pull is banked per vertex and
//                 relaxes slowly (soft peaks, folds, dimples).
//  4. RIPPLES   – a damped wave field on the grid (pokes, landings, folds).
//  5. JIGGLE    – whole-blob squash / sway oscillators (the wobble after release).
//
// Local space: origin at the centre of the tray floor, +y up.
import type { Tuning } from '../../tuning';

export type SlimeTuning = Tuning['slime'];

export const MAX_GRABS = 4;
/** Lip width of the tray rim (shared with the tray mesh). */
export const TRAY_LIP = 0.12;

const LUT_N = 96;
const LUT_S = 11;
const L_RHO = 0, L_CX = 1, L_CY = 2, L_CZ = 3, L_COS = 4, L_SIN = 5, L_NX = 6, L_NZ = 7, L_YF = 8, L_W = 9, L_THIN = 10;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** One finger's hold on the slime (also kept alive, as a "ghost", while it snaps back). */
export class SlimeGrab {
  active = false;
  /** finger still down */
  down = false;
  id = -1;
  /** anchor on the rest dome */
  gx = 0; gy = 0; gz = 0;
  /** tip position + velocity */
  tx = 0; ty = 0; tz = 0;
  vx = 0; vy = 0; vz = 0;
  /** finger target (local space) */
  fx = 0; fy = 0; fz = 0;
  /** lagged copies of the tip (stages 1..3) — the strand body trails the tip */
  lag = new Float32Array(9);
  /** |tip − anchor| */
  stretch = 0;
  peak = 0;
  /** 0..1 how completely this grab owns its vertices (fades out as the strand retracts) */
  ex = 0;
  age = 0;
  relAge = 0;
  relStretch = 0;
  landed = true;
  startX = 0;
  startZ = 0;
}

export class SlimeSim {
  readonly W: number;
  readonly n: number;
  readonly R: number;
  readonly H: number;
  /** dome sphere radius and the offset of its centre below the floor */
  private Rs: number;
  private dome0: number;
  readonly rest: Float32Array;
  readonly restN: Float32Array;
  /** unit-disc coordinates, used for glitter */
  readonly uv: Float32Array;
  readonly index: Uint16Array;
  /** left, right, down, up neighbour per vertex (self when missing) */
  readonly nbr: Int32Array;
  private kap: Float32Array;
  private ksumMax = 1;
  private rimPin: Float32Array;

  // state
  private off: Float32Array;
  private vel: Float32Array;
  private mem: Float32Array;
  /** quick-fading dents (pokes) */
  private dent: Float32Array;
  private acc: Float32Array;
  private tgt: Float32Array;
  private wsum: Float32Array;
  private own: Float32Array;
  private thinT: Float32Array;
  private rip: Float32Array;
  private ripV: Float32Array;
  private ripLive = false;

  // output
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  readonly thin: Float32Array;

  // whole-blob oscillators
  private jh = 0; private jhv = 0;
  private jx = 0; private jxv = 0;
  private jz = 0; private jzv = 0;

  readonly grabs: SlimeGrab[] = [];
  private lut = new Float32Array((LUT_N + 1) * LUT_S);
  private reach = 1;
  /** largest displacement this frame (debug) */
  maxOff = 0;
  /** false once everything has settled: the heavy per-vertex passes are skipped until something wakes it */
  private awake = true;
  private maxMem = 0;
  private maxVel = 0;

  private tn: SlimeTuning;

  constructor(tn: SlimeTuning) {
    this.tn = tn;
    const N = Math.min(250, Math.max(8, tn.gridN | 0)); // 16-bit indices: (N+1)² must stay below 65536
    const W = N + 1;
    const n = W * W;
    this.W = W;
    this.n = n;
    const R = tn.radius;
    const H = R * tn.domeHeight;
    this.R = R;
    this.H = H;
    this.Rs = (R * R + H * H) / (2 * H);
    this.dome0 = this.Rs - H;

    this.rest = new Float32Array(n * 3);
    this.restN = new Float32Array(n * 3);
    this.uv = new Float32Array(n * 2);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.thin = new Float32Array(n);
    this.off = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.mem = new Float32Array(n * 3);
    this.dent = new Float32Array(n * 3);
    this.acc = new Float32Array(n * 3);
    this.tgt = new Float32Array(n * 3);
    this.wsum = new Float32Array(n);
    this.own = new Float32Array(n);
    this.thinT = new Float32Array(n);
    this.rip = new Float32Array(n);
    this.ripV = new Float32Array(n);
    this.rimPin = new Float32Array(n);
    this.nbr = new Int32Array(n * 4);
    this.kap = new Float32Array(n * 4);
    for (let i = 0; i < MAX_GRABS; i++) this.grabs.push(new SlimeGrab());

    // ── grid → disc (elliptical mapping keeps cells nearly square) ──
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const a = -1 + (2 * i) / N;
        const b = -1 + (2 * j) / N;
        const ux = a * Math.sqrt(1 - (b * b) / 2);
        const uz = b * Math.sqrt(1 - (a * a) / 2);
        const x = ux * R;
        const z = uz * R;
        const r = Math.hypot(x, z);
        const y = this.domeY(r);
        this.rest[3 * k] = x;
        this.rest[3 * k + 1] = y;
        this.rest[3 * k + 2] = z;
        const il = 1 / this.Rs;
        this.restN[3 * k] = x * il;
        this.restN[3 * k + 1] = (y + this.dome0) * il;
        this.restN[3 * k + 2] = z * il;
        this.uv[2 * k] = ux;
        this.uv[2 * k + 1] = uz;
        const rho = Math.min(1, r / R);
        // slime sticks to the tray near its rim
        this.rimPin[k] = smooth(0.8, 0.98, rho) * 0.92;
      }
    }
    // ── triangles (facing +y) ──
    this.index = new Uint16Array(6 * N * N);
    let q = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        this.index[q++] = a; this.index[q++] = c; this.index[q++] = b;
        this.index[q++] = b; this.index[q++] = c; this.index[q++] = d;
      }
    }
    // ── neighbours + wave weights ──
    const h0 = ((2 * R) / N) * 0.886;
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const nb = [i > 0 ? k - 1 : k, i < N ? k + 1 : k, j > 0 ? k - W : k, j < N ? k + W : k];
        let ks = 0;
        for (let m = 0; m < 4; m++) {
          this.nbr[4 * k + m] = nb[m];
          let w = 0;
          if (nb[m] !== k) {
            const dx = this.rest[3 * nb[m]] - this.rest[3 * k];
            const dy = this.rest[3 * nb[m] + 1] - this.rest[3 * k + 1];
            const dz = this.rest[3 * nb[m] + 2] - this.rest[3 * k + 2];
            const L2 = dx * dx + dy * dy + dz * dz;
            w = (h0 * h0) / Math.max(L2, 1e-6);
          }
          this.kap[4 * k + m] = w;
          ks += w;
        }
        if (ks > this.ksumMax) this.ksumMax = ks;
      }
    }
    this.pos.set(this.rest);
    this.nrm.set(this.restN);
  }

  // ── geometry helpers ───────────────────────────────────────────────────────
  /** Height of the rest dome at horizontal distance r from the centre. */
  domeY(r: number): number {
    const v = this.Rs * this.Rs - r * r;
    if (v <= 0) return 0;
    return Math.max(0, Math.sqrt(v) - this.dome0);
  }

  /** Top of the tray (floor, rim, then the table) at horizontal distance r. */
  groundY(r: number): number {
    const tn = this.tn;
    const fil = tn.trayMargin;
    const rin = this.R + tn.trayMargin;
    if (r <= rin - fil) return 0;
    if (r < rin) {
      const dr = r - (rin - fil);
      return fil - Math.sqrt(Math.max(0, fil * fil - dr * dr));
    }
    if (r < rin + TRAY_LIP) return tn.trayRim;
    return -tn.trayFloor;
  }

  /** Normal of the 2x2 grid stencil around vertex k (central differences — smoother than per-face normals). */
  private stencil(k: number, p: Float32Array, out: Float32Array): void {
    const nb = this.nbr;
    const l = nb[4 * k] * 3, r = nb[4 * k + 1] * 3, d = nb[4 * k + 2] * 3, u = nb[4 * k + 3] * 3;
    const e1x = p[r] - p[l], e1y = p[r + 1] - p[l + 1], e1z = p[r + 2] - p[l + 2];
    const e2x = p[u] - p[d], e2y = p[u + 1] - p[d + 1], e2z = p[u + 2] - p[d + 2];
    const nx = e2y * e1z - e2z * e1y;
    const ny = e2z * e1x - e2x * e1z;
    const nz = e2x * e1y - e2y * e1x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-9) {
      const inv = 1 / len;
      out[3 * k] = nx * inv;
      out[3 * k + 1] = ny * inv;
      out[3 * k + 2] = nz * inv;
    }
  }

  // ── public controls ────────────────────────────────────────────────────────
  /**
   * Try to grab the slime with a ray (local space, direction normalised).
   * Returns the grab slot or -1. Picks the front-most surface vertex near the ray.
   */
  grabAt(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, id: number): number {
    let slot = -1;
    for (let k = 0; k < MAX_GRABS; k++) {
      if (!this.grabs[k].active) { slot = k; break; }
    }
    if (slot < 0) {
      // all busy: recycle the most retracted ghost (a snapping-back strand), never a held one
      let low = 1e9;
      for (let k = 0; k < MAX_GRABS; k++) {
        const g = this.grabs[k];
        if (!g.down && g.stretch < low) { low = g.stretch; slot = k; }
      }
      if (slot < 0) return -1;
    }
    const pos = this.pos;
    const e2 = this.tn.pickRadius * this.tn.pickRadius;
    let best = -1, bestT = 1e9, fb = -1, fbD = 1e9;
    for (let i = 0; i < this.n; i++) {
      const vx = pos[3 * i] - ox, vy = pos[3 * i + 1] - oy, vz = pos[3 * i + 2] - oz;
      const t = vx * dx + vy * dy + vz * dz;
      if (t <= 0) continue;
      const d2 = vx * vx + vy * vy + vz * vz - t * t;
      if (d2 < e2) {
        if (t < bestT) { bestT = t; best = i; }
      } else if (d2 < fbD) {
        fbD = d2;
        fb = i;
      }
    }
    if (best < 0) {
      // forgiving: a near miss next to the slime still grabs the closest edge
      const f = e2 * 6;
      if (fb >= 0 && fbD < f) best = fb;
      else return -1;
    }
    this.awake = true;
    const g = this.grabs[slot];
    g.active = true;
    g.down = true;
    g.id = id;
    g.gx = this.rest[3 * best]; g.gy = this.rest[3 * best + 1]; g.gz = this.rest[3 * best + 2];
    g.tx = pos[3 * best]; g.ty = pos[3 * best + 1]; g.tz = pos[3 * best + 2];
    g.vx = g.vy = g.vz = 0;
    g.fx = g.tx; g.fy = g.ty; g.fz = g.tz;
    for (let m = 0; m < 3; m++) { g.lag[3 * m] = g.tx; g.lag[3 * m + 1] = g.ty; g.lag[3 * m + 2] = g.tz; }
    g.stretch = Math.hypot(g.tx - g.gx, g.ty - g.gy, g.tz - g.gz);
    g.peak = g.stretch;
    g.ex = 0;
    g.age = 0;
    g.relAge = 0;
    g.relStretch = 0;
    g.landed = true;
    g.startX = g.gx;
    g.startZ = g.gz;
    return slot;
  }

  setFinger(slot: number, x: number, y: number, z: number): void {
    const g = this.grabs[slot];
    g.fx = x; g.fy = y; g.fz = z;
  }

  release(slot: number): void {
    const g = this.grabs[slot];
    if (!g.active || !g.down) return;
    g.down = false;
    g.relAge = 0;
    g.relStretch = g.stretch;
    g.landed = g.stretch < 0.35;
  }

  /** Drop everything instantly (reset). */
  reset(): void {
    this.off.fill(0); this.vel.fill(0); this.mem.fill(0); this.dent.fill(0);
    this.rip.fill(0); this.ripV.fill(0); this.thin.fill(0);
    this.ripLive = false;
    this.awake = true;
    for (const g of this.grabs) { g.active = false; g.down = false; }
    this.jh = this.jhv = this.jx = this.jxv = this.jz = this.jzv = 0;
    this.pos.set(this.rest);
    this.nrm.set(this.restN);
  }

  /** Whole-blob squash/stretch kick: dh = initial offset, dv = initial velocity. */
  kick(dh: number, dv: number): void {
    this.jh = clamp(this.jh + dh, -0.35, 0.35);
    this.jhv += dv;
  }

  /** Sideways sway kick (shear velocity). */
  sway(vx: number, vz: number): void {
    this.jxv += vx;
    this.jzv += vz;
  }

  /** Outward ripple from a point of the rest dome (amp < 0 pushes the surface in first). */
  ripple(x: number, z: number, amp: number, sigma = 0.28): void {
    const rest = this.rest, rv = this.ripV;
    const inv = 1 / (2 * sigma * sigma);
    const lim = 9 * sigma * sigma;
    for (let i = 0; i < this.n; i++) {
      const dx = rest[3 * i] - x, dz = rest[3 * i + 2] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > lim) continue;
      rv[i] += amp * Math.exp(-d2 * inv);
    }
    this.ripLive = true;
    this.awake = true;
  }

  /** Poke: a quick dent at a point of the rest dome that refills with a ripple. */
  poke(x: number, z: number, depth: number): void {
    const rest = this.rest, rn = this.restN, dent = this.dent, mem = this.mem;
    const sigma = 0.25;
    const inv = 1 / (2 * sigma * sigma);
    const lim = 9 * sigma * sigma;
    for (let i = 0; i < this.n; i++) {
      const dx = rest[3 * i] - x, dz = rest[3 * i + 2] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > lim) continue;
      const g = Math.exp(-d2 * inv);
      for (let c = 0; c < 3; c++) {
        const nn = rn[3 * i + c];
        dent[3 * i + c] -= nn * depth * 0.95 * g;
        mem[3 * i + c] -= nn * depth * 0.14 * g;
      }
    }
    this.awake = true;
    this.ripple(x, z, -depth * 4.2, 0.3);
    this.kick(0, -depth * 1.6);
  }

  /** Fold: slime piles up into a soft ridge where the drag swept over it, with a ripple. */
  fold(x: number, z: number): void {
    const rest = this.rest, rn = this.restN, dent = this.dent, mem = this.mem;
    const sigma = 0.38;
    const inv = 1 / (2 * sigma * sigma);
    const lim = 9 * sigma * sigma;
    for (let i = 0; i < this.n; i++) {
      const dx = rest[3 * i] - x, dz = rest[3 * i + 2] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > lim) continue;
      const g = Math.exp(-d2 * inv);
      for (let c = 0; c < 3; c++) {
        dent[3 * i + c] += rn[3 * i + c] * 0.2 * g;
        mem[3 * i + c] += rn[3 * i + c] * 0.1 * g;
      }
    }
    this.awake = true;
    this.ripple(x, z, 0.9, 0.4);
    this.kick(0, -1.4);
  }

  // ── the frame ──────────────────────────────────────────────────────────────
  update(dtIn: number, time: number): void {
    const dt = clamp(dtIn, 1e-4, 1 / 30);
    const tn = this.tn;
    if (this.awake) {
      this.reach = tn.grabRadius * tn.grabReach;
      let held = false;
      for (let k = 0; k < MAX_GRABS; k++) {
        if (this.grabs[k].active) {
          held = true;
          this.stepGrab(this.grabs[k], dt);
        }
      }
      this.computeTargets(dt);
      const nSub = Math.max(1, Math.ceil(dt * 100));
      const h = dt / nSub;
      for (let s = 0; s < nSub; s++) this.integrate(h);
      // nothing held, no ripples, no memory left, nothing moving → sleep
      if (!held && !this.ripLive && this.maxMem < 1e-8 && this.maxOff < 2e-4 && this.maxVel < 2e-3) {
        this.off.fill(0);
        this.vel.fill(0);
        this.mem.fill(0);
        this.dent.fill(0);
        this.awake = false;
      }
    }
    this.stepJiggle(dt);
    this.writeGeometry(time, dt);
  }

  // ── grabs ──────────────────────────────────────────────────────────────────
  private stepGrab(g: SlimeGrab, dt: number): void {
    const tn = this.tn;
    g.age += dt;
    let fx = g.gx, fy = g.gy, fz = g.gz; // where the tip wants to be
    let w: number, z: number;

    if (g.down) {
      // 1. the anchor slides when the finger is pulled far sideways (lump follows the finger)
      let hx = g.fx - g.gx, hz = g.fz - g.gz;
      const lh = Math.hypot(hx, hz);
      if (lh > tn.slipDistance) {
        const move = (lh - tn.slipDistance) * (1 - Math.exp(-tn.slipRate * dt)) / lh;
        g.gx += hx * move;
        g.gz += hz * move;
        const rr = Math.hypot(g.gx, g.gz);
        const lim = this.R * 0.96;
        if (rr > lim) { g.gx *= lim / rr; g.gz *= lim / rr; }
        g.gy = this.domeY(Math.hypot(g.gx, g.gz));
        hx = g.fx - g.gx;
        hz = g.fz - g.gz;
      }
      let dx = hx, dy = g.fy - g.gy, dz = hz;
      // 2. the slime clings to the tray: no diving, and dragged sideways it rides over the dome
      const lh2 = Math.hypot(dx, dz);
      const rr = Math.hypot(g.gx + dx, g.gz + dz);
      const carry = Math.max(this.domeY(rr) * 0.92, this.groundY(rr)) + 0.1;
      const minY = (g.gy - 0.06) + (carry - (g.gy - 0.06)) * smooth(0.1, 0.55, lh2);
      if (g.gy + dy < minY) dy = minY - g.gy;
      // 3. soft rubber band toward the stretch limit
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L > 1e-5) {
        const a = tn.stretchLimit * 0.6, b = tn.stretchLimit;
        const Ls = L <= a ? L : a + (b - a) * (1 - Math.exp(-(L - a) / (b - a)));
        const k = Ls / L;
        dx *= k; dy *= k; dz *= k;
      }
      fx = g.gx + dx; fy = g.gy + dy; fz = g.gz + dz;
      w = tn.followSpeed;
      z = tn.followDamping;
    } else {
      g.relAge += dt;
      w = tn.snapBackSpeed;
      z = 0.42 + 0.26 * clamp(tn.viscosity, 0, 1);
    }

    // tip spring (semi-implicit, two substeps)
    const m = 2, h = dt / m;
    for (let s = 0; s < m; s++) {
      const ax = w * w * (fx - g.tx) - 2 * z * w * g.vx;
      const ay = w * w * (fy - g.ty) - 2 * z * w * g.vy;
      const az = w * w * (fz - g.tz) - 2 * z * w * g.vz;
      g.vx += ax * h; g.vy += ay * h; g.vz += az * h;
      g.tx += g.vx * h; g.ty += g.vy * h; g.tz += g.vz * h;
    }
    if (g.ty < g.gy - 0.12) { g.ty = g.gy - 0.12; if (g.vy < 0) g.vy = 0; }

    // the strand body trails the tip
    const kl = 1 - Math.exp(-tn.strandLag * dt);
    const lg = g.lag;
    let px = g.tx, py = g.ty, pz = g.tz;
    for (let s = 0; s < 3; s++) {
      lg[3 * s] += (px - lg[3 * s]) * kl;
      lg[3 * s + 1] += (py - lg[3 * s + 1]) * kl;
      lg[3 * s + 2] += (pz - lg[3 * s + 2]) * kl;
      px = lg[3 * s]; py = lg[3 * s + 1]; pz = lg[3 * s + 2];
    }

    g.stretch = Math.hypot(g.tx - g.gx, g.ty - g.gy, g.tz - g.gz);
    if (g.stretch > g.peak) g.peak = g.stretch;
    g.ex = clamp(g.stretch / 0.4, 0, 1);

    if (!g.down) {
      // landing: the retracted strand slaps back onto the blob → jiggle + ripple
      if (!g.landed && g.stretch < 0.3 * g.relStretch + 0.08) {
        g.landed = true;
        const a = clamp(g.relStretch / Math.max(0.5, tn.stretchLimit * 0.6), 0, 1.2);
        this.kick(0, -3.4 * a);
        const dx = g.tx - g.gx, dz = g.tz - g.gz;
        this.sway(dx * 0.3, dz * 0.3);
        this.ripple(g.gx, g.gz, -1.1 * a, 0.32);
      }
      const speed = Math.hypot(g.vx, g.vy, g.vz);
      if (g.relAge > 0.15 && g.stretch < 0.02 && speed < 0.12) g.active = false;
      else if (g.relAge > 3) g.active = false;
    }
  }

  // ── strand shaping ─────────────────────────────────────────────────────────
  /** Fill the LUT that maps normalised rest distance t (indexed by √t) onto the horn. */
  private buildLut(g: SlimeGrab): boolean {
    const tn = this.tn, reach = this.reach, lut = this.lut;
    const Dx = g.tx - g.gx, Dy = g.ty - g.gy, Dz = g.tz - g.gz;
    const s = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
    if (s < 1e-3) return false;
    const lam = 1 - Math.exp(-s * 4); // fades the horn in from a soft mound
    const gn = 1 / (1 + tn.thinning * s);
    const rn = Math.max(0.035, reach * 0.35 * gn);
    // the drop at the tip is never narrower than the neck (no undercut on short pulls)
    const rcap = Math.min(Math.max(tn.bulbRadius, rn), reach * 0.5);
    const capH = Math.min(rcap, 0.45 * s);
    const tc = clamp((1.6 * rcap) / reach, 0.08, 0.34);
    const Zn = s - capH;
    const kap = 1.35 + 0.5 * smooth(0.2, 1.4, s);
    const hd = Math.hypot(Dx, Dz);
    const sag = tn.droop * hd * lam;
    const lg = g.lag;
    const tx = g.tx, ty = g.ty, tz = g.tz;

    // pass 1: radius, centreline, weights
    for (let k = 0; k <= LUT_N; k++) {
      const tau = k / LUT_N;
      const t = tau * tau;
      let rho: number, zz: number;
      if (t <= tc) {
        const a = t / tc;
        rho = rcap * Math.sqrt(a * (2 - a));
        zz = s - capH * a;
      } else {
        const eta = (t - tc) / (1 - tc);
        const e1 = 1 - eta;
        rho = rn + (rcap - rn) * e1 * e1 * e1 + (reach - rn) * Math.pow(eta, 2.1);
        zz = Zn * Math.pow(e1, kap);
      }
      // fade the horn's lateral shape out into the undisturbed dome (keeps the join C1-smooth)
      const rho0 = reach * t;
      rho = rho0 + (rho - rho0) * (1 - smooth(0.5, 1, t));
      const H = clamp(zz / s, 0, 1);
      // lagged tip for this height along the strand (tip = stage 0 … base = stage 3)
      const u = (1 - H) * 3;
      let ax: number, ay: number, az: number, bx: number, by: number, bz: number, f: number;
      if (u < 1) { ax = tx; ay = ty; az = tz; bx = lg[0]; by = lg[1]; bz = lg[2]; f = u; }
      else if (u < 2) { ax = lg[0]; ay = lg[1]; az = lg[2]; bx = lg[3]; by = lg[4]; bz = lg[5]; f = u - 1; }
      else { ax = lg[3]; ay = lg[4]; az = lg[5]; bx = lg[6]; by = lg[7]; bz = lg[8]; f = u - 2; }
      const lx = ax + (bx - ax) * f - g.gx, ly = ay + (by - ay) * f - g.gy, lz = az + (bz - az) * f - g.gz;
      const o = k * LUT_S;
      const cx = lx * H, cz = lz * H;
      let cy = ly * H - sag * 4 * H * (1 - H);
      // a strand dragged sideways drapes over the dome instead of sinking into it
      const rc = Math.sqrt((g.gx + cx) * (g.gx + cx) + (g.gz + cz) * (g.gz + cz));
      const clear = this.domeY(rc) * 0.96 + Math.min(rho, 0.2) * (1 - smooth(0.5, 1, t)) - g.gy;
      if (cy < clear) cy += (clear - cy) * (1 - smooth(0.7, 1, t));
      lut[o + L_RHO] = rho;
      lut[o + L_CX] = cx;
      lut[o + L_CY] = cy;
      lut[o + L_CZ] = cz;
      // the ring around the strand stays level (perpendicular to it) instead of tilting with the dome slope
      lut[o + L_YF] = smooth(0.2, 0.8, t);
      lut[o + L_W] = 1 - smooth(0, 1, t);
      lut[o + L_THIN] = smooth(0.62, 0.07, rho) * clamp(s / 0.5, 0, 1) * lam;
    }
    // pass 2: rings stay perpendicular to the strand axis. Short strands use the straight
    // anchor→tip axis; long ones also bend with the centreline (the whip).
    const wb = 0.5 * smooth(1.0, 2.2, s);
    const dxn = Dx / s, dyn = Dy / s, dzn = Dz / s;
    for (let k = 0; k <= LUT_N; k++) {
      const a = Math.max(0, k - 3) * LUT_S, b = Math.min(LUT_N, k + 3) * LUT_S;
      let tx2 = lut[a + L_CX] - lut[b + L_CX];
      let ty2 = lut[a + L_CY] - lut[b + L_CY];
      let tz2 = lut[a + L_CZ] - lut[b + L_CZ];
      const tl = Math.sqrt(tx2 * tx2 + ty2 * ty2 + tz2 * tz2);
      if (tl > 1e-6) { tx2 /= tl; ty2 /= tl; tz2 /= tl; } else { tx2 = dxn; ty2 = dyn; tz2 = dzn; }
      tx2 = dxn + (tx2 - dxn) * wb;
      ty2 = dyn + (ty2 - dyn) * wb;
      tz2 = dzn + (tz2 - dzn) * wb;
      const tl2 = Math.sqrt(tx2 * tx2 + ty2 * ty2 + tz2 * tz2) || 1;
      tx2 /= tl2; ty2 /= tl2; tz2 /= tl2;
      const s0 = Math.sqrt(tx2 * tx2 + tz2 * tz2);
      const theta = Math.atan2(s0, ty2);
      const t = (k / LUT_N) * (k / LUT_N);
      const te = theta * smooth(1, 0.4, t) * lam;
      const o = k * LUT_S;
      lut[o + L_COS] = Math.cos(te);
      lut[o + L_SIN] = Math.sin(te);
      if (s0 < 1e-5) { lut[o + L_NX] = 1; lut[o + L_NZ] = 0; }
      else { lut[o + L_NX] = tz2 / s0; lut[o + L_NZ] = -tx2 / s0; }
    }
    return true;
  }

  /** Add this grab's strand field into the per-vertex accumulators. */
  private applyGrab(g: SlimeGrab): void {
    const reach = this.reach, lut = this.lut;
    const rest = this.rest, acc = this.acc, wsum = this.wsum, own = this.own, thinT = this.thinT, pin = this.rimPin;
    const R2 = reach * reach, invR = 1 / reach;
    const Dx = g.tx - g.gx, Dy = g.ty - g.gy, Dz = g.tz - g.gz;
    const s = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
    const lam = 1 - Math.exp(-s * 4);
    const gx = g.gx, gy = g.gy, gz = g.gz;
    const ex = g.ex;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const ix = 3 * i;
      const px = rest[ix], py = rest[ix + 1], pz = rest[ix + 2];
      const qx = px - gx, qy = py - gy, qz = pz - gz;
      // horizontal distance from the anchor decides where on the horn a vertex lands
      const qh2 = qx * qx + qz * qz;
      if (qh2 >= R2) continue;
      const qh = Math.sqrt(qh2);
      const t = qh * invR;
      const f = Math.sqrt(t) * LUT_N;
      const k = f | 0;
      const fr = f - k;
      const o0 = k * LUT_S, o1 = o0 + LUT_S;
      const rho = lut[o0 + L_RHO] + (lut[o1 + L_RHO] - lut[o0 + L_RHO]) * fr;
      const cx = lut[o0 + L_CX] + (lut[o1 + L_CX] - lut[o0 + L_CX]) * fr;
      const cy = lut[o0 + L_CY] + (lut[o1 + L_CY] - lut[o0 + L_CY]) * fr;
      const cz = lut[o0 + L_CZ] + (lut[o1 + L_CZ] - lut[o0 + L_CZ]) * fr;
      const cs = lut[o0 + L_COS] + (lut[o1 + L_COS] - lut[o0 + L_COS]) * fr;
      const sn = lut[o0 + L_SIN] + (lut[o1 + L_SIN] - lut[o0 + L_SIN]) * fr;
      const nx = lut[o0 + L_NX] + (lut[o1 + L_NX] - lut[o0 + L_NX]) * fr;
      const nz = lut[o0 + L_NZ] + (lut[o1 + L_NZ] - lut[o0 + L_NZ]) * fr;
      const yf = lut[o0 + L_YF] + (lut[o1 + L_YF] - lut[o0 + L_YF]) * fr;
      const w = lut[o0 + L_W] + (lut[o1 + L_W] - lut[o0 + L_W]) * fr;
      const th = lut[o0 + L_THIN] + (lut[o1 + L_THIN] - lut[o0 + L_THIN]) * fr;

      // lateral offset on the horn (keeps its azimuth), blended with the rest offset at small stretch
      let lx = qx, lz = qz;
      if (qh > 1e-6) {
        const sc = rho / qh;
        lx = qx + (qx * sc - qx) * lam;
        lz = qz + (qz * sc - qz) * lam;
      }
      const ly = qy + (yf * qy - qy) * lam;
      // rotate the ring so it stays perpendicular to the strand axis
      const dot = nx * lx + nz * lz;
      const rx = lx * cs - nz * ly * sn + nx * dot * (1 - cs);
      const ry = ly * cs + (nz * lx - nx * lz) * sn;
      const rz = lz * cs + nx * ly * sn + nz * dot * (1 - cs);

      const ox = gx + cx + rx - px;
      let oy = gy + cy + ry - py;
      const oz = gz + cz + rz - pz;
      // slime near the rim stays stuck to the tray (but never the part right under the finger)
      oy *= 1 - pin[i] * smooth(0.25, 0.6, t);

      acc[ix] += w * ox; acc[ix + 1] += w * oy; acc[ix + 2] += w * oz;
      wsum[i] += w;
      const ow = w * ex;
      if (ow > own[i]) own[i] = ow;
      if (th > thinT[i]) thinT[i] = th;
    }
  }

  private computeTargets(dt: number): void {
    const n = this.n, tn = this.tn;
    this.acc.fill(0);
    this.wsum.fill(0);
    this.own.fill(0);
    this.thinT.fill(0);
    for (let k = 0; k < MAX_GRABS; k++) {
      const g = this.grabs[k];
      if (g.active && this.buildLut(g)) this.applyGrab(g);
    }
    const acc = this.acc, wsum = this.wsum, own = this.own, mem = this.mem, tgt = this.tgt;
    const bank = tn.plasticity;
    const kb = 1 - Math.exp(-5 * dt);
    const decay = Math.exp(-tn.relaxSpeed * dt);
    const dent = this.dent;
    const dd = Math.exp(-3.2 * dt);
    let maxMem = 0;
    for (let i = 0; i < n; i++) {
      const ix = 3 * i;
      const ws = wsum[i];
      let fx = 0, fy = 0, fz = 0;
      if (ws > 1e-5) {
        const iw = 1 / ws;
        fx = acc[ix] * iw; fy = acc[ix + 1] * iw; fz = acc[ix + 2] * iw;
        // bank a fraction of the pull as plastic memory (only ever grows while pulling)
        const cx = fx * bank, cy = fy * bank, cz = fz * bank;
        const cm = cx * cx + cy * cy + cz * cz;
        const mm = mem[ix] * mem[ix] + mem[ix + 1] * mem[ix + 1] + mem[ix + 2] * mem[ix + 2];
        if (cm > mm) {
          mem[ix] += (cx - mem[ix]) * kb;
          mem[ix + 1] += (cy - mem[ix + 1]) * kb;
          mem[ix + 2] += (cz - mem[ix + 2]) * kb;
        }
      }
      mem[ix] *= decay; mem[ix + 1] *= decay; mem[ix + 2] *= decay;
      dent[ix] *= dd; dent[ix + 1] *= dd; dent[ix + 2] *= dd;
      const mq = mem[ix] * mem[ix] + mem[ix + 1] * mem[ix + 1] + mem[ix + 2] * mem[ix + 2] + dent[ix] * dent[ix] + dent[ix + 1] * dent[ix + 1] + dent[ix + 2] * dent[ix + 2];
      if (mq > maxMem) maxMem = mq;
      const free = 1 - Math.min(1, own[i]);
      tgt[ix] = fx + (mem[ix] + dent[ix]) * free;
      tgt[ix + 1] = fy + (mem[ix + 1] + dent[ix + 1]) * free;
      tgt[ix + 2] = fz + (mem[ix + 2] + dent[ix + 2]) * free;
    }
    this.maxMem = maxMem;
  }

  // ── integration ────────────────────────────────────────────────────────────
  private integrate(h: number): void {
    const tn = this.tn, n = this.n;
    const off = this.off, vel = this.vel, tgt = this.tgt, own = this.own;
    const wf = tn.vertexFollow, wg = tn.gripFollow;
    const zA = 0.92;
    let maxOff = 0, maxVel = 0;
    for (let i = 0; i < n; i++) {
      const ix = 3 * i;
      // everything a finger holds follows equally stiffly (no differential lag that would dent the tip)
      const o = own[i] * 6 > 1 ? 1 : own[i] * 6;
      const w = wf + (wg - wf) * o;
      const k = w * w, c = 2 * zA * w;
      for (let m = 0; m < 3; m++) {
        const a = k * (tgt[ix + m] - off[ix + m]) - c * vel[ix + m];
        vel[ix + m] += a * h;
        off[ix + m] += vel[ix + m] * h;
      }
      const mg = off[ix] * off[ix] + off[ix + 1] * off[ix + 1] + off[ix + 2] * off[ix + 2];
      if (mg > maxOff) maxOff = mg;
      const vg = vel[ix] * vel[ix] + vel[ix + 1] * vel[ix + 1] + vel[ix + 2] * vel[ix + 2];
      if (vg > maxVel) maxVel = vg;
    }
    this.maxOff = Math.sqrt(maxOff);
    this.maxVel = Math.sqrt(maxVel);
    if (this.ripLive) this.stepRipples(h);
  }

  private stepRipples(h: number): void {
    const tn = this.tn, n = this.n;
    const rip = this.rip, rv = this.ripV, nbr = this.nbr, kap = this.kap;
    const h0 = ((2 * this.R) / (this.W - 1)) * 0.886;
    // wave speed → coefficient, clamped to stay stable
    let cw2 = (tn.rippleSpeed * tn.rippleSpeed) / (h0 * h0);
    const lim = 1.4 / (this.ksumMax * h * h);
    if (cw2 > lim) cw2 = lim;
    const damp = tn.rippleDamping, spring = 6;
    let live = 0;
    for (let i = 0; i < n; i++) {
      const r = rip[i];
      const b = 4 * i;
      const lap =
        kap[b] * (rip[nbr[b]] - r) + kap[b + 1] * (rip[nbr[b + 1]] - r) + kap[b + 2] * (rip[nbr[b + 2]] - r) + kap[b + 3] * (rip[nbr[b + 3]] - r);
      rv[i] += (-spring * r - damp * rv[i] + cw2 * lap) * h;
    }
    for (let i = 0; i < n; i++) {
      rip[i] += rv[i] * h;
      const e = Math.abs(rip[i]) + Math.abs(rv[i]) * 0.1;
      if (e > live) live = e;
    }
    if (live < 2e-5) {
      rip.fill(0);
      rv.fill(0);
      this.ripLive = false;
    }
  }

  private stepJiggle(dt: number): void {
    const tn = this.tn;
    const w = tn.jiggleFreq;
    const z = 0.06 + 0.12 * clamp(tn.viscosity, 0, 1);
    const w2 = w * 0.8;
    this.jhv += (-w * w * this.jh - 2 * z * w * this.jhv) * dt;
    this.jh = clamp(this.jh + this.jhv * dt, -0.35, 0.35);
    this.jxv += (-w2 * w2 * this.jx - 2 * z * w2 * this.jxv) * dt;
    this.jx = clamp(this.jx + this.jxv * dt, -0.3, 0.3);
    this.jzv += (-w2 * w2 * this.jz - 2 * z * w2 * this.jzv) * dt;
    this.jz = clamp(this.jz + this.jzv * dt, -0.3, 0.3);
  }

  // ── output ─────────────────────────────────────────────────────────────────
  private writeGeometry(time: number, dt: number): void {
    const tn = this.tn;
    const n = this.n;
    const rest = this.rest, rn = this.restN, off = this.off, rip = this.rip, pos = this.pos;
    const breath = tn.breath * Math.sin(time * 1.35);
    const sq = this.jh + breath;
    const sx = this.jx + 0.5 * tn.breath * Math.sin(time * 0.7);
    const sz = this.jz + 0.4 * tn.breath * Math.cos(time * 0.9);
    const ripOn = this.ripLive;
    for (let i = 0; i < n; i++) {
      const ix = 3 * i;
      const r = ripOn ? rip[i] : 0;
      let x = rest[ix] + off[ix] + rn[ix] * r;
      let y = rest[ix + 1] + off[ix + 1] + rn[ix + 1] * r;
      let z = rest[ix + 2] + off[ix + 2] + rn[ix + 2] * r;
      // whole-blob squash + sway, strongest on the dome, fading out up a strand
      const fade = 1 - smooth(0.7, 1.5, y);
      const ky = 1 + sq * fade;
      const kxz = 1 - 0.5 * sq * fade;
      y *= ky;
      x = x * kxz + sx * y * fade;
      z = z * kxz + sz * y * fade;
      // the tray is solid
      const gy = this.groundY(Math.sqrt(x * x + z * z)) + 0.004;
      if (y < gy) y = gy;
      pos[ix] = x; pos[ix + 1] = y; pos[ix + 2] = z;
    }
    // normals + translucency, from the final positions
    const nrm = this.nrm, thin = this.thin, thinT = this.thinT;
    const kThin = 1 - Math.exp(-14 * dt), kThinDown = 1 - Math.exp(-5 * dt);
    for (let i = 0; i < n; i++) {
      this.stencil(i, pos, nrm);
      const tt = thinT[i];
      thin[i] += (tt - thin[i]) * (tt > thin[i] ? kThin : kThinDown);
    }
  }
}
