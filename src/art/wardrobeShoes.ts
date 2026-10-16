// v3 wardrobe: shoes (styles 7+ of OUTFIT_CATALOG.shoes). Foot space: ankle = origin, +z = toes,
// sole bottom at y = -0.09. There is no skin foot under a shoe, so open shoes add their own 'skin' pieces.
import * as THREE from 'three';
import { capsule, torus, type PB } from './characterKit';
import { PI, blobRing, type Rarity } from './wardrobeKit';

export interface ShoeDef {
  name: string;
  icon: string;
  rarity: Rarity;
  build: (pb: PB) => void;
  suit?: string;
}

const cyl = (r: number, h: number, seg = 10): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, h, seg);

export const SHOE_V3: ShoeDef[] = [
  // 7 ── Platforms: chunky platform sneakers
  {
    name: 'Platforms', icon: '👟', rarity: 'uncommon',
    build(pb) {
      const main = pb.at('main'), white = pb.at('white'), dark = pb.at('dark'), trim = pb.at('trim');
      white.e([0, -0.052, 0.062], [0.057, 0.038, 0.13]);
      trim.e([0, -0.047, 0.062], [0.059, 0.008, 0.132]);
      main.e([0, 0.002, 0.055], [0.047, 0.047, 0.103]);
      white.e([0, -0.018, 0.145], [0.041, 0.03, 0.05]);
      dark.e([0, -0.006, -0.045], [0.042, 0.042, 0.04]);
      dark.ring(0.036, 0.04, 0.012);
      white.e([0, 0.044, 0.045], [0.022, 0.022, 0.03]);
      for (const y of [0.02, 0.036]) white.seg([-0.02, y, 0.07], [0.02, y, 0.07], 0.004);
    },
  },
  // 8 ── Light-Ups: glowing zig-zag stripes on the heel and sole
  {
    name: 'Light-Ups', icon: '🔆', rarity: 'epic',
    build(pb) {
      const main = pb.at('main'), white = pb.at('white'), dark = pb.at('dark'), led = pb.at('led');
      white.e([0, -0.066, 0.065], [0.054, 0.028, 0.126]);
      led.e([0, -0.074, 0.065], [0.0555, 0.0075, 0.1265]);
      main.e([0, -0.022, 0.055], [0.047, 0.047, 0.103]);
      main.e([0, 0.03, -0.012], [0.049, 0.06, 0.052]);
      white.e([0, -0.04, 0.145], [0.041, 0.03, 0.05]);
      dark.ring(0.082, 0.047, 0.011);
      for (const s of [-1, 1]) {
        led.seg([0.0486 * s, -0.01, -0.05], [0.0495 * s, 0.03, -0.02], 0.0045);
        led.seg([0.0495 * s, 0.03, -0.02], [0.05 * s, 0.0, 0.01], 0.0045);
        led.seg([0.05 * s, 0.0, 0.01], [0.0475 * s, 0.03, 0.04], 0.0045);
      }
      led.e([0, 0.0, -0.1], [0.012, 0.045, 0.004]);
      for (const y of [0.0, 0.03, 0.058]) white.e([0, y, 0.043], [0.024, 0.006, 0.014]);
    },
  },
  // 9 ── Rain Boots: glossy wellies with pull handles
  {
    name: 'Rain Boots', icon: '🌧️', rarity: 'common',
    build(pb) {
      const g = pb.at('main', 'gloss'), dark = pb.at('dark'), trim = pb.at('trim', 'gloss');
      dark.e([0, -0.076, 0.06], [0.056, 0.018, 0.13]);
      dark.e([0, -0.07, -0.04], [0.052, 0.024, 0.04]);
      g.e([0, -0.03, 0.058], [0.053, 0.052, 0.112]);
      g.add(capsule(0.056, 0.17), { p: [0, 0.1, -0.006] });
      trim.add(torus(0.056, 0.011), { p: [0, 0.2, -0.006], r: [PI / 2, 0, 0] });
      for (const s of [-1, 1]) trim.seg([0.056 * s, 0.2, -0.02], [0.062 * s, 0.17, -0.0], 0.0055);
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
      const white = pb.at('white'), main = pb.at('main'), dark = pb.at('dark'), trim = pb.at('trim'), pink = pb.at('pink');
      white.e([0, -0.012, 0.05], [0.046, 0.05, 0.1]);
      white.add(capsule(0.048, 0.07), { p: [0, 0.055, -0.01] });
      white.e([0, 0.0, 0.14], [0.04, 0.034, 0.05]);
      dark.add(new THREE.BoxGeometry(0.07, 0.016, 0.26), { p: [0, -0.06, 0.06] });
      trim.ring(0.098, 0.05, 0.011);
      for (const y of [0.0, 0.025]) trim.seg([-0.02, y, 0.07], [0.02, y, 0.07], 0.0035);
      for (const z of [0.14, 0.078, -0.01, -0.07]) for (const s of [-1, 1]) {
        main.add(cyl(0.022, 0.016), { p: [0.04 * s, -0.068, z], r: [0, 0, PI / 2] });
      }
      pink.e([0, -0.052, 0.186], [0.014, 0.016, 0.014]);
      pb.at('gold').e([0, 0.0, 0.088], [0.007, 0.007, 0.004]);
    },
  },
  // 12 ── Ballet Flats: low flats with crossed ribbons
  {
    name: 'Ballet Flats', icon: '🩰', rarity: 'common',
    build(pb) {
      const main = pb.at('main', 'satin'), dark = pb.at('dark'), trim = pb.at('trim', 'satin'), skin = pb.at('skin');
      dark.e([0, -0.083, 0.052], [0.04, 0.008, 0.1]);
      main.e([0, -0.064, 0.05], [0.04, 0.026, 0.1]);
      main.e([0, -0.05, 0.12], [0.034, 0.02, 0.05]);
      skin.e([0, -0.03, 0.005], [0.036, 0.04, 0.04]);
      for (const s of [-1, 1]) {
        trim.seg([0.038 * s, -0.06, 0.03], [-0.036 * s, 0.01, 0.0], 0.0055);
        trim.seg([0.038 * s, -0.06, -0.01], [-0.036 * s, 0.03, 0.01], 0.0055);
      }
      trim.e([-0.012, 0.03, 0.03], [0.014, 0.012, 0.008], [0, 0, 0.5]);
      trim.e([0.012, 0.03, 0.03], [0.014, 0.012, 0.008], [0, 0, -0.5]);
    },
  },
  // 13 ── Glitter Hi-Tops: metal-finish high tops
  {
    name: 'Glitter Hi-Tops', icon: '💎', rarity: 'epic',
    build(pb) {
      const m = pb.at('main', 'metal'), white = pb.at('white'), t = pb.at('trim', 'metal');
      white.e([0, -0.068, 0.065], [0.052, 0.026, 0.125]);
      m.e([0, -0.026, 0.055], [0.047, 0.047, 0.103]);
      m.e([0, 0.03, -0.012], [0.05, 0.064, 0.054]);
      t.e([0, -0.045, 0.145], [0.041, 0.03, 0.05]);
      white.ring(0.086, 0.047, 0.012);
      for (const y of [0.0, 0.03, 0.06]) white.e([0, y, 0.043], [0.024, 0.006, 0.014]);
      for (const s of [-1, 1]) t.e([0.05 * s, 0.03, -0.004], [0.005, 0.022, 0.022]);
    },
  },
  // 14 ── Cowboy Boots: pointed toe, tall heel, stitched shaft
  {
    name: 'Cowboy Boots', icon: '🤠', rarity: 'uncommon',
    build(pb) {
      const m = pb.at('main'), dark = pb.at('dark'), gold = pb.at('gold'), trim = pb.at('trim');
      dark.e([0, -0.08, 0.075], [0.04, 0.01, 0.13]);
      dark.add(new THREE.BoxGeometry(0.075, 0.024, 0.05), { p: [0, -0.078, -0.045] });
      m.e([0, -0.036, 0.075], [0.044, 0.046, 0.115]);
      m.e([0, -0.045, 0.165], [0.03, 0.032, 0.06]);
      m.add(capsule(0.052, 0.16), { p: [0, 0.1, -0.006] });
      trim.add(torus(0.052, 0.008), { p: [0, 0.188, -0.006], r: [PI / 2, 0, 0] });
      trim.e([0, 0.172, 0.046], [0.03, 0.022, 0.01]);
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
      skin.e([0, -0.05, 0.05], [0.036, 0.026, 0.09]);
      skin.e([0, -0.04, 0.13], [0.034, 0.02, 0.04]);
      for (const dx of [-0.02, -0.007, 0.007, 0.02]) skin.e([dx, -0.05, 0.168], [0.0105, 0.012, 0.015]);
      g.e([0, -0.077, 0.06], [0.044, 0.012, 0.115]);
      dark.e([0, -0.086, 0.06], [0.043, 0.006, 0.112]);
      g.seg([-0.04, -0.06, 0.07], [0.04, -0.06, 0.07], 0.007);
      g.seg([-0.04, -0.06, 0.1], [0.04, -0.06, 0.1], 0.007);
      for (const s of [-1, 1]) {
        g.seg([0.04 * s, -0.06, -0.015], [0.039 * s, -0.01, -0.012], 0.0065);
        g.seg([0.039 * s, -0.01, -0.012], [0.0, -0.005, 0.045], 0.006);
      }
      g.add(torus(0.04, 0.0065), { p: [0, 0.0, -0.008], r: [PI / 2, 0, 0] });
      pb.at('gold').e([0, -0.058, 0.1], [0.011, 0.01, 0.008]);
    },
  },
  // 16 ── Clogs: chunky clogs with jibbitz charms
  {
    name: 'Clogs', icon: '🐊', rarity: 'common',
    build(pb) {
      const m = pb.at('main'), dark = pb.at('dark'), white = pb.at('white'), pink = pb.at('pink'), cyan = pb.at('cyan'), gold = pb.at('gold');
      dark.e([0, -0.074, 0.06], [0.058, 0.02, 0.13]);
      m.e([0, -0.03, 0.06], [0.055, 0.05, 0.115]);
      m.e([0, -0.012, 0.115], [0.05, 0.05, 0.075]);
      m.e([0, 0.0, -0.02], [0.05, 0.045, 0.045]);
      white.e([0, -0.012, -0.045], [0.044, 0.036, 0.016]);
      for (const [x, z] of [[-0.022, 0.12], [0.02, 0.126], [0.0, 0.098], [-0.034, 0.09], [0.034, 0.088]]) dark.e([x, 0.03, z], [0.0065, 0.004, 0.0065]);
      pink.e([-0.018, 0.04, 0.14], 0.0095);
      cyan.e([0.022, 0.04, 0.12], 0.0095);
      gold.e([0.0, 0.043, 0.1], 0.009);
      pink.e([-0.03, 0.04, 0.095], 0.0085);
    },
  },
  // 17 ── Fuzzy Boots: shearling boots
  {
    name: 'Fuzzy Boots', icon: '🐑', rarity: 'uncommon',
    build(pb) {
      const m = pb.at('main', 'fabric'), white = pb.at('white', 'fabric'), dark = pb.at('dark');
      dark.e([0, -0.078, 0.058], [0.05, 0.015, 0.122]);
      m.e([0, -0.03, 0.055], [0.052, 0.05, 0.11]);
      m.add(capsule(0.054, 0.1), { p: [0, 0.07, -0.006] });
      blobRing(white, 0.135, 0.054, 10, [0.026, 0.022, 0.026]);
      blobRing(white, 0.115, 0.058, 10, [0.022, 0.018, 0.022]);
      for (const [z, y] of [[0.06, 0.02], [0.1, -0.01], [0.13, -0.035]]) white.e([0.0, y, z + 0.035], [0.016, 0.012, 0.016]);
      for (const s of [-1, 1]) white.e([0.05 * s, -0.045, 0.1], [0.012, 0.014, 0.025]);
    },
  },
  // 18 ── Moon Boots: astronaut boots with metal rings
  {
    name: 'Moon Boots', icon: '🌙', rarity: 'epic', suit: 'astro',
    build(pb) {
      const w = pb.at('white'), main = pb.at('main'), dark = pb.at('dark'), metal = pb.at('trim', 'metal'), cyan = pb.at('cyan');
      dark.e([0, -0.074, 0.06], [0.062, 0.02, 0.135]);
      main.e([0, -0.02, 0.055], [0.062, 0.055, 0.12]);
      w.add(capsule(0.066, 0.12), { p: [0, 0.07, -0.008] });
      w.e([0, 0.0, 0.14], [0.052, 0.044, 0.055]);
      metal.add(torus(0.067, 0.0095), { p: [0, 0.145, -0.008], r: [PI / 2, 0, 0] });
      metal.add(torus(0.067, 0.008), { p: [0, 0.025, -0.008], r: [PI / 2, 0, 0] });
      cyan.seg([-0.062, -0.07, 0.03], [-0.062, -0.07, 0.14], 0.005);
      cyan.seg([0.062, -0.07, 0.03], [0.062, -0.07, 0.14], 0.005);
      for (const y of [0.06, 0.1]) dark.seg([-0.06, y, 0.04], [0.06, y, 0.04], 0.0045);
    },
  },
  // 19 ── Knee Boots: tall boots with a fold-over cuff and buckle
  {
    name: 'Knee Boots', icon: '🥾', rarity: 'rare', suit: 'hero',
    build(pb) {
      const m = pb.at('main'), dark = pb.at('dark'), trim = pb.at('trim'), gold = pb.at('gold');
      dark.e([0, -0.078, 0.06], [0.052, 0.014, 0.128]);
      dark.e([0, -0.07, -0.04], [0.05, 0.022, 0.036]);
      m.e([0, -0.03, 0.056], [0.05, 0.05, 0.108]);
      m.e([0, -0.04, 0.145], [0.039, 0.036, 0.05]);
      m.add(capsule(0.052, 0.26), { p: [0, 0.16, -0.006] });
      trim.add(torus(0.056, 0.016), { p: [0, 0.305, -0.006], r: [PI / 2, 0, 0] });
      trim.add(torus(0.054, 0.007), { p: [0, 0.085, -0.006], r: [PI / 2, 0, 0] });
      gold.e([0.0, 0.305, 0.05], [0.012, 0.012, 0.006]);
      gold.e([0.0, 0.085, 0.048], [0.009, 0.009, 0.005]);
    },
  },
  // 20 ── Ice Skates: white boots on blades
  {
    name: 'Ice Skates', icon: '⛸️', rarity: 'rare',
    build(pb) {
      const w = pb.at('white'), main = pb.at('main'), blade = pb.at('trim', 'metal'), trim = pb.at('trim');
      w.e([0, -0.026, 0.05], [0.045, 0.05, 0.1]);
      w.add(capsule(0.048, 0.1), { p: [0, 0.05, -0.008] });
      w.e([0, -0.036, 0.14], [0.037, 0.034, 0.048]);
      main.e([0, -0.07, 0.06], [0.04, 0.012, 0.11]);
      blade.add(new THREE.BoxGeometry(0.01, 0.01, 0.3), { p: [0, -0.085, 0.07] });
      blade.add(new THREE.BoxGeometry(0.01, 0.026, 0.012), { p: [0, -0.07, 0.17] });
      blade.add(new THREE.BoxGeometry(0.01, 0.026, 0.012), { p: [0, -0.07, -0.05] });
      blade.e([0, -0.083, 0.226], [0.005, 0.012, 0.014]);
      trim.ring(0.098, 0.05, 0.011);
      for (const y of [-0.01, 0.015, 0.04]) trim.seg([-0.02, y, 0.08], [0.02, y, 0.08], 0.0035);
    },
  },
  // 21 ── Driver Shoes: slim racing shoes with a side stripe
  {
    name: 'Driver Shoes', icon: '🏎️', rarity: 'rare', suit: 'racer',
    build(pb) {
      const m = pb.at('main'), white = pb.at('white'), dark = pb.at('dark'), trim = pb.at('trim');
      dark.e([0, -0.083, 0.06], [0.042, 0.008, 0.115]);
      m.e([0, -0.052, 0.055], [0.043, 0.032, 0.105]);
      m.e([0, -0.02, -0.02], [0.044, 0.046, 0.046]);
      m.e([0, -0.052, 0.14], [0.036, 0.026, 0.045]);
      dark.ring(0.012, 0.04, 0.012);
      for (const s of [-1, 1]) {
        white.seg([0.044 * s, -0.05, 0.0], [0.043 * s, -0.045, 0.14], 0.0065);
        trim.seg([0.045 * s, -0.02, -0.04], [0.045 * s, -0.04, -0.01], 0.006);
      }
      white.e([0, -0.01, 0.06], [0.026, 0.011, 0.03]);
      for (const z of [0.07, 0.095, 0.12]) white.seg([-0.02, -0.02, z], [0.02, -0.02, z], 0.003);
    },
  },
];
