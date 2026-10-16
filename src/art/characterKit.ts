// Geometry kit for the v2 "teen" character: merge helpers, shared primitives,
// body proportions, torso profile, head + face parts. Pure geometry/materials —
// no scene or DOM access except one lazily-made canvas-free kit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Finish } from './materials';

export type V3t = [number, number, number];
export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ═════════════════════════════════════════════════════════════════════════════
// Proportions — a stylized "toy teen": about 1.8 tall, head ≈ 1/5 of the height (feet at y = 0)
// ═════════════════════════════════════════════════════════════════════════════
export const B = {
  hipY: 0.9, // hip joints
  hipX: 0.085,
  thighLen: 0.4,
  shinLen: 0.41, // ankle at 0.09
  upperY: 0.92, // pivot of the upper body (lean / twist / sway)
  shoulderY: 1.345,
  shoulderX: 0.172,
  armUp: 0.27,
  armLow: 0.245,
  neckY: 1.43, // neck pivot (head turns around it)
  headCY: 1.585, // head center (before the head scale lifts it by HY*(headScale-1))
  HX: 0.092, // head half-width
  HY: 0.125, // half-height
  HZ: 0.105, // half-depth
  headScale: 1.4, // the whole head group (face, hair, hats) is scaled about its chin-side anchor (the chin stays put)
  seatY: 0.82, // pelvis bottom when seated
};
/** Torso is flatter front-to-back than side-to-side. */
export const TZ = 0.7;
/** Torso group pivot height (= upper-body pivot). */
export const TY = B.upperY;

// ═════════════════════════════════════════════════════════════════════════════
// Geometry cache + primitives
// ═════════════════════════════════════════════════════════════════════════════
const geoCache = new Map<string, THREE.BufferGeometry>();
export function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const f3 = (n: number) => n.toFixed(3);

/** Unit spheres: mid and low resolution (scale into ellipsoids). */
export const sph = () => cached('sph', () => new THREE.SphereGeometry(1, 12, 8));
export const sphLo = () => cached('sphLo', () => new THREE.SphereGeometry(1, 9, 6));
export const sphXs = () => cached('sphXs', () => new THREE.SphereGeometry(1, 6, 4));
export const capsule = (r: number, len: number) =>
  cached(`cap|${f3(r)}|${f3(len)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 2, 8));
export const capsuleHi = (r: number, len: number) =>
  cached(`capH|${f3(r)}|${f3(len)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 4, 12));
export const torus = (R: number, r: number, arc = TAU) =>
  cached(`tor|${f3(R)}|${f3(r)}|${f3(arc)}`, () => new THREE.TorusGeometry(R, r, r < 0.012 ? 4 : 6, arc < TAU ? 10 : R < 0.08 ? 14 : 20, arc));
/** Rounded cone along +y from 0 to 1 (base radius 0.5). */
export const spike = () =>
  cached('spike', () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 6; i++) {
      const y = i / 6;
      pts.push(new THREE.Vector2(0.5 * Math.pow(Math.max(0, 1 - y * y), 0.72), y));
    }
    return new THREE.LatheGeometry(pts, 8);
  });

/** Hanging tapered limb: top joint at y = 0, bottom joint at y = -len, rounded ends. */
export function limbGeo(r0: number, r1: number, len: number, seg = 8): THREE.BufferGeometry {
  return cached(`limb|${f3(r0)}|${f3(r1)}|${f3(len)}|${seg}`, () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 3; i++) {
      const t = (i / 3) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r1 * Math.sin(t), -len - r1 * Math.cos(t)));
    }
    for (let i = 0; i <= 3; i++) {
      const t = (1 - i / 3) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r0 * Math.cos(t), r0 * Math.sin(t)));
    }
    return new THREE.LatheGeometry(pts, seg);
  });
}
/** Open tapered tube (sleeve / trouser leg): from yTop (radius rTop) down to yBot (radius rBot). */
export function tubeGeo(yTop: number, yBot: number, rTop: number, rBot: number, seg = 12): THREE.BufferGeometry {
  return new THREE.LatheGeometry([new THREE.Vector2(rBot, yBot), new THREE.Vector2(rTop, yTop)], seg);
}

