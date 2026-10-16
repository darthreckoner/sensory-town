// The ground under everything: rolling hills, the Lookout Hill cone (with its
// road bed carved in), the beach + sea, the lake, a hilly rim around the map,
// plus analytic overlay surfaces (stunt ramps, the bridge, the pier, stairs
// and roof terraces). Pure maths — no three.js — so physics, scenery and the
// terrain meshes all agree on the same numbers.
//
//   groundHeight(x, z)           what the car drives on
//   groundHeight(x, z, true)     what a walker stands on (also stairs + roof decks)
//   terrainHeight(x, z)          the smooth base terrain only (cached 2-unit grid)
import {
  BOUNDS, BRIDGES, DECKS, GROUND, LOOKOUT, PIERS, ROAD_PATHS, SPIRAL, STAIRS, STUNTS, WATER_Y,
  nearestRoad, type Stunt,
} from './townLayout';

const STEP = 2;
const N = Math.round((GROUND * 2) / STEP) + 1;

export const LAKE = { x: 88, z: -100, rx: 25, rz: 19 };
/** x of the shoreline for a given z (the sea lies to the east). */
export const coastX = (z: number): number => 112 + 5 * Math.sin(z / 31) + 3 * Math.sin(z / 13 + 1);
/** 1 along the beach / south-east where the sea lies, 0 up in the park (land all the way east). */
const seaWeight = (z: number): number => smooth(-74, -58, z);

// ── tiny noise ──────────────────────────────────────────────────────────────
function hash(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
export function vnoise(x: number, z: number, seed = 1): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

function softRect(x: number, z: number, cx: number, cz: number, hw: number, hd: number, fall: number): number {
  const dx = Math.max(0, Math.abs(x - cx) - hw), dz = Math.max(0, Math.abs(z - cz) - hd);
  return 1 - smooth(0, fall, Math.hypot(dx, dz));
}

/** 1 where the ground is kept dead flat (towns, the skate plaza, house lots). */
function flatness(x: number, z: number): number {
  return Math.max(
    softRect(x, z, 0, 0, 62, 62, 16),          // downtown
    softRect(x, z, -102, 3, 50, 50, 14),       // Home Hills
    softRect(x, z, -28, 108, 50, 34, 10),      // skate park
  );
}

/** Lookout Hill: a cone whose slope IS the road's climb, plus a flat top. */
function lookoutH(r: number): number {
  const { r0, r1, exp } = SPIRAL;
  const top = LOOKOUT.height - 0.4;
  if (r <= r1) return top;
  if (r <= r0) return 0.5 + (LOOKOUT.height - 0.9) * Math.pow((r0 - r) / (r0 - r1), exp);
  return 0.5 * (1 - smooth(r0, r0 + 16, r));
}

const lookoutPath = ROAD_PATHS.findIndex((p) => p.id === 'lookout');
const lookoutElev = ROAD_PATHS[lookoutPath].elev!;

function rawHeight(x: number, z: number): number {
  const flat = flatness(x, z);
  // rolling countryside: always above sea level (water only where we put it)
  let h = (vnoise(x / 46, z / 46, 1) * 2.4 + vnoise(x / 19, z / 19, 2) * 0.45) * (1 - flat);
  h *= 1 - 0.5 * softRect(x, z, 85, -104, 55, 45, 20); // the park is calmer
  const hillR = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);
  h *= 0.2 + 0.8 * smooth(SPIRAL.r0 - 12, SPIRAL.r0 + 8, hillR); // keep the cone (and its road) clean

  // Lookout Hill
  const lr = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);
  if (lr < SPIRAL.r0 + 18) {
    h += lookoutH(lr);
    if (lr < SPIRAL.r0 + 12) {
      const hit = nearestRoad(x, z, (p) => p.id === 'lookout');
      if (hit.path === lookoutPath) {
        const w = 1 - smooth(4.6, 11, hit.dist);
        if (w > 0) {
          const i = Math.min(lookoutElev.length - 2, Math.max(0, Math.floor(hit.t)));
          const f = Math.min(1, hit.t - i);
          const elev = lookoutElev[i] + (lookoutElev[i + 1] - lookoutElev[i]) * f;
          h = h * (1 - w) + (elev - 0.1) * w;
        }
      }
    }
  }

  // Beach and sea (to the east)
  const d = x - coastX(z);
  const wb = smooth(-46, -30, d) * seaWeight(z);
  if (wb > 0) {
    const hb = d <= 0 ? 0.35 - 0.7 * smooth(-22, 0, d) : WATER_Y - 1.75 * smooth(0, 18, d);
    h = h * (1 - wb) + hb * wb;
  }

  // Lake
  const lx = (x - LAKE.x) / LAKE.rx, lz = (z - LAKE.z) / LAKE.rz;
  const phi = Math.atan2(lz, lx);
  const q = Math.hypot(lx, lz) / (1 + 0.08 * Math.sin(3 * phi) + 0.05 * Math.sin(5 * phi + 1));
  if (q < 1.4) {
    const s = smooth(0.7, 1.4, q);
    h = -1.7 * (1 - s) + h * s;
  }

  // A hilly rim beyond the edge of the map (not on the sea side)
  const edge = Math.max(-x, Math.abs(z), x * (1 - seaWeight(z)));
  const wr = smooth(BOUNDS - 6, BOUNDS + 50, edge);
  if (wr > 0) h += wr * (16 + 10 * vnoise(x / 30, z / 30, 7));
  return h;
}

