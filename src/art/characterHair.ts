// Hair styles for the v2 teen character. Authored in "head units": positions and
// radii are fractions of the head ellipsoid (1 = head surface), so a style keeps
// its shape if the head proportions are tuned. Head space: origin = head center,
// +z forward, +y up.
import * as THREE from 'three';
import { B, D2R, GB, TAU, type V3t } from './characterKit';

export interface HairParts {
  base: THREE.BufferGeometry; // always shown (hugs the head / falls below a hat)
  vol: THREE.BufferGeometry | null; // volume on top (hidden under hats)
  accent: THREE.BufferGeometry | null; // hair ties / scrunchies — drawn in a contrasting accent color
  dark: THREE.BufferGeometry | null; // shorter / shadowed hair (darker shade)
  front: THREE.BufferGeometry | null; // fringe / bangs (hidden under hats)
  tails: { geo: THREE.BufferGeometry; pivot: V3t; side: number; tilt: number }[]; // swaying parts (pivot in meters)
  topY: number; // top of the hair at the center, meters in head space
  hairR: number; // outer scale relative to the head, for accessories
}
interface HairBuild {
  base: GB;
  vol: GB;
  accent: GB;
  dark: GB;
  front: GB;
  tails: { gb: GB; pivot: V3t; side: number; tilt: number }[];
  topY: number;
  hairR: number;
}

const U = 0.1; // isotropic puff unit (meters)
const hp = (p: V3t): V3t => [p[0] * B.HX, p[1] * B.HY, p[2] * B.HZ];
/** The ponytail's swing pivot (meters, head space) — the character has one tail bone, placed here. */
export const TAIL_PIVOT: V3t = hp([0, 0.78, -0.76]);
const hr = (r: V3t): V3t => [r[0] * B.HX, r[1] * B.HY, r[2] * B.HZ];
/** Ellipsoid in head units. */
const E = (b: GB, p: V3t, r: V3t, rot?: V3t) => b.e(hp(p), hr(r), rot);
/** Round puff: position in head units, radius in puff units (1 = 0.1 m). */
const P = (b: GB, p: V3t, rad: number) => b.e(hp(p), rad * U);
const capN = (b: GB, k = 1, y = 0.1) => E(b, [0, y, -0.14], [1.08 * k, 1.02 * k, 1.06 * k]);
const dir = (yawDeg: number, elDeg: number, tilt = 0.3): V3t => {
  const t = yawDeg * D2R, f = elDeg * D2R;
  const d = new THREE.Vector3(Math.sin(t) * Math.cos(f), Math.sin(f) + tilt, Math.cos(t) * Math.cos(f)).normalize();
  return [d.x, d.y, d.z];
};
/** Rounded spike from a point on the cap surface (head units) pointing along `d`. */
const SP = (b: GB, p: V3t, d: V3t, len: number, rad: number) => b.spk(hp(p), d, len, rad);

/** A braid: a scalloped lathe from point a (top) to point b (meters, head space). */
function braid(b: GB, a: V3t, to: V3t, rad: number, bumps = 9): void {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...to).sub(A);
  const L = d.length();
  const per = 4;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= bumps * per; i++) {
    const t = i / (bumps * per);
    const u = (i % per) / per;
    const taper = 1 - 0.5 * Math.pow(t, 2.4);
    pts.push(new THREE.Vector2(rad * (0.8 + 0.24 * Math.sin(Math.PI * u)) * taper, L * t));
  }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(new THREE.LatheGeometry(pts, 8), { p: a, q }, true);
}

/** Smooth wavy curtain / lock: tapered lathe from `a` (top) to `to`, flattened by zScale (meters, head space). */
function lock(b: GB, a: V3t, to: V3t, rTop: number, rBot: number, zScale = 0.5, wave = 0.0, waves = 2, seg = 10): void {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...to).sub(A);
  const L = d.length();
  const pts: THREE.Vector2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const round = i === n ? 0.35 : 1;
    pts.push(new THREE.Vector2(Math.max(0.001, (rTop + (rBot - rTop) * t + wave * Math.sin(t * waves * TAU)) * round), L * t));
  }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(1, 1, zScale);
  b.add(g, { p: a, q }, true);
}

