// ── v3 locker ── Shared builder for the procedural Locker gear (back blings, gliders).
//
// Every piece of gear is authored from a handful of primitives with a *per-vertex colour* AND a
// per-vertex surface (roughness, metalness, emissive), then merged. A whole item is therefore at most
// TWO draw calls and no per-item materials exist:
//   · the SOLID mesh   — gloss / matte / metal / glow / sheet finishes share one material that reads the
//                        per-vertex surface, so a clip, a fluffy plush and a chrome bolt can sit in one mesh;
//   · the TRANSLUCENT mesh — glass / wing parts (per-vertex alpha), only if the item has any.
// Animated items put the moving parts on their own `layer(name)` (one extra mesh each), e.g. flapping
// wings: `b.layer('wings')`. Keep items to two meshes in total: the solid body plus ONE moving or
// translucent layer. `build()` returns the group; `b.mesh(name)` finds a layer's mesh for the tick.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type GearFinish = 'gloss' | 'matte' | 'metal' | 'glow' | 'glass' | 'wing' | 'sheet';

/** [roughness, metalness, emissive] per solid finish. */
const SURF: Record<string, [number, number, number]> = {
  gloss: [0.3, 0, 0],
  matte: [0.88, 0, 0],
  metal: [0.24, 0.86, 0],
  glow: [0.5, 0, 1.15],
  sheet: [0.55, 0, 0],
};
/** Vertex alpha of the translucent finishes. */
const ALPHA: Record<string, number> = { glass: 0.45, wing: 0.82 };
const isTranslucent = (f: GearFinish) => f === 'glass' || f === 'wing';

let solidMat: THREE.Material | null = null;
let clearMat: THREE.Material | null = null;
/** The shared SOLID gear material (vertex colours + per-vertex `surf` = roughness, metalness, emissive). Do not mutate or dispose. */
export function gearSolid(): THREE.Material {
  if (solidMat) return solidMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vSurf.z;');
  };
  m.customProgramCacheKey = () => 'gear-solid-v1';
  solidMat = m;
  return m;
}
/** The shared TRANSLUCENT material (per-vertex RGBA). Do not mutate or dispose. */
export function gearClear(): THREE.Material {
  if (clearMat) return clearMat;
  clearMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.32, metalness: 0, envMapIntensity: 1.1 });
  return clearMat;
}
/** Back-compat: the material for a finish (solid ones all share one). */
export function gearMat(f: GearFinish): THREE.Material {
  return isTranslucent(f) ? gearClear() : gearSolid();
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

/** Collects coloured primitives and merges them in `build()` (one SOLID mesh + at most one TRANSLUCENT mesh per layer). */
export class GearBuilder {
  readonly group = new THREE.Group();
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private meshes = new Map<string, THREE.Mesh>();
  private cur = 'main';
  private tmpColor = new THREE.Color();
  private base = new THREE.Matrix4();
  private baseStack: THREE.Matrix4[] = [];

  /** Everything added inside `fn` is placed through the transform `x` (a baked parent group; nestable). */
  within(x: Xf, fn: () => void): this {
    this.baseStack.push(this.base.clone());
    this.base.multiply(xfMatrix(x));
    fn();
    this.base.copy(this.baseStack.pop()!);
    return this;
  }

  /** Subsequent parts go on this layer (its own mesh, so it can be animated). Returns `this`. */
  layer(name: string): this {
    this.cur = name;
    return this;
  }
  /** The mesh of a layer after `build()` (`translucent` = the glass / wing mesh of that layer). */
  mesh(name = 'main', translucent = false): THREE.Mesh | undefined {
    return this.meshes.get(`${name}|${translucent ? 't' : 's'}`);
  }

  /** Add any geometry (cloned, transformed and tinted). `src` is never modified. */
  add(src: THREE.BufferGeometry, color: string, finish: GearFinish, x: Xf = {}): this {
    let g = src.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(xfMatrix(x));
    g.applyMatrix4(this.base);
    g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const c = this.tmpColor.set(color);
    const clear = isTranslucent(finish);
    const cs = clear ? 4 : 3;
    const col = new Float32Array(n * cs);
    for (let i = 0; i < n; i++) {
      col[i * cs] = c.r;
      col[i * cs + 1] = c.g;
      col[i * cs + 2] = c.b;
      if (clear) col[i * 4 + 3] = ALPHA[finish];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, cs));
    if (!clear) {
      const sf = SURF[finish];
      const surf = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        surf[i * 3] = sf[0];
        surf[i * 3 + 1] = sf[1];
        surf[i * 3 + 2] = sf[2];
      }
      g.setAttribute('surf', new THREE.BufferAttribute(surf, 3));
    }
    const key = `${this.cur}|${clear ? 't' : 's'}`;
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
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
  /** One flat triangle (double sided). */
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], color: string, finish: GearFinish = 'sheet'): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.computeVertexNormals();
    return this.add(g, color, finish);
  }
  /** Merge everything into the group: one solid + (if any) one translucent mesh per layer. Layers other than 'main' are named after the layer. */
  build(): THREE.Group {
    for (const [key, list] of this.parts) {
      const [layer, kind] = key.split('|');
      const clear = kind === 't';
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, clear ? gearClear() : gearSolid());
      m.name = clear ? `${layer}-clear` : layer;
      m.castShadow = !clear;
      m.receiveShadow = false;
      m.renderOrder = clear ? 2 : 0;
      m.userData.finish = clear ? 'clear' : 'solid';
      this.meshes.set(key, m);
      this.group.add(m);
    }
    this.parts.clear();
    return this.group;
  }
}

