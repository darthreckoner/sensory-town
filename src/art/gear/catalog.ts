// ── v3 locker ── The Locker catalog: every cosmetic slot, its items, rarity and unlock id.
// Data only (no THREE) so unlocks.ts, the Locker scene and the reveal card can all import it.
//
// Naming rule for unlock ids (the charm ladder in core/unlocks.ts uses the same ids):
//   skin.<id> · style.<skinId>.<n> · bling.<id> · glider.<id> · trail.<id> · emote.<id> · wrap.<finish> · ride.<kind>
// An item with no `reward` is owned from the start.
import type { Hex, VehicleKind } from '../../core/model';
import { EMOTES as CHAR_EMOTES } from '../character';
import { OUTFIT_CATALOG } from '../characterParts';
import { WARDROBE_SUITS } from '../wardrobeCatalog';
import { FACE_OPTIONS } from '../characterFace';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY: Record<Rarity, { label: string; color: string; light: string; deep: string }> = {
  common: { label: 'Common', color: '#b7bcc9', light: '#e4e7f0', deep: '#4b5170' },
  uncommon: { label: 'Uncommon', color: '#5fd447', light: '#aef59a', deep: '#1f6b2c' },
  rare: { label: 'Rare', color: '#36a8ff', light: '#9bd6ff', deep: '#14509a' },
  epic: { label: 'Epic', color: '#b65cff', light: '#dcaeff', deep: '#5a1fa8' },
  legendary: { label: 'Legendary', color: '#ffb02e', light: '#ffe08a', deep: '#a64d00' },
};
export const rarityRank = (r: Rarity): number => RARITY_ORDER.indexOf(r);

export type LockerSlot = 'outfit' | 'backBling' | 'glider' | 'contrail' | 'emote' | 'wrap' | 'custom';
/** Slots that have a list of collectable items (everything but Custom). */
export type ItemSlot = 'outfit' | 'backBling' | 'glider' | 'contrail' | 'emote' | 'ride';

export interface GearItem {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  /** unlock id that gates this item (see core/unlocks.ts); undefined = owned from the start */
  reward?: string;
  blurb?: string;
}

const item = (prefix: string, id: string, name: string, icon: string, rarity: Rarity, locked = false, blurb?: string): GearItem => ({
  id, name, icon, rarity, blurb, reward: locked ? `${prefix}.${id}` : undefined,
});

// ── Back blings (16) — builders in backBling.ts ──────────────────────────────
export const BACK_BLINGS: GearItem[] = [
  item('bling', 'minipack', 'Mini Pack', '🎒', 'common'),
  item('bling', 'skateboard', 'Deck Back', '🛹', 'common'),
  item('bling', 'bunny', 'Bunny Plush', '🐰', 'uncommon', true),
  item('bling', 'guitar', 'Strum Buddy', '🎸', 'uncommon', true),
  item('bling', 'boba', 'Boba Buddy', '🧋', 'uncommon', true),
  item('bling', 'catpack', 'Cat Pack', '🐱', 'uncommon', true),
  item('bling', 'butterfly', 'Flutter Wings', '🦋', 'rare', true),
  item('bling', 'jetpack', 'Tiny Jetpack', '🚀', 'rare', true),
  item('bling', 'balloon', 'Star Balloon', '🎈', 'rare', true),
  item('bling', 'shell', 'Shell Pack', '🐚', 'rare', true),
  item('bling', 'angel', 'Halo Wings', '😇', 'epic', true),
  item('bling', 'rainbowcape', 'Rainbow Cape', '🌈', 'legendary', true),
  item('bling', 'lollipop', 'Swirl Lollipop', '🍭', 'uncommon', true),
  item('bling', 'donut', 'Donut Float', '🍩', 'rare', true),
  item('bling', 'unicorn', 'Unicorn Plush', '🦄', 'epic', true),
  item('bling', 'dragonwings', 'Dragon Wings', '🐲', 'legendary', true),
];

