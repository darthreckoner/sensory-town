// v3 wardrobe: shoes (styles 7+ of OUTFIT_CATALOG.shoes). Foot space: ankle = origin, +z = toes,
// sole bottom at y = -0.09. There is no skin foot under a shoe, so open shoes add their own 'skin' pieces.
import * as THREE from 'three';
import type { PB, V3t } from './characterKit';
import { PI, blobRing, capsule, ell, lathe, loft, ringXY, strand, torus, type Rarity } from './wardrobeKit';

export interface ShoeDef {
  name: string;
  icon: string;
  rarity: Rarity;
  build: (pb: PB) => void;
  suit?: string;
}

const cyl = (r: number, h: number, seg = 10): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, h, seg);

// ═════════════════════════════════════════════════════════════════════════════
// Sculpted footwear (v3.2): lofted soles with a real sidewall and toe spring, a lofted upper, a heel counter,
// a padded collar and a tongue: chunky but shaped, not stacked boxes. Foot space (ankle = origin, +z = toes,
// sole bottom y = -0.09); getShoes() applies the chunky post-scale afterwards.
// ═════════════════════════════════════════════════════════════════════════════
const FZ = [-0.074, -0.056, -0.034, -0.008, 0.02, 0.05, 0.09, 0.13, 0.165, 0.192, 0.206];
const SOLE_HW = [0.016, 0.034, 0.043, 0.048, 0.05, 0.052, 0.053, 0.05, 0.043, 0.03, 0.012];
const UP_HW = [0.014, 0.03, 0.041, 0.046, 0.048, 0.049, 0.048, 0.044, 0.037, 0.024, 0.01];
const UP_TOP = [0.014, 0.03, 0.036, 0.034, 0.024, 0.01, -0.012, -0.022, -0.028, -0.034, -0.04];
/** Toe spring: the sole lifts toward the toe tip. */
const spring = (z: number): number => Math.max(0, z - 0.11) * 0.2;
const upTopAt = (z: number): number => {
  for (let i = 1; i < FZ.length; i++) if (z <= FZ[i]) return UP_TOP[i - 1] + ((UP_TOP[i] - UP_TOP[i - 1]) * (z - FZ[i - 1])) / (FZ[i] - FZ[i - 1]);
  return UP_TOP[UP_TOP.length - 1];
};
export interface SneakerOpts {
  /** extra sole thickness (platform), meters */
  plat?: number;
  /** collar height: 0 = low-top, 1 = high-top */
  hi?: number;
  /** a glowing strip around the sole */
  led?: boolean;
  /** 'led' sole (the old LED sneaker) */
  ledSole?: boolean;
  /** sole role (default white) */
  sole?: 'white' | 'dark' | 'main' | 'trim';
  /** upper finish: 'metal' for glitter */
  finish?: 'metal' | 'gloss' | undefined;
  /** slimmer, racing-style */
  slim?: boolean;
  /** clog: no laces, tongue, toe cap or collar ring */
  clog?: boolean;
}
export function sneaker(pb: PB, o: SneakerOpts = {}): void {
  const plat = o.plat ?? 0;
  const soleG = o.ledSole ? pb.at('led') : pb.at(o.sole ?? 'white');
  const main = pb.at('main', o.finish);
  const white = pb.at('white'), dark = pb.at('dark'), trim = pb.at('trim', o.finish);
  const sk = o.slim ? 0.9 : 1;
  const sh = 0.026 + plat;
  // sole: superellipse rings (p = 4: flat sides, rounded edges), tiny end rings close it
  loft(soleG, FZ.map((z, i) => ringXY(14, 0, -0.09 + spring(z) + sh / 2, z, SOLE_HW[i] * sk, sh / 2, 4)));
  if (o.led) loft(pb.at('led'), FZ.slice(2, 9).map((z, i) => ringXY(14, 0, -0.09 + spring(z) + sh * 0.55, z, SOLE_HW[i + 2] * sk + 0.0015, sh * 0.13, 4)));
  else loft(trim, FZ.slice(2, 9).map((z, i) => ringXY(14, 0, -0.09 + spring(z) + sh * 0.5, z, SOLE_HW[i + 2] * sk + 0.001, sh * 0.1, 4)));
  // upper
  const ups = FZ.map((z, i) => {
    const b = -0.09 + spring(z) + sh - 0.006;
    const top = UP_TOP[i] + plat;
    return ringXY(14, 0, (b + top) / 2, z, UP_HW[i] * sk, Math.max(0.004, (top - b) / 2), 2.6);
  });
  loft(main, ups);
  // toe cap and heel counter
  // toe cap: the toe rings of the upper, a touch bigger, so its rear edge is a clean seam (no ragged ellipsoid intersection)
  if (!o.slim && !o.clog) {
    loft(white, ups.slice(7).map((r) => {
      const cy = r.reduce((s, q) => s + q[1], 0) / r.length;
      return r.map(([x, y, z]) => [x * 1.05, cy + (y - cy) * 1.09 + 0.0015, z] as V3t);
    }));
  }
  ell(dark, [0, -0.03 + plat, -0.052], [0.04 * sk, 0.042, 0.026]);
  // padded collar around the ankle (hugs the narrower ankle of the current body) + tongue + laces
  if (!o.clog) {
    dark.ring(0.012 + plat, 0.035 * sk, 0.012);
    ell(white, [0, 0.01 + plat, 0.03], [0.016, 0.01, 0.028], [0.5, 0, 0]);
    for (const z of [0.045, 0.065, 0.085]) white.seg([-0.021, upTopAt(z) + plat + 0.003, z], [0.021, upTopAt(z) + plat + 0.003, z], 0.0032);
  }
  if (o.hi) {
    // high-top: a padded ankle shaft that rides up the shin
    const H = 0.07 + o.hi * 0.02 + plat;
    lathe(main, [[0.049 * sk, -0.03 + plat], [0.05 * sk, 0.02 + plat], [0.047 * sk, H * 0.8], [0.048 * sk, H]], 22);
    white.ring(H, 0.048 * sk, 0.012);
    for (const y of [0.0, 0.03, 0.058]) white.seg([-0.018, y + plat, 0.046], [0.018, y + plat, 0.046], 0.0035);
  }
}
/** Low footwear: a thin lofted sole with a forefoot cover and/or straps, optionally over a sock (Mary Janes, slides, flats). */
export interface LowOpts {
  /** sock: 'ankle' = a sock column around the ankle + under the foot; 'frill' adds a frilled top */
  sock?: 'ankle' | 'frill';
  /** forefoot cover: how far back it starts (z), 0.2 = toe cap only */
  cover?: number;
  /** strap across the instep */
  strap?: boolean;
  /** chunky slide band */
  band?: boolean;
  finish?: 'satin' | 'gloss' | undefined;
}
export function lowShoe(pb: PB, o: LowOpts = {}): void {
  const main = pb.at('main', o.finish), dark = pb.at('dark'), trim = pb.at('trim', o.finish), gold = pb.at('gold');
  const sock = pb.at('white', 'fabric');
  const sh = o.band ? 0.022 : 0.014;
  loft(dark, FZ.map((z, i) => ringXY(14, 0, -0.09 + spring(z) * 0.6 + sh / 2, z, SOLE_HW[i] * 0.99, sh / 2, 4)));
  if (!o.sock && !o.band) {
    // bare foot: the skin foot the open shoe shows (a lofted foot with the arch + toes)
    const skin = pb.at('skin');
    loft(skin, FZ.map((z, i) => ringXY(14, 0, -0.058 + sh * 0.2 + spring(z) * 0.6, z, UP_HW[i] * 0.9, 0.018, 2.6)).slice(1, 10));
    for (const dx of [-0.02, -0.007, 0.007, 0.02]) skin.e([dx, -0.07 + sh, 0.196], [0.0105, 0.011, 0.014]);
  }
  if (o.sock) {
    loft(sock, FZ.map((z, i) => ringXY(14, 0, -0.09 + sh + 0.012 + spring(z) * 0.6, z, UP_HW[i] * 0.93, 0.014, 2.6)).slice(1, 9));
    lathe(sock, [[0.037, -0.07], [0.04, -0.03], [0.036, 0.05], [0.04, 0.085]], 20);
    if (o.sock === 'frill') sock.add(torus(0.042, 0.011), { p: [0, 0.085, 0], r: [PI / 2, 0, 0] });
  }
  if (o.cover !== undefined) {
    const idx = FZ.map((z, i) => (z >= o.cover! ? i : -1)).filter((i) => i >= 0);
    loft(main, idx.map((i) => ringXY(14, 0, -0.09 + sh + 0.012 + spring(FZ[i]) * 0.6, FZ[i], UP_HW[i] * 0.99, 0.02, 2.6)));
  }
  if (o.strap) {
    strand(trim, [[-0.046, -0.05, 0.04], [-0.02, -0.0, 0.045], [0.02, -0.0, 0.045], [0.046, -0.05, 0.04]], () => [0.0065, 0.0055], 8, 10);
    gold.e([0.044, -0.045, 0.045], [0.008, 0.01, 0.008]);
  }
  if (o.band) strand(main, [[-0.052, -0.066, 0.045], [-0.03, -0.034, 0.075], [0.03, -0.034, 0.075], [0.052, -0.066, 0.045]], () => [0.016, 0.011], 10, 12);
}
/** Boot: the lofted foot plus a smooth shaft (calf-shaped lathe) and a rolled top. */
export interface BootOpts {
  h: number;
  r0: number;
  r1: number;
  finish?: 'gloss' | 'fabric' | undefined;
  /** heel block height (cowboy) */
  heel?: number;
  /** fold-over cuff role */
  cuff?: 'trim' | 'white' | 'dark';
  /** pointed toe (cowboy) */
  point?: boolean;
}
export function boot(pb: PB, o: BootOpts): void {
  const main = pb.at('main', o.finish);
  const dark = pb.at('dark'), cuff = pb.at(o.cuff ?? 'trim', o.finish);
  const heel = o.heel ?? 0;
  // sole + upper with the same stations as the sneaker (the upper climbs into the shaft)
  loft(dark, FZ.map((z, i) => ringXY(14, 0, -0.09 + spring(z) + 0.015, z, SOLE_HW[i] + 0.002, 0.015, 4)));
  if (heel > 0) ell(dark, [0, -0.09 + heel * 0.5 + 0.012, -0.046], [0.04, heel * 0.5 + 0.014, 0.032]); // stacked heel block
  loft(main, FZ.map((z, i) => {
    const b = -0.09 + 0.03 + heel;
    const top = UP_TOP[i] + 0.002;
    return ringXY(14, 0, (b + top) / 2, z + (o.point && z > 0.12 ? (z - 0.12) * 0.25 : 0), (UP_HW[i] + 0.002) * (o.point && z > 0.12 ? 0.85 : 1), Math.max(0.004, (top - b) / 2), 2.6);
  }));
  ell(main, [0, -0.052 + heel, 0.15], [0.036, 0.022, 0.05]);
  lathe(main, [[o.r0 + 0.008, -0.04 + heel], [o.r0, 0.012], [(o.r0 + o.r1) * 0.5, o.h * 0.5], [o.r1 * 0.985, o.h * 0.92], [o.r1, o.h]], 22);
  cuff.add(torus(o.r1 + 0.002, 0.0135), { p: [0, o.h, 0], r: [PI / 2, 0, 0] });
}

