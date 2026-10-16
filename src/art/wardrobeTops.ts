// v3 wardrobe: tops (styles 10+ of OUTFIT_CATALOG.top). Same authoring rules as characterParts.ts:
//   torso(): torso space (y = world height, z flattened afterwards), hugs bodyR(y) + off
//   arm():   arm space; upper = shoulder at the origin, lower = elbow at the origin; arms hang along -y
// `off` is the shirt's extra radius at the chest (accessories and bottoms sit outside it).
import * as THREE from 'three';
import { bodyR, shell, torus, flare, type PB } from './characterKit';
import {
  NECK, PI, blobRing, box, boltGeo, CIRCLE, decal, ELLIPSE, foreArm, fluffLathe, front, heartGeo, leafGeo, overShoulder, puffTube,
  RECT, ribbedShell, ribbedTube, rnd, roles, shoulderPad, starGeo, tube, upperArm, zAt, lathe, type Rarity,
} from './wardrobeKit';

const TAUish = 6.283;
export interface TopDef {
  name: string;
  icon: string;
  rarity: Rarity;
  /** extra radius of the shirt at the chest, meters */
  off: number;
  torso: (pb: PB, off: number) => void;
  /** omitted = bare arms */
  arm?: (pb: PB, upper: boolean, s: number) => void;
  /** part of a full-body suit (see wardrobeCatalog) */
  suit?: string;
}

/** Hood bunched at the back of the neck. */
const hoodNeck = (g: THREE.BufferGeometry | null, main: ReturnType<typeof roles>['main']): void => {
  void g;
  main.add(torus(0.082, 0.03), { p: [0, 1.418, -0.006], r: [PI / 2, 0, 0], s: [1.05, 1, 1] });
  main.e([0, 1.4, -0.085], [0.09, 0.045, 0.055]);
};
const stringsDown = (white: ReturnType<typeof roles>['white'], off: number, y0 = 1.39, y1 = 1.27): void => {
  for (const s of [-1, 1]) {
    white.seg([0.034 * s, y0, zAt(y0, off, 0.034, 0.004)], [0.04 * s, y1, zAt(y1, off, 0.04, 0.006)], 0.0045);
    white.e([0.04 * s, y1 - 0.008, zAt(y1 - 0.008, off, 0.04, 0.008)], 0.0085);
  }
};
/** Fitted long sleeve with a rib cuff. */
const longSleeve = (pb: PB, upper: boolean, r0 = 0.054, r1 = 0.05, r2 = 0.047, r3 = 0.042, cuff = true): void => {
  const m = pb.at('main');
  if (upper) upperArm(m, 0.3, r0, r1);
  else {
    foreArm(m, 0.25, r2, r3);
    if (cuff) pb.at('trim').ring(-0.24, r3 - 0.001, 0.012);
  }
};

