// Shared helpers for the v3 wardrobe builders (wardrobeTops / Bottoms / Shoes / Acc and the
// hair styles in characterHair.ts). Pure geometry: no scene or DOM access. Everything here is
// built relative to characterKit's body helpers (bodyR / shell / facePoint / torsoSpace), so the
// parts follow whatever proportions the character agent tunes.
import * as THREE from 'three';
import { roundedBox as roundedBoxFull } from './materials';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  B, D2R, FOREARM_PROF, SHIN_PROF, TAU, THIGH_PROF, TORSO_TABLE, TY, UPPER_ARM_PROF, bodyR as bodyRBase, cached, facePoint, GB as GBBase, PB, sphXs,
  torsoSpace as torsoSpaceBase, type Piece, type Role, type V3t,
} from './characterKit';
import type { Finish } from './materials';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

// ═════════════════════════════════════════════════════════════════════════════
// v3.2 "de-block" kit: smooth primitives for every wardrobe / hair builder.
// GB (below) is characterKit's builder with higher-resolution ellipsoids, rings, capsules and spikes, and
// `pieces()` makes builders that use it, so every part built through this file gets smooth silhouettes
// without touching each call site. Small details stay low-poly (sizes pick the resolution).
// ═════════════════════════════════════════════════════════════════════════════
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
const f3s = (n: number): string => n.toFixed(3);
const sphMid = (): THREE.BufferGeometry => cached('v32.sphMid', () => new THREE.SphereGeometry(1, 12, 8));
const sphLo2 = (): THREE.BufferGeometry => cached('v32.sphLo', () => new THREE.SphereGeometry(1, 9, 6));
const sphHi = (): THREE.BufferGeometry => cached('v32.sphHi', () => new THREE.SphereGeometry(1, 18, 12));
/** Smooth capsule (12 radial segments, 4 cap rings; 8 radial for thin wires). */
export const capsule = (r: number, len: number): THREE.BufferGeometry =>
  cached(`v32.cap|${f3s(r)}|${f3s(len)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.0005, len), r < 0.007 ? 2 : 3, r < 0.007 ? 6 : 10));
/** Smooth torus (tube 8-10 segments, 26-36 around). */
export const torus = (R: number, r: number, arc = TAU): THREE.BufferGeometry =>
  cached(`v32.tor|${f3s(R)}|${f3s(r)}|${f3s(arc)}`, () => new THREE.TorusGeometry(R, r, r < 0.01 ? 4 : 5, arc < TAU ? 12 : R < 0.08 ? 18 : 24, arc));
/** Rounded cone along +y from 0 to 1 (base radius 0.5), 14 segments. */
export const spike = (): THREE.BufferGeometry =>
  cached('v32.spike', () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = i / 8;
      pts.push(new THREE.Vector2(0.5 * Math.pow(Math.max(0, 1 - y * y), 0.72), y));
    }
    return new THREE.LatheGeometry(pts, 10);
  });

/** A shape-defining ellipsoid at the full smooth resolution. */
export const ell = (gb: GB, p: V3t, s: V3t | number, r?: V3t): void => void gb.e(p, s, r);

export class GB extends GBBase {
  override e(p: V3t, s: V3t | number, r?: V3t, c?: string): this {
    const m = typeof s === 'number' ? s : Math.max(s[0], s[1], s[2]);
    return this.add(m < 0.012 ? sphXs() : m < 0.02 ? sphLo2() : m < 0.06 ? sphMid() : sphHi(), { p, s, r, c });
  }
  override seg(a: V3t, b: V3t, rad: number, c?: string, _hi = false): this {
    void _hi;
    const A = new THREE.Vector3(...a);
    const Bv = new THREE.Vector3(...b);
    const d = Bv.clone().sub(A);
    const len = d.length();
    if (len < 1e-6) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
    const m = A.add(Bv).multiplyScalar(0.5);
    return this.add(capsule(rad, len - 2 * rad), { p: [m.x, m.y, m.z], q, c });
  }
  override ring(y: number, R: number, tube: number, c?: string): this {
    return this.add(torus(R, tube), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], c });
  }
  override ringAt(p: V3t, axis: V3t, R: number, tube: number, c?: string): this {
    const q = new THREE.Quaternion().setFromUnitVectors(_Z, new THREE.Vector3(...axis).normalize());
    return this.add(torus(R, tube), { p, q, c });
  }
  override spk(base: V3t, dir: V3t, len: number, rad: number, c?: string): this {
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, new THREE.Vector3(...dir).normalize());
    return this.add(spike(), { p: base, s: [rad * 2, len, rad * 2], q, c });
  }
}
class SPB extends PB {
  override at(role: Role = 'main', finish?: Finish): GB {
    const self = this as unknown as { m: Map<string, { role: Role; finish?: Finish; gb: GBBase }>; lo: boolean };
    const key = `${role}|${finish ?? ''}`;
    let e = self.m.get(key);
    if (!e) self.m.set(key, (e = { role, finish, gb: new GB(false, self.lo) }));
    return e.gb as GB;
  }
}
const smoothPieceCache = new Map<string, Piece[]>();
/** characterKit's pieces() with smooth builders. Same contract: cached merged geometries tagged by role. */
export function pieces(key: string, fn: (pb: PB) => void, post?: (g: THREE.BufferGeometry) => void, lo = false): Piece[] {
  let p = smoothPieceCache.get(key);
  if (!p) {
    const pb = new SPB(lo);
    fn(pb);
    p = pb.done(post);
    smoothPieceCache.set(key, p);
  }
  return p;
}
/** Open tapered tube (sleeve / leg) with a soft belly: 22+ segments, 7 rings, smooth normals. */
export function tubeGeo(yTop: number, yBot: number, rTop: number, rBot: number, seg = 24): THREE.BufferGeometry {
  const n = 6;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = (rBot + (rTop - rBot) * t) * (1 + 0.035 * Math.sin(Math.PI * t));
    pts.push(new THREE.Vector2(r, yBot + (yTop - yBot) * t));
  }
  return new THREE.LatheGeometry(pts, Math.max(seg, 22));
}
/** Lathe shell hugging the torso between two heights (smooth: 26 segments, 3 cm rings). */
export function shell(gb: GB, y0: number, y1: number, off: number | ((y: number) => number), step = 0.04, seg = 24, closeBottom = false): void {
  const pts: THREE.Vector2[] = [];
  if (closeBottom) pts.push(new THREE.Vector2(0, y0 - 0.004));
  const o = (y: number) => (typeof off === 'number' ? off : off(y));
  // a slight flare at the hem (the cloth falls a little away from the body): long shells only
  const flareHem = y1 - y0 > 0.2 && y0 > 0.8 && !closeBottom;
  for (let y = y0; y < y1 - 1e-6; y += step) {
    const k = flareHem ? Math.max(0, 1 - (y - y0) / 0.07) : 0;
    pts.push(new THREE.Vector2(bodyR(y) + o(y) + 0.009 * k * k, y));
  }
  pts.push(new THREE.Vector2(bodyR(y1) + o(y1), y1));
  gb.add(new THREE.LatheGeometry(pts, seg), {}, true);
}


// ═════════════════════════════════════════════════════════════════════════════
// Body fit (v3.2): the parts were authored against the v3.1 body (waist 1.03, shoulders 1.345, neck 1.43).
// The Fortnite-proportion body has longer legs, a higher waist and a visible neck. Instead of re-tuning
// ~150 builders, every builder keeps authoring in the OLD heights and the kit maps them onto the CURRENT
// body: bodyR(y_old) reads the new profile at the mapped height, torso / body-accessory pieces get a vertical
// warp as their post-process, and sleeves / trouser legs take their radii from the new limb profiles.
// ═════════════════════════════════════════════════════════════════════════════
/** v3.1 landmark heights: pelvis bottom, hip max, waist min, shoulder max, neck base, top. */
const OLD_LM = [0.79, 0.9, 1.03, 1.345, 1.428, 1.5];
let _newLm: number[] | null = null;
function newLandmarks(): number[] {
  const t = TORSO_TABLE;
  const bottom = t[0].y, top = t[t.length - 1].y;
  let hip = t[0];
  for (const e of t) if (e.y < 1.0 && e.r > hip.r) hip = e;
  let waist = { r: 9, y: 1.05 };
  for (const e of t) if (e.y > hip.y + 0.06 && e.y < 1.25 && e.r < waist.r) waist = e;
  let sh = waist;
  for (const e of t) if (e.y > waist.y + 0.12 && e.r > sh.r) sh = e;
  let neck = top;
  for (const e of t) if (e.y > sh.y && e.r < 0.07) { neck = e.y; break; }
  return [bottom, hip.y, waist.y, sh.y, neck, top];
}
/** Old (v3.1) torso height -> the same anatomical spot on the current body. */
export function fitY(y: number): number {
  const N = (_newLm ??= newLandmarks());
  if (y <= OLD_LM[0]) return y + (N[0] - OLD_LM[0]);
  for (let i = 1; i < OLD_LM.length; i++) {
    if (y <= OLD_LM[i]) {
      const k = (y - OLD_LM[i - 1]) / (OLD_LM[i] - OLD_LM[i - 1]);
      return N[i - 1] + (N[i] - N[i - 1]) * k;
    }
  }
  return y + (N[N.length - 1] - OLD_LM[OLD_LM.length - 1]);
}
/** X-radius of the skin torso at an OLD height (the builders' coordinates). */
export const bodyR = (y: number): number => bodyRBase(fitY(y));
/** characterKit's torsoSpace with the vertical fit first: use as the post-process of torso pieces. */
export function torsoSpace(g: THREE.BufferGeometry): void {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, fitY(p.getY(i)));
  torsoSpaceBase(g);
}
const _warped = new WeakSet<THREE.BufferGeometry>();
/** Body-accessory pieces (upper-body space, authored at old heights): fit them to the current body once. */
export function fitBodyPieces(ps: Piece[]): void {
  for (const pc of ps) {
    if (_warped.has(pc.geo)) continue;
    _warped.add(pc.geo);
    const p = pc.geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, fitY(p.getY(i) + TY) - TY);
    pc.geo.computeBoundingSphere();
  }
}

/** Limb radius as a function of y (top joint at 0, hanging down): from a [t, r] profile; above the top it holds the top radius. */
function limbR(prof: [number, number][], len: number): (y: number) => number {
  const pts = new THREE.SplineCurve(prof.map(([t, r]) => new THREE.Vector2(r, -t * len))).getPoints(48);
  return (y: number): number => {
    if (y >= pts[0].y) return pts[0].x;
    for (let i = 1; i < pts.length; i++) {
      if (y >= pts[i].y) {
        const k = (y - pts[i - 1].y) / (pts[i].y - pts[i - 1].y);
        return pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k;
      }
    }
    return pts[pts.length - 1].x;
  };
}
const _arm = { u: null as null | ((y: number) => number), l: null as null | ((y: number) => number), t: null as null | ((y: number) => number), s: null as null | ((y: number) => number) };
export const armRU = (y: number): number => (_arm.u ??= limbR(UPPER_ARM_PROF, B.armUp))(y);
export const armRL = (y: number): number => (_arm.l ??= limbR(FOREARM_PROF, B.armLow))(y);
export const legRT = (y: number): number => (_arm.t ??= limbR(THIGH_PROF, B.thighLen))(y);
export const legRS = (y: number): number => (_arm.s ??= limbR(SHIN_PROF, B.shinLen))(y);
/** Smooth max: cloth takes the larger of the limb + clearance and the style's own radius, with no crease. */
const smax = (a: number, b: number, k = 0.012): number => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
/**
 * Sleeve / trouser tube that follows a limb: radius(y) = smooth-max(limb(y) + clr, spec(y)), where spec runs
 * linearly from rTop (at yT) to rBot (at yB). Lathe, 24 segments, smooth normals.
 */
export function fitTubeSpec(gb: GB, yT: number, yB: number, spec: (y: number) => number, limb: (y: number) => number, clr = 0.004, rows = 7, seg = 20): void {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = yB + ((yT - yB) * i) / rows; // i = 0 is the bottom, so the lathe faces outward
    pts.push(new THREE.Vector2(smax(limb(y) + clr, spec(y)), y));
  }
  gb.add(new THREE.LatheGeometry(pts, seg), {}, true);
}
/** fitTube with a straight spec from rTop (at yT) to rBot (at yB). */
export function fitTube(gb: GB, yT: number, yB: number, rTop: number, rBot: number, limb: (y: number) => number, clr = 0.004, rows = 7, seg = 20): void {
  fitTubeSpec(gb, yT, yB, (y) => rBot + (rTop - rBot) * ((y - yB) / (yT - yB)), limb, clr, rows, seg);
}

// ── lofts: smooth sculpted shapes (shoes, hair locks, strands) ───────────────
/** Superellipse ring in the XY plane at depth z (p = 2 ellipse, 4 = rounded box). `flat` clamps the bottom: y never goes below cy - ry*flat. */
export function ringXY(n: number, cx: number, cy: number, z: number, rx: number, ry: number, p = 2.4, flat = 1): V3t[] {
  const out: V3t[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const x = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
    const y = Math.max(cy - ry * flat, cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / p));
    out.push([x, y, z]);
  }
  return out;
}
/** Loft a skin through rings (all with the same point count, CCW seen from the +advance direction); ends are closed with fans. */
export function loft(gb: GB, rings: V3t[][]): void {
  const n = rings[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of rings) for (const q of r) pos.push(q[0], q[1], q[2]);
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  for (const [ri, flip] of [[0, true], [rings.length - 1, false]] as [number, boolean][]) {
    let cx = 0, cy = 0, cz = 0;
    for (const q of rings[ri]) { cx += q[0]; cy += q[1]; cz += q[2]; }
    const ci = pos.length / 3;
    pos.push(cx / n, cy / n, cz / n);
    for (let i = 0; i < n; i++) {
      const a = ri * n + i, b = ri * n + ((i + 1) % n);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  gb.add(g, {}, true);
}
/**
 * Tapered strand / lock lofted along a curve through `pts`. radius(t) = [half-width, half-depth] at t in 0..1
 * (set the tip radius near 0 for a pointed lock). The cross-section is an ellipse with its width along the sideways axis.
 */
export function strand(gb: GB, pts: V3t[], radius: (t: number) => [number, number], n = 12, samples = 16): void {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const rings: V3t[][] = [];
  const ref = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const P = curve.getPoint(t);
    const T = curve.getTangent(t).normalize();
    let N = new THREE.Vector3().crossVectors(T, Math.abs(T.dot(ref)) > 0.95 ? new THREE.Vector3(1, 0, 0) : ref).normalize();
    if (N.lengthSq() < 1e-6) N = new THREE.Vector3(1, 0, 0);
    const Bn = new THREE.Vector3().crossVectors(T, N).normalize();
    const [rx, rz] = radius(t);
    const ring: V3t[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const c = Math.cos(a) * rx, s = Math.sin(a) * rz;
      ring.push([P.x + N.x * c + Bn.x * s, P.y + N.y * c + Bn.y * s, P.z + N.z * c + Bn.z * s]);
    }
    rings.push(ring);
  }
  loft(gb, rings);
}

/** Low-poly rounded box (one bevel segment). materials.roundedBox is cached, so hand out a fresh copy (safe to pass as `owned`). */
export const rbox = (w: number, h: number, d: number, r = 0.02): THREE.BufferGeometry => roundedBoxFull(w, h, d, r, 2).clone();
/** Add a rounded box at p (optionally rotated). */
export function box(gb: GB, w: number, h: number, d: number, r: number, p: V3t, rot?: V3t): void {
  gb.add(rbox(w, h, d, r), { p, r: rot }, true);
}

export const NECK = 1.43;
export const HIP_TOP = 1.03;
export const PI = Math.PI;

// ── flat shapes (decals) ────────────────────────────────────────────────────
export function starShape(rOut: number, rIn: number, n = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}
export const starGeo = (rOut: number, rIn: number, n = 5): THREE.BufferGeometry => new THREE.ShapeGeometry(starShape(rOut, rIn, n));
/** Heart, about 2s wide and 2s tall, centered. */
export function heartGeo(s: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, -s);
  sh.bezierCurveTo(-s * 0.2, -s * 0.8, -s * 1.05, -s * 0.35, -s * 1.0, s * 0.25);
  sh.bezierCurveTo(-s * 0.95, s * 0.85, -s * 0.2, s * 0.95, 0, s * 0.4);
  sh.bezierCurveTo(s * 0.2, s * 0.95, s * 0.95, s * 0.85, s * 1.0, s * 0.25);
  sh.bezierCurveTo(s * 1.05, -s * 0.35, s * 0.2, -s * 0.8, 0, -s);
  return new THREE.ShapeGeometry(sh, 6);
}
/** Lightning bolt, w wide and h tall, centered. */
export function boltGeo(w: number, h: number): THREE.BufferGeometry {
  const pts: [number, number][] = [[0.15, 1], [-0.55, -0.05], [-0.08, -0.05], [-0.3, -1], [0.6, 0.18], [0.1, 0.18], [0.5, 1]];
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x * w * 0.5, y * h * 0.5) : s.lineTo(x * w * 0.5, y * h * 0.5)));
  return new THREE.ShapeGeometry(s);
}
export const CIRCLE = (r: number, seg = 16): THREE.BufferGeometry => new THREE.CircleGeometry(r, seg);
export const RECT = (w: number, h: number): THREE.BufferGeometry => new THREE.PlaneGeometry(w, h, 3, 1);
export const ELLIPSE = (rx: number, ry: number, seg = 14): THREE.BufferGeometry => {
  const g = new THREE.CircleGeometry(1, seg);
  g.scale(rx, ry, 1);
  return g;
};
/** Leaf: pointed ellipse along +y, length l. */
export function leafGeo(l: number, w: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -l / 2);
  s.quadraticCurveTo(w, 0, 0, l / 2);
  s.quadraticCurveTo(-w, 0, 0, -l / 2);
  return new THREE.ShapeGeometry(s, 5);
}

/** z of the (flattened-later) torso surface at height y and sideways offset x. */
export function zAt(y: number, off: number, x = 0, extra = 0.004): number {
  const R = bodyR(y) + off + extra;
  return Math.sqrt(Math.max(0, R * R - x * x));
}
/** Radius of the shirt surface at y. */
export const front = (y: number, off: number, extra = 0.004): number => bodyR(y) + off + extra;

/** Wrap a flat XY geometry onto the shirt surface (torso space, before the z-flatten). back = true goes on the back. */
export function decal(gb: GB, geo: THREE.BufferGeometry, cy: number, off: number, dx = 0, lift = 0, back = false, rot = 0): void {
  const g = geo.clone();
  if (rot) g.rotateZ(rot);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + dx, y = p.getY(i) + cy;
    const R = bodyR(y) + off + 0.002 + lift;
    const z = Math.sqrt(Math.max(0, R * R - x * x));
    // on the back the shape is mirrored in x, which flips the winding so it faces outward
    p.setXYZ(i, back ? -x : x, y, back ? -z : z);
  }
  g.computeVertexNormals();
  gb.add(g, {}, true);
}

// ── lathes ──────────────────────────────────────────────────────────────────
export function lathe(gb: GB, pts: [number, number][], seg = 24): void {
  gb.add(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), {}, true);
}
/** Open tapered tube (sleeve / leg). */
export function tube(gb: GB, yT: number, yB: number, rT: number, rB: number, seg = 12): void {
  gb.add(tubeGeo(yT, yB, rT, rB, seg), {}, true);
}
/** Scalloped (quilted) profile: bumps along y, radius f(y) + amp * bump. */
export function puffTube(gb: GB, y0: number, y1: number, bumps: number, amp: number, r: (y: number) => number, seg = 16, per = 4): void {
  const pts: [number, number][] = [];
  for (let i = 0; i <= bumps * per; i++) {
    const y = y0 + ((y1 - y0) * i) / (bumps * per);
    const u = (i % per) / per;
    const bump = i === bumps * per ? 0 : amp * Math.pow(Math.sin(Math.PI * u), 0.55);
    pts.push([r(y) + bump, y]);
  }
  lathe(gb, pts, seg);
}
/** Torso shell with `ridges` vertical knit ribs (radius modulated around the circumference). */
export function ribbedShell(gb: GB, y0: number, y1: number, off: number, ridges = 14, amp = 0.0045, step = 0.05): void {
  const pts: THREE.Vector2[] = [];
  for (let y = y0; y < y1 - 1e-6; y += step) pts.push(new THREE.Vector2(bodyR(y) + off, y));
  pts.push(new THREE.Vector2(bodyR(y1) + off, y1));
  const g = new THREE.LatheGeometry(pts, ridges * 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = 1 + (amp / 0.15) * Math.cos(Math.atan2(z, x) * ridges);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  gb.add(g, {}, true);
}
/** Ribbed open tube for sleeves / legs. */
export function ribbedTube(gb: GB, yT: number, yB: number, rT: number, rB: number, ridges = 10, amp = 0.0035): void {
  const rows = 4;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rows; i++) pts.push(new THREE.Vector2(rB + ((rT - rB) * i) / rows, yB + ((yT - yB) * i) / rows));
  const g = new THREE.LatheGeometry(pts, ridges * 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = 1 + (amp / rT) * Math.cos(Math.atan2(z, x) * ridges);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  gb.add(g, {}, true);
}

/** Deterministic pseudo-random in [0,1) from an integer. */
export const rnd = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Fluffy lathe (sherpa / teddy): a dense lathe whose radius is jittered by smooth noise. */
export function fluffLathe(gb: GB, y0: number, y1: number, r: (y: number) => number, amp: number, seed = 1, rows = 14, seg = 30): void {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    pts.push(new THREE.Vector2(r(y), y));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  const p = g.attributes.position;
  const bump = (a: number, y: number) => 0.5 + 0.5 * Math.sin(a * 5 + y * 90 + seed) * Math.sin(a * 3 - y * 70 + seed * 2.3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    const k = (rr + amp * bump(a, y)) / Math.max(rr, 1e-4);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  gb.add(g, {}, true);
}
/** Ring of blobs (fur trim, ruffles, pom fringe) around a horizontal circle. */
export function blobRing(gb: GB, y: number, R: number, n: number, size: V3t | number, tilt = 0, zScale = 1): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    // fluff / ruffle blobs: cheap 9x6 spheres (a ring of 20 stays ~2k triangles)
    gb.add(sphLo2(), { p: [Math.sin(a) * R, y, Math.cos(a) * R * zScale], s: size, r: [tilt * Math.cos(a), 0, tilt * Math.sin(a)] });
  }
}

/**
 * A strap that goes up the front surface at x = ±x, over the shoulder and down the back,
 * hugging the lathe torso (torso space, before the z-flatten).
 */
export function overShoulder(gb: GB, x: number, yFront: number, yBack: number, off: number, rad = 0.012): void {
  const pts: THREE.Vector3[] = [];
  const sx = Math.abs(x);
  const side = (y0: number, sgn: number) => {
    const out: THREE.Vector3[] = [];
    const n = 7;
    let top = y0;
    for (let y = y0; y < 1.43; y += 0.004) {
      if (bodyR(y) + off < sx + 0.004) break;
      top = y;
    }
    for (let i = 0; i <= n; i++) {
      const y = y0 + ((top - y0) * i) / n;
      out.push(new THREE.Vector3(x, y, sgn * zAt(y, off, sx, 0.006)));
    }
    return { out, top };
  };
  const f = side(yFront, 1), b = side(yBack, -1);
  pts.push(...f.out);
  pts.push(new THREE.Vector3(x, Math.max(f.top, b.top) + 0.012, 0));
  pts.push(...b.out.reverse());
  gb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, rad, 5, false), {}, true);
}

// ── sleeves / legs shorthand ────────────────────────────────────────────────
/** Shoulder cap ellipsoid (hides the tube rim at the shoulder). */
export const cap = (gb: GB, r: number, y = 0.0): void => {
  const R = Math.max(r, 0.057); // the deltoid of the current body
  gb.add(sphMid(), { p: [0, y - 0.006, 0], s: [R * 0.96, R * 0.9, R * 0.96] });
};
/** Upper-arm tube (arm space; shoulder at the origin). */
export function upperArm(gb: GB, len: number, r0: number, r1: number, seg = 20): void {
  fitTube(gb, 0.0, -len, r0, r1, armRU, 0.004, 7, seg);
  cap(gb, r0, -0.002);
}
/** Forearm tube (arm space; elbow at the origin). */
export function foreArm(gb: GB, len: number, r0: number, r1: number, seg = 20): void {
  fitTube(gb, 0.03, -len, r0, r1, (y) => (y > 0 ? armRU(-B.armUp) : armRL(y)), 0.004, 7, seg);
}
/** Joint balls so the tube rims hide when the hip / knee bends. */
export function legJoint(gb: GB, thigh: boolean, r: number): void {
  if (thigh) gb.e([0, 0, 0], [Math.min(r, 0.09), Math.min(r, 0.09) * 0.95, Math.min(r, 0.09)]);
  else gb.e([0, 0, 0], [r, r * 0.9, r]);
}

/** Fabric between the thighs so the skin torso never shows at the crotch. */
export const crotch = (gb: GB, k = 1): void => void gb.e([0, 0.83, 0], [0.13 * k, 0.075 * k, 0.13 * k]);
/** Trouser leg tube (hangs from yT to yB) plus the joint ball that hides the rim when the hip / knee bends. */
/** The radius a trouser leg tube has at height y (what legTube draws): use it to lay prints / checks on the cloth. */
export function legSpec(thigh: boolean, yT: number, yB: number, rT: number, rB: number): (y: number) => number {
  const limb = thigh ? legRT : legRS;
  const spec = thigh && yT > 0 && rT > 0.09
    ? (y: number): number => (y > -0.12 ? 0.09 + (rT - 0.09) * ((yT - y) / (yT + 0.12)) : rT + (rB - rT) * ((-0.12 - y) / (-0.12 - yB)))
    : (y: number): number => rB + (rT - rB) * ((y - yB) / (yT - yB));
  return (y: number): number => smax(limb(y) + 0.004, spec(y));
}
export function legTube(gb: GB, thigh: boolean, yT: number, yB: number, rT: number, rB: number): void {
  const limb = thigh ? legRT : legRS;
  if (thigh && yT > 0 && rT > 0.09) {
    // baggy legs start narrow at the hip and widen below: 0.09 -> rT over the first 16 cm, then rT -> rB
    fitTubeSpec(gb, yT, yB, (y) => (y > -0.12 ? 0.09 + (rT - 0.09) * ((yT - y) / (yT + 0.12)) : rT + (rB - rT) * ((-0.12 - y) / (-0.12 - yB))), limb, 0.004, 11, 20);
  } else fitTube(gb, yT, yB, rT, rB, limb, 0.004, 7, 20);
  if (thigh && yT > 0) legJoint(gb, true, rT);
  if (!thigh) legJoint(gb, false, rT);
}
/**
 * Fish-scale surface: a dense lathe whose radius carries rows of overlapping scale bumps (staggered
 * columns). r(y) = base radius; y0..y1 may be any range (torso heights, or negative for limbs).
 */
export function scaleLathe(gb: GB, r: (y: number) => number, y0: number, y1: number, n = 14, rowH = 0.04, amp = 0.006): void {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const rowsV = Math.max(3, Math.round(((hi - lo) / rowH) * 2));
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rowsV; i++) {
    const y = lo + ((hi - lo) * i) / rowsV;
    pts.push(new THREE.Vector2(r(y), y));
  }
  const g = new THREE.LatheGeometry(pts, n * 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const rr = Math.hypot(x, z);
    const jr = Math.floor((y - lo) / rowH);
    let h = 0;
    for (let dj = -1; dj <= 1; dj++) {
      const j = jr + dj;
      const stag = j & 1 ? 0.5 : 0;
      const col = Math.round((a / TAU) * n - stag);
      let da = ((col + stag) / n) * TAU - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const dx = (da * rr) / ((TAU * rr) / n * 0.62);
      const dy = (y - (lo + (j + 0.5) * rowH)) / (rowH * 0.95);
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) h = Math.max(h, Math.pow(1 - d2, 0.4) - j * 0.0);
    }
    const k = (rr + amp * h) / Math.max(rr, 1e-4);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  gb.add(g, {}, true);
}
/**
 * Checker / gingham: flat quads on every other cell of a rows x n grid wrapped around a tube
 * (radius r(y), y from yTop down to yBot). One small geometry, no per-cell meshes.
 */
export function checkTube(gb: GB, yTop: number, yBot: number, r: (y: number) => number, n = 22, cell = 0.026, lift = 0.0015, phase = 0): void {
  const rows = Math.max(1, Math.round((yTop - yBot) / cell));
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  let v = 0;
  for (let j = 0; j < rows; j++) {
    const y0 = yTop - ((yTop - yBot) * j) / rows, y1 = yTop - ((yTop - yBot) * (j + 1)) / rows;
    for (let i = 0; i < n; i++) {
      if (((i + j + phase) & 1) !== 0) continue;
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      for (const [a, y] of [[a0, y0], [a1, y0], [a1, y1], [a0, y1]] as [number, number][]) {
        const R = r(y) + lift;
        pos.push(Math.sin(a) * R, y, Math.cos(a) * R);
        nrm.push(Math.sin(a), 0, Math.cos(a));
        uv.push(0, 0);
      }
      idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
      v += 4;
    }
  }
  if (!v) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  gb.add(g, {}, true);
}
/**
 * Sleeveless tops: the arm's rounded end cap shows as a flat "disc" at the shoulder. A little pad (arm space,
 * upper arm only) covers it: role 'skin' = a smooth bare shoulder, role 'main' = a tiny strap pad in the top's color.
 */
export function shoulderPad(pb: PB, role: 'skin' | 'main' = 'skin', r = 0.052): void {
  pb.at(role).e([0, -0.003, 0], [r, r * 0.97, r]);
}
/** A hood bunched at the back of the neck, with thickness: a rolled collar, a cowl and a drape between the shoulder blades. */
export function hoodCowl(gb: GB, off = 0): void {
  gb.add(torus(0.088 + off * 0.2, 0.036), { p: [0, 1.415, -0.004], r: [Math.PI / 2, 0, 0], s: [1.08, 1, 1] });
  ell(gb, [0, 1.397, -0.078], [0.106, 0.056, 0.072]);
  ell(gb, [0, 1.352, -0.098], [0.088, 0.062, 0.05]);
  for (const s of [-1, 1]) ell(gb, [0.082 * s, 1.402, -0.04], [0.04, 0.04, 0.05]);
}
/** The raised, overlapping front of a jacket: a narrow strip of the torso shell lifted a few mm along the centre front. */
export function placket(gb: GB, y0: number, y1: number, off: number, halfDeg = 12, lift = 0.007): void {
  const pts: THREE.Vector2[] = [];
  for (let y = y0; y < y1 - 1e-6; y += 0.04) pts.push(new THREE.Vector2(bodyR(y) + off + lift, y));
  pts.push(new THREE.Vector2(bodyR(y1) + off + lift, y1));
  const a = halfDeg * D2R;
  gb.add(new THREE.LatheGeometry(pts, 6, -a, 2 * a), {}, true);
}
/** Convenience: get role builders from a PB. */
export interface Roles {
  main: GB;
  trim: GB;
  dark: GB;
  white: GB;
  gold: GB;
}
export function roles(pb: PB): Roles {
  return { main: pb.at('main'), trim: pb.at('trim'), dark: pb.at('dark'), white: pb.at('white'), gold: pb.at('gold') };
}

// ── flat shapes wrapped onto the head (face stickers, masks, paint) ────────────
/** Split long triangle edges until none is longer than maxEdge (so a flat shape can bend onto a curved surface). */
export function subdivide(g: THREE.BufferGeometry, maxEdge: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const p = src.attributes.position;
  const stack: number[][] = [];
  for (let i = 0; i < p.count; i += 3) {
    stack.push([p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1), p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)]);
  }
  const out: number[] = [];
  while (stack.length) {
    const t = stack.pop()!;
    const e = [0, 1, 2].map((k) => {
      const a = k * 3, b = ((k + 1) % 3) * 3;
      return Math.hypot(t[a] - t[b], t[a + 1] - t[b + 1], t[a + 2] - t[b + 2]);
    });
    const m = Math.max(e[0], e[1], e[2]);
    if (m <= maxEdge) {
      out.push(...t);
      continue;
    }
    const k = e.indexOf(m);
    const a = k * 3, b = ((k + 1) % 3) * 3, c = ((k + 2) % 3) * 3;
    const mid = [(t[a] + t[b]) / 2, (t[a + 1] + t[b + 1]) / 2, (t[a + 2] + t[b + 2]) / 2];
    stack.push([t[a], t[a + 1], t[a + 2], mid[0], mid[1], mid[2], t[c], t[c + 1], t[c + 2]]);
    stack.push([mid[0], mid[1], mid[2], t[b], t[b + 1], t[b + 2], t[c], t[c + 1], t[c + 2]]);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return ng;
}
/**
 * Wrap a flat XY shape (meters, centered on the face point (cThetaDeg, cPhiDeg)) onto the head
 * surface, `off` meters above it. Returns an indexed geometry with normals + uvs.
 */
export function wrapHead(g: THREE.BufferGeometry, cThetaDeg: number, cPhiDeg: number, off = 0.003, maxEdge = 0.011): THREE.BufferGeometry {
  const c = facePoint(cThetaDeg, cPhiDeg, 0).p;
  let s = subdivide(g, maxEdge);
  s = mergeVertices(s, 1e-5);
  const p = s.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = c.x + p.getX(i), y = c.y + p.getY(i);
    const sinPhi = Math.max(-0.995, Math.min(0.995, y / B.HY));
    const cosPhi = Math.sqrt(1 - sinPhi * sinPhi);
    const wx = B.HX * (1 - 0.2 * Math.pow(Math.max(0, -sinPhi), 1.5));
    const sinTh = Math.max(-0.995, Math.min(0.995, x / (wx * cosPhi)));
    const q = facePoint(Math.asin(sinTh) / D2R, Math.asin(sinPhi) / D2R, off).p;
    p.setXYZ(i, q.x, q.y, q.z);
  }
  s.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  s.computeVertexNormals();
  return s;
}
