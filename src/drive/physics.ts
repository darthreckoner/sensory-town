// Arcade car physics: forgiving, no damage, soft bounces. The car is a
// capsule (two circles) that is pushed out of colliders and the map edge.
//
// World: +x east, +z south. heading 0 = facing -z (north), π/2 = east.
import { tuning } from '../tuning';
import { BOUNDS } from '../world/townLayout';
import type { Collider } from '../world/townEnv';
import { clamp } from './envUtils';

export interface CarInput {
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** 0..1 */
  gas: number;
  /** 0..1 — brakes while rolling forward, then reverses */
  brake: number;
  /** Brake only, never reverses (Space). */
  handbrake: boolean;
}

export const NO_INPUT: CarInput = { steer: 0, gas: 0, brake: 0, handbrake: false };

export class CarPhysics {
  x = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  /** Smoothed steering, -1..1 (also drives the wheels). */
  steer = 0;
  /** Signed speed along the heading. */
  fwdSpeed = 0;
  /** Smoothed longitudinal acceleration (for squash / pitch). */
  accel = 0;
  /** Current yaw rate, rad / s. */
  yawRate = 0;
  /** Smoothed gas 0..1 for the engine sound. */
  throttle = 0;
  /** Strongest hit during the last step (units / s into a wall), 0 = none. */
  impact = 0;
  impactX = 0;
  impactZ = 0;

  reset(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = this.vz = 0;
    this.steer = this.fwdSpeed = this.accel = this.yawRate = this.throttle = 0;
    this.impact = 0;
  }

  get speed01(): number {
    return clamp(Math.abs(this.fwdSpeed) / tuning.drive.topSpeed, 0, 1);
  }