/** Side-swept fringe over the forehead. */
function fringe(h: HairBuild, flip = 1, y = 0.62): void {
  const b = h.front;
  E(b, [-0.34 * flip, y, 0.8], [0.52, 0.26, 0.3], [0.1, 0, 0.5 * flip]);
  E(b, [0.0, y + 0.06, 0.82], [0.5, 0.26, 0.3], [0.1, 0, -0.1 * flip]);
  E(b, [0.36 * flip, y - 0.02, 0.78], [0.46, 0.25, 0.3], [0.1, 0, -0.5 * flip]);
}
/** v3: a thinner side-swept fringe (no roll across the forehead) for the new styles. */
function softFringe(h: HairBuild, flip = 1, y = 0.62): void {
  const b = h.front;
  E(b, [-0.36 * flip, y - 0.04, 0.78], [0.46, 0.19, 0.28], [0.1, 0, 0.55 * flip]);
  E(b, [0.0, y + 0.02, 0.82], [0.44, 0.19, 0.28], [0.12, 0, -0.2 * flip]);
  E(b, [0.38 * flip, y - 0.05, 0.78], [0.4, 0.17, 0.28], [0.1, 0, -0.6 * flip]);
}
/** Curtain bangs: two swoops that part in the middle and frame the face. */
function curtains(h: HairBuild, y = 0.7): void {
  for (const s of [-1, 1]) {
    E(h.front, [0.3 * s, y, 0.78], [0.5, 0.2, 0.28], [0.1, 0, -0.35 * s]);
    E(h.base, [0.68 * s, y - 0.28, 0.62], [0.3, 0.4, 0.28], [0.05, 0, 0.12 * s]);
  }
}
/** v3: curtain bangs with a soft center part: each side sweeps down and out to the temple (no roll across the forehead). */
function softCurtains(h: HairBuild, y = 0.7): void {
  for (const s of [-1, 1]) {
    E(h.front, [0.5 * s, y - 0.06, 0.74], [0.4, 0.16, 0.27], [0.12, 0, -0.62 * s]);
    E(h.front, [0.27 * s, y + 0.02, 0.82], [0.24, 0.11, 0.22], [0.1, 0, -0.4 * s]);
    E(h.base, [0.7 * s, y - 0.3, 0.6], [0.28, 0.42, 0.28], [0.05, 0, 0.12 * s]);
  }
}

