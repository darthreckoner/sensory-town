// Arcade car physics, v2: forgiving, no damage, soft bounces. The car is a
// capsule (two circles) pushed out of colliders and the map edge, rides the real
// terrain (hills, ramps, bridges), gets airborne off ramps and crests, can
// drift and boost. No fail states.
//
// World: +x east, +z south, y up. heading 0 = facing -z (north), π/2 = east.
import { tuning } from '../tuning';
import { BOUNDS } from '../world/townLayout';
import { groundHeight, waveY } from '../world/heightfield';
import { isBuildCollider, surfaceBelow } from '../world/buildSpace';   // v3 rides: cars drive ON the player's builds
import { WATER_Y } from '../world/townLayout';
import type { VehicleKind } from '../core/model';
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
  /** The boost is firing this frame (the scene owns the meter). */
  boost: boolean;
  /** Hop (the hoverboard's Space / the hop button); rides with no hop ignore it. */
  hop?: boolean;
}

// ── v3 rides ──
/** The player's builds (W5, src/world/buildSpace.ts surfaceBelow): cars, hoverboards and carts drive ON floors, ramps and roofs. */
let surfaceHook: ((x: number, z: number, yRef: number) => number) | null = (x, z, yRef) => surfaceBelow(x, z, yRef);
export function setSurfaceBelow(fn: ((x: number, z: number, yRef: number) => number) | null): void {
  surfaceHook = fn;
}
/** The tuning a ride is driven with: tuning.drive overridden by tuning.rides.<kind>. */
export function rideTune(kind: VehicleKind): typeof tuning.drive {
  return Object.assign(Object.create(tuning.drive), (tuning.rides as Record<string, object>)[kind]) as typeof tuning.drive;
}

// ── a coarse spatial grid so 1000+ colliders stay cheap ─────────────────────
export class ColliderGrid {
  private cell = 14;
  private cells = new Map<number, Collider[]>();
  private stamp = new Map<Collider, number>();
  private tick = 0;
  readonly list: Collider[];

  constructor(list: Collider[]) {
    this.list = list;
    for (const c of list) {
      const [x0, z0, x1, z1] = c.kind === 'circle' ? [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r] : [c.x - c.hw, c.z - c.hd, c.x + c.hw, c.z + c.hd];
      const gx0 = Math.floor(x0 / this.cell), gx1 = Math.floor(x1 / this.cell);
      const gz0 = Math.floor(z0 / this.cell), gz1 = Math.floor(z1 / this.cell);
      for (let gz = gz0; gz <= gz1; gz++)
        for (let gx = gx0; gx <= gx1; gx++) {
          const k = gx * 4096 + gz;
          const arr = this.cells.get(k);
          if (arr) arr.push(c);
          else this.cells.set(k, [c]);
        }
    }
  }

  /** Movable colliders (parked rides): checked on every query, not part of the static grid. */
  private dyn: Collider[] = [];
  setDynamic(list: Collider[]): void {
    this.dyn = list;
  }
  private out: Collider[] = [];
  /** Colliders whose cells touch the square (x ± r, z ± r). The returned array is reused. */
  near(x: number, z: number, r: number): Collider[] {
    this.out.length = 0;
    for (const c of this.dyn) {
      const cr = c.kind === 'circle' ? c.r : Math.max(c.hw, c.hd);
      if (Math.abs(c.x - x) <= r + cr && Math.abs(c.z - z) <= r + cr) this.out.push(c);
    }
    this.tick++;
    const gx0 = Math.floor((x - r) / this.cell), gx1 = Math.floor((x + r) / this.cell);
    const gz0 = Math.floor((z - r) / this.cell), gz1 = Math.floor((z + r) / this.cell);
    for (let gz = gz0; gz <= gz1; gz++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const arr = this.cells.get(gx * 4096 + gz);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (this.stamp.get(c) === this.tick) continue;
          this.stamp.set(c, this.tick);
          this.out.push(c);
        }
      }
    return this.out;
  }

  // ── v3 build ── colliders that come and go while the game runs (the player's walls and ramps)
  private cellsOf(c: Collider): number[] {
    const [x0, z0, x1, z1] = c.kind === 'circle' ? [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r] : [c.x - c.hw, c.z - c.hd, c.x + c.hw, c.z + c.hd];
    const out: number[] = [];
    const gx1 = Math.floor(x1 / this.cell), gz1 = Math.floor(z1 / this.cell);
    for (let gz = Math.floor(z0 / this.cell); gz <= gz1; gz++) for (let gx = Math.floor(x0 / this.cell); gx <= gx1; gx++) out.push(gx * 4096 + gz);
    return out;
  }
  add(c: Collider): void {
    this.list.push(c);
    for (const k of this.cellsOf(c)) {
      const arr = this.cells.get(k);
      if (arr) arr.push(c);
      else this.cells.set(k, [c]);
    }
  }
  remove(c: Collider): void {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    for (const k of this.cellsOf(c)) {
      const arr = this.cells.get(k);
      if (!arr) continue;
      const j = arr.indexOf(c);
      if (j >= 0) arr.splice(j, 1);
      if (!arr.length) this.cells.delete(k);
    }
    this.stamp.delete(c);
  }
}

