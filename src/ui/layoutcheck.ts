// ── v3 phone ── DOM-rect layout checks for the Locker and the ☰ menu (used by the `lockerLayout` / `menuLayout`
// self-tests and by `window.__layout` in dev). They measure the real DOM at the CURRENT viewport: nothing overlaps,
// everything is on screen, every control is ≥ 44 px, and enough free space is left for the player preview.
import { scenes } from '../core/scene';
import { bus } from '../core/events';

export interface LayoutResult {
  pass: boolean;
  detail: string;
}
type R = { name: string; x: number; y: number; w: number; h: number };

const vis = (e: Element | null): e is HTMLElement => {
  if (!e) return false;
  const r = (e as HTMLElement).getBoundingClientRect();
  const cs = getComputedStyle(e as HTMLElement);
  return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
};
const rectOf = (name: string, e: Element): R => {
  const r = e.getBoundingClientRect();
  return { name, x: r.left, y: r.top, w: r.width, h: r.height };
};
const overlap = (a: R, b: R): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 1 && h > 1 ? w * h : 0;
};

/** Open the Locker UI is assumed to be showing (scenes.go('dressup') first). */
export function lockerLayout(): LayoutResult {
  const W = window.innerWidth, H = window.innerHeight;
  const q = (s: string) => document.querySelector(s);
  const qa = (s: string) => [...document.querySelectorAll(s)].filter(vis);
  const items: R[] = [];
  const add = (name: string, e: Element | null) => {
    if (vis(e)) items.push(rectOf(name, e));
  };
  add('menu', q('#menu-btn'));
  add('title', q('.lk-title .title'));
  add('charms', q('.lk-charms'));
  add('rail', q('.lk-slots'));
  add('panel', q('.lk-panel'));
  add('play', q('.dr-go'));
  const bar = qa('.dr-bar .btn');
  bar.forEach((b, i) => add(`bar${i}`, b));
  const problems: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.x < -1 || a.y < -1 || a.x + a.w > W + 1 || a.y + a.h > H + 1) problems.push(`${a.name} off-screen (${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.w)}×${Math.round(a.h)})`);
    for (let j = i + 1; j < items.length; j++) if (overlap(a, items[j])) problems.push(`${a.name} overlaps ${items[j].name}`);
  }
  // tap targets
  const small: string[] = [];
  const tap = (name: string, els: Element[], min = 44) =>
    els.forEach((e, i) => {
      const r = e.getBoundingClientRect();
      if (Math.min(r.width, r.height) < min - 0.5) small.push(`${name}${i} ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
  tap('menu', qa('#menu-btn'));
  tap('slot', qa('.lk-slot'));
  tap('bar', bar);
  tap('play', qa('.dr-go'));
  // the rail's tiles must all be reachable (visible without scrolling, or the rail scrolls)
  const rail = q('.lk-slots') as HTMLElement | null;
  const railNote = rail && rail.scrollWidth > rail.clientWidth + 2 ? ' (rail scrolls)' : '';
  // free room for the player: the space not covered by the panel / rail / bar / title
  const panel = items.find((i) => i.name === 'panel');
  const railR = items.find((i) => i.name === 'rail');
  const charms = items.find((i) => i.name === 'charms');
  const barTop = Math.min(H, ...items.filter((i) => i.name.startsWith('bar')).map((i) => i.y));
  const portrait = !!panel && !!railR && panel.w > W * 0.7;
  const freeW = portrait ? W : Math.max(0, (panel ? panel.x : W) - 72);
  const freeTop = Math.max(charms ? charms.y + charms.h : 60, 60);
  const freeBottom = portrait ? (railR ? railR.y : H) : barTop;
  const freeH = Math.max(0, freeBottom - freeTop);
  if (freeW < 150 || freeH < 140) problems.push(`preview area too small: ${Math.round(freeW)}×${Math.round(freeH)}`);
  if (small.length) problems.push('taps < 44px: ' + small.join(', '));
  return { pass: problems.length === 0, detail: `${W}×${H} preview ${Math.round(freeW)}×${Math.round(freeH)}${railNote}${problems.length ? ' · ' + problems.join(' · ') : ' · clean'}` };
}

/** Opens the ☰ menu, measures it, closes it. */
export async function menuLayout(): Promise<LayoutResult> {
  const W = window.innerWidth, H = window.innerHeight;
  const btn = document.getElementById('menu-btn') as HTMLElement | null;
  if (!btn || !vis(btn)) return { pass: true, detail: 'no menu button on this scene (skipped)' };
  const o = { pointerId: 77, bubbles: true, clientX: btn.getBoundingClientRect().x + 20, clientY: btn.getBoundingClientRect().y + 20, pointerType: 'touch', isPrimary: true };
  btn.dispatchEvent(new PointerEvent('pointerdown', o));
  btn.dispatchEvent(new PointerEvent('pointerup', o));
  await new Promise((r) => setTimeout(r, 450));
  const sheet = document.querySelector('.sheet') as HTMLElement | null;
  if (!sheet) return { pass: false, detail: 'menu did not open' };
  const problems: string[] = [];
  const sr = sheet.getBoundingClientRect();
  if (sr.left < -1 || sr.top < -1 || sr.right > W + 1 || sr.bottom > H + 1) problems.push(`sheet off-screen (${Math.round(sr.left)},${Math.round(sr.top)} → ${Math.round(sr.right)},${Math.round(sr.bottom)})`);
  const cards = [...sheet.querySelectorAll('.navcard')].map((e, i) => rectOf('card' + i, e));
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) if (overlap(cards[i], cards[j])) problems.push(`card${i} overlaps card${j}`);
  const small = cards.filter((c) => Math.min(c.w, c.h) < 44).map((c) => c.name);
  if (small.length) problems.push('cards < 44px: ' + small.join(','));
  const close = [...sheet.querySelectorAll('.btn.round')].find((e) => vis(e)) as HTMLElement | undefined;
  if (!close) problems.push('no close button');
  else {
    const cr = close.getBoundingClientRect();
    if (cr.top < 0 || cr.bottom > H || cr.right > W || cr.left < 0) problems.push('close button not on screen');
    if (Math.min(cr.width, cr.height) < 44) problems.push(`close ${Math.round(cr.width)}×${Math.round(cr.height)} < 44`);
  }
  const scrolls = sheet.scrollHeight > sheet.clientHeight + 2;
  const detail = `${W}×${H} sheet ${Math.round(sr.width)}×${Math.round(sr.height)}${scrolls ? ' (scrolls)' : ' (fits)'} cards ${cards.length}` + (problems.length ? ' · ' + problems.join(' · ') : ' · clean');
  // close the menu again
  if (close) {
    const r2 = close.getBoundingClientRect();
    const o2 = { pointerId: 78, bubbles: true, clientX: r2.x + r2.width / 2, clientY: r2.y + r2.height / 2, pointerType: 'touch', isPrimary: true };
    close.dispatchEvent(new PointerEvent('pointerdown', o2));
    close.dispatchEvent(new PointerEvent('pointerup', o2));
  }
  return { pass: problems.length === 0, detail };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` with phone notch / home-bar insets faked (landscape 59 L+R, 21 bottom; portrait 59 top, 34 bottom) and calm CSS animations. */
async function withSafeArea<T>(fn: () => Promise<T> | T): Promise<T> {
  const W = window.innerWidth, H = window.innerHeight;
  const S = H > W ? { t: 59, r: 0, b: 34, l: 0 } : { t: 0, r: 59, b: 21, l: 59 };
  const root = document.documentElement;
  const keys = ['--safe-t', '--safe-r', '--safe-b', '--safe-l'];
  const saved = keys.map((k) => root.style.getPropertyValue(k));
  keys.forEach((k, i) => root.style.setProperty(k, `${[S.t, S.r, S.b, S.l][i]}px`));
  const calm = document.createElement('style');
  calm.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  document.head.appendChild(calm);
  window.dispatchEvent(new Event('resize'));
  await sleep(300);
  try {
    return await fn();
  } finally {
    calm.remove();
    keys.forEach((k, i) => (saved[i] ? root.style.setProperty(k, saved[i]) : root.style.removeProperty(k)));
    window.dispatchEvent(new Event('resize'));
  }
}

const tapEl = (el: HTMLElement): void => {
  const r = el.getBoundingClientRect();
  const o = { pointerId: 79, bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'touch', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
};

/** The Locker at the current window size, with faked insets: every slot tab, then the reveal card. */
export async function lockerLayoutAt(): Promise<LayoutResult> {
  if (scenes.current?.name !== 'dressup') await scenes.go('dressup');
  return withSafeArea(async () => {
    await sleep(300);
    const notes: string[] = [];
    let ok = true;
    const tabs = [...document.querySelectorAll('.lk-slot')] as HTMLElement[];
    for (let i = 0; i < tabs.length; i++) {
      tapEl(tabs[i]);
      await sleep(180);
      const r = lockerLayout();
      if (!r.pass) {
        ok = false;
        notes.push(`slot${i}: ${r.detail}`);
      } else if (i === 0) notes.push(r.detail);
    }
    tapEl(tabs[0]);
    // the reveal card
    bus.emit('rewardUnlocked', { id: 'skin.prismParade', icon: '🌈', label: 'Prism Parade', rarity: 'legendary', slot: 'outfit', itemId: 'prismParade', where: 'Locker · Outfit' });
    await sleep(900);
    const W = window.innerWidth, H = window.innerHeight;
    const card = document.querySelector('.rv-card') as HTMLElement | null;
    if (!card) {
      ok = false;
      notes.push('reveal card did not show');
    } else {
      const c = card.getBoundingClientRect();
      const btns = [...card.querySelectorAll('.btn')] as HTMLElement[];
      const small = btns.filter((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height) < 44);
      const out = c.left < 0 || c.top < 0 || c.right > W || c.bottom > H || btns.some((b) => b.getBoundingClientRect().bottom > H || b.getBoundingClientRect().top < 0);
      if (out || small.length) {
        ok = false;
        notes.push(`reveal card ${Math.round(c.width)}×${Math.round(c.height)} at ${Math.round(c.left)},${Math.round(c.top)} ${out ? 'off-screen' : ''} ${small.length ? 'small buttons' : ''}`);
      } else notes.push(`reveal card ${Math.round(c.width)}×${Math.round(c.height)} fits`);
      (btns[0] ?? card).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 80 }));
      const first = btns[0];
      if (first) tapEl(first);
    }
    return { pass: ok, detail: notes.join(' | ') };
  });
}

/** The ☰ menu sheet at the current window size, with faked insets. */
export async function menuLayoutAt(): Promise<LayoutResult> {
  return withSafeArea(() => menuLayout());
}

/** `window.__layout.locker()` / `.menu()` for quick checks from the console (dev). */
export function initLayoutChecks(): void {
  (window as unknown as { __layout: unknown }).__layout = {
    locker: lockerLayout,
    menu: menuLayout,
    lockerAt: lockerLayoutAt,
    menuAt: menuLayoutAt,
    async lockerNow() {
      if (scenes.current?.name !== 'dressup') await scenes.go('dressup');
      await new Promise((r) => setTimeout(r, 600));
      return lockerLayout();
    },
  };
}
