// Drive HUD pieces: the zoomed minimap, the stacked top pills (💎 charm
// counter, "where to?" job bubble, 🏠 home guide) and the floating owner name
// tags above houses.
import * as THREE from 'three';
import { tuning } from '../tuning';
import { store } from '../core/store';
import { bus } from '../core/events';
import { bindTap, el, nameTag } from '../ui/ui';
import {
  BOUNDS, BOUTIQUE, BRIDGES, BUILD_YARD, DISTRICTS, LANDMARKS, LOOKOUT, PAVED, PIERS, PLOTS, ROAD_PATHS, WORKSHOP, type Plot,
} from '../world/townLayout';
import { LAKE } from '../world/heightfield';
import { MAP_REACH, MAP_SCALE, paintIsland } from './minimapBase'; // v3 world: the island's shoreline paints the map
import type { House } from '../core/model';
import type { Reward } from '../core/unlocks';
import { clamp, wrapAngle } from './envUtils';
import { hyp } from '../core/fastmath';   // ── v3 perf ── Math.hypot is ~12x slower than this

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const CHIP_FONT = `12px ${EMOJI_FONT}`;      // ── v3 perf ── constant font strings (the minimap redraws at 30 Hz)
const CHIP_FONT_13 = `13px ${EMOJI_FONT}`;

// ─────────────────────────────────────────────────────────────────────────────
// Minimap — north up, zoomed around the player, a round dial.
// ─────────────────────────────────────────────────────────────────────────────
export interface MapTarget {
  x: number;
  z: number;
  icon: string;
  /** Pickup (pink) or destination (gold). */
  kind: 'pickup' | 'dropoff';
}

export interface MapFrame {
  x: number;
  z: number;
  heading: number;
  color: string;
  /** set while walking: where the ride you drove last is parked (and its icon) */
  car: { x: number; z: number; icon?: string } | null;
  /** v3 rides: the other parked rides near the dial */
  rides?: { x: number; z: number; icon: string }[];
  target: MapTarget | null;
  charms: { x: number; z: number }[];
  /** plots to pulse (the player owns no house yet) */
  emptyPlots: Plot[] | null;
  /** the home guide's target ring (own house) */
  home: { x: number; z: number } | null;
  t: number;
}

const BASE_SCALE = MAP_SCALE; // base canvas px per world unit (v3 world: the whole island)

