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

  // v3 draw-call diet: the trunk is part of the tree (aLeaf = 1 on the crown: only that part takes the instance's colour)
  const withTrunk = (crown: THREE.BufferGeometry, trunkH: number, trunkW: number, crownY: number, crownSy = 1): THREE.BufferGeometry => {
    const tag = (g: THREE.BufferGeometry, v: number): THREE.BufferGeometry => {
      g.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
      return g;
    };
    const t = stripped(new THREE.CylinderGeometry(0.13 * trunkW, 0.24 * trunkW, trunkH, 6).translate(0, trunkH / 2, 0));
    const c = crown.clone();
    c.scale(1, crownSy, 1);
    c.translate(0, crownY, 0);
    return mergeGeometries([tag(t, 0), tag(c, 1)], false);
  };
  const oakTree = withTrunk(oak, 2.4, 1.0, 3.0, 0.95);
  const pineTree = withTrunk(pine, 1.4, 0.9, 0.9);

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

  const bush = stripped(jitter(new THREE.IcosahedronGeometry(1, 0), 0.34, 90).translate(0, 0.35, 0)); // v3: 20 triangles a bush (there are thousands)
  const rock = stripped(jitter(new THREE.IcosahedronGeometry(1, 0), 0.5, 120).translate(0, 0.2, 0));

  // little flower tuft (v3): three flowers, each a thin crossed-quad stem, a five-petal star blossom 0.18-0.22 m across
  // (the petals take the instance's colour, aTint = 1) and a yellow centre. 14 triangles a flower, 42 a tuft.
  const flowers = (() => {
    const P: number[] = [], N: number[] = [], C: number[] = [], A: number[] = [];
    const tri = (a: number[], b: number[], c: number[], n: number[], col: THREE.Color, tint: number): void => {
      for (const v of [a, b, c]) {
        P.push(v[0], v[1], v[2]);
        N.push(n[0], n[1], n[2]);
        C.push(col.r, col.g, col.b);
        A.push(tint);
      }
    };
    const white = new THREE.Color('#ffffff'), green = new THREE.Color('#3fae52'), gold = new THREE.Color('#ffd23a');
    const fr = seeded(4242);
    const spots: [number, number][] = [[0, 0], [0.27, 0.1], [-0.2, 0.2]];
    for (const [fx, fz] of spots) {
      const h = 0.2 + fr() * 0.12;                      // stems 20-32 cm: ankle to shin
      const R = 0.09 + fr() * 0.02;                     // petals reach 9-11 cm from the centre
      const lean = (fr() - 0.5) * 0.08, leanZ = (fr() - 0.5) * 0.08;
      const tilt = 0.12 + fr() * 0.3, phi = fr() * 6.28;
      const tx = fx + lean, tz = fz + leanZ;           // top of the stem
      const w = 0.012;
      // stem: two crossed vertical quads (the material is double sided)
      tri([fx - w, 0, fz], [fx + w, 0, fz], [tx + w, h, tz], [0, 0, 1], green, 0);
      tri([fx - w, 0, fz], [tx + w, h, tz], [tx - w, h, tz], [0, 0, 1], green, 0);
      tri([fx, 0, fz - w], [fx, 0, fz + w], [tx, h, tz + w], [1, 0, 0], green, 0);
      tri([fx, 0, fz - w], [tx, h, tz + w], [tx, h, tz - w], [1, 0, 0], green, 0);
      // blossom: a flat star tipped a little off the vertical, then moved to the top of the stem
      const ct = Math.cos(tilt), st = Math.sin(tilt), cp = Math.cos(phi), sp = Math.sin(phi);
      const place = (x: number, y: number, z: number): number[] => {
        const y1 = y * ct - z * st, z1 = y * st + z * ct;
        return [tx + x * cp + z1 * sp, h + y1, tz - x * sp + z1 * cp];
      };
      const up = place(0, 1, 0).map((v, i) => v - [tx, h, tz][i]);
      const centre = place(0, 0.012, 0);
      const base: number[][] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.314;       // base corners sit between the petal tips
        base.push(place(0.4 * R * Math.cos(a), 0, 0.4 * R * Math.sin(a)));
      }
      for (let i = 0; i < 5; i++) {
        const tip = place(R * Math.cos((i / 5) * Math.PI * 2 + 0.314 + 0.628), 0, R * Math.sin((i / 5) * Math.PI * 2 + 0.314 + 0.628));
        tri(base[(i + 1) % 5], tip, base[i], up, white, 1);                       // a petal (wound so its front face looks up)
        tri(centre, base[(i + 1) % 5], base[i], up, gold, 0);                      // the yellow middle
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(A, 1));
    return g;
  })();

  void birch;
  G = { trunk: stripped(trunk), oak: oakTree, birch, pine: pineTree, palm, bush, rock, flowers };
  return G;
}

