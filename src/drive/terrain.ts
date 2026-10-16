// The ground of the big map: chunked heightfield terrain with vertex colours
// (grass, sand, rock, urban concrete), asphalt / trail / boardwalk ribbons that
// follow the hills, sidewalks with curbs, road markings and crosswalks, plot
// lawns, paved plazas, and the sea + lake (a clipped, animated water mesh).
import * as THREE from 'three';
import {
  GROUND, GROVE, MEADOW, PAVED, PLOTS, ROAD_PATHS, ROAD_WIDTH, SANDS, SIDEWALK, SUMMIT, WATER_Y, nearestRoad, onRoad, type RoadPath,
} from '../world/townLayout';
import { HF, cliffiness, groundNormal, paveHeight, shoreDist, terrainHeight, vnoise } from '../world/heightfield';
import { sunDirection } from '../art/env';
import { tuning } from '../tuning';
import { PAL } from './palette';
import { clamp, smoothstep } from './envUtils';

export const ROAD_LIFT = 0.05;
export const CURB_H = 0.14;
export const CHUNK = 84;       // v3: the vegetation / culling grid (10 x 10 over the 840 m ground square, a multiple of the 4 m mesh step)
/** The terrain meshes use bigger chunks (5 x 5): fewer draw calls (the haze hides the far ones, see tuning.drive.cullTerrain). */
const TERRAIN_CHUNK = 168;
const TERRAIN_CHUNK_N = Math.ceil((GROUND * 2) / TERRAIN_CHUNK);

