// The town map as pure data (v2 — "the big map"). Shared by the Drive scene, the
// Build scene and anything that needs to know where things are.
// World units; +x east, +z south; 1 unit ≈ 1 metre. Heading 0 = facing -z (north).
//
// v3: an ISLAND. Sea on every side (beaches, some cliffs); nothing invisible at the edge.
//
//                      Sprinkle Summit (N)  snowy peak + ski lodge
//   Lookout Hill (NW)                                  Park & Lake (NE)
//        spiral road up to a viewpoint                   lake + bridge + maze
//   Home Hills (W)         DOWNTOWN (centre)       Sandcastle Bay (E, a bay with a pier)
//        12 build lots       Studio · shops · mall         sea, boardwalk, lighthouse
//   Glow Grove (SW)       Skate & Stunt Park (S)        Sunny Sands (SE) desert + lazy river
//                         Bloom Meadow (far S)  windmills + a balloon
//
// Heights (hills, the lake, the sea, ramps, bridges) live in ./heightfield.ts,
// which reads the data below.
import { tuning } from '../tuning';

export interface Rect { x: number; z: number; w: number; d: number } // center + size
export interface Plot { index: number; center: { x: number; z: number }; origin: { x: number; z: number }; size: number }
export interface Landmark { id: string; name: string; icon: string; x: number; z: number; radius: number }
export interface Spot { id: string; name: string; icon: string; x: number; z: number }
export interface District { id: string; name: string; icon: string; x: number; z: number; radius: number }
export interface Charm { id: string; x: number; z: number; y?: number }

export const ROAD_WIDTH = 10;  // downtown streets
export const SIDEWALK = 2.4;   // sidewalk width beside walkable streets
export const BOUNDS = 412;     // v3: half-size of the world. The island sits well inside it: the sea IS the edge (this only stops a very long swim)
export const GROUND = 420;     // terrain mesh half-size (deep sea beyond the island, a far ocean plane beyond that)
export const WATER_Y = -0.35;  // sea / lake surface

// ── v3 island shape + new places (read by heightfield.ts, terrain.ts and the POI builders) ──
/** The land is the smooth union of these discs (x, z, radius to the waterline), minus the bay on the east side. */
export interface IslandDisc { x: number; z: number; r: number }
export const ISLAND_DISCS: IslandDisc[] = [
  { x: -40, z: -10, r: 200 },    // the main body: downtown, Home Hills, the skate park
  { x: -95, z: -125, r: 116 },   // Lookout Hill
  { x: 100, z: -105, r: 95 },    // Giggle Gardens
  { x: 62, z: -250, r: 108 },    // Sprinkle Summit
  { x: 62, z: -178, r: 104 },    // the foothills and the ski lodge's flat (a fat neck between the park and the peak)
  { x: 150, z: 140, r: 84 },     // Sunny Sands
  { x: 30, z: 190, r: 84 },      // Bloom Meadow
  { x: -150, z: 125, r: 84 },    // Glow Grove
];
/** Sandcastle Bay: east of coastX(z) is sea for z between these (fading over `fade` metres at each end). */
export const BAY = { z0: -52, z1: 66, fade: 14 };

/** Sprinkle Summit: a steep snowy peak on a gently sloping shelf, a ski lodge on a flat pad reached by a road. */
export const SUMMIT = {
  x: 62, z: -262, shelf: 12, peak: 62, peakR: 92, shelfR0: 92, shelfR1: 158,
  pad: { x: 62, z: -166, r: 30, h: 11.2 },
  lodge: { x: 62, z: -181, w: 28, d: 15 },     // front (door) faces south
};
/** Bloom Meadow: rolling flower hills, windmills on the crests, a tethered hot-air balloon. */
export const MEADOW = {
  x: 30, z: 190, r: 84,
  windmills: [[6, 166], [62, 210], [-18, 216]] as [number, number][],
  balloon: { x: 44, z: 198 },
};
/** Glow Grove: a mossy forest with giant glowing mushrooms, fireflies and a little pond. */
export const GROVE = { x: -150, z: 125, r: 80, pond: { x: -131, z: 144, r: 13 } };
/** Sunny Sands: red dunes, rock arches and a lazy-river water park. */
export const SANDS = {
  x: 150, z: 140, r: 82,
  park: { x: 160, z: 150, ring: 23, w: 8 },       // the lazy river: a ring canal around a resort island
  arches: [[112, 178, 0.4], [196, 112, -0.9], [128, 112, 0.0]] as [number, number, number][],
};

// ── Road network ────────────────────────────────────────────────────────────
export type RoadKind = 'street' | 'road' | 'drive' | 'trail' | 'boardwalk';
export interface RoadPath {
  id: string;
  pts: [number, number][];      // polyline (densified)
  w: number;                    // carriageway width
  kind: RoadKind;
  walk?: boolean;               // sidewalks on both sides
  lines?: 'center' | 'dash' | 'none';
  /** Road-bed height per point (hill roads); omit to follow the terrain. */
  elev?: number[];
}

