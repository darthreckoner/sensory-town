import { canvas, ui } from './domstub';
import * as THREE from 'three';
import { scenes } from '../src/core/scene';
import { store } from '../src/core/store';
import { buildSpace, surfaceBelow, TILE, STOREY, THICK, collidersOf, pieceTopAt, anchorY } from '../src/world/buildSpace';
import { ColliderGrid, pushOut } from '../src/drive/physics';
import { FootPhysics } from '../src/drive/foot';
import { groundHeight } from '../src/world/heightfield';
import { BuildMode } from '../src/build/world3/mode';
import { BuildLayer } from '../src/build/world3/layer';
import { DecorLayer, decorCatalog } from '../src/build/world3/decor';
import { buildPieceObject } from '../src/build/world3/geo';
import type { BuildPiece, BuildKind, BuildMat } from '../src/core/model';

(scenes as any).canvas = canvas;
store.data.activeProfileId = store.data.profiles[0].id;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let n = 0;
const P = (kind: BuildKind, ix: number, iy: number, iz: number, dir: 0 | 1 | 2 | 3 = 0, mat: BuildMat = 'wood', extra: Partial<BuildPiece> = {}): BuildPiece => ({ id: 'p' + n++, kind, mat, ix, iy, iz, dir, ownerId: 'x', ...extra });
const tri = (g: THREE.Object3D) => { let t = 0, m = 0; g.traverse((o: any) => { if (o.isMesh) { m++; t += o.geometry.getIndex().count / 3; } }); return { tris: t, meshes: m }; };

// ── 1. surfaces ──
const A = { ix: -30, iz: 40 };            // somewhere flat-ish; heights are relative to the real terrain below
const g0 = groundHeight((A.ix + 0.5) * TILE, (A.iz + 0.5) * TILE, true);
console.log('terrain at test spot', g0.toFixed(2));
buildSpace.clear();
const fl = P('floor', A.ix, 0, A.iz);
buildSpace.add(fl);
const cx = (A.ix + 0.5) * TILE, cz = (A.iz + 0.5) * TILE;
ok(Math.abs(buildSpace.surfaceBelow(cx, cz, THICK) - THICK) < 1e-9, 'floor top = base + thick');
ok(buildSpace.surfaceBelow(cx, cz, -3) === -Infinity, 'a floor above stepUp is passed under (-Infinity)');
const hole = P('floor', A.ix + 1, 0, A.iz, 0, 'wood', { edit: 1 << 4 });
buildSpace.add(hole);
ok(buildSpace.surfaceBelow((A.ix + 1.5) * TILE, (A.iz + 0.5) * TILE, 1) === -Infinity, 'a floor hole has no surface');
ok(Math.abs(buildSpace.surfaceBelow((A.ix + 1.5) * TILE + 1.7, (A.iz + 0.5) * TILE, anchorY(A.ix + 1, A.iz) + 0.2) - (anchorY(A.ix + 1, A.iz) + THICK)) < 1e-9, '...but the rest of that floor does');
const rp = P('ramp', A.ix + 2, 0, A.iz, 1);
buildSpace.add(rp);
const rx = (A.ix + 2) * TILE;
const ra = anchorY(A.ix + 2, A.iz);
ok(Math.abs(pieceTopAt(rp, rx + 0.001, cz) - ra) < 0.01 && Math.abs(pieceTopAt(rp, rx + TILE - 0.001, cz) - ra - STOREY) < 0.01, 'ramp rises from its base to a storey toward its dir (east)');
const rp2 = P('ramp', A.ix + 3, 0, A.iz, 0);
const ra2 = anchorY(A.ix + 3, A.iz);
ok(Math.abs(pieceTopAt(rp2, (A.ix + 3.5) * TILE, (A.iz + 1) * TILE - 0.001) - ra2) < 0.01 && Math.abs(pieceTopAt(rp2, (A.ix + 3.5) * TILE, A.iz * TILE + 0.001) - ra2 - STOREY) < 0.01, 'ramp dir 0 rises to the north');
const roof = P('roof', A.ix + 4, 1, A.iz);
ok(Math.abs(pieceTopAt(roof, (A.ix + 4.5) * TILE, cz) - (anchorY(A.ix + 4, A.iz) + STOREY + 0.62 * STOREY)) < 0.01, 'roof apex = base + roofRise storeys');
ok(!buildSpace.free(P('floor', A.ix, 0, A.iz)) && buildSpace.free(P('floor', A.ix, 1, A.iz)), 'a slot holds one piece per storey');
ok(!buildSpace.free(P('ramp', A.ix, 0, A.iz)) && !buildSpace.free(P('roof', A.ix, 0, A.iz)), 'floor / ramp / roof share the cell slot');
buildSpace.add(P('wall', A.ix, 0, A.iz, 0));
ok(!buildSpace.free(P('wall', A.ix, 0, A.iz - 1, 2)) && buildSpace.free(P('wall', A.ix, 0, A.iz, 2)), 'a N wall and the neighbour\'s S wall are the same edge');

