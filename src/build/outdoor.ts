// Outdoor yard pieces (placed on the plot) and village decorations (placed in the
// world). Same anchor-local frame as furniture.ts; yard objects stand on the
// ground (y = G, a hair above the lot's pad) instead of a floor tile.
import type { Decoration, PieceType, PlacedPiece } from '../core/model';
import { Brush, lighten, darken, mix } from './bake';
import { K } from './kit';
import { seeded } from '../world/townLayout';
import type { GenFn } from './pieces';

const G = 0.03;
const MUSTARD = '#d9a441';

// ── Yard pieces ─────────────────────────────────────────────────────────────
const hedge: GenFn = (br, p) => {
  const c = p.color;
  br.blk(-0.5, G, -0.4, 0.5, G + 1.15, 0.4, c, 'paint', 0.1);
  br.blob(-0.25, G + 1.15, 0, 0.3, 0.12, 0.38, lighten(c, 0.1));
  br.blob(0.22, G + 1.14, 0.02, 0.3, 0.12, 0.38, darken(c, 0.08));
  br.blob(0, G + 0.6, -0.4, 0.42, 0.5, 0.06, lighten(c, 0.05));
};

const gardenBed: GenFn = (br, p) => {
  const c = p.color;
  br.blk(-0.5, G, -0.4, 1.5, G + 0.45, 0.4, c, 'wood');
  br.blk(-0.44, G + 0.3, -0.34, 1.44, G + 0.46, 0.34, K.soil);
  const rnd = seeded(p.x * 17 + p.z * 5 + 1);
  const cols = ['#ff2e88', '#ffc93c', '#ffffff', '#7c4dff', '#ff8a3d'];
  for (let i = 0; i < 9; i++) {
    const x = -0.35 + (i % 5) * 0.43 + rnd() * 0.1, z = -0.2 + Math.floor(i / 5) * 0.35 + rnd() * 0.1;
    br.blob(x, G + 0.55, z, 0.14, 0.1, 0.14, K.leafLight);
    if (br.fine) br.ball(x, G + 0.68 + rnd() * 0.1, z, 0.06, cols[i % cols.length]);
  }
};

const trampoline: GenFn = (br, p) => {
  const cx = 0.5, cz = 0.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    br.rodBetween([cx + Math.cos(a) * 0.88, G + 0.82, cz + Math.sin(a) * 0.88], [cx + Math.cos(a) * 0.95, G, cz + Math.sin(a) * 0.95], 0.025, K.black, 'metal', 6);
  }
  br.torus(cx, G + 0.84, cz, 0.9, 0.03, K.black, 'metal', Math.PI / 2, 28);
  br.cyl(cx, G + 0.82, cz, 0.84, 0.84, 0.02, K.black, 'fabric', 28);
  br.torus(cx, G + 0.86, cz, 0.84, 0.05, p.color, 'fabric', Math.PI / 2, 28);
  br.cyl(cx, G + 0.84, cz, 0.18, 0.18, 0.004, K.white, 'fabric', 16);
  // safety net posts + translucent net
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    br.rod(cx + Math.cos(a) * 0.9, G + 1.4, cz + Math.sin(a) * 0.9, 0.014, 1.1, K.black, 'metal', 5);
  }
  br.cyl(cx, G + 1.4, cz, 0.9, 0.9, 1.0, '#ffffff', 'glass', 24);
};

const bbq: GenFn = (br, p) => {
  const c = p.color;
  for (const [x, z] of [[-0.3, -0.12], [0.3, -0.12], [-0.3, 0.2], [0.3, 0.2]]) br.rod(x, G + 0.3, z, 0.02, 0.6, K.black, 'metal', 6);
  br.blk(-0.42, G + 0.6, -0.22, 0.42, G + 0.78, 0.3, c, 'metal');
  br.blk(-0.42, G + 0.78, -0.22, 0.42, G + 0.95, 0.3, darken(c, 0.1), 'metal', 0.05);       // lid
  br.blk(-0.5, G + 0.78, -0.2, 0.5, G + 0.8, 0.0, K.chrome, 'metal');
  br.blk(-0.42, G + 0.3, -0.2, 0.42, G + 0.33, 0.28, K.charcoal, 'metal');
  br.rod(0, G + 1.0, 0.22, 0.015, 0.14, K.black, 'metal', 6);
  br.blk(-0.05, G + 0.9, -0.28, 0.05, G + 0.93, -0.22, K.chrome, 'metal');
  br.cyl(-0.3, G + 0.86, -0.27, 0.025, 0.025, 0.03, K.black, 'gloss', 8, Math.PI / 2);
};

