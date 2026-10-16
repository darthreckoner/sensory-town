// Furniture + decor generators (living, bedroom, kitchen, bath, teen decor).
// Anchor-local frame: origin at the anchor cell centre, floor top at y = FL,
// the piece's footprint runs from the anchor toward local +x / +z, the front
// faces -z and the back is +z. Wall decor hangs on the INSIDE face of the north
// edge (z = -0.5 + T/2) and sticks out toward +z. Dimensions are in metres.
import type { PieceType, PlacedPiece } from '../core/model';
import { Brush, lighten, darken, mix } from './bake';
import { dims, K } from './kit';
import { seeded } from '../world/townLayout';
import type { GenFn } from './pieces';

const MUSTARD = '#d9a441';

// ── Living ──────────────────────────────────────────────────────────────────
const sofa: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color, cu = lighten(c, 0.09);
  for (const x of [-0.34, 1.34]) for (const z of [-0.34, 0.34]) br.blk(x - 0.03, y, z - 0.03, x + 0.03, y + 0.1, z + 0.03, K.black, 'metal');
  br.blk(-0.45, y + 0.1, -0.45, 1.45, y + 0.38, 0.45, c, 'fabric', 0.03);
  br.blk(-0.45, y + 0.38, 0.25, 1.45, y + 0.86, 0.45, c, 'fabric', 0.04);
  br.blk(-0.45, y + 0.38, -0.45, -0.31, y + 0.64, 0.25, c, 'fabric', 0.035);
  br.blk(1.31, y + 0.38, -0.45, 1.45, y + 0.64, 0.25, c, 'fabric', 0.035);
  for (const [xa, xb] of [[-0.31, 0.5], [0.5, 1.31]]) {
    br.blk(xa + 0.01, y + 0.38, -0.44, xb - 0.01, y + 0.5, 0.25, cu, 'fabric', 0.03);
    br.rbox((xa + xb) / 2, y + 0.68, 0.19, xb - xa - 0.05, 0.3, 0.12, cu, 0.04, 'fabric', 0, -0.14);
  }
  br.rbox(-0.1, y + 0.62, 0.02, 0.3, 0.3, 0.09, MUSTARD, 0.035, 'fabric', 0.45, -0.25);
};

const sofaL: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color, cu = lighten(c, 0.09);
  for (const [x, z] of [[-0.36, -0.36], [0.4, -0.36], [-0.36, 1.36], [2.36, 1.36], [2.36, 0.6], [0.4, 0.6]]) br.blk(x - 0.03, y, z - 0.03, x + 0.03, y + 0.1, z + 0.03, K.black, 'metal');
  br.blk(-0.45, y + 0.1, 0.55, 2.45, y + 0.38, 1.45, c, 'fabric', 0.03);        // back row seat
  br.blk(-0.45, y + 0.1, -0.45, 0.5, y + 0.38, 0.55, c, 'fabric', 0.03);        // chaise
  br.blk(-0.45, y + 0.38, 1.25, 2.45, y + 0.86, 1.45, c, 'fabric', 0.04);        // backrest
  br.blk(-0.45, y + 0.38, -0.45, -0.31, y + 0.64, 1.25, c, 'fabric', 0.035);     // left arm
  br.blk(2.31, y + 0.38, 0.55, 2.45, y + 0.64, 1.25, c, 'fabric', 0.035);        // right arm
  br.blk(-0.31, y + 0.38, -0.44, 0.5, y + 0.5, 0.55, cu, 'fabric', 0.03);        // chaise cushion
  for (let i = 0; i < 3; i++) {
    const xa = -0.31 + i * 0.88;
    br.blk(xa + 0.01, y + 0.38, 0.56, xa + 0.87, y + 0.5, 1.25, cu, 'fabric', 0.03);
    br.rbox(xa + 0.44, y + 0.68, 1.19, 0.8, 0.3, 0.12, cu, 0.04, 'fabric', 0, -0.14);
  }
  br.rbox(2.1, y + 0.62, 1.0, 0.3, 0.3, 0.09, MUSTARD, 0.035, 'fabric', -0.4, -0.25);
  br.rbox(-0.2, y + 0.58, -0.1, 0.3, 0.3, 0.09, K.cream, 0.035, 'fabric', 0.3, -0.25);
};

const armchair: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) br.rod(x, y + 0.11, z, 0.022, 0.22, K.woodDark, 'wood', 6);
  br.blk(-0.38, y + 0.22, -0.38, 0.38, y + 0.4, 0.38, c, 'fabric', 0.03);
  br.blk(-0.38, y + 0.4, 0.2, 0.38, y + 0.88, 0.4, c, 'fabric', 0.05);
  br.blk(-0.4, y + 0.4, -0.38, -0.3, y + 0.62, 0.22, c, 'fabric', 0.03);
  br.blk(0.3, y + 0.4, -0.38, 0.4, y + 0.62, 0.22, c, 'fabric', 0.03);
  br.blk(-0.3, y + 0.4, -0.36, 0.3, y + 0.5, 0.2, lighten(c, 0.1), 'fabric', 0.03);
};

const coffeeTable: GenFn = (br, p) => {
  const { FL: y } = dims();
  for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) br.blk(x - 0.02, y, z - 0.02, x + 0.02, y + 0.4, z + 0.02, K.black, 'metal');
  br.blk(-0.44, y + 0.38, -0.44, 0.44, y + 0.42, 0.44, p.color, 'wood', 0.01);
  br.blk(-0.38, y + 0.12, -0.38, 0.38, y + 0.15, 0.38, darken(p.color, 0.2), 'wood');
  if (br.fine) {
    br.blk(-0.25, y + 0.42, -0.2, 0.0, y + 0.45, 0.1, K.cream);
    br.blk(-0.22, y + 0.45, -0.17, 0.0, y + 0.48, 0.07, K.terracotta);
    br.cyl(0.22, y + 0.46, 0.15, 0.04, 0.035, 0.08, K.white, 'gloss', 10);
  }
};