// ── soup of triangles with flat normals and vertex colours ──────────────────
class Soup {
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];
  uv: number[] = [];
  private tmp = new THREE.Color();
  /** Quad a,b,c,d (counter-clockwise seen from the normal side). */
  quad(a: number[], b: number[], c: number[], d: number[], col: string | THREE.Color, nrm?: number[], uvs?: number[][]): void {
    this.tri(a, b, c, col, nrm, uvs ? [uvs[0], uvs[1], uvs[2]] : undefined);
    this.tri(a, c, d, col, nrm, uvs ? [uvs[0], uvs[2], uvs[3]] : undefined);
  }
  tri(a: number[], b: number[], c: number[], col: string | THREE.Color, nrm?: number[], uvs?: number[][]): void {
    const col3 = typeof col === 'string' ? this.tmp.set(col) : col;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    let nx = gx, ny = gy, nz = gz;
    if (nrm) {
      [nx, ny, nz] = nrm;
      // wind the triangle so its front face looks along the requested normal
      if (gx * nx + gy * ny + gz * nz < 0) {
        [b, c] = [c, b];
        if (uvs) [uvs[1], uvs[2]] = [uvs[2], uvs[1]];
      }
    }
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      this.p.push(pts[i][0], pts[i][1], pts[i][2]);
      this.n.push(nx, ny, nz);
      this.c.push(col3.r, col3.g, col3.b);
      this.uv.push(uvs ? uvs[i][0] : 0, uvs ? uvs[i][1] : 0);
    }
  }
  get empty(): boolean {
    return this.p.length === 0;
  }
  geometry(withUv = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ── small canvas textures ───────────────────────────────────────────────────
function noiseTexture(base: string, speck: string[], size = 128, density = 0.08, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * density; i++) {
    x.fillStyle = speck[i % speck.length];
    x.globalAlpha = 0.25 + Math.random() * 0.5;
    x.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function plankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d')!;
  const cols = ['#ffffff', '#e4e4e4', '#f2f2f2', '#d8d8d8']; // tinted by the material colour
  for (let i = 0; i < 8; i++) {
    x.fillStyle = cols[i % 4];
    x.fillRect(i * 16, 0, 16, 64);
    x.fillStyle = 'rgba(60,60,60,0.55)';
    x.fillRect(i * 16, 0, 1.5, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ── terrain chunks ──────────────────────────────────────────────────────────
const colA = new THREE.Color(), colB = new THREE.Color(), colC = new THREE.Color();

function softRect(x: number, z: number, cx: number, cz: number, hw: number, hd: number, fall: number): number {
  const dx = Math.max(0, Math.abs(x - cx) - hw), dz = Math.max(0, Math.abs(z - cz) - hd);
  return 1 - smoothstep(0, fall, Math.hypot(dx, dz));
}

// ── v3 world: biome palette (bright, saturated, stylized) ──
const BIO = {
  warm: new THREE.Color('#a4dc4f'),       // sunny yellow-green patches
  cool: new THREE.Color('#2fb36b'),       // blue-green patches
  meadow: new THREE.Color('#93e45e'),
  meadowB: new THREE.Color('#5fcf6f'),
  bloom: ['#ff7ab8', '#ffd84a', '#ffffff', '#b78cff', '#ff9a52'].map((c) => new THREE.Color(c)),
  groveA: new THREE.Color('#2a8f72'),
  groveB: new THREE.Color('#5a49b0'),
  groveGlow: new THREE.Color('#38e0c8'),
  snow: new THREE.Color('#f6faff'),
  snowShade: new THREE.Color('#bcd4ee'),
  snowRock: new THREE.Color('#8f9bb5'),
  sandA: new THREE.Color('#f1c373'),
  sandB: new THREE.Color('#e08a4c'),
  sandC: new THREE.Color('#c9603a'),
  beach: new THREE.Color('#f7e6b4'),
  rockWarm: new THREE.Color('#a79276'),
  rockCool: new THREE.Color('#7e7f8f'),
  seaShallow: new THREE.Color('#e9d9a5'),
  seaMid: new THREE.Color('#58a9b8'),
  seaDeep: new THREE.Color('#1f5f86'),
  tmp: new THREE.Color(),
};

/**
 * Painterly vertex colour: big warm/cool patches of grass, then a biome on top
 * (meadow, grove, snow, dunes, beach, cliffs), then a little speckle.
 */
function terrainColor(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
  const n0 = vnoise(x / 52 + 2, z / 52, 10);     // continent-scale warm/cool patches
  const n1 = vnoise(x / 14, z / 14, 11);
  const n2 = vnoise(x / 4.5, z / 4.5, 12);
  colA.set(PAL.grass[0]).lerp(colB.set(PAL.grass[1]), n1).lerp(colC.set(PAL.grass[2]), n2 * 0.45);
  colA.lerp(BIO.warm, smoothstep(0.55, 0.85, n0) * 0.5).lerp(BIO.cool, smoothstep(0.45, 0.15, n0) * 0.4);
  // calm lush park
  const park = softRect(x, z, 85, -104, 50, 40, 16);
  if (park > 0) colA.lerp(colB.set('#58c052'), park * 0.5);
  // tidy lawns in Home Hills
  const home = softRect(x, z, -102, 3, 46, 46, 12);
  if (home > 0) colA.lerp(colB.set(PAL.lawn), home * 0.85);
  // concrete under downtown
  const urban = softRect(x, z, 0, 0, 48, 48, 12);
  if (urban > 0) colA.lerp(colB.set('#8d8b96'), urban * 0.9);

  // ── Bloom Meadow: lime hills dotted with flower colour ──
  const dMead = Math.hypot(x - MEADOW.x, z - MEADOW.z);
  const mw = 1 - smoothstep(MEADOW.r - 20, MEADOW.r + 22, dMead);
  if (mw > 0) {
    colA.lerp(colB.copy(BIO.meadow).lerp(BIO.meadowB, n1), mw * 0.85);
    const f = vnoise(x / 9, z / 9, 15);
    const fl = smoothstep(0.62, 0.8, f) * mw * smoothstep(0.1, 0.45, vnoise(x / 40, z / 40, 16));
    if (fl > 0) colA.lerp(BIO.bloom[Math.floor(vnoise(x / 27, z / 27, 17) * 4.99)], fl * 0.8);
  }
  // ── Glow Grove: teal moss with violet and glowing patches ──
  const dGrove = Math.hypot(x - GROVE.x, z - GROVE.z);
  const gw = 1 - smoothstep(GROVE.r - 24, GROVE.r + 18, dGrove);
  if (gw > 0) {
    colB.copy(BIO.groveA).lerp(BIO.groveB, smoothstep(0.4, 0.75, vnoise(x / 18, z / 18, 18)));
    colB.lerp(BIO.groveGlow, smoothstep(0.7, 0.9, vnoise(x / 7, z / 7, 19)) * 0.6);
    colA.lerp(colB, gw * 0.9);
  }
  // ── Sunny Sands: banded red dunes ──
  const dSand = Math.hypot(x - SANDS.x, z - SANDS.z);
  const sw = 1 - smoothstep(SANDS.r - 16, SANDS.r + 14, dSand);
  if (sw > 0) {
    const band = Math.sin(h * 1.1 + vnoise(x / 30, z / 30, 20) * 5) * 0.5 + 0.5;
    colB.copy(BIO.sandA).lerp(BIO.sandB, band * 0.8).lerp(BIO.sandC, smoothstep(0.55, 0.9, slope * 1.6 + band * 0.25) * 0.7);
    colA.lerp(colB, sw * 0.95);
  }
  // ── Sprinkle Summit: snow with blue shadows over the high ground ──
  const dSum = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
  let snowCover = 0;
  if (dSum < SUMMIT.shelfR1 + 24) {
    const line = 8.5 + (vnoise(x / 20, z / 20, 22) - 0.5) * 7;
    const snow = smoothstep(line, line + 7, h);
    snowCover = snow;
    if (snow > 0) {
      colB.copy(BIO.snow).lerp(BIO.snowShade, smoothstep(0.35, 0.8, slope) * 0.55 + (vnoise(x / 6, z / 6, 23) - 0.5) * 0.12);
      colA.lerp(colB, snow);
      // bare rock pokes through on the steepest faces
      const bare = smoothstep(0.85, 1.25, slope) * smoothstep(14, 30, h);
      if (bare > 0) colA.lerp(BIO.snowRock, bare * 0.8);
    }
  }
  // ── the shore: sand, wet sand, shallows, deep floor ──
  const s = shoreDist(x, z);
  const cl = cliffiness(x, z);
  const sandW = (1 - smoothstep(14, 32, s)) * (1 - cl * 0.9);
  if (sandW > 0) colA.lerp(colB.copy(BIO.beach).lerp(BIO.sandA, smoothstep(0.5, 0.9, n2) * 0.25), sandW * (1 - sw * 0.8));
  if (h < WATER_Y + 0.5) {
    const w = smoothstep(WATER_Y + 0.5, WATER_Y - 0.1, h);
    colA.lerp(colB.set(PAL.wetSand), w * 0.8);
    const mid = smoothstep(WATER_Y - 0.1, WATER_Y - 2.2, h);
    colA.lerp(BIO.seaMid, mid * 0.85);
    colA.lerp(BIO.seaDeep, smoothstep(WATER_Y - 2.2, WATER_Y - 6.5, h));
  }
  // ── rock on steep ground and on the cliffs; grass tops stay green ──
  const rock = smoothstep(0.42, 0.78, slope) * (1 - snowCover * 0.9);
  if (rock > 0) {
    colB.copy(BIO.rockWarm).lerp(BIO.rockCool, vnoise(x / 17, z / 17, 24));
    colB.multiplyScalar(0.88 + 0.24 * vnoise(x / 5, z / 5, 25));
    colA.lerp(colB, rock);
  }
  if (h > 24 && dSum > SUMMIT.shelfR1) colA.lerp(colB.set('#8fdc62'), smoothstep(24, 27, h) * (1 - rock));
  // a little speckle so big fields are never flat
  const sp = 0.95 + 0.1 * vnoise(x * 1.7, z * 1.7, 21);
  out.copy(colA).multiplyScalar(sp);
}

function buildChunk(cx: number, cz: number): THREE.Mesh {
  const step = HF.step * 2;
  const x0 = -GROUND + cx * TERRAIN_CHUNK, z0 = -GROUND + cz * TERRAIN_CHUNK;
  const n = Math.round(TERRAIN_CHUNK / step);
  const verts = (n + 1) * (n + 1);
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const c = new THREE.Color();
  const nrm = { x: 0, y: 1, z: 0 };
  let k = 0;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const h = terrainHeight(x, z);
      const e = 2;
      const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
      const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
      const l = Math.hypot(dx, 2 * e, dz);
      nrm.x = -dx / l;
      nrm.y = (2 * e) / l;
      nrm.z = -dz / l;
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
      nor[k] = nrm.x;
      nor[k + 1] = nrm.y;
      nor[k + 2] = nrm.z;
      terrainColor(x, z, h, Math.hypot(dx, dz) / (2 * e), c);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
      k += 3;
    }
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e2 = d + 1;
      idx.push(a, d, b, b, d, e2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  const m = new THREE.Mesh(g, terrainMat);
  m.receiveShadow = true;
  m.userData.cx = x0 + TERRAIN_CHUNK / 2;
  m.userData.cz = z0 + TERRAIN_CHUNK / 2;
  return m;
}
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
// v3: painterly mottling finer than the 4 m vertex colours: three octaves of cheap value noise in world space
// nudge the brightness (and a touch of warmth) so a big lawn reads as brush strokes, not a flat fill.
terrainMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainW = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vTerrainW;
      float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float tn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(th(i), th(i + vec2(1.0, 0.0)), f.x), mix(th(i + vec2(0.0, 1.0)), th(i + vec2(1.0, 1.0)), f.x), f.y); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 q = vTerrainW.xz;
        float n = tn(q * 0.16) * 0.5 + tn(q * 0.62 + 7.3) * 0.32 + tn(q * 2.3 + 3.1) * 0.18;
        float far = 1.0 - smoothstep(60.0, 220.0, length(cameraPosition - vTerrainW));
        diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.34 * mix(0.45, 1.0, far);
        diffuseColor.r *= 1.0 + (n - 0.5) * 0.06;
      }`);
};

// ── road geometry helpers ───────────────────────────────────────────────────
/** Re-sample a polyline so no step is longer than `max`. */
function resample(pts: [number, number][], max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / max));
    for (let k = 0; k < m; k++) out.push([x0 + ((x1 - x0) * k) / m, z0 + ((z1 - z0) * k) / m]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

interface Sample { x: number; z: number; tx: number; tz: number; s: number }
function samples(pts: [number, number][]): Sample[] {
  const out: Sample[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    out.push({ x: pts[i][0], z: pts[i][1], tx, tz, s });
  }
  return out;
}

/** Ribbon geometry draped on the ground (+ lift). Offsets are lateral from the centre line. */
function ribbon(
  soup: Soup, sm: Sample[], off0: number, off1: number, lift: number, col: string, uvScale = 1 / 8, skip?: (s: Sample) => boolean, laneW = 1.5,
): void {
  const nrm = { x: 0, y: 1, z: 0 };
  const vert = (s: Sample, off: number): number[] => {
    const x = s.x - s.tz * off, z = s.z + s.tx * off;
    return [x, paveHeight(x, z) + lift, z];
  };
  // split wide ribbons across their width too, so a road hugs a cross-slope instead of
  // bridging it with one flat chord (walkers' feet are on the terrain, not the chord)
  const lanes = Math.max(1, Math.ceil(Math.abs(off1 - off0) / laneW));
  for (let i = 0; i < sm.length - 1; i++) {
    const a = sm[i], b = sm[i + 1];
    if (skip && (skip(a) || skip(b))) continue;
    groundNormal((a.x + b.x) / 2, (a.z + b.z) / 2, nrm);
    for (let k = 0; k < lanes; k++) {
      const v0 = k / lanes, v1 = (k + 1) / lanes;
      const o0 = off0 + (off1 - off0) * v0, o1 = off0 + (off1 - off0) * v1;
      const p0 = vert(a, o0), p1 = vert(a, o1), p2 = vert(b, o1), p3 = vert(b, o0);
      // same texture mapping as the single-quad ribbon: u runs a.s→b.s across the width, v 0→1 along
      const u0 = (a.s + (b.s - a.s) * v0) * uvScale, u1 = (a.s + (b.s - a.s) * v1) * uvScale;
      soup.quad(p0, p1, p2, p3, col, [nrm.x, nrm.y, nrm.z], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }
  }
}

function roadMaterials(): Record<string, THREE.Material> {
  // textures are near-white grain; the material colour tints them
  const asphalt = new THREE.MeshStandardMaterial({
    map: noiseTexture('#e8e8e8', ['#f8f8f8', '#c4c4c4', '#d8d8d8'], 128, 0.18, 1), roughness: 0.92, color: PAL.asphalt,
  });
  const trail = new THREE.MeshStandardMaterial({ map: noiseTexture('#e8e8e8', ['#ffffff', '#bdbdbd'], 64, 0.2), roughness: 1, color: PAL.trail });
  const plank = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.65, color: PAL.wood });
  const marks = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return { asphalt, trail, plank, marks };
}

function offRoad(path: number): (s: Sample) => boolean {
  return (s) => nearestRoad(s.x, s.z, (p) => p !== ROAD_PATHS[path]).edge < 2.6;
}

/** Everything that lies on top of the terrain: roads, sidewalks, markings, crosswalks, plazas, lawns. */
function buildRoadwork(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roadwork';
  const mats = roadMaterials();
  const asphalt = new Soup(), trail = new Soup(), plank = new Soup(), marks = new Soup(), walks = new Soup();

  ROAD_PATHS.forEach((p: RoadPath, pi) => {
    const steep = !!p.elev;                                    // v3: a climbing road (the Lookout spiral) is sampled finer, so it hugs its embankment
    const sm = samples(resample(p.pts, steep ? 1.5 : 3));
    const soup = p.kind === 'trail' ? trail : p.kind === 'boardwalk' ? plank : asphalt;
    const col = '#ffffff';
    ribbon(soup, sm, -p.w / 2, p.w / 2, ROAD_LIFT, col, p.kind === 'boardwalk' ? 1 / 2.5 : 1 / 8, undefined, steep ? 1.0 : 1.5);
    if (p.kind === 'trail' || p.kind === 'boardwalk' || p.kind === 'drive') return;
    const junction = offRoad(pi);

    // centre line + edge lines
    if (p.lines !== 'none') {
      if (p.kind === 'street') {
        ribbon(marks, sm, -0.3, -0.16, ROAD_LIFT + 0.015, PAL.yellowLine, 1, junction);
        ribbon(marks, sm, 0.16, 0.3, ROAD_LIFT + 0.015, PAL.yellowLine, 1, junction);
      } else {
        // dashed single yellow (two samples on, one off)
        for (let i = 0; i < sm.length - 1; i++) {
          if (i % 3 === 2) continue;
          const seg = [sm[i], sm[i + 1]];
          ribbon(marks, seg, -0.15, 0.15, ROAD_LIFT + 0.015, PAL.yellowLine, 1, junction);
        }
      }
      ribbon(marks, sm, p.w / 2 - 0.55, p.w / 2 - 0.4, ROAD_LIFT + 0.015, PAL.white, 1, junction);
      ribbon(marks, sm, -p.w / 2 + 0.4, -p.w / 2 + 0.55, ROAD_LIFT + 0.015, PAL.white, 1, junction);
    }

    // sidewalks with a curb face
    if (p.walk) {
      for (const side of [-1, 1]) {
        const inner = side * (p.w / 2), outer = side * (p.w / 2 + SIDEWALK);
        const V = (s: Sample, off: number, lift: number): number[] => {
          const x = s.x - s.tz * off, z = s.z + s.tx * off;
          return [x, paveHeight(x, z) + lift, z];
        };
        for (let i = 0; i < sm.length - 1; i++) {
          const a = sm[i], b = sm[i + 1];
          if (junction(a) || junction(b)) continue;
          const t0 = V(a, inner, CURB_H), t1 = V(a, outer, CURB_H), t2 = V(b, outer, CURB_H), t3 = V(b, inner, CURB_H);
          walks.quad(t0, t1, t2, t3, PAL.sidewalk, [0, 1, 0]);
          // curb face (towards the road) + outer skirt
          const c0 = V(a, inner, ROAD_LIFT), c3 = V(b, inner, ROAD_LIFT);
          const o1 = V(a, outer, -0.25), o2 = V(b, outer, -0.25);
          walks.quad(c0, c3, t3, t0, PAL.curb, [side * a.tz, 0, -side * a.tx]);   // faces the road
          walks.quad(t1, t2, o2, o1, PAL.curb, [-side * a.tz, 0, side * a.tx]);  // faces away
        }
      }
    }
  });

  // crosswalks at every downtown junction arm
  const nodes: [number, number][] = [];
  for (const x of [-42, 0, 42]) for (const z of [-42, 0, 42]) nodes.push([x, z]);
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [nx, nz] of nodes)
    for (const [dx, dz] of dirs) {
      const d = ROAD_WIDTH / 2 + 2.2;
      if (!onRoad(nx + dx * (d + 4), nz + dz * (d + 4), -0.5)) continue;
      // stripes across the arm
      const cx = nx + dx * d, cz = nz + dz * d;
      const stripes = 8;
      for (let k = 0; k < stripes; k++) {
        const off = (k - (stripes - 1) / 2) * (ROAD_WIDTH / stripes) * 0.98;
        const sx = cx + (dz !== 0 ? off : 0), sz = cz + (dx !== 0 ? off : 0);
        const hw = dx !== 0 ? 1.4 : 0.42, hd = dz !== 0 ? 1.4 : 0.42;
        const y = paveHeight(sx, sz) + ROAD_LIFT + 0.015;
        marks.quad([sx - hw, y, sz - hd], [sx - hw, y, sz + hd], [sx + hw, y, sz + hd], [sx + hw, y, sz - hd], PAL.white, [0, 1, 0]);
      }
    }

  if (!asphalt.empty) g.add(mk(asphalt.geometry(true), mats.asphalt));
  if (!trail.empty) g.add(mk(trail.geometry(true), mats.trail));
  if (!plank.empty) g.add(mk(plank.geometry(true), mats.plank));
  if (!walks.empty) {
    const w = mk(walks.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    w.castShadow = false;
    g.add(w);
  }
  if (!marks.empty) g.add(mk(marks.geometry(), mats.marks));

  // paved plazas and plot lawns
  const paved = new Soup();
  for (const r of PAVED) {
    const col = r.id === 'skate_plaza' ? '#9a98a2' : r.id === 'lookout_top' ? '#bdb7ab' : r.id === 'beach_plaza' ? '#d8c9a0' : r.id === 'yard_lot' ? '#8f8c96' : PAL.concrete;
    const n = Math.max(1, Math.ceil(r.w / 6)), m = Math.max(1, Math.ceil(r.d / 6));
    for (let j = 0; j < m; j++)
      for (let i = 0; i < n; i++) {
        const xa = r.x - r.w / 2 + (r.w * i) / n, xb = r.x - r.w / 2 + (r.w * (i + 1)) / n;
        const za = r.z - r.d / 2 + (r.d * j) / m, zb = r.z - r.d / 2 + (r.d * (j + 1)) / m;
        const P = (x: number, z: number): number[] => [x, paveHeight(x, z) + 0.035, z];
        paved.quad(P(xa, za), P(xa, zb), P(xb, zb), P(xb, za), col, [0, 1, 0]);
      }
  }
  const lawns = new Soup();
  for (const p of PLOTS) {
    const s = p.size / 2 + 0.6;
    lawns.quad([p.center.x - s, 0.03, p.center.z - s], [p.center.x - s, 0.03, p.center.z + s], [p.center.x + s, 0.03, p.center.z + s], [p.center.x + s, 0.03, p.center.z - s], '#7fc267', [0, 1, 0]);
  }
  const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  if (!paved.empty) g.add(mk(paved.geometry(), flat));
  if (!lawns.empty) g.add(mk(lawns.geometry(), flat));
  return g;
}

function mk(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

// ── water ───────────────────────────────────────────────────────────────────
// v3: one stylized water material for the whole sea, the lake, the grove pond and the lazy river.
//  - the surface is flat cells (12 m) whose height is displaced in the vertex shader with EXACTLY
//    heightfield.waveY (a swimmer floats on what is drawn);
//  - the colour, the see-through shallows and the white foam that laps at every shore come from a
//    small height texture of the terrain (2 m texels), so they are exact per pixel at any cell size.
export interface WaterBody {
  mesh: THREE.Mesh;
  update(t: number): void;
}

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uFlat;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);                 // (the open-ocean strips are offset meshes: work in world space)
    float a = sin(wp.x * 0.11 + uTime * 1.1), b = sin(wp.z * 0.13 - uTime * 0.8), c = sin((wp.x + wp.z) * 0.2 + uTime * 1.7);
    wp.y = ${WATER_Y.toFixed(3)} + (1.0 - uFlat) * 0.06 * (a + b + 0.5 * c);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uHeights;
  uniform vec3 uShallow, uMid, uDeep, uSky, uSun, uFoam;
  uniform vec3 uSunDir;
  uniform float uGround;
  uniform float uFoamAmount;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    vec2 uv = (vWorld.xz + vec2(uGround)) / (2.0 * uGround);
    float terrH = texture2D(uHeights, uv).r;
    float depth = ${WATER_Y.toFixed(3)} - terrH;          // metres of water over the floor (negative: dry land under the plane)
    float t = uTime;
    // wave slopes (the three swells of waveY, exaggerated, plus a fine glittering ripple)
    float dx = 0.06 * (0.11 * cos(vWorld.x * 0.11 + t * 1.1) + 0.1 * cos((vWorld.x + vWorld.z) * 0.2 + t * 1.7));
    float dz = 0.06 * (0.13 * cos(vWorld.z * 0.13 - t * 0.8) + 0.1 * cos((vWorld.x + vWorld.z) * 0.2 + t * 1.7));
    float near = 1.0 - smoothstep(30.0, 150.0, length(cameraPosition - vWorld));   // fine ripples fade with distance (no shimmer on the horizon)
    dx = dx * 4.0 + near * (0.05 * cos(vWorld.x * 0.8 + vWorld.z * 0.35 + t * 2.3) + 0.03 * cos(vWorld.x * 1.7 - vWorld.z * 1.1 - t * 3.1));
    dz = dz * 4.0 + near * (0.05 * cos(vWorld.z * 0.9 - vWorld.x * 0.3 + t * 2.0) + 0.03 * cos(vWorld.z * 1.6 + vWorld.x * 1.2 + t * 2.7));
    vec3 N = normalize(vec3(-dx, 1.0, -dz));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    // body colour by depth: sunlit aqua shallows, turquoise, then deep blue
    float k = clamp(depth / 5.0, 0.0, 1.0);
    vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.35, k));
    col = mix(col, uDeep, smoothstep(0.3, 1.0, k));
    col = mix(col, uSky, fres * 0.55);
    // sun glints
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 140.0) * 1.3 + pow(max(dot(N, H), 0.0), 18.0) * 0.12;
    col += uSun * spec;
    // foam: a bright line right at the shore, lapping bands that creep up and fade back with the swell
    float lap = 0.5 + 0.5 * sin(t * 0.9 + vWorld.x * 0.045 + vWorld.z * 0.06);
    float reach = mix(0.35, 1.1, lap) * uFoamAmount;
    float wob = sin(vWorld.x * 0.37 + sin(vWorld.z * 0.21) * 2.3) * 0.5 + 0.5;
    float band = smoothstep(reach + 0.2, 0.0, depth + wob * 0.2);
    float streak = smoothstep(0.3, 0.75, sin(depth * 9.0 - t * 1.5 + wob * 5.0) * 0.5 + 0.5);
    float foam = band * (0.4 + 0.6 * mix(0.5, streak, near)) + smoothstep(0.16, 0.0, depth) * 0.9;
    foam = clamp(foam, 0.0, 1.0);
    col = mix(col, uFoam, foam);
    float alpha = mix(0.38, 0.97, smoothstep(0.0, 2.4, depth));
    alpha = max(alpha, foam * 0.95) * smoothstep(-0.04, 0.1, depth);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

let heightTex: THREE.DataTexture | null = null;
/** The terrain height (metres) over the whole ground square, 2 m texels (half floats: filterable on iPad). */
function terrainHeightTexture(): THREE.DataTexture {
  if (heightTex) return heightTex;
  const W = Math.round(GROUND), data = new Uint16Array(W * W);
  const cell = (GROUND * 2) / W;
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) data[j * W + i] = THREE.DataUtils.toHalfFloat(terrainHeight(-GROUND + (i + 0.5) * cell, -GROUND + (j + 0.5) * cell));
  const t = new THREE.DataTexture(data, W, W, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  heightTex = t;
  return t;
}

function waterMaterial(flat: boolean): THREE.ShaderMaterial {
  const a = tuning.art;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 }, uFlat: { value: flat ? 1 : 0 }, uHeights: { value: terrainHeightTexture() }, uGround: { value: GROUND },
      uShallow: { value: new THREE.Color(a.waterShallow) }, uMid: { value: new THREE.Color(a.waterMid) }, uDeep: { value: new THREE.Color(a.waterDeep) },
      uSky: { value: new THREE.Color(a.waterSky) }, uSun: { value: new THREE.Color(a.sunColor) }, uFoam: { value: new THREE.Color(a.waterFoam) },
      uSunDir: { value: sunDirection() }, uFoamAmount: { value: a.waterFoamAmount },
    },
  ]);
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: true });
  return m;
}

function buildWater(): WaterBody & { far: THREE.Mesh[] } {
  const STEP = 12;
  const n = Math.round((GROUND * 2) / STEP);
  const x0 = -GROUND;
  const vid = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const P: number[] = [], idx: number[] = [];
  const need = (i: number, j: number): number => {
    const k = j * (n + 1) + i;
    if (vid[k] >= 0) return vid[k];
    const id = P.length / 3;
    vid[k] = id;
    P.push(x0 + i * STEP, WATER_Y, x0 + j * STEP);
    return id;
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      // a cell is water if any of 9 samples dips near or below the surface (a flat cell over land is hidden by the land anyway)
      let m = 1e9;
      for (let b = 0; b <= 2; b++)
        for (let a = 0; a <= 2; a++) m = Math.min(m, terrainHeight(x0 + (i + a / 2) * STEP, x0 + (j + b / 2) * STEP));
      if (m > WATER_Y + 0.6) continue;
      const a = need(i, j), b = need(i + 1, j), c = need(i, j + 1), d = need(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  const mat = waterMaterial(false);
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'water';
  // the open ocean beyond the terrain square: four flat strips with the same look
  const far: THREE.Mesh[] = [];
  const flat = waterMaterial(true);
  const R = 2400, E = GROUND;
  for (const [cx, cz, w, d] of [[0, -E - R / 2, 2 * R + 2 * E, R], [0, E + R / 2, 2 * R + 2 * E, R], [-E - R / 2, 0, R, 2 * E], [E + R / 2, 0, R, 2 * E]] as number[][]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2), flat);
    p.position.set(cx, WATER_Y, cz);
    p.renderOrder = 2;
    p.frustumCulled = false;
    far.push(p);
  }
  return {
    mesh,
    far,
    update(t: number) {
      mat.uniforms.uTime.value = t;
      flat.uniforms.uTime.value = t;
    },
  };
}

// ── the whole ground ────────────────────────────────────────────────────────
export interface Terrain {
  group: THREE.Group;
  chunks: THREE.Mesh[];
  roadwork: THREE.Group;
  water: WaterBody;
}

export function buildTerrain(): Terrain {
  const group = new THREE.Group();
  group.name = 'terrain';
  // beyond the terrain square: the deep sea floor, so the horizon is never a void (the water strips sit above it)
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: tuning.art.waterDeep, fog: true }),
  );
  far.position.y = WATER_Y - 9;
  group.add(far);

  const chunks: THREE.Mesh[] = [];
  for (let cz = 0; cz < TERRAIN_CHUNK_N; cz++)
    for (let cx = 0; cx < TERRAIN_CHUNK_N; cx++) {
      const m = buildChunk(cx, cz);
      chunks.push(m);
      group.add(m);
    }
  const roadwork = buildRoadwork();
  group.add(roadwork);
  const water = buildWater();
  group.add(water.mesh);
  for (const f of water.far) group.add(f);
  return { group, chunks, roadwork, water };
}
