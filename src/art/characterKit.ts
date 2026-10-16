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
// Proportions — Fortnite-style stylized REALISM: about 1.75 tall, head ≈ 1/7.3 of the height, long legs, a visible neck (feet at y = 0)
// ═════════════════════════════════════════════════════════════════════════════
export const B = {
  hipY: 0.94, // hip joints (long legs: hip at ~54% of the height)
  hipX: 0.088,
  thighLen: 0.43,
  shinLen: 0.42, // ankle at 0.09
  upperY: 0.96, // pivot of the upper body (lean / twist / sway)
  shoulderY: 1.388,
  shoulderX: 0.152, // joint to joint 0.30; with the deltoids the shoulders are ~0.42 wide
  armUp: 0.29,
  armLow: 0.255,
  neckY: 1.465, // neck pivot (head turns around it)
  headCY: 1.63, // head center (before the head scale shifts it by HY*(headScale-1)): the chin sits at headCY - HY = 1.505
  HX: 0.092, // head half-width
  HY: 0.125, // half-height
  HZ: 0.105, // half-depth
  headScale: 0.95, // the whole head group (face, hair, hats) is scaled about its chin-side anchor (the chin stays put): head ~0.2375 tall = ~7.3 heads
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
  cached(`capH|${f3(r)}|${f3(len)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 2, 10));
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
/**
 * An anatomical limb: a lathe whose radius follows a smooth spline through `prof` ([t, r] with t = 0 at the
 * top joint and 1 at the bottom joint, r in meters). Rounded caps at both ends (the top one blends into the
 * torso), `zr` squashes the cross-section front-to-back (slightly elliptical limbs), smooth normals.
 */
export function limbProfile(key: string, prof: [number, number][], len: number, zr = 0.92, topCap = 0.62, seg = 20, joint?: { at: number; half: number }): THREE.BufferGeometry {
  return cached(`limbP|${key}|${len}|${zr}|${topCap}|${seg}`, () => {
    const curve = new THREE.SplineCurve(prof.map(([t, r]) => new THREE.Vector2(r, -t * len)));
    const mid = curve.getPoints(11).map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y));
    const r0 = mid[0].x, r1 = mid[mid.length - 1].x;
    const pts: THREE.Vector2[] = [];
    // bottom cap (pole first so the faces point outward), the swelling profile bottom → top, then the top cap
    for (let i = 0; i <= 4; i++) {
      const t = (i / 4) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0005, r1 * Math.sin(t)), -len - r1 * 0.95 * Math.cos(t)));
    }
    for (let i = mid.length - 1; i >= 0; i--) pts.push(mid[i]);
    for (let i = 1; i <= 4; i++) {
      const t = (1 - i / 4) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0005, r0 * Math.sin(t)), r0 * topCap * Math.cos(t)));
    }
    const g = new THREE.LatheGeometry(pts, seg);
    if (zr !== 1) g.scale(1, 1, zr);
    if (joint) {
      // a whole arm / leg is ONE continuous skin: vertices blend from the upper bone to the lower bone around the
      // joint (the 'w2' weight), so there is no seam at the elbow or knee and it bends smoothly
      const p = g.attributes.position;
      const w = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const k = Math.min(1, Math.max(0, (-p.getY(i) - (joint.at - joint.half)) / (2 * joint.half)));
        w[i] = k * k * (3 - 2 * k);
      }
      g.setAttribute('w2', new THREE.BufferAttribute(w, 1));
    }
    return g;
  });
}
export const UPPER_ARM_PROF: [number, number][] = [[0, 0.047], [0.1, 0.055], [0.3, 0.052], [0.52, 0.047], [0.8, 0.041], [1, 0.038]]; // deltoid → biceps → elbow
export const FOREARM_PROF: [number, number][] = [[0, 0.038], [0.16, 0.043], [0.42, 0.04], [0.78, 0.032], [1, 0.028]]; // forearm swell → wrist
export const THIGH_PROF: [number, number][] = [[0, 0.083], [0.12, 0.089], [0.4, 0.079], [0.75, 0.063], [1, 0.054]]; // thigh → knee
export const SHIN_PROF: [number, number][] = [[0, 0.054], [0.22, 0.059], [0.36, 0.058], [0.7, 0.044], [0.92, 0.034], [1, 0.032]]; // calf swell → ankle
// the lower segments' top caps match the upper segments' bottom caps (same radius at the joint), so elbows and knees show no seam while straight
/** The whole arm (shoulder → wrist) as one skin: skin it to the shoulder bone with the elbow as `bone2`. */
export const ARM_PROF: [number, number][] = [[0, 0.047], [0.055, 0.055], [0.16, 0.052], [0.275, 0.047], [0.426, 0.041], [0.532, 0.038], [0.607, 0.043], [0.728, 0.04], [0.897, 0.032], [1, 0.028]];
export const armGeo = () => limbProfile('arm', ARM_PROF, B.armUp + B.armLow, 0.92, 0.62, 22, { at: B.armUp, half: 0.05 });
/** The whole leg (hip → ankle) as one skin: skin it to the hip bone with the knee as `bone2`. */
export const LEG_PROF: [number, number][] = [[0, 0.083], [0.061, 0.089], [0.2, 0.079], [0.379, 0.063], [0.506, 0.054], [0.615, 0.059], [0.684, 0.058], [0.852, 0.044], [0.96, 0.034], [1, 0.032]];
export const legGeo = () => limbProfile('leg', LEG_PROF, B.thighLen + B.shinLen, 0.98, 0.62, 22, { at: B.thighLen, half: 0.075 });
export const upperArmGeo = () => limbProfile('upperArm', UPPER_ARM_PROF, B.armUp, 0.93, 0.62);
export const forearmGeo = () => limbProfile('forearm', FOREARM_PROF, B.armLow, 0.9, 0.95);
export const thighGeo = () => limbProfile('thigh', THIGH_PROF, B.thighLen, 1.0, 0.62);
export const shinGeo = () => limbProfile('shin', SHIN_PROF, B.shinLen, 0.95, 0.95);
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

/** Lip color: the skin tone with a subtle rosy tint (natural, not lipstick). */
export function lipColor(skin: string): string {
  const c = new THREE.Color(skin);
  const d = lum(skin);
  c.lerp(new THREE.Color(d > 0.4 ? '#c25a68' : '#80343f'), 0.46);
  return `#${c.getHexString()}`;
}
/** Mouth-line color: a warm dark brown that still reads on every skin tone. */
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
  [0.0, 0.8], [0.085, 0.806], [0.135, 0.835], [0.165, 0.88], [0.172, 0.93], [0.158, 0.985], [0.132, 1.04], [0.113, 1.09], // pelvis → waist
  [0.122, 1.15], [0.14, 1.215], [0.153, 1.275], [0.16, 1.33], [0.164, 1.368], [0.157, 1.392], [0.138, 1.412], [0.112, 1.43], [0.086, 1.446], [0.064, 1.459], [0.051, 1.474], [0.046, 1.495], [0.0, 1.525], // chest → a straight trapezius slope (~30°) → a slim neck column (r 0.046-0.051, no collarbone bulge)
];
export const TORSO_TABLE: { r: number; y: number }[] = new THREE.SplineCurve(TORSO_PTS.map(([r, y]) => new THREE.Vector2(r, y)))
  .getPoints(160)
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
/**
 * The torso's front-to-back centre shifts with height (a gentle S-curve): the glutes sit a little back, the belly
 * flattens. Shared by the skin torso and `torsoSpace`, so shells and skin move together.
 */