const HAIR_DEFS: ((h: HairBuild) => void)[] = [
  // 0 Fade — short textured top, tapered sides
  (h) => {
    E(h.dark, [0, -0.08, -0.12], [1.035, 0.86, 1.02]);
    E(h.base, [0, 0.4, -0.08], [0.95, 0.72, 0.97]);
    E(h.base, [0, 0.78, 0.18], [0.7, 0.3, 0.7]);
    E(h.base, [-0.25, 0.92, 0.3], [0.4, 0.2, 0.42], [0, 0, 0.3]);
    h.topY = 0.14;
    h.hairR = 1.12;
  },
  // 1 Mid-part bob — chin length, parted in the middle
  (h) => {
    capN(h.base, 1.03);
    E(h.base, [0, -0.3, -0.3], [1.02, 0.88, 0.76]);
    for (const s of [-1, 1]) {
      E(h.base, [0.99 * s, -0.22, 0.04], [0.22, 0.78, 0.66], [0, 0, 0.05 * s]);
      E(h.front, [0.5 * s, 0.66, 0.78], [0.62, 0.3, 0.3], [0.1, 0, -0.55 * s]);
      E(h.base, [0.86 * s, 0.1, 0.55], [0.22, 0.62, 0.34], [0, 0, 0.08 * s]);
    }
    h.topY = 0.15;
    h.hairR = 1.16;
  },
  // 2 High pony — slicked back, high tie, long swinging tail
  (h) => {
    capN(h.base, 1.0, 0.08);
    fringe(h, -1, 0.7);
    h.accent.ringAt(hp([0, 0.78, -0.74]), [0, 0.45, -0.9], 0.03, 0.016);
    const t = new GB();
    t.e([0, -0.02, -0.035], [0.03, 0.045, 0.03]);
    t.e([0, -0.095, -0.065], [0.034, 0.062, 0.032]);
    t.e([0, -0.18, -0.075], [0.032, 0.072, 0.028]);
    t.e([0, -0.27, -0.07], [0.027, 0.072, 0.025]);
    t.e([0, -0.35, -0.055], [0.018, 0.062, 0.018]);
    h.tails.push({ gb: t, pivot: TAIL_PIVOT, side: 0, tilt: 0.45 });
    h.topY = 0.14;
    h.hairR = 1.1;
  },
  // 3 Wolf cut — shaggy layers, wispy ends, curtain fringe
  (h) => {
    capN(h.base, 1.04);
    E(h.vol, [0, 0.92, 0.05], [0.8, 0.26, 0.78]);
    E(h.base, [0, -0.12, -0.22], [1.15, 0.5, 1.03]);
    E(h.base, [0, -0.62, -0.4], [1.06, 0.42, 0.9]);
    for (const s of [-1, 1]) {
      E(h.base, [1.0 * s, -0.3, 0.0], [0.24, 0.62, 0.62]);
      SP(h.base, [1.02 * s, -0.78, 0.0], dir(s * 85, -70, -0.2), 0.07, 0.03);
      SP(h.base, [0.82 * s, -0.95, -0.35], dir(s * 120, -75, -0.3), 0.08, 0.03);
      SP(h.base, [0.45 * s, -1.0, -0.78], dir(s * 150, -75, -0.3), 0.085, 0.03);
    }
    for (const x of [-0.6, 0, 0.6]) SP(h.base, [x, -0.97, -0.6], dir(Math.sign(x) * 160, -80, -0.2), 0.085, 0.03);
    curtains(h, 0.62);
    for (const x of [-0.4, 0, 0.4]) SP(h.front, [x, 0.52, 0.9], [x * 0.5, -0.5, 0.9], 0.04, 0.02);
    h.topY = 0.16;
    h.hairR = 1.2;
  },
  // 4 Long waves — mid-back length, soft S-waves, flat side-swept fringe
  (h) => {
    capN(h.base, 1.03);
    E(h.front, [0.12, 0.7, 0.8], [0.72, 0.12, 0.17], [0.12, 0, -0.5]);
    E(h.front, [-0.45, 0.62, 0.76], [0.3, 0.1, 0.15], [0.1, 0, 0.45]);
    for (const s of [-1, 1]) E(h.base, [0.7 * s, 0.38, 0.6], [0.28, 0.42, 0.28], [0.05, 0, 0.12 * s]);
    // back curtain with waves, down to the shoulder blades
    lock(h.base, [0, 0.0, -0.075], [0, -0.47, -0.085], 0.104, 0.096, 0.5, 0.011, 2.2, 14);
    for (const s of [-1, 1]) {
      // front locks over the shoulders + side fill so it reads as one mass
      lock(h.base, [s * 0.1, -0.02, 0.0], [s * 0.1, -0.33, 0.085], 0.034, 0.03, 0.8, 0.006, 2);
      lock(h.base, [s * 0.098, 0.0, -0.045], [s * 0.098, -0.4, -0.06], 0.04, 0.03, 1.2, 0.0, 1);
    }
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 5 Space buns — two high buns with face-framing strands
  (h) => {
    capN(h.base, 1.0, 0.06);
    curtains(h, 0.7);
    for (const s of [-1, 1]) {
      P(h.vol, [0.62 * s, 1.1, -0.28], 0.52);
      h.accent.ringAt(hp([0.5 * s, 0.86, -0.3]), [0.55 * s, 0.8, 0], 0.05, 0.02);
      E(h.base, [0.92 * s, -0.1, 0.38], [0.1, 0.55, 0.12]);
    }
    h.topY = 0.15;
    h.hairR = 1.1;
  },
  // 6 Fluffy curls — voluminous curly cloud, shoulder length
  (h) => {
    h.vol = new GB(false, true);
    capN(h.base, 0.99);
    P(h.vol, [0, 1.12, -0.1], 0.5);
    const rows: [number, number, number, number][] = [
      // elevation (deg), count, phase, radius
      [58, 4, 0.5, 0.46], [32, 6, 0, 0.47], [6, 6, 0.5, 0.45], [-18, 6, 0, 0.42], [-42, 4, 0.5, 0.38],
    ];
    for (const [el, n, ph, rad] of rows) {
      for (let k = 0; k < n; k++) {
        const yaw = (k + ph) * (360 / n) * D2R;
        const w = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        if (Math.abs(w) < 55 * D2R && el < 50) continue; // keep the face clear
        const f = el * D2R;
        const d = [Math.sin(yaw) * Math.cos(f), Math.sin(f), Math.cos(yaw) * Math.cos(f)];
        const target = el < 0 ? h.base : h.vol;
        target.e([d[0] * 1.2 * B.HX, d[1] * 1.05 * B.HY - 0.005, d[2] * 1.05 * B.HZ - 0.03], rad * U);
      }
    }
    h.topY = 0.19;
    h.hairR = 1.42;
  },
  // 7 Braids — two long braids over the shoulders
  (h) => {
    capN(h.base, 1.02);
    curtains(h, 0.66);
    for (const s of [-1, 1]) {
      braid(h.base, [s * 0.088, -0.02, -0.01], [s * 0.1, -0.38, 0.11], 0.022, 10);
      h.accent.e([s * 0.1, -0.385, 0.112], [0.024, 0.022, 0.024]);
    }
    h.topY = 0.15;
    h.hairR = 1.12;
  },
  // 8 Curtain bangs — straight shoulder length, long curtain bangs
  (h) => {
    capN(h.base, 1.03);
    curtains(h, 0.72);
    for (const s of [-1, 1]) {
      E(h.base, [0.98 * s, -0.4, 0.04], [0.22, 1.0, 0.66], [0, 0, 0.04 * s]);
      E(h.base, [0.92 * s, -0.3, 0.55], [0.2, 0.82, 0.3], [0, 0, 0.05 * s]);
    }
    E(h.base, [0, -0.55, -0.38], [1.0, 1.15, 0.7]);
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 9 Afro puffs — two big puffs, tidy edges
  (h) => {
    capN(h.base, 1.0, 0.04);
    for (const s of [-1, 1]) {
      P(h.vol, [0.86 * s, 1.0, -0.1], 0.82);
      P(h.vol, [0.86 * s + 0.38 * s, 0.82, -0.05], 0.46);
      P(h.vol, [0.86 * s - 0.2 * s, 1.5, -0.12], 0.44);
      h.accent.ringAt(hp([0.72 * s, 0.7, -0.1]), [0.55 * s, 0.8, 0], 0.056, 0.02);
    }
    E(h.base, [0, 0.72, 0.5], [0.95, 0.16, 0.5]);
    h.topY = 0.15;
    h.hairR = 1.1;
  },
  // 10 Quiff — big swept-up front, short sides
  (h) => {
    E(h.dark, [0, -0.06, -0.12], [1.035, 0.82, 1.02]);
    E(h.base, [0, 0.42, -0.1], [0.96, 0.74, 0.98]);
    E(h.base, [0.0, 1.02, 0.5], [0.62, 0.5, 0.78], [-0.5, 0, 0.12]);
    E(h.base, [0.0, 0.92, 0.1], [0.74, 0.44, 0.7]);
    E(h.base, [-0.5, 0.82, 0.6], [0.3, 0.24, 0.32]);
    h.topY = 0.2;
    h.hairR = 1.18;
  },
  // 11 Top knot — tight sides, man bun
  (h) => {
    E(h.dark, [0, -0.08, -0.12], [1.035, 0.84, 1.02]);
    E(h.base, [0, 0.36, -0.1], [0.96, 0.76, 0.98]);
    P(h.vol, [0, 1.3, -0.34], 0.5);
    h.accent.ringAt(hp([0, 1.02, -0.3]), [0, 0.8, -0.3], 0.05, 0.02);
    E(h.base, [0, 0.74, 0.2], [0.7, 0.26, 0.66]);
    h.topY = 0.19;
    h.hairR = 1.1;
  },
  // ── v3 wardrobe: styles 12+ ─────────────────────────────────────────────────
  // 12 Scrunch Pony — high pony with a big scrunchie, long wavy swinging tail, side-swept fringe
  (h) => {
    capN(h.base, 1.0, 0.08);
    softFringe(h, 1, 0.7);
    h.accent.ringAt(hp([0, 0.8, -0.74]), [0, 0.45, -0.9], 0.05, 0.028);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      h.accent.e(hp([Math.sin(a) * 0.5 * 0.55, 0.8 + Math.cos(a) * 0.5 * 0.4, -0.74 - Math.cos(a) * 0.1]), [0.014, 0.014, 0.014]);
    }
    const t = new GB();
    t.e([0, -0.03, -0.05], [0.05, 0.06, 0.045]);
    t.e([0, -0.11, -0.075], [0.058, 0.07, 0.05]);
    t.e([0.004, -0.2, -0.085], [0.056, 0.075, 0.048]);
    t.e([0.012, -0.3, -0.08], [0.05, 0.075, 0.045]);
    t.e([0.026, -0.4, -0.066], [0.042, 0.07, 0.04]);
    t.e([0.04, -0.485, -0.048], [0.032, 0.058, 0.03]);
    h.tails.push({ gb: t, pivot: TAIL_PIVOT, side: 0, tilt: 0.5 });
    h.topY = 0.15;
    h.hairR = 1.1;
  },
  // 13 Pigtails — two high tails with ties
  (h) => {
    capN(h.base, 1.0, 0.06);
    softCurtains(h, 0.7);
    const t = new GB();
    for (const s of [-1, 1]) {
      const b = hp([0.8 * s, 0.5, -0.42]);
      E(h.base, [0.78 * s, 0.5, -0.4], [0.2, 0.24, 0.22]);
      h.accent.ringAt(b, [0.9 * s, 0.1, -0.3], 0.038, 0.019);
      const o: V3t = [b[0] - TAIL_PIVOT[0], b[1] - TAIL_PIVOT[1], b[2] - TAIL_PIVOT[2]];
      const at = (dx: number, dy: number, dz: number): V3t => [o[0] + dx * s, o[1] + dy, o[2] + dz];
      t.e(at(0.012, -0.04, -0.008), [0.036, 0.05, 0.036]);
      t.e(at(0.024, -0.11, -0.016), [0.04, 0.06, 0.04]);
      t.e(at(0.034, -0.19, -0.02), [0.038, 0.065, 0.036]);
      t.e(at(0.04, -0.27, -0.016), [0.032, 0.06, 0.03]);
      t.e(at(0.044, -0.34, -0.01), [0.022, 0.05, 0.022]);
    }
    h.tails.push({ gb: t, pivot: TAIL_PIVOT, side: 0, tilt: 0.3 });
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 14 Half-Up — top knot, long waves down the back
  (h) => {
    capN(h.base, 1.03);
    softCurtains(h, 0.68);
    P(h.vol, [0, 1.12, -0.35], 0.42);
    h.accent.ringAt(hp([0, 0.9, -0.34]), [0, 0.8, -0.3], 0.044, 0.02);
    lock(h.base, [0, 0.0, -0.075], [0, -0.5, -0.09], 0.1, 0.07, 0.5, 0.009, 2, 14);
    for (const s of [-1, 1]) {
      lock(h.base, [s * 0.092, -0.02, 0.0], [s * 0.1, -0.34, 0.07], 0.03, 0.018, 0.8, 0.006, 2);
      lock(h.base, [s * 0.09, 0.0, -0.045], [s * 0.098, -0.4, -0.06], 0.034, 0.02, 1.0, 0.0, 1);
    }
    h.topY = 0.19;
    h.hairR = 1.14;
  },
  // 15 Beaded Braids — long box braids with beads
  (h) => {
    capN(h.base, 1.02);
    softCurtains(h, 0.66);
    const yaws = [66, 96, 124, 152, 178];
    for (const s of [-1, 1]) {
      yaws.forEach((yaw, i) => {
        const a = yaw * D2R;
        const x = Math.sin(a) * 0.092 * 0.98 * s, z = Math.cos(a) * 0.105 * 0.98;
        const front = i < 2;
        const len = 0.36 + (i === 4 ? 0.04 : 0) + (i % 2) * 0.03;
        const end: V3t = front ? [x * 1.08, -0.04 - len, z + 0.07] : [x * 1.06, -0.04 - len, z - 0.012];
        braid(h.base, [x, -0.04, z], end, 0.0145, 9);
        h.accent.e(end, 0.0155);
        h.accent.e([x + (end[0] - x) * 0.62, -0.04 - len * 0.62, z + (end[2] - z) * 0.62], 0.012);
      });
    }
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 16 Big Puff — one huge curly puff on top, a scrunchie at its base
  (h) => {
    capN(h.base, 1.0, 0.04);
    P(h.vol, [0, 1.25, -0.3], 0.9);
    for (const s of [-1, 1]) {
      P(h.vol, [0.62 * s, 1.0, -0.3], 0.55);
      P(h.vol, [0.3 * s, 1.5, -0.35], 0.5);
    }
    P(h.vol, [0, 0.95, -0.95], 0.6);
    h.accent.ringAt(hp([0, 0.88, -0.55]), [0, 0.6, -0.8], 0.085, 0.02);
    h.topY = 0.25;
    h.hairR = 1.25;
  },
  // 17 Side Shave — shaved on one side, a long swoop on the other
  (h) => {
    E(h.dark, [0, 0.04, -0.12], [1.045, 0.92, 1.04]);
    E(h.base, [0.24, 0.5, -0.05], [0.8, 0.7, 0.95]);
    E(h.base, [0.3, 0.88, 0.2], [0.7, 0.34, 0.7], [0, 0, -0.2]);
    E(h.front, [0.22, 0.66, 0.8], [0.72, 0.28, 0.3], [0.1, 0, -0.45]);
    E(h.base, [0.98, -0.35, 0.0], [0.24, 0.9, 0.66]);
    lock(h.base, [0.1, -0.02, 0.0], [0.11, -0.38, 0.09], 0.045, 0.036, 0.9, 0.008, 2);
    lock(h.base, [0.07, 0.0, -0.06], [0.09, -0.36, -0.07], 0.05, 0.04, 1.0, 0, 1);
    E(h.base, [0.5, -0.1, -0.8], [0.45, 0.6, 0.4]);
    h.topY = 0.16;
    h.hairR = 1.14;
  },
  // 18 Clip Waves — long waves pinned with hair clips
  (h) => {
    capN(h.base, 1.03);
    softCurtains(h, 0.66);
    lock(h.base, [0, 0.0, -0.075], [0, -0.47, -0.085], 0.104, 0.096, 0.5, 0.011, 2.2, 14);
    for (const s of [-1, 1]) {
      lock(h.base, [s * 0.1, -0.02, 0.0], [s * 0.1, -0.33, 0.085], 0.034, 0.03, 0.8, 0.006, 2);
      lock(h.base, [s * 0.098, 0.0, -0.045], [s * 0.098, -0.4, -0.06], 0.04, 0.03, 1.2, 0.0, 1);
    }
    for (const [x, y, z] of [[-0.9, 0.62, 0.5], [-0.84, 0.46, 0.62], [-0.96, 0.78, 0.36]]) {
      h.accent.seg(hp([x, y, z]), hp([x * 0.82, y + 0.18, z + 0.2]), 0.0085);
    }
    h.accent.e(hp([0.84, 0.74, 0.5]), [0.02, 0.02, 0.012]);
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 19 Bob & Bangs — chin-length bob with blunt bangs
  (h) => {
    capN(h.base, 1.03);
    E(h.base, [0, -0.3, -0.3], [1.02, 0.88, 0.76]);
    for (const s of [-1, 1]) {
      E(h.base, [0.99 * s, -0.22, 0.04], [0.22, 0.78, 0.66], [0, 0, 0.05 * s]);
      E(h.base, [0.86 * s, 0.1, 0.55], [0.22, 0.62, 0.34], [0, 0, 0.08 * s]);
      E(h.front, [0.74 * s, 0.5, 0.8], [0.28, 0.3, 0.3]);
    }
    E(h.front, [0, 0.64, 0.84], [0.95, 0.22, 0.3], [0.15, 0, 0]);
    h.topY = 0.15;
    h.hairR = 1.16;
  },
  // 20 Bubble Pony — low tail cinched into bubbles
  (h) => {
    capN(h.base, 1.0, 0.06);
    softCurtains(h, 0.7);
    E(h.base, [0, 0.1, -0.85], [0.42, 0.42, 0.34]);
    const t = new GB();
    const o = hp([0, 0.1, -0.85]);
    const at = (dy: number, dz = 0): V3t => [o[0] - TAIL_PIVOT[0], o[1] - TAIL_PIVOT[1] + dy, o[2] - TAIL_PIVOT[2] + dz];
    t.e(at(-0.04, -0.012), [0.04, 0.04, 0.04]);
    t.e(at(-0.095, -0.016), [0.048, 0.048, 0.046]);
    t.e(at(-0.16, -0.018), [0.046, 0.046, 0.044]);
    t.e(at(-0.22, -0.016), [0.04, 0.04, 0.038]);
    for (const dy of [-0.07, -0.128, -0.19]) t.e(at(dy, -0.016), [0.016, 0.012, 0.016]);
    h.tails.push({ gb: t, pivot: TAIL_PIVOT, side: 0, tilt: 0.25 });
    h.topY = 0.15;
    h.hairR = 1.1;
  },
  // 21 Messy Bun — big loose bun, escaping strands
  (h) => {
    capN(h.base, 1.0, 0.06);
    softCurtains(h, 0.7);
    P(h.vol, [0.08, 1.3, -0.3], 0.7);
    P(h.vol, [-0.25, 1.22, -0.18], 0.42);
    P(h.vol, [0.4, 1.18, -0.45], 0.4);
    P(h.vol, [0.1, 1.55, -0.3], 0.3);
    h.accent.ringAt(hp([0.08, 0.96, -0.3]), [0, 0.9, -0.3], 0.056, 0.022);
    for (const [yaw, el] of [[40, 20], [-50, 15], [100, 10], [-110, 10], [170, 20]]) SP(h.vol, [Math.sin(yaw * D2R) * 0.62 + 0.08, 1.16, -0.3 + Math.cos(yaw * D2R) * 0.4], dir(yaw, el, 0.1), 0.06, 0.024);
    for (const s of [-1, 1]) SP(h.base, [0.9 * s, 0.2, 0.4], dir(s * 80, -70, -0.3), 0.1, 0.02);
    h.topY = 0.21;
    h.hairR = 1.1;
  },
  // 22 Pixie — short textured crop, long side-swept bang
  (h) => {
    E(h.dark, [0, -0.05, -0.12], [1.04, 0.82, 1.03]);
    E(h.base, [0, 0.42, -0.08], [0.98, 0.75, 0.99]);
    E(h.base, [0, 0.82, 0.1], [0.74, 0.32, 0.72]);
    for (const [x, z] of [[-0.5, 0.0], [-0.2, 0.3], [0.3, 0.1], [0.5, -0.2], [0.0, -0.4], [-0.35, -0.35]]) SP(h.base, [x, 1.0, z], [x * 0.4, 1, z * 0.4], 0.05, 0.026);
    E(h.front, [0.3, 0.68, 0.8], [0.8, 0.26, 0.3], [0.1, 0, -0.55]);
    for (const s of [-1, 1]) E(h.base, [1.0 * s, 0.0, 0.1], [0.12, 0.4, 0.5]);
    h.topY = 0.17;
    h.hairR = 1.12;
  },
  // 23 Side Braid — one thick braid over the shoulder
  (h) => {
    capN(h.base, 1.02);
    softFringe(h, 1, 0.68);
    E(h.base, [0, -0.3, -0.3], [0.95, 0.8, 0.72]);
    braid(h.base, [-0.085, -0.03, 0.012], [-0.125, -0.46, 0.125], 0.034, 12);
    h.accent.e([-0.126, -0.47, 0.127], [0.036, 0.03, 0.036]);
    lock(h.base, [0.1, -0.02, 0.0], [0.1, -0.3, 0.05], 0.034, 0.03, 0.8, 0.006, 2);
    h.topY = 0.15;
    h.hairR = 1.12;
  },
  // 24 Sleek Long — waist-length straight, center part
  (h) => {
    capN(h.base, 1.02, 0.08);
    softCurtains(h, 0.74);
    lock(h.base, [0, 0.0, -0.075], [0, -0.62, -0.09], 0.103, 0.072, 0.48, 0.0, 1, 16);
    for (const s of [-1, 1]) {
      lock(h.base, [0.094 * s, -0.01, -0.02], [0.108 * s, -0.5, 0.01], 0.034, 0.02, 1.0, 0, 1);
      // a front lock that falls over the shoulder and lies on top of the chest (not inside it)
      lock(h.base, [0.088 * s, -0.02, 0.04], [0.112 * s, -0.36, 0.125], 0.026, 0.016, 0.7, 0, 1);
    }
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 25 Fauxhawk — shaved sides, a spiky ridge down the middle
  (h) => {
    E(h.dark, [0, 0.05, -0.12], [1.045, 0.93, 1.04]);
    E(h.base, [0, 0.5, -0.1], [0.4, 0.75, 0.98]);
    for (let i = 0; i < 7; i++) {
      const z = 0.75 - i * 0.28;
      SP(h.base, [0, 0.98 - Math.abs(z) * 0.12, z], [0, 1, z * 0.35], 0.07 - Math.abs(z) * 0.015, 0.03);
    }
    h.topY = 0.2;
    h.hairR = 1.12;
  },
];
export const HAIR_COUNT = HAIR_DEFS.length;
/** v3 wardrobe: names, icons and rarity of the hair styles from index 12 on (catalog + locker read this). */
export const HAIR_V3_ITEMS: { name: string; icon: string; rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' }[] = [
  { name: 'Scrunch Pony', icon: '🎀', rarity: 'common' }, { name: 'Pigtails', icon: '🍭', rarity: 'common' }, { name: 'Half-Up', icon: '🌸', rarity: 'uncommon' },
  { name: 'Beaded Braids', icon: '📿', rarity: 'rare' }, { name: 'Big Puff', icon: '🫧', rarity: 'uncommon' }, { name: 'Side Shave', icon: '⚡', rarity: 'rare' },
  { name: 'Clip Waves', icon: '🦋', rarity: 'uncommon' }, { name: 'Bob & Bangs', icon: '✂️', rarity: 'common' }, { name: 'Bubble Pony', icon: '🎈', rarity: 'uncommon' },
  { name: 'Messy Bun', icon: '🍩', rarity: 'common' }, { name: 'Pixie', icon: '🧚', rarity: 'uncommon' }, { name: 'Side Braid', icon: '🪢', rarity: 'uncommon' },
  { name: 'Sleek Long', icon: '💫', rarity: 'common' }, { name: 'Fauxhawk', icon: '🎸', rarity: 'rare' },
];
export const HAIR_RARITY = HAIR_V3_ITEMS;

const hairCache = new Map<number, HairParts>();
export function getHair(style: number): HairParts {
  const s = Math.max(0, Math.min(HAIR_DEFS.length - 1, style | 0));
  let p = hairCache.get(s);
  if (p) return p;
  const h: HairBuild = { base: new GB(), vol: new GB(), accent: new GB(), dark: new GB(), front: new GB(), tails: [], topY: 0.14, hairR: 1.1 };
  HAIR_DEFS[s](h);
  const safe = (gb: GB) => (gb.empty ? null : gb.build());
  if (h.base.empty) h.base.e([0, -1, 0], 0.001); // never empty
  p = {
    base: h.base.build(),
    vol: safe(h.vol),
    accent: safe(h.accent),
    dark: safe(h.dark),
    front: safe(h.front),
    tails: h.tails.map((t) => ({ geo: t.gb.build(), pivot: t.pivot, side: t.side, tilt: t.tilt })),
    topY: h.topY,
    hairR: h.hairR,
  };
  hairCache.set(s, p);
  return p;
}
