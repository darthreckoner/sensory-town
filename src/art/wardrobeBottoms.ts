// v3 wardrobe: bottoms (styles 8+ of OUTFIT_CATALOG.bottom). Authoring rules as in characterParts.ts:
//   torso(): torso space (waist/hips/skirts, z flattened afterwards)
//   leg():   thigh = hip space (hangs from y = 0), shin = knee space; omitted = bare legs (skirts)
import * as THREE from 'three';
import { B, flare, type PB } from './characterKit';
import { HIP_TOP, PI, bodyR, shell, torus, tubeGeo, box, blobRing, crotch, front, legJoint, legTube, lathe, puffTube, roles, starGeo, zAt, type Rarity } from './wardrobeKit';

export interface BottomDef {
  name: string;
  icon: string;
  rarity: Rarity;
  torso: (pb: PB) => void;
  leg?: (pb: PB, thigh: boolean, s: number) => void;
  suit?: string;
}

const L = B.thighLen;
const SL = B.shinLen;
/** Quilted leg tube. */
function puffLeg(gb: ReturnType<typeof roles>['main'], yT: number, yB: number, r: number, bumps: number, amp: number): void {
  puffTube(gb, yB, yT, bumps, amp, () => r, 14, 4);
}
/** Dark bike shorts under a short skirt (so no bare pelvis shows below the hem). */
const underShorts = (pb: PB): void => {
  const d = pb.at('dark');
  d.e([0, 0.86, 0], [0.125, 0.06, 0.125]);
  shell(d, 0.82, 0.98, 0.006);
};
const shortsLeg = (pb: PB, thigh: boolean): void => {
  if (thigh) legTube(pb.at('dark'), true, 0.04, -0.075, 0.088, 0.086);
};
const waist = (pb: PB, off: number, ring = 0.011, role: 'dark' | 'trim' = 'dark'): void => {
  pb.at(role).ring(HIP_TOP - 0.006, bodyR(HIP_TOP) + off + 0.004, ring);
};
const drawcord = (pb: PB, off: number): void => {
  const w = pb.at('white');
  for (const s of [-1, 1]) {
    w.seg([0.018 * s, HIP_TOP - 0.01, zAt(HIP_TOP - 0.01, off, 0.018, 0.014)], [0.034 * s, HIP_TOP - 0.075, zAt(HIP_TOP - 0.075, off, 0.034, 0.016)], 0.0038);
    w.e([0.034 * s, HIP_TOP - 0.082, zAt(HIP_TOP - 0.082, off, 0.034, 0.018)], 0.0075);
  }
};

