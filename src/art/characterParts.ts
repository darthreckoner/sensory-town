// Outfit catalog for the v2 teen character: tops, bottoms, shoes, accessories.
// (Hair lives in characterHair.ts.) Every builder returns cached "pieces" — merged
// geometries tagged with a color ROLE — so characters share vertex buffers.
//
// Coordinate spaces:
//   tops / bottoms (torso pieces)  torso space: pivot = upper-body origin (y = TY), z flattened
//   sleeves                        arm space: shoulder at the origin, arm hangs along -y
//   trouser legs                   hip space (thigh) and knee space (shin)
//   shoes                          foot space: ankle at the origin, +z = toes, sole at y = -0.09
//   accessories                    head space (origin = head center) or upper-body space
import * as THREE from 'three';
import { roundedBox as roundedBoxFull } from './materials';
/** Low-poly rounded box (one bevel segment) — plenty for small details. */
const roundedBox = (w: number, h: number, d: number, r = 0.02) => roundedBoxFull(w, h, d, r, 2);
import { HAIR_COUNT, HAIR_V3_ITEMS } from './characterHair';
import { TOP_V3 } from './wardrobeTops';
import { BOTTOM_V3 } from './wardrobeBottoms';
import { SHOE_V3 } from './wardrobeShoes';
import { ACC_V3 } from './wardrobeAcc';
import { sneaker, boot, lowShoe } from './wardrobeShoes';
import { hoodCowl } from './wardrobeKit';
import { GB, armRL, armRU, bodyR, cap, capsule, fitBodyPieces, fitTube, legTube, overShoulder, pieces, shell, shoulderPad, spike, torsoSpace, torus, tubeGeo } from './wardrobeKit'; // smooth primitives (v3.2)
import {
  B, EYE, TAU, TY, flare, frameQ, facePoint, sph, arr3,
  type Piece, type PB, type V3t,
} from './characterKit';

export type CatalogSlot = 'hair' | 'top' | 'bottom' | 'shoes' | 'accessory';
export interface CatalogItem {
  name: string;
  icon: string;
  /** unlock id (src/core/unlocks.ts) for bonus items */
  reward?: string;
}

const catItem = ({ name, icon }: { name: string; icon: string }): CatalogItem => ({ name, icon });
export const OUTFIT_CATALOG: Record<CatalogSlot, CatalogItem[]> = {
  hair: [
    { name: 'Fade', icon: '✂️' }, { name: 'Bob', icon: '💇' }, { name: 'Pony', icon: '🎀' }, { name: 'Wolf', icon: '🐺' },
    { name: 'Waves', icon: '🌊' }, { name: 'Buns', icon: '🍡' }, { name: 'Curls', icon: '🌀' }, { name: 'Braids', icon: '🧵' },
    { name: 'Bangs', icon: '🎭' }, { name: 'Puffs', icon: '☁️' }, { name: 'Quiff', icon: '🔥' }, { name: 'Knot', icon: '🥋' },
    ...HAIR_V3_ITEMS.map(catItem), // v3 wardrobe: styles 12+ (characterHair.ts)
  ],
  top: [
    { name: 'Tee', icon: '👕' }, { name: 'Hoodie', icon: '🧥' }, { name: 'Cami', icon: '👚' }, { name: 'Varsity', icon: '🏈' },
    { name: 'Puffer', icon: '☁️' }, { name: 'Crop', icon: '🎽' }, { name: 'Vest', icon: '🧶' }, { name: 'Track', icon: '🏃' },
    { name: 'Flannel', icon: '🍁' }, { name: 'Jersey', icon: '⚽' },
    ...TOP_V3.map(catItem), // v3 wardrobe: styles 10+ (wardrobeTops.ts)
  ],
  bottom: [
    { name: 'Baggy', icon: '👖' }, { name: 'Biker', icon: '🩳' }, { name: 'Pleated', icon: '🎀' }, { name: 'Cargo', icon: '🎒' },
    { name: 'Joggers', icon: '🏃' }, { name: 'Flares', icon: '🪩' }, { name: 'Tennis', icon: '🎾' }, { name: 'Track', icon: '🏅' },
    ...BOTTOM_V3.map(catItem), // v3 wardrobe: styles 8+ (wardrobeBottoms.ts)
  ],
  shoes: [
    { name: 'Chunky', icon: '👟' }, { name: 'Hi-tops', icon: '🏀' }, { name: 'Boots', icon: '🥾' }, { name: 'Slides', icon: '🩴' },
    { name: 'Skate', icon: '🛹' }, { name: 'Janes', icon: '👞' }, { name: 'LED', icon: '💡', reward: 'outfit.ledkicks' },
    ...SHOE_V3.map(catItem), // v3 wardrobe: styles 7+ (wardrobeShoes.ts)
  ],
  accessory: [
    { name: 'None', icon: '🚫' }, { name: 'Phones', icon: '🎧' }, { name: 'Shades', icon: '🕶️' }, { name: 'Bucket', icon: '🪣' },
    { name: 'Clip', icon: '🦀' }, { name: 'Beanie', icon: '🧶' }, { name: 'Chain', icon: '⛓️' }, { name: 'Bag', icon: '👜' },
    { name: 'Tumbler', icon: '🥤' }, { name: 'Scrunchie', icon: '🍩' }, { name: 'Cap', icon: '🧢' }, { name: 'Round', icon: '👓' },
    { name: 'Wings', icon: '🪽', reward: 'outfit.wings' }, { name: 'Crown', icon: '👑', reward: 'outfit.crown' },
    ...ACC_V3.map(catItem), // v3 wardrobe: styles 14+ (wardrobeAcc.ts)
  ],
};
if (OUTFIT_CATALOG.hair.length !== HAIR_COUNT) throw new Error('hair catalog out of sync');

