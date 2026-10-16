// Placement rules, footprints and pointer snapping for house building
// (pure logic, no three.js).
//
// Coordinates: a plot is plotCells x plotCells cells; cell (x,z) is centred at
// ((x+0.5)*grid, (z+0.5)*grid) from the plot origin corner. A piece's (x,z) is
// its ANCHOR cell; its footprint extends from the anchor in the piece's own
// (rotated) frame - local +x = right, local +z = back, front faces -z.
// Rotation r (quarter turns, rotation.y = -r*90deg) maps local cell (i,j) to
// world offset: r0 (i,j) r1 (-j,i) r2 (-i,-j) r3 (j,-i).
import type { PieceType, PlacedPiece } from '../core/model';
import { tuning } from '../tuning';
import { localCells, pieceDef, type PieceDef, type PieceKind } from './catalog';

export type Rot = 0 | 1 | 2 | 3;
export type Level = 0 | 1;

export const levelOf = (p: { level?: number }): Level => (p.level === 1 ? 1 : 0);

export function rotOffset(i: number, j: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 0: return [i, j];
    case 1: return [-j, i];
    case 2: return [-i, -j];
    default: return [j, -i];
  }
}

export const cellKey = (x: number, z: number) => `${x},${z}`;

export const isEdgeType = (t: PieceType) => pieceDef(t)?.kind === 'edge';
export const isRoofType = (t: PieceType) => pieceDef(t)?.kind === 'roof';
export const isFloorType = (t: PieceType) => pieceDef(t)?.kind === 'floor';
/** Walls that have a body (corner fills, things can hang on / back onto them). */
export const isBodyWall = (t: PieceType) =>
  t === 'wall' || t === 'wallWindow' || t === 'wallWindowBig' || t === 'wallDoor' || t === 'wallGlassDoor' || t === 'wallGarage';
export const isSolidWall = (t: PieceType) => t === 'wall' || t === 'wallWindow' || t === 'wallWindowBig';

/** A wall's edge, normalized so two cells sharing an edge agree: 'h:x:zLine' / 'v:xLine:z'. */
export function edgeKey(p: { x: number; z: number; rot: number }): string {
  switch (p.rot & 3) {
    case 0: return `h:${p.x}:${p.z}`;
    case 2: return `h:${p.x}:${p.z + 1}`;
    case 3: return `v:${p.x}:${p.z}`;
    default: return `v:${p.x + 1}:${p.z}`;
  }
}

/** The (anchor-relative) cells an edge piece runs along: local +x. */
export function edgeCells(x: number, z: number, rot: number, span: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < span; i++) {
    const [dx, dz] = rotOffset(i, 0, rot);
    out.push([x + dx, z + dz]);
  }
  return out;
}

/** World cells covered by a footprint piece. */
export function footprintCells(def: PieceDef, x: number, z: number, rot: number): [number, number][] {
  return localCells(def).map(([i, j]) => {
    const [dx, dz] = rotOffset(i, j, rot);
    return [x + dx, z + dz] as [number, number];
  });
}

/** The anchor that puts the rotated footprint's bounding-box minimum corner at (minX, minZ). */
export function anchorForMin(def: PieceDef, rot: number, minX: number, minZ: number): [number, number] {
  let mx = Infinity, mz = Infinity;
  for (const [i, j] of localCells(def)) {
    const [dx, dz] = rotOffset(i, j, rot);
    mx = Math.min(mx, dx);
    mz = Math.min(mz, dz);
  }
  return [minX - mx, minZ - mz];
}

/** Direction (world) -> the cell-edge rot that faces that way. */
export function edgeRotFromDir(dx: number, dz: number): Rot {
  if (dz < 0) return 0;
  if (dx > 0) return 1;
  if (dz > 0) return 2;
  return 3;
}

