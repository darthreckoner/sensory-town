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
// Proportions — teen, about 1.75 tall, head ≈ 1/6.5 of the height (feet at y = 0)
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
  headScale: 1.1, // the whole head group (face, hair, hats) is scaled about its center
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
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
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
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = col.r;
        arr[i * 3 + 1] = col.g;
        arr[i * 3 + 2] = col.b;
      }
      c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    this.parts.push(c);
    return this;
  }
  /** Ellipsoid. */
  e(p: V3t, s: V3t | number, r?: V3t, c?: string): this {
    const m = typeof s === 'number' ? s : Math.max(s[0], s[1], s[2]);
    return this.add(m < 0.014 ? sphXs() : m < 0.034 || this.lo ? sphLo() : sph(), { p, s, r, c });
  }
  /** Capsule between two points. */
  seg(a: V3t, b: V3t, rad: number, c?: string): this {
    const A = new THREE.Vector3(...a);
    const Bv = new THREE.Vector3(...b);
    const d = Bv.clone().sub(A);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.normalize());
    const m = A.add(Bv).multiplyScalar(0.5);
    return this.add(capsule(rad, len - 2 * rad), { p: [m.x, m.y, m.z], q, c });
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
/** Lip color: a rosy mix with the skin tone. */
export function lipColor(skin: string): string {
  const c = new THREE.Color(skin);
  const d = lum(skin);
  c.lerp(new THREE.Color(d > 0.4 ? '#c4586c' : '#8e3a4a'), 0.5);
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
const jawX = (y: number) => 1 - 0.34 * Math.pow(Math.max(0, -y), 1.5);
const jawZ = (y: number) => 1 - 0.2 * Math.pow(Math.max(0, -y), 1.3);

export function headGeo(): THREE.BufferGeometry {
  return cached('head', () => {
    const g = new THREE.SphereGeometry(1, 26, 18);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x * B.HX * jawX(y), y * B.HY, z * B.HZ * jawZ(y) + (y < -0.3 ? 0.004 * -y : 0));
    }
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
// Face parts (shared geometry; the Character makes the meshes + materials)
// ═════════════════════════════════════════════════════════════════════════════
export interface FaceKit {
  eye: THREE.BufferGeometry; // vertex-colored, built for the +x eye (mirror with scale.x = -1)
  brow: THREE.BufferGeometry; // built for the +x brow
  nose: THREE.BufferGeometry;
  ear: THREE.BufferGeometry;
  lips: THREE.BufferGeometry;
  lipLow: THREE.BufferGeometry;
  corner: THREE.BufferGeometry;
  mouthIn: THREE.BufferGeometry;
  mouthLine: THREE.BufferGeometry;
}
let faceKit: FaceKit | null = null;
export function getFaceKit(): FaceKit {
  if (faceKit) return faceKit;
  // eye: sclera + iris + pupil + highlight + upper lash line with a little wing
  const eye = new GB(true, true);
  eye.add(sph(), { s: [0.0188, 0.0128, 0.0095], c: '#f1eeeb' });
  eye.add(new THREE.CircleGeometry(0.0102, 12), { p: [0, 0.0012, 0.0094], c: '#4d3023' });
  eye.add(new THREE.CircleGeometry(0.0066, 12), { p: [0, 0.0008, 0.00945], c: '#8d5a36' });
  eye.add(new THREE.CircleGeometry(0.0046, 10), { p: [0, 0.0012, 0.0095], c: '#0d0b12' });
  eye.add(new THREE.CircleGeometry(0.0023, 8), { p: [-0.0032, 0.0058, 0.0097], c: '#ffffff' });
  eye.add(new THREE.CircleGeometry(0.0012, 6), { p: [0.0035, -0.002, 0.0097], c: '#ffffff' });
  const lash = new THREE.TorusGeometry(0.0182, 0.0024, 3, 12, Math.PI * 0.92);
  lash.rotateZ(Math.PI / 2 - Math.PI * 0.46);
  lash.scale(1, 0.74, 1);
  eye.add(lash, { p: [0, -0.0005, 0.0062], c: '#1a1820' }, true);
  eye.add(capsule(0.0022, 0.006), { p: [0.0198, 0.0082, 0.0078], r: [0, 0, -0.9], c: '#1a1820' });
  const brow = new GB(false, true);
  brow.seg([-0.021, -0.0028, 0], [0.0, 0.0035, 0], 0.0036);
  brow.seg([0.0, 0.0035, 0], [0.021, -0.001, 0], 0.0034);
  const nose = new GB(false, true);
  nose.e([0, 0, 0], [0.0085, 0.0135, 0.0105], [0.25, 0, 0]);
  nose.e([-0.0062, -0.0095, -0.0018], 0.0048);
  nose.e([0.0062, -0.0095, -0.0018], 0.0048);
  const lips = new GB(false, true);
  lips.e([0, 0.0032, 0], [0.0155, 0.0046, 0.0055]);
  const lipLow = new GB(false, true);
  lipLow.e([0, -0.0036, 0.0006], [0.0138, 0.0062, 0.0062]);
  const corner = new GB(false, true);
  corner.e([0, 0, 0], [0.0046, 0.0036, 0.0042]);
  const mouthIn = new GB(false, true);
  mouthIn.e([0, 0, 0], [0.0135, 0.0075, 0.004]);
  const mouthLine = new GB(false, true);
  mouthLine.e([0, 0, 0], [0.0165, 0.0013, 0.0045]);
  faceKit = {
    eye: eye.build(),
    brow: brow.build(),
    nose: nose.build(),
    ear: new GB(false, true).e([0, 0, 0], [0.0105, 0.028, 0.019]).build(),
    lips: lips.build(),
    lipLow: lipLow.build(),
    corner: corner.build(),
    mouthIn: mouthIn.build(),
    mouthLine: mouthLine.build(),
  };
  return faceKit;
}

/** Hand: palm + finger block + thumb. Hangs from the wrist (origin at the wrist joint). */
export function handGeo(side: number): THREE.BufferGeometry {
  return cached(`hand|${side}`, () => {
    const b = new GB(false, true);
    b.e([0, -0.04, 0], [0.031, 0.04, 0.0145]); // palm
    b.add(capsule(0.0145, 0.03), { p: [0, -0.098, 0.002], r: [0.18, 0, 0], s: [1.04, 1, 0.62] }); // fingers
    b.add(capsule(0.0093, 0.026), { p: [-side * 0.03, -0.055, 0.012], r: [0.2, 0, -side * 0.5] }); // thumb
    return b.build();
  });
}