/** Saved styles may be out of range (older saves): wrap them into the catalog. */
export function clampStyle(slot: CatalogSlot, style: number): number {
  const n = OUTFIT_CATALOG[slot].length;
  const s = Number.isFinite(style) ? Math.floor(style) : 0;
  return ((s % n) + n) % n;
}

export const TOP_COUNT = OUTFIT_CATALOG.top.length;
export const BOTTOM_COUNT = OUTFIT_CATALOG.bottom.length;
export const ACC = { none: 0, phones: 1, shades: 2, bucket: 3, clip: 4, beanie: 5, chain: 6, bag: 7, tumbler: 8, scrunchie: 9, cap: 10, round: 11, wings: 12, crown: 13 };
export const TOP_DRESS = -1; // (no dresses in the v2 catalog)
/** Extra radius of each top at the chest (accessories and bottoms sit outside it). */
export const TOP_OFF = [0.014, 0.05, 0.008, 0.03, 0.05, 0.01, 0.024, 0.022, 0.032, 0.022, ...TOP_V3.map((t) => t.off)];
const NECK = 1.43;

// ── decals: flat shapes wrapped onto the torso surface ──────────────────────
function starGeo(rOut: number, rIn: number, n = 5): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}
/** Wrap a flat XY geometry onto the shirt surface (torso space, before the z-flatten). */
function decal(gb: GB, geo: THREE.BufferGeometry, cy: number, off: number, dx = 0, lift = 0): void {
  const g = geo.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + dx, y = p.getY(i) + cy;
    const R = bodyR(y) + off + 0.002 + lift;
    p.setXYZ(i, x, y, Math.sqrt(Math.max(0, R * R - x * x)));
  }
  g.computeVertexNormals();
  gb.add(g, {}, true);
}
const front = (y: number, off: number, extra = 0.004) => bodyR(y) + off + extra;
const CIRCLE = (r: number) => new THREE.CircleGeometry(r, 16);
const RECT = (w: number, h: number) => new THREE.PlaneGeometry(w, h, 3, 1);

// ═════════════════════════════════════════════════════════════════════════════
// Tops
// ═════════════════════════════════════════════════════════════════════════════
export interface TopParts {
  torso: Piece[];
  upper: Piece[];
  lower: Piece[];
}

/** Quilted (puffer) profile: scalloped bumps along a lathe. */
function puffLathe(gb: GB, y0: number, y1: number, bumps: number, amp: number, off: (y: number) => number, rFn: (y: number) => number, seg = 16): void {
  const pts: THREE.Vector2[] = [];
  const per = 4;
  for (let i = 0; i <= bumps * per; i++) {
    const y = y0 + ((y1 - y0) * i) / (bumps * per);
    const u = (i % per) / per;
    const bump = i === bumps * per ? 0 : amp * Math.pow(Math.sin(Math.PI * u), 0.55);
    pts.push(new THREE.Vector2(rFn(y) + off(y) + bump, y));
  }
  gb.add(new THREE.LatheGeometry(pts, seg), {}, true);
}

export function getTop(style: number, side: number): TopParts {
  const st = clampStyle('top', style);
  const off = TOP_OFF[st];
  const s = side === 0 ? 1 : -1;
  const torso = pieces(`top|${st}`, (pb) => buildTopTorso(pb, st, off), torsoSpace);
  const upper = pieces(`topU|${st}|${side}`, (pb) => buildSleeve(pb, st, true, s));
  const lower = pieces(`topL|${st}|${side}`, (pb) => buildSleeve(pb, st, false, s));
  return { torso, upper, lower };
}