/** Free the GPU buffers of a gear group (never the shared materials). */
export function disposeGear(root: THREE.Object3D): void {
  (root.userData.dispose as (() => void) | undefined)?.(); // v3 rides: a real ride model frees its own paint + buffers
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

/**
 * A feathered wing outline for angel / bird wings: the shoulder at the origin, the tip along +x, a
 * rounded leading edge and a scalloped trailing edge (`tips` rounded feather ends).
 */
export function featherWing(L: number, H: number, tips = 6): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  // leading edge: up to the "wrist", then sweeping out to a high rounded tip
  s.bezierCurveTo(0.1 * L, 0.38 * H, 0.2 * L, 0.64 * H, 0.38 * L, 0.58 * H);
  s.bezierCurveTo(0.62 * L, 0.5 * H, 0.84 * L, 0.98 * H, 1.0 * L, 0.74 * H);
  // trailing edge: long rounded feather ends fanning down and back toward the shoulder
  const ends: [number, number][] = [];
  for (let i = 1; i <= tips; i++) {
    const t = i / tips;
    ends.push([L * (1.0 - 0.8 * Math.pow(t, 0.85)), H * (0.74 - 1.3 * Math.pow(t, 0.9))]);
  }
  let px = L, py = 0.74 * H;
  for (const [x, y] of ends) {
    s.quadraticCurveTo((px + x) / 2 + 0.055 * L, (py + y) / 2 + 0.03 * H, x, y); // a rounded feather tip
    px = x;
    py = y;
  }
  s.quadraticCurveTo(0.05 * L, -0.25 * H, 0, 0);
  return s;
}
/** A bat / dragon wing: a pointed finger-bone fan with a scalloped membrane (shoulder at the origin, +x outward). */
export function batWing(L: number, H: number): { shape: THREE.Shape; tips: [number, number][]; knuckle: [number, number] } {
  const knuckle: [number, number] = [0.22 * L, 0.62 * H];
  const tips: [number, number][] = [[1.0 * L, 0.95 * H], [0.9 * L, 0.3 * H], [0.66 * L, -0.12 * H], [0.34 * L, -0.34 * H]];
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(knuckle[0], knuckle[1]);
  s.quadraticCurveTo(0.6 * L, 0.98 * H, tips[0][0], tips[0][1]);
  for (let i = 1; i < tips.length; i++) {
    const [ax, ay] = tips[i - 1], [bx, by] = tips[i];
    s.quadraticCurveTo((ax + bx) / 2 - 0.1 * L, (ay + by) / 2 + 0.05 * H - 0.12 * H, bx, by);
  }
  s.quadraticCurveTo(0.12 * L, -0.12 * H, 0, 0);
  return { shape: s, tips, knuckle };
}