// ── Gliders (12) — builders in gliders.ts ─────────────────────────────────────
export const GLIDERS: GearItem[] = [
  item('glider', 'starter', 'Rainbow Parafoil', '🪂', 'common'),
  item('glider', 'paperplane', 'Paper Plane', '✈️', 'common'),
  item('glider', 'umbrella', 'Brolly', '☂️', 'uncommon', true),
  item('glider', 'balloons', 'Balloon Bunch', '🎈', 'uncommon', true),
  item('glider', 'butterfly', 'Flutterwing', '🦋', 'rare', true),
  item('glider', 'pizza', 'Pizza Slice', '🍕', 'rare', true),
  item('glider', 'cloud', 'Puff Cloud', '☁️', 'epic', true),
  item('glider', 'dragonfly', 'Dragonfly', '🐉', 'epic', true),
  item('glider', 'kite', 'Candy Kite', '🪁', 'uncommon', true),
  item('glider', 'jellyfish', 'Jelly Drift', '🪼', 'rare', true),
  item('glider', 'daisy', 'Daisy Drift', '🌼', 'rare', true),
  item('glider', 'shootingstar', 'Shooting Star', '🌠', 'legendary', true),
];

// ── Contrails (6) — builders in contrails.ts ─────────────────────────────────
export const CONTRAILS: GearItem[] = [
  item('trail', 'sparkles', 'Sparkles', '✨', 'uncommon', true),
  item('trail', 'hearts', 'Heart Trail', '💖', 'uncommon', true),
  item('trail', 'stars', 'Star Trail', '⭐', 'rare', true),
  item('trail', 'bubbles', 'Bubble Trail', '🫧', 'rare', true),
  item('trail', 'confetti', 'Confetti', '🎉', 'epic', true),
  item('trail', 'rainbow', 'Rainbow Road', '🌈', 'legendary', true),
];

// ── Emotes — the ids come from the character's own list (character.EMOTES → playEmote(id)); this adds the
// fun names, icons and rarity. Any emote the character agent adds later shows up here automatically (common, free). ──
const EMOTE_META: Record<string, { name: string; icon: string; rarity: Rarity; locked?: boolean }> = {
  wave: { name: 'Hello Wave', icon: '👋', rarity: 'common' },
  cheer: { name: 'Cheer Jump', icon: '🙌', rarity: 'common' },
  bounce: { name: 'Bounce Party', icon: '💃', rarity: 'common' },
  tada: { name: 'Ta-da!', icon: '🎉', rarity: 'uncommon', locked: true },
  twirl: { name: 'Twirl Time', icon: '🌀', rarity: 'uncommon', locked: true },
  giggle: { name: 'Giggle Fit', icon: '🤣', rarity: 'uncommon', locked: true },
  heart: { name: 'Heart Hands', icon: '🫶', rarity: 'rare', locked: true },
  shuffle: { name: 'Side Shuffle', icon: '🕺', rarity: 'rare', locked: true },
  robot: { name: 'Robo Bop', icon: '🤖', rarity: 'epic', locked: true },
  swing: { name: 'Sit & Swing', icon: '🪑', rarity: 'epic', locked: true },
  sway: { name: 'Glow Stick Sway', icon: '🪄', rarity: 'legendary', locked: true },
  party: { name: 'Party Dance', icon: '🪩', rarity: 'epic', locked: true }, // real motion (Dance_Loop)
};
export const EMOTES: GearItem[] = CHAR_EMOTES.map((e) => {
  const m = EMOTE_META[e.id];
  return item('emote', e.id, m?.name ?? e.name, m?.icon ?? '💃', m?.rarity ?? 'common', !!m?.locked);
}).sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
export const EMOTE_SLOTS = 6;

