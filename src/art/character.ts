// Chibi toy character, built entirely from rounded meshes and driven by an
// Outfit. Used by the profile picker, the dress-up boutique, the car (seated)
// and waving passengers.
//
// Proportions (units; origin at the feet, facing +z, ~1.7 tall):
//   head = ~40% of the height, round body, short arms with mitten hands,
//   short legs, chunky shoes. Everything is a capsule / sphere / lathe /
//   rounded box. Geometry is merged per outfit piece and CACHED, so many
//   characters (town passengers) share the same vertex buffers + materials.
//
// Rig:   group > rig > { legs(hip>knee>ankle), torso, arms(shoulder>elbow>wrist), head }
// Slots: each outfit slot owns "mounts" (empty groups) that are cleared and
//        refilled when that slot changes, so setOutfit() rebuilds only what
//        changed. partObject(slot) returns a proxy whose scale drives all the
//        mounts of that slot (juice's popScale works on it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Outfit } from '../core/model';
import type { OutfitSlot } from '../core/events';
import { toyMat, roundedBox, type Finish } from './materials';
import { tuning } from '../tuning';

// ═════════════════════════════════════════════════════════════════════════════
// Catalog (indices are saved in profiles — only ever APPEND to these lists)
// ═════════════════════════════════════════════════════════════════════════════
export type CatalogSlot = 'hair' | 'top' | 'bottom' | 'shoes' | 'accessory';
export const OUTFIT_CATALOG: Record<CatalogSlot, { name: string; icon: string }[]> = {
  hair: [
    { name: 'Short', icon: '💇' }, { name: 'Bob', icon: '👧' }, { name: 'Ponytail', icon: '🎀' },
    { name: 'Spiky', icon: '⚡' }, { name: 'Long', icon: '👱' }, { name: 'Buns', icon: '🍡' },
    { name: 'Curly', icon: '👩‍🦱' }, { name: 'Pigtails', icon: '👯' },
  ],
  top: [
    { name: 'Tee', icon: '👕' }, { name: 'Hoodie', icon: '🧥' }, { name: 'Tank', icon: '🎽' },
    { name: 'Dress', icon: '👗' }, { name: 'Jacket', icon: '🥼' }, { name: 'Stripes', icon: '👚' },
  ],
  bottom: [
    { name: 'Pants', icon: '👖' }, { name: 'Shorts', icon: '🩳' }, { name: 'Skirt', icon: '🩱' },
    { name: 'Leggings', icon: '🦵' }, { name: 'Overalls', icon: '🧑‍🌾' },
  ],
  shoes: [
    { name: 'Sneakers', icon: '👟' }, { name: 'Boots', icon: '🥾' }, { name: 'Sandals', icon: '🩴' },
    { name: 'High-tops', icon: '🏀' }, { name: 'Slippers', icon: '🐰' },
  ],
  accessory: [
    { name: 'None', icon: '🚫' }, { name: 'Glasses', icon: '👓' }, { name: 'Cap', icon: '🧢' },
    { name: 'Bow', icon: '🎀' }, { name: 'Headphones', icon: '🎧' }, { name: 'Crown', icon: '👑' },
    { name: 'Flower', icon: '🌸' }, { name: 'Beanie', icon: '🧶' }, { name: 'Cat Ears', icon: '🐱' },
  ],
};

const TOP_DRESS = 3, TOP_COUNT = 6;
const BOTTOM_OVERALLS = 4;
const ACC_GLASSES = 1, ACC_CAP = 2, ACC_BOW = 3, ACC_PHONES = 4, ACC_CROWN = 5, ACC_FLOWER = 6, ACC_BEANIE = 7, ACC_EARS = 8;

// ═════════════════════════════════════════════════════════════════════════════
// Geometry helpers
// ═════════════════════════════════════════════════════════════════════════════
type V3t = [number, number, number];
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const f3 = (n: number) => n.toFixed(3);

/** Unit sphere (scale it into an ellipsoid). */
const sph = () => cached('sph', () => new THREE.SphereGeometry(1, 18, 11));
const sphLo = () => cached('sphLo', () => new THREE.SphereGeometry(1, 12, 8));
const capsule = (r: number, len: number) =>
  cached(`cap|${f3(r)}|${f3(len)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 4, 12));
const torus = (R: number, r: number, arc = TAU) =>
  cached(`tor|${f3(R)}|${f3(r)}|${f3(arc)}`, () => new THREE.TorusGeometry(R, r, r < 0.03 ? 6 : 8, arc < TAU ? 16 : R < 0.15 ? 18 : 28, arc));
/** Rounded cone along +y from 0 to 1 (base radius 0.5) — spikes, ears, petals. */
const spike = () =>
  cached('spike', () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const y = i / 14;
      pts.push(new THREE.Vector2(0.5 * Math.pow(Math.max(0, 1 - y * y), 0.72), y));
    }
    return new THREE.LatheGeometry(pts, 16);
  });

interface Xf {
  p?: V3t;
  s?: number | V3t;
  r?: V3t;
  q?: THREE.Quaternion;
  c?: string;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Geometry builder: collects transformed copies of primitives, merges them. */
class GB {
  private parts: THREE.BufferGeometry[] = [];
  private colored: boolean;
  private lo: boolean;
  constructor(colored = false, lo = false) {
    this.colored = colored;
    this.lo = lo;
  }
  add(g: THREE.BufferGeometry, x: Xf = {}, owned = false): this {
    const c = owned ? g : g.clone();
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    if (x.q) _q.copy(x.q);
    else if (x.r) _q.setFromEuler(_e.set(x.r[0], x.r[1], x.r[2]));
    else _q.identity();
    const s = x.s ?? 1;
    if (typeof s === 'number') _s.set(s, s, s);
    else _s.set(s[0], s[1], s[2]);
    _p.set(x.p?.[0] ?? 0, x.p?.[1] ?? 0, x.p?.[2] ?? 0);
    c.applyMatrix4(_m.compose(_p, _q, _s));
    if (this.colored) {
      const col = new THREE.Color(x.c ?? '#ffffff');
      const n = c.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = col.r;
        arr[i * 3 + 1] = col.g;
        arr[i * 3 + 2] = col.b;
      }
      c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    this.parts.push(c);
    return this;
  }
  /** Ellipsoid. */
  e(p: V3t, s: V3t | number, r?: V3t, c?: string): this {
    const m = typeof s === 'number' ? s : Math.max(s[0], s[1], s[2]);
    return this.add(m < 0.075 || this.lo ? sphLo() : sph(), { p, s, r, c });
  }
  /** Capsule between two points. */
  seg(a: V3t, b: V3t, rad: number, c?: string): this {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.normalize());
    const m = A.add(B).multiplyScalar(0.5);
    return this.add(capsule(rad, len - 2 * rad), { p: [m.x, m.y, m.z], q, c });
  }
  /** Horizontal ring (axis y) at height y. */
  ring(y: number, R: number, tube: number, c?: string): this {
    return this.add(torus(R, tube), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], c });
  }
  /** Ring centered at `p` whose axis points along `axis`. */
  ringAt(p: V3t, axis: V3t, R: number, tube: number, c?: string): this {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize());
    return this.add(torus(R, tube), { p, q, c });
  }
  /** Rounded spike pointing along `dir` from `base`. */
  spk(base: V3t, dir: V3t, len: number, rad: number, c?: string): this {
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, new THREE.Vector3(...dir).normalize());
    return this.add(spike(), { p: base, s: [rad * 2, len, rad * 2], q, c });
  }
  get empty(): boolean {
    return this.parts.length === 0;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

// ── Pieces: a set of geometries, each tagged with a color ROLE ──────────────
type Role = 'main' | 'trim' | 'dark' | 'white' | 'gold' | 'skin' | 'ink' | 'pink' | 'leaf';
interface Piece {
  geo: THREE.BufferGeometry;
  role: Role;
}
class PB {
  private m = new Map<Role, GB>();
  private lo: boolean;
  constructor(lo = false) {
    this.lo = lo;
  }
  at(role: Role = 'main'): GB {
    let g = this.m.get(role);
    if (!g) this.m.set(role, (g = new GB(false, this.lo)));
    return g;
  }
  done(post?: (g: THREE.BufferGeometry) => void): Piece[] {
    const out: Piece[] = [];
    for (const [role, gb] of this.m) {
      if (gb.empty) continue;
      const geo = gb.build();
      post?.(geo);
      out.push({ geo, role });
    }
    return out;
  }
}
const pieceCache = new Map<string, Piece[]>();
function pieces(key: string, fn: (pb: PB) => void, post?: (g: THREE.BufferGeometry) => void, lo = false): Piece[] {
  let p = pieceCache.get(key);
  if (!p) {
    const pb = new PB(lo);
    fn(pb);
    p = pb.done(post);
    pieceCache.set(key, p);
  }
  return p;
}

/** Lighten (amount > 0) or darken (amount < 0) a hex color. */
function tint(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#2d2438'), Math.min(1, Math.abs(amount)));
  return `#${c.getHexString()}`;
}

