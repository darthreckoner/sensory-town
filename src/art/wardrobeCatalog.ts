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
import { tuning } from '../tuning';
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

/**
 * Suggested default colors for the parts that have an obvious one (denim is blue, a rain jacket is yellow...).
 * Use `suggestedColor` for locker thumbnails and for a part's first preview; any palette color is still allowed.
 */
const SUGGESTED: Record<CatalogSlot, Record<string, string>> = {
  hair: { 'Beaded Braids': '#16151c', Pigtails: '#16151c', 'Big Puff': '#16151c', 'Side Shave': '#7d1f3a', 'Sleek Long': '#16151c', Fauxhawk: '#ff2e88', 'Bob & Bangs': '#3a3a44', Pixie: '#b8a07a' },
  top: {
    'Crop Hoodie': '#b9a6ff', 'Denim Jacket': '#3d5a80', 'Sequin Tank': '#ff2e88', 'Bolt Tee': '#16151c', 'Tie-Dye Tee': '#3d6bff', Overalls: '#3d5a80', 'Racing Jacket': '#e23b3b',
    'Ski Jacket': '#00d4ff', 'Quarter-Zip': '#7c4dff', Cardigan: '#f6b8c8', 'Tank & Flannel': '#e23b3b', 'Rain Jacket': '#ffc93c', Bomber: '#2f6b4f', 'Ruffle Blouse': '#f6f6f4',
    Turtleneck: '#b8a07a', 'Puffer Vest': '#ff8a3d', 'Halter Crop': '#ff2e88', 'Hoops Jersey': '#7c4dff', 'Teddy Jacket': '#efe6d2', 'Tropical Shirt': '#00b3a4', 'Neon Jacket': '#16151c',
    'Astro Suit': '#f6f6f4', 'Unicorn Onesie': '#f6b8c8', 'Dino Suit': '#2f6b4f', 'Racer Suit': '#e23b3b', 'Chef Coat': '#f6f6f4', 'Scale Top': '#00b3a4', 'Hero Suit': '#3d6bff', 'Explorer Parka': '#ff8a3d', 'Panda Onesie': '#f6f6f4',
  },
  bottom: {
    Tutu: '#f6b8c8', 'Board Shorts': '#00b3a4', 'Sparkle Leggings': '#7c4dff', 'Snow Pants': '#22304f', Kilt: '#7d1f3a', Cutoffs: '#3d5a80', 'Parachute Pants': '#16151c', 'Skater Skirt': '#16151c',
    'Ripped Jeans': '#22304f', 'Gym Shorts': '#16151c', 'Cozy Pants': '#3d5a80', 'Astro Legs': '#f6f6f4', 'Unicorn Legs': '#f6b8c8', 'Dino Legs': '#2f6b4f', 'Racer Pants': '#e23b3b',
    'Chef Pants': '#f6f6f4', 'Scale Leggings': '#00b3a4', 'Hero Tights': '#3d6bff', 'Panda Legs': '#f6f6f4',
  },
  shoes: {
    Platforms: '#f6f6f4', 'Light-Ups': '#16151c', 'Rain Boots': '#ffc93c', 'Snow Boots': '#3a3a44', 'Roller Skates': '#ff2e88', 'Ballet Flats': '#f6b8c8', 'Glitter Hi-Tops': '#ff2e88',
    'Cowboy Boots': '#b8a07a', 'Jelly Sandals': '#ff2e88', Clogs: '#00d4ff', 'Fuzzy Boots': '#efe6d2', 'Moon Boots': '#f6f6f4', 'Knee Boots': '#e23b3b', 'Ice Skates': '#f6f6f4', 'Driver Shoes': '#16151c',
  },
  accessory: {
    'Cat Ears': '#16151c', 'Bunny Ears': '#f6f6f4', 'Pom Beanie': '#ff2e88', 'Ball Cap': '#e23b3b', 'Star Shades': '#ffc93c', 'Heart Shades': '#ff2e88', 'Ski Goggles': '#00d4ff', Tiara: '#ffc93c',
    'Flower Crown': '#ff2e88', Headset: '#ff2e88', 'Big Bow': '#ff2e88', Scarf: '#e23b3b', Choker: '#16151c', 'Chain Belt': '#8d8b96', 'Wrist Stack': '#ff2e88', 'Face Stickers': '#ff2e88',
    'Whisker Paint': '#16151c', 'Royal Mantle': '#7d1f3a', 'Fairy Wings': '#b9a6ff', 'Bat Wings': '#7c4dff', Pearls: '#f6f6f4', Bandana: '#e23b3b', 'Star Clips': '#ffc93c', 'Ear Muffs': '#f6b8c8',
    Sweatband: '#e23b3b', 'Cowboy Hat': '#b8a07a', 'Wizard Hat': '#7c4dff', Lollipop: '#ff2e88', Balloon: '#ff2e88', 'Ice Cream': '#f6b8c8', Antennae: '#ffc93c', Halo: '#ffc93c',
    'Space Helmet': '#00d4ff', 'Unicorn Hood': '#f6b8c8', 'Dino Hood': '#2f6b4f', 'Hero Cape': '#e23b3b', 'Chef Hat': '#f6f6f4', 'Fur Hat': '#b8a07a', 'Racer Helmet': '#e23b3b', 'Panda Hood': '#f6f6f4',
  },
};
/** A good first color for a part (falls back to a palette color that varies with the style index). */
export function suggestedColor(slot: CatalogSlot, style: number): string {
  const name = OUTFIT_CATALOG[slot][style]?.name ?? '';
  return SUGGESTED[slot][name] ?? tuning.art.palette[(style * 7 + 3) % tuning.art.palette.length];
}

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

