// Geometry "baking" for the building module.
//
// Every house piece / decoration is described as a handful of small primitives
// (rounded boxes, cylinders, balls...). A Baker transforms those primitives and
// writes them — with the colour stored per vertex — into a few big merged
// geometries (one per finish). That keeps a whole town to a handful of draw
// calls, and recolouring a piece is just "bake it again".
import * as THREE from 'three';
import { toyMat } from '../art/materials';

export type Fin = 'gloss' | 'satin' | 'glass' | 'glow';
export type Baked = Partial<Record<Fin, THREE.BufferGeometry>>;
const FINS: Fin[] = ['gloss', 'satin', 'glass', 'glow'];

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
/** Darken toward a warm plum (keeps the pastel feel instead of going grey). */
export const darken = (c: string, t: number): string => mix(c, '#4a3552', t);

const colorCache = new Map<string, THREE.Color>();
function colorOf(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

// ── Shared vertex-colour materials ──────────────────────────────────────────
let mats: Record<Fin, THREE.Material> | null = null;
export function finMat(f: Fin): THREE.Material {
  if (!mats) {
    const gloss = (toyMat('#ffffff', 'gloss') as THREE.MeshPhysicalMaterial).clone();
    gloss.vertexColors = true;
    const satin = (toyMat('#ffffff', 'satin') as THREE.MeshPhysicalMaterial).clone();
    satin.vertexColors = true;
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    mats = { gloss, satin, glass, glow };
  }
  return mats[f];
}

const ghostMats = new Map<string, THREE.Material>();
function ghostMat(f: Fin, ok: boolean): THREE.Material {
  const key = `${f}|${ok}`;
  let m = ghostMats.get(key);
  if (!m) {
    m = finMat(f).clone();
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = f === 'glass' ? 0.3 : 0.62;
    const tint = ok ? '#ffffff' : '#ff6b6b';
    (m as THREE.MeshPhysicalMaterial).color.set(tint);
    if (!ok && (m as THREE.MeshPhysicalMaterial).emissive) {
      (m as THREE.MeshPhysicalMaterial).emissive.set('#ff2d2d');
      (m as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.3;
    }
    ghostMats.set(key, m);
  }
  return m;
}

/** Turn a baked object into a see-through preview (green-ish/normal when ok, red when not). */
export function ghostify(root: THREE.Object3D, ok: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.fin) {
      m.material = ghostMat(m.userData.fin as Fin, ok);
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
}

/** Free the GPU geometry of every baked mesh below `root`. */
export function disposeBaked(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.fin) m.geometry.dispose();
  });
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
 * normals follow the bevel arc so it shades like a pillowy toy block.
 */
export function bevelBox(w: number, h: number, d: number, r = 0.05): THREE.BufferGeometry {
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

/** Plain sharp box (for hidden/flush parts where rounding would only add triangles). */
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
    const g = low ? new THREE.SphereGeometry(1, 8, 6) : new THREE.SphereGeometry(1, 12, 8);
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
  // caps (fan)
  for (let i = 1; i < profile.length - 1; i++) {
    tri(P(0, t0), P(i, t0), P(i + 1, t0));
    tri(P(0, t1), P(i, t1), P(i + 1, t1));
  }
  // sides
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
/** translate(x,y,z) · rotate(YXZ: ry, rx, rz) · scale(sx,sy,sz) */
export function M(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ── Baker ───────────────────────────────────────────────────────────────────
interface Acc { pos: number[]; nor: number[]; col: number[]; idx: number[]; n: number }
const newAcc = (): Acc => ({ pos: [], nor: [], col: [], idx: [], n: 0 });

export class Baker {
  /** Prefix transform applied to everything added (e.g. "this piece, in this house"). */
  readonly base = new THREE.Matrix4();
  private acc: Record<Fin, Acc> = { gloss: newAcc(), satin: newAcc(), glass: newAcc(), glow: newAcc() };
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();

  add(geo: THREE.BufferGeometry, local: THREE.Matrix4 | null, color: string, fin: Fin = 'gloss'): void {
    const m = local ? this.m.multiplyMatrices(this.base, local) : this.m.copy(this.base);
    const a = this.acc[fin];
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    this.nm.getNormalMatrix(m);
    const c = colorOf(fin === 'glow' ? lighten(color, 0.22) : color);
    const flip = m.determinant() < 0; // mirrored transforms turn triangles inside-out
    const v = this.v;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      a.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(this.nm).normalize();
      a.nor.push(v.x, v.y, v.z);
      a.col.push(c.r, c.g, c.b);
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

  bake(): Baked {
    const out: Baked = {};
    for (const f of FINS) {
      const a = this.acc[f];
      if (!a.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
      g.setIndex(a.idx);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out[f] = g;
    }
    return out;
  }
}

/** Put baked geometry into meshes (one per finish) inside `into`. */
export function bakedToGroup(baked: Baked, into: THREE.Group = new THREE.Group()): THREE.Group {
  for (const f of FINS) {
    const g = baked[f];
    if (!g) continue;
    const m = new THREE.Mesh(g, finMat(f));
    m.userData.fin = f;
    m.castShadow = f === 'gloss' || f === 'satin';
    m.receiveShadow = m.castShadow;
    into.add(m);
  }
  return into;
}

// ── Brush: friendly drawing API on top of a Baker ───────────────────────────
// All positions are the CENTER of the primitive. Rotations are radians.
export class Brush {
  constructor(readonly b: Baker) {}

  /** Rounded box. */
  rbox(x: number, y: number, z: number, w: number, h: number, d: number, color: string, r = 0.04, fin: Fin = 'gloss', ry = 0, rx = 0, rz = 0): void {
    this.b.add(bevelBox(w, h, d, r), M(x, y, z, 1, 1, 1, ry, rx, rz), color, fin);
  }
  /** Sharp box. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, fin: Fin = 'gloss', ry = 0, rx = 0, rz = 0): void {
    this.b.add(boxG(w, h, d), M(x, y, z, 1, 1, 1, ry, rx, rz), color, fin);
  }
  /** Cylinder / truncated cone along y (rotate with rx/rz). */
  cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, color: string, fin: Fin = 'gloss', seg = 14, rx = 0, rz = 0, ry = 0): void {
    this.b.add(cylG(rt, rb, h, seg), M(x, y, z, 1, 1, 1, ry, rx, rz), color, fin);
  }
  /** Cylinder with a different length than its cached unit (scaled along its own axis). */
  rod(x: number, y: number, z: number, r: number, len: number, color: string, fin: Fin = 'gloss', seg = 8, rx = 0, rz = 0, ry = 0): void {
    this.b.add(cylG(r, r, 1, seg), M(x, y, z, 1, len, 1, ry, rx, rz), color, fin);
  }
  /** Ball / ellipsoid. */
  ball(x: number, y: number, z: number, r: number, color: string, fin: Fin = 'gloss', sx = 1, sy = 1, sz = 1): void {
    this.b.add(ballG(r < 0.1), M(x, y, z, r * sx, r * sy, r * sz), color, fin);
  }
}
