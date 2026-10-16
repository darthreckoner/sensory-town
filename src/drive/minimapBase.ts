// The island on the minimap (v3): paints the sea, the shallows, the beaches and the land from the same
// shoreline the terrain uses (world/heightfield.shoreDist), so the map always matches the world.
import { WORLD_AREA } from '../world/townLayout';
import { cliffiness, shoreDist, terrainHeight } from '../world/heightfield';

/** Half-size of the area the minimap's static layer covers (world units around the origin). */
export const MAP_REACH = Math.ceil(Math.max(Math.abs(WORLD_AREA[0]), Math.abs(WORLD_AREA[1]), WORLD_AREA[2], WORLD_AREA[3]) + 12);
/** Canvas pixels per world unit for the static layer (the dial itself is small; this keeps it crisp enough). */
export const MAP_SCALE = 1.7;

/** Fill `g` (a canvas covering ±MAP_REACH at MAP_SCALE px per unit) with sea and island. */
export function paintIsland(g: CanvasRenderingContext2D): void {
  const B = MAP_SCALE, R = MAP_REACH, S = Math.round(R * 2 * B);
  g.fillStyle = '#4fa8dc';
  g.fillRect(0, 0, S, S);
  const cell = 4;
  for (let z = -R; z < R; z += cell)
    for (let x = -R; x < R; x += cell) {
      const cx = x + cell / 2, cz = z + cell / 2;
      const s = shoreDist(cx, cz);
      if (s < -40) continue;                                   // open sea: the base colour
      let col: string;
      if (s <= 0) col = s > -14 ? '#8fdcec' : s > -26 ? '#6cc4e4' : '#58b4e0';       // shallows fade to deep blue
      else if (s < 4) col = '#fff2c4';                                                  // the white edge of the shore
      else {
        const h = terrainHeight(cx, cz);
        if (h < -0.35) col = '#6cc4e4';                                                 // an inland lake / the lazy river
        else if (s < 20 && cliffiness(cx, cz) < 0.5) col = '#f2dfa6';                   // beach
        else if (h > 26) col = '#f4f8ff';                                               // snow
        else col = '#b9e48a';                                                           // grass
      }
      g.fillStyle = col;
      g.fillRect((x + R) * B, (z + R) * B, cell * B + 0.6, cell * B + 0.6);
    }
}
