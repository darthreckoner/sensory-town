// ── v3 movement (W4) ── POI title cards: walk (or glide) into a place and its name slams onto the screen,
// big, bold and italic, for 2.5 s. Only when ENTERING a different place, and with a cooldown.
// Places come from POIS in townLayout (the world agent); until it exists, the old DISTRICTS list.
import { bus } from '../core/events';
import { tuning } from '../tuning';
import * as Layout from '../world/townLayout';
import { el } from '../ui/ui';

export interface Poi {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  icon?: string;
}

export function poiList(): Poi[] {
  const l = (Layout as unknown as { POIS?: Poi[] }).POIS;
  if (l && l.length) return l;
  const k = tuning.movement3.poiRadiusMul;
  return Layout.DISTRICTS.map((d) => ({ id: d.id, name: d.name, x: d.x, z: d.z, r: d.radius * k, icon: d.icon }));
}

export class PoiCards {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLSpanElement;
  private readonly sub: HTMLSpanElement;
  private pois: Poi[] = [];
  private cur: Poi | null = null;
  private clock = 0;
  private lastAny = -1e9;
  private readonly lastShown = new Map<string, number>();
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'v3-poi', parent) as HTMLDivElement;
    const inner = el('div', 'v3-poi-inner', this.root);
    this.sub = el('span', 'v3-poi-sub', inner) as HTMLSpanElement;
    this.name = el('span', 'v3-poi-name', inner) as HTMLSpanElement;
    el('i', 'v3-poi-bar', inner);
  }

  /** (Re)read the place list and stand quietly in whatever place we are in (no card). */
  reset(x: number, z: number): void {
    this.pois = poiList();
    this.cur = this.find(x, z, null);
    this.lastAny = this.clock; // no card in the first moments after a scene change
    this.root.classList.remove('show');
  }

  /** Force a card (debug, or a special arrival). */
  announce(p: Poi, x: number, z: number): void {
    this.show(p, x, z);
  }

  private find(x: number, z: number, keep: Poi | null): Poi | null {
    let best: Poi | null = null;
    let bk = Infinity;
    for (const p of this.pois) {
      const d = Math.hypot(x - p.x, z - p.z);
      const k = d / (p.r * (keep && keep.id === p.id ? 1.12 : 1)); // a little hysteresis at the edge
      if (k < 1 && k < bk) {
        best = p;
        bk = k;
      }
    }
    return best;
  }

  /** `alt`: metres above the ground (no cards while skydiving from the bus; they appear as you come down). */
  update(dt: number, x: number, z: number, alt: number): void {
    this.clock += dt;
    if (alt > 30) return;
    const next = this.find(x, z, this.cur);
    if (next?.id === this.cur?.id) return;
    this.cur = next;
    if (!next) return;
    const m = tuning.movement3;
    if (this.clock - this.lastAny < m.poiGapS) return;
    if (this.clock - (this.lastShown.get(next.id) ?? -1e9) < m.poiCooldownS) return;
    this.show(next, x, z);
  }

  private show(p: Poi, x: number, z: number): void {
    const m = tuning.movement3;
    this.lastAny = this.clock;
    this.lastShown.set(p.id, this.clock);
    this.name.textContent = p.name;
    this.sub.textContent = p.icon ?? '';
    this.root.style.setProperty('--poi-s', `${m.poiCardSeconds}s`);
    // restart the CSS animation
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.root.classList.remove('show'), m.poiCardSeconds * 1000 + 120);
    bus.emit('poiEntered', { id: p.id, name: p.name, pos: { x, y: 0, z } });
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    this.root.remove();
  }
}