// ═════════════════════════════════════════════════════════════════════════════
// Merge builder
// ═════════════════════════════════════════════════════════════════════════════
export interface Xf {
  p?: V3t;
  s?: number | V3t;
  r?: V3t;
  q?: THREE.Quaternion;
  c?: string;
  /** keep the geometry's own vertex colors (multiplied by `c`) instead of one flat color */
  vc?: boolean;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Geometry builder: collects transformed copies of primitives and merges them. */
export class GB {
  private parts: THREE.BufferGeometry[] = [];
  private colored: boolean;
  private lo: boolean;
  constructor(colored = false, lo = false) {
    this.colored = colored;
    this.lo = lo;
  }
  add(g: THREE.BufferGeometry, x: Xf = {}, owned = false): this {
    const c = owned ? g : g.clone();
    const keepColor = !!x.vc && !!c.attributes.color;
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(keepColor && k === 'color')) c.deleteAttribute(k);
    if (x.q) _q.copy(x.q);
    else if (x.r) _q.setFromEuler(_e.set(x.r[0], x.r[1], x.r[2]));
    else _q.identity();
    const s = x.s ?? 1;
    if (typeof s === 'number') _s.set(s, s, s);
    else _s.set(s[0], s[1], s[2]);
    _p.set(x.p?.[0] ?? 0, x.p?.[1] ?? 0, x.p?.[2] ?? 0);
    c.applyMatrix4(_m.compose(_p, _q, _s));
    if (this.colored) {
      const col = new THREE.Color(x.c ?? '#ffffff');
      const n = c.attributes.position.count;
      if (keepColor) {
        const ca = c.attributes.color;
        for (let i = 0; i < n; i++) ca.setXYZ(i, ca.getX(i) * col.r, ca.getY(i) * col.g, ca.getZ(i) * col.b);
      } else {
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          arr[i * 3] = col.r;
          arr[i * 3 + 1] = col.g;
          arr[i * 3 + 2] = col.b;
        }
        c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
    }
    this.parts.push(c);
    return this;
  }
  /** Ellipsoid. */
  e(p: V3t, s: V3t | number, r?: V3t, c?: string): this {
    const m = typeof s === 'number' ? s : Math.max(s[0], s[1], s[2]);
    return this.add(m < 0.014 ? sphXs() : m < 0.034 || this.lo ? sphLo() : sph(), { p, s, r, c });
  }
  /** Capsule between two points (`hi` = smoother capsule for big, close-up parts like fingers). */
  seg(a: V3t, b: V3t, rad: number, c?: string, hi = false): this {
    const A = new THREE.Vector3(...a);
    const Bv = new THREE.Vector3(...b);
    const d = Bv.clone().sub(A);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.normalize());
    const m = A.add(Bv).multiplyScalar(0.5);
    return this.add((hi ? capsuleHi : capsule)(rad, len - 2 * rad), { p: [m.x, m.y, m.z], q, c });
  }
  /** Horizontal ring (axis y) at height y. */
  ring(y: number, R: number, tube: number, c?: string): this {
    return this.add(torus(R, tube), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], c });
  }
  /** Ring centered at `p` whose axis points along `axis`. */
  ringAt(p: V3t, axis: V3t, R: number, tube: number, c?: string): this {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize());
    return this.add(torus(R, tube), { p, q, c });
  }
  /** Rounded spike pointing along `dir` from `base`. */
  spk(base: V3t, dir: V3t, len: number, rad: number, c?: string): this {
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, new THREE.Vector3(...dir).normalize());
    return this.add(spike(), { p: base, s: [rad * 2, len, rad * 2], q, c });
  }
  get empty(): boolean {
    return this.parts.length === 0;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

// ── Pieces: a set of geometries, each tagged with a color ROLE ──────────────
export type Role = 'main' | 'trim' | 'dark' | 'white' | 'gold' | 'skin' | 'ink' | 'print' | 'led' | 'pink' | 'cyan' | 'leaf' | 'lens' | 'glass' | 'denim' | 'cream' | 'hair' | 'plaid' | 'wing' | 'diamond';
export interface Piece {
  geo: THREE.BufferGeometry;
  role: Role;
  finish?: Finish;
}
export class PB {
  private m = new Map<string, { role: Role; finish?: Finish; gb: GB }>();
  private lo: boolean;
  constructor(lo = false) {
    this.lo = lo;
  }
  at(role: Role = 'main', finish?: Finish): GB {
    const key = `${role}|${finish ?? ''}`;
    let e = this.m.get(key);
    if (!e) this.m.set(key, (e = { role, finish, gb: new GB(false, this.lo) }));
    return e.gb;
  }
  done(post?: (g: THREE.BufferGeometry) => void): Piece[] {
    const out: Piece[] = [];
    for (const { role, finish, gb } of this.m.values()) {
      if (gb.empty) continue;
      const geo = gb.build();
      post?.(geo);
      out.push({ geo, role, finish });
    }
    return out;
  }
}
const pieceCache = new Map<string, Piece[]>();
export function pieces(key: string, fn: (pb: PB) => void, post?: (g: THREE.BufferGeometry) => void, lo = false): Piece[] {
  let p = pieceCache.get(key);
  if (!p) {
    const pb = new PB(lo);
    fn(pb);
    p = pb.done(post);
    pieceCache.set(key, p);
  }
  return p;
}

// ── colors ──────────────────────────────────────────────────────────────────
/** Lighten (amount > 0) or darken (amount < 0) a hex color. */
export function tint(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#14121c'), Math.min(1, Math.abs(amount)));
  return `#${c.getHexString()}`;
}
/** Perceived brightness 0..1. */
export function lum(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
/** Readable contrast color for prints / logos on `hex`. */
export function contrast(hex: string): string {
  return lum(hex) > 0.45 ? '#1d1b26' : '#ffffff';
}
const _hsl = { h: 0, s: 0, l: 0 };
function hsl(hex: string): { h: number; s: number; l: number } {
  new THREE.Color(hex).getHSL(_hsl); // sRGB-space hue / saturation / lightness
  return { h: _hsl.h, s: _hsl.s, l: _hsl.l };
}
/**
 * How different two colors read side by side: mostly the lightness gap, plus the hue gap
 * when both are colorful. ~0 = the same family, > 0.5 = clearly different.
 */
export function colorGap(a: string, b: string): number {
  const x = hsl(a), y = hsl(b);
  let dh = Math.abs(x.h - y.h);
  dh = Math.min(dh, 1 - dh);
  return 2.2 * Math.abs(x.l - y.l) + 2.4 * dh * Math.min(x.s, y.s) + 0.4 * Math.abs(x.s - y.s);
}
/** Accessories closer than this to the hair color blend into it. */
export const MIN_ACCENT_GAP = 0.5;
/**
 * Pick an accent from `palette` that stands out against `base` (the hair): rank by
 * lightness / hue gap with a bonus for saturated colors, then take the `seed`-th best of
 * the top three so different accessories get different colors.
 */
export function contrastColor(base: string, palette: readonly string[], seed = 0): string {
  const scored = palette
    .map((c) => {
      const h = hsl(c);
      return { c, score: colorGap(base, c) + (h.l > 0.15 && h.l < 0.92 ? 0.6 * h.s : 0) };
    })
    .sort((p, q) => q.score - p.score);
  const top = scored.slice(0, 3);
  return top[((seed % top.length) + top.length) % top.length].c;
}

/** Smile-line color: a warm dark brown that still reads on every skin tone. */
export function mouthColor(skin: string): string {
  const c = new THREE.Color(skin);
  c.lerp(new THREE.Color('#2a0f0e'), 0.74);
  return `#${c.getHexString()}`;
}
/** Skin tone as drawn: nudged warmer (a touch more orange) so the face never goes grey or pale. */
export function warmSkin(skin: string): string {
  const c = new THREE.Color(skin);
  c.lerp(new THREE.Color('#ff9a62'), 0.08);
  return `#${c.getHexString()}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Torso profile + lathe shells
// ═════════════════════════════════════════════════════════════════════════════
const TORSO_PTS: [number, number][] = [
  [0.0, 0.79], [0.085, 0.8], [0.13, 0.84], [0.145, 0.9], [0.14, 0.96], [0.118, 1.03], [0.122, 1.1],
  [0.135, 1.18], [0.146, 1.26], [0.157, 1.32], [0.158, 1.345], [0.14, 1.378], [0.112, 1.404], [0.062, 1.428], [0.048, 1.455], [0.0, 1.5],
];
export const TORSO_TABLE: { r: number; y: number }[] = new THREE.SplineCurve(TORSO_PTS.map(([r, y]) => new THREE.Vector2(r, y)))
  .getPoints(120)
  .map((p) => ({ r: Math.max(0, p.x), y: p.y }));
/** X-radius of the skin torso at height y. */
export function bodyR(y: number): number {
  const t = TORSO_TABLE;
  if (y <= t[0].y) return t[0].r;
  for (let i = 1; i < t.length; i++) {
    if (y <= t[i].y) {
      const k = (y - t[i - 1].y) / Math.max(1e-6, t[i].y - t[i - 1].y);
      return t[i - 1].r + (t[i].r - t[i - 1].r) * k;
    }
  }
  return t[t.length - 1].r;
}
/** Lathe shell hugging the torso between two heights (offset = extra radius, number or f(y)). */
export function shell(gb: GB, y0: number, y1: number, off: number | ((y: number) => number), step = 0.05, seg = 18, closeBottom = false): void {
  const pts: THREE.Vector2[] = [];
  if (closeBottom) pts.push(new THREE.Vector2(0, y0 - 0.004));
  const o = (y: number) => (typeof off === 'number' ? off : off(y));
  for (let y = y0; y < y1 - 1e-6; y += step) pts.push(new THREE.Vector2(bodyR(y) + o(y), y));
  pts.push(new THREE.Vector2(bodyR(y1) + o(y1), y1));
  gb.add(new THREE.LatheGeometry(pts, seg), {}, true);
}
/** Lathe from a smooth custom [r,y] profile (skirts, flares, puffy bands). */
export function flare(gb: GB, pts: [number, number][], samples = 12, seg = 20, pleats = 0): void {
  const sorted = [...pts].sort((a, b) => a[1] - b[1]);
  const c = new THREE.SplineCurve(sorted.map(([r, y]) => new THREE.Vector2(r, y)));
  const g = new THREE.LatheGeometry(c.getPoints(samples), seg);
  if (pleats > 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.045 * Math.cos(a * pleats);
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    g.computeVertexNormals();
  }
  gb.add(g, {}, true);
}
/** Torso-space post-process: flatten front-to-back, move pivot to the upper-body origin. */
export const torsoSpace = (g: THREE.BufferGeometry): void => {
  g.scale(1, 1, TZ);
  g.translate(0, -TY, 0);
};

// ═════════════════════════════════════════════════════════════════════════════
// Head: an ellipsoid with a tapered jaw, plus face placement helpers
// ═════════════════════════════════════════════════════════════════════════════
// rounder jaw than the realistic v2 head: a gentle taper, full cheeks
const jawX = (y: number) => 1 - 0.2 * Math.pow(Math.max(0, -y), 1.5);
const jawZ = (y: number) => 1 - 0.14 * Math.pow(Math.max(0, -y), 1.3);

/** Cheek blush centers (theta°, phi°) and falloff radius (degrees on the head sphere). */
const BLUSH = { theta: 40, phi: -17, r: 25 };
/** Per-channel multiplier of the skin color at full blush (applied through the vertex color). */
const BLUSH_MUL: V3t = [1.0, 0.8, 0.84];

export function headGeo(): THREE.BufferGeometry {
  return cached('head', () => {
    const g = new THREE.SphereGeometry(1, 36, 26);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const centers = [-1, 1].map((sd) => {
      const t = BLUSH.theta * sd * D2R, f = BLUSH.phi * D2R;
      return new THREE.Vector3(Math.sin(t) * Math.cos(f), Math.sin(f), Math.cos(t) * Math.cos(f));
    });
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // blush weight from the angle to each cheek center on the unit sphere (before deforming)
      v.set(x, y, z);
      let w = 0;
      for (const c of centers) {
        const ang = Math.acos(Math.min(1, Math.max(-1, v.dot(c)))) / D2R;
        const k = Math.max(0, 1 - ang / BLUSH.r);
        w = Math.max(w, k * k * (3 - 2 * k));
      }
      col[i * 3] = 1 + (BLUSH_MUL[0] - 1) * w;
      col[i * 3 + 1] = 1 + (BLUSH_MUL[1] - 1) * w;
      col[i * 3 + 2] = 1 + (BLUSH_MUL[2] - 1) * w;
      p.setXYZ(i, x * B.HX * jawX(y), y * B.HY, z * B.HZ * jawZ(y) + (y < -0.3 ? 0.004 * -y : 0));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); // blush: multiplies the skin color
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  });
}

/** Point on the (deformed) head surface in head space. thetaDeg: yaw from +z toward +x; phiDeg: elevation. */
export function facePoint(thetaDeg: number, phiDeg: number, off = 0, k = 1): { p: THREE.Vector3; n: THREE.Vector3 } {
  const t = thetaDeg * D2R, f = phiDeg * D2R;
  const sx = Math.sin(t) * Math.cos(f), sy = Math.sin(f), sz = Math.cos(t) * Math.cos(f);
  const wx = B.HX * jawX(sy), wz = B.HZ * jawZ(sy);
  const n = new THREE.Vector3(sx / wx, sy / B.HY, sz / wz).normalize();
  const p = new THREE.Vector3(wx * k * sx, B.HY * k * sy, wz * k * sz).addScaledVector(n, off);
  return { p, n };
}
/** Orientation with +z along n and +x kept horizontal. */
export function frameQ(n: THREE.Vector3, roll = 0): THREE.Quaternion {
  const z = n.clone().normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  return q;
}
export const arr3 = (v: THREE.Vector3): V3t => [v.x, v.y, v.z];

// ═════════════════════════════════════════════════════════════════════════════
// Face parts (shared geometry; the Character makes the meshes + materials).
// Stylized "toy" face: big glossy eyes whose iris fills the opening (no white above or
// below), thick short brows, a tiny nose bump, a small curved smile line that opens into a
// D-shaped grin when happy. No lips, no nostrils, no lower lashes.
// ═════════════════════════════════════════════════════════════════════════════
/** Eye: placement on the head (theta°, phi°) and the dome's half axes (head space, meters). */
export const EYE = {
  theta: 24.5, phi: -1, ax: 0.0285, ay: 0.027, az: 0.0088, sink: 0.0044,
  gazeX: 0.0022, gazeY: 0.0012, // max iris slide inside the eye (meters)
};
export const BROW_AT = { theta: 24, phi: 18.5 };
export const MOUTH_AT = { phi: -31 };
export const NOSE_PHI = -13;
/** Smile line: half-width of the flat middle and the length of each upturned arm. */
export const SMILE = { mid: 0.0045, arm: 0.0082 };

export interface FaceKit {
  eye: THREE.BufferGeometry; // sclera dome + soft upper lash line, built for the +x eye (mirror with scale.x = -1)
  iris: [THREE.BufferGeometry, THREE.BufferGeometry]; // iris + pupil + catchlights for the [+x, -x] eye (own bone: gaze)
  brow: THREE.BufferGeometry; // built for the +x brow
  nose: THREE.BufferGeometry;
  ear: THREE.BufferGeometry;
  smileMid: THREE.BufferGeometry;
  smileArm: [THREE.BufferGeometry, THREE.BufferGeometry]; // [+x, -x]: pivot at the inner end
  grin: THREE.BufferGeometry; // dark D-shaped mouth interior
  teeth: THREE.BufferGeometry;
  tongue: THREE.BufferGeometry;
}
export const FACE_COL = { sclera: '#fbf7f3', scleraEdge: '#cdbfc4', lash: '#1b1520', irisOuter: '#2b1a14', irisInner: '#8e5c38', pupil: '#0b090f', teeth: '#fbf6ee', tongue: '#e8737f', grin: '#4a1a22' };

/** z of the eye dome at (x, y) in eye space. */
const eyeDome = (x: number, y: number): number => EYE.az * Math.sqrt(Math.max(0, 1 - (x / EYE.ax) ** 2 - (y / EYE.ay) ** 2));

/**
 * Elliptical disc of radii (rx, ry) centered at (cx, cy) in eye space, draped over the eye
 * dome (+ lift) so it hugs the white instead of floating. `shade(r)` gives a per-ring color.
 */
function drapedDisc(rx: number, ry: number, cx: number, cy: number, lift: number, rings: number, seg: number, shade?: (r: number) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const put = (x: number, y: number, r: number) => {
    pos.push(x, y, eyeDome(x, y) + lift);
    uv.push(0, 0);
    const c = shade ? shade(r) : new THREE.Color(1, 1, 1);
    col.push(c.r, c.g, c.b);
  };
  put(cx, cy, 0);
  for (let r = 1; r <= rings; r++) for (let k = 0; k < seg; k++) {
    const a = (k / seg) * TAU, rr = r / rings;
    put(cx + rx * rr * Math.cos(a), cy + ry * rr * Math.sin(a), rr);
  }
  for (let k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + ((k + 1) % seg));
  for (let r = 1; r < rings; r++) for (let k = 0; k < seg; k++) {
    const a = 1 + (r - 1) * seg + k, b = 1 + (r - 1) * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat band between two curves over x ∈ [x0, x1] (facing +z), for the open mouth. */
function band(x0: number, x1: number, top: (x: number) => number, bot: (x: number) => number, cols = 14): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols;
    pos.push(x, top(x), 0, x, bot(x), 0);
    nrm.push(0, 0, 1, 0, 0, 1);
    uv.push(0, 0, 0, 0);
  }
  for (let i = 0; i < cols; i++) {
    const t0 = i * 2, b0 = i * 2 + 1, t1 = i * 2 + 2, b1 = i * 2 + 3;
    idx.push(t0, b0, b1, t0, b1, t1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// open-mouth "D": its top edge follows the upturned smile, the bottom is a deeper curve
const GRIN = { w: 0.0122, rise: 0.0046, depth: 0.0118 };
const grinTop = (x: number) => GRIN.rise * (x / GRIN.w) ** 2;
const grinBot = (x: number) => grinTop(x) - GRIN.depth * Math.pow(Math.max(0, 1 - (x / GRIN.w) ** 2), 0.75);

let faceKit: FaceKit | null = null;
export function getFaceKit(): FaceKit {
  if (faceKit) return faceKit;
  // ── eye: soft-shaded white dome + a thick upper lash line (no wing, no lower lash) ──
  const eye = new GB(true, true);
  const white = new THREE.Color(FACE_COL.sclera), edge = new THREE.Color(FACE_COL.scleraEdge);
  eye.add(drapedDisc(EYE.ax, EYE.ay, 0, 0, 0, 6, 22, (r) => white.clone().lerp(edge, Math.pow(r, 3))), { vc: true }, true);
  const rho = 0.945;
  const arc = Math.PI * 0.84;
  const lash = new THREE.TorusGeometry(rho * EYE.ax, 0.0033, 5, 18, arc);
  lash.rotateZ(Math.PI / 2 - arc / 2);
  lash.scale(1, EYE.ay / EYE.ax, 1);
  const lashZ = EYE.az * Math.sqrt(1 - rho * rho);
  eye.add(lash, { p: [0, 0, lashZ], c: FACE_COL.lash }, true);
  for (const e of [Math.PI / 2 - arc / 2, Math.PI / 2 + arc / 2]) {
    eye.e([rho * EYE.ax * Math.cos(e), rho * EYE.ay * Math.sin(e), lashZ], 0.0033, undefined, FACE_COL.lash);
  }
  // ── iris: two concentric discs (dark top = lid shadow), big pupil, two catchlights ──
  const irisFor = (sg: number): THREE.BufferGeometry => {
    const b = new GB(true, true);
    const ry = EYE.ay * 0.955, rx = EYE.ax * 0.8;
    b.add(drapedDisc(rx, ry, 0, 0, 0.0007, 3, 20), { c: FACE_COL.irisOuter, vc: true }, true);
    b.add(drapedDisc(rx * 0.86, ry * 0.8, 0, -0.0034, 0.0013, 3, 20), { c: FACE_COL.irisInner, vc: true }, true);
    b.add(drapedDisc(rx * 0.5, ry * 0.5, 0, -0.0008, 0.0019, 2, 16), { c: FACE_COL.pupil, vc: true }, true);
    b.add(drapedDisc(0.0034, 0.0034, -0.0086 * sg, 0.0102, 0.0025, 1, 10), { c: '#ffffff', vc: true }, true);
    b.add(drapedDisc(0.0016, 0.0016, 0.0079 * sg, -0.0108, 0.0025, 1, 8), { c: '#ffffff', vc: true }, true);
    return b.build();
  };
  const brow = new GB(false, true);
  brow.seg([-0.0155, -0.0016, 0], [0.0, 0.0034, 0], 0.0052);
  brow.seg([0.0, 0.0034, 0], [0.0165, 0.0004, 0], 0.005);
  // tiny soft nose bump (no nostrils)
  const nose = new GB(false, true);
  nose.e([0, 0, 0], [0.0058, 0.0062, 0.0052]);
  const midG = new GB(false, true).seg([-SMILE.mid, 0, 0], [SMILE.mid, 0, 0], 0.002);
  const armR = new GB(false, true).seg([0, 0, 0], [SMILE.arm, 0, 0], 0.002);
  const armL = new GB(false, true).seg([0, 0, 0], [-SMILE.arm, 0, 0], 0.002);
  const teethH = 0.0038;
  faceKit = {
    eye: eye.build(),
    iris: [irisFor(1), irisFor(-1)],
    brow: brow.build(),
    nose: nose.build(),
    ear: new GB(false, true).e([0, 0, 0], [0.0105, 0.028, 0.019]).build(),
    smileMid: midG.build(),
    smileArm: [armR.build(), armL.build()],
    grin: band(-GRIN.w, GRIN.w, grinTop, grinBot),
    teeth: band(-GRIN.w * 0.97, GRIN.w * 0.97, grinTop, (x) => grinTop(x) - teethH * Math.pow(Math.max(0, 1 - (x / GRIN.w) ** 2), 0.5)),
    tongue: band(-GRIN.w * 0.6, GRIN.w * 0.6, (x) => grinBot(x) + 0.0058 * Math.max(0, 1 - (x / (GRIN.w * 0.6)) ** 2), (x) => grinBot(x) - 0.0002),
  };
  return faceKit;
}

// ═════════════════════════════════════════════════════════════════════════════
// Hands: chunky cartoon hands — a soft rounded palm, three capsule fingers + a thumb
// (Nintendo / Pixar convention), a relaxed curl (~25° at the knuckle, ~15° more at the
// middle joint). Hang from the wrist (origin = wrist joint); the palm faces the body.
// Two variants share one skin bucket: 'relax' and 'peace' (a real V sign), swapped by
// scaling bones, so a pose never claims a gesture the hand doesn't show.
// ═════════════════════════════════════════════════════════════════════════════
export const HAND_S = 1.25; // ~1.3x the old mitten
const HAND_CURL = { knuckle: 25 * D2R, mid: 15 * D2R };

export type HandKind = 'relax' | 'peace';
export function handGeo(side: number, kind: HandKind = 'relax'): THREE.BufferGeometry {
  return cached(`hand|${side}|${kind}`, () => {
    const b = new GB(false, true);
    const m = -side; // medial: the palm faces +m on x
    const S = HAND_S;
    const P = (x: number, y: number, z: number): V3t => [m * x * S, y * S, z * S];
    const unit = (x: number, y: number, z: number): V3t => {
      const v = new THREE.Vector3(x, y, z).normalize();
      return [v.x, v.y, v.z];
    };
    const ptAdd = (p: V3t, d: V3t, len: number): V3t => [p[0] + d[0] * len * S, p[1] + d[1] * len * S, p[2] + d[2] * len * S];
    const dir = (curl: number, tilt: number): V3t => unit(m * Math.sin(curl), -Math.cos(curl), Math.sin(tilt));
    // palm + a soft wrist cap (tucks under the sleeve cuff)
    b.e(P(0, -0.044, 0), [0.0235 * S, 0.038 * S, 0.034 * S]);
    b.e(P(0, -0.014, 0), [0.024 * S, 0.02 * S, 0.026 * S]);
    const finger = (z: number, l1: number, l2: number, r: number, c1: number, c2: number, tilt: number) => {
      const a = P(0.004, -0.07, z);
      const j = ptAdd(a, dir(c1, tilt), l1);
      const t = ptAdd(j, dir(c1 + c2, tilt * 0.6), l2);
      b.seg(a, j, r * S, undefined, true);
      b.seg(j, t, r * 0.92 * S, undefined, true);
    };
    const k1 = HAND_CURL.knuckle, k2 = HAND_CURL.mid;
    if (kind === 'relax') {
      finger(0.0215, 0.027, 0.022, 0.0112, k1, k2, 0.1);
      finger(0.0, 0.03, 0.024, 0.0116, k1 * 1.1, k2 * 1.1, 0);
      finger(-0.0215, 0.025, 0.02, 0.0108, k1 * 1.25, k2 * 1.25, -0.1);
      // thumb: forward and a little down, resting along the palm
      const t0 = P(0.004, -0.03, 0.028);
      const t1 = ptAdd(t0, unit(m * 0.3, -0.55, 0.78), 0.03);
      const t2 = ptAdd(t1, unit(m * 0.5, -0.65, 0.58), 0.022);
      b.seg(t0, t1, 0.0125 * S, undefined, true);
      b.seg(t1, t2, 0.0112 * S, undefined, true);
    } else {
      // peace sign: index + middle straight in a V, the third finger folded into the palm,
      // the thumb tucked across it
      finger(0.0215, 0.031, 0.026, 0.0112, 0.04, 0.02, 0.24);
      finger(0.0, 0.034, 0.028, 0.0116, 0.04, 0.02, -0.17);
      const a = P(0.004, -0.07, -0.0215);
      const j = ptAdd(a, dir(1.25, -0.05), 0.024);
      const t = ptAdd(j, dir(2.55, -0.05), 0.02);
      b.seg(a, j, 0.0108 * S, undefined, true);
      b.seg(j, t, 0.01 * S, undefined, true);
      const t0 = P(0.004, -0.03, 0.028);
      const t1 = P(0.034, -0.054, 0.008);
      const t2 = P(0.036, -0.066, -0.012);
      b.seg(t0, t1, 0.0125 * S, undefined, true);
      b.seg(t1, t2, 0.0112 * S, undefined, true);
    }
    return b.build();
  });
}