function buildTopTorso(pb: PB, st: number, off: number): void {
  if (st >= 10) return TOP_V3[st - 10].torso(pb, off); // v3 wardrobe
  const main = pb.at('main');
  const trim = pb.at('trim');
  const hem = (y: number, o = off, tube = 0.008, g: GB = trim) => g.ring(y, bodyR(y) + o, tube);
  switch (st) {
    case 0: { // Graphic tee — circle badge with a star + text lines
      shell(main, 0.93, NECK, off);
      hem(0.93, off, 0.007, main);
      trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.003, 0.01);
      const pr = pb.at('print');
      decal(pr, CIRCLE(0.05), 1.2, off, 0, 0);
      decal(main, starGeo(0.036, 0.016), 1.2, off, 0, 0.0016);
      decal(pr, RECT(0.075, 0.008), 1.115, off, 0, 0);
      decal(pr, RECT(0.05, 0.008), 1.095, off, 0, 0);
      break;
    }
    case 1: { // Oversized hoodie — boxy, hood bunched at the neck, kangaroo pocket
      const o = (y: number) => 0.034 + 0.024 * Math.max(0, (1.1 - y) / 0.26);
      shell(main, 0.84, NECK, o);
      trim.ring(0.84, bodyR(0.84) + o(0.84) + 0.002, 0.017);
      hoodCowl(main); // the hood bunched at the neck has thickness
      trim.add(roundedBox(0.19, 0.08, 0.03, 0.02), { p: [0, 0.99, front(0.99, o(0.99), 0.008)] });
      for (const s of [-1, 1]) {
        pb.at('white').seg([0.032 * s, 1.40, front(1.40, o(1.40), 0.004)], [0.038 * s, 1.27, front(1.27, o(1.27), 0.006)], 0.0045);
        pb.at('white').e([0.038 * s, 1.262, front(1.262, o(1.262), 0.008)], 0.0085);
      }
      break;
    }
    case 2: { // Cami — spaghetti straps, lace-trim neckline, tight
      shell(main, 0.98, 1.31, off);
      hem(0.98, off, 0.006, main);
      trim.ring(1.31, bodyR(1.31) + off, 0.009);
      for (const s of [-1, 1]) overShoulder(trim, 0.14 * s, 1.3, 1.3, off, 0.009); // straps hug the shoulder slope
      break;
    }
    case 3: { // Varsity jacket — wool body, cream leather sleeves, ribbed trims
      shell(main, 0.93, NECK, off);
      trim.ring(0.93, bodyR(0.93) + off + 0.002, 0.018);
      trim.ring(NECK, bodyR(NECK) + off + 0.004, 0.017);
      trim.ring(NECK - 0.02, bodyR(NECK - 0.02) + off + 0.004, 0.014);
      for (const y of [1.3, 1.2, 1.1, 1.0]) pb.at('white').e([0, y, front(y, off, 0.006)], 0.009);
      decal(pb.at('cream'), CIRCLE(0.026), 1.27, off, 0.07, 0);
      decal(pb.at('gold'), starGeo(0.016, 0.007), 1.27, off, 0.07, 0.0016);
      break;
    }
    case 4: { // Puffer — quilted bands + tall collar
      const o = (_y: number) => 0.022;
      puffLathe(main, 0.93, 1.38, 5, 0.026, o, bodyR, 16);
      main.add(torus(0.078, 0.03), { p: [0, 1.42, -0.004], r: [Math.PI / 2, 0, 0] });
      trim.ring(0.93, bodyR(0.93) + 0.02, 0.012);
      break;
    }
    case 5: { // Crop top — tight, square-ish, hem above the waist
      shell(main, 1.13, NECK, off);
      hem(1.13, off, 0.006, trim);
      trim.ring(NECK + 0.003, bodyR(NECK) + off + 0.002, 0.008);
      decal(pb.at('print'), RECT(0.07, 0.008), 1.22, off, 0, 0);
      decal(pb.at('print'), RECT(0.045, 0.008), 1.2, off, 0, 0);
      break;
    }
    case 6: { // Sweater vest over a white shirt
      const sh = pb.at('cream', 'fabric');
      shell(sh, 0.86, NECK, 0.01);
      hem(0.86, 0.01, 0.006, sh);
      for (const s of [-1, 1]) {
        sh.e([0.04 * s, 1.41, front(1.41, 0.01, 0.01)], [0.03, 0.011, 0.024], [0.45, 0, 0.55 * s]);
      }
      shell(main, 0.98, 1.3, off);
      trim.ring(0.98, bodyR(0.98) + off + 0.002, 0.012);
      trim.ring(1.3, bodyR(1.3) + off, 0.01);
      // V-neck window showing the shirt
      const v = new THREE.Shape();
      v.moveTo(-0.075, 0.03);
      v.lineTo(0.075, 0.03);
      v.lineTo(0, -0.06);
      decal(pb.at('cream', 'fabric'), new THREE.ShapeGeometry(v), 1.265, off, 0, 0.0012);
      break;
    }
    case 7: { // Track jacket — zip, rib collar, side stripes on the sleeves
      shell(main, 0.9, NECK, off);
      trim.ring(0.9, bodyR(0.9) + off + 0.002, 0.014);
      trim.ring(NECK + 0.004, bodyR(NECK) + off + 0.004, 0.015);
      trim.ring(NECK - 0.016, bodyR(NECK - 0.016) + off + 0.004, 0.012);
      const pts: THREE.Vector3[] = [];
      for (let y = 1.4; y >= 0.91; y -= 0.07) pts.push(new THREE.Vector3(0, y, front(y, off, 0.003)));
      pb.at('white').add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0038, 4, false), {}, true);
      decal(pb.at('white'), CIRCLE(0.016), 1.28, off, 0.065, 0);
      for (const s of [-1, 1]) pb.at('white').seg([s * (bodyR(1.2) + off + 0.002), 1.3, 0], [s * (bodyR(1.0) + off + 0.002), 0.94, 0], 0.005);
      break;
    }
    case 8: { // Flannel — plaid, oversized, untucked
      const pl = pb.at('plaid');
      shell(pl, 0.84, NECK, off);
      for (const s of [-1, 1]) {
        pl.e([0.04 * s, 1.41, front(1.41, off, 0.01)], [0.03, 0.013, 0.025], [0.45, 0, 0.55 * s]);
        pl.add(roundedBox(0.045, 0.045, 0.012, 0.008), { p: [0.06 * s, 1.18, front(1.18, off, 0.007)] });
      }
      for (const y of [1.33, 1.23, 1.13, 1.03, 0.93]) pb.at('white').e([0, y, front(y, off, 0.005)], 0.0075);
      break;
    }
    case 9: { // Jersey — athletic, V-neck trim, side panels, big number
      shell(main, 0.9, NECK, off);
      hem(0.9, off, 0.008, pb.at('white'));
      trim.ring(NECK, bodyR(NECK) + off + 0.003, 0.011);
      for (const s of [-1, 1]) pb.at('white').seg([s * (bodyR(1.22) + off + 0.003), 1.28, 0], [s * (bodyR(1.0) + off + 0.003), 0.92, 0], 0.0075);
      // number "7"
      const pr = pb.at('print');
      decal(pr, RECT(0.06, 0.012), 1.2, off, 0, 0);
      const diag = new THREE.PlaneGeometry(0.012, 0.085, 1, 2);
      diag.rotateZ(-0.35);
      decal(pr, diag, 1.155, off, 0.012, 0);
      break;
    }
  }
}