// ── 2. colliders ──
{
  const w = P('wall', 0, 0, 0, 0);
  const cs = collidersOf(w);
  ok(cs.length === 1 && cs[0].kind === 'box' && Math.abs((cs[0] as any).hw - TILE / 2) < 1e-6 && cs[0].y0 === 0 && Math.abs(cs[0].h! - STOREY) < 1e-6, 'a whole wall is one box, ground to storey');
  const door = collidersOf(P('wall', 0, 0, 0, 0, 'wood', { edit: (1 << 4) | (1 << 7) }));
  ok(door.length === 3, 'a door cut leaves 3 boxes (left, right, lintel): ' + door.length);
  const lintel = door.find((c) => c.y0 !== undefined && c.y0 > 2)!;
  ok(!!lintel && lintel.y0! > 2.3, 'the lintel starts above a walker\'s head (' + lintel?.y0 + ')');
  const win = collidersOf(P('wall', 0, 0, 0, 0, 'wood', { edit: 1 << 4 }));
  ok(win.length >= 3, 'a window cut: sill + sides + head (' + win.length + ')');
  const r = collidersOf(P('ramp', 0, 0, 0, 2));
  ok(r.length === 6, 'a ramp makes strips (' + r.length + ')');
}

// ── 3. walking: up a ramp, onto a floor, through a wall, through a door ──
{
  buildSpace.clear();
  // a flat strip of 5 cells inside the world
  let base = { ix: -10, iz: 3 }, bestR = 1e9;
  for (let iz = -20; iz < 20; iz++) for (let ix = -25; ix < 20; ix++) {
    let lo = 1e9, hi = -1e9;
    for (let x = (ix - 1) * TILE; x < (ix + 5) * TILE; x += 1.6) for (let zz = iz * TILE; zz < (iz + 1) * TILE; zz += 1.6) { const h = groundHeight(x, zz, true); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo < bestR && Math.abs(hi) < 0.5 && lo > -0.3) { bestR = hi - lo; base = { ix, iz }; }
  }
  console.log('   flattest strip at', JSON.stringify(base), 'range', bestR.toFixed(2));
  const z = (base.iz + 0.5) * TILE;
  const grid = new ColliderGrid([]);
  buildSpace.attach(grid);
  const ground = groundHeight((base.ix + 0.5) * TILE, z, true);
  // the test needs level ground: rebuild at iy chosen from the terrain so floors line up with it
  const iy0 = 0;
  const ramp = P('ramp', base.ix, iy0, base.iz, 1);
  const top = P('floor', base.ix + 1, iy0 + 1, base.iz);
  const top2 = P('floor', base.ix + 2, iy0 + 1, base.iz);
  for (const p of [ramp, top, top2]) buildSpace.add(p);
  const foot = new FootPhysics();
  const startX = base.ix * TILE - 3;
  foot.reset(startX, z, Math.PI / 2);
  const run = (steps: number, dx = 1, dz = 0) => { for (let i = 0; i < steps; i++) foot.step(1 / 90, dx, dz, 1, false, false, grid); };
  const topY = anchorY(base.ix + 1, base.iz) + (iy0 + 1) * STOREY + THICK;
  for (let i = 0; i < 700 && !(foot.y > topY - 0.05 && foot.x > (base.ix + 1.3) * TILE); i++) run(1);
  console.log('   foot', foot.x.toFixed(1), foot.y.toFixed(2), 'expected top', topY.toFixed(2), 'ground', ground.toFixed(2));
  ok(foot.y > topY - 0.05 && foot.grounded, 'walked up the ramp and stands on the upper floor (y ' + foot.y.toFixed(2) + ')');
  ok(foot.x > (base.ix + 1) * TILE, 'x moved over the ramp (' + foot.x.toFixed(1) + ')');
  // a wall across the east edge of the second floor tile
  const wall = P('wall', base.ix + 2, iy0 + 1, base.iz, 1);
  buildSpace.add(wall);
  run(500);
  const wx = (base.ix + 3) * TILE;
  ok(foot.x < wx - 0.2, 'a wall stops the walker (x ' + foot.x.toFixed(2) + ' < ' + (wx - 0.2).toFixed(2) + ')');
  // cut a door in it
  wall.edit = (1 << 4) | (1 << 7);
  buildSpace.update(wall);
  run(500);
  ok(foot.x > wx + 0.3, 'a door cut lets the walker through (x ' + foot.x.toFixed(2) + ')');
  // walk off the edge: falls to the ground
  run(900);
  ok(foot.y < topY - 1, 'walks off the edge and falls (y ' + foot.y.toFixed(2) + ')');
  // walking under the upper floor at ground level
  buildSpace.update(wall);
  foot.reset((base.ix + 1.5) * TILE, z + 2, 0);
  const gy = groundHeight(foot.x, foot.z, true);
  run(200, 0, -1);
  ok(Math.abs(foot.y - gy) < 0.6 || foot.y < topY - 1, 'can walk under a floor (y ' + foot.y.toFixed(2) + ')');
  buildSpace.attach(null);
}

