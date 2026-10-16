// ── v3 build (W5): distance detail levels for baked chunks (builds and decor) ───────────────────
// A chunk is baked into one mesh per material ("fin": plank, brick, steel, shingle ... up to a dozen for decor), which is
// a handful of draw calls up close but adds up when several chunks are in view (and again in the sun's shadow pass).
// So each chunk has three levels, picked from its distance to the camera:
//   0 full    the textured fins, casting shadows while it is inside the sun's shadow box
//   1 flat    ONE mesh: every fin's geometry merged and drawn with the plain vertex-coloured material (textures and
//             finishes are too small to see from here), no shadows. One draw call instead of 4-12.
//   2 hidden  too far to matter (decor only: builds stay in view until the fog has swallowed them)
// The flat mesh is made lazily from the geometry that is already baked (a concatenation, no re-bake) and thrown away
// with the chunk's meshes when it is re-baked.
import * as THREE from 'three';
import { finMat, type Fin } from '../mats';

export type Lod = 0 | 1 | 2;

export interface LodChunk {
  group: THREE.Group;
  /** world-space bounds of everything baked in the chunk (null = nothing yet) */
  box: THREE.Box3 | null;
  flat: THREE.Mesh | null;
  lod: Lod | -1;
  shadow: boolean;
}

export interface LodRanges {
  /** metres from the camera: farther than this draws flat */
  flatAt: number;
  /** ...and farther than this is not drawn */
  hideAt: number;
  /** only chunks nearer than this cast shadows (the sun's shadow box is about 46 m) */
  shadowAt: number;
  /** a chunk must come this much back inside a range before it changes level again (no flicker on the edge) */
  hyst: number;
}

export const newLodChunk = (group: THREE.Group): LodChunk => ({ group, box: null, flat: null, lod: -1, shadow: true });

/** The geometry was re-baked: forget the flat mesh and measure the chunk again. */
export function resetLod(ch: LodChunk): void {
  ch.flat = null;
  ch.lod = -1;
  ch.shadow = true;
  ch.group.visible = true;
  let box: THREE.Box3 | null = null;
  for (const o of ch.group.children) {
    const m = o as THREE.Mesh;
    const gb = m.isMesh ? m.geometry.boundingBox : null;
    if (gb) (box ??= new THREE.Box3()).union(gb);
  }
  ch.box = box;
}

const lin = (v: number): number => Math.pow(v / 255, 2.2);
const avgs = new Map<string, [number, number, number]>();
/** The average colour of a textured fin's pattern (linear), so the flat far version is not brighter than the textured one it replaces. */
function finAverage(fin: string): [number, number, number] {
  let a = avgs.get(fin);
  if (a) return a;
  a = [1, 1, 1];
  const map = (finMat(fin as Fin) as THREE.MeshStandardMaterial).map;
  const img = map?.image as CanvasImageSource | undefined;
  if (img && typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, 16, 16);
        const px = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) {
          r += lin(px[i]);
          g += lin(px[i + 1]);
          b += lin(px[i + 2]);
        }
        const n = px.length / 4;
        a = [r / n, g / n, b / n];
      }
    } catch {
      /* (a tainted or missing canvas: leave it at white) */
    }
  }
  avgs.set(fin, a);
  return a;
}

/** One mesh with every fin of the chunk merged (positions, normals, vertex colours), drawn with the plain painted material. */
function mergeFlat(group: THREE.Group): THREE.Mesh | null {
  const src: THREE.BufferGeometry[] = [];
  const tint: [number, number, number][] = [];
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.fin && m.userData.fin !== 'flat') {
      src.push(m.geometry);
      tint.push(finAverage(m.userData.fin as string));
    }
  }
  if (src.length < 2) return null;   // nothing to gain over the one mesh it already is
  let nv = 0, ni = 0;
  for (const g of src) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1);
  const idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (let gi = 0; gi < src.length; gi++) {
    const g = src[gi];
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as ArrayLike<number>, v * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array as ArrayLike<number>, v * 3);
    if (g.attributes.color) {
      const ca = g.attributes.color.array, t = tint[gi];
      for (let k = 0; k < n * 3; k++) col[v * 3 + k] = ca[k] * t[k % 3];
    }
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k++) idx[i++] = a[k] + v;
    } else for (let k = 0; k < n; k++) idx[i++] = v + k;
    v += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, finMat('paint'));
  mesh.userData.fin = 'flat';   // (disposeBaked frees its geometry with the chunk's)
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

const _p = new THREE.Vector3();

/** Pick the chunk's level for a camera at (x, y, z) and apply it. Cheap enough to run on every chunk every frame. */
export function stepLod(ch: LodChunk, x: number, y: number, z: number, r: LodRanges): void {
  const dist = ch.box ? ch.box.distanceToPoint(_p.set(x, y, z)) : 0;
  const was = ch.lod;
  const flatAt = was >= 1 ? r.flatAt - r.hyst : r.flatAt;
  const hideAt = was === 2 ? r.hideAt - r.hyst : r.hideAt;
  const lod: Lod = dist >= hideAt ? 2 : dist >= flatAt ? 1 : 0;
  const shadow = lod === 0 && dist < (ch.shadow ? r.shadowAt : r.shadowAt - r.hyst);
  if (lod === was && shadow === ch.shadow) return;
  if (lod !== was) {
    ch.group.visible = lod !== 2;
    if (lod === 1 && !ch.flat) ch.flat = mergeFlat(ch.group);
    for (const o of ch.group.children) o.visible = o === ch.flat ? lod === 1 : lod === 0 || !ch.flat;
    ch.lod = lod;
  }
  ch.shadow = shadow;
  for (const o of ch.group.children) {
    const m = o as THREE.Mesh;
    if (m === ch.flat) continue;
    if (m.userData.cast === undefined) m.userData.cast = m.castShadow;
    m.castShadow = shadow && m.userData.cast === true;
  }
}

/** Meshes this chunk draws right now. */
export function drawnMeshes(ch: LodChunk): number {
  if (!ch.group.visible) return 0;
  let n = 0;
  for (const o of ch.group.children) if (o.visible) n++;
  return n;
}
