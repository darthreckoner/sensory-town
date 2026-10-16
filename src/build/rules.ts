// Placement rules + pointer snapping for house building (pure logic, no three.js).
import type { PieceType, PlacedPiece } from '../core/model';
import { tuning } from '../tuning';
import { cellKey, edgeKey, isFurnType, isRoofType, isWallType, type HouseCtx } from './pieces';

export type Rot = 0 | 1 | 2 | 3;
export type PieceKind = 'floor' | 'rug' | 'edge' | 'roof' | 'furn' | 'creation';

export function kindOf(t: PieceType): PieceKind {
  if (t === 'floor') return 'floor';
  if (t === 'rug') return 'rug';
  if (t === 'creation') return 'creation';
  if (isWallType(t)) return 'edge';
  if (isRoofType(t)) return 'roof';
  return 'furn';
}

export interface Cand { type: PieceType; x: number; z: number; rot: Rot }
export interface Snap { x: number; z: number; rot: Rot; inside: boolean }

const clampCell = (g: number, N: number, tol: number): number => {
  if (g < 0 && g >= -tol) return 0;
  if (g >= N && g < N + tol) return N - 1;
  return Math.floor(g);
};

/**
 * Snap a point (in cells, measured from the plot's origin corner) to a placement.
 * Walls snap to the nearest cell EDGE (and orient themselves); everything else to the cell.
 */
export function snapCell(kind: PieceKind, gx: number, gz: number): Snap {
  const N = tuning.build.plotCells;
  const tol = tuning.build.snapTolerance;
  const cx = clampCell(gx, N, tol), cz = clampCell(gz, N, tol);
  const inCell = cx >= 0 && cx < N && cz >= 0 && cz < N;
  if (kind !== 'edge') return { x: cx, z: cz, rot: 0, inside: inCell };

  const lx = Math.round(gx), lz = Math.round(gz);
  const dH = Math.abs(gz - lz), dV = Math.abs(gx - lx);
  if (dH <= dV) {
    // a horizontal edge (runs along x) on grid line lz
    const inside = cx >= 0 && cx < N && lz >= 0 && lz <= N;
    if (lz < 0 || lz > N) return { x: cx, z: lz, rot: 0, inside: false };
    if (lz === 0) return { x: cx, z: 0, rot: 0, inside };
    if (lz === N) return { x: cx, z: N - 1, rot: 2, inside };
    return gz >= lz ? { x: cx, z: lz, rot: 0, inside } : { x: cx, z: lz - 1, rot: 2, inside };
  }
  // a vertical edge (runs along z) on grid line lx
  const inside = cz >= 0 && cz < N && lx >= 0 && lx <= N;
  if (lx < 0 || lx > N) return { x: lx, z: cz, rot: 3, inside: false };
  if (lx === 0) return { x: 0, z: cz, rot: 3, inside };
  if (lx === N) return { x: N - 1, z: cz, rot: 1, inside };
  return gx >= lx ? { x: lx, z: cz, rot: 3, inside } : { x: lx - 1, z: cz, rot: 1, inside };
}

/** Can this piece go here? (`ignoreId` = the piece being moved/rotated.) */
export function canPlace(pieces: readonly PlacedPiece[], c: Cand, ignoreId?: string): boolean {
  const N = tuning.build.plotCells;
  if (c.x < 0 || c.z < 0 || c.x >= N || c.z >= N) return false;
  const kind = kindOf(c.type);
  const ek = kind === 'edge' ? edgeKey(c) : '';
  for (const q of pieces) {
    if (q.id === ignoreId) continue;
    const same = q.x === c.x && q.z === c.z;
    switch (kind) {
      case 'floor':
        if (same && q.type === 'floor') return false;
        break;
      case 'rug':
        if (same && q.type === 'rug') return false;
        break;
      case 'edge':
        if (isWallType(q.type) && edgeKey(q) === ek) return false;
        break;
      case 'roof':
        if (same && isRoofType(q.type)) return false;
        break;
      case 'furn':
        if (same && isFurnType(q.type)) return false;
        if (same && q.type === 'creation' && c.type !== 'table' && c.type !== 'shelf') return false;
        break;
      case 'creation':
        if (same && q.type === 'creation') return false;
        if (same && isFurnType(q.type) && q.type !== 'table' && q.type !== 'shelf') return false;
        break;
    }
  }
  return true;
}

/** Furniture backs onto a wall on one of its cell edges when there is one. */
export function autoRotFurn(ctx: HouseCtx, x: number, z: number, fallback: Rot): Rot {
  const has = (rot: Rot) => ctx.walls.has(edgeKey({ x, z, rot }));
  if (has(2)) return 0;   // wall on the south edge → back to the south
  if (has(3)) return 1;
  if (has(0)) return 2;
  if (has(1)) return 3;
  return fallback;
}

/** New gable roofs join a neighbouring ridge, else run along the house's longer side. */
export function autoRotGable(pieces: readonly PlacedPiece[], ctx: HouseCtx, x: number, z: number): Rot {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = ctx.roofs.get(cellKey(x + dx, z + dz));
    if (q?.type === 'roofGable') return (q.rot % 2) as Rot;
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pieces) {
    if (p.type !== 'floor' && !isWallType(p.type)) continue;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  if (x0 > x1) return 0;
  return x1 - x0 >= z1 - z0 ? 0 : 1;
}

/** The wall piece occupying this candidate's edge (if any). */
export function wallAt(pieces: readonly PlacedPiece[], c: Cand): PlacedPiece | undefined {
  const ek = edgeKey(c);
  return pieces.find((q) => isWallType(q.type) && edgeKey(q) === ek);
}

/**
 * Windows and doors belong to the cell that has a floor, so their flower box /
 * doorstep end up OUTSIDE the house no matter which side of the edge you dropped them on.
 */
export function faceOutward(pieces: readonly PlacedPiece[], c: Cand): Cand {
  if (c.type !== 'wallWindow' && c.type !== 'wallDoor') return c;
  const floor = (x: number, z: number) => pieces.some((p) => p.type === 'floor' && p.x === x && p.z === z);
  const [dx, dz] = c.rot === 0 ? [0, -1] : c.rot === 2 ? [0, 1] : c.rot === 3 ? [-1, 0] : [1, 0];
  if (!floor(c.x, c.z) && floor(c.x + dx, c.z + dz)) return { ...c, x: c.x + dx, z: c.z + dz, rot: ((c.rot + 2) % 4) as Rot };
  return c;
}