export const torsoZ = (y: number): number => -0.013 * Math.exp(-(((y - 0.9) / 0.085) ** 2));
/** Torso-space post-process: flatten front-to-back, shift for the S-curve, move pivot to the upper-body origin. */
export const torsoSpace = (g: THREE.BufferGeometry): void => {
  g.scale(1, 1, TZ);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + torsoZ(p.getY(i)));
  g.translate(0, -TY, 0);
};

// ═════════════════════════════════════════════════════════════════════════════
// Head: an ellipsoid with a tapered jaw, plus face placement helpers
// ═════════════════════════════════════════════════════════════════════════════
// rounder jaw than the realistic v2 head: a gentle taper, full cheeks
/** The jaw/chin sits forward of the plain ellipsoid (a defined chin in profile): smooth from 0 at y = -0.25 to full at the chin. */
export const chinZ = (y: number): number => {
  const k = Math.min(1, Math.max(0, (-0.25 - y) / 0.7));
  return 0.013 * k * k * (3 - 2 * k);
};
const jawX = (y: number) => 1 - 0.2 * Math.pow(Math.max(0, -y), 1.5);
const jawZ = (y: number) => 1 - 0.14 * Math.pow(Math.max(0, -y), 1.3);

/** Cheek blush: center (theta°, phi°) + falloff radius (degrees on the head sphere) for each makeup level. */
const BLUSH = [
  { theta: 40, phi: -17, r: 25, mul: [1.0, 0.8, 0.84] as V3t }, // default: a hint
  { theta: 39, phi: -15, r: 30, mul: [1.0, 0.62, 0.72] as V3t }, // soft blush makeup
  { theta: 40, phi: -16, r: 27, mul: [1.0, 0.72, 0.78] as V3t }, // light wash
];