// ── the cached base grid ────────────────────────────────────────────────────
let grid: Float32Array | null = null;
function build(): Float32Array {
  const g = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++)
    for (let ix = 0; ix < N; ix++) g[iz * N + ix] = rawHeight(-GROUND + ix * STEP, -GROUND + iz * STEP);
  return g;
}

/**
 * Base terrain, interpolated over EXACTLY the triangles the terrain mesh draws
 * (drive/terrain.ts buildChunk: vertices every 2 grid cells, split along the
 * b-d diagonal), so wheels, feet, roads and props sit on the visible ground
 * even on steep hills. (Bilinear over the finer grid drifted up to 0.8 m.)
 */
export const TERRAIN_MESH_STEP = STEP * 2;
export function terrainHeight(x: number, z: number): number {
  if (!grid) grid = build();
  const L = TERRAIN_MESH_STEP, M = (N - 1) / 2 - 1.001;
  let fx = (x + GROUND) / L, fz = (z + GROUND) / L;
  fx = fx < 0 ? 0 : fx > M ? M : fx;
  fz = fz < 0 ? 0 : fz > M ? M : fz;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const u = fx - ix, v = fz - iz;
  const i = iz * 2 * N + ix * 2;
  const a = grid[i], b = grid[i + 2], d = grid[i + 2 * N], e = grid[i + 2 * N + 2];
  // triangles (a,d,b) and (b,d,e)
  return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
}

// ── overlay surfaces ────────────────────────────────────────────────────────
interface Overlay {
  x0: number; z0: number; x1: number; z1: number;
  foot: boolean;
  h(x: number, z: number): number; // NaN = no surface here
  /** what a WALKER stands on, when that differs from the car's surface (stunts: the rendered cells) */
  hFoot?(x: number, z: number): number;
  /** a skate stunt (roads and plazas are paved under these, never draped over them) */
  stunt?: boolean;
  /** a bridge or pier deck: something a swimmer can pass UNDER (see groundHeight's noDecks) */
  deck?: boolean;
}
const OVERLAYS: Overlay[] = [];

const pw = (t: number, e: number): number => Math.pow(t < 0 ? 0 : t > 1 ? 1 : t, e);

