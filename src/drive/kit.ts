// Shared materials, procedural textures and the neon sign atlas used by the
// districts. Everything is drawn into canvases at startup (no image files).
import * as THREE from 'three';
import { PAL } from './palette';

const cache = new Map<string, THREE.Material>();
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}

// ── plain materials ─────────────────────────────────────────────────────────
export const mat = {
  std: (color: string, rough = 0.85, metal = 0) => memo(`std|${color}|${rough}|${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })),
  /** painted metal / plastic with a little gloss */
  paint: (color: string) => memo(`paint|${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35 })),
  chrome: () => memo('chrome', () => new THREE.MeshStandardMaterial({ color: '#d8dbe6', roughness: 0.15, metalness: 0.95 })),
  /** unlit glowing colour (neon strips, bulbs, lit windows) */
  neon: (color: string) => memo(`neon|${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false })),
  glass: () => memo('glass', () => new THREE.MeshStandardMaterial({ color: '#7fb8dc', roughness: 0.06, metalness: 0.7 })),
  /** vertex-coloured standard material (stripes, awnings...) */
  vc: () => memo('vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })),
  trim: () => mat.std(PAL.trim, 0.6),
  roof: () => mat.std(PAL.roofs[0], 0.9),
  concrete: () => mat.std('#b9b6bf', 0.95),
  wood: () => mat.std(PAL.wood, 0.7),
};

// ── facade textures ─────────────────────────────────────────────────────────
/** World size of one facade tile: 4 columns × 3 floors. */
export const FACADE_TILE: [number, number] = [14, 10.8];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type FacadeKind = 'punch' | 'curtain' | 'ribbon';

function drawGlass(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, lit: boolean, tint = 0): void {
  const g = x.createLinearGradient(px, py, px, py + h);
  if (lit) {
    g.addColorStop(0, '#ffe3a8');
    g.addColorStop(1, '#ff9f55');
  } else {
    g.addColorStop(0, tint ? '#6fa8d8' : '#8cc6ee');
    g.addColorStop(0.55, '#3d6b94');
    g.addColorStop(1, '#22364e');
  }
  x.fillStyle = g;
  x.fillRect(px, py, w, h);
  if (!lit) {
    // soft diagonal sky reflection
    x.fillStyle = 'rgba(255,255,255,0.16)';
    x.beginPath();
    x.moveTo(px, py + h * 0.1);
    x.lineTo(px + w * 0.55, py);
    x.lineTo(px + w * 0.25, py + h);
    x.lineTo(px, py + h);
    x.closePath();
    x.fill();
  }
}

export function facadeMat(wall: string, kind: FacadeKind = 'punch', seed = 1): THREE.MeshStandardMaterial {
  // only two window patterns per colour: buildings that share a facade share one mesh (fewer draw calls)
  seed = (Math.abs(Math.round(seed)) % 2) + 1;
  return memo(`facade|${wall}|${kind}|${seed}`, () => {
    const W = 512, H = 384;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    const r = rng(seed * 7919 + 13);
    const base = new THREE.Color(wall);
    x.fillStyle = wall;
    x.fillRect(0, 0, W, H);
    // plaster grain + a faint floor line
    for (let i = 0; i < 1800; i++) {
      x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      x.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3);
    }
    const cw = W / 4, ch = H / 3;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const lit = r() < 0.2;
        if (kind === 'punch') {
          const w = cw * 0.52, h = ch * 0.56;
          const px = col * cw + (cw - w) / 2, py = row * ch + ch * 0.22;
          x.fillStyle = PAL.trim;
          x.fillRect(px - 4, py - 4, w + 8, h + 8);
          drawGlass(x, px, py, w, h, lit);
          x.fillStyle = PAL.trim;
          x.fillRect(px + w / 2 - 1.5, py, 3, h);
          x.fillStyle = 'rgba(255,255,255,0.35)';
          x.fillRect(px - 6, py + h + 4, w + 12, 4); // sill
        } else if (kind === 'curtain') {
          drawGlass(x, col * cw + 2, row * ch + 2, cw - 4, ch - 4, lit, row);
        } else {
          // ribbon: continuous glass band with a spandrel below
          if (col === 0) {
            for (let k = 0; k < 4; k++) drawGlass(x, k * cw + 1, row * ch + ch * 0.12, cw - 2, ch * 0.62, r() < 0.15);
          }
        }
      }
      // floor slab line
      x.fillStyle = `rgba(0,0,0,${kind === 'curtain' ? 0.5 : 0.14})`;
      x.fillRect(0, (row + 1) * ch - 3, W, 3);
    }
    if (kind === 'curtain') {
      x.fillStyle = 'rgba(20,24,34,0.8)';
      for (let col = 0; col <= 4; col++) x.fillRect(col * cw - 1.5, 0, 3, H);
    }
    void base;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'curtain' ? 0.25 : 0.85, metalness: kind === 'curtain' ? 0.35 : 0 });
  });
}

/** One shop window module (glass + door), stretched across a storefront. */
export function storefrontMat(variant: 'glass' | 'dark' | 'warm' = 'glass'): THREE.MeshStandardMaterial {
  return memo(`storefront|${variant}`, () => {
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.fillStyle = PAL.trim;
    x.fillRect(0, 0, W, H);
    const panes = 3;
    const pw = (W - 24) / panes;
    for (let i = 0; i < panes; i++) {
      const px = 12 + i * pw, py = 10, w = pw - 8, h = H - 26;
      const g = x.createLinearGradient(px, py, px, py + h);
      if (variant === 'dark') {
        g.addColorStop(0, '#2d3752');
        g.addColorStop(1, '#0d0f1c');
      } else if (variant === 'warm') {
        g.addColorStop(0, '#ffdca0');
        g.addColorStop(1, '#ff9c58');
      } else {
        g.addColorStop(0, '#9fd8ff');
        g.addColorStop(0.5, '#6d9cc6');
        g.addColorStop(1, '#ffcf8f'); // warm shop interior at the bottom
      }
      x.fillStyle = g;
      x.fillRect(px, py, w, h);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + w * 0.6, py);
      x.lineTo(px + w * 0.15, py + h);
      x.lineTo(px, py + h);
      x.closePath();
      x.fill();
      // shelves / display silhouettes
      x.fillStyle = 'rgba(20,16,30,0.35)';
      x.fillRect(px + w * 0.12, py + h * 0.66, w * 0.76, 5);
      for (let k = 0; k < 4; k++) x.fillRect(px + w * (0.16 + k * 0.2), py + h * 0.5, w * 0.1, h * 0.16);
    }
    // door in the middle pane
    x.fillStyle = PAL.trim;
    x.fillRect(W / 2 - 30, 18, 60, H - 30);
    x.fillStyle = 'rgba(190,230,255,0.5)';
    x.fillRect(W / 2 - 25, 24, 50, H - 44);
    x.fillStyle = '#d9d6ee';
    x.fillRect(W / 2 + 14, H / 2 - 4, 5, 28);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.2, metalness: 0.3, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: variant === 'dark' ? 0.15 : 0.5 });
  });
}

// ── neon sign atlas ─────────────────────────────────────────────────────────
export interface SignRect { u0: number; v0: number; u1: number; v1: number; aspect: number }
export interface SignOpts {
  fg?: string;
  glow?: string;
  bg?: string | null;
  font?: string;
  size?: number;
  border?: string | null;
  slotW?: number; // 1 or 2 slots wide (1024 px)
}

class SignAtlas {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private slots = new Map<string, SignRect>();
  private next = 0;
  readonly W = 2048;
  readonly H = 1024;
  readonly cell = { w: 512, h: 128 };
  tex: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;

  constructor() {
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.W, this.H);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
  }

  /** Draw (or reuse) a sign; returns its uv rectangle. */
  add(text: string, o: SignOpts = {}): SignRect {
    const key = `${text}|${o.fg}|${o.bg}|${o.slotW}`;
    const hit = this.slots.get(key);
    if (hit) return hit;
    const cols = this.W / this.cell.w;
    const span = o.slotW ?? 1;
    if (this.next % cols + span > cols) this.next += cols - (this.next % cols);
    const cx = (this.next % cols) * this.cell.w, cy = Math.floor(this.next / cols) * this.cell.h;
    this.next += span;
    const w = this.cell.w * span, h = this.cell.h;
    const x = this.ctx;
    const fg = o.fg ?? '#ffffff', glow = o.glow ?? fg;
    x.save();
    x.beginPath();
    x.rect(cx, cy, w, h);
    x.clip();
    const bg = o.bg === undefined ? '#12101c' : o.bg;
    x.fillStyle = bg ?? '#000000';
    x.fillRect(cx, cy, w, h);
    if (o.border !== null) {
      x.strokeStyle = o.border ?? glow;
      x.lineWidth = 5;
      x.shadowColor = glow;
      x.shadowBlur = 14;
      x.strokeRect(cx + 8, cy + 8, w - 16, h - 16);
      x.shadowBlur = 0;
    }
    const size = o.size ?? 74;
    x.font = o.font ?? `900 ${size}px "Arial Black","Helvetica Neue",Arial,sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    // fit the text
    const mw = x.measureText(text).width || 1;
    const fit = Math.min(1, (w - 60) / mw);
    if (fit < 1) x.font = (o.font ?? `900 ${size}px "Arial Black","Helvetica Neue",Arial,sans-serif`).replace(/(\d+)px/, `${Math.floor(size * fit)}px`);
    x.shadowColor = glow;
    x.shadowBlur = 26;
    x.fillStyle = glow;
    x.fillText(text, cx + w / 2, cy + h / 2 + 4);
    x.shadowBlur = 10;
    x.fillStyle = fg;
    x.fillText(text, cx + w / 2, cy + h / 2 + 4);
    x.restore();
    const rect: SignRect = { u0: cx / this.W, v0: 1 - (cy + h) / this.H, u1: (cx + w) / this.W, v1: 1 - cy / this.H, aspect: w / h };
    this.slots.set(key, rect);
    this.tex.needsUpdate = true;
    return rect;
  }
}
let atlas: SignAtlas | null = null;
export function signs(): SignAtlas {
  return (atlas ??= new SignAtlas());
}
export function signUV(r: SignRect): number[][] {
  return [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
}

/** A dedicated texture for a big one-off sign (e.g. the lookout town sign). */
export function bigSignTexture(text: string, fg: string, glow: string, w = 1024, h = 256, sub?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = '#12101c';
  x.fillRect(0, 0, w, h);
  x.strokeStyle = glow;
  x.lineWidth = 8;
  x.shadowColor = glow;
  x.shadowBlur = 22;
  x.strokeRect(14, 14, w - 28, h - 28);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `900 ${Math.floor(h * (sub ? 0.46 : 0.56))}px "Arial Black","Helvetica Neue",Arial,sans-serif`;
  x.shadowBlur = 34;
  x.fillStyle = glow;
  x.fillText(text, w / 2, h * (sub ? 0.4 : 0.52));
  x.shadowBlur = 12;
  x.fillStyle = fg;
  x.fillText(text, w / 2, h * (sub ? 0.4 : 0.52));
  if (sub) {
    x.shadowBlur = 10;
    x.font = `800 ${Math.floor(h * 0.17)}px "Helvetica Neue",Arial,sans-serif`;
    x.fillStyle = '#ffffff';
    x.fillText(sub, w / 2, h * 0.78);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A one-off text plane material (FOR SALE boards, street names, posters). */
export function textMat(lines: string[], opts: { bg: string; fg: string; w?: number; h?: number; accent?: string }): THREE.MeshBasicMaterial {
  const key = `text|${lines.join('/')}|${opts.bg}|${opts.fg}|${opts.accent}`;
  return memo(key, () => {
    const w = opts.w ?? 512, h = opts.h ?? 320;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.fillStyle = opts.bg;
    x.fillRect(0, 0, w, h);
    if (opts.accent) {
      x.fillStyle = opts.accent;
      x.fillRect(0, 0, w, 16);
      x.fillRect(0, h - 16, w, 16);
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = opts.fg;
    const n = lines.length;
    lines.forEach((l, i) => {
      const size = i === 0 ? h * 0.3 : h * 0.2;
      x.font = `900 ${Math.floor(size)}px "Arial Black","Helvetica Neue",Arial,sans-serif`;
      x.fillText(l, w / 2, h * ((i + 0.62) / (n + 0.1)));
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  });
}