/** Sleeves, in arm space. `upper` = upper arm (at the shoulder), `lower` = forearm (at the elbow). */
function buildSleeve(pb: PB, st: number, upper: boolean, s: number): void {
  if (st >= 10) return TOP_V3[st - 10].arm?.(pb, upper, s); // v3 wardrobe
  const main = pb.at('main');
  const trim = pb.at('trim');
  // sleeves follow the current limb profiles (deltoid / biceps / forearm) with the style's own radius as the minimum cloth size
  const limb = upper ? armRU : (y: number) => (y > 0 ? armRU(-B.armUp) : armRL(y));
  const tube = (gb: GB, yT: number, yB: number, rT: number, rB: number) => fitTube(gb, yT, yB, rT, rB, limb);
  switch (st) {
    case 0: // tee: short
      if (upper) {
        tube(main, 0.0, -0.125, 0.056, 0.06);
        cap(main, 0.056, 0.0);
        trim.ring(-0.125, 0.06, 0.006);
      }
      break;
    case 1: // oversized hoodie: wide, drops past the wrist
      if (upper) {
        tube(main, 0.0, -0.3, 0.068, 0.064);
        cap(main, 0.068, -0.002);
      } else {
        tube(main, 0.03, -0.247, 0.062, 0.056);
        trim.ring(-0.238, 0.049, 0.013);
      }
      break;
    case 3: { // varsity: cream sleeves, ribbed cuffs
      const c = pb.at('cream');
      if (upper) {
        tube(c, 0.0, -0.3, 0.054, 0.05);
        cap(c, 0.054, -0.002);
      } else {
        tube(c, 0.03, -0.236, 0.047, 0.042);
        trim.ring(-0.232, 0.039, 0.012);
      }
      break;
    }
    case 4: { // puffer: quilted sleeves
      const o = () => 0;
      const base = upper ? 0.052 : 0.046;
      const len = upper ? 0.3 : 0.243;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const y = (upper ? 0.01 : 0.03) - (len * i) / 12;
        const u = (i % 4) / 4;
        pts.push(new THREE.Vector2(base + o() + (i === 12 ? 0 : 0.02 * Math.pow(Math.sin(Math.PI * u), 0.55)), y));
      }
      pts.reverse();
      main.add(new THREE.LatheGeometry(pts, 20), {}, true);
      if (upper) cap(main, 0.058, 0);
      else trim.ring(-0.232, 0.04, 0.012);
      break;
    }
    case 5: // crop: short fitted
      if (upper) {
        tube(main, 0.0, -0.1, 0.049, 0.05);
        cap(main, 0.049, 0.0);
        trim.ring(-0.1, 0.05, 0.006);
      }
      break;
    case 6: { // vest: long white shirt sleeves
      const c = pb.at('cream', 'fabric');
      if (upper) {
        tube(c, 0.0, -0.3, 0.05, 0.046);
        cap(c, 0.05, -0.002);
      } else {
        tube(c, 0.03, -0.24, 0.043, 0.038);
        c.ring(-0.236, 0.04, 0.01);
      }
      break;
    }
    case 7: { // track: long with white side stripes
      if (upper) {
        tube(main, 0.0, -0.3, 0.054, 0.05);
        cap(main, 0.054, -0.002);
        pb.at('white').seg([s * 0.057, -0.02, 0], [s * 0.053, -0.29, 0], 0.0045);
      } else {
        tube(main, 0.03, -0.246, 0.046, 0.04);
        trim.ring(-0.233, 0.04, 0.012);
        pb.at('white').seg([s * 0.049, 0.02, 0], [s * 0.043, -0.235, 0], 0.0045);
      }
      break;
    }
    case 8: { // flannel: long sleeves, forearm rolled to mid
      const pl = pb.at('plaid');
      if (upper) {
        tube(pl, 0.0, -0.3, 0.06, 0.056);
        cap(pl, 0.06, -0.002);
      } else {
        tube(pl, 0.03, -0.15, 0.054, 0.052);
        pl.ring(-0.15, 0.054, 0.012);
      }
      break;
    }
    case 9: // jersey: short wide sleeve with a white edge
      if (upper) {
        tube(main, 0.0, -0.115, 0.06, 0.066);
        cap(main, 0.06, 0.0);
        pb.at('white').ring(-0.115, 0.066, 0.007);
      }
      break;
    case 2: // cami: a little strap pad covers the arm's end cap (it showed as a disc beside the straps)
      if (upper) shoulderPad(pb, 'main');
      break;
    default: // anything else: bare arms
      break;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Bottoms
// ═════════════════════════════════════════════════════════════════════════════
export interface BottomParts {
  torso: Piece[];
  thigh: Piece[];
  shin: Piece[];
}
const HIP_TOP = 1.03; // waist
export function getBottom(style: number, side: number): BottomParts {
  const st = clampStyle('bottom', style);
  const s = side === 0 ? 1 : -1;
  const torso = pieces(`bot|${st}`, (pb) => buildBottomTorso(pb, st), torsoSpace);
  const thigh = pieces(`botT|${st}|${side}`, (pb) => buildLeg(pb, st, true, s));
  const shin = pieces(`botS|${st}|${side}`, (pb) => buildLeg(pb, st, false, s));
  return { torso, thigh, shin };
}

/** Fabric between the thighs so the skin torso never shows at the crotch. */
function crotch(gb: GB): void {
  gb.e([0, 0.83, 0], [0.13, 0.075, 0.13]);
}

function buildBottomTorso(pb: PB, st: number): void {
  if (st >= 8) return BOTTOM_V3[st - 8].torso(pb); // v3 wardrobe
  const main = pb.at('main');
  const trim = pb.at('trim');
  switch (st) {
    case 0: // baggy jeans
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.018);
      pb.at('dark').ring(HIP_TOP - 0.005, bodyR(HIP_TOP) + 0.022, 0.009);
      pb.at('gold').e([0, HIP_TOP - 0.006, bodyR(HIP_TOP) + 0.03], [0.014, 0.01, 0.006]);
      break;
    case 1: // bike shorts
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.008);
      trim.ring(HIP_TOP - 0.01, bodyR(HIP_TOP) + 0.012, 0.014);
      break;
    case 2: // pleated plaid skirt
      flare(pb.at('plaid'), [[bodyR(HIP_TOP) + 0.014, HIP_TOP], [0.16, 0.98], [0.195, 0.9], [0.225, 0.78], [0.245, 0.66]], 8, 34, 17);
      trim.ring(HIP_TOP - 0.004, bodyR(HIP_TOP) + 0.018, 0.012);
      pb.at('dark').ring(0.66, 0.247, 0.006);
      break;
    case 3: // cargo pants
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.02);
      pb.at('dark').ring(HIP_TOP - 0.005, bodyR(HIP_TOP) + 0.025, 0.009);
      pb.at('gold').e([0, HIP_TOP - 0.006, bodyR(HIP_TOP) + 0.033], [0.012, 0.009, 0.006]);
      break;
    case 4: // joggers
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.02);
      trim.ring(HIP_TOP - 0.012, bodyR(HIP_TOP) + 0.024, 0.016);
      pb.at('white').seg([-0.02, HIP_TOP - 0.03, bodyR(HIP_TOP) + 0.03], [-0.03, HIP_TOP - 0.1, bodyR(HIP_TOP) + 0.034], 0.0035);
      pb.at('white').seg([0.02, HIP_TOP - 0.03, bodyR(HIP_TOP) + 0.03], [0.03, HIP_TOP - 0.1, bodyR(HIP_TOP) + 0.034], 0.0035);
      break;
    case 5: // flare jeans
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.01);
      pb.at('dark').ring(HIP_TOP - 0.005, bodyR(HIP_TOP) + 0.014, 0.008);
      pb.at('gold').e([0, HIP_TOP - 0.006, bodyR(HIP_TOP) + 0.022], [0.012, 0.009, 0.006]);
      break;
    case 6: // tennis skirt
      flare(main, [[bodyR(HIP_TOP) + 0.014, HIP_TOP], [0.165, 0.97], [0.2, 0.9], [0.218, 0.82]], 7, 32, 14);
      trim.ring(HIP_TOP - 0.004, bodyR(HIP_TOP) + 0.018, 0.014);
      pb.at('white').ring(0.84, 0.208, 0.006);
      pb.at('white').ring(0.822, 0.214, 0.006);
      break;
    case 7: // track pants
      crotch(main);
      shell(main, 0.8, HIP_TOP, 0.016);
      trim.ring(HIP_TOP - 0.012, bodyR(HIP_TOP) + 0.02, 0.016);
      break;
  }
}

