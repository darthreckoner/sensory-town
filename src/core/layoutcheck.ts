// ── v3 phone ── DOM layout checker: finds UI blocks that overlap each other (or the 3D things that must stay
// visible), stick out of the screen / the safe area, or have tap targets under 44 px. Used by the selftests
// `lobbyLayout` / `studioLayout` (run them at the real phone sizes) and by the offline layout sweep.
// Plain DOM only: no imports, so it can also be inlined into a static page.

export interface LayoutProbe {
  /** what must stay clear, e.g. 'face:Star' or 'toy' */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LayoutIssue {
  kind: 'overlap' | 'outside' | 'small' | 'probe';
  a: string;
  b?: string;
  /** overlap area (px²), overshoot (px) or the smaller side (px) */
  value: number;
}
export interface LayoutReport {
  w: number;
  h: number;
  groups: number;
  taps: number;
  issues: LayoutIssue[];
  /** tap targets under 52 px (preferred) but at least 44 */
  tight: LayoutIssue[];
}

const px = (v: string) => parseFloat(v) || 0;

function describe(e: Element): string {
  const cls = (e.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  const txt = (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 14);
  return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? `"${txt}"` : ''}`;
}

function visible(e: Element, stop: Element): boolean {
  const r = e.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  for (let n: Element | null = e; n && n !== stop.parentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
  }
  return true;
}

/**
 * Check one scene's DOM overlay. `root` is the scene's `ui` element. A "block" is any visible, absolutely
 * positioned element inside it (plates, panels, button groups, the title…); two blocks that are not parent and
 * child must not overlap. Interactive blocks must stay inside the viewport minus the safe-area insets.
 */
export function checkLayout(root: HTMLElement, opts: { probes?: LayoutProbe[]; minTap?: number; ignore?: string } = {}): LayoutReport {
  const W = window.innerWidth, H = window.innerHeight;
  const cs = getComputedStyle(document.documentElement);
  // the safe-area tokens are env() values: read them through a probe element so the real numbers come out
  const sp = document.createElement('div');
  sp.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l)';
  document.body.appendChild(sp);
  const sps = getComputedStyle(sp);
  const safe = { t: px(sps.paddingTop), r: px(sps.paddingRight), b: px(sps.paddingBottom), l: px(sps.paddingLeft) };
  sp.remove();
  void cs;
  const minTap = opts.minTap ?? 44;
  const issues: LayoutIssue[] = [];
  const tight: LayoutIssue[] = [];

  const blocks: { e: Element; r: DOMRect }[] = [];
  const all = root.querySelectorAll('*');
  for (const e of Array.from(all)) {
    if (opts.ignore && e.matches(opts.ignore)) continue;
    const pos = getComputedStyle(e).position;
    if (pos !== 'absolute' && pos !== 'fixed') continue;
    if (!visible(e, root)) continue;
    const pe = getComputedStyle(e).pointerEvents;
    if (pe === 'none' && !e.querySelector('button, .tab, .swatch, .item')) {
      // decorative text (hints, toasts) still must not sit on the faces / buttons, so keep it
    }
    blocks.push({ e, r: e.getBoundingClientRect() });
  }
  // a block that only wraps other blocks (a bare absolute container with no paint of its own) is skipped
  const paints = (e: Element) => {
    const s = getComputedStyle(e);
    return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || s.borderTopWidth !== '0px' || e.tagName === 'BUTTON' || (e.children.length === 0 && (e.textContent ?? '').trim() !== '') || Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
  };
  const live = blocks.filter((b) => {
    if (paints(b.e)) return true;
    // an unpainted wrapper: keep it only if it directly holds buttons (e.g. a row of controls)
    return Array.from(b.e.children).some((c) => c.tagName === 'BUTTON' && !blocks.some((o) => o.e === c));
  });

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j];
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      const ox = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const oy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (ox > 2 && oy > 2) issues.push({ kind: 'overlap', a: describe(A.e), b: describe(B.e), value: Math.round(ox * oy) });
    }
  }
  for (const b of live) {
    const interactive = !!b.e.closest('button') || !!b.e.querySelector('button, .tab, .swatch, .item') || getComputedStyle(b.e).pointerEvents !== 'none';
    if (!interactive) continue;
    const over = Math.max(safe.l - b.r.left, b.r.right - (W - safe.r), safe.t - b.r.top, b.r.bottom - (H - safe.b));
    if (over > 1) issues.push({ kind: 'outside', a: describe(b.e), value: Math.round(over) });
  }
  for (const p of opts.probes ?? []) {
    for (const b of live) {
      const ox = Math.min(b.r.right, p.x + p.w) - Math.max(b.r.left, p.x);
      const oy = Math.min(b.r.bottom, p.y + p.h) - Math.max(b.r.top, p.y);
      if (ox > 4 && oy > 4) issues.push({ kind: 'probe', a: describe(b.e), b: p.name, value: Math.round(ox * oy) });
    }
  }
  // tap targets: every button / tab / swatch / item that is on screen (inside a scroll strip only if it is actually clipped in)
  let taps = 0;
  for (const e of Array.from(root.querySelectorAll('button, .tab, .swatch, .item'))) {
    if (!visible(e, root)) continue;
    const r = e.getBoundingClientRect();
    taps++;
    const m = Math.min(r.width, r.height);
    if (m < minTap - 0.5) issues.push({ kind: 'small', a: describe(e), value: Math.round(m) });
    else if (m < 52) tight.push({ kind: 'small', a: describe(e), value: Math.round(m) });
  }
  return { w: W, h: H, groups: live.length, taps, issues, tight };
}