/** Push a circle (cx, cz, r) out of one collider. Returns false if they don't touch. Result in `res`. */
export const res = { nx: 0, nz: 1, pen: 0 };
export function pushOut(c: Collider, cx: number, cz: number, r: number): boolean {
  if (c.kind === 'circle') {
    const dx = cx - c.x, dz = cz - c.z;
    const min = r + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const dist = Math.sqrt(d2);
    if (dist > 1e-5) {
      res.nx = dx / dist;
      res.nz = dz / dist;
    } else {
      res.nx = 0;
      res.nz = 1;
    }
    res.pen = min - dist;
    return true;
  }
  const px = clamp(cx, c.x - c.hw, c.x + c.hw);
  const pz = clamp(cz, c.z - c.hd, c.z + c.hd);
  const dx = cx - px, dz = cz - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const dist = Math.sqrt(d2);
    res.nx = dx / dist;
    res.nz = dz / dist;
    res.pen = r - dist;
  } else {
    const ox = c.hw - Math.abs(cx - c.x), oz = c.hd - Math.abs(cz - c.z);
    if (ox < oz) {
      res.nx = cx >= c.x ? 1 : -1;
      res.nz = 0;
      res.pen = ox + r;
    } else {
      res.nx = 0;
      res.nz = cz >= c.z ? 1 : -1;
      res.pen = oz + r;
    }
  }
  return true;
}

export const NO_INPUT: CarInput = { steer: 0, gas: 0, brake: 0, handbrake: false, boost: false, hop: false };

export class CarPhysics {
  /** which ride this is (its handling comes from tuning.rides.<kind>) */
  kind: VehicleKind = 'sports';
  private tune: typeof tuning.drive = rideTune('sports');
  /** seconds (the scene sets it every frame): the boat rides the same waves as the water mesh */
  time = 0;
  private hopCool = 0;
  /** was the last frame spent on a player-built surface (floor / ramp / roof)? */
  private onBuild = false;
  x = 0;
  z = 0;
  y = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  /** vertical speed (units / s) — ground-following while grounded */
  vy = 0;
  grounded = true;
  /** Smoothed steering, -1..1 (also drives the wheels). */
  steer = 0;
  fwdSpeed = 0;
  /** sideways speed (slip) */
  latSpeed = 0;
  accel = 0;
  yawRate = 0;
  throttle = 0;
  drifting = false;
  boosting = false;
  /** seconds in the air this jump */
  airTime = 0;
  // per-step event outputs (reset at the start of step())
  impact = 0;
  impactX = 0;
  impactZ = 0;
  /** upward speed at takeoff when a jump just started (0 = none) */
  jumped = 0;
  /** downward speed at touchdown when it just landed (0 = none) */
  landed = 0;
  private driftHold = 0;
  private prevGround = 0;

  /** Switch to another ride's handling (call before reset). */
  setKind(kind: VehicleKind): void {
    this.kind = kind;
    this.tune = rideTune(kind);
  }
  get hover(): number {
    return this.tune.hover;
  }
  get waterOnly(): boolean {
    return !!this.tune.waterOnly;
  }

