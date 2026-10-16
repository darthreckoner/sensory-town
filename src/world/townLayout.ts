// The town map as pure data. Shared by the Drive scene, the Build scene and
// anything that needs to know where things are. World units; +x east, +z south.
//
//                 (north, z = -33..-27 ring road)
//   ┌──────────────────────────────────────────────────────────┐
//   │  build pad   [P4][P5][P6][P7]   ← plot row B (z -24..-16) │
//   │     ◎        [P0][P1][P2][P3]   ← plot row A (z -12..-4)  │
//   ├══════════════ cross street (z -3..3) ════════════════════┤
//   │   park + fountain          workshop (door faces north)   │
//   └──────────────────────────────────────────────────────────┘
//   Outside the ring: windmill (NE), ice cream (W), pond (SE), playground (SW).
import { tuning } from '../tuning';

export interface Rect { x: number; z: number; w: number; d: number } // center + size
export interface Plot { index: number; center: { x: number; z: number }; origin: { x: number; z: number }; size: number }
export interface Landmark { id: string; name: string; icon: string; x: number; z: number; radius: number }
export interface Spot { id: string; name: string; icon: string; x: number; z: number }

export const ROAD_WIDTH = 6;
export const RING = 30;       // ring road centerline half-size
export const BOUNDS = 58;     // drivable half-size (soft wall)
export const GROUND = 70;     // ground plane half-size

/** Road rectangles (center + size). Corners overlap, that's fine. */
export const ROADS: Rect[] = [
  { x: 0, z: -RING, w: RING * 2 + ROAD_WIDTH, d: ROAD_WIDTH },  // north
  { x: 0, z: RING, w: RING * 2 + ROAD_WIDTH, d: ROAD_WIDTH },   // south
  { x: -RING, z: 0, w: ROAD_WIDTH, d: RING * 2 + ROAD_WIDTH },  // west
  { x: RING, z: 0, w: ROAD_WIDTH, d: RING * 2 + ROAD_WIDTH },   // east
  { x: 0, z: 0, w: RING * 2, d: ROAD_WIDTH },                    // cross street
  { x: 12, z: 7.5, w: 5, d: 9 },                                 // workshop driveway
  { x: -23, z: -7.5, w: 5, d: 9 },                               // build-yard driveway
];

/** House plots, 8×8 cells each (plotCells × gridSize). */
export const PLOTS: Plot[] = (() => {
  const size = tuning.build.plotCells * tuning.build.gridSize;
  const xs = [-15, -5, 5, 15];
  const rows = [-8, -20];
  const out: Plot[] = [];
  let i = 0;
  for (const z of rows)
    for (const x of xs) {
      out.push({ index: i++, center: { x, z }, origin: { x: x - size / 2, z: z - size / 2 }, size });
    }
  return out.slice(0, tuning.build.plotsPerTown);
})();

/** The workshop building. Door faces north (towards the cross street). */
export const WORKSHOP = {
  center: { x: 12, z: 18 },
  size: { w: 13, d: 10 },
  height: 6,
  door: { x: 12, z: 13 },
  pad: { x: 12, z: 9.5 },   // drive onto this to enter
};

/** The builder's yard — drive onto the pad to enter build mode. */
export const BUILD_YARD = {
  center: { x: -23, z: -15 },
  pad: { x: -23, z: -9.5 },
};

export const LANDMARKS: Landmark[] = [
  { id: 'fountain', name: 'Fountain Park', icon: '⛲', x: -12, z: 15, radius: 2.6 },
  { id: 'windmill', name: 'Windmill', icon: '🌾', x: 44, z: -44, radius: 3 },
  { id: 'icecream', name: 'Ice Cream', icon: '🍦', x: -44, z: 6, radius: 2.5 },
  { id: 'pond', name: 'Duck Pond', icon: '🦆', x: 44, z: 42, radius: 7 },
  { id: 'playground', name: 'Playground', icon: '🛝', x: -42, z: 42, radius: 4 },
];

/** Pickup / drop-off spots (on or next to a road). */
export const JOB_SPOTS: Spot[] = [
  { id: 'fountain', name: 'Fountain Park', icon: '⛲', x: -12, z: 6 },
  { id: 'windmill', name: 'Windmill', icon: '🌾', x: 38, z: -38 },
  { id: 'icecream', name: 'Ice Cream', icon: '🍦', x: -38, z: 6 },
  { id: 'pond', name: 'Duck Pond', icon: '🦆', x: 36, z: 34 },
  { id: 'playground', name: 'Playground', icon: '🛝', x: -36, z: 36 },
  { id: 'workshop', name: 'Workshop', icon: '🧪', x: 4, z: 6 },
  { id: 'homes', name: 'Home Street', icon: '🏡', x: 0, z: -34 },
];

export const SPAWN = { x: -18, z: -1.5, heading: Math.PI / 2 }; // heading 0 = facing -z (north); π/2 = east

/** Deterministic pseudo-random for scenery placement. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function onRoad(x: number, z: number, pad = 0): boolean {
  return ROADS.some((r) => Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad);
}

/** Is a world point inside any plot (optionally padded)? Returns the plot. */
export function plotAt(x: number, z: number, pad = 0): Plot | undefined {
  return PLOTS.find((p) => Math.abs(x - p.center.x) <= p.size / 2 + pad && Math.abs(z - p.center.z) <= p.size / 2 + pad);
}

/** Areas where village decorations may NOT be placed (roads, plots, buildings, pads). */
export function isReserved(x: number, z: number): boolean {
  if (onRoad(x, z, 0.5)) return true;
  if (plotAt(x, z, 0.5)) return true;
  const w = WORKSHOP;
  if (Math.abs(x - w.center.x) < w.size.w / 2 + 1 && Math.abs(z - w.center.z) < w.size.d / 2 + 1) return true;
  if (Math.hypot(x - BUILD_YARD.center.x, z - BUILD_YARD.center.z) < 4) return true;
  for (const l of LANDMARKS) if (Math.hypot(x - l.x, z - l.z) < l.radius + 1) return true;
  return Math.abs(x) > BOUNDS || Math.abs(z) > BOUNDS;
}