interface SuitSpec {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  blurb: string;
  top: [string, string];
  bottom: [string, string];
  shoes: [string, string];
  accessory?: [string, string];
  hair?: [string, string];
}
const suit = (s: SuitSpec): SuitDef => ({
  id: s.id, name: s.name, icon: s.icon, rarity: s.rarity, blurb: s.blurb,
  top: P('top', ...s.top),
  bottom: P('bottom', ...s.bottom),
  shoes: P('shoes', ...s.shoes),
  accessory: s.accessory ? P('accessory', ...s.accessory) : null,
  ...(s.hair ? { hair: P('hair', ...s.hair) } : {}),
});

/** Full-body suits: every piece is a normal wardrobe part, so kids can also mix them piece by piece. */
export const WARDROBE_SUITS: SuitDef[] = [
  suit({ id: 'astro', name: 'Astro Explorer', icon: '🧑‍🚀', rarity: 'epic', blurb: 'Bubble helmet, moon boots, control panel chest.', top: ['Astro Suit', '#f6f6f4'], bottom: ['Astro Legs', '#f6f6f4'], shoes: ['Moon Boots', '#f6f6f4'], accessory: ['Space Helmet', '#00d4ff'] }),
  suit({ id: 'unicorn', name: 'Unicorn Onesie', icon: '🦄', rarity: 'legendary', blurb: 'Rainbow mane, golden horn, fluffy hooves.', top: ['Unicorn Onesie', '#f6b8c8'], bottom: ['Unicorn Legs', '#f6b8c8'], shoes: ['Fuzzy Boots', '#f6f6f4'], accessory: ['Unicorn Hood', '#f6b8c8'] }),
  suit({ id: 'dino', name: 'Dino Hoodie Suit', icon: '🦖', rarity: 'epic', blurb: 'Spikes down the back and a tail that swishes.', top: ['Dino Suit', '#2f6b4f'], bottom: ['Dino Legs', '#2f6b4f'], shoes: ['Platforms', '#6b7a3c'], accessory: ['Dino Hood', '#2f6b4f'] }),
  suit({ id: 'racer', name: 'Racer', icon: '🏎️', rarity: 'rare', blurb: 'Sponsor patches, stripes and a hot helmet.', top: ['Racer Suit', '#e23b3b'], bottom: ['Racer Pants', '#e23b3b'], shoes: ['Driver Shoes', '#16151c'], accessory: ['Racer Helmet', '#e23b3b'] }),
  suit({ id: 'chef', name: 'Head Chef', icon: '🧑‍🍳', rarity: 'uncommon', blurb: 'Double-breasted coat, checker pants, tall hat.', top: ['Chef Coat', '#f6f6f4'], bottom: ['Chef Pants', '#f6f6f4'], shoes: ['Clogs', '#16151c'], accessory: ['Chef Hat', '#f6f6f4'] }),
  suit({ id: 'mermaid', name: 'Mermaid Shimmer', icon: '🧜‍♀️', rarity: 'epic', blurb: 'Scale bodysuit, fin cuffs, jelly sandals, tiara.', top: ['Scale Top', '#00b3a4'], bottom: ['Scale Leggings', '#00b3a4'], shoes: ['Jelly Sandals', '#ff2e88'], accessory: ['Tiara', '#ffc93c'], hair: ['Sleek Long', '#7c4dff'] }),
  suit({ id: 'hero', name: 'Super Spark', icon: '🦸‍♀️', rarity: 'legendary', blurb: 'Emblem suit, cape and mask. No weapons, just style.', top: ['Hero Suit', '#3d6bff'], bottom: ['Hero Tights', '#3d6bff'], shoes: ['Knee Boots', '#e23b3b'], accessory: ['Hero Cape', '#e23b3b'] }),
  suit({ id: 'snow', name: 'Snow Explorer', icon: '🧭', rarity: 'rare', blurb: 'Fur-hood parka, puffy snow pants and a fur hat.', top: ['Explorer Parka', '#ff8a3d'], bottom: ['Snow Pants', '#22304f'], shoes: ['Snow Boots', '#3a3a44'], accessory: ['Fur Hat', '#b8a07a'] }),
  suit({ id: 'panda', name: 'Panda Onesie', icon: '🐼', rarity: 'epic', blurb: 'Black-and-white cozy onesie with a panda hood.', top: ['Panda Onesie', '#f6f6f4'], bottom: ['Panda Legs', '#f6f6f4'], shoes: ['Fuzzy Boots', '#16151c'], accessory: ['Panda Hood', '#f6f6f4'] }),
];

