// ── v3 locker ── DOM pieces of the Locker: rarity-framed item cards, the info banner, chips, and the
// thumbnail makers that give every card a little 3D picture (emoji until the picture is ready).
import * as THREE from 'three';
import { el, bindTap } from './ui';
import { Character } from '../art/character';
import { RARITY, type Rarity } from '../art/gear/catalog';
import { thumbs, type ThumbSubject } from '../art/gear/thumbs';
import { makeBackBling } from '../art/gear/backBling';
import { makeGlider } from '../art/gear/gliders';
import { disposeGear } from '../art/gear/gearKit';
import { makeRidePreview, type WrapLook } from '../art/gear/rides';
import type { Outfit, VehicleKind } from '../core/model';

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Set the rarity colour variables (--rc main, --rd deep, --rl light) on an element. */
export function rarityVars(e: HTMLElement, r: Rarity): void {
  const c = RARITY[r];
  e.style.setProperty('--rc', c.color);
  e.style.setProperty('--rd', c.deep);
  e.style.setProperty('--rl', c.light);
}

export interface CardSpec {
  name: string;
  icon: string;
  rarity: Rarity;
  /** locked: padlock + "Find N more charms" */
  need?: number;
  on?: boolean;
  /** a little star badge (e.g. "my ride") */
  star?: boolean;
  /** taller portrait card (outfits) */
  tall?: boolean;
  /** small caption under the name */
  sub?: string;
  thumbKey?: string;
  thumb?: () => ThumbSubject | null;
}

/** A Fortnite-style item card: rarity-coloured frame + gradient, picture, name strip, padlock when locked. */
export function lockerCard(parent: HTMLElement, s: CardSpec, onTap: () => void): HTMLButtonElement {
  const locked = (s.need ?? 0) > 0;
  const b = el('button', `lk-card r-${s.rarity}${locked ? ' locked' : ''}${s.on ? ' on' : ''}${s.tall ? ' tall' : ''}`, parent);
  rarityVars(b, s.rarity);
  const art = el('div', 'lk-art', b);
  const ico = el('span', 'lk-ico', art, s.icon);
  if (s.thumbKey && s.thumb) {
    thumbs.request(
      s.thumbKey,
      s.thumb,
      (url) => {
        const img = new Image();
        img.src = url;
        img.draggable = false;
        img.className = 'lk-img';
        art.appendChild(img);
        ico.style.display = 'none';
      },
      () => b.isConnected,
    );
  }
  el('i', 'lk-pip', b);
  const nm = el('span', 'lk-name', b);
  nm.textContent = s.name;
  if (s.sub) el('span', 'lk-sub', b, escapeHtml(s.sub));
  if (s.on) el('span', 'lk-eq', b, '✔');
  if (s.star) el('span', 'lk-star', b, '⭐');
  if (locked) {
    const l = el('div', 'lk-lockov', b);
    el('span', 'lk-pad', l, '🔒');
    el('span', 'lk-need', l, `Find ${s.need} more charm${s.need === 1 ? '' : 's'}`);
  }
  bindTap(b, onTap);
  return b;
}

/** The selected item's banner: rarity-coloured name plate, rarity word and state. */
export class InfoBanner {
  readonly root: HTMLDivElement;
  private nameEl: HTMLElement;
  private rarEl: HTMLElement;
  private stateEl: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el('div', 'lk-info', parent) as HTMLDivElement;
    this.nameEl = el('div', 'lk-info-name', this.root);
    const row = el('div', 'lk-info-row', this.root);
    this.rarEl = el('span', 'lk-rar', row);
    this.stateEl = el('span', 'lk-state', row);
  }
  set(name: string, rarity: Rarity, state: 'equipped' | 'owned' | 'locked' | 'info', need = 0, extra = '', ownedText = 'TAP TO EQUIP'): void {
    rarityVars(this.root, rarity);
    this.nameEl.textContent = name;
    this.rarEl.textContent = RARITY[rarity].label + (extra ? ` · ${extra}` : '');
    this.root.classList.toggle('locked', state === 'locked');
    this.stateEl.textContent =
      state === 'equipped' ? '✔ EQUIPPED' : state === 'locked' ? `🔒 FIND ${need} MORE CHARM${need === 1 ? '' : 'S'}` : state === 'owned' ? ownedText : '';
  }
}

// ── thumbnail subjects ───────────────────────────────────────────────────────
/** A full-body character picture (turned a little toward the camera). */
export function outfitThumb(outfit: Outfit): () => ThumbSubject | null {
  return () => {
    const c = new Character(structuredClone(outfit), { shadows: false });
    c.update(0.05);
    c.group.rotation.y = -0.3;
    return { object: c.group, view: [0.12, 0.1, 1], fit: { center: [0, 0.92, 0], radius: 0.99 }, narrow: true, dispose: () => c.dispose() };
  };
}
export function blingThumb(id: string): () => ThumbSubject | null {
  return () => {
    const g = makeBackBling(id);
    return { object: g, view: [0.55, 0.32, 1], dispose: () => disposeGear(g) };
  };
}
export function gliderThumb(id: string): () => ThumbSubject | null {
  return () => {
    const g = makeGlider(id);
    // the whole glider (they are ~3 m across now): auto-fit, seen from the front and a little above
    return { object: g, view: [0.5, 0.6, 1], dispose: () => disposeGear(g) };
  };
}
export function rideThumb(kind: VehicleKind, wrap: WrapLook): () => ThumbSubject | null {
  return () => {
    const g = makeRidePreview(kind, wrap);
    g.rotation.y = 0.6;
    const root = new THREE.Group();
    root.add(g);
    return { object: root, view: [0.25, 0.4, 1], dispose: () => disposeGear(g) };
  };
}