  /** The surface this ride sits on at (x, z): the ground (or a player build on it), the water for a boat, shallow water for a hoverboard. */
  surfaceAt(x: number, z: number, yRef: number): number {
    const d = this.tune;
    if (d.waterOnly) return waveY(x, z, this.time);
    let g = groundHeight(x, z);
    if (surfaceHook) {
      const sb = surfaceHook(x, z, yRef - d.hover + (d.hover > 0 ? 1 : 0)); // a hoverboard's cushion lags a steep rise: look a little higher
      if (sb > g) g = sb;
    }
    if (d.hover > 0 && g < WATER_Y) g = WATER_Y; // skims the shallows
    return g;
  }

  /** Park the ride at (x, z). `surfY`: the surface it stands on (so a ride left on a built floor stays on it); omitted: the ground, or a low built floor. */
  reset(x: number, z: number, heading: number, surfY?: number): void {
    this.x = x;
    this.z = z;
    this.hopCool = 0;
    this.y = this.surfaceAt(x, z, (surfY ?? groundHeight(x, z)) + 0.5 + this.tune.hover) + this.tune.hover;
    this.prevGround = this.y;
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
    this.steer = this.fwdSpeed = this.latSpeed = this.accel = this.yawRate = this.throttle = 0;
    this.drifting = false;
    this.boosting = false;
    this.airTime = 0;
    this.impact = this.jumped = this.landed = 0;
  }

  get speed01(): number {
    const d = this.tune;
    return clamp(Math.abs(this.fwdSpeed) / (d.topSpeed * (this.boosting ? d.boostSpeed : 1)), 0, 1);
  }

