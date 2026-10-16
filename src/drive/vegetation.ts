// Stylized-realistic vegetation: faceted low-poly trees, pines, palms, bushes
// and rocks. Everything is instanced and grouped by terrain chunk, so
// frustum culling and distance culling work per chunk and the whole forest
// costs a handful of draw calls per visible chunk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND, seeded } from '../world/townLayout';
import type { Collider } from '../world/townEnv';
import { CHUNK } from './terrain';
import { PAL } from './palette';

export type PlantKind = 'oak' | 'birch' | 'pine' | 'palm' | 'bush' | 'rock' | 'flowers';

const CHUNKS = Math.ceil((GROUND * 2) / CHUNK);

// ── geometries (built once) ─────────────────────────────────────────────────
function jitter(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const r = seeded(seed);
  const pos = g.attributes.position as THREE.BufferAttribute;
  // jitter by position so shared (coincident) vertices move together
  const memo = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = memo.get(key);
    if (!d) memo.set(key, (d = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]));
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

function stripped(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const n of Object.keys(out.attributes)) if (n !== 'position' && n !== 'normal') out.deleteAttribute(n);
  return out;
}

let G: {
  trunk: THREE.BufferGeometry; oak: THREE.BufferGeometry; birch: THREE.BufferGeometry; pine: THREE.BufferGeometry;
  palm: THREE.BufferGeometry; bush: THREE.BufferGeometry; rock: THREE.BufferGeometry; flowers: THREE.BufferGeometry;
} | null = null;

function geometries() {
  if (G) return G;
  const trunk = new THREE.CylinderGeometry(0.13, 0.24, 1, 6).translate(0, 0.5, 0);

  // round broadleaf crown: a lump of five jittered blobs
  const blobs = (specs: [number, number, number, number][], seed: number): THREE.BufferGeometry => {
    const parts = specs.map(([x, y, z, r], i) => {
      const b = new THREE.IcosahedronGeometry(r, 0);
      jitter(b, r * 0.25, seed + i);
      b.translate(x, y, z);
      return stripped(b);
    });
    return mergeGeometries(parts, false);
  };
  const oak = blobs([[0, 0.2, 0, 1.55], [0.95, -0.3, 0.3, 1.05], [-0.85, -0.2, -0.4, 1.1], [0.2, 0.95, 0.5, 1.0], [-0.3, -0.5, 0.95, 0.95]], 10);
  const birch = blobs([[0, 0.3, 0, 1.0], [0.55, -0.25, 0.2, 0.7], [-0.5, -0.1, -0.3, 0.75], [0.1, 0.9, 0.1, 0.65]], 40);

  // conifer: stacked jagged cones
  const cones: THREE.BufferGeometry[] = [];
  [[0, 1.9, 1.6], [1.1, 1.7, 1.3], [2.1, 1.5, 1.0], [3.0, 1.3, 0.72], [3.8, 1.1, 0.42]].forEach(([y, h, r], i) => {
    const c = new THREE.ConeGeometry(r, h, 7, 1);
    c.rotateY(i * 0.7);
    jitter(c, 0.08, 70 + i);
    c.translate(0, y + h / 2, 0);
    cones.push(stripped(c));
  });
  const pine = mergeGeometries(cones, false);

  // palm: a bent trunk and nine drooping fronds, with vertex colours
  const P: number[] = [], C: number[] = [];
  const col = new THREE.Color();
  const tri = (a: number[], b: number[], c: number[], hex: string): void => {
    col.set(hex);
    for (const v of [a, b, c]) {
      P.push(v[0], v[1], v[2]);
      C.push(col.r, col.g, col.b);
    }
  };
  const segs = 7, sides = 6;
  const bendAt = (t: number): number => 0.9 * t * t;
  const ring = (t: number): number[][] => {
    const y = t * 6.2, r = 0.3 - 0.13 * t, cx = bendAt(t) * 2.2;
    return Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      return [cx + Math.cos(a) * r, y, Math.sin(a) * r];
    });
  };
  for (let s = 0; s < segs; s++) {
    const A = ring(s / segs), B = ring((s + 1) / segs);
    const hex = s % 2 ? '#8a6a48' : '#7a5c3d';
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      tri(A[k], B[k2], B[k], hex);
      tri(A[k], A[k2], B[k2], hex);
    }
  }
  const topX = bendAt(1) * 2.2, topY = 6.2;
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + (f % 2) * 0.2;
    const L = 3.4 - (f % 3) * 0.4;
    const n = 5;
    const line: number[][] = [], side: number[][] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const out = u * L;
      const y = topY + Math.sin(u * 1.5) * 1.1 - u * u * 1.5;
      line.push([topX + Math.cos(a) * out, y, Math.sin(a) * out]);
      const wd = 0.55 * (1 - u * 0.75);
      side.push([-Math.sin(a) * wd, 0, Math.cos(a) * wd]);
    }
    const hexA = f % 2 ? '#3f8f4a' : '#2f7a45';
    for (let k = 0; k < n; k++) {
      const a0 = [line[k][0] + side[k][0], line[k][1], line[k][2] + side[k][2]], a1 = [line[k][0] - side[k][0], line[k][1], line[k][2] - side[k][2]];
      const b0 = [line[k + 1][0] + side[k + 1][0], line[k + 1][1], line[k + 1][2] + side[k + 1][2]], b1 = [line[k + 1][0] - side[k + 1][0], line[k + 1][1], line[k + 1][2] - side[k + 1][2]];
      tri(a0, b0, a1, hexA);
      tri(a1, b0, b1, hexA);
    }
  }
  for (let k = 0; k < 3; k++) {
    // coconuts
    const a = k * 2.1, cx = topX + Math.cos(a) * 0.28, cz = Math.sin(a) * 0.28;
    const nut = new THREE.IcosahedronGeometry(0.18, 0);
    const np = nut.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < np.count; i += 3) tri([np.getX(i) + cx, np.getY(i) + topY - 0.2, np.getZ(i) + cz], [np.getX(i + 1) + cx, np.getY(i + 1) + topY - 0.2, np.getZ(i + 1) + cz], [np.getX(i + 2) + cx, np.getY(i + 2) + topY - 0.2, np.getZ(i + 2) + cz], '#4a3626');
  }
  const palm = new THREE.BufferGeometry();
  palm.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  palm.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  palm.computeVertexNormals();

  const bush = stripped(jitter(new THREE.IcosahedronGeometry(1, 1), 0.28, 90).translate(0, 0.35, 0));
  const rock = stripped(jitter(new THREE.IcosahedronGeometry(1, 0), 0.5, 120).translate(0, 0.2, 0));

  // little flower tuft: a few small coloured blobs on short stems
  const fl: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047, d = 0.35 + (i % 2) * 0.25;
    const b = new THREE.IcosahedronGeometry(0.11, 0).translate(Math.cos(a) * d, 0.42 + (i % 3) * 0.08, Math.sin(a) * d);
    fl.push(stripped(b));
  }
  const flowers = mergeGeometries(fl, false);

  G = { trunk: stripped(trunk), oak, birch, pine, palm, bush, rock, flowers };
  return G;
}