function roleMat(role: Role, color: string, skin: string, finish: Finish): THREE.Material {
  switch (role) {
    case 'main': return toyMat(color, finish);
    case 'trim': return toyMat(tint(color, 0.38), finish === 'fabric' ? 'satin' : finish);
    case 'dark': return toyMat(tint(color, -0.38), finish);
    case 'white': return toyMat('#fffafc', 'gloss');
    case 'gold': return toyMat('#ffd166', 'metal');
    case 'skin': return toyMat(skin, 'satin');
    case 'ink': return toyMat('#3d3a4b', 'gloss');
    case 'pink': return toyMat('#ffa3c2', 'satin');
    case 'leaf': return toyMat('#5fd3a5', 'gloss');
  }
}

// ── Torso profile (shirts and pants hug this) ───────────────────────────────
const TY = 0.44; // torso group pivot (pelvis bottom)
const TZ = 0.88; // torso is a bit flatter front-to-back
const TORSO_PTS: [number, number][] = [
  [0.0, 0.4], [0.14, 0.41], [0.225, 0.45], [0.262, 0.52], [0.262, 0.6], [0.248, 0.7],
  [0.232, 0.79], [0.2, 0.87], [0.15, 0.92], [0.105, 0.96], [0.09, 1.02], [0.0, 1.03],
];
const TORSO_TABLE: { r: number; y: number }[] = new THREE.SplineCurve(TORSO_PTS.map(([r, y]) => new THREE.Vector2(r, y)))
  .getPoints(160)
  .map((p) => ({ r: Math.max(0, p.x), y: p.y }));
/** Radius of the skin torso at height y. */
function bodyR(y: number): number {
  const t = TORSO_TABLE;
  if (y <= t[0].y) return t[0].r;
  for (let i = 1; i < t.length; i++) {
    if (y <= t[i].y) {
      const k = (y - t[i - 1].y) / Math.max(1e-6, t[i].y - t[i - 1].y);
      return t[i - 1].r + (t[i].r - t[i - 1].r) * k;
    }
  }
  return t[t.length - 1].r;
}
/** Lathe shell hugging the torso between two heights. */
function shell(gb: GB, y0: number, y1: number, off: number | ((y: number) => number), step = 0.04): void {
  const pts: THREE.Vector2[] = [];
  for (let y = y0; y < y1 - 1e-6; y += step) pts.push(new THREE.Vector2(bodyR(y) + (typeof off === 'number' ? off : off(y)), y));
  pts.push(new THREE.Vector2(bodyR(y1) + (typeof off === 'number' ? off : off(y1)), y1));
  gb.add(new THREE.LatheGeometry(pts, 28), {}, true);
}
/** Lathe from a smooth custom [r,y] profile (skirts, dresses). */
function flare(gb: GB, pts: [number, number][], samples = 22): void {
  // LatheGeometry wants the profile bottom → top so normals face outward
  const sorted = [...pts].sort((a, b) => a[1] - b[1]);
  const c = new THREE.SplineCurve(sorted.map(([r, y]) => new THREE.Vector2(r, y)));
  gb.add(new THREE.LatheGeometry(c.getPoints(samples), 28), {}, true);
}
/** Torso-space post-process (flatten front-to-back, pivot at TY). */
const torsoSpace = (g: THREE.BufferGeometry) => {
  g.scale(1, 1, TZ);
  g.translate(0, -TY, 0);
};

// ── Head (all face + hair + hats live in "head space": origin = head center) ─
const HX = 0.41, HY = 0.355, HZ = 0.385;
const NECK_Y = 0.9; // neck pivot (rig space)
const HEAD_CY = 0.3; // head center above the neck pivot  → rig y = 1.2

function facePoint(thDeg: number, phDeg: number, off = 0, k = 1): { p: THREE.Vector3; n: THREE.Vector3 } {
  const t = thDeg * D2R, f = phDeg * D2R;
  const sx = Math.sin(t) * Math.cos(f), sy = Math.sin(f), sz = Math.cos(t) * Math.cos(f);
  const n = new THREE.Vector3(sx / HX, sy / HY, sz / HZ).normalize();
  const p = new THREE.Vector3(HX * k * sx, HY * k * sy, HZ * k * sz).addScaledVector(n, off);
  return { p, n };
}
/** Orientation with +z along n and +x kept horizontal. */
function frameQ(n: THREE.Vector3, roll = 0): THREE.Quaternion {
  const z = n.clone().normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  return q;
}
const arr3 = (v: THREE.Vector3): V3t => [v.x, v.y, v.z];

// ═════════════════════════════════════════════════════════════════════════════
// Face (shared geometry + materials)
// ═════════════════════════════════════════════════════════════════════════════
let faceKit: {
  eyeGeo: THREE.BufferGeometry;
  hlGeo: THREE.BufferGeometry;
  eyeMat: THREE.Material;
  hlMat: THREE.Material;
  blushGeo: THREE.BufferGeometry;
  blushMat: THREE.Material;
  mouthGeo: THREE.BufferGeometry;
  mouthMat: THREE.Material;
  earGeo: THREE.BufferGeometry;
} | null = null;

function getFaceKit() {
  if (faceKit) return faceKit;
  const eye = new GB(true);
  eye.e([0, 0, 0], [0.07, 0.096, 0.052], undefined, '#2b2140');
  eye.e([0, -0.04, 0.008], [0.056, 0.052, 0.048], undefined, '#6a58a8'); // iris glow
  const hl = new GB();
  hl.e([-0.023, 0.04, 0.044], 0.023);
  hl.e([0.024, -0.04, 0.043], 0.012);
  hl.e([0.03, 0.026, 0.04], 0.007);
  // soft blush: radial gradient quad
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,104,150,0.95)');
  g.addColorStop(0.55, 'rgba(255,120,160,0.55)');
  g.addColorStop(1, 'rgba(255,130,170,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // smile: lower arc of a thin torus
  const arc = 2.3;
  const mouth = new THREE.TorusGeometry(0.04, 0.0085, 8, 18, arc);
  mouth.rotateZ(-Math.PI / 2 - arc / 2);
  faceKit = {
    eyeGeo: eye.build(),
    hlGeo: hl.build(),
    eyeMat: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04 }),
    hlMat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    blushGeo: new THREE.PlaneGeometry(0.17, 0.105),
    blushMat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    mouthGeo: mouth,
    mouthMat: toyMat('#a14a66', 'satin'),
    earGeo: sph(),
  };
  return faceKit;
}

// ═════════════════════════════════════════════════════════════════════════════
// Hair
// ═════════════════════════════════════════════════════════════════════════════
interface HairParts {
  base: THREE.BufferGeometry; // always shown (hugs the head)
  vol: THREE.BufferGeometry | null; // volume on top (hidden under hats)
  accent: THREE.BufferGeometry | null; // ties / scrunchies (lighter shade)
  tails: { geo: THREE.BufferGeometry; pivot: V3t; side: number; tilt: number }[]; // swaying parts
  topY: number; // top of the hair at the head's center (head space)
  hairR: number; // outer scale relative to the head, for accessories
}
interface HairBuild {
  base: GB;
  vol: GB;
  accent: GB;
  tails: { gb: GB; pivot: V3t; side: number; tilt: number }[];
  topY: number;
  hairR: number;
}

const cap = (b: GB, k = 1) => b.e([0, 0.05, -0.075], [0.435 * k, 0.385 * k, 0.43 * k]);
/** Side-swept fringe. */
function fringeSwept(b: GB, flip = 1): void {
  b.e([-0.175 * flip, 0.205, 0.285], [0.17, 0.105, 0.12], [0.1, 0, 0.42 * flip]);
  b.e([0.0, 0.235, 0.3], [0.18, 0.105, 0.12], [0.1, 0, -0.08 * flip]);
  b.e([0.175 * flip, 0.195, 0.28], [0.15, 0.105, 0.12], [0.1, 0, -0.4 * flip]);
}
/** Straight bangs. */
function bangs(b: GB, y = 0.19): void {
  for (const x of [-0.22, -0.075, 0.075, 0.22]) b.e([x, y + Math.abs(x) * 0.08, 0.28 - Math.abs(x) * 0.34], [0.1, 0.12, 0.11], [0.12, 0, -x * 0.5]);
}
function temples(b: GB): void {
  for (const s of [-1, 1]) b.e([0.372 * s, 0.03, 0.09], [0.06, 0.13, 0.13], [0, 0, 0.1 * s]);
}

