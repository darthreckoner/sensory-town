// ── v3 movement (W4) ── The Fortnite-style over-the-shoulder camera for the walker.
//
// A true orbit: the lens sits `camArm` metres behind a pivot at the walker's shoulders, nudged to the RIGHT
// (over the right shoulder, so the character reads slightly left of centre), and the view is aimed at the
// pivot's right-hand side. Yaw + pitch come from the drag-look (kept by DriveScene as camYaw / camPitch).
//
// Feel: the pivot follows the walker with a tight spring (snappy, no floaty lag), the lens position itself is not
// smoothed, so dragging the view answers instantly. Occlusion is the town's own (freeFraction + keepOutOfBoxes,
// passed in by DriveScene): when a wall is in the way the lens slides in toward the walker and rises over it.
// The same rig frames the skydive / glider (a longer arm) and the party-bus ride (a long arm around the bus).
import * as THREE from 'three';
import { tuning } from '../tuning';
import { groundHeight } from '../world/heightfield';
import { buildSpace } from '../world/buildSpace';
import { WATER_Y } from '../world/townLayout';
import { clamp } from './envUtils';

export interface FootCamHost {
  camera: THREE.PerspectiveCamera;
  /** the scene's shared lens position (DriveScene.camPos): this rig writes it, keepOutOfBoxes() adjusts it */
  camPos: THREE.Vector3;
  freeFraction(ax: number, az: number, bx: number, bz: number, yLevel: number): number;
  keepOutOfBoxes(): void;
}

/** What the rig frames this frame. */
export interface FootCamSubject {
  /** the walker's feet */
  x: number;
  y: number;
  z: number;
  swim01: number;
  yaw: number;
  pitch: number;
  /** arm length multiplier (1 on foot) */
  arm: number;
  /** shoulder offset multiplier (1 on foot) */
  shoulder: number;
  /** pivot-height multiplier (1 on foot) */
  pivot: number;
  /** extra FOV in degrees (sprint, glide...) */
  fov: number;
  /** false in the air / on the bus: nothing to bump into, skip the occlusion rays */
  occlude: boolean;
  /** flying: the pivot follows the walker up and down much faster (a launch pad shoots at 33 m/s) */
  air?: boolean;
}

export class FootCam {
  /** where the view is aimed this frame (DriveScene re-aims here after its sight-line lift) */
  readonly look = new THREE.Vector3();
  private px = 0;
  private pz = 0;
  private baseY = 0;
  private occl = 1;
  private armS = 1;
  private shS = 1;
  private pivS = 1;
  private fov = 0;
  private kickV = 0;
  private settle = 0;
  private fresh = true;

  constructor(private readonly h: FootCamHost) {}

  /** Extra FOV, in degrees, to add to the scene's base FOV this frame. */
  get fovExtra(): number {
    return this.fov;
  }

  /** A quick FOV punch (launch pad, bus jump) that eases back out. */
  kick(deg: number): void {
    this.kickV = Math.max(this.kickV, deg);
  }

  /** The walker just appeared (hopped out of the car): start from the walker, and let the lens fly in. */
  reset(settleSeconds = 0.7): void {
    this.fresh = true;
    this.settle = settleSeconds;
    this.kickV = 0;
  }

  place(dt: number, snap: boolean, s: FootCamSubject): void {
    const m = tuning.movement3;
    const ref = s.y + s.swim01 * (WATER_Y - 0.1 - s.y);
    if (snap || this.fresh) {
      this.px = s.x;
      this.pz = s.z;
      this.baseY = ref;
      this.armS = s.arm;
      this.shS = s.shoulder;
      this.pivS = s.pivot;
      this.fov = s.fov;
      this.fresh = false;
    } else {
      const kh = 1 - Math.exp(-m.camFollow * dt);
      const kv = 1 - Math.exp(-(s.air ? m.camRiseAir : m.camRise) * dt);
      const ks = 1 - Math.exp(-5 * dt);
      this.px += (s.x - this.px) * kh;
      this.pz += (s.z - this.pz) * kh;
      this.baseY += (ref - this.baseY) * kv;
      this.armS += (s.arm - this.armS) * ks;
      this.shS += (s.shoulder - this.shS) * ks;
      this.pivS += (s.pivot - this.pivS) * ks;
    }
    // FOV: a target for the state plus a decaying punch
    this.kickV *= Math.exp(-m.fovKickDecay * dt);
    const fovT = s.fov + this.kickV;
    this.fov += (fovT - this.fov) * (snap ? 1 : 1 - Math.exp(-m.fovRate * dt));

    const pitch = clamp(s.pitch, m.camPitchMin, m.camPitchMax);
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const fx = sy, fz = -cy; // view direction on the ground
    const rx = cy, rz = sy; // to the walker's right
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const arm = m.camArm * this.armS;
    const sh = m.camShoulder * this.shS;
    const pivotY = this.baseY + m.camPivotY * this.pivS;
    // the ideal lens spot: behind, a little to the right, up by the pitch
    const ix = this.px + rx * sh - fx * arm * cp;
    const iz = this.pz + rz * sh - fz * arm * cp;
    const iy = pivotY + arm * sp;

    // something in the way? come in toward the walker (fast), ease back out (slowly)
    const free = s.occlude ? this.h.freeFraction(s.x, s.z, ix, iz, iy) : 1;
    const target = Math.max(0.28, free);
    if (snap) this.occl = target;
    else if (target < this.occl) this.occl += (target - this.occl) * (1 - Math.exp(-m.camOccIn * dt));
    else this.occl += (target - this.occl) * (1 - Math.exp(-m.camOccOut * dt));
    const fr = this.occl;
    const wx = s.x + (ix - s.x) * fr;
    const wz = s.z + (iz - s.z) * fr;
    // squeezed in (a corridor, a doorway): come in close and rise above it, looking down
    let wy = iy + (1 - fr) * 4.2;
    // ...but never up through a built ceiling (the roof or the next storey's floor over a room the walker is standing in)
    if (s.occlude && fr < 1) {
      let ceil = Infinity;
      for (const t of buildSpace.surfacesAt(s.x, s.z)) if (t > s.y + 2.1 && t < ceil) ceil = t;
      if (ceil < Infinity) wy = Math.min(wy, ceil - 0.45);
    }

    const cam = this.h.camPos;
    if (snap || this.settle <= 0) cam.set(wx, wy, wz);
    else {
      this.settle -= dt;
      cam.x += (wx - cam.x) * (1 - Math.exp(-m.camSettle * dt));
      cam.y += (wy - cam.y) * (1 - Math.exp(-m.camSettle * dt));
      cam.z += (wz - cam.z) * (1 - Math.exp(-m.camSettle * dt));
    }
    if (s.occlude) this.h.keepOutOfBoxes();
    // never inside the ground (before aiming, so the view stays pointed at the walker)
    const gy = groundHeight(cam.x, cam.z, true);
    if (cam.y < gy + 1.4) cam.y = gy + 1.4;

    this.look.set(this.px + rx * sh * fr, pivotY - 0.15, this.pz + rz * sh * fr);
    this.h.camera.position.copy(cam);
    this.h.camera.lookAt(this.look);
  }
}
