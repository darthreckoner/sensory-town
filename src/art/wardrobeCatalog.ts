// Wardrobe metadata for the Locker (W2): every part of every slot with its rarity, plus the
// coordinated full-body suits. The look itself lives in characterParts / characterHair / wardrobe*.ts;
// OUTFIT_CATALOG (characterParts.ts) stays the source of names + icons, this file adds rarity.
//
//   WARDROBE[slot]      [{ style, name, icon, rarity }]   style = index into OUTFIT_CATALOG[slot] and Outfit[slot].style
//   WARDROBE_SUITS      ready-made bundles (top + bottom + shoes + accessory [+ hair]) with colors: the "full-body suits"
//   suitOutfit(id, o)   a copy of outfit `o` dressed in the suit
//   itemByName(slot, n) style index of a part by its name (stable even if styles are appended later)
//
// Styles are only ever APPENDED, so saved outfits keep their look.
import type { Outfit } from '../core/model';
import { OUTFIT_CATALOG, type CatalogSlot } from './characterParts';
import { HAIR_RARITY } from './characterHair';
import { TOP_V3 } from './wardrobeTops';
import { BOTTOM_V3 } from './wardrobeBottoms';
import { SHOE_V3 } from './wardrobeShoes';
import { ACC_V3 } from './wardrobeAcc';
import type { Rarity } from './wardrobeKit';

export type { Rarity };
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Fortnite-style rarity frame colors (frame / glow). */
export const RARITY_COLOR: Record<Rarity, string> = { common: '#b1b9c8', uncommon: '#4bd36a', rare: '#3fa9ff', epic: '#b45cff', legendary: '#ffb02e' };

export interface WardrobeItem {
  /** index into OUTFIT_CATALOG[slot] (and Outfit[slot].style) */
  style: number;
  name: string;
  icon: string;
  rarity: Rarity;
  /** unlock id (src/core/unlocks.ts) for charm-gated bonus items */
  reward?: string;
  /** part of a full-body suit (see WARDROBE_SUITS) */
  suit?: string;
}

// Rarity of the original v2 parts (indices 0..n-1 of each slot); the v3 parts carry theirs in their defs.
const V2_RARITY: Record<CatalogSlot, Rarity[]> = {
  hair: ['common', 'common', 'common', 'uncommon', 'common', 'uncommon', 'uncommon', 'uncommon', 'common', 'uncommon', 'uncommon', 'common'],
  top: ['common', 'common', 'common', 'uncommon', 'uncommon', 'common', 'common', 'uncommon', 'common', 'common'],
  bottom: ['common', 'common', 'common', 'common', 'common', 'uncommon', 'common', 'common'],
  shoes: ['common', 'common', 'uncommon', 'common', 'common', 'uncommon', 'epic'],
  accessory: ['common', 'uncommon', 'common', 'common', 'common', 'common', 'uncommon', 'uncommon', 'common', 'common', 'common', 'common', 'legendary', 'legendary'],
};
const V3_DEFS: Record<CatalogSlot, { rarity: Rarity; suit?: string }[]> = {
  hair: HAIR_RARITY,
  top: TOP_V3,
  bottom: BOTTOM_V3,
  shoes: SHOE_V3,
  accessory: ACC_V3,
};

function build(slot: CatalogSlot): WardrobeItem[] {
  const v2 = V2_RARITY[slot];
  const v3 = V3_DEFS[slot];
  return OUTFIT_CATALOG[slot].map((it, i) => {
    const d = i < v2.length ? undefined : v3[i - v2.length];
    return {
      style: i,
      name: it.name,
      icon: it.icon,
      rarity: i < v2.length ? v2[i] : d?.rarity ?? 'common',
      ...(it.reward ? { reward: it.reward } : {}),
      ...(d?.suit ? { suit: d.suit } : {}),
    };
  });
}

export const WARDROBE: Record<CatalogSlot, WardrobeItem[]> = {
  hair: build('hair'),
  top: build('top'),
  bottom: build('bottom'),
  shoes: build('shoes'),
  accessory: build('accessory'),
};

/** Total number of wearable parts (accessory 0 = "None" is not counted). */
export const WARDROBE_COUNT = Object.values(WARDROBE).reduce((n, list) => n + list.length, 0) - 1;

/** Style index of a part by its (unique per slot) name; -1 when missing. */
export function itemByName(slot: CatalogSlot, name: string): number {
  return OUTFIT_CATALOG[slot].findIndex((it) => it.name === name);
}

export interface SuitPart {
  style: number;
  color: string;
}
export interface SuitDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  /** one-line pitch for the locker card */
  blurb: string;
  top: SuitPart;
  bottom: SuitPart;
  shoes: SuitPart;
  accessory: SuitPart | null;
  hair?: SuitPart;
}

const P = (slot: CatalogSlot, name: string, color: string): SuitPart => {
  const style = itemByName(slot, name);
  if (style < 0) throw new Error(`wardrobe: no ${slot} named "${name}"`);
  return { style, color };
};

/** Full-body suits: every piece is a normal wardrobe part, so kids can also mix them piece by piece. */
export const WARDROBE_SUITS: SuitDef[] = [];
export function defineSuit(s: Omit<SuitDef, 'top' | 'bottom' | 'shoes' | 'accessory' | 'hair'> & { top: [string, string]; bottom: [string, string]; shoes: [string, string]; accessory?: [string, string]; hair?: [string, string] }): void {
  WARDROBE_SUITS.push({
    id: s.id, name: s.name, icon: s.icon, rarity: s.rarity, blurb: s.blurb,
    top: P('top', s.top[0], s.top[1]),
    bottom: P('bottom', s.bottom[0], s.bottom[1]),
    shoes: P('shoes', s.shoes[0], s.shoes[1]),
    accessory: s.accessory ? P('accessory', s.accessory[0], s.accessory[1]) : null,
    ...(s.hair ? { hair: P('hair', s.hair[0], s.hair[1]) } : {}),
  });
}

/** A copy of outfit `o` wearing suit `id` (the skin tone and any slot the suit leaves open are kept). */
export function suitOutfit(id: string, o: Outfit): Outfit {
  const s = WARDROBE_SUITS.find((x) => x.id === id);
  const out = structuredClone(o);
  if (!s) return out;
  out.top = { ...s.top };
  out.bottom = { ...s.bottom };
  out.shoes = { ...s.shoes };
  if (s.accessory) out.accessory = { ...s.accessory };
  else out.accessory = { style: 0, color: o.accessory.color };
  if (s.hair) out.hair = { ...s.hair };
  return out;
}
