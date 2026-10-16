// Charms + the reward ladder. Charms are hidden around the island; each profile collects its
// own. Every charm milestone unlocks real stuff: Locker items (skins, styles, back blings,
// gliders, contrails, emotes, ride wraps, rides) and the Studio / Build bonuses from v2.
// Base content is never locked — anything not listed in REWARDS is always available.
//
// v3 locker: the ladder is spread over however many charms exist (CHARMS.length is read at
// runtime, never hard-coded), so adding more charms to the world just stretches the pacing.
//
// Usage in a module:
//   import { isUnlocked, rewardFor } from '../core/unlocks';
//   if (!isUnlocked('wax.chrome')) { show a 🔒 badge with rewardFor('wax.chrome')!.at; on tap → lockedToast('wax.chrome') }
import { store } from './store';
import { bus } from './events';
import { toast } from '../ui/ui';
import { CHARMS } from '../world/townLayout';
import { RARITY_ORDER, allCatalogRewards, type ItemSlot, type Rarity } from '../art/gear/catalog';

export interface Reward {
  id: string;        // namespaced: 'wax.*', 'slime.*', 'squishy.*', 'car.*', 'outfit.*', 'build.*', 'skin.*', 'style.*', 'bling.*', 'glider.*', 'trail.*', 'emote.*', 'wrap.*', 'ride.*'
  /** charms needed (spread over the world's charm count — always read this, never cache it) */
  readonly at: number;
  icon: string;
  label: string;     // short, cool
  where: string;     // where it shows up
  // v3 locker
  rarity: Rarity;
  /** Locker slot + item id when this reward is a Locker item (the reveal card offers "Equip") */
  slot?: ItemSlot | 'wrap' | 'style' | 'face';
  itemId?: string;
}

/** v2 rewards that stay (ids unchanged, so the Studio / Build / paint shop keep working). */
const LEGACY: Record<string, { icon: string; label: string; where: string; rarity: Rarity }> = {
  'wax.glitter': { icon: '✨', label: 'Glitter wax', where: 'Studio · Wax', rarity: 'uncommon' },
  'car.neon': { icon: '🌈', label: 'Neon underglow', where: 'Ride paint', rarity: 'uncommon' },
  'slime.holo': { icon: '🪩', label: 'Holo slime', where: 'Studio · Slime', rarity: 'rare' },
  'outfit.ledkicks': { icon: '👟', label: 'LED sneakers', where: 'Locker · Custom', rarity: 'rare' },
  'squishy.dragon': { icon: '🐉', label: 'Dragon squishy', where: 'Studio · Squishy', rarity: 'epic' },
  'build.neonsign': { icon: '💡', label: 'Neon signs', where: 'Build · Decor', rarity: 'rare' },
  'wax.chrome': { icon: '🪞', label: 'Chrome wax', where: 'Studio · Wax', rarity: 'rare' },
  'car.chrome': { icon: '🏎️', label: 'Chrome paint', where: 'Ride wraps', rarity: 'epic' },
  'outfit.wings': { icon: '🪽', label: 'Angel wings', where: 'Locker · Custom', rarity: 'epic' },
  'build.pool': { icon: '🏊', label: 'Pool + hot tub', where: 'Build · Outdoor', rarity: 'epic' },
  'slime.galaxy': { icon: '🌌', label: 'Galaxy slime', where: 'Studio · Slime', rarity: 'epic' },
  'car.trail': { icon: '💫', label: 'Sparkle trail', where: 'Ride wraps', rarity: 'rare' },
  'wax.glow': { icon: '🟢', label: 'Glow-in-the-dark wax', where: 'Studio · Wax', rarity: 'legendary' },
  'outfit.crown': { icon: '👑', label: 'Diamond crown', where: 'Locker · Custom', rarity: 'legendary' },
};

/**
 * The ladder, in unlock order. Rarity climbs through it but never in a straight line: there is
 * a treat at almost every charm and the legendaries land at the end. Skins that wear v2 parts
 * (LED kicks, wings, crown) come AFTER those parts. Anything in the catalog that is missing from
 * this list is spread evenly through it, rarest last (and warned about in dev, except wardrobe suits).
 */
