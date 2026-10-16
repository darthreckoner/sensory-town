// On-foot movement: a small capsule that walks, runs and jumps, climbs steps,
// stops at the shoreline, and is pushed out of buildings and props.
import { tuning } from '../tuning';
import { BOUNDS } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import { ColliderGrid, pushOut, res } from './physics';
import { clamp, lerpAngle } from './envUtils';

export class FootPhysics {
  x = 0;
  z = 0;
  y = 0;
  vy = 0;
  heading = 0;
  /** horizontal speed */
  speed = 0;
  private vx = 0;
  private vz = 0;
  grounded = true;
  /** set for one step when a jump starts / a landing happens */
  jumped = false;
  landed = 0;

  reset(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.y = groundHeight(x, z, true);
    this.vy = 0;
    this.heading = heading;
    this.speed = this.vx = this.vz = 0;
    this.grounded = true;
  }

  /** 0 idle … ~0.5 walk … 1 run (what Character.setMove wants) */
  get move01(): number {
    return clamp(this.speed / tuning.drive.runSpeed, 0, 1);
  }

  private blocked(nx: number, nz: number): boolean {
    const d = tuning.drive;
    const g = groundHeight(nx, nz, true);
    if (g - this.y > d.stepUp) return true;
    if (g < d.waterWade && this.grounded) return true;
    return Math.abs(nx) > BOUNDS - 1 || Math.abs(nz) > BOUNDS - 1;
  }

  /**
   * dirX/dirZ: desired world-space direction (unit, or zero), mag 0..1 stick
   * push, run: running (stick fully pushed or Shift), jump: jump pressed.
   */
  step(dt: number, dirX: number, dirZ: number, mag: number, run: boolean, jump: boolean, grid: ColliderGrid): void {
    const d = tuning.drive;
    this.jumped = false;
    this.landed = 0;
    // target velocity
    const top = mag <= 0.01 ? 0 : run ? d.runSpeed : d.walkSpeed * clamp(mag / d.runStick, 0.35, 1);
    const tvx = dirX * top, tvz = dirZ * top;
    const k = 1 - Math.exp(-d.footAccel * dt * 0.35);
    this.vx += (tvx - this.vx) * k;
    this.vz += (tvz - this.vz) * k;
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.4) {
      const want = Math.atan2(this.vx, -this.vz);
      this.heading = lerpAngle(this.heading, want, 1 - Math.exp(-14 * dt));
    }
    // move (slide along walls / steep ground by trying each axis)
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (!this.blocked(nx, nz)) {
      this.x = nx;
      this.z = nz;
    } else if (!this.blocked(nx, this.z)) {
      this.x = nx;
      this.vz *= 0.2;
    } else if (!this.blocked(this.x, nz)) {
      this.z = nz;
      this.vx *= 0.2;
    } else {
      this.vx *= 0.1;
      this.vz *= 0.1;
    }
    // props, buildings
    const r = d.footRadius;
    for (let it = 0; it < 2; it++) {
      const cols = grid.near(this.x, this.z, r + 2);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.only === 'car') continue;
        if (c.h !== undefined && this.y > c.h - 0.4) continue; // standing on the roof
        if (!pushOut(c, this.x, this.z, r)) continue;
        this.x += res.nx * res.pen;
        this.z += res.nz * res.pen;
      }
    }
    // vertical
    const gy = groundHeight(this.x, this.z, true);
    if (jump && this.grounded) {
      this.vy = d.jumpSpeed;
      this.grounded = false;
      this.jumped = true;
    }
    if (this.grounded) {
      if (gy < this.y - 0.4) {
        this.grounded = false;
        this.vy = 0;
      } else this.y = gy;
    }
    if (!this.grounded) {
      this.vy -= d.footGravity * dt;
      this.y += this.vy * dt;
      if (this.y <= gy && this.vy <= 0) {
        this.landed = -this.vy;
        this.y = gy;
        this.vy = 0;
        this.grounded = true;
      }
    }
  }
}
