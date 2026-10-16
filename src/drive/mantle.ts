// ── v3 movement (W4) ── Mantle: run into a ledge 0.7–1.9 m high and climb it instead of stopping.
//
// The foot physics treats a step taller than tuning.drive.stepUp as a wall. When the walker is
// moving into such an edge and there is a flat top just beyond it (ground overlays, skate boxes, decks,
// and anything the player built: buildSpace.surfaceBelow), this takes over for a short hop-up
// (the existing jump pose) and sets the walker on top, still running.
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { groundHeight } from '../world/heightfield';
import { surfaceBelow } from '../world/buildSpace';
import { type ColliderGrid, pushOut } from './physics';
import { clamp } from './envUtils';
import type { FootPhysics } from './foot';

const sm = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

export class Mantle {
  active = false;
  /** true for the one frame a mantle begins (the caller starts the jump pose) */
  started = false;
  private t = 0;
  private cd = 0;
  private x0 = 0;
  private y0 = 0;
  private z0 = 0;
  private x1 = 0;
  private y1 = 0;
  private z1 = 0;
  private dx = 0;
  private dz = 0;

  /** The top surface a climber at height y could haul themselves onto at (x, z). */
  private top(x: number, z: number, y: number): number {
    const m = tuning.movement3;
    return Math.max(groundHeight(x, z, true), surfaceBelow(x, z, y + m.mantleMax, 0));
  }

  private clearAt(x: number, z: number, y: number, grid: ColliderGrid): boolean {
    const r = tuning.drive.footRadius + 0.05;
    const cols = grid.near(x, z, r + 2);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.only === 'car') continue;
      if (c.h !== undefined && y > c.h - 0.4) continue; // standing over a low wall / roof
      if (c.y0 !== undefined && c.y0 > y + 1.75) continue; // an overhead beam
      if (pushOut(c, x, z, r)) return false;
    }
    return true;
  }

  /** Is the walker running into a climbable ledge? If so, start the climb. */
  tryStart(f: FootPhysics, dirX: number, dirZ: number, mag: number, dt: number, grid: ColliderGrid): boolean {
    const m = tuning.movement3;
    this.cd = Math.max(0, this.cd - dt);
    if (this.cd > 0 || !f.grounded || f.swimming || f.wet > 0.3 || mag < 0.4) return false;
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.5) return false;
    const dx = dirX / len, dz = dirZ / len;
    const r = tuning.drive.footRadius;
    const lead = r + 0.32;
    const at = (d: number): number => this.top(f.x + dx * d, f.z + dz * d, f.y);
    const rise = at(lead) - f.y;
    if (rise < m.mantleMin || rise > m.mantleMax) return false;
    // the ground right at our feet is ordinary (we are standing at the foot of the ledge, not on a slope up to it)
    if (at(r * 0.8) - f.y > tuning.drive.stepUp + 0.12) return false;
    // a flat top beyond the lip to stand on
    const hTop = at(lead + 0.5);
    if (Math.abs(hTop - at(lead)) > 0.3 || at(lead + 0.95) < hTop - 0.35) return false;
    const D = lead + 0.5;
    const x1 = f.x + dx * D, z1 = f.z + dz * D;
    if (!this.clearAt(x1, z1, hTop, grid)) return false;

    this.active = true;
    this.started = true;
    this.t = 0;
    this.x0 = f.x;
    this.y0 = f.y;
    this.z0 = f.z;
    this.x1 = x1;
    this.y1 = hTop;
    this.z1 = z1;
    this.dx = dx;
    this.dz = dz;
    f.heading = Math.atan2(dx, -dz);
    f.setVelocity(0, 0);
    bus.emit('mantle', { pos: { x: f.x, y: f.y + 0.8, z: f.z } });
    return true;
  }

  update(dt: number, f: FootPhysics): void {
    this.started = false;
    if (!this.active) return;
    const m = tuning.movement3;
    this.t += dt;
    const u = clamp(this.t / m.mantleSeconds, 0, 1);
    const up = sm(u / 0.62);
    const fw = sm((u - 0.35) / 0.65);
    f.x = this.x0 + (this.x1 - this.x0) * fw;
    f.z = this.z0 + (this.z1 - this.z0) * fw;
    f.y = this.y0 + (this.y1 - this.y0) * up + Math.sin(clamp((u - 0.35) / 0.65, 0, 1) * Math.PI) * 0.14;
    f.vy = 0;
    f.grounded = true;
    if (u >= 1) {
      this.active = false;
      this.cd = m.mantleCooldown;
      f.x = this.x1;
      f.y = this.y1;
      f.z = this.z1;
      f.setVelocity(this.dx * 3.2, this.dz * 3.2); // keep rolling
      bus.emit('footstep', { pos: { x: f.x, y: f.y, z: f.z }, run: true });
    }
  }

  cancel(): void {
    this.active = false;
    this.started = false;
  }
}
