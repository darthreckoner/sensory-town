// Scenery scatter: forests, parks, hillside pines, rim woods, bushes, flower
// beds and rocks, placed with seeded() so the world is the same every time,
// only where it makes sense (not on roads, plots, plazas, water, steep slopes
// or inside buildings). Everything goes into one chunked Vegetation.
import {
  BOUNDS, JOB_SPOTS, PAVED, PLOTS, CHARMS, LOOKOUT, SPAWN, WORKSHOP, BUILD_YARD, nearestRoad, seeded,
} from '../world/townLayout';
import { groundHeight, terrainHeight, coastX } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import { Vegetation, type PlantKind } from './vegetation';
import { PAL } from './palette';
import { tuning } from '../tuning';

export interface Site { x: number; z: number; kind: 'oak' | 'birch'; scale: number }
export interface SceneryIn {
  keepouts: Collider[];
  sites: Site[];
  palms: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
}

const WATER_MARGIN = -0.05;

export function buildScenery(inp: SceneryIn): { veg: Vegetation; build: ReturnType<Vegetation['build']> } {
  const d = tuning.drive;
  const rng = seeded(d.scenerySeed);
  const veg = new Vegetation();

  // ── hand-placed ──
  for (const s of inp.sites) veg.add(s.kind, s.x, groundHeight(s.x, s.z), s.z, s.scale, rng() * 6.28);
  for (const p of inp.palms) veg.add('palm', p.x, groundHeight(p.x, p.z), p.z, p.s, rng() * 6.28);
  for (const r of inp.rocks) veg.add('rock', r.x, groundHeight(r.x, r.z) - 0.1, r.z, r.s, rng() * 6.28, undefined, false);

  // ── spacing hash ──
  const CELL = 6;
  const hash = new Map<number, { x: number; z: number; r: number }[]>();
  const hkey = (x: number, z: number): number => Math.floor((x + 300) / CELL) * 1000 + Math.floor((z + 300) / CELL);
  const taken = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor((x + 300) / CELL), cz = Math.floor((z + 300) / CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const list = hash.get((cx + a) * 1000 + (cz + b));
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
      }
    return false;
  };
  const claim = (x: number, z: number, r: number): void => {
    const k = hkey(x, z);
    const l = hash.get(k);
    if (l) l.push({ x, z, r });
    else hash.set(k, [{ x, z, r }]);
  };
  for (const s of inp.sites) claim(s.x, s.z, 1.5);

  // ── exclusion rules ──
  const inBox = (x: number, z: number, m: number): boolean => {
    for (const c of inp.keepouts) {
      if (c.kind === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
      } else if (Math.abs(x - c.x) < c.hw + m && Math.abs(z - c.z) < c.hd + m) return true;
    }
    return false;
  };
  const noGo = (x: number, z: number, r: number, inside: boolean): boolean => {
    if (nearestRoad(x, z).edge < 3.6 + r) return true;
    if (inside) {
      if (Math.abs(x) < 64 && Math.abs(z) < 64) return true;                                  // downtown
      if (x > -154 && x < -50 && z > -52 && z < 52) {                                        // Home Hills core
        for (const p of PLOTS) if (Math.abs(x - p.center.x) < p.size / 2 + 3.5 && Math.abs(z - p.center.z) < p.size / 2 + 3.5) return true;
      }
    }
    for (const r2 of PAVED) if (Math.abs(x - r2.x) < r2.w / 2 + 2.5 && Math.abs(z - r2.z) < r2.d / 2 + 2.5) return true;
    if (Math.abs(x - WORKSHOP.pad.x) < 6 && Math.abs(z - WORKSHOP.pad.z) < 6) return true;
    if (Math.hypot(x - BUILD_YARD.pad.x, z - BUILD_YARD.pad.z) < 8) return true;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) return true;
    for (const s of JOB_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 5) return true;
    for (const c of CHARMS) if (Math.hypot(x - c.x, z - c.z) < 3.2) return true;
    return inside ? inBox(x, z, 2.6 + r) : false;
  };
  const slopeAt = (x: number, z: number): number => {
    const e = 2;
    return Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  };

  // ── regions ──
  const parkD = (x: number, z: number): number => Math.hypot((x - 85) / 1.1, z + 104);
  const hillD = (x: number, z: number): number => Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);

  let inside = 0, rim = 0;
  const MAX_IN = 950, MAX_RIM = 520;
  for (let i = 0; i < 26000 && (inside < MAX_IN || rim < MAX_RIM); i++) {
    const x = (rng() * 2 - 1) * 196, z = (rng() * 2 - 1) * 196;
    const isIn = Math.abs(x) < BOUNDS - 2 && Math.abs(z) < BOUNDS - 2;
    if (isIn && inside >= MAX_IN) continue;
    if (!isIn && rim >= MAX_RIM) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_MARGIN + 0.45) continue;
    if (x > coastX(z) - 30 && z > -62) continue; // sand: palms are hand-placed
    const slope = slopeAt(x, z);
    const pd = parkD(x, z), hd = hillD(x, z);
    let density = isIn ? 0.28 : 0.9;
    let kind: PlantKind;
    let scale = 0.8 + rng() * 0.7;
    let color: string | undefined;
    if (pd < 50) density = 0.9;
    else if (hd < LOOKOUT.radius) density = h > 6 ? 0.7 : 0.5;
    else if (x < -50 && z > -52 && z < 52 && isIn) density = 0.2;
    if (rng() > density) continue;
    // species
    const roll = rng();
    if (h > 7 || (hd < LOOKOUT.radius && roll < 0.6)) kind = 'pine';
    else if (pd < 50) {
      kind = roll < 0.45 ? 'oak' : roll < 0.7 ? 'birch' : roll < 0.85 ? 'oak' : 'pine';
      if (kind === 'oak' && rng() < 0.28) color = PAL.autumn[(rng() * PAL.autumn.length) | 0];
    } else kind = roll < 0.5 ? 'oak' : roll < 0.78 ? 'pine' : 'birch';
    if (kind === 'pine') scale *= 1.15;
    const r = (kind === 'pine' ? 1.1 : 1.5) * scale;
    if (slope > 0.62) {
      // too steep for trees: a boulder now and then
      if (rng() < 0.12 && !taken(x, z, 1.5) && !noGo(x, z, 1, isIn)) {
        veg.add('rock', x, h - 0.1, z, 0.9 + rng() * 1.3, rng() * 6.28, undefined, isIn);
        claim(x, z, 1.6);
      }
      continue;
    }
    if (noGo(x, z, r, isIn) || taken(x, z, r)) continue;
    veg.add(kind, x, h, z, scale, rng() * 6.28, color, isIn);
    claim(x, z, r);
    if (isIn) inside++;
    else rim++;
    // undergrowth next to some trees
    if (rng() < 0.4) {
      const a = rng() * 6.28, dd = r + 0.6;
      const bx = x + Math.cos(a) * dd, bz = z + Math.sin(a) * dd;
      if (terrainHeight(bx, bz) > WATER_MARGIN + 0.5 && !noGo(bx, bz, 0.6, isIn) && !taken(bx, bz, 0.7)) {
        veg.add('bush', bx, terrainHeight(bx, bz), bz, 0.7 + rng() * 0.6, rng() * 6.28);
        claim(bx, bz, 0.7);
      }
    }
  }

  // ── bushes and flower beds on the lawns ──
  const accents = [PAL.pink, PAL.gold, '#ffffff', PAL.violet, PAL.cyan, PAL.orange];
  for (let i = 0; i < 2600; i++) {
    const x = (rng() * 2 - 1) * (BOUNDS - 3), z = (rng() * 2 - 1) * (BOUNDS - 3);
    const pd = parkD(x, z);
    const homeLawn = x < -54 && z > -48 && z < 50;
    if (pd > 55 && !homeLawn) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_MARGIN + 0.5 || slopeAt(x, z) > 0.4) continue;
    if (noGo(x, z, 0.6, true) || taken(x, z, 0.8)) continue;
    if (rng() < 0.55) {
      veg.add('flowers', x, h, z, 0.8 + rng() * 0.7, rng() * 6.28, accents[(rng() * accents.length) | 0], false);
      claim(x, z, 0.6);
    } else {
      veg.add('bush', x, h, z, 0.6 + rng() * 0.6, rng() * 6.28, undefined, false);
      claim(x, z, 0.8);
    }
  }
  void inBox;
  return { veg, build: veg.build() };
}
