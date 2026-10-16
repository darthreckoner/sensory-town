// Walk along a road path and drop things beside it.
import { ROAD_PATHS, nearestRoad } from '../world/townLayout';

/**
 * Call fn every `spacing` units along a road path, `offset` to one side
 * (side = +1 / -1). fn receives the point and the unit vector pointing back
 * towards the road. Junction mouths (near any OTHER road) are skipped.
 */
export function along(
  pathId: string, side: number, spacing: number, offset: number, start: number,
  fn: (x: number, z: number, nx: number, nz: number, tx: number, tz: number) => void,
  junctionClear = 3.2,
): void {
  const p = ROAD_PATHS.find((r) => r.id === pathId);
  if (!p) return;
  let acc = start;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [x0, z0] = p.pts[i], [x1, z1] = p.pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    const lx = -tz, lz = tx;
    for (let s = 0; s < len; s += 1) {
      acc -= 1;
      if (acc > 0) continue;
      acc = spacing;
      const x = x0 + tx * s + lx * side * offset, z = z0 + tz * s + lz * side * offset;
      const hit = nearestRoad(x, z, (q) => q.id !== pathId);
      if (hit.edge < junctionClear) continue;
      fn(x, z, -lx * side, -lz * side, tx, tz);
    }
  }
}