// ── v3 world: wind. Crowns, fronds and flowers sway a little (vertex shader, driven by one shared time uniform). ──
/** Seconds of world time; townEnv.update writes it every frame. */
export const windTime = { value: 0 };
function applyWind(sh: { uniforms: Record<string, { value: unknown }>; vertexShader: string }, amount: number): void {
  {
    sh.uniforms.uWindT = windTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ww = sin(uWindT * 1.4 + ip.x * 0.23 + ip.z * 0.19) + 0.5 * sin(uWindT * 2.9 + ip.x * 0.7);
        float hh = max(position.y, 0.0);
        transformed.x += ww * ${amount.toFixed(3)} * hh;
        transformed.z += ww * ${(amount * 0.6).toFixed(3)} * hh;`);
  }
}

// ── v3 world: foliage camera fade (Fortnite-style dither). Leaves within ~2.8 m of the lens, or inside a ~1.2 m tube between the
// lens and the player's head, are discarded with an ordered 4x4 dither: no transparency, no sorting, no extra draw calls. ──
/** Camera and the player's head (world space). DriveScene writes them every frame; far away = no fade (other scenes). */
export const foliageFocus = { cam: { value: new THREE.Vector3(1e6, 1e6, 1e6) }, head: { value: new THREE.Vector3(1e6, 1e6, 1e6) } };
export function setFoliageFocus(cam: THREE.Vector3, hx: number, hy: number, hz: number): void {
  foliageFocus.cam.value.copy(cam);
  foliageFocus.head.value.set(hx, hy, hz);
}
type FadeShader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };
/** Add the dither fade to an instanced standard material's shaders (call from onBeforeCompile, after any vertex displacement). */
export function applyFoliageFade(sh: FadeShader): void {
  sh.uniforms.uFolCam = foliageFocus.cam;
  sh.uniforms.uFolHead = foliageFocus.head;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFolW;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        vFolW = (modelMatrix * fw).xyz;
      }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vFolW;
      uniform vec3 uFolCam;
      uniform vec3 uFolHead;
      const float FOL_B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        float fdc = distance(vFolW, uFolCam);
        float ff = 1.0 - smoothstep(1.4, 2.8, fdc);
        vec3 fab = uFolHead - uFolCam;
        float fL = max(length(fab), 0.001);
        vec3 fdir = fab / fL;
        float ftp = dot(vFolW - uFolCam, fdir);
        if (ftp > 0.0 && ftp < fL + 0.5) {
          float fdl = length(vFolW - uFolCam - fdir * clamp(ftp, 0.0, fL));
          ff = max(ff, 1.0 - smoothstep(0.6, 1.25, fdl));
        }
        if (ff > 0.0) {
          int fix = int(mod(gl_FragCoord.x, 4.0)), fiy = int(mod(gl_FragCoord.y, 4.0));
          if (ff > (FOL_B[fiy * 4 + fix] + 0.5) / 16.0) discard;
        }
      }`);
}
function windy<T extends THREE.Material>(mt: T, amount: number): T {
  mt.onBeforeCompile = (sh) => {
    applyWind(sh, amount);
    applyFoliageFade(sh as unknown as FadeShader);
  };
  mt.customProgramCacheKey = () => 'veg-windy-fade-' + amount;
  return mt;
}
/** Flowers: swaying; only the petals (aTint = 1) take the instance's colour, stems stay green and centres yellow. */
function flowerMaterial(): THREE.MeshStandardMaterial {
  const mt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  mt.customProgramCacheKey = () => 'veg-flower';
  mt.onBeforeCompile = (sh) => {
    applyWind(sh, 0.12);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        #if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
          vColor.xyz = mix(color.xyz, color.xyz * instanceColor.xyz, aTint);
        #endif`);
  };
  return mt;
}
/** Trees: swaying, with the trunk (aLeaf = 0) kept bark-brown and the crown (aLeaf = 1) taking the instance's colour. */
function treeMaterial(): THREE.MeshStandardMaterial {
  const mt = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, flatShading: true });
  const bark = new THREE.Color('#6b4d36');
  mt.customProgramCacheKey = () => 'veg-tree';
  mt.onBeforeCompile = (sh) => {
    applyWind(sh, 0.035);
    applyFoliageFade(sh as unknown as FadeShader);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLeaf;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        #if defined( USE_INSTANCING_COLOR )
          vColor.xyz = mix(vec3(${bark.r.toFixed(4)}, ${bark.g.toFixed(4)}, ${bark.b.toFixed(4)}), vColor.xyz, aLeaf);
        #endif`);
  };
  return mt;
}

