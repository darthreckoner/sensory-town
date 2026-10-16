// Shared shape of every self-contained piece of the town (workshop, yard, landmarks...).
import type * as THREE from 'three';
import type { Collider } from '../world/townEnv';

export interface Piece {
  group: THREE.Group;
  colliders: Collider[];
  /** Per-frame animation (water, windmill blades, ducks...). */
  update?(dt: number, t: number): void;
}
