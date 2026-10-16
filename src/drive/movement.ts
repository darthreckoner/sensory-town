// ── v3 movement (W4) ── The hub that wires the on-foot movement modules into DriveScene with a few narrow hooks:
//   footcam.ts      the over-the-shoulder camera (+ FOV kicks)
//   glide.ts        skydive + glider + contrail (launch pads, long falls and the bus all end up here)
//   mantle.ts       climb ledges you run into
//   launchpads.ts   boing pads at the points of interest
//   busdrop.ts      the party-bus intro
//   poi.ts          location title cards
// DriveScene owns one Movement. It asks it, once per frame on foot, whether the walker is "owned" this frame
// (bus, skydive, glide, mantle: then the normal foot physics is skipped) and lets it pose the walker afterwards.
import * as THREE from 'three';
import { bus } from '../core/events';
import { store } from '../core/store';
import { tuning } from '../tuning';
import { lerpAngle } from './envUtils';
import type { Character } from '../art/character';
import type { FootInput } from './controls';
import type { FootPhysics } from './foot';
import type { ColliderGrid } from './physics';
import { BusDrop } from './busdrop';
import { FootCam } from './footcam';
import { Glide, landLevel, surfaceY } from './glide';
import { LaunchPads } from './launchpads';
import { Mantle } from './mantle';
import { PoiCards } from './poi';

export interface MovementHost {
  scene: THREE.Scene;
  ui: HTMLElement;
  camera: THREE.PerspectiveCamera;
  camPos: THREE.Vector3;
  foot: FootPhysics;
  walker: Character;
  grid(): ColliderGrid;
  freeFraction(ax: number, az: number, bx: number, bz: number, yLevel: number): number;
  keepOutOfBoxes(): void;
  /** switch the scene to walking (the bus ride is a foot-mode thing) */
  toFootMode(): void;
  /** go back to the car (Skip, or leaving mid-ride) */
  toCarMode(): void;
  /** where the player is (car or feet) */
  where(): { x: number; z: number };
  /** point the drag-look somewhere */
  setLook(yaw: number, pitch: number): void;
}

export class Movement {
  readonly cam: FootCam;
  readonly glide: Glide;
  readonly mantle = new Mantle();
  readonly pads: LaunchPads;
  readonly bus: BusDrop;
  readonly poi: PoiCards;
  /** running flat out this frame (the camera widens, dust flies) */
  sprinting = false;

  private jumpPrev = false;
  private jumpEdge = false;
  private peakY = 0;
  private posed = false;
  private fresh = false;
  private lastTrusted = 0;
  private flyAwayT = -1;
  private readonly look = { yaw: 0, pitch: 0 };

  constructor(private readonly h: MovementHost) {
    this.cam = new FootCam({ camera: h.camera, camPos: h.camPos, freeFraction: (a, b, c, d, y) => h.freeFraction(a, b, c, d, y), keepOutOfBoxes: () => h.keepOutOfBoxes() });
    this.glide = new Glide({ foot: h.foot, walker: h.walker, grid: () => h.grid(), camPos: h.camPos });
    this.pads = new LaunchPads();
    this.bus = new BusDrop(h.ui, {
      onJump: (x, y, z, vx, vz, heading) => this.onBusJump(x, y, z, vx, vz, heading),
      onSkip: () => this.onBusSkip(),
    });
    this.poi = new PoiCards(h.ui);
    h.scene.add(this.glide.root, this.pads.group, this.bus.group);
    // "was this a real person tapping?" (the bus intro only starts after real input, never from a script)
    const trust = (e: Event): void => {
      if (e.isTrusted) this.lastTrusted = performance.now();
    };
    window.addEventListener('pointerdown', trust, { capture: true });
    window.addEventListener('keydown', trust, { capture: true });
  }

  // ── state ─────────────────────────────────────────────────────────────────
  /** the bus ride or a flight: the touch / key shortcuts that change vehicle are off */
  get busy(): boolean {
    return this.bus.active || this.glide.active || this.mantle.active;
  }
  /** off the ground and not under the foot physics (doors and mats must not trigger) */
  get airborne(): boolean {
    return this.bus.active || this.glide.active;
  }
  /** extra FOV (degrees) for DriveScene's camera */
  get fov(): number {
    return this.cam.fovExtra;
  }

  /** Scene enter. `fresh`: the first entry of this profile this session. Returns the listener's disposer. */
  enter(fresh: boolean): () => void {
    const prof = store.profile;
    this.fresh = fresh;
    this.cancel();
    this.glide.setGear(prof.locker?.glider ?? 'starter', prof.locker?.contrail ?? null);
    const w = this.h.where();
    this.poi.reset(w.x, w.z);
    this.peakY = this.h.foot.y;
    // the intro: only from the profile picker / dress-up, only the first time, only after a real tap
    return bus.on('sceneChange', ({ from, to }) => {
      if (to !== 'town' || !this.fresh) return;
      this.fresh = false;
      if ((from === 'dressup' || from === 'picker') && performance.now() - this.lastTrusted < 5000) this.startBus();
    });
  }

