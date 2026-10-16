// Finish variants (material looks) per piece family, and the colour swatches that
// make sense for each. Pure data - the look itself lives in pieces.ts / mats.ts.
import type { Hex } from '../core/model';

export interface Finish {
  id: string;
  name: string;     // one short word
  icon: string;
  colors: Hex[];    // swatches offered for this finish (first = default)
}

export type FinishSet = 'wall' | 'floor' | 'path' | 'neon' | 'led' | 'poster';

const WALL: Finish[] = [
  { id: 'paint', name: 'Paint', icon: '🎨', colors: ['#f3f2ee', '#b9b4ac', '#9fb59a', '#2c3e5c', '#c2603f', '#23222a', '#3a3a44', '#efe6d2', '#8aa1b8', '#e3c2b8', '#6b7a3c', '#7d1f3a'] },
  { id: 'brick', name: 'Brick', icon: '🧱', colors: ['#b5523b', '#9c4a3a', '#c9895f', '#d8d2c6', '#8a8a90', '#5a5a62', '#3a3a40', '#7d4f3a'] },
  { id: 'panel', name: 'Wood', icon: '🪵', colors: ['#b07a4f', '#d5a672', '#6b4a35', '#3e2c22', '#c9b79a', '#f3f2ee', '#9fb59a', '#2c3e5c'] },
  { id: 'stripe', name: 'Stripes', icon: '📏', colors: ['#f3f2ee', '#e9d8c8', '#c9d6c2', '#bcc8d8', '#d8b4b4', '#b9a6ff', '#8aa1b8', '#c2603f'] },
  { id: 'tile', name: 'Tile', icon: '🔲', colors: ['#f3f2ee', '#cfd6db', '#8aa1b8', '#9fb59a', '#2c3e5c', '#23222a', '#e3c2b8', '#c2603f'] },
];

const FLOOR: Finish[] = [
  { id: 'oak', name: 'Oak', icon: '🪵', colors: ['#cf9b62', '#e0b987', '#b07a4f', '#d9c3a0', '#a8845a', '#f0dcc0'] },
  { id: 'dark', name: 'Walnut', icon: '🟫', colors: ['#5c3f30', '#3e2c22', '#6e4a33', '#4a3a34', '#2a2420', '#7a5a45'] },
  { id: 'marble', name: 'Marble', icon: '⬜', colors: ['#f4f3f1', '#d8d6d4', '#1d1b26', '#9fb59a', '#e3c2b8', '#8aa1b8'] },
  { id: 'checker', name: 'Checker', icon: '🏁', colors: ['#ffffff', '#e3c2b8', '#9fb59a', '#8aa1b8', '#ffc93c', '#ff8a3d'] },
  { id: 'carpet', name: 'Carpet', icon: '🧶', colors: ['#9aa0aa', '#6b7a8c', '#c9b79a', '#2c3e5c', '#7d1f3a', '#2f6b4f', '#e3c2b8', '#3a3a44'] },
  { id: 'tile', name: 'Tile', icon: '🔲', colors: ['#f3f2ee', '#cfd6db', '#8aa1b8', '#2c3e5c', '#23222a', '#e3c2b8'] },
];

const PATH: Finish[] = [
  { id: 'concrete', name: 'Pavers', icon: '▫️', colors: ['#bdbab5', '#9a978f', '#d6d2c8', '#6a6862', '#cfb79a'] },
  { id: 'oak', name: 'Deck', icon: '🪵', colors: ['#b07a4f', '#cf9b62', '#6b4a35', '#8a8799'] },
  { id: 'tile', name: 'Tile', icon: '🔲', colors: ['#cfd6db', '#8aa1b8', '#f3f2ee', '#9fb59a'] },
];

const NEON_COLORS: Hex[] = ['#ff2e88', '#00d4ff', '#b6ff3b', '#ffc93c', '#7c4dff', '#ff8a3d', '#ffffff'];
const NEON: Finish[] = [
  { id: 'heart', name: 'Heart', icon: '💗', colors: NEON_COLORS },
  { id: 'bolt', name: 'Bolt', icon: '⚡', colors: NEON_COLORS },
  { id: 'star', name: 'Star', icon: '⭐', colors: NEON_COLORS },
  { id: 'moon', name: 'Moon', icon: '🌙', colors: NEON_COLORS },
];

const LED_COLORS: Hex[] = ['#ff2e88', '#00d4ff', '#7c4dff', '#b6ff3b', '#ffc93c', '#ff8a3d', '#ffffff'];
const LED: Finish[] = [
  { id: 'solid', name: 'Solid', icon: '💡', colors: LED_COLORS },
  { id: 'rainbow', name: 'RGB', icon: '🌈', colors: LED_COLORS },
];

const POSTER_COLORS: Hex[] = ['#ff8a3d', '#ff2e88', '#00d4ff', '#7c4dff', '#ffc93c', '#2f6b4f', '#f3f2ee'];
const POSTER: Finish[] = [
  { id: 'sunset', name: 'Sunset', icon: '🌅', colors: POSTER_COLORS },
  { id: 'peaks', name: 'Peaks', icon: '🏔️', colors: POSTER_COLORS },
  { id: 'shapes', name: 'Shapes', icon: '🔷', colors: POSTER_COLORS },
  { id: 'city', name: 'City', icon: '🌃', colors: POSTER_COLORS },
];

export const FINISH_SETS: Record<FinishSet, Finish[]> = { wall: WALL, floor: FLOOR, path: PATH, neon: NEON, led: LED, poster: POSTER };

export function finishesFor(set: FinishSet | undefined | null): Finish[] {
  return set ? FINISH_SETS[set] : [];
}
export function finishOf(set: FinishSet | undefined | null, id: string | undefined): Finish | undefined {
  const list = finishesFor(set);
  return list.find((f) => f.id === id) ?? list[0];
}
