// ── v3 locker ── Locker data operations: ownership, skin → outfit resolution, equip (all saves go
// through store.update). Other scenes only need `getLocker()` (what is equipped) — the player's
// worn look is always `profile.outfit`, so wearing a skin simply writes that outfit.
import { store } from '../../core/store';
import { isUnlocked } from '../../core/unlocks';
import { OUTFIT_CATALOG, type CatalogSlot } from '../character';
import { STARTER_OUTFITS, defaultLocker, type Hex, type Locker, type Outfit, type VehicleKind } from '../../core/model';
import {
  BACK_BLINGS, CONTRAILS, EMOTES, EMOTE_SLOTS, GLIDERS, RIDES, SKINS, WRAP_FINISHES,
  skinById, styleReward, type GearItem, type PartSpec, type Rarity, type SkinDef,
} from './catalog';

// ── ownership ────────────────────────────────────────────────────────────────
export const owns = (reward?: string): boolean => !reward || isUnlocked(reward);
export const itemOwned = (it: GearItem): boolean => owns(it.reward);
export const skinOwned = (s: SkinDef): boolean => owns(s.reward) && (s.needs ?? []).every((r) => isUnlocked(r));
export const styleOwned = (s: SkinDef, n: number): boolean => owns(styleReward(s.id, n));

// ── the locker (always present; repaired if a save references something that no longer exists / is locked) ──
const has = (list: GearItem[], id: string | null | undefined): boolean => !!id && list.some((i) => i.id === id);
const ownedIn = (list: GearItem[], id: string | null | undefined): boolean => !!id && list.some((i) => i.id === id && itemOwned(i));

export function getLocker(): Locker {
  const p = store.profile;
  let L = p.locker;
  if (!L) {
    store.update(() => (p.locker = defaultLocker()));
    L = p.locker!;
  }
  // repair (only writes when something was actually wrong)
  let bad = false;
  const fix = (ok: boolean, apply: () => void) => {
    if (ok) return;
    bad = true;
    apply();
  };
  const sk = L.skin === 'custom' ? null : skinById(L.skin);
  fix(L.skin === 'custom' || (!!sk && skinOwned(sk)), () => (L.skin = 'custom'));
  fix(L.skinStyle >= 0 && L.skinStyle === Math.floor(L.skinStyle) && (L.skin === 'custom' || L.skinStyle < (skinById(L.skin)?.styles.length ?? 1)), () => (L.skinStyle = 0));
  fix(L.backBling === null || ownedIn(BACK_BLINGS, L.backBling), () => (L.backBling = null));
  fix(ownedIn(GLIDERS, L.glider), () => (L.glider = 'starter'));
  fix(L.contrail === null || ownedIn(CONTRAILS, L.contrail), () => (L.contrail = null));
  fix(Array.isArray(L.emotes) && L.emotes.length <= EMOTE_SLOTS && L.emotes.every((e) => ownedIn(EMOTES, e)) && new Set(L.emotes).size === L.emotes.length, () => {
    const seen = new Set<string>();
    L.emotes = (Array.isArray(L.emotes) ? L.emotes : []).filter((e) => (ownedIn(EMOTES, e) && !seen.has(e) ? (seen.add(e), true) : false)).slice(0, EMOTE_SLOTS);
    for (const e of EMOTES) if (L.emotes.length < 2 && !e.reward && !L.emotes.includes(e.id)) L.emotes.push(e.id); // v3 default wheel: the free emotes
  });
  fix(ownedIn(RIDES, L.ride), () => (L.ride = 'sports'));
  fix(!!L.wraps && typeof L.wraps === 'object', () => (L.wraps = {}));
  if (bad) store.update(() => undefined);
  return L;
}

