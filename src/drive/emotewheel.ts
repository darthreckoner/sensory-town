// ── v3 emote (W5) ── The in-world emote wheel: 😀 / Q opens a radial wheel with the six emotes equipped in the Locker;
// tap one and she plays it right there in the world. Moving, jumping, or getting into a ride ends it (the character
// itself cancels on movement, this module notices and says so on the bus), the camera swings round to show her front while
// she dances and swings back afterwards (a flag on the movement hub, `mv.emoteCam`), and juice plays the emote's own tune.
//
// Events:  emoteStarted { id, loop, pos }   emoteStopped { id, pos, reason }   emoteWheel { open }
// The wheel only ever shows what the Locker has equipped (getLocker() repairs the list: locked emotes never appear).
import { bus } from '../core/events';
import { scenes } from '../core/scene';
import { EMOTES as CHAR_EMOTES, type Character } from '../art/character';
import { EMOTES as GEAR_EMOTES, EMOTE_SLOTS, RARITY } from '../art/gear/catalog';
import { getLocker } from '../art/gear/lockerState';
import { bindTap, el, toast } from '../ui/ui';
import type { FootPhysics } from './foot';
import type { Movement } from './movement';

export interface EmoteHost {
  hud: HTMLElement;
  walker(): Character;
  foot(): FootPhysics;
  mv(): Movement;
  /** walking (not in a ride) */
  onFoot(): boolean;
  /** the wheel may open right now (nothing else is modal, no scene change in flight) */
  canOpen(): boolean;
}

type StopReason = 'done' | 'moved' | 'ride' | 'swap';

export class EmoteWheel {
  readonly root: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly slots: HTMLButtonElement[] = [];
  private readonly core: HTMLElement;
  private readonly coreName: HTMLElement;
  private readonly coreSub: HTMLElement;
  private isOpen = false;
  private ids: (string | null)[] = [];
  /** the emote id that is playing right now (null = none) */
  private cur: string | null = null;

  constructor(private readonly h: EmoteHost) {
    this.root = el('div', 'em3 passthrough', h.hud);
    const scrim = el('div', 'em3-scrim interactive', this.root);
    bindTap(scrim, () => this.close());
    this.wheel = el('div', 'em3-wheel interactive', this.root);
    for (let i = 0; i < EMOTE_SLOTS; i++) {
      const a = -Math.PI / 2 + (i / EMOTE_SLOTS) * Math.PI * 2;
      const b = el('button', 'em3-slot', this.wheel);
      b.style.left = `${50 + 37 * Math.cos(a)}%`;
      b.style.top = `${50 + 37 * Math.sin(a)}%`;
      el('span', 'n', b, String(i + 1));
      el('span', 'ico', b);
      el('span', 'nm', b);
      bindTap(b, () => this.pick(i));
      b.addEventListener('pointerenter', () => this.hover(i));
      b.addEventListener('focus', () => this.hover(i));
      this.slots.push(b);
    }
    this.core = el('button', 'em3-core', this.wheel);
    this.coreName = el('b', '', this.core, 'EMOTES');
    this.coreSub = el('span', '', this.core, 'Tap one to dance!');
    bindTap(this.core, () => this.close());
    el('div', 'em3-keys', this.root, 'Press 1-6 to pick · Q or Esc to close');
    // test hook (dev / ?selftest): window.__emote3 = the wheel
    if (typeof location !== 'undefined' && (import.meta.env?.DEV || /selftest/.test(location.search))) (window as unknown as Record<string, unknown>).__emote3 = this;
  }

  get open(): boolean {
    return this.isOpen;
  }
  /** the emote that is playing, or null */
  get playing(): string | null {
    return this.cur;
  }

  // ── the wheel ─────────────────────────────────────────────────────────────
  toggle(): void {
    if (this.isOpen) this.close();
    else this.show();
  }

  show(): void {
    if (this.isOpen || !this.h.onFoot() || !this.h.canOpen()) return;
    this.refresh();
    this.isOpen = true;
    this.root.classList.add('on');
    bus.emit('uiOpen', {});   // the world holds still while it is open (DriveScene suspends the controls on uiOpen)
    bus.emit('emoteWheel', { open: true });
  }

  close(silent = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('on');
    if (!silent) bus.emit('uiClose', {});
    bus.emit('emoteWheel', { open: false });
  }

