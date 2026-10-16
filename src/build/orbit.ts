// Smooth orbit camera for the Build scene. The input code feeds it deltas; it
// keeps a "goal" pose and eases toward it, so gliding to a house and finger
// control use the same machinery. Never lets the camera dip below the ground.
import * as THREE from 'three';
import { tuning } from '../tuning';

export interface Bounds { x0: number; x1: number; z0: number; z1: number }

export class OrbitCam {
  readonly target = new THREE.Vector3();
  yaw = 0;
  pitch = 0.9;
  dist = 40;
  readonly goalTarget = new THREE.Vector3();
  goalYaw = 0;
  goalPitch = 0.9;
  goalDist = 40;
  minDist = 8;
  maxDist = 70;
  bounds: Bounds = { x0: -50, x1: 50, z0: -50, z1: 50 };
  private glide = 0;

  constructor(private cam: THREE.PerspectiveCamera) {}

  setLimits(minDist: number, maxDist: number, bounds: Bounds): void {
    this.minDist = minDist;
    this.maxDist = maxDist;
    this.bounds = bounds;
    this.clampGoals();
  }

  /** Jump straight to a pose. */
  snapTo(target: THREE.Vector3, dist: number, yaw = this.goalYaw, pitch = this.goalPitch): void {
    this.goalTarget.copy(target);
    this.goalDist = dist;
    this.goalYaw = yaw;
    this.goalPitch = pitch;
    this.clampGoals();
    this.target.copy(this.goalTarget);
    this.dist = this.goalDist;
    this.yaw = this.goalYaw;
    this.pitch = this.goalPitch;
    this.apply();
  }

  /** Glide to a pose (yaw/pitch optional). */
  flyTo(target: THREE.Vector3, dist: number, yaw?: number, pitch?: number): void {
    this.goalTarget.copy(target);
    this.goalDist = dist;
    if (yaw !== undefined) this.goalYaw = yaw + Math.PI * 2 * Math.round((this.yaw - yaw) / (Math.PI * 2));
    if (pitch !== undefined) this.goalPitch = pitch;
    this.clampGoals();
    this.glide = 1.4;
  }

  orbit(dxPx: number, dyPx: number): void {
    this.goalYaw -= dxPx * tuning.build.orbitRotateSpeed;
    this.goalPitch += dyPx * tuning.build.orbitRotateSpeed;
    this.clampGoals();
  }

  rotateYaw(delta: number): void {
    this.goalYaw += delta;
  }

  /** Multiply the distance (factor > 1 zooms out). */
  zoomBy(factor: number): void {
    this.goalDist *= factor;
    this.clampGoals();
  }

  /** Drag the world with the finger (px deltas). */
  panPx(dxPx: number, dyPx: number, viewH: number): void {
    const wpp = (2 * this.goalDist * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2))) / Math.max(1, viewH);
    const sy = Math.sin(this.goalYaw), cy = Math.cos(this.goalYaw);
    const sp = Math.max(0.45, Math.sin(this.goalPitch));
    // right = (cos, 0, -sin); forward (away from camera) = (-sin, 0, -cos)
    this.goalTarget.x += -dxPx * wpp * cy + dyPx * wpp * (-sy) / sp;
    this.goalTarget.z += dxPx * wpp * sy + dyPx * wpp * (-cy) / sp;
    this.clampGoals();
    this.glide = 0;
  }

  private clampGoals(): void {
    const b = tuning.build;
    this.goalPitch = THREE.MathUtils.clamp(this.goalPitch, b.pitchMin, b.pitchMax);
    this.goalDist = THREE.MathUtils.clamp(this.goalDist, this.minDist, this.maxDist);
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x, this.bounds.x0, this.bounds.x1);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z, this.bounds.z0, this.bounds.z1);
    this.goalTarget.y = Math.max(0, this.goalTarget.y);
  }

  update(dt: number): void {
    const rate = this.glide > 0 ? tuning.build.glideRate : tuning.build.cameraRate;
    this.glide = Math.max(0, this.glide - dt);
    const k = 1 - Math.exp(-rate * dt);
    this.target.lerp(this.goalTarget, k);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    this.dist += (this.goalDist - this.dist) * k;
    this.apply();
  }

  private apply(): void {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      Math.max(0.8, this.target.y + sp * this.dist),
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.cam.lookAt(this.target);
  }
}
