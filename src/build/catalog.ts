// What the Build palette offers: every placeable piece (with footprint, kind and
// defaults) and every village decoration. Pure data (no three.js).
import type { DecoType, Hex, PieceType } from '../core/model';
import type { FinishSet } from './finishes';

export type PieceCat = 'build' | 'living' | 'bedroom' | 'kitchen' | 'bath' | 'decor' | 'outdoor';
export type PieceKind = 'floor' | 'rug' | 'edge' | 'roof' | 'furn' | 'wallDeco' | 'stairs' | 'creation';

export interface PieceDef {
  type: PieceType;
  name: string;            // one short word
  icon: string;
  cat: PieceCat | 'mine';
  kind: PieceKind;
  /** Footprint in cells, unrotated: w along x, d along z (front faces -z). For edge pieces w = span along the edge. */
  w: number;
  d: number;
  /** Non-rectangular footprint (local cells i,j). Default: the full w x d rectangle. */
  shape?: [number, number][];
  color: Hex;              // default colour
  finish?: string;         // default finish
  finishSet?: FinishSet;   // which finishes this piece can wear
  paint: boolean;          // can be dragged across many cells ("painted")
  outdoor?: boolean;       // ground level only
  top?: number;            // surface height: a workshop creation can sit on top
  reward?: string;         // unlock id (charms)
}

export const CATS: { id: PieceCat | 'mine'; name: string; icon: string }[] = [
  { id: 'build', name: 'Build', icon: '🏗️' },
  { id: 'living', name: 'Living', icon: '🛋️' },
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️' },
  { id: 'kitchen', name: 'Kitchen', icon: '🍳' },
  { id: 'bath', name: 'Bath', icon: '🛁' },
  { id: 'decor', name: 'Decor', icon: '🎮' },
  { id: 'outdoor', name: 'Outdoor', icon: '🌳' },
  { id: 'mine', name: 'Mine', icon: '⭐' },
];

const WHITE = '#f3f2ee', BLACK = '#23222a', CHAR = '#3a3a44', WOOD = '#b07a4f';

function d(
  type: PieceType, name: string, icon: string, cat: PieceCat | 'mine', kind: PieceKind, w: number, dd: number, color: Hex, extra: Partial<PieceDef> = {},
): PieceDef {
  return { type, name, icon, cat, kind, w, d: dd, color, paint: false, ...extra };
}

