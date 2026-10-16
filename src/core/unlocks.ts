// Charms + bonus rewards. Charms are hidden around town; each profile collects
// its own. Collecting charms unlocks BONUS cosmetics. Base content is never
// locked — anything not listed in REWARDS is always available.
//
// Usage in a module:
//   import { isUnlocked, rewardFor } from '../core/unlocks';
//   if (!isUnlocked('wax.chrome')) { show a 🔒 badge with rewardFor('wax.chrome')!.at; on tap → lockedToast('wax.chrome') }
import { store } from './store';
import { bus } from './events';
import { toast } from '../ui/ui';

export interface Reward {
  id: string;        // namespaced: 'wax.*', 'slime.*', 'squishy.*', 'car.*', 'outfit.*', 'build.*'
  at: number;        // charms needed
  icon: string;
  label: string;     // short, cool
  where: string;     // where it shows up
}

/** Sorted by `at`. Modules own the actual items; ids must match. */
export const REWARDS: Reward[] = [
  { id: 'wax.glitter', at: 2, icon: '✨', label: 'Glitter wax', where: 'Studio · Wax' },
  { id: 'car.neon', at: 4, icon: '🌈', label: 'Neon underglow', where: 'Car paint' },
  { id: 'slime.holo', at: 6, icon: '🪩', label: 'Holo slime', where: 'Studio · Slime' },
  { id: 'outfit.ledkicks', at: 8, icon: '👟', label: 'LED sneakers', where: 'Style' },
  { id: 'squishy.dragon', at: 10, icon: '🐉', label: 'Dragon squishy', where: 'Studio · Squishy' },
  { id: 'build.neonsign', at: 12, icon: '💡', label: 'Neon signs', where: 'Build · Decor' },
  { id: 'wax.chrome', at: 15, icon: '🪞', label: 'Chrome wax', where: 'Studio · Wax' },
  { id: 'car.chrome', at: 18, icon: '🏎️', label: 'Chrome paint', where: 'Car paint' },
  { id: 'outfit.wings', at: 21, icon: '🪽', label: 'Angel wings', where: 'Style' },
  { id: 'build.pool', at: 24, icon: '🏊', label: 'Pool + hot tub', where: 'Build · Outdoor' },
  { id: 'slime.galaxy', at: 28, icon: '🌌', label: 'Galaxy slime', where: 'Studio · Slime' },
  { id: 'car.trail', at: 32, icon: '💫', label: 'Sparkle trail', where: 'Car paint' },
  { id: 'wax.glow', at: 36, icon: '🟢', label: 'Glow-in-the-dark wax', where: 'Studio · Wax' },
  { id: 'outfit.crown', at: 40, icon: '👑', label: 'Diamond crown', where: 'Style' },
];

export function rewardFor(id: string): Reward | undefined {
  return REWARDS.find((r) => r.id === id);
}

export function charmCount(): number {
  return store.profile?.charms?.length ?? 0;
}

/** Base content (not in REWARDS) is always unlocked. */
export function isUnlocked(id: string): boolean {
  const r = rewardFor(id);
  return !r || charmCount() >= r.at;
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
  for (const r of unlocked) bus.emit('rewardUnlocked', { id: r.id, icon: r.icon, label: r.label });
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
