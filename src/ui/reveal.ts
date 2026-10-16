// ── v3 locker ── The big unlock reveal card. Listens to `rewardUnlocked` (emitted by collectCharm in
// core/unlocks.ts), so it pops up wherever the kid is — usually in the world right after grabbing a charm:
// a rarity-coloured card with spinning light rays, the item spinning in 3D (a real little render of the
// item), the rarity word, a level-up sting (juice maps `revealShown`), confetti for epic / legendary, and
// an EQUIP button that puts it on straight away. The card never blocks the game: only its own buttons take taps,
// and it closes itself after a few seconds. Several unlocks at once queue up (at most 3 cards, then a summary).
import { bus, type GameEvents } from '../core/events';
import { scenes } from '../core/scene';
import { store } from '../core/store';
import { tuning } from '../tuning';
import { el, button, toast } from './ui';
import { RARITY, SKINS, WRAP_FINISHES, skinById, type Rarity } from '../art/gear/catalog';
import { FACE_REWARDS } from '../art/gear/catalog';
import { equipSkin, getLocker, resolveSkinOutfit, setFace, setBackBling, setContrail, setEmote, setGlider, setRide, setWrap, wrapOf } from '../art/gear/lockerState';
import { thumbs } from '../art/gear/thumbs';
import { FACE_OPTIONS } from '../art/characterFace';
import { REWARDS, charmCount, rewardFor } from '../core/unlocks';
import { blingThumb, escapeHtml, gliderThumb, outfitThumb, rarityVars, rideThumb } from './lockerUI';
import type { VehicleKind } from '../core/model';

type Unlock = GameEvents['rewardUnlocked'];

const KIND: Record<string, string> = {
  outfit: 'Outfit', style: 'Outfit style', face: 'Face Item', backBling: 'Back Bling', glider: 'Glider', contrail: 'Contrail', emote: 'Emote', ride: 'Ride', wrap: 'Ride Wrap',
};
const EQUIPPABLE = new Set(Object.keys(KIND));

let root: HTMLDivElement | null = null;
const queue: Unlock[] = [];
let showing = false;
let burst = 0;
let closeTimer = 0;
const warmLater: { key: string; make: ReturnType<typeof outfitThumb> }[] = [];

export function initReveal(): void {
  if (root) return;
  const ui = document.getElementById('ui')!;
  root = el('div', 'rv-root', ui) as HTMLDivElement;
  bus.on('rewardUnlocked', (u) => {
    queue.push(u);
    if (!showing) next();
  });
  // dev only: ?reveal=skin.glitterRacer pops that unlock's card a moment after boot (to look at it)
  const dev = import.meta.env.DEV ? new URLSearchParams(location.search).get('reveal') : null;
  if (dev) {
    window.setTimeout(() => {
      for (const id of dev.split(',')) {
        const r = rewardFor(id);
        if (r) bus.emit('rewardUnlocked', { id: r.id, icon: r.icon, label: r.label, rarity: r.rarity, slot: r.slot, itemId: r.itemId, where: r.where });
      }
    }, 2500);
  }
  // item pictures are started from the frame loop, but only in idle slots (see thumbs.ts) — works in every scene
  scenes.frameHooks.push(() => thumbs.pump(tuning.locker.thumbBudgetMs));
  // v3 perf: pre-warm. The next few unlocks' pictures + the ray pictures are made in idle time well BEFORE a charm is found, so the
  // card pops up with everything cached: nothing is built, compiled or uploaded on the frame it appears.
  window.setTimeout(prewarm, 4500);
  bus.on('sceneChange', ({ to }) => {
    if (to === 'town') window.setTimeout(prewarm, 3000);
  });
  bus.on('charmCollected', () => window.setTimeout(prewarm, 6000));
}