function stuntOverlay(s: Stunt): Overlay {
  if (s.kind === 'bank') {
    const R = s.r1 + 1;
    return {
      x0: s.x - R, z0: s.z - R, x1: s.x + R, z1: s.z + R, foot: false,
      h(x, z) {
        const dx = x - s.x, dz = z - s.z;
        const r = Math.hypot(dx, dz);
        if (r < s.r0 || r > s.r1) return NaN;
        let a = Math.atan2(dz, dx) - s.a0;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (a > s.a1 - s.a0) return NaN;
        return s.h * pw((r - s.r0) / (s.r1 - s.r0), 1.7);
      },
    };
  }
  const fx = Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  const rx = Math.cos(s.yaw), rz = Math.sin(s.yaw);
  const len = s.kind === 'roller' ? s.n * s.hl : s.len;
  const R = Math.hypot(len / 2, s.w / 2) + 1;
  const base = { x0: s.x - R, z0: s.z - R, x1: s.x + R, z1: s.z + R, foot: false };
  return {
    ...base,
    h(x, z) {
      const dx = x - s.x, dz = z - s.z;
      const u = dx * fx + dz * fz + len / 2;      // 0..len along the ramp
      const v = dx * rx + dz * rz;                // lateral
      if (u < 0 || u > len) return NaN;
      const av = Math.abs(v);
      if (av > s.w / 2) return NaN;
      const side = Math.min(1, (s.w / 2 - av) / 0.7); // soft side edges
      switch (s.kind) {
        case 'kicker':
          return s.h * pw(u / len, s.curve ?? 1.4) * side;
        case 'box': {
          const t = u < s.ramp ? u / s.ramp : u > len - s.ramp ? (len - u) / s.ramp : 1;
          return s.h * t * side;
        }
        case 'roller': {
          const k = Math.sin((Math.PI * (u % s.hl)) / s.hl);
          return s.h * k * k * side;
        }
        case 'pipe': {
          const flatHalf = s.w / 2 - s.tw;
          const m = av;
          if (m < flatHalf) return 0;
          return s.h * pw((m - flatHalf) / s.tw, 1.8);
        }
      }
    },
  };
}
/**
 * The skate mesh (drive/skate.ts) renders each stunt as flat-topped 0.75 m cells
 * sampled from the analytic surface, with vertical skirts between them. Cars ride
 * the smooth curve; a walker stands on exactly what is drawn, so their feet never
 * sink into a cell edge or a skirt. Keep STUNT_CELL / the 0.04 inset in sync with skate.ts.
 */
export const STUNT_CELL = 0.75;
function stuntCells(o: Overlay): (x: number, z: number) => number {
  const S = STUNT_CELL, e = 0.04;
  const H = (x: number, z: number): number => groundHeight(x, z); // what skate.ts samples (overlapping stunts combined)
  return (x, z) => {
    const xa = Math.floor(x / S) * S, za = Math.floor(z / S) * S;
    if (!(H(xa + S / 2, za + S / 2) >= 0.04)) return NaN; // the mesh skips this cell
    const xb = xa + S, zb = za + S;
    const ha = H(xa + e, za + e), hb = H(xb - e, za + e), hc = H(xb - e, zb - e), hd = H(xa + e, zb - e);
    const u = (x - xa) / S, v = (z - za) / S;
    // same diagonal as Mesher.quad(p0=(xa,za), p1=(xa,zb), p2=(xb,zb), p3=(xb,za))
    return v >= u ? ha + (hd - ha) * v + (hc - hd) * u : ha + (hb - ha) * u + (hc - hb) * v;
  };
}
for (const s of STUNTS) {
  const o = stuntOverlay(s);
  o.stunt = true;
  o.hFoot = stuntCells(o);
  OVERLAYS.push(o);
}

for (const b of BRIDGES) {
  const dx = b.bx - b.ax, dz = b.bz - b.az;
  const L = Math.hypot(dx, dz);
  const fx = dx / L, fz = dz / L;
  OVERLAYS.push({
    x0: Math.min(b.ax, b.bx) - b.w, z0: Math.min(b.az, b.bz) - b.w, x1: Math.max(b.ax, b.bx) + b.w, z1: Math.max(b.az, b.bz) + b.w,
    foot: false,
    deck: true,
    h(x, z) {
      const u = (x - b.ax) * fx + (z - b.az) * fz;
      const v = -(x - b.ax) * fz + (z - b.az) * fx;
      if (u < 0 || u > L || Math.abs(v) > b.w / 2) return NaN;
      return b.endY + (b.peak - b.endY) * Math.pow(Math.sin((Math.PI * u) / L), 0.8);
    },
  });
}

for (const p of PIERS) {
  const dx = p.bx - p.ax, dz = p.bz - p.az;
  const L = Math.hypot(dx, dz);
  const fx = dx / L, fz = dz / L;
  OVERLAYS.push({
    x0: Math.min(p.ax, p.bx) - p.w, z0: Math.min(p.az, p.bz) - p.w, x1: Math.max(p.ax, p.bx) + p.w, z1: Math.max(p.az, p.bz) + p.w,
    foot: false,
    deck: true,
    h(x, z) {
      const u = (x - p.ax) * fx + (z - p.az) * fz;
      const v = -(x - p.ax) * fz + (z - p.az) * fx;
      if (u < 0 || u > L || Math.abs(v) > p.w / 2) return NaN;
      const s = Math.min(1, u / 4); // a short ramp up from the sand
      return p.y * (0.45 + 0.55 * s);
    },
  });
}