const table: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.cyl(0, y + 0.6, 0, 0.3, 0.3, 0.03, p.color, 'metal', 20);
  br.rod(0, y + 0.3, 0, 0.025, 0.58, p.color, 'metal', 8);
  br.cyl(0, y + 0.02, 0, 0.2, 0.2, 0.04, p.color, 'metal', 16);
};

const tvStand: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  for (const x of [-0.38, 1.38]) for (const z of [-0.12, 0.28]) br.blk(x - 0.025, y, z - 0.025, x + 0.025, y + 0.1, z + 0.025, K.black, 'metal');
  br.blk(-0.45, y + 0.1, -0.2, 1.45, y + 0.5, 0.38, c, 'wood');
  br.blk(-0.45, y + 0.5, -0.22, 1.45, y + 0.53, 0.4, darken(c, 0.12), 'wood');
  for (const [xa, xb] of [[-0.43, 0.48], [0.52, 1.43]]) br.blk(xa, y + 0.14, -0.21, xb, y + 0.48, -0.2, darken(c, 0.2), 'wood');
  for (const x of [0.2, 0.8]) br.blk(x - 0.1, y + 0.3, -0.225, x + 0.1, y + 0.32, -0.21, K.black, 'metal');
  br.blk(0.35, y + 0.53, 0.0, 0.65, y + 0.57, 0.3, K.black, 'metal');                  // TV foot
  br.blk(-0.2, y + 0.57, 0.2, 1.2, y + 1.37, 0.25, K.black, 'gloss');                    // TV
  br.blk(-0.17, y + 0.6, 0.19, 1.17, y + 1.34, 0.2, '#161a28', 'gloss');                // screen
  if (br.fine) {
    br.blk(-0.1, y + 0.62, 0.188, 0.6, y + 0.8, 0.19, '#3a5bff', 'glow');               // a glowing "show"
    br.blk(0.62, y + 0.62, 0.188, 1.1, y + 0.8, 0.19, '#ff2e88', 'glow');
  }
  br.blk(0.1, y + 0.53, 0.0, 0.7, y + 0.6, 0.12, K.charcoal);                             // soundbar
};

const shelf: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.45, y, 0.46, 0.45, y + 1.85, 0.5, darken(c, 0.25), 'wood');                  // back panel (against the wall)
  br.blk(-0.45, y, 0.17, -0.41, y + 1.85, 0.5, c, 'wood');
  br.blk(0.41, y, 0.17, 0.45, y + 1.85, 0.5, c, 'wood');
  for (let i = 0; i < 6; i++) br.blk(-0.45, y + 0.02 + i * 0.36, 0.17, 0.45, y + 0.05 + i * 0.36, 0.5, c, 'wood');
  if (br.fine) {
    const rnd = seeded(p.x * 131 + p.z * 17 + 7);
    const cols = [K.white, K.charcoal, K.sage, K.navy, K.terracotta, K.woodLight, K.warmGrey, '#ff2e88', MUSTARD];
    for (let r = 0; r < 5; r++) {
      let x = -0.38;
      const yb = y + 0.05 + r * 0.36;
      while (x < 0.3) {
        if (rnd() < 0.2) { x += 0.08; continue; }
        const w = 0.035 + rnd() * 0.04, h = 0.2 + rnd() * 0.1;
        br.blk(x, yb, 0.22, x + w, yb + h, 0.44, cols[Math.floor(rnd() * cols.length)]);
        x += w + 0.004;
      }
    }
  }
};

const lamp: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.cyl(0, y + 0.015, 0, 0.14, 0.14, 0.03, K.black, 'metal', 16);
  br.rod(0, y + 0.8, 0, 0.012, 1.55, K.black, 'metal', 8);
  br.lathe(0, y + 1.4, 0, [[0.12, 0], [0.19, 0.28], [0.17, 0.28], [0.1, 0.02]], p.color, 'glow', 16);
  br.cyl(0, y + 1.7, 0, 0.012, 0.012, 0.02, K.black, 'metal', 6);
};

const rug: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.cyl(0.5, y + 0.01, 0.5, 0.95, 0.95, 0.02, p.color, 'fabric', 28);
  br.cyl(0.5, y + 0.0125, 0.5, 0.72, 0.72, 0.02, lighten(p.color, 0.22), 'fabric', 28);
  br.cyl(0.5, y + 0.015, 0.5, 0.5, 0.5, 0.02, p.color, 'fabric', 24);
};

const rugRect: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.blk(-0.45, y, -0.45, 2.45, y + 0.02, 1.45, p.color, 'carpet');
  br.blk(-0.35, y + 0.02, -0.35, 2.35, y + 0.022, 1.35, lighten(p.color, 0.22), 'carpet');
  br.blk(-0.28, y + 0.022, -0.28, 2.28, y + 0.024, 1.28, p.color, 'carpet');
  br.blk(0.2, y + 0.024, -0.28, 0.32, y + 0.026, 1.28, K.white, 'carpet');
};

const plant: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.lathe(0, y, 0, [[0.0, 0], [0.16, 0], [0.2, 0.34], [0.22, 0.4], [0.19, 0.4], [0.0, 0.36]], K.white, 'gloss', 14);
  br.cyl(0, y + 0.39, 0, 0.19, 0.19, 0.02, K.soil, 'paint', 12);
  const c = p.color;
  const leaves: [number, number, number, number][] = [[0, 0.75, 0, 0], [0.16, 0.66, 0.1, 0.9], [-0.16, 0.7, 0.09, 2.2], [0.07, 0.62, -0.16, 3.4], [-0.1, 0.64, -0.14, 4.7], [0.2, 0.58, -0.05, 5.6], [-0.2, 0.6, -0.03, 1.5], [0.0, 0.58, 0.18, 2.9]];
  for (const [lx, ly, lz, a] of leaves) {
    br.rod(lx * 0.4, y + 0.55 + (ly - 0.6) * 0.3, lz * 0.4, 0.008, 0.35 + ly * 0.2, mix(c, K.black, 0.3), 'paint', 4);
    br.blob(lx, y + ly + 0.15, lz, 0.09, 0.34, 0.05, ly > 0.66 ? lighten(c, 0.1) : c, 'paint', a, 0.1, 0.18);
  }
};

