// ── v3 build (W5): the PHYSICAL side of free building ──────────────────────────
// Everything a mover needs to know about the pieces a player built in the world:
//   surfaceBelow(x, z, yRef)  top of the highest built floor / ramp / roof at or below yRef + stepUp
//   colliders                 3D boxes (y0 = underside, h = top) for wall panels and ramp strips,
//                             so a wall only blocks bodies whose height overlaps it
//   slot / edge occupancy     one piece per cell-slot (floor, ramp, roof) and per wall edge
// The pieces themselves live in store.data.town.builds; this module indexes them. It has no
// rendering and no DOM, so Drive's foot / car physics can import it freely.
//
// Grid (tuning.build3): tile = 4.8 m, storey = 3.6 m. Cell (ix, iz) covers
// x in [ix*tile, (ix+1)*tile], z likewise; storey iy starts at y = iy * storey.
//   wall   on a cell edge (dir 0 N, 1 E, 2 S, 3 W), storey iy, 3x3 panels (bit r*3+c of `edit` = panel removed;
//          r 0 = top row; c runs along +x for N/S walls and +z for E/W walls)
//   floor  a slab at the storey's base (top = base + thick); `edit` bit = hole in that 3x3 sub-cell (r along +z, c along +x)
//   ramp   a sloped slab rising from the storey base to the next storey, uphill toward `dir`
//   roof   a pyramid on the storey base, apex tuning.build3.roofRise storeys up (walkable)
import type { BuildPiece } from '../core/model';
import { tuning } from '../tuning';
import type { Collider } from './townEnv';
import { groundHeight } from './heightfield';

const B = tuning.build3;
export const TILE = B.tile;
export const STOREY = B.storey;
export const THICK = B.thick;
export const ROOF_RISE = B.roofRise * B.storey;

// The ground storey hugs the ground: storey 0 of a cell column starts at the terrain height under the
// column, rounded UP to a 0.3 m step so a floor's top is flush with (never buried below) the ground.
// Upper storeys stack from there. The value is cached per column, so a build never shifts afterwards.
const GROUND_STEP = THICK;
const anchors = new Map<string, number>();
export function anchorY(ix: number, iz: number): number {
  const k = ix + ',' + iz;
  let a = anchors.get(k);
  if (a === undefined) {
    const g = groundHeight((ix + 0.5) * TILE, (iz + 0.5) * TILE, false, true);
    a = Math.ceil((g - THICK) / GROUND_STEP - 1e-6) * GROUND_STEP;
    anchors.set(k, Math.round(a * 1000) / 1000);
    a = anchors.get(k)!;
  }
  return a;
}
/** World y where a piece's storey begins. */
export const pieceY0 = (p: Pick<BuildPiece, 'ix' | 'iy' | 'iz'>): number => anchorY(p.ix, p.iz) + p.iy * STOREY;

/** Where a piece sits in the world: its anchor point (wall: middle of its edge) and the yaw of its local frame. */
export interface PieceFrame { x: number; y: number; z: number; rotY: number }

export function pieceFrame(p: Pick<BuildPiece, 'kind' | 'ix' | 'iy' | 'iz' | 'dir'>): PieceFrame {
  const y = pieceY0(p);
  if (p.kind !== 'wall') return { x: (p.ix + 0.5) * TILE, y, z: (p.iz + 0.5) * TILE, rotY: 0 };
  switch (p.dir) {
    case 0: return { x: (p.ix + 0.5) * TILE, y, z: p.iz * TILE, rotY: 0 };
    case 2: return { x: (p.ix + 0.5) * TILE, y, z: (p.iz + 1) * TILE, rotY: 0 };
    case 1: return { x: (p.ix + 1) * TILE, y, z: (p.iz + 0.5) * TILE, rotY: Math.PI / 2 };
    default: return { x: p.ix * TILE, y, z: (p.iz + 0.5) * TILE, rotY: Math.PI / 2 };
  }
}

/** The world cell a position falls in. */
export const cellOf = (v: number): number => Math.floor(v / TILE);

const cellKey = (ix: number, iz: number) => `${ix},${iz}`;

