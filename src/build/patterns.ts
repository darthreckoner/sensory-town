// Procedural, tileable surface patterns (grayscale multipliers) for walls, floors
// and roofs. Drawn straight into a pixel buffer (no canvas, no images): the
// baker maps them onto geometry in world space, and the vertex colour tints
// them, so brick / wood / marble stay recolourable.
import * as THREE from 'three';

export type PatternId =
  | 'brick' | 'panel' | 'stripe' | 'tile' | 'oak' | 'dark' | 'marble' | 'checker' | 'carpet' | 'concrete' | 'shingle'
  | 'plank' | 'steel';   // v3 world builds

export const PATTERN_SIZE = 256;

function hash(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise that wraps every `period` lattice cells (so it tiles). */
function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const w = (n: number) => ((n % period) + period) % period;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal noise, wrapping. */
function fbm(x: number, y: number, period: number, seed: number): number {
  return vnoise(x, y, period, seed) * 0.6 + vnoise(x * 2, y * 2, period * 2, seed + 7) * 0.3 + vnoise(x * 4, y * 4, period * 4, seed + 13) * 0.1;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Generate a pattern as RGBA bytes (size × size). */
export function makePattern(id: PatternId, size = PATTERN_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const S = size / 256;
  const put = (x: number, y: number, v: number) => {
    const i = (y * size + x) * 4;
    const b = Math.round(clamp01(v) * 255);
    data[i] = b;
    data[i + 1] = b;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // coordinates in a 256-px design space
      const X = x / S, Y = y / S;
      let v = 1;
      switch (id) {
        case 'brick': {
          const row = Math.floor(Y / 16), off = (row % 2) * 32;
          const bx = Math.floor((X + off) / 64), fx = (X + off) % 64, fy = Y % 16;
          const n = (hash(x, y, 3) - 0.5) * 0.07;
          if (fx < 2.2 || fy < 2.2) v = 0.5 + n;
          else v = 0.7 + 0.26 * hash(row, bx, 5) + n + (fy > 12 ? -0.03 : 0);
          break;
        }
        case 'panel': {
          const board = Math.floor(X / 32), fx = X % 32;
          const grain = (vnoise(X * 0.4, Y * 0.02, 8, 11 + board) - 0.5) * 0.14 + (vnoise(X * 1.5, Y * 0.08, 32, 4) - 0.5) * 0.05;
          if (fx < 2) v = 0.42;
          else if (fx < 4) v = 0.78;
          else v = 0.86 + 0.1 * hash(board, 1, 9) + grain;
          break;
        }
        case 'stripe': {
          const s = Math.floor(X / 32), fx = X % 32;
          v = s % 2 === 0 ? 1 : 0.84;
          if (fx < 1.5 || fx > 30.5) v -= 0.06;
          v += (hash(x, y, 2) - 0.5) * 0.025;
          break;
        }
        case 'tile': {
          const tx = Math.floor(X / 64), ty = Math.floor(Y / 64), fx = X % 64, fy = Y % 64;
          if (fx < 2.2 || fy < 2.2) v = 0.56;
          else v = 0.93 + (hash(tx, ty, 6) - 0.5) * 0.06 - (fx + fy) * 0.0004;
          break;
        }
        case 'oak':
        case 'dark': {
          const rows = id === 'oak' ? 8 : 6;
          const rh = 256 / rows;
          const row = Math.floor(Y / rh), fy = Y % rh;
          const seed = id === 'oak' ? 21 : 57;
          const joint = hash(row, 0, seed) * 256;
          const off = (((X - joint) % 256) + 256) % 256;
          const seg = off >= 128 ? 1 : 0;           // two planks (0.5 long) per row per tile
          const tone = 0.78 + 0.2 * hash(row, seg, seed + 1);
          const grain = (vnoise(X * 0.05, Y * 0.5, 16, seed + row) - 0.5) * 0.16 + (vnoise(X * 0.2, Y * 1.2, 64, seed + 3) - 0.5) * 0.06;
          v = tone + grain;
          if (fy < 1.6) v = 0.4;
          if (off % 128 < 1.4) v = Math.min(v, 0.45);
          break;
        }
        case 'marble': {
          const n = fbm(X / 256 * 4, Y / 256 * 4, 4, 31);
          const veinPhase = (X + Y * 0.55) / 256 * Math.PI * 2 * 3 + n * 8;
          const vein = Math.pow(1 - Math.abs(Math.sin(veinPhase)), 26);
          const vein2 = Math.pow(1 - Math.abs(Math.sin(veinPhase * 0.6 + n * 4 + 2)), 40);
          v = 0.97 - vein * 0.2 - vein2 * 0.14 + (n - 0.5) * 0.05;
          break;
        }
        case 'checker': {
          const cx = Math.floor(X / 128), cy = Math.floor(Y / 128);
          v = (cx + cy) % 2 === 0 ? 1 : 0.14;
          v += (hash(x, y, 8) - 0.5) * 0.02;
          break;
        }
        case 'carpet': {
          v = 0.86 + (hash(x, y, 12) - 0.5) * 0.18 + (vnoise(X * 0.1, Y * 0.1, 26, 17) - 0.5) * 0.08;
          break;
        }
        case 'concrete': {
          const tx = Math.floor(X / 128), ty = Math.floor(Y / 128), fx = X % 128, fy = Y % 128;
          const speck = hash(x, y, 14) > 0.96 ? -0.08 : 0;
          if (fx < 3 || fy < 3) v = 0.52;
          else v = 0.86 + 0.08 * hash(tx, ty, 19) + (fbm(X / 16, Y / 16, 16, 23) - 0.5) * 0.1 + speck;
          break;
        }
        // ── v3 build: chunky world-scale wood planks and riveted steel panels ──
        case 'plank': {
          const rh = 32, row = Math.floor(Y / rh), fy = Y % rh;      // 8 boards per tile
          const joint = hash(row, 0, 71) * 256;
          const off = (((X - joint) % 256) + 256) % 256;
          const seg = off >= 128 ? 1 : 0;
          const tone = 0.8 + 0.2 * hash(row, seg, 73);
          const grain = (vnoise(X * 0.03, Y * 0.7, 16, 75 + row) - 0.5) * 0.2 + (vnoise(X * 0.12, Y * 1.6, 64, 77) - 0.5) * 0.07;
          v = tone + grain;
          if (fy < 2.2) v = 0.36;
          else if (fy > rh - 2.4) v *= 0.88;
          if (off % 128 < 2.2) v = Math.min(v, 0.4);
          const ox = off % 128;
          for (const nx of [9, 119]) for (const ny of [9, 23]) if (Math.hypot(ox - nx, fy - ny) < 2.6) v = 0.28;   // nail heads
          break;
        }
        case 'steel': {
          const px = X % 128, py = Y % 128;                          // 2 x 2 panels per tile
          const edge = Math.min(px, py, 127 - px, 127 - py);
          const n = (vnoise(X * 0.02, Y * 1.2, 32, 83) - 0.5) * 0.08 + (hash(x, y, 84) - 0.5) * 0.04;
          v = 0.9 + n;
          if (edge < 2.6) v = 0.4;
          else if (edge < 5.5) v = 1.0 + n * 0.5;
          else if (edge < 9) v = 0.8 + n;
          for (const [rx, ry] of [[16, 16], [112, 16], [16, 112], [112, 112], [64, 16], [64, 112], [16, 64], [112, 64]]) {
            const d = Math.hypot(px - rx, py - ry);
            if (d < 3.6) v = 0.34;
            else if (d < 5.2) v = 1.0;
          }
          break;
        }
        case 'shingle': {
          const rows = 5, rh = 256 / rows;
          const row = Math.floor(Y / rh), fy = (Y % rh) / rh, off = (row % 2) * 32;
          const tx = Math.floor((X + off) / 64), fx = (X + off) % 64;
          v = 0.74 + 0.22 * hash(row, tx, 33);
          v -= fy > 0.82 ? (fy - 0.82) * 2.4 : 0;     // shadow under each course
          if (fx < 1.5) v -= 0.18;
          v += (hash(x, y, 9) - 0.5) * 0.04;
          break;
        }
      }
      put(x, y, v);
    }
  }
  return data;
}

const cache = new Map<PatternId, THREE.DataTexture>();

/** Shared repeating texture for a pattern. */
export function patternTexture(id: PatternId): THREE.DataTexture {
  let t = cache.get(id);
  if (!t) {
    t = new THREE.DataTexture(makePattern(id), PATTERN_SIZE, PATTERN_SIZE, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    cache.set(id, t);
  }
  return t;
}