const patioSet: GenFn = (br, p) => {
  const cx = 0.5, cz = 0.5;
  br.cyl(cx, G + 0.72, cz, 0.46, 0.46, 0.035, K.woodLight, 'wood', 24);
  br.rod(cx, G + 0.36, cz, 0.04, 0.7, K.black, 'metal', 8);
  br.cyl(cx, G + 0.015, cz, 0.25, 0.25, 0.03, K.black, 'metal', 16);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, r = 0.78;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const yaw = -a + Math.PI / 2;
    const m = (lx: number, ly: number, lz: number) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, G + ly, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz] as [number, number, number];
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) br.rodBetween(m(lx, 0.42, lz), m(lx * 1.1, 0, lz * 1.1), 0.014, K.black, 'metal', 5);
    br.rbox(x, G + 0.45, z, 0.42, 0.07, 0.42, K.charcoal, 0.02, 'fabric', yaw);
    const bk = m(0, 0.72, 0.2);
    br.rbox(bk[0], bk[1], bk[2], 0.42, 0.42, 0.06, K.charcoal, 0.02, 'fabric', yaw);
  }
  // umbrella
  br.rod(cx, G + 1.3, cz, 0.018, 2.5, K.chrome, 'metal', 6);
  br.cyl(cx, G + 2.45, cz, 0.04, 1.25, 0.34, p.color, 'fabric', 12);
  br.ball(cx, G + 2.64, cz, 0.04, K.chrome, 'metal');
};

const swing: GenFn = (br, p) => {
  const c = p.color, y = 2.25, cz = 0.5;
  br.blk(-0.45, G + y - 0.06, cz - 0.05, 2.45, G + y + 0.04, cz + 0.05, K.black, 'metal');
  for (const x of [-0.42, 2.42]) {
    br.rodBetween([x, G + y, cz], [x, G, cz + 0.95], 0.04, c, 'metal', 6);
    br.rodBetween([x, G + y, cz], [x, G, cz - 0.95], 0.04, c, 'metal', 6);
  }
  for (const sx of [0.5, 1.5]) {
    for (const dx of [-0.2, 0.2]) br.rodBetween([sx + dx, G + y - 0.05, cz], [sx + dx, G + 0.52, cz], 0.008, K.black, 'metal', 4);
    br.rbox(sx, G + 0.5, cz, 0.5, 0.05, 0.22, K.black, 0.02, 'fabric');
  }
};

const mailbox: GenFn = (br) => {
  br.blk(-0.04, G, 0.1, 0.04, G + 1.1, 0.18, K.black, 'metal');
  br.blk(-0.2, G + 1.1, 0.02, 0.2, G + 1.32, 0.3, K.black, 'metal', 0.03);
  br.blk(-0.14, G + 1.2, 0.0, 0.14, G + 1.28, 0.025, K.cream);
  br.blk(0.2, G + 1.22, 0.1, 0.22, G + 1.38, 0.14, '#ff2e88', 'paint');
};

const carport: GenFn = (br, p) => {
  br.blk(-0.5, G, -0.5, 2.5, G + 0.05, 2.5, '#9a978f', 'concrete');
  for (const [x, z] of [[-0.4, -0.4], [2.4, -0.4], [-0.4, 2.4], [2.4, 2.4]]) br.blk(x - 0.05, G, z - 0.05, x + 0.05, G + 2.65, z + 0.05, K.black, 'metal');
  br.blk(-0.55, G + 2.65, -0.55, 2.55, G + 2.82, 2.55, p.color, 'paint');
  // light trim round the edge (~0.13 high) so the roof reads as a roof from above, plus a solar array
  const top = G + 2.82, lip = lighten(p.color, 0.55), lw = 0.08, lh = top + 0.13;
  br.blk(-0.55, top, -0.55, 2.55, lh, -0.55 + lw, lip, 'paint');
  br.blk(-0.55, top, 2.55 - lw, 2.55, lh, 2.55, lip, 'paint');
  br.blk(-0.55, top, -0.55, -0.55 + lw, lh, 2.55, lip, 'paint');
  br.blk(2.55 - lw, top, -0.55, 2.55, lh, 2.55, lip, 'paint');
  for (const [x, z] of [[0.45, 0.4], [1.55, 0.4], [0.45, 1.6], [1.55, 1.6]]) {
    br.box(x, top + 0.17, z, 0.92, 0.04, 0.92, '#2f4f86', 'paint', 0, -0.22, 0);
    br.box(x, top + 0.195, z, 0.92, 0.012, 0.012, K.white, 'paint', 0, -0.22, 0);
    br.box(x, top + 0.195, z, 0.012, 0.012, 0.9, K.white, 'paint', 0, -0.22, 0);
    br.blk(x - 0.4, top, z - 0.04, x - 0.34, top + 0.1, z + 0.04, K.steel, 'paint');
    br.blk(x + 0.34, top, z - 0.04, x + 0.4, top + 0.1, z + 0.04, K.steel, 'paint');
  }
  br.blk(1.0, G + 2.6, 0.98, 1.0 + 0.2, G + 2.65, 1.18, '#fff2d6', 'glow');
};

