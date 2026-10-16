// ── v3 locker ── Shared builder for the procedural Locker gear (back blings, gliders).
//
// Every piece of gear is authored from a handful of primitives with a *per-vertex colour*,
// then merged into one mesh per finish class (gloss / matte / metal / glow / wing / …).
// A whole back bling is therefore 1–4 draw calls and no per-item materials are created:
// the finish materials below are shared by every item and are never disposed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type GearFinish = 'gloss' | 'matte' | 'metal' | 'glow' | 'glass' | 'wing' | 'sheet';

const mats = new Map<GearFinish, THREE.Material>();
/** Shared materials (vertex-coloured). Do not mutate or dispose. */
export function gearMat(f: GearFinish): THREE.Material {
  let m = mats.get(f);
  if (m) return m;
  switch (f) {
    case 'gloss':
      m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 });
      break;
    case 'matte':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85 });
      break;
    case 'glow':
      m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      break;
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
      break;
    case 'wing':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
      break;
    case 'sheet':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
      break;
  }
  mats.set(f, m);
  return m;
}

// ── unit geometry caches (cloned + transformed per use, so merged results are unique) ──
const unit = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = unit.get(key);
  if (!g) {
    g = make();
    unit.set(key, g);
  }
  return g;
}
const SPH = () => cachedGeo('sph', () => new THREE.SphereGeometry(1, 18, 12));
const SPH_LO = () => cachedGeo('sphLo', () => new THREE.SphereGeometry(1, 10, 7));
const CYL = (seg = 18) => cachedGeo('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1));
const CONE = (seg = 18) => cachedGeo('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg, 1));

/** Rounded box (unit size is applied through scale, so the corner radius is in unit-box fractions). */
function rboxGeo(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const key = `rb${w}|${h}|${d}|${r}`;
  return cachedGeo(key, () => {
    const seg = 3;
    const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      inner.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
      const n = v.clone().sub(inner);
      if (n.lengthSq() > 1e-12) v.copy(inner).add(n.normalize().multiplyScalar(r));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

export interface Xf {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number] | number;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
function xfMatrix(x: Xf): THREE.Matrix4 {
  _e.set(x.r?.[0] ?? 0, x.r?.[1] ?? 0, x.r?.[2] ?? 0, 'XYZ');
  _q.setFromEuler(_e);
  _v.set(x.p?.[0] ?? 0, x.p?.[1] ?? 0, x.p?.[2] ?? 0);
  if (typeof x.s === 'number') _s.setScalar(x.s);
  else _s.set(x.s?.[0] ?? 1, x.s?.[1] ?? 1, x.s?.[2] ?? 1);
  return _m.compose(_v, _q, _s);
}

/** Collects coloured primitives and merges them (one mesh per finish) in `build()`. */
export class GearBuilder {
  readonly group = new THREE.Group();
  private parts = new Map<GearFinish, THREE.BufferGeometry[]>();
  private tmpColor = new THREE.Color();

  /** Add any geometry (cloned, transformed and tinted). `src` is never modified. */
  add(src: THREE.BufferGeometry, color: string, finish: GearFinish, x: Xf = {}): this {
    let g = src.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(xfMatrix(x));
    g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const c = this.tmpColor.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let list = this.parts.get(finish);
    if (!list) this.parts.set(finish, (list = []));
    list.push(g);
    return this;
  }
  /** Sphere / ellipsoid: radii (rx, ry, rz) or one radius. */
  ball(r: number | [number, number, number], color: string, finish: GearFinish, x: Xf = {}, lo = false): this {
    const s: [number, number, number] = typeof r === 'number' ? [r, r, r] : r;
    return this.add(lo ? SPH_LO() : SPH(), color, finish, { ...x, s });
  }
  /** Rounded box w × h × d. */
  box(w: number, h: number, d: number, color: string, finish: GearFinish, x: Xf = {}, r = 0.012): this {
    return this.add(rboxGeo(w, h, d, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), color, finish, x);
  }
  /** Cylinder (radius top, radius bottom, height) along Y. */
  cyl(rt: number, rb: number, h: number, color: string, finish: GearFinish, x: Xf = {}, seg = 18): this {
    // unit cylinder has radius 1 at both ends: build a tapered one from a cone-ish scale only when needed
    if (Math.abs(rt - rb) < 1e-5) return this.add(CYL(seg), color, finish, { ...x, s: [rt, h, rt] });
    return this.add(cachedGeo(`cylT${seg}|${(rt / rb).toFixed(3)}`, () => new THREE.CylinderGeometry(rt / rb, 1, 1, seg, 1)), color, finish, { ...x, s: [rb, h, rb] });
  }
  cone(r: number, h: number, color: string, finish: GearFinish, x: Xf = {}, seg = 18): this {
    return this.add(CONE(seg), color, finish, { ...x, s: [r, h, r] });
  }
  torus(R: number, r: number, color: string, finish: GearFinish, x: Xf = {}, arc = Math.PI * 2): this {
    return this.add(cachedGeo(`tor${(r / R).toFixed(3)}|${arc.toFixed(2)}`, () => new THREE.TorusGeometry(1, r / R, 8, 28, arc)), color, finish, { ...x, s: [R, R, R] });
  }
  /** A thin line / rod / string from point a to point b. */
  line(a: [number, number, number], b: [number, number, number], r: number, color: string, finish: GearFinish = 'matte'): this {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    if (len < 1e-5) return this;
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    return this.add(CYL(6), color, finish, { p: [mid.x, mid.y, mid.z], r: [e.x, e.y, e.z], s: [r, len, r] });
  }
  /** Extruded 2D shape (lies in XY, thickness along Z, centred). */
  shape(sh: THREE.Shape, depth: number, color: string, finish: GearFinish, x: Xf = {}, bevel = 0.006): this {
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    this.add(g, color, finish, x);
    g.dispose();
    return this;
  }
  /** One flat triangle (double sided finishes). */
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], color: string, finish: GearFinish = 'sheet'): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.computeVertexNormals();
    return this.add(g, color, finish);
  }
  /** Merge everything into the group (one mesh per finish) and return it. */
  build(): THREE.Group {
    for (const [finish, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, gearMat(finish));
      m.castShadow = finish !== 'glow' && finish !== 'wing' && finish !== 'glass';
      m.receiveShadow = false;
      m.userData.finish = finish;
      this.group.add(m);
    }
    this.parts.clear();
    return this.group;
  }
}

/** Free the GPU buffers of a gear group (never the shared materials). */
export function disposeGear(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.finish) m.geometry.dispose();
  });
}

