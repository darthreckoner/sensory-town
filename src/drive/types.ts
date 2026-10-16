// Shared shapes for the pieces of the world (districts, props) and the doors.
import type * as THREE from 'three';
import type { Collider } from '../world/townEnv';

/** A walk-in / drive-in trigger: glowing mat + floating icon; entering it starts a scene. */
export interface DoorDef {
  id: string;
  x: number;
  z: number;
  /** outward normal (the side you stand on) */
  nx: number;
  nz: number;
  icon: string;
  label: string;
  /** scene to enter; null = just a friendly visit toast (someone else's house) */
  scene: 'workshop' | 'dressup' | 'build' | null;
  params?: Record<string, unknown>;
  /** owner name for the visit toast */
  visitor?: string;
  /** trigger radius (default 1.5) */
  radius?: number;
  /** a car may trigger it below this speed; omit = on foot only */
  carSpeed?: number;
  /** only a car triggers it (the Studio / builder pads) */
  carOnly?: boolean;
  glow: string;
}

export interface Piece {
  group: THREE.Group;
  colliders: Collider[];
  /** doors / triggers this piece contributes */
  doors?: DoorDef[];
  /** hidden when the viewer is farther than `radius` from (x, z) */
  cull?: { x: number; z: number; r: number };
  /** per-frame animation (water, beams, flags...) */
  update?(dt: number, t: number): void;
}