const LADDER: string[] = [
  'bling.bunny', 'trail.sparkles', 'skin.glitterRacer', 'emote.tada', 'wax.glitter', 'glider.umbrella', 'bling.lollipop',
  'ride.pickup', 'skin.neonSkater', 'car.neon', 'bling.boba', 'glider.kite', 'trail.hearts', 'slime.holo',
  'skin.snowDay', 'outfit.ledkicks', 'emote.twirl', 'bling.guitar', 'glider.balloons', 'skin.starChef',
  'build.neonsign', 'skin.cometCat', 'ride.boat', 'emote.giggle', 'trail.stars', 'squishy.dragon',
  'skin.bobaBreeze', 'bling.catpack', 'style.glitterRacer.2', 'glider.butterfly', 'bling.donut', 'skin.studioSpark', 'wrap.pearl',
  'wax.chrome', 'skin.jellyJet', 'bling.butterfly', 'emote.heart', 'skin.cherryPop', 'trail.bubbles',
  'car.trail', 'skin.galaxyGamer', 'bling.jetpack', 'style.neonSkater.2', 'skin.moonlightMixer', 'glider.pizza', 'glider.jellyfish',
  'outfit.wings', 'ride.hoverboard', 'glider.daisy', 'skin.roboRascal', 'emote.shuffle', 'face.sticker.rainbow', 'bling.balloon', 'style.cometCat.2',
  'skin.dinoDash', 'build.pool', 'bling.shell', 'bling.unicorn', 'skin.cosmicCheer', 'face.eyes.4', 'glider.cloud', 'car.chrome',
  'emote.robot', 'style.galaxyGamer.2', 'skin.dragonDrift', 'glider.shootingstar', 'trail.confetti', 'slime.galaxy', 'bling.angel',
  'skin.auroraSkies', 'glider.dragonfly', 'style.cosmicCheer.2', 'ride.icecream', 'face.makeup.4', 'skin.shadowSprite', 'face.sticker.glitter', 'emote.swing',
  'style.dragonDrift.2', 'wrap.glitter', 'skin.solarSparkle', 'style.auroraSkies.2', 'face.eyecolor.pink', 'wax.glow', 'skin.midnightMirage',
  'bling.rainbowcape', 'bling.dragonwings', 'emote.sway', 'trail.rainbow', 'outfit.crown', 'skin.prismParade',
];

const WHERE: Record<string, string> = {
  outfit: 'Locker · Outfit', backBling: 'Locker · Back Bling', glider: 'Locker · Glider', contrail: 'Locker · Contrail',
  emote: 'Locker · Emotes', ride: 'Locker · Ride', wrap: 'Locker · Ride Wrap', style: 'Locker · Outfit style', face: 'Locker · Custom · Face',
};

/** How many charms exist in the world right now. */
export function charmTotal(): number {
  return Math.max(1, CHARMS.length);
}

function buildRewards(): Reward[] {
  const meta = new Map<string, Omit<Reward, 'at' | 'id'>>();
  for (const [id, m] of Object.entries(LEGACY)) meta.set(id, { ...m });
  for (const c of allCatalogRewards()) {
    meta.set(c.reward, { icon: c.item.icon, label: c.item.name, where: WHERE[c.slot] ?? 'Locker', rarity: c.item.rarity, slot: c.slot, itemId: c.item.id });
  }
  const order = LADDER.filter((id) => meta.has(id));
  const missing = [...meta.keys()].filter((id) => !order.includes(id)).sort((a, b) => RARITY_ORDER.indexOf(meta.get(a)!.rarity) - RARITY_ORDER.indexOf(meta.get(b)!.rarity));
  if (import.meta.env?.DEV) {
    for (const id of LADDER) if (!meta.has(id)) console.warn(`[unlocks] ladder id "${id}" is not in the catalog`);
    const stray = missing.filter((id) => !id.startsWith('skin.suit_')); // wardrobe suits are spread through the ladder on purpose
    if (stray.length) console.warn('[unlocks] not in the ladder, spread through it automatically:', stray);
  }
  // anything the ladder doesn't list (new wardrobe suits…) is spread evenly through it, rarest last — never dumped at the end
  missing.forEach((id, i) => order.splice(Math.round(((i + 1) * (order.length + 1)) / (missing.length + 1)) - 1 + i, 0, id));
  const M = order.length;
  return order.map((id, k): Reward => {
    const m = meta.get(id)!;
    return {
      id,
      get at(): number {
        return Math.max(1, Math.ceil(((k + 1) * charmTotal()) / M));
      },
      ...m,
    };
  });
}

/** Sorted by `at`. */
export const REWARDS: Reward[] = buildRewards();
const BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

export function rewardFor(id: string): Reward | undefined {
  return BY_ID.get(id);
}

export function charmCount(): number {
  return store.profile?.charms?.length ?? 0;
}

/** Base content (not in REWARDS) is always unlocked. */
export function isUnlocked(id: string): boolean {
  const r = rewardFor(id);
  return !r || charmCount() >= r.at;
}

/** How many more charms until `id` unlocks (0 = unlocked). */
export function charmsNeeded(id: string): number {
  const r = rewardFor(id);
  return r ? Math.max(0, r.at - charmCount()) : 0;
}

export function hasCharm(charmId: string): boolean {
  return store.profile?.charms?.includes(charmId) ?? false;
}

/** Collect a charm for the active profile. Returns the rewards it unlocked (if any). */
export function collectCharm(charmId: string): Reward[] {
  const p = store.profile;
  if (!p || p.charms.includes(charmId)) return [];
  const before = p.charms.length;
  store.update(() => p.charms.push(charmId));
  const after = p.charms.length;
  const unlocked = REWARDS.filter((r) => r.at > before && r.at <= after);
  for (const r of unlocked) {
    bus.emit('rewardUnlocked', { id: r.id, icon: r.icon, label: r.label, rarity: r.rarity, slot: r.slot, itemId: r.itemId, where: r.where });
  }
  return unlocked;
}

export function nextReward(): Reward | undefined {
  const n = charmCount();
  return REWARDS.find((r) => r.at > n);
}

/** Friendly message when a kid taps a locked item. */
export function lockedToast(id: string): void {
  const r = rewardFor(id);
  if (!r) return;
  const need = r.at - charmCount();
  toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} in town to unlock ${r.label}`);
  bus.emit('placementBlocked', {});
}