// ── Rides (6) + wrap finishes ────────────────────────────────────────────────
export const RIDES: (GearItem & { id: VehicleKind })[] = [
  { ...item('ride', 'sports', 'Comet Coupe', '🏎️', 'common'), id: 'sports' },
  { ...item('ride', 'golfcart', 'Cruiser Cart', '🛺', 'common'), id: 'golfcart' },
  { ...item('ride', 'pickup', 'Trail Truck', '🛻', 'uncommon', true), id: 'pickup' },
  { ...item('ride', 'boat', 'Splash Boat', '🚤', 'uncommon', true), id: 'boat' },
  { ...item('ride', 'hoverboard', 'Glide Board', '🛹', 'rare', true), id: 'hoverboard' },
  { ...item('ride', 'icecream', 'Sundae Van', '🍦', 'epic', true), id: 'icecream' },
];
/** Wrap finishes. `chrome` keeps the v2 reward id so the old paint shop and the Locker agree. */
export const WRAP_FINISHES: GearItem[] = [
  { id: 'gloss', name: 'Gloss', icon: '✨', rarity: 'common' },
  { id: 'matte', name: 'Matte', icon: '🌫️', rarity: 'common' },
  { id: 'pearl', name: 'Pearl', icon: '🫧', rarity: 'rare', reward: 'wrap.pearl' },
  { id: 'chrome', name: 'Chrome', icon: '🪞', rarity: 'epic', reward: 'car.chrome' },
  { id: 'glitter', name: 'Glitter', icon: '💎', rarity: 'legendary', reward: 'wrap.glitter' },
];

// ── Skins ────────────────────────────────────────────────────────────────────
/** A part is a catalog name (or several, best first) so presets survive the wardrobe catalog growing. */
export type PartSpec = string | string[];
export interface SkinStyle {
  name: string;
  /** colours: [hair, top, bottom, shoes, accessory] ('' = keep what the player wears, for suits without hair / head gear) */
  c: [Hex, Hex, Hex, Hex, Hex];
  /** a special style is its own charm reward (`style.<skin>.<n>`) and shows one rarity higher */
  special?: boolean;
}
export interface SkinDef extends GearItem {
  /** hair undefined = keep the player's hair (full-body suits); accessory null = no accessory */
  parts: { hair?: PartSpec; top: PartSpec; bottom: PartSpec; shoes: PartSpec; accessory: PartSpec | null };
  styles: SkinStyle[];
  /** v2 part rewards this look wears (the skin is only wearable once those are unlocked) */
  needs?: string[];
}

type P5 = [PartSpec, PartSpec, PartSpec, PartSpec, PartSpec];
function skin(id: string, name: string, icon: string, rarity: Rarity, locked: boolean, p: P5, styles: SkinStyle[], needs?: string[]): SkinDef {
  return {
    ...item('skin', id, name, icon, rarity, locked),
    parts: { hair: p[0], top: p[1], bottom: p[2], shoes: p[3], accessory: p[4] },
    styles,
    needs,
  };
}
const st = (name: string, c: SkinStyle['c'], special = false): SkinStyle => ({ name, c, special });

// colour shorthands (the v2 fashion palette + a few Fortnite-bright extras)
const K = '#16151c', CH = '#3a3a44', GR = '#8d8b96', W = '#f6f6f4', CR = '#efe6d2', TAN = '#b8a07a', BR = '#6e4a33';
const DEN = '#3d5a80', NAVY = '#22304f', SAGE = '#9fb59a', FOR = '#2f6b4f', OLV = '#6b7a3c', WINE = '#7d1f3a', RED = '#e23b3b';
const ORG = '#ff8a3d', YEL = '#ffc93c', LIME = '#b6ff3b', TEAL = '#00b3a4', CYAN = '#00d4ff', BLUE = '#3d6bff', VIO = '#7c4dff';
const LIL = '#b9a6ff', PINK = '#ff2e88', BLSH = '#f6b8c8', GOLD = '#ffc61a';

