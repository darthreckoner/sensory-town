import * as THREE from 'three';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number };

export interface TownEnv {
  group: THREE.Group;
  colliders: Collider[];
  update(dt: number, t: number): void;
}

export function buildTownEnvironment(): TownEnv {
  return { group: new THREE.Group(), colliders: [], update() {} };
}