export const TOP_V3: TopDef[] = [
  // 10 ── Crop Hoodie: boxy, hem above the waist, hood bunched, drawstrings
  {
    name: 'Crop Hoodie', icon: '🧥', rarity: 'common', off: 0.04,
    torso(pb, off) {
      const { main, trim, white } = roles(pb);
      shell(main, 1.06, NECK, off);
      trim.ring(1.06, bodyR(1.06) + off + 0.002, 0.018);
      hoodNeck(null, main);
      stringsDown(white, off);
      decal(pb.at('print'), starGeo(0.03, 0.013), 1.16, off);
    },
    arm(pb, upper) {
      if (upper) upperArm(pb.at('main'), 0.3, 0.068, 0.064);
      else {
        foreArm(pb.at('main'), 0.262, 0.062, 0.056);
        pb.at('trim').ring(-0.25, 0.049, 0.015);
      }
    },
  },
  // 11 ── Denim Jacket: trucker, flap pockets, gold buttons
  {
    name: 'Denim Jacket', icon: '🧥', rarity: 'uncommon', off: 0.032,
    torso(pb, off) {
      const { main, trim, dark, gold } = roles(pb);
      shell(main, 0.93, NECK - 0.01, off);
      dark.ring(0.93, bodyR(0.93) + off + 0.003, 0.011);
      trim.ring(NECK - 0.012, bodyR(NECK - 0.012) + off + 0.003, 0.012);
      for (const s of [-1, 1]) box(trim, 0.07, 0.034, 0.012, 0.01, [0.046 * s, 1.403, zAt(1.403, off, 0.046, 0.011)], [0.5, 0, 0.5 * s]);
      dark.seg([0, 1.36, front(1.36, off, 0.003)], [0, 0.95, front(0.95, off, 0.003)], 0.004);
      for (const y of [1.3, 1.2, 1.1, 1.0]) gold.e([0, y, front(y, off, 0.007)], 0.0095);
      for (const s of [-1, 1]) {
        box(trim, 0.072, 0.062, 0.012, 0.01, [0.078 * s, 1.2, zAt(1.2, off, 0.078, 0.008)]);
        box(dark, 0.072, 0.014, 0.014, 0.006, [0.078 * s, 1.226, zAt(1.226, off, 0.078, 0.01)]);
        gold.e([0.078 * s, 1.2, zAt(1.2, off, 0.078, 0.014)], 0.0075);
        dark.seg([0.07 * s, 1.35, zAt(1.35, off, 0.07, 0.003)], [0.1 * s, 0.97, zAt(0.97, off, 0.1, 0.003)], 0.0035);
      }
    },
    arm(pb, upper) {
      if (upper) upperArm(pb.at('main'), 0.3, 0.058, 0.055);
      else {
        foreArm(pb.at('main'), 0.25, 0.05, 0.047);
        pb.at('dark').ring(-0.235, 0.047, 0.012);
        pb.at('gold').e([0.05, -0.226, 0], 0.007);
      }
    },
  },
  // 12 ── Sequin Tank: metal-finish sparkle, wide straps
  {
    name: 'Sequin Tank', icon: '✨', rarity: 'rare', off: 0.012,
    torso(pb, off) {
      const m = pb.at('main', 'metal'), t = pb.at('trim', 'metal'), w = pb.at('white', 'metal');
      shell(m, 0.97, 1.33, off);
      t.ring(0.97, bodyR(0.97) + off + 0.002, 0.012);
      t.ring(1.33, bodyR(1.33) + off + 0.002, 0.012);
      for (const s of [-1, 1]) overShoulder(m, 0.14 * s, 1.3, 1.3, off, 0.019);
      for (let i = 0; i < 34; i++) {
        const y = 1.0 + rnd(i) * 0.31;
        const a = (rnd(i + 50) - 0.5) * TAUish;
        const R = bodyR(y) + off + 0.004;
        w.e([Math.sin(a) * R, y, Math.cos(a) * R], 0.0065);
      }
    },
    arm: (pb, upper) => upper && shoulderPad(pb, 'main'),
  },
  // 13 ── Bolt Tee: oversized, big lightning bolt print
  {
    name: 'Bolt Tee', icon: '⚡', rarity: 'common', off: 0.034,
    torso(pb, off) {
      const { main, trim } = roles(pb);
      shell(main, 0.84, NECK, off);
      trim.ring(0.84, bodyR(0.84) + off + 0.002, 0.009);
      trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.003, 0.011);
      const pr = pb.at('print');
      decal(pr, boltGeo(0.1, 0.17), 1.16, off, -0.012);
      decal(pr, boltGeo(0.045, 0.078), 0.98, off, 0.075);
      decal(pr, boltGeo(0.12, 0.2), 1.14, off, 0, 0, true);
    },
    arm(pb, upper) {
      if (!upper) return;
      upperArm(pb.at('main'), 0.15, 0.07, 0.074);
      pb.at('white').ring(-0.145, 0.075, 0.007);
    },
  },
  // 14 ── Tie-Dye Tee: bullseye dye bursts
  {
    name: 'Tie-Dye Tee', icon: '🌈', rarity: 'uncommon', off: 0.022,
    torso(pb, off) {
      const { main, trim } = roles(pb);
      shell(main, 0.9, NECK, off);
      trim.ring(0.9, bodyR(0.9) + off + 0.002, 0.008);
      trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.003, 0.01);
      for (const back of [false, true]) {
        const k = back ? -1 : 1;
        decal(pb.at('pink'), CIRCLE(0.125, 24), 1.18, off, 0.01 * k, 0, back);
        decal(pb.at('cyan'), CIRCLE(0.1, 24), 1.18, off, 0.01 * k, 0.0012, back);
        decal(pb.at('white'), CIRCLE(0.078, 20), 1.18, off, 0.01 * k, 0.0024, back);
        decal(pb.at('gold'), CIRCLE(0.058, 18), 1.18, off, 0.01 * k, 0.0036, back);
        decal(pb.at('pink'), CIRCLE(0.036, 14), 1.18, off, 0.01 * k, 0.0048, back);
        decal(pb.at('cyan'), CIRCLE(0.055, 16), 0.98, off, -0.085 * k, 0, back);
        decal(pb.at('white'), CIRCLE(0.036, 14), 0.98, off, -0.085 * k, 0.0012, back);
        decal(pb.at('gold'), CIRCLE(0.018, 10), 0.98, off, -0.085 * k, 0.0024, back);
      }
    },
    arm(pb, upper) {
      if (!upper) return;
      upperArm(pb.at('main'), 0.12, 0.058, 0.062);
      pb.at('pink').ring(-0.1, 0.0615, 0.006);
      pb.at('cyan').ring(-0.12, 0.0625, 0.006);
    },
  },
  // 15 ── Overalls: denim bib over a short-sleeve tee
  {
    name: 'Overalls', icon: '🌻', rarity: 'uncommon', off: 0.03,
    torso(pb, off) {
      const { main, trim, dark, gold } = roles(pb);
      const tee = pb.at('cream', 'fabric');
      shell(tee, 0.9, NECK, 0.008);
      tee.ring(NECK + 0.003, bodyR(NECK) + 0.01, 0.009);
      shell(main, 0.88, 1.26, off);
      trim.ring(1.26, bodyR(1.26) + off + 0.002, 0.011);
      dark.ring(0.88, bodyR(0.88) + off + 0.002, 0.008);
      for (const s of [-1, 1]) {
        overShoulder(main, 0.14 * s, 1.25, 1.25, off, 0.0155);
        gold.e([0.14 * s, 1.245, zAt(1.245, off, 0.14, 0.014)], 0.0115);
      }
      box(trim, 0.085, 0.07, 0.012, 0.01, [0, 1.12, front(1.12, off, 0.009)]);
      dark.seg([-0.04, 1.155, front(1.155, off, 0.015)], [0.04, 1.155, front(1.155, off, 0.015)], 0.003);
    },
    arm(pb, upper) {
      if (!upper) return;
      const c = pb.at('cream', 'fabric');
      upperArm(c, 0.12, 0.05, 0.054);
      c.ring(-0.12, 0.054, 0.006);
    },
  },
  // 16 ── Racing Jacket: color-blocked yoke, stripes, sponsor patches
  {
    name: 'Racing Jacket', icon: '🏁', rarity: 'rare', off: 0.03,
    torso(pb, off) {
      const { main, trim, dark, white } = roles(pb);
      shell(main, 0.9, 1.22, off);
      shell(dark, 1.22, NECK, off + 0.003);
      trim.ring(0.9, bodyR(0.9) + off + 0.002, 0.016);
      white.ring(1.222, bodyR(1.222) + off + 0.004, 0.0105);
      white.ring(1.195, bodyR(1.195) + off + 0.003, 0.005);
      trim.ring(NECK + 0.003, bodyR(NECK) + off + 0.006, 0.013);
      trim.ring(NECK - 0.02, bodyR(NECK - 0.02) + off + 0.006, 0.011);
      white.seg([0, 1.4, front(1.4, off, 0.006)], [0, 0.92, front(0.92, off, 0.004)], 0.0036);
      decal(white, CIRCLE(0.03), 1.13, off, 0.07, 0.001);
      decal(pb.at('pink'), starGeo(0.022, 0.01), 1.13, off, 0.07, 0.0025);
      decal(pb.at('cyan'), RECT(0.07, 0.016), 1.1, off, -0.075, 0.001);
      decal(pb.at('gold'), RECT(0.05, 0.01), 1.07, off, -0.075, 0.001);
    },
    arm(pb, upper) {
      if (upper) {
        upperArm(pb.at('main'), 0.3, 0.057, 0.053);
        pb.at('white').ring(-0.1, 0.0555, 0.0065);
        pb.at('white').ring(-0.125, 0.0545, 0.0035);
      } else {
        foreArm(pb.at('main'), 0.25, 0.049, 0.044);
        pb.at('trim').ring(-0.24, 0.043, 0.013);
      }
    },
  },
  // 17 ── Ski Jacket: bulky color-block, tall collar, cuffs
  {
    name: 'Ski Jacket', icon: '⛷️', rarity: 'uncommon', off: 0.05,
    torso(pb, off) {
      const { main, trim, dark, white } = roles(pb);
      puffTube(main, 0.9, 1.16, 2, 0.01, (y) => bodyR(y) + off - 0.006, 18, 4);
      puffTube(trim, 1.16, NECK - 0.02, 2, 0.008, (y) => bodyR(y) + off - 0.006, 18, 4);
      dark.ring(0.9, bodyR(0.9) + off + 0.004, 0.016);
      trim.add(torus(0.07, 0.019), { p: [0, 1.436, -0.004], r: [PI / 2, 0, 0] });
      dark.add(torus(0.066, 0.01), { p: [0, 1.458, -0.004], r: [PI / 2, 0, 0] });
      white.seg([0, 1.4, front(1.4, off, 0.008)], [0, 0.93, front(0.93, off, 0.006)], 0.004);
      for (const s of [-1, 1]) white.seg([0.045 * s, 1.18, zAt(1.18, off, 0.045, 0.008)], [0.1 * s, 1.14, zAt(1.14, off, 0.1, 0.008)], 0.004);
      decal(pb.at('cyan'), RECT(0.075, 0.012), 1.25, off, -0.075, 0.003);
    },
    arm(pb, upper) {
      if (upper) {
        upperArm(pb.at('main'), 0.3, 0.07, 0.066);
        pb.at('cyan').ring(-0.13, 0.0685, 0.007);
      } else {
        foreArm(pb.at('main'), 0.26, 0.064, 0.058);
        pb.at('dark').ring(-0.245, 0.05, 0.02);
      }
    },
  },
  // 18 ── Quarter-Zip: sporty pullover with a contrast yoke
  {
    name: 'Quarter-Zip', icon: '🏃', rarity: 'common', off: 0.022,
    torso(pb, off) {
      const { main, trim, white, dark } = roles(pb);
      shell(main, 0.9, 1.26, off);
      shell(trim, 1.26, NECK, off + 0.003);
      dark.ring(0.9, bodyR(0.9) + off + 0.002, 0.013);
      dark.ring(1.262, bodyR(1.262) + off + 0.004, 0.006);
      trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.006, 0.014);
      trim.ring(NECK - 0.022, bodyR(NECK - 0.022) + off + 0.006, 0.012);
      white.seg([0, 1.42, front(1.42, off, 0.008)], [0, 1.27, front(1.27, off, 0.006)], 0.0042);
      white.e([0, 1.262, front(1.262, off, 0.01)], 0.007);
      white.ring(1.12, bodyR(1.12) + off + 0.003, 0.0075);
      white.ring(1.09, bodyR(1.09) + off + 0.003, 0.0042);
    },
    arm(pb, upper) {
      const m = pb.at('main');
      if (upper) {
        upperArm(m, 0.3, 0.055, 0.05);
        pb.at('white').seg([0.0, -0.02, 0.057], [0.0, -0.28, 0.05], 0.004);
      } else {
        foreArm(m, 0.25, 0.047, 0.041);
        pb.at('dark').ring(-0.24, 0.041, 0.013);
      }
    },
  },
  // 19 ── Cardigan: long open knit over a tee, buttons + pockets
  {
    name: 'Cardigan', icon: '🧶', rarity: 'uncommon', off: 0.032,
    torso(pb, off) {
      const { main, trim, white } = roles(pb);
      const tee = pb.at('cream', 'fabric');
      shell(tee, 0.88, NECK, 0.01);
      tee.ring(NECK + 0.003, bodyR(NECK) + 0.012, 0.009);
      shell(main, 0.8, 1.35, off);
      trim.ring(0.8, bodyR(0.8) + off + 0.002, 0.014);
      trim.ring(1.35, bodyR(1.35) + off + 0.002, 0.016);
      const v = new THREE.Shape();
      v.moveTo(-0.1, 0.07);
      v.lineTo(0.1, 0.07);
      v.lineTo(0, -0.2);
      decal(pb.at('cream', 'fabric'), new THREE.ShapeGeometry(v), 1.29, off, 0, 0.0012);
      trim.seg([-0.092, 1.355, front(1.355, off, 0.004) * 0.99], [0, 1.09, front(1.09, off, 0.004)], 0.0085);
      trim.seg([0.092, 1.355, front(1.355, off, 0.004) * 0.99], [0, 1.09, front(1.09, off, 0.004)], 0.0085);
      trim.seg([0, 1.09, front(1.09, off, 0.004)], [0, 0.82, front(0.82, off, 0.004)], 0.0085);
      for (const y of [1.04, 0.98, 0.92, 0.86]) white.e([0, y, front(y, off, 0.011)], 0.0085);
      for (const s of [-1, 1]) box(trim, 0.07, 0.065, 0.012, 0.01, [0.085 * s, 0.9, zAt(0.9, off, 0.085, 0.007)]);
    },
    arm(pb, upper) {
      if (upper) upperArm(pb.at('main'), 0.3, 0.062, 0.058);
      else {
        foreArm(pb.at('main'), 0.25, 0.054, 0.05);
        pb.at('trim').ring(-0.24, 0.05, 0.014);
      }
    },
  },
  // 20 ── Tank + tied flannel: white tank, plaid shirt knotted at the hip
  {
    name: 'Tank & Flannel', icon: '🍂', rarity: 'common', off: 0.012,
    torso(pb, off) {
      const tank = pb.at('white', 'fabric');
      const pl = pb.at('plaid');
      shell(tank, 0.9, 1.34, off);
      tank.ring(1.34, bodyR(1.34) + off + 0.002, 0.01);
      for (const s of [-1, 1]) overShoulder(tank, 0.14 * s, 1.32, 1.32, off, 0.017);
      // the flannel's body hangs behind the hip, its sleeves tie in front
      shell(pl, 0.96, 1.07, 0.038);
      pl.ring(0.96, bodyR(0.96) + 0.038, 0.01);
      pl.ring(1.07, bodyR(1.07) + 0.038, 0.01);
      const kz = zAt(1.01, 0.042, 0.095, 0.02);
      pl.e([0.095, 1.01, kz], [0.035, 0.03, 0.03]);
      pl.seg([0.1, 1.0, kz], [0.14, 0.82, kz - 0.01], 0.021);
      pl.seg([0.09, 1.0, kz], [0.07, 0.84, kz + 0.02], 0.019);
      for (const [dx, dy] of [[0.14, 0.81], [0.07, 0.83]]) pl.e([dx, dy, kz], [0.02, 0.012, 0.02]);
    },
    arm: (pb, upper) => upper && shoulderPad(pb, 'skin'),
  },
  // 21 ── Rain Jacket: glossy slicker, storm flap, toggles
  {
    name: 'Rain Jacket', icon: '🌧️', rarity: 'common', off: 0.042,
    torso(pb, off) {
      const g = pb.at('main', 'gloss'), t = pb.at('trim', 'gloss');
      const o = (y: number) => off + 0.02 * Math.max(0, (1.0 - y) / 0.12);
      shell(g, 0.88, NECK, o);
      t.ring(0.88, bodyR(0.88) + o(0.88) + 0.002, 0.012);
      g.add(torus(0.082, 0.03), { p: [0, 1.418, -0.006], r: [PI / 2, 0, 0], s: [1.05, 1, 1] });
      g.e([0, 1.4, -0.085], [0.09, 0.05, 0.06]);
      box(t, 0.04, 0.5, 0.012, 0.012, [0, 1.12, front(1.12, off, 0.01)]);
      for (const s of [-1, 1]) {
        box(t, 0.075, 0.05, 0.014, 0.01, [0.075 * s, 1.1, zAt(1.1, off, 0.075, 0.01)]);
        pb.at('white').seg([0.034 * s, 1.39, zAt(1.39, off, 0.034, 0.006)], [0.04 * s, 1.3, zAt(1.3, off, 0.04, 0.008)], 0.004);
      }
      for (const y of [1.3, 1.2, 1.1, 1.0]) pb.at('white').e([0, y, front(y, off, 0.018)], 0.008);
      pb.at('white', 'metal').ring(1.02, bodyR(1.02) + o(1.02) + 0.004, 0.0055);
    },
    arm(pb, upper) {
      const g = pb.at('main', 'gloss');
      if (upper) upperArm(g, 0.3, 0.068, 0.064);
      else {
        foreArm(g, 0.262, 0.062, 0.056);
        pb.at('trim', 'gloss').ring(-0.25, 0.049, 0.015);
      }
    },
  },
  // 22 ── Bomber: satin, rib trims, flight patch
  {
    name: 'Bomber', icon: '✈️', rarity: 'rare', off: 0.04,
    torso(pb, off) {
      const m = pb.at('main', 'satin'), t = pb.at('trim'), { white, gold } = roles(pb);
      shell(m, 0.95, NECK, off);
      t.ring(0.95, bodyR(0.95) + off + 0.003, 0.021);
      t.ring(NECK + 0.004, bodyR(NECK) + off + 0.004, 0.017);
      t.ring(NECK - 0.022, bodyR(NECK - 0.022) + off + 0.004, 0.014);
      white.seg([0, 1.4, front(1.4, off, 0.006)], [0, 0.96, front(0.96, off, 0.005)], 0.0038);
      for (const s of [-1, 1]) pb.at('dark').seg([0.07 * s, 1.08, zAt(1.08, off, 0.07, 0.004)], [0.09 * s, 1.0, zAt(1.0, off, 0.09, 0.004)], 0.0045);
      decal(pb.at('print'), CIRCLE(0.03), 1.25, off, 0.075);
      decal(gold, starGeo(0.022, 0.009), 1.25, off, 0.075, 0.0016);
      decal(pb.at('cyan'), RECT(0.07, 0.012), 1.2, off, -0.075, 0.001);
    },
    arm(pb, upper) {
      const m = pb.at('main', 'satin');
      if (upper) {
        upperArm(m, 0.3, 0.066, 0.06);
        pb.at('white').seg([0.07, -0.05, 0.0], [0.065, -0.2, 0.0], 0.004);
      } else {
        foreArm(m, 0.25, 0.057, 0.05);
        pb.at('trim').ring(-0.235, 0.046, 0.019);
      }
    },
  },
  // 23 ── Ruffle Blouse: puff sleeves, neck ruffle and a bow
  {
    name: 'Ruffle Blouse', icon: '🎀', rarity: 'uncommon', off: 0.016,
    torso(pb, off) {
      const { main, trim } = roles(pb);
      shell(main, 0.9, NECK, off);
      trim.ring(0.9, bodyR(0.9) + off + 0.002, 0.007);
      blobRing(trim, NECK - 0.012, bodyR(NECK - 0.012) + off + 0.012, 14, [0.028, 0.016, 0.028]);
      blobRing(trim, NECK - 0.032, bodyR(NECK - 0.032) + off + 0.014, 16, [0.03, 0.016, 0.03]);
      const bz = front(1.36, off, 0.022);
      trim.e([-0.026, 1.36, bz], [0.028, 0.02, 0.014], [0, 0, 0.35]);
      trim.e([0.026, 1.36, bz], [0.028, 0.02, 0.014], [0, 0, -0.35]);
      trim.e([0, 1.36, bz + 0.004], [0.012, 0.012, 0.01]);
      for (const y of [1.28, 1.2, 1.12]) pb.at('white').e([0, y, front(y, off, 0.008)], 0.0075);
    },
    arm(pb, upper) {
      const { main, trim } = roles(pb);
      if (upper) {
        main.e([0, -0.05, 0], [0.088, 0.115, 0.088]);
        tube(main, -0.14, -0.3, 0.05, 0.046);
        trim.ring(-0.165, 0.052, 0.008);
      } else {
        foreArm(main, 0.2, 0.045, 0.04);
        blobRing(trim, -0.2, 0.052, 10, [0.026, 0.02, 0.026]);
        tube(main, -0.2, -0.235, 0.04, 0.05);
      }
    },
  },
  // 24 ── Chunky Turtleneck: cable-knit ribs, tall roll neck
  {
    name: 'Turtleneck', icon: '☕', rarity: 'common', off: 0.026,
    torso(pb, off) {
      const { main, trim } = roles(pb);
      ribbedShell(main, 0.88, 1.36, off, 14, 0.0045);
      trim.ring(0.88, bodyR(0.88) + off + 0.002, 0.016);
      shell(main, 1.36, 1.428, off);
      lathe(main, [[bodyR(1.428) + off, 1.428], [0.076, 1.436], [0.07, 1.462]], 18);
      main.add(torus(0.071, 0.013), { p: [0, 1.462, 0], r: [PI / 2, 0, 0] });
      trim.add(torus(0.075, 0.009), { p: [0, 1.42, 0], r: [PI / 2, 0, 0] });
    },
    arm(pb, upper) {
      const m = pb.at('main');
      if (upper) {
        ribbedTube(m, 0.0, -0.3, 0.058, 0.054);
        m.e([0, -0.006, 0], [0.056, 0.052, 0.056]);
      } else {
        ribbedTube(m, 0.03, -0.25, 0.05, 0.046);
        pb.at('trim').ring(-0.24, 0.044, 0.014);
      }
    },
  },
  // 25 ── Puffer Vest: quilted vest over a long-sleeve tee
  {
    name: 'Puffer Vest', icon: '☁️', rarity: 'uncommon', off: 0.036,
    torso(pb, off) {
      const { main, trim } = roles(pb);
      const tee = pb.at('cream', 'fabric');
      shell(tee, 0.9, NECK, 0.008);
      tee.ring(NECK + 0.003, bodyR(NECK) + 0.01, 0.009);
      puffTube(main, 0.93, 1.36, 5, 0.024, (y) => bodyR(y) + off - 0.012, 18, 4);
      trim.ring(0.93, bodyR(0.93) + off + 0.004, 0.011);
      trim.add(torus(0.078, 0.026), { p: [0, 1.428, -0.004], r: [PI / 2, 0, 0] });
      pb.at('white').seg([0, 1.38, front(1.38, off, 0.016)], [0, 0.95, front(0.95, off, 0.016)], 0.0034);
    },
    arm(pb, upper) {
      const c = pb.at('cream', 'fabric');
      if (upper) upperArm(c, 0.3, 0.05, 0.046);
      else {
        foreArm(c, 0.25, 0.043, 0.038);
        c.ring(-0.24, 0.04, 0.01);
      }
    },
  },
  // 26 ── Halter Crop: tie-neck halter, gold ring, bare shoulders
  {
    name: 'Halter Crop', icon: '🌺', rarity: 'rare', off: 0.012,
    torso(pb, off) {
      const { main, trim, gold } = roles(pb);
      shell(main, 1.1, 1.32, off);
      trim.ring(1.1, bodyR(1.1) + off + 0.002, 0.009);
      trim.ring(1.32, bodyR(1.32) + off + 0.002, 0.009);
      for (const s of [-1, 1]) {
        const pts = [
          new THREE.Vector3(0.062 * s, 1.3, zAt(1.3, off, 0.062, 0.008)),
          new THREE.Vector3(0.062 * s, 1.37, zAt(1.37, off, 0.062, 0.012)),
          new THREE.Vector3(0.056 * s, 1.418, zAt(1.418, 0.01, 0.056, 0.008)),
          new THREE.Vector3(0.046 * s, 1.44, 0.04),
          new THREE.Vector3(0.022 * s, 1.445, -0.052),
        ];
        trim.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0085, 5, false), {}, true);
      }
      trim.e([0, 1.445, -0.06], [0.024, 0.018, 0.014]);
      trim.seg([0, 1.44, -0.06], [-0.022, 1.33, -0.098], 0.0065);
      trim.seg([0, 1.44, -0.06], [0.022, 1.33, -0.098], 0.0065);
      gold.add(torus(0.016, 0.004), { p: [0, 1.285, front(1.285, off, 0.01)] });
    },
    arm: (pb, upper) => upper && shoulderPad(pb, 'skin'),
  },
  // 27 ── Hoops Jersey: sleeveless basketball tank, big "10"
  {
    name: 'Hoops Jersey', icon: '🏀', rarity: 'common', off: 0.03,
    torso(pb, off) {
      const { main, white } = roles(pb);
      shell(main, 0.9, 1.4, off);
      white.ring(0.9, bodyR(0.9) + off + 0.002, 0.01);
      white.ring(1.4, bodyR(1.4) + off + 0.003, 0.0095);
      for (const s of [-1, 1]) white.seg([0.138 * s, 1.34, 0.0], [0.152 * s, 1.0, 0.0], 0.0075);
      const pr = pb.at('print');
      decal(pr, RECT(0.016, 0.1), 1.18, off, -0.035);
      const ring = new THREE.RingGeometry(0.02, 0.036, 16);
      ring.scale(0.8, 1.4, 1);
      decal(pr, ring, 1.18, off, 0.02);
      decal(pr, RECT(0.016, 0.1), 1.17, off, -0.032, 0, true);
      const r2 = new THREE.RingGeometry(0.02, 0.036, 16);
      r2.scale(0.8, 1.4, 1);
      decal(pr, r2, 1.17, off, -0.022, 0, true);
    },
    arm: (pb, upper) => upper && shoulderPad(pb, 'main', 0.056),
  },
  // 28 ── Teddy Jacket: fluffy sherpa fleece
  {
    name: 'Teddy Jacket', icon: '🧸', rarity: 'rare', off: 0.056,
    torso(pb, off) {
      const { main, trim, white } = roles(pb);
      fluffLathe(main, 0.9, 1.38, (y) => bodyR(y) + off - 0.014, 0.024, 3, 20, 36);
      fluffLathe(trim, 1.37, 1.455, (y) => Math.max(0.07, bodyR(y) + off - 0.005 - (y - 1.37) * 0.8), 0.012, 7, 3, 26);
      trim.add(torus(0.094, 0.026), { p: [0, 1.42, -0.004], r: [PI / 2, 0, 0], s: [1, 1, 1] });
      blobRing(trim, 0.9, bodyR(0.9) + off, 20, [0.026, 0.02, 0.026]);
      white.seg([0, 1.38, front(1.38, off, 0.012)], [0, 0.93, front(0.93, off, 0.012)], 0.0036);
    },
    arm(pb, upper) {
      const { main, trim } = roles(pb);
      if (upper) {
        fluffLathe(main, -0.3, 0.0, () => 0.066, 0.012, 11, 6, 14);
        main.e([0, -0.006, 0], [0.066, 0.06, 0.066]);
      } else {
        fluffLathe(main, -0.26, 0.03, () => 0.058, 0.01, 5, 6, 14);
        blobRing(trim, -0.255, 0.056, 9, [0.022, 0.018, 0.022]);
      }
    },
  },
  // 29 ── Tropical Shirt: camp collar, palm leaves + hibiscus
  {
    name: 'Tropical Shirt', icon: '🌴', rarity: 'uncommon', off: 0.024,
    torso(pb, off) {
      const { main, trim, gold } = roles(pb);
      shell(main, 0.88, NECK, off);
      trim.ring(0.88, bodyR(0.88) + off + 0.002, 0.007);
      for (const s of [-1, 1]) box(trim, 0.075, 0.036, 0.012, 0.01, [0.048 * s, 1.403, zAt(1.403, off, 0.048, 0.011)], [0.5, 0, 0.55 * s]);
      pb.at('dark').seg([0, 1.36, front(1.36, off, 0.003)], [0, 0.9, front(0.9, off, 0.003)], 0.0035);
      const leaf = pb.at('leaf');
      const L = leafGeo(0.085, 0.022);
      [[1.28, 0.07, 0.6], [1.12, -0.075, -0.5], [0.98, 0.06, 0.9], [1.22, -0.06, -0.9], [1.05, -0.03, 0.1]].forEach(([y, dx, r], i) => {
        decal(leaf, L, y, off, dx, 0.001 * i, false, r);
        decal(leaf, L, y, off, dx * 0.8, 0.001 * i, true, -r);
      });
      const pink = pb.at('pink');
      for (const [y, dx] of [[1.2, 0.04], [1.06, -0.02], [1.17, -0.09], [0.96, 0.1]]) {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * 6.283;
          decal(pink, CIRCLE(0.014, 8), y + Math.sin(a) * 0.019, off, dx + Math.cos(a) * 0.019, 0.003);
        }
        decal(gold, CIRCLE(0.008, 8), y, off, dx, 0.0045);
      }
    },
    arm(pb, upper) {
      if (!upper) return;
      upperArm(pb.at('main'), 0.13, 0.06, 0.066);
      pb.at('trim').ring(-0.128, 0.067, 0.007);
    },
  },
  // 30 ── Neon Tech Jacket: dark shell with glowing LED seams
  {
    name: 'Neon Jacket', icon: '💡', rarity: 'epic', off: 0.034,
    torso(pb, off) {
      const { main, trim } = roles(pb);
      const led = pb.at('led');
      shell(main, 0.9, NECK, off);
      trim.ring(0.9, bodyR(0.9) + off + 0.002, 0.014);
      trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.005, 0.015);
      led.seg([0, 1.4, front(1.4, off, 0.008)], [0, 0.92, front(0.92, off, 0.006)], 0.0032);
      led.ring(0.905, bodyR(0.905) + off + 0.006, 0.0042);
      led.ring(1.3, bodyR(1.3) + off + 0.005, 0.0036);
      for (const s of [-1, 1]) {
        led.seg([0.06 * s, 1.37, zAt(1.37, off, 0.06, 0.007)], [0.11 * s, 1.1, zAt(1.1, off, 0.11, 0.007)], 0.0032);
        led.seg([0.11 * s, 1.1, zAt(1.1, off, 0.11, 0.007)], [0.075 * s, 0.94, zAt(0.94, off, 0.075, 0.007)], 0.0032);
      }
      decal(led, ELLIPSE(0.016, 0.016, 10), 1.2, off, 0.07, 0.003);
    },
    arm(pb, upper) {
      const m = pb.at('main');
      const led = pb.at('led');
      if (upper) {
        upperArm(m, 0.3, 0.057, 0.053);
        led.ring(-0.1, 0.0555, 0.0038);
        led.ring(-0.19, 0.0545, 0.0038);
      } else {
        foreArm(m, 0.25, 0.049, 0.044);
        led.ring(-0.1, 0.047, 0.0038);
        pb.at('trim').ring(-0.24, 0.043, 0.013);
      }
    },
  },
];


void flare;
void heartGeo;

import { SUIT_TOPS } from './wardrobeSuits';
TOP_V3.push(...SUIT_TOPS); // full-body suit tops (wardrobeSuits.ts)
