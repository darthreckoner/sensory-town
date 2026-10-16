// Starter home templates: a modern house in one tap. Each template returns a
// list of pieces (in build order: floors, walls, roofs, furniture, yard) for a
// plotCells x plotCells lot. Pure data, no three.js.
import type { Hex, PieceType, PlacedPiece } from '../core/model';
import { uid } from '../core/model';
import { pieceDef } from './catalog';
import { anchorForMin, rotOffset, type Rot } from './rules';

export interface Template {
  id: string;
  name: string;
  icon: string;
  blurb: string;       // a few words
  colors: [Hex, Hex];  // card accent gradient
  build(): PlacedPiece[];
}

interface Opts { color?: Hex; finish?: string; level?: 0 | 1 }

class TB {
  pieces: PlacedPiece[] = [];

  add(type: PieceType, x: number, z: number, rot: Rot, o: Opts = {}): void {
    const def = pieceDef(type)!;
    const p: PlacedPiece = { id: uid('pc_'), type, x, z, rot, color: o.color ?? def.color };
    const fin = o.finish ?? def.finish;
    if (fin) p.finish = fin;
    if (o.level) p.level = o.level;
    this.pieces.push(p);
  }

  /** Place by the rotated footprint's min corner (so templates can think in rectangles). */
  at(type: PieceType, minX: number, minZ: number, rot: Rot, o: Opts = {}): void {
    const def = pieceDef(type)!;
    const [x, z] = anchorForMin(def, rot, minX, minZ);
    this.add(type, x, z, rot, o);
  }

  floors(x0: number, z0: number, w: number, d: number, finish: string, color: Hex, level: 0 | 1 = 0, type: PieceType = 'floor'): void {
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) this.add(type, x, z, 0, { finish, color, level });
  }

  /**
   * Walls around a rectangle. `over(side, i)` can swap a segment for another edge
   * piece (window, door...); return undefined for a plain wall, null to leave it open.
   */
  perimeter(x0: number, z0: number, w: number, d: number, color: Hex, finish: string, level: 0 | 1, over: (side: 'N' | 'S' | 'W' | 'E', i: number) => PieceType | null | undefined = () => undefined): void {
    const seg = (side: 'N' | 'S' | 'W' | 'E', i: number, x: number, z: number, rot: Rot) => {
      const t = over(side, i);
      if (t === null) return;
      this.add(t ?? 'wall', x, z, rot, { color, finish, level });
    };
    for (let i = 0; i < w; i++) seg('N', i, x0 + i, z0, 0);
    for (let i = 0; i < w; i++) seg('S', i, x0 + i, z0 + d - 1, 2);
    for (let j = 0; j < d; j++) seg('W', j, x0, z0 + j, 3);
    for (let j = 0; j < d; j++) seg('E', j, x0 + w - 1, z0 + j, 1);
  }

  roofs(x0: number, z0: number, w: number, d: number, type: PieceType, color: Hex, rot: Rot = 0): void {
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) this.add(type, x, z, rot, { color });
  }
}