// ── 4. geometry + draw budget ──
{
  const kinds: BuildKind[] = ['wall', 'floor', 'ramp', 'roof'];
  const mats: BuildMat[] = ['wood', 'brick', 'metal'];
  const rows: string[] = [];
  let worst = 0;
  for (const k of kinds) for (const m of mats) {
    const g = buildPieceObject(P(k, 3, 0, 3, 0, m));
    const s = tri(g);
    worst = Math.max(worst, s.tris);
    rows.push(`${k}/${m} ${s.tris}t/${s.meshes}m`);
  }
  console.log('   ' + rows.join('  '));
  ok(worst < 700, 'every piece is a few hundred triangles at most (worst ' + worst + ')');
  const cut = tri(buildPieceObject(P('wall', 3, 0, 3, 0, 'brick', { edit: (1 << 4) | (1 << 7) })));
  ok(cut.tris > 0, 'an edited brick wall builds (' + cut.tris + ' tris)');
}

// ── 5. a town of builds: chunks and meshes ──
{
  buildSpace.clear();
  const pcs: BuildPiece[] = [];
  const mats: BuildMat[] = ['wood', 'brick', 'metal'];
  for (let i = 0; i < 200; i++) {
    const kind: BuildKind = (['wall', 'floor', 'ramp', 'roof', 'wall', 'wall'] as BuildKind[])[i % 6];
    const p = P(kind, -40 + (i % 8), Math.floor(i / 64), 32 + Math.floor((i % 64) / 8), (i % 4) as 0 | 1 | 2 | 3, mats[i % 3], i % 7 === 0 && kind === 'wall' ? { edit: (1 << 4) | (1 << 7) } : {});
    if (buildSpace.free(p)) { buildSpace.add(p); pcs.push(p); }
  }
  const layer = new BuildLayer();
  const t0 = performance.now();
  layer.load();
  const dt = performance.now() - t0;
  const st = layer.stats();
  console.log(`   ${pcs.length} pieces: ${st.chunks} chunks, ${st.meshes} meshes, load ${dt.toFixed(0)} ms`);
  ok(st.meshes <= 15, `~200 mixed pieces (one chunk) draw in ${st.meshes} meshes, ${st.chunks} chunk(s) (<= 15)`);
  const t = tri(layer.group);
  console.log('   triangles', t.tris);
  // animation + fold
  const p = P('wall', -41, 0, 33, 0, 'metal');
  buildSpace.add(p);
  layer.add(p, true);
  ok(layer.stats().live === 1, 'a new piece builds in as its own object');
  for (let i = 0; i < 120; i++) layer.tick(1 / 60);
  ok(layer.stats().live === 0, 'then folds into its chunk');
  // picking
  const f = { x: (-41 + 0.5) * TILE, z: 33 * TILE };
  const hit = layer.pick(f.x, anchorY(-41, 33) + 1.5, f.z + 6, 0, 0, -1, 30);
  ok(!!hit && hit.piece.id === p.id, 'a ray picks the wall it hits');
  layer.dispose();
}

// ── 6. decor ──
{
  const dec = new DecorLayer();
  const cat = decorCatalog();
  ok(cat.length >= 30, 'decor catalog from the house generators: ' + cat.length + ' items');
  const items = cat.slice(0, 40).map((d, i) => ({ id: 'd' + i, type: d.type as string, x: i * 3, y: 0, z: 100, rot: i * 0.4, color: d.color, ownerId: 'x' }));
  for (const it of items) dec.add(it as any);
  dec.settle();
  const s = dec.stats();
  console.log('   decor', JSON.stringify(s));
  ok(s.meshes > 0 && s.items === 40, '40 decor items bake (' + s.meshes + ' meshes)');
  const h = dec.pick(items[3].x, 1, items[3].z + 8, 0, 0, -1, 30);
  ok(!!h && h.item.id === 'd3', 'a ray picks a decor item');
  dec.dispose();
}

