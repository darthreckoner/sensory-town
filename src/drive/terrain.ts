// Ground, lawns, roads, raised rounded sidewalks, lane dashes and crosswalks.
// Everything here is static, so it is built once as a handful of merged meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND, PLOTS, ROADS, type Rect } from '../world/townLayout';
import { toyMat } from '../art/materials';
import { roundedRectShape, smoothstep, valueNoise } from './envUtils';

export const ROAD_Y = 0.05;
export const WALK_Y = 0.16;
export const SIDEWALK = 0.9;

const GRASS_EDGE = '#b3e59d';

/** Surface height under a point: 0 on the lawn, a hair above on the road, a curb higher on the sidewalk. */
export function groundHeight(x: number, z: number): number {
  let h = 0;
  for (const r of ROADS) {
    const dx = Math.abs(x - r.x) - r.w / 2, dz = Math.abs(z - r.z) - r.d / 2;
    if (dx <= 0 && dz <= 0) return ROAD_Y;
    if (dx <= SIDEWALK && dz <= SIDEWALK) h = WALK_Y;
  }
  return h;
}

/** Soft grass with gentle colour variation baked into vertex colours. */
function buildGround(): THREE.Mesh {
  const size = GROUND * 2;
  const seg = 70;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const deep = new THREE.Color('#a4e09a');
  const light = new THREE.Color('#bdeaa3');
  const sun = new THREE.Color('#d2f1a9');
  const edge = new THREE.Color(GRASS_EDGE);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n1 = valueNoise(x * 0.07, z * 0.07, 3);
    const n2 = valueNoise(x * 0.23 + 40, z * 0.23 - 17, 9);
    c.copy(deep).lerp(light, n1);
    c.lerp(sun, smoothstep(0.55, 0.95, n2) * 0.55);
    const e = Math.max(Math.abs(x), Math.abs(z));
    c.lerp(edge, smoothstep(GROUND - 14, GROUND - 1, e));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

/** Light rounded lawn squares where houses can be built. */
function buildPlotLawns(): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of PLOTS) {
    const g = new THREE.ShapeGeometry(roundedRectShape(p.size, p.size, 0.9), 6);
    g.rotateX(-Math.PI / 2);
    g.translate(p.center.x, 0.03, p.center.z);
    geos.push(g);
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false), toyMat('#e0f6cc', 'matte'));
  m.receiveShadow = true;
  return m;
}

// ── roads + sidewalks via a compressed grid ─────────────────────────────────
const inRect = (r: Rect, x: number, z: number, pad = 0): boolean =>
  Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;

class QuadSink {
  readonly p: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[]): void {
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.computeVertexNormals();
    return g;
  }
}