// ── Bedroom ─────────────────────────────────────────────────────────────────
const bed: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  for (const [x, z] of [[-0.28, -0.42], [1.28, -0.42], [-0.28, 1.38], [1.28, 1.38]]) br.blk(x - 0.03, y, z - 0.03, x + 0.03, y + 0.1, z + 0.03, K.black, 'metal');
  br.blk(-0.34, y + 0.1, -0.48, 1.34, y + 0.3, 1.5, K.woodLight, 'wood');                        // frame
  br.blk(-0.3, y + 0.3, -0.44, 1.3, y + 0.46, 1.44, K.white, 'fabric', 0.03);                    // mattress
  br.blk(-0.33, y + 0.44, -0.47, 1.33, y + 0.54, 0.95, c, 'fabric', 0.035);                      // duvet
  br.blk(-0.33, y + 0.52, 0.85, 1.33, y + 0.555, 1.0, lighten(c, 0.3), 'fabric');                // fold
  br.rbox(0.1, y + 0.58, 1.17, 0.58, 0.13, 0.34, K.white, 0.05, 'fabric', 0.04);                 // pillows
  br.rbox(0.9, y + 0.58, 1.17, 0.58, 0.13, 0.34, K.cream, 0.05, 'fabric', -0.04);
  br.blk(-0.36, y + 0.1, 1.46, 1.36, y + 1.12, 1.54, darken(c, 0.28), 'fabric', 0.03);           // headboard
  br.blk(-0.3, y + 0.5, 0.0, 1.3, y + 0.62, 0.32, lighten(c, 0.12), 'fabric', 0.04);             // throw blanket
};

const bunkBed: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  for (const [x, z] of [[-0.42, -0.45], [0.42, -0.45], [-0.42, 1.45], [0.42, 1.45]]) br.blk(x - 0.035, y, z - 0.035, x + 0.035, y + 1.82, z + 0.035, K.woodDark, 'wood');
  for (const yy of [0.32, 1.12]) {
    br.blk(-0.45, y + yy - 0.06, -0.48, 0.45, y + yy, 1.48, K.woodDark, 'wood');
    br.blk(-0.42, y + yy, -0.44, 0.42, y + yy + 0.14, 1.44, K.white, 'fabric', 0.03);
    br.blk(-0.43, y + yy + 0.12, -0.46, 0.43, y + yy + 0.2, 0.9, c, 'fabric', 0.03);
    br.rbox(0, y + yy + 0.2, 1.2, 0.5, 0.1, 0.3, K.cream, 0.04, 'fabric');
    br.blk(-0.45, y + yy + 0.14, 1.4, 0.45, y + yy + 0.46, 1.42, K.woodDark, 'wood');            // head rail
  }
  br.blk(0.43, y + 1.12 + 0.14, -0.2, 0.45, y + 1.12 + 0.46, 1.2, K.woodDark, 'wood');            // guard rail (upper)
  for (let i = 0; i < 5; i++) br.blk(-0.43, y + 0.25 + i * 0.28, -0.52, -0.05, y + 0.29 + i * 0.28, -0.47, K.woodDark, 'wood');  // ladder rungs
  br.blk(-0.44, y + 0.2, -0.53, -0.4, y + 1.3, -0.47, K.woodDark, 'wood');
  br.blk(-0.08, y + 0.2, -0.53, -0.04, y + 1.3, -0.47, K.woodDark, 'wood');
};

const desk: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.45, y + 0.72, -0.3, 1.45, y + 0.755, 0.45, c, 'wood', 0.008);
  br.blk(-0.43, y, -0.28, -0.4, y + 0.72, 0.43, c, 'wood');
  br.blk(0.95, y, -0.28, 1.43, y + 0.72, 0.43, c, 'wood');                                         // drawer unit
  for (let i = 0; i < 3; i++) {
    br.blk(0.97, y + 0.05 + i * 0.22, -0.3, 1.41, y + 0.24 + i * 0.22, -0.285, darken(c, 0.08), 'wood');
    br.blk(1.1, y + 0.13 + i * 0.22, -0.32, 1.28, y + 0.15 + i * 0.22, -0.3, K.black, 'metal');
  }
  br.blk(-0.43, y + 0.45, 0.4, 0.95, y + 0.72, 0.43, darken(c, 0.1), 'wood');                       // modesty panel
  if (br.fine) {
    br.blk(0.1, y + 0.755, -0.1, 0.55, y + 0.768, 0.2, K.chrome, 'metal');                         // laptop
    br.blk(0.1, y + 0.768, 0.2, 0.55, y + 1.0, 0.212, K.black, 'gloss');
    br.blk(0.12, y + 0.78, 0.198, 0.53, y + 0.99, 0.2, '#2a4a8a', 'glow');
    br.cyl(-0.2, y + 0.8, 0.0, 0.04, 0.035, 0.09, K.terracotta, 'gloss', 10);
  }
};