  /** Advance one step. Returns the strongest impact speed of this step (0 if none). */
  step(dt: number, inp: CarInput, colliders: readonly Collider[]): number {
    const d = tuning.drive;
    this.steer += (inp.steer - this.steer) * (1 - Math.exp(-d.steerResponse * dt));
    this.throttle += (inp.gas - this.throttle) * (1 - Math.exp(-8 * dt));

    // Split velocity into forward / sideways parts.
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const fx = sh, fz = -ch;     // forward
    const rx = ch, rz = sh;      // right
    let fs = this.vx * fx + this.vz * fz;
    let ls = this.vx * rx + this.vz * rz;
    const prevFs = fs;

    // ── engine / brakes / drag ──
    if (inp.brake > 0.01 || inp.handbrake) {
      if (fs > 0.4) {
        fs = Math.max(0, fs - d.brakeForce * (inp.handbrake ? 1 : Math.max(0.4, inp.brake)) * dt);
      } else if (!inp.handbrake) {
        // Stopped (or rolling back): reverse gently.
        if (fs > -d.reverseSpeed * inp.brake) fs = Math.max(-d.reverseSpeed, fs - d.acceleration * 0.8 * inp.brake * dt);
      } else fs *= Math.exp(-6 * dt);
    } else if (inp.gas > 0.01) {
      const target = d.topSpeed * inp.gas;
      if (fs < target) {
        const boost = fs < -0.5 ? 2.4 : 1;                 // quick turn-around when rolling backwards
        fs = Math.min(target, fs + d.acceleration * inp.gas * boost * dt);
      } else fs = Math.max(target, fs - d.coastDrag * dt);   // ease off if the stick was lifted a bit
    } else if (fs !== 0) {
      const drag = (d.coastDrag + 0.04 * Math.abs(fs) * Math.abs(fs) / d.topSpeed) * dt;
      fs = Math.abs(fs) <= drag ? 0 : fs - Math.sign(fs) * drag;
    }
    if (fs > d.topSpeed) fs = Math.max(d.topSpeed, fs - 14 * dt);
    if (fs < -d.reverseSpeed) fs = Math.min(-d.reverseSpeed, fs + 14 * dt);

    // Sideways grip (lower while the handbrake is held, so Space makes a little slide).
    ls *= Math.exp(-d.grip * (inp.handbrake ? 0.45 : 1) * dt);
    this.vx = fx * fs + rx * ls;
    this.vz = fz * fs + rz * ls;

    // ── steering ──
    const sp = Math.abs(fs);
    const authority = clamp(sp / d.turnSpeedFull, d.turnMinAuthority, 1);
    const loss = 1 - d.turnSpeedLoss * clamp(sp / d.topSpeed, 0, 1);
    const dir = fs < -0.3 ? -1 : 1; // reverse steers like a real car
    this.yawRate = this.steer * d.turnRate * authority * loss * dir;
    this.heading += this.yawRate * dt;

    // ── move + collide ──
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.impact = 0;
    this.collide(colliders);

    // Outputs.
    const nfx = Math.sin(this.heading), nfz = -Math.cos(this.heading);
    this.fwdSpeed = this.vx * nfx + this.vz * nfz;
    this.accel += ((this.fwdSpeed - prevFs) / Math.max(dt, 1e-4) - this.accel) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.fwdSpeed) < 0.04 && inp.gas < 0.01 && inp.brake < 0.01) {
      this.vx = this.vz = 0;
      this.fwdSpeed = 0;
    }
    return this.impact;
  }

  // ── collisions ──────────────────────────────────────────────────────────
  private collide(cols: readonly Collider[]): void {
    const d = tuning.drive;
    const r = d.carRadius;
    for (let iter = 0; iter < 2; iter++) {
      const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
      for (let k = 0; k < 2; k++) {
        const off = (k === 0 ? 1 : -1) * d.carCircleOffset;
        let cx = this.x + fx * off, cz = this.z + fz * off;
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          let nx = 0, nz = 1, pen = 0;
          if (c.kind === 'circle') {
            const dx = cx - c.x, dz = cz - c.z;
            const min = r + c.r;
            const d2 = dx * dx + dz * dz;
            if (d2 >= min * min) continue;
            const dist = Math.sqrt(d2);
            if (dist > 1e-5) {
              nx = dx / dist;
              nz = dz / dist;
            }
            pen = min - dist;
          } else {
            const px = clamp(cx, c.x - c.hw, c.x + c.hw);
            const pz = clamp(cz, c.z - c.hd, c.z + c.hd);
            const dx = cx - px, dz = cz - pz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-8) {
              const dist = Math.sqrt(d2);
              nx = dx / dist;
              nz = dz / dist;
              pen = r - dist;
            } else {
              // Centre is inside the box: leave along the shallowest axis.
              const ox = c.hw - Math.abs(cx - c.x), oz = c.hd - Math.abs(cz - c.z);
              if (ox < oz) {
                nx = cx >= c.x ? 1 : -1;
                nz = 0;
                pen = ox + r;
              } else {
                nx = 0;
                nz = cz >= c.z ? 1 : -1;
                pen = oz + r;
              }
            }
          }
          pen = this.respond(nx, nz, pen, cx, cz, r);
          cx += nx * pen;
          cz += nz * pen;
        }
        // Soft wall at the edge of the map.
        const lim = BOUNDS - r;
        if (cx > lim) cx -= this.respond(-1, 0, cx - lim, cx, cz, r);
        else if (cx < -lim) cx += this.respond(1, 0, -lim - cx, cx, cz, r);
        if (cz > lim) cz -= this.respond(0, -1, cz - lim, cx, cz, r);
        else if (cz < -lim) cz += this.respond(0, 1, -lim - cz, cx, cz, r);
      }
    }
    this.x = clamp(this.x, -BOUNDS, BOUNDS);
    this.z = clamp(this.z, -BOUNDS, BOUNDS);
  }

  /** Push the car out along (nx, nz) by `pen` and bounce the velocity off the surface. */
  private respond(nx: number, nz: number, pen: number, cx: number, cz: number, r: number): number {
    const d = tuning.drive;
    pen = Math.min(pen, 2.5);
    this.x += nx * pen;
    this.z += nz * pen;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      const impact = -vn;
      const e = impact > d.collideMinSpeed ? d.bounceRestitution : 0;
      this.vx -= (1 + e) * vn * nx;
      this.vz -= (1 + e) * vn * nz;
      if (impact > this.impact) {
        this.impact = impact;
        this.impactX = cx - nx * r;
        this.impactZ = cz - nz * r;
      }
    }
    return pen;
  }
}