const HAIR_DEFS: ((h: HairBuild) => void)[] = [
  // 0 Short — tidy cap with a swept fringe
  (h) => {
    cap(h.base);
    fringeSwept(h.base);
    temples(h.base);
    h.topY = 0.435;
  },
  // 1 Bob — bowl cut that hugs the jaw
  (h) => {
    cap(h.base, 1.04);
    h.base.e([0, -0.1, -0.2], [0.44, 0.31, 0.3]);
    bangs(h.base, 0.2);
    for (const s of [-1, 1]) h.base.e([0.388 * s, -0.07, -0.02], [0.1, 0.24, 0.27], [0, 0, 0.04 * s]);
    h.topY = 0.45;
    h.hairR = 1.14;
  },
  // 2 Ponytail — high tail with a swaying swoosh
  (h) => {
    cap(h.base);
    fringeSwept(h.base, -1);
    temples(h.base);
    h.accent.e([0, 0.2, -0.42], [0.075, 0.075, 0.06]);
    const t = new GB();
    t.e([0, -0.05, -0.05], [0.12, 0.12, 0.1]);
    t.e([0, -0.2, -0.085], [0.125, 0.16, 0.1]);
    t.e([0, -0.38, -0.085], [0.11, 0.17, 0.09]);
    t.e([0, -0.55, -0.055], [0.075, 0.14, 0.07]);
    h.tails.push({ gb: t, pivot: [0, 0.22, -0.44], side: 0, tilt: 0.3 });
    h.topY = 0.435;
  },
  // 3 Spiky — anime spikes in every direction
  (h) => {
    cap(h.base, 0.99);
    temples(h.base);
    const spikes: [number, number, number, number][] = [
      // yaw, elevation (deg), length, radius
      [0, 66, 0.3, 0.115], [40, 58, 0.34, 0.11], [-40, 58, 0.34, 0.11], [80, 42, 0.32, 0.11], [-80, 42, 0.32, 0.11],
      [120, 48, 0.34, 0.115], [-120, 48, 0.34, 0.115], [180, 50, 0.32, 0.115], [155, 22, 0.3, 0.115], [-155, 22, 0.3, 0.115],
    ];
    for (const [yaw, el, len, rad] of spikes) {
      const t = yaw * D2R, f = el * D2R;
      const d = new THREE.Vector3(Math.sin(t) * Math.cos(f), Math.sin(f) + 0.35, Math.cos(t) * Math.cos(f) * 0.9 - 0.12).normalize();
      const base: V3t = [Math.sin(t) * Math.cos(f) * 0.38, 0.05 + Math.sin(f) * 0.34, -0.075 + Math.cos(t) * Math.cos(f) * 0.38];
      h.vol.spk(base, arr3(d), len, rad);
    }
    // fringe tufts over the forehead (stay with hats, they are small)
    for (const x of [-0.17, 0, 0.17]) h.base.spk([x, 0.27, 0.27], [x * 0.7, -0.55, 0.75], 0.2, 0.085);
    h.topY = 0.45;
    h.hairR = 1.14;
  },
  // 4 Long — flowing down the back, face-framing locks
  (h) => {
    cap(h.base, 1.02);
    // center-parted fringe
    for (const s of [-1, 1]) {
      h.base.e([0.1 * s, 0.215, 0.285], [0.16, 0.11, 0.12], [0.1, 0, -0.5 * s]);
      h.base.e([0.255 * s, 0.14, 0.2], [0.1, 0.17, 0.13], [0.0, 0.2 * s, -0.25 * s]);
    }
    h.base.e([0, -0.4, -0.215], [0.405, 0.5, 0.2]);
    h.base.e([0, -0.05, -0.2], [0.44, 0.33, 0.3]);
    for (const s of [-1, 1]) {
      h.base.e([0.37 * s, -0.22, 0.09], [0.07, 0.3, 0.08], [0, 0, 0.1 * s]);
      h.base.e([0.34 * s, -0.5, 0.1], [0.075, 0.1, 0.075]);
    }
    h.topY = 0.44;
  },
  // 5 Buns — two space buns with scrunchies
  (h) => {
    cap(h.base);
    bangs(h.base, 0.2);
    temples(h.base);
    for (const s of [-1, 1]) {
      h.vol.e([0.27 * s, 0.4, -0.12], 0.175);
      h.accent.ringAt([0.235 * s, 0.31, -0.12], [0.6 * s, 0.8, 0], 0.115, 0.03); // scrunchie
      // little face-framing strands
      h.base.e([0.4 * s, -0.04, 0.1], [0.05, 0.17, 0.05]);
    }
    h.topY = 0.435;
  },
  // 6 Curly — big fluffy cloud of curls
  (h) => {
    cap(h.base, 0.99);
    for (const s of [-1, 1]) h.base.e([0.405 * s, 0.08, 0.04], [0.09, 0.2, 0.17]);
    h.vol.e([0, 0.14, -0.2], [0.55, 0.49, 0.46]);
    // puffy bumps over the big shape, mirrored left/right (the face stays clear)
    const rows: [number, number, number][] = [[80, 1, 0], [58, 6, 0.5], [34, 8, 0], [10, 10, 0.5]]; // elevation deg, count, phase
    for (const [el, n, ph] of rows) {
      for (let k = 0; k < n; k++) {
        const yaw = (n === 1 ? 0 : (k + ph) * (360 / n)) * D2R;
        const wrapped = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        if (Math.abs(wrapped) < 52 * D2R && el < 62) continue;
        const f = el * D2R;
        const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(f), Math.sin(f), Math.cos(yaw) * Math.cos(f));
        h.vol.e([d.x * 0.46, 0.14 + d.y * 0.42, -0.2 + d.z * 0.38], 0.17 + 0.012 * (k % 3));
      }
    }
    for (const x of [-0.26, -0.09, 0.09, 0.26]) h.vol.e([x, 0.36 + (Math.abs(x) < 0.2 ? 0.03 : -0.01), 0.16 - Math.abs(x) * 0.22], 0.125);
    h.topY = 0.62;
    h.hairR = 1.38;
  },
  // 7 Pigtails — two low tails by the cheeks
  (h) => {
    cap(h.base);
    fringeSwept(h.base);
    for (const s of [-1, 1]) {
      h.accent.e([0.4 * s, 0.01, -0.09], 0.062);
      const t = new GB();
      t.e([0.05 * s, -0.08, 0], [0.11, 0.13, 0.1]);
      t.e([0.1 * s, -0.25, 0.01], [0.12, 0.16, 0.1]);
      t.e([0.125 * s, -0.43, 0.02], [0.105, 0.16, 0.09]);
      t.e([0.12 * s, -0.59, 0.03], [0.07, 0.12, 0.065]);
      h.tails.push({ gb: t, pivot: [0.4 * s, 0.01, -0.09], side: s, tilt: 0.06 });
    }
    h.topY = 0.435;
  },
];