const gamingChair: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    br.rodBetween([0, y + 0.1, 0], [Math.cos(a) * 0.28, y + 0.05, Math.sin(a) * 0.28], 0.018, K.black, 'metal', 6);
    br.ball(Math.cos(a) * 0.3, y + 0.035, Math.sin(a) * 0.3, 0.035, K.black, 'gloss');
  }
  br.rod(0, y + 0.3, 0, 0.03, 0.42, K.chrome, 'metal', 8);
  br.blk(-0.27, y + 0.48, -0.26, 0.27, y + 0.56, 0.26, K.black, 'fabric', 0.04);                  // seat
  br.blk(-0.29, y + 0.5, -0.28, -0.22, y + 0.62, 0.26, c, 'fabric', 0.03);                         // bolsters
  br.blk(0.22, y + 0.5, -0.28, 0.29, y + 0.62, 0.26, c, 'fabric', 0.03);
  // tall racing back, leaning a touch backward (+z)
  br.rbox(0, y + 0.98, 0.3, 0.5, 0.78, 0.1, K.black, 0.04, 'fabric', 0, -0.1);
  br.rbox(-0.22, y + 0.95, 0.27, 0.09, 0.62, 0.12, c, 0.03, 'fabric', 0, -0.1);
  br.rbox(0.22, y + 0.95, 0.27, 0.09, 0.62, 0.12, c, 0.03, 'fabric', 0, -0.1);
  br.rbox(0, y + 1.42, 0.36, 0.32, 0.18, 0.1, K.black, 0.04, 'fabric', 0, -0.1);                   // headrest
  br.blk(-0.33, y + 0.62, -0.18, -0.29, y + 0.66, 0.15, K.black, 'gloss');                          // armrests
  br.blk(0.29, y + 0.62, -0.18, 0.33, y + 0.66, 0.15, K.black, 'gloss');
  br.blk(-0.33, y + 0.56, -0.02, -0.3, y + 0.62, 0.02, K.black, 'metal');
  br.blk(0.3, y + 0.56, -0.02, 0.33, y + 0.62, 0.02, K.black, 'metal');
};

const vanity: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.46, y + 0.3, -0.05, 0.46, y + 0.34, 0.46, c, 'paint');
  br.blk(-0.46, y + 0.74, -0.08, 0.46, y + 0.78, 0.46, c, 'paint', 0.01);
  for (const x of [-0.44, 0.4]) br.blk(x, y, -0.03, x + 0.04, y + 0.74, 0.44, c, 'paint');
  br.blk(-0.4, y + 0.5, -0.04, 0.0, y + 0.72, 0.0, darken(c, 0.07), 'paint');                       // drawer
  br.blk(-0.24, y + 0.6, -0.06, -0.16, y + 0.62, -0.04, K.black, 'metal');
  // mirror with a glowing LED frame
  br.blk(-0.32, y + 0.95, 0.42, 0.32, y + 1.7, 0.46, '#fff2d6', 'glow');
  br.blk(-0.29, y + 0.98, 0.4, 0.29, y + 1.67, 0.42, K.chrome, 'mirror');
  br.blk(-0.04, y + 0.78, 0.35, 0.04, y + 0.95, 0.45, K.black, 'metal');
  if (br.fine) {
    br.cyl(-0.25, y + 0.87, 0.2, 0.035, 0.035, 0.18, '#ffb3d1', 'glass', 10);
    br.cyl(-0.12, y + 0.84, 0.28, 0.03, 0.03, 0.12, MUSTARD, 'gloss', 10);
    br.cyl(0.2, y + 0.82, 0.15, 0.06, 0.06, 0.08, K.white, 'gloss', 12);
  }
};

const wardrobe: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.45, y + 0.04, 0.0, 1.45, y + 2.1, 0.5, c, 'paint');
  br.blk(-0.43, y, 0.02, 1.43, y + 0.04, 0.46, K.black);
  br.blk(-0.45, y + 2.1, -0.01, 1.45, y + 2.14, 0.5, darken(c, 0.12));
  br.blk(0.48, y + 0.06, -0.012, 0.52, y + 2.08, 0.0, darken(c, 0.35));                             // door seam
  for (const x of [0.42, 0.58]) br.blk(x - 0.012, y + 0.95, -0.04, x + 0.012, y + 1.25, 0.0, K.black, 'metal');
  br.blk(-0.43, y + 0.06, -0.006, 0.47, y + 2.08, 0.0, lighten(c, 0.06));
};

const beanBag: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.ell(0, y + 0.3, 0, 0.5, 0.3, 0.5, p.color, 'fabric');
  br.ell(0, y + 0.47, 0.1, 0.32, 0.2, 0.3, lighten(p.color, 0.1), 'fabric', 0.4, -0.35);
  br.ell(0, y + 0.2, 0.02, 0.52, 0.12, 0.52, darken(p.color, 0.1), 'fabric');
};

const nightstand: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  for (const [x, z] of [[-0.2, 0.05], [0.2, 0.05], [-0.2, 0.4], [0.2, 0.4]]) br.blk(x - 0.015, y, z - 0.015, x + 0.015, y + 0.12, z + 0.015, K.black, 'metal');
  br.blk(-0.25, y + 0.12, 0.0, 0.25, y + 0.5, 0.45, c, 'wood', 0.008);
  br.blk(-0.23, y + 0.14, -0.012, 0.23, y + 0.31, 0.0, darken(c, 0.1), 'wood');
  br.blk(-0.23, y + 0.33, -0.012, 0.23, y + 0.48, 0.0, darken(c, 0.1), 'wood');
  br.blk(-0.05, y + 0.22, -0.03, 0.05, y + 0.235, -0.012, K.black, 'metal');
  br.blk(-0.05, y + 0.4, -0.03, 0.05, y + 0.415, -0.012, K.black, 'metal');
  if (br.fine) {
    br.cyl(0, y + 0.52, 0.22, 0.05, 0.05, 0.03, K.black, 'metal', 10);
    br.lathe(0, y + 0.55, 0.22, [[0.05, 0], [0.1, 0.16], [0.085, 0.16], [0.04, 0.01]], K.warmLight, 'glow', 12);
  }
};

// ── Kitchen ─────────────────────────────────────────────────────────────────
function cabinet(br: Brush, color: string, x0: number, x1: number, y: number, doors: number, z0 = -0.05, z1 = 0.5): void {
  br.blk(x0, y + 0.08, z0 + 0.02, x1, y + 0.86, z1, color, 'paint');
  br.blk(x0 + 0.02, y, z0 + 0.08, x1 - 0.02, y + 0.08, z1 - 0.02, K.black);
  const w = (x1 - x0) / doors;
  for (let i = 0; i < doors; i++) {
    br.blk(x0 + i * w + 0.012, y + 0.1, z0, x0 + (i + 1) * w - 0.012, y + 0.84, z0 + 0.02, lighten(color, 0.04), 'paint');
    br.blk(x0 + i * w + w / 2 - 0.1, y + 0.78, z0 - 0.015, x0 + i * w + w / 2 + 0.1, y + 0.795, z0, K.black, 'metal');   // bar handle
  }
}

