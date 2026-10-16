// Driving + walking input.
//   In the car:   WASD / arrows steer + gas / brake, Space = handbrake (drift),
//                 Shift = ⚡ boost, H = horn, E or F = get out.
//   On foot:      WASD / arrows walk (relative to the camera), Shift = run,
//                 Space = jump (a dolphin hop when swimming), mouse / finger drag = look around,
//                 E or F = get in, C = bring the car to me.
// Touch: a big joystick (bottom-left: steer + gas zone in the car, free walking
// on foot), GO / STOP / ⚡ / horn pedals in the car, a JUMP button on foot.
// Pointer Events only, one pointerId per control, so steering and gas work at
// the same time with two thumbs. Touch controls stay hidden until a touch is seen.
import { tuning } from '../tuning';
import { el } from '../ui/ui';
import { clamp } from './envUtils';
import type { CarInput } from './physics';

interface Pedal {
  el: HTMLElement;
  id: number | null;
  down: boolean;
}

export interface FootInput {
  /** desired world direction (unit, or 0,0) */
  dx: number;
  dz: number;
  /** stick push 0..1 */
  mag: number;
  run: boolean;
  jump: boolean;
}

export type ControlMode = 'car' | 'foot';

export interface ControlHooks {
  onHorn(): void;
  onToggleMode(): void;
  /** Enter: confirm the on-screen prompt ("Build here?") */
  onConfirm?(): void;
  /** C: bring the car to me (on foot) */
  onCallCar?(): void;
}

export class DriveControls {
  readonly root: HTMLDivElement;
  private joy!: HTMLDivElement;
  private joyBase!: HTMLDivElement;
  private joyKnob!: HTMLDivElement;
  private joyId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private readonly gasPedal: Pedal;
  private readonly brakePedal: Pedal;
  private readonly boostPedal: Pedal;
  private readonly jumpPedal: Pedal;
  private hornEl!: HTMLElement;
  private hornId: number | null = null;
  private readonly keys = new Set<string>();
  private touchVisible = false;
  private mode: ControlMode = 'car';
  /** the boost request is a latch: tap = fire (the scene owns the meter) */
  private boostEdge = false;
  // camera drag (on foot)
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private dYaw = 0;
  private dPitch = 0;
  /** While true (a sheet or menu is open) all input reads as zero. */
  suspended = false;
  private readonly car: CarInput = { steer: 0, gas: 0, brake: 0, handbrake: false, boost: false };
  private readonly foot: FootInput = { dx: 0, dz: 0, mag: 0, run: false, jump: false };

  constructor(parent: HTMLElement, private readonly hooks: ControlHooks) {
    this.root = el('div', 'drive-controls passthrough mode-car', parent) as HTMLDivElement;
    this.buildJoystick();
    this.gasPedal = this.buildPedal('gas car-only', '▲', 'GO');
    this.brakePedal = this.buildPedal('brake car-only', '▼', 'STOP');
    this.boostPedal = this.buildPedal('boost car-only', '⚡', 'BOOST');
    this.jumpPedal = this.buildPedal('jump foot-only', '⤒', 'JUMP');
    this.buildHorn();
    this.applySizes();
  }

  // ── visibility / mode ────────────────────────────────────────────────────
  showTouch(on: boolean): void {
    if (this.touchVisible === on) return;
    this.touchVisible = on;
    this.root.classList.toggle('show', on);
  }
  get touchShown(): boolean {
    return this.touchVisible;
  }
  setMode(m: ControlMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.root.classList.toggle('mode-car', m === 'car');
    this.root.classList.toggle('mode-foot', m === 'foot');
    this.boostEdge = false;
    this.dYaw = this.dPitch = 0;
    for (const p of [this.gasPedal, this.brakePedal, this.boostPedal, this.jumpPedal]) {
      p.id = null;
      p.down = false;
      p.el.classList.remove('pressed');
    }
  }
  /** Re-read the sizes from tuning (the debug overlay can change them live). */
  applySizes(): void {
    this.root.style.setProperty('--drive-ctrl', `${tuning.drive.controlSize}px`);
  }
  /** The ⚡ button shows how full the boost meter is. */
  setBoostMeter(meter01: number, ready: boolean, active: boolean): void {
    this.boostPedal.el.style.setProperty('--meter', `${Math.round(clamp(meter01, 0, 1) * 100)}%`);
    this.boostPedal.el.classList.toggle('ready', ready);
    this.boostPedal.el.classList.toggle('active', active);
  }

