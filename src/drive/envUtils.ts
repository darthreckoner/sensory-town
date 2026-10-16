// Small helpers shared by the town environment, the car and the jobs:
// emoji sprites, static-geometry baking, instancing, procedural textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toyMatUnique, type Finish } from '../art/materials';

const TAU = Math.PI * 2;

// ── angles ──────────────────────────────────────────────────────────────────
export function wrapAngle(a: number): number {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}
/** Shortest-way interpolation between two angles. */
export function lerpAngle(a: number, b: number, k: number): number {
  return a + wrapAngle(b - a) * k;
}
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ── emoji sprites (icons that float above pads and beacons) ─────────────────
const emojiCache = new Map<string, THREE.CanvasTexture>();

/** A CanvasTexture with one emoji drawn on a transparent background. Cached. */
export function emojiTexture(emoji: string, px = 128): THREE.CanvasTexture {
  const key = `${emoji}|${px}`;
  let tex = emojiCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const x = c.getContext('2d')!;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${Math.round(px * 0.76)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.fillText(emoji, px / 2, px / 2 + px * 0.04);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    emojiCache.set(key, tex);
  }
  return tex;
}

/** Billboard sprite showing an emoji. `size` is the world-space width/height. */
export function emojiSprite(emoji: string, size: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

// ── procedural textures ─────────────────────────────────────────────────────
/** Vertical-stripe texture (u around a sphere / along a plank). `n` stripes of a then b. */
export function stripeTexture(a: string, b: string, n: number, horizontal = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const x = c.getContext('2d')!;
  const w = c.width / n / 2;
  for (let i = 0; i < n * 2; i++) {
    x.fillStyle = i % 2 === 0 ? a : b;
    x.fillRect(i * w, 0, Math.ceil(w), c.height);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (horizontal) {
    t.rotation = Math.PI / 2;
    t.center.set(0.5, 0.5);
  }
  return t;
}

/** Candy swirl (a lollipop spiral) on a round sign. */
export function swirlTexture(a: string, b: string, px = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d')!;
  x.fillStyle = b;
  x.fillRect(0, 0, px, px);
  x.translate(px / 2, px / 2);
  x.strokeStyle = a;
  x.lineWidth = px * 0.1;
  x.lineCap = 'round';
  x.beginPath();
  for (let i = 0; i <= 220; i++) {
    const t = i / 220;
    const ang = t * Math.PI * 7;
    const r = t * px * 0.46;
    const px_ = Math.cos(ang) * r;
    const py_ = Math.sin(ang) * r;
    if (i === 0) x.moveTo(px_, py_);
    else x.lineTo(px_, py_);
  }
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft vertical fade (opaque at the bottom, transparent at the top) for light beams. */
let beamTex: THREE.CanvasTexture | null = null;
export function beamTexture(): THREE.CanvasTexture {
  if (!beamTex) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
    beamTex = new THREE.CanvasTexture(c);
    beamTex.colorSpace = THREE.SRGBColorSpace;
  }
  return beamTex;
}

/** A tall translucent column of light, bright at the base. Base sits at y = 0. */
export function lightBeam(color: THREE.ColorRepresentation, radius: number, height: number, opacity = 0.5): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.15, height, 20, 1, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: beamTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 4;
  return m;
}

// ── geometry helpers ────────────────────────────────────────────────────────
/** Revolve a (radius, height) profile around Y. Pair it with lathedMat() (double sided) so a flipped profile never disappears. */
export function lathe(profile: [number, number][], segments = 28): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Rounded rectangle outline as a flat shape in the XY plane. */
export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Merge every static mesh under `root` into one mesh per (material, shadow
 * flags). Transforms are baked relative to `root`. Great for buildings: dozens
 * of little parts become a handful of draw calls. Does not touch InstancedMesh
 * or Sprites; they should be added next to the baked result.
 */
export function bakeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const mat = m.material as THREE.Material;
    if (Array.isArray(mat)) return;
    let g = m.geometry.clone();
    // Keep only the attributes every primitive shares so merging never fails.
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [] }));
    b.geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const anyFlat = b.geos.some((g) => !g.index);
    const list = anyFlat ? b.geos.map((g) => (g.index ? g.toNonIndexed() : g)) : b.geos;
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    out.add(mesh);
  }
  return out;
}