export const SKINS: SkinDef[] = [
  // ── common (start with these) ──
  skin('sunnySurfer', 'Sunny Surfer', '🏄', 'common', false, ['Waves', 'Crop', 'Biker', 'Slides', 'Round'], [
    st('Sunny', [TAN, CYAN, ORG, W, YEL]), st('Coral', [BR, PINK, K, ORG, W]), st('Lagoon', [K, TEAL, BLUE, W, PINK]),
  ]),
  skin('courtKid', 'Court Kid', '🎾', 'common', false, ['Pony', 'Jersey', 'Tennis', 'Chunky', 'Cap'], [
    st('Ace', [BR, W, W, W, YEL]), st('Grape', [K, VIO, W, LIL, W]), st('Mint', [TAN, TEAL, CR, W, TEAL]),
  ]),
  skin('cozyCloud', 'Cozy Cloud', '☁️', 'common', false, ['Puffs', 'Hoodie', 'Joggers', 'Slides', 'Phones'], [
    st('Blush', [BR, BLSH, W, W, PINK]), st('Sky', [K, CYAN, CR, W, W]), st('Lilac', [WINE, LIL, GR, W, VIO]),
  ]),
  skin('pixelPal', 'Pixel Pal', '🎮', 'common', false, ['Quiff', 'Track', 'Cargo', 'Hi-tops', 'Phones'], [
    st('Arcade', [K, BLUE, CH, LIME, LIME]), st('Console', [BR, RED, K, W, W]), st('Glitch', [VIO, TEAL, K, PINK, CYAN]),
  ]),
  skin('picnicDay', 'Picnic Day', '🧺', 'common', false, ['Braids', 'Cami', 'Pleated', 'Janes', 'Scrunchie'], [
    st('Cherry', [BR, W, RED, RED, RED]), st('Lemon', [TAN, YEL, W, W, YEL]), st('Meadow', [K, SAGE, CR, FOR, SAGE]),
  ]),
  skin('trailScout', 'Trail Scout', '🥾', 'common', false, ['Knot', 'Flannel', 'Cargo', 'Boots', 'Bucket'], [
    st('Forest', [BR, RED, OLV, BR, OLV]), st('Sunrise', [K, ORG, CH, TAN, YEL]), st('Glacier', [TAN, DEN, NAVY, GR, W]),
  ]),
  // ── uncommon ──
  skin('glitterRacer', 'Glitter Racer', '🏁', 'uncommon', true, ['Pony', 'Track', 'Track', 'Chunky', 'Cap'], [
    st('Pink Rocket', [BR, PINK, W, W, YEL]), st('Gold Rush', [K, GOLD, K, GOLD, W]), st('Turbo Teal', [PINK, TEAL, W, K, CYAN], true),
  ]),
  skin('neonSkater', 'Neon Skater', '🛹', 'uncommon', true, ['Wolf', 'Hoodie', 'Cargo', 'Skate', 'Shades'], [
    st('Toxic Lime', [K, LIME, K, PINK, CYAN]), st('Hot Violet', [CYAN, VIO, CH, LIME, PINK]), st('Sunset', [BR, ORG, K, W, YEL], true),
  ]),
  skin('snowDay', 'Snow Day Sprinkles', '❄️', 'uncommon', true, ['Bob', 'Puffer', 'Joggers', 'Boots', 'Beanie'], [
    st('Ice', [BLSH, W, LIL, GR, PINK]), st('Frosted Berry', [K, PINK, W, W, W]), st('Blue Frost', [BR, CYAN, NAVY, W, CYAN]),
  ]),
  skin('starChef', 'Star Chef', '🧑‍🍳', 'uncommon', true, ['Braids', 'Vest', 'Baggy', 'Chunky', 'Bucket'], [
    st('Classic', [BR, W, DEN, W, W]), st('Berry Chef', [K, PINK, K, W, PINK]), st('Mint Chef', [TAN, TEAL, CH, W, W]),
  ]),
  skin('cometCat', 'Comet Cat', '🐱', 'uncommon', true, [['Buns', 'Puffs'], 'Hoodie', 'Biker', 'Hi-tops', ['Cat Ears', 'Phones']], [
    st('Nebula', [VIO, VIO, K, CYAN, PINK]), st('Stardust', [K, LIL, CH, W, YEL]), st('Meteor', [PINK, K, PINK, W, CYAN], true),
  ]),
  skin('bobaBreeze', 'Boba Breeze', '🧋', 'uncommon', true, ['Bangs', 'Crop', 'Pleated', 'Janes', 'Tumbler'], [
    st('Taro', [K, LIL, W, W, VIO]), st('Peach Tea', [BR, ORG, CR, W, ORG]), st('Matcha', [BR, SAGE, K, W, FOR]),
  ]),
  skin('studioSpark', 'Studio Spark', '🎧', 'uncommon', true, ['Curls', 'Cami', 'Flares', 'Boots', 'Phones'], [
    st('Neon Mix', [K, PINK, K, W, CYAN]), st('Golden Hour', [BR, YEL, WINE, K, W]), st('Cool Wave', [WINE, CYAN, NAVY, W, LIME]),
  ]),
  // ── rare ──
  skin('galaxyGamer', 'Galaxy Gamer', '🕹️', 'rare', true, ['Waves', 'Varsity', 'Joggers', 'Hi-tops', 'Phones'], [
    st('Deep Space', [VIO, NAVY, K, CYAN, CYAN]), st('Supernova', [PINK, VIO, K, YEL, YEL]), st('Alien Glow', [LIME, K, CH, LIME, LIME], true),
  ]),
  skin('jellyJet', 'Jelly Jet', '🪼', 'rare', true, ['Puffs', 'Puffer', 'Biker', 'Chunky', 'Shades'], [
    st('Bubblegum', [PINK, BLSH, PINK, W, W]), st('Blue Raspberry', [CYAN, BLUE, W, W, CYAN]), st('Grape Soda', [LIL, VIO, K, LIL, PINK]),
  ]),
  skin('cherryPop', 'Cherry Pop', '🍒', 'rare', true, ['Pony', 'Cami', 'Pleated', 'Janes', 'Scrunchie'], [
    st('Classic Red', [K, RED, W, RED, RED]), st('Candy Apple', [BR, WINE, RED, K, W]), st('Cherry Blossom', [WINE, BLSH, PINK, W, PINK]),
  ]),
  skin('moonlightMixer', 'Moonlight Mixer', '🪩', 'rare', true, ['Wolf', 'Hoodie', 'Cargo', 'Hi-tops', 'Phones'], [
    st('Club Night', [K, K, CH, VIO, PINK]), st('Laser Show', [PINK, CH, K, CYAN, LIME]), st('Gold Record', [K, GOLD, K, GOLD, W]),
  ]),
  skin('roboRascal', 'Robo Rascal', '🤖', 'rare', true, ['Fade', 'Vest', 'Track', 'Boots', 'Shades'], [
    st('Chrome', [GR, W, GR, CH, CYAN]), st('Gold Bot', [K, GOLD, CH, K, GOLD]), st('Pink Circuit', [PINK, GR, K, PINK, LIME]),
  ]),
  skin('dinoDash', 'Dino Dash', '🦖', 'rare', true, ['Fade', 'Hoodie', 'Cargo', 'Skate', 'Cap'], [
    st('Rex Green', [FOR, LIME, OLV, ORG, YEL]), st('Sunny Spike', [K, YEL, K, RED, ORG]), st('Ice Age', [BR, CYAN, NAVY, W, W]),
  ]),
  // ── epic ──
  skin('cosmicCheer', 'Cosmic Cheer', '⭐', 'epic', true, ['Pony', 'Varsity', 'Pleated', 'Chunky', 'Scrunchie'], [
    st('Starlight', [BR, VIO, W, W, GOLD]), st('Sunbeam', [K, GOLD, W, GOLD, W]), st('Galaxy Spirit', [PINK, NAVY, PINK, CYAN, W], true),
  ]),
  skin('dragonDrift', 'Dragon Drift', '🐉', 'epic', true, ['Quiff', 'Hoodie', 'Cargo', 'Boots', 'Chain'], [
    st('Ember', [RED, RED, K, GOLD, GOLD]), st('Jade', [FOR, TEAL, K, GOLD, LIME]), st('Storm', [CYAN, NAVY, CH, W, CYAN], true),
  ]),
  skin('auroraSkies', 'Aurora Skies', '🌌', 'epic', true, ['Waves', 'Puffer', 'Flares', 'Hi-tops', 'Beanie'], [
    st('Northern Lights', [TEAL, TEAL, VIO, W, PINK]), st('Pink Dawn', [PINK, PINK, LIL, W, CYAN]), st('Midnight Sky', [VIO, NAVY, K, CYAN, LIME], true),
  ]),
  skin('shadowSprite', 'Shadow Sprite', '🦇', 'epic', true, ['Curls', 'Hoodie', 'Biker', 'Boots', 'Shades'], [
    st('Violet Night', [K, K, K, VIO, VIO]), st('Neon Edge', [K, CH, K, LIME, LIME]), st('Rose Noir', [WINE, K, WINE, K, PINK]),
  ]),
  // ── legendary (they wear v2 reward parts, so they sit late in the ladder) ──
  skin('solarSparkle', 'Solar Sparkle', '☀️', 'legendary', true, ['Waves', 'Crop', 'Flares', 'LED', 'Round'], [
    st('Golden', [GOLD, GOLD, ORG, W, YEL]), st('Rose Gold', [BLSH, PINK, GOLD, W, GOLD]), st('Sun Flare', [ORG, RED, YEL, YEL, W]),
  ], ['outfit.ledkicks']),
  skin('midnightMirage', 'Midnight Mirage', '🌙', 'legendary', true, ['Wolf', 'Puffer', 'Cargo', 'Boots', 'Wings'], [
    st('Moonlit', [NAVY, K, K, VIO, LIL]), st('Eclipse', [K, VIO, K, GOLD, GOLD]), st('Dawn Break', [PINK, NAVY, CH, CYAN, W]),
  ], ['outfit.wings']),
  skin('prismParade', 'Prism Parade', '🌈', 'legendary', true, ['Puffs', 'Varsity', 'Flares', 'Hi-tops', 'Crown'], [
    st('Rainbow Pop', [PINK, W, CYAN, LIME, GOLD]), st('Sherbet', [ORG, BLSH, LIL, YEL, GOLD]), st('Disco Ball', [CYAN, VIO, PINK, YEL, GOLD]),
  ], ['outfit.crown']),
];