  // ── keyboard (wired by the scene through its auto-removing listen()) ─────
  onKeyDown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    const c = e.code;
    if (this.suspended) return;
    if (c === 'KeyH') {
      if (!e.repeat && this.mode === 'car') this.hooks.onHorn();
      return;
    }
    if (c === 'Enter') {
      if (!e.repeat) this.hooks.onConfirm?.();
      return;
    }
    if (c === 'KeyC') {
      if (!e.repeat && this.mode === 'foot') this.hooks.onCallCar?.();
      return;
    }
    if (c === 'KeyE' || c === 'KeyF') {
      if (!e.repeat) this.hooks.onToggleMode();
      e.preventDefault();
      return;
    }
    if ((c === 'ShiftLeft' || c === 'ShiftRight') && !e.repeat) this.boostEdge = true;
    if (DRIVE_KEYS.has(c)) {
      this.keys.add(c);
      e.preventDefault();
    }
  }
  onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  // ── camera drag (on foot) ────────────────────────────────────────────────
  dragDown(e: PointerEvent): void {
    if (this.dragId !== null || this.suspended || this.mode !== 'foot') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.dragId = e.pointerId;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
  }
  dragMove(e: PointerEvent): void {
    if (e.pointerId !== this.dragId) return;
    this.dYaw += (e.clientX - this.dragX) * 0.0065;
    this.dPitch += (e.clientY - this.dragY) * 0.004;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
  }
  dragUp(e: PointerEvent): void {
    if (e.pointerId === this.dragId) this.dragId = null;
  }
  /** Camera yaw / pitch the player dragged since the last call (radians). */
  takeLook(out: { yaw: number; pitch: number }): void {
    out.yaw = this.dYaw;
    out.pitch = this.dPitch;
    this.dYaw = this.dPitch = 0;
    const k = this.keys;
    // Q / Z also turn the camera
    if (k.has('KeyQ')) out.yaw -= 0.03;
    if (k.has('KeyZ')) out.yaw += 0.03;
  }
  get dragging(): boolean {
    return this.dragId !== null;
  }

  /** Let go of everything (scene exit, window blur). */
  releaseAll(): void {
    this.keys.clear();
    this.joyId = null;
    this.stickX = this.stickY = 0;
    this.joyKnob.style.transform = 'translate(0px, 0px)';
    this.joy.classList.remove('active');
    for (const p of [this.gasPedal, this.brakePedal, this.boostPedal, this.jumpPedal]) {
      p.id = null;
      p.down = false;
      p.el.classList.remove('pressed');
    }
    this.hornId = null;
    this.hornEl.classList.remove('pressed');
    this.dragId = null;
    this.dYaw = this.dPitch = 0;
    this.boostEdge = false;
  }

  // ── the merged inputs ────────────────────────────────────────────────────
  /** Car input. `boost` = the player asked for a boost this frame (edge, consumed). */
  readCar(): CarInput {
    const out = this.car;
    if (this.suspended) {
      out.steer = out.gas = out.brake = 0;
      out.handbrake = false;
      out.boost = false;
      this.boostEdge = false;
      return out;
    }
    const k = this.keys;
    const d = tuning.drive;
    let steer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let gas = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    let brake = k.has('ArrowDown') || k.has('KeyS') ? 1 : 0;
    // joystick: x steers; pushing well up / down is gas / reverse
    const dz = d.joyDeadzone;
    if (Math.abs(this.stickX) > dz) steer += Math.sign(this.stickX) * ((Math.abs(this.stickX) - dz) / (1 - dz));
    const zone = d.joyGasZone;
    if (this.stickY < -zone) gas = Math.max(gas, (-this.stickY - zone) / (1 - zone));
    else if (this.stickY > zone) brake = Math.max(brake, (this.stickY - zone) / (1 - zone));
    if (this.gasPedal.down) gas = 1;
    if (this.brakePedal.down) brake = 1;
    out.steer = clamp(steer, -1, 1);
    out.gas = gas;
    out.brake = brake;
    out.handbrake = k.has('Space');
    out.boost = this.boostEdge || this.boostPedal.down;
    this.boostEdge = false;
    return out;
  }

  /** On-foot input. `camYaw` is the camera's heading (forward = (sin, -cos)). */
  readFoot(camYaw: number): FootInput {
    const out = this.foot;
    if (this.suspended) {
      out.dx = out.dz = out.mag = 0;
      out.run = out.jump = false;
      return out;
    }
    const k = this.keys;
    const d = tuning.drive;
    let sx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let sy = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    const keyMag = Math.hypot(sx, sy);
    let mag: number;
    if (keyMag > 0) {
      sx /= keyMag;
      sy /= keyMag;
      mag = 1;
    } else {
      // stick: up = forward
      const len = Math.hypot(this.stickX, this.stickY);
      if (len > d.joyDeadzone) {
        mag = clamp((len - d.joyDeadzone) / (1 - d.joyDeadzone), 0, 1);
        sx = this.stickX / len;
        sy = -this.stickY / len;
      } else {
        mag = 0;
        sx = sy = 0;
      }
    }
    const fx = Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = Math.sin(camYaw);
    out.dx = fx * sy + rx * sx;
    out.dz = fz * sy + rz * sx;
    out.mag = mag;
    out.run = (keyMag > 0 && (k.has('ShiftLeft') || k.has('ShiftRight'))) || (keyMag === 0 && mag >= d.runStick);
    out.jump = k.has('Space') || this.jumpPedal.down;
    this.boostEdge = false;
    return out;
  }

  // ── building the touch controls ──────────────────────────────────────────
  private buildJoystick(): void {
    this.joy = el('div', 'drive-joy interactive', this.root) as HTMLDivElement;
    this.joyBase = el('div', 'joy-base', this.joy) as HTMLDivElement;
    el('span', 'joy-arrow l', this.joyBase, '◀');
    el('span', 'joy-arrow r', this.joyBase, '▶');
    this.joyKnob = el('div', 'joy-knob', this.joyBase) as HTMLDivElement;
    const move = (e: PointerEvent): void => {
      const r = this.joyBase.getBoundingClientRect();
      const R = r.width / 2;
      const throwR = R * 0.62;
      let dx = (e.clientX - (r.left + R)) / throwR;
      let dy = (e.clientY - (r.top + R)) / throwR;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.stickX = dx;
      this.stickY = dy;
      this.joyKnob.style.transform = `translate(${dx * throwR}px, ${dy * throwR}px)`;
    };
    this.joy.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      try {
        this.joy.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.joy.classList.add('active');
      move(e);
      e.preventDefault();
    });
    this.joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) move(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.stickX = this.stickY = 0;
      this.joyKnob.style.transform = 'translate(0px, 0px)';
      this.joy.classList.remove('active');
    };
    this.joy.addEventListener('pointerup', end);
    this.joy.addEventListener('pointercancel', end);
    this.joy.addEventListener('lostpointercapture', end);
  }

  private buildPedal(kind: string, glyph: string, label: string): Pedal {
    const e = el('div', `drive-pedal ${kind} interactive`, this.root);
    el('span', 'glyph', e, glyph);
    el('span', 'lbl', e, label);
    const p: Pedal = { el: e, id: null, down: false };
    e.addEventListener('pointerdown', (ev) => {
      if (p.id !== null) return;
      p.id = ev.pointerId;
      p.down = true;
      e.classList.add('pressed');
      try {
        e.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      if (p === this.boostPedal) this.boostEdge = true;
      ev.preventDefault();
    });
    const end = (ev: PointerEvent): void => {
      if (ev.pointerId !== p.id) return;
      p.id = null;
      p.down = false;
      e.classList.remove('pressed');
    };
    e.addEventListener('pointerup', end);
    e.addEventListener('pointercancel', end);
    e.addEventListener('lostpointercapture', end);
    return p;
  }

  private buildHorn(): void {
    const e = el('div', 'drive-horn car-only interactive', this.root);
    el('span', 'glyph', e, '📯');
    this.hornEl = e;
    e.addEventListener('pointerdown', (ev) => {
      if (this.hornId !== null) return;
      this.hornId = ev.pointerId;
      e.classList.add('pressed');
      try {
        e.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      ev.preventDefault();
      if (!this.suspended) this.hooks.onHorn();
    });
    const end = (ev: PointerEvent): void => {
      if (ev.pointerId !== this.hornId) return;
      this.hornId = null;
      e.classList.remove('pressed');
    };
    e.addEventListener('pointerup', end);
    e.addEventListener('pointercancel', end);
    e.addEventListener('lostpointercapture', end);
  }
}

const DRIVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyZ',
]);
