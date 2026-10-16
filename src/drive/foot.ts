// On-foot movement: a small capsule that walks, runs and jumps, climbs steps,
// wades through the shallows, SWIMS in deep water (and climbs back out onto a
// shore, pier or bridge end), and is pushed out of buildings and props.
//
// Water: the surface is WATER_Y plus the waves (heightfield.waveY). Where the
// water over the floor is shallower than tuning.drive.swimOn you wade (slower,
// splashy). Deeper, you swim: the body floats with the water line at the chest,
// strokes are slow with a little glide, Jump is a dolphin hop, and a deck or bank
// whose edge is within `swimReach` of the top of your head can be climbed.
import { tuning } from '../tuning';
import { BOUNDS, WATER_Y } from '../world/townLayout';
import { groundHeight, railedAt, waveY } from '../world/heightfield';
import { surfaceBelow } from '../world/buildSpace';   // v3 build
import { ColliderGrid, pushOut, res } from './physics';
import { clamp, lerpAngle } from './envUtils';

/** Top of a walker's head above their feet (used for the climb-out reach). */
const HEAD = 1.75;

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
  /** seconds — the scene sets this every frame so a swimmer rides the same waves as the water mesh */
  time = 0;
  /** floating in deep water (see tuning.drive.swimOn / swimOff) */
  swimming = false;
  /** smoothed 0..1 — how swimmy the body should look (for Character.setSwim) */
  swim01 = 0;
  /** water over the feet, in units (0 = dry) */
  wet = 0;
  /** set for one step when a Jump in the water started a dolphin hop */
  kicked = false;
  /** set for one step to the impact speed when the walker hit the water surface hard enough to splash */
  splash = 0;
  /** set for one step when the last-resort rescue put the walker back on dry ground (stuck in the water for seconds) */
  rescued = false;
  private dryX = 0;
  private dryZ = 0;
  private kickT = 0;
  private stuckT = 0;
  // ── v3 movement (W4) ── hooks for sprint / glide landings (drive/movement.ts)
  /** multiplies the walking / running speed (sprint sets it a little above 1) */
  speedMul = 1;
  /** true while sliding / sliding-jumping: the velocity is NOT pulled toward the stick (movement.ts / slide.ts own it) */
  coast = false;
  /** the real horizontal velocity (after the walls had their say) */
  get velX(): number {
    return this.vx;
  }
  get velZ(): number {
    return this.vz;
  }
  /** carry momentum into the walk (a glide landing, a mantle) */
  setVelocity(vx: number, vz: number): void {
    this.vx = vx;
    this.vz = vz;
    this.speed = Math.hypot(vx, vz);
  }

  /** `y`: where the feet should land if it is on a player-built floor / ramp (stepping out of a ride parked on a deck). */
  reset(x: number, z: number, heading: number, y?: number): void {
    const d = tuning.drive;
    this.x = x;
    this.z = z;
    const g = y === undefined ? groundHeight(x, z, true) : Math.max(groundHeight(x, z, true), surfaceBelow(x, z, y + 0.3));
    const bed = groundHeight(x, z, true, true);
    // a spot in deep water (not on a deck over it) starts you swimming
    this.swimming = g - bed < 0.3 && WATER_Y - g > d.swimOn;
    this.y = this.swimming ? Math.max(WATER_Y - d.swimChest, g) : g;
    this.vy = 0;
    this.heading = heading;
    this.speed = this.vx = this.vz = 0;
    this.grounded = true;
    this.swim01 = this.swimming ? 1 : 0;
    this.wet = clamp(WATER_Y - this.y, 0, 3);
    this.kickT = this.stuckT = 0;
    if (!this.swimming && this.wet <= 0.02) {
      this.dryX = x;
      this.dryZ = z;
    }
  }

  /** 0 idle … ~0.5 walk … 1 run (what Character.setMove wants) */
  get move01(): number {
    return clamp(this.speed / tuning.drive.runSpeed, 0, 1);
  }

  /** Stroke speed 0..1 while swimming (for Character.setMove) */
  get stroke01(): number {
    return clamp(this.speed / tuning.drive.swimRun, 0, 1);
  }

  /**
   * What a walker stands on at (x, z). A bridge or pier deck far above your head is passed UNDER
   * (the bank, the seabed); a deck within reach is something to climb onto.
   */
  private floor(x: number, z: number): number {
    // ── v3 build ── a floor / ramp / roof the player built counts as ground you can step onto (one above your head is passed under)
    const g = Math.max(groundHeight(x, z, true), surfaceBelow(x, z, this.y));
    if (g - this.y > HEAD + tuning.drive.swimReach) {
      const bed = groundHeight(x, z, true, true);
      if (bed < g) return bed;
    }
    return g;
  }

  private blocked(nx: number, nz: number): boolean {
    const d = tuning.drive;
    // probe at the body's leading edge, not its centre, so the capsule stops AT a wall
    // or ramp skirt instead of half inside it
    const mx = nx - this.x, mz = nz - this.z;
    const ml = Math.hypot(mx, mz) || 1;
    const lead = d.footRadius * 0.8;
    const px = nx + (mx / ml) * lead, pz = nz + (mz / ml) * lead;
    const g = Math.max(this.floor(nx, nz), this.floor(px, pz));
    // a swimmer reaches up onto a deck / bank; a walker climbs a step
    const reach = this.swimming ? HEAD + d.swimReach : d.stepUp;
    if (g - this.y > reach) return true;
    if (this.grounded && !this.swimming) {
      // the railings on stairs and the roof terrace hold (jumping over them is fine)
      if (railedAt(this.x, this.z) && this.y - groundHeight(px, pz, true) > d.footLedge) return true;
    }
    return Math.abs(nx) > BOUNDS - 1 || Math.abs(nz) > BOUNDS - 1;
  }

  /**
   * dirX/dirZ: desired world-space direction (unit, or zero), mag 0..1 stick
   * push, run: running (stick fully pushed or Shift), jump: jump pressed.
   */
  step(dt: number, dirX: number, dirZ: number, mag: number, run: boolean, jump: boolean, grid: ColliderGrid): void {
    const d = tuning.drive;
    const W = WATER_Y;
    this.jumped = false;
    this.landed = 0;
    this.rescued = false;
    this.kicked = false;
    this.splash = 0;

    // ── how fast do we want to go? (wading drags, swimming is slower with a glide) ──
    const feetDepth = clamp(W - this.y, 0, d.swimOn);
    let top: number;
    let accel: number;
    if (this.swimming) {
      top = mag <= 0.01 ? 0 : (run ? d.swimRun : d.swimSpeed) * clamp(mag / d.runStick, 0.4, 1);
      accel = (mag > 0.01 ? d.swimAccel : d.swimGlide) * dt;
    } else {
      top = mag <= 0.01 ? 0 : run ? d.runSpeed : d.walkSpeed * clamp(mag / d.runStick, 0.35, 1);
      top *= 1 - (1 - d.wadeSpeed) * (feetDepth / d.swimOn);
      top *= this.speedMul; // v3 movement: sprint
      accel = d.footAccel * dt * 0.35;
    }
    const tvx = dirX * top, tvz = dirZ * top;
    const k = this.coast && !this.swimming ? 0 : 1 - Math.exp(-accel); // v3 movement: a slide keeps its momentum
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
        if (c.h !== undefined) {
          if (this.y > c.h - 0.4) continue; // standing on the roof
          // railings on a bridge or pier deck far above your head are not in your way (swim under them)
          if (c.y0 !== undefined && c.y0 > this.y + HEAD) continue;
          // a swimmer climbs over low railings instead of bumping into them
          if (this.swimming && c.h <= W + HEAD + d.swimReach) continue;
        }
        if (!pushOut(c, this.x, this.z, r)) continue;
        this.x += res.nx * res.pen;
        this.z += res.nz * res.pen;
      }
    }

    // ── vertical: stand, jump, fall, float ──
    const gy = this.floor(this.x, this.z);
    const over = W - gy; // water over the floor here (negative = dry)
    if (this.swimming) {
      if (over < d.swimOff) this.swimming = false;
    } else if (over > d.swimOn && this.y <= W + 0.05) this.swimming = true;
    const prevY = this.y;

    if (this.swimming) {
      this.kickT -= dt;
      const surf = waveY(this.x, this.z, this.time);
      const tgt = Math.max(surf - d.swimChest, gy);
      if (jump && this.kickT <= 0 && this.y <= tgt + 0.3 && this.vy <= 0.2) {
        // a dolphin hop
        this.vy = d.swimKick;
        this.kickT = d.swimKickEvery;
        this.kicked = true;
        this.grounded = false;
      }
      if (this.vy > 0.2 || this.y > W - 0.05) {
        // free flight: a hop, or just dropped in
        this.vy -= d.footGravity * 0.6 * dt;
        this.y += this.vy * dt;
        if (prevY > W && this.y <= W && this.vy < 0) {
          if (-this.vy > 2) this.splash = -this.vy;
          this.vy = -0.4;
        }
        this.grounded = false;
      } else {
        // floating: ride the waves with the chest at the water line (or stand on the floor in the shallows;
        // a deck or bank within reach hauls you up smoothly)
        this.y += (tgt - this.y) * (1 - Math.exp(-9 * dt));
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      if (jump && this.grounded) {
        this.vy = d.jumpSpeed * (1 - 0.3 * (feetDepth / d.swimOn));
        this.grounded = false;
        this.jumped = true;
      }
      if (this.grounded) {
        if (gy < this.y - 0.4) {
          this.grounded = false;
          this.vy = 0;
        } else if (gy - this.y > d.stepUp) {
          this.y += (gy - this.y) * (1 - Math.exp(-14 * dt)); // pulling yourself up out of the water
        } else this.y = gy;
      }
      if (!this.grounded) {
        this.vy -= d.footGravity * dt;
        this.y += this.vy * dt;
        if (prevY > W && this.y <= W && this.vy < 0) {
          // hit the water
          if (-this.vy > 2) this.splash = -this.vy;
          if (over > d.swimOn) {
            this.swimming = true;
            this.vy = -0.4;
          }
        }
        if (!this.swimming && this.y <= gy && this.vy <= 0) {
          this.landed = -this.vy;
          this.y = gy;
          this.vy = 0;
          this.grounded = true;
        }
      }
    }

    this.swim01 += ((this.swimming ? 1 : 0) - this.swim01) * (1 - Math.exp(-7 * dt));
    this.wet = clamp(W - this.y, 0, 3);

    // remember the last dry footing; and a last-resort rescue if you push around in the water for seconds going nowhere
    if (this.wet <= 0.02 && this.grounded && !this.swimming && gy >= W + 0.05) {
      this.dryX = this.x;
      this.dryZ = this.z;
    }
    if (this.wet > 0.2 && mag > 0.3 && this.speed < 0.35) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > d.stuckSeconds) {
      const h = this.heading;
      this.reset(this.dryX, this.dryZ, h);
      this.rescued = true;
    }
  }
}