const counter: GenFn = (br, p) => {
  const { FL: y } = dims();
  cabinet(br, p.color, -0.5, 0.5, y, 1);
  br.blk(-0.5, y + 0.86, -0.08, 0.5, y + 0.92, 0.5, '#f2f0ec', 'marble');
};

const kitchenSink: GenFn = (br, p) => {
  const { FL: y } = dims();
  cabinet(br, p.color, -0.5, 0.5, y, 1);
  br.blk(-0.5, y + 0.86, -0.08, 0.5, y + 0.92, 0.5, '#f2f0ec', 'marble');
  br.blk(-0.28, y + 0.915, 0.04, 0.28, y + 0.93, 0.4, K.chrome, 'metal');                            // basin
  br.blk(-0.25, y + 0.918, 0.07, 0.25, y + 0.94, 0.37, '#7d8088', 'metal');
  br.rod(0, y + 1.1, 0.46, 0.012, 0.35, K.chrome, 'metal', 8);                                       // faucet
  br.rodBetween([0, y + 1.27, 0.46], [0, y + 1.25, 0.3], 0.012, K.chrome, 'metal', 6);
};

const fridge: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.4, y + 0.03, -0.05, 0.4, y + 1.85, 0.5, c, 'metal');
  br.blk(-0.4, y, -0.02, 0.4, y + 0.03, 0.46, K.black);
  br.blk(-0.4, y + 1.2, -0.056, 0.4, y + 1.215, -0.05, K.black);                                     // door split
  br.blk(-0.405, y + 0.5, -0.065, -0.385, y + 1.1, -0.04, K.chrome, 'metal');
  br.blk(-0.405, y + 1.25, -0.065, -0.385, y + 1.6, -0.04, K.chrome, 'metal');
  br.blk(0.38, y + 1.4, -0.06, 0.39, y + 1.45, -0.05, '#9be8ff', 'glow');                            // ice-dispenser light
};

const stove: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.blk(-0.45, y + 0.04, -0.05, 0.45, y + 0.9, 0.5, p.color, 'paint');
  br.blk(-0.43, y, -0.02, 0.43, y + 0.04, 0.46, K.black);
  br.blk(-0.45, y + 0.9, -0.05, 0.45, y + 0.93, 0.5, K.black, 'gloss');                               // glass cooktop
  for (const [x, z] of [[-0.2, 0.08], [0.2, 0.08], [-0.2, 0.36], [0.2, 0.36]]) br.torus(x, y + 0.935, z, 0.08, 0.008, '#ff6a3d', 'glow', Math.PI / 2, 16);
  br.blk(-0.38, y + 0.2, -0.066, 0.38, y + 0.72, -0.05, K.black, 'gloss');                           // oven door
  br.blk(-0.3, y + 0.28, -0.07, 0.3, y + 0.62, -0.066, K.glass, 'glass');
  br.blk(-0.36, y + 0.76, -0.085, 0.36, y + 0.79, -0.06, K.chrome, 'metal');
  for (let i = 0; i < 4; i++) br.cyl(-0.27 + i * 0.18, y + 0.84, -0.06, 0.022, 0.022, 0.03, K.chrome, 'metal', 8, Math.PI / 2);
  // range hood
  br.blk(-0.42, y + 1.62, 0.08, 0.42, y + 1.7, 0.5, K.chrome, 'metal');
  br.blk(-0.18, y + 1.7, 0.3, 0.18, y + 2.45, 0.5, K.chrome, 'metal');
};

const island: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.blk(-0.45, y + 0.08, -0.4, 1.45, y + 0.86, 0.32, p.color, 'paint');
  br.blk(-0.43, y, -0.36, 1.43, y + 0.08, 0.28, K.black);
  for (let i = 0; i < 4; i++) {
    br.blk(-0.43 + i * 0.47, y + 0.1, -0.415, -0.43 + (i + 1) * 0.47 - 0.02, y + 0.84, -0.4, lighten(p.color, 0.05), 'paint');
    br.blk(-0.43 + i * 0.47 + 0.14, y + 0.78, -0.43, -0.43 + i * 0.47 + 0.3, y + 0.795, -0.415, K.black, 'metal');
  }
  br.blk(-0.5, y + 0.86, -0.46, 1.5, y + 0.92, 0.5, '#f2f0ec', 'marble');
};

const stool: GenFn = (br, p) => {
  const { FL: y } = dims();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.78;
    br.rodBetween([Math.cos(a) * 0.1, y + 0.62, Math.sin(a) * 0.1], [Math.cos(a) * 0.19, y, Math.sin(a) * 0.19], 0.014, K.black, 'metal', 6);
  }
  br.torus(0, y + 0.25, 0, 0.16, 0.008, K.black, 'metal', Math.PI / 2, 18);
  br.cyl(0, y + 0.66, 0, 0.18, 0.17, 0.06, p.color, 'fabric', 18);
};

const diningTable: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.45, y + 0.72, -0.4, 1.45, y + 0.76, 0.4, c, 'wood', 0.008);
  for (const x of [-0.38, 1.38]) for (const z of [-0.32, 0.32]) br.blk(x - 0.025, y, z - 0.025, x + 0.025, y + 0.72, z + 0.025, K.black, 'metal');
  if (br.fine) {
    br.lathe(0.5, y + 0.76, 0, [[0.0, 0], [0.07, 0.02], [0.05, 0.2], [0.03, 0.3], [0.05, 0.34], [0.0, 0.34]], K.white, 'gloss', 12);
    br.ell(0.5, y + 1.18, 0, 0.05, 0.12, 0.05, K.leaf, 'paint');
  }
};