// ── House context: lookups by level / cell / edge ───────────────────────────
export interface HouseCtx {
  pieces: readonly PlacedPiece[];
  walls: Map<string, PlacedPiece>;      // `${level}|${edgeKey}` -> edge piece (walls, windows, fences...)
  roofs: Map<string, PlacedPiece>;      // 'x,z'
  furn: Map<string, PlacedPiece>;       // `${level}|x,z` -> furniture / stairs covering that cell
  rugs: Map<string, PlacedPiece>;       // `${level}|x,z`
  floors: Map<string, PlacedPiece>;     // `${level}|x,z`
  creations: Map<string, PlacedPiece>;  // `${level}|x,z`
  decos: Map<string, PlacedPiece>;      // `${level}|x,z,rot` wall decor
  stairVoid: Set<string>;               // 'x,z' cells opened up above ground-floor stairs
  upper: Set<string>;                   // 'x,z' cells that have something on level 1 (candidates for a lifted roof)
  touched: [Set<string>, Set<string>];  // 'x,z' cells a body wall of that level stands in / beside (what roofs can rest on)
  roofCache?: { s1: Set<string>; s0: Set<string> };
}

export function makeCtx(pieces: readonly PlacedPiece[]): HouseCtx {
  const ctx: HouseCtx = {
    pieces,
    walls: new Map(), roofs: new Map(), furn: new Map(), rugs: new Map(), floors: new Map(),
    creations: new Map(), decos: new Map(), stairVoid: new Set(), upper: new Set(), touched: [new Set(), new Set()],
  };
  const edges: PlacedPiece[] = [];
  for (const p of pieces) {
    const def = pieceDef(p.type);
    if (!def) continue;
    const lv = levelOf(p);
    switch (def.kind) {
      case 'edge': {
        for (const [cx, cz] of edgeCells(p.x, p.z, p.rot, def.w)) ctx.walls.set(`${lv}|${edgeKey({ x: cx, z: cz, rot: p.rot })}`, p);
        edges.push(p);
        break;
      }
      case 'roof': ctx.roofs.set(cellKey(p.x, p.z), p); break;
      case 'floor':
        ctx.floors.set(`${lv}|${cellKey(p.x, p.z)}`, p);
        if (lv === 1) ctx.upper.add(cellKey(p.x, p.z));
        break;
      case 'rug':
        for (const [cx, cz] of footprintCells(def, p.x, p.z, p.rot)) ctx.rugs.set(`${lv}|${cellKey(cx, cz)}`, p);
        break;
      case 'furn':
      case 'stairs':
        for (const [cx, cz] of footprintCells(def, p.x, p.z, p.rot)) {
          ctx.furn.set(`${lv}|${cellKey(cx, cz)}`, p);
          if (def.kind === 'stairs' && lv === 0) {
            ctx.stairVoid.add(cellKey(cx, cz));
            ctx.upper.add(cellKey(cx, cz));   // the stairwell belongs to the upper storey's volume
          }
          if (lv === 1) ctx.upper.add(cellKey(cx, cz));
        }
        break;
      case 'wallDeco': ctx.decos.set(`${lv}|${cellKey(p.x, p.z)},${p.rot}`, p); break;
      case 'creation': ctx.creations.set(`${lv}|${cellKey(p.x, p.z)}`, p); break;
    }
  }
  // Walls decide what roofs can rest on (needs every floor known first). Only walls with a body count:
  // rails and fences carry no roof. Upstairs, a wall belongs to the side that has the floor (both sides
  // for a partition or a floorless wall), so a roof never lifts over the empty cell outside a wall.
  for (const p of edges) {
    if (!isBodyWall(p.type)) continue;
    const lv = levelOf(p);
    const [dx, dz] = rotOffset(0, -1, p.rot);   // the cell across the edge (front side)
    for (const [cx, cz] of edgeCells(p.x, p.z, p.rot, pieceDef(p.type)!.w)) {
      const a = cellKey(cx, cz), b = cellKey(cx + dx, cz + dz);
      if (lv === 0) {
        ctx.touched[0].add(a);
        ctx.touched[0].add(b);
        continue;
      }
      const fa = ctx.floors.has(`1|${a}`), fb = ctx.floors.has(`1|${b}`);
      const inside = fa || fb ? [...(fa ? [a] : []), ...(fb ? [b] : [])] : [a, b];
      for (const k of inside) {
        ctx.touched[1].add(k);
        ctx.upper.add(k);
      }
    }
  }
  return ctx;
}