// ── 7. build mode: the ghost in front of the player ──
{
  buildSpace.clear();
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.5, 700);
  const scene = new THREE.Scene();
  const state = { x: 0.5 * TILE + 0.3, y: 0, z: 0.5 * TILE + 0.3, grounded: true };
  const mode = new BuildMode({ scene, camera, canvas: canvas as any, hud: ui as any, foot: () => state, onFoot: () => true, getOut: () => true });
  mode.enter(new ColliderGrid([]));
  const look = (yaw: number) => { camera.position.set(state.x - Math.sin(yaw) * 6, 4, state.z + Math.cos(yaw) * 6); camera.lookAt(state.x, 1.5, state.z); camera.updateMatrixWorld(); };
  mode.toggle(true);
  look(0);                                   // looking north (-z)
  mode.setKind('wall'); mode.update(0.016, 0);
  let d = mode.debug().target!;
  console.log('   wall north', JSON.stringify(d));
  ok(d.kind === 'wall' && d.ok, 'a wall ghost appears in front');
  mode.setKind('floor'); mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.kind === 'floor' && d.iy === 0, 'a floor ghost at the storey you stand on');
  mode.setKind('ramp'); mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.kind === 'ramp' && d.dir === 0, 'the ramp rises away from you (north = dir 0)');
  look(Math.PI / 2);                         // looking east
  mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.dir === 1, 'looking east: the ramp rises east (dir ' + d.dir + ')');
  mode.setKind('roof'); mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.kind === 'roof' && d.iy === 0, 'with no walls the roof rests on the ground (iy ' + d.iy + ')');
  // place a wall, then the ghost is red on the same edge
  look(0);
  mode.setKind('wall'); mode.update(0.016, 0);
  ok(mode.place(), 'tap places the wall');
  mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(!d.ok && d.why === 'taken', 'the same edge is now red ("taken")');
  ok((store.data.town.builds ?? []).length === 1, 'saved to town.builds');
  mode.undo();
  ok(buildSpace.size === 0 && (store.data.town.builds ?? []).length === 0, 'undo removes it again');
  // roofs: on the ground storey they rest on the ground; over a wall they sit on top of it
  look(0);
  mode.setKind('roof'); mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.kind === 'roof' && d.iy === 0, 'a roof with no wall under it rests on the ground (iy ' + d.iy + ')');
  // build a wall on one edge of the cell the roof would take: now the roof goes on top
  const cellIx = d.ix, cellIz = d.iz;
  buildSpace.add(P('wall', cellIx, 0, cellIz, 0));
  mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.iy === 1, 'with a wall under the cell the roof goes on top of it (iy ' + d.iy + ')');
  buildSpace.remove(buildSpace.pieceAtSlot({ kind: 'wall', ix: cellIx, iy: 0, iz: cellIz, dir: 0 })!.id);
  // storey follows your height
  state.y = STOREY + THICK;
  mode.setKind('floor'); mode.update(0.016, 0);
  d = mode.debug().target!;
  ok(d.iy === 1, 'standing on the second storey builds there (iy ' + d.iy + ')');
  mode.dispose();
}

// ── 8. drag-build: hold, then sweep ──
{
  buildSpace.clear();
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.5, 700);
  const scene = new THREE.Scene();
  const state = { x: 0.5 * TILE, y: 0, z: 0.5 * TILE, grounded: true };
  const mode = new BuildMode({ scene, camera, canvas: canvas as any, hud: ui as any, foot: () => state, onFoot: () => true, getOut: () => true });
  mode.enter(new ColliderGrid([]));
  mode.toggle(true);
  mode.setKind('floor');
  const look = (yaw: number) => { camera.position.set(state.x - Math.sin(yaw) * 6, 4, state.z + Math.cos(yaw) * 6); camera.lookAt(state.x, 1.5, state.z); camera.updateMatrixWorld(); };
  look(Math.PI / 2);                          // facing east
  mode.update(0.016, 0);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  canvas.fire('pointerdown', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse', button: 0 });
  mode.update(0.016, 0);
  ok(buildSpace.size === 0, 'a press alone does not place yet');
  await sleep(260);
  mode.update(0.016, 0);
  ok(buildSpace.size === 1, 'holding places the first piece');
  for (let i = 0; i < 6; i++) {
    state.x += TILE * 0.9;
    look(Math.PI / 2);
    await sleep(90);
    mode.update(0.016, 0);
  }
  console.log('   run length', buildSpace.size);
  ok(buildSpace.size >= 5, 'sweeping while holding builds a run (' + buildSpace.size + ' floors)');
  (mode as any).onUp({ pointerId: 1, type: 'pointerup', clientX: 300, clientY: 300, pointerType: 'mouse', button: 0 });   // (window-level in the browser)
  const n0 = buildSpace.size;
  state.x += TILE * 2;
  look(Math.PI / 2);
  await sleep(90);
  mode.update(0.016, 0);
  ok(buildSpace.size === n0, 'letting go stops the run');
  ok((store.data.town.builds ?? []).length === n0, 'every piece of the run is saved');
  mode.dispose();
}


console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
