// Geometry "baking" for the building module.
//
// Every house piece / decoration is described as a handful of small primitives
// (boxes, cylinders, balls...). A Baker transforms those primitives and writes
// them - with the colour stored per vertex - into a few merged geometries (one
// per material "fin"). A whole town is therefore a few dozen draw calls, and
// recolouring a piece is just "bake it again". Pattern fins (brick, wood
// planks, marble...) get world-space UVs so patterns run on unbroken across
// neighbouring pieces.
import * as THREE from 'three';
import { FINS, MAPPED, NO_SHADOW, finMat, type Fin } from './mats';

export { ghostify, tickBuildMaterials, type Fin } from './mats';
export type Baked = Partial<Record<Fin, THREE.BufferGeometry>>;

// ── Colour helpers (sRGB '#rrggbb' strings) ─────────────────────────────────
function hex2rgb(h: string): [number, number, number] {
  let s = h.startsWith('#') ? h.slice(1) : h;
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hx = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');

const mixCache = new Map<string, string>();
export function mix(a: string, b: string, t: number): string {
  const key = `${a}|${b}|${t}`;
  let r = mixCache.get(key);
  if (!r) {
    const A = hex2rgb(a), B = hex2rgb(b);
    r = '#' + hx(A[0] + (B[0] - A[0]) * t) + hx(A[1] + (B[1] - A[1]) * t) + hx(A[2] + (B[2] - A[2]) * t);
    mixCache.set(key, r);
  }
  return r;
}
export const lighten = (c: string, t: number): string => mix(c, '#ffffff', t);
/** Darken toward a cool charcoal (keeps colours rich instead of going muddy). */
export const darken = (c: string, t: number): string => mix(c, '#14131a', t);

const colorCache = new Map<string, THREE.Color>();
function colorOf(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

// ── Primitives (cached, shared) ─────────────────────────────────────────────
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const f3 = (n: number) => n.toFixed(3);

/**
 * Soft-edged box with a *smooth* rounded bevel: only 108 triangles, but the
 * normals follow the bevel arc so it shades like a real chamfered edge.
 */
export function bevelBox(w: number, h: number, d: number, r = 0.03): THREE.BufferGeometry {
  r = Math.max(0.002, Math.min(r, Math.min(w, h, d) * 0.49));
  return cached(`bb|${f3(w)}|${f3(h)}|${f3(d)}|${f3(r)}`, () => {
    const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    const inner = new THREE.Vector3();
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // the box's inner segment lines move onto the bevel boundaries
      if (Math.abs(v.x) < w / 3) v.x = Math.sign(v.x) * hw;
      if (Math.abs(v.y) < h / 3) v.y = Math.sign(v.y) * hh;
      if (Math.abs(v.z) < d / 3) v.z = Math.sign(v.z) * hd;
      inner.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
      n.copy(v).sub(inner);
      if (n.lengthSq() > 1e-12) {
        n.normalize();
        v.copy(inner).addScaledVector(n, r);
        nor.setXYZ(i, n.x, n.y, n.z);
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.deleteAttribute('uv');
    return g;
  });
}

/** Plain sharp box (12 triangles). */
export function boxG(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`bx|${f3(w)}|${f3(h)}|${f3(d)}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    return g;
  });
}
export function cylG(rt: number, rb: number, h: number, seg = 14): THREE.BufferGeometry {
  return cached(`cy|${f3(rt)}|${f3(rb)}|${f3(h)}|${seg}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
    g.deleteAttribute('uv');
    return g;
  });
}
export function ballG(low = false): THREE.BufferGeometry {
  return cached(low ? 'ballLow' : 'ball', () => {
    const g = low ? new THREE.SphereGeometry(1, 8, 6) : new THREE.SphereGeometry(1, 14, 10);
    g.deleteAttribute('uv');
    return g;
  });
}
export function torusG(R: number, r: number, seg = 24, tube = 8): THREE.BufferGeometry {
  return cached(`to|${f3(R)}|${f3(r)}|${seg}|${tube}`, () => {
    const g = new THREE.TorusGeometry(R, r, tube, seg);
    g.deleteAttribute('uv');
    return g;
  });
}
/** Lathe (revolve) a [radius, y] profile around the y axis: pots, shades, bowls... */
export function latheG(pts: number[][], seg = 18): THREE.BufferGeometry {
  return cached(`la|${seg}|${pts.map((p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(';')}`, () => {
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
    g.deleteAttribute('uv');
    return g;
  });
}

/** Convex prism from a counter-clockwise (u, y) profile extruded along t0..t1. Flat-shaded. */
export function prismG(profile: [number, number][], t0: number, t1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const cu = profile.reduce((s, p) => s + p[0], 0) / profile.length;
  const cy = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  const ct = (t0 + t1) / 2;
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), mid = new THREE.Vector3();
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    e1.subVectors(q, p);
    e2.subVectors(r, p);
    nn.crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-14) return;
    mid.set((p.x + q.x + r.x) / 3 - cu, (p.y + q.y + r.y) / 3 - cy, (p.z + q.z + r.z) / 3 - ct);
    if (nn.dot(mid) < 0) {
      const t = q;
      q = r;
      r = t;
      nn.negate();
    }
    nn.normalize();
    for (const v of [p, q, r]) {
      pos.push(v.x, v.y, v.z);
      nor.push(nn.x, nn.y, nn.z);
    }
  };
  const P = (i: number, t: number) => new THREE.Vector3(profile[i][0], profile[i][1], t);
  for (let i = 1; i < profile.length - 1; i++) {
    tri(P(0, t0), P(i, t0), P(i + 1, t0));
    tri(P(0, t1), P(i, t1), P(i + 1, t1));
  }
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    tri(P(i, t0), P(j, t0), P(j, t1));
    tri(P(i, t0), P(j, t1), P(i, t1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// ── Matrix helper ───────────────────────────────────────────────────────────
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** translate(x,y,z) . rotate(YXZ: ry, rx, rz) . scale(sx,sy,sz) */
export function M(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ── Baker ───────────────────────────────────────────────────────────────────
interface Acc { pos: number[]; nor: number[]; col: number[]; uv: number[]; idx: number[]; n: number }
const newAcc = (): Acc => ({ pos: [], nor: [], col: [], uv: [], idx: [], n: 0 });

export class Baker {
  /** Prefix transform applied to everything added (e.g. "this piece, in this house"). */
  readonly base = new THREE.Matrix4();
  /** Maps the baker's frame to the frame pattern UVs are measured in (plot-local/world). */
  readonly uvBase = new THREE.Matrix4();
  /** Fine detail (books, knobs...) on? Turned off when baking many houses at once. */
  fine = true;
  private acc: Record<string, Acc> = {};
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private um = new THREE.Matrix3();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private w = new THREE.Vector3();

  private accFor(f: Fin): Acc {
    return (this.acc[f] ??= newAcc());
  }

  add(geo: THREE.BufferGeometry, local: THREE.Matrix4 | null, color: string, fin: Fin = 'paint', uvSwap = false): void {
    const m = local ? this.m.multiplyMatrices(this.base, local) : this.m.copy(this.base);
    const a = this.accFor(fin);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    this.nm.getNormalMatrix(m);
    const c = colorOf(fin === 'glow' ? lighten(color, 0.18) : color);
    const flip = m.determinant() < 0; // mirrored transforms turn triangles inside-out
    const mapped = MAPPED[fin];
    if (mapped) this.um.setFromMatrix4(this.uvBase);
    const v = this.v, n = this.n, w = this.w;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      a.pos.push(v.x, v.y, v.z);
      n.fromBufferAttribute(nor, i).applyMatrix3(this.nm).normalize();
      a.nor.push(n.x, n.y, n.z);
      a.col.push(c.r, c.g, c.b);
      if (mapped) {
        w.copy(v).applyMatrix4(this.uvBase);
        n.applyMatrix3(this.um);
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        let u: number, t: number;
        if (ax >= ay && ax >= az) { u = w.z; t = w.y; }
        else if (az >= ay) { u = w.x; t = w.y; }
        else { u = w.x; t = w.z; }
        if (uvSwap) { const s = u; u = t; t = s; }
        a.uv.push(u / mapped.scale, t / mapped.scale);
      }
    }
    const index = geo.getIndex();
    const o = a.n;
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const i0 = index.getX(i), i1 = index.getX(i + 1), i2 = index.getX(i + 2);
        if (flip) a.idx.push(o + i0, o + i2, o + i1);
        else a.idx.push(o + i0, o + i1, o + i2);
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        if (flip) a.idx.push(o + i, o + i + 2, o + i + 1);
        else a.idx.push(o + i, o + i + 1, o + i + 2);
      }
    }
    a.n += pos.count;
  }

  /** Index count written so far per fin (lets a caller attribute triangle ranges to the piece it just drew). */
  mark(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of FINS) {
      const a = this.acc[f];
      if (a) out[f] = a.idx.length;
    }
    return out;
  }

  bake(): Baked {
    const out: Baked = {};
    for (const f of FINS) {
      const a = this.acc[f];
      if (!a || !a.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
      if (a.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      g.setIndex(a.idx);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out[f] = g;
    }
    return out;
  }
}

/** Put baked geometry into meshes (one per fin) inside `into`. */
export function bakedToGroup(baked: Baked, into: THREE.Group = new THREE.Group()): THREE.Group {
  for (const f of FINS) {
    const g = baked[f];
    if (!g) continue;
    const m = new THREE.Mesh(g, finMat(f));
    m.userData.fin = f;
    m.castShadow = !NO_SHADOW.has(f);
    m.receiveShadow = f !== 'glow' && f !== 'rgb';
    into.add(m);
  }
  return into;
}

/** Free the GPU geometry of every baked mesh below `root`. */
export function disposeBaked(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.fin) m.geometry.dispose();
  });
}