/** The unique key of a wall's edge (a N wall of one cell is the S wall of its northern neighbour). */
export function edgeKey(p: Pick<BuildPiece, 'ix' | 'iy' | 'iz' | 'dir'>): string {
  switch (p.dir) {
    case 0: return `h:${p.ix}:${p.iz}:${p.iy}`;
    case 2: return `h:${p.ix}:${p.iz + 1}:${p.iy}`;
    case 3: return `v:${p.ix}:${p.iz}:${p.iy}`;
    default: return `v:${p.ix + 1}:${p.iz}:${p.iy}`;
  }
}

/** What a piece occupies: walls their edge, everything else the cell-slot at its storey. */
export function slotKey(p: Pick<BuildPiece, 'kind' | 'ix' | 'iy' | 'iz' | 'dir'>): string {
  return p.kind === 'wall' ? 'e:' + edgeKey(p) : `c:${p.ix}:${p.iy}:${p.iz}`;
}

// ── surfaces ────────────────────────────────────────────────────────────────
/** Top surface of a floor / ramp / roof piece at a point inside its cell (-Infinity: nothing there, e.g. a floor hole). */
export function pieceTopAt(p: BuildPiece, x: number, z: number): number {
  if (p.kind === 'wall') return -Infinity;
  const u = (x - p.ix * TILE) / TILE, v = (z - p.iz * TILE) / TILE;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return -Infinity;
  const y0 = pieceY0(p);
  switch (p.kind) {
    case 'floor': {
      if (p.edit) {
        const c = Math.min(2, Math.floor(u * 3)), r = Math.min(2, Math.floor(v * 3));
        if (p.edit & (1 << (r * 3 + c))) return -Infinity;
      }
      return y0 + THICK;
    }
    case 'ramp': {
      const t = p.dir === 0 ? 1 - v : p.dir === 2 ? v : p.dir === 1 ? u : 1 - u;
      return y0 + STOREY * t;
    }
    default: {
      // roof: a pyramid
      const m = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      return y0 + ROOF_RISE * (1 - m);
    }
  }
}

// ── colliders ───────────────────────────────────────────────────────────────
const buildColliders = new WeakSet<Collider>();
/** Is this collider one of the player's builds (as opposed to the static world)? */
export const isBuildCollider = (c: Collider): boolean => buildColliders.has(c);

/** Runs of columns [c0, c1] whose panel is still there in row r of a wall. */
export function rowRuns(mask: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let c = 0; c <= 3; c++) {
    const here = c < 3 && !(mask & (1 << (r * 3 + c)));
    if (here && start < 0) start = c;
    else if (!here && start >= 0) {
      out.push([start, c - 1]);
      start = -1;
    }
  }
  return out;
}

function mk(x: number, z: number, hw: number, hd: number, y0: number, h: number): Collider {
  const c: Collider = { kind: 'box', x, z, hw, hd, y0, h };
  buildColliders.add(c);
  return c;
}