function buildRoads(): THREE.Group {
  const xs = new Set<number>(), zs = new Set<number>();
  for (const r of ROADS) {
    for (const k of [0, SIDEWALK]) {
      xs.add(r.x - r.w / 2 - k);
      xs.add(r.x + r.w / 2 + k);
      zs.add(r.z - r.d / 2 - k);
      zs.add(r.z + r.d / 2 + k);
    }
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const nx = X.length - 1, nz = Z.length - 1;
  // 0 = nothing, 1 = road, 2 = sidewalk
  const type: number[][] = [];
  for (let i = 0; i < nx; i++) {
    type.push([]);
    for (let j = 0; j < nz; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      type[i].push(ROADS.some((r) => inRect(r, cx, cz)) ? 1 : ROADS.some((r) => inRect(r, cx, cz, SIDEWALK)) ? 2 : 0);
    }
  }
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : type[i][j]);

  const road = new QuadSink();
  const walk = new QuadSink();
  const run = 0.14;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const t = type[i][j];
      if (!t) continue;
      const x0 = X[i], x1 = X[i + 1], z0 = Z[j], z1 = Z[j + 1];
      if (t === 1) {
        road.quad([x0, ROAD_Y, z0], [x0, ROAD_Y, z1], [x1, ROAD_Y, z1], [x1, ROAD_Y, z0]);
        continue;
      }
      walk.quad([x0, WALK_Y, z0], [x0, WALK_Y, z1], [x1, WALK_Y, z1], [x1, WALK_Y, z0]);
      // Soft rounded curb on every side that faces lower ground.
      const sides: [number, number, number, number][] = [
        [-1, 0, i - 1, j],
        [1, 0, i + 1, j],
        [0, -1, i, j - 1],
        [0, 1, i, j + 1],
      ];
      for (const [dx, dz, ni, nj] of sides) {
        const nt = at(ni, nj);
        if (nt === 2) continue;
        const low = nt === 1 ? ROAD_Y : 0;
        // Edge endpoints along the shared side.
        const ex = dx < 0 ? x0 : x1, ez = dz < 0 ? z0 : z1;
        const a = dx !== 0 ? [ex, z0] : [x0, ez];
        const b = dx !== 0 ? [ex, z1] : [x1, ez];
        let prevO = 0, prevY = WALK_Y;
        for (let s = 1; s <= 3; s++) {
          const ang = (s / 3) * (Math.PI / 2);
          const o = run * Math.sin(ang);
          const y = WALK_Y - (WALK_Y - low) * (1 - Math.cos(ang));
          const p0 = [a[0] + dx * prevO, prevY, a[1] + dz * prevO];
          const p1 = [b[0] + dx * prevO, prevY, b[1] + dz * prevO];
          const p2 = [b[0] + dx * o, y, b[1] + dz * o];
          const p3 = [a[0] + dx * o, y, a[1] + dz * o];
          walk.quad(p0, p1, p2, p3);
          prevO = o;
          prevY = y;
        }
      }
    }

  const g = new THREE.Group();
  const roadMesh = new THREE.Mesh(road.geometry(), new THREE.MeshStandardMaterial({ color: '#a39eba', roughness: 0.9, side: THREE.DoubleSide }));
  roadMesh.receiveShadow = true;
  const walkMesh = new THREE.Mesh(walk.geometry(), new THREE.MeshStandardMaterial({ color: '#f5eef8', roughness: 0.85, side: THREE.DoubleSide }));
  walkMesh.receiveShadow = true;
  walkMesh.castShadow = false;
  g.add(roadMesh, walkMesh, buildMarkings());
  return g;
}

/** White dashed centre lines and zebra crossings. */
function buildMarkings(): THREE.Mesh {
  const q = new QuadSink();
  const y = ROAD_Y + 0.012;
  const rect = (cx: number, cz: number, w: number, d: number): void => {
    q.quad([cx - w / 2, y, cz - d / 2], [cx - w / 2, y, cz + d / 2], [cx + w / 2, y, cz + d / 2], [cx + w / 2, y, cz - d / 2]);
  };
  const crossings: { x: number; z: number; along: 'x' | 'z' }[] = [
    { x: -6.5, z: 0, along: 'x' },   // across the cross street
    { x: 20, z: 0, along: 'x' },
    { x: -30, z: 14, along: 'z' },   // across the west ring road
  ];
  const nearCrossing = (x: number, z: number): boolean =>
    crossings.some((c) => Math.abs(x - c.x) < 2.6 && Math.abs(z - c.z) < 2.6);

  for (const r of ROADS) {
    const horiz = r.w >= r.d;
    const len = horiz ? r.w : r.d;
    if (len < 20) continue; // driveways have no centre line
    const n = Math.floor(len / 3.4);
    for (let k = 0; k < n; k++) {
      const t = -len / 2 + 1.7 + k * 3.4 + 0.2;
      const cx = horiz ? r.x + t : r.x;
      const cz = horiz ? r.z : r.z + t;
      // Skip anywhere another road crosses (intersections) and at crossings.
      if (ROADS.some((o) => o !== r && inRect(o, cx, cz, 2.2))) continue;
      if (nearCrossing(cx, cz)) continue;
      if (horiz) rect(cx, cz, 1.7, 0.22);
      else rect(cx, cz, 0.22, 1.7);
    }
  }
  for (const c of crossings) {
    const bars = 6;
    for (let k = 0; k < bars; k++) {
      const off = (k - (bars - 1) / 2) * 0.95;
      if (c.along === 'x') rect(c.x, c.z + off, 2.6, 0.55);
      else rect(c.x + off, c.z, 0.55, 2.6);
    }
  }
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(q.geometry(), mat);
  m.receiveShadow = true;
  return m;
}

export function buildTerrain(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'terrain';
  // Endless lawn under everything so the horizon is never a void.
  const outer = new THREE.Mesh(new THREE.CircleGeometry(340, 48).rotateX(-Math.PI / 2), toyMat(GRASS_EDGE, 'matte'));
  outer.position.y = -0.06;
  outer.receiveShadow = true;
  g.add(outer, buildGround());
  const lawns = buildPlotLawns();
  if (lawns) g.add(lawns);
  g.add(buildRoads());
  return g;
}