  /** Scene exit: put anyone mid-air back on the ground. */
  exit(): void {
    const aboard = this.bus.active;
    const flying = this.glide.active;
    const f = this.h.foot;
    this.bus.hide();
    this.h.ui.classList.remove('v3-bus-on');
    if (aboard) this.h.toCarMode();
    this.cancel();
    if (flying) f.reset(f.x, f.z, f.heading);
  }

  /** Abort the bus / flight / mantle (F1 reset, scene exit). */
  cancel(): void {
    const w = this.h.walker;
    if (this.bus.visible) {
      this.bus.hide();
      this.h.ui.classList.remove('v3-bus-on');
      this.endBusPose();
    }
    this.glide.cancel();
    this.mantle.cancel();
    this.glide.restoreWalker(w);
    this.posed = false;
    this.flyAwayT = -1;
    this.sprinting = false;
    this.h.foot.speedMul = 1;
  }

  // ── the bus ───────────────────────────────────────────────────────────────
  /** Start the party-bus intro (also callable from the console: scenes.current.mv.startBus()). */
  startBus(): void {
    if (this.bus.visible) return;
    this.cancel();
    this.h.toFootMode();
    this.bus.start();
    this.h.ui.classList.add('v3-bus-on');
    this.flyAwayT = -1;
    // a three-quarter view from in front of the bus, looking back at the walker on the roof
    this.h.setLook(this.bus.heading + Math.PI - 0.7, 0.24);
    this.cam.reset(0.01);
    this.rideBus(0);
    // she watches the lens and dances to the party music (the first of her locker emotes that exists, else a bounce)
    const w = this.h.walker;
    w.lookAt(this.h.camPos);
    const mine = store.profile.locker?.emotes ?? [];
    for (const id of [...mine, 'bounce']) if (w.playEmote(id)) break;
  }

  private endBusPose(): void {
    const w = this.h.walker;
    w.lookAt(null);
    w.stopEmote();
  }

  private onBusJump(x: number, y: number, z: number, vx: number, vz: number, heading: number): void {
    const m = tuning.movement3;
    this.h.ui.classList.remove('v3-bus-on');
    this.endBusPose();
    this.glide.drop(x, y, z, vx, vz, m.busJumpHop, heading);
    this.cam.kick(m.fovLaunch);
    this.h.walker.jump();
    const f = this.h.foot;
    f.x = x;
    f.y = y;
    f.z = z;
    f.heading = heading;
    f.grounded = false;
    this.flyAwayT = 0;
  }

  private onBusSkip(): void {
    this.h.ui.classList.remove('v3-bus-on');
    this.endBusPose();
    this.h.toCarMode();
    this.cancel();
  }

  /** aboard: the walker rides the roof */
  private rideBus(dt: number): void {
    const f = this.h.foot;
    this.bus.update(dt);
    const s = this.bus.stand;
    f.x = s.x;
    f.y = s.y;
    f.z = s.z;
    f.vy = 0;
    f.grounded = false;
    f.setVelocity(0, 0);
  }

  // ── per frame, on foot ────────────────────────────────────────────────────
  /** Returns true when this module owns the walker this frame (skip the foot physics). */
  footFrame(dt: number, inp: FootInput): boolean {
    const f = this.h.foot;
    const m = tuning.movement3;
    this.jumpEdge = inp.jump && !this.jumpPrev;
    this.jumpPrev = inp.jump;
    // sprint: a little faster, a wider lens, dust, and the character leans into it
    const push = inp.run && inp.mag > 0.05;
    f.speedMul = push ? m.sprintMul : 1;
    this.sprinting = push && f.grounded && !f.swimming && f.speed > 3;

    if (this.bus.active) {
      this.rideBus(dt);
      return true;
    }
    if (this.glide.active) {
      this.glide.update(dt, inp, this.jumpEdge);
      if (this.glide.active) {
        f.x = this.glide.x;
        f.y = this.glide.y;
        f.z = this.glide.z;
        f.heading = this.glide.heading;
        f.speed = Math.hypot(this.glide.vx, this.glide.vz);
        f.grounded = false;
      }
      return true;
    }
    if (this.mantle.active) {
      this.mantle.update(dt, f);
      return true;
    }
    if (f.grounded && !f.swimming && this.mantle.tryStart(f, inp.dx, inp.dz, inp.mag, dt, this.h.grid())) return true;
    return false;
  }