const chair: GenFn = (br, p) => {
  const { FL: y } = dims();
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) br.rodBetween([x * 0.9, y + 0.44, z * 0.9], [x, y, z], 0.014, K.black, 'metal', 6);
  br.blk(-0.23, y + 0.43, -0.23, 0.23, y + 0.47, 0.23, p.color, 'fabric', 0.015);
  br.blk(-0.22, y + 0.47, 0.19, 0.22, y + 0.92, 0.23, p.color, 'fabric', 0.02);
};

// ── Bath ────────────────────────────────────────────────────────────────────
const tub: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.blk(-0.46, y + 0.02, -0.4, 1.46, y + 0.58, 0.4, p.color, 'gloss', 0.12);
  br.blk(-0.34, y + 0.5, -0.29, 1.34, y + 0.6, 0.29, darken(p.color, 0.06), 'gloss', 0.1);
  br.blk(-0.3, y + 0.52, -0.25, 1.3, y + 0.605, 0.25, '#cfd9e0', 'gloss', 0.08);
  br.blk(-0.4, y, -0.34, 1.4, y + 0.03, 0.34, K.black);
  br.rod(1.3, y + 0.82, 0.3, 0.012, 0.5, K.chrome, 'metal', 8);                                       // wall-less tap tower
  br.rodBetween([1.3, y + 1.06, 0.3], [1.3, y + 0.96, 0.1], 0.012, K.chrome, 'metal', 6);
  br.ball(1.3, y + 1.08, 0.3, 0.02, K.chrome, 'metal');
};

const toilet: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.2, y + 0.3, 0.22, 0.2, y + 0.82, 0.48, c, 'gloss', 0.04);
  br.blk(-0.19, y + 0.82, 0.21, 0.19, y + 0.86, 0.49, c, 'gloss', 0.015);
  br.blk(-0.04, y + 0.86, 0.3, 0.04, y + 0.89, 0.38, K.chrome, 'metal');
  br.blk(-0.17, y, 0.05, 0.17, y + 0.32, 0.4, c, 'gloss', 0.05);
  br.ell(0, y + 0.42, -0.03, 0.2, 0.14, 0.27, c, 'gloss');
  br.ell(0, y + 0.55, -0.03, 0.19, 0.04, 0.26, c, 'gloss');
  br.ell(0, y + 0.56, -0.03, 0.15, 0.02, 0.2, '#cfd9e0', 'gloss');
};

const sink: GenFn = (br, p) => {
  const { FL: y } = dims();
  cabinet(br, p.color, -0.45, 0.45, y, 1, 0.0, 0.46);
  br.blk(-0.46, y + 0.8, -0.02, 0.46, y + 0.84, 0.47, '#f2f0ec', 'marble');
  br.ell(0, y + 0.86, 0.22, 0.2, 0.04, 0.14, K.white, 'gloss');
  br.rod(0, y + 0.95, 0.42, 0.011, 0.2, K.chrome, 'metal', 8);
  br.rodBetween([0, y + 1.05, 0.42], [0, y + 1.03, 0.3], 0.011, K.chrome, 'metal', 6);
};

const shower: GenFn = (br, p) => {
  const { FL: y } = dims();
  br.blk(-0.46, y, -0.46, 0.46, y + 0.06, 0.46, K.white, 'gloss', 0.02);
  br.cyl(0, y + 0.062, 0.0, 0.05, 0.05, 0.005, K.black, 'metal', 10);
  const fr = p.color;
  br.blk(-0.46, y + 0.06, -0.46, 0.46, y + 0.1, -0.43, fr, 'metal');
  br.blk(-0.46, y + 2.06, -0.46, 0.46, y + 2.1, -0.43, fr, 'metal');
  br.blk(-0.46, y + 0.06, -0.46, -0.43, y + 2.1, -0.43, fr, 'metal');
  br.blk(0.43, y + 0.06, -0.46, 0.46, y + 2.1, -0.43, fr, 'metal');
  br.blk(-0.43, y + 0.1, -0.455, 0.43, y + 2.06, -0.445, K.glass, 'glass');                          // front glass
  br.blk(-0.46, y + 0.1, -0.43, -0.455, y + 2.06, 0.46, K.glass, 'glass');                           // side glass
  br.blk(0.1, y + 1.0, -0.5, 0.12, y + 1.3, -0.46, K.chrome, 'metal');                                // door handle
  br.rod(0.3, y + 1.5, 0.44, 0.012, 1.0, K.chrome, 'metal', 8);                                       // rain shower on the back wall side
  br.cyl(0.3, y + 2.0, 0.3, 0.12, 0.12, 0.015, K.chrome, 'metal', 16);
  br.rodBetween([0.3, y + 2.0, 0.44], [0.3, y + 2.0, 0.3], 0.012, K.chrome, 'metal', 6);
};

// ── Decor ───────────────────────────────────────────────────────────────────
const gamingSetup: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.blk(-0.45, y + 0.72, -0.35, 1.45, y + 0.75, 0.45, c, 'paint', 0.006);
  for (const x of [-0.4, 1.4]) for (const z of [-0.3, 0.38]) br.blk(x - 0.025, y, z - 0.025, x + 0.025, y + 0.72, z + 0.025, K.black, 'metal');
  br.blk(-0.4, y + 0.74, 0.43, 1.4, y + 0.76, 0.45, '#ff2e88', 'rgb');                                // RGB strip under the desk lip
  // two monitors
  for (const mx of [0.18, 0.82]) {
    br.blk(mx - 0.3, y + 0.98, 0.14, mx + 0.3, y + 1.4, 0.18, K.black, 'gloss');
    br.blk(mx - 0.28, y + 1.0, 0.13, mx + 0.28, y + 1.38, 0.14, '#1a1330', 'gloss');
    br.blk(mx - 0.27, y + 1.01, 0.125, mx + 0.27, y + 1.37, 0.13, '#3a1f8a', 'glow');
    br.blk(mx - 0.27, y + 1.01, 0.12, mx + 0.27, y + 1.12, 0.125, '#ff2e88', 'glow');
    br.blk(mx - 0.015, y + 0.75, 0.15, mx + 0.015, y + 0.98, 0.17, K.black, 'metal');
    br.blk(mx - 0.1, y + 0.75, 0.1, mx + 0.1, y + 0.765, 0.22, K.black, 'metal');
  }
  br.blk(0.05, y + 0.755, -0.2, 0.95, y + 0.77, 0.02, K.black, 'gloss');                                // keyboard
  br.blk(0.06, y + 0.77, -0.19, 0.94, y + 0.775, 0.01, '#00d4ff', 'rgb');
  br.blk(1.02, y + 0.755, -0.12, 1.1, y + 0.775, -0.02, K.black, 'gloss');                               // mouse
  br.blk(-0.38, y + 0.755, -0.2, 0.0, y + 0.757, 0.2, '#16151c');                                         // desk mat
  // PC tower with RGB fans under the desk
  br.blk(1.12, y + 0.02, -0.1, 1.38, y + 0.5, 0.36, K.black, 'gloss');
  br.blk(1.115, y + 0.06, -0.06, 1.12, y + 0.46, 0.32, '#1a2a3a', 'glass');
  for (const fy of [0.16, 0.36]) br.torus(1.112, y + fy, 0.13, 0.065, 0.012, '#7c4dff', 'rgb', 0, 20);
  // headset hook
  br.blk(-0.42, y + 0.755, 0.3, -0.3, y + 0.76, 0.42, K.black, 'metal');
  br.blk(-0.38, y + 0.76, 0.34, -0.34, y + 0.95, 0.38, K.black, 'metal');
};