const pool: GenFn = (br, p) => {
  const x0 = -0.5, x1 = 3.5, z0 = -0.5, z1 = 2.5, deck = G + 0.14;
  const hx0 = -0.05, hx1 = 3.05, hz0 = 0.05, hz1 = 1.95;
  const dk = '#d8d2c6';
  br.blk(x0, G, z0, x1, deck, hz0, dk, 'concrete');                      // deck around the opening
  br.blk(x0, G, hz1, x1, deck, z1, dk, 'concrete');
  br.blk(x0, G, hz0, hx0, deck, hz1, dk, 'concrete');
  br.blk(hx1, G, hz0, x1, deck, hz1, dk, 'concrete');
  br.blk(hx0, G, hz0, hx1, G + 0.03, hz1, mix(p.color, K.white, 0.35), 'tile');   // basin floor
  br.blk(hx0 + 0.01, G + 0.03, hz0, hx1 - 0.01, G + 0.13, hz0 + 0.01, mix(p.color, K.white, 0.2), 'tile');
  br.blk(hx0 + 0.01, G + 0.03, hz1 - 0.01, hx1 - 0.01, G + 0.13, hz1, mix(p.color, K.white, 0.2), 'tile');
  br.blk(hx0, G + 0.03, hz0, hx0 + 0.01, G + 0.13, hz1, mix(p.color, K.white, 0.2), 'tile');
  br.blk(hx1 - 0.01, G + 0.03, hz0, hx1, G + 0.13, hz1, mix(p.color, K.white, 0.2), 'tile');
  br.blk(hx0, G + 0.095, hz0, hx1, G + 0.105, hz1, p.color, 'water');     // the water
  // white coping
  br.blk(hx0 - 0.04, deck, hz0 - 0.04, hx1 + 0.04, deck + 0.02, hz0 + 0.02, K.white, 'paint');
  br.blk(hx0 - 0.04, deck, hz1 - 0.02, hx1 + 0.04, deck + 0.02, hz1 + 0.04, K.white, 'paint');
  br.blk(hx0 - 0.04, deck, hz0 - 0.04, hx0 + 0.02, deck + 0.02, hz1 + 0.04, K.white, 'paint');
  br.blk(hx1 - 0.02, deck, hz0 - 0.04, hx1 + 0.04, deck + 0.02, hz1 + 0.04, K.white, 'paint');
  // ladder
  for (const z of [0.4, 0.6]) {
    br.torus(2.7, deck + 0.28, z, 0.18, 0.012, K.chrome, 'metal', 0, 14);
    br.rod(2.7 - 0.18, deck + 0.14, z, 0.012, 0.3, K.chrome, 'metal', 5);
  }
  // two loungers
  for (const x of [0.2, 1.0]) {
    br.blk(x - 0.25, deck + 0.18, 2.0, x + 0.25, deck + 0.24, 2.4, K.white, 'fabric', 0.02);
    br.rodBetween([x, deck + 0.24, 2.4], [x, deck + 0.6, 2.46], 0.01, K.white, 'paint', 4);
    br.blk(x - 0.25, deck + 0.3, 2.35, x + 0.25, deck + 0.7, 2.4, K.white, 'fabric', 0.02);
    for (const dx of [-0.2, 0.2]) for (const z of [2.04, 2.36]) br.rod(x + dx, deck + 0.09, z, 0.012, 0.18, K.black, 'metal', 4);
  }
};