export const PIECE_CATALOG: PieceDef[] = [
  // ── Build ──
  d('floor', 'Floor', '🟫', 'build', 'floor', 1, 1, '#cf9b62', { finish: 'oak', finishSet: 'floor', paint: true }),
  d('wall', 'Wall', '🧱', 'build', 'edge', 1, 1, WHITE, { finish: 'paint', finishSet: 'wall', paint: true }),
  d('wallWindow', 'Window', '🪟', 'build', 'edge', 1, 1, WHITE, { finish: 'paint', finishSet: 'wall', paint: true }),
  d('wallWindowBig', 'Big window', '🔳', 'build', 'edge', 1, 1, WHITE, { finish: 'paint', finishSet: 'wall', paint: true }),
  d('wallDoor', 'Door', '🚪', 'build', 'edge', 1, 1, WHITE, { finish: 'paint', finishSet: 'wall' }),
  d('wallGlassDoor', 'Glass door', '🔲', 'build', 'edge', 1, 1, WHITE, { finish: 'paint', finishSet: 'wall' }),
  d('wallGarage', 'Garage', '🚘', 'build', 'edge', 3, 1, WHITE, { finish: 'paint', finishSet: 'wall' }),
  d('wallRail', 'Railing', '🛡️', 'build', 'edge', 1, 1, BLACK, { paint: true }),
  d('stairs', 'Stairs', '🪜', 'build', 'stairs', 1, 4, '#cf9b62', { finish: 'oak', finishSet: 'floor' }),
  d('roofGable', 'Roof', '🏠', 'build', 'roof', 1, 1, CHAR, { paint: true }),
  d('roofFlat', 'Flat roof', '⬛', 'build', 'roof', 1, 1, '#5a6070', { paint: true }),
  d('roofSlant', 'Slant roof', '📐', 'build', 'roof', 1, 1, BLACK, { paint: true }),

  // ── Living ──
  d('sofa', 'Sofa', '🛋️', 'living', 'furn', 2, 1, '#8d8b96'),
  d('sofaL', 'L-sofa', '🛋️', 'living', 'furn', 3, 2, '#3d5a80', { shape: [[0, 0], [0, 1], [1, 1], [2, 1]] }),
  d('armchair', 'Armchair', '💺', 'living', 'furn', 1, 1, '#c2603f'),
  d('coffeeTable', 'Coffee tbl', '☕', 'living', 'furn', 1, 1, WOOD, { top: 0.42 }),
  d('table', 'Side table', '🪑', 'living', 'furn', 1, 1, BLACK, { top: 0.62 }),
  d('tvStand', 'TV', '📺', 'living', 'furn', 2, 1, WOOD, { top: 0.5 }),
  d('shelf', 'Bookshelf', '📚', 'living', 'furn', 1, 1, WOOD, { top: 1.85 }),
  d('lamp', 'Floor lamp', '💡', 'living', 'furn', 1, 1, '#ffc93c'),
  d('rug', 'Round rug', '⭕', 'living', 'rug', 2, 2, '#9fb59a'),
  d('rugRect', 'Rug', '🟦', 'living', 'rug', 3, 2, '#8d8b96'),
  d('plant', 'Plant', '🪴', 'living', 'furn', 1, 1, '#2f7a45'),

  // ── Bedroom ──
  d('bed', 'Bed', '🛏️', 'bedroom', 'furn', 2, 2, '#2c3e5c'),
  d('bunkBed', 'Bunk bed', '🛌', 'bedroom', 'furn', 1, 2, '#9fb59a'),
  d('desk', 'Desk', '🖥️', 'bedroom', 'furn', 2, 1, WHITE, { top: 0.75 }),
  d('gamingChair', 'Gaming chair', '🪑', 'bedroom', 'furn', 1, 1, '#ff2e88'),
  d('vanity', 'Vanity', '🪞', 'bedroom', 'furn', 1, 1, WHITE, { top: 0.78 }),
  d('wardrobe', 'Wardrobe', '🚪', 'bedroom', 'furn', 2, 1, '#b9b4ac', { top: 2.1 }),
  d('beanBag', 'Bean bag', '🫘', 'bedroom', 'furn', 1, 1, '#7c4dff'),
  d('nightstand', 'Nightstand', '🕯️', 'bedroom', 'furn', 1, 1, WOOD, { top: 0.52 }),

  // ── Kitchen ──
  d('counter', 'Counter', '🗄️', 'kitchen', 'furn', 1, 1, WHITE, { top: 0.92, paint: true }),
  d('kitchenSink', 'Sink', '🚰', 'kitchen', 'furn', 1, 1, WHITE, { top: 0.92 }),
  d('fridge', 'Fridge', '🧊', 'kitchen', 'furn', 1, 1, '#c8c9cf', { top: 1.85 }),
  d('stove', 'Stove', '🍳', 'kitchen', 'furn', 1, 1, BLACK),
  d('island', 'Island', '🍽️', 'kitchen', 'furn', 2, 1, '#2c3e5c', { top: 0.92 }),
  d('stool', 'Stool', '🪑', 'kitchen', 'furn', 1, 1, BLACK, { paint: true }),
  d('diningTable', 'Dining table', '🍴', 'kitchen', 'furn', 2, 1, WOOD, { top: 0.76 }),
  d('chair', 'Chair', '🪑', 'kitchen', 'furn', 1, 1, '#b9b4ac', { paint: true }),

  // ── Bath ──
  d('tub', 'Bathtub', '🛁', 'bath', 'furn', 2, 1, WHITE),
  d('toilet', 'Toilet', '🚽', 'bath', 'furn', 1, 1, WHITE),
  d('sink', 'Vanity sink', '🚿', 'bath', 'furn', 1, 1, WHITE, { top: 0.86 }),
  d('shower', 'Shower', '🚿', 'bath', 'furn', 1, 1, '#c8c9cf'),

  // ── Decor (teen) ──
  d('gamingSetup', 'Gaming rig', '🎮', 'decor', 'furn', 2, 1, BLACK),
  d('ledStrip', 'LED strip', '🌈', 'decor', 'wallDeco', 1, 1, '#ff2e88', { finish: 'solid', finishSet: 'led', paint: true }),
  d('poster', 'Poster', '🖼️', 'decor', 'wallDeco', 1, 1, '#ff8a3d', { finish: 'sunset', finishSet: 'poster' }),
  d('wallShelf', 'Wall shelf', '🧸', 'decor', 'wallDeco', 1, 1, WOOD),
  d('mirror', 'Mirror', '🪞', 'decor', 'wallDeco', 1, 1, BLACK),
  d('stringLights', 'Fairy lights', '✨', 'decor', 'wallDeco', 1, 1, '#ffc93c', { paint: true }),
  d('neonSign', 'Neon sign', '💗', 'decor', 'wallDeco', 1, 1, '#ff2e88', { finish: 'heart', finishSet: 'neon', reward: 'build.neonsign' }),
  d('monstera', 'Monstera', '🌿', 'decor', 'furn', 1, 1, '#2f7a45'),

  // ── Outdoor (ground level) ──
  d('fenceSlat', 'Slat fence', '🚧', 'outdoor', 'edge', 1, 1, WOOD, { outdoor: true, paint: true }),
  d('fencePicket', 'Picket fence', '🏡', 'outdoor', 'edge', 1, 1, WHITE, { outdoor: true, paint: true }),
  d('hedge', 'Hedge', '🌳', 'outdoor', 'furn', 1, 1, '#2f7a45', { outdoor: true, paint: true }),
  d('path', 'Path', '▫️', 'outdoor', 'floor', 1, 1, '#bdbab5', { outdoor: true, paint: true, finish: 'concrete', finishSet: 'path' }),
  d('gardenBed', 'Garden bed', '🌷', 'outdoor', 'furn', 2, 1, WOOD, { outdoor: true }),
  d('yardTree', 'Tree', '🌲', 'outdoor', 'furn', 1, 1, '#3f8f4a', { outdoor: true }),
  d('trampoline', 'Trampoline', '🤸', 'outdoor', 'furn', 2, 2, '#00d4ff', { outdoor: true }),
  d('bbq', 'BBQ', '🍖', 'outdoor', 'furn', 1, 1, BLACK, { outdoor: true, top: 0.95 }),
  d('patioSet', 'Patio set', '⛱️', 'outdoor', 'furn', 2, 2, '#ff8a3d', { outdoor: true }),
  d('swing', 'Swing set', '🎠', 'outdoor', 'furn', 3, 2, '#c2603f', { outdoor: true }),
  d('mailbox', 'Mailbox', '📮', 'outdoor', 'furn', 1, 1, BLACK, { outdoor: true }),
  d('carport', 'Carport', '🚗', 'outdoor', 'furn', 3, 3, CHAR, { outdoor: true }),
  d('pool', 'Pool', '🏊', 'outdoor', 'furn', 4, 3, '#00b3e6', { outdoor: true, reward: 'build.pool' }),
  d('hotTub', 'Hot tub', '♨️', 'outdoor', 'furn', 2, 2, '#b07a4f', { outdoor: true, reward: 'build.pool' }),
];

