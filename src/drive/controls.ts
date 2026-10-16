// Driving input: keyboard (WASD / arrows, Space = brake, H = horn) plus big
// multi-touch on-screen controls (joystick bottom-left; GO, STOP and horn
// bottom-right). Touch controls stay hidden until a touch is seen.
// Pointer Events only, one pointerId per control, so steering and gas work at
// the same time with two thumbs.
import { tuning } from '../tuning';
import { el } from '../ui/ui';
import { clamp } from './envUtils';
import type { CarInput } from './physics';

interface Pedal {
  el: HTMLElement;
  id: number | null;
  down: boolean;
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
  private hornEl!: HTMLElement;
  private hornId: number | null = null;
  private readonly keys = new Set<string>();
  private touchVisible = false;
  /** While true (a sheet or menu is open) all input reads as zero. */
  suspended = false;
  private readonly input: CarInput = { steer: 0, gas: 0, brake: 0, handbrake: false };

  constructor(parent: HTMLElement, private readonly onHorn: () => void) {
    this.root = el('div', 'drive-controls passthrough', parent) as HTMLDivElement;
    this.buildJoystick();
    this.gasPedal = this.buildPedal('gas', '▲', 'GO');
    this.brakePedal = this.buildPedal('brake', '▼', 'STOP');
    this.buildHorn();
    this.applySizes();
  }

  // ── visibility ───────────────────────────────────────────────────────────
  showTouch(on: boolean): void {
    if (this.touchVisible === on) return;
    this.touchVisible = on;
    this.root.classList.toggle('show', on);
  }
  get touchShown(): boolean {
    return this.touchVisible;
  }
  /** Re-read the sizes from tuning (the debug overlay can change them live). */
  applySizes(): void {
    const s = tuning.drive.controlSize;
    this.root.style.setProperty('--drive-ctrl', `${s}px`);
  }

  // ── keyboard (wired by the scene through its auto-removing listen()) ─────
  onKeyDown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    const c = e.code;
    if (c === 'KeyH') {
      if (!e.repeat) this.onHorn();
      return;
    }
    if (DRIVE_KEYS.has(c)) {
      this.keys.add(c);
      e.preventDefault();
    }
  }
  onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  /** Let go of everything (scene exit, window blur). */
  releaseAll(): void {
    this.keys.clear();
    this.joyId = null;
    this.stickX = this.stickY = 0;
    this.joyKnob.style.transform = 'translate(0px, 0px)';
    this.joy.classList.remove('active');
    for (const p of [this.gasPedal, this.brakePedal]) {
      p.id = null;
      p.down = false;
      p.el.classList.remove('pressed');
    }
    this.hornId = null;
    this.hornEl.classList.remove('pressed');
  }

  // ── the merged input ─────────────────────────────────────────────────────
  read(): CarInput {
    const out = this.input;
    if (this.suspended) {
      out.steer = out.gas = out.brake = 0;
      out.handbrake = false;
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

  private buildPedal(kind: 'gas' | 'brake', glyph: string, label: string): Pedal {
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
    const e = el('div', 'drive-horn interactive', this.root);
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
      if (!this.suspended) this.onHorn();
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
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
]);
