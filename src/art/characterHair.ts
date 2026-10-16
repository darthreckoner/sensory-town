// Hair styles for the v2 teen character. Authored in "head units": positions and
// radii are fractions of the head ellipsoid (1 = head surface), so a style keeps
// its shape if the head proportions are tuned. Head space: origin = head center,
// +z forward, +y up.
import * as THREE from 'three';
import { B, D2R, TAU, type V3t } from './characterKit';
import { GB, loft, strand } from './wardrobeKit';

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
  const per = 3;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= bumps * per; i++) {
    const t = i / (bumps * per);
    const u = (i % per) / per;
    const taper = 1 - 0.5 * Math.pow(t, 2.4);
    pts.push(new THREE.Vector2(rad * (0.8 + 0.24 * Math.sin(Math.PI * u)) * taper * (i === bumps * per ? 0.3 : 1), L * t));
  }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(new THREE.LatheGeometry(pts, 10), { p: a, q }, true);
}

/** A point on the head surface (theta = yaw from +z toward +x, phi = elevation, degrees; k = scale > 1 sits above the skin), head-space meters. */
const hs = (thDeg: number, phDeg: number, k = 1): V3t => {
  const t = thDeg * D2R, f = phDeg * D2R;
  return [B.HX * k * Math.sin(t) * Math.cos(f), B.HY * k * Math.sin(f), B.HZ * k * Math.cos(t) * Math.cos(f)];
};
interface Hairline {
  /** hairline elevation (degrees) at the front (center of the forehead), the temple (theta 55), above the ear (100) and the nape (180) */
  f: number;
  t: number;
  e: number;
  n: number;
}
const LONG_LINE: Hairline = { f: 25, t: 19, e: -4, n: -42 };
const smooth = (x: number): number => x * x * (3 - 2 * x);
function hairlinePhi(thDeg: number, l: Hairline): number {
  const a = Math.min(180, Math.abs(thDeg));
  const nodes: [number, number][] = [[0, l.f], [55, l.t], [100, l.e], [180, l.n]];
  for (let i = 1; i < nodes.length; i++) {
    if (a <= nodes[i][0]) {
      const k = smooth((a - nodes[i - 1][0]) / (nodes[i][0] - nodes[i - 1][0]));
      return nodes[i - 1][1] + (nodes[i][1] - nodes[i - 1][1]) * k;
    }
  }
  return l.n;
}
/**
 * Scalp shell: the head ellipsoid scaled a few percent and cut off along a hairline that follows the head (a curve
 * over the forehead, past the temple and ear, down to the nape), so the hairline is a clean line instead of the ragged
 * intersection of a big blob with the skull. 64 columns x 12 rows, smooth normals.
 */