// ── 1. Modern box ───────────────────────────────────────────────────────────
// White box with big windows, flat roof, open-plan living + kitchen, a bedroom
// with a gaming corner and a bathroom. Yard with a patio and a path.
function modernBox(): PlacedPiece[] {
  const b = new TB();
  const X0 = 2, Z0 = 1, W = 8, D = 7;
  b.floors(X0, Z0, 4, 7, 'oak', '#cf9b62');                 // living + kitchen
  b.floors(6, 1, 4, 4, 'dark', '#5c3f30');                 // bedroom
  b.floors(6, 5, 4, 3, 'marble', '#f4f3f1');               // bath
  b.perimeter(X0, Z0, W, D, '#f3f2ee', 'paint', 0, (side, i) => {
    if (side === 'S') return ['wall', 'wallWindowBig', 'wallWindowBig', 'wallDoor', 'wall', 'wall', 'wallWindow', 'wall'][i] as PieceType;
    if (side === 'N') return [undefined, 'wallWindow', undefined, 'wallWindow', undefined, undefined, 'wallWindowBig', undefined][i] as PieceType | undefined;
    if (side === 'W') return [undefined, 'wallWindow', undefined, 'wallWindow', undefined, undefined, undefined][i] as PieceType | undefined;
    return [undefined, 'wallWindow', undefined, undefined, undefined, 'wallWindow', undefined][i] as PieceType | undefined;
  });
  // partitions: living | bedroom + bath
  for (let z = 1; z <= 7; z++) b.add(z === 3 || z === 6 ? 'wallDoor' : 'wall', 6, z, 3, { color: '#f3f2ee', finish: 'paint' });
  for (let x = 6; x <= 9; x++) b.add('wall', x, 5, 0, { color: '#f3f2ee', finish: 'paint' });
  b.roofs(X0, Z0, W, D, 'roofFlat', '#3a3a44');

  // Furniture is kept sparse on purpose: every room has clear floor so a first drag always lands.
  // kitchen along the north wall
  b.at('fridge', 2, 1, 2, { color: '#c8c9cf' });
  b.at('counter', 3, 1, 2);
  b.at('stove', 4, 1, 2);
  b.at('kitchenSink', 5, 1, 2);
  // living: a sofa + TV, and a big open middle (x 3-5, z 2-4)
  b.at('sofaL', 2, 5, 1, { color: '#3d5a80' });
  b.at('tvStand', 5, 5, 3);
  b.at('rug', 3, 5, 0, { color: '#8d8b96' });
  // bedroom: bed + wardrobe + gaming desk, and an empty corner (x 8-9, z 3-4)
  b.at('bed', 7, 1, 2, { color: '#2c3e5c' });
  b.at('nightstand', 6, 1, 2);
  b.at('wardrobe', 9, 1, 3, { color: '#b9b4ac' });
  b.at('gamingSetup', 6, 4, 0);
  b.at('gamingChair', 7, 3, 2, { color: '#ff2e88' });
  // bath
  b.at('toilet', 6, 7, 0);
  b.at('sink', 7, 7, 0);
  b.at('tub', 8, 7, 0);
  b.at('shower', 9, 6, 3);
  // wall decor
  b.add('ledStrip', 7, 1, 0, { color: '#ff2e88' });
  b.add('poster', 2, 6, 3, { finish: 'sunset', color: '#ff8a3d' });
  b.add('mirror', 7, 7, 2);
  // yard
  for (let z = 8; z <= 11; z++) b.add('path', 5, z, 0, { finish: 'concrete', color: '#bdbab5' });
  b.at('patioSet', 8, 9, 0, { color: '#ff8a3d' });
  b.at('hedge', 3, 8, 0);
  b.at('yardTree', 1, 9, 0);
  b.at('mailbox', 10, 8, 0);
  return b.pieces;
}