/** Closed 2D heart (width ~1, height ~1) for shapes. */
export function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.35, -0.5, -0.12, -0.5, 0.14);
  s.bezierCurveTo(-0.5, 0.36, -0.28, 0.5, -0.1, 0.45);
  s.bezierCurveTo(-0.04, 0.43, 0, 0.38, 0, 0.32);
  s.bezierCurveTo(0, 0.38, 0.04, 0.43, 0.1, 0.45);
  s.bezierCurveTo(0.28, 0.5, 0.5, 0.36, 0.5, 0.14);
  s.bezierCurveTo(0.5, -0.12, 0.15, -0.35, 0, -0.5);
  return s;
}
/** Fat 5-point star (outer radius 0.5). */
export function starShape(points = 5, inner = 0.5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
/** A rounded wing outline: root at the origin, tip along +x. `rise` bends the tip upward. */
export function wingShape(len: number, chord: number, rise = 0.25, sweep = 0.4): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.25, chord * 0.55, len * 0.7, chord * (0.55 + rise), len, chord * (0.35 + rise));
  s.bezierCurveTo(len * 1.02, chord * 0.1, len * (0.9 - sweep * 0.2), -chord * 0.35, len * 0.62, -chord * 0.62);
  s.bezierCurveTo(len * 0.35, -chord * 0.78, len * 0.12, -chord * 0.4, 0, 0);
  return s;
}