/** The 3D boxes a piece makes (walls: the panels still standing; ramps: strips along the slope; floors / roofs: none). */
export function collidersOf(p: BuildPiece): Collider[] {
  const out: Collider[] = [];
  const f = pieceFrame(p);
  if (p.kind === 'wall') {
    const mask = p.edit ?? 0;
    const alongX = p.dir === 0 || p.dir === 2;
    const cw = TILE / 3, rh = STOREY / 3, half = THICK / 2 + 0.04;
    const start = (alongX ? p.ix : p.iz) * TILE;
    // rows with identical runs merge into one taller box
    const rows = [0, 1, 2].map((r) => rowRuns(mask, r));
    let r = 0;
    while (r < 3) {
      let r2 = r;
      while (r2 + 1 < 3 && JSON.stringify(rows[r2 + 1]) === JSON.stringify(rows[r])) r2++;
      const yTop = f.y + (3 - r) * rh, yBot = f.y + (2 - r2) * rh;
      for (const [c0, c1] of rows[r]) {
        const mid = start + ((c0 + c1 + 1) / 2) * cw, len = ((c1 - c0 + 1) * cw) / 2;
        out.push(alongX ? mk(mid, f.z, len, half, yBot, yTop) : mk(f.x, mid, half, len, yBot, yTop));
      }
      r = r2 + 1;
    }
  } else if (p.kind === 'ramp') {
    const n = B.rampStrips, y0 = f.y;
    const alongZ = p.dir === 0 || p.dir === 2;
    const x0 = p.ix * TILE, z0 = p.iz * TILE;
    for (let i = 0; i < n; i++) {
      // strip i covers t in [i/n, (i+1)/n] counted from the low edge; its lowest top is at t = i/n
      const tl = y0 + (STOREY * i) / n;
      const a = (i / n) * TILE, b = ((i + 1) / n) * TILE;
      // low edge position along the uphill axis
      let lo: number, hi: number;
      if (p.dir === 0) [lo, hi] = [z0 + TILE - b, z0 + TILE - a];
      else if (p.dir === 2) [lo, hi] = [z0 + a, z0 + b];
      else if (p.dir === 1) [lo, hi] = [x0 + a, x0 + b];
      else [lo, hi] = [x0 + TILE - b, x0 + TILE - a];
      if (alongZ) out.push(mk(x0 + TILE / 2, (lo + hi) / 2, TILE / 2, (hi - lo) / 2, tl - THICK, tl));
      else out.push(mk((lo + hi) / 2, z0 + TILE / 2, (hi - lo) / 2, TILE / 2, tl - THICK, tl));
    }
  }
  return out;
}

// ── the index ───────────────────────────────────────────────────────────────
type ColliderSink = { add(c: Collider): void; remove(c: Collider): void };

class BuildSpace {
  readonly pieces = new Map<string, BuildPiece>();
  private slots = new Map<string, string>();          // slotKey -> piece id
  private columns = new Map<string, BuildPiece[]>();  // 'ix,iz' -> floors / ramps / roofs in that column
  private cols = new Map<string, Collider[]>();       // piece id -> colliders
  private sink: ColliderSink | null = null;

  get size(): number { return this.pieces.size; }

  /** Rebuild the index from saved pieces (the caller keeps owning the array). */
  load(list: readonly BuildPiece[]): void {
    this.clear();
    for (const p of list) this.add(p);
  }

  /** Keep a collision grid in step with the pieces (existing colliders are added now). */
  attach(sink: ColliderSink | null): void {
    if (this.sink) for (const cs of this.cols.values()) for (const c of cs) this.sink.remove(c);
    this.sink = sink;
    if (sink) for (const cs of this.cols.values()) for (const c of cs) sink.add(c);
  }

  clear(): void {
    if (this.sink) for (const cs of this.cols.values()) for (const c of cs) this.sink.remove(c);
    this.pieces.clear();
    this.slots.clear();
    this.columns.clear();
    this.cols.clear();
  }

  has(id: string): boolean {
    return this.pieces.has(id);
  }

  /** Is the spot (cell-slot or wall edge) this piece would take free? (`ignoreId` = a piece being replaced / moved.) */
  free(p: Pick<BuildPiece, 'kind' | 'ix' | 'iy' | 'iz' | 'dir'>, ignoreId?: string): boolean {
    const id = this.slots.get(slotKey(p));
    return id === undefined || id === ignoreId;
  }

  pieceAtSlot(p: Pick<BuildPiece, 'kind' | 'ix' | 'iy' | 'iz' | 'dir'>): BuildPiece | undefined {
    const id = this.slots.get(slotKey(p));
    return id ? this.pieces.get(id) : undefined;
  }

  add(p: BuildPiece): void {
    if (this.pieces.has(p.id)) this.remove(p.id);
    this.pieces.set(p.id, p);
    this.slots.set(slotKey(p), p.id);
    if (p.kind !== 'wall') {
      const k = cellKey(p.ix, p.iz);
      const col = this.columns.get(k);
      if (col) col.push(p);
      else this.columns.set(k, [p]);
    }
    const cs = collidersOf(p);
    if (cs.length) {
      this.cols.set(p.id, cs);
      if (this.sink) for (const c of cs) this.sink.add(c);
    }
  }