for (const s of STAIRS) {
  const fx = Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  const rx = Math.cos(s.yaw), rz = Math.sin(s.yaw);
  const R = Math.hypot(s.len / 2, s.w / 2) + 1;
  OVERLAYS.push({
    x0: s.x - R, z0: s.z - R, x1: s.x + R, z1: s.z + R, foot: true,
    h(x, z) {
      const dx = x - s.x, dz = z - s.z;
      const u = dx * fx + dz * fz + s.len / 2;
      const v = dx * rx + dz * rz;
      if (u < 0 || u > s.len || Math.abs(v) > s.w / 2) return NaN;
      // real steps (about 0.9 deep) so a walker climbs them one by one
      const n = Math.max(2, Math.round(s.len / 0.9));
      return s.h * ((Math.floor((u / s.len) * n * 0.9999) + 1) / n);
    },
  });
}
for (const d of DECKS) {
  OVERLAYS.push({
    x0: d.x - d.w / 2, z0: d.z - d.d / 2, x1: d.x + d.w / 2, z1: d.z + d.d / 2, foot: true,
    h: (x, z) => (Math.abs(x - d.x) <= d.w / 2 && Math.abs(z - d.z) <= d.d / 2 ? d.y : NaN),
  });
}

/** Surface under a point. `foot` also counts stairs and roof terraces. */
export function groundHeight(x: number, z: number, foot = false, noDecks = false): number {
  let h = terrainHeight(x, z);
  for (let i = 0; i < OVERLAYS.length; i++) {
    const o = OVERLAYS[i];
    if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
    if (o.foot && !foot) continue;
    if (noDecks && o.deck) continue; // the seabed / bank under a bridge or pier
    const oh = foot && o.hFoot ? o.hFoot(x, z) : o.h(x, z);
    if (oh > h) h = oh;
  }
  return h;
}

/** On a railed walkway (stairs, roof terrace)? Walkers don't stroll off those. */
export function railedAt(x: number, z: number): boolean {
  for (let i = 0; i < OVERLAYS.length; i++) {
    const o = OVERLAYS[i];
    if (!o.foot || x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
    if (o.h(x, z) === o.h(x, z)) return true; // not NaN
  }
  return false;
}

/** Surface for paving (roads, sidewalks, plazas): terrain, bridges and piers, but never draped over a stunt. */
export function paveHeight(x: number, z: number): number {
  let h = terrainHeight(x, z);
  for (let i = 0; i < OVERLAYS.length; i++) {
    const o = OVERLAYS[i];
    if (o.foot || o.stunt) continue;
    if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
    const oh = o.h(x, z);
    if (oh > h) h = oh;
  }
  return h;
}

/** Unit surface normal (written into `out`). */
export function groundNormal(x: number, z: number, out: { x: number; y: number; z: number }, foot = false): void {
  const e = 0.7;
  const dx = groundHeight(x + e, z, foot) - groundHeight(x - e, z, foot);
  const dz = groundHeight(x, z + e, foot) - groundHeight(x, z - e, foot);
  const l = Math.hypot(dx, 2 * e, dz);
  out.x = -dx / l;
  out.y = (2 * e) / l;
  out.z = -dz / l;
}

/** The water's surface: the flat level plus the same gentle waves the water mesh animates (drive/terrain.ts). */
export function waveY(x: number, z: number, t: number): number {
  const a = Math.sin(x * 0.11 + t * 1.1), b = Math.sin(z * 0.13 - t * 0.8), c = Math.sin((x + z) * 0.2 + t * 1.7);
  return WATER_Y + 0.06 * (a + b + 0.5 * c);
}

/** Open water (sea / lake): too deep for a car (walkers wade it, and swim where it is deeper than tuning.drive.swimOn). */
export function isWater(x: number, z: number): boolean {
  return groundHeight(x, z, true) < WATER_Y - 0.12;
}

/** Grid access for the terrain mesh / minimap (same numbers as terrainHeight). */
export const HF = { step: STEP, n: N, half: GROUND };