const WALL_FACE = () => -0.5 + dims().T / 2;   // z of the inside face of the north wall

const ledStrip: GenFn = (br, p) => {
  const z = WALL_FACE();
  const fin = p.finish === 'rainbow' ? 'rgb' : 'glow';
  br.blk(-0.5, 2.28, z, 0.5, 2.33, z + 0.025, p.color, fin);
  br.blk(-0.5, 2.25, z, 0.5, 2.28, z + 0.012, K.white);
};

const poster: GenFn = (br, p) => {
  const z = WALL_FACE();
  const c = p.color;
  br.blk(-0.3, 1.0, z, 0.3, 1.8, z + 0.028, K.black);
  br.blk(-0.27, 1.03, z + 0.028, 0.27, 1.77, z + 0.03, K.cream);
  const art = p.finish ?? 'sunset';
  const a = z + 0.03, b = z + 0.034;
  if (art === 'sunset') {
    br.blk(-0.27, 1.03, a, 0.27, 1.4, b, '#2a1a55');
    br.blk(-0.27, 1.4, a, 0.27, 1.55, b, mix(c, '#2a1a55', 0.4));
    br.blk(-0.27, 1.55, a, 0.27, 1.77, b, c);
    br.cyl(0, 1.5, b + 0.002, 0.11, 0.11, 0.002, K.cream, 'paint', 18, Math.PI / 2);
    br.blk(-0.27, 1.03, b, 0.27, 1.12, b + 0.002, '#14122a');
  } else if (art === 'peaks') {
    br.blk(-0.27, 1.03, a, 0.27, 1.77, b, '#1d2840');
    br.cyl(0.1, 1.62, b + 0.001, 0.07, 0.07, 0.002, c, 'paint', 16, Math.PI / 2);
    br.box(-0.1, 1.28, b + 0.003, 0.34, 0.34, 0.003, '#3d5a80', 'paint', 0, 0, Math.PI / 4);
    br.box(0.12, 1.2, b + 0.006, 0.28, 0.28, 0.003, '#5d7aa0', 'paint', 0, 0, Math.PI / 4);
    br.blk(-0.27, 1.03, b + 0.004, 0.27, 1.14, b + 0.008, '#e8eef5');
  } else if (art === 'shapes') {
    br.blk(-0.27, 1.03, a, 0.27, 1.77, b, K.white);
    br.cyl(-0.08, 1.58, b + 0.001, 0.12, 0.12, 0.002, c, 'paint', 18, Math.PI / 2);
    br.blk(0.0, 1.1, b, 0.22, 1.4, b + 0.002, K.black);
    br.blk(-0.2, 1.1, b, -0.04, 1.3, b + 0.003, MUSTARD);
    br.box(0.12, 1.55, b + 0.002, 0.18, 0.18, 0.002, K.navy, 'paint', 0, 0, Math.PI / 4);
  } else {
    br.blk(-0.27, 1.03, a, 0.27, 1.77, b, '#161430');
    br.cyl(0.14, 1.64, b + 0.001, 0.06, 0.06, 0.002, K.cream, 'paint', 14, Math.PI / 2);
    const hs = [0.35, 0.55, 0.3, 0.6, 0.45];
    for (let i = 0; i < 5; i++) {
      const x0 = -0.26 + i * 0.105;
      br.blk(x0, 1.03, b, x0 + 0.095, 1.03 + hs[i], b + 0.003, '#2c2f5a');
      br.blk(x0 + 0.02, 1.15 + (i % 3) * 0.1, b + 0.003, x0 + 0.045, 1.2 + (i % 3) * 0.1, b + 0.004, c, 'glow');
    }
  }
};