/** The workshop-creation piece isn't in the palette (the Mine tab offers the owner's creations). */
const CREATION_DEF: PieceDef = d('creation', 'Creation', '⭐', 'mine', 'creation', 1, 1, '#ffffff');

const BY_TYPE = new Map<PieceType, PieceDef>();
for (const p of PIECE_CATALOG) BY_TYPE.set(p.type, p);
BY_TYPE.set('creation', CREATION_DEF);

export function pieceDef(type: PieceType): PieceDef | undefined {
  return BY_TYPE.get(type);
}

/** The footprint cells (local i,j) of a piece type. */
export function localCells(def: PieceDef): [number, number][] {
  if (def.shape) return def.shape;
  const out: [number, number][] = [];
  for (let j = 0; j < def.d; j++) for (let i = 0; i < def.w; i++) out.push([i, j]);
  return out;
}

// ── Village decorations ─────────────────────────────────────────────────────
export interface DecoDef {
  type: DecoType;
  name: string;
  icon: string;
  color: Hex;
  paint: boolean;
  height: number;    // for tap targets
}
export const DECO_CATALOG: DecoDef[] = [
  { type: 'tree', name: 'Oak', icon: '🌳', color: '#3f8f4a', paint: false, height: 5 },
  { type: 'birch', name: 'Birch', icon: '🌿', color: '#8fbf4a', paint: false, height: 5 },
  { type: 'pine', name: 'Pine', icon: '🌲', color: '#2f7a45', paint: false, height: 5.5 },
  { type: 'palm', name: 'Palm', icon: '🌴', color: '#3f8f4a', paint: false, height: 5.5 },
  { type: 'bush', name: 'Bush', icon: '🌱', color: '#2f7a45', paint: false, height: 1.1 },
  { type: 'hedge', name: 'Hedge', icon: '🟩', color: '#2f7a45', paint: true, height: 1.3 },
  { type: 'planter', name: 'Planter', icon: '🪴', color: '#3a3a44', paint: false, height: 1.2 },
  { type: 'flowers', name: 'Flowers', icon: '🌸', color: '#ff2e88', paint: true, height: 0.7 },
  { type: 'fence', name: 'Fence', icon: '🚧', color: '#b07a4f', paint: true, height: 1.3 },
  { type: 'streetLamp', name: 'Lamp', icon: '🏮', color: '#23222a', paint: false, height: 4.2 },
  { type: 'bench', name: 'Bench', icon: '🪑', color: '#b07a4f', paint: false, height: 1 },
];
export function decoDef(type: DecoType): DecoDef | undefined {
  return DECO_CATALOG.find((x) => x.type === type);
}
