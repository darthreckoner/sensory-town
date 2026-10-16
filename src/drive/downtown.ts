// Downtown: the Studio, the Mall, the Cinema, the Arcade, the STYLE boutique,
// boba café, sneaker shop, a diner, glass towers on the skyline, street
// furniture and parked cars. Static geometry is merged per material; the
// searchlights and neon rings are the only animated bits.
import * as THREE from 'three';
import { BOUTIQUE, SIDEWALK, WORKSHOP } from '../world/townLayout';
import { along } from './pathwalk';
import { terrainHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { DoorDef, Piece } from './types';
import { Mesher } from './mesher';
import { bakeStatic, mergeStaticGroups } from './envUtils';
import { FACADE_TILE, facadeMat, mat, signs } from './kit';
import { PAL } from './palette';
import { arcade, boba, boutique, cinema, diner, kicks, mall, shop, studio, type Built } from './shops';
import { bench, bin, bollard, busStop, hydrant, lamp, parkedCar, planter, trafficLight, type PropOut } from './props';

export interface TreeSite { x: number; z: number; kind: 'oak' | 'birch'; scale: number }

export interface DowntownOut extends Piece {
  trees: TreeSite[];
  /** (x,z,r) circles the scenery scatter must keep clear of, plus the building boxes */
  keepouts: Collider[];
}

export function buildDowntown(): DowntownOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const out: PropOut = { colliders: [] };
  const doors: DoorDef[] = [];
  const beams: THREE.Mesh[] = [];
  const trees: TreeSite[] = [];
  const bd: Built[] = [];

  // ── the buildings ──
  const W = WORKSHOP;
  const st = studio(m, ex, W.center.x, W.center.z, W.size.w, W.size.d, W.height);
  bd.push(st);
  doors.push({ id: 'studio', x: st.door.x, z: st.door.z + 0.6, nx: 0, nz: 1, icon: '🧪', label: 'Studio', scene: 'workshop', glow: PAL.pink, radius: 1.8 });

  bd.push(mall(m, ex, 21, 17.6, 26, 20, 10.5));
  bd.push(cinema(m, ex, -26, -15.6, 17, 16, 12, beams));
  bd.push(arcade(m, -11.9, -14.6, 9, 14, 8));

  const bo = boutique(m, ex, BOUTIQUE.center.x, BOUTIQUE.center.z, BOUTIQUE.size.w, BOUTIQUE.size.d, BOUTIQUE.height);
  bd.push(bo);
  doors.push({ id: 'style', x: bo.door.x, z: bo.door.z - 0.6, nx: 0, nz: -1, icon: '👗', label: 'Style', scene: 'dressup', glow: PAL.pink, radius: 1.8 });

  bd.push(boba(m, ex, { x: -30.1, z: 14.6, w: 8.6, d: 14, h: 8, face: 'n', wall: '#c58d5e', seed: 4, sign: { text: 'BOBA', fg: '#ffffff', glow: PAL.pink }, storefront: 'warm' }));
  bd.push(kicks(m, ex, { x: -20.9, z: 14.6, w: 8.6, d: 14, h: 8.6, face: 'n', wall: '#9b3b2f', seed: 6, sign: { text: 'KICKS', fg: '#ffffff', glow: PAL.lime }, storefront: 'glass' }));
  bd.push(diner(m, ex, { x: 64, z: 11.5, face: 'n' }));

  // a few ordinary shops along the east side of the ring road + back-lot buildings to fill the blocks
  bd.push(shop(m, { x: -30, z: -55.2, w: 12, d: 10, h: 7, face: 's', wall: '#9fb59a', seed: 2, sign: { text: 'GROCERY', fg: '#ffffff', glow: PAL.lime }, storefront: 'warm' }));
  bd.push(shop(m, { x: 20, z: 55.2, w: 14, d: 10, h: 7.5, face: 'n', wall: '#b9b4ac', seed: 3, sign: { text: 'GAMES', fg: '#ffffff', glow: PAL.violet }, storefront: 'dark' }));

  // ── skyline towers (glass curtain walls with an LED crown) ──
  const towers: [number, number, number, number, number][] = [[-58, -30, 14, 40, 3], [-58, -50, 12, 56, 4], [58, -30, 14, 46, 5], [60, 34, 14, 34, 6]];
  towers.forEach(([tx, tz, tw, th, seed]) => {
    m.box(facadeMat('#5b7da1', 'curtain', seed), tx, th / 2, tz, tw, th, tw, { tile: FACADE_TILE, skip: ['top', 'bottom'] });
    m.box(mat.roof(), tx, th + 0.1, tz, tw, 0.3, tw);
    m.box(mat.neon(seed % 2 ? PAL.cyan : PAL.pink), tx, th - 0.4, tz, tw + 0.2, 0.18, tw + 0.2);
    m.box(mat.std('#6c7280', 0.5, 0.5), tx, th + 1.6, tz, 0.4, 3, 0.4);
    out.colliders.push({ kind: 'box', x: tx, z: tz, hw: tw / 2, hd: tw / 2 });
  });

  // ── street furniture ──
  const lampSides = [-1, 1];
  for (const id of ['main', 'center', 'ring_n', 'ring_s', 'ring_e', 'ring_w']) {
    lampSides.forEach((sd, k) => {
      along(id, sd, 24, 5.8, k * 12 + 8, (x, z, nx, nz) => {
        // skip spots right in front of shop entrances (sidewalk edge near buildings is fine; lamps stand at the curb)
        lamp(m, out, x, z, Math.atan2(nx, nz));
      });
    });
  }
  // street trees on the outer sidewalk of the ring and Center Ave, in little planters
  for (const id of ['ring_n', 'ring_s', 'ring_e', 'ring_w', 'center']) {
    for (const sd of [-1, 1]) {
      along(id, sd, 17, 5 + SIDEWALK * 0.55, 6 + (sd > 0 ? 8 : 0), (x, z) => {
        if (Math.abs(x) < 50 && Math.abs(z) < 50) {
          // skip where a building stands (the inner sidewalk right beside facades)
          const near = bd.some((b) => b.colliders.some((c) => c.kind === 'box' && Math.abs(x - c.x) < c.hw + 1.6 && Math.abs(z - c.z) < c.hd + 1.6));
          if (near) return;
          trees.push({ x, z, kind: 'oak', scale: 0.62 });
          planter(m, out, x, z, 1.5, 1.5);
        }
      });
    }
  }
  // traffic lights at the junction corners (decor)
  const junctions: [number, number][] = [[0, 0], [42, 0], [-42, 0], [0, 42], [0, -42]];
  for (const [jx, jz] of junctions)
    for (const [sx, sz] of [[1, 1], [-1, -1]] as [number, number][]) {
      const px = jx + sx * 6.4, pz = jz + sz * 6.4;
      // the arm points back over the road we guard
      trafficLight(m, out, px, pz, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  // benches, bins, bus stops, hydrants
  for (const [bx, bz, yaw] of [[-18, -6.4, Math.PI], [-4, -6.4, Math.PI], [14, 6.4, 0], [32, 6.4, 0], [-30, 6.4, 0]] as [number, number, number][]) {
    bench(m, out, bx, bz, yaw);
    bin(m, out, bx + 1.6, bz);
  }
  busStop(m, out, -6.4, -22, Math.PI / 2);
  busStop(m, out, 6.4, 24, -Math.PI / 2);
  for (const [hx, hz] of [[-8, 6.6], [10, -6.6], [-38, -9], [38, 9]] as [number, number][]) hydrant(m, hx, hz);

  // the Studio plaza: planters with trees, benches, bollards that frame the drive-in
  for (const [px, pz] of [[9.5, -16.8], [32.5, -16.8]] as [number, number][]) {
    planter(m, out, px, pz, 2, 2);
    trees.push({ x: px, z: pz, kind: 'birch', scale: 0.7 });
  }
  bench(m, out, 13.5, -16.6, 0);
  bench(m, out, 28.5, -16.6, 0);
  for (const bx of [7.7, 34.3]) bollard(m, out, bx, -7.9, PAL.pink);
  for (let i = 0; i < 5; i++) bollard(m, out, 11 + i * 2.2, -17.2, PAL.cyan);

  // parked cars in the back lots
  const carCols = ['#2c3e5c', '#d4262d', '#f3f2ee', '#3a3d47', '#2f7a45', '#ffc93c', '#7c4dff', '#ff8a3d'];
  for (let i = 0; i < 5; i++) parkedCar(m, out, -33 + i * 5, 32, 0, carCols[i % carCols.length]);
  for (let i = 0; i < 4; i++) parkedCar(m, out, -33 + i * 5.2, -31.5, 0, carCols[(i + 3) % carCols.length]);
  // dumpsters + a back fence along the SW block
  m.box(mat.std('#2f7a45', 0.7), -8, 0.55, 31, 2.2, 1.1, 1.2);
  out.colliders.push({ kind: 'box', x: -8, z: 31, hw: 1.1, hd: 0.6 });

  // ── emit ──
  const group = new THREE.Group();
  group.name = 'downtown';
  group.add(mergeStaticGroups('downtown-static', m.build('downtown-static'), bakeStatic(ex))); // v3: one mesh per material, not two
  // glow rings + animated beams stay as separate meshes
  const keep: Collider[] = [];
  for (const b of bd) for (const c of b.colliders) keep.push(c);
  signs(); // make sure the atlas texture is flushed
  const colliders = [...keep, ...out.colliders];
  void terrainHeight;
  return {
    group,
    colliders,
    doors,
    trees,
    keepouts: colliders,
    cull: { x: 0, z: 0, r: 190 },
    update(_dt: number, t: number) {
      for (const b of beams) {
        const ph = (b.userData.phase as number) ?? 1;
        b.rotation.z = Math.sin(t * 0.5 + ph) * 0.45;
        b.rotation.x = Math.cos(t * 0.37 + ph * 2) * 0.35;
      }
    },
  };
}
