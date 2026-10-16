// ── v3 movement (W4) ── Slide: sprint, then Ctrl / X / the SLIDE button = a low knee-slide.
//
// It keeps your momentum (a little boost on the way in), slows on the flat, SPEEDS UP downhill (Sprinkle Summit's
// snowy slopes, a built ramp: the slope is read from groundHeight + buildSpace.surfaceBelow) and steers gently with the
// stick. Jump = a slide-hop that keeps the speed until you land. The foot physics keeps doing all the collision work:
// while sliding it only runs with `coast` on (its velocity is not pulled toward the stick) and this sets the velocity.
//
// The pose: if the character has `setSlide(on)` it is used; until then the whole walker leans back, hips low,
// arms out (the existing airborne pose) which already reads as a cool knee-slide.
import * as THREE from 'three';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { SUMMIT } from '../world/townLayout';
import { surfaceY } from './glide';
import { clamp, wrapAngle } from './envUtils';
import type { Character } from '../art/character';
import type { FootInput } from './controls';
import type { FootPhysics } from './foot';

const HIPS = 0.9; // the walker leans about her hips
const HIPS_LOW = 0.5; // ... which sink to this height

export class Slide {
  active = false;
  /** horizontal speed (m/s) */
  speed = 0;
  /** is the slide on snow (for the spray colour and the sound)? */
  snow = false;
  private dirX = 0;
  private dirZ = -1;
  private airT = 0;
  private spray = 0;
  private tilt = 0;
  private roll = 0;
  private turn = 0;
  private cool = 0;
  /** a slide-hop: keep coasting until the feet are down */
  private hopping = false;
  private slidePrev = false;
  private posed = false;
  private readonly eul = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly off = new THREE.Vector3();

  /** Per frame (before the foot physics). Returns nothing: it steers `f` through coast + setVelocity. */
  update(dt: number, f: FootPhysics, inp: FootInput, jumpEdge: boolean, sprinting: boolean, busy: boolean): void {
    const m = tuning.movement3;
    this.cool = Math.max(0, this.cool - dt);
    const edge = inp.slide && !this.slidePrev;
    this.slidePrev = inp.slide;

    if (!this.active) {
      if (this.hopping && f.grounded) this.hopping = false;
      if (!this.hopping) f.coast = false;
      if (edge && !busy && this.cool <= 0 && f.grounded && !f.swimming && f.wet < 0.25 && f.speed >= m.slideMinSpeed && (sprinting || f.speed >= m.slideMinSpeed * 1.2)) this.start(f);
      return;
    }

    // ── sliding ──
    const real = Math.hypot(f.velX, f.velZ);
    if (f.grounded) this.airT = 0;
    else this.airT += dt;
    if (edge || jumpEdge || f.swimming || f.wet > 0.3 || real < 0.4 || this.airT > 0.35) {
      // stand up; a jump keeps the speed through the air
      this.end(f, jumpEdge || this.airT > 0.35);
      return;
    }
    // the real velocity (a wall may have turned it) is the truth
    this.speed = real;
    this.dirX = f.velX / real;
    this.dirZ = f.velZ / real;
    // steer toward the stick (gently)
    if (inp.mag > 0.15) {
      const want = Math.atan2(inp.dx, -inp.dz);
      const cur = Math.atan2(this.dirX, -this.dirZ);
      const rot = clamp(wrapAngle(want - cur), -m.slideTurn * dt * inp.mag, m.slideTurn * dt * inp.mag);
      this.turn += (rot / Math.max(dt, 1e-4) - this.turn) * Math.min(1, dt * 8);
      const a = cur + rot;
      this.dirX = Math.sin(a);
      this.dirZ = -Math.cos(a);
    } else this.turn += (0 - this.turn) * Math.min(1, dt * 8);
    // the slope under the knees: downhill pulls, uphill drags; friction always
    const dx = this.dirX, dz = this.dirZ;
    const hAhead = surfaceY(f.x + dx * 0.9, f.z + dz * 0.9, f.y);
    const hBack = surfaceY(f.x - dx * 0.9, f.z - dz * 0.9, f.y);
    const slope = clamp((hAhead - hBack) / 1.8, -1.2, 1.2); // rise per metre (negative = downhill)
    const acc = -slope * m.slideGravity - m.slideFriction;
    this.speed = clamp(this.speed + acc * dt, 0, m.slideMax);
    if (this.speed < m.slideEndSpeed) {
      this.end(f, false);
      return;
    }
    f.coast = true;
    f.setVelocity(dx * this.speed, dz * this.speed);
    this.snow = f.y > 11 && Math.hypot(f.x - SUMMIT.x, f.z - SUMMIT.z) < SUMMIT.shelfR1 + 24;

    // spray and the sound
    this.spray += dt;
    if (this.spray >= m.slideSprayEvery) {
      this.spray = 0;
      bus.emit('slideSpray', { pos: { x: f.x - dx * 0.5, y: f.y + 0.1, z: f.z - dz * 0.5 }, speed01: clamp(this.speed / m.slideMax, 0, 1), snow: this.snow });
    }
    bus.emit('slideUpdate', { speed01: clamp(this.speed / m.slideMax, 0, 1), snow: this.snow });
  }