const hotTub: GenFn = (br, p) => {
  const cx = 0.5, cz = 0.5;
  br.cyl(cx, G + 0.39, cz, 0.98, 0.98, 0.78, p.color, 'wood', 28);
  br.cyl(cx, G + 0.795, cz, 0.88, 0.88, 0.01, '#5ee0ff', 'water', 28);                          // the water, a little below the rim
  br.torus(cx, G + 0.82, cz, 0.93, 0.07, K.white, 'gloss', Math.PI / 2, 28);                       // rounded rim
  br.torus(cx, G + 0.79, cz, 0.86, 0.012, '#7c4dff', 'rgb', Math.PI / 2, 28);                      // LED ring
  br.blk(cx + 0.9, G, cz - 0.3, cx + 1.15, G + 0.4, cz + 0.3, p.color, 'wood');                     // step
  br.blk(cx + 0.9, G + 0.4, cz - 0.3, cx + 1.15, G + 0.44, cz + 0.3, K.white, 'gloss');
};

const yardTree: GenFn = (br, p) => {
  const d: Decoration = { id: 'x', type: 'tree', x: 0, z: 0, rot: 0, color: p.color, ownerId: '' };
  genDeco(br, d);
};

export const OUTDOOR_GEN: Partial<Record<PieceType, GenFn>> = {
  hedge, gardenBed, trampoline, bbq, patioSet, swing, mailbox, carport, pool, hotTub, yardTree,
};

// ── Village decorations (local frame: origin on the ground at the deco's x,z) ─
const BARK = '#7a5a40';