// ── 2. Cozy cottage ─────────────────────────────────────────────────────────
function cottage(): PlacedPiece[] {
  const b = new TB();
  const X0 = 3, Z0 = 2, W = 6, D = 5;
  b.floors(X0, Z0, 6, 5, 'oak', '#e0b987');
  b.perimeter(X0, Z0, W, D, '#b5523b', 'brick', 0, (side, i) => {
    if (side === 'S') return ['wall', 'wall', 'wallDoor', 'wallWindow', 'wall', 'wallWindow'][i] as PieceType | undefined;
    if (side === 'N') return ['wall', 'wallWindow', 'wall', 'wall', 'wallWindow', 'wall'][i] as PieceType | undefined;
    if (side === 'W') return ['wall', 'wallWindow', 'wall', 'wall', 'wall'][i] as PieceType | undefined;
    return ['wall', 'wall', 'wallWindow', 'wall', 'wall'][i] as PieceType | undefined;
  });
  for (let z = 2; z <= 3; z++) b.add('wall', 6, z, 3, { color: '#f3f2ee', finish: 'paint' });                     // bedroom nook wall
  b.add('wallDoor', 6, 4, 3, { color: '#f3f2ee', finish: 'paint' });
  b.roofs(X0, Z0, W, D, 'roofGable', '#3a3a44', 0);

  // Sparse on purpose: open floor in the living room and in the bedroom's corner for a first drag.
  // kitchen along the north wall + living (left 3 wide)
  b.at('fridge', 3, 2, 2, { color: '#c8c9cf' });
  b.at('kitchenSink', 4, 2, 2);
  b.at('stove', 5, 2, 2);
  b.at('tvStand', 5, 5, 3);
  b.at('rug', 3, 4, 0, { color: '#8d8b96' });
  b.at('sofa', 3, 6, 0, { color: '#9fb59a' });
  // bedroom (right): the lower-left corner is free
  b.at('bed', 7, 2, 2, { color: '#9fb59a' });
  b.at('nightstand', 6, 2, 2);
  b.at('wardrobe', 8, 4, 3, { color: '#b07a4f' });
  b.add('poster', 3, 5, 3, { finish: 'peaks', color: '#00d4ff' });
  b.add('stringLights', 7, 6, 2, { color: '#ffc93c' });
  // yard
  for (let z = 7; z <= 11; z++) b.add('path', 5, z, 0, { finish: 'concrete', color: '#cfb79a' });
  for (let x = 2; x <= 9; x++) if (x !== 5) b.add('fencePicket', x, 11, 2, { color: '#f3f2ee' });
  b.add('fencePicket', 5, 11, 2, { color: '#f3f2ee' });
  b.at('gardenBed', 6, 8, 0);
  b.at('yardTree', 9, 9, 0);
  b.at('mailbox', 2, 11, 0);
  return b.pieces;
}

