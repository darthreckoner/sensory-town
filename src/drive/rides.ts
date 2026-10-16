// ── v3 rides ─────────────────────────────────────────────────────────────────
// Six original, chunky, toy-like vehicles: sports car, pickup, golf cart,
// hoverboard, ice-cream truck, boat. Each model is built once per kind with the
// Mesher and baked into at most FOUR meshes (draw calls):
//   paint   the body, in the wrap colour / finish (one material per ride)
//   flat    every other solid part (vertex-coloured, shared by all rides)
//   neon    lights and glow (unlit; the tail lights can brighten when braking)
//   wheels  one InstancedMesh for all the wheels (they spin and steer)
// (the hoverboard and the boat have no wheels: three meshes).
//
// Local space faces -z (like a camera); the scene places a ride with
// setPose(x, y, z, heading, pitch, roll).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleKind } from '../core/model';
import { tuning } from '../tuning';
import { toyMatUnique, roundedBox } from '../art/materials';
import { Character } from '../art/character';
import { Mesher } from './mesher';
import { clamp, lathe } from './envUtils';
import { loftBody, loftRings, sampleSections, profile, stations, archStations, archFn, tube, makeWheel, type WheelParts } from './rideKit';

export type RideKind = VehicleKind;
export const RIDE_KINDS: RideKind[] = ['sports', 'pickup', 'golfcart', 'hoverboard', 'icecream', 'boat'];

export type RideFinish = 'gloss' | 'matte' | 'pearl' | 'chrome' | 'glitter';
export interface RideStyle {
  finish: RideFinish;
  neon: string | null;
  trail: boolean;
  rims: string;
}
/** rims '' = the ride's own rim colour (RIDE_INFO[kind].rim); the paint sheet's swatches override it */
export const DEFAULT_STYLE: RideStyle = { finish: 'gloss', neon: null, trail: false, rims: '' };

export interface RideInfo {
  name: string;
  icon: string;
  color: string;
  /** a passenger can ride along (jobs) */
  passenger: boolean;
  /** the rider stands (hoverboard) */
  standing: boolean;
  blurb: string;
  /** default rim colour */
  rim: string;
}
export const RIDE_INFO: Record<RideKind, RideInfo> = {
  sports: { name: 'Comet Coupe', icon: '🏎️', color: '#ff2e88', passenger: true, standing: false, blurb: 'Fast and drifty, with boost', rim: '#ffd23f' },
  pickup: { name: 'Trail Truck', icon: '🛻', color: '#2ec4b6', passenger: true, standing: false, blurb: 'Bouncy and tall, best off-road', rim: '#ff7a1a' },
  golfcart: { name: 'Cruiser Cart', icon: '🛺', color: '#7c4dff', passenger: true, standing: false, blurb: 'Slow, tight turns, putt-putt', rim: '#ffffff' },
  hoverboard: { name: 'Glide Board', icon: '🛹', color: '#00d4ff', passenger: false, standing: true, blurb: 'Carve, hop, skim the shallows', rim: '#d9dce6' },
  icecream: { name: 'Sundae Van', icon: '🍦', color: '#ffb3d1', passenger: true, standing: false, blurb: 'Heavy and wobbly, plays a jingle', rim: '#ffffff' },
  boat: { name: 'Splash Boat', icon: '🚤', color: '#ffc93c', passenger: true, standing: false, blurb: 'Water only, with a wake', rim: '#d9dce6' },
};

/** What the physics + scene tell a ride's body each frame. */
export interface RideMotion {
  /** Signed forward speed, units / s. */
  speed: number;
  speed01: number;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  steer: number;
  /** Longitudinal acceleration, units / s². */
  accel: number;
  /** Cornering force proxy: yawRate × speed. Positive = turning right. */
  lateral: number;
  braking: boolean;
  /** 0..1 */
  boost: number;
  airborne: boolean;
  /** sideways slip speed */
  slip: number;
}

// ── colours ─────────────────────────────────────────────────────────────────
const DARK = '#1b1a22', TRIM = '#26242e', CHROME = '#d8dbe6', GLASS = '#2a4d6e', SEAT = '#2a2733', WHITE = '#f3f2ee', RED = '#d4262d';

// ── shared materials ────────────────────────────────────────────────────────
// FLAT is vertex-coloured, so every flat part of every ride is ONE draw call (the Mesher folds it into a shared material).
const FLAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 });
const NEON = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const WHEELS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
/** tinted glass with a strong sky reflection (the cabins of the lofted rides) */
const GLASS_MAT = new THREE.MeshPhysicalMaterial({ color: '#27425c', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.5, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false });
GLASS_MAT.userData.keep = true;

// ── wheels: tyres with a rounded sidewall + tread grooves, dished spoked rims (rideKit.ts) ──
type WheelGeo = WheelParts;
type WheelStyle = 'alloy' | 'offroad' | 'cart';
function makeWheelGeometry(R: number, W: number, style: WheelStyle): WheelGeo {
  return makeWheel(R, W, style === 'alloy' ? 'sport' : style);
}

// ── the models ──────────────────────────────────────────────────────────────
export interface Spec {
  wheelR: number;
  wheelW: number;
  wheelStyle: WheelStyle;
  /** axle positions (y = axle height) */
  wheels: { x: number; y: number; z: number; front: boolean }[];
  /** the seated driver: seat-cushion point + scale (null = stands: see `stand`) */
  driver: { x: number; y: number; z: number; scale: number } | null;
  /** where a standing rider's feet go */
  stand: { x: number; y: number; z: number; yaw: number } | null;
  passenger: { x: number; y: number; z: number } | null;
  /** number of tail-light boxes (the LAST neon calls) — they brighten when braking */
  tailBoxes: number;
  /** boost exhaust positions (flames / sprinkles) */
  exhausts: [number, number, number][];
  /** approximate size, for the glow plane and the camera */
  length: number;
  width: number;
  height: number;
  /** extra rotation for the whole rider on the board, etc. */
  hasPaint: boolean;
}

interface Template {
  spec: Spec;
  glass: THREE.BufferGeometry | null;
  paint: THREE.BufferGeometry | null;
  flat: THREE.BufferGeometry | null;
  neon: THREE.BufferGeometry | null;
  neonCount: number;
  wheel: WheelGeo | null;
}

type Builder = (m: Mesher, paint: THREE.Material) => Spec;

const body = (m: Mesher, mat: THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, d: number, color?: string, yaw = 0): void => {
  m.box(mat, cx, cy, cz, w, h, d, { color, yaw, cast: false });
};

/** Both faces of a one-sided plate (windshields, panels). */
function plate(m: Mesher, mat: THREE.Material, p0: number[], p1: number[], p2: number[], p3: number[], color: string): void {
  m.quad(mat, p0, p1, p2, p3, undefined, color);
  m.quad(mat, p2, p1, p0, p3, undefined, color);   // (the back face starts at p2: a triangle with p3 = p2 keeps a real normal)
}

// ── v3 polish: soft shapes (bevelled boxes, balls, rings, cones) ─────────────────
// The Mesher only makes sharp boxes. The rounded parts are plain geometry built here and folded into the SAME three buckets
// (paint / flat / neon) when the template is merged — so a ride is still three or four draw calls.
type Bk = 'paint' | 'flat' | 'neon' | 'glass';
let EX: Record<Bk, THREE.BufferGeometry[]> = { paint: [], flat: [], neon: [], glass: [] };
type Colour = string | ((x: number, y: number, z: number) => string);
const E_Q = new THREE.Quaternion(), E_E = new THREE.Euler(), E_P = new THREE.Vector3(), E_S = new THREE.Vector3(), E_C = new THREE.Color();
type Rot = [number, number, number];

function xf(cx: number, cy: number, cz: number, rot?: Rot, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  E_E.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, 'YXZ');
  E_Q.setFromEuler(E_E);
  return new THREE.Matrix4().compose(E_P.set(cx, cy, cz), E_Q, E_S.set(sx, sy, sz));
}