// ── Roofs rest on what is really under them ─────────────────────────────────
const nbrs = (k: string): string[] => {
  const [x, z] = k.split(',').map(Number);
  return [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`];
};

/**
 * Which roof cells sit on the upstairs walls (s1) / on the ground-floor walls (s0).
 * A roof cell is supported when a body wall of that storey stands in or beside its cell, or when it
 * touches (4-neighbour) a supported roof cell of the same height - a roof spans between walls, but a
 * slab with no wall anywhere near it never hangs in the air. Everything else rests on its floor / the ground.
 */
function roofSupport(ctx: HouseCtx): { s1: Set<string>; s0: Set<string> } {
  if (ctx.roofCache) return ctx.roofCache;
  const cells = [...ctx.roofs.keys()];
  const near = (set: Set<string>, k: string) => set.has(k) || nbrs(k).some((n) => set.has(n));
  const grow = (seeds: string[], allow: (k: string) => boolean): Set<string> => {
    const out = new Set<string>(seeds);
    const queue = [...seeds];
    while (queue.length) {
      const k = queue.pop()!;
      for (const n of nbrs(k)) if (!out.has(n) && allow(n)) {
        out.add(n);
        queue.push(n);
      }
    }
    return out;
  };
  const s1 = grow(cells.filter((k) => ctx.upper.has(k) && near(ctx.touched[1], k)), (k) => ctx.roofs.has(k) && ctx.upper.has(k));
  const s0 = grow(cells.filter((k) => !s1.has(k) && near(ctx.touched[0], k)), (k) => ctx.roofs.has(k) && !s1.has(k));
  return (ctx.roofCache = { s1, s0 });
}

/** Which storey a roof over this cell caps (0 = the ground floor, 1 = the upstairs). */
export function topLevelAt(ctx: HouseCtx, x: number, z: number): Level {
  return roofSupport(ctx).s1.has(cellKey(x, z)) ? 1 : 0;
}

/**
 * Height of the plane a roof over this cell rests on: the top of the upstairs walls, the top of the
 * ground-floor walls, or (when no wall holds it up) whatever floor / ground is really there.
 */
export function roofBaseY(ctx: HouseCtx, x: number, z: number): number {
  const H = tuning.build.wallHeight, FL = tuning.build.floorHeight;
  const k = cellKey(x, z);
  const sup = roofSupport(ctx);
  if (sup.s1.has(k)) return 2 * H;
  const upFloor = ctx.floors.has(`1|${k}`);
  if (sup.s0.has(k)) return upFloor ? H + FL : H;
  if (upFloor) return H + FL;
  return ctx.floors.has(`0|${k}`) ? FL : 0;
}

// ── Placement validity ──────────────────────────────────────────────────────
export interface Cand { type: PieceType; x: number; z: number; rot: Rot; level: Level }

const inPlot = (x: number, z: number) => {
  const N = tuning.build.plotCells;
  return x >= 0 && z >= 0 && x < N && z < N;
};

/** Can this piece go here? (`ignoreId` = the piece being moved / rotated.) */
export function canPlace(pieces: readonly PlacedPiece[], c: Cand, ignoreId?: string): boolean {
  const def = pieceDef(c.type);
  if (!def) return false;
  if ((def.outdoor || def.kind === 'stairs') && c.level !== 0) return false;
  const ctx = makeCtx(ignoreId ? pieces.filter((p) => p.id !== ignoreId) : pieces);
  return canPlaceCtx(ctx, def, c);
}

export function canPlaceCtx(ctx: HouseCtx, def: PieceDef, c: Cand): boolean {
  const lv = c.level;
  switch (def.kind) {
    case 'floor':
      if (!inPlot(c.x, c.z)) return false;
      if (ctx.floors.has(`${lv}|${cellKey(c.x, c.z)}`)) return false;
      if (lv === 1 && ctx.stairVoid.has(cellKey(c.x, c.z))) return false;
      return true;
    case 'rug':
      return footprintCells(def, c.x, c.z, c.rot).every(([x, z]) => inPlot(x, z) && !ctx.rugs.has(`${lv}|${cellKey(x, z)}`));
    case 'edge': {
      const cells = edgeCells(c.x, c.z, c.rot, def.w);
      return cells.every(([x, z]) => inPlot(x, z) && !ctx.walls.has(`${lv}|${edgeKey({ x, z, rot: c.rot })}`));
    }
    case 'roof':
      return inPlot(c.x, c.z) && !ctx.roofs.has(cellKey(c.x, c.z));
    case 'furn':
      return footprintCells(def, c.x, c.z, c.rot).every(([x, z]) => {
        if (!inPlot(x, z)) return false;
        const k = `${lv}|${cellKey(x, z)}`;
        if (ctx.furn.has(k)) return false;
        const cr = ctx.creations.get(k);
        if (cr && !def.top) return false;
        if (lv === 1 && ctx.stairVoid.has(cellKey(x, z))) return false;
        return true;
      });
    case 'stairs':
      return stairsProblem(ctx, def, c) === null;
    case 'wallDeco': {
      if (!inPlot(c.x, c.z)) return false;
      const w = ctx.walls.get(`${lv}|${edgeKey(c)}`);
      if (!w || w.type !== 'wall') return false;
      return !ctx.decos.has(`${lv}|${cellKey(c.x, c.z)},${c.rot}`);
    }
    case 'creation': {
      if (!inPlot(c.x, c.z)) return false;
      const k = `${lv}|${cellKey(c.x, c.z)}`;
      if (ctx.creations.has(k)) return false;
      const f = ctx.furn.get(k);
      if (f) {
        const fd = pieceDef(f.type);
        if (!fd?.top || fd.kind === 'stairs') return false;
      }
      return true;
    }
  }
}

/**
 * Why stairs cannot go here (a short friendly sentence), or null when they can. Stairs have to lead
 * somewhere: the cell the top step opens onto needs an upstairs floor. That also keeps them inside or
 * right beside the house (an exterior stair against an outside wall is fine when it reaches a 2F cell).
 */
export function stairsProblem(ctx: HouseCtx, def: PieceDef, c: Cand): string | null {
  if (c.level !== 0) return 'Stairs start on the ground floor';
  const cells = footprintCells(def, c.x, c.z, c.rot);
  if (!cells.every(([x, z]) => inPlot(x, z))) return 'Stairs need a bit more room there';
  if (cells.some(([x, z]) => ctx.furn.has(`0|${cellKey(x, z)}`))) return 'Something is already there';
  // the opening above must be clear
  if (cells.some(([x, z]) => ctx.floors.has(`1|${cellKey(x, z)}`) || ctx.furn.has(`1|${cellKey(x, z)}`))) return 'Clear the upstairs floor above the stairs first';
  const [lx, lz] = rotOffset(0, def.d, c.rot);   // the cell beyond the top step
  if (!ctx.floors.has(`1|${cellKey(c.x + lx, c.z + lz)}`)) return 'Stairs need an upstairs floor to lead to - build a 2F floor first';
  return null;
}

// ── Pointer snapping ────────────────────────────────────────────────────────
export interface Snap { cand: Cand; inside: boolean }

const clampG = (g: number, N: number, tol: number): number => {
  if (g < 0 && g >= -tol) return 0.001;
  if (g >= N && g < N + tol) return N - 0.001;
  return g;
};

/** Nearest cell EDGE to a point (cells from the plot origin): the cell is the one under the finger. */
export function snapEdge(gx: number, gz: number): { x: number; z: number; rot: Rot; inside: boolean } {
  const N = tuning.build.plotCells;
  const tol = tuning.build.snapTolerance;
  gx = clampG(gx, N, tol);
  gz = clampG(gz, N, tol);
  const cx = Math.floor(gx), cz = Math.floor(gz);
  const lx = Math.round(gx), lz = Math.round(gz);
  const dH = Math.abs(gz - lz), dV = Math.abs(gx - lx);
  if (dH <= dV) {
    const inside = cx >= 0 && cx < N && lz >= 0 && lz <= N;
    if (lz < 0 || lz > N) return { x: cx, z: lz, rot: 0, inside: false };
    if (lz === 0) return { x: cx, z: 0, rot: 0, inside };
    if (lz === N) return { x: cx, z: N - 1, rot: 2, inside };
    return gz >= lz ? { x: cx, z: lz, rot: 0, inside } : { x: cx, z: lz - 1, rot: 2, inside };
  }
  const inside = cz >= 0 && cz < N && lx >= 0 && lx <= N;
  if (lx < 0 || lx > N) return { x: lx, z: cz, rot: 3, inside: false };
  if (lx === 0) return { x: 0, z: cz, rot: 3, inside };
  if (lx === N) return { x: N - 1, z: cz, rot: 1, inside };
  return gx >= lx ? { x: lx, z: cz, rot: 3, inside } : { x: lx - 1, z: cz, rot: 1, inside };
}

/** Anchor (not yet rounded to a cell) that puts the footprint's centre on the pointer. */
function anchorRaw(def: PieceDef, rot: number, gx: number, gz: number): [number, number] {
  const cells = localCells(def);
  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
  for (const [i, j] of cells) {
    minI = Math.min(minI, i);
    maxI = Math.max(maxI, i);
    minJ = Math.min(minJ, j);
    maxJ = Math.max(maxJ, j);
  }
  const [ox, oz] = rotOffset((minI + maxI) / 2, (minJ + maxJ) / 2, rot);
  return [gx - ox - 0.5, gz - oz - 0.5];
}

/** Anchor cell that puts the footprint's centre nearest the pointer (cells from the plot origin). */
function anchorFor(def: PieceDef, rot: number, gx: number, gz: number): [number, number] {
  const [fx, fz] = anchorRaw(def, rot, gx, gz);
  return [Math.round(fx), Math.round(fz)];
}

/** Rotation that puts a footprint's back against a wall, if there is one nearby; else `pref`. */
export function autoRotFurn(ctx: HouseCtx, def: PieceDef, level: Level, gx: number, gz: number, pref: Rot): Rot {
  const cells = localCells(def);
  const has = (i: number, j: number) => cells.some(([a, b]) => a === i && b === j);
  const backCells = cells.filter(([i, j]) => !has(i, j + 1));
  let best: Rot = pref, bestScore = 0;
  for (let k = 0; k < 4; k++) {
    const r = ((pref + k) & 3) as Rot;
    const [ax, az] = anchorFor(def, r, gx, gz);
    const [bdx, bdz] = rotOffset(0, 1, r);
    const edgeRot = edgeRotFromDir(bdx, bdz);
    let score = 0;
    for (const [i, j] of backCells) {
      const [dx, dz] = rotOffset(i, j, r);
      const w = ctx.walls.get(`${level}|${edgeKey({ x: ax + dx, z: az + dz, rot: edgeRot })}`);
      if (w && isSolidWall(w.type)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** New gable roofs join a neighbouring ridge, else run along the house's longer side. */
export function autoRotGable(pieces: readonly PlacedPiece[], ctx: HouseCtx, x: number, z: number): Rot {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = ctx.roofs.get(cellKey(x + dx, z + dz));
    if (q?.type === 'roofGable') return (q.rot % 2) as Rot;
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pieces) {
    if (p.type !== 'floor' && !isBodyWall(p.type)) continue;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  if (x0 > x1) return 0;
  return x1 - x0 >= z1 - z0 ? 0 : 1;
}

/** Slanted roofs rise toward the open side of the roof block... default: high edge on the back (north). */
export function autoRotSlant(ctx: HouseCtx, x: number, z: number, pref: Rot): Rot {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = ctx.roofs.get(cellKey(x + dx, z + dz));
    if (q?.type === 'roofSlant') return q.rot as Rot;
  }
  return pref;
}

/**
 * Windows / doors / garage doors belong to the cell that has a floor, so their
 * flower box / doorstep end up OUTSIDE the house no matter which side of the edge you dropped them on.
 */
export function faceOutward(ctx: HouseCtx, c: Cand): Cand {
  const t = c.type;
  if (t !== 'wallWindow' && t !== 'wallWindowBig' && t !== 'wallDoor' && t !== 'wallGlassDoor' && t !== 'wallGarage') return c;
  const floor = (x: number, z: number) => ctx.floors.has(`${c.level}|${cellKey(x, z)}`);
  const [dx, dz] = rotOffset(0, -1, c.rot);   // the cell across the edge
  const def = pieceDef(t)!;
  const cells = edgeCells(c.x, c.z, c.rot, def.w);
  const owner = cells.every(([x, z]) => !floor(x, z));
  const other = cells.every(([x, z]) => floor(x + dx, z + dz));
  if (owner && other) {
    // flip: the anchor moves to the far end of the span, as seen from the new side
    const [ex, ez] = cells[cells.length - 1];
    return { ...c, x: ex + dx, z: ez + dz, rot: ((c.rot + 2) & 3) as Rot };
  }
  return c;
}

/** Everything a pointer position resolves to for a piece: where it lands, and if that is inside the plot. */
export function snapPiece(def: PieceDef, gx: number, gz: number, level: Level, ctx: HouseCtx, pieces: readonly PlacedPiece[], prefRot: Rot): Snap {
  const N = tuning.build.plotCells;
  const tol = tuning.build.snapTolerance;
  const mk = (x: number, z: number, rot: Rot): Cand => ({ type: def.type, x, z, rot, level });
  switch (def.kind) {
    case 'edge': {
      const e = snapEdge(gx, gz);
      // centre a long piece (garage) on the pointer
      const shift = Math.floor((def.w - 1) / 2);
      const [sx, sz] = rotOffset(shift, 0, e.rot);
      let cand = mk(e.x - sx, e.z - sz, e.rot);
      cand = faceOutward(ctx, cand);
      const ok = e.inside && edgeCells(cand.x, cand.z, cand.rot, def.w).every(([x, z]) => inPlot(x, z));
      return { cand, inside: ok };
    }
    case 'wallDeco': {
      const e = snapEdge(gx, gz);
      return { cand: mk(e.x, e.z, e.rot), inside: e.inside };
    }
    case 'furn':
    case 'stairs':
    case 'rug': {
      const insidePlot = gx >= 0 && gx < N && gz >= 0 && gz < N;
      gx = clampG(gx, N, tol);
      gz = clampG(gz, N, tol);
      const rot = def.kind === 'rug' ? prefRot : autoRotFurn(ctx, def, level, gx, gz, prefRot);
      let [ax, az] = anchorFor(def, rot, gx, gz);
      if (insidePlot) {
        // keep big pieces inside the lot while the pointer is inside it (so every edge is reachable)
        let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
        for (const [i, j] of localCells(def)) {
          const [dx, dz] = rotOffset(i, j, rot);
          mnx = Math.min(mnx, dx);
          mxx = Math.max(mxx, dx);
          mnz = Math.min(mnz, dz);
          mxz = Math.max(mxz, dz);
        }
        ax = Math.min(Math.max(ax, -mnx), N - 1 - mxx);
        az = Math.min(Math.max(az, -mnz), N - 1 - mxz);
      }
      // a near miss still lands: a multi-cell piece that overlaps something slides to the closest free
      // spot within one cell (the ghost shows where it will go)
      if (insidePlot && def.kind !== 'rug' && localCells(def).length > 1 && !canPlaceCtx(ctx, def, mk(ax, az, rot))) {
        const [fx, fz] = anchorRaw(def, rot, gx, gz);
        let best: [number, number] | null = null, bd = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const c2 = mk(ax + dx, az + dz, rot);
            if (!canPlaceCtx(ctx, def, c2)) continue;
            const d = (c2.x - fx) * (c2.x - fx) + (c2.z - fz) * (c2.z - fz);
            if (d < bd) {
              bd = d;
              best = [c2.x, c2.z];
            }
          }
        }
        if (best) {
          ax = best[0];
          az = best[1];
        }
      }
      const cand = mk(ax, az, rot);
      return { cand, inside: footprintCells(def, ax, az, rot).every(([x, z]) => inPlot(x, z)) };
    }
    case 'roof': {
      gx = clampG(gx, N, tol);
      gz = clampG(gz, N, tol);
      const x = Math.floor(gx), z = Math.floor(gz);
      const rot = def.type === 'roofGable' ? autoRotGable(pieces, ctx, x, z) : def.type === 'roofSlant' ? autoRotSlant(ctx, x, z, prefRot) : 0;
      return { cand: mk(x, z, rot), inside: inPlot(x, z) };
    }
    default: {
      gx = clampG(gx, N, tol);
      gz = clampG(gz, N, tol);
      const x = Math.floor(gx), z = Math.floor(gz);
      return { cand: mk(x, z, 0), inside: inPlot(x, z) };
    }
  }
}

export type { PieceKind };
