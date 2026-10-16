// Small DOM helpers for the big, kid-friendly UI. Every interactive element
// emits a `uiTap` event so the juice layer can click.
import { bus, type GameEvents } from '../core/events';
import { tuning } from '../tuning';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  parent?: HTMLElement,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export interface BtnOpts {
  icon?: string;
  label?: string;
  cls?: string; // e.g. 'pink big', 'round ghost'
  tap?: GameEvents['uiTap']['kind'];
  silent?: boolean;
}

/** Big button. Fires on pointerup inside (fast on touch, no 300ms delay). */
export function button(parent: HTMLElement | null, opts: BtnOpts, onTap: (e: PointerEvent) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `btn ${opts.cls ?? ''}`.trim();
  if (opts.icon) el('span', 'ico', b, opts.icon);
  if (opts.label) el('span', 'lbl', b, opts.label);
  bindTap(b, (e) => {
    if (!opts.silent) bus.emit('uiTap', { kind: opts.tap ?? 'soft' });
    onTap(e);
  });
  parent?.appendChild(b);
  return b;
}

/** Attach a responsive tap handler (pointer-based, with pressed state). */
export function bindTap(target: HTMLElement, onTap: (e: PointerEvent) => void): void {
  let downId: number | null = null;
  target.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    downId = e.pointerId;
    target.classList.add('pressed');
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  target.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (downId !== e.pointerId) return;
    downId = null;
    target.classList.remove('pressed');
    const r = target.getBoundingClientRect();
    const pad = 12;
    if (e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) onTap(e);
  });
  target.addEventListener('pointercancel', () => {
    downId = null;
    target.classList.remove('pressed');
  });
  target.addEventListener('click', (e) => e.preventDefault());
}

/** Row of color swatches. Returns a setter to change the highlighted one. */
export function swatches(
  parent: HTMLElement,
  colors: string[],
  current: string,
  onPick: (c: string) => void,
  cls = '',
): (c: string) => void {
  const wrap = el('div', `swatches ${cls}`, parent);
  const items: HTMLElement[] = [];
  const set = (c: string) => items.forEach((s) => s.classList.toggle('on', s.dataset.c?.toLowerCase() === c.toLowerCase()));
  for (const c of colors) {
    const s = el('div', 'swatch', wrap);
    s.style.background = c;
    s.dataset.c = c;
    bindTap(s, () => {
      set(c);
      bus.emit('colorPicked', { color: c });
      onPick(c);
    });
    items.push(s);
  }
  set(current);
  return set;
}

/** Tabs bar. */
export function tabs(
  parent: HTMLElement,
  list: { id: string; icon: string; label?: string }[],
  current: string,
  onPick: (id: string) => void,
): (id: string) => void {
  const bar = el('div', 'tabs panel', parent);
  const btns = new Map<string, HTMLElement>();
  const set = (id: string) => btns.forEach((b, k) => b.classList.toggle('on', k === id));
  for (const t of list) {
    const b = el('button', 'tab', bar);
    el('span', 'ico', b, t.icon);
    if (t.label) el('span', '', b, t.label);
    bindTap(b, () => {
      bus.emit('uiTap', { kind: 'tab' });
      set(t.id);
      onPick(t.id);
    });
    btns.set(t.id, b);
  }
  set(current);
  return set;
}

/** Modal sheet. Returns a close function. Tapping the backdrop closes it. */
export function sheet(build: (body: HTMLElement, close: () => void) => void, opts: { dismissable?: boolean } = {}): () => void {
  const root = document.getElementById('ui')!;
  const bd = el('div', 'backdrop', root);
  const sh = el('div', 'sheet', bd);
  bus.emit('uiOpen', {});
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    bus.emit('uiClose', {});
    bd.remove();
  };
  if (opts.dismissable !== false) {
    bd.addEventListener('pointerdown', (e) => {
      if (e.target === bd) close();
    });
  }
  sh.addEventListener('pointerdown', (e) => e.stopPropagation());
  build(sh, close);
  return close;
}

/** Big friendly yes/no confirm. */
export function confirmDialog(text: string, yes: string, no = 'Cancel', icon = '❓'): Promise<boolean> {
  return new Promise((resolve) => {
    sheet((body, close) => {
      body.style.textAlign = 'center';
      el('div', '', body, `<div style="font-size:64px">${icon}</div>`);
      el('h2', '', body, text);
      const row = el('div', 'row', body);
      row.style.justifyContent = 'center';
      button(row, { label: no, cls: 'big', tap: 'back' }, () => {
        close();
        resolve(false);
      });
      button(row, { label: yes, cls: 'big pink' }, () => {
        close();
        resolve(true);
      });
    }, { dismissable: false });
  });
}

export function toast(text: string): void {
  const root = document.getElementById('ui')!;
  const t = el('div', 'toast', root, text);
  setTimeout(() => t.remove(), 2300);
}

/** Simple floating name tag positioned each frame by the caller. */
export function nameTag(parent: HTMLElement, text: string): HTMLDivElement {
  const t = el('div', 'nametag', parent) as HTMLDivElement;
  t.textContent = text;
  return t;
}

export const MIN_TAP = tuning.app.minTouchTarget;

/**
 * Hold-to-confirm button for destructive actions (start over, delete): the
 * kid presses and holds; a fill sweeps across; release early = nothing happens
 * (plus a hint). Prevents a stray double-tap from wiping their work.
 */
export function holdButton(parent: HTMLElement | null, opts: BtnOpts & { holdMs?: number; hint?: string }, onConfirm: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `btn hold ${opts.cls ?? ''}`.trim();
  const fill = el('span', 'hold-fill', b);
  if (opts.icon) el('span', 'ico', b, opts.icon);
  if (opts.label) el('span', 'lbl', b, opts.label);
  const ms = opts.holdMs ?? 650;
  let timer: number | null = null;
  let downAt = 0;
  const reset = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    fill.style.transition = 'none';
    fill.style.transform = 'scaleX(0)';
    b.classList.remove('pressed');
  };
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    downAt = performance.now();
    b.classList.add('pressed');
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    fill.style.transition = `transform ${ms}ms linear`;
    requestAnimationFrame(() => (fill.style.transform = 'scaleX(1)'));
    fill.style.transform = 'scaleX(1)';
    timer = window.setTimeout(() => {
      timer = null;
      reset();
      bus.emit('uiTap', { kind: opts.tap ?? 'big' });
      onConfirm();
    }, ms);
  });
  const cancel = (e: PointerEvent) => {
    e.stopPropagation();
    if (timer === null) return;
    const held = performance.now() - downAt;
    reset();
    if (held < ms) toast(opts.hint ?? 'Hold to confirm');
  };
  b.addEventListener('pointerup', cancel);
  b.addEventListener('pointercancel', cancel);
  b.addEventListener('click', (e) => e.preventDefault());
  parent?.appendChild(b);
  return b;
}
