// v3 wardrobe: the pieces of the full-body suits (astronaut, unicorn / dino / panda onesies, racer, chef,
// mermaid, hero, snow explorer). A suit is a matching top + bottom + shoes + head gear: every piece is a
// normal wardrobe part (so kids can mix them) and wardrobeCatalog.ts bundles them into WARDROBE_SUITS.
// Appended to TOP_V3 / BOTTOM_V3 / ACC_V3 by their files, so the style indices keep growing at the end.
import * as THREE from 'three';
import { B, GB, TAU, TY, bodyR, pieces, shell, spike, torus, type PB, type Piece } from './characterKit';
import type { TopDef } from './wardrobeTops';
import type { BottomDef } from './wardrobeBottoms';
import type { AccDef } from './wardrobeAcc';
import type { AccPart } from './characterParts';
import {
  HIP_TOP, NECK, PI, blobRing, box, checkTube, CIRCLE, crotch, decal, ELLIPSE, foreArm, front, heartGeo, legJoint, legTube, RECT, roles, scaleLathe, starGeo, upperArm, wrapHead, zAt,
} from './wardrobeKit';

const L = B.thighLen;
const SL = B.shinLen;
const U = (y: number) => y - TY;
const EMPTY: Piece[] = [];
const accBase = (over: Partial<AccPart>): AccPart => ({ head: EMPTY, body: EMPTY, handR: EMPTY, wristL: EMPTY, back: EMPTY, hat: false, fixed: false, topLift: 0, ...over });
const Y = new THREE.Vector3(0, 1, 0);
const qTo = (x: number, y: number, z: number): THREE.Quaternion => new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(x, y, z).normalize());
type G = GB;
const hood = (main: G, off: number): void => {
  main.add(torus(0.082 + off * 0.2, 0.03), { p: [0, 1.418, -0.006], r: [PI / 2, 0, 0], s: [1.05, 1, 1] });
  main.e([0, 1.4, -0.088], [0.1, 0.048, 0.06]);
};
const zip = (pb: ReturnType<typeof roles>, off: number, y0: number, y1: number): void => {
  pb.white.seg([0, y0, front(y0, off, 0.006)], [0, y1, front(y1, off, 0.006)], 0.0042);
  pb.gold.e([0, y0 - 0.012, front(y0 - 0.012, off, 0.012)], [0.007, 0.012, 0.005]);
};
/** Baggy sleeve with an optional cuff role. */
const baggy = (pb: PB, upper: boolean, r: number, role: 'main' | 'ink' | 'cream' = 'main', fluff = false): void => {
  const g = pb.at(role);
  if (upper) upperArm(g, 0.3, r + 0.006, r);
  else {
    foreArm(g, 0.262, r, r - 0.005);
    if (fluff) blobRing(pb.at('white', 'fabric'), -0.25, r - 0.002, 9, [0.022, 0.02, 0.022]);
    else pb.at('trim').ring(-0.25, r - 0.007, 0.015);
  }
};
const baggyLeg = (pb: PB, thigh: boolean, r: number, role: 'main' | 'ink' = 'main', cuff: 'fluff' | 'ring' | 'none' = 'fluff'): void => {
  const g = pb.at(role);
  if (thigh) legTube(g, true, 0.04, -L - 0.01, r, r - 0.004);
  else {
    legTube(g, false, 0.02, -SL + 0.03, r - 0.004, r - 0.008);
    if (cuff === 'fluff') blobRing(pb.at('white', 'fabric'), -SL + 0.03, r - 0.006, 10, [0.026, 0.022, 0.026]);
    else if (cuff === 'ring') pb.at('trim').ring(-SL + 0.03, r - 0.007, 0.013);
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// Tops
// ═════════════════════════════════════════════════════════════════════════════
export const SUIT_TOPS: TopDef[] = [
  // Astro Suit
  {
    name: 'Astro Suit', icon: '🧑‍🚀', rarity: 'epic', off: 0.042, suit: 'astro',
    torso(pb, off) {
      const R = roles(pb);
      const metal = pb.at('trim', 'metal');
      shell(R.main, 0.88, NECK, off);
      metal.ring(0.88, bodyR(0.88) + off + 0.003, 0.014);
      metal.add(torus(bodyR(1.42) + off + 0.014, 0.02), { p: [0, 1.418, -0.004], r: [PI / 2, 0, 0] });
      box(R.dark, 0.12, 0.08, 0.03, 0.012, [0, 1.16, front(1.16, off, 0.014)]);
      [['pink', -0.036], ['cyan', -0.012], ['gold', 0.012], ['white', 0.036]].forEach(([role, x]) => pb.at(role as 'pink').e([x as number, 1.172, front(1.172, off, 0.034)], 0.0085));
      for (const x of [-0.03, 0, 0.03]) pb.at('white').seg([x - 0.012, 1.14, front(1.14, off, 0.03)], [x + 0.012, 1.14, front(1.14, off, 0.03)], 0.004);
      for (const s of [-1, 1]) R.dark.seg([0.07 * s, 1.14, zAt(1.14, off, 0.07, 0.01)], [0.12 * s, 0.94, zAt(0.94, off, 0.12, 0.012)], 0.009);
      decal(pb.at('cyan'), CIRCLE(0.03), 1.3, off, 0.08);
      decal(R.white, starGeo(0.022, 0.009), 1.3, off, 0.08, 0.0016);
      decal(pb.at('pink'), RECT(0.07, 0.014), 1.3, off, -0.08);
    },
    arm(pb, upper, s) {
      const m = pb.at('main');
      const metal = pb.at('trim', 'metal');
      if (upper) {
        upperArm(m, 0.3, 0.066, 0.062);
        metal.ring(-0.012, 0.067, 0.011);
        box(pb.at('cyan'), 0.01, 0.05, 0.05, 0.004, [s * 0.066, -0.1, 0], [0, 0, 0]);
        box(pb.at('pink'), 0.011, 0.02, 0.05, 0.004, [s * 0.066, -0.14, 0]);
      } else {
        foreArm(m, 0.262, 0.059, 0.055);
        metal.ring(-0.245, 0.058, 0.02);
        pb.at('dark').ring(-0.262, 0.057, 0.012);
      }
    },
  },
  // Unicorn Onesie
  {
    name: 'Unicorn Onesie', icon: '🦄', rarity: 'legendary', off: 0.048, suit: 'unicorn',
    torso(pb, off) {
      const R = roles(pb);
      shell(R.main, 0.82, NECK, off);
      hood(R.main, off);
      zip(R, off, 1.4, 0.86);
      ['pink', 'cyan', 'gold', 'white', 'pink', 'cyan', 'gold', 'white'].forEach((role, i) => {
        const y = 1.37 - i * 0.065;
        pb.at(role as 'pink').e([0, y, -(bodyR(y) + off) - 0.01], [0.032, 0.036, 0.03]);
      });
      decal(pb.at('pink'), heartGeo(0.03), 1.2, off, 0.0, 0);
      decal(pb.at('white'), starGeo(0.016, 0.007), 1.2, off, 0.0, 0.0016);
    },
    arm: (pb, upper) => baggy(pb, upper, 0.064, 'main', true),
  },
  // Dino Suit
  {
    name: 'Dino Suit', icon: '🦖', rarity: 'epic', off: 0.048, suit: 'dino',
    torso(pb, off) {
      const R = roles(pb);
      shell(R.main, 0.82, NECK, off);
      hood(R.main, off);
      zip(R, off, 1.4, 0.86);
      for (let i = 0; i < 7; i++) {
        const y = 1.34 - i * 0.07;
        R.trim.spk([0, y, -(bodyR(y) + off) - 0.006], [0, 0.55, -1], 0.07 - i * 0.004, 0.026);
      }
      decal(pb.at('cream'), ELLIPSE(0.072, 0.17), 1.12, off, 0, 0.0006);
      for (const y of [1.2, 1.12, 1.04, 0.96]) pb.at('cream').seg([-0.06, y, front(y, off, 0.004) * 0.98], [0.06, y, front(y, off, 0.004) * 0.98], 0.0035);
    },
    arm: (pb, upper) => baggy(pb, upper, 0.064, 'main', false),
  },
  // Racer Suit
  {
    name: 'Racer Suit', icon: '🏎️', rarity: 'rare', off: 0.03, suit: 'racer',
    torso(pb, off) {
      const R = roles(pb);
      shell(R.main, 0.84, 1.22, off);
      shell(R.dark, 1.22, NECK, off + 0.003);
      R.dark.ring(0.97, bodyR(0.97) + off + 0.004, 0.011);
      R.gold.e([0, 0.97, front(0.97, off, 0.012)], [0.02, 0.012, 0.007]);
      R.white.ring(1.222, bodyR(1.222) + off + 0.004, 0.0105);
      R.white.ring(1.195, bodyR(1.195) + off + 0.003, 0.005);
      R.trim.ring(NECK + 0.003, bodyR(NECK) + off + 0.006, 0.013);
      R.trim.ring(NECK - 0.02, bodyR(NECK - 0.02) + off + 0.006, 0.011);
      R.white.seg([0, 1.4, front(1.4, off, 0.006)], [0, 0.98, front(0.98, off, 0.004)], 0.0036);
      decal(R.white, CIRCLE(0.03), 1.13, off, 0.07, 0.001);
      decal(pb.at('pink'), starGeo(0.022, 0.01), 1.13, off, 0.07, 0.0025);
      decal(pb.at('cyan'), RECT(0.07, 0.016), 1.1, off, -0.075, 0.001);
      decal(R.gold, RECT(0.05, 0.01), 1.07, off, -0.075, 0.001);
      decal(R.white, CIRCLE(0.06), 1.12, off, 0, 0, true);
      decal(R.dark, RECT(0.014, 0.07), 1.12, off, 0, 0.001, true);
    },
    arm(pb, upper) {
      if (upper) {
        upperArm(pb.at('main'), 0.3, 0.057, 0.053);
        pb.at('white').ring(-0.1, 0.0555, 0.0065);
        pb.at('white').ring(-0.125, 0.0545, 0.0035);
      } else {
        foreArm(pb.at('main'), 0.25, 0.049, 0.044);
        pb.at('dark').ring(-0.18, 0.0465, 0.014);
        pb.at('trim').ring(-0.24, 0.043, 0.013);
      }
    },
  },
  // Chef Coat
  {
    name: 'Chef Coat', icon: '🧑‍🍳', rarity: 'uncommon', off: 0.04, suit: 'chef',
    torso(pb, off) {
      const R = roles(pb);
      shell(R.main, 0.84, NECK, off);
      R.trim.ring(0.84, bodyR(0.84) + off + 0.002, 0.009);
      R.trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.005, 0.014);
      R.trim.seg([-0.05, 1.38, front(1.38, off, 0.008) * 0.99], [0.07, 0.9, front(0.9, off, 0.006)], 0.0075);
      for (const y of [1.28, 1.18, 1.08, 0.98]) {
        pb.at('dark').e([-0.032, y, front(y, off, 0.014)], 0.0095);
        pb.at('dark').e([0.032, y, front(y, off, 0.014)], 0.0095);
      }
      pb.at('pink').e([0, 1.4, front(1.4, off, 0.02)], [0.04, 0.022, 0.02]);
      pb.at('pink').e([0, 1.36, front(1.36, off, 0.022)], [0.014, 0.03, 0.012]);
      box(R.trim, 0.06, 0.05, 0.012, 0.008, [0.082, 1.14, zAt(1.14, off, 0.082, 0.008)]);
    },
    arm(pb, upper) {
      const m = pb.at('main');
      if (upper) upperArm(m, 0.3, 0.062, 0.058);
      else {
        foreArm(m, 0.25, 0.054, 0.05);
        pb.at('trim').ring(-0.2, 0.056, 0.022);
        pb.at('trim').ring(-0.235, 0.052, 0.01);
      }
    },
  },
  // Scale Top (mermaid)
  {
    name: 'Scale Top', icon: '🧜‍♀️', rarity: 'epic', off: 0.016, suit: 'mermaid',
    torso(pb, off) {
      const m = pb.at('main', 'metal'), t = pb.at('trim', 'metal'), pink = pb.at('pink', 'metal');
      shell(m, 0.88, NECK, off - 0.004);
      t.ring(0.88, bodyR(0.88) + off + 0.003, 0.011);
      t.ring(NECK + 0.003, bodyR(NECK) + off + 0.004, 0.009);
      scaleLathe(m, (y) => bodyR(y) + off + 0.002, 0.92, 1.38, 14, 0.04, 0.007);
      pink.ring(1.2, bodyR(1.2) + off + 0.012, 0.0045);
    },
    arm(pb, upper) {
      const m = pb.at('main', 'metal');
      if (upper) {
        upperArm(m, 0.3, 0.054, 0.05);
        scaleLathe(m, () => 0.054, -0.3, -0.03, 8, 0.036, 0.004);
      } else {
        foreArm(m, 0.25, 0.047, 0.042);
        scaleLathe(m, () => 0.047, -0.22, 0.02, 8, 0.036, 0.004);
        pb.at('pink', 'metal').ring(-0.24, 0.042, 0.011);
      }
    },
  },
  // Hero Suit
  {
    name: 'Hero Suit', icon: '🦸', rarity: 'legendary', off: 0.02, suit: 'hero',
    torso(pb, off) {
      const R = roles(pb);
      shell(R.main, 0.86, NECK, off);
      R.trim.ring(NECK + 0.003, bodyR(NECK) + off + 0.004, 0.011);
      R.gold.ring(0.97, bodyR(0.97) + off + 0.005, 0.0105);
      R.gold.e([0, 0.97, front(0.97, off, 0.014)], [0.026, 0.016, 0.008]);
      // emblem: gold shield with a white star
      decal(R.gold, CIRCLE(0.062, 20), 1.19, off, 0, 0.0004);
      decal(R.dark, CIRCLE(0.05, 20), 1.19, off, 0, 0.0016);
      decal(R.white, starGeo(0.042, 0.018), 1.19, off, 0, 0.003);
    },
    arm(pb, upper) {
      const m = pb.at('main');
      if (upper) upperArm(m, 0.3, 0.054, 0.05);
      else {
        foreArm(m, 0.25, 0.047, 0.042);
        pb.at('trim').add(new THREE.CylinderGeometry(0.052, 0.046, 0.1, 12, 1, true), { p: [0, -0.17, 0] });
        pb.at('gold').ring(-0.12, 0.0525, 0.007);
        pb.at('gold').ring(-0.22, 0.0475, 0.007);
      }
    },
  },
  // Explorer Parka
  {
    name: 'Explorer Parka', icon: '🧭', rarity: 'rare', off: 0.058, suit: 'snow',
    torso(pb, off) {
      const R = roles(pb);
      const o = (_y: number) => off;
      shell(R.main, 0.96, 1.2, o);
      shell(R.trim, 1.2, NECK, off + 0.003);
      R.dark.ring(0.96, bodyR(0.96) + o(0.96) + 0.003, 0.017);
      R.dark.ring(1.04, bodyR(1.04) + o(1.04) + 0.004, 0.008);
      blobRing(pb.at('white', 'fabric'), 1.4, 0.115, 16, [0.034, 0.03, 0.034], 0, 0.9);
      blobRing(pb.at('white', 'fabric'), 1.42, 0.09, 14, [0.03, 0.028, 0.03], 0, 0.9);
      R.white.seg([0, 1.38, front(1.38, off, 0.012)], [0, 0.97, front(0.97, off, 0.01)], 0.004);
      for (const y of [1.3, 1.2, 1.1]) R.gold.e([0, y, front(y, off, 0.02)], 0.009);
      for (const s of [-1, 1]) box(R.trim, 0.08, 0.07, 0.016, 0.01, [0.085 * s, 1.08, zAt(1.08, off, 0.085, 0.01)]);
      decal(pb.at('cyan'), CIRCLE(0.028), 1.27, off, 0.085);
      decal(pb.at('white'), starGeo(0.02, 0.008), 1.27, off, 0.085, 0.0016);
    },
    arm(pb, upper) {
      const m = pb.at('main');
      if (upper) {
        upperArm(m, 0.3, 0.07, 0.066);
        pb.at('cyan').ring(-0.13, 0.068, 0.007);
      } else {
        foreArm(m, 0.26, 0.064, 0.058);
        blobRing(pb.at('white', 'fabric'), -0.255, 0.058, 9, [0.024, 0.02, 0.024]);
      }
    },
  },
  // Panda Onesie
  {
    name: 'Panda Onesie', icon: '🐼', rarity: 'epic', off: 0.048, suit: 'panda',
    torso(pb, off) {
      const R = roles(pb);
      shell(R.main, 0.82, NECK, off);
      hood(R.main, off);
      zip(R, off, 1.4, 0.86);
      decal(pb.at('ink'), ELLIPSE(0.06, 0.05), 1.22, off, 0, 0.0008);
      decal(pb.at('white'), starGeo(0.026, 0.011), 1.22, off, 0, 0.002);
      // black shoulders (the arms are black too)
      shell(pb.at('ink'), 1.28, 1.38, off + 0.004);
    },
    arm(pb, upper) {
      baggy(pb, upper, 0.064, 'ink', true);
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// Bottoms
// ═════════════════════════════════════════════════════════════════════════════
const suitHips = (pb: PB, off: number, k = 1.1): void => {
  crotch(pb.at('main'), k);
  shell(pb.at('main'), 0.78, HIP_TOP, off);
};
export const SUIT_BOTTOMS: BottomDef[] = [
  // Astro Legs
  {
    name: 'Astro Legs', icon: '🚀', rarity: 'epic', suit: 'astro',
    torso(pb) {
      suitHips(pb, 0.03);
      const metal = pb.at('trim', 'metal');
      metal.ring(HIP_TOP - 0.012, bodyR(HIP_TOP) + 0.036, 0.014);
      pb.at('dark').ring(0.95, bodyR(0.95) + 0.034, 0.008);
    },
    leg(pb, thigh, s) {
      const m = pb.at('main'), metal = pb.at('trim', 'metal');
      if (thigh) {
        legTube(m, true, 0.04, -L - 0.01, 0.102, 0.098);
        box(pb.at('trim'), 0.05, 0.08, 0.016, 0.01, [s * 0.088, -0.18, 0.045], [0, 0.4 * s, 0]);
        metal.ring(-L + 0.01, 0.1, 0.012);
        pb.at('cyan').seg([s * 0.102, -0.02, 0], [s * 0.098, -0.3, 0], 0.0045);
      } else {
        legTube(m, false, 0.02, -SL + 0.03, 0.098, 0.088);
        pb.at('dark').e([0, -0.03, 0.088], [0.05, 0.07, 0.024]);
        metal.ring(-SL + 0.035, 0.09, 0.013);
      }
    },
  },
  // Unicorn Legs
  {
    name: 'Unicorn Legs', icon: '🌈', rarity: 'legendary', suit: 'unicorn',
    torso(pb) {
      suitHips(pb, 0.036);
      [['pink', 0.98, -0.17, 0.052], ['cyan', 1.02, -0.23, 0.056], ['white', 1.08, -0.265, 0.05], ['pink', 1.14, -0.27, 0.042], ['gold', 1.19, -0.255, 0.03]].forEach(([role, y, z, r]) => {
        pb.at(role as 'pink').e([0, y as number, z as number], r as number);
      });
    },
    leg: (pb, thigh) => baggyLeg(pb, thigh, 0.106, 'main', 'fluff'),
  },
  // Dino Legs
  {
    name: 'Dino Legs', icon: '🦕', rarity: 'epic', suit: 'dino',
    torso(pb) {
      suitHips(pb, 0.036);
      const { main, trim } = roles(pb);
      [[0.98, -0.16, 0.075], [0.93, -0.28, 0.066], [0.88, -0.4, 0.054], [0.83, -0.5, 0.042], [0.79, -0.58, 0.03]].forEach(([y, z, r]) => main.e([0, y, z], r));
      [[0.98, -0.16], [0.93, -0.28], [0.88, -0.4], [0.83, -0.5]].forEach(([y, z], i) => trim.spk([0, y + 0.058 - i * 0.012, z], [0, 1, -0.2], 0.05 - i * 0.008, 0.022));
    },
    leg: (pb, thigh) => baggyLeg(pb, thigh, 0.106, 'main', 'ring'),
  },
  // Racer Pants
  {
    name: 'Racer Pants', icon: '🏁', rarity: 'rare', suit: 'racer',
    torso(pb) {
      crotch(pb.at('main'));
      shell(pb.at('main'), 0.78, HIP_TOP, 0.026);
      pb.at('dark').ring(HIP_TOP - 0.01, bodyR(HIP_TOP) + 0.03, 0.012);
    },
    leg(pb, thigh, s) {
      const m = pb.at('main');
      if (thigh) {
        legTube(m, true, 0.04, -L - 0.01, 0.09, 0.086);
        pb.at('white').seg([s * 0.092, -0.02, 0], [s * 0.088, -L, 0], 0.0058);
        pb.at('dark').seg([s * 0.1, -0.02, 0], [s * 0.096, -L, 0], 0.004);
      } else {
        legTube(m, false, 0.02, -SL + 0.03, 0.086, 0.08);
        pb.at('white').seg([s * 0.087, 0.02, 0], [s * 0.081, -SL + 0.04, 0], 0.0058);
        pb.at('dark').e([0, -0.03, 0.082], [0.04, 0.06, 0.016]);
        pb.at('trim').ring(-SL + 0.03, 0.081, 0.012);
      }
    },
  },
  // Chef Pants
  {
    name: 'Chef Pants', icon: '🍳', rarity: 'uncommon', suit: 'chef',
    torso(pb) {
      crotch(pb.at('main'));
      shell(pb.at('main'), 0.78, HIP_TOP, 0.024);
      pb.at('trim').ring(HIP_TOP - 0.01, bodyR(HIP_TOP) + 0.03, 0.013);
    },
    leg(pb, thigh) {
      const m = pb.at('main'), ink = pb.at('ink'); // crisp black checks on any pants color
      if (thigh) {
        legTube(m, true, 0.04, -L - 0.01, 0.098, 0.094);
        // the thigh tube narrows toward the hip; follow it so the checks sit on the cloth
        const rT = (y: number): number => (y > -0.12 ? 0.09 + (0.098 - 0.09) * ((0.04 - y) / 0.16) : 0.098 - 0.004 * ((-0.12 - y) / (L - 0.11)));
        checkTube(ink, -0.06, -L - 0.005, rT, 28, 0.02, 0.0015);
      } else {
        legTube(m, false, 0.02, -SL + 0.03, 0.094, 0.09);
        checkTube(ink, -0.03, -SL + 0.035, (y) => 0.094 - 0.004 * ((0.02 - y) / (SL - 0.01)), 28, 0.02, 0.0015, 1);
        pb.at('trim').ring(-SL + 0.03, 0.09, 0.012);
      }
    },
  },
  // Scale Leggings (mermaid)
  {
    name: 'Scale Leggings', icon: '🐚', rarity: 'epic', suit: 'mermaid',
    torso(pb) {
      const m = pb.at('main', 'metal');
      crotch(m, 0.98);
      shell(m, 0.8, HIP_TOP, 0.01);
      pb.at('pink', 'metal').ring(HIP_TOP - 0.01, bodyR(HIP_TOP) + 0.014, 0.014);
    },
    leg(pb, thigh) {
      const m = pb.at('main', 'metal'), t = pb.at('trim', 'metal');
      if (thigh) {
        legTube(m, true, 0.04, -L - 0.01, 0.082, 0.068);
        scaleLathe(m, (y) => 0.082 - ((0.04 - y) / 0.45) * 0.014, -L - 0.01, 0.02, 9, 0.036, 0.004);
      } else {
        legTube(m, false, 0.02, -SL + 0.02, 0.066, 0.048);
        scaleLathe(m, (y) => 0.066 - ((0.02 - y) / 0.43) * 0.018, -SL + 0.04, 0.02, 8, 0.036, 0.004);
        for (const k of [-1, 0, 1]) t.e([k * 0.034, -SL + 0.04, 0.0], [0.016, 0.07, 0.01], [0, 0, k * 0.3]);
        pb.at('pink', 'metal').ring(-SL + 0.03, 0.052, 0.01);
      }
    },
  },
  // Hero Tights
  {
    name: 'Hero Tights', icon: '💥', rarity: 'legendary', suit: 'hero',
    torso(pb) {
      const R = roles(pb);
      crotch(R.main, 0.97);
      shell(R.main, 0.78, HIP_TOP, 0.012);
      shell(R.dark, 0.8, 0.99, 0.028); // trunks: a deeper shade of the suit color
      R.gold.ring(0.99, bodyR(0.99) + 0.032, 0.01);
    },
    leg(pb, thigh) {
      const m = pb.at('main');
      if (thigh) {
        legTube(m, true, 0.04, -L - 0.01, 0.082, 0.07);
        legTube(pb.at('dark'), true, 0.04, -0.11, 0.094, 0.09); // trunk legs
        pb.at('gold').ring(-0.11, 0.091, 0.006);
      } else {
        legTube(m, false, 0.02, -SL + 0.02, 0.068, 0.05);
        pb.at('gold').ring(-0.02, 0.07, 0.007);
      }
    },
  },
  // Panda Legs
  {
    name: 'Panda Legs', icon: '🎋', rarity: 'epic', suit: 'panda',
    torso(pb) {
      suitHips(pb, 0.036);
      pb.at('white', 'fabric').e([0, 0.98, -0.18], 0.055);
    },
    leg: (pb, thigh) => baggyLeg(pb, thigh, 0.106, 'ink', 'fluff'),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// Head gear (and the cape)
// ═════════════════════════════════════════════════════════════════════════════
/** Hood / helmet dome: partial sphere with a face opening (half-angle in radians). */
function dome(gb: G, rx: number, ry: number, rz: number, cy: number, cz: number, opening: number, thetaMax: number): void {
  gb.add(new THREE.SphereGeometry(1, 28, 14, PI / 2 + opening, TAU - 2 * opening, 0, thetaMax), { p: [0, cy, cz], s: [rx, ry, rz] }, true);
}
/** Blobs along the two vertical edges of the opening (fur trim). */
function edgeBlobs(gb: G, rx: number, ry: number, rz: number, cy: number, cz: number, opening: number, thetaMax: number, size: number, step = 0.3): void {
  for (const side of [-1, 1]) {
    const phi = PI / 2 + side * opening;
    for (let th = 0.25; th <= thetaMax; th += step) {
      gb.e([-rx * Math.cos(phi) * Math.sin(th), cy + ry * Math.cos(th), cz + rz * Math.sin(phi) * Math.sin(th)], size);
    }
  }
}

export const SUIT_ACCS: AccDef[] = [
  // Space Helmet: see-through bubble
  {
    name: 'Space Helmet', icon: '👩‍🚀', rarity: 'epic', suit: 'astro',
    make: () => accBase({
      fixed: true,
      head: pieces('accv3|spacehelmet', (pb) => {
        pb.at('lens').add(new THREE.SphereGeometry(1, 28, 18), { p: [0, 0.01, 0.0], s: [0.168, 0.188, 0.178] }, true);
        const w = pb.at('white', 'fabric'), metal = pb.at('trim', 'metal'); // fabric finish: the helmet adds only the lens + metal categories
        w.add(new THREE.LatheGeometry([[0.1, -0.12], [0.118, -0.15], [0.116, -0.2], [0.104, -0.206]].map(([r, y]) => new THREE.Vector2(r, y)), 22), {}, true);
        metal.add(torus(0.118, 0.014), { p: [0, -0.155, 0], r: [PI / 2, 0, 0], s: [1, 1.04, 1] });
        for (const s of [-1, 1]) {
          w.e([0.172 * s, -0.01, -0.016], [0.026, 0.05, 0.044]);
          pb.at('cyan', 'fabric').e([0.19 * s, -0.01, -0.016], [0.006, 0.032, 0.03]);
        }
        w.e([-0.075, 0.1, 0.152], [0.018, 0.032, 0.005], [0.0, -0.4, 0.5]);
        w.e([-0.1, 0.06, 0.14], [0.007, 0.01, 0.004], [0.0, -0.5, 0.5]);
        pb.at('dark', 'fabric').seg([-0.1, 0.17, -0.02], [-0.12, 0.23, -0.04], 0.004);
        pb.at('pink', 'fabric').e([-0.12, 0.236, -0.04], 0.012);
      }),
    }),
  },
  // Unicorn Hood
  {
    name: 'Unicorn Hood', icon: '🦄', rarity: 'legendary', suit: 'unicorn',
    make: () => accBase({
      hat: true, topLift: 0.18,
      head: pieces('accv3|unicornhood', (pb) => {
        const m = pb.at('main', 'fabric'), w = pb.at('white', 'fabric');
        dome(m, 0.138, 0.152, 0.146, -0.006, -0.012, 0.95, 2.05);
        edgeBlobs(w, 0.138, 0.152, 0.146, -0.006, -0.012, 0.95, 2.0, 0.02);
        // horn + ears
        pb.at('gold').add(spike(), { p: [0, 0.14, 0.09], s: [0.052, 0.17, 0.052], q: qTo(0, 1, 0.35) }, false);
        for (const k of [0.45, 0.8, 1.15]) pb.at('white').add(torus(0.026 * (1 - k * 0.55), 0.0045), { p: [0, 0.14 + 0.16 * k * 0.95, 0.09 + 0.055 * k], r: [PI / 2 - 0.34, 0, 0] });
        for (const s of [-1, 1]) {
          m.add(spike(), { p: [0.09 * s, 0.13, 0.0], s: [0.05, 0.075, 0.03], q: qTo(0.35 * s, 1, -0.1) });
          pb.at('pink').add(spike(), { p: [0.09 * s, 0.132, 0.01], s: [0.03, 0.05, 0.018], q: qTo(0.35 * s, 1, -0.1) });
        }
        // rainbow mane down the back of the hood
        ['pink', 'cyan', 'gold', 'white', 'pink', 'cyan'].forEach((role, i) => {
          const a = 0.25 + i * 0.3;
          pb.at(role as 'pink').e([0, -0.006 + 0.152 * Math.cos(a) + 0.01, -0.012 - 0.146 * Math.sin(a) - 0.012], [0.032, 0.034, 0.032]);
        });
      }),
    }),
  },
  // Dino Hood
  {
    name: 'Dino Hood', icon: '🦖', rarity: 'epic', suit: 'dino',
    make: () => accBase({
      hat: true, topLift: 0.15,
      head: pieces('accv3|dinohood', (pb) => {
        const m = pb.at('main', 'fabric'), t = pb.at('trim', 'fabric'), w = pb.at('white');
        dome(m, 0.138, 0.152, 0.146, -0.006, -0.012, 0.95, 2.05);
        edgeBlobs(t, 0.138, 0.152, 0.146, -0.006, -0.012, 0.95, 2.0, 0.017, 0.4);
        for (let i = 0; i < 7; i++) {
          const a = -0.2 + i * 0.3;
          const y = -0.006 + 0.152 * Math.cos(a), z = -0.012 - 0.146 * Math.sin(a);
          t.spk([0, y - 0.01, z], [0, Math.cos(a), -Math.sin(a)], 0.06 - Math.abs(a - 0.7) * 0.02, 0.028);
        }
        for (const s of [-1, 1]) {
          w.e([0.056 * s, 0.14, 0.05], [0.034, 0.034, 0.03]);
          pb.at('ink').e([0.056 * s, 0.142, 0.075], [0.016, 0.016, 0.008]);
        }
      }),
    }),
  },
  // Hero Cape & Mask
  {
    name: 'Hero Cape', icon: '🦸‍♀️', rarity: 'legendary', suit: 'hero',
    make: () => {
      const a = accBase({ fixed: true });
      a.head = pieces('accv3|heromask', (pb) => {
        const sh = new THREE.Shape();
        const pts: [number, number][] = [[-0.104, 0.012], [-0.092, 0.05], [-0.062, 0.066], [-0.022, 0.054], [0, 0.046], [0.022, 0.054], [0.062, 0.066], [0.092, 0.05], [0.104, 0.012], [0.09, -0.042], [0.062, -0.054], [0.022, -0.04], [0, -0.034], [-0.022, -0.04], [-0.062, -0.054], [-0.09, -0.042]];
        pts.forEach(([x, y], i) => (i === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y)));
        for (const s of [-1, 1]) {
          const hole = new THREE.Path();
          hole.absellipse(0.039 * s, -0.002, 0.025, 0.022, 0, TAU, false);
          sh.holes.push(hole);
        }
        pb.at('main').add(wrapHead(new THREE.ShapeGeometry(sh, 12), 0, 2, 0.003, 0.012), {}, true);
      });
      a.body = pieces('accv3|herocape', (pb) => {
        const m = pb.at('main', 'fabric'), t = pb.at('trim', 'fabric'), g = pb.at('gold');
        const prof: [number, number][] = ([[0.098, U(1.425)], [0.162, U(1.36)], [0.216, U(1.2)], [0.256, U(1.02)], [0.276, U(0.88)]] as [number, number][]).reverse(); // bottom to top: faces outward
        const c = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)));
        m.add(new THREE.LatheGeometry(c.getPoints(12), 24, PI - 1.45, 2.9), { s: [1, 1, 0.8] }, true);
        const inner = new THREE.SplineCurve(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r - 0.004, y)));
        t.add(new THREE.LatheGeometry(inner.getPoints(12), 24, PI - 1.45, 2.9), { s: [1, 1, 0.8] }, true); // lining
        t.add(new THREE.LatheGeometry([new THREE.Vector2(0.276, U(0.88)), new THREE.Vector2(0.28, U(0.9))], 24, PI - 1.45, 2.9), { s: [1, 1, 0.8] }, true);
        t.add(torus(0.09, 0.016, PI * 1.3), { p: [0, U(1.425), -0.01], r: [PI / 2, 0, PI * 0.85], s: [1, 0.8, 1] });
        for (const s of [-1, 1]) {
          g.e([0.092 * s, U(1.36), 0.07], 0.012);
          g.seg([0.092 * s, U(1.36), 0.07], [0.0, U(1.34), 0.1], 0.0035);
        }
        g.e([0, U(1.34), 0.1], 0.013);
      });
      return a;
    },
  },
  // Chef Hat
  {
    name: 'Chef Hat', icon: '👨‍🍳', rarity: 'uncommon', suit: 'chef',
    make: () => accBase({
      hat: true, topLift: 0.2,
      head: pieces('accv3|chefhat', (pb) => {
        const m = pb.at('main', 'fabric'), t = pb.at('trim', 'fabric');
        m.add(new THREE.LatheGeometry([[0.112, 0.0], [0.114, 0.045], [0.11, 0.09]].map(([r, y]) => new THREE.Vector2(r, y)), 22), { p: [0, 0.03, -0.006] }, true);
        t.add(torus(0.113, 0.009), { p: [0, 0.032, -0.006], r: [PI / 2, 0, 0] });
        m.e([0, 0.16, -0.006], [0.112, 0.08, 0.112]);
        for (const [x, z] of [[0.07, 0.0], [-0.07, 0.0], [0.0, 0.07], [0.0, -0.075]]) m.e([x, 0.16, z - 0.006], [0.06, 0.07, 0.06]);
        m.e([0, 0.215, -0.006], [0.085, 0.06, 0.085]);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          t.seg([Math.sin(a) * 0.1, 0.1, Math.cos(a) * 0.1 - 0.006], [Math.sin(a) * 0.112, 0.17, Math.cos(a) * 0.112 - 0.006], 0.003);
        }
      }),
    }),
  },
  // Fur Hat (explorer ushanka)
  {
    name: 'Fur Hat', icon: '🧣', rarity: 'rare', suit: 'snow',
    make: () => accBase({
      hat: true, topLift: 0.07,
      head: pieces('accv3|furhat', (pb) => {
        const m = pb.at('main', 'fabric'), w = pb.at('white', 'fabric'), dark = pb.at('dark', 'fabric');
        m.add(new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.64), { p: [0, 0.04, -0.008], s: [0.13, 0.116, 0.14] }, true);
        blobRing(w, 0.026, 0.122, 16, [0.032, 0.028, 0.034], 0, 1.05);
        for (const s of [-1, 1]) {
          m.e([0.122 * s, -0.04, -0.008], [0.03, 0.062, 0.052]);
          w.e([0.128 * s, -0.07, -0.008], [0.03, 0.026, 0.04]);
          w.e([0.124 * s, -0.03, 0.02], [0.022, 0.03, 0.026]);
          dark.seg([0.12 * s, -0.095, -0.008], [0.04 * s, -0.17, 0.05], 0.004);
        }
        w.e([0, 0.15, -0.01], [0.034, 0.03, 0.034]);
        pb.at('gold').e([0, 0.075, 0.136], [0.014, 0.012, 0.006]);
      }),
    }),
  },
  // Racer Helmet
  {
    name: 'Racer Helmet', icon: '⛑️', rarity: 'rare', suit: 'racer',
    make: () => accBase({
      hat: true, topLift: 0.06,
      head: pieces('accv3|racerhelmet', (pb) => {
        const m = pb.at('main'), w = pb.at('white'), dark = pb.at('dark');
        dome(m, 0.135, 0.15, 0.145, -0.01, -0.012, 1.1, 2.0);
        for (let i = 0; i < 9; i++) {
          const a = -0.55 + i * 0.26;
          w.e([0, -0.01 + 0.15 * Math.cos(a) + 0.003, -0.012 - 0.145 * Math.sin(a)], [0.014, 0.014, 0.014]);
        }
        dark.add(new THREE.SphereGeometry(1, 20, 8, PI / 2 - 0.75, 1.5, 0.5, 0.5), { p: [0, -0.01, -0.012], s: [0.14, 0.157, 0.15] }, true);
        pb.at('cyan').e([0, 0.095, 0.1], [0.02, 0.012, 0.008], [0.9, 0, 0]);
        for (const s of [-1, 1]) {
          w.e([0.134 * s, -0.01, -0.01], [0.008, 0.04, 0.05]);
          dark.seg([0.12 * s, -0.08, 0.03], [0.02 * s, -0.17, 0.08], 0.004);
        }
      }),
    }),
  },
  // Panda Hood
  {
    name: 'Panda Hood', icon: '🐼', rarity: 'epic', suit: 'panda',
    make: () => accBase({
      hat: true, topLift: 0.12,
      head: pieces('accv3|pandahood', (pb) => {
        const m = pb.at('main', 'fabric'), ink = pb.at('ink', 'fabric'), w = pb.at('white', 'fabric');
        dome(m, 0.138, 0.152, 0.146, -0.006, -0.012, 0.95, 2.05);
        edgeBlobs(w, 0.138, 0.152, 0.146, -0.006, -0.012, 0.95, 2.0, 0.018, 0.32);
        for (const s of [-1, 1]) {
          ink.e([0.088 * s, 0.138, -0.03], [0.044, 0.044, 0.026]);
        }
      }),
    }),
  },
];

void zAt;
void B;