const hairCache = new Map<number, HairParts>();
function getHair(style: number): HairParts {
  const s = Math.max(0, Math.min(HAIR_DEFS.length - 1, style | 0));
  let p = hairCache.get(s);
  if (p) return p;
  const h: HairBuild = { base: new GB(), vol: new GB(), accent: new GB(), tails: [], topY: 0.435, hairR: 1.1 };
  HAIR_DEFS[s](h);
  // GB.build() on an empty builder throws, so only build what was filled.
  const safe = (gb: GB) => (gb.empty ? null : gb.build());
  p = {
    base: h.base.build(),
    vol: safe(h.vol),
    accent: safe(h.accent),
    tails: h.tails.map((t) => ({ geo: t.gb.build(), pivot: t.pivot, side: t.side, tilt: t.tilt })),
    topY: h.topY,
    hairR: h.hairR,
  };
  hairCache.set(s, p);
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// Tops
// ═════════════════════════════════════════════════════════════════════════════
const TOP_OFF = [0.03, 0.052, 0.022, 0.032, 0.042, 0.03];
const NECK_Y_TOP = 0.935;

interface TopParts {
  torso: Piece[]; // in torso space
  upper: Piece[]; // sleeve on the upper arm (arm space)
  lower: Piece[]; // sleeve on the forearm
}
function getTop(style: number): TopParts {
  const st = Math.max(0, Math.min(TOP_COUNT - 1, style | 0));
  const off = TOP_OFF[st];
  const torso = pieces(`top|${st}`, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    const hem = (y: number, tube = 0.022) => trim.ring(y, bodyR(y) + off, tube);
    switch (st) {
      case 0: // Tee
        shell(main, 0.54, NECK_Y_TOP, off);
        hem(0.54);
        trim.ring(NECK_Y_TOP, bodyR(NECK_Y_TOP) + off, 0.02);
        break;
      case 1: { // Hoodie — puffy, hood bunched at the neck, pocket + strings
        shell(main, 0.5, NECK_Y_TOP, (y) => off + 0.012 * Math.sin(((y - 0.5) / 0.44) * Math.PI));
        hem(0.5, 0.03);
        main.add(torus(0.15, 0.075), { p: [0, 0.935, -0.045], r: [Math.PI / 2, 0, 0], s: [1.05, 1, 0.95] });
        main.e([0, 0.9, -0.2], [0.2, 0.13, 0.1]);
        trim.add(roundedBox(0.3, 0.13, 0.05, 0.05), { p: [0, 0.6, bodyR(0.6) + off + 0.012] });
        for (const s of [-1, 1]) {
          pb.at('white').seg([0.055 * s, 0.9, bodyR(0.9) + off - 0.01], [0.06 * s, 0.77, bodyR(0.77) + off + 0.012], 0.011);
          pb.at('white').e([0.06 * s, 0.76, bodyR(0.76) + off + 0.014], 0.019);
        }
        break;
      }
      case 2: // Tank
        shell(main, 0.56, 0.875, off);
        hem(0.56);
        trim.ring(0.875, bodyR(0.875) + off, 0.02);
        for (const s of [-1, 1]) {
          trim.seg([0.115 * s, 0.86, 0.15], [0.1 * s, 0.945, 0.03], 0.027);
          trim.seg([0.1 * s, 0.945, 0.03], [0.115 * s, 0.86, -0.15], 0.027);
        }
        break;
      case 3: { // Dress — fitted bodice, flared skirt, belt, hem band
        flare(main, [[0.15, 0.935], [0.215, 0.89], [0.26, 0.8], [0.262, 0.7], [0.3, 0.6], [0.365, 0.5], [0.44, 0.4], [0.5, 0.325]], 26);
        trim.ring(0.695, 0.262 + 0.012, 0.022);
        trim.ring(0.335, 0.497, 0.03);
        trim.ring(NECK_Y_TOP, 0.152, 0.02);
        for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) pb.at('white').e([Math.sin(a) * 0.405, 0.43, Math.cos(a) * 0.405], 0.022); // little dots
        break;
      }
      case 4: { // Jacket — collar, zip, cuffs, pockets
        shell(main, 0.54, NECK_Y_TOP, off);
        hem(0.54, 0.03);
        for (const s of [-1, 1]) {
          trim.e([0.075 * s, 0.925, 0.115], [0.085, 0.045, 0.1], [0.25, -0.2 * s, -0.55 * s]);
          trim.e([0.1 * s, 0.93, -0.06], [0.09, 0.045, 0.1], [-0.2, 0.3 * s, 0.1 * s]);
          trim.add(roundedBox(0.1, 0.1, 0.04, 0.03), { p: [0.15 * s, 0.63, bodyR(0.63) + off - 0.03], r: [0, 0.55 * s, 0] });
        }
        trim.e([0, 0.94, -0.15], [0.13, 0.05, 0.08]);
        {
          const pts: THREE.Vector3[] = [];
          for (let y = 0.92; y >= 0.55; y -= 0.05) pts.push(new THREE.Vector3(0, y, bodyR(y) + off + 0.004));
          pb.at('gold').add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.011, 6, false), {}, true);
          pb.at('gold').e([0, 0.915, bodyR(0.915) + off + 0.012], 0.02);
        }
        break;
      }
      case 5: // Stripes — tee with chunky stripes
        shell(main, 0.54, NECK_Y_TOP, off);
        hem(0.54);
        trim.ring(NECK_Y_TOP, bodyR(NECK_Y_TOP) + off, 0.02);
        for (const y of [0.6, 0.69, 0.78, 0.86]) pb.at('white').ring(y, bodyR(y) + off + 0.004, 0.023);
        break;
    }
  }, torsoSpace);

  const upper = pieces(`topU|${st}`, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    switch (st) {
      case 0: case 5: // short sleeve
        main.e([0, -0.04, 0], [0.093, 0.1, 0.093]);
        trim.ring(-0.088, 0.077, 0.016);
        if (st === 5) pb.at('white').ring(-0.045, 0.092, 0.018);
        break;
      case 1: // hoodie: long puffy sleeve
        main.add(capsule(0.092, 0.08), { p: [0, -0.07, 0] });
        break;
      case 3: // dress: puffy shoulder
        main.e([0, -0.025, 0], [0.105, 0.1, 0.105]);
        trim.ring(-0.07, 0.085, 0.018);
        break;
      case 4: // jacket: long sleeve
        main.add(capsule(0.085, 0.075), { p: [0, -0.07, 0] });
        break;
      default: // tank: bare arm
        break;
    }
  });
  const lower = pieces(`topL|${st}`, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    if (st === 1) {
      main.add(capsule(0.086, 0.04), { p: [0, -0.07, 0] });
      trim.ring(-0.135, 0.07, 0.024);
    } else if (st === 4) {
      main.add(capsule(0.08, 0.04), { p: [0, -0.07, 0] });
      trim.ring(-0.135, 0.068, 0.025);
    }
  });
  return { torso, upper, lower };
}

// ═════════════════════════════════════════════════════════════════════════════
// Bottoms
// ═════════════════════════════════════════════════════════════════════════════
interface BottomParts {
  torso: Piece[]; // hips / skirt / bib (torso space)
  thigh: Piece[]; // per side (arrays indexed by side: 0 = +x, 1 = -x)
  shin: Piece[];
}
/** Open tube for a trouser leg below the knee (y from +0.02 down to `hem`). */
function leg(gb: GB, hem: number, rHem: number, rTop: number): void {
  gb.add(new THREE.LatheGeometry([new THREE.Vector2(rHem, hem), new THREE.Vector2(rTop, 0.02)], 24), {}, true);
}
const THIGH_R = 0.095, THIGH_LEN = 0.06, THIGH_Y = -0.095;
const SHIN_R = 0.08, SHIN_LEN = 0.04, SHIN_Y = -0.09;

function getBottom(style: number, topStyle: number, side: number): BottomParts {
  const st = Math.max(0, Math.min(4, style | 0));
  const topOff = TOP_OFF[Math.max(0, Math.min(TOP_COUNT - 1, topStyle | 0))];
  const withBib = st === BOTTOM_OVERALLS && topStyle !== TOP_DRESS;
  const torso = pieces(`bot|${st}|${withBib ? topOff : 'x'}`, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    switch (st) {
      case 0: // pants
        shell(main, 0.43, 0.62, 0.012);
        break;
      case 1: // shorts
        shell(main, 0.43, 0.62, 0.014);
        break;
      case 2: // skirt: A-line with a ruffle band
        flare(main, [[0.268, 0.71], [0.3, 0.665], [0.335, 0.6], [0.375, 0.52], [0.415, 0.445], [0.44, 0.385]], 20);
        trim.ring(0.69, 0.286, 0.022);
        trim.ring(0.39, 0.438, 0.034);
        break;
      case 3: // leggings
        shell(main, 0.43, 0.64, 0.008);
        trim.ring(0.625, bodyR(0.625) + 0.012, 0.02);
        break;
      case 4: // overalls
        shell(main, 0.43, 0.66, 0.016);
        if (withBib) {
          const z = bodyR(0.8) + topOff + 0.035;
          main.add(roundedBox(0.3, 0.25, 0.05, 0.05), { p: [0, 0.78, z] });
          trim.add(roundedBox(0.12, 0.075, 0.04, 0.03), { p: [0, 0.745, z + 0.022] });
          for (const s of [-1, 1]) {
            main.seg([0.1 * s, 0.9, z - 0.015], [0.095 * s, 0.955, 0.04], 0.025);
            main.seg([0.095 * s, 0.955, 0.04], [0.105 * s, 0.86, -0.17], 0.025);
            pb.at('gold').e([0.1 * s, 0.885, z + 0.03], 0.027);
          }
        } else {
          trim.ring(0.64, bodyR(0.64) + 0.02, 0.02);
        }
        break;
    }
  }, torsoSpace);

  const s = side === 0 ? 1 : -1;
  const thigh = pieces(`botT|${st}|${side}`, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    switch (st) {
      case 0: // pants (loose)
        main.add(capsule(0.124, THIGH_LEN), { p: [0, THIGH_Y, 0] });
        break;
      case 1: // shorts
        main.e([0, -0.045, 0], [0.126, 0.118, 0.126]);
        trim.ring(-0.125, 0.108, 0.018);
        break;
      case 3: // leggings (tight) with a side stripe
        main.add(capsule(0.102, THIGH_LEN), { p: [0, THIGH_Y, 0] });
        pb.at('white').seg([0.1 * s, -0.02, 0.0], [0.098 * s, -0.19, 0.0], 0.012);
        break;
      case 4: // overalls
        main.add(capsule(0.124, THIGH_LEN), { p: [0, THIGH_Y, 0] });
        break;
      default:
        break; // skirt: bare legs
    }
  });
  const shin = pieces(`botS|${st}|${side}`, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    switch (st) {
      case 0: // loose leg, hem lifted so the shoes show
        leg(main, -0.085, 0.113, 0.103);
        trim.ring(-0.085, 0.114, 0.021);
        break;
      case 3: // tight to the ankle
        leg(main, -0.15, 0.09, 0.089);
        pb.at('white').seg([0.088 * s, -0.01, 0], [0.084 * s, -0.14, 0], 0.012);
        break;
      case 4:
        leg(main, -0.085, 0.113, 0.103);
        trim.ring(-0.085, 0.116, 0.027); // rolled cuffs
        break;
      default:
        break;
    }
  });
  return { torso, thigh, shin };
}

