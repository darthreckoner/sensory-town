// Static town environment: ground, roads, workshop, build yard, landmarks,
// scenery, hills and clouds. Shared by the Drive scene and the Build scene,
// so it is self-contained and cheap (merged meshes + InstancedMeshes).
//
// The pieces live in src/drive/*; this file only assembles them.
import * as THREE from 'three';
import { WORKSHOP, BUILD_YARD } from './townLayout';
import { buildTerrain } from '../drive/terrain';
import { buildSky } from '../drive/sky';
import { buildWorkshop } from '../drive/workshop';
import { buildYard } from '../drive/buildYard';
import { buildLandmarks } from '../drive/landmarks';
import { buildScenery, type Keepout } from '../drive/scenery';
import { makePad } from '../drive/pads';
import type { Piece } from '../drive/types';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number };

export interface TownEnv {
  group: THREE.Group;
  colliders: Collider[];
  update(dt: number, t: number): void;
}

export function buildTownEnvironment(): TownEnv {
  const group = new THREE.Group();
  group.name = 'townEnv';
  const colliders: Collider[] = [];
  const pieces: Piece[] = [buildWorkshop(), buildYard(), ...buildLandmarks()];

  group.add(buildTerrain());
  const sky = buildSky();
  group.add(sky.group);

  const pads = [
    makePad(WORKSHOP.pad.x, WORKSHOP.pad.z, '#ff9fcd', '🧪'),
    makePad(BUILD_YARD.pad.x, BUILD_YARD.pad.z, '#ffd75e', '🔨'),
  ];
  for (const p of pads) group.add(p.group);

  for (const p of pieces) {
    group.add(p.group);
    colliders.push(...p.colliders);
  }

  // Scenery goes last so it can steer clear of everything above.
  const keepouts: Keepout[] = [
    ...colliders,
    { kind: 'circle', x: WORKSHOP.pad.x, z: WORKSHOP.pad.z, r: 4 },
    { kind: 'circle', x: BUILD_YARD.pad.x, z: BUILD_YARD.pad.z, r: 4 },
  ];
  const scenery = buildScenery(keepouts);
  group.add(scenery.group);
  colliders.push(...scenery.colliders);

  return {
    group,
    colliders,
    update(dt: number, t: number) {
      sky.update(dt);
      for (const p of pads) p.update(t);
      for (const p of pieces) p.update?.(dt, t);
    },
  };
}