// ── full-body suits from the wardrobe catalog become skins too (astronaut, onesies, racer, chef …) ──
function shiftHue(hex: Hex, deg: number): Hex {
  if (!hex) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.12) return hex; // greys / whites / blacks stay
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}
function suitSkins(): SkinDef[] {
  const nm = (slot: 'hair' | 'top' | 'bottom' | 'shoes' | 'accessory', style: number) => OUTFIT_CATALOG[slot][style]?.name ?? OUTFIT_CATALOG[slot][0].name;
  return WARDROBE_SUITS.map((s) => {
    const base: SkinStyle['c'] = [s.hair?.color ?? '', s.top.color, s.bottom.color, s.shoes.color, s.accessory?.color ?? ''];
    const remix = (deg: number): SkinStyle['c'] => base.map((c) => shiftHue(c, deg)) as SkinStyle['c'];
    return {
      ...item('skin', 'suit_' + s.id, s.name, s.icon, s.rarity, true, s.blurb),
      parts: {
        hair: s.hair ? nm('hair', s.hair.style) : undefined,
        top: nm('top', s.top.style),
        bottom: nm('bottom', s.bottom.style),
        shoes: nm('shoes', s.shoes.style),
        accessory: s.accessory ? nm('accessory', s.accessory.style) : null,
      },
      styles: [{ name: 'Original', c: base }, { name: 'Remix', c: remix(48) }, { name: 'Flip', c: remix(-70) }],
    };
  });
}
SKINS.push(...suitSkins());