// ═════════════════════════════════════════════════════════════════════════════
// Shoes — built in foot space: origin at the ankle, +z toes, sole at y = -0.12
// ═════════════════════════════════════════════════════════════════════════════
function getShoes(style: number): Piece[] {
  const st = Math.max(0, Math.min(4, style | 0));
  return pieces(`shoe|${st}`, (pb) => {
    const main = pb.at('main');
    const white = pb.at('white');
    switch (st) {
      case 0: // sneakers
      case 3: { // high-tops
        main.e([0, -0.052, 0.045], [0.1, 0.068, 0.168]);
        white.e([0, -0.092, 0.05], [0.104, 0.034, 0.18]); // sole
        white.e([0, -0.07, 0.15], [0.092, 0.05, 0.085]); // toe cap
        white.ring(0.0, 0.082, 0.017);
        white.e([0, -0.005, 0.075], [0.04, 0.009, 0.014]);
        white.e([0, -0.012, 0.115], [0.04, 0.009, 0.014]);
        if (st === 0) {
          white.e([0, 0.015, -0.005], [0.088, 0.062, 0.09]); // short sock
        } else {
          main.e([0, 0.04, -0.012], [0.102, 0.098, 0.104]);
          white.ring(0.098, 0.103, 0.024);
          white.e([0, 0.05, 0.088], [0.03, 0.01, 0.01]);
          white.e([0, 0.075, 0.09], [0.03, 0.01, 0.01]);
          for (const s of [-1, 1]) white.e([0.097 * s, 0.03, 0.0], [0.015, 0.055, 0.055]); // star patch
        }
        break;
      }
      case 1: { // boots
        main.e([0, -0.05, 0.045], [0.104, 0.07, 0.172]);
        main.add(capsule(0.115, 0.04), { p: [0, 0.045, -0.01] });
        pb.at('dark').e([0, -0.093, 0.05], [0.112, 0.034, 0.185]);
        pb.at('trim').ring(0.178, 0.117, 0.026);
        pb.at('gold').add(torus(0.028, 0.009), { p: [0, 0.06, 0.112], r: [0.05, 0, 0] });
        break;
      }
      case 2: { // sandals: bare foot, sole + straps
        pb.at('dark').e([0, -0.106, 0.045], [0.104, 0.017, 0.185]);
        const skin = pb.at('skin');
        skin.e([0, -0.068, 0.04], [0.082, 0.046, 0.15]);
        for (let i = 0; i < 5; i++) skin.e([(i - 2) * 0.034, -0.078, 0.185 - Math.abs(i - 2) * 0.01], 0.021);
        main.add(torus(0.085, 0.013, Math.PI), { p: [0, -0.085, 0.07] });
        main.add(torus(0.068, 0.012, Math.PI), { p: [0, -0.085, 0.145] });
        main.ring(0.005, 0.078, 0.014);
        pb.at('gold').e([0, -0.0, 0.09], 0.02);
        break;
      }
      case 4: { // bunny slippers
        main.e([0, -0.06, 0.05], [0.118, 0.078, 0.185]);
        white.e([0, -0.105, 0.05], [0.12, 0.026, 0.187]);
        pb.at('trim').ring(0.0, 0.085, 0.024);
        for (const s of [-1, 1]) {
          pb.at('trim').e([0.052 * s, 0.07, 0.115], [0.036, 0.12, 0.026], [-0.25, 0, -0.22 * s]);
          pb.at('pink').e([0.05 * s, 0.07, 0.13], [0.019, 0.09, 0.012], [-0.25, 0, -0.22 * s]);
          pb.at('ink').e([0.043 * s, -0.03, 0.2], 0.014);
        }
        pb.at('pink').e([0, -0.045, 0.228], 0.019);
        break;
      }
    }
  }, undefined, true);
}

// ═════════════════════════════════════════════════════════════════════════════
// Accessories — head space, authored for the default hair (hairR 1.1, topY 0.435)
// ═════════════════════════════════════════════════════════════════════════════
interface AccPart {
  pieces: Piece[];
  /** hat-like: hair volume is hidden underneath. */
  hat: boolean;
  /** glasses etc. stick to the face and ignore hair size. */
  fixed: boolean;
  glass?: THREE.BufferGeometry;
}
const accCache = new Map<number, AccPart>();
function getAccessory(style: number): AccPart | null {
  if (style <= 0 || style >= OUTFIT_CATALOG.accessory.length) return null;
  const hit = accCache.get(style);
  if (hit) return hit;
  let hat = false, fixed = false;
  let glass: THREE.BufferGeometry | undefined;
  const key = `acc|${style}`;
  const ps = pieces(key, (pb) => {
    const main = pb.at('main');
    const trim = pb.at('trim');
    switch (style) {
      case ACC_GLASSES: {
        fixed = true;
        const g = new GB();
        const lens = new GB();
        const rings: THREE.Vector3[] = [];
        for (const s of [-1, 1]) {
          const { p, n } = facePoint(27 * s, -6, 0.05);
          const q = frameQ(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.5), 0);
          g.add(torus(0.1, 0.0145), { p: arr3(p), q });
          lens.add(new THREE.CircleGeometry(0.098, 28), { p: arr3(p), q });
          rings.push(p);
          // temple arm back to the ear
          const out = new THREE.Vector3(0.1 * s, 0, 0).applyQuaternion(q).add(p);
          g.seg(arr3(out), [0.402 * s, -0.025, -0.02], 0.011);
        }
        const inner = (p: THREE.Vector3, s: number) => p.clone().add(new THREE.Vector3(-0.1 * s, 0.0, 0.0).applyQuaternion(frameQ(facePoint(27 * s, -6).n.lerp(new THREE.Vector3(0, 0, 1), 0.5))));
        const a = inner(rings[0], -1), b = inner(rings[1], 1);
        g.seg(arr3(a), arr3(b), 0.011);
        pb.at('main').add(g.build(), {}, true);
        glass = lens.build();
        break;
      }
      case ACC_CAP: {
        hat = true;
        const tilt = -0.26;
        const d = new GB();
        d.add(new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, 1.66), { p: [0, 0.035, -0.04], s: [0.478, 0.43, 0.488] });
        d.e([0, 0.462, -0.04], 0.04);
        const dg = d.build();
        dg.rotateX(tilt);
        main.add(dg, {}, true);
        const trimG = new GB();
        trimG.add(torus(0.4765, 0.018), { p: [0, 0.0, -0.04], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.02] });
        const tg = trimG.build();
        tg.rotateX(tilt);
        trim.add(tg, {}, true);
        const brim = new GB();
        brim.e([0, 0.06, 0.45], [0.25, 0.045, 0.19], [0.32, 0, 0]);
        const bg = brim.build();
        bg.rotateX(tilt);
        pb.at('dark').add(bg, {}, true);
        break;
      }
      case ACC_BOW: {
        // a big ribbon bow, placed on the head by the Character (needs surface frame)
        for (const s of [-1, 1]) {
          main.e([0.125 * s, 0.015, 0], [0.135, 0.095, 0.05], [0, 0, 0.32 * s]);
          trim.e([0.13 * s, 0.015, 0.03], [0.07, 0.05, 0.02], [0, 0, 0.32 * s]);
          main.e([0.05 * s, -0.1, -0.005], [0.04, 0.11, 0.03], [0, 0, 0.35 * s]);
        }
        trim.e([0, 0, 0.012], 0.055);
        break;
      }
      case ACC_PHONES: {
        main.add(torus(0.47, 0.03, Math.PI), { p: [0, -0.02, -0.01] });
        for (const s of [-1, 1]) {
          main.e([0.465 * s, -0.02, 0], [0.075, 0.13, 0.12]);
          trim.add(torus(0.095, 0.034), { p: [0.425 * s, -0.02, 0], r: [0, Math.PI / 2, 0] });
          pb.at('white').e([0.5 * s, -0.02, 0], [0.012, 0.07, 0.07]);
        }
        break;
      }
      case ACC_CROWN: {
        const base = 0.32;
        main.ring(base + 0.02, 0.19, 0.04);
        main.add(new THREE.CylinderGeometry(0.19, 0.2, 0.09, 28, 1, true), { p: [0, base + 0.045, 0] });
        main.ring(base + 0.09, 0.19, 0.034);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          const x = Math.sin(a) * 0.19, z = Math.cos(a) * 0.19;
          main.spk([x, base + 0.07, z], [x * 0.5, 1, z * 0.5], 0.17, 0.065);
          pb.at('gold').e([x * 1.0, base + 0.245, z * 1.0], 0.03);
          if (i % 2 === 0) pb.at('pink').e([Math.sin(a) * 0.2, base + 0.05, Math.cos(a) * 0.2], 0.026);
          else pb.at('leaf').e([Math.sin(a) * 0.2, base + 0.05, Math.cos(a) * 0.2], 0.026);
        }
        break;
      }
      case ACC_FLOWER: {
        // a cluster of flowers; placed on the side of the head by the Character
        const flower = (cx: number, cy: number, sc: number) => {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            main.e([cx + Math.cos(a) * 0.075 * sc, cy + Math.sin(a) * 0.075 * sc, 0], [0.07 * sc, 0.05 * sc, 0.032 * sc], [0, 0, a]);
          }
          pb.at('white').e([cx, cy, 0.016 * sc], 0.05 * sc);
          pb.at('pink').e([cx, cy, 0.03 * sc], 0.026 * sc);
        };
        flower(0, 0, 1);
        flower(0.13, -0.075, 0.62);
        flower(-0.1, -0.1, 0.5);
        pb.at('leaf').e([0.08, -0.14, -0.01], [0.07, 0.035, 0.02], [0, 0, 0.6]);
        break;
      }
      case ACC_BEANIE: {
        hat = true;
        const tilt = -0.3;
        const d = new GB();
        d.add(new THREE.SphereGeometry(1, 32, 16, 0, TAU, 0, 1.63), { p: [0, 0.045, -0.045], s: [0.458, 0.425, 0.465] });
        const dg = d.build();
        dg.rotateX(tilt);
        main.add(dg, {}, true);
        // folded cuff: a short rounded band around the rim
        const band = new THREE.LatheGeometry(
          [[0.405, -0.065], [0.45, -0.065], [0.485, -0.045], [0.492, 0], [0.485, 0.045], [0.45, 0.065], [0.405, 0.065]].map(([r, y]) => new THREE.Vector2(r, y)),
          32,
        );
        const c = new GB();
        c.add(band, { p: [0, 0.02, -0.045], s: [1, 1, 1.02] }, true);
        const cg = c.build();
        cg.rotateX(tilt);
        trim.add(cg, {}, true);
        const pom = new GB();
        pom.e([0, 0.5, -0.1], 0.1);
        const pg = pom.build();
        pg.rotateX(tilt);
        pb.at('white').add(pg, {}, true);
        break;
      }
      case ACC_EARS: {
        main.add(torus(0.455, 0.022, Math.PI), { s: [1, 0.9, 1], p: [0, -0.01, -0.01] });
        for (const s of [-1, 1]) {
          main.add(spike(), { p: [0.24 * s, 0.3, -0.02], s: [0.27, 0.3, 0.12], r: [0, 0, -0.4 * s] });
          pb.at('pink').add(spike(), { p: [0.245 * s, 0.305, 0.03], s: [0.16, 0.2, 0.06], r: [0, 0, -0.4 * s] });
        }
        break;
      }
    }
  });
  const part: AccPart = { pieces: ps, hat, fixed, glass };
  accCache.set(style, part);
  return part;
}
let lensMat: THREE.Material | null = null;
const getLensMat = () =>
  (lensMat ??= new THREE.MeshPhysicalMaterial({ color: '#d8f0ff', roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }));

