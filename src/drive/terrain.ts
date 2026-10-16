// The ground of the big map: chunked heightfield terrain with vertex colours
// (grass, sand, rock, urban concrete), asphalt / trail / boardwalk ribbons that
// follow the hills, sidewalks with curbs, road markings and crosswalks, plot
// lawns, paved plazas, and the sea + lake (a clipped, animated water mesh).
import * as THREE from 'three';
import {
  BOUNDS, GROUND, PAVED, PLOTS, ROAD_PATHS, ROAD_WIDTH, SIDEWALK, WATER_Y, nearestRoad, onRoad, type RoadPath,
} from '../world/townLayout';
import { HF, coastX, groundNormal, paveHeight, terrainHeight, vnoise, waveY } from '../world/heightfield';
import { PAL } from './palette';
import { clamp, smoothstep } from './envUtils';

export const ROAD_LIFT = 0.05;
export const CURB_H = 0.14;
export const CHUNK = 72;
const CHUNK_N = Math.ceil((GROUND * 2) / CHUNK);

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

function terrainColor(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
  const n1 = vnoise(x / 14, z / 14, 11);
  const n2 = vnoise(x / 4.5, z / 4.5, 12);
  colA.set(PAL.grass[0]).lerp(colB.set(PAL.grass[1]), n1).lerp(colC.set(PAL.grass[2]), n2 * 0.5);
  // calm lush park
  const park = softRect(x, z, 85, -104, 50, 40, 16);
  if (park > 0) colA.lerp(colB.set('#4a9a3f'), park * 0.55);
  // tidy lawns in Home Hills
  const home = softRect(x, z, -102, 3, 46, 46, 12);
  if (home > 0) colA.lerp(colB.set(PAL.lawn), home * 0.85);
  // concrete under downtown
  const urban = softRect(x, z, 0, 0, 48, 48, 12);
  if (urban > 0) colA.lerp(colB.set('#8d8b96'), urban * 0.9);
  // beach sand
  const d = x - coastX(z);
  const sandW = smoothstep(-34, -22, d) * smoothstep(-74, -58, z);
  if (sandW > 0) colA.lerp(colB.set(PAL.sand), sandW);
  // wet sand and sea floor
  if (h < WATER_Y + 0.5) {
    const w = smoothstep(WATER_Y + 0.5, WATER_Y - 0.1, h);
    colA.lerp(colB.set(PAL.wetSand), w * 0.8);
    const deep = smoothstep(WATER_Y - 0.3, WATER_Y - 1.5, h);
    colA.lerp(colB.set('#4d7f80'), deep);
  }
  // rock on steep ground, lighter lawn on the lookout top
  const rock = smoothstep(0.42, 0.75, slope);
  if (rock > 0) colA.lerp(colB.set(PAL.rock), rock);
  if (h > 24) colA.lerp(colB.set('#86b05a'), smoothstep(24, 27, h) * (1 - rock));
  // a little speckle so big fields are never flat
  const s = 0.94 + 0.12 * vnoise(x * 1.7, z * 1.7, 21);
  out.copy(colA).multiplyScalar(s);
}