export function genDeco(br: Brush, d: Decoration): void {
  const c = d.color;
  const rnd = seeded(Math.round(d.x * 31 + d.z * 17) + 5);
  switch (d.type) {
    case 'tree': {
      // oak: tapering trunk, a broad crown of leafy clumps
      br.lathe(0, 0, 0, [[0.0, 0], [0.26, 0], [0.2, 0.8], [0.14, 2.2], [0.0, 2.2]], BARK, 'wood', 9);
      br.rodBetween([0, 1.8, 0], [0.7, 2.7, 0.2], 0.07, BARK, 'wood', 5);
      br.rodBetween([0, 2.0, 0], [-0.65, 2.9, -0.3], 0.07, BARK, 'wood', 5);
      const clumps: [number, number, number, number][] = [[0, 3.5, 0, 1.25], [0.9, 3.1, 0.3, 0.85], [-0.9, 3.3, -0.3, 0.9], [0.2, 4.35, -0.2, 0.85], [-0.2, 3.1, 0.95, 0.8], [0.3, 3.0, -0.95, 0.8]];
      clumps.forEach(([x, y, z, r], i) => br.blob(x, y, z, r, r * 0.85, r, i % 3 === 0 ? lighten(c, 0.1) : i % 3 === 1 ? darken(c, 0.1) : c, 'paint', rnd() * 3));
      return;
    }
    case 'birch': {
      br.lathe(0, 0, 0, [[0.0, 0], [0.12, 0], [0.09, 3.2], [0.0, 3.2]], '#ece8de', 'wood', 8);
      for (let i = 0; i < 6; i++) br.blk(-0.1, 0.4 + i * 0.5, -0.02 + (i % 2) * 0.02, 0.1, 0.47 + i * 0.5, 0.0, '#3a3a3a');
      const clumps: [number, number, number, number][] = [[0, 3.7, 0, 0.95], [0.5, 3.2, 0.2, 0.6], [-0.5, 3.4, -0.2, 0.65], [0, 4.4, 0, 0.55]];
      clumps.forEach(([x, y, z, r], i) => br.blob(x, y, z, r, r * 1.15, r, i % 2 ? lighten(c, 0.12) : c, 'paint', rnd() * 3));
      return;
    }
    case 'pine': {
      br.lathe(0, 0, 0, [[0.0, 0], [0.2, 0], [0.12, 1.2], [0.0, 1.2]], BARK, 'wood', 8);
      const tiers: [number, number, number][] = [[0.9, 1.7, 1.4], [1.75, 1.4, 1.25], [2.5, 1.15, 1.1], [3.2, 0.9, 1.0], [3.85, 0.65, 0.95]];
      tiers.forEach(([y, r, h], i) => br.cyl(0, y + h / 2, 0, 0.02, r, h, i % 2 ? lighten(c, 0.06) : c, 'paint', 10));
      return;
    }
    case 'palm': {
      let prev: [number, number, number] = [0, 0, 0];
      for (let i = 1; i <= 5; i++) {
        const t = i / 5, pt: [number, number, number] = [Math.sin(t * 1.1) * 0.55, t * 4.3, 0];
        br.rodBetween(prev, pt, 0.16 - t * 0.06, i % 2 ? '#8a6c4a' : '#7a5c3c', 'wood', 7);
        prev = pt;
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        br.blob(prev[0] + dx * 0.9, prev[1] + 0.12 - (i % 2) * 0.18, dz * 0.9, 1.0, 0.03, 0.2, i % 2 ? lighten(c, 0.1) : c, 'paint', -a, 0.0, -0.35);
      }
      br.ball(prev[0], prev[1] - 0.15, 0.1, 0.12, '#6b4a2a', 'wood');
      br.ball(prev[0] + 0.1, prev[1] - 0.12, -0.12, 0.11, '#6b4a2a', 'wood');
      return;
    }
    case 'bush':
      br.blob(0, 0.45, 0, 0.7, 0.5, 0.65, c, 'paint', rnd() * 3);
      br.blob(0.45, 0.35, 0.2, 0.45, 0.35, 0.42, lighten(c, 0.1), 'paint');
      br.blob(-0.4, 0.38, -0.2, 0.48, 0.38, 0.45, darken(c, 0.1), 'paint');
      return;
    case 'hedge':
      br.blk(-0.5, 0, -0.4, 0.5, 1.2, 0.4, c, 'paint', 0.1);
      br.blob(-0.2, 1.2, 0, 0.35, 0.14, 0.4, lighten(c, 0.08));
      br.blob(0.25, 1.2, 0, 0.3, 0.12, 0.4, darken(c, 0.08));
      return;
    case 'planter':
      br.blk(-0.4, 0, -0.25, 0.4, 0.62, 0.25, c, 'paint', 0.02);
      br.blk(-0.36, 0.55, -0.21, 0.36, 0.64, 0.21, K.soil);
      br.blob(0, 0.95, 0, 0.35, 0.4, 0.2, K.leaf, 'paint');
      br.blob(-0.2, 0.85, 0.02, 0.22, 0.3, 0.18, K.leafLight, 'paint');
      br.blob(0.22, 0.88, 0, 0.2, 0.34, 0.16, K.leafLight, 'paint');
      return;
    case 'flowers': {
      br.blob(0, 0.08, 0, 0.45, 0.14, 0.4, K.soil, 'paint');
      const cols = [c, lighten(c, 0.4), '#ffc93c', '#ffffff'];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = 0.08 + (i % 3) * 0.1, h = 0.3 + (i % 4) * 0.08;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        br.rod(px, h / 2 + 0.06, pz, 0.008, h, K.leaf, 'paint', 4);
        br.ball(px, h + 0.1, pz, 0.065, cols[i % cols.length], 'paint');
      }
      return;
    }
    case 'fence':
      for (const sx of [-0.46, 0.46]) br.blk(sx - 0.045, 0, -0.045, sx + 0.045, 1.35, 0.045, K.black, 'metal');
      for (let i = 0; i < 9; i++) br.blk(-0.5, 0.1 + i * 0.145, -0.02 + (i % 2) * 0.015, 0.5, 0.1 + i * 0.145 + 0.115, 0.02 + (i % 2) * 0.015, c, 'wood');
      return;
    case 'streetLamp':
      br.cyl(0, 0.06, 0, 0.14, 0.18, 0.12, K.charcoal, 'metal', 12);
      br.cyl(0, 2.1, 0, 0.045, 0.06, 4.1, c, 'metal', 8);
      br.rodBetween([0, 4.1, 0], [0.55, 4.25, 0], 0.04, c, 'metal', 6);
      br.blk(0.35, 4.16, -0.14, 0.9, 4.26, 0.14, c, 'metal', 0.02);
      br.blk(0.4, 4.145, -0.11, 0.85, 4.16, 0.11, K.warmLight, 'glow');
      return;
    case 'bench':
      for (const sx of [-0.55, 0.55]) {
        br.blk(sx - 0.03, 0, -0.18, sx + 0.03, 0.42, 0.18, K.black, 'metal');
        br.blk(sx - 0.03, 0.42, -0.2, sx + 0.03, 0.46, 0.2, K.black, 'metal');
        br.blk(sx - 0.03, 0.46, 0.14, sx + 0.03, 0.9, 0.18, K.black, 'metal');
      }
      for (let i = 0; i < 4; i++) br.blk(-0.65, 0.46, -0.2 + i * 0.1, 0.65, 0.5, -0.12 + i * 0.1, c, 'wood');
      for (let i = 0; i < 3; i++) br.blk(-0.65, 0.58 + i * 0.12, 0.16, 0.65, 0.66 + i * 0.12, 0.19, c, 'wood');
      return;
  }
}

export type { PlacedPiece };