// ═════════════════════════════════════════════════════════════════════════════
// The Character
// ═════════════════════════════════════════════════════════════════════════════
export type PoseKind = 'hips' | 'jump' | 'twirl';
const POSES: PoseKind[] = ['hips', 'jump', 'twirl'];

interface ArmRig { s: number; shoulder: THREE.Group; elbow: THREE.Group; upperTop: THREE.Group; lowerTop: THREE.Group }
interface LegRig { s: number; hip: THREE.Group; knee: THREE.Group; thighBottom: THREE.Group; shinBottom: THREE.Group; foot: THREE.Group }
interface Swayer { obj: THREE.Group; side: number; phase: number; tilt: number }
type MountSlot = 'top' | 'bottom' | 'shoes' | 'skin';

const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 → 1 ramp in, hold, ramp out over k ∈ [0,1]. */
const envelope = (k: number, a = 0.16, b = 0.84) => (k < a ? smooth01(k / a) : k > b ? smooth01((1 - k) / (1 - b)) : 1);

export class Character {
  /** Height of the pelvis bottom above the group origin — a seated character's butt sits here. */
  static readonly SEAT_Y = 0.43;

  readonly group = new THREE.Group();
  seated: boolean;
  private shadows: boolean;
  private outfit: Outfit;

  // rig
  private rig = new THREE.Group();
  private torso = new THREE.Group();
  private headRoot = new THREE.Group();
  private headBody = new THREE.Group();
  private arms: ArmRig[] = [];
  private legs: LegRig[] = [];
  private legsRoot = new THREE.Group();
  // slot mounts
  private topMount = new THREE.Group();
  private bottomMount = new THREE.Group();
  private hairMount = new THREE.Group();
  private accMount = new THREE.Group();
  private mounts: Record<'top' | 'bottom' | 'shoes', THREE.Group[]> = { top: [], bottom: [], shoes: [] };
  private proxy: Record<MountSlot, THREE.Object3D> = { top: new THREE.Object3D(), bottom: new THREE.Object3D(), shoes: new THREE.Object3D(), skin: new THREE.Object3D() };
  // face
  private eyes: THREE.Group[] = [];
  private mouth!: THREE.Mesh;
  private swayers: Swayer[] = [];
  private hairTopY = 0.435;
  private accTopY = 0;
  private wearsHat = false;

  // animation state
  private clock = Math.random() * 20;
  private phase = Math.random() * 10;
  private blinkIn = 1.5 + Math.random() * 2;
  private blinkT = -1;
  private waveAnim: { t: number; dur: number } | null = null;
  private poseAnim: { t: number; dur: number; kind: PoseKind } | null = null;
  private hopAnim: { t: number; dur: number } | null = null;
  private lastPose: PoseKind | null = null;
  private steer = 0;
  private steerSmooth = 0;
  private prevYaw = 0;
  private yawVel = 0;

  constructor(outfit: Outfit, opts: { seated?: boolean; shadows?: boolean } = {}) {
    this.outfit = structuredClone(outfit);
    this.seated = !!opts.seated;
    this.shadows = opts.shadows !== false;
    this.group.add(this.rig);
    this.buildRig();
    this.rebuildAll();
  }

  // ── Public API ───────────────────────────────────────────────────────────
  /** Apply a new outfit. Pass the slot that changed, or omit to diff every slot. */
  setOutfit(outfit: Outfit, changedSlot?: OutfitSlot): void {
    const prev = this.outfit;
    const next = structuredClone(outfit);
    this.outfit = next;
    const same = (a: { style: number; color: string }, b: { style: number; color: string }) => a.style === b.style && a.color.toLowerCase() === b.color.toLowerCase();
    const dirty = new Set<OutfitSlot>();
    if (changedSlot) dirty.add(changedSlot);
    else {
      if (prev.skin !== next.skin) dirty.add('skin');
      for (const k of ['hair', 'top', 'bottom', 'shoes', 'accessory'] as const) if (!same(prev[k], next[k])) dirty.add(k);
    }
    // hair and accessory depend on each other (hats hide hair volume; crowns sit on hair)
    if (dirty.has('hair') || dirty.has('accessory')) {
      dirty.add('hair');
      dirty.add('accessory');
    }
    // overalls' bib depends on the top
    if (dirty.has('top') && next.bottom.style === BOTTOM_OVERALLS) dirty.add('bottom');
    if (dirty.has('skin')) this.applySkin();
    if (dirty.has('hair')) this.buildHair();
    if (dirty.has('accessory')) this.buildAccessory();
    if (dirty.has('top')) this.buildTop();
    if (dirty.has('bottom')) this.buildBottom();
    if (dirty.has('shoes')) this.buildShoes();
  }

  /** Little wave hello (~1.5 s). */
  wave(): void {
    this.waveAnim = { t: 0, dur: tuning.dressup.waveSeconds };
  }
  /** One of three fun poses: hands on hips, jump with arms up, little twirl. */
  pose(kind?: PoseKind): void {
    if (this.poseAnim && this.poseAnim.t < this.poseAnim.dur * 0.45) return; // don't restart mid-pose
    let k = kind;
    if (!k) {
      const choices = POSES.filter((p) => p !== this.lastPose);
      k = choices[Math.floor(Math.random() * choices.length)];
    }
    this.lastPose = k;
    this.poseAnim = { t: 0, dur: tuning.dressup.poseSeconds * (k === 'twirl' ? 1.25 : 1), kind: k };
  }
  /** Small happy jump. */
  hop(): void {
    this.hopAnim = { t: 0, dur: tuning.dressup.hopSeconds };
  }
  /** Seated drivers: -1 (left) … 1 (right) — turns the head and the hands on the wheel. */
  setSteer(v: number): void {
    this.steer = Math.max(-1, Math.min(1, v));
  }

  /** Scale-able object for juice's popScale: scaling it bounces every mesh of that slot. */
  partObject(slot: OutfitSlot): THREE.Object3D | null {
    switch (slot) {
      case 'hair': return this.hairMount;
      case 'accessory': return this.outfit.accessory.style > 0 ? this.accMount : null;
      case 'top': return this.proxy.top;
      case 'bottom': return this.proxy.bottom;
      case 'shoes': return this.proxy.shoes;
      case 'skin': return this.proxy.skin;
    }
  }

  /** World-space point near a slot (for sparkles). */
  slotAnchor(slot: OutfitSlot): THREE.Vector3 {
    this.group.updateWorldMatrix(true, false);
    const local =
      slot === 'hair' || slot === 'accessory' ? new THREE.Vector3(0, NECK_Y + HEAD_CY + this.hairTopY * 0.9, 0)
        : slot === 'top' ? new THREE.Vector3(0, 0.76, 0.1)
          : slot === 'bottom' ? new THREE.Vector3(0, 0.38, 0.1)
            : slot === 'shoes' ? new THREE.Vector3(0, 0.1, 0.15)
              : new THREE.Vector3(0, 1.0, 0.1);
    return this.group.localToWorld(local);
  }

  /** World point above the head (name tags, speech bubbles). */
  headTop(): THREE.Vector3 {
    const y = NECK_Y + HEAD_CY + Math.max(this.hairTopY, this.accTopY) + 0.1;
    return this.group.localToWorld(new THREE.Vector3(0, y, 0));
  }