/** Collects instances (matrix + optional color) and builds one InstancedMesh. */
export class InstanceBatch {
  private mats: THREE.Matrix4[] = [];
  private cols: THREE.Color[] = [];
  private hasColor = false;
  private static readonly tmpQ = new THREE.Quaternion();
  private static readonly tmpE = new THREE.Euler();
  private static readonly tmpP = new THREE.Vector3();
  private static readonly tmpS = new THREE.Vector3();

  constructor(
    readonly geo: THREE.BufferGeometry,
    readonly mat: THREE.Material,
    readonly cast = true,
    readonly receive = true,
  ) {}

  get count(): number {
    return this.mats.length;
  }

  add(x: number, y: number, z: number, rotY = 0, sx = 1, sy = sx, sz = sx, color?: THREE.ColorRepresentation, rotX = 0, rotZ = 0): void {
    const m = new THREE.Matrix4();
    InstanceBatch.tmpE.set(rotX, rotY, rotZ);
    InstanceBatch.tmpQ.setFromEuler(InstanceBatch.tmpE);
    m.compose(InstanceBatch.tmpP.set(x, y, z), InstanceBatch.tmpQ, InstanceBatch.tmpS.set(sx, sy, sz));
    this.mats.push(m);
    if (color !== undefined) {
      this.hasColor = true;
      this.cols.push(new THREE.Color(color));
    } else this.cols.push(new THREE.Color(1, 1, 1));
  }

  build(): THREE.InstancedMesh | null {
    if (this.mats.length === 0) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.mats.length);
    for (let i = 0; i < this.mats.length; i++) {
      im.setMatrixAt(i, this.mats[i]);
      if (this.hasColor) im.setColorAt(i, this.cols[i]);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = this.cast;
    im.receiveShadow = this.receive;
    im.computeBoundingSphere();
    im.computeBoundingBox();
    return im;
  }
}

// ── cheap smooth noise (ground colour variation) ────────────────────────────
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
/** Value noise in 0..1. */
export function valueNoise(x: number, z: number, seed = 1): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ── building helpers ────────────────────────────────────────────────────────
/** Add a mesh with a transform in one line (positions then Euler rotations). */
export function put(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  cast = true, receive = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

const lathedCache = new Map<string, THREE.Material>();
/** toyMat look for lathe (revolved) shapes: double sided so a flipped profile never vanishes. */
export function lathedMat(color: THREE.ColorRepresentation, finish: Finish = 'gloss'): THREE.Material {
  const key = `${new THREE.Color(color).getHexString()}|${finish}`;
  let m = lathedCache.get(key);
  if (!m) {
    const u = toyMatUnique(color, finish);
    u.side = THREE.DoubleSide;
    m = u;
    lathedCache.set(key, m);
  }
  return m;
}

/** Extruded rounded arch (a door / doorway): flat bottom, half-round top. */
export function archGeometry(width: number, straight: number, depth: number, bevel = 0.05): THREE.BufferGeometry {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, straight);
  s.absarc(0, straight, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 18,
  });
}

/**
 * Square emoji / letter decals packed into one texture atlas and one merged
 * mesh (a single draw call), e.g. the ABC blocks and the 🔨 sign of the yard.
 * Planes face +z; positions are in the parent's space.
 */
export function decalAtlas(items: { char: string; x: number; y: number; z: number; size: number }[], tile = 96): THREE.Mesh {
  const n = items.length;
  const c = document.createElement('canvas');
  c.width = tile * n;
  c.height = tile;
  const x = c.getContext('2d')!;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `${Math.round(tile * 0.76)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  x.fillStyle = '#3d3a4b';
  items.forEach((it, i) => x.fillText(it.char, tile * i + tile / 2, tile / 2 + tile * 0.04));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geos = items.map((it, i) => {
    const g = new THREE.PlaneGeometry(it.size, it.size);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / n);
    g.translate(it.x, it.y, it.z);
    return g;
  });
  const m = new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  m.renderOrder = 1;
  return m;
}
