// Contract between the Workshop scene and each station (Squishy / Slime / Wax).
// The workshop owns the room, camera, lights, table and pointer routing;
// a station owns its objects (under `root`) and its DOM controls (`ui`).
import * as THREE from 'three';

export type StationId = 'squishy' | 'slime' | 'wax';

export interface WPointer {
  id: number;
  /** client pixels */
  x: number;
  y: number;
  /** normalized device coords (-1..1) */
  ndc: THREE.Vector2;
  /** ray from the camera through the pointer */
  ray: THREE.Ray;
  /** 0..1 (mouse = 0.5); touch force where available */
  pressure: number;
  type: string;
}

export interface StationContext {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  /** Table top height in world units (objects rest at y = tableY). */
  tableY: number;
  /** Raycast helper against any objects. */
  raycast(p: WPointer, objects: THREE.Object3D[], recursive?: boolean): THREE.Intersection[];
  /** Project a pointer ray onto a plane (e.g. a vertical plane facing the camera through a point). */
  rayToPlane(p: WPointer, plane: THREE.Plane): THREE.Vector3 | null;
  /** Plane facing the camera through `point` (for dragging things in screen space). */
  cameraPlane(point: THREE.Vector3): THREE.Plane;
}

export interface Station {
  readonly id: StationId;
  /** Everything this station renders; added to the workshop scene once. */
  readonly root: THREE.Group;
  /** DOM controls for this station; the workshop shows it while active. */
  readonly ui: HTMLDivElement;
  /** Called once with the context, before the first enter(). */
  init(ctx: StationContext): void;
  enter(): void;
  exit(): void;
  update(dt: number, t: number): void;
  pointerDown(p: WPointer): void;
  pointerMove(p: WPointer): void;
  pointerUp(p: WPointer): void;
  /** Instant reset (F1 and the station's own reset button). */
  reset(): void;
  debugInfo?(): Record<string, string | number>;
  /** Optional camera framing for this station (the workshop eases toward it). */
  view?(): { lookY: number; dist: number } | null;
}