function scalp(b: GB, k = 1.045, line: Hairline = LONG_LINE): void {
  const cols = 48, rows = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < cols; j++) {
    const th = (j / cols) * 360 - 180;
    const f0 = hairlinePhi(th, line);
    for (let i = 0; i <= rows; i++) {
      const ph = f0 + (90 - f0) * (i / rows);
      // the shell lifts a little off the skin toward its free edge (a soft rolled edge)
      const kk = k + 0.012 * (1 - i / rows) * (1 - i / rows);
      pos.push(...hs(th, ph, kk));
    }
  }
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) {
      const a = j * (rows + 1) + i, bb = ((j + 1) % cols) * (rows + 1) + i, c = a + 1, d = bb + 1;
      idx.push(a, bb, c, bb, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add(g, {}, true);
}
/** The hair mass: a scalp shell with a clean hairline plus crown / back volume (its front stays behind the hairline). */
const capN = (b: GB, k = 1, y = 0.1): void => {
  scalp(b, 1.045 + (k - 1) * 0.5);
  E(b, [0, y, -0.3], [1.08 * k, 1.02 * k, 0.98 * k]);
};
/**
 * The back of long hair: a cupped, clumped, feathered-edge sheet that wraps the back of the skull (never a flat card).
 * prof = [y, rx, rz, zc][] control rows from the crown down (meters, head space); the cross-section is a crescent
 * (outer arc + inner arc, `thick` meters apart, tapering to a feathered edge at the bottom) of +-span degrees, rippled
 * into `clumps` strand clumps whose tips end at uneven lengths.
 */
function back(b: GB, prof: [number, number, number, number][], span = 105, thick = 0.02, clumps = 9, amp = 0.05, tipVar = 0.025): void {
  const cx = new THREE.SplineCurve(prof.map(([y, rx]) => new THREE.Vector2(y, rx)));
  const cz = new THREE.SplineCurve(prof.map(([y, , rz]) => new THREE.Vector2(y, rz)));
  const cc = new THREE.SplineCurve(prof.map(([y, , , zc]) => new THREE.Vector2(y, zc)));
  void cx; void cz; void cc;
  const yTop = prof[0][0], yBot = prof[prof.length - 1][0];
  // piecewise-linear lookup of the control rows by height (smoothed)
  const at = (y: number, col: 1 | 2 | 3): number => {
    for (let i = 1; i < prof.length; i++) {
      if (y >= prof[i][0] || i === prof.length - 1) {
        const k = smooth(Math.min(1, Math.max(0, (prof[i - 1][0] - y) / (prof[i - 1][0] - prof[i][0]))));
        return prof[i - 1][col] + (prof[i][col] - prof[i - 1][col]) * k;
      }
    }
    return prof[prof.length - 1][col];
  };
  const rows = 16, m = 12;
  const rings: V3t[][] = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const ring: V3t[] = [];
    const th = thick * Math.min(1, t * 6 + 0.25) * (1 - 0.82 * smooth(Math.max(0, (t - 0.72) / 0.28)));
    const outer: V3t[] = [], inner: V3t[] = [];
    for (let i = 0; i <= m; i++) {
      const u = (i / m) * 2 - 1; // -1..1 across the back
      const a = u * span * D2R;
      // clumps: ripples across the sheet, growing toward the ends; uneven tip lengths
      const rip = 1 + amp * (0.35 + 0.65 * t) * Math.sin(u * clumps * Math.PI) ;
      const yv = yTop + (yBot + tipVar * Math.sin(u * clumps * Math.PI * 0.9 + 1) * (t > 0.85 ? 1 : 0) - yTop) * t;
      const rx = at(yv, 1), rz = at(yv, 2), zc = at(yv, 3);
      outer.push([Math.sin(a) * rx * rip, yv, zc - Math.cos(a) * rz * rip]);
      inner.push([Math.sin(a) * (rx - th) * rip, yv, zc - Math.cos(a) * (rz - th) * rip]);
    }
    ring.push(...outer, ...inner.reverse());
    rings.push(ring);
  }
  loft(b, rings);
}
/** One tapered hair strand sweeping along head-surface points [theta, phi, k]; w = half-width (meters). Blunt ends stay fat. */
function sweep(b: GB, pts: [number, number, number][], w = 0.016, tip = 0.35, blunt = false): void {
  strand(b, pts.map(([th, ph, k]) => hs(th, ph, k)), (t) => {
    const e = blunt ? 1 - Math.pow(t, 6) * 0.45 : 1 - Math.pow(t, 1.8) * (1 - tip);
    const swell = 1 + 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.4));
    return [w * e * swell, w * 0.62 * e * swell];
  }, 8, 9);
}
/** Side-swept fringe: strands start at a parting on the crown and sweep across the forehead toward one temple. */
function fringe(h: HairBuild, flip = 1, y = 0.62): void {
  const lift = (y - 0.62) * 20; // callers pass 0.62 .. 0.72
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    const th0 = -flip * (14 - u * 4);
    const end = flip * (-38 + u * 94); // tip theta: from the far temple across to the near temple
    sweep(h.front, [[th0, 78 - u * 3 + lift, 1.07], [th0 * 0.4 + end * 0.32, 58 - u * 6, 1.095], [end * 0.78, 40 - u * 10, 1.07], [end, 26 - u * 10 + (u > 0.6 ? -3 : 0), 1.045]], 0.02 - u * 0.002, 0.3);
  }
}
const softFringe = fringe;
/** Curtain bangs: each side sweeps from a soft center part down and out over the temple. */
function curtains(h: HairBuild, y = 0.7): void {
  const lift = (y - 0.7) * 20;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      const th0 = s * (3 + u * 6);
      const end = s * (52 + u * 12);
      sweep(h.front, [[th0, 78 + lift, 1.075], [s * (14 + u * 14), 58 - u * 4, 1.085], [s * (34 + u * 14), 36 - u * 6, 1.065], [end, 14 - u * 22, 1.04]], 0.019 - u * 0.001, 0.32);
    }
  }
}
const softCurtains = curtains;
/** Blunt bangs: a row of strands cut straight across the forehead. */
function bluntBangs(h: HairBuild): void {
  for (let i = 0; i < 9; i++) {
    const th = (i / 8) * 96 - 48;
    sweep(h.front, [[th, 80, 1.07], [th * 1.06, 56, 1.09], [th * 1.1, 36, 1.07], [th * 1.12, 27 - Math.abs(th) * 0.08, 1.05]], 0.0215, 0.9, true);
  }
}
/** A side lock that frames the face / falls over the shoulder: head-surface start, then free points (meters). */
function sideLock(b: GB, s: number, th: number, ph: number, to: V3t, w = 0.022, bulge = 0.0): void {
  const a = hs(th * s, ph, 1.05);
  const mid: V3t = [a[0] + (to[0] * s - a[0]) * 0.4 + s * bulge, a[1] + (to[1] - a[1]) * 0.45, a[2] + (to[2] - a[2]) * 0.4];
  strand(b, [a, mid, [to[0] * s, to[1], to[2]]], (t) => {
    const e = 1 - Math.pow(t, 2.2) * 0.62;
    return [w * e, w * 0.66 * e];
  }, 9, 8);
}
/** Smooth wavy lock: a lofted, tapered strand from `a` (top) to `to` (meters, head space), flattened by zScale (the old lathe signature). */
function lock(b: GB, a: V3t, to: V3t, rTop: number, rBot: number, zScale = 0.5, wave = 0.0, waves = 2, _seg = 10): void {
  void _seg;
  const n = 7;
  const pts: V3t[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (to[0] - a[0]) * t + wave * 1.6 * Math.sin(t * waves * TAU * 0.5) * Math.min(1, t * 2), a[1] + (to[1] - a[1]) * t, a[2] + (to[2] - a[2]) * t]);
  }
  strand(b, pts, (t) => {
    const r = rTop + (rBot - rTop) * t;
    const tip = t > 0.8 ? 1 - Math.pow((t - 0.8) / 0.2, 2) * 0.6 : 1;
    return [Math.max(0.0015, r * tip), Math.max(0.0015, r * tip * zScale)];
  }, 10, 10);
}

