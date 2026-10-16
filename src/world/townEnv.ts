// Static town environment (v2): terrain, sky, roads, every district, scenery.
// Shared by the Drive scene and the Build scene, so it is self-contained.
// The pieces live in src/drive/*; this file only assembles them and does the
// distance culling (districts, terrain chunks and vegetation chunks hide when
// the viewer is far away).
import * as THREE from 'three';
import { RESIDENTIAL } from './townLayout';
import { tuning } from '../tuning';
import { buildTerrain } from '../drive/terrain';
import { buildSky } from '../drive/sky';
import { buildDowntown } from '../drive/downtown';
import { buildHomeHills } from '../drive/homehills';
import { buildBeach } from '../drive/beach';
import { buildPark } from '../drive/park';
import { buildSkate } from '../drive/skate';
import { buildLookout } from '../drive/lookout';
import { buildScenery } from '../drive/scenery';
import { windTime } from '../drive/vegetation';
import { buildSummit } from '../drive/summit';
import { buildMeadow } from '../drive/meadow';
import { buildGrove } from '../drive/grove';
import { buildSands } from '../drive/sands';
import type { DoorDef, Piece } from '../drive/types';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number; h?: number; y0?: number; only?: 'car' | 'foot' }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; h?: number; y0?: number; only?: 'car' | 'foot' };
// h = top of the solid (a mover above it passes over); y0 = its underside (a railing on a deck: a swimmer below it passes under).

export interface TownEnv {
  group: THREE.Group;
  colliders: Collider[];
  update(dt: number, t: number): void;
  /** Tell the environment where the camera is (sky follows, far districts hide). Optional for callers. */
  setViewer?(x: number, y: number, z: number): void;
  /** Walk-in / drive-in doors contributed by the districts. */
  doors?: DoorDef[];
  /** Rough counts for the debug overlay. */
  stats?: () => Record<string, number>;
}

export function buildTownEnvironment(): TownEnv {
  const group = new THREE.Group();
  group.name = 'townEnv';
  const colliders: Collider[] = [];
  const doors: DoorDef[] = [];
  const pieces: Piece[] = [];

  const terrain = buildTerrain();
  group.add(terrain.group);
  const sky = buildSky();
  group.add(sky.group);

  const add = (p: Piece): void => {
    pieces.push(p);
    group.add(p.group);
    colliders.push(...p.colliders);
    if (p.doors) doors.push(...p.doors);
  };
  const dt = buildDowntown();
  const hh = buildHomeHills();
  const bc = buildBeach();
  const pk = buildPark();
  add(dt);
  add(hh);
  add(bc);
  add(pk);
  add(buildSkate());
  add(buildLookout());
  // v3 world: the new places
  const sm = buildSummit();
  const md = buildMeadow();
  const gv = buildGrove();
  const sd = buildSands();
  add(sm);
  add(md);
  add(gv);
  add(sd);

  // scenery last, so it can keep clear of everything above
  const sc = buildScenery({
    keepouts: colliders.slice(),
    sites: [...dt.trees, ...hh.trees, ...pk.trees, ...md.trees, ...gv.trees],
    palms: [...bc.palms, ...sd.palms],
    rocks: [...bc.rocks, ...sm.rocks, ...sd.rocks],
  });
  group.add(sc.build.group);
  colliders.push(...sc.veg.colliders);

  // The sun's shadow box only covers the area around the player: far districts and far tree chunks stop casting
  // (they are still drawn), which halves the shadow pass.
  const casters = new Map<Piece, THREE.Mesh[]>();
  for (const p of pieces) {
    const list: THREE.Mesh[] = [];
    p.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.castShadow) list.push(m);
    });
    casters.set(p, list);
  }
  const chunkCast = new Map<THREE.Mesh, boolean>();
  for (const c of sc.build.chunks) for (const mesh of c.meshes) chunkCast.set(mesh, mesh.castShadow);
  const SHADOW_NEAR_TREES = 90;
  let vx = RESIDENTIAL.center.x, vz = RESIDENTIAL.center.z;
  const apply = (): void => {
    for (const p of pieces) {
      if (!p.cull) continue;
      const dist = Math.hypot(vx - p.cull.x, vz - p.cull.z);
      p.group.visible = dist < p.cull.r;
      const cast = dist < p.cull.r * 0.55;
      for (const m of casters.get(p)!) m.castShadow = cast;
    }
    for (const c of terrain.chunks) c.visible = Math.hypot(vx - c.userData.cx, vz - c.userData.cz) < tuning.drive.cullTerrain;
    for (const c of sc.build.chunks) {
      const dist = Math.hypot(vx - c.cx, vz - c.cz);
      const vis = dist < tuning.drive.cullVegetation;
      for (const mesh of c.meshes) {
        mesh.visible = vis;
        mesh.castShadow = (chunkCast.get(mesh) ?? false) && dist < SHADOW_NEAR_TREES;
      }
    }
  };
  apply();

  return {
    group,
    colliders,
    doors,
    setViewer(x, y, z) {
      sky.follow(x, y, z);
      if (Math.abs(x - vx) + Math.abs(z - vz) > 3) {
        vx = x;
        vz = z;
        apply();
      }
    },
    update(dt, t) {
      sky.update(dt);
      windTime.value = t; // v3 world: the trees sway
      terrain.water.update(t);
      for (const p of pieces) if (p.group.visible) p.update?.(dt, t);
    },
  };
}
