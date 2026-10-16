// Minimal DOM stand-in so scene logic can run headless in Node.
type Fn = (e: any) => void;

function parseSel(sel: string) {
  return sel.trim().split(/\s+/).map((tok) => {
    const classes: string[] = [];
    let attr: [string, string] | null = null;
    const m = tok.match(/\[([\w-]+)="([^"]*)"\]/);
    if (m) attr = [m[1], m[2]];
    for (const c of tok.replace(/\[[^\]]*\]/g, '').split('.').slice(1)) if (c) classes.push(c);
    return { classes, attr };
  });
}

export class El {
  tagName: string;
  children: El[] = [];
  parent: El | null = null;
  style: Record<string, any> = { setProperty() {} };
  dataset: Record<string, string> = {};
  _cls = '';
  _text = '';
  _html = '';
  disabled = false;
  offsetWidth = 220;
  offsetHeight = 90;
  value = '';
  placeholder = '';
  type = '';
  min = '';
  max = '';
  step = '';
  maxLength = 0;
  id = '';
  listeners = new Map<string, Fn[]>();
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  get className() { return this._cls; }
  set className(v: string) { this._cls = v; }
  get classList() {
    const self = this;
    const get = () => new Set(self._cls.split(/\s+/).filter(Boolean));
    const set = (s: Set<string>) => { self._cls = [...s].join(' '); };
    return {
      add: (...c: string[]) => { const s = get(); c.forEach((x) => s.add(x)); set(s); },
      remove: (...c: string[]) => { const s = get(); c.forEach((x) => s.delete(x)); set(s); },
      toggle: (c: string, force?: boolean) => { const s = get(); const on = force ?? !s.has(c); if (on) s.add(c); else s.delete(c); set(s); return on; },
      contains: (c: string) => get().has(c),
    };
  }
  set innerHTML(v: string) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    this._html = v;
    this._text = v.replace(/<[^>]*>/g, '');
  }
  get innerHTML() { return this._html; }
  set textContent(v: string) { this._text = v; }
  get textContent(): string { return this._text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c: El) { c.remove(); c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
  addEventListener(t: string, f: Fn) { const l = this.listeners.get(t) ?? []; l.push(f); this.listeners.set(t, l); }
  removeEventListener(t: string, f: Fn) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((x) => x !== f)); }
  fire(t: string, ev: any) {
    const e = { stopPropagation() {}, preventDefault() {}, target: this, ...ev };
    for (const f of [...(this.listeners.get(t) ?? [])]) f(e);
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus() {}
  getContext() {
    const grad = { addColorStop() {} };
    const noop = () => {};
    return new Proxy({ canvas: this, createLinearGradient: () => grad, createRadialGradient: () => grad, measureText: () => ({ width: 10 }), getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) } as any, { get: (t, k) => (k in t ? (t as any)[k] : noop), set: () => true });
  }
  width = 256;
  height = 256;
  getBoundingClientRect() { return { left: 0, top: 0, width: 1180, height: 820, right: 1180, bottom: 820 }; }
  querySelectorAll(sel: string): El[] {
    const chain = parseSel(sel);
    const out: El[] = [];
    const matches = (e: El, t: { classes: string[]; attr: [string, string] | null }) =>
      t.classes.every((c) => e._cls.split(/\s+/).includes(c)) && (!t.attr || e.dataset[t.attr[0].replace('data-', '')] === t.attr[1]);
    const walk = (e: El, depth: number) => {
      for (const c of e.children) {
        if (matches(c, chain[depth])) {
          if (depth === chain.length - 1) out.push(c);
          else walk(c, depth + 1);
        }
        walk(c, depth);
      }
    };
    walk(this, 0);
    return [...new Set(out)];
  }
  querySelector(sel: string): El | null { return this.querySelectorAll(sel)[0] ?? null; }
  all(): El[] { return [this, ...this.children.flatMap((c) => c.all())]; }
}

export const ui = new El('div');
ui.id = 'ui';
export const canvas = new El('canvas');

const g: any = globalThis;
g.document = {
  createElement: (t: string) => new El(t),
  getElementById: (id: string) => (id === 'ui' ? ui : id === 'gl' ? canvas : new El('div')),
  querySelector: (sel: string) => ui.querySelector(sel),
  elementFromPoint: () => canvas,
  addEventListener() {},
  body: new El('body'),
};
const winListeners = new Map<string, Fn[]>();
g.window = Object.assign(g, {
  innerWidth: 1180,
  innerHeight: 820,
  devicePixelRatio: 2,
  addEventListener: (t: string, f: Fn) => { const l = winListeners.get(t) ?? []; l.push(f); winListeners.set(t, l); },
  removeEventListener: (t: string, f: Fn) => winListeners.set(t, (winListeners.get(t) ?? []).filter((x) => x !== f)),
  matchMedia: () => ({ matches: false }),
});
g.HTMLElement = El;
g.indexedDB = undefined;
g.localStorage = { getItem: () => null, setItem: () => {} };