const HAIR_DEFS: ((h: HairBuild) => void)[] = [
  // 0 Fade — short textured top, tapered sides
  (h) => {
    scalp(h.dark, 1.03, { f: 34, t: 30, e: 12, n: -24 });
    scalp(h.base, 1.075, { f: 27, t: 46, e: 56, n: 44 });
    E(h.base, [0, 0.56, -0.06], [0.88, 0.5, 0.9]);
    E(h.base, [0, 0.8, 0.16], [0.66, 0.28, 0.66]);
    E(h.base, [-0.25, 0.92, 0.3], [0.4, 0.2, 0.42], [0, 0, 0.3]);
    for (const [x, y, z] of [[-0.3, 0.98, 0.36], [0.2, 0.97, 0.3], [0.0, 1.0, 0.08], [0.32, 0.9, -0.1]] as V3t[]) SP(h.base, [x, y, z], [x * 0.5, 1, z * 0.5], 0.05, 0.03);
    h.topY = 0.14;
    h.hairR = 1.12;
  },
  // 1 Mid-part bob — chin length, parted in the middle
  (h) => {
    capN(h.base, 1.03);
    back(h.base, [[0.03, 0.095, 0.098, -0.01], [-0.05, 0.094, 0.092, -0.022], [-0.11, 0.1, 0.086, -0.03], [-0.165, 0.106, 0.082, -0.032]], 128, 0.024, 10, 0.055, 0.012);
    curtains(h, 0.7);
    for (const s of [-1, 1]) sideLock(h.base, s, 84, 10, [0.099, -0.15, 0.02], 0.027);
    h.topY = 0.15;
    h.hairR = 1.16;
  },
  // 2 High pony — slicked back, high tie, long swinging tail
  (h) => {
    capN(h.base, 1.0, 0.08);
    fringe(h, -1, 0.7);
    h.accent.ringAt(hp([0, 0.78, -0.74]), [0, 0.45, -0.9], 0.03, 0.016);
    const t = new GB();
    // a ponytail lofted along a soft curve: full at the tie, a gentle bulge, a tapered pointed tip
    strand(t, [[0, -0.01, -0.03], [0.004, -0.09, -0.066], [-0.004, -0.19, -0.078], [0.006, -0.29, -0.07], [0, -0.385, -0.05]], (u) => {
      const r = 0.031 + 0.008 * Math.sin(Math.PI * Math.min(1, u * 1.3));
      const tip = 1 - Math.pow(u, 2.6) * 0.72;
      return [r * tip, r * tip * 0.84];
    }, 14, 18);
    h.tails.push({ gb: t, pivot: TAIL_PIVOT, side: 0, tilt: 0.45 });
    h.topY = 0.14;
    h.hairR = 1.1;
  },
  // 3 Wolf cut — shaggy layers, wispy ends, curtain fringe
  (h) => {
    capN(h.base, 1.04);
    E(h.vol, [0, 0.92, 0.05], [0.8, 0.26, 0.78]);
    back(h.base, [[0.03, 0.095, 0.1, -0.01], [-0.06, 0.095, 0.092, -0.03], [-0.14, 0.104, 0.08, -0.05], [-0.22, 0.112, 0.07, -0.062], [-0.3, 0.118, 0.062, -0.07]], 118, 0.026, 11, 0.09, 0.045);
    for (const s of [-1, 1]) {
      sideLock(h.base, s, 80, 8, [0.104, -0.2, 0.01], 0.028, 0.004);
      sideLock(h.base, s, 70, 22, [0.112, -0.31, 0.03], 0.022, 0.01);
      sideLock(h.base, s, 96, 0, [0.1, -0.26, -0.03], 0.024);
    }
    curtains(h, 0.62);
    h.topY = 0.16;
    h.hairR = 1.2;
  },
  // 4 Long waves — mid-back length, soft S-waves, side-swept fringe
  (h) => {
    capN(h.base, 1.03);
    fringe(h, 1, 0.7);
    back(h.base, [[0.03, 0.094, 0.098, -0.01], [-0.06, 0.09, 0.09, -0.03], [-0.16, 0.088, 0.07, -0.062], [-0.3, 0.1, 0.05, -0.09], [-0.46, 0.108, 0.04, -0.1]], 108, 0.026, 7, 0.06, 0.03);
    for (const s of [-1, 1]) {
      // front locks over the shoulders so it reads as one mass
      lock(h.base, [s * 0.1, -0.02, 0.0], [s * 0.106, -0.34, 0.07], 0.034, 0.03, 0.8, 0.006, 2);
      lock(h.base, [s * 0.098, 0.0, -0.045], [s * 0.104, -0.4, -0.06], 0.04, 0.03, 1.1, 0.0, 1);
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
      sideLock(h.base, s, 86, 14, [0.099, -0.08, 0.035], 0.016);
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
    back(h.base, [[0.03, 0.094, 0.098, -0.01], [-0.06, 0.09, 0.09, -0.03], [-0.16, 0.088, 0.07, -0.062], [-0.26, 0.098, 0.05, -0.085], [-0.34, 0.104, 0.042, -0.094]], 112, 0.022, 6, 0.03, 0.02);
    for (const s of [-1, 1]) {
      sideLock(h.base, s, 78, 12, [0.104, -0.3, 0.05], 0.03, 0.002);
      sideLock(h.base, s, 90, 2, [0.1, -0.27, -0.02], 0.026);
    }
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
    scalp(h.dark, 1.03, { f: 34, t: 30, e: 12, n: -24 });
    scalp(h.base, 1.075, { f: 27, t: 46, e: 56, n: 44 });
    E(h.base, [0, 0.6, -0.08], [0.9, 0.5, 0.92]);
    E(h.base, [0.0, 1.02, 0.5], [0.62, 0.5, 0.78], [-0.5, 0, 0.12]);
    E(h.base, [0.0, 0.92, 0.1], [0.74, 0.44, 0.7]);
    E(h.base, [-0.5, 0.82, 0.6], [0.3, 0.24, 0.32]);
    h.topY = 0.2;
    h.hairR = 1.18;
  },
  // 11 Top knot — tight sides, man bun
  (h) => {
    scalp(h.dark, 1.03, { f: 34, t: 30, e: 12, n: -24 });
    scalp(h.base, 1.075, { f: 27, t: 46, e: 56, n: 44 });
    E(h.base, [0, 0.56, -0.12], [0.88, 0.5, 0.9]);
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
    strand(t, [[0, -0.02, -0.05], [0.006, -0.12, -0.082], [-0.014, -0.24, -0.09], [0.016, -0.35, -0.078], [0.034, -0.45, -0.058], [0.044, -0.52, -0.04]], (u) => {
      const r = 0.047 + 0.012 * Math.sin(Math.PI * Math.min(1, u * 1.2)) + 0.004 * Math.sin(u * 14);
      const tip = 1 - Math.pow(u, 2.4) * 0.7;
      return [r * tip, r * tip * 0.8];
    }, 14, 22);
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
      strand(t, [at(0.006, -0.01, -0.004), at(0.022, -0.1, -0.016), at(0.038, -0.2, -0.022), at(0.05, -0.3, -0.016), at(0.056, -0.39, -0.008)], (u) => {
        const r = 0.034 + 0.006 * Math.sin(Math.PI * Math.min(1, u * 1.2));
        const tip = 1 - Math.pow(u, 2.5) * 0.72;
        return [r * tip, r * tip * 0.88];
      }, 12, 16);
    }
    h.tails.push({ gb: t, pivot: TAIL_PIVOT, side: 0, tilt: 0.3 });
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 14 Half-Up — top knot, long waves down the back
  (h) => {
    capN(h.base, 1.03);
    curtains(h, 0.68);
    P(h.vol, [0, 1.12, -0.35], 0.42);
    h.accent.ringAt(hp([0, 0.9, -0.34]), [0, 0.8, -0.3], 0.044, 0.02);
    back(h.base, [[0.03, 0.094, 0.098, -0.01], [-0.06, 0.09, 0.09, -0.03], [-0.16, 0.088, 0.07, -0.062], [-0.3, 0.1, 0.05, -0.09], [-0.46, 0.108, 0.04, -0.1]], 100, 0.024, 8, 0.05, 0.03);
    for (const s of [-1, 1]) {
      lock(h.base, [s * 0.092, -0.02, 0.0], [s * 0.102, -0.34, 0.07], 0.03, 0.018, 0.8, 0.006, 2);
      lock(h.base, [s * 0.09, 0.0, -0.045], [s * 0.1, -0.4, -0.06], 0.034, 0.02, 1.0, 0.0, 1);
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
    scalp(h.dark, 1.03, { f: 34, t: 30, e: 12, n: -24 });
    E(h.base, [0.24, 0.5, -0.05], [0.8, 0.7, 0.95]);
    E(h.base, [0.3, 0.88, 0.2], [0.7, 0.34, 0.7], [0, 0, -0.2]);
    fringe(h, -1, 0.66);
    back(h.base, [[0.03, 0.09, 0.098, -0.01], [-0.06, 0.088, 0.09, -0.03], [-0.16, 0.086, 0.07, -0.05], [-0.3, 0.09, 0.05, -0.07]], 80, 0.022, 6, 0.04, 0.025);
    lock(h.base, [0.1, -0.02, 0.0], [0.112, -0.38, 0.09], 0.045, 0.036, 0.9, 0.008, 2);
    h.topY = 0.16;
    h.hairR = 1.14;
  },
  // 18 Clip Waves — long waves pinned with hair clips
  (h) => {
    capN(h.base, 1.03);
    curtains(h, 0.66);
    back(h.base, [[0.03, 0.094, 0.098, -0.01], [-0.06, 0.09, 0.09, -0.03], [-0.16, 0.088, 0.07, -0.062], [-0.3, 0.1, 0.05, -0.09], [-0.46, 0.108, 0.04, -0.1]], 108, 0.026, 7, 0.06, 0.03);
    for (const s of [-1, 1]) {
      lock(h.base, [s * 0.1, -0.02, 0.0], [s * 0.106, -0.33, 0.085], 0.034, 0.03, 0.8, 0.006, 2);
      lock(h.base, [s * 0.098, 0.0, -0.045], [s * 0.104, -0.4, -0.06], 0.04, 0.03, 1.1, 0.0, 1);
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
    back(h.base, [[0.03, 0.095, 0.098, -0.01], [-0.05, 0.094, 0.092, -0.022], [-0.11, 0.1, 0.086, -0.03], [-0.165, 0.106, 0.082, -0.032]], 126, 0.024, 10, 0.05, 0.012);
    bluntBangs(h);
    for (const s of [-1, 1]) sideLock(h.base, s, 80, 18, [0.1, -0.15, 0.025], 0.028);
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
    scalp(h.dark, 1.03, { f: 34, t: 30, e: 12, n: -24 });
    scalp(h.base, 1.075, { f: 27, t: 46, e: 56, n: 44 });
    E(h.base, [0, 0.56, -0.08], [0.88, 0.5, 0.9]);
    E(h.base, [0, 0.82, 0.1], [0.74, 0.32, 0.72]);
    for (const [x, z] of [[-0.5, 0.0], [-0.2, 0.3], [0.3, 0.1], [0.5, -0.2], [0.0, -0.4], [-0.35, -0.35]]) SP(h.base, [x, 1.0, z], [x * 0.4, 1, z * 0.4], 0.05, 0.026);
    fringe(h, -1, 0.68);
    h.topY = 0.17;
    h.hairR = 1.12;
  },
  // 23 Side Braid — one thick braid over the shoulder
  (h) => {
    capN(h.base, 1.02);
    fringe(h, 1, 0.68);
    back(h.base, [[0.03, 0.094, 0.098, -0.01], [-0.06, 0.088, 0.088, -0.028], [-0.14, 0.082, 0.066, -0.05], [-0.2, 0.075, 0.05, -0.06]], 100, 0.022, 7, 0.04, 0.012);
    braid(h.base, [-0.085, -0.03, 0.012], [-0.125, -0.46, 0.125], 0.034, 12);
    h.accent.e([-0.126, -0.47, 0.127], [0.036, 0.03, 0.036]);
    lock(h.base, [0.1, -0.02, 0.0], [0.106, -0.3, 0.05], 0.034, 0.03, 0.8, 0.006, 2);
    h.topY = 0.15;
    h.hairR = 1.12;
  },
  // 24 Sleek Long — waist-length straight, center part
  (h) => {
    capN(h.base, 1.02, 0.08);
    curtains(h, 0.74);
    back(h.base, [[0.03, 0.094, 0.098, -0.01], [-0.06, 0.09, 0.09, -0.03], [-0.16, 0.088, 0.07, -0.062], [-0.34, 0.098, 0.05, -0.09], [-0.62, 0.108, 0.04, -0.1]], 104, 0.022, 5, 0.025, 0.03);
    for (const s of [-1, 1]) {
      lock(h.base, [0.094 * s, -0.01, -0.02], [0.108 * s, -0.5, 0.01], 0.034, 0.02, 1.0, 0, 1);
      lock(h.base, [0.088 * s, -0.02, 0.04], [0.112 * s, -0.36, 0.125], 0.026, 0.016, 0.7, 0, 1);
    }
    h.topY = 0.15;
    h.hairR = 1.14;
  },
  // 25 Fauxhawk — shaved sides, a spiky ridge down the middle
  (h) => {
    scalp(h.dark, 1.03, { f: 34, t: 30, e: 12, n: -24 });
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
