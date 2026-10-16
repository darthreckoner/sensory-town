// ── v3 build (W5): starter builds, stamped in front of the player ──────────────
// A few ready-made little houses in the world's own pieces (4.8 m tiles), so the first minute
// is "raise a house", then make it yours with Edit, Decor and more pieces. Layouts are written
// facing south (door on the +z side) and turned so the door faces the player.
import type { BuildKind, BuildMat } from '../../core/model';

export interface StarterPiece { kind: BuildKind; mat: BuildMat; dx: number; dz: number; iy: number; dir: 0 | 1 | 2 | 3; edit?: number }
export interface Starter { id: string; name: string; icon: string; blurb: string; pieces: StarterPiece[] }

const WINDOW = 1 << 4;
const DOOR = (1 << 4) | (1 << 7);

class L {
  p: StarterPiece[] = [];
  add(kind: BuildKind, mat: BuildMat, dx: number, dz: number, iy: number, dir: 0 | 1 | 2 | 3 = 0, edit?: number): this {
    this.p.push({ kind, mat, dx, dz, iy, dir, ...(edit ? { edit } : {}) });
    return this;
  }
}

/** Walls round a w x d block of cells. over(side, i) can cut something into a wall (window, door); null leaves it out. */
function ring(l: L, mat: BuildMat, w: number, d: number, iy: number, over: (side: 'N' | 'S' | 'W' | 'E', i: number) => number | null | undefined = () => undefined): void {
  for (let i = 0; i < w; i++) {
    const n = over('N', i), s = over('S', i);
    if (n !== null) l.add('wall', mat, i, 0, iy, 0, n);
    if (s !== null) l.add('wall', mat, i, d - 1, iy, 2, s);
  }
  for (let j = 0; j < d; j++) {
    const we = over('W', j), e = over('E', j);
    if (we !== null) l.add('wall', mat, 0, j, iy, 3, we);
    if (e !== null) l.add('wall', mat, w - 1, j, iy, 1, e);
  }
}

function cabin(): StarterPiece[] {
  const l = new L();
  const W = 3, D = 2;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) l.add('floor', 'wood', x, z, 0);
  ring(l, 'wood', W, D, 0, (side, i) => (side === 'S' ? (i === 1 ? DOOR : i === 0 ? WINDOW : undefined) : side === 'N' ? (i === 1 ? WINDOW : undefined) : WINDOW));
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) l.add('roof', 'wood', x, z, 1);
  return l.p;
}

function townhouse(): StarterPiece[] {
  const l = new L();
  const N = 3;
  // ground floor (brick): everything but the back-left cell, which is a ramp climbing south to the landing above the front-left cell
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) if (!(x === 0 && z === 1)) l.add('floor', 'brick', x, z, 0);
  l.add('ramp', 'wood', 0, 1, 0, 2);
  ring(l, 'brick', N, N, 0, (side, i) => (side === 'S' ? (i === 1 ? DOOR : WINDOW) : side === 'N' ? (i === 1 ? WINDOW : undefined) : i === 1 ? WINDOW : undefined));
  // upstairs (metal): a floor over everything but the ramp well, windows round the outside, a railing along the well
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) if (!(x === 0 && z < 2)) l.add('floor', 'metal', x, z, 1);
  ring(l, 'metal', N, N, 1, (side, i) => (side === 'S' ? (i === 1 ? WINDOW : undefined) : side === 'N' ? (i === 1 ? WINDOW : undefined) : i === 1 ? WINDOW : undefined));
  l.add('wall', 'metal', 1, 0, 1, 3).add('wall', 'metal', 1, 1, 1, 3);
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) l.add('roof', 'metal', x, z, 2);
  return l.p;
}

function skatePark(): StarterPiece[] {
  const l = new L();
  // a little wood skate bowl: a platform with ramps on three sides
  l.add('floor', 'wood', 1, 1, 1).add('floor', 'wood', 1, 0, 1).add('floor', 'wood', 0, 1, 1).add('floor', 'wood', 0, 0, 1);
  l.add('ramp', 'wood', 0, 2, 0, 0).add('ramp', 'wood', 1, 2, 0, 0);
  l.add('ramp', 'wood', 2, 0, 0, 3).add('ramp', 'wood', 2, 1, 0, 3);
  l.add('wall', 'metal', 0, 0, 1, 0).add('wall', 'metal', 1, 0, 1, 0).add('wall', 'metal', 0, 0, 1, 3).add('wall', 'metal', 0, 1, 1, 3);
  return l.p;
}

export const STARTERS: Starter[] = [
  { id: 'cabin', name: 'Cozy cabin', icon: '🛖', blurb: 'Wood, door, windows, roof', pieces: cabin() },
  { id: 'townhouse', name: 'Townhouse', icon: '🏠', blurb: 'Brick + metal, two floors, a ramp up', pieces: townhouse() },
  { id: 'skate', name: 'Ramp park', icon: '🛹', blurb: 'A platform with ramps to roll up', pieces: skatePark() },
];

/** Turn a layout by k quarter turns clockwise (seen from above, +x east, +z south) about the middle of cell (0, 0). */
export function turnLayout(pieces: readonly StarterPiece[], k: number): StarterPiece[] {
  k = ((k % 4) + 4) % 4;
  return pieces.map((p) => {
    let dx = p.dx, dz = p.dz;
    for (let i = 0; i < k; i++) [dx, dz] = [-dz, dx];
    return { ...p, dx, dz, dir: p.kind === 'floor' || p.kind === 'roof' ? p.dir : (((p.dir + k) & 3) as 0 | 1 | 2 | 3) };
  });
}

/** Bounding box (cell offsets) of a layout. */
export function layoutBox(pieces: readonly StarterPiece[]): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pieces) {
    x0 = Math.min(x0, p.dx);
    z0 = Math.min(z0, p.dz);
    x1 = Math.max(x1, p.dx);
    z1 = Math.max(z1, p.dz);
  }
  return { x0, z0, x1, z1 };
}