/** Trouser legs. thigh: hip space (hangs from y = 0), shin: knee space. */
function buildLeg(pb: PB, st: number, thigh: boolean, s: number): void {
  if (st >= 8) return BOTTOM_V3[st - 8].leg?.(pb, thigh, s); // v3 wardrobe
  const main = pb.at('main');
  const trim = pb.at('trim');
  // trouser legs follow the current thigh / shin profiles (legTube also adds the joint balls that hide the rims when the hip / knee bends)
  const tube = (gb: GB, yT: number, yB: number, rT: number, rB: number) => legTube(gb, thigh, yT, yB, rT, rB);
  const L = B.thighLen;
  const SL = B.shinLen;
  switch (st) {
    case 0: // baggy
      if (thigh) tube(main, 0.04, -L - 0.01, 0.104, 0.1);
      else {
        tube(main, 0.02, -SL + 0.01, 0.1, 0.114);
        pb.at('dark').ring(-SL + 0.012, 0.115, 0.01);
      }
      break;
    case 1: // bike shorts
      if (thigh) {
        tube(main, 0.04, -0.2, 0.077, 0.068);
        trim.ring(-0.2, 0.069, 0.009);
      }
      break;
    case 3: // cargo
      if (thigh) {
        tube(main, 0.04, -L - 0.01, 0.098, 0.094);
        pb.at('trim').add(roundedBox(0.064, 0.09, 0.034, 0.012), { p: [s * 0.098, -0.2, 0.012] });
        pb.at('dark').add(roundedBox(0.066, 0.024, 0.037, 0.01), { p: [s * 0.099, -0.15, 0.012] });
      } else {
        tube(main, 0.02, -SL + 0.02, 0.094, 0.09);
        pb.at('dark').ring(-SL + 0.024, 0.091, 0.009);
      }
      break;
    case 4: // joggers: tapered with ribbed cuffs
      if (thigh) tube(main, 0.04, -L - 0.01, 0.094, 0.084);
      else {
        tube(main, 0.02, -SL + 0.07, 0.084, 0.06);
        trim.ring(-SL + 0.07, 0.06, 0.016);
      }
      break;
    case 5: // flares
      if (thigh) tube(main, 0.04, -L - 0.01, 0.078, 0.07);
      else {
        tube(main, 0.02, -SL + 0.006, 0.07, 0.132);
        pb.at('dark').ring(-SL + 0.008, 0.133, 0.008);
      }
      break;
    case 7: // track pants
      if (thigh) {
        tube(main, 0.04, -L - 0.01, 0.09, 0.086);
        pb.at('white').seg([s * 0.092, -0.02, 0], [s * 0.088, -L, 0], 0.0055);
      } else {
        tube(main, 0.02, -SL + 0.03, 0.086, 0.08);
        pb.at('white').seg([s * 0.087, 0.02, 0], [s * 0.081, -SL + 0.04, 0], 0.0055);
        trim.ring(-SL + 0.03, 0.081, 0.012);
      }
      break;
    default: // skirts: bare legs
      break;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Shoes — foot space (ankle = origin, +z toes, sole bottom y = -0.09)
// ═════════════════════════════════════════════════════════════════════════════
export function getShoes(style: number): Piece[] {
  const st = clampStyle('shoes', style);
  return pieces(`shoe|${st}`, (pb) => {
    const main = pb.at('main');
    const white = pb.at('white');
    const dark = pb.at('dark');
    const trim = pb.at('trim');
    if (st >= 7) return SHOE_V3[st - 7].build(pb); // v3 wardrobe
    switch (st) {
      case 0: // chunky sneakers (sculpted: lofted sole + upper)
        sneaker(pb);
        break;
      case 6: // LED sneakers (glowing soles)
        sneaker(pb, { ledSole: true });
        for (const s of [-1, 1]) pb.at('led').seg([0.054 * s, -0.04, -0.05], [0.054 * s, -0.04, 0.09], 0.004);
        break;
      case 1: // high-tops
        sneaker(pb, { hi: 1 });
        break;
      case 2: { // platform boots
        boot(pb, { h: 0.15, r0: 0.05, r1: 0.056, heel: 0.012 });
        dark.ring(0.075, 0.053, 0.008);
        pb.at('gold').e([0.0, 0.075, 0.056], [0.013, 0.012, 0.006]);
        break;
      }
      case 3: // slides over white socks
        lowShoe(pb, { sock: 'ankle', band: true });
        break;
      case 4: // skate shoes (the sculpted sneaker, flat sole)
        sneaker(pb, { sole: 'white' });
        for (const s of [-1, 1]) trim.seg([0.05 * s, -0.04, 0.0], [0.05 * s, -0.045, 0.07], 0.005);
        break;
      case 5: // Mary Janes + frilly socks
        lowShoe(pb, { sock: 'frill', cover: 0.05, strap: true });
        break;
    }
  }, chunkyFoot, true);
}
/** Fortnite-style feet are chunky: widen and fatten every shoe a little (the sole stays on the ground). */
const chunkyFoot = (g: THREE.BufferGeometry): void => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, -0.09 + 0.09 * 1.14, 0), new THREE.Quaternion(), new THREE.Vector3(1.17, 1.14, 1.1)));
};