/**
 * Ready-made styled looks built only from normal parts (no matching suit pieces): ideas the Locker can
 * turn into skins. Hair is part of the look.
 */
export const WARDROBE_LOOKS: SuitDef[] = [
  suit({ id: 'popstar', name: 'Pop Star', icon: '🎤', rarity: 'epic', blurb: 'Sequins, sparkle leggings, glitter hi-tops.', top: ['Sequin Tank', '#ff2e88'], bottom: ['Sparkle Leggings', '#16151c'], shoes: ['Glitter Hi-Tops', '#f6f6f4'], accessory: ['Star Shades', '#ffc93c'], hair: ['Scrunch Pony', '#16151c'] }),
  suit({ id: 'skater', name: 'Skate Park', icon: '🛹', rarity: 'common', blurb: 'Bolt tee, cutoffs, a cap on backwards-ish.', top: ['Bolt Tee', '#16151c'], bottom: ['Cutoffs', '#3d5a80'], shoes: ['Skate', '#e23b3b'], accessory: ['Ball Cap', '#16151c'], hair: ['Messy Bun', '#6e4a33'] }),
  suit({ id: 'cowgirl', name: 'Rodeo Star', icon: '🤠', rarity: 'uncommon', blurb: 'Denim, boots and a big hat.', top: ['Denim Jacket', '#3d5a80'], bottom: ['Ripped Jeans', '#22304f'], shoes: ['Cowboy Boots', '#b8a07a'], accessory: ['Cowboy Hat', '#b8a07a'], hair: ['Side Braid', '#6e4a33'] }),
  suit({ id: 'gamer', name: 'Neon Gamer', icon: '🎮', rarity: 'epic', blurb: 'Glowing jacket, light-up kicks, headset.', top: ['Neon Jacket', '#16151c'], bottom: ['Parachute Pants', '#7c4dff'], shoes: ['Light-Ups', '#f6f6f4'], accessory: ['Headset', '#00d4ff'], hair: ['Pigtails', '#ff2e88'] }),
  suit({ id: 'rainy', name: 'Puddle Jumper', icon: '🌧️', rarity: 'common', blurb: 'Yellow slicker, rain boots, bucket hat.', top: ['Rain Jacket', '#ffc93c'], bottom: ['Cozy Pants', '#3d5a80'], shoes: ['Rain Boots', '#ffc93c'], accessory: ['Bucket', '#ffc93c'], hair: ['Bob & Bangs', '#6e4a33'] }),
  suit({ id: 'varsity', name: 'Varsity Captain', icon: '🏈', rarity: 'uncommon', blurb: 'Letterman jacket, pleated skirt, high pony.', top: ['Varsity', '#7c4dff'], bottom: ['Pleated', '#16151c'], shoes: ['Chunky', '#f6f6f4'], accessory: ['Scrunchie', '#ff2e88'], hair: ['Pony', '#6e4a33'] }),
  suit({ id: 'cozy', name: 'Cozy Cloud', icon: '☁️', rarity: 'rare', blurb: 'Teddy fleece, fuzzy boots, ear muffs.', top: ['Teddy Jacket', '#efe6d2'], bottom: ['Cozy Pants', '#8d8b96'], shoes: ['Fuzzy Boots', '#f6f6f4'], accessory: ['Ear Muffs', '#f6b8c8'], hair: ['Half-Up', '#6e4a33'] }),
  suit({ id: 'beach', name: 'Beach Day', icon: '🌴', rarity: 'uncommon', blurb: 'Tropical shirt, board shorts, jelly sandals.', top: ['Tropical Shirt', '#00b3a4'], bottom: ['Board Shorts', '#ff8a3d'], shoes: ['Jelly Sandals', '#ff2e88'], accessory: ['Flower Crown', '#ff2e88'], hair: ['Clip Waves', '#6e4a33'] }),
  suit({ id: 'royal', name: 'Royal Highness', icon: '👸', rarity: 'epic', blurb: 'Ruffle blouse, tutu and a tiara.', top: ['Ruffle Blouse', '#f6b8c8'], bottom: ['Tutu', '#b9a6ff'], shoes: ['Ballet Flats', '#ffc93c'], accessory: ['Tiara', '#ffc93c'], hair: ['Sleek Long', '#3a3a44'] }),
  suit({ id: 'wizard', name: 'Wizard Academy', icon: '🧙', rarity: 'rare', blurb: 'Knit, tartan kilt, tall boots, pointy hat.', top: ['Turtleneck', '#16151c'], bottom: ['Kilt', '#7d1f3a'], shoes: ['Boots', '#16151c'], accessory: ['Wizard Hat', '#7c4dff'], hair: ['Bangs', '#16151c'] }),
  suit({ id: 'hoops', name: 'Hoops Star', icon: '🏀', rarity: 'common', blurb: 'Jersey, gym shorts, sweatband, hi-tops.', top: ['Hoops Jersey', '#ff8a3d'], bottom: ['Gym Shorts', '#16151c'], shoes: ['Hi-tops', '#e23b3b'], accessory: ['Sweatband', '#f6f6f4'], hair: ['Pony', '#16151c'] }),
  suit({ id: 'ski', name: 'Ski Trip', icon: '⛷️', rarity: 'uncommon', blurb: 'Bright ski jacket, snow pants, goggles.', top: ['Ski Jacket', '#00d4ff'], bottom: ['Snow Pants', '#16151c'], shoes: ['Snow Boots', '#f6f6f4'], accessory: ['Ski Goggles', '#ff2e88'], hair: ['Braids', '#6e4a33'] }),
  suit({ id: 'disco', name: 'Disco Fever', icon: '🪩', rarity: 'rare', blurb: 'Tie-dye, sparkle leggings, heart shades, big puff.', top: ['Tie-Dye Tee', '#7c4dff'], bottom: ['Sparkle Leggings', '#ff2e88'], shoes: ['Platforms', '#f6f6f4'], accessory: ['Heart Shades', '#ff2e88'], hair: ['Big Puff', '#16151c'] }),
  suit({ id: 'forest', name: 'Forest Fairy', icon: '🧚', rarity: 'epic', blurb: 'Halter top, leafy tutu, butterfly wings.', top: ['Halter Crop', '#2f6b4f'], bottom: ['Tutu', '#9fb59a'], shoes: ['Ballet Flats', '#2f6b4f'], accessory: ['Fairy Wings', '#b9a6ff'], hair: ['Pixie', '#6b7a3c'] }),
  suit({ id: 'spooky', name: 'Spooky Cute', icon: '🦇', rarity: 'epic', blurb: 'Black hoodie, kilt and bat wings.', top: ['Crop Hoodie', '#16151c'], bottom: ['Kilt', '#16151c'], shoes: ['Platforms', '#16151c'], accessory: ['Bat Wings', '#7c4dff'], hair: ['Bob & Bangs', '#16151c'] }),
  suit({ id: 'bunny', name: 'Bunny Hop', icon: '🐰', rarity: 'uncommon', blurb: 'Pink hoodie, biker shorts, long ears.', top: ['Crop Hoodie', '#f6b8c8'], bottom: ['Biker', '#f6f6f4'], shoes: ['Platforms', '#f6f6f4'], accessory: ['Bunny Ears', '#f6f6f4'], hair: ['Pigtails', '#6e4a33'] }),
  suit({ id: 'street', name: 'Streetwear', icon: '🧢', rarity: 'rare', blurb: 'Bomber, cargo, hi-tops and a fauxhawk.', top: ['Bomber', '#16151c'], bottom: ['Cargo', '#6b7a3c'], shoes: ['Hi-tops', '#ffc93c'], accessory: ['Chain', '#ffc93c'], hair: ['Fauxhawk', '#ff2e88'] }),
];

/** Every ready-made bundle: the 9 full-body suits first, then the styled looks. */
export const WARDROBE_PRESETS: SuitDef[] = [...WARDROBE_SUITS, ...WARDROBE_LOOKS];

/** A copy of outfit `o` wearing suit / look `id` (the skin tone and any slot the preset leaves open are kept). */
export function suitOutfit(id: string, o: Outfit): Outfit {
  const s = WARDROBE_PRESETS.find((x) => x.id === id);
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