export const SHOE_V3: ShoeDef[] = [
  // 7 ── Platforms: chunky platform sneakers
  {
    name: 'Platforms', icon: '👟', rarity: 'uncommon',
    build(pb) {
      sneaker(pb, { plat: 0.022 });
    },
  },
  // 8 ── Light-Ups: glowing zig-zag stripes on the heel and sole
  {
    name: 'Light-Ups', icon: '🔆', rarity: 'epic',
    build(pb) {
      const led = pb.at('led');
      sneaker(pb, { hi: 0.6, led: true });
      for (const s of [-1, 1]) {
        led.seg([0.0486 * s, -0.01, -0.05], [0.0495 * s, 0.03, -0.02], 0.0045);
        led.seg([0.0495 * s, 0.03, -0.02], [0.05 * s, 0.0, 0.01], 0.0045);
        led.seg([0.05 * s, 0.0, 0.01], [0.0475 * s, 0.03, 0.04], 0.0045);
      }
    },
  },
  // 9 ── Rain Boots: glossy wellies with pull handles
  {
    name: 'Rain Boots', icon: '🌧️', rarity: 'common',
    build(pb) {
      const trim = pb.at('trim', 'gloss');
      boot(pb, { h: 0.2, r0: 0.05, r1: 0.058, finish: 'gloss' });
      for (const s of [-1, 1]) trim.seg([0.06 * s, 0.2, -0.02], [0.066 * s, 0.17, -0.0], 0.0055);
      pb.at('white', 'gloss').e([0, 0.0, 0.07], [0.012, 0.02, 0.008]);
    },
  },
  // 10 ── Snow Boots: puffy moon boots with a fluffy collar
  {
    name: 'Snow Boots', icon: '⛄', rarity: 'uncommon',
    build(pb) {
      const m = pb.at('main', 'fabric'), dark = pb.at('dark'), white = pb.at('white', 'fabric'), trim = pb.at('trim', 'fabric');
      dark.e([0, -0.074, 0.056], [0.066, 0.02, 0.138]);
      m.e([0, -0.02, 0.05], [0.066, 0.058, 0.118]);
      m.e([0, 0.05, -0.004], [0.069, 0.085, 0.07]);
      m.e([0, 0.12, -0.006], [0.062, 0.05, 0.062]);
      blobRing(white, 0.16, 0.058, 10, [0.026, 0.02, 0.026]);
      for (const y of [0.04, 0.095]) trim.seg([-0.06, y, 0.04], [0.06, y, 0.04], 0.007);
      for (const s of [-1, 1]) dark.seg([0.064 * s, -0.06, 0.0], [0.064 * s, -0.06, 0.12], 0.006);
    },
  },
  // 11 ── Roller Skates: white boot on a plate with four wheels
  {
    name: 'Roller Skates', icon: '🛼', rarity: 'rare',
    build(pb) {
      const main = pb.at('main'), dark = pb.at('dark'), pink = pb.at('pink');
      sneaker(pb, { hi: 0.7, plat: 0.022, sole: 'dark' });
      loft(dark, [-0.07, 0.0, 0.1, 0.18].map((z, i) => ringXY(12, 0, -0.1, z, [0.03, 0.04, 0.042, 0.03][i], 0.007, 4)));
      for (const z of [0.15, 0.078, -0.01, -0.07]) for (const s of [-1, 1]) {
        main.add(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 14), { p: [0.04 * s, -0.098, z], r: [0, 0, PI / 2] });
      }
      pink.e([0, -0.052, 0.208], [0.014, 0.016, 0.014]);
    },
  },
  // 12 ── Ballet Flats: low flats with crossed ribbons
  {
    name: 'Ballet Flats', icon: '🩰', rarity: 'common',
    build(pb) {
      const trim = pb.at('trim', 'satin');
      lowShoe(pb, { cover: 0.1, finish: 'satin' });
      // crossed ribbons up the ankle
      for (const s of [-1, 1]) {
        strand(trim, [[0.04 * s, -0.062, 0.03], [0.012 * s, -0.04, 0.02], [-0.03 * s, -0.01, 0.0], [-0.036 * s, 0.03, -0.004]], () => [0.0055, 0.004], 8, 10);
        strand(trim, [[0.04 * s, -0.062, -0.012], [0.012 * s, -0.04, -0.008], [-0.03 * s, 0.0, -0.004]], () => [0.0055, 0.004], 8, 8);
      }
      ell(trim, [0, 0.032, 0.03], [0.015, 0.012, 0.008]);
    },
  },
  // 13 ── Glitter Hi-Tops: metal-finish high tops
  {
    name: 'Glitter Hi-Tops', icon: '💎', rarity: 'epic',
    build(pb) {
      sneaker(pb, { hi: 1, finish: 'metal' });
    },
  },
  // 14 ── Cowboy Boots: pointed toe, tall heel, stitched shaft
  {
    name: 'Cowboy Boots', icon: '🤠', rarity: 'uncommon',
    build(pb) {
      const gold = pb.at('gold'), trim = pb.at('trim');
      boot(pb, { h: 0.2, r0: 0.044, r1: 0.054, heel: 0.022, point: true });
      trim.e([0, 0.176, 0.05], [0.03, 0.022, 0.01]);
      for (const s of [-1, 1]) {
        gold.seg([0.05 * s, 0.03, -0.02], [0.05 * s, 0.15, -0.02], 0.0035);
        gold.seg([0.03 * s, -0.01, 0.1], [0.036 * s, -0.04, 0.17], 0.0035);
      }
    },
  },
  // 15 ── Jelly Sandals: glossy straps over bare feet
  {
    name: 'Jelly Sandals', icon: '🩴', rarity: 'common',
    build(pb) {
      const skin = pb.at('skin'), g = pb.at('main', 'gloss'), dark = pb.at('dark', 'gloss');
      // bare foot (a lofted foot + toes) on a jelly sole, with crossed jelly straps and an ankle strap
      loft(skin, FZ.map((z, i) => ringXY(14, 0, -0.058 + spring(z) * 0.6, z, UP_HW[i] * 0.92, 0.016, 2.6)).slice(1, 10));
      for (const dx of [-0.02, -0.007, 0.007, 0.02]) skin.e([dx, -0.056, 0.2], [0.0105, 0.012, 0.014]);
      loft(dark, FZ.map((z, i) => ringXY(14, 0, -0.086 + spring(z) * 0.6, z, SOLE_HW[i] * 0.98, 0.006, 4)));
      loft(g, FZ.map((z, i) => ringXY(14, 0, -0.077 + spring(z) * 0.6, z, SOLE_HW[i] * 0.98, 0.006, 4)));
      for (const z of [0.07, 0.1]) strand(g, [[-0.05, -0.07, z], [-0.026, -0.036, z + 0.004], [0.026, -0.036, z + 0.004], [0.05, -0.07, z]], () => [0.0075, 0.006], 8, 10);
      for (const s of [-1, 1]) strand(g, [[0.046 * s, -0.068, -0.03], [0.044 * s, -0.03, -0.034], [0.0, -0.01, -0.03]], () => [0.0065, 0.0055], 8, 8);
      g.add(torus(0.04, 0.0065), { p: [0, 0.0, -0.008], r: [PI / 2, 0, 0] });
      pb.at('gold').e([0, -0.058, 0.1], [0.011, 0.01, 0.008]);
    },
  },
  // 16 ── Clogs: chunky clogs with jibbitz charms
  {
    name: 'Clogs', icon: '🐊', rarity: 'common',
    build(pb) {
      const white = pb.at('white'), pink = pb.at('pink'), cyan = pb.at('cyan'), gold = pb.at('gold'), dark = pb.at('dark');
      // a puffy clog: the sneaker body without laces, a heel strap and jibbitz charms
      sneaker(pb, { plat: 0.008, clog: true });
      strand(white, [[-0.046, -0.04, -0.03], [-0.036, 0.02, -0.062], [0.0, 0.034, -0.072], [0.036, 0.02, -0.062], [0.046, -0.04, -0.03]], () => [0.0085, 0.006], 8, 12);
      for (const [x, z] of [[-0.022, 0.12], [0.02, 0.126], [0.0, 0.098], [-0.034, 0.09], [0.034, 0.088]]) dark.e([x, -0.01, z], [0.0065, 0.004, 0.0065]);
      pink.e([-0.018, 0.0, 0.14], 0.0095);
      cyan.e([0.022, 0.0, 0.12], 0.0095);
      gold.e([0.0, 0.003, 0.1], 0.009);
      pink.e([-0.03, 0.0, 0.095], 0.0085);
    },
  },
  // 17 ── Fuzzy Boots: shearling boots
  {
    name: 'Fuzzy Boots', icon: '🐑', rarity: 'uncommon',
    build(pb) {
      const white = pb.at('white', 'fabric');
      boot(pb, { h: 0.13, r0: 0.05, r1: 0.056, finish: 'fabric', cuff: 'white' });
      blobRing(white, 0.125, 0.056, 12, [0.026, 0.022, 0.026]);
      blobRing(white, 0.105, 0.06, 10, [0.022, 0.018, 0.022]);
      for (const [z, y] of [[0.06, 0.02], [0.1, -0.01], [0.13, -0.035]]) white.e([0.0, y, z + 0.035], [0.016, 0.012, 0.016]);
    },
  },
  // 18 ── Moon Boots: astronaut boots with metal rings
  {
    name: 'Moon Boots', icon: '🌙', rarity: 'epic', suit: 'astro',
    build(pb) {
      const dark = pb.at('dark'), metal = pb.at('trim', 'metal'), cyan = pb.at('cyan');
      boot(pb, { h: 0.15, r0: 0.056, r1: 0.064, cuff: 'white' });
      metal.add(torus(0.066, 0.0095), { p: [0, 0.145, 0], r: [PI / 2, 0, 0] });
      metal.add(torus(0.062, 0.008), { p: [0, 0.03, 0], r: [PI / 2, 0, 0] });
      cyan.seg([-0.062, -0.07, 0.03], [-0.062, -0.07, 0.14], 0.005);
      cyan.seg([0.062, -0.07, 0.03], [0.062, -0.07, 0.14], 0.005);
      for (const y of [0.06, 0.1]) dark.seg([-0.06, y, 0.04], [0.06, y, 0.04], 0.0045);
    },
  },
  // 19 ── Knee Boots: tall boots with a fold-over cuff and buckle
  {
    name: 'Knee Boots', icon: '🥾', rarity: 'rare', suit: 'hero',
    build(pb) {
      const trim = pb.at('trim'), gold = pb.at('gold');
      boot(pb, { h: 0.29, r0: 0.052, r1: 0.064 });
      trim.add(torus(0.054, 0.007), { p: [0, 0.085, 0], r: [PI / 2, 0, 0] });
      gold.e([0.0, 0.29, 0.066], [0.012, 0.012, 0.006]);
      gold.e([0.0, 0.085, 0.048], [0.009, 0.009, 0.005]);
    },
  },
  // 20 ── Ice Skates: white boots on blades
  {
    name: 'Ice Skates', icon: '⛸️', rarity: 'rare',
    build(pb) {
      const blade = pb.at('trim', 'metal');
      sneaker(pb, { hi: 1, plat: 0.026, sole: 'dark' });
      blade.add(new THREE.BoxGeometry(0.008, 0.012, 0.3), { p: [0, -0.1, 0.08] });
      blade.add(new THREE.BoxGeometry(0.008, 0.03, 0.012), { p: [0, -0.082, 0.19] });
      blade.add(new THREE.BoxGeometry(0.008, 0.03, 0.012), { p: [0, -0.082, -0.05] });
      blade.e([0, -0.098, 0.236], [0.005, 0.014, 0.016]);
    },
  },
  // 21 ── Driver Shoes: slim racing shoes with a side stripe
  {
    name: 'Driver Shoes', icon: '🏎️', rarity: 'rare', suit: 'racer',
    build(pb) {
      const white = pb.at('white'), trim = pb.at('trim');
      sneaker(pb, { slim: true, sole: 'dark' });
      for (const s of [-1, 1]) {
        white.seg([0.045 * s, -0.05, 0.0], [0.043 * s, -0.045, 0.14], 0.0062);
        trim.seg([0.046 * s, -0.012, -0.045], [0.045 * s, -0.036, -0.01], 0.0055);
      }
    },
  },
];