export const BOTTOM_V3: BottomDef[] = [
  // 8 ── Tutu: three stiff tulle layers
  {
    name: 'Tutu', icon: '🩰', rarity: 'rare',
    leg: (pb, thigh) => shortsLeg(pb, thigh),
    torso(pb) {
      const { main, trim } = roles(pb);
      const R0 = bodyR(HIP_TOP) + 0.014;
      underShorts(pb);
      flare(main, [[R0, HIP_TOP], [0.2, 0.97], [0.27, 0.905], [0.285, 0.88]], 8, 32);
      flare(trim, [[R0 + 0.004, HIP_TOP - 0.012], [0.21, 0.94], [0.285, 0.865], [0.305, 0.845]], 8, 32);
      flare(main, [[R0 + 0.008, HIP_TOP - 0.024], [0.22, 0.91], [0.3, 0.83], [0.325, 0.805]], 8, 32);
      pb.at('trim').ring(HIP_TOP - 0.004, bodyR(HIP_TOP) + 0.02, 0.014);
      blobRing(main, 0.805, 0.322, 22, [0.03, 0.012, 0.03]);
      pb.at('gold').e([0, HIP_TOP - 0.004, bodyR(HIP_TOP) + 0.034], [0.014, 0.014, 0.008]);
    },
  },
  // 9 ── Board Shorts: baggy to the knee, side stripe, drawcord
  {
    name: 'Board Shorts', icon: '🏄', rarity: 'common',
    torso(pb) {
      const { main } = roles(pb);
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.022);
      waist(pb, 0.022, 0.012, 'trim');
      drawcord(pb, 0.022);
    },
    leg(pb, thigh, s) {
      if (!thigh) return;
      const { main, trim, white } = roles(pb);
      legTube(main, true, 0.04, -0.3, 0.112, 0.118);
      trim.ring(-0.3, 0.119, 0.011);
      white.seg([s * 0.115, -0.02, 0], [s * 0.12, -0.285, 0], 0.0075);
    },
  },
  // 10 ── Sparkle Leggings: metal-finish tights
  {
    name: 'Sparkle Leggings', icon: '🪩', rarity: 'rare',
    torso(pb) {
      const m = pb.at('main', 'metal');
      crotch(m, 0.97);
      shell(m, 0.8, HIP_TOP, 0.008);
      pb.at('trim', 'metal').ring(HIP_TOP - 0.01, bodyR(HIP_TOP) + 0.012, 0.014);
    },
    leg(pb, thigh) {
      const m = pb.at('main', 'metal');
      if (thigh) legTube(m, true, 0.04, -L - 0.01, 0.083, 0.068);
      else legTube(m, false, 0.02, -SL + 0.02, 0.067, 0.047);
    },
  },
  // 11 ── Snow Pants: puffy quilted legs, high bib, ankle gaiters
  {
    name: 'Snow Pants', icon: '❄️', rarity: 'uncommon',
    torso(pb) {
      const { main, trim } = roles(pb);
      crotch(main, 1.15);
      shell(main, 0.78, 1.1, 0.036);
      trim.ring(1.1, bodyR(1.1) + 0.04, 0.012);
      pb.at('dark').ring(HIP_TOP - 0.05, bodyR(HIP_TOP - 0.05) + 0.04, 0.007);
      pb.at('cyan').seg([-0.07, 0.99, front(0.99, 0.036, 0.012)], [0.07, 0.99, front(0.99, 0.036, 0.012)], 0.004);
    },
    leg(pb, thigh) {
      const { main, dark, trim } = roles(pb);
      if (thigh) {
        puffLeg(main, 0.04, -L - 0.01, 0.112, 3, 0.012);
        legJoint(main, true, 0.12);
        pb.at('cyan').ring(-0.15, 0.116, 0.005);
      } else {
        puffLeg(main, 0.02, -SL + 0.07, 0.108, 3, 0.01);
        legJoint(main, false, 0.108);
        dark.add(tubeGeo(-SL + 0.075, -SL + 0.0, 0.082, 0.084, 14), {}, true);
        trim.ring(-SL + 0.075, 0.085, 0.012);
      }
    },
  },
  // 12 ── Kilt: short plaid wrap with a gold pin and a studded belt
  {
    name: 'Kilt', icon: '🎸', rarity: 'uncommon',
    leg: (pb, thigh) => shortsLeg(pb, thigh),
    torso(pb) {
      const { trim, gold, dark } = roles(pb);
      underShorts(pb);
      flare(pb.at('plaid'), [[bodyR(HIP_TOP) + 0.014, HIP_TOP], [0.175, 0.96], [0.215, 0.89], [0.23, 0.835]], 8, 34, 16);
      trim.ring(HIP_TOP - 0.004, bodyR(HIP_TOP) + 0.02, 0.016);
      dark.ring(0.835, 0.231, 0.006);
      for (let i = 0; i < 9; i++) {
        const a = -0.9 + (i / 8) * 1.8;
        const R = bodyR(HIP_TOP) + 0.036;
        gold.e([Math.sin(a) * R, HIP_TOP - 0.004, Math.cos(a) * R], 0.0085);
      }
      gold.seg([0.045, 0.99, front(0.99, 0.07, 0.03)], [0.045, 0.9, front(0.9, 0.07, 0.034)], 0.0055);
      gold.e([0.045, 0.99, front(0.99, 0.07, 0.036)], 0.012);
    },
  },
  // 13 ── Cutoffs: frayed denim shorts
  {
    name: 'Cutoffs', icon: '🩳', rarity: 'common',
    torso(pb) {
      const { main, gold, dark, white } = roles(pb);
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.02);
      dark.ring(HIP_TOP - 0.005, bodyR(HIP_TOP) + 0.024, 0.009);
      gold.e([0, HIP_TOP - 0.006, bodyR(HIP_TOP) + 0.032], [0.013, 0.01, 0.006]);
      for (const s of [-1, 1]) {
        box(white, 0.05, 0.034, 0.008, 0.006, [0.1 * s, HIP_TOP - 0.05, zAt(HIP_TOP - 0.05, 0.02, 0.1, 0.0)], [0, 0.4 * s, 0]);
        dark.seg([0.03 * s, HIP_TOP - 0.02, zAt(HIP_TOP - 0.02, 0.02, 0.03, 0.006)], [0.0, HIP_TOP - 0.1, front(HIP_TOP - 0.1, 0.02, 0.006)], 0.0032);
      }
    },
    leg(pb, thigh) {
      if (!thigh) return;
      const { main, trim } = roles(pb);
      legTube(main, true, 0.04, -0.17, 0.1, 0.103);
      trim.ring(-0.17, 0.104, 0.009);
    },
  },
  // 14 ── Parachute Pants: shiny, gathered at the ankle
  {
    name: 'Parachute Pants', icon: '🪂', rarity: 'uncommon',
    torso(pb) {
      const g = pb.at('main', 'gloss');
      crotch(g, 1.05);
      shell(g, 0.8, HIP_TOP, 0.024);
      waist(pb, 0.024, 0.012, 'trim');
      drawcord(pb, 0.024);
    },
    leg(pb, thigh, s) {
      const g = pb.at('main', 'gloss');
      if (thigh) {
        legTube(g, true, 0.04, -L - 0.01, 0.1, 0.104);
        pb.at('white').seg([s * 0.104, -0.05, 0.03], [s * 0.104, -0.22, 0.03], 0.0042);
      } else {
        lathe(g, [[0.066, -SL + 0.04], [0.088, -SL + 0.12], [0.104, -0.2], [0.104, 0.02]], 14);
        legJoint(g, false, 0.1);
        pb.at('trim', 'gloss').ring(-SL + 0.045, 0.067, 0.015);
      }
    },
  },
  // 15 ── Skater Skirt: short circle skirt, hem stripe
  {
    name: 'Skater Skirt', icon: '🛹', rarity: 'common',
    leg: (pb, thigh) => shortsLeg(pb, thigh),
    torso(pb) {
      const { main, trim, white } = roles(pb);
      underShorts(pb);
      flare(main, [[bodyR(HIP_TOP) + 0.014, HIP_TOP], [0.2, 0.96], [0.265, 0.895], [0.29, 0.855]], 8, 36);
      trim.ring(HIP_TOP - 0.004, bodyR(HIP_TOP) + 0.019, 0.014);
      white.ring(0.858, 0.289, 0.006);
      white.ring(0.838, 0.295, 0.004);
    },
  },
  // 16 ── Ripped Jeans: skinny with knee rips
  {
    name: 'Ripped Jeans', icon: '🕳️', rarity: 'uncommon',
    torso(pb) {
      const { main, gold, dark } = roles(pb);
      crotch(main, 0.95);
      shell(main, 0.8, HIP_TOP, 0.012);
      dark.ring(HIP_TOP - 0.005, bodyR(HIP_TOP) + 0.016, 0.008);
      gold.e([0, HIP_TOP - 0.006, bodyR(HIP_TOP) + 0.024], [0.012, 0.009, 0.006]);
    },
    leg(pb, thigh) {
      const { main } = roles(pb);
      const skin = pb.at('skin');
      if (thigh) {
        legTube(main, true, 0.04, -L - 0.01, 0.082, 0.07);
        skin.e([-0.01, -0.3, 0.064], [0.034, 0.05, 0.012]);
        skin.e([0.02, -0.17, 0.073], [0.016, 0.026, 0.01]);
        pb.at('white').seg([-0.04, -0.3, 0.062], [0.025, -0.3, 0.072], 0.0035);
      } else {
        legTube(main, false, 0.02, -SL + 0.01, 0.068, 0.05);
        skin.e([0.012, -0.08, 0.06], [0.03, 0.04, 0.01]);
      }
    },
  },
  // 17 ── Gym Shorts: mid-thigh, side stripe, wide waistband
  {
    name: 'Gym Shorts', icon: '🏋️', rarity: 'common',
    torso(pb) {
      const { main } = roles(pb);
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.018);
      waist(pb, 0.018, 0.017, 'trim');
      drawcord(pb, 0.018);
    },
    leg(pb, thigh, s) {
      if (!thigh) return;
      const { main, trim, white } = roles(pb);
      legTube(main, true, 0.04, -0.25, 0.097, 0.108);
      trim.ring(-0.25, 0.109, 0.01);
      white.seg([s * 0.1, -0.02, 0], [s * 0.11, -0.24, 0], 0.0058);
    },
  },
  // 18 ── Cozy Pants: pajama pants with stars
  {
    name: 'Cozy Pants', icon: '🌙', rarity: 'common',
    torso(pb) {
      const { main } = roles(pb);
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.02);
      waist(pb, 0.02, 0.013, 'trim');
      drawcord(pb, 0.02);
    },
    leg(pb, thigh) {
      const { main, trim } = roles(pb);
      const pr = pb.at('print');
      const star = (r: number, x: number, y: number, z: number, rot = 0): void => {
        const g = starGeo(r, r * 0.45);
        g.rotateZ(rot);
        pr.add(g, { p: [x, y, z] }, true);
      };
      if (thigh) {
        legTube(main, true, 0.04, -L - 0.01, 0.095, 0.092);
        star(0.022, 0.0, -0.1, 0.098);
        star(0.016, -0.04, -0.22, 0.088, 0.4);
        star(0.02, 0.035, -0.3, 0.086, -0.3);
      } else {
        legTube(main, false, 0.02, -SL + 0.02, 0.092, 0.09);
        trim.ring(-SL + 0.02, 0.091, 0.012);
        star(0.02, 0.0, -0.12, 0.093);
        star(0.015, 0.03, -0.26, 0.091, 0.5);
      }
    },
  },
];

void PI;
void torus;

import { SUIT_BOTTOMS } from './wardrobeSuits';
BOTTOM_V3.push(...SUIT_BOTTOMS); // full-body suit legs (wardrobeSuits.ts)