// ═════════════════════════════════════════════════════════════════════════════
// Accessories
// ═════════════════════════════════════════════════════════════════════════════
export interface AccPart {
  head: Piece[]; // head space
  body: Piece[]; // upper-body space (y relative to TY)
  handR: Piece[]; // wrist space (right)
  wristL: Piece[]; // wrist space (left)
  back: Piece[]; // upper-body space (wings)
  /** hat-like: hair volume is hidden underneath */
  hat: boolean;
  /** sits on the face, ignores hair size */
  fixed: boolean;
  lens?: THREE.BufferGeometry;
  wings?: boolean;
  /** right hand holds something up (arm bends) */
  holds?: boolean;
  /** extra height above the head, meters (for headTop) */
  topLift: number;
  /** place on the head with the hair-surface frame (claw clip etc.) instead of the top */
  onSurface?: { theta: number; phi: number; roll: number; off: number };
}
const EMPTY: Piece[] = [];
const accCache = new Map<string, AccPart>();
const indexed = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  const n = g.attributes.position.count;
  g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
};
const U = (y: number) => y - TY; // world height -> upper-body space
const lerpAng = (a: number, b: number, k: number) => a + (b - a) * k;

export function getAccessory(style: number, topStyle = 0): AccPart | null {
  const st = clampStyle('accessory', style);
  if (st === ACC.none) return null;
  const topOff = TOP_OFF[clampStyle('top', topStyle)];
  const key = `${st}|${st === ACC.chain || st === ACC.bag || (st >= 14 && ACC_V3[st - 14].bodyDep) ? topOff : 'x'}`;
  const hit = accCache.get(key);
  if (hit) return hit;
  if (st >= 14) {
    // v3 wardrobe (wardrobeAcc.ts)
    const a = ACC_V3[st - 14].make(topOff);
    fitBodyPieces(a.body); // authored at the v3.1 heights: fit to the current body
    accCache.set(key, a);
    return a;
  }
  const acc: AccPart = { head: EMPTY, body: EMPTY, handR: EMPTY, wristL: EMPTY, back: EMPTY, hat: false, fixed: false, topLift: 0 };
  const hs = (v: number) => v; // readability
  void hs;
  switch (st) {
    case ACC.phones:
      acc.head = pieces(`acc|${st}`, (pb) => {
        const main = pb.at('main');
        const R = 0.118;
        main.add(torus(R, 0.0075, Math.PI), { p: [0, -0.01, -0.004], s: [1, 1.38, 1] });
        for (const s of [-1, 1]) {
          main.e([0.112 * s, -0.012, -0.004], [0.015, 0.047, 0.042]);
          pb.at('dark').ringAt([0.105 * s, -0.012, -0.004], [s, 0, 0], 0.036, 0.012);
          pb.at('trim').e([0.126 * s, -0.012, -0.004], [0.004, 0.03, 0.028]);
        }
      });
      acc.topLift = 0.04;
      break;
    case ACC.shades:
      acc.fixed = true;
      acc.head = pieces(`acc|${st}`, (pb) => {
        const main = pb.at('main');
        const glass = pb.at('glass');
        const pts: THREE.Vector3[] = [];
        for (const s of [-1, 1]) {
          // centered on the eyes (EYE.theta / EYE.phi in the kit), big enough to cover them
          const { p, n } = facePoint(EYE.theta * s, EYE.phi + 0.5, 0.012);
          const q = frameQ(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.4));
          glass.add(roundedBox(0.068, 0.05, 0.006, 0.016), { p: arr3(p), q });
          main.add(roundedBox(0.076, 0.058, 0.004, 0.02), { p: arr3(p.clone().add(new THREE.Vector3(0, 0, -0.003))), q });
          const out = new THREE.Vector3(0.036 * s, 0, 0).applyQuaternion(q).add(p);
          main.seg(arr3(out), [0.094 * s, 0.002, -0.02], 0.0045);
          pts.push(p);
        }
        main.seg([pts[0].x + 0.03, pts[0].y + 0.006, pts[0].z], [pts[1].x - 0.03, pts[1].y + 0.006, pts[1].z], 0.0045);
      });
      break;
    case ACC.round:
      acc.fixed = true;
      acc.head = pieces(`acc|${st}`, (pb) => {
        const main = pb.at('main', 'metal');
        const lens = pb.at('lens');
        const pts: THREE.Vector3[] = [];
        for (const s of [-1, 1]) {
          const { p, n } = facePoint(EYE.theta * s, EYE.phi + 0.5, 0.012);
          const q = frameQ(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.4));
          main.add(torus(0.031, 0.0035), { p: arr3(p), q });
          lens.add(new THREE.CircleGeometry(0.0305, 16), { p: arr3(p), q });
          const out = new THREE.Vector3(0.031 * s, 0, 0).applyQuaternion(q).add(p);
          main.seg(arr3(out), [0.094 * s, 0.002, -0.02], 0.003);
          pts.push(p);
        }
        main.seg([pts[0].x + 0.031, pts[0].y + 0.006, pts[0].z], [pts[1].x - 0.031, pts[1].y + 0.006, pts[1].z], 0.003);
      });
      break;
    case ACC.bucket:
      acc.hat = true;
      acc.head = pieces(`acc|${st}`, (pb) => {
        const main = pb.at('main', 'fabric');
        const dome = new THREE.SphereGeometry(1, 20, 9, 0, TAU, 0, 1.86);
        main.add(dome, { p: [0, 0.05, -0.006], s: [0.124, 0.108, 0.132] });
        const brim = new THREE.LatheGeometry(
          [[0.118, 0.07], [0.158, 0.046], [0.164, 0.052], [0.16, 0.06], [0.12, 0.088]].map(([r, y]) => new THREE.Vector2(r, y)).reverse(),
          24,
        );
        main.add(brim, { p: [0, 0.0, -0.006] }, true);
        pb.at('trim').ring(0.078, 0.117, 0.008);
      });
      acc.topLift = 0.03;
      break;
    case ACC.clip:
      acc.onSurface = { theta: 180, phi: 38, roll: 0, off: 0.012 };
      acc.head = pieces(`acc|${st}`, (pb) => {
        // a claw clip gathering a twist of hair at the back
        pb.at('hair').e([0, 0.016, 0.0], [0.05, 0.08, 0.04]);
        const main = pb.at('main', 'metal'); // metallic clip so it pops against the hair
        main.add(capsule(0.014, 0.1), { p: [0, 0.0, 0.03], r: [0, 0, Math.PI / 2] });
        for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
          const x = (i - 2) * 0.026;
          main.seg([x, s * 0.006, 0.035], [x * 1.12, s * 0.07, 0.047 - Math.abs(i - 2) * 0.006], 0.009);
        }
      });
      break;
    case ACC.beanie:
      acc.hat = true;
      acc.head = pieces(`acc|${st}`, (pb) => {
        const main = pb.at('main', 'fabric');
        const tilt = -0.18;
        const d = new GB();
        d.add(new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.64), { p: [0, 0.04, -0.012], s: [0.124, 0.12, 0.134] });
        const dg = d.build();
        dg.rotateX(tilt);
        main.add(dg, {}, true);
        const band = new THREE.LatheGeometry(
          [[0.11, -0.026], [0.124, -0.026], [0.134, -0.018], [0.136, 0], [0.134, 0.018], [0.124, 0.026], [0.11, 0.026]].map(([r, y]) => new THREE.Vector2(r, y)),
          22,
        );
        const c = new GB();
        c.add(band, { p: [0, 0.04 - 0.002, -0.012], s: [1, 1, 1.03] }, true);
        const cg = c.build();
        cg.rotateX(tilt);
        pb.at('trim', 'fabric').add(cg, {}, true);
      });
      acc.topLift = 0.04;
      break;
    case ACC.cap:
      acc.hat = true;
      acc.head = pieces(`acc|${st}`, (pb) => {
        const main = pb.at('main', 'fabric');
        const tilt = 0.2; // brim at the back: the cap sits tipped forward a little
        const d = new GB();
        d.add(new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.64), { p: [0, 0.036, -0.004], s: [0.122, 0.118, 0.132] });
        const dg = d.build();
        dg.rotateX(tilt);
        main.add(dg, {}, true);
        const br = new GB();
        br.e([0, 0.0, -0.15], [0.074, 0.01, 0.07], [-0.18, 0, 0]);
        pb.at('dark').add(br.build(), {}, true);
        pb.at('white').e([0, 0.092, 0.092], [0.02, 0.012, 0.01], [0.9, 0, 0]);
        pb.at('trim').ring(0.036, 0.112, 0.004);
      });
      acc.topLift = 0.03;
      break;
    case ACC.chain:
      acc.body = pieces(`acc|${key}`, (pb) => {
        const main = pb.at('main', 'metal');
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * TAU;
          const drop = Math.pow(Math.max(0, Math.cos(a)), 1.6) * 0.115;
          const y = 1.415 - drop;
          const R = bodyR(y) + topOff + 0.007;
          pts.push(new THREE.Vector3(Math.sin(a) * R, U(y), Math.cos(a) * R * 0.7 + (Math.cos(a) > 0 ? 0.0 : 0)));
        }
        main.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 28, 0.0034, 4, true), {}, true);
        const yP = 1.415 - 0.115;
        pb.at('gold').add(indexed(new THREE.OctahedronGeometry(0.014).toNonIndexed()), { p: [0, U(yP) - 0.012, (bodyR(yP) + topOff + 0.012) * 0.7], s: [0.8, 1.2, 0.5] }, true);
      });
      break;
    case ACC.bag:
      acc.body = pieces(`acc|${key}`, (pb) => {
        const strap = pb.at('dark', 'fabric');
        const pts: THREE.Vector3[] = [];
        const surf = (x: number, y: number, sgn: number) => sgn * Math.sqrt(Math.max(0, Math.pow(bodyR(y) + topOff + 0.006, 2) - x * x)) * 0.7 + sgn * 0.004;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const x = 0.09 - 0.24 * t, y = 1.37 - 0.42 * t;
          pts.push(new THREE.Vector3(x, U(y), surf(x, y, 1)));
        }
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const x = -0.15 + 0.24 * t, y = 0.95 + 0.42 * t;
          pts.push(new THREE.Vector3(x, U(y), surf(x, y, -1)));
        }
        strap.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.0075, 4, true), {}, true);
        const bx = -0.152, by = 0.93;
        pb.at('main', 'gloss').add(roundedBox(0.1, 0.082, 0.04, 0.014), { p: [bx, U(by), surf(bx, by, 1) + 0.015], r: [0, 0.3, 0] });
        pb.at('trim', 'gloss').add(roundedBox(0.102, 0.04, 0.043, 0.014), { p: [bx, U(by + 0.022), surf(bx, by, 1) + 0.016], r: [0, 0.3, 0] });
        pb.at('gold').e([bx + 0.008, U(by + 0.004), surf(bx, by, 1) + 0.038], [0.008, 0.009, 0.004]);
      });
      break;
    case ACC.tumbler:
      acc.holds = true;
      acc.handR = pieces(`acc|${st}`, (pb) => {
        // authored around the palm center (the Character keeps it upright in the hand)
        const main = pb.at('main', 'gloss');
        const body = new THREE.LatheGeometry(
          [[0.0, -0.1], [0.022, -0.1], [0.029, -0.093], [0.032, -0.02], [0.034, 0.05], [0.0, 0.05]].map(([r, y]) => new THREE.Vector2(r, y)),
          14,
        );
        main.add(body, { p: [0, 0.0, 0.034] }, true);
        pb.at('white').add(new THREE.CylinderGeometry(0.0345, 0.0345, 0.012, 14), { p: [0, 0.056, 0.034] });
        pb.at('pink').seg([0.008, 0.05, 0.034], [0.018, 0.13, 0.03], 0.0045);
        pb.at('white').e([0, -0.1, 0.034], [0.025, 0.004, 0.025]);
      });
      break;
    case ACC.scrunchie:
      acc.wristL = pieces(`acc|${st}`, (pb) => {
        // satin scrunchie
        pb.at('main', 'satin').add(torus(0.036, 0.0145), { p: [0, -0.01, 0], r: [Math.PI / 2, 0, 0] });
        pb.at('trim', 'satin').add(torus(0.036, 0.0075), { p: [0, -0.01, 0], r: [Math.PI / 2, 0, 0], s: [1.04, 1.04, 1.5] });
      });
      break;
    case ACC.wings:
      acc.wings = true;
      acc.back = pieces(`acc|${st}`, (pb) => {
        // a fan of flat feathers, built for the +x wing (the other is mirrored)
        const f = pb.at('wing');
        const feather = (len: number, w: number): THREE.BufferGeometry => {
          const sh = new THREE.Shape();
          sh.moveTo(0, 0);
          sh.quadraticCurveTo(w, len * 0.35, w * 0.6, len * 0.8);
          sh.quadraticCurveTo(w * 0.2, len * 1.04, 0, len);
          sh.quadraticCurveTo(-w * 0.2, len * 1.04, -w * 0.6, len * 0.8);
          sh.quadraticCurveTo(-w, len * 0.35, 0, 0);
          return new THREE.ShapeGeometry(sh, 4);
        };
        // fan angle φ measured up from "straight out"; long primaries sweep out and down
        const rows: [number, number, number, number, number][] = [
          // count, base length, extra length, width, backsweep
          [7, 0.2, 0.36, 0.056, 0.5], [6, 0.15, 0.24, 0.05, 0.42], [5, 0.1, 0.13, 0.046, 0.34],
        ];
        rows.forEach(([n, base, extra, w, sweep], r) => {
          for (let i = 0; i < n; i++) {
            const k = i / (n - 1);
            const phi = lerpAng(1.25, -0.95, k); // up ... down
            const len = base + extra * Math.pow(k, 1.1);
            f.add(feather(len, w), {
              p: [0.045 + r * 0.004, U(1.3) - r * 0.012, -0.09 - r * 0.012],
              r: [0.0, sweep, phi - Math.PI / 2],
            });
          }
        });
      });
      acc.topLift = 0.0;
      break;
    case ACC.crown:
      acc.topLift = 0.075;
      acc.head = pieces(`acc|${st}`, (pb) => {
        const gold = pb.at('main', 'metal'); // the band + points take the accessory color (default: a contrast to the hair)
        const base = 0.12;
        gold.add(torus(0.1, 0.012), { p: [0, base, 0], r: [Math.PI / 2, 0, 0] });
        gold.add(new THREE.CylinderGeometry(0.098, 0.104, 0.04, 20, 1, true), { p: [0, base + 0.02, 0] });
        gold.add(torus(0.1, 0.01), { p: [0, base + 0.04, 0], r: [Math.PI / 2, 0, 0] });
        const dia = pb.at('diamond');
        const ico = (r: number) => new THREE.IcosahedronGeometry(r, 0);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          const x = Math.sin(a) * 0.1, z = Math.cos(a) * 0.1;
          const h = i % 2 === 0 ? 0.075 : 0.052;
          gold.spk([x, base + 0.035, z], [x * 0.6, 1, z * 0.6], h, 0.024);
          dia.add(indexed(ico(i % 2 === 0 ? 0.019 : 0.014).toNonIndexed()), { p: [x * 1.02, base + 0.04 + h, z * 1.02] }, true);
        }
        dia.add(indexed(ico(0.016).toNonIndexed()), { p: [0, base + 0.02, 0.1], s: [1, 1.2, 0.8] }, true);
      });
      break;
  }
  fitBodyPieces(acc.body);
  accCache.set(key, acc);
  return acc;
}

export { sph, spike };