/** Idle-time pre-warm of the reveal pipeline: pictures of the next three unlocks, and the rays pictures. */
function prewarm(): void {
  const n = charmCount();
  let left = 3;
  for (const r of REWARDS) {
    if (r.at <= n || !r.slot || !r.itemId) continue;
    const t = thumbFor({ id: r.id, icon: r.icon, label: r.label, rarity: r.rarity, slot: r.slot, itemId: r.itemId });
    if (t) thumbs.request(t.key, t.make, () => undefined);
    if (--left <= 0) break;
  }
  for (const q of Object.keys(RARITY) as Rarity[]) raysPicture(q);
}

/** A pre-baked picture of the light rays in a rarity colour (a big masked conic gradient spinning over the canvas is far too heavy for iPad). */
const raysCache = new Map<Rarity, string>();
function raysPicture(r: Rarity): string {
  const hit = raysCache.get(r);
  if (hit) return hit;
  const S = 384;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.fillStyle = RARITY[r].color;
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, S, a, a + ((Math.PI * 2) / N) * 0.32);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = 'destination-in';
  const rg = g.createRadialGradient(0, 0, S * 0.03, 0, 0, S / 2);
  rg.addColorStop(0, 'rgba(0,0,0,0.9)');
  rg.addColorStop(0.5, 'rgba(0,0,0,0.4)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(-S / 2, -S / 2, S, S);
  const css = `url(${c.toDataURL('image/png')})`;
  raysCache.set(r, css);
  return css;
}

function next(): void {
  const r = root;
  if (!r) return;
  const u = queue.shift();
  if (!u) {
    showing = false;
    burst = 0;
    return;
  }
  // at most 3 cards per charm; the rest become one summary toast
  if (burst >= 3) {
    const more = 1 + queue.length;
    queue.length = 0;
    toast(`🎁 +${more} more unlocked — look in your Locker!`);
    showing = false;
    burst = 0;
    return;
  }
  burst++;
  showing = true;
  show(r, u);
}

function show(r: HTMLDivElement, u: Unlock): void {
  window.clearTimeout(closeTimer);
  r.innerHTML = '';
  const rarity = (u.rarity as Rarity) in RARITY ? (u.rarity as Rarity) : 'common';
  r.className = `rv-root on${rarity === 'legendary' ? ' rv-legendary' : ''}`;
  rarityVars(r, rarity);
  r.style.setProperty('--rv-rays', raysPicture(rarity));
  el('div', 'rv-dim', r);
  el('div', 'rv-rays', r);
  const card = el('div', 'rv-card', r);
  el('div', 'rv-new', card, 'NEW!');
  const stage = el('div', 'rv-stage', card);
  el('div', 'rv-glow', stage);
  const item = el('div', 'rv-item', stage);
  // the item: a real 3D picture when we can render one, else the big emoji
  const big = el('span', 'big', item, u.icon);
  // only a picture that is ALREADY cached (pre-warmed); never build or render one on the frame the card pops up
  const sub = thumbFor(u);
  const url = sub ? thumbs.get(sub.key) : undefined;
  if (url) {
    const img = new Image();
    img.src = url;
    img.draggable = false;
    item.appendChild(img);
    big.style.display = 'none';
  } else if (sub) warmLater.push(sub); // after the card is gone, in idle time, for the next time
  el('div', 'rv-name', card).textContent = u.label;
  const kind = u.slot ? KIND[u.slot] : undefined;
  el('div', 'rv-rar', card, `${RARITY[rarity].label} ${kind ?? 'Bonus'}`);
  el('div', 'rv-where', card, escapeHtml(u.where ?? 'Unlocked!'));
  const btns = el('div', 'rv-btns', card);
  const close = () => dismiss(r);
  if (u.slot && EQUIPPABLE.has(u.slot) && u.itemId) {
    button(btns, { label: 'Later', cls: 'ghost', tap: 'back' }, close);
    button(btns, { icon: '✔', label: 'Equip!', cls: 'pink big', tap: 'big' }, () => {
      if (equip(u)) toast(`✔ ${u.label} equipped`);
      close();
    });
  } else {
    button(btns, { label: 'Awesome!', cls: 'pink big', tap: 'big' }, close);
  }
  if (queue.length) el('div', 'rv-more', card, `+${queue.length} more…`);
  if (rarity === 'epic' || rarity === 'legendary') confetti(r, RARITY[rarity].color, rarity === 'legendary' ? 24 : 14);
  bus.emit('revealShown', { rarity });
  closeTimer = window.setTimeout(close, tuning.locker.revealSeconds * 1000);
}

