// Scenery scatter (v3: the whole island): forests, parks, hillside pines, snowy firs on
// the peak, glowing grove trees, meadow flowers, desert scrub, beach palms, bushes and
// rocks, placed with seeded() so the world is the same every time, only where it makes
// sense (not on roads, plots, plazas, water, steep slopes or inside buildings).
// Everything goes into one chunked Vegetation.
import {
  GROVE, JOB_SPOTS, MEADOW, PAVED, PLOTS, CHARMS, LOOKOUT, SANDS, SPAWN, SUMMIT, WORKSHOP, BUILD_YARD, nearestRoad, seeded,
} from '../world/townLayout';
import { cliffiness, groundHeight, shoreDist, terrainHeight } from '../world/heightfield';
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

// v3 world: biome colours for the scatter
const SNOW_FIR = ['#e6f2fb', '#d5e8f6', '#c3dff2'];
const GLOW_TREES = ['#3fc4a0', '#7a5fd0', '#33b0c8', '#9b6fe0'];
const MEADOW_TREES = ['#9fe05c', '#7fd36a', '#b6e86a'];
const DRY_BUSH = ['#b9a65a', '#c9b86a', '#a99650'];
const RED_ROCK = ['#c9703f', '#b5603a', '#d58a52'];
const FLOWER_COLS = ['#ff7ab8', '#ffd84a', '#ffffff', '#b78cff', '#ff9a52', '#6fd0ff'];

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
  const hkey = (x: number, z: number): number => Math.floor((x + 500) / CELL) * 1000 + Math.floor((z + 500) / CELL);
  const taken = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor((x + 500) / CELL), cz = Math.floor((z + 500) / CELL);
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
  for (const p of inp.palms) claim(p.x, p.z, 1.2);

  // ── exclusion rules ──
  // building footprints, bucketed on a coarse grid so a candidate only tests the colliders near it
  const KC = 24;
  const boxes = new Map<number, Collider[]>();
  for (const c of inp.keepouts) {
    const reach = c.kind === 'circle' ? c.r : Math.max(c.hw, c.hd);
    const gx0 = Math.floor((c.x - reach - 4 + 500) / KC), gx1 = Math.floor((c.x + reach + 4 + 500) / KC);
    const gz0 = Math.floor((c.z - reach - 4 + 500) / KC), gz1 = Math.floor((c.z + reach + 4 + 500) / KC);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const k = gx * 1000 + gz;
      const l = boxes.get(k);
      if (l) l.push(c);
      else boxes.set(k, [c]);
    }
  }
  const inBox = (x: number, z: number, m: number): boolean => {
    const list = boxes.get(Math.floor((x + 500) / KC) * 1000 + Math.floor((z + 500) / KC));
    if (!list) return false;
    for (const c of list) {
      if (c.kind === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
      } else if (Math.abs(x - c.x) < c.hw + m && Math.abs(z - c.z) < c.hd + m) return true;
    }
    return false;
  };
  const noGo = (x: number, z: number, r: number): boolean => {
    if (nearestRoad(x, z).edge < 3.6 + r) return true;
    if (Math.abs(x) < 64 && Math.abs(z) < 64) return true;                                  // downtown
    if (x > -154 && x < -50 && z > -52 && z < 52) {                                        // Home Hills core
      for (const p of PLOTS) if (Math.abs(x - p.center.x) < p.size / 2 + 3.5 && Math.abs(z - p.center.z) < p.size / 2 + 3.5) return true;
    }
    for (const r2 of PAVED) if (Math.abs(x - r2.x) < r2.w / 2 + 2.5 && Math.abs(z - r2.z) < r2.d / 2 + 2.5) return true;
    if (Math.abs(x - WORKSHOP.pad.x) < 6 && Math.abs(z - WORKSHOP.pad.z) < 6) return true;
    if (Math.hypot(x - BUILD_YARD.pad.x, z - BUILD_YARD.pad.z) < 8) return true;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) return true;
    if (Math.hypot(x - SUMMIT.pad.x, z - SUMMIT.pad.z) < SUMMIT.pad.r + 4) return true;    // the ski lodge pad
    if (Math.hypot(x - SANDS.park.x, z - SANDS.park.z) < SANDS.park.ring + 26) return true; // the water park
    for (const s of JOB_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 5) return true;
    for (const c of CHARMS) if (Math.hypot(x - c.x, z - c.z) < 3.2) return true;
    return inBox(x, z, 2.6 + r);
  };
  const slopeAt = (x: number, z: number): number => {
    const e = 2;
    return Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  };

  // ── regions ──
  const parkD = (x: number, z: number): number => Math.hypot((x - 85) / 1.1, z + 104);
  const hillD = (x: number, z: number): number => Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);
  const dist = (x: number, z: number, p: { x: number; z: number }): number => Math.hypot(x - p.x, z - p.z);

  // the island bounding box (generous); candidates off the island fail the height test at once
  const X0 = -260, X1 = 260, Z0 = -380, Z1 = 290;
  const MAX = 3300;
  let count = 0;
  for (let i = 0; i < 90000 && count < MAX; i++) {
    const x = X0 + rng() * (X1 - X0), z = Z0 + rng() * (Z1 - Z0);
    const s = shoreDist(x, z);
    if (s < 3) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_MARGIN + 0.45) continue;
    const slope = slopeAt(x, z);
    const pd = parkD(x, z), hd = hillD(x, z);
    const dSum = dist(x, z, SUMMIT), dGrove = dist(x, z, GROVE), dMead = dist(x, z, MEADOW), dSand = dist(x, z, SANDS);
    const cl = cliffiness(x, z);
    // ── beach: a palm now and then on the sand (the main beach's palms are hand-placed) ──
    if (s < 26 && cl < 0.4) {
      if (rng() < 0.035 && slope < 0.3 && dSand > 20 && !taken(x, z, 2.5) && !noGo(x, z, 1) && !(x > 85 && z > -62 && z < 70)) {
        veg.add('palm', x, h, z, 0.85 + rng() * 0.45, rng() * 6.28);
        claim(x, z, 2.5);
        count++;
      }
      continue;
    }
    // ── what grows here: a density and a kind per biome ──
    let density = 0.3;
    let kind: PlantKind;
    let scale = 0.8 + rng() * 0.7;
    let color: string | undefined;
    const roll = rng();
    if (dSum < SUMMIT.shelfR1 + 10 && h > 3) {
      // Sprinkle Summit: snowy firs on the slopes, bare near the top
      if (slope > 0.9 || h > 44) continue;
      density = h > 8 ? 0.62 : 0.4;
      kind = 'pine';
      scale *= 1.25;
      color = h > 8.5 ? SNOW_FIR[(rng() * SNOW_FIR.length) | 0] : undefined;
    } else if (dGrove < GROVE.r + 8) {
      // Glow Grove: a thick strange forest
      density = 0.78;
      kind = roll < 0.65 ? 'oak' : roll < 0.85 ? 'birch' : 'pine';
      color = GLOW_TREES[(rng() * GLOW_TREES.length) | 0];
      scale *= 0.95;
    } else if (dMead < MEADOW.r + 6) {
      // Bloom Meadow: wide open, a few round trees
      density = 0.07;
      kind = 'birch';
      color = MEADOW_TREES[(rng() * MEADOW_TREES.length) | 0];
    } else if (dSand < SANDS.r + 10) {
      // Sunny Sands: scrub and the odd palm
      density = 0.09;
      kind = roll < 0.4 ? 'palm' : 'bush';
      if (kind === 'bush') color = DRY_BUSH[(rng() * DRY_BUSH.length) | 0];
    } else if (pd < 50) {
      density = 0.9;
      kind = roll < 0.45 ? 'oak' : roll < 0.7 ? 'birch' : roll < 0.85 ? 'oak' : 'pine';
      if (kind === 'oak' && rng() < 0.28) color = PAL.autumn[(rng() * PAL.autumn.length) | 0];
    } else if (hd < LOOKOUT.radius) {
      density = h > 6 ? 0.7 : 0.5;
      kind = roll < 0.6 || h > 7 ? 'pine' : roll < 0.8 ? 'oak' : 'birch';
    } else if (x < -50 && z > -52 && z < 52) {
      density = 0.2;
      kind = roll < 0.5 ? 'oak' : roll < 0.78 ? 'pine' : 'birch';
    } else {
      // the countryside: light woods that thicken inland, away from the coast
      density = 0.22 + 0.4 * Math.min(1, s / 120);
      kind = roll < 0.5 ? 'oak' : roll < 0.78 ? 'pine' : 'birch';
    }
    if (rng() > density) continue;
    if (kind === 'pine' && color === undefined) scale *= 1.1;
    const r = (kind === 'pine' ? 1.1 : kind === 'bush' ? 0.8 : 1.5) * scale;
    if (slope > 0.62 && kind !== 'pine') {
      // too steep for trees: a boulder now and then
      if (rng() < 0.12 && !taken(x, z, 1.5) && !noGo(x, z, 1)) {
        veg.add('rock', x, h - 0.1, z, 0.9 + rng() * 1.3, rng() * 6.28, dSand < SANDS.r + 12 ? RED_ROCK[(rng() * 3) | 0] : undefined, true);
        claim(x, z, 1.6);
      }
      continue;
    }
    if (noGo(x, z, r) || taken(x, z, r)) continue;
    veg.add(kind, x, h, z, scale, rng() * 6.28, color, true);
    claim(x, z, r);
    count++;
    // undergrowth next to some trees
    if (kind !== 'bush' && kind !== 'palm' && rng() < 0.4) {
      const a = rng() * 6.28, dd = r + 0.6;
      const bx = x + Math.cos(a) * dd, bz = z + Math.sin(a) * dd;
      if (terrainHeight(bx, bz) > WATER_MARGIN + 0.5 && !noGo(bx, bz, 0.6) && !taken(bx, bz, 0.7)) {
        veg.add('bush', bx, terrainHeight(bx, bz), bz, 0.7 + rng() * 0.6, rng() * 6.28, dGrove < GROVE.r ? GLOW_TREES[(rng() * 4) | 0] : undefined);
        claim(bx, bz, 0.7);
      }
    }
  }

  // ── bushes and flower beds on the lawns, big flower fields in the meadow ──
  const accents = [PAL.pink, PAL.gold, '#ffffff', PAL.violet, PAL.cyan, PAL.orange];
  for (let i = 0; i < 5200; i++) {
    const x = X0 + rng() * (X1 - X0), z = Z0 + rng() * (Z1 - Z0);
    const dMead = dist(x, z, MEADOW);
    const pd = parkD(x, z);
    const homeLawn = x < -54 && z > -48 && z < 50 && x > -150;
    const meadow = dMead < MEADOW.r + 4;
    if (pd > 55 && !homeLawn && !meadow) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_MARGIN + 0.5 || slopeAt(x, z) > 0.4) continue;
    if (shoreDist(x, z) < 16) continue;
    if (noGo(x, z, 0.6) || taken(x, z, meadow ? 0.5 : 0.8)) continue;
    if (meadow) {
      // dense, bright, bigger tufts: the flower fields (colour comes in patches, so a field reads as one colour)
      const patch = Math.floor(((x * 0.045 + z * 0.03) % 1 + 1) * 6) % FLOWER_COLS.length;
      if (rng() < 0.82) veg.add('flowers', x, h, z, 1.1 + rng() * 0.9, rng() * 6.28, FLOWER_COLS[(patch + (rng() < 0.2 ? 1 : 0)) % FLOWER_COLS.length], false);
      else veg.add('bush', x, h, z, 0.6 + rng() * 0.5, rng() * 6.28, MEADOW_TREES[(rng() * 3) | 0], false);
      claim(x, z, 0.5);
      continue;
    }
    if (rng() < 0.55) {
      veg.add('flowers', x, h, z, 0.8 + rng() * 0.7, rng() * 6.28, accents[(rng() * accents.length) | 0], false);
      claim(x, z, 0.6);
    } else {
      veg.add('bush', x, h, z, 0.6 + rng() * 0.6, rng() * 6.28, undefined, false);
      claim(x, z, 0.8);
    }
  }
  // ── red rocks scattered over the dunes, a few boulders along the cliffs ──
  for (let i = 0; i < 900; i++) {
    const x = X0 + rng() * (X1 - X0), z = Z0 + rng() * (Z1 - Z0);
    const s = shoreDist(x, z);
    if (s < 2) continue;
    const dSand = dist(x, z, SANDS);
    const cl = cliffiness(x, z);
    const onDune = dSand < SANDS.r - 4 && rng() < 0.05;
    const onCliff = cl > 0.5 && s < 40 && rng() < 0.06;
    if (!onDune && !onCliff) continue;
    if (noGo(x, z, 1.2) || taken(x, z, 1.6)) continue;
    veg.add('rock', x, terrainHeight(x, z) - 0.15, z, 0.8 + rng() * 1.8, rng() * 6.28, onDune ? RED_ROCK[(rng() * 3) | 0] : undefined, true);
    claim(x, z, 1.6);
  }
  void inp;
  return { veg, build: veg.build() };
}