  /** Fill the six slots from the Locker's equipped emotes. */
  refresh(): void {
    const L = getLocker();
    this.ids = [];
    for (let i = 0; i < EMOTE_SLOTS; i++) this.ids.push(L.emotes[i] && CHAR_EMOTES.some((e) => e.id === L.emotes[i]) ? L.emotes[i] : null);
    this.slots.forEach((b, i) => {
      const id = this.ids[i];
      const item = id ? GEAR_EMOTES.find((g) => g.id === id) : undefined;
      const rar = RARITY[item?.rarity ?? 'common'];
      b.classList.toggle('empty', !item);
      b.classList.toggle('playing', !!id && id === this.cur);
      b.style.setProperty('--rc', rar.color);
      b.style.setProperty('--rd', rar.deep);
      (b.querySelector('.ico') as HTMLElement).textContent = item ? item.icon : '+';
      (b.querySelector('.nm') as HTMLElement).textContent = item ? item.name : '+ Locker';
      b.title = item ? item.name : 'Add emotes in the Locker';
    });
    this.coreName.textContent = 'EMOTES';
    this.coreSub.textContent = this.ids.some(Boolean) ? 'Tap one to dance!' : 'Add some in the Locker';
  }

  private hover(i: number): void {
    const id = this.ids[i];
    const item = id ? GEAR_EMOTES.find((g) => g.id === id) : undefined;
    this.coreName.textContent = item ? item.name.toUpperCase() : '+ LOCKER';
    this.coreSub.textContent = item ? RARITY[item.rarity].label : 'Pick emotes in the Locker';
  }

  /** Slot tapped (or its number key pressed). */
  pick(i: number): void {
    if (!this.isOpen) return;
    const id = this.ids[i];
    this.close();
    if (!id) {
      // an empty slot: off to the Locker's emote wheel to fill it
      void scenes.go('dressup');
      return;
    }
    this.play(id);
  }

  // ── playing ───────────────────────────────────────────────────────────────
  /** Play an emote on the walker right here. Returns false when she cannot (swimming, in a ride, mid-air, busy). */
  play(id: string): boolean {
    const h = this.h;
    const w = h.walker(), f = h.foot();
    if (!h.onFoot() || h.mv().busy) return false;
    if (f.swimming) {
      toast('Emotes work on dry land 🏖️');
      return false;
    }
    if (!f.grounded || f.coast) return false;
    const info = CHAR_EMOTES.find((e) => e.id === id);
    if (!info) return false;
    if (this.cur) this.end('swap');
    f.setVelocity(0, 0);   // an emote starts from a standstill
    if (!w.playEmote(id)) return false;
    this.cur = id;
    h.mv().emoteCam = true;
    bus.emit('emoteStarted', { id, loop: info.loop, pos: { x: f.x, y: f.y, z: f.z } });
    return true;
  }

  /** Stop dancing (the character eases out). */
  stop(reason: StopReason = 'moved'): void {
    if (!this.cur) return;
    this.h.walker().stopEmote();
    this.end(reason);
  }

  private end(reason: StopReason): void {
    const id = this.cur;
    if (!id) return;
    this.cur = null;
    this.h.mv().emoteCam = false;
    const f = this.h.foot();
    bus.emit('emoteStopped', { id, pos: { x: f.x, y: f.y, z: f.z }, reason });
  }

  /** Every frame (car or feet): notice when the emote is over. */
  update(): void {
    if (!this.cur) return;
    const h = this.h;
    if (!h.onFoot() || h.mv().busy) {
      this.stop('ride');
      return;
    }
    const w = h.walker();
    if (w.emoting === this.cur) return;
    // the character ended it: a one-shot finished, or she moved / jumped
    const info = CHAR_EMOTES.find((e) => e.id === this.cur);
    this.end(info && !info.loop ? 'done' : 'moved');
  }

  /** Scene exit / getting into a ride: close the wheel quietly and end any emote. */
  reset(): void {
    this.close(true);
    this.stop('ride');
  }

  // ── keyboard (capture phase, so Q never reaches the camera-turn keys) ────────
  onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyQ') {
      if (!this.h.onFoot() && !this.isOpen) return;
      if (!e.repeat) this.toggle();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (!this.isOpen) return;
    const m = /^Digit([1-6])$/.exec(e.code);
    if (m) this.pick(parseInt(m[1], 10) - 1);
    else if (e.code !== 'Escape') return;
    else this.close();
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  dispose(): void {
    this.reset();
    this.root.remove();
  }
}