  /** Advance one step. Returns the strongest wall impact of this step (0 if none). */
  step(dt: number, inp: CarInput, grid: ColliderGrid): number {
    const d = this.tune;
    this.impact = 0;
    this.jumped = 0;
    this.landed = 0;
    const air = !this.grounded;
    this.steer += (inp.steer - this.steer) * (1 - Math.exp(-d.steerResponse * dt));
    this.throttle += (inp.gas - this.throttle) * (1 - Math.exp(-8 * dt));
    this.boosting = inp.boost && this.grounded;

    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const fx = sh, fz = -ch;
    const rx = ch, rz = sh;
    let fs = this.vx * fx + this.vz * fz;
    let ls = this.vx * rx + this.vz * rz;
    const prevFs = fs;
    const top = d.topSpeed * (this.boosting ? d.boostSpeed : 1);
    const acc = d.acceleration * (this.boosting ? d.boostAccel : 1);

    // ── drift state (brake or Space + steer at speed) ──
    const wantDrift = this.grounded && Math.abs(this.steer) > 0.3 && fs > d.driftMinSpeed && (inp.handbrake || inp.brake > 0.5);
    if (wantDrift) this.driftHold = 0.25;
    else this.driftHold -= dt;
    this.drifting = this.grounded && this.driftHold > 0 && fs > d.driftMinSpeed * 0.55;

    if (this.grounded) {
      // ── engine / brakes / drag ──
      const brakeOn = inp.brake > 0.01 || inp.handbrake;
      if (this.boosting) fs = Math.min(top, Math.max(fs, d.topSpeed * 0.7) + acc * dt);
      else if (brakeOn) {
        if (fs > 0.4) fs = Math.max(0, fs - d.brakeForce * (this.drifting ? d.driftBrake : 1) * (inp.handbrake ? 1 : Math.max(0.4, inp.brake)) * dt);
        else if (!inp.handbrake) {
          if (fs > -d.reverseSpeed * inp.brake) fs = Math.max(-d.reverseSpeed, fs - acc * 0.8 * inp.brake * dt);
        } else fs *= Math.exp(-6 * dt);
      } else if (inp.gas > 0.01) {
        const target = top * inp.gas;
        if (fs < target) fs = Math.min(target, fs + acc * inp.gas * (fs < -0.5 ? 2.4 : 1) * dt);
        else fs = Math.max(target, fs - d.coastDrag * dt);
      } else if (fs !== 0) {
        const drag = (d.coastDrag + 0.04 * fs * fs / d.topSpeed) * dt;
        fs = Math.abs(fs) <= drag ? 0 : fs - Math.sign(fs) * drag;
      }
      // hills slow you down uphill and push you downhill
      const gF = this.surfaceAt(this.x + fx * 1.8, this.z + fz * 1.8, this.y), gR = this.surfaceAt(this.x - fx * 1.8, this.z - fz * 1.8, this.y);
      const slope = clamp((gF - gR) / 3.6, -0.9, 0.9);
      fs -= slope * d.slopeGravity * dt * (this.boosting ? 0.4 : 1);
      if (fs > top) fs = Math.max(top, fs - 14 * dt);
      if (fs < -d.reverseSpeed) fs = Math.min(-d.reverseSpeed, fs + 14 * dt);
      // sideways grip (very loose while drifting)
      ls *= Math.exp(-d.grip * (this.drifting ? d.driftGrip : 1) * dt);
      this.vx = fx * fs + rx * ls;
      this.vz = fz * fs + rz * ls;
    }

    // ── steering ──
    const sp = Math.abs(fs);
    const authority = clamp(sp / d.turnSpeedFull, d.turnMinAuthority, 1);
    const loss = 1 - d.turnSpeedLoss * clamp(sp / d.topSpeed, 0, 1);
    const dir = fs < -0.3 ? -1 : 1;
    this.yawRate = this.steer * d.turnRate * authority * loss * dir * (this.drifting ? d.driftYaw : 1) * (air ? d.airSteer : 1);
    this.heading += this.yawRate * dt;

    // ── move horizontally, collide ──
    const px = this.x, pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collide(grid);

    // ── vertical: ride the ground, ride the waves, hop, or fly ──
    this.hopCool -= dt;
    if (d.waterOnly) {
      // a boat floats: it bobs on the same waves as the water mesh and never leaves it
      this.y += (this.surfaceAt(this.x, this.z, this.y) - this.y) * (1 - Math.exp(-10 * dt));
      this.vy = 0;
      this.grounded = true;
      this.prevGround = this.y;
      return this.finishStep(dt, inp, prevFs);
    }
    const gy = this.surfaceAt(this.x, this.z, this.y) + d.hover;
    if (inp.hop && d.hopSpeed > 0 && this.grounded && this.hopCool <= 0) {
      // the hoverboard's hop
      this.vy = d.hopSpeed;
      this.grounded = false;
      this.hopCool = 0.35;
      this.jumped = d.hopSpeed;
      this.airTime = 0;
    }
    if (this.grounded) {
      if (gy - this.y > d.climbLimit) {
        // a wall (the back of a ramp, a cliff): bounce off it
        const sp2 = Math.hypot(this.vx, this.vz);
        this.x = px;
        this.z = pz;
        this.vx *= -0.3;
        this.vz *= -0.3;
        if (sp2 > this.impact) {
          this.impact = sp2;
          this.impactX = px + fx;
          this.impactZ = pz + fz;
        }
      } else {
        const ball = this.y + this.vy * dt - 0.5 * d.gravity * dt * dt; // where a free-flying car would be
        if (this.vy > d.launchMinVy * 0.5 && gy < ball - 0.02) {
          // the ground fell away faster than gravity: take off (off a player-built ramp the kick is capped: a steep ramp is a hop, not a rocket)
          const up = this.onBuild ? Math.min(this.vy, d.launchMaxVy) : this.vy;
          this.grounded = false;
          this.vy = up - d.gravity * dt;
          this.y = this.y + up * dt - 0.5 * d.gravity * dt * dt;
          this.airTime = 0;
          if (up >= d.launchMinVy) this.jumped = up;
        } else if (gy < this.y - 0.45) {
          // a sudden drop (kerb, ledge): fall
          this.grounded = false;
          this.vy = Math.min(0, this.vy);
          this.airTime = 0;
        } else {
          // a hoverboard glides over the ground on a cushion of air; a car sits right on it
          const yPrev = this.y;
          this.y = d.hover > 0 ? this.y + (gy - this.y) * (1 - Math.exp(-18 * dt)) : gy;
          this.vy = clamp((this.y - yPrev) / dt, -30, 30) * 0.5 + this.vy * 0.5;
        }
      }
    }
    else {
      this.airTime += dt;
      this.vy -= d.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        // touchdown
        this.landed = this.vy < -d.landMinVy ? -this.vy : 0;
        this.y = gy;
        this.grounded = true;
        this.vy = 0;
        // landing bleeds a little speed
        const k = this.landed > 0 ? clamp(1 - this.landed * 0.012, 0.8, 1) : 1;
        this.vx *= k;
        this.vz *= k;
      }
    }
    this.onBuild = gy - d.hover > groundHeight(this.x, this.z) + 0.05;
    this.prevGround = gy;
    return this.finishStep(dt, inp, prevFs);
  }

  /** The step's outputs (speeds, acceleration, resting) — shared by cars, hoverboards and boats. */
  private finishStep(dt: number, inp: CarInput, prevFs: number): number {
    const nsh = Math.sin(this.heading), nch = Math.cos(this.heading);
    this.fwdSpeed = this.vx * nsh + this.vz * -nch;
    this.latSpeed = this.vx * nch + this.vz * nsh;
    this.accel += ((this.fwdSpeed - prevFs) / Math.max(dt, 1e-4) - this.accel) * (1 - Math.exp(-10 * dt));
    if (this.grounded && Math.abs(this.fwdSpeed) < 0.04 && inp.gas < 0.01 && inp.brake < 0.01 && Math.abs(this.vy) < 0.5) {
      this.vx = this.vz = 0;
      this.fwdSpeed = 0;
    }
    return this.impact;
  }

  // ── collisions ──────────────────────────────────────────────────────────
  private collide(grid: ColliderGrid): void {
    const d = this.tune;
    const r = d.carRadius, off = d.carCircleOffset;
    for (let iter = 0; iter < 2; iter++) {
      const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
      for (let k = 0; k < 2; k++) {
        const o = (k === 0 ? 1 : -1) * off;
        let cx = this.x + fx * o, cz = this.z + fz * o;
        const cols = grid.near(cx, cz, r + 3);
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          if (c.only === 'foot') continue;
          // flying over a low obstacle
          if (c.h !== undefined) {
            if (isBuildCollider(c)) {
              // the player's builds: a wall panel blocks until you stand above it; the thin strips of a ramp are climbed, not hit
              // (the circle in front of a car on the slope is looking at strips up to slope * radius higher than the car)
              const cb = Math.max(this.surfaceAt(cx, cz, this.y + 0.9), this.y - d.hover);
              const strip = c.y0 !== undefined && c.h - c.y0 < 0.45;
              if (cb > c.h - 0.55 - (strip ? 0.8 * r : 0)) continue;
            } else if (this.y > c.h + 0.2) continue; // flying over a low obstacle
          }
          // railings on a bridge or pier deck high above (a boat sails under them)
          if (c.y0 !== undefined && c.y0 > this.y + 2.2) continue;
          if (!this.grounded && this.y - groundHeight(cx, cz) > 1.2) continue;
          if (!pushOut(c, cx, cz, r)) continue;
          const pen = this.respond(res.nx, res.nz, res.pen, cx, cz, r);
          cx += res.nx * pen;
          cz += res.nz * pen;
        }
        if (d.waterOnly) {
          // a boat: shore is a wall — nose up to it and slide back out into the water
          for (let n = 0; n < 8 && groundHeight(cx, cz, false, true) > d.shoreLimit; n++) {
            const gx = groundHeight(cx + 1.2, cz, false, true) - groundHeight(cx - 1.2, cz, false, true);
            const gz = groundHeight(cx, cz + 1.2, false, true) - groundHeight(cx, cz - 1.2, false, true);
            const gl = Math.hypot(gx, gz);
            if (gl < 1e-4) break;
            this.respond(-gx / gl, -gz / gl, 0.3, cx, cz, r);
            cx -= (gx / gl) * 0.3;
            cz -= (gz / gl) * 0.3;
          }
        } else if (this.grounded) {
          // the sea and the lake: too deep to drive into — slide back up the bank
          for (let n = 0; n < 8 && groundHeight(cx, cz) < d.waterLimit; n++) {
            const gx = groundHeight(cx + 1.2, cz) - groundHeight(cx - 1.2, cz);
            const gz = groundHeight(cx, cz + 1.2) - groundHeight(cx, cz - 1.2);
            const gl = Math.hypot(gx, gz);
            if (gl < 1e-4) break;
            this.respond(gx / gl, gz / gl, 0.3, cx, cz, r);
            cx += (gx / gl) * 0.3;
            cz += (gz / gl) * 0.3;
          }
        }
        // soft wall at the edge of the map
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
    const d = this.tune;
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
