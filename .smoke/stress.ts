import { canvas } from './domstub';
import { scenes } from '../src/core/scene';
import { buildSpace } from '../src/world/buildSpace';
import { BuildLayer } from '../src/build/world3/layer';
import type { BuildPiece, BuildKind, BuildMat } from '../src/core/model';
(scenes as any).canvas = canvas;
let n = 0;
const mats: BuildMat[] = ['wood', 'brick', 'metal'];
const kinds: BuildKind[] = ['wall', 'floor', 'ramp', 'roof', 'wall', 'wall', 'floor'];
function make(count: number, spreadX: number, spreadZ: number) {
  buildSpace.clear();
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    const p: BuildPiece = { id: 's' + n++, kind: kinds[i % kinds.length], mat: mats[i % 3], ix: -25 + (i * 7) % spreadX, iy: Math.floor(i / (spreadX * spreadZ)) % 3, iz: -25 + Math.floor(((i * 13) % (spreadX * spreadZ)) / spreadX), dir: (i % 4) as 0 | 1 | 2 | 3, ownerId: 'x', ...(i % 9 === 0 && kinds[i % kinds.length] === 'wall' ? { edit: (1 << 4) | (1 << 7) } : {}) };
    if (buildSpace.free(p)) { buildSpace.add(p); placed++; }
  }
  return placed;
}
for (const [count, sx, sz] of [[600, 20, 20], [1500, 40, 30], [3000, 50, 40]] as const) {
  const placed = make(count, sx, sz);
  const layer = new BuildLayer();
  const t0 = performance.now();
  layer.load();
  const dt = performance.now() - t0;
  const st = layer.stats();
  // one dirty chunk re-bake
  const first = [...buildSpace.pieces.values()][0];
  layer.update(first);
  const t1 = performance.now();
  (layer as any).lastBake = 0;
  layer.tick(0.016);
  const rb = performance.now() - t1;
  let tris = 0; layer.group.traverse((o: any) => { if (o.isMesh) tris += o.geometry.getIndex().count / 3; });
  console.log(`${placed} pieces: ${st.chunks} chunks, ${st.meshes} meshes, ${(tris / 1000).toFixed(0)}k tris, full load ${dt.toFixed(0)} ms, one chunk re-bake ${rb.toFixed(1)} ms`);
  layer.dispose();
}
process.exit(0);