const wallShelf: GenFn = (br, p) => {
  const z = WALL_FACE();
  const c = p.color;
  for (const y of [1.3, 1.85]) {
    br.blk(-0.46, y, z, 0.46, y + 0.04, z + 0.22, c, 'wood');
    br.blk(-0.3, y - 0.04, z, -0.26, y, z + 0.04, K.black, 'metal');
    br.blk(0.26, y - 0.04, z, 0.3, y, z + 0.04, K.black, 'metal');
  }
  if (br.fine) {
    // top shelf: plant + figurines
    br.lathe(-0.28, 1.89, z + 0.11, [[0, 0], [0.06, 0], [0.07, 0.1], [0, 0.1]], K.white, 'gloss', 10);
    br.ell(-0.28, 2.05, z + 0.11, 0.1, 0.1, 0.08, K.leaf, 'paint');
    br.ell(-0.05, 1.96, z + 0.11, 0.05, 0.08, 0.05, '#ff2e88', 'gloss');
    br.ball(-0.05, 2.08, z + 0.11, 0.035, '#ff2e88', 'gloss');
    br.blk(0.1, 1.89, z + 0.04, 0.3, 1.95, z + 0.2, K.navy);
    br.blk(0.1, 1.95, z + 0.05, 0.28, 2.0, z + 0.19, K.terracotta);
    br.ell(0.36, 1.95, z + 0.11, 0.05, 0.07, 0.05, '#00d4ff', 'gloss');
    // lower shelf: books + trophy
    for (let i = 0; i < 4; i++) br.blk(-0.4 + i * 0.05, 1.34, z + 0.04, -0.36 + i * 0.05, 1.34 + 0.18 + (i % 2) * 0.04, z + 0.19, [K.sage, K.white, K.charcoal, MUSTARD][i]);
    br.cyl(0.1, 1.4, z + 0.11, 0.04, 0.025, 0.1, MUSTARD, 'metal', 10);
    br.ell(0.1, 1.5, z + 0.11, 0.05, 0.04, 0.05, MUSTARD, 'metal');
    br.cyl(0.34, 1.37, z + 0.11, 0.05, 0.05, 0.06, K.white, 'gloss', 12);
  }
};

const mirror: GenFn = (br, p) => {
  const z = WALL_FACE();
  br.blk(-0.32, 0.3, z, 0.32, 2.1, z + 0.03, p.color, 'metal');
  br.blk(-0.29, 0.33, z + 0.03, 0.29, 2.07, z + 0.034, K.chrome, 'mirror');
};

const stringLights: GenFn = (br, p) => {
  const z = WALL_FACE() + 0.03;
  const n = 7;
  let prev: [number, number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -0.5 + t, y = 2.38 - Math.sin(t * Math.PI) * 0.16;
    const pt: [number, number, number] = [x, y, z];
    if (prev) br.rodBetween(prev, pt, 0.004, K.black, 'paint', 4);
    if (i > 0 && i < n) br.ball(x, y - 0.03, z, 0.026, p.color, 'glow');
    prev = pt;
  }
};

/** Neon tube outlines (unit coordinates, y up). */
function neonPath(shape: string): [number, number][][] {
  const pts: [number, number][] = [];
  switch (shape) {
    case 'bolt': return [[[0.15, 1], [-0.3, 0.05], [0.02, 0.05], [-0.18, -1], [0.38, -0.12], [0.06, -0.12], [0.3, 1], [0.15, 1]]];
    case 'star':
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 === 0 ? 1 : 0.42;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return [pts];
    case 'moon': {
      const outer: [number, number][] = [];
      for (let i = 0; i <= 18; i++) { const a = -Math.PI * 0.5 - (i / 18) * Math.PI * 1.35 + Math.PI * 0.2; outer.push([Math.cos(a), Math.sin(a)]); }
      const inner: [number, number][] = [];
      for (let i = 18; i >= 0; i--) { const a = -Math.PI * 0.5 - (i / 18) * Math.PI * 1.35 + Math.PI * 0.2; inner.push([0.45 + Math.cos(a) * 0.72, 0.1 + Math.sin(a) * 0.72]); }
      return [[...outer, ...inner, outer[0]]];
    }
    default:
      for (let i = 0; i <= 28; i++) {
        const t = (i / 28) * Math.PI * 2;
        pts.push([(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
      }
      return [pts];
  }
}

const neonSign: GenFn = (br, p) => {
  const z = WALL_FACE();
  const s = 0.34, cy = 1.65;
  br.blk(-0.4, cy - 0.42, z, 0.4, cy + 0.42, z + 0.012, '#9fd8ff', 'glass');
  for (const poly of neonPath(p.finish ?? 'heart')) {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      br.rodBetween([a[0] * s, cy + a[1] * s, z + 0.03], [b[0] * s, cy + b[1] * s, z + 0.03], 0.011, p.color, 'glow', 5);
    }
  }
  for (const [x, y] of [[-0.36, cy + 0.38], [0.36, cy + 0.38], [-0.36, cy - 0.38], [0.36, cy - 0.38]]) br.cyl(x, y, z + 0.02, 0.012, 0.012, 0.03, K.chrome, 'metal', 6, Math.PI / 2);
};

const monstera: GenFn = (br, p) => {
  const { FL: y } = dims();
  const c = p.color;
  br.lathe(0, y, 0, [[0.0, 0], [0.18, 0], [0.24, 0.42], [0.25, 0.48], [0.22, 0.48], [0.0, 0.44]], K.terracotta, 'paint', 14);
  br.cyl(0, y + 0.47, 0, 0.22, 0.22, 0.02, K.soil, 'paint', 12);
  const rnd = seeded(p.x * 53 + p.z * 11 + 3);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + rnd() * 0.5, r = 0.12 + rnd() * 0.22, h = 0.8 + rnd() * 0.75;
    const tip: [number, number, number] = [Math.cos(a) * r * 1.6, y + h, Math.sin(a) * r * 1.6];
    br.rodBetween([Math.cos(a) * 0.04, y + 0.5, Math.sin(a) * 0.04], tip, 0.008, mix(c, K.black, 0.35), 'paint', 4);
    br.blob(tip[0] + Math.cos(a) * 0.12, tip[1] + 0.03, tip[2] + Math.sin(a) * 0.12, 0.24, 0.014, 0.17, i % 2 ? lighten(c, 0.08) : c, 'paint', -a + Math.PI / 2, 0.25, 0.1);
  }
};

export const FURNITURE_GEN: Partial<Record<PieceType, GenFn>> = {
  sofa, sofaL, armchair, coffeeTable, table, tvStand, shelf, lamp, rug, rugRect, plant,
  bed, bunkBed, desk, gamingChair, vanity, wardrobe, beanBag, nightstand,
  counter, kitchenSink, fridge, stove, island, stool, diningTable, chair,
  tub, toilet, sink, shower,
  gamingSetup, ledStrip, poster, wallShelf, mirror, stringLights, neonSign, monstera,
};

export type { PlacedPiece };