  private start(f: FootPhysics): void {
    const m = tuning.movement3;
    const real = Math.hypot(f.velX, f.velZ) || f.speed;
    if (real < 0.5) return;
    this.active = true;
    this.hopping = false;
    this.airT = 0;
    this.spray = 0;
    this.turn = 0;
    this.dirX = f.velX / real;
    this.dirZ = f.velZ / real;
    this.speed = Math.min(real * m.slideBoost + 1.2, m.slideMax);
    f.coast = true;
    f.setVelocity(this.dirX * this.speed, this.dirZ * this.speed);
    bus.emit('slideStart', { pos: { x: f.x, y: f.y + 0.3, z: f.z } });
  }

  private end(f: FootPhysics, hop: boolean): void {
    this.active = false;
    this.cool = tuning.movement3.slideCooldown;
    if (hop) this.hopping = true; // coast on until landing
    else f.coast = false;
    bus.emit('slideStop', {});
  }

  /** Pose the walker while sliding (lean back, hips low). Returns true while it has the walker's transform. */
  applyPose(w: Character, f: FootPhysics, dt: number): boolean {
    const slideApi = w as unknown as { setSlide?: (on: boolean) => void };
    if (!this.active) {
      if (this.posed) {
        this.posed = false;
        slideApi.setSlide?.(false);
        this.restore(w);
      }
      return false;
    }
    this.posed = true;
    const m = tuning.movement3;
    if (slideApi.setSlide) {
      // the character agent's own slide pose (it lowers and leans itself)
      slideApi.setSlide(true);
      w.setMove(0.2, true);
      return false;
    }
    const g = w.group;
    this.tilt += (-m.slideLean - this.tilt) * (1 - Math.exp(-10 * dt));
    this.roll += (clamp(-this.turn * 0.22, -0.45, 0.45) - this.roll) * (1 - Math.exp(-8 * dt));
    this.eul.set(this.tilt, Math.PI - f.heading, this.roll, 'YXZ');
    g.rotation.copy(this.eul);
    this.off.set(0, HIPS, 0).applyEuler(this.eul);
    g.position.set(f.x - this.off.x, f.y + HIPS_LOW - this.off.y, f.z - this.off.z);
    w.setMove(0.15, false);
    return true;
  }

  /** Stand her back up (rotation order and tilt). */
  restore(w: Character): void {
    const g = w.group;
    g.rotation.order = 'XYZ';
    g.rotation.set(0, g.rotation.y, 0);
    this.tilt = 0;
    this.roll = 0;
  }

  /** Let go of a zipline / a slide-hop: keep coasting (no pull toward the stick) until the feet are down. */
  keepMomentum(f: FootPhysics): void {
    this.hopping = true;
    f.coast = true;
  }

  /** Abort (scene exit, a flight begins, F1). */
  cancel(f?: FootPhysics): void {
    if (this.active) bus.emit('slideStop', {});
    this.active = false;
    this.hopping = false;
    this.cool = 0;
    if (f) f.coast = false;
  }
}