// ── Brush: friendly drawing API on top of a Baker ───────────────────────────
// All positions are the CENTER of the primitive unless noted. Rotations are radians.
export class Brush {
  constructor(readonly b: Baker) {}
  get fine(): boolean { return this.b.fine; }

  /** Rounded box. */
  rbox(x: number, y: number, z: number, w: number, h: number, d: number, color: string, r = 0.03, fin: Fin = 'paint', ry = 0, rx = 0, rz = 0): void {
    this.b.add(bevelBox(w, h, d, r), M(x, y, z, 1, 1, 1, ry, rx, rz), color, fin);
  }
  /** Sharp box. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, fin: Fin = 'paint', ry = 0, rx = 0, rz = 0): void {
    this.b.add(boxG(w, h, d), M(x, y, z, 1, 1, 1, ry, rx, rz), color, fin);
  }
  /** Box from min corner to max corner (handy for furniture); r > 0 rounds it. */
  blk(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, fin: Fin = 'paint', r = 0): void {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = r > 0 ? bevelBox(w, h, d, r) : boxG(w, h, d);
    this.b.add(g, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color, fin);
  }
  /** Cylinder / truncated cone along y (rotate with rx/rz/ry). */
  cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, color: string, fin: Fin = 'paint', seg = 14, rx = 0, rz = 0, ry = 0): void {
    this.b.add(cylG(rt, rb, h, seg), M(x, y, z, 1, 1, 1, ry, rx, rz), color, fin);
  }
  /** Thin cylinder with arbitrary length (scaled along its own axis). */
  rod(x: number, y: number, z: number, r: number, len: number, color: string, fin: Fin = 'paint', seg = 8, rx = 0, rz = 0, ry = 0): void {
    this.b.add(cylG(r, r, 1, seg), M(x, y, z, 1, len, 1, ry, rx, rz), color, fin);
  }
  /** Thin rod from point a to point b. */
  rodBetween(a: [number, number, number], b: [number, number, number], r: number, color: string, fin: Fin = 'paint', seg = 6): void {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-5) return;
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
      q,
      new THREE.Vector3(1, len, 1),
    );
    this.b.add(cylG(r, r, 1, seg), mat, color, fin);
  }
  /** Ball / ellipsoid. */
  ball(x: number, y: number, z: number, r: number, color: string, fin: Fin = 'paint', sx = 1, sy = 1, sz = 1): void {
    this.b.add(ballG(r < 0.08), M(x, y, z, r * sx, r * sy, r * sz), color, fin);
  }
  /** Low-poly ellipsoid (foliage clusters): 8x6 segments, forced. */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, fin: Fin = 'paint', rotY = 0, rotX = 0, rotZ = 0): void {
    this.b.add(ballG(true), M(x, y, z, rx, ry, rz, rotY, rotX, rotZ), color, fin);
  }
  /** Ellipsoid with radii (rx, ry, rz) and optional rotations. */
  ell(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, fin: Fin = 'paint', rotY = 0, rotX = 0, rotZ = 0): void {
    this.b.add(ballG(Math.max(rx, ry, rz) < 0.08), M(x, y, z, rx, ry, rz, rotY, rotX, rotZ), color, fin);
  }
  torus(x: number, y: number, z: number, R: number, r: number, color: string, fin: Fin = 'paint', rx = Math.PI / 2, seg = 24): void {
    this.b.add(torusG(R, r, seg, 8), M(x, y, z, 1, 1, 1, 0, rx, 0), color, fin);
  }
  /** Revolve a [radius, y] profile (y is local, relative to the given base y). */
  lathe(x: number, y: number, z: number, pts: number[][], color: string, fin: Fin = 'paint', seg = 18): void {
    this.b.add(latheG(pts, seg), M(x, y, z), color, fin);
  }
}