function dismiss(r: HTMLDivElement): void {
  window.clearTimeout(closeTimer);
  if (!r.classList.contains('on')) return;
  r.classList.add('out');
  window.setTimeout(() => {
    r.className = 'rv-root';
    r.innerHTML = '';
    if (!queue.length) for (const w of warmLater.splice(0)) thumbs.request(w.key, w.make, () => undefined);
    next();
  }, 280);
}

function confetti(r: HTMLElement, color: string, n: number): void {
  const box = el('div', 'rv-confetti', r);
  const cols = [color, '#ffffff', '#ffe53b', '#ff2e88', '#35d6ff'];
  for (let i = 0; i < n; i++) {
    const c = el('i', '', box);
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = `${2.2 + Math.random() * 2.4}s`;
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
  }
}

/** The subject of the 3D picture for an unlock (null = just the emoji). */
function thumbFor(u: Unlock): { key: string; make: ReturnType<typeof outfitThumb> } | null {
  if (!u.itemId) return null;
  const tone = store.profile.outfit.skin;
  switch (u.slot) {
    case 'outfit': {
      const s = skinById(u.itemId);
      return s ? { key: `skin:${s.id}:0:${tone}`, make: outfitThumb(resolveSkinOutfit(s, 0, tone)) } : null;
    }
    case 'style': {
      const [sid, n] = u.itemId.split('.');
      const s = skinById(sid);
      return s ? { key: `skin:${s.id}:${n}:${tone}`, make: outfitThumb(resolveSkinOutfit(s, +n, tone)) } : null;
    }
    case 'backBling': return { key: `bling:${u.itemId}`, make: blingThumb(u.itemId) };
    case 'glider': return { key: `glider:${u.itemId}`, make: gliderThumb(u.itemId) };
    case 'ride': {
      const w = wrapOf(u.itemId as VehicleKind);
      return { key: `ride:${u.itemId}:${w.color}:${w.finish}`, make: rideThumb(u.itemId as VehicleKind, w) };
    }
    default: return null;
  }
}

/** Put the unlocked item on. Returns false if nothing was equipped. */
function equip(u: Unlock): boolean {
  const id = u.itemId;
  if (!id) return false;
  const L = getLocker();
  switch (u.slot) {
    case 'outfit':
      equipSkin(id, 0);
      break;
    case 'style': {
      const [sid, n] = id.split('.');
      equipSkin(sid, +n);
      break;
    }
    case 'face': {
      const f = FACE_REWARDS.find((x) => x.reward === u.id);
      if (!f) return false;
      if (f.field === 'eyeColor') {
        const hex = FACE_OPTIONS.eyeColor.find((c) => c.id === f.id)?.value;
        if (hex) setFace({ eyeColor: hex });
      } else setFace({ [f.field]: f.id } as never);
      break;
    }
    case 'backBling': setBackBling(id); break;
    case 'glider': setGlider(id); break;
    case 'contrail': setContrail(id); break;
    case 'emote': setEmote(L.emotes.length < 6 ? L.emotes.length : 5, id); break;
    case 'ride': setRide(id as VehicleKind); break;
    case 'wrap': {
      const w = wrapOf(L.ride);
      if (WRAP_FINISHES.some((f) => f.id === id)) setWrap(L.ride, w.color, id);
      break;
    }
    default: return false;
  }
  bus.emit('lockerEquipped', { slot: u.slot ?? '', id, rarity: u.rarity ?? 'common' });
  return true;
}

void SKINS;
