// v3 face customization: eye shapes + colors, brow styles, freckles, makeup presets and face
// stickers. Everything is baked into the character's existing material buckets (eyes / skin /
// gloss), so a customized face costs no extra draw calls. The Locker's Custom → Face tab
// reads FACE_OPTIONS; the Character reads the helpers below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FaceOpts } from '../core/model';
import { B, D2R, EYE, FACE_COL, GB, TAU, cached, facePoint, frameQ, loft, tint, type V3t } from './characterKit';

export type FaceRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface FaceItem {
  /** the value stored in `Outfit.face` (a number, a sticker id, a boolean, or null for "none") */
  id: number | string | boolean | null;
  name: string;
  icon: string;
  rarity: FaceRarity;
  /** eye colors: the hex the iris is drawn in */
  value?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Catalog (what the locker shows)
// ═════════════════════════════════════════════════════════════════════════════
export const EYE_COLORS: { id: string; name: string; hex: string; rarity: FaceRarity }[] = [
  { id: 'brown', name: 'Brown', hex: '#8e5c38', rarity: 'common' },
  { id: 'hazel', name: 'Hazel', hex: '#a8792f', rarity: 'common' },
  { id: 'green', name: 'Green', hex: '#3fa66a', rarity: 'uncommon' },
  { id: 'blue', name: 'Blue', hex: '#3d8de0', rarity: 'uncommon' },
  { id: 'grey', name: 'Storm Grey', hex: '#8b97a6', rarity: 'uncommon' },
  { id: 'violet', name: 'Violet', hex: '#9060e0', rarity: 'rare' },
  { id: 'amber', name: 'Amber', hex: '#e69a1f', rarity: 'rare' },
  { id: 'pink', name: 'Pink Fantasy', hex: '#ff6bb5', rarity: 'epic' },
];

export const FACE_OPTIONS: {
  /** FaceOpts.eyes: 0 almond (default), 1 round, 2 sleepy, 3 cat-eye flick, 4 sparkle-big */
  eyes: FaceItem[];
  /** FaceOpts.eyeColor: `value` is the hex to store */
  eyeColor: FaceItem[];
  /** FaceOpts.brows: 0 soft arch (default), 1 straight, 2 high arch, 3 bold, 4 slim + short */
  brows: FaceItem[];
  /** FaceOpts.freckles */
  freckles: FaceItem[];
  /** FaceOpts.makeup: 0 none, 1 soft blush, 2 glossy lip, 3 shimmer lids, 4 star liner */
  makeup: FaceItem[];
  /** FaceOpts.sticker: an id string, or null for none */
  sticker: FaceItem[];
} = {
  eyes: [
    { id: 0, name: 'Almond', icon: '👁️', rarity: 'common' },
    { id: 1, name: 'Round', icon: '🔵', rarity: 'common' },
    { id: 2, name: 'Sleepy', icon: '😌', rarity: 'uncommon' },
    { id: 3, name: 'Cat Eye', icon: '😼', rarity: 'rare' },
    { id: 4, name: 'Sparkle', icon: '🤩', rarity: 'epic' },
  ],
  eyeColor: EYE_COLORS.map((c) => ({ id: c.id, name: c.name, icon: '🎨', rarity: c.rarity, value: c.hex })),
  brows: [
    { id: 0, name: 'Soft Arch', icon: '🌙', rarity: 'common' },
    { id: 1, name: 'Straight', icon: '➖', rarity: 'common' },
    { id: 2, name: 'High Arch', icon: '🌈', rarity: 'uncommon' },
    { id: 3, name: 'Bold', icon: '💪', rarity: 'uncommon' },
    { id: 4, name: 'Slim', icon: '✏️', rarity: 'rare' },
  ],
  freckles: [
    { id: false, name: 'None', icon: '🚫', rarity: 'common' },
    { id: true, name: 'Freckles', icon: '🌞', rarity: 'uncommon' },
  ],
  makeup: [
    { id: 0, name: 'None', icon: '🚫', rarity: 'common' },
    { id: 1, name: 'Soft Blush', icon: '🌸', rarity: 'common' },
    { id: 2, name: 'Glossy Lip', icon: '💋', rarity: 'uncommon' },
    { id: 3, name: 'Shimmer Lids', icon: '✨', rarity: 'rare' },
    { id: 4, name: 'Star Liner', icon: '⭐', rarity: 'epic' },
  ],
  sticker: [
    { id: null, name: 'None', icon: '🚫', rarity: 'common' },
    { id: 'star', name: 'Star', icon: '⭐', rarity: 'common' },
    { id: 'heart', name: 'Heart', icon: '💗', rarity: 'common' },
    { id: 'sparkle', name: 'Sparkle Cheeks', icon: '✨', rarity: 'uncommon' },
    { id: 'rainbow', name: 'Rainbow', icon: '🌈', rarity: 'rare' },
    { id: 'moon', name: 'Moon', icon: '🌙', rarity: 'uncommon' },
    { id: 'butterfly', name: 'Butterfly', icon: '🦋', rarity: 'rare' },
    { id: 'glitter', name: 'Glitter Dots', icon: '💎', rarity: 'epic' },
    { id: 'bandage', name: 'Cute Bandage', icon: '🩹', rarity: 'common' },
  ],
};
export const STICKER_IDS = ['star', 'heart', 'sparkle', 'rainbow', 'moon', 'butterfly', 'glitter', 'bandage'] as const;

/** A fully-specified face (what the character builds from). */
export interface ResolvedFace {
  eyes: number;
  eyeColor: string;
  brows: number;
  freckles: boolean;
  makeup: number;
  sticker: string | null;
}
export const DEFAULT_EYE_COLOR = EYE_COLORS[0].hex;
const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
/** Fill defaults and clamp out-of-range values (old saves, hand-edited data). */
export function resolveFace(f?: FaceOpts | null): ResolvedFace {
  const clampI = (v: unknown, n: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(n - 1, Math.max(0, Math.round(v))) : 0);
  return {
    eyes: clampI(f?.eyes, EYE_SHAPES.length),
    eyeColor: isHex(f?.eyeColor) ? (f!.eyeColor as string) : DEFAULT_EYE_COLOR,
    brows: clampI(f?.brows, BROWS.length),
    freckles: !!f?.freckles,
    makeup: clampI(f?.makeup, 5),
    sticker: typeof f?.sticker === 'string' && (STICKER_IDS as readonly string[]).includes(f.sticker) ? f.sticker : null,
  };
}
/** A stable key for "did the face change?" checks. */
export const faceKey = (f?: FaceOpts | null): string => {
  const r = resolveFace(f);
  return `${r.eyes}|${r.eyeColor.toLowerCase()}|${r.brows}|${r.freckles ? 1 : 0}|${r.makeup}|${r.sticker ?? ''}`;
};
/** A random (tasteful) face for the Random button. */
export function randomFace(rnd: () => number = Math.random): FaceOpts {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  return {
    eyes: Math.floor(rnd() * EYE_SHAPES.length),
    eyeColor: pick(EYE_COLORS).hex,
    brows: Math.floor(rnd() * BROWS.length),
    freckles: rnd() < 0.3,
    makeup: rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 4),
    sticker: rnd() < 0.3 ? pick(STICKER_IDS) : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Eyes
// ═════════════════════════════════════════════════════════════════════════════
export interface EyeSpec {
  A: number; // half width
  Hu: number; // upper half height
  Hl: number; // lower half height
  tilt: number; // outer corner raise (slope)
  az: number; // dome height
  irisR: number;
  irisY: number; // iris center height (the upper lid covers its top)
  lashR: number; // lash line radius
  flick: [number, number, number]; // length, rise, radius of the outer-corner flick (0 = none)
  star: boolean; // a four-point sparkle catchlight
}
/** The five eye shapes. Every iris is 90%+ of the opening height, so no white shows above / below it. */
export const EYE_SHAPES: EyeSpec[] = [
  { A: EYE.A, Hu: EYE.Hu, Hl: EYE.Hl, tilt: EYE.tilt, az: EYE.az, irisR: EYE.irisR, irisY: EYE.irisY, lashR: 0.0027, flick: [0.0125, 0.0062, 0.0027], star: false }, // almond (default)
  { A: 0.0238, Hu: 0.0212, Hl: 0.0178, tilt: 0, az: 0.0088, irisR: 0.0188, irisY: 0.0018, lashR: 0.0024, flick: [0, 0, 0], star: false }, // round
  { A: 0.0268, Hu: 0.0158, Hl: 0.0132, tilt: -0.05, az: 0.0082, irisR: 0.0142, irisY: 0.0008, lashR: 0.0035, flick: [0, 0, 0], star: false }, // sleepy
  { A: 0.0278, Hu: 0.0182, Hl: 0.0122, tilt: 0.27, az: 0.0084, irisR: 0.0148, irisY: 0.0028, lashR: 0.0029, flick: [0.0195, 0.0125, 0.0029], star: false }, // cat-eye flick
  { A: 0.0286, Hu: 0.0228, Hl: 0.0172, tilt: 0.1, az: 0.009, irisR: 0.0192, irisY: 0.0036, lashR: 0.0032, flick: [0.0095, 0.0045, 0.0026], star: true }, // sparkle-big
];
/** Iris diameter / opening height — the "no white above or below" rule (>= 0.9 for every shape). */
export const eyeCoverage = (shape: number): number => {
  const s = EYE_SHAPES[Math.min(EYE_SHAPES.length - 1, Math.max(0, shape))];
  return (2 * s.irisR) / (s.Hu + s.Hl);
};

const hOf = (s: EyeSpec, yp: number) => (yp >= 0 ? s.Hu : s.Hl);
const domeZ = (s: EyeSpec, x: number, y: number): number => {
  const yp = y - s.tilt * x;
  return s.az * Math.sqrt(Math.max(0, 1 - (x / s.A) ** 2 - (yp / hOf(s, yp)) ** 2));
};
const outline = (s: EyeSpec) => (rho: number, a: number): [number, number] => {
  const x = rho * s.A * Math.cos(a);
  const yp = rho * hOf(s, Math.sin(a)) * Math.sin(a);
  return [x, yp + s.tilt * x];
};
const circleAt = (rx: number, ry: number, cx: number, cy: number) => (rho: number, a: number): [number, number] => [cx + rx * rho * Math.cos(a), cy + ry * rho * Math.sin(a)];

/** A disc of vertices draped over the eye dome (+ lift), with optional per-ring colors. */
function drapedDisc(s: EyeSpec, place: (rho: number, a: number) => [number, number], lift: number, rings: number, seg: number, shade?: (r: number) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const put = (rho: number, a: number) => {
    const [x, y] = place(rho, a);
    pos.push(x, y, domeZ(s, x, y) + lift);
    uv.push(0, 0);
    const c = shade ? shade(rho) : new THREE.Color(1, 1, 1);
    col.push(c.r, c.g, c.b);
  };
  put(0, 0);
  for (let r = 1; r <= rings; r++) for (let k = 0; k < seg; k++) put(r / rings, (k / seg) * TAU);
  for (let k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + ((k + 1) % seg));
  for (let r = 1; r < rings; r++) for (let k = 0; k < seg; k++) {
    const a = 1 + (r - 1) * seg + k, b = 1 + (r - 1) * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface EyeKit {
  eye: THREE.BufferGeometry; // sclera dome + lash line + flick (baked colors), the +x eye (mirrored by its bone)
  irisOuter: THREE.BufferGeometry; // white: tinted by the chunk color (the dark outer ring, lid shadow)
  irisInner: THREE.BufferGeometry; // white: tinted by the eye color
  detail: [THREE.BufferGeometry, THREE.BufferGeometry]; // pupil + catchlights (baked colors) for the [+x, -x] eye
}
const kitCache = new Map<number, EyeKit>();
export function getEyeKit(shape: number): EyeKit {
  const si = Math.min(EYE_SHAPES.length - 1, Math.max(0, shape));
  const hit = kitCache.get(si);
  if (hit) return hit;
  const s = EYE_SHAPES[si];
  // sclera: soft-shaded white almond dome + a thick upper lash line (+ flick)
  const eye = new GB(true, true);
  const white = new THREE.Color(FACE_COL.sclera), edge = new THREE.Color(FACE_COL.scleraEdge);
  eye.add(drapedDisc(s, outline(s), 0, 4, 20, (r) => white.clone().lerp(edge, Math.pow(r, 3))), { vc: true }, true);
  const lash = lashPoints(s, 0.955);
  eye.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lash), 18, s.lashR, 4, false), { c: FACE_COL.lash }, true);
  const first = lash[0], last = lash[lash.length - 1];
  for (const p of [first, last]) eye.e([p.x, p.y, p.z], s.lashR, undefined, FACE_COL.lash);
  if (s.flick[0] > 0) {
    const [len, rise, fr] = s.flick;
    eye.add(loft((t) => [first.x + len * t, first.y + rise * 0.1 * t + rise * t * t, first.z - 0.0016 * t], (t) => fr * (1 - 0.8 * t), (t) => fr * 0.9 * (1 - 0.8 * t), 0, 0.5, 8, 6), { c: FACE_COL.lash }, true);
  }
  // iris: two concentric discs (the dark one peeks out on top = lid shadow)
  const R = s.irisR;
  const outer = drapedDisc(s, circleAt(R * 0.98, R, 0, s.irisY), 0.0007, 3, 18);
  const inner = drapedDisc(s, circleAt(R * 0.86, R * 0.8, 0, s.irisY - R * 0.17), 0.0013, 2, 18);
  const detail = (sg: number): THREE.BufferGeometry => {
    const b = new GB(true, true);
    b.add(drapedDisc(s, circleAt(R * 0.47, R * 0.47, 0, s.irisY - 0.0005), 0.0019, 2, 12), { c: FACE_COL.pupil, vc: true }, true);
    const c1 = s.star ? 0.0038 : 0.0032;
    if (s.star) {
      // a four-point sparkle catchlight + a round one
      const star = (rho: number, a: number): [number, number] => {
        const rr = c1 * (0.3 + 0.7 * Math.pow(Math.abs(Math.cos(2 * a)), 2.2));
        return [-0.0072 * sg + rho * rr * Math.cos(a), s.irisY + R * 0.5 + rho * rr * Math.sin(a)];
      };
      b.add(drapedDisc(s, star, 0.0025, 3, 24), { c: '#ffffff', vc: true }, true);
      b.add(drapedDisc(s, circleAt(0.0017, 0.0017, 0.0072 * sg, s.irisY - R * 0.55), 0.0025, 1, 8), { c: '#ffffff', vc: true }, true);
      b.add(drapedDisc(s, circleAt(0.0011, 0.0011, 0.0038 * sg, s.irisY + R * 0.62), 0.0025, 1, 8), { c: '#fff1b8', vc: true }, true);
    } else {
      b.add(drapedDisc(s, circleAt(c1, c1, -0.0066 * sg, s.irisY + R * 0.27), 0.0025, 1, 10), { c: '#ffffff', vc: true }, true);
      b.add(drapedDisc(s, circleAt(0.0015, 0.0015, 0.006 * sg, s.irisY - R * 0.63), 0.0025, 1, 8), { c: '#ffffff', vc: true }, true);
    }
    return b.build();
  };
  const kit: EyeKit = { eye: eye.build(), irisOuter: outer, irisInner: inner, detail: [detail(1), detail(-1)] };
  kitCache.set(si, kit);
  return kit;
}
/** Points along the upper eye edge (corner to corner) at ring `rho`, lying on the dome. */
function lashPoints(s: EyeSpec, rho: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const place = outline(s);
  for (let i = 0; i <= 16; i++) {
    const a = ((6 + (168 * i) / 16) * Math.PI) / 180;
    const [x, y] = place(rho, a);
    out.push(new THREE.Vector3(x, y, domeZ(s, x, y) + 0.0004));
  }
  return out;
}

/** The eye color as two tints: the dark outer ring and the bright inner disc. */
export function eyeTints(hex: string): { outer: THREE.Color; inner: THREE.Color } {
  return { outer: new THREE.Color(tint(hex, -0.62)), inner: new THREE.Color(hex) };
}

// ═════════════════════════════════════════════════════════════════════════════
// Brows
// ═════════════════════════════════════════════════════════════════════════════
interface BrowSpec {
  path: (t: number) => V3t; // +x brow: inner end at t = 0, tail at t = 1
  ry: (t: number) => number;
  rz: (t: number) => number;
  capOut: number;
}
const BROWS: BrowSpec[] = [
  // 0 soft arch (default)
  { path: (t) => [-0.0225 + 0.049 * t, 0.0044 * Math.sin(Math.PI * Math.pow(t, 0.85)) - 0.0018 * t, 0], ry: (t) => 0.0052 - 0.0026 * t, rz: (t) => 0.0046 - 0.002 * t, capOut: 0.3 },
  // 1 straight
  { path: (t) => [-0.0225 + 0.049 * t, 0.0006 * Math.sin(Math.PI * t) + 0.0016 * t, 0], ry: (t) => 0.0056 - 0.0014 * t, rz: (t) => 0.0048 - 0.0012 * t, capOut: 0.16 },
  // 2 high arch (thinner)
  { path: (t) => [-0.0215 + 0.047 * t, 0.0078 * Math.sin(Math.PI * Math.pow(t, 0.9)) - 0.0038 * t, 0], ry: (t) => 0.0042 - 0.002 * t, rz: (t) => 0.0038 - 0.0016 * t, capOut: 0.3 },
  // 3 bold (thick, confident, rising a little toward the tail)
  { path: (t) => [-0.0235 + 0.052 * t, -0.0016 + 0.0042 * t + 0.0012 * Math.sin(Math.PI * t), 0], ry: (t) => 0.0068 - 0.0022 * t, rz: (t) => 0.0058 - 0.0018 * t, capOut: 0.2 },
  // 4 slim + short, gently lifted at the inner end (sweet, wide-eyed)
  { path: (t) => [-0.0165 + 0.034 * t, 0.0012 + 0.0026 * Math.sin(Math.PI * t) - 0.0032 * t, 0], ry: (t) => 0.0034 - 0.0011 * t, rz: (t) => 0.003 - 0.001 * t, capOut: 0.34 },
];
export function getBrowGeo(style: number): THREE.BufferGeometry {
  const st = Math.min(BROWS.length - 1, Math.max(0, style));
  return cached(`brow|${st}`, () => {
    const b = BROWS[st];
    return new GB(false, true).add(loft(b.path, b.ry, b.rz, 0.12, b.capOut, 14, 8), {}, true).build();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Freckles (baked dots on the nose bridge and cheeks)
// ═════════════════════════════════════════════════════════════════════════════
const FRECKLES: [number, number, number][] = [
  [8, -4.5, 1], [12.5, -7, 0.85], [17, -4, 1.1], [20.5, -9.5, 0.9], [25, -6.5, 1.15], [29, -11, 0.85], [15, -12.5, 1], [33, -8, 0.8], [22, -14.5, 0.9], [11, -9.5, 0.8],
];
export function frecklesGeo(): THREE.BufferGeometry {
  return cached('freckles', () => {
    const b = new GB(false, true);
    for (const sd of [-1, 1]) {
      FRECKLES.forEach(([th, ph, k], i) => {
        const { p, n } = facePoint(th * sd + (i % 3 - 1) * 0.6, ph, 0.0007);
        b.add(new THREE.CircleGeometry(0.0019 * k, 6), { p: [p.x, p.y, p.z], q: frameQ(n) });
      });
    }
    return b.build();
  });
}
/** Freckle color: the skin tone pushed toward a warm brown. */
export function freckleColor(skinHex: string): THREE.Color {
  return new THREE.Color(skinHex).lerp(new THREE.Color('#7a3b1e'), 0.5);
}

// ═════════════════════════════════════════════════════════════════════════════
// Makeup (eye extras ride the eye bones, so they close with the blink)
// ═════════════════════════════════════════════════════════════════════════════
/** Head z (eye space) of the skin around an eye — for flat patches that must sit on the skin. */
const skinZ = (x: number, y: number) => EYE.sink - (x * x) / (2 * 0.098) - (y * y) / (2 * 0.128) + 0.0008;
function patch(place: (rho: number, a: number) => [number, number], rings: number, seg: number, shade: (r: number) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const put = (rho: number, a: number) => {
    const [x, y] = place(rho, a);
    pos.push(x, y, skinZ(x, y));
    uv.push(0, 0);
    const c = shade(rho);
    col.push(c.r, c.g, c.b);
  };
  put(0, 0);
  for (let r = 1; r <= rings; r++) for (let k = 0; k < seg; k++) put(r / rings, (k / seg) * TAU);
  for (let k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + ((k + 1) % seg));
  for (let r = 1; r < rings; r++) for (let k = 0; k < seg; k++) {
    const a = 1 + (r - 1) * seg + k, b = 1 + (r - 1) * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const starPts = (cx: number, cy: number, rOut: number, rIn: number, rot = Math.PI / 2): THREE.Vector2[] => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, r = i % 2 === 0 ? rOut : rIn;
    pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
};
/** A flat shape lying on the skin around an eye (z follows the skin). */
function skinShape(shape: THREE.Shape, color: string): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 6);
  const p = g.attributes.position;
  const c = new THREE.Color(color);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, skinZ(p.getX(i), p.getY(i)) + 0.0004);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  g.computeVertexNormals();
  return g;
}
const merge = (gs: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const m = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of gs) g.dispose();
  return m;
};
/** Makeup that sits around the eye (null for presets without any). Colors are baked; use the glossy 'eyes' bucket. */
export function getEyeMakeup(preset: number, shape: number): THREE.BufferGeometry | null {
  if (preset !== 3 && preset !== 4) return null;
  const si = Math.min(EYE_SHAPES.length - 1, Math.max(0, shape));
  return cached(`eyemk|${preset}|${si}`, () => {
    const s = EYE_SHAPES[si];
    const parts: THREE.BufferGeometry[] = [];
    if (preset === 3) {
      // shimmer lids: a soft rose-gold wash above the lash line, with a few gold sparkles
      const cy = s.Hu + 0.0082, cx = 0.001;
      const rose = new THREE.Color('#f2a9b4'), gold = new THREE.Color('#fbdca4');
      parts.push(patch((rho, a) => {
        const x = cx + s.A * 0.95 * rho * Math.cos(a);
        return [x, cy + 0.0088 * rho * Math.sin(a) + s.tilt * (x - cx) * 0.8];
      }, 3, 20, (r) => gold.clone().lerp(rose, Math.pow(r, 1.6))));
      for (const [dx, dy, r] of [[-0.011, 0.0, 0.0012], [-0.003, 0.004, 0.0015], [0.006, 0.0005, 0.0011], [0.013, 0.0035, 0.0013], [0.0, -0.0035, 0.001]] as [number, number, number][]) {
        const sp = new THREE.Shape().absarc(cx + dx, cy + dy + s.tilt * dx * 0.8, r, 0, TAU, false);
        const g = skinShape(sp, '#fff6cf');
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.0006);
        parts.push(g);
      }
    } else {
      // star liner: a thicker liner line with a long wing, and a tiny gold star at the outer corner
      const lp = lashPoints(s, 1.0);
      parts.push(new GB(true, true).add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp.map((p) => new THREE.Vector3(p.x, p.y + 0.0004, p.z + 0.0006))), 18, s.lashR * 1.35, 4, false), { c: FACE_COL.lash }, true).build());
      const f = lp[0];
      parts.push(new GB(true, true).add(loft((t) => [f.x + 0.021 * t, f.y + 0.001 * t + 0.0105 * t * t, f.z - 0.002 * t], (t) => s.lashR * 1.35 * (1 - 0.82 * t), (t) => s.lashR * 1.2 * (1 - 0.82 * t), 0, 0.5, 9, 6), { c: FACE_COL.lash }, true).build());
      const sx = s.A + 0.0125, sy = s.tilt * s.A + 0.0085;
      parts.push(skinShape(new THREE.Shape(starPts(sx, sy, 0.0052, 0.0022)), '#ffc83a'));
    }
    return merge(parts);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Face stickers (flat art draped on the cheek, in the glossy 'eyes' bucket)