// ── materials ───────────────────────────────────────────────────────────────
let M: { leaf: THREE.Material; tree: THREE.Material; palm: THREE.Material; rock: THREE.Material; flower: THREE.Material } | null = null;
function materials() {
  return (M ??= {
    leaf: windy(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, flatShading: true }), 0.035),
    tree: treeMaterial(),
    palm: windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }), 0.03),
    rock: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }),
    flower: flowerMaterial(),
  });
}

// ── batching ────────────────────────────────────────────────────────────────
interface Batch { m: THREE.Matrix4[]; c: THREE.Color[] }
type Kinds = 'oak' | 'pine' | 'palm' | 'bush' | 'rock' | 'flowers';
const KINDS: Kinds[] = ['oak', 'pine', 'palm', 'bush', 'rock', 'flowers']; // (birch is a slimmer oak; trunks are part of the tree meshes)

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
        // one mesh per tree (trunk + crown); a birch is the same tree, slimmer and taller
        const [sx, sy] = kind === 'oak' ? [scale, scale] : [scale * 0.76, scale * 1.12];
        this.push(b.oak, x, y, z, rotY, sx, sy, sx, color ?? PAL.trees[(Math.abs(x * 7 + z * 3) | 0) % PAL.trees.length]);
        if (collide) this.colliders.push({ kind: 'circle', x, z, r: 0.42 * scale + 0.12 });
        break;
      }
      case 'pine':
        this.push(b.pine, x, y, z, rotY, scale, scale, scale, color ?? PAL.pines[(Math.abs(x * 5 + z * 11) | 0) % PAL.pines.length]);
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
    const geo: Record<Kinds, THREE.BufferGeometry> = { oak: g.oak, pine: g.pine, palm: g.palm, bush: g.bush, rock: g.rock, flowers: g.flowers };
    const mats: Record<Kinds, THREE.Material> = { oak: m.tree, pine: m.tree, palm: m.palm, bush: m.leaf, rock: m.rock, flowers: m.flower };
    for (const [key, b] of this.chunks) {
      const cx = key % CHUNKS, cz = Math.floor(key / CHUNKS);
      const vc: VegChunk = { cx: -GROUND + (cx + 0.5) * CHUNK, cz: -GROUND + (cz + 0.5) * CHUNK, meshes: [] };
      for (const k of KINDS) {
        const batch = b[k];
        if (!batch.m.length) continue;
        const im = new THREE.InstancedMesh(geo[k], mats[k], batch.m.length);
        for (let i = 0; i < batch.m.length; i++) {
          im.setMatrixAt(i, batch.m[i]);
          if (k !== 'palm') im.setColorAt(i, batch.c[i]);
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