  update(dt: number, _t?: number): void {
    const D = tuning.dressup;
    this.clock += dt;
    const T = this.clock + this.phase;
    const breath = Math.sin(T * 2.3);

    // ── timers ──
    const adv = <A extends { t: number; dur: number }>(a: A | null): A | null => {
      if (!a) return null;
      a.t += dt;
      return a.t >= a.dur ? null : a;
    };
    const waveA = (this.waveAnim = adv(this.waveAnim));
    const poseA = (this.poseAnim = adv(this.poseAnim));
    const hopA = (this.hopAnim = adv(this.hopAnim));
    this.steerSmooth += (this.steer - this.steerSmooth) * Math.min(1, dt * 8);

    // ── base pose ──
    const A = this.arms.map((_, i) => ({ sx: Math.sin(T * 1.9 + i * Math.PI) * 0.035, sz: 0.15 + breath * 0.015, ex: -0.24, ez: 0 }));
    const L = this.legs.map(() => ({ hx: 0, hz: 0.025, kx: 0 }));
    let rigY = 0, rigYaw = 0, rigRollZ = Math.sin(T * 0.9) * D.idleSway, rigSY = 1, rigSXZ = 1;
    let torsoX = 0, torsoZ = 0;
    let headX = Math.sin(T * 0.8) * 0.025, headY = Math.sin(T * 0.55) * 0.1, headZ = Math.sin(T * 0.43) * 0.03;
    let squint = 0, smile = 0;

    if (this.seated) {
      const st = this.steerSmooth;
      A.forEach((a, i) => {
        a.sx = -1.12 + (i === 0 ? 1 : -1) * st * 0.2 + Math.sin(T * 3.1 + i) * 0.01;
        a.sz = 0.09;
        a.ex = -0.52;
      });
      L.forEach((l) => {
        l.hx = -1.38;
        l.hz = 0.05;
        l.kx = 1.45;
      });
      headY = headY * 0.5 + st * 0.35;
      torsoZ = -st * 0.05;
      rigRollZ = 0;
    }

    const blend = (a: { sx: number; sz: number; ex: number; ez: number }, sx: number, sz: number, ex: number, ez: number, w: number) => {
      a.sx = lerp(a.sx, sx, w);
      a.sz = lerp(a.sz, sz, w);
      a.ex = lerp(a.ex, ex, w);
      a.ez = lerp(a.ez, ez, w);
    };

    // ── hop ──
    if (hopA) {
      const k = hopA.t / hopA.dur;
      const up = Math.sin(k * Math.PI);
      rigY += up * D.hopHeight;
      const crouch = k < 0.15 ? smooth01(k / 0.15) : k > 0.85 ? smooth01((k - 0.85) / 0.15) : 0;
      rigSY *= 1 - crouch * 0.07;
      rigSXZ *= 1 + crouch * 0.04;
      A.forEach((a) => blend(a, a.sx - 0.2, 0.75, a.ex, 0.2, up * 0.8));
      if (!this.seated) L.forEach((l) => { l.hx -= 0.3 * up; l.kx += 0.6 * up; });
      smile = Math.max(smile, up * 0.8);
    }

    // ── wave (the arm on +x) ──
    if (waveA) {
      const k = waveA.t / waveA.dur;
      const w = envelope(k, 0.14, 0.86);
      blend(A[0], -0.1, 1.78, 0, 0.82 + Math.sin(waveA.t * 13) * 0.42, w);
      headZ -= 0.12 * w;
      headY += 0.12 * w;
      rigRollZ -= 0.03 * w;
      squint = Math.max(squint, 0.45 * w);
      smile = Math.max(smile, 0.9 * w);
    }

    // ── poses ──
    if (poseA) {
      const k = poseA.t / poseA.dur;
      switch (poseA.kind) {
        case 'hips': {
          const w = envelope(k, 0.2, 0.8);
          A.forEach((a) => blend(a, -0.12, 0.85, 0, -1.55, w));
          rigRollZ += 0.05 * w;
          headZ += 0.17 * w;
          headY += 0.22 * w;
          torsoZ += 0.06 * w;
          rigY += Math.sin(k * Math.PI * 2) * 0.012 * w;
          if (!this.seated) {
            L[1].hz += 0.2 * w;
            L[0].hx -= 0.08 * w;
          }
          squint = Math.max(squint, 0.5 * w);
          smile = Math.max(smile, 0.8 * w);
          break;
        }
        case 'jump': {
          const crouch = k < 0.2 ? smooth01(k / 0.2) : k > 0.82 ? Math.sin(((k - 0.82) / 0.18) * Math.PI) : 0;
          const air = k > 0.2 && k < 0.82 ? (k - 0.2) / 0.62 : 0;
          const armsUp = k < 0.2 ? 0 : k < 0.82 ? smooth01((k - 0.2) / 0.14) : 1 - smooth01((k - 0.82) / 0.18);
          rigY += Math.sin(air * Math.PI) * D.hopHeight * 1.9;
          rigSY *= 1 - crouch * 0.12;
          rigSXZ *= 1 + crouch * 0.06;
          A.forEach((a) => {
            blend(a, 0.35, 0.45, -0.2, 0, crouch * 0.8);
            blend(a, -0.05, 2.75, 0, 0.1, armsUp);
          });
          const tuck = Math.sin(air * Math.PI);
          if (!this.seated) {
            L.forEach((l) => {
              l.hx += -0.55 * crouch - 0.35 * tuck;
              l.kx += 0.95 * crouch + 0.85 * tuck;
            });
          }
          smile = Math.max(smile, armsUp);
          squint = Math.max(squint, 0.5 * armsUp);
          headX -= 0.14 * armsUp;
          break;
        }
        case 'twirl': {
          const w = envelope(k, 0.12, 0.88);
          rigYaw += smooth01(k) * TAU;
          rigY += Math.sin(k * Math.PI) * 0.1;
          A.forEach((a) => blend(a, 0, 1.38, -0.05, 0.25, w));
          torsoZ += Math.sin(k * Math.PI * 2) * 0.05;
          if (!this.seated) L.forEach((l) => { l.hz += 0.05 * w; l.hx -= 0.1 * w; l.kx += 0.2 * w; });
          smile = Math.max(smile, 0.9 * w);
          squint = Math.max(squint, 0.5 * w);
          break;
        }
      }
    }

    // ── blink ──
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.16) {
        this.blinkT = -1;
        this.blinkIn = 2.4 + Math.random() * 3;
      }
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) this.blinkT = 0;
    }
    const blink = this.blinkT >= 0 ? Math.sin((this.blinkT / 0.16) * Math.PI) : 0;
    const eyeY = 1 - Math.max(blink * 0.92, squint * 0.5);

    // ── apply to the rig ──
    const sk = this.proxy.skin.scale;
    this.rig.position.y = rigY;
    this.rig.rotation.set(0, rigYaw, rigRollZ);
    this.rig.scale.set(rigSXZ * sk.x, rigSY * sk.y, rigSXZ * sk.z);
    this.torso.rotation.set(torsoX, 0, torsoZ);
    this.torso.scale.set(1 - breath * 0.005, 1 + breath * D.breath, 1 - breath * 0.005);
    this.headRoot.position.y = NECK_Y + breath * 0.004;
    this.headRoot.rotation.set(headX, headY, headZ);
    this.arms.forEach((arm, i) => {
      const a = A[i];
      arm.shoulder.rotation.set(a.sx, 0, arm.s * a.sz);
      arm.elbow.rotation.set(a.ex, 0, arm.s * a.ez);
    });
    this.legs.forEach((leg, i) => {
      const l = L[i];
      leg.hip.rotation.set(l.hx, 0, leg.s * l.hz);
      leg.knee.rotation.x = l.kx;
    });
    for (const e of this.eyes) e.scale.y = eyeY;
    this.mouth.scale.set(1 + smile * 0.35, 1 + smile * 0.75, 1);

    // swaying hair (ponytail / pigtails): idle breeze + lag behind spins
    const yaw = rigYaw;
    let dy = yaw - this.prevYaw;
    if (dy > Math.PI) dy -= TAU;
    if (dy < -Math.PI) dy += TAU;
    this.prevYaw = yaw;
    this.yawVel += ((dt > 0 ? dy / dt : 0) - this.yawVel) * Math.min(1, dt * 10);
    const lag = Math.max(-1.2, Math.min(1.2, this.yawVel * 0.07));
    const hop = hopA ? Math.sin((hopA.t / hopA.dur) * Math.PI) : 0;
    for (const sw of this.swayers) {
      const idle = Math.sin(T * 2.1 + sw.phase) * 0.06;
      sw.obj.rotation.x = sw.tilt + idle + hop * 0.2 - (poseA?.kind === 'jump' ? 0.25 : 0);
      sw.obj.rotation.z = (sw.side === 0 ? 0 : sw.side * 0.08) + Math.sin(T * 1.6 + sw.phase) * 0.04 - lag * (sw.side === 0 ? 0.9 : 0.6) + sw.side * lag * 0.2;
    }

    // proxies → real mounts (juice pops the proxy's scale)
    for (const slot of ['top', 'bottom', 'shoes'] as const) {
      const s = this.proxy[slot].scale;
      for (const m of this.mounts[slot]) m.scale.copy(s);
    }
  }

  // ── Construction ─────────────────────────────────────────────────────────
  private mk(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, o: { skin?: boolean; cast?: boolean; recv?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = this.shadows && (o.cast ?? true);
    m.receiveShadow = this.shadows && (o.recv ?? true);
    if (o.skin) m.userData.skin = true;
    parent.add(m);
    return m;
  }
  private put(parent: THREE.Object3D, ps: Piece[], color: string, finish: Finish): void {
    for (const p of ps) {
      const m = this.mk(parent, p.geo, roleMat(p.role, color, this.outfit.skin, finish));
      if (p.role === 'skin') m.userData.skin = true;
    }
  }

  private buildRig(): void {
    const skinMat = () => toyMat(this.outfit.skin, 'satin');
    const rig = this.rig;

    // ── legs ──
    rig.add(this.legsRoot);
    for (const s of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13, 0.5, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.2;
      const ankle = new THREE.Group();
      ankle.position.y = -0.18;
      const thighBottom = new THREE.Group();
      const shinBottom = new THREE.Group();
      const foot = new THREE.Group();
      this.mk(hip, capsule(THIGH_R, THIGH_LEN), skinMat(), { skin: true }).position.y = THIGH_Y;
      this.mk(knee, capsule(SHIN_R, SHIN_LEN), skinMat(), { skin: true }).position.y = SHIN_Y;
      hip.add(thighBottom, knee);
      knee.add(shinBottom, ankle);
      ankle.add(foot);
      this.legsRoot.add(hip);
      this.legs.push({ s, hip, knee, thighBottom, shinBottom, foot });
      this.mounts.bottom.push(thighBottom, shinBottom);
      this.mounts.shoes.push(foot);
    }

    // ── torso ──
    this.torso.position.y = TY;
    rig.add(this.torso);
    const bodyGeo = cached('torsoSkin', () => {
      const last = TORSO_TABLE.length - 1;
      const g = new THREE.LatheGeometry(TORSO_TABLE.filter((_, i) => i % 8 === 0 || i === last).map((p) => new THREE.Vector2(p.r, p.y)), 36);
      torsoSpace(g);
      return g;
    });
    this.mk(this.torso, bodyGeo, skinMat(), { skin: true });
    this.torso.add(this.topMount, this.bottomMount);
    this.mounts.top.push(this.topMount);
    this.mounts.bottom.push(this.bottomMount);

    // ── arms ──
    for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.25, 0.86, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -0.145;
      const wrist = new THREE.Group();
      wrist.position.y = -0.14;
      const upperTop = new THREE.Group();
      const lowerTop = new THREE.Group();
      this.mk(shoulder, capsule(0.062, 0.04), skinMat(), { skin: true }).position.y = -0.07;
      this.mk(elbow, capsule(0.058, 0.04), skinMat(), { skin: true }).position.y = -0.07;
      const hand = cached(`hand|${s}`, () => {
        const b = new GB();
        b.e([0, -0.05, 0], [0.074, 0.08, 0.068]);
        b.e([-s * 0.066, -0.036, 0.034], 0.037);
        return b.build();
      });
      this.mk(wrist, hand, skinMat(), { skin: true });
      shoulder.add(upperTop, elbow);
      elbow.add(lowerTop, wrist);
      this.arms.push({ s, shoulder, elbow, upperTop, lowerTop });
      this.mounts.top.push(upperTop, lowerTop);
      rig.add(shoulder);
    }

    // ── head ──
    this.headRoot.position.y = NECK_Y;
    rig.add(this.headRoot);
    this.headBody.position.y = HEAD_CY;
    this.headRoot.add(this.headBody);
    const hb = this.headBody;
    const head = this.mk(hb, cached('headSphere', () => new THREE.SphereGeometry(1, 36, 24)), skinMat(), { skin: true });
    head.scale.set(HX, HY, HZ);
    const kit = getFaceKit();
    for (const s of [-1, 1]) {
      const ear = this.mk(hb, kit.earGeo, skinMat(), { skin: true });
      ear.scale.set(0.05, 0.072, 0.06);
      ear.position.set(0.405 * s, -0.025, -0.01);
    }
    // eyes (blink by scaling the group in y) + blush
    for (const s of [-1, 1]) {
      const { p, n } = facePoint(27 * s, -6, -0.014);
      const eg = new THREE.Group();
      eg.position.copy(p);
      eg.quaternion.copy(frameQ(n));
      this.mk(eg, kit.eyeGeo, kit.eyeMat, { cast: false, recv: false });
      this.mk(eg, kit.hlGeo, kit.hlMat, { cast: false, recv: false });
      hb.add(eg);
      this.eyes.push(eg);
      const b = facePoint(40 * s, -21, 0.006);
      const bl = this.mk(hb, kit.blushGeo, kit.blushMat, { cast: false, recv: false });
      bl.position.copy(b.p);
      bl.quaternion.copy(frameQ(b.n, -0.12 * s));
      bl.renderOrder = 2;
    }
    const mp = facePoint(0, -27, 0.004);
    this.mouth = this.mk(hb, kit.mouthGeo, kit.mouthMat, { cast: false, recv: false });
    this.mouth.position.copy(mp.p);
    this.mouth.quaternion.copy(frameQ(mp.n));
    hb.add(this.hairMount, this.accMount);
  }

  private rebuildAll(): void {
    this.applySkin();
    this.buildHair();
    this.buildAccessory();
    this.buildTop();
    this.buildBottom();
    this.buildShoes();
  }

  private applySkin(): void {
    const mat = toyMat(this.outfit.skin, 'satin');
    this.rig.traverse((o) => {
      if (o.userData.skin) (o as THREE.Mesh).material = mat;
    });
  }

  private buildHair(): void {
    const o = this.outfit;
    const acc = getAccessory(o.accessory.style);
    this.wearsHat = !!acc?.hat;
    const parts = getHair(o.hair.style);
    this.hairTopY = this.wearsHat ? getHair(0).topY : parts.topY;
    this.hairMount.clear();
    this.swayers = [];
    const mat = toyMat(o.hair.color, 'gloss');
    this.mk(this.hairMount, parts.base, mat);
    if (parts.vol && !this.wearsHat) this.mk(this.hairMount, parts.vol, mat);
    if (parts.accent) this.mk(this.hairMount, parts.accent, toyMat(tint(o.hair.color, 0.5), 'gloss'));
    parts.tails.forEach((t, i) => {
      const g = new THREE.Group();
      g.position.set(...t.pivot);
      const m = this.mk(g, t.geo, mat);
      m.position.set(0, 0, 0);
      // tail geometry is authored around the pivot already
      this.hairMount.add(g);
      this.swayers.push({ obj: g, side: t.side, phase: i * 1.7, tilt: t.tilt });
    });
  }

  private buildAccessory(): void {
    const o = this.outfit;
    this.accMount.clear();
    this.accTopY = 0;
    const acc = getAccessory(o.accessory.style);
    if (!acc) return;
    const hair = getHair(o.hair.style);
    const hr = acc.hat || acc.fixed ? 1.1 : hair.hairR;
    const topY = acc.hat ? getHair(0).topY : hair.topY;
    const s = hr / 1.1;
    const g = new THREE.Group();
    const finish: Finish = 'gloss';
    this.put(g, acc.pieces, o.accessory.color, finish);
    if (acc.glass) this.mk(g, acc.glass, getLensMat(), { cast: false, recv: false });
    const style = o.accessory.style;
    if (style === ACC_BOW || style === ACC_FLOWER) {
      // sit on the hair surface, up and to the side
      const sideSign = style === ACC_BOW ? 1 : -1;
      const { p, n } = facePoint(sideSign * (style === ACC_BOW ? 46 : 58), style === ACC_BOW ? 52 : 34, 0.035, hr);
      g.position.copy(p);
      g.quaternion.copy(frameQ(n, style === ACC_BOW ? -0.45 * sideSign : 0.5 * sideSign));
      g.scale.setScalar(style === ACC_BOW ? 1.3 : 1.5);
      this.accTopY = Math.max(0, p.y + 0.1);
    } else if (acc.fixed) {
      this.accTopY = 0;
    } else {
      const bump = style === ACC_CROWN ? 1.18 : 1;
      g.scale.setScalar(s * bump);
      g.position.y = topY - 0.435 * s * bump + (style === ACC_CROWN ? 0.02 : 0);
      this.accTopY = style === ACC_CROWN ? topY + 0.12 : style === ACC_EARS ? topY + 0.2 : style === ACC_BEANIE ? 0.62 : topY;
      if (style === ACC_CAP) this.accTopY = 0.5;
    }
    this.accMount.add(g);
  }

  private buildTop(): void {
    const o = this.outfit;
    const parts = getTop(o.top.style);
    this.topMount.clear();
    this.put(this.topMount, parts.torso, o.top.color, 'fabric');
    for (const arm of this.arms) {
      arm.upperTop.clear();
      arm.lowerTop.clear();
      this.put(arm.upperTop, parts.upper, o.top.color, 'fabric');
      this.put(arm.lowerTop, parts.lower, o.top.color, 'fabric');
    }
  }

  private buildBottom(): void {
    const o = this.outfit;
    const st = o.bottom.style;
    const tops = o.top.style;
    this.bottomMount.clear();
    this.put(this.bottomMount, getBottom(st, tops, 0).torso, o.bottom.color, 'fabric');
    this.legs.forEach((leg, i) => {
      const parts = getBottom(st, tops, i);
      leg.thighBottom.clear();
      leg.shinBottom.clear();
      this.put(leg.thighBottom, parts.thigh, o.bottom.color, 'fabric');
      this.put(leg.shinBottom, parts.shin, o.bottom.color, 'fabric');
    });
  }

  private buildShoes(): void {
    const o = this.outfit;
    const ps = getShoes(o.shoes.style);
    for (const leg of this.legs) {
      leg.foot.clear();
      this.put(leg.foot, ps, o.shoes.color, 'gloss');
    }
    this.applySkin(); // sandals have bare feet
  }
}
