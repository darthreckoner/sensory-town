// ── v3 build (W5): world invariants for the player's builds ──────────────────────
// Run in the browser: `await window.__worldcheck.builds()` -> [] when everything holds.
//   surface   every floor / ramp / roof has a surface where it says it does (surfaceBelow agrees)
//   feet      a walker put on a built floor / ramp stands on it (does not sink through or float above it)
//   roofs     a roof above the ground storey has a wall under it (or a supported roof beside it)
//   slots     one piece per cell-slot / wall edge, none outside sane bounds, under the cap
import type { BuildPiece } from '../../core/model';
import { store } from '../../core/store';
import { tuning } from '../../tuning';
import { buildSpace, collidersOf, pieceFrame, pieceTopAt, slotKey, TILE } from '../../world/buildSpace';
import { groundHeight } from '../../world/heightfield';

export interface BuildIssue { id: string; kind: string; at: [number, number, number]; issue: string }

export async function buildsIssues(): Promise<BuildIssue[]> {
  const out: BuildIssue[] = [];
  const list = [...buildSpace.pieces.values()];
  const saved = store.data.town.builds ?? [];
  const where = (p: BuildPiece): [number, number, number] => [p.ix, p.iy, p.iz];
  if (list.length !== saved.length) out.push({ id: '-', kind: '-', at: [0, 0, 0], issue: `indexed ${list.length} pieces but ${saved.length} are saved` });
  if (list.length > tuning.build3.maxPieces) out.push({ id: '-', kind: '-', at: [0, 0, 0], issue: `over the cap: ${list.length} > ${tuning.build3.maxPieces}` });

  // slots: no two pieces in one slot
  const seen = new Map<string, string>();
  for (const p of list) {
    if (![p.ix, p.iy, p.iz].every(Number.isInteger) || Math.abs(p.ix) > 1000 || Math.abs(p.iz) > 1000 || p.iy < 0 || p.iy > 40) out.push({ id: p.id, kind: p.kind, at: where(p), issue: 'cell out of range' });
    const k = slotKey(p);
    if (seen.has(k)) out.push({ id: p.id, kind: p.kind, at: where(p), issue: `shares a slot with ${seen.get(k)}` });
    else seen.set(k, p.id);
  }

  // roofs on walls
  for (const p of list) if (p.kind === 'roof' && !buildSpace.roofHasSupport(p.ix, p.iy, p.iz)) out.push({ id: p.id, kind: p.kind, at: where(p), issue: 'roof floats: no wall under it' });

  // surfaces + feet (a sample of the pieces)
  const { FootPhysics } = await import('../../drive/foot');
  const { ColliderGrid } = await import('../../drive/physics');
  const surfacey = list.filter((p) => p.kind !== 'wall');
  const stride = Math.max(1, Math.floor(surfacey.length / 90));
  const grid = new ColliderGrid(list.flatMap((p) => collidersOf(p)));
  for (let i = 0; i < surfacey.length; i += stride) {
    const p = surfacey[i];
    const f = pieceFrame(p);
    // a point on the piece that is not a hole
    const pts: [number, number][] = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) pts.push([p.ix * TILE + (a + 0.5) * (TILE / 3), p.iz * TILE + (b + 0.5) * (TILE / 3)]);
    const pt = pts.find(([x, z]) => pieceTopAt(p, x, z) > -Infinity);
    if (!pt) continue;
    const [x, z] = pt;
    const top = pieceTopAt(p, x, z);
    const got = buildSpace.surfaceBelow(x, z, top + 0.01);
    if (got < top - 0.02) {
      out.push({ id: p.id, kind: p.kind, at: where(p), issue: `no surface at (${x.toFixed(1)}, ${z.toFixed(1)}): wanted ${top.toFixed(2)}, got ${got}` });
      continue;
    }
    if (p.kind === 'roof') continue;   // a pyramid slope is not a place to stand still
    const foot = new FootPhysics();
    foot.reset(x, z, 0);
    foot.y = Math.max(foot.y, top + 0.02);
    foot.grounded = false;
    for (let s = 0; s < 40; s++) foot.step(1 / 60, 0, 0, 0, false, false, grid);
    const want = Math.max(top, got, groundHeight(x, z, true));   // on a hillside the terrain can poke through a floor: you stand on whichever is higher
    if (Math.abs(foot.y - want) > 0.08 || !foot.grounded) out.push({ id: p.id, kind: p.kind, at: where(p), issue: `feet end at ${foot.y.toFixed(2)} (grounded=${foot.grounded}) instead of ${want.toFixed(2)}` });
    void f;
  }
  return out;
}
