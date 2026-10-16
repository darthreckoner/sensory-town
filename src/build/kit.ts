// Shared dimensions + palette for the piece generators.
import { tuning } from '../tuning';

/** Level-local metres. Cell = gridSize (1). Floor top sits at FL; walls run 0..H. */
export function dims() {
  const b = tuning.build;
  return { S: b.gridSize, H: b.wallHeight, T: b.wallThickness, FL: b.floorHeight };
}

/** Architecture + furniture neutrals (docs/ART_DIRECTION.md). */
export const K = {
  white: '#f3f2ee',
  cream: '#efe6d2',
  warmGrey: '#b9b4ac',
  grey: '#8d8b96',
  slate: '#5a6070',
  charcoal: '#3a3a44',
  black: '#23222a',
  wood: '#b07a4f',
  woodLight: '#d5a672',
  woodDark: '#6b4a35',
  sage: '#9fb59a',
  navy: '#2c3e5c',
  terracotta: '#c2603f',
  glass: '#a9dcff',
  steel: '#c8c9cf',
  chrome: '#dcdde2',
  leaf: '#2f7a45',
  leafLight: '#4f9a4d',
  soil: '#4a3426',
  warmLight: '#ffd8a0',
};