function emit(b: Bk, src: THREE.BufferGeometry, m4: THREE.Matrix4, color?: Colour): void {
  let g = src.clone().applyMatrix4(m4);
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = p.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (b !== 'paint' && b !== 'glass') {
    const col = new Float32Array(n * 3);
    if (typeof color === 'function') {
      for (let i = 0; i < n; i += 3) {
        E_C.set(color((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3));
        for (let k = 0; k < 3; k++) col.set([E_C.r, E_C.g, E_C.b], (i + k) * 3);
      }
    } else {
      E_C.set(color ?? '#ffffff');
      for (let i = 0; i < n; i++) col.set([E_C.r, E_C.g, E_C.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  EX[b].push(g);
}
/** A bevelled box (r = corner radius). */
function rbox(b: Bk, cx: number, cy: number, cz: number, w: number, h: number, d: number, r: number, color?: Colour, rot?: Rot, seg = 1, soft = false): void {
  // thin trim (< 13 cm) is not worth rounding: a plain box keeps the triangle count down
  emit(b, !soft && Math.min(w, h, d) < 0.13 ? new THREE.BoxGeometry(w, h, d) : roundedBox(w, h, d, r, seg), xf(cx, cy, cz, rot), color);
}
/** A squashed ball (radii rx, ry, rz). */
function ball(b: Bk, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: Colour | undefined, rot?: Rot, seg = 10, rings = 6): void {
  emit(b, new THREE.SphereGeometry(1, seg, rings), xf(cx, cy, cz, rot, rx, ry, rz), color);
}
/** A cone / cylinder centred at (cx, cy, cz); axis up (rot lays it down). */
function cone(b: Bk, cx: number, cy: number, cz: number, rBot: number, rTop: number, h: number, color: Colour, seg = 12, rot?: Rot, hSeg = 1): void {
  emit(b, new THREE.CylinderGeometry(rTop, rBot, h, seg, hSeg), xf(cx, cy, cz, rot), color);
}
/** A torus (axis z by default): steering wheels, light rings. */
function ring(b: Bk, cx: number, cy: number, cz: number, R: number, tube: number, color: Colour, rot?: Rot, seg = 8, tseg = 16): void {
  emit(b, new THREE.TorusGeometry(R, tube, seg, tseg), xf(cx, cy, cz, rot), color);
}

/** A seated driver's steering wheel, placed where the Character's two grip hands actually are (measured: hips + (±.23, +.31, −.47) × scale). */
function steeringWheel(drv: { x: number; y: number; z: number; scale: number }, color = DARK, tilt = 0.55): void {
  const s = drv.scale, cx = drv.x, cy = drv.y + 0.31 * s, cz = drv.z - 0.47 * s;
  ring('flat', cx, cy, cz, 0.215 * s, 0.035 * s, color, [tilt, 0, 0], 6, 16);
  ball('flat', cx, cy, cz, 0.06 * s, 0.06 * s, 0.05 * s, '#ff2e88', [tilt, 0, 0], 8, 6); // hub
  rbox('flat', cx, cy, cz, 0.4 * s, 0.035 * s, 0.035 * s, 0.012, color, [tilt, 0, 0]); // spoke
  // the column runs forward and down to the dash
  rbox('flat', cx, cy - 0.13 * s, cz - 0.17 * s, 0.05 * s, 0.05 * s, 0.34 * s, 0.02, DARK, [tilt + 0.6, 0, 0]);
}

/** Confetti decals on a vertical plane: axis 'x' = the plane x = at (u runs along z); axis 'z' = the plane z = at (u runs along x). */
function sprinkles(m: Mesher, axis: 'x' | 'z', at: number, u0: number, u1: number, y0: number, y1: number, n: number, seed: number, pal: string[]): void {
  let s = seed;
  const rnd = (): number => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < n; i++) {
    const u = u0 + rnd() * (u1 - u0), y = y0 + rnd() * (y1 - y0), a = rnd() * Math.PI, c = pal[Math.floor(rnd() * pal.length)];
    const du = Math.cos(a) * 0.075, dy = Math.sin(a) * 0.075, nu = -Math.sin(a) * 0.02, ny = Math.cos(a) * 0.02;
    const P = (uu: number, yy: number): number[] => (axis === 'x' ? [at, yy, uu] : [uu, yy, at]);
    plate(m, FLAT, P(u - du - nu, y - dy - ny), P(u + du - nu, y + dy - ny), P(u + du + nu, y + dy + ny), P(u - du + nu, y - dy + ny), c);
  }
}

/** A flat five-point star decal on a vertical plane. */
function star(m: Mesher, axis: 'x' | 'z', at: number, uc: number, yc: number, R: number, color: string): void {
  const P = (u: number, y: number): number[] => (axis === 'x' ? [at, y, u] : [u, y, at]);
  const pt = (k: number, r: number): [number, number] => [uc + Math.cos(Math.PI / 2 + (k * Math.PI) / 5) * r, yc + Math.sin(Math.PI / 2 + (k * Math.PI) / 5) * r];
  for (let i = 0; i < 5; i++) {
    const a = pt(i * 2, R), b = pt(i * 2 + 1, R * 0.45), c = pt(i * 2 - 1, R * 0.45);
    plate(m, FLAT, P(uc, yc), P(c[0], c[1]), P(a[0], a[1]), P(b[0], b[1]), color);
  }
}

// ── lofted-body helpers ──────────────────────────────────────────────────────
const I4 = new THREE.Matrix4();
/** Put any geometry into a bucket as it is (it is already in ride space). */
function put(b: Bk, g: THREE.BufferGeometry, color?: Colour): void {
  emit(b, g, I4, color);
}
/** A flat decal ribbon hugging a surface: x centre, width, y(z) and the z list. */
function ribbon(b: Bk, zs: number[], xc: number, w: number, y: (z: number) => number, color: Colour, lift = 0.006): void {
  const pos: number[] = [], idx: number[] = [];
  zs.forEach((z, i) => {
    pos.push(xc - w / 2, y(z) + lift, z, xc + w / 2, y(z) + lift, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setIndex(idx);
  put(b, g, color);
}
/** A flared arch lip: a half torus over a wheel (axis along x), at lateral position x. */
function archLip(b: Bk, x: number, wy: number, wz: number, r: number, tube: number, color?: Colour): void {
  const g = new THREE.TorusGeometry(r, tube, 5, 16, Math.PI).rotateY(Math.PI / 2);
  emit(b, g, new THREE.Matrix4().makeTranslation(x, wy, wz), color);
}
/** A tube (pillar, rail) through points, in a bucket. */
function pipe(b: Bk, pts: [number, number, number][], r: number, color?: Colour, radial = 6): void {
  put(b, tube(pts, r, radial), color);
}
const GLASS_TINT = '#27425c';
/** A fine mesh grille: a dark recess, many hair-thin bars, and a rounded chrome surround (a tube round a rounded rectangle). Faces -z. */
function meshGrille(cx: number, cy: number, cz: number, w: number, h: number, nv: number, nh: number): void {
  rbox('flat', cx, cy, cz, w, h, 0.05, 0.03, '#0d0c12', undefined, 1, true);
  for (let i = 0; i < nv; i++) rbox('flat', cx - w / 2 + ((i + 0.5) * w) / nv, cy, cz - 0.03, 0.007, h * 0.92, 0.012, 0.003, '#8c93a6');
  for (let j = 0; j < nh; j++) rbox('flat', cx, cy - h / 2 + ((j + 0.5) * h) / nh, cz - 0.034, w * 0.96, 0.008, 0.012, 0.003, '#a9afc0');
  const rx = w / 2 + 0.022, ry = h / 2 + 0.022, rc = Math.min(rx, ry) * 0.5;
  const pts: [number, number, number][] = [];
  const corner = (px: number, py: number, a0: number): void => {
    for (let k = 0; k <= 2; k++) {
      const a = a0 + (k / 2) * (Math.PI / 2);
      pts.push([px + Math.cos(a) * rc, py + Math.sin(a) * rc, cz - 0.03]);
    }
  };
  corner(cx + rx - rc, cy + ry - rc, 0);
  corner(cx - rx + rc, cy + ry - rc, Math.PI / 2);
  corner(cx - rx + rc, cy - ry + rc, Math.PI);
  corner(cx + rx - rc, cy - ry + rc, Math.PI * 1.5);
  pts.push([pts[0][0], pts[0][1], pts[0][2]]);
  pipe('flat', pts, 0.017, CHROME, 5);
}

// ── sports coupe: a long low hood, a fastback glass canopy, wide haunches, a wing ──
const buildSports: Builder = (m, paint) => {
  const WB = 1.325, R = 0.36;
  const wheelsAt = [{ z: -WB, y: R, r: R }, { z: WB, y: R, r: R }];
  const hw = profile([[-2.25, 0.72], [-2.2, 0.8], [-2.05, 0.89], [-1.75, 0.95], [-1.3, 0.97], [-0.6, 0.945], [0.2, 0.935], [0.9, 0.96], [1.4, 0.985], [1.85, 0.96], [2.1, 0.89], [2.25, 0.76]]);
  const top = profile([[-2.25, 0.6], [-2.2, 0.63], [-2.0, 0.69], [-1.6, 0.77], [-1.2, 0.82], [-0.8, 0.85], [-0.3, 0.83], [0.5, 0.83], [1.1, 0.85], [1.6, 0.91], [2.0, 0.94], [2.2, 0.92], [2.25, 0.88]]);
  const bot = profile([[-2.25, 0.33], [-2.15, 0.22], [-2.0, 0.15], [2.0, 0.16], [2.15, 0.24], [2.25, 0.35]]);
  const rnd = profile([[-2.25, 0.7], [-1.8, 0.58], [-0.8, 0.5], [1.0, 0.5], [1.8, 0.58], [2.25, 0.7]]);
  const zs = stations(-2.25, 2.25, 9, archStations([-WB, WB], R, [0, 0.5, 0.85, 1.05]));
  put('paint', loftBody(sampleSections(zs, { hw, top, bottom: bot, round: rnd, taper: () => 0.07, arch: archFn(wheelsAt, 0.07) }), 30));
  // the glass canopy (a second loft) with a painted roof lid, A / B / C pillars in body colour
  const gTop = profile([[-0.8, 0.8], [-0.6, 0.93], [-0.35, 1.09], [-0.05, 1.19], [0.4, 1.22], [0.85, 1.19], [1.15, 1.08], [1.4, 0.93], [1.5, 0.84]]);
  const gHw = profile([[-0.8, 0.74], [-0.4, 0.82], [0.1, 0.86], [0.7, 0.85], [1.2, 0.79], [1.5, 0.6]]);
  const gz = stations(-0.8, 1.5, 12);
  put('glass', loftBody(sampleSections(gz, { hw: gHw, top: gTop, bottom: () => 0.74, round: () => 0.4, taper: () => 0.3 }), 28));
  const lz = stations(-0.12, 1.02, 7);
  put('paint', loftBody(sampleSections(lz, { hw: (z) => 0.5 * Math.min(1, 0.55 + (z + 0.12) * 4) * Math.min(1, 0.45 + (1.02 - z) * 2.5), top: (z) => gTop(z) + 0.018, bottom: (z) => gTop(z) - 0.05, round: () => 0.3 }), 20));
  for (const sx of [-1, 1]) {
    pipe('paint', [[sx * 0.83, 0.8, -0.74], [sx * 0.7, 0.96, -0.45], [sx * 0.52, 1.14, -0.12]], 0.034);
    pipe('paint', [[sx * 0.5, 1.185, 0.9], [sx * 0.64, 1.03, 1.2], [sx * 0.8, 0.86, 1.45]], 0.055);
    pipe('paint', [[sx * 0.84, 0.8, 0.32], [sx * 0.68, 1.0, 0.3], [sx * 0.54, 1.17, 0.28]], 0.03);
    pipe('flat', [[sx * 0.9, 0.835, -0.7], [sx * 0.92, 0.835, 0.4], [sx * 0.86, 0.835, 1.42]], 0.014, CHROME); // belt trim
  }
  // wheel-arch lips (body colour), side skirts, splitter, diffuser, intake
  for (const sx of [-1, 1]) {
    for (const wz of [-WB, WB]) archLip('paint', sx * (hw(wz) - 0.008), R, wz, R + 0.075, 0.03);
    pipe('flat', [[sx * hw(-0.9) * 0.9, 0.25, -0.9], [sx * hw(0) * 0.915, 0.24, 0], [sx * hw(0.9) * 0.9, 0.25, 0.9]], 0.024, '#1b1a22'); // skirt: a rounded lip hugging the sill
  }
  ball('paint', 0, 0.2, -2.1, 0.56, 0.03, 0.16, undefined); // chin lip: a flattened ellipsoid in body colour under the nose
  ball('flat', 0, 0.22, 2.08, 0.58, 0.035, 0.12, '#1b1a22'); // rear diffuser lip
  meshGrille(0, 0.42, -2.255, 0.66, 0.13, 17, 3);
  // racing stripes down the hood and the deck
  const hoodZ = stations(-2.12, -0.82, 9), deckZ = stations(1.25, 2.12, 7);
  for (const sx of [-1, 1]) {
    ribbon('flat', hoodZ, sx * 0.17, 0.09, top, WHITE);
    ribbon('flat', deckZ, sx * 0.17, 0.09, top, WHITE);
    // door line, handle, mirror
    rbox('flat', sx * (hw(-0.5) + 0.004), 0.5, -0.5, 0.012, 0.36, 0.014, 0.004, '#14131a');
    rbox('flat', sx * (hw(0.75) + 0.004), 0.5, 0.75, 0.012, 0.36, 0.014, 0.004, '#14131a');
    rbox('flat', sx * (hw(0.1) + 0.012), 0.64, 0.1, 0.02, 0.025, 0.14, 0.01, CHROME);
    rbox('flat', sx * 0.92, 0.9, -0.52, 0.12, 0.02, 0.04, 0.008, '#1b1a22');
    ball('paint', sx * 1.0, 0.93, -0.5, 0.065, 0.055, 0.1, undefined);
  }
  // the spoiler: a wing on two posts with end plates
  for (const sx of [-1, 1]) {
    cone('flat', sx * 0.46, 1.02, 1.98, 0.035, 0.03, 0.22, '#1b1a22', 8);
    rbox('paint', sx * 0.86, 1.1, 2.02, 0.035, 0.2, 0.46, 0.015, undefined, undefined, 1, true);
  }
  rbox('paint', 0, 1.12, 2.02, 1.74, 0.045, 0.4, 0.02, undefined, [0.08, 0, 0], 1, true);
  rbox('flat', 0, 1.145, 2.0, 1.2, 0.01, 0.07, 0.003, WHITE, [0.08, 0, 0]);
  // exhaust tips
  for (const sx of [-1, 1]) cone('flat', sx * 0.52, 0.26, 2.27, 0.055, 0.05, 0.22, CHROME, 12, [Math.PI / 2, 0, 0]);
  // interior seen through the glass: dash, seats, steering wheel on the driver's hands
  const DRV = { x: -0.42, y: 0.44, z: 0.5, scale: 0.72 }; // W1 body remodel: 0.82 -> 0.72 (the 7.3-head body left 1.4 cm under the roof and the shins through the floor pan)
  rbox('flat', 0, 0.78, -0.55, 1.6, 0.14, 0.4, 0.05, '#1b1a22');
  for (const sx of [-1, 1]) {
    rbox('flat', sx * 0.42, 0.82, 0.86, 0.46, 0.5, 0.13, 0.06, SEAT);
    rbox('flat', sx * 0.42, 1.07, 0.88, 0.26, 0.14, 0.1, 0.05, SEAT);
  }
  steeringWheel(DRV);
  // lights, inset into the body: headlights + a daytime strip, a tail-light bar (the two corner boxes below brighten when braking)
  for (const sx of [-1, 1]) {
    ball('neon', sx * 0.55, 0.49, -2.19, 0.23, 0.065, 0.05, '#eaf6ff', [0, sx * 0.4, 0]);
    ball('neon', sx * 0.66, 0.34, -2.19, 0.09, 0.045, 0.04, '#ffffff', [0, sx * 0.4, 0]);
  }
  rbox('neon', 0, 0.74, 2.25, 0.9, 0.03, 0.03, 0.01, '#a01822');
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.62, 0.74, 2.235, 0.38, 0.1, 0.05, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 0.83, y: R, z: sz * WB, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.3, wheelStyle: 'alloy', wheels,
    driver: DRV, stand: null, passenger: { x: 0.42, y: 0.44, z: 0.5 },
    tailBoxes: 2, exhausts: [[-0.52, 0.26, 2.4], [0.52, 0.26, 2.4]], length: 4.5, width: 1.95, height: 1.22, hasPaint: true,
  };
};

// ── pickup: a tall, lifted truck with a glass cab, flared arches and a bed with rails ──
const buildPickup: Builder = (m, paint) => {
  const R = 0.45, FZ = -1.62, RZ = 1.5;
  const wheelsAt = [{ z: FZ, y: R, r: R }, { z: RZ, y: R, r: R }];
  const hw = profile([[-2.6, 0.58], [-2.55, 0.8], [-2.4, 0.93], [-2.0, 0.98], [-1.0, 1.0], [0, 0.985], [1.0, 0.99], [2.0, 0.985], [2.5, 0.96], [2.6, 0.9]]);
  const top = profile([[-2.6, 0.92], [-2.55, 1.0], [-2.3, 1.12], [-1.8, 1.22], [-1.0, 1.27], [0, 1.25], [2.5, 1.25], [2.6, 1.22]]);
  const bot = profile([[-2.6, 0.62], [-2.45, 0.5], [-2.2, 0.46], [2.2, 0.46], [2.45, 0.5], [2.6, 0.62]]);
  const rnd = profile([[-2.6, 0.9], [-2.0, 0.65], [-1.0, 0.55], [2.0, 0.55], [2.6, 0.75]]);
  const zs = stations(-2.6, 2.6, 8, archStations([FZ, RZ], R, [0, 0.5, 0.85, 1.05]));
  put('paint', loftBody(sampleSections(zs, { hw, top, bottom: bot, round: rnd, taper: () => 0.05, arch: archFn(wheelsAt, 0.09) }), 30));
  // the glass cab
  const gTop = profile([[-1.0, 1.25], [-0.78, 1.5], [-0.5, 1.8], [-0.12, 1.92], [0.3, 1.92], [0.5, 1.82], [0.6, 1.3]]);
  const gHw = profile([[-1.0, 0.8], [-0.7, 0.88], [0, 0.9], [0.5, 0.88], [0.6, 0.78]]);
  put('glass', loftBody(sampleSections(stations(-1.0, 0.6, 12), { hw: gHw, top: gTop, bottom: () => 1.2, round: () => 0.35, taper: () => 0.14 }), 28));
  const lz = stations(-0.42, 0.5, 7);
  put('paint', loftBody(sampleSections(lz, { hw: (z) => 0.68 * Math.min(1, 0.5 + (z + 0.42) * 3) * Math.min(1, 0.5 + (0.5 - z) * 3), top: (z) => gTop(z) + 0.02, bottom: (z) => gTop(z) - 0.06, round: () => 0.3 }), 20));
  for (const sx of [-1, 1]) {
    pipe('paint', [[sx * 0.9, 1.27, -0.98], [sx * 0.8, 1.6, -0.72], [sx * 0.66, 1.9, -0.4]], 0.04);
    pipe('paint', [[sx * 0.66, 1.9, 0.44], [sx * 0.8, 1.6, 0.52], [sx * 0.9, 1.28, 0.58]], 0.045);
    pipe('paint', [[sx * 0.9, 1.27, -0.2], [sx * 0.78, 1.6, -0.2], [sx * 0.66, 1.9, -0.2]], 0.03);
    pipe('flat', [[sx * 0.95, 1.275, -0.96], [sx * 0.98, 1.275, 0.0], [sx * 0.92, 1.275, 0.56]], 0.015, CHROME);
  }
  // bed: dark liner, side rails, headboard, tailgate, a chrome sport bar with a light bar
  rbox('flat', 0, 1.262, 1.58, 1.66, 0.03, 1.85, 0.01, '#2a2830');
  for (const sx of [-1, 1]) rbox('paint', sx * 0.93, 1.36, 1.58, 0.1, 0.18, 1.95, 0.05, undefined, undefined, 1, true);
  rbox('paint', 0, 1.4, 0.68, 1.9, 0.3, 0.1, 0.05, undefined, undefined, 1, true);
  rbox('paint', 0, 1.38, 2.55, 1.94, 0.26, 0.1, 0.05, undefined, undefined, 1, true);
  rbox('flat', 0, 1.42, 2.605, 0.4, 0.05, 0.03, 0.02, '#14131a');
  pipe('flat', [[-0.86, 1.3, 0.78], [-0.86, 1.86, 0.8], [0.86, 1.86, 0.8], [0.86, 1.3, 0.78]], 0.035, CHROME, 7);
  cone('flat', 0, 1.93, 0.8, 0.065, 0.065, 1.5, '#14131a', 10, [0, 0, Math.PI / 2]);
  // arches: dark plastic flares round every wheel, mud flaps, side steps, skid plate
  for (const sx of [-1, 1]) {
    for (const wz of [FZ, RZ]) {
      archLip('flat', sx * (hw(wz) + 0.02), R, wz, R + 0.11, 0.055, '#1b1a22');
      if (wz > 0) rbox('flat', sx * (hw(wz) + 0.01), 0.58, wz + 0.58, 0.03, 0.24, 0.22, 0.01, '#14131a');
    }
    pipe('flat', [[sx * 1.04, 0.58, -0.95], [sx * 1.05, 0.58, -0.2], [sx * 1.04, 0.58, 0.55]], 0.05, '#1b1a22'); // round side steps
    rbox('flat', sx * (hw(-0.9) + 0.004), 0.95, -0.2, 0.012, 0.64, 0.014, 0.004, '#14131a');
    rbox('flat', sx * (hw(0.2) + 0.012), 1.12, -0.5, 0.02, 0.03, 0.18, 0.01, CHROME);
    pipe('flat', [[sx * 0.93, 1.36, -0.92], [sx * 1.0, 1.44, -0.9], [sx * 1.06, 1.5, -0.9]], 0.014, '#1b1a22');
    ball('flat', sx * 1.08, 1.52, -0.9, 0.04, 0.11, 0.08, '#1b1a22'); // mirrors
  }
  ball('flat', 0, 0.52, -2.05, 0.7, 0.045, 0.35, '#2a2830'); // skid plate
  // front end: grille, bumpers, hood scoop
  meshGrille(0, 0.98, -2.625, 1.3, 0.4, 28, 5);
  rbox('flat', 0, 0.68, -2.6, 2.0, 0.22, 0.22, 0.09, CHROME);
  rbox('flat', 0, 0.72, 2.62, 2.0, 0.2, 0.2, 0.08, CHROME);
  // a lofted hood scoop that swells out of the hood and fades back into it
  const scoop = (z: number): number => Math.sin((Math.PI * (z + 1.95)) / 0.85);
  put('paint', loftBody(sampleSections(stations(-1.95, -1.1, 7), { hw: (z) => 0.05 + 0.27 * Math.pow(Math.max(0, scoop(z)), 0.6), top: (z) => top(z) + 0.1 * Math.max(0, scoop(z)), bottom: (z) => top(z) - 0.07, round: () => 0.5 }), 18));
  // decals: a white pair of stripes along the flanks
  for (const sx of [-1, 1]) {
    rbox('flat', sx * (hw(0) + 0.006), 0.7, 0.0, 0.01, 0.07, 4.6, 0.003, WHITE);
    rbox('flat', sx * (hw(0) + 0.006), 0.83, 0.0, 0.01, 0.035, 4.6, 0.003, '#ffd23f');
  }
  // interior seen through the glass
  const DRV = { x: -0.5, y: 1.08, z: -0.1, scale: 0.76 }; // W1 body remodel: 0.82 -> 0.76 (head was 2 cm under the cab roof)
  rbox('flat', 0, 1.2, -0.82, 1.5, 0.12, 0.34, 0.04, '#1b1a22', undefined, 1, true);
  for (const sx of [-1, 1]) {
    rbox('flat', sx * 0.5, 1.4, 0.24, 0.5, 0.52, 0.13, 0.06, SEAT);
    rbox('flat', sx * 0.5, 1.7, 0.26, 0.26, 0.16, 0.1, 0.05, SEAT);
  }
  steeringWheel(DRV);
  // lights: round headlights in chrome rings, fog lights, a roof light bar, tail lights last
  for (const sx of [-1, 1]) {
    ball('neon', sx * 0.7, 1.0, -2.6, 0.2, 0.15, 0.07, '#fff7dd');
    ring('flat', sx * 0.7, 1.0, -2.6, 0.2, 0.03, CHROME, undefined, 6, 16);
    ball('neon', sx * 0.55, 0.6, -2.72, 0.1, 0.05, 0.04, '#ffe9a0');
    rbox('neon', sx * 0.4, 1.99, 0.8, 0.5, 0.05, 0.05, 0.02, '#ffffff');
  }
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.9, 1.05, 2.6, 0.12, 0.34, 0.05, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 0.9, y: R, z: sz > 0 ? RZ : FZ, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.42, wheelStyle: 'offroad', wheels,
    driver: DRV, stand: null, passenger: { x: 0.5, y: 1.08, z: -0.1 },
    tailBoxes: 2, exhausts: [[-0.4, 0.55, 2.7], [0.4, 0.55, 2.7]], length: 5.2, width: 2.05, height: 1.92, hasPaint: true,
  };
};

/** A one-sided glass panel (both faces) from four corners. */
function glassPlate(p0: number[], p1: number[], p2: number[], p3: number[]): void {
  const g = new THREE.BufferGeometry();
  const P = [p0, p1, p2, p3];
  const pos = new Float32Array(2 * 4 * 3);
  P.forEach((p, i) => pos.set(p, i * 3));
  P.slice().reverse().forEach((p, i) => pos.set(p, (4 + i) * 3));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  put('glass', g);
}

// ── golf cart: a smooth moulded-plastic body, a canopy on four posts, big friendly wheels — the driver shows ──
const buildGolfcart: Builder = (m, paint) => {
  const R = 0.225, FZ = -0.78, RZ = 0.78;
  const wheelsAt = [{ z: FZ, y: R, r: R }, { z: RZ, y: R, r: R }];
  const DRV = { x: -0.27, y: 0.54, z: 0.2, scale: 0.95 };
  // floor pan + the moulded front (nose and cowl) and rear pod, each one smooth shell
  const pan = profile([[-1.0, 0.54], [-0.9, 0.6], [0.0, 0.6], [1.0, 0.58], [1.1, 0.5]]);
  put('paint', loftBody(sampleSections(stations(-1.0, 1.1, 8), { hw: pan, top: () => 0.3, bottom: () => 0.2, round: () => 0.5 }), 24));
  const fHw = profile([[-1.2, 0.3], [-1.15, 0.46], [-1.0, 0.56], [-0.7, 0.6], [-0.3, 0.6]]);
  const fTop = profile([[-1.2, 0.5], [-1.15, 0.62], [-1.0, 0.74], [-0.75, 0.82], [-0.5, 0.86], [-0.3, 0.84]]);
  const fz = stations(-1.2, -0.3, 6, archStations([FZ], R, [0, 0.5, 0.85, 1.05]));
  put('paint', loftBody(sampleSections(fz, { hw: fHw, top: fTop, bottom: () => 0.26, round: () => 0.65, taper: () => 0.05, arch: archFn(wheelsAt, 0.05) }), 28));
  const rHw = profile([[0.45, 0.6], [0.8, 0.6], [1.05, 0.58], [1.2, 0.42]]);
  const rTop = profile([[0.45, 0.68], [0.9, 0.7], [1.1, 0.66], [1.2, 0.56]]);
  const rz = stations(0.45, 1.2, 6, archStations([RZ], R, [0, 0.5, 0.85, 1.05]));
  put('paint', loftBody(sampleSections(rz, { hw: rHw, top: rTop, bottom: () => 0.26, round: () => 0.65, taper: () => 0.05, arch: archFn(wheelsAt, 0.05) }), 28));
  // side sills joining the two shells, wheel lips, a white bumper front and back
  for (const sx of [-1, 1]) {
    rbox('paint', sx * 0.58, 0.42, 0.08, 0.1, 0.22, 1.2, 0.05);
    for (const wz of [FZ, RZ]) archLip('paint', sx * 0.585, R, wz, R + 0.055, 0.022);
  }
  rbox('flat', 0, 0.42, -1.2, 0.84, 0.16, 0.1, 0.06, WHITE);
  rbox('flat', 0, 0.46, 1.2, 0.84, 0.14, 0.1, 0.06, WHITE);
  // bench seat with a low back, the dash, steering wheel in the driver's hands
  rbox('flat', 0, 0.45, 0.22, 1.0, 0.13, 0.5, 0.06, '#f4efe4');
  rbox('flat', 0, 0.72, 0.52, 1.0, 0.34, 0.1, 0.06, '#f4efe4');
  ball('flat', 0, 0.85, -0.45, 0.5, 0.07, 0.14, '#1b1a22');
  steeringWheel(DRV);
  // the canopy (a lofted roof in white, slim chrome posts) and a tinted windscreen
  const roofHw = profile([[-0.9, 0.5], [-0.7, 0.62], [0, 0.66], [0.7, 0.62], [0.95, 0.5]]);
  put('flat', loftBody(sampleSections(stations(-0.95, 1.0, 9), { hw: roofHw, top: (z) => 1.82 - 0.04 * Math.abs(z - 0.02), bottom: () => 1.74, round: () => 0.4 }), 24), '#f6f6f4');
  for (const sx of [-1, 1]) {
    for (const z of [-0.62, 0.84]) pipe('flat', [[sx * 0.56, z < 0 ? 0.85 : 0.66, z], [sx * 0.57, 1.3, z], [sx * 0.55, 1.76, z]], 0.022, CHROME);
  }
  glassPlate([-0.52, 0.9, -0.5], [0.52, 0.9, -0.5], [0.5, 1.7, -0.72], [-0.5, 1.7, -0.72]);
  // decals: a stripe pair, a star on the nose; a whip antenna with a flag
  for (const sx of [-1, 1]) {
    rbox('flat', sx * 0.628, 0.5, 0.2, 0.01, 0.05, 1.8, 0.003, WHITE);
    rbox('flat', sx * 0.628, 0.57, 0.2, 0.01, 0.028, 1.8, 0.003, '#ffd23f');
  }
  pipe('flat', [[0.52, 0.66, 1.08], [0.54, 1.8, 1.12], [0.52, 2.5, 1.1]], 0.012, DARK);
  plate(m, FLAT, [0.52, 2.46, 1.1], [0.52, 2.46, 1.52], [0.52, 2.12, 1.1], [0.52, 2.12, 1.1], '#ffd23f');
  // lights inset in the nose and the tail pod (the tail boxes last)
  for (const sx of [-1, 1]) {
    ball('neon', sx * 0.36, 0.64, -1.17, 0.13, 0.09, 0.04, '#fff7dd');
    ball('neon', sx * 0.52, 1.78, -0.7, 0.05, 0.04, 0.05, '#ffffff');
  }
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.4, 0.6, 1.2, 0.2, 0.12, 0.05, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 0.5, y: R, z: sz > 0 ? RZ : FZ, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.2, wheelStyle: 'cart', wheels,
    driver: DRV, stand: null, passenger: { x: 0.27, y: 0.54, z: 0.2 },
    tailBoxes: 2, exhausts: [[0, 0.4, 1.3]], length: 2.4, width: 1.2, height: 1.82, hasPaint: true,
  };
};

// ── hoverboard: a sleek surfboard deck with rounded rails and rocker, glowing thrusters ──
const buildHoverboard: Builder = (m, paint) => {
  const hw = profile([[-1.25, 0.06], [-1.2, 0.2], [-1.0, 0.34], [-0.5, 0.42], [0.2, 0.43], [0.7, 0.4], [1.0, 0.33], [1.18, 0.2], [1.25, 0.06]]);
  const rocker = (z: number): number => 0.2 * Math.pow(Math.max(0, Math.abs(z) - 0.55) / 0.7, 2);
  const topF = (z: number): number => 0.17 + rocker(z) + (z > 0 ? 0 : 0.03 * Math.min(1, Math.abs(z)));
  put('paint', loftBody(sampleSections(stations(-1.25, 1.25, 17), { hw, top: topF, bottom: (z) => topF(z) - 0.13, round: () => 0.7 }), 26));
  // grip pad with a glowing border, racing stripes, chrome-ish rails
  put('flat', loftBody(sampleSections(stations(-0.85, 0.85, 7), { hw: () => 0.28, top: (z) => topF(z) + 0.012, bottom: (z) => topF(z) - 0.03, round: () => 0.3 }), 16), '#2c2a36');
  for (const sx of [-1, 1]) {
    ribbon('flat', stations(-0.8, 0.8, 7), sx * 0.34, 0.025, (z) => topF(z) + 0.006, WHITE);
    ribbon('neon', stations(-0.88, 0.88, 7), sx * 0.31, 0.012, (z) => topF(z) + 0.016, '#7cf6ff', 0.002);
  }
  // twin thrusters under the tail, with glowing rings; a fin
  for (const sx of [-1, 1]) {
    cone('flat', sx * 0.2, 0.1, 1.0, 0.1, 0.085, 0.42, '#1b1a22', 14, [Math.PI / 2, 0, 0]);
    ring('neon', sx * 0.2, 0.1, 1.215, 0.092, 0.024, '#00d4ff', undefined, 6, 18);
    ball('neon', sx * 0.2, 0.1, 1.2, 0.07, 0.07, 0.03, '#b8f7ff');
  }
  // glow strip under the deck (it stays inside the flat middle of the board) and the nose light
  rbox('neon', 0, 0.05, 0, 0.56, 0.02, 1.15, 0.01, '#00d4ff');
  for (const sx of [-1, 1]) ribbon('neon', stations(-0.9, 0.9, 8), sx * 0.405, 0.02, (z) => topF(z) - 0.07, '#7cf6ff', 0.0);
  ball('neon', 0, 0.34, -1.235, 0.07, 0.035, 0.03, '#ffffff');
  m.box(NEON, 0, 0.36, 1.25, 0.1, 0.03, 0.03, { color: '#8a1218', cast: false });
  return {
    wheelR: 0, wheelW: 0, wheelStyle: 'cart', wheels: [],
    driver: null, stand: { x: 0, y: 0.2, z: 0.05, yaw: 0.9 }, passenger: null,
    tailBoxes: 1, exhausts: [[-0.2, 0.1, 1.28], [0.2, 0.1, 1.28]], length: 2.5, width: 0.86, height: 0.4, hasPaint: true,
  };
};

// ── ice-cream van: a rounded box van on a cab, a serving window with an awning, a giant cone ──
const buildIcecream: Builder = (m, paint) => {
  const R = 0.4, FZ = -1.62, RZ = 1.6;
  const wheelsAt = [{ z: FZ, y: R, r: R }, { z: RZ, y: R, r: R }];
  const DRV = { x: -0.5, y: 0.98, z: -1.0, scale: 0.92 };
  const PINK = '#ff9ec7', HOT = '#ff4d8d', MINT = '#9be7ff', CREAM = '#fff4e0', WAFFLE = '#e0a15a', WAFFLE2 = '#c07a32', SPR = ['#ff4d8d', '#ffd23f', '#9be7ff', '#7c4dff', '#ffffff'];
  // the serving box: a rounded loft, soft corners and a rounded roof
  const bHw = profile([[-0.6, 1.0], [-0.5, 1.08], [0, 1.1], [2.4, 1.1], [2.72, 1.0], [2.78, 0.9]]);
  const bTop = profile([[-0.6, 2.62], [-0.45, 2.7], [2.3, 2.7], [2.65, 2.55], [2.78, 2.4]]);
  const bz = stations(-0.6, 2.78, 7, archStations([RZ], R, [0, 0.5, 0.85, 1.05]));
  put('paint', loftBody(sampleSections(bz, { hw: bHw, top: bTop, bottom: () => 0.5, round: () => 0.4, taper: () => 0.06, arch: archFn(wheelsAt, 0.08) }), 30));
  // cab + hood: a lower body, then a glass cab with a painted roof
  const lHw = profile([[-2.75, 0.55], [-2.7, 0.85], [-2.5, 0.99], [-2.0, 1.04], [-1.2, 1.06], [-0.6, 1.06]]);
  const lTop = profile([[-2.75, 0.74], [-2.7, 0.88], [-2.4, 1.06], [-1.9, 1.16], [-1.4, 1.3], [-0.6, 1.32]]);
  const lBot = profile([[-2.75, 0.5], [-2.55, 0.38], [-2.3, 0.36], [-0.6, 0.38]]);
  const lz = stations(-2.75, -0.55, 7, archStations([FZ], R, [0, 0.5, 0.85, 1.05]));
  put('paint', loftBody(sampleSections(lz, { hw: lHw, top: lTop, bottom: lBot, round: () => 0.55, taper: () => 0.05, arch: archFn(wheelsAt, 0.08) }), 28));
  const gTop = profile([[-1.8, 1.3], [-1.55, 1.7], [-1.2, 2.3], [-0.9, 2.55], [-0.55, 2.58]]);
  put('glass', loftBody(sampleSections(stations(-1.8, -0.55, 9), { hw: profile([[-1.8, 0.82], [-1.4, 0.98], [-0.55, 1.0]]), top: gTop, bottom: () => 1.26, round: () => 0.35, taper: () => 0.14 }), 26));
  put('paint', loftBody(sampleSections(stations(-1.3, -0.5, 6), { hw: (z) => 0.92 * Math.min(1, 0.45 + (z + 1.3) * 2), top: (z) => gTop(z) + 0.025, bottom: (z) => gTop(z) - 0.07, round: () => 0.3 }), 20));
  for (const sx of [-1, 1]) {
    pipe('paint', [[sx * 0.96, 1.3, -1.78], [sx * 0.9, 1.9, -1.45], [sx * 0.82, 2.5, -1.0]], 0.045);
    pipe('flat', [[sx * 1.07, 1.33, -2.0], [sx * 1.1, 1.33, -1.0], [sx * 1.1, 1.33, -0.55]], 0.015, CHROME);
    rbox('flat', sx * 1.08, 1.0, -1.3, 0.012, 0.5, 0.018, 0.005, '#1b1a22'); // door seam
    rbox('flat', sx * 1.09, 1.12, -1.75, 0.02, 0.03, 0.16, 0.01, CHROME); // door handle
    // wheel-arch lips, bumpers' wings
    for (const wz of [FZ, RZ]) archLip('paint', sx * (wz < 0 ? 1.05 : 1.1), R, wz, R + 0.085, 0.032);
    ball('flat', sx * 1.2, 1.15, -2.08, 0.05, 0.1, 0.075, '#1b1a22'); // mirrors
  }
  // the decal band: cream band with hot-pink + mint pinstripes and confetti sprinkles (sides and back)
  for (const sx of [-1, 1]) {
    rbox('flat', sx * 1.108, 1.3, 1.1, 0.012, 0.46, 3.2, 0.004, CREAM);
    rbox('flat', sx * 1.11, 1.56, 1.1, 0.012, 0.05, 3.2, 0.004, HOT);
    rbox('flat', sx * 1.11, 1.04, 1.1, 0.012, 0.05, 3.2, 0.004, MINT);
  }
  rbox('flat', 0, 1.3, 2.775, 1.7, 0.46, 0.012, 0.004, CREAM);
  rbox('flat', 0, 1.56, 2.777, 1.7, 0.05, 0.012, 0.004, HOT);
  rbox('flat', 0, 1.04, 2.777, 1.7, 0.05, 0.012, 0.004, MINT);
  sprinkles(m, 'x', 1.12, -0.35, 2.7, 1.1, 1.5, 22, 11, SPR);
  sprinkles(m, 'x', -1.12, -0.35, 2.7, 1.1, 1.5, 22, 23, SPR);
  sprinkles(m, 'z', 2.79, -0.8, 0.8, 1.1, 1.5, 12, 37, SPR);
  // serving window (right side): a glass panel, a white frame, a counter and a striped, scalloped awning
  const wx = 1.115;
  glassPlate([wx, 1.62, 0.35], [wx, 1.62, 1.85], [wx, 2.38, 1.85], [wx, 2.38, 0.35]);
  m.quad(NEON, [wx - 0.01, 1.66, 0.4], [wx - 0.01, 1.66, 1.8], [wx - 0.01, 1.95, 1.8], [wx - 0.01, 1.95, 0.4], undefined, '#ffe9b0');
  for (const [cy, cz, h, d] of [[1.6, 1.1, 0.06, 1.62], [2.4, 1.1, 0.06, 1.62], [2.0, 0.3, 0.84, 0.06], [2.0, 1.9, 0.84, 0.06]] as [number, number, number, number][]) rbox('flat', wx + 0.02, cy, cz, 0.06, h, d, 0.02, WHITE);
  rbox('flat', wx + 0.2, 1.57, 1.1, 0.4, 0.06, 1.8, 0.03, WHITE, undefined, 1, true);
  for (let i = 0; i < 10; i++) {
    const z = 0.2 + i * 0.17, col = i % 2 ? WHITE : HOT;
    plate(m, FLAT, [wx, 2.55, z], [wx, 2.55, z + 0.17], [wx + 0.7, 2.22, z + 0.17], [wx + 0.7, 2.22, z], col);
    ball('flat', wx + 0.71, 2.18, z + 0.085, 0.03, 0.09, 0.085, col);
  }
  for (const z of [0.25, 1.95]) pipe('flat', [[wx + 0.66, 1.62, z], [wx + 0.66, 1.9, z], [wx + 0.66, 2.2, z]], 0.018, CHROME);
  // left side: a big cone mural
  plate(m, FLAT, [-1.12, 1.68, 1.1], [-1.12, 2.4, 0.7], [-1.12, 2.4, 1.5], [-1.12, 2.4, 1.5], WAFFLE);
  ball('flat', -1.125, 2.46, 1.1, 0.02, 0.25, 0.3, PINK);
  ball('flat', -1.13, 2.66, 1.1, 0.02, 0.16, 0.2, '#ffffff');
  // the giant cone: waffle cone, two scoops with a drippy skirt, sprinkles, a cherry
  cone('flat', 0, 3.3, 1.2, 0.05, 0.62, 1.2, (x, y, z) => ((Math.floor((Math.atan2(z - 1.2, x) + Math.PI) / (Math.PI / 6)) + Math.floor((y - 2.7) / 0.2)) % 2 ? WAFFLE : WAFFLE2), 12, undefined, 6);
  ball('flat', 0, 4.02, 1.2, 0.74, 0.55, 0.74, PINK);
  cone('flat', 0, 3.88, 1.2, 0.76, 0.72, 0.13, HOT, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ball('flat', Math.cos(a) * 0.73, 3.8, 1.2 + Math.sin(a) * 0.73, 0.09, 0.15, 0.09, PINK, undefined, 8, 6);
  }
  ball('flat', 0, 4.54, 1.2, 0.56, 0.44, 0.56, CREAM);
  ball('flat', 0, 5.05, 1.2, 0.15, 0.15, 0.15, RED, undefined, 10, 8);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, p = 0.5 + (i % 4) * 0.2, top = i % 2 === 0;
    const R0 = top ? 0.74 : 0.56, RY = top ? 0.55 : 0.44, cy = top ? 4.02 : 4.54;
    m.box(FLAT, Math.cos(a) * R0 * Math.sin(p) * 1.02, cy + Math.cos(p) * RY * 1.02, 1.2 + Math.sin(a) * R0 * Math.sin(p) * 1.02, 0.1, 0.035, 0.035, { color: SPR[i % SPR.length], yaw: a, cast: false });
  }
  // speakers on the cab roof, bumpers, number plate, grille
  for (const sx of [-1, 1]) m.cyl(FLAT, sx * 0.6, 2.6, -1.1, 0.05, 0.17, 0.28, 8, '#1b1a22');
  rbox('flat', 0, 0.62, -2.75, 2.1, 0.22, 0.2, 0.09, CHROME);
  rbox('flat', 0, 0.66, 2.8, 2.1, 0.22, 0.2, 0.09, CHROME);
  meshGrille(0, 0.86, -2.785, 1.1, 0.34, 18, 4);
  rbox('flat', 0, 0.68, 2.93, 0.5, 0.16, 0.03, 0.02, WHITE);
  // rear doors with a window each
  const zr = 2.792;
  for (const sx of [-1, 1]) {
    glassPlate([sx * 0.06, 1.86, zr + 0.002], [sx * 0.86, 1.86, zr + 0.002], [sx * 0.86, 2.42, zr + 0.002], [sx * 0.06, 2.42, zr + 0.002]);
    rbox('flat', sx * 0.12, 1.62, zr + 0.01, 0.05, 0.22, 0.03, 0.02, CHROME);
  }
  rbox('flat', 0, 1.95, zr + 0.004, 0.035, 0.9, 0.02, 0.01, '#1b1a22');
  // the cab interior (seen through the glass), steering wheel in the driver's hands
  for (const sx of [-1, 1]) {
    rbox('flat', sx * 0.5, 0.82, -0.98, 0.7, 0.3, 0.6, 0.05, '#1b1a22');
    rbox('flat', sx * 0.5, 0.97, -1.0, 0.8, 0.14, 0.66, 0.06, SEAT);
    rbox('flat', sx * 0.5, 1.4, -0.7, 0.56, 0.7, 0.13, 0.07, SEAT);
  }
  steeringWheel(DRV);
  // lights: round headlights in rings, amber turn lights, a roof beacon, then the TAIL lights last
  for (const sx of [-1, 1]) {
    ball('neon', sx * 0.8, 0.9, -2.72, 0.2, 0.17, 0.05, '#fff7dd');
    ring('flat', sx * 0.8, 0.9, -2.72, 0.21, 0.033, CHROME, undefined, 6, 14);
    ball('neon', sx * 0.98, 1.74, 2.78, 0.09, 0.09, 0.03, '#ffb347');
    rbox('flat', sx * 0.98, 1.3, 2.77, 0.3, 0.55, 0.04, 0.04, '#1b1a22');
  }
  cone('neon', 0, 2.68, -1.1, 0.045, 0.045, 0.5, '#ffd166', 8, [0, 0, Math.PI / 2]);   // a rounded beacon bar
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.98, 1.3, 2.8, 0.24, 0.46, 0.04, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 0.92, y: R, z: sz > 0 ? RZ : FZ, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.3, wheelStyle: 'cart', wheels,
    driver: DRV, stand: null, passenger: { x: 0.5, y: 0.98, z: -1.0 },
    tailBoxes: 2, exhausts: [[-0.5, 0.5, 2.95], [0.5, 0.5, 2.95]], length: 5.5, width: 2.2, height: 2.7, hasPaint: true,
  };
};

// ── boat: a lofted V-hull speedboat, a recessed cockpit, a curved windscreen, benches, an outboard ──
/** Chaikin-round a closed polygon, then resample it to n evenly spaced points (so every station has the same topology). */
function roundOutline(poly: [number, number][], n: number): [number, number][] {
  let p = poly;
  for (let k = 0; k < 2; k++) {
    const q: [number, number][] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  const len: number[] = [0];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    len.push(len[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = len[len.length - 1], out: [number, number][] = [];
  let seg = 0;
  for (let j = 0; j < n; j++) {
    const d = (j / n) * total;
    while (len[seg + 1] < d) seg++;
    const t = (d - len[seg]) / Math.max(1e-6, len[seg + 1] - len[seg]);
    const a = p[seg], b = p[(seg + 1) % p.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
const buildBoat: Builder = (m, paint) => {
  const Z0 = -2.6, Z1 = 2.4;
  const hw = profile([[Z0, 0.02], [-2.5, 0.12], [-2.3, 0.32], [-2.0, 0.54], [-1.5, 0.8], [-1.0, 0.95], [0, 1.0], [1.5, 1.0], [2.2, 0.96], [Z1, 0.94]]);
  const yg = profile([[Z0, 0.92], [-2.0, 0.92], [-1.2, 0.86], [-0.4, 0.78], [1.0, 0.76], [Z1, 0.8]]); // the sheer: high bow, low waist
  const yk = profile([[Z0, 0.62], [-2.45, 0.34], [-2.1, -0.02], [-1.4, -0.25], [0.5, -0.3], [Z1, -0.2]]); // keel
  const cd = profile([[Z0, 0], [-1.6, 0], [-1.0, 0.4], [-0.5, 1], [1.8, 1], [2.3, 0.8], [Z1, 0.6]]); // how deep the cockpit is
  const zs = stations(Z0, Z1, 18, [-0.9, -0.3, 2.2]);
  const rings = zs.map((z) => {
    const w = hw(z), g = yg(z), k = yk(z), c = cd(z), yf = 0.34;
    const crown = 0.08 * (1 - c);
    const deck = (f: number): number => g + crown * (1 - f * f) + (yf - g - crown * (1 - f * f)) * c * (f < 0.88 ? 1 : 0);
    const chine: [number, number] = [w * 0.74, k + (g - k) * 0.38];
    const poly: [number, number][] = [
      chine, [w * 0.98, k + (g - k) * 0.72], [w, g], [w * 0.93, g + 0.005], [w * 0.88, deck(0.88)], [w * 0.6, deck(0.6)], [w * 0.3, deck(0.3)], [0, deck(0)],
      [-w * 0.3, deck(0.3)], [-w * 0.6, deck(0.6)], [-w * 0.88, deck(0.88)], [-w * 0.93, g + 0.005], [-w, g], [-w * 0.98, k + (g - k) * 0.72], [-chine[0], chine[1]], [0, k],
    ];
    return { z, pts: roundOutline(poly, 32) };
  });
  put('paint', loftRings(rings));
  // white rubbing strake round the sheer, a hull stripe, the transom glass-fibre pad, bow cleat
  for (const sx of [-1, 1]) {
    pipe('flat', zs.filter((z) => z > -2.4).map((z) => [sx * (hw(z) * 0.99), yg(z) + 0.01, z] as [number, number, number]).filter((_, i) => i % 2 === 0), 0.035, WHITE, 6);
    ribbonSide(sx, zs.filter((z) => z > -1.9), hw, yg, yk);
  }
  rbox('flat', 0, 0.92, -2.2, 0.2, 0.05, 0.1, 0.02, CHROME);
  // the cockpit: a console, benches with low backs, the curved windscreen, the steering wheel in the driver's hands
  const DRV = { x: -0.4, y: 0.62, z: 0.8, scale: 1.0 };
  rbox('flat', 0, 0.62, 0.05, 1.3, 0.56, 0.42, 0.12, '#2a2d3a');
  steeringWheel(DRV, DARK, 0.7);
  for (const sx of [-1, 1]) {
    rbox('flat', sx * 0.4, 0.5, 0.8, 0.7, 0.2, 0.6, 0.09, '#f1ead8');
    rbox('flat', sx * 0.4, 0.8, 1.14, 0.5, 0.34, 0.12, 0.06, '#f1ead8');
    rbox('flat', sx * 0.4, 0.605, 0.8, 0.62, 0.02, 0.52, 0.01, '#ff2e88');
  }
  rbox('flat', 0, 0.54, 1.95, 1.7, 0.2, 0.55, 0.09, '#e7e2d6');
  glassPlate([-0.9, 0.84, -0.3], [0.0, 0.84, -0.38], [0.0, 1.38, -0.14], [-0.8, 1.38, -0.1]);
  glassPlate([0.0, 0.84, -0.38], [0.9, 0.84, -0.3], [0.8, 1.38, -0.1], [0.0, 1.38, -0.14]);
  pipe('flat', [[-0.9, 0.84, -0.3], [-0.85, 1.12, -0.2], [-0.8, 1.38, -0.1], [0, 1.4, -0.14], [0.8, 1.38, -0.1], [0.85, 1.12, -0.2], [0.9, 0.84, -0.3]], 0.025, CHROME, 6);
  rbox('flat', 0, 0.352, 0.95, 1.5, 0.014, 2.5, 0.005, '#e7e2d6'); // cockpit floor liner
  // the outboard motor on the transom
  rbox('flat', 0, 0.64, 2.55, 0.5, 0.74, 0.4, 0.14, '#2a2d3a');
  rbox('paint', 0, 1.06, 2.55, 0.54, 0.16, 0.44, 0.07);
  rbox('flat', 0, 0.0, 2.65, 0.14, 0.7, 0.2, 0.05, '#1b1a22');
  rbox('flat', 0, -0.34, 2.68, 0.5, 0.06, 0.34, 0.025, CHROME);
  // lights
  ball('neon', 0, 0.98, -2.15, 0.09, 0.06, 0.09, '#ffffff');
  pipe('flat', [[0, 0.8, 2.1], [0, 1.2, 2.1], [0, 1.5, 2.1]], 0.015, DARK);
  ball('neon', 0, 1.53, 2.1, 0.05, 0.05, 0.05, '#ffd166');
  m.box(NEON, 0, 0.88, 2.4, 0.8, 0.06, 0.04, { color: '#8a1218', cast: false });
  return {
    wheelR: 0, wheelW: 0, wheelStyle: 'cart', wheels: [],
    driver: DRV, stand: null, passenger: { x: 0.4, y: 0.62, z: 0.8 },
    tailBoxes: 1, exhausts: [[0, 0.1, 2.9]], length: 5.1, width: 2.0, height: 1.5, hasPaint: true,
  };
};
/** A white racing stripe along the outer hull (below the sheer). */
function ribbonSide(sx: number, zs: number[], hw: (z: number) => number, yg: (z: number) => number, yk: (z: number) => number): void {
  const pos: number[] = [], idx: number[] = [];
  const pt = (z: number, t: number): [number, number, number] => [sx * (hw(z) * 0.995 + 0.035), yg(z) - 0.12 - t, z];
  zs.forEach((z, i) => {
    const a = pt(z, 0), b = pt(z, 0.1);
    pos.push(...a, ...b);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [sx, 0, 0]), 3));
  g.setIndex(idx);
  void yk;
  put('flat', g, WHITE);
}

const BUILDERS: Record<RideKind, Builder> = {
  sports: buildSports, pickup: buildPickup, golfcart: buildGolfcart, hoverboard: buildHoverboard, icecream: buildIcecream, boat: buildBoat,
};

// ── templates (geometry shared by every ride of a kind) ─────────────────────
const PAINT_PROTO = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
PAINT_PROTO.userData.keep = true;
const templates = new Map<RideKind, Template>();

function template(kind: RideKind): Template {
  let t = templates.get(kind);
  if (t) return t;
  const m = new Mesher();
  m.push(0, 0, 0);
  EX = { paint: [], flat: [], neon: [], glass: [] };
  const spec = BUILDERS[kind](m, PAINT_PROTO);
  const group = m.build('ride');
  const pg: THREE.BufferGeometry[] = [], fg: THREE.BufferGeometry[] = [], ng: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    if (me.material === PAINT_PROTO) pg.push(me.geometry);
    else if ((me.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) ng.push(me.geometry);
    else fg.push(me.geometry);
  });
  pg.push(...EX.paint);
  fg.unshift(...EX.flat);
  ng.unshift(...EX.neon); // (before the Mesher's lights: the tail lights must stay the LAST neon vertices)
  const merge = (l: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
    if (!l.length) return null;
    const g = l.length === 1 ? l[0] : mergeGeometries(l.map((x) => (x.index ? x.toNonIndexed() : x)), false);
    g?.computeBoundingSphere();
    g?.computeBoundingBox();
    return g;
  };
  const neon = merge(ng);
  t = {
    spec,
    glass: merge(EX.glass),
    paint: merge(pg),
    flat: merge(fg),
    neon,
    neonCount: neon ? neon.attributes.position.count : 0,
    wheel: spec.wheels.length ? makeWheelGeometry(spec.wheelR, spec.wheelW, spec.wheelStyle) : null,
  };
  templates.set(kind, t);
  return t;
}

/** A kind's dimensions, seats and wheel layout (no mesh is built for the caller beyond the shared template). */
export function rideSpec(kind: RideKind): Spec {
  return template(kind).spec;
}

/** Share every attribute but the colour (so a ride can recolour its own lights / rims). */
function ownColour(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) g.setAttribute(name, name === 'color' ? (src.attributes.color as THREE.BufferAttribute).clone() : src.attributes[name]);
  g.boundingSphere = src.boundingSphere;
  g.boundingBox = src.boundingBox;
  return g;
}

// ── glow plane texture (neon underglow) ─────────────────────────────────────
let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 128, 20, 64, 128, 124);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 256);
    glowTex = new THREE.CanvasTexture(c);
    glowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return glowTex;
}

const TMP = new THREE.Matrix4();
const TMP2 = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const EUL = new THREE.Euler();
const V3 = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/** A ride: the body, wheels, lights, wrap and the seats. At most four draw calls (plus the boost flames while boosting). */
export class Ride {
  readonly kind: RideKind;
  readonly info: RideInfo;
  readonly spec: Spec;
  readonly group = new THREE.Group();
  /** everything that leans / pitches / bounces: the body, the rider */
  readonly rig = new THREE.Group();
  readonly seatRoot = new THREE.Object3D();
  passenger: Character | null = null;
  /** the rider mounted on this ride (the scene's shared driver / walker) */
  rider: Character | null = null;
  readonly paint: THREE.MeshPhysicalMaterial;
  private style: RideStyle = { ...DEFAULT_STYLE };
  private baseColor = new THREE.Color('#ff2e88');
  private readonly neonGeo: THREE.BufferGeometry | null;
  private readonly wheelRec: WheelGeo | null;
  private readonly wheelMesh: THREE.InstancedMesh | null;
  private readonly flames: THREE.Mesh[] = [];
  private glow: THREE.Mesh | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private spin = 0;
  private roll = 0;
  private pitch = 0;
  private bounceY = 0;
  private bounceVel = 0;
  private sway = 0;
  private hoverBob = 0;
  private flicker = 0;
  private lastBraking = false;
  private t = 0;

  constructor(kind: RideKind, color?: string) {
    this.kind = kind;
    this.info = RIDE_INFO[kind];
    const tpl = template(kind);
    this.spec = tpl.spec;
    this.group.rotation.order = 'YXZ';
    this.group.add(this.rig);
    this.paint = toyMatUnique(color ?? this.info.color, 'gloss');
    this.paint.userData.keep = true;
    this.baseColor.set(color ?? this.info.color);
    const castBody = kind !== 'hoverboard';
    if (tpl.paint) {
      const me = new THREE.Mesh(tpl.paint, this.paint);
      me.castShadow = castBody; // one caster per ride (the body)
      me.receiveShadow = false;
      this.rig.add(me);
    }
    if (tpl.flat) {
      const me = new THREE.Mesh(tpl.flat, FLAT);
      me.castShadow = false;
      me.receiveShadow = false;
      this.rig.add(me);
    }
    if (tpl.glass) {
      const me = new THREE.Mesh(tpl.glass, GLASS_MAT);   // the cabin: tinted, reflective, drawn after the opaque parts
      me.castShadow = false;
      me.receiveShadow = false;
      me.renderOrder = 1;
      this.rig.add(me);
    }
    this.neonGeo = tpl.neon ? ownColour(tpl.neon) : null;
    if (this.neonGeo) {
      const me = new THREE.Mesh(this.neonGeo, NEON_FOLD());
      me.castShadow = me.receiveShadow = false;
      this.rig.add(me);
    }
    this.wheelRec = tpl.wheel ? { ...tpl.wheel, geo: ownColour(tpl.wheel.geo) } : null;
    if (this.wheelRec) {
      this.wheelMesh = new THREE.InstancedMesh(this.wheelRec.geo, WHEELS, this.spec.wheels.length);
      this.wheelMesh.frustumCulled = false;
      this.wheelMesh.castShadow = false;
      this.wheelMesh.receiveShadow = false;
      this.group.add(this.wheelMesh);
    } else this.wheelMesh = null;
    // boost flames (only drawn while boosting)
    for (const [x, y, z] of this.spec.exhausts) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 1.3, 8, 1, true).translate(0, 0.65, 0).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#8fd9ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      f.position.set(x, y, z);
      f.visible = false;
      this.rig.add(f);
      this.flames.push(f);
    }
    // passenger seat
    const p = this.spec.passenger;
    if (p) {
      this.seatRoot.position.set(p.x, p.y, p.z);
      this.rig.add(this.seatRoot);
    }
    this.colorWheels();
    this.setBrake(false, true);
    this.applyFinish();
  }

  // ── looks ────────────────────────────────────────────────────────────────
  setPose(x: number, y: number, z: number, heading: number, pitch = 0, roll = 0): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(pitch, -heading, roll);
  }

  setColor(hex: string): void {
    this.baseColor.set(hex);
    this.applyFinish();
  }

  setStyle(s: Partial<RideStyle>): void {
    this.style = { ...this.style, ...s };
    this.applyFinish();
    if (this.style.neon) {
      if (!this.glow) {
        this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#00d4ff', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        this.glow = new THREE.Mesh(new THREE.PlaneGeometry(this.spec.width * 1.9, this.spec.length * 1.3).rotateX(-Math.PI / 2), this.glowMat);
        this.glow.position.y = 0.06;
        this.glow.renderOrder = 2;
        this.group.add(this.glow);
      }
      this.glow.visible = true;
      this.glowMat!.color.set(this.style.neon);
    } else if (this.glow) this.glow.visible = false;
  }
  get currentStyle(): RideStyle {
    return this.style;
  }
  get color(): THREE.Color {
    return this.baseColor;
  }

  private applyFinish(): void {
    const p = this.paint;
    p.iridescence = 0;
    p.iridescenceThicknessRange = [100, 400];
    switch (this.style.finish) {
      case 'pearl':
        // a soft, milky paint with a rainbow sheen
        p.color.copy(this.baseColor).lerp(new THREE.Color('#ffffff'), 0.4);
        p.roughness = 0.22;
        p.metalness = 0.12;
        p.clearcoat = 1;
        p.clearcoatRoughness = 0.05;
        p.iridescence = 1;
        p.iridescenceIOR = 1.5;
        p.iridescenceThicknessRange = [220, 560];
        p.envMapIntensity = 1.5;
        break;
      case 'matte':
        p.color.copy(this.baseColor);
        p.roughness = 0.78;
        p.metalness = 0.25;
        p.clearcoat = 0;
        p.envMapIntensity = 0.8;
        break;
      case 'chrome':
        p.color.copy(this.baseColor).lerp(new THREE.Color('#ffffff'), 0.4);
        p.roughness = 0.04;
        p.metalness = 1;
        p.clearcoat = 0;
        p.envMapIntensity = 1.7;
        break;
      case 'glitter':
        p.color.copy(this.baseColor);
        p.roughness = 0.28;
        p.metalness = 0.6;
        p.clearcoat = 1;
        p.clearcoatRoughness = 0.1;
        p.iridescence = 0.5;
        p.envMapIntensity = 1.6;
        break;
      default:
        p.color.copy(this.baseColor);
        p.roughness = 0.3;
        p.metalness = 0.28;
        p.clearcoat = 1;
        p.clearcoatRoughness = 0.08;
        p.envMapIntensity = 1.2;
    }
    p.needsUpdate = true;
    this.colorWheels();
  }

  /** Tyre / rim / cap colours (the rim colour comes from the paint sheet, the cap from the wrap). */
  private colorWheels(): void {
    const rec = this.wheelRec;
    if (!rec) return;
    const a = rec.geo.attributes.color as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const tire = new THREE.Color('#1b1a22');
    const rim = new THREE.Color(this.style.rims || this.info.rim);
    const cap = this.baseColor;
    const put = (from: number, to: number, c: THREE.Color): void => {
      for (let i = from; i < to; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
    };
    put(0, rec.tireEnd, tire);
    put(rec.tireEnd, rec.rimEnd, rim);
    put(rec.rimEnd, rec.count, cap);
    a.needsUpdate = true;
  }

  /** Brake lights: the tail boxes are the last neon vertices. */
  private setBrake(on: boolean, force = false): void {
    if (!this.neonGeo || (!force && on === this.lastBraking)) return;
    this.lastBraking = on;
    const n = this.spec.tailBoxes * 36;
    const total = this.neonGeo.attributes.position.count;
    if (!n || n > total) return;
    const a = this.neonGeo.attributes.color as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const c = new THREE.Color(on ? '#ff3a30' : '#8a1218');
    for (let i = total - n; i < total; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    a.needsUpdate = true;
  }

  // ── riders ───────────────────────────────────────────────────────────────
  /** Put the driver / rider on board: seated (spec.driver) or standing on the board (spec.stand). */
  mountRider(c: Character): void {
    this.rider = c;
    const s = this.spec;
    if (s.driver) {
      c.group.position.set(s.driver.x, s.driver.y - Character.SEAT_Y * s.driver.scale, s.driver.z);
      c.group.scale.setScalar(s.driver.scale);
      c.group.rotation.set(0, tuning.drive.driverYaw, 0);
    } else if (s.stand) {
      c.group.position.set(s.stand.x, s.stand.y, s.stand.z);
      c.group.scale.setScalar(1);
      c.group.rotation.set(0, Math.PI + s.stand.yaw, 0);
    }
    this.rig.add(c.group);
  }
  /** Take the rider off (the caller puts them back in the scene). */
  dismount(): Character | null {
    const c = this.rider;
    if (c) this.rig.remove(c.group);
    this.rider = null;
    return c;
  }

  /** Seat (or remove, with null) a passenger. The ride owns its passenger: whoever leaves is disposed. */
  setPassenger(c: Character | null): void {
    const old = this.passenger;
    if (old) {
      this.seatRoot.remove(old.group);
      if (old !== c) old.dispose();
    }
    this.passenger = c;
    if (c && this.spec.passenger) {
      const sc = this.spec.driver?.scale ?? 0.9;
      c.group.position.set(0, -Character.SEAT_Y * sc, 0);
      c.group.scale.setScalar(sc);
      c.group.rotation.set(0, tuning.drive.driverYaw, 0);
      this.seatRoot.add(c.group);
    }
  }
  get hasPassengerSeat(): boolean {
    return !!this.spec.passenger;
  }
  seatWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.seatRoot.getWorldPosition(out);
  }

  // ── animation ────────────────────────────────────────────────────────────
  bump(strength: number): void {
    const d = this.tune;
    this.bounceVel += clamp(strength / 9, 0.25, 1.4) * d.bumpKick;
  }
  honk(): void {
    this.bounceVel += 0.9;
    this.rider?.wave();
  }

  private get tune(): typeof tuning.drive {
    return Object.assign(Object.create(tuning.drive), (tuning.rides as Record<string, object>)[this.kind]) as typeof tuning.drive;
  }

  update(dt: number, t: number, m: RideMotion): void {
    this.t = t;
    const d = this.tune;
    const k = 1 - Math.exp(-9 * dt);
    const rollT = clamp(m.lateral / (d.turnRate * d.topSpeed * 0.7), -1, 1) * d.lean + clamp(m.slip * 0.03, -0.1, 0.1);
    const acc = clamp(m.accel / 10, -1, 1);
    this.roll += (rollT - this.roll) * k;
    this.pitch += (acc * d.pitchK - this.pitch) * k;

    // suspension: a damped spring that bumps, landings and honks kick (soft on the pickup, wobbly on the ice-cream truck)
    this.bounceVel += (-d.susK * this.bounceY - d.susC * this.bounceVel) * dt;
    this.bounceY += this.bounceVel * dt;
    const buzz = Math.sin(t * 47) * 0.005 + Math.sin(t * 31 + 1) * 0.003;
    let y = Math.max(-0.08, this.bounceY) + (m.airborne ? 0 : buzz * (0.25 + m.speed01));
    let roll = this.roll;
    let pitch = this.pitch;
    let yawSway = 0;
    if (d.wobble > 0) {
      // heavy and top-heavy: it sloshes side to side as it turns, and rocks when it stops
      this.sway += (clamp(m.lateral * 0.025, -0.4, 0.4) - this.sway) * (1 - Math.exp(-3 * dt));
      roll += this.sway * d.wobble * 2.2 + Math.sin(t * 2.4) * 0.012 * (0.4 + m.speed01);
      pitch += Math.sin(t * 1.9 + 1) * 0.01 * d.wobble * (0.5 + m.speed01);
      yawSway = this.sway * 0.04;
    }
    if (this.kind === 'hoverboard') {
      // the board bobs and tilts into the carve; a rider leans with it
      this.hoverBob = Math.sin(t * 3.1) * 0.05;
      y += this.hoverBob;
      roll = this.roll * 1.15;
    }
    this.rig.position.y = y;
    this.rig.rotation.set(pitch, yawSway, roll);
    const sq = d.carSquash;
    const sy = 1 - Math.abs(acc) * sq + clamp(this.bounceVel * 0.012, -0.05, 0.05);
    const sxz = 1 + Math.abs(acc) * sq * 0.5 - clamp(this.bounceVel * 0.006, -0.025, 0.025);
    this.rig.scale.set(sxz, sy, sxz);

    // wheels: spin + steer, written into the instance matrices
    const wm = this.wheelMesh;
    if (wm) {
      const R = this.spec.wheelR;
      this.spin += (m.speed / R) * dt;
      const steer = -m.steer * d.wheelSteerAngle * (this.kind === 'golfcart' ? 1.5 : 1);
      const wheels = this.spec.wheels;   // ── v3 perf ── a plain loop: forEach(closure) allocated a closure per ride per frame
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        EUL.set(-this.spin, (w.front ? steer : 0) + (w.x < 0 ? Math.PI : 0), 0, 'YXZ');
        QUAT.setFromEuler(EUL);
        // the wheel sits on the leaning, bouncing body: apply the rig's lean around the origin too
        V3.set(w.x, w.y + this.rig.position.y * 0.6, w.z);
        TMP.compose(V3, QUAT, ONE);
        wm.setMatrixAt(i, TMP);
      }
      wm.instanceMatrix.needsUpdate = true;
      void TMP2;
    }

    // brake lights, boost flames, underglow pulse
    this.setBrake(m.braking);
    this.flicker += dt * 40;
    for (const f of this.flames) {
      f.visible = m.boost > 0.05;
      if (f.visible) {
        const s = (0.7 + 0.5 * Math.random()) * m.boost;
        f.scale.set(s, s, s * (1 + Math.sin(this.flicker) * 0.15));
      }
    }
    if (this.glow?.visible && this.glowMat) this.glowMat.opacity = 0.8 + Math.sin(t * 3) * 0.15;

    this.rider?.setSteer(m.steer);
    this.rider?.update(dt, t);
    this.passenger?.update(dt, t);
  }

  dispose(): void {
    this.paint.dispose();
    this.neonGeo?.dispose();
    this.wheelRec?.geo.dispose();
    this.wheelMesh?.dispose();
    this.glowMat?.dispose();
    this.group.removeFromParent();
  }
}

// the folded shared materials (the Mesher gives the same ones; we need them for the meshes we build from merged geometry)
let flatFold: THREE.Material | null = null;
let neonFold: THREE.Material | null = null;
function FLAT_FOLD(): THREE.Material {
  if (!flatFold) {
    const m = new Mesher();
    m.box(FLAT, 0, 0, 0, 1, 1, 1, { color: '#ffffff', cast: false });
    m.box(NEON, 0, 0, 0, 1, 1, 1, { color: '#ffffff', cast: false });
    m.build().traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      if ((me.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) neonFold = me.material as THREE.Material;
      else flatFold = me.material as THREE.Material;
    });
  }
  return flatFold!;
}
function NEON_FOLD(): THREE.Material {
  if (!neonFold) FLAT_FOLD();
  return neonFold!;
}

/** Number of draw calls a ride costs (for the self-checks). */
export function rideMeshCount(r: Ride): number {
  let n = 0;
  r.group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh && me.visible) n++;
  });
  return n;
}
