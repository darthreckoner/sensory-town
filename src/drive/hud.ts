// Drive HUD pieces: the round minimap, the "where to?" job bubble with its
// turning arrow, and the floating owner name tags above houses.
import * as THREE from 'three';
import { tuning } from '../tuning';
import { store } from '../core/store';
import { el, nameTag } from '../ui/ui';
import { PLOTS, ROADS, WORKSHOP, BUILD_YARD, LANDMARKS, BOUNDS } from '../world/townLayout';
import type { House } from '../core/model';
import { clamp, wrapAngle } from './envUtils';

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// ─────────────────────────────────────────────────────────────────────────────
// Minimap — north up, the whole town, a round dial.
// ─────────────────────────────────────────────────────────────────────────────
export interface MapTarget {
  x: number;
  z: number;
  icon: string;
  /** Pickup (pink) or destination (gold). */
  kind: 'pickup' | 'dropoff';
}

export class Minimap {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private px = 150;
  private sc = 1;

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-minimap tr', parent) as HTMLDivElement;
    this.canvas = el('canvas', '', this.el) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.layout();
  }

  private layout(): void {
    const size = tuning.drive.minimapSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.px = Math.round(size * dpr);
    this.canvas.width = this.base.width = this.px;
    this.canvas.height = this.base.height = this.px;
    this.el.style.width = this.el.style.height = `${size}px`;
    this.sc = this.px / 2 / tuning.drive.minimapRadius;
  }

  /** Redraw the static layer (roads, plots, houses, landmarks). Call on scene enter. */
  rebuild(): void {
    this.layout();
    const g = this.base.getContext('2d')!;
    const S = this.px, c = S / 2, k = this.sc;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#bfe9a8';
    g.fillRect(0, 0, S, S);
    // map edge (hedge)
    g.strokeStyle = '#7fd48f';
    g.lineWidth = Math.max(2, 1.6 * k);
    g.strokeRect(c - BOUNDS * k, c - BOUNDS * k, BOUNDS * 2 * k, BOUNDS * 2 * k);
    // plots (pink where a house stands)
    const built = new Set(store.data.town.houses.map((h) => h.plot));
    for (const p of PLOTS) {
      g.fillStyle = built.has(p.index) ? '#ffc2da' : '#e3f6cf';
      g.fillRect(c + (p.center.x - p.size / 2) * k, c + (p.center.z - p.size / 2) * k, p.size * k, p.size * k);
    }
    // roads: white outline, then lavender
    g.fillStyle = '#ffffff';
    for (const r of ROADS) g.fillRect(c + (r.x - r.w / 2 - 0.7) * k, c + (r.z - r.d / 2 - 0.7) * k, (r.w + 1.4) * k, (r.d + 1.4) * k);
    g.fillStyle = '#aaa5c8';
    for (const r of ROADS) g.fillRect(c + (r.x - r.w / 2) * k, c + (r.z - r.d / 2) * k, r.w * k, r.d * k);
    // workshop + yard footprints
    g.fillStyle = '#ff8fb1';
    g.fillRect(c + (WORKSHOP.center.x - WORKSHOP.size.w / 2) * k, c + (WORKSHOP.center.z - WORKSHOP.size.d / 2) * k, WORKSHOP.size.w * k, WORKSHOP.size.d * k);
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(c + BUILD_YARD.center.x * k, c + BUILD_YARD.center.z * k, 3.4 * k, 0, Math.PI * 2);
    g.fill();
    // landmarks
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(8.5 * k)}px ${EMOJI_FONT}`;
    for (const l of LANDMARKS) g.fillText(l.icon, c + l.x * k, c + l.z * k);
    // my houses: a little 🏠 badge so each kid can find home
    g.font = `${Math.round(8 * k)}px ${EMOJI_FONT}`;
    for (const h of store.data.town.houses) {
      if (h.ownerId !== store.profile.id) continue;
      const p = PLOTS[h.plot];
      if (!p) continue;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(c + p.center.x * k, c + p.center.z * k, 5.2 * k, 0, Math.PI * 2);
      g.fill();
      g.fillText('🏠', c + p.center.x * k, c + p.center.z * k + k * 0.4);
    }
    // entry pads
    for (const [p, icon] of [[WORKSHOP.pad, '🧪'], [BUILD_YARD.pad, '🔨']] as const) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(c + p.x * k, c + p.z * k, 6.4 * k, 0, Math.PI * 2);
      g.fill();
      g.font = `${Math.round(10.5 * k)}px ${EMOJI_FONT}`;
      g.fillText(icon, c + p.x * k, c + p.z * k + k * 0.4);
    }
    g.restore();
  }

  draw(carX: number, carZ: number, heading: number, carColor: string, target: MapTarget | null, t: number): void {
    const g = this.ctx;
    const S = this.px, c = S / 2, k = this.sc;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.base, 0, 0);
    g.save();
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.clip();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (target) {
      // pulsing ring + icon; pinned to the rim if it is off the dial
      let tx = target.x * k, tz = target.z * k;
      const len = Math.hypot(tx, tz), maxR = c - 12;
      if (len > maxR) {
        tx *= maxR / len;
        tz *= maxR / len;
      }
      const pulse = 1 + Math.sin(t * 5) * 0.18;
      g.fillStyle = target.kind === 'pickup' ? 'rgba(255,111,165,0.4)' : 'rgba(255,200,68,0.5)';
      g.beginPath();
      g.arc(c + tx, c + tz, 8.5 * k * pulse, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(2, 1.4 * k);
      g.strokeStyle = target.kind === 'pickup' ? '#ff5d8f' : '#ffb000';
      g.stroke();
      g.font = `${Math.round(9 * k)}px ${EMOJI_FONT}`;
      g.fillText(target.icon, c + tx, c + tz + k * 0.4);
    }
    // the car: a chunky arrow in the car's colour
    let cx = carX * k, cz = carZ * k;
    const cl = Math.hypot(cx, cz), cmax = c - 8;
    if (cl > cmax) {
      cx *= cmax / cl;
      cz *= cmax / cl;
    }
    g.translate(c + cx, c + cz);
    g.rotate(heading);
    const s = 5.6 * k;
    g.beginPath();
    g.moveTo(0, -s * 1.15);
    g.lineTo(s * 0.85, s * 0.9);
    g.lineTo(0, s * 0.45);
    g.lineTo(-s * 0.85, s * 0.9);
    g.closePath();
    g.fillStyle = carColor;
    g.fill();
    g.lineWidth = Math.max(2, 1.2 * k);
    g.strokeStyle = '#ffffff';
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job bubble: "🍦 Ice Cream!" with an arrow that points at the target.
// ─────────────────────────────────────────────────────────────────────────────
export class JobBubble {
  readonly el: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly icon: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private shown = false;
  private lastAngle = 1e9;
  private key = '';

  constructor(parent: HTMLElement) {
    this.el = el('div', 'drive-bubble tc hidden', parent) as HTMLDivElement;
    this.arrow = el(
      'div',
      'arr',
      this.el,
      '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 2.5 L21 20 L12 15.2 L3 20 Z" fill="currentColor" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
    ) as HTMLDivElement;
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
    const key = `${icon}|${text}|${kind}`;
    if (key !== this.key) {
      this.key = key;
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

// ─────────────────────────────────────────────────────────────────────────────
// Owner name tags above houses.
// ─────────────────────────────────────────────────────────────────────────────
interface Tag {
  el: HTMLDivElement;
  x: number;
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
    for (const h of houses) {
      const plot = PLOTS[h.plot];
      const owner = store.profileById(h.ownerId);
      if (!plot || !owner) continue;
      const e = nameTag(this.layer, `🏡 ${owner.name}`);
      e.style.left = '0';
      e.style.top = '0';
      e.style.display = 'none';
      this.tags.push({ el: e, x: plot.center.x, z: plot.center.z, visible: false });
    }
  }

  clear(): void {
    this.rebuild([]);
  }

  update(camera: THREE.PerspectiveCamera, carX: number, carZ: number, w: number, h: number): void {
    const maxD = tuning.drive.nameTagDistance;
    camera.getWorldDirection(this.fwd);
    for (const t of this.tags) {
      const dist = Math.hypot(t.x - carX, t.z - carZ);
      this.v.set(t.x, 5.2, t.z);
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
      t.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      t.el.style.opacity = clamp((maxD - dist) / 12, 0, 1).toFixed(2);
    }
  }
}