export class Minimap {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private px = 160;
  private k = 1;
  /** Half-size (world units) the base canvas covers. */
  private readonly reach = MAP_REACH;

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-minimap', parent) as HTMLDivElement;
    this.canvas = el('canvas', '', this.el) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.layout();
  }

  private layout(): void {
    const size = tuning.drive.minimapSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.px = Math.round(size * dpr);
    this.canvas.width = this.px;
    this.canvas.height = this.px;
    this.el.style.width = this.el.style.height = `${size}px`;
    this.k = this.px / 2 / tuning.drive.minimapRadius;
    // ── v3 perf ── the font strings are built here, not 30 times a second in draw()
    const k = this.k;
    this.fontJob = `${Math.round(9 * k)}px ${EMOJI_FONT}`;
    this.fontRide = `${Math.round(7 * k)}px ${EMOJI_FONT}`;
    this.fontCar = `${Math.round(9 * k)}px ${EMOJI_FONT}`;
  }
  private fontJob = '';
  private fontRide = '';
  private fontCar = '';
  // ── v3 perf ── per-draw scratch (no closures / tuples / template strings in the 30 Hz redraw)
  private dFx = 0;
  private dFz = 0;
  private dC = 0;
  private pinX = 0;
  private pinZ = 0;
  private pinned = false;
  private wx(x: number): number {
    return this.dC + (x - this.dFx) * this.k;
  }
  private wz(z: number): number {
    return this.dC + (z - this.dFz) * this.k;
  }
  /** Clamp a dial position to the rim (result in pinX / pinZ / pinned). */
  private pin(x: number, z: number, margin: number): void {
    const c = this.dC;
    const dx = x - c, dz = z - c;
    const len = hyp(dx, dz), maxR = c - margin;
    if (len > maxR) {
      this.pinX = c + (dx * maxR) / len;
      this.pinZ = c + (dz * maxR) / len;
      this.pinned = true;
    } else {
      this.pinX = x;
      this.pinZ = z;
      this.pinned = false;
    }
  }

  /** Redraw the static layer (terrain colours, roads, plots, places). Call on scene enter. */
  rebuild(): void {
    this.layout();
    const S = Math.round(this.reach * 2 * BASE_SCALE);
    if (!this.base) this.base = document.createElement('canvas');
    this.base.width = S;
    this.base.height = S;
    const g = this.base.getContext('2d')!;
    const B = BASE_SCALE, R0 = this.reach;
    const X = (x: number): number => (x + R0) * B;
    const Z = (z: number): number => (z + R0) * B;

    // ── v3 world: the sea all round and the island's shoreline (see minimapBase.ts) ──
    paintIsland(g);
    // district tints (only where they stay on land)
    for (const d of DISTRICTS) {
      if (d.id !== 'downtown' && d.id !== 'skate' && d.id !== 'homehills') continue;
      g.fillStyle = d.id === 'downtown' ? 'rgba(180,176,190,0.5)' : d.id === 'skate' ? 'rgba(190,190,200,0.4)' : 'rgba(150,200,120,0.25)';
      g.beginPath();
      g.arc(X(d.x), Z(d.z), d.radius * 0.8 * B, 0, Math.PI * 2);
      g.fill();
    }
    // the lake
    g.fillStyle = '#6cc4e4';
    g.beginPath();
    g.ellipse(X(LAKE.x), Z(LAKE.z), LAKE.rx * B, LAKE.rz * B, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.2 * B;
    g.stroke();
    // the lookout hill
    g.fillStyle = 'rgba(120,150,95,0.55)';
    g.beginPath();
    g.arc(X(LOOKOUT.x), Z(LOOKOUT.z), 30 * B, 0, Math.PI * 2);
    g.fill();
    // plazas
    g.fillStyle = '#d7d4de';
    for (const p of PAVED) g.fillRect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w * B, p.d * B);

    // roads: white outline, then lavender (trails dashed, boardwalk tan)
    const stroke = (pts: [number, number][], w: number, col: string, dash?: number[]): void => {
      g.beginPath();
      pts.forEach(([x, z], i) => (i === 0 ? g.moveTo(X(x), Z(z)) : g.lineTo(X(x), Z(z))));
      g.lineWidth = w * B;
      g.strokeStyle = col;
      g.setLineDash(dash ? dash.map((d) => d * B) : []);
      g.stroke();
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const r of ROAD_PATHS) if (r.kind !== 'trail' && r.kind !== 'boardwalk') stroke(r.pts, r.w + 1.6, '#ffffff');
    for (const r of ROAD_PATHS) {
      if (r.kind === 'trail') stroke(r.pts, 1.6, '#b08a5a', [2.4, 1.6]);
      else if (r.kind === 'boardwalk') stroke(r.pts, r.w * 0.8, '#d9b98a');
      else stroke(r.pts, r.w, '#9893b8');
    }
    g.setLineDash([]);
    // bridges and piers
    for (const b of BRIDGES) stroke([[b.ax, b.az], [b.bx, b.bz]], b.w, '#d9b98a');
    for (const p of PIERS) stroke([[p.ax, p.az], [p.bx, p.bz]], p.w, '#d9b98a');

    // plots (pink where a house stands, with the owner's initial colour kept simple)
    const built = new Map(store.data.town.houses.map((h) => [h.plot, h]));
    for (const p of PLOTS) {
      g.fillStyle = built.has(p.index) ? '#ff9ec4' : '#e6f5d4';
      g.fillRect(X(p.center.x - p.size / 2), Z(p.center.z - p.size / 2), p.size * B, p.size * B);
      g.strokeStyle = built.has(p.index) ? '#ffffff' : '#c3dba8';
      g.lineWidth = 0.7 * B;
      g.strokeRect(X(p.center.x - p.size / 2), Z(p.center.z - p.size / 2), p.size * B, p.size * B);
    }
    // the Studio, STYLE boutique, builder's lot
    g.fillStyle = '#ff6fa8';
    g.fillRect(X(WORKSHOP.center.x - WORKSHOP.size.w / 2), Z(WORKSHOP.center.z - WORKSHOP.size.d / 2), WORKSHOP.size.w * B, WORKSHOP.size.d * B);
    g.fillStyle = '#b79bff';
    g.fillRect(X(BOUTIQUE.center.x - BOUTIQUE.size.w / 2), Z(BOUTIQUE.center.z - BOUTIQUE.size.d / 2), BOUTIQUE.size.w * B, BOUTIQUE.size.d * B);
    g.fillStyle = '#ffc93c';
    g.beginPath();
    g.arc(X(BUILD_YARD.center.x), Z(BUILD_YARD.center.z), 8 * B, 0, Math.PI * 2);
    g.fill();

    // district names in big faint emoji, landmarks smaller
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.5;
    g.font = `${Math.round(22 * B)}px ${EMOJI_FONT}`;
    for (const d of DISTRICTS) if (d.id !== 'downtown') g.fillText(d.icon, X(d.x), Z(d.z));
    g.globalAlpha = 1;
    g.font = `${Math.round(8.5 * B)}px ${EMOJI_FONT}`;
    for (const l of LANDMARKS) g.fillText(l.icon, X(l.x), Z(l.z));
    g.fillText('👗', X(BOUTIQUE.center.x), Z(BOUTIQUE.center.z));
    g.fillText('🔨', X(BUILD_YARD.center.x), Z(BUILD_YARD.center.z));
    // my houses: a 🏠 badge so each kid can find home
    for (const h of store.data.town.houses) {
      if (h.ownerId !== store.profile.id) continue;
      const p = PLOTS[h.plot];
      if (!p) continue;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(X(p.center.x), Z(p.center.z), 6 * B, 0, Math.PI * 2);
      g.fill();
      g.font = `${Math.round(8.5 * B)}px ${EMOJI_FONT}`;
      g.fillText('🏠', X(p.center.x), Z(p.center.z) + B * 0.4);
    }
  }

  draw(f: MapFrame): void {
    const g = this.ctx;
    const base = this.base;
    const S = this.px, c = S / 2, k = this.k;
    const rad = tuning.drive.minimapRadius;
    g.clearRect(0, 0, S, S);
    if (!base) return;
    g.save();
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.clip();
    const sx = (f.x + this.reach - rad) * BASE_SCALE, sz = (f.z + this.reach - rad) * BASE_SCALE;
    g.drawImage(base, sx, sz, rad * 2 * BASE_SCALE, rad * 2 * BASE_SCALE, 0, 0, S, S);
    this.dFx = f.x;   // ── v3 perf ── scratch for wx / wz / pin (no closures or tuples per redraw)
    this.dFz = f.z;
    this.dC = c;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // empty lots pulse until you own a house
    if (f.emptyPlots) {
      const pulse = 0.5 + 0.5 * Math.sin(f.t * 4);
      g.fillStyle = '#b6ff3b';   // (alpha through globalAlpha: no rgba() string per lot per redraw)
      for (const p of f.emptyPlots) {
        const x = this.wx(p.center.x), z = this.wz(p.center.z);
        if (hyp(x - c, z - c) > c + 8 * k) continue;
        g.globalAlpha = 0.25 + pulse * 0.35;
        g.beginPath();
        g.arc(x, z, (p.size * 0.62 + pulse * 2) * k, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.lineWidth = Math.max(2, 0.8 * k);
        g.strokeStyle = '#8fd61a';
        g.stroke();
      }
    }
    // the home guide ring
    if (f.home) {
      const x = this.wx(f.home.x), z = this.wz(f.home.z);
      g.lineWidth = Math.max(2, 1 * k);
      g.strokeStyle = '#00d4ff';
      g.beginPath();
      g.arc(x, z, (8 + Math.sin(f.t * 4) * 1.2) * k, 0, Math.PI * 2);
      g.stroke();
    }
    // charms close by
    if (f.charms.length) {
      g.fillStyle = '#00d4ff';
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1.5, 0.5 * k);
      for (const ch of f.charms) {
        const x = this.wx(ch.x), z = this.wz(ch.z), s = (2.4 + Math.sin(f.t * 5 + ch.x) * 0.3) * k;
        g.beginPath();
        g.moveTo(x, z - s * 1.2);
        g.lineTo(x + s * 0.85, z);
        g.lineTo(x, z + s * 1.2);
        g.lineTo(x - s * 0.85, z);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    // the job target: pulsing ring + icon, pinned to the rim if it is off the dial
    if (f.target) {
      this.pin(this.wx(f.target.x), this.wz(f.target.z), 14);
      const x = this.pinX, z = this.pinZ;
      const pulse = 1 + Math.sin(f.t * 5) * 0.18;
      g.fillStyle = f.target.kind === 'pickup' ? 'rgba(255,111,165,0.45)' : 'rgba(255,200,68,0.5)';
      g.beginPath();
      g.arc(x, z, 8.5 * k * pulse, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(2, 1.4 * k);
      g.strokeStyle = f.target.kind === 'pickup' ? '#ff2e88' : '#ffb000';
      g.stroke();
      g.font = this.fontJob;
      g.fillText(f.target.icon, x, z + k * 0.4);
    }
    // district chips on the rim, pointing the way
    for (const d of DISTRICTS) {
      const x = this.wx(d.x), z = this.wz(d.z);
      if (hyp(x - c, z - c) < c - 6) continue;
      this.pin(x, z, 11);
      const rx = this.pinX, rz = this.pinZ;
      g.fillStyle = 'rgba(18,16,28,0.78)';
      g.beginPath();
      g.arc(rx, rz, 9.5, 0, Math.PI * 2);
      g.fill();
      g.font = CHIP_FONT;
      g.fillText(d.icon, rx, rz + 1);
    }
    // v3 rides: every other parked ride in range, small
    if (f.rides && f.rides.length) {
      g.font = this.fontRide;
      for (const r of f.rides) {
        const x = this.wx(r.x), z = this.wz(r.z);
        if (hyp(x - c, z - c) > c - 6) continue;
        g.fillStyle = 'rgba(255,255,255,0.82)';
        g.beginPath();
        g.arc(x, z, 5 * (k / 2.2 + 0.3), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#000';
        g.fillText(r.icon, x, z + 1);
      }
    }
    // the parked car, when walking
    if (f.car) {
      this.pin(this.wx(f.car.x), this.wz(f.car.z), 13);
      const x = this.pinX, z = this.pinZ, pinned = this.pinned;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, z, pinned ? 10 : 7.5 * (k / 2.2 + 0.2), 0, Math.PI * 2);
      g.fill();
      g.font = pinned ? CHIP_FONT_13 : this.fontCar;
      g.fillText(f.car.icon ?? '🚗', x, z + 1);
    }
    // the player: a chunky arrow in the car's colour
    g.translate(c, c);
    g.rotate(f.heading);
    const s = (f.car ? 3.6 : 5) * k;
    g.beginPath();
    g.moveTo(0, -s * 1.15);
    g.lineTo(s * 0.85, s * 0.9);
    g.lineTo(0, s * 0.45);
    g.lineTo(-s * 0.85, s * 0.9);
    g.closePath();
    g.fillStyle = f.color;
    g.fill();
    g.lineWidth = Math.max(2, 1.1 * k);
    g.strokeStyle = '#ffffff';
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The top pills: 💎 counter, job bubble, home guide (stacked, never overlapping)
// ─────────────────────────────────────────────────────────────────────────────
const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2.5 L21 20 L12 15.2 L3 20 Z" fill="currentColor" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';

export class JobBubble {
  readonly el: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly icon: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private shown = false;
  private lastAngle = 1e9;
  private keyIcon = '';   // ── v3 perf ── compared field by field (the old `${icon}|${text}|${kind}` key was a new string every frame)
  private keyText = '';
  private keyKind = '';

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-bubble hidden', parent) as HTMLDivElement;
    this.arrow = el('div', 'arr', this.el, ARROW_SVG) as HTMLDivElement;
    this.icon = el('span', 'ico', this.el) as HTMLSpanElement;
    this.text = el('span', 'txt', this.el) as HTMLSpanElement;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.classList.add('hidden');
  }

  /** `angle` is clockwise from straight up on the screen, in radians. */
  show(icon: string, text: string, kind: 'pickup' | 'dropoff', angle: number): void {
    if (icon !== this.keyIcon || text !== this.keyText || kind !== this.keyKind) {
      this.keyIcon = icon;
      this.keyText = text;
      this.keyKind = kind;
      this.icon.textContent = icon;
      this.text.textContent = text;
      this.el.classList.toggle('pickup', kind === 'pickup');
      this.el.classList.toggle('dropoff', kind === 'dropoff');
    }
    if (!this.shown) {
      this.shown = true;
      this.el.classList.remove('hidden');
    }
    if (Math.abs(wrapAngle(angle - this.lastAngle)) > 0.01) {
      this.lastAngle = angle;
      this.arrow.style.transform = `rotate(${angle}rad)`;
    }
  }
}

/** "🏠 Build your home" with an arrow to the nearest empty lot; once you own a house a small "🏠 Home" button toggles an arrow to it. */
export class HomePill {
  readonly el: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private readonly dist: HTMLSpanElement;
  private mode: 'build' | 'own' | 'off' = 'off';
  private arrowOn = false;
  private lastAngle = 1e9;
  private lastMeters = -1;   // ── v3 perf ── the label is only rewritten when the rounded distance changes

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-home interactive hidden', parent) as HTMLDivElement;
    el('span', 'ico', this.el, '🏠');
    this.text = el('span', 'txt', this.el) as HTMLSpanElement;
    this.arrow = el('div', 'arr', this.el, ARROW_SVG) as HTMLDivElement;
    this.dist = el('span', 'dist', this.el) as HTMLSpanElement;
    bindTap(this.el, () => {
      if (this.mode !== 'own') return;
      this.arrowOn = !this.arrowOn;
      this.apply();
      bus.emit('uiTap', { kind: 'soft' });
    });
  }

  get showsArrowToHome(): boolean {
    return this.mode === 'own' && this.arrowOn;
  }

  private apply(): void {
    const build = this.mode === 'build';
    this.el.classList.toggle('hidden', this.mode === 'off');
    this.el.classList.toggle('build', build);
    this.el.classList.toggle('compact', this.mode === 'own' && !this.arrowOn);
    this.text.textContent = build ? 'Build your home' : 'Home';
    const arrows = build || this.arrowOn;
    this.arrow.style.display = arrows ? '' : 'none';
    this.dist.style.display = arrows ? '' : 'none';
  }

  setMode(mode: 'build' | 'own' | 'off'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'own') this.arrowOn = false;
    this.apply();
  }

  /** `angle` clockwise from straight up on screen; `meters` to the lot / house. */
  point(angle: number, meters: number): void {
    if (this.mode === 'off') return;
    if (Math.abs(wrapAngle(angle - this.lastAngle)) > 0.01) {
      this.lastAngle = angle;
      this.arrow.style.transform = `rotate(${angle}rad)`;
    }
    const m = Math.round(meters);
    if (m !== this.lastMeters) {
      this.lastMeters = m;
      this.dist.textContent = `${m} m`;
    }
  }
}

/** A big tappable bubble above the controls (e.g. "🏠 Build here?" while a car sits on a FOR SALE mat). */
export class PromptBubble {
  readonly el: HTMLDivElement;
  private readonly icon: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private onTap: (() => void) | null = null;
  private shown = false;

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-prompt interactive hidden', parent) as HTMLDivElement;
    this.icon = el('span', 'ico', this.el) as HTMLSpanElement;
    this.text = el('span', 'txt', this.el) as HTMLSpanElement;
    bindTap(this.el, () => this.onTap?.());
  }

  show(icon: string, text: string, onTap: () => void): void {
    this.onTap = onTap;
    this.icon.textContent = icon;
    this.text.textContent = text;
    if (!this.shown) {
      this.shown = true;
      this.el.classList.remove('hidden');
    }
  }

  hide(): void {
    this.onTap = null;
    if (!this.shown) return;
    this.shown = false;
    this.el.classList.add('hidden');
  }
}