// ── face items on the charm ladder (the rest of the face options are free) ──
export type FaceField = 'eyes' | 'eyeColor' | 'brows' | 'freckles' | 'makeup' | 'sticker';
export interface FaceReward {
  reward: string;
  field: FaceField;
  /** the value stored in Outfit.face (eyes/makeup: a number; sticker: an id; eyeColor: the colour id from FACE_OPTIONS) */
  id: number | string;
  item: GearItem;
}
const FACE_SUFFIX: Record<FaceField, string> = { eyes: ' eyes', eyeColor: ' eyes', brows: ' brows', freckles: '', makeup: '', sticker: ' sticker' };
function faceReward(field: FaceField, id: number | string, reward: string): FaceReward[] {
  const it = FACE_OPTIONS[field].find((i) => i.id === id);
  if (!it) return [];
  return [{ reward, field, id, item: { id: reward, name: it.name + FACE_SUFFIX[field], icon: it.icon === '🎨' ? '👁️' : it.icon, rarity: it.rarity } }];
}
export const FACE_REWARDS: FaceReward[] = [
  ...faceReward('sticker', 'rainbow', 'face.sticker.rainbow'),
  ...faceReward('eyes', 4, 'face.eyes.4'),
  ...faceReward('makeup', 4, 'face.makeup.4'),
  ...faceReward('sticker', 'glitter', 'face.sticker.glitter'),
  ...faceReward('eyeColor', 'pink', 'face.eyecolor.pink'),
];
/** The unlock id gating a face option (undefined = free). */
export function faceRewardOf(field: FaceField, id: unknown): string | undefined {
  return FACE_REWARDS.find((f) => f.field === field && f.id === id)?.reward;
}