function densify(ctrl: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [x0, z0] = ctrl[i], [x1, z1] = ctrl[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** Catmull-Rom through control points, sampled every ~`step` units. */
function spline(ctrl: [number, number][], step = 4): [number, number][] {
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const out: [number, number][] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** A closed loop around (cx, cz): `n` points on a circle (first point repeated at the end). */
function loopPts(cx: number, cz: number, r: number, n = 40, a0 = 0): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i): [number, number] => [cx + Math.cos(a0 + (i / n) * Math.PI * 2) * r, cz + Math.sin(a0 + (i / n) * Math.PI * 2) * r]);
}

// Home Hills: the curvy spine street runs west from the end of Main Street.
export const HOME_SPINE_X0 = -62;
export const HOME_SPINE_X1 = -146;
const spineZ = (x: number): number => 3 + 6 * Math.sin((x + 62) / 24);
const HOME_ROAD_W = 8;

// The Lookout Hill spiral road (Archimedean, climbing counter-clockwise).
export const LOOKOUT = { x: -95, z: -122, radius: 76, plateau: 15, height: 28 };
const SPIRAL_T0 = Math.PI / 2;
const SPIRAL_TURN = 2.7 * Math.PI;
export const SPIRAL = { r0: 70, r1: 17, exp: 1.15 };
const SPIRAL_R0 = SPIRAL.r0;
const SPIRAL_R1 = SPIRAL.r1;
const spiralPts: [number, number][] = [];
const spiralElev: number[] = [];
{
  const n = 150;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = SPIRAL_T0 + t * SPIRAL_TURN;
    const r = SPIRAL_R0 + (SPIRAL_R1 - SPIRAL_R0) * t;
    spiralPts.push([LOOKOUT.x + Math.cos(a) * r, LOOKOUT.z + Math.sin(a) * r]);
    spiralElev.push(0.5 + (LOOKOUT.height - 0.9) * Math.pow(t, SPIRAL.exp));
  }
}

const homeSpine = Array.from({ length: 22 }, (_, i): [number, number] => {
  const x = HOME_SPINE_X0 - (i * (HOME_SPINE_X0 - HOME_SPINE_X1)) / 21;
  return [x, spineZ(x)];
});