// ── skin presets → outfits ───────────────────────────────────────────────────
/** Index of a catalog part by name (several candidate names, best first). Falls back to a stable pick. */
export function partIndex(slot: CatalogSlot, spec: PartSpec, salt = 0): number {
  const list = OUTFIT_CATALOG[slot];
  for (const n of Array.isArray(spec) ? spec : [spec]) {
    const i = list.findIndex((it) => it.name.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return slot === 'accessory' ? 0 : salt % list.length;
}

/** The outfit a skin + style makes (the player keeps their own skin tone). */
export function resolveSkinOutfit(s: SkinDef, style: number, skinTone: Hex): Outfit {
  const st = s.styles[Math.max(0, Math.min(style, s.styles.length - 1))];
  const salt = SKINS.indexOf(s) + 1;
  const [hairC, topC, botC, shoeC, accC] = st.c;
  return {
    skin: skinTone,
    hair: { style: partIndex('hair', s.parts.hair, salt), color: hairC },
    top: { style: partIndex('top', s.parts.top, salt), color: topC },
    bottom: { style: partIndex('bottom', s.parts.bottom, salt), color: botC },
    shoes: { style: partIndex('shoes', s.parts.shoes, salt), color: shoeC },
    accessory: { style: partIndex('accessory', s.parts.accessory, salt), color: accC },
  };
}

/** Rarity of a wardrobe part: the wardrobe catalog's own tag if it has one, else reward-gated parts are epic. */
export function partRarity(slot: CatalogSlot, index: number): Rarity {
  const it = OUTFIT_CATALOG[slot][index] as { rarity?: Rarity; reward?: string } | undefined;
  if (it?.rarity) return it.rarity;
  return it?.reward ? 'epic' : 'common';
}

// ── equip (every write goes through store.update) ────────────────────────────
export function equipSkin(skinId: string, style: number): Outfit {
  const p = store.profile;
  const L = getLocker();
  const sk = skinById(skinId);
  if (!sk) return p.outfit;
  const out = resolveSkinOutfit(sk, style, p.outfit.skin);
  store.update(() => {
    if (L.skin === 'custom') L.customOutfit = structuredClone(p.outfit);
    L.skin = skinId;
    L.skinStyle = style;
    p.outfit = out;
  });
  return out;
}

/** Go back to the player's own piece-by-piece look. */
export function equipMyStyle(): Outfit {
  const p = store.profile;
  const L = getLocker();
  if (L.skin === 'custom') return p.outfit;
  const mine = L.customOutfit ? structuredClone(L.customOutfit) : structuredClone(STARTER_OUTFITS[Math.max(0, store.data.profiles.indexOf(p)) % STARTER_OUTFITS.length]);
  mine.skin = p.outfit.skin;
  store.update(() => {
    L.skin = 'custom';
    L.skinStyle = 0;
    p.outfit = mine;
  });
  return mine;
}

/** A piece was edited by hand: the look is now the player's own (their custom style is remembered). */
export function markCustom(): void {
  const p = store.profile;
  const L = getLocker();
  store.update(() => {
    L.skin = 'custom';
    L.skinStyle = 0;
    L.customOutfit = structuredClone(p.outfit);
  });
}

export function setBackBling(id: string | null): void {
  const L = getLocker();
  store.update(() => (L.backBling = id));
}
export function setGlider(id: string): void {
  const L = getLocker();
  store.update(() => (L.glider = id));
}
export function setContrail(id: string | null): void {
  const L = getLocker();
  store.update(() => (L.contrail = id));
}
/** Put an emote in wheel slot `slot` (0..5). A slot past the end appends, so the list stays dense. */
export function setEmote(slot: number, id: string): void {
  const L = getLocker();
  store.update(() => {
    const list = [...L.emotes];
    const from = list.indexOf(id);
    if (slot >= list.length) {
      if (from >= 0) list.splice(from, 1);
      list.push(id);
    } else if (from >= 0) {
      [list[slot], list[from]] = [list[from], list[slot]]; // already on the wheel: swap places
    } else list[slot] = id;
    L.emotes = list.slice(0, EMOTE_SLOTS);
  });
}
export function clearEmote(slot: number): void {
  const L = getLocker();
  if (L.emotes.length <= 1 || slot >= L.emotes.length) return; // always keep one
  store.update(() => L.emotes.splice(slot, 1));
}
export function setRide(kind: VehicleKind): void {
  const L = getLocker();
  store.update(() => (L.ride = kind));
}
export function setWrap(kind: VehicleKind, color: Hex, finish: string): void {
  const L = getLocker();
  store.update(() => {
    L.wraps[kind] = { color, finish };
  });
}
export function wrapOf(kind: VehicleKind): { color: Hex; finish: string } {
  const L = getLocker();
  const w = L.wraps[kind];
  const ok = w && WRAP_FINISHES.some((f) => f.id === (w.finish ?? 'gloss') && itemOwned(f));
  return { color: w?.color ?? defaultRideColor(kind), finish: ok ? (w!.finish ?? 'gloss') : 'gloss' };
}
export const defaultRideColor = (kind: VehicleKind): Hex =>
  ({ sports: '#e23b3b', pickup: '#3d6bff', golfcart: '#ffc93c', hoverboard: '#00d4ff', icecream: '#f6b8c8', boat: '#ffffff' } as Record<VehicleKind, Hex>)[kind];

// keep unused-import linters quiet for helpers the scene uses via this module
void has;