export class TopHud {
  readonly el: HTMLDivElement;
  readonly job: JobBubble;
  readonly home: HomePill;
  private readonly chip: HTMLDivElement;
  private readonly count: HTMLSpanElement;
  private readonly next: HTMLSpanElement;
  private shownCount = -1;

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-top passthrough', parent) as HTMLDivElement;
    this.chip = el('div', 'drive-chip', this.el) as HTMLDivElement;
    el('span', 'gem', this.chip, '💎');
    this.count = el('span', 'n', this.chip) as HTMLSpanElement;
    this.next = el('span', 'next', this.chip) as HTMLSpanElement;
    this.job = new JobBubble(this.el);
    this.home = new HomePill(this.el);
  }

  setCharms(n: number, total: number, next: Reward | undefined): void {
    if (n === this.shownCount) return;
    const bump = this.shownCount >= 0 && n > this.shownCount;
    this.shownCount = n;
    this.count.textContent = `${n}/${total}`;
    this.next.textContent = next ? `${next.icon} ${next.label} · ${next.at - n} to go` : '🎉 All rewards unlocked!';
    if (bump) {
      // v3 perf: restart the CSS animation without a forced layout (an offsetWidth read right on the pop frame is a hitch)
      this.chip.classList.add('bump');
      for (const a of this.chip.getAnimations?.({ subtree: true }) ?? []) {
        a.cancel();
        a.play();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner name tags above houses.
// ─────────────────────────────────────────────────────────────────────────────
interface Tag {
  el: HTMLDivElement;
  lastX?: number;   // ── v3 perf ── last written screen position / opacity (style writes only when they change)
  lastY?: number;
  lastO?: number;
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export class NameTags {
  private tags: Tag[] = [];
  private readonly layer: HTMLDivElement;
  private readonly v = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.layer = el('div', 'drive-tags', parent) as HTMLDivElement;
  }

  rebuild(houses: House[]): void {
    for (const t of this.tags) t.el.remove();
    this.tags = [];
    const b = tuning.build;
    for (const h of houses) {
      const plot = PLOTS[h.plot];
      const owner = store.profileById(h.ownerId);
      if (!plot || !owner) continue;
      // centred over the building, above the highest storey
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
      for (const p of h.pieces) {
        if (p.type === 'path' || p.type === 'rug' || p.type === 'rugRect') continue;
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x + 1);
        z0 = Math.min(z0, p.z);
        z1 = Math.max(z1, p.z + 1);
        top = Math.max(top, (p.level ?? 0) + 1);
      }
      const cx = x0 <= x1 ? plot.origin.x + ((x0 + x1) / 2) * b.gridSize : plot.center.x;
      const cz = z0 <= z1 ? plot.origin.z + ((z0 + z1) / 2) * b.gridSize : plot.center.z;
      const e = nameTag(this.layer, `🏡 ${owner.name}`);
      e.style.left = '0';
      e.style.top = '0';
      e.style.display = 'none';
      this.tags.push({ el: e, x: cx, y: Math.max(1, top) * b.wallHeight + 1.1, z: cz, visible: false });
    }
  }

  clear(): void {
    this.rebuild([]);
  }

  update(camera: THREE.PerspectiveCamera, px: number, pz: number, w: number, h: number): void {
    const maxD = tuning.drive.nameTagDistance;
    camera.getWorldDirection(this.fwd);
    for (const t of this.tags) {
      const dist = hyp(t.x - px, t.z - pz);
      this.v.set(t.x, t.y, t.z);
      // in front of the camera?
      const dx = this.v.x - camera.position.x, dy = this.v.y - camera.position.y, dz = this.v.z - camera.position.z;
      const front = dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z;
      if (dist > maxD || front < 1) {
        if (t.visible) {
          t.visible = false;
          t.el.style.display = 'none';
        }
        continue;
      }
      this.v.project(camera);
      const sx = (this.v.x * 0.5 + 0.5) * w, sy = (-this.v.y * 0.5 + 0.5) * h;
      if (sx < -80 || sx > w + 80 || sy < -40 || sy > h + 40) {
        if (t.visible) {
          t.visible = false;
          t.el.style.display = 'none';
        }
        continue;
      }
      if (!t.visible) {
        t.visible = true;
        t.el.style.display = '';
      }
      const qx = Math.round(sx * 10) / 10, qy = Math.round(sy * 10) / 10, qo = Math.round(clamp((maxD - dist) / 12, 0, 1) * 100) / 100;
      if (qx !== t.lastX || qy !== t.lastY) {
        t.lastX = qx;
        t.lastY = qy;
        t.el.style.transform = `translate(${qx}px, ${qy}px) translate(-50%, -100%)`;
      }
      if (qo !== t.lastO) {
        t.lastO = qo;
        t.el.style.opacity = String(qo);
      }
    }
  }
}