// ── 3. Two-story ────────────────────────────────────────────────────────────
function twoStory(): PlacedPiece[] {
  const b = new TB();
  const X0 = 3, Z0 = 2, W = 6, D = 6;
  b.floors(X0, Z0, W, D, 'oak', '#cf9b62');
  // upstairs floor with the stair opening kept clear
  for (let z = Z0; z < Z0 + D; z++) for (let x = X0; x < X0 + W; x++) {
    if (x === 7 && z >= 3 && z <= 6) continue;
    b.add('floor', x, z, 0, { finish: 'dark', color: '#6e4a33', level: 1 });
  }
  b.perimeter(X0, Z0, W, D, '#f3f2ee', 'paint', 0, (side, i) => {
    if (side === 'S') return ['wall', 'wallWindowBig', 'wallDoor', 'wallWindowBig', 'wallGlassDoor', 'wall'][i] as PieceType | undefined;
    if (side === 'N') return ['wall', 'wallWindow', 'wall', 'wallWindow', 'wall', 'wall'][i] as PieceType | undefined;
    if (side === 'W') return ['wall', 'wallWindow', 'wall', 'wallWindow', 'wall', 'wall'][i] as PieceType | undefined;
    return ['wall', 'wallWindow', 'wall', 'wall', 'wallWindow', 'wall'][i] as PieceType | undefined;
  });
  // upper storey: navy facade, balcony railing across the front
  b.perimeter(X0, Z0, W, D, '#2c3e5c', 'paint', 1, (side, i) => {
    if (side === 'S') return [null, null, null, null, null, null][i];
    if (side === 'N') return ['wall', 'wallWindowBig', 'wall', 'wallWindowBig', 'wall', 'wall'][i] as PieceType | undefined;
    if (side === 'W') return ['wall', 'wallWindow', 'wall', 'wall', 'wallWindow', 'wall'][i] as PieceType | undefined;
    return ['wall', 'wallWindow', 'wall', 'wall', 'wallWindow', 'wall'][i] as PieceType | undefined;
  });
  for (let x = X0; x < X0 + W; x++) b.add('wallRail', x, Z0 + D - 1, 2, { color: '#23222a', level: 1 });
  // an inner wall upstairs separating the two bedrooms
  for (let x = X0 + 1; x <= X0 + 5; x++) if (x !== 7) b.add(x === 4 ? 'wallDoor' : 'wall', x, 5, 0, { color: '#f3f2ee', finish: 'paint', level: 1 });
  b.roofs(X0, Z0, W, D, 'roofSlant', '#23222a', 0);
  // stairs: climb north along x = 7 from z = 6 up to z = 3 ... they climb toward local +z, so rotate 2 to climb north
  b.at('stairs', 7, 3, 2, { finish: 'oak', color: '#cf9b62' });

  // Sparse on purpose: a clear living area (x 5-6, z 2-7) and a free corner on each floor.
  // ground floor: TV + sofa on the left, kitchen strip right of the stairs
  b.at('tvStand', 3, 2, 2);
  b.at('rug', 3, 3, 0, { color: '#2c3e5c' });
  b.at('sofa', 3, 5, 0, { color: '#8d8b96' });
  b.at('counter', 8, 2, 2);
  b.at('fridge', 8, 3, 3, { color: '#c8c9cf' });
  // upstairs: bedroom (north) + gaming nook (south west)
  b.at('bed', 5, 2, 2, { color: '#2c3e5c', level: 1 });
  b.at('nightstand', 4, 2, 2, { level: 1 });
  b.at('wardrobe', 7, 2, 2, { level: 1, color: '#b9b4ac' });
  b.at('gamingSetup', 3, 6, 1, { level: 1 });
  b.at('gamingChair', 4, 6, 3, { level: 1, color: '#7c4dff' });
  b.add('ledStrip', 5, 2, 0, { color: '#00d4ff', finish: 'rainbow', level: 1 });
  // yard
  for (let z = 8; z <= 11; z++) b.add('path', 4, z, 0, { finish: 'concrete', color: '#bdbab5' });
  b.at('carport', 8, 8, 0, { color: '#3a3a44' });
  b.at('hedge', 3, 8, 0);
  b.at('yardTree', 1, 6, 0);
  b.at('mailbox', 1, 10, 0);
  return b.pieces;
}

/**
 * Turn a whole layout by `k` quarter turns about the lot's centre (so its front door
 * can face the street). Positions and piece rotations follow the same convention
 * the pieces use: local (i,j) -> rotOffset.
 */
export function orientLayout(pieces: PlacedPiece[], k: number, cells: number): PlacedPiece[] {
  k = ((k % 4) + 4) % 4;
  if (k === 0) return pieces;
  const C = cells / 2;
  return pieces.map((p) => {
    const [dx, dz] = rotOffset(p.x + 0.5 - C, p.z + 0.5 - C, k);
    return { ...p, x: Math.floor(C + dx), z: Math.floor(C + dz), rot: ((p.rot + k) & 3) as Rot };
  });
}

/** The quarter turns that carry "front faces south" onto a front vector (nx, nz). */
export function turnsForFront(nx: number, nz: number): number {
  if (nz > 0) return 0;
  if (nx < 0) return 1;
  if (nz < 0) return 2;
  return 3;
}

export const TEMPLATES: Template[] = [
  { id: 'modern', name: 'Modern box', icon: '🏢', blurb: 'Glass, marble, gaming room', colors: ['#00d4ff', '#7c4dff'], build: modernBox },
  { id: 'cottage', name: 'Cozy cottage', icon: '🏡', blurb: 'Brick, wood floors, garden', colors: ['#ff8a3d', '#ff2e88'], build: cottage },
  { id: 'twostory', name: 'Two-story', icon: '🏠', blurb: 'Stairs, balcony, carport', colors: ['#b6ff3b', '#00b3a4'], build: twoStory },
];