/** The head. `blush` picks the cheek blush level (the vertex color multiplies the skin tone). */
export function headGeo(blush = 0): THREE.BufferGeometry {
  const lv = Math.min(BLUSH.length - 1, Math.max(0, blush));
  return cached(lv === 0 ? 'head' : `head|${lv}`, () => {
    const BL = BLUSH[lv];
    const g = new THREE.SphereGeometry(1, 42, 30);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const centers = [-1, 1].map((sd) => {
      const t = BL.theta * sd * D2R, f = BL.phi * D2R;
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
        const k = Math.max(0, 1 - ang / BL.r);
        w = Math.max(w, k * k * (3 - 2 * k));
      }
      col[i * 3] = 1 + (BL.mul[0] - 1) * w;
      col[i * 3 + 1] = 1 + (BL.mul[1] - 1) * w;
      col[i * 3 + 2] = 1 + (BL.mul[2] - 1) * w;
      p.setXYZ(i, x * B.HX * jawX(y), y * B.HY, z * B.HZ * jawZ(y) + chinZ(y));
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
  const p = new THREE.Vector3(wx * k * sx, B.HY * k * sy, wz * k * sz + chinZ(sy)).addScaledVector(n, off);
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
// Stylized "Fortnite-style" face (stylized realism, not semi-real): large almond eyes whose
// glossy iris fills most of the opening, a soft upper lash line (+ a tiny flick), defined
// brows that move, a small sculpted nose wedge (no nostrils), natural subtly tinted lips
// that curve into a smile and open into a toothy D-grin on reactions.
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Eye: placement on the head (theta°, phi°) and the almond opening in eye space (meters):
 * half width A, upper / lower half heights Hu / Hl, `tilt` raises the outer corner.
 */
export const EYE = {
  theta: 24, phi: -1, A: 0.0262, Hu: 0.0192, Hl: 0.0138, tilt: 0.15, az: 0.0085, sink: 0.0042,
  irisR: 0.0156, irisY: 0.0034, // iris radius and its center height (the upper lid covers the top) // iris radius (diameter / opening height = 2 * irisR / (Hu + Hl))
  gazeX: 0.0024, gazeY: 0.0013, // max iris slide inside the eye
};
export const BROW_AT = { theta: 23.5, phi: 16.5 };
export const MOUTH_AT = { phi: -31 };
export const NOSE_AT = { phi: -3 };
/** Mouth: half width of the flat middle and the length of each upturned arm. */
export const SMILE = { mid: 0.0058, arm: 0.0124 };

export interface FaceKit {
  nose: THREE.BufferGeometry;
  ear: THREE.BufferGeometry;
  // half-lips in mouth space ([+x, -x]); the w2 attribute blends them from the mouth bone (0)
  // to the corner bone (1) so they bend into a smile
  upLip: [THREE.BufferGeometry, THREE.BufferGeometry];
  loLip: [THREE.BufferGeometry, THREE.BufferGeometry];
  line: [THREE.BufferGeometry, THREE.BufferGeometry]; // dark mouth line between the lips
  grin: THREE.BufferGeometry; // dark D-shaped mouth interior
  teeth: THREE.BufferGeometry;
  tongue: THREE.BufferGeometry;
}
export const FACE_COL = { sclera: '#fbf7f3', scleraEdge: '#cdbfc4', lash: '#1b1520', irisOuter: '#2b1a14', irisInner: '#8e5c38', pupil: '#0b090f', teeth: '#fbf6ee', tongue: '#e8737f', grin: '#4a1a22' };

/**
 * Smooth tube swept along `path` (a curve in the x–y plane), elliptical cross-section
 * (radius `ry` in-plane, `rz` out of the plane, as functions of t = 0..1 along the path).
 * Both ends are rounded off (`capIn` / `capOut` = fraction of the length that is the cap).
 */
export function loft(path: (t: number) => V3t, ry: (t: number) => number, rz: (t: number) => number, capIn = 0.12, capOut = 0.12, n = 14, radial = 8, w2?: (p: V3t) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const wv: number[] = [];
  const idx: number[] = [];
  const uv: number[] = [];
  const f = (t: number) => (t < capIn ? Math.sqrt(Math.max(0, 1 - ((capIn - t) / capIn) ** 2)) : t > 1 - capOut ? Math.sqrt(Math.max(0, 1 - ((t - (1 - capOut)) / capOut) ** 2)) : 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = path(t);
    const a = path(Math.max(0, t - 0.02)), b = path(Math.min(1, t + 0.02));
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l, ny = tx / l; // in-plane normal
    const k = f(t);
    for (let r = 0; r < radial; r++) {
      const ph = (r / radial) * TAU;
      pos.push(p[0] + Math.cos(ph) * ry(t) * k * nx, p[1] + Math.cos(ph) * ry(t) * k * ny, p[2] + Math.sin(ph) * rz(t) * k);
      uv.push(0, 0);
      if (w2) wv.push(w2([p[0], p[1], p[2]]));
    }
  }
  for (let i = 0; i < n; i++) for (let r = 0; r < radial; r++) {
    const a = i * radial + r, b = i * radial + ((r + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (w2) g.setAttribute('w2', new THREE.Float32BufferAttribute(wv, 1));
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
const GRIN = { w: 0.0172, rise: 0.0056, depth: 0.0245 };
const grinTop = (x: number) => GRIN.rise * (x / GRIN.w) ** 2;
const grinBot = (x: number) => grinTop(x) - GRIN.depth * Math.pow(Math.max(0, 1 - (x / GRIN.w) ** 2), 0.75);

let faceKit: FaceKit | null = null;
export function getFaceKit(): FaceKit {
  if (faceKit) return faceKit;
  // nose: a soft wedge — bridge into a rounded tip, no nostrils (nose frame: y up, z out of the face)
  // a defined nose: a bridge that grows out of the brow line into a rounded tip with soft alar wings (no nostrils)
  const nose = new GB(false, true);
  nose.add(loft((t) => [0, 0.02 - 0.034 * t, 0.002 + 0.0088 * Math.pow(t, 1.2)], (t) => 0.0033 + 0.0042 * t, (t) => 0.0028 + 0.0045 * t, 0.2, 0.4, 12, 10), {}, true);
  nose.e([0, -0.0145, 0.0112], [0.007, 0.0054, 0.0054]);
  for (const sd of [-1, 1]) nose.e([sd * 0.0068, -0.0122, 0.0072], [0.0052, 0.0043, 0.005]);
  // lips: one smooth half-lip per side (mouth space), weighted toward the corner bone with x
  const lipW = (p: V3t) => {
    const k = Math.min(1, Math.max(0, (Math.abs(p[0]) - 0.003) / 0.009));
    return k * k * (3 - 2 * k);
  };
  const halfLip = (upper: boolean, side: number): THREE.BufferGeometry => {
    const ry0 = upper ? 0.0037 : 0.0054, rz0 = upper ? 0.0052 : 0.0064, cy = upper ? 0.003 : -0.0042, cz = upper ? 0.0003 : 0.0006;
    const x0 = -0.0016, x1 = SMILE.mid + SMILE.arm;
    return loft((t) => [side * (x0 + (x1 - x0) * t), cy, cz], (t) => ry0 * (1 - 0.3 * t * t * t), (t) => rz0 * (1 - 0.35 * t * t * t), 0.03, 0.2, 16, 8, lipW);
  };
  const halfLine = (side: number): THREE.BufferGeometry => {
    const x0 = -0.0016, x1 = SMILE.mid + SMILE.arm - 0.0012;
    return loft((t) => [side * (x0 + (x1 - x0) * t), -0.0004, 0.0006], () => 0.0017, () => 0.0017, 0.03, 0.3, 16, 6, lipW);
  };
  const teethH = 0.0042;
  faceKit = {
    nose: nose.build(),
    ear: new GB(false, true).e([0, 0, 0], [0.0105, 0.028, 0.019]).build(),
    upLip: [halfLip(true, 1), halfLip(true, -1)],
    loLip: [halfLip(false, 1), halfLip(false, -1)],
    line: [halfLine(1), halfLine(-1)],
    grin: band(-GRIN.w, GRIN.w, grinTop, grinBot),
    teeth: band(-GRIN.w * 0.97, GRIN.w * 0.97, grinTop, (x) => grinTop(x) - teethH * Math.pow(Math.max(0, 1 - (x / GRIN.w) ** 2), 0.5)),
    tongue: band(-GRIN.w * 0.6, GRIN.w * 0.6, (x) => grinBot(x) + 0.0062 * Math.max(0, 1 - (x / (GRIN.w * 0.6)) ** 2), (x) => grinBot(x) - 0.0002),
  };
  return faceKit;
}

// ═════════════════════════════════════════════════════════════════════════════
// Hands: sculpted, realistic-scale hands (about 1.05x an adult hand): a flattened palm that tapers
// from the wrist, thenar / hypothenar pads, four tapered fingers (three phalanges, a gentle
// swell at each joint) and a three-part thumb, every finger one smooth swept tube.
// Hang from the wrist (origin = wrist joint); the palm faces the body.
// Variants share one skin bucket and are swapped by scaling bones, so a gesture is never claimed
// without being shown: 'relax' (natural curl), 'open' (flat hand for waves), 'grip' (fist around a
// cup / handle) and 'peace' (a real V: index + middle up, ring + pinky folded, thumb across them).
// ═════════════════════════════════════════════════════════════════════════════
export const HAND_S = 1.05; // x a realistic adult hand (the stylized v3 hands were chunky mitts)
export type HandKind = 'relax' | 'open' | 'grip' | 'peace' | 'heart';
export const HAND_KINDS: HandKind[] = ['relax', 'open', 'grip', 'peace', 'heart'];

/**
 * Smooth tube along a 3D Catmull-Rom curve through `pts`: radius `r(t)`, flattened by `flat(t)` along
 * `flatAxis` (e.g. the palm normal), rounded ends (`capIn` / `capOut` = fraction of the length).
 */
export function sweep(pts: V3t[], r: (t: number) => number, flat: number | ((t: number) => number), flatAxis: V3t, capIn = 0.1, capOut = 0.12, n = 14, radial = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const fa = new THREE.Vector3(flatAxis[0], flatAxis[1], flatAxis[2]);
  const Tn = new THREE.Vector3(), A = new THREE.Vector3(), Bv = new THREE.Vector3(), Pt = new THREE.Vector3();
  const cap = (t: number) => (t < capIn ? Math.sqrt(Math.max(0, 1 - ((capIn - t) / capIn) ** 2)) : t > 1 - capOut ? Math.sqrt(Math.max(0, 1 - ((t - (1 - capOut)) / capOut) ** 2)) : 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(t, Pt);
    curve.getTangentAt(t, Tn);
    A.copy(fa).addScaledVector(Tn, -fa.dot(Tn));
    if (A.lengthSq() < 1e-6) A.set(0, 0, 1).addScaledVector(Tn, -Tn.z);
    A.normalize();
    Bv.crossVectors(Tn, A).normalize();
    const k = cap(t) * r(t);
    const fl = typeof flat === 'number' ? flat : flat(t);
    for (let j = 0; j < radial; j++) {
      const ph = (j / radial) * TAU;
      const ca = Math.cos(ph) * k * fl, sb = Math.sin(ph) * k;
      pos.push(Pt.x + A.x * ca + Bv.x * sb, Pt.y + A.y * ca + Bv.y * sb, Pt.z + A.z * ca + Bv.z * sb);
      uv.push(0, 0);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  // the winding depends on the handedness of (tangent, flat axis): make the faces point outward (signed volume > 0)
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const o0 = idx[i] * 3, o1 = idx[i + 1] * 3, o2 = idx[i + 2] * 3;
    vol += pos[o0] * (pos[o1 + 1] * pos[o2 + 2] - pos[o1 + 2] * pos[o2 + 1]) - pos[o0 + 1] * (pos[o1] * pos[o2 + 2] - pos[o1 + 2] * pos[o2]) + pos[o0 + 2] * (pos[o1] * pos[o2 + 1] - pos[o1 + 1] * pos[o2]);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function handGeo(side: number, kind: HandKind = 'relax'): THREE.BufferGeometry {
  return cached(`hand2|${side}|${kind}`, () => {
    const b = new GB(false, true);
    const m = -side; // medial: the palm faces +m on x
    const S = HAND_S;
    const flatAxis: V3t = [m, 0, 0];
    const P = (x: number, y: number, z: number): V3t => [m * x * S, y * S, z * S];
    const unit = (x: number, y: number, z: number): V3t => {
      const v = new THREE.Vector3(x, y, z).normalize();
      return [v.x, v.y, v.z];
    };
    const walk = (p: V3t, d: V3t, len: number): V3t => [p[0] + d[0] * len * S, p[1] + d[1] * len * S, p[2] + d[2] * len * S];
    const dir = (a: number, tilt: number): V3t => unit(m * Math.sin(a), -Math.cos(a), tilt);
    // ── palm: flat, wider at the knuckles, with the wrist end tucked into the forearm ──
    const PY0 = 0.024, PY1 = -0.093; // wrist end (inside the forearm) .. knuckle line
    const palmR = (t: number) => {
      const s01 = Math.min(1, Math.max(0, (0 - (PY0 + (PY1 - PY0) * t)) / -PY1)); // 0 above the wrist, 1 at the knuckles
      return (0.0245 + 0.016 * s01 * s01 * (3 - 2 * s01)) * S;
    };
    const palmFlat = (t: number) => 0.88 - 0.46 * Math.pow(Math.max(0, (t - 0.2) / 0.8), 1.4);
    b.add(sweep([P(0, PY0, 0), P(0, -0.04, 0), P(0, PY1, 0)], palmR, palmFlat, flatAxis, 0.08, 0.14, 16, 12), {}, true);
    // thenar (thumb ball) and hypothenar pads, on the palm side
    const pad = (p: V3t, s: V3t, r?: V3t) => b.add(sph(), { p, s: [s[0] * S, s[1] * S, s[2] * S], r });
    pad(P(0.0085, -0.04, 0.0165), [0.0125, 0.03, 0.0145], [0, 0, m * -0.15]);
    pad(P(0.006, -0.052, -0.02), [0.0095, 0.026, 0.011], [0, 0, m * 0.08]);
    // ── fingers: knuckle line slightly arched (middle finger highest), three phalanges each ──
    const FZ = [0.0275, 0.0095, -0.0088, -0.0255];
    const FY = [-0.0875, -0.0915, -0.0885, -0.0825];
    const R0 = [0.0108, 0.0113, 0.0105, 0.0091];
    const LEN: [number, number, number][] = [[0.037, 0.022, 0.018], [0.041, 0.026, 0.02], [0.038, 0.024, 0.019], [0.03, 0.018, 0.016]];
    const finger = (i: number, c1: number, c2: number, c3: number, tilt: number) => {
      const [l1, l2, l3] = LEN[i];
      const a = P(0.0015, FY[i], FZ[i]);
      const d1 = dir(c1, tilt), d2 = dir(c1 + c2, tilt * 0.7), d3 = dir(c1 + c2 + c3, tilt * 0.45);
      const s0 = walk(a, d1, -0.014);
      const p1 = walk(a, d1, l1), p2 = walk(p1, d2, l2), p3 = walk(p2, d3, l3);
      const tot = 0.014 + l1 + l2 + l3;
      const u1 = (0.014 + l1) / tot, u2 = (0.014 + l1 + l2) / tot;
      const rad = (t: number) => R0[i] * S * (1 - 0.3 * t) * (1 + 0.07 * Math.exp(-(((t - u1) / 0.05) ** 2)) + 0.05 * Math.exp(-(((t - u2) / 0.05) ** 2)));
      b.add(sweep([s0, a, p1, p2, p3], rad, 0.93, flatAxis, 0.08, 0.1, 14, 8), {}, true);
    };
    // ── thumb: metacarpal, proximal, distal ──
    const thumb = (pts: V3t[]) => {
      b.add(sweep(pts, (t) => 0.0148 * S * (1 - 0.3 * t), 0.9, flatAxis, 0.12, 0.1, 14, 8), {}, true);
    };
    const tb = P(0.004, -0.03, 0.0205);
    const thumbPts = (d1: V3t, d2: V3t, d3: V3t, l: [number, number, number] = [0.04, 0.031, 0.026]): V3t[] => {
      const t1 = walk(tb, d1, l[0]), t2 = walk(t1, d2, l[1]), t3 = walk(t2, d3, l[2]);
      return [walk(tb, d1, -0.012), tb, t1, t2, t3];
    };
    if (kind === 'relax') {
      const c1 = [0.32, 0.4, 0.48, 0.56], c2 = [0.5, 0.55, 0.6, 0.62], c3 = [0.3, 0.32, 0.34, 0.36], tl = [0.07, 0.02, -0.03, -0.09];
      for (let i = 0; i < 4; i++) finger(i, c1[i], c2[i], c3[i], tl[i]);
      thumb(thumbPts(unit(m * 0.22, -0.84, 0.5), unit(m * 0.36, -0.78, 0.46), unit(m * 0.52, -0.7, 0.42)));
    } else if (kind === 'open') {
      const tl = [0.2, 0.07, -0.08, -0.22];
      for (let i = 0; i < 4; i++) finger(i, 0.03 + i * 0.01, 0.04 + i * 0.005, 0.03, tl[i]);
      thumb(thumbPts(unit(m * 0.1, -0.5, 0.86), unit(m * 0.12, -0.5, 0.85), unit(m * 0.15, -0.45, 0.88)));
    } else if (kind === 'grip') {
      for (let i = 0; i < 4; i++) finger(i, 1.4 + i * 0.03, 1.45, 0.9, 0.02 * (1.5 - i));
      thumb([P(-0.008, -0.02, 0.016), tb, P(0.026, -0.058, 0.032), P(0.04, -0.078, 0.014), P(0.042, -0.09, -0.006)]);
    } else if (kind === 'heart') {
      // heart hands: fingers together, curving in at the tips; the thumb swings out and down
      // toward the wrist, so two hands read as a heart (fingertips meet on top, thumbs below)
      const c1 = [0.1, 0.12, 0.15, 0.2], c2 = [0.22, 0.24, 0.28, 0.32], c3 = [0.16, 0.18, 0.2, 0.22];
      for (let i = 0; i < 4; i++) finger(i, c1[i], c2[i], c3[i], 0.01 * (1.5 - i));
      thumb(thumbPts(unit(m * 0.05, 0.28, 0.96), unit(m * 0.1, 0.62, 0.78), unit(m * 0.12, 0.7, 0.7), [0.04, 0.03, 0.024]));
    } else {
      // peace: index + middle straight in a V, ring + pinky folded into the palm, thumb across them
      finger(0, 0.03, 0.02, 0.02, 0.4);
      finger(1, 0.03, 0.02, 0.02, -0.26);
      finger(2, 1.4, 1.45, 0.9, -0.05);
      finger(3, 1.45, 1.45, 0.9, -0.05);
      thumb([P(-0.008, -0.02, 0.016), tb, P(0.036, -0.056, 0.012), P(0.05, -0.07, -0.006), P(0.05, -0.08, -0.02)]);
    }
    return b.build();
  });
}
