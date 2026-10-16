// Shared helpers for the v3 wardrobe builders (wardrobeTops / Bottoms / Shoes / Acc and the
// hair styles in characterHair.ts). Pure geometry: no scene or DOM access. Everything here is
// built relative to characterKit's body helpers (bodyR / shell / facePoint / torsoSpace), so the
// parts follow whatever proportions the character agent tunes.
import * as THREE from 'three';
import { roundedBox as roundedBoxFull } from './materials';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { B, D2R, TAU, bodyR, facePoint, torus, tubeGeo, GB, type PB, type V3t } from './characterKit';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Low-poly rounded box (one bevel segment). The returned geometry is fresh: pass `owned`. */
export const rbox = (w: number, h: number, d: number, r = 0.02): THREE.BufferGeometry => roundedBoxFull(w, h, d, r, 1);
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
export function lathe(gb: GB, pts: [number, number][], seg = 16): void {
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
    gb.e([Math.sin(a) * R, y, Math.cos(a) * R * zScale], size, [tilt * Math.cos(a), 0, tilt * Math.sin(a)]);
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
export const cap = (gb: GB, r: number, y = 0.0): void => void gb.e([0, y - 0.006, 0], [r * 0.96, r * 0.9, r * 0.96]);
/** Upper-arm tube (arm space; shoulder at the origin). */
export function upperArm(gb: GB, len: number, r0: number, r1: number, seg = 12): void {
  tube(gb, 0.0, -len, r0, r1, seg);
  cap(gb, r0, -0.002);
}
/** Forearm tube (arm space; elbow at the origin). */
export function foreArm(gb: GB, len: number, r0: number, r1: number, seg = 12): void {
  tube(gb, 0.03, -len, r0, r1, seg);
}
/** Joint balls so the tube rims hide when the hip / knee bends. */
export function legJoint(gb: GB, thigh: boolean, r: number): void {
  if (thigh) gb.e([0, 0, 0], [Math.min(r, 0.09), Math.min(r, 0.09) * 0.95, Math.min(r, 0.09)]);
  else gb.e([0, 0, 0], [r, r * 0.9, r]);
}

/** Fabric between the thighs so the skin torso never shows at the crotch. */
export const crotch = (gb: GB, k = 1): void => void gb.e([0, 0.83, 0], [0.13 * k, 0.075 * k, 0.13 * k]);
/** Trouser leg tube (hangs from yT to yB) plus the joint ball that hides the rim when the hip / knee bends. */
export function legTube(gb: GB, thigh: boolean, yT: number, yB: number, rT: number, rB: number): void {
  if (thigh && yT > 0 && rT > 0.09) {
    gb.add(new THREE.LatheGeometry([new THREE.Vector2(rB, yB), new THREE.Vector2(rT, -0.12), new THREE.Vector2(0.09, yT)], 14), {}, true);
  } else gb.add(tubeGeo(yT, yB, rT, rB, 14), {}, true);
  if (thigh && yT > 0) legJoint(gb, true, rT);
  if (!thigh) legJoint(gb, false, rT);
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
export { torus };

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