// ── materials ───────────────────────────────────────────────────────────────
let M: { leaf: THREE.Material; bark: THREE.Material; palm: THREE.Material; rock: THREE.Material; flower: THREE.Material } | null = null;
function materials() {
  return (M ??= {
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#6b4d36', roughness: 0.95, flatShading: true }),
    palm: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
    rock: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }),
    flower: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true }),
  });
}

// ── batching ────────────────────────────────────────────────────────────────
interface Batch { m: THREE.Matrix4[]; c: THREE.Color[] }
type Kinds = 'trunk' | 'oak' | 'birch' | 'pine' | 'palm' | 'bush' | 'rock' | 'flowers';
const KINDS: Kinds[] = ['trunk', 'oak', 'birch', 'pine', 'palm', 'bush', 'rock', 'flowers'];

export interface VegChunk {
  cx: number;
  cz: number;
  meshes: THREE.InstancedMesh[];
}

export class Vegetation {
  private chunks = new Map<number, Record<Kinds, Batch>>();
  readonly colliders: Collider[] = [];
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  count = 0;

  private batches(x: number, z: number): Record<Kinds, Batch> {
    const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + GROUND) / CHUNK)));
    const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + GROUND) / CHUNK)));
    const key = cz * CHUNKS + cx;
    let b = this.chunks.get(key);
    if (!b) {
      b = {} as Record<Kinds, Batch>;
      for (const k of KINDS) b[k] = { m: [], c: [] };
      this.chunks.set(key, b);
    }
    return b;
  }

  private push(b: Batch, x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number, color?: THREE.ColorRepresentation): void {
    this.e.set(0, rotY, 0);
    this.q.setFromEuler(this.e);
    b.m.push(new THREE.Matrix4().compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz)));
    b.c.push(color !== undefined ? new THREE.Color(color) : new THREE.Color(1, 1, 1));
  }

  /**
   * Plant something at (x, y, z). `scale` ≈ 1 is a normal tree (≈ 6 high).
   * Trees get a trunk collider unless `collide` is false.
   */
  add(kind: PlantKind, x: number, y: number, z: number, scale = 1, rotY = 0, color?: THREE.ColorRepresentation, collide = true): void {
    const b = this.batches(x, z);
    this.count++;
    switch (kind) {
      case 'oak':
      case 'birch': {
        const th = (kind === 'oak' ? 2.4 : 2.9) * scale;
        const tw = kind === 'oak' ? 1.0 : 0.7;
        this.push(b.trunk, x, y, z, rotY, scale * tw, th, scale * tw);
        this.push(b[kind], x, y + th + 0.6 * scale, z, rotY, scale, scale * 0.95, scale, color ?? PAL.trees[(Math.abs(x * 7 + z * 3) | 0) % PAL.trees.length]);
        if (collide) this.colliders.push({ kind: 'circle', x, z, r: 0.42 * scale + 0.12 });
        break;
      }
      case 'pine':
        this.push(b.trunk, x, y, z, rotY, scale * 0.9, 1.4 * scale, scale * 0.9);
        this.push(b.pine, x, y + 0.9 * scale, z, rotY, scale, scale, scale, color ?? PAL.pines[(Math.abs(x * 5 + z * 11) | 0) % PAL.pines.length]);
        if (collide) this.colliders.push({ kind: 'circle', x, z, r: 0.4 * scale + 0.12 });
        break;
      case 'palm':
        this.push(b.palm, x, y, z, rotY, scale, scale, scale);
        if (collide) this.colliders.push({ kind: 'circle', x, z, r: 0.34 * scale + 0.12 });
        break;
      case 'bush':
        this.push(b.bush, x, y, z, rotY, scale * 1.2, scale * 0.8, scale * 1.1, color ?? PAL.trees[(Math.abs(x * 3 + z * 5) | 0) % PAL.trees.length]);
        break;
      case 'rock':
        this.push(b.rock, x, y, z, rotY, scale * 1.2, scale * 0.8, scale, color ?? '#8a8478');
        if (collide) this.colliders.push({ kind: 'circle', x, z, r: 0.9 * scale });
        break;
      case 'flowers':
        this.push(b.flowers, x, y, z, rotY, scale, scale, scale, color ?? '#ff2e88');
        break;
    }
  }

  build(): { group: THREE.Group; chunks: VegChunk[] } {
    const g = geometries();
    const m = materials();
    const group = new THREE.Group();
    group.name = 'vegetation';
    const chunks: VegChunk[] = [];
    const geo: Record<Kinds, THREE.BufferGeometry> = { trunk: g.trunk, oak: g.oak, birch: g.birch, pine: g.pine, palm: g.palm, bush: g.bush, rock: g.rock, flowers: g.flowers };
    const mats: Record<Kinds, THREE.Material> = { trunk: m.bark, oak: m.leaf, birch: m.leaf, pine: m.leaf, palm: m.palm, bush: m.leaf, rock: m.rock, flowers: m.flower };
    for (const [key, b] of this.chunks) {
      const cx = key % CHUNKS, cz = Math.floor(key / CHUNKS);
      const vc: VegChunk = { cx: -GROUND + (cx + 0.5) * CHUNK, cz: -GROUND + (cz + 0.5) * CHUNK, meshes: [] };
      for (const k of KINDS) {
        const batch = b[k];
        if (!batch.m.length) continue;
        const im = new THREE.InstancedMesh(geo[k], mats[k], batch.m.length);
        for (let i = 0; i < batch.m.length; i++) {
          im.setMatrixAt(i, batch.m[i]);
          if (k !== 'trunk' && k !== 'palm') im.setColorAt(i, batch.c[i]);
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = k !== 'flowers' && k !== 'bush';
        im.receiveShadow = true;
        im.computeBoundingSphere();
        group.add(im);
        vc.meshes.push(im);
      }
      chunks.push(vc);
    }
    return { group, chunks };
  }
}