// ═════════════════════════════════════════════════════════════════════════════
/** Drape a 2D shape (meters, y up) onto the head surface around (theta°, phi°), rotated by `rot` degrees. */
function drapeHead(g2: THREE.BufferGeometry, th0: number, ph0: number, rotDeg: number, color: string, lift = 0.0016): THREE.BufferGeometry {
  const pos = g2.attributes.position;
  const n = pos.count;
  const out = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  const rot = rotDeg * D2R, cs = Math.cos(rot), sn = Math.sin(rot);
  const th0r = th0 * D2R, ph0r = ph0 * D2R;
  const Rth = Math.hypot(B.HX * Math.cos(th0r), B.HZ * Math.sin(th0r)) * Math.cos(ph0r);
  const Rph = B.HY * 0.95;
  for (let i = 0; i < n; i++) {
    const x0 = pos.getX(i), y0 = pos.getY(i);
    const x = x0 * cs - y0 * sn, y = x0 * sn + y0 * cs;
    const { p, n: nn } = facePoint(th0 + x / Rth / D2R, ph0 + y / Rph / D2R, lift);
    out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
    nrm[i * 3] = nn.x; nrm[i * 3 + 1] = nn.y; nrm[i * 3 + 2] = nn.z;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g2.index) g.setIndex(g2.index.clone());
  return g;
}
const shapeGeo = (s: THREE.Shape) => {
  const g = new THREE.ShapeGeometry(s, 8);
  g.deleteAttribute('normal');
  return g;
};
const circleShape = (x: number, y: number, r: number) => {
  const s = new THREE.Shape();
  s.absarc(x, y, r, 0, TAU, false);
  return shapeGeo(s);
};
const polyShape = (pts: THREE.Vector2[]) => shapeGeo(new THREE.Shape(pts));
const sparkle = (cx: number, cy: number, r: number): THREE.Vector2[] => {
  // four-point sparkle
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, rr = i % 2 === 0 ? r : r * 0.28;
    pts.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)));
  }
  return pts;
};
const heartShape = (s: number): THREE.Shape => {
  const h = new THREE.Shape();
  h.moveTo(0, -0.62 * s);
  h.bezierCurveTo(-0.15 * s, -0.4 * s, -0.95 * s, -0.1 * s, -0.95 * s, 0.34 * s);
  h.bezierCurveTo(-0.95 * s, 0.7 * s, -0.4 * s, 0.82 * s, 0, 0.42 * s);
  h.bezierCurveTo(0.4 * s, 0.82 * s, 0.95 * s, 0.7 * s, 0.95 * s, 0.34 * s);
  h.bezierCurveTo(0.95 * s, -0.1 * s, 0.15 * s, -0.4 * s, 0, -0.62 * s);
  return h;
};
const arcBand = (r0: number, r1: number, a0: number, a1: number): THREE.BufferGeometry => {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, a0, a1, false);
  s.absarc(0, 0, r0, a1, a0, true);
  return shapeGeo(s);
};
const rrect = (w: number, h: number, r: number): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - r);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + r);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};