export const ROAD_PATHS: RoadPath[] = [
  // ── downtown grid (sidewalks, yellow centre lines) ──
  { id: 'main', pts: densify([[-47, 0], [47, 0]], 6), w: ROAD_WIDTH, kind: 'street', walk: true, lines: 'center' },
  { id: 'center', pts: densify([[0, -47], [0, 47]], 6), w: ROAD_WIDTH, kind: 'street', walk: true, lines: 'center' },
  { id: 'ring_w', pts: densify([[-42, -42], [-42, 42]], 6), w: ROAD_WIDTH, kind: 'street', walk: true, lines: 'center' },
  { id: 'ring_e', pts: densify([[42, -42], [42, 42]], 6), w: ROAD_WIDTH, kind: 'street', walk: true, lines: 'center' },
  { id: 'ring_n', pts: densify([[-42, -42], [42, -42]], 6), w: ROAD_WIDTH, kind: 'street', walk: true, lines: 'center' },
  { id: 'ring_s', pts: densify([[-42, 42], [42, 42]], 6), w: ROAD_WIDTH, kind: 'street', walk: true, lines: 'center' },
  // the Studio plaza driveway: straight and wide, from Main Street right up to the pad
  { id: 'studio_drive', pts: densify([[21, -5], [21, -13]], 4), w: 9, kind: 'drive', lines: 'none' },
  // ── the big loop + country roads ──
  { id: 'main_e', pts: densify([[47, 0], [80, 0]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'center_n', pts: densify([[0, -47], [0, -62]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'north_rd', pts: densify([[0, -62], [80, -62]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'coast', pts: densify([[80, -62], [80, 70]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'south_rd', pts: densify([[-58, 70], [80, 70]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'center_s', pts: densify([[0, 47], [0, 70], [0, 82]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'west_rd', pts: densify([[-58, 0], [-47, 0]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  { id: 'home_link', pts: densify([[-58, 70], [-58, 40], [-58, 0]], 6), w: ROAD_WIDTH - 2, kind: 'road', lines: 'center' },
  // ── Home Hills ──
  { id: 'spine', pts: homeSpine, w: HOME_ROAD_W, kind: 'street', walk: true, lines: 'center' },
  { id: 'branch', pts: densify([[-100, spineZ(-100)], [-100, -30], [-99, -46]], 5), w: HOME_ROAD_W, kind: 'street', walk: true, lines: 'center' },
  { id: 'yard_rd', pts: densify([[-56, 0], [-56, 16]], 5), w: 6, kind: 'drive', lines: 'none' },
  // ── Lookout Hill ──
  { id: 'lookout_a', pts: densify([[-99, -46], [-96, -56], [spiralPts[0][0], spiralPts[0][1]]], 5), w: 8, kind: 'road', lines: 'center' },
  { id: 'lookout', pts: spiralPts, w: 8, kind: 'road', lines: 'center', elev: spiralElev },
  // ── Park & Lake ──
  { id: 'park_rd', pts: spline([[50, -62], [51, -75], [49, -88], [52, -100]], 4), w: 8, kind: 'road', lines: 'center' },
  { id: 'bridge_rd', pts: densify([[52, -100], [124, -100]], 6), w: 8, kind: 'road', lines: 'center' },
  { id: 'park_e', pts: spline([[124, -100], [132, -108], [136, -120], [136, -134]], 4), w: 7, kind: 'road', lines: 'center' },
  { id: 'trail_w', pts: spline([[49, -88], [38, -92], [30, -104], [38, -118], [58, -126], [80, -128]], 3), w: 2.8, kind: 'trail' },
  { id: 'trail_s', pts: spline([[60, -66], [74, -72], [92, -74], [108, -80], [122, -92]], 3), w: 2.8, kind: 'trail' },
  { id: 'trail_n', pts: spline([[80, -128], [100, -128], [116, -122], [126, -110]], 3), w: 2.8, kind: 'trail' },
  // ── Beach & Pier ──
  { id: 'boardwalk', pts: densify([[92, -52], [92, 66]], 6), w: 5, kind: 'boardwalk' },
  { id: 'beach_link', pts: densify([[80, 0], [92, 0]], 4), w: 5, kind: 'boardwalk' },
  // ── Skate Park ──
  { id: 'skate_in', pts: densify([[0, 82], [0, 96]], 6), w: ROAD_WIDTH - 1, kind: 'road', lines: 'center' },
  // ── v3 world: roads out to the new places ──
  // Sprinkle Summit: from the end of the park road north across the foothills to the ski lodge
  { id: 'summit_rd', pts: spline([[52, -100], [46, -116], [44, -132], [52, -146], [62, -158]], 4), w: 8, kind: 'road', lines: 'center' },
  // Bloom Meadow: south from the big loop's corner, then a loop round the windmill hills
  { id: 'meadow_rd', pts: spline([[80, 70], [84, 92], [78, 116], [66, 140], [52, 164], [40, 184], [32, 192]], 4), w: 8, kind: 'road', lines: 'center' },
  { id: 'meadow_loop', pts: loopPts(30, 190, 30, 40, 0.5), w: 7, kind: 'road', lines: 'dash' },
  // Sunny Sands: south-east to the resort, which has a ring road around the lazy river
  { id: 'sands_rd', pts: spline([[80, 70], [96, 84], [112, 100], [127, 117.5]], 4), w: 8, kind: 'road', lines: 'center' },
  { id: 'sands_loop', pts: loopPts(160, 150, 46, 48, 0.2), w: 7, kind: 'road', lines: 'dash' },
  // Glow Grove: west along the south edge of Home Hills, then a winding trail through the mushrooms
  { id: 'grove_rd', pts: spline([[-58, 70], [-86, 62], [-112, 72], [-134, 92], [-148, 110]], 4), w: 8, kind: 'road', lines: 'center' },
  { id: 'grove_trail', pts: spline([[-148, 110], [-168, 126], [-160, 148], [-136, 160], [-118, 146], [-128, 126], [-148, 110]], 3), w: 3.4, kind: 'trail' },
];

/** Axis-aligned straight roads as rectangles (kept for older callers). */
export const ROADS: Rect[] = ROAD_PATHS.filter((p) => p.pts.length >= 2 && p.kind !== 'trail')
  .flatMap((p) => {
    const out: Rect[] = [];
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [x0, z0] = p.pts[i], [x1, z1] = p.pts[i + 1];
      if (Math.abs(x1 - x0) < 1e-6) out.push({ x: x0, z: (z0 + z1) / 2, w: p.w, d: Math.abs(z1 - z0) });
      else if (Math.abs(z1 - z0) < 1e-6) out.push({ x: (x0 + x1) / 2, z: z0, w: Math.abs(x1 - x0), d: p.w });
    }
    return out;
  });

// ── fast road queries (grid index over every road segment) ──────────────────
interface Seg { a: number; b: number; c: number; d: number; r: number; path: number; i: number }
const SEGS: Seg[] = [];
const CELL = 16;
const GRID_N = Math.ceil((GROUND * 2) / CELL);
const grid: number[][] = Array.from({ length: GRID_N * GRID_N }, () => []);
{
  ROAD_PATHS.forEach((p, pi) => {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [x0, z0] = p.pts[i], [x1, z1] = p.pts[i + 1];
      const idx = SEGS.length;
      SEGS.push({ a: x0, b: z0, c: x1, d: z1, r: p.w / 2, path: pi, i });
      const reach = p.w / 2 + 14;
      const gx0 = Math.max(0, Math.floor((Math.min(x0, x1) - reach + GROUND) / CELL));
      const gx1 = Math.min(GRID_N - 1, Math.floor((Math.max(x0, x1) + reach + GROUND) / CELL));
      const gz0 = Math.max(0, Math.floor((Math.min(z0, z1) - reach + GROUND) / CELL));
      const gz1 = Math.min(GRID_N - 1, Math.floor((Math.max(z0, z1) + reach + GROUND) / CELL));
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) grid[gz * GRID_N + gx].push(idx);
    }
  });
}

export interface RoadHit {
  /** distance from the centre line minus half the road width (≤ 0 = on the carriageway) */
  edge: number;
  path: number;
  /** position along the path (point index + fraction) */
  t: number;
  /** distance from the centre line */
  dist: number;
}
const hit: RoadHit = { edge: 1e9, path: -1, t: 0, dist: 1e9 };

/** Nearest road (by edge distance) within ~14 units of a point. Returns a shared object. */
export function nearestRoad(x: number, z: number, filter?: (p: RoadPath) => boolean): RoadHit {
  hit.edge = 1e9;
  hit.path = -1;
  const gx = Math.floor((x + GROUND) / CELL), gz = Math.floor((z + GROUND) / CELL);
  if (gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N) return hit;
  for (const idx of grid[gz * GRID_N + gx]) {
    const s = SEGS[idx];
    if (filter && !filter(ROAD_PATHS[s.path])) continue;
    const dx = s.c - s.a, dz = s.d - s.b;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - s.a) * dx + (z - s.b) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.a + dx * t, pz = s.b + dz * t;
    const d = Math.hypot(x - px, z - pz);
    const edge = d - s.r;
    if (edge < hit.edge) {
      hit.edge = edge;
      hit.path = s.path;
      hit.t = s.i + t;
      hit.dist = d;
    }
  }
  return hit;
}

export function onRoad(x: number, z: number, pad = 0): boolean {
  return nearestRoad(x, z).edge <= pad;
}

// ── Plazas / paved areas (flat concrete) ────────────────────────────────────
export const PAVED: (Rect & { id: string })[] = [
  { id: 'studio_plaza', x: 21, z: -12.9, w: 26, d: 11 },
  { id: 'skate_plaza', x: -28, z: 108, w: 92, d: 64 },
  { id: 'beach_plaza', x: 90, z: 12, w: 12, d: 10 },
  { id: 'lookout_top', x: LOOKOUT.x, z: LOOKOUT.z, w: 20, d: 20 },
  { id: 'mall_lot', x: 21, z: 31.6, w: 26, d: 6 },
  { id: 'yard_lot', x: -56, z: 28, w: 20, d: 18 },
  // v3: the ski lodge forecourt
  { id: 'summit_plaza', x: SUMMIT.x, z: -164, w: 36, d: 14 },
];

// ── House plots (Home Hills) ────────────────────────────────────────────────
/** 12 plots of plotCells × plotCells (read from tuning), along the curvy spine + the Lookout branch. */
export const PLOTS: Plot[] = (() => {
  const size = tuning.build.plotCells * tuning.build.gridSize;
  const step = size + 2;
  const off = HOME_ROAD_W / 2 + SIDEWALK + 2.4 + size / 2;
  const centers: [number, number][] = [];
  // south side of the spine: six lots
  for (let i = 0; i < 6; i++) {
    const x = -70 - i * step;
    centers.push([x, spineZ(x) + off]);
  }
  // north side: two lots before the branch, two after it
  for (const x of [-70, -70 - step, -100 - HOME_ROAD_W / 2 - SIDEWALK - 3 - size / 2 - 4, -100 - HOME_ROAD_W / 2 - SIDEWALK - 3 - size / 2 - 4 - step]) {
    centers.push([x, spineZ(x) - off]);
  }
  // along the branch
  const bo = HOME_ROAD_W / 2 + SIDEWALK + 2.4 + size / 2;
  centers.push([-100 - bo, -34], [-100 + bo, -34]);
  const out: Plot[] = centers.map(([x, z], i) => ({
    index: i,
    center: { x, z },
    origin: { x: x - size / 2, z: z - size / 2 },
    size,
  }));
  return out.slice(0, Math.min(12, tuning.build.plotsPerTown));
})();

/** Is a world point inside any plot (optionally padded)? Returns the plot. */
export function plotAt(x: number, z: number, pad = 0): Plot | undefined {
  return PLOTS.find((p) => Math.abs(x - p.center.x) <= p.size / 2 + pad && Math.abs(z - p.center.z) <= p.size / 2 + pad);
}

/** The side of a plot that faces its street, as a unit vector (north/south/east/west). */
export interface PlotFront {
  /** unit vector pointing from the lot towards its street (axis-aligned) */
  nx: number;
  nz: number;
  /** midpoint of the street-facing edge of the lot, in world units */
  x: number;
  z: number;
  /** Y rotation that turns a model facing +z towards the street */
  rotY: number;
}
const frontCache = new Map<number, PlotFront>();
/** Accepts a Plot or a plot index. Both Home Hills (drive) and Build agree on a lot's front through this. */
export function plotFront(plotOrIndex: Plot | number): PlotFront {
  const p = typeof plotOrIndex === 'number' ? PLOTS[plotOrIndex] : plotOrIndex;
  if (!p) return { nx: 0, nz: 1, x: 0, z: 0, rotY: 0 };
  const hit = frontCache.get(p.index);
  if (hit) return hit;
  let nx = 0, nz = 1;
  const hitN = nearestRoad(p.center.x, p.center.z, (r) => r.id === 'spine' || r.id === 'branch');
  const path = ROAD_PATHS[hitN.path];
  if (path) {
    const i = Math.min(path.pts.length - 2, Math.max(0, Math.floor(hitN.t)));
    const f = hitN.t - i;
    const rx = path.pts[i][0] + (path.pts[i + 1][0] - path.pts[i][0]) * f;
    const rz = path.pts[i][1] + (path.pts[i + 1][1] - path.pts[i][1]) * f;
    const dx = rx - p.center.x, dz = rz - p.center.z;
    if (Math.abs(dx) > Math.abs(dz)) {
      nx = Math.sign(dx) || 1;
      nz = 0;
    } else {
      nx = 0;
      nz = Math.sign(dz) || 1;
    }
  }
  const out: PlotFront = { nx, nz, x: p.center.x + nx * p.size / 2, z: p.center.z + nz * p.size / 2, rotY: Math.atan2(nx, nz) };
  frontCache.set(p.index, out);
  return out;
}

// ── Places ──────────────────────────────────────────────────────────────────
/** The Studio (the workshop): a modern creator storefront on Main Street. Door faces south onto the plaza. */
export const WORKSHOP = {
  center: { x: 21, z: -26.4 },
  size: { w: 26, d: 16 },
  height: 9.5,
  door: { x: 21, z: -18.4 },
  pad: { x: 21, z: -12.5 },   // drive onto this to enter
  facing: 'south' as const,
};

/** The STYLE boutique (dress-up) — a glass storefront downtown. */
export const BOUTIQUE = {
  center: { x: -11.7, z: 14.6 },
  size: { w: 8.6, d: 14 },
  height: 9,
  door: { x: -11.7, z: 6.4 },
};

/** The builder's lot next to Home Hills — drive onto the pad to enter build mode. */
export const BUILD_YARD = {
  center: { x: -56, z: 28 },
  pad: { x: -56, z: 14 },
  office: { x: -64, z: 24 },        // the little site office; its door also opens build mode
  officeDoor: { x: -64, z: 19.6 },
};

export const DISTRICTS: District[] = [
  { id: 'downtown', name: 'Downtown', icon: '🏙️', x: 0, z: 0, radius: 62 },
  { id: 'homehills', name: 'Home Hills', icon: '🏡', x: -100, z: 2, radius: 58 },
  { id: 'beach', name: 'Beach & Pier', icon: '🏖️', x: 108, z: 6, radius: 52 },
  { id: 'park', name: 'Park & Lake', icon: '🌳', x: 85, z: -104, radius: 55 },
  { id: 'skate', name: 'Skate Park', icon: '🛹', x: -28, z: 108, radius: 48 },
  { id: 'lookout', name: 'Lookout Hill', icon: '🔭', x: LOOKOUT.x, z: LOOKOUT.z, radius: 60 },
  // v3
  { id: 'summit', name: 'Sprinkle Summit', icon: '🏔️', x: SUMMIT.x, z: SUMMIT.z + 40, radius: 78 },
  { id: 'meadow', name: 'Bloom Meadow', icon: '🌼', x: MEADOW.x, z: MEADOW.z, radius: 72 },
  { id: 'grove', name: 'Glow Grove', icon: '🍄', x: GROVE.x, z: GROVE.z, radius: 70 },
  { id: 'sands', name: 'Sunny Sands', icon: '🏜️', x: SANDS.x, z: SANDS.z, radius: 70 },
];

/** The Build town view frames this (the neighbourhood where houses go). */
export const RESIDENTIAL = { center: { x: -102, z: 2 }, radius: 56 };

export const LANDMARKS: Landmark[] = [
  { id: 'studio', name: 'The Studio', icon: '🧪', x: 21, z: -26.4, radius: 14 },
  { id: 'mall', name: 'Mall', icon: '🛍️', x: 21, z: 17.6, radius: 14 },
  { id: 'cinema', name: 'Cinema', icon: '🎬', x: -26, z: -15.6, radius: 11 },
  { id: 'lighthouse', name: 'Lighthouse', icon: '🗼', x: 145.5, z: 12, radius: 6 },
  { id: 'pier', name: 'Pier', icon: '🎣', x: 122, z: 12, radius: 8 },
  { id: 'gazebo', name: 'Gazebo', icon: '⛲', x: 60, z: -76, radius: 7 },
  { id: 'bridge', name: 'Lake Bridge', icon: '🌉', x: 88, z: -100, radius: 12 },
  { id: 'maze', name: 'Hedge Maze', icon: '🌿', x: 123, z: -128, radius: 14 },
  { id: 'halfpipe', name: 'Half-pipe', icon: '🛹', x: -46, z: 124, radius: 12 },
  { id: 'lookout', name: 'Lookout', icon: '🔭', x: LOOKOUT.x, z: LOOKOUT.z, radius: 15 },
  // v3
  { id: 'lodge', name: 'Ski Lodge', icon: '⛷️', x: SUMMIT.lodge.x, z: SUMMIT.lodge.z, radius: 16 },
  { id: 'windmill', name: 'Windmills', icon: '🌬️', x: MEADOW.windmills[0][0], z: MEADOW.windmills[0][1], radius: 8 },
  { id: 'balloon', name: 'Hot-air Balloon', icon: '🎈', x: MEADOW.balloon.x, z: MEADOW.balloon.z, radius: 8 },
  { id: 'mushrooms', name: 'Giant Mushrooms', icon: '🍄', x: GROVE.x, z: GROVE.z, radius: 14 },
  { id: 'arch', name: 'Rock Arch', icon: '🪨', x: SANDS.arches[0][0], z: SANDS.arches[0][1], radius: 12 },
  { id: 'lazyriver', name: 'Lazy River', icon: '🛟', x: SANDS.park.x, z: SANDS.park.z, radius: 30 },
];

/** Pickup / drop-off spots (on or next to a road, always drivable). */
export const JOB_SPOTS: Spot[] = [
  { id: 'studio', name: 'The Studio', icon: '🧪', x: 6.5, z: -7.5 },
  { id: 'mall', name: 'Mall', icon: '🛍️', x: 21, z: 6.2 },
  { id: 'boba', name: 'Boba Café', icon: '🧋', x: -30, z: 6.2 },
  { id: 'cinema', name: 'Cinema', icon: '🎬', x: -26, z: -6.2 },
  { id: 'homes', name: 'Home Hills', icon: '🏡', x: -98, z: 3 },
  { id: 'lookout', name: 'Lookout', icon: '🔭', x: -95, z: -107 },
  { id: 'beach', name: 'Boardwalk', icon: '🏖️', x: 83, z: -28 },
  { id: 'pier', name: 'The Pier', icon: '🎣', x: 98, z: 6 },
  { id: 'bridge', name: 'Lake Bridge', icon: '🌉', x: 56, z: -100 },
  { id: 'gazebo', name: 'Gazebo', icon: '⛲', x: 52, z: -80 },
  { id: 'skate', name: 'Skate Park', icon: '🛹', x: -6, z: 86 },
  { id: 'cafe', name: 'Diner', icon: '🍔', x: 62, z: 7 },
  // v3
  { id: 'lodge', name: 'Ski Lodge', icon: '⛷️', x: 62, z: -160 },
  { id: 'meadow', name: 'Windmill Meadow', icon: '🌼', x: 52, z: 164 },
  { id: 'sands', name: 'Water Park', icon: '🛟', x: 127, z: 117.5 },
  { id: 'grove', name: 'Glow Grove', icon: '🍄', x: -148, z: 110 },
];

/** The first spot of every session: Main Street, heading east, with the Studio ahead on the left. */
export const SPAWN = { x: -24, z: 2.6, heading: Math.PI / 2 }; // heading 0 = facing -z (north); π/2 = east

// ── Charms (hidden around town; reward exploration) ─────────────────────────
// y (optional) = extra height above the ground / surface under the charm.
export const CHARMS: Charm[] = [
  // Downtown
  { id: 'dt1', x: 21, z: 17.6, y: 0.2 },            // Mall rooftop terrace (reached by the back stairs, on foot)
  { id: 'dt2', x: -26, z: -26.5 },                   // behind the cinema
  { id: 'dt3', x: -12, z: -26.5 },                   // behind the arcade
  { id: 'dt4', x: 32, z: -11 },                    // studio plaza, east end
  { id: 'dt5', x: 0, z: -58 },                     // Center Ave, north end
  { id: 'dt6', x: -28, z: 26 },                    // back alley behind the shops
  { id: 'dt7', x: 31, z: 33 },                     // behind the mall, by the stairs
  { id: 'dt8', x: 56, z: -8 },                     // east of downtown, off Main Street
  // Home Hills
  { id: 'hh1', x: -66, z: -22 },
  { id: 'hh2', x: -146, z: 4 },                    // end of the spine
  { id: 'hh3', x: -130, z: -34 },
  { id: 'hh4', x: -118, z: 36 },
  { id: 'hh5', x: -46, z: 30 },                    // behind the builder's lot
  // Lookout Hill
  { id: 'lk1', x: LOOKOUT.x, z: LOOKOUT.z, y: 0.4 }, // the very top
  { id: 'lk2', x: -142, z: -118 },                 // west switchback
  { id: 'lk3', x: -60, z: -128 },                  // east switchback
  { id: 'lk4', x: -96, z: -66 },                   // hill base
  // Beach & Pier
  { id: 'bp1', x: 138.5, z: 12 },                  // end of the pier
  { id: 'bp2', x: 122, z: 12 },                    // mid pier
  { id: 'bp3', x: 95.5, z: -28 },                 // beside the lifeguard tower
  { id: 'bp4', x: 102, z: 52 },                    // far south beach
  { id: 'bp5', x: 96, z: -46 },                   // north beach
  { id: 'bp6', x: 94, z: 62 },                     // end of the boardwalk
  // Park & Lake
  { id: 'pk1', x: 88, z: -86 },                    // end of the dock (on foot)
  { id: 'pk2', x: 124.5, z: -126.5 },              // heart of the hedge maze (on foot; an open cell next to the fountain)
  { id: 'pk3', x: 60, z: -76 },                    // the gazebo
  { id: 'pk4', x: 88, z: -100, y: 3.2 },           // over the top of the bridge
  { id: 'pk5', x: 55, z: -107 },                   // under the bridge, on the bank
  { id: 'pk6', x: 132, z: -104 },                  // east picnic lawn
  { id: 'pk7', x: 58, z: -134 },                   // far north trail
  // Skate & Stunt Park
  { id: 'sk1', x: -6, z: 88, y: 3.6 },             // above the first kicker
  { id: 'sk2', x: -36, z: 92, y: 2.8 },            // landing ramp gap
  { id: 'sk3', x: -46, z: 124, y: 2.4 },           // over the half-pipe
  { id: 'sk4', x: 12, z: 120, y: 2.5 },            // top of the banked curve
  { id: 'sk5', x: -62, z: 100, y: 0.2 },           // plaza corner
  { id: 'sk6', x: -20, z: 130, y: 0.2 },
  // Out in the countryside
  { id: 'co1', x: 120, z: -80 },
  { id: 'co2', x: -140, z: 100 },
  { id: 'co3', x: 40, z: 120 },
  { id: 'co4', x: -140, z: -70 },
];

// ── Stunts (ramps, pipes, banks, rollers) ──────────────────────────────────
// Surfaces are analytic (see heightfield.ts). yaw = direction of ascent / travel
// (heading convention); x,z = centre of the footprint.
export type Stunt =
  | { kind: 'kicker'; id: string; x: number; z: number; yaw: number; w: number; len: number; h: number; curve?: number }
  | { kind: 'box'; id: string; x: number; z: number; yaw: number; w: number; len: number; h: number; ramp: number }
  | { kind: 'roller'; id: string; x: number; z: number; yaw: number; w: number; n: number; hl: number; h: number }
  | { kind: 'pipe'; id: string; x: number; z: number; yaw: number; w: number; len: number; h: number; tw: number }
  | { kind: 'bank'; id: string; x: number; z: number; r0: number; r1: number; h: number; a0: number; a1: number };

export const STUNTS: Stunt[] = [
  // a row of kickers heading north across the plaza
  { kind: 'kicker', id: 'k1', x: -6, z: 98, yaw: 0, w: 8, len: 9, h: 3.2, curve: 1.5 },
  // a gap jump: big kicker, then a landing slope
  { kind: 'kicker', id: 'k2', x: -36, z: 104, yaw: 0, w: 8, len: 9, h: 3.6, curve: 1.5 },
  { kind: 'kicker', id: 'k2b', x: -36, z: 86, yaw: Math.PI, w: 9, len: 11, h: 2.8, curve: 1 },
  // angled kickers
  { kind: 'kicker', id: 'k3', x: -62, z: 112, yaw: Math.PI / 4, w: 7, len: 8, h: 2.6, curve: 1.4 },
  { kind: 'kicker', id: 'k4', x: -10, z: 128, yaw: -Math.PI / 3, w: 7, len: 8, h: 2.6, curve: 1.4 },
  // funbox: drive up one side, across, and off the other
  { kind: 'box', id: 'fb', x: -48, z: 90, yaw: Math.PI / 2, w: 8, len: 22, h: 1.7, ramp: 7 },
  // rollers (little hops)
  { kind: 'roller', id: 'rl', x: -16, z: 116, yaw: 0, w: 8, n: 4, hl: 7, h: 1.1 },
  // half-pipe along z
  { kind: 'pipe', id: 'hp', x: -46, z: 124, yaw: 0, w: 28, len: 30, h: 2.5, tw: 7 },
  // a banked curve
  { kind: 'bank', id: 'bk', x: 8, z: 116, r0: 11, r1: 22, h: 3.4, a0: -Math.PI * 0.15, a1: Math.PI * 1.05 },
];

/** Bridges: straight deck from a to b, arched; the lake road crosses one. */
export interface Bridge { id: string; ax: number; az: number; bx: number; bz: number; w: number; peak: number; endY: number }
export const BRIDGES: Bridge[] = [
  { id: 'lake', ax: 54, az: -100, bx: 122, bz: -100, w: 8, peak: 3.2, endY: 0.4 },
  // v3: footbridges across the Sunny Sands lazy river (drawn by drive/sands.ts)
  { id: 'canal_w', ax: SANDS.park.x - 31, az: SANDS.park.z, bx: SANDS.park.x - 15, bz: SANDS.park.z, w: 4, peak: 3.4, endY: 1.5 },
  { id: 'canal_e', ax: SANDS.park.x + 15, az: SANDS.park.z, bx: SANDS.park.x + 31, bz: SANDS.park.z, w: 4, peak: 3.4, endY: 1.5 },
];

/** Piers (flat decks over the water). */
export interface Pier { id: string; ax: number; az: number; bx: number; bz: number; w: number; y: number }
export const PIERS: Pier[] = [
  { id: 'main', ax: 96, az: 12, bx: 148, bz: 12, w: 7, y: 0.95 },
  { id: 'dock', ax: 88, az: -80, bx: 88, bz: -87.5, w: 1.8, y: 0.45 },
];

/** Foot-only surfaces (stairs and roof terraces): the car never sees these. */
export interface Stairs { id: string; x: number; z: number; yaw: number; w: number; len: number; h: number }
export const STAIRS: Stairs[] = [
  // the Mall's back stairs: they climb west along the rear wall
  { id: 'mall', x: 23.5, z: 29.4, yaw: -Math.PI / 2, w: 2.4, len: 20, h: 10.4 },
];
export interface Deck { id: string; x: number; z: number; w: number; d: number; y: number }
export const DECKS: Deck[] = [
  // stops at the glass railing (shops.ts mall(): rail inset 0.3 from the 26 x 20 roof)
  { id: 'mall_roof', x: 21, z: 17.6, w: 25.4, d: 19.4, y: 10.5 },
  // top-of-stairs landing behind the mall, overlapping the roof through the railing gap (x 8.5..14.2)
  { id: 'mall_landing', x: 11.35, z: 28.9, w: 5.7, d: 3.8, y: 10.5 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Deterministic pseudo-random for scenery placement. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Areas where village DECORATIONS may NOT be placed (the Build scene asks):
 * roads, plots, anything outside the Home Hills neighbourhood, the builder's lot.
 */
export function isReserved(x: number, z: number): boolean {
  if (Math.hypot(x - RESIDENTIAL.center.x, z - RESIDENTIAL.center.z) > RESIDENTIAL.radius) return true;
  if (onRoad(x, z, SIDEWALK + 0.5)) return true;
  if (plotAt(x, z, 0.5)) return true;
  const y = BUILD_YARD;
  if (Math.abs(x - y.center.x) < 11 && Math.abs(z - y.center.z) < 10) return true;
  return Math.abs(x) > BOUNDS || Math.abs(z) > BOUNDS;
}

// ── v3 world ────────────────────────────────────────────────────────────────
// Data contracts for the rides / movement / build / locker agents (W3, W4, W5, W2).
// Positions are final-ish: the island is being reshaped around them (see DESIGN.md v3).
import type { VehicleKind } from '../core/model';

/** Every place with a title card: the old districts plus the new POIs. `r` = metres from (x, z) that count as "in" it. */
export interface Poi { id: string; name: string; x: number; z: number; r: number }
export const POIS: Poi[] = [
  { id: 'downtown', name: 'Sparkle Square', x: 0, z: 0, r: 68 },
  { id: 'homehills', name: 'Cozy Hills', x: -100, z: 3, r: 56 },
  { id: 'beach', name: 'Sandcastle Bay', x: 104, z: 8, r: 50 },
  { id: 'park', name: 'Giggle Gardens', x: 90, z: -104, r: 55 },
  { id: 'skate', name: 'Rascal Ramps', x: -28, z: 108, r: 50 },
  { id: 'lookout', name: 'Wonder Lookout', x: -95, z: -122, r: 62 },
  { id: 'summit', name: 'Sprinkle Summit', x: 65, z: -222, r: 78 },
  { id: 'meadow', name: 'Bloom Meadow', x: 30, z: 190, r: 72 },
  { id: 'grove', name: 'Glow Grove', x: -150, z: 125, r: 70 },
  { id: 'sands', name: 'Sunny Sands', x: 150, z: 140, r: 70 },
];

/** A parked ride: `heading` follows the car convention (0 = facing -z / north, π/2 = east). Boats sit on water. */
export interface RideSpawn { kind: VehicleKind; x: number; z: number; heading: number }
export const RIDE_SPAWNS: RideSpawn[] = [
  // Sparkle Square
  { kind: 'sports', x: 11, z: -10, heading: 0 },
  { kind: 'icecream', x: -36, z: 3.5, heading: Math.PI / 2 },
  { kind: 'hoverboard', x: 31, z: -10, heading: 0 },
  // Cozy Hills
  { kind: 'golfcart', x: -82, z: 8, heading: -Math.PI / 2 },
  { kind: 'pickup', x: -56, z: 26, heading: Math.PI },
  // Rascal Ramps
  { kind: 'hoverboard', x: -20, z: 86, heading: 0 },
  { kind: 'sports', x: 3, z: 88, heading: 0 },
  // Sandcastle Bay (boats by the pier)
  { kind: 'golfcart', x: 90, z: 24, heading: 0 },
  { kind: 'boat', x: 126, z: 22, heading: Math.PI / 2 },
  { kind: 'boat', x: 126, z: 2, heading: Math.PI / 2 },
  // Giggle Gardens
  { kind: 'pickup', x: 50, z: -78, heading: Math.PI },
  { kind: 'boat', x: 100, z: -92, heading: 1.2 },
  // Wonder Lookout
  { kind: 'sports', x: -92, z: -64, heading: -Math.PI / 2 },
  // Sprinkle Summit
  { kind: 'pickup', x: 62, z: -178, heading: 0 },
  // Bloom Meadow
  { kind: 'golfcart', x: 40, z: 160, heading: 0 },
  { kind: 'icecream', x: 56, z: 150, heading: Math.PI },
  // Glow Grove
  { kind: 'hoverboard', x: -146, z: 108, heading: 0 },
  // Sunny Sands
  { kind: 'sports', x: 140, z: 118, heading: 0 },
  { kind: 'boat', x: 150, z: 40, heading: 0 },
];

/** Bouncy launch pads (centre of each pad). */
export const LAUNCH_PADS: { x: number; z: number }[] = [
  { x: 96, z: 40 },       // beach: bounce out over the bay
  { x: -3, z: 56 },       // south end of Center Avenue
  { x: -20, z: 120 },     // Rascal Ramps
  { x: 72, z: -82 },      // Giggle Gardens, by the lake
  { x: 60, z: -182 },     // Sprinkle Lodge: bounce toward the peak
  { x: 30, z: 160 },      // Bloom Meadow hilltop
  { x: 150, z: 120 },     // Sunny Sands dune
  { x: -150, z: 100 },    // Glow Grove clearing
  { x: -112, z: -112 },   // Wonder Lookout plateau
];

/** The party bus: a straight line high across the island (y metres above sea level). */
export const BUS_PATH = { ax: -290, az: -170, bx: 300, bz: 200, y: 80 };