/** Unlock id of a skin style (style 0 and non-special styles come with the skin). */
export function styleReward(skinId: string, n: number): string | undefined {
  const s = SKINS.find((x) => x.id === skinId);
  return s?.styles[n]?.special ? `style.${skinId}.${n}` : undefined;
}

/** Rarity shown on a style chip: special styles sit one rarity above their skin. */
export function styleRarity(s: SkinDef, n: number): Rarity {
  const r = rarityRank(s.rarity);
  return s.styles[n]?.special ? RARITY_ORDER[Math.min(4, r + 1)] : s.rarity;
}

// ── lookups ──
export const SLOT_ITEMS: Record<ItemSlot, GearItem[]> = {
  outfit: SKINS,
  backBling: BACK_BLINGS,
  glider: GLIDERS,
  contrail: CONTRAILS,
  emote: EMOTES,
  ride: RIDES,
};
export function findItem(slot: ItemSlot, id: string): GearItem | undefined {
  return SLOT_ITEMS[slot].find((i) => i.id === id);
}
export function skinById(id: string): SkinDef | undefined {
  return SKINS.find((s) => s.id === id);
}

/** Every unlock id the catalog knows (unlocks.ts checks the ladder covers them all). */
export function allCatalogRewards(): { reward: string; item: GearItem; slot: ItemSlot | 'wrap' | 'style' | 'face' }[] {
  const out: { reward: string; item: GearItem; slot: ItemSlot | 'wrap' | 'style' | 'face' }[] = [];
  for (const f of FACE_REWARDS) out.push({ reward: f.reward, item: f.item, slot: 'face' });
  (Object.keys(SLOT_ITEMS) as ItemSlot[]).forEach((slot) => {
    for (const it of SLOT_ITEMS[slot]) if (it.reward) out.push({ reward: it.reward, item: it, slot });
  });
  for (const f of WRAP_FINISHES) if (f.reward && f.reward !== 'car.chrome') out.push({ reward: f.reward, item: f, slot: 'wrap' });
  for (const s of SKINS) {
    s.styles.forEach((x, n) => {
      if (x.special) out.push({ reward: `style.${s.id}.${n}`, item: { id: `${s.id}.${n}`, name: `${s.name}: ${x.name}`, icon: s.icon, rarity: styleRarity(s, n) }, slot: 'style' });
    });
  }
  return out;
}