  /** After the foot physics (or instead of it): launch pads, long falls, and posing the walker. */
  afterFoot(dt: number, w: Character): void {
    const f = this.h.foot;
    const m = tuning.movement3;
    if (this.bus.active) {
      // standing on the roof, turned toward the lens, waving now and then
      w.group.position.copy(this.bus.stand);
      const c = this.h.camPos;
      w.group.rotation.set(0, Math.atan2(c.x - f.x, c.z - f.z), 0);
      w.setMove(0, true);
      return;
    }
    if (this.glide.active) {
      this.glide.applyPose(w, dt);
      this.posed = true;
      return;
    }
    if (this.posed) {
      this.glide.restoreWalker(w);
      this.posed = false;
      w.group.position.set(f.x, f.y, f.z);
      w.group.rotation.y = Math.PI - f.heading;
    }
    if (this.mantle.active) {
      if (this.mantle.started) w.jump();
      w.setMove(0.45, false);
      w.group.position.set(f.x, f.y, f.z);
      w.group.rotation.y = Math.PI - f.heading;
      return;
    }
    w.setSprint(this.sprinting);

    // a long fall opens the glider
    if (f.grounded || f.swimming) this.peakY = f.y;
    else this.peakY = Math.max(this.peakY, f.y);
    if (!f.grounded && !f.swimming && f.vy < -3 && this.peakY - f.y > m.glideDeployFall && f.y - surfaceY(f.x, f.z, f.y) > m.glideMinAlt && f.y - landLevel(f.x, f.z, f.y) > m.glideMinAlt) {
      this.glide.fall();
      this.cam.kick(4);
      this.glide.applyPose(w, 0);
      this.posed = true;
      return;
    }
    // boing
    if (f.grounded && !f.swimming) {
      const pad = this.pads.trigger(f.x, f.y, f.z);
      if (pad) {
        this.glide.launch(f.x, f.y, f.z, m.padSpeed, f.heading);
        this.cam.kick(m.fovLaunch);
        w.jump();
        f.grounded = false;
        f.vy = m.padSpeed;
        bus.emit('launchPad', { pos: { x: pad.x, y: pad.y + 0.4, z: pad.z }, strength: 1 });
        this.glide.applyPose(w, 0);
        this.posed = true;
      }
    }
  }

  // ── every frame (car or feet) ─────────────────────────────────────────────
  tick(dt: number, t: number): void {
    const p = this.h.where();
    this.pads.update(dt, t, p.x, p.z);
    this.glide.post(dt);
    if (!this.bus.active && this.glide.phase === 'none') this.glide.poseGlider();
    // the bus drifts away after the jump, then is gone a little after touchdown
    if (this.bus.visible && !this.bus.active) {
      this.bus.update(dt);
      if (this.glide.phase === 'none') {
        if (this.flyAwayT >= 0) this.flyAwayT += dt;
        if (this.flyAwayT > 1.6) {
          this.bus.hide();
          this.flyAwayT = -1;
        }
      }
    }
    const alt = this.bus.active ? 80 : this.glide.active ? this.glide.altitude() : 0;
    this.poi.update(dt, p.x, p.z, alt);
  }

  // ── the camera ────────────────────────────────────────────────────────────
  /** Look assist while flying: the view swings in behind the flyer. Returns the new yaw / pitch. */
  camAssist(dt: number, dragIdle: number, dragging: boolean, yaw: number, pitch: number): { yaw: number; pitch: number } {
    const o = this.look;
    o.yaw = yaw;
    o.pitch = pitch;
    if (this.glide.active && !dragging && dragIdle > 0.25) {
      o.yaw = lerpAngle(yaw, this.glide.heading, 1 - Math.exp(-(this.glide.gliding ? 2.6 : 3.4) * dt));
      const pt = this.glide.phase === 'dive' ? 0.62 : this.glide.phase === 'rise' ? 0.4 : 0.3;
      o.pitch = pitch + (pt - pitch) * (1 - Math.exp(-1.8 * dt));
    }
    return o;
  }

  placeCam(dt: number, snap: boolean, yaw: number, pitch: number): void {
    const f = this.h.foot;
    const m = tuning.movement3;
    let arm = 1, sho = 1, piv = 1, fov = this.sprinting ? m.fovSprint : 0, occlude = true, air = false;
    let x = f.x, y = f.y, z = f.z, swim = f.swim01;
    if (this.bus.active) {
      x = this.bus.stand.x;
      y = this.bus.stand.y;
      z = this.bus.stand.z;
      arm = m.busArm / m.camArm;
      sho = 0.4;
      piv = 0.6;
      fov = m.fovBus;
      occlude = false;
      swim = 0;
    } else if (this.glide.active) {
      arm = this.glide.gliding ? 1.55 : 1.4;
      sho = 0.7;
      fov = this.glide.gliding ? m.fovGlide : m.fovDive;
      occlude = false;
      swim = 0;
      air = true;
    }
    this.cam.place(dt, snap, { x, y, z, swim01: swim, yaw, pitch, arm, shoulder: sho, pivot: piv, fov, occlude, air });
  }

  /** The sun's shadow box follows the GROUND under a flyer, not the flyer. */
  sunY(y: number): number {
    if (this.bus.active || this.glide.active) return landLevel(this.h.foot.x, this.h.foot.z, y);
    return y;
  }
}