const CHEEK = { th: 38, ph: -13 };
export function getStickerGeo(id: string): THREE.BufferGeometry | null {
  if (!(STICKER_IDS as readonly string[]).includes(id)) return null;
  return cached(`sticker|${id}`, () => {
    const L: THREE.BufferGeometry[] = [];
    const at = (g: THREE.BufferGeometry, th: number, ph: number, rot: number, color: string, lift = 0.0016) => L.push(drapeHead(g, th, ph, rot, color, lift));
    switch (id) {
      case 'star':
        at(polyShape(starPts(0, 0, 0.0145, 0.0065)), CHEEK.th, CHEEK.ph, -12, '#ffcf3a');
        at(polyShape(starPts(0, 0, 0.0075, 0.0034)), CHEEK.th, CHEEK.ph, -12, '#fff0a8', 0.0021);
        break;
      case 'heart':
        at(shapeGeo(heartShape(0.0135)), CHEEK.th, CHEEK.ph, 10, '#ff4f9a');
        at(circleShape(-0.0048, 0.0062, 0.0021), CHEEK.th, CHEEK.ph, 10, '#ffd6ea', 0.0021);
        break;
      case 'sparkle':
        for (const sd of [-1, 1]) {
          at(polyShape(sparkle(0, 0, 0.0115)), CHEEK.th * sd, CHEEK.ph, 0, '#fff4c2');
          at(polyShape(sparkle(0, 0, 0.0062)), (CHEEK.th - 6) * sd, CHEEK.ph + 5.5, 0, '#ffe08a', 0.0019);
          at(polyShape(sparkle(0, 0, 0.0048)), (CHEEK.th + 5) * sd, CHEEK.ph - 6, 0, '#ffffff', 0.0019);
        }
        break;
      case 'rainbow': {
        const cols = ['#ff4b5c', '#ff9f3d', '#ffe14d', '#4cc9a0', '#4d8dff'];
        cols.forEach((c, i) => at(arcBand(0.0148 - (i + 1) * 0.0024, 0.0148 - i * 0.0024 + 0.0002, 0, Math.PI), CHEEK.th, CHEEK.ph + 2, 8, c, 0.0016 + i * 0.00005));
        at(circleShape(-0.0125, -0.0012, 0.0036), CHEEK.th, CHEEK.ph + 2, 8, '#ffffff', 0.0021);
        at(circleShape(0.0125, -0.0012, 0.0036), CHEEK.th, CHEEK.ph + 2, 8, '#ffffff', 0.0021);
        break;
      }
      case 'moon': {
        const s = new THREE.Shape();
        s.absarc(0, 0, 0.0135, 0.5, TAU - 0.5, false);
        s.absarc(0.0062, 0, 0.0108, TAU - 0.9, 0.9, true);
        at(shapeGeo(s), CHEEK.th, CHEEK.ph, -20, '#ffe27a');
        at(polyShape(starPts(0.0085, 0.0075, 0.0042, 0.0019)), CHEEK.th, CHEEK.ph, -20, '#fff6c4', 0.0021);
        break;
      }
      case 'butterfly': {
        for (const sd of [-1, 1]) {
          const up = new THREE.Shape();
          up.absellipse(sd * 0.0072, 0.0058, 0.0072, 0.0092, 0, TAU, false, sd * 0.5);
          const lo = new THREE.Shape();
          lo.absellipse(sd * 0.0052, -0.0058, 0.0052, 0.0066, 0, TAU, false, -sd * 0.4);
          at(shapeGeo(up), CHEEK.th, CHEEK.ph, 0, '#a06bff');
          at(shapeGeo(lo), CHEEK.th, CHEEK.ph, 0, '#ff7fc8', 0.0017);
        }
        at(shapeGeo(rrect(0.0032, 0.017, 0.0016)), CHEEK.th, CHEEK.ph, 0, '#3a2748', 0.0022);
        break;
      }
      case 'glitter': {
        const cols = ['#ffe14d', '#ff7fc8', '#7fe0ff', '#c9a6ff', '#ffffff'];
        let k = 0;
        for (const sd of [-1, 1]) {
          for (const [th, ph, r] of [[30, -7, 0.0022], [34, -9.5, 0.0017], [38, -6, 0.0021], [41, -10, 0.0016], [33, -13, 0.0014], [37.5, -14, 0.0019], [44, -7.5, 0.0013], [28.5, -11, 0.0012]] as [number, number, number][]) {
            at(circleShape(0, 0, r), th * sd, ph, 0, cols[k++ % cols.length], 0.0017);
          }
        }
        break;
      }
      case 'bandage': {
        at(shapeGeo(rrect(0.0385, 0.0125, 0.006)), 34, -9, 32, '#efc596');
        at(shapeGeo(rrect(0.0145, 0.0112, 0.0008)), 34, -9, 32, '#fbe4c6', 0.0021);
        for (const dx of [-0.0135, 0.0135]) for (const dy of [-0.0026, 0.0026]) at(circleShape(dx, dy, 0.0009), 34, -9, 32, '#d49b6b', 0.0021);
        break;
      }
    }
    return merge(L);
  });
}