function buildChunk(cx: number, cz: number): THREE.Mesh {
  const step = HF.step * 2;
  const x0 = -GROUND + cx * CHUNK, z0 = -GROUND + cz * CHUNK;
  const n = Math.round(CHUNK / step);
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
  m.userData.cx = x0 + CHUNK / 2;
  m.userData.cz = z0 + CHUNK / 2;
  return m;
}
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });

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
  soup: Soup, sm: Sample[], off0: number, off1: number, lift: number, col: string, uvScale = 1 / 8, skip?: (s: Sample) => boolean,
): void {
  const nrm = { x: 0, y: 1, z: 0 };
  const vert = (s: Sample, off: number): number[] => {
    const x = s.x - s.tz * off, z = s.z + s.tx * off;
    return [x, paveHeight(x, z) + lift, z];
  };
  // split wide ribbons across their width too, so a road hugs a cross-slope instead of
  // bridging it with one flat chord (walkers' feet are on the terrain, not the chord)
  const lanes = Math.max(1, Math.ceil(Math.abs(off1 - off0) / 1.5));
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
    const sm = samples(resample(p.pts, 3));
    const soup = p.kind === 'trail' ? trail : p.kind === 'boardwalk' ? plank : asphalt;
    const col = '#ffffff';
    ribbon(soup, sm, -p.w / 2, p.w / 2, ROAD_LIFT, col, p.kind === 'boardwalk' ? 1 / 2.5 : 1 / 8);
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
export interface WaterBody {
  mesh: THREE.Mesh;
  update(t: number): void;
}

function buildWater(): WaterBody {
  const STEP = 3;
  const n = Math.round((GROUND * 2) / STEP);
  const x0 = -GROUND;
  const has = new Uint8Array(n * n);
  const h = (i: number, j: number): number => terrainHeight(x0 + i * STEP, x0 + j * STEP);
  const vid = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const P: number[] = [], C: number[] = [];
  const idx: number[] = [];
  const need = (i: number, j: number): number => {
    const k = j * (n + 1) + i;
    if (vid[k] >= 0) return vid[k];
    const id = P.length / 3;
    vid[k] = id;
    const x = x0 + i * STEP, z = x0 + j * STEP;
    P.push(x, WATER_Y, z);
    const depth = WATER_Y - terrainHeight(x, z);
    const shallow = 1 - clamp(depth / 2.2, 0, 1);
    // deep teal → turquoise shallows → white foam at the edge
    colA.set('#1d6f86').lerp(colB.set('#35c1c9'), Math.pow(shallow, 0.8));
    const foam = clamp(1 - Math.abs(depth - 0.1) / 0.55, 0, 1) * 0.65;
    colA.lerp(colB.set('#ffffff'), foam);
    C.push(colA.r, colA.g, colA.b, clamp(0.97 - shallow * 0.42 + foam * 0.2, 0.3, 1));
    return id;
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const m = Math.min(h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1));
      if (m > WATER_Y + 0.3) continue;
      has[j * n + i] = 1;
      const a = need(i, j), b = need(i + 1, j), c = need(i, j + 1), d = need(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(P);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(P.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, transparent: true, roughness: 0.12, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  mesh.receiveShadow = false;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const count = pos.length / 3;
  return {
    mesh,
    update(t: number) {
      for (let i = 0; i < count; i++) {
        const x = pos[i * 3], z = pos[i * 3 + 2];
        pos[i * 3 + 1] = waveY(x, z, t); // the same surface a swimmer floats on
        const dx = 0.06 * (0.11 * Math.cos(x * 0.11 + t * 1.1) + 0.1 * Math.cos((x + z) * 0.2 + t * 1.7));
        const dz = 0.06 * (0.13 * Math.cos(z * 0.13 - t * 0.8) + 0.1 * Math.cos((x + z) * 0.2 + t * 1.7));
        const l = Math.hypot(dx, 1, dz);
        nor.setXYZ(i, -dx / l, 1 / l, -dz / l);
      }
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      nor.needsUpdate = true;
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
  // an endless plain + ocean under everything so the horizon is never a void
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#6aa352', roughness: 1 }),
  );
  far.position.y = -2.4;
  far.receiveShadow = false;
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 1600).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#1f7087', roughness: 0.25 }),
  );
  ocean.position.set(GROUND + 440, WATER_Y - 0.05, 0);
  group.add(far, ocean);

  const chunks: THREE.Mesh[] = [];
  for (let cz = 0; cz < CHUNK_N; cz++)
    for (let cx = 0; cx < CHUNK_N; cx++) {
      const m = buildChunk(cx, cz);
      chunks.push(m);
      group.add(m);
    }
  const roadwork = buildRoadwork();
  group.add(roadwork);
  const water = buildWater();
  group.add(water.mesh);
  void BOUNDS;
  return { group, chunks, roadwork, water };
}