  remove(id: string): BuildPiece | undefined {
    const p = this.pieces.get(id);
    if (!p) return undefined;
    this.pieces.delete(id);
    const sk = slotKey(p);
    if (this.slots.get(sk) === id) this.slots.delete(sk);
    if (p.kind !== 'wall') {
      const k = cellKey(p.ix, p.iz);
      const col = this.columns.get(k);
      if (col) {
        const i = col.indexOf(p);
        if (i >= 0) col.splice(i, 1);
        if (!col.length) this.columns.delete(k);
      }
    }
    const cs = this.cols.get(id);
    if (cs) {
      if (this.sink) for (const c of cs) this.sink.remove(c);
      this.cols.delete(id);
    }
    return p;
  }

  /** A piece changed (edit mask, tint...): refresh its surfaces and colliders. */
  update(p: BuildPiece): void {
    this.add(p);
  }

  /**
   * Does a roof at this storey have something under it? On the ground storey always; higher up it needs a wall
   * on one of the cell's four edges one storey below, or a roof next to it (at the same storey) that has.
   */
  roofHasSupport(ix: number, iy: number, iz: number): boolean {
    if (iy <= 0) return true;
    const seen = new Set<string>();
    const queue: [number, number][] = [[ix, iz]];
    while (queue.length) {
      const [x, z] = queue.pop()!;
      const k = x + ',' + z;
      if (seen.has(k)) continue;
      seen.add(k);
      if (this.slots.has('e:' + edgeKey({ ix: x, iy: iy - 1, iz: z, dir: 0 })) || this.slots.has('e:' + edgeKey({ ix: x, iy: iy - 1, iz: z, dir: 1 })) ||
          this.slots.has('e:' + edgeKey({ ix: x, iy: iy - 1, iz: z, dir: 2 })) || this.slots.has('e:' + edgeKey({ ix: x, iy: iy - 1, iz: z, dir: 3 }))) return true;
      if (seen.size > 400) return false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = this.slots.get(`c:${x + dx}:${iy}:${z + dz}`);
        const q = id ? this.pieces.get(id) : undefined;
        if (q && q.kind === 'roof') queue.push([x + dx, z + dz]);
      }
    }
    return false;
  }

  /** Pieces whose floor / ramp / roof is in the column under (x, z). */
  columnAt(x: number, z: number): readonly BuildPiece[] {
    return this.columns.get(cellKey(cellOf(x), cellOf(z))) ?? EMPTY;
  }

  /**
   * Top of the highest built floor / ramp / roof under (x, z) that is at or below `yRef + stepUp`
   * (what a walker or car standing at height yRef can step onto), or -Infinity. A floor above your head is passed under.
   */
  surfaceBelow(x: number, z: number, yRef: number, stepUp = B.stepUp): number {
    if (this.columns.size === 0) return -Infinity;
    const col = this.columns.get(cellKey(cellOf(x), cellOf(z)));
    if (!col) return -Infinity;
    let best = -Infinity;
    const lim = yRef + stepUp;
    for (let i = 0; i < col.length; i++) {
      const top = pieceTopAt(col[i], x, z);
      if (top <= lim && top > best) best = top;
    }
    return best;
  }

  /** Every built surface top above `yMin` under (x, z), highest first (for camera / sweeps). */
  surfacesAt(x: number, z: number): number[] {
    const col = this.columns.get(cellKey(cellOf(x), cellOf(z)));
    if (!col) return [];
    const out: number[] = [];
    for (const p of col) {
      const t = pieceTopAt(p, x, z);
      if (t > -Infinity) out.push(t);
    }
    return out.sort((a, b) => b - a);
  }
}

const EMPTY: readonly BuildPiece[] = [];

export const buildSpace = new BuildSpace();

/** Top of the highest built surface a mover at height yRef can stand on at (x, z); -Infinity when none. */
export function surfaceBelow(x: number, z: number, yRef: number, stepUp?: number): number {
  return buildSpace.surfaceBelow(x, z, yRef, stepUp);
}
