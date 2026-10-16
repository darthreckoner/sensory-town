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

export type RideKind = VehicleKind;
export const RIDE_KINDS: RideKind[] = ['sports', 'pickup', 'golfcart', 'hoverboard', 'icecream', 'boat'];

export type RideFinish = 'gloss' | 'matte' | 'chrome' | 'glitter';
export interface RideStyle {
  finish: RideFinish;
  neon: string | null;
  trail: boolean;
  rims: string;
}
export const DEFAULT_STYLE: RideStyle = { finish: 'gloss', neon: null, trail: false, rims: '#d9dce6' };

export interface RideInfo {
  name: string;
  icon: string;
  color: string;
  /** a passenger can ride along (jobs) */
  passenger: boolean;
  /** the rider stands (hoverboard) */
  standing: boolean;
  blurb: string;
}
export const RIDE_INFO: Record<RideKind, RideInfo> = {
  sports: { name: 'Sports car', icon: '🏎️', color: '#ff2e88', passenger: true, standing: false, blurb: 'Fast and drifty, with boost' },
  pickup: { name: 'Pickup', icon: '🛻', color: '#2ec4b6', passenger: true, standing: false, blurb: 'Bouncy and tall, best off-road' },
  golfcart: { name: 'Golf cart', icon: '⛳', color: '#7c4dff', passenger: true, standing: false, blurb: 'Slow, tight turns, putt-putt' },
  hoverboard: { name: 'Hoverboard', icon: '🛹', color: '#00d4ff', passenger: false, standing: true, blurb: 'Carve, hop, skim the shallows' },
  icecream: { name: 'Ice-cream truck', icon: '🍦', color: '#ffb3d1', passenger: true, standing: false, blurb: 'Heavy and wobbly, plays a jingle' },
  boat: { name: 'Boat', icon: '🚤', color: '#ffc93c', passenger: true, standing: false, blurb: 'Water only, with a wake' },
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
const FLAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 });
const NEON = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const WHEELS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });

// ── one wheel's geometry ────────────────────────────────────────────────────
interface WheelGeo {
  geo: THREE.BufferGeometry;
  tireEnd: number;
  rimEnd: number;
  count: number;
}
type WheelStyle = 'alloy' | 'offroad' | 'cart';

/** A wheel (axle along x, outer face at +x) as ONE non-indexed buffer: [tyre | rim | cap], with a colour attribute to fill. */
function makeWheelGeometry(R: number, W: number, style: WheelStyle): WheelGeo {
  const rr = Math.min(0.1, R * 0.3);
  const prof: [number, number][] = [[0, -W / 2]];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    prof.push([R - rr + rr * Math.cos(a), -W / 2 + rr + rr * Math.sin(a)]);
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    prof.push([R - rr + rr * Math.cos(a), W / 2 - rr + rr * Math.sin(a)]);
  }
  prof.push([0, W / 2]);
  const piece = (g: THREE.BufferGeometry, m4: THREE.Matrix4): THREE.BufferGeometry => {
    let c = g.clone().applyMatrix4(m4);
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    if (c.index) c = c.toNonIndexed();
    return c;
  };
  const xo = W / 2 - 0.015;
  const T = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);
  const tire = [piece(lathe(prof, 26), new THREE.Matrix4().makeRotationZ(Math.PI / 2))];
  const rim: THREE.BufferGeometry[] = [];
  const rimR = R * 0.75;
  rim.push(piece(new THREE.CylinderGeometry(rimR, rimR, 0.04, 24).rotateZ(Math.PI / 2), T(xo, 0, 0)));
  if (style === 'alloy' || style === 'offroad') {
    const n = style === 'alloy' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = rimR * 0.95;
      const m4 = new THREE.Matrix4().compose(
        new THREE.Vector3(xo + 0.01, Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      rim.push(piece(roundedBox(0.04, len, R * 0.16, 0.012, 1), m4));
    }
  }
  const cap = [piece(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.05, 14).rotateZ(Math.PI / 2), T(xo + 0.02, 0, 0))];
  const n = (l: THREE.BufferGeometry[]): number => l.reduce((s, g) => s + g.attributes.position.count, 0);
  const geo = mergeGeometries([...tire, ...rim, ...cap], false)!;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  geo.computeBoundingSphere();
  return { geo, tireEnd: n(tire), rimEnd: n(tire) + n(rim), count: geo.attributes.position.count };
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
  m.quad(mat, p3, p2, p1, p0, undefined, color);
}

// ── sports car ──
const S_WHEEL_X = 0.8, S_WHEEL_Z = 1.32, S_R = 0.34;
function sportsShape(): THREE.Shape {
  const top: [number, number][] = [
    [2.2, 0.34], [2.22, 0.5], [2.12, 0.64], [1.8, 0.76], [1.3, 0.84], [0.8, 0.88], [0.45, 0.9],
    [0.4, 0.66], [0.36, 0.58], [-1.0, 0.58], [-1.1, 0.62], [-1.18, 0.88], [-1.7, 0.93], [-2.05, 0.92], [-2.2, 0.82],
    [-2.2, 0.5], [-2.15, 0.34], [-1.95, 0.25],
  ];
  const s = new THREE.Shape();
  top.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  const arch = (cx: number): void => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      s.lineTo(cx - Math.cos(Math.PI * t) * 0.4, 0.34 + Math.sin(Math.PI * t) * 0.4);
    }
  };
  arch(-S_WHEEL_Z);
  s.lineTo(-0.92, 0.25);
  s.lineTo(0.92, 0.25);
  arch(S_WHEEL_Z);
  s.lineTo(1.9, 0.26);
  s.lineTo(2.15, 0.28);
  s.lineTo(2.2, 0.34);
  return s;
}
let sportsBodyGeo: THREE.BufferGeometry | null = null;
const buildSports: Builder = (m, paint) => {
  if (!sportsBodyGeo) {
    const g = new THREE.ExtrudeGeometry(sportsShape(), { depth: 1.5, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.1, bevelOffset: -0.1, bevelSegments: 3, curveSegments: 8 });
    g.rotateY(Math.PI / 2);
    g.translate(-0.75, 0, 0);
    sportsBodyGeo = g;
  }
  // door panels / sills + deck lip in paint
  for (const sx of [-1, 1]) {
    body(m, paint, sx * 0.86, 0.74, 0.36, 0.13, 0.34, 1.52);
    body(m, FLAT, sx * 0.86, 0.93, 0.36, 0.1, 0.03, 1.5, CHROME);
  }
  body(m, paint, 0, 0.99, 2.0, 1.4, 0.04, 0.2);
  // tub, bulkhead, cowl dash
  body(m, FLAT, 0, 0.56, 0.32, 1.62, 0.04, 1.4, DARK);
  body(m, FLAT, 0, 0.78, 1.08, 1.6, 0.4, 0.08, DARK);
  body(m, FLAT, 0, 0.78, -0.3, 1.62, 0.26, 0.4, DARK);
  // raked windshield (opaque tinted glass) + A-pillars + header
  plate(m, FLAT, [-0.8, 0.9, -0.42], [0.8, 0.9, -0.42], [0.8, 1.3, -0.08], [-0.8, 1.3, -0.08], GLASS);
  for (const sx of [-1, 1]) {
    plate(m, FLAT, [sx * 0.82, 0.9, -0.43], [sx * 0.82, 1.3, -0.09], [sx * 0.76, 1.3, -0.09], [sx * 0.76, 0.9, -0.43], TRIM);
    body(m, FLAT, sx * 0.97, 1.0, -0.3, 0.12, 0.08, 0.2, DARK);
  }
  body(m, FLAT, 0, 1.3, -0.085, 1.62, 0.04, 0.05, CHROME);
  // front: grille, splitter, hood vents
  body(m, FLAT, 0, 0.45, -2.2, 0.95, 0.15, 0.1, DARK);
  body(m, FLAT, 0, 0.27, -2.08, 1.7, 0.04, 0.34, DARK);
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.62, 0.7, -1.95, 0.56, 0.14, 0.04, DARK);
    for (let i = 0; i < 3; i++) body(m, FLAT, sx * 0.4, 0.88, -1.0 - i * 0.14, 0.34, 0.012, 0.05, DARK);
  }
  // rear: plate, diffuser; seats, console, steering wheel + column
  body(m, FLAT, 0, 0.62, 2.21, 0.62, 0.2, 0.025, WHITE);
  body(m, FLAT, 0, 0.3, 2.12, 1.5, 0.12, 0.2, DARK);
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.42, 0.57, 0.38, 0.52, 0.14, 0.56, SEAT);
    body(m, FLAT, sx * 0.42, 0.86, 0.72, 0.52, 0.44, 0.12, SEAT);
    body(m, FLAT, sx * 0.42, 0.86, 0.65, 0.08, 0.34, 0.02, '#ff2e88');
    body(m, FLAT, sx * 0.44, 1.02, 0.98, 0.07, 0.34, 0.07, CHROME); // roll hoops
  }
  body(m, FLAT, 0, 0.66, 0.2, 0.18, 0.16, 0.9, '#2e2b3a');
  body(m, FLAT, -0.42, 0.98, -0.12, 0.38, 0.05, 0.05, DARK); // steering wheel (a fixed rim)
  body(m, FLAT, -0.42, 0.9, -0.2, 0.05, 0.05, 0.3, DARK);
  // exhaust tips
  for (const sx of [-1, 1]) body(m, FLAT, sx * 0.5, 0.36, 2.22, 0.15, 0.15, 0.26, CHROME);
  // lights (neon): headlights + DRL + fog, roll-hoop caps, then the TAIL lights last
  for (const sx of [-1, 1]) {
    m.box(NEON, sx * 0.62, 0.7, -2.0, 0.5, 0.09, 0.12, { color: '#e6f4ff', cast: false });
    m.box(NEON, sx * 0.62, 0.62, -2.04, 0.5, 0.025, 0.06, { color: '#ffb347', cast: false });
    m.box(NEON, sx * 0.74, 0.37, -2.15, 0.1, 0.06, 0.04, { color: '#ffffff', cast: false });
    m.box(NEON, sx * 0.44, 1.2, 0.98, 0.09, 0.03, 0.09, { color: '#ffffff', cast: false });
  }
  m.box(NEON, 0, 0.93, -0.12, 0.7, 0.025, 0.02, { color: '#00d4ff', cast: false });
  m.box(NEON, 0, 0.9, 2.2, 1.5, 0.07, 0.04, { color: '#8a1218', cast: false });
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.72, 0.84, 2.18, 0.28, 0.1, 0.05, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * S_WHEEL_X, y: S_R, z: sz * S_WHEEL_Z, front: sz < 0 }));
  return {
    wheelR: S_R, wheelW: 0.26, wheelStyle: 'alloy', wheels,
    driver: { x: -0.42, y: 0.62, z: 0.36, scale: 0.92 }, stand: null, passenger: { x: 0.42, y: 0.62, z: 0.36 },
    tailBoxes: 3, exhausts: [[-0.5, 0.36, 2.35], [0.5, 0.36, 2.35]], length: 4.4, width: 1.9, height: 1.3, hasPaint: true,
  };
};

// ── pickup truck: tall, lifted, open cab with a roll cage ──
const buildPickup: Builder = (m, paint) => {
  const R = 0.58;
  // frame + axles
  body(m, FLAT, 0, 0.78, 0, 1.7, 0.28, 4.7, DARK);
  body(m, FLAT, 0, 0.58, -1.75, 2.0, 0.12, 0.2, DARK);
  body(m, FLAT, 0, 0.58, 1.55, 2.0, 0.12, 0.2, DARK);
  // lower body (paint), hood, doors, bed
  body(m, paint, 0, 1.12, 0.0, 2.2, 0.6, 4.9);
  body(m, paint, 0, 1.55, -1.95, 2.15, 0.38, 1.7); // hood
  body(m, FLAT, 0, 1.86, -2.42, 1.1, 0.14, 0.08, DARK); // grille slats
  body(m, FLAT, 0, 1.62, -2.82, 1.6, 0.34, 0.06, DARK); // grille
  for (const sx of [-1, 1]) {
    body(m, paint, sx * 1.04, 1.78, -0.45, 0.14, 0.62, 2.0); // cab sides (open above)
    body(m, paint, sx * 1.04, 1.78, 1.55, 0.16, 0.62, 1.9); // bed sides
    body(m, paint, sx * 1.12, 1.18, -1.75, 0.42, 0.18, 1.5); // fender flares
    body(m, paint, sx * 1.12, 1.18, 1.55, 0.42, 0.18, 1.5);
    body(m, FLAT, sx * 1.16, 0.9, 0.0, 0.14, 0.14, 2.6, CHROME); // side steps
  }
  body(m, paint, 0, 1.78, 2.46, 2.2, 0.62, 0.16); // tailgate
  body(m, FLAT, 0, 1.46, 1.55, 1.9, 0.08, 1.9, '#3a3743'); // bed floor
  body(m, FLAT, 0, 1.48, 0.55, 2.1, 0.08, 0.14, DARK); // cab back
  body(m, paint, 0, 1.78, 0.6, 2.2, 0.62, 0.14); // cab rear wall
  // dash, seats, wheel
  body(m, FLAT, 0, 1.55, -1.1, 1.9, 0.34, 0.45, DARK);
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.5, 1.5, -0.1, 0.8, 0.2, 0.7, SEAT);
    body(m, FLAT, sx * 0.5, 1.9, 0.28, 0.8, 0.62, 0.18, SEAT);
  }
  body(m, FLAT, -0.5, 1.92, -0.95, 0.46, 0.06, 0.06, DARK);
  // windshield frame + roll cage + roof light bar
  plate(m, FLAT, [-0.95, 1.95, -1.05], [0.95, 1.95, -1.05], [0.95, 2.55, -0.7], [-0.95, 2.55, -0.7], GLASS);
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.98, 2.3, -0.88, 0.1, 0.9, 0.1, CHROME);
    body(m, FLAT, sx * 0.98, 2.55, 0.55, 0.1, 1.5, 0.1, CHROME);
    body(m, FLAT, sx * 1.0, 3.0, -0.2, 0.1, 0.1, 1.7, CHROME);
    body(m, FLAT, sx * 1.16, 2.1, -0.95, 0.12, 0.12, 0.3, DARK); // mirrors
  }
  body(m, FLAT, 0, 3.0, 0.55, 2.0, 0.1, 0.1, CHROME);
  body(m, FLAT, 0, 3.0, -0.88, 2.0, 0.1, 0.1, CHROME);
  // bumpers, tow hook, snorkel
  body(m, FLAT, 0, 0.95, -2.95, 2.4, 0.3, 0.3, CHROME);
  body(m, FLAT, 0, 0.95, 2.6, 2.4, 0.28, 0.28, CHROME);
  body(m, FLAT, 1.05, 2.0, -1.0, 0.12, 1.4, 0.12, DARK);
  m.cyl(FLAT, 1.3, 1.3, -0.4, 0.09, 0.09, 1.2, 8, DARK);
  // lights
  for (const sx of [-1, 1]) {
    m.box(NEON, sx * 0.78, 1.62, -2.83, 0.4, 0.28, 0.08, { color: '#fff7dd', cast: false });
    m.box(NEON, sx * 0.4, 3.08, -0.88, 0.34, 0.1, 0.12, { color: '#ffffff', cast: false });
    m.box(NEON, sx * 0.4, 3.08, 0.55, 0.34, 0.1, 0.12, { color: '#ffd9a0', cast: false });
  }
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.9, 1.56, 2.55, 0.3, 0.26, 0.06, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 1.15, y: R, z: sz > 0 ? 1.55 : -1.75, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.46, wheelStyle: 'offroad', wheels,
    driver: { x: -0.5, y: 1.55, z: -0.1, scale: 0.95 }, stand: null, passenger: { x: 0.5, y: 1.55, z: -0.1 },
    tailBoxes: 2, exhausts: [[-0.3, 1.0, 2.7], [0.3, 1.0, 2.7]], length: 5.9, width: 2.5, height: 3.1, hasPaint: true,
  };
};

// ── golf cart: open, cute, a roof on posts, the driver shows ──
const buildGolfcart: Builder = (m, paint) => {
  const R = 0.32;
  body(m, FLAT, 0, 0.38, 0, 1.1, 0.14, 2.5, DARK);
  body(m, paint, 0, 0.5, 0.05, 1.45, 0.16, 2.6); // floor pan
  body(m, paint, 0, 0.85, -1.0, 1.4, 0.7, 0.85); // front cowl
  body(m, paint, 0, 1.15, -0.62, 1.3, 0.1, 0.4, undefined); // dash top
  for (const sx of [-1, 1]) {
    body(m, paint, sx * 0.66, 0.78, 1.0, 0.16, 0.5, 1.0); // rear quarter panels
    body(m, paint, sx * 0.62, 0.56, -0.05, 0.12, 0.2, 1.3); // sills
    body(m, paint, sx * 0.74, 0.62, -0.95, 0.18, 0.16, 0.9); // fenders
    body(m, paint, sx * 0.74, 0.62, 0.95, 0.18, 0.16, 0.8);
  }
  body(m, paint, 0, 0.95, 1.35, 1.4, 0.8, 0.34); // rear body block
  body(m, FLAT, 0, 1.4, 1.35, 1.3, 0.08, 0.5, CHROME); // bag rack
  // bench seat (cushion + back), steering column + wheel
  body(m, FLAT, 0, 0.7, 0.3, 1.2, 0.16, 0.62, SEAT);
  body(m, FLAT, 0, 1.1, 0.68, 1.2, 0.62, 0.14, SEAT);
  body(m, FLAT, -0.28, 1.12, -0.5, 0.36, 0.05, 0.05, DARK);
  body(m, FLAT, -0.28, 0.98, -0.56, 0.05, 0.05, 0.3, DARK);
  // canopy on four posts, with a stripe
  for (const sx of [-1, 1])
    for (const z of [-0.62, 0.98]) body(m, FLAT, sx * 0.68, 1.55, z, 0.07, 1.4, 0.07, CHROME);
  body(m, paint, 0, 2.28, 0.18, 1.6, 0.1, 2.0);
  body(m, FLAT, 0, 2.36, 0.18, 1.2, 0.03, 1.5, WHITE);
  // windscreen (a small tinted pane), front basket, bumpers
  plate(m, FLAT, [-0.62, 1.15, -0.62], [0.62, 1.15, -0.62], [0.62, 1.9, -0.72], [-0.62, 1.9, -0.72], GLASS);
  body(m, FLAT, 0, 0.62, -1.62, 1.1, 0.26, 0.3, WHITE);
  body(m, FLAT, 0, 0.5, -1.46, 1.3, 0.14, 0.12, CHROME);
  body(m, FLAT, 0, 0.5, 1.58, 1.3, 0.14, 0.12, CHROME);
  // lights
  for (const sx of [-1, 1]) {
    m.box(NEON, sx * 0.45, 0.92, -1.44, 0.3, 0.2, 0.06, { color: '#fff7dd', cast: false });
    m.box(NEON, sx * 0.55, 2.08, -0.62, 0.12, 0.1, 0.1, { color: '#ffffff', cast: false });
  }
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.55, 0.98, 1.54, 0.26, 0.16, 0.05, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 0.7, y: R, z: sz > 0 ? 0.95 : -0.95, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.22, wheelStyle: 'cart', wheels,
    driver: { x: -0.28, y: 0.78, z: 0.3, scale: 0.9 }, stand: null, passenger: { x: 0.28, y: 0.78, z: 0.3 },
    tailBoxes: 2, exhausts: [[0, 0.55, 1.7]], length: 3.4, width: 1.7, height: 2.4, hasPaint: true,
  };
};

// ── hoverboard: a chunky deck with an upturned nose and tail, thrusters, glowing underside ──
const buildHoverboard: Builder = (m, paint) => {
  // deck (paint) and the upturned nose / tail plates (a kicker at each end)
  body(m, paint, 0, 0.14, 0, 0.8, 0.1, 1.5);
  const kick = (zNear: number, zFar: number, rise: number): void => {
    const w = 0.4, yb = 0.09, yt = 0.19;
    const fwd = zFar < zNear; // the nose rises towards -z
    const top = [[-w, yt, zNear], [w, yt, zNear], [w, yt + rise, zFar], [-w, yt + rise, zFar]];
    const bot = [[-w, yb, zNear], [w, yb, zNear], [w, yb + rise, zFar], [-w, yb + rise, zFar]];
    // top faces up, underside faces down
    if (fwd) {
      m.quad(paint, top[0], top[1], top[2], top[3]);
      m.quad(paint, bot[3], bot[2], bot[1], bot[0]);
      m.quad(paint, bot[0], top[0], top[3], bot[3]); // left cheek (faces -x)
      m.quad(paint, top[1], bot[1], bot[2], top[2]); // right cheek (faces +x)
    } else {
      m.quad(paint, top[3], top[2], top[1], top[0]);
      m.quad(paint, bot[0], bot[1], bot[2], bot[3]);
      m.quad(paint, top[0], bot[0], bot[3], top[3]);
      m.quad(paint, bot[1], top[1], top[2], bot[2]);
    }
  };
  kick(-0.75, -1.2, 0.26);
  kick(0.75, 1.15, 0.22);
  // grip pad on top, chrome rails, thruster pods at the back, a fin
  body(m, FLAT, 0, 0.2, 0, 0.62, 0.025, 1.2, '#2c2a36');
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.41, 0.14, 0, 0.05, 0.1, 1.5, CHROME);
    body(m, FLAT, sx * 0.34, 0.12, 0.92, 0.2, 0.2, 0.38, DARK);
    body(m, FLAT, sx * 0.34, 0.06, -0.9, 0.14, 0.12, 0.3, DARK);
  }
  body(m, FLAT, 0, 0.3, 0.98, 0.06, 0.2, 0.34, CHROME);
  // glow: a strip under the deck (seen from the sides and below), thruster ports, a headlight and a dim tail light last
  body(m, NEON, 0, 0.045, 0, 0.62, 0.035, 1.9, '#00d4ff');
  for (const sx of [-1, 1]) {
    body(m, NEON, sx * 0.34, 0.12, 1.12, 0.14, 0.14, 0.04, '#00d4ff');
    body(m, NEON, sx * 0.43, 0.1, -0.2, 0.02, 0.03, 1.2, '#7cf6ff');
  }
  m.box(NEON, 0, 0.42, -1.14, 0.5, 0.04, 0.04, { color: '#ffffff', cast: false });
  m.box(NEON, 0, 0.36, 1.2, 0.5, 0.04, 0.04, { color: '#8a1218', cast: false });
  return {
    wheelR: 0, wheelW: 0, wheelStyle: 'cart', wheels: [],
    driver: null, stand: { x: 0, y: 0.2, z: 0.05, yaw: 0.9 }, passenger: null,
    tailBoxes: 1, exhausts: [[-0.34, 0.1, 1.15], [0.34, 0.1, 1.15]], length: 2.6, width: 0.9, height: 0.45, hasPaint: true,
  };
};

// ── ice-cream truck: a big boxy van, a serving window with an awning, a giant cone on the roof ──
const buildIcecream: Builder = (m, paint) => {
  const R = 0.46;
  body(m, FLAT, 0, 0.6, 0.3, 1.9, 0.3, 5.4, DARK);
  // rear box, cab, hood
  body(m, paint, 0, 1.75, 1.3, 2.35, 2.0, 3.7); // the serving box
  body(m, paint, 0, 1.1, -1.35, 2.35, 0.95, 1.6); // cab lower
  body(m, paint, 0, 0.98, -2.5, 2.3, 0.7, 0.85); // hood
  body(m, paint, 0, 2.62, -1.35, 2.35, 0.14, 1.75); // cab roof
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 1.1, 1.95, -0.6, 0.12, 0.9, 0.12, CHROME); // cab posts
    body(m, FLAT, sx * 1.1, 1.95, -2.05, 0.12, 0.9, 0.12, CHROME);
  }
  plate(m, FLAT, [-1.1, 1.62, -2.1], [1.1, 1.62, -2.1], [1.1, 2.55, -1.95], [-1.1, 2.55, -1.95], GLASS);
  // serving window (right side) with awning, counter and scoop menu
  body(m, FLAT, 1.2, 1.85, 1.4, 0.06, 0.8, 1.6, '#1e3550');
  m.box(NEON, 1.23, 1.85, 1.4, 0.03, 0.62, 1.4, { color: '#bfeaff', cast: false });
  body(m, FLAT, 1.3, 1.4, 1.4, 0.3, 0.07, 1.9, WHITE);
  for (let i = 0; i < 8; i++) {
    const z = 0.55 + i * 0.4;
    const col = i % 2 ? '#ffffff' : '#ff4d8d';
    m.quad(FLAT, [1.18, 2.4, z], [1.18, 2.4, z + 0.4], [1.75, 2.12, z + 0.4], [1.75, 2.12, z], undefined, col);
    m.quad(FLAT, [1.18, 2.4, z + 0.4], [1.18, 2.4, z], [1.75, 2.12, z], [1.75, 2.12, z + 0.4], undefined, col);
  }
  body(m, FLAT, -1.19, 1.7, 1.5, 0.05, 0.9, 1.9, '#ffd9ec'); // left side art panel
  // a big cone on the roof: a point-down cone + three stacked scoops + a cherry
  m.cyl(FLAT, 0, 2.7, 1.2, 0.04, 0.5, 0.95, 12, '#e0a15a');
  m.cyl(FLAT, 0, 3.6, 1.2, 0.55, 0.5, 0.26, 12, '#ff9ec7');
  m.cyl(FLAT, 0, 3.84, 1.2, 0.5, 0.42, 0.26, 12, '#ffffff');
  m.cyl(FLAT, 0, 4.07, 1.2, 0.42, 0.28, 0.26, 12, '#9be7ff');
  m.cyl(FLAT, 0, 4.3, 1.2, 0.12, 0.12, 0.18, 8, RED);
  // speakers, bumpers, grille, side mirrors
  for (const sx of [-1, 1]) {
    m.cyl(FLAT, sx * 0.8, 2.76, -1.2, 0.06, 0.2, 0.32, 8, DARK);
    body(m, FLAT, sx * 1.3, 1.6, -2.0, 0.1, 0.34, 0.2, DARK);
  }
  body(m, FLAT, 0, 0.78, -3.0, 2.5, 0.28, 0.28, CHROME);
  body(m, FLAT, 0, 0.78, 3.15, 2.5, 0.28, 0.28, CHROME);
  body(m, FLAT, 0, 1.0, -2.95, 1.3, 0.4, 0.05, DARK);
  // seats
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.5, 1.0, -1.3, 0.8, 0.18, 0.7, SEAT);
    body(m, FLAT, sx * 0.5, 1.4, -0.9, 0.8, 0.66, 0.16, SEAT);
  }
  body(m, FLAT, -0.5, 1.5, -2.0, 0.46, 0.06, 0.06, DARK);
  // lights: headlights, roof beacon, then the TAIL lights last
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.85, 1.05, -2.94, 0.4, 0.28, 0.06, { color: '#fff7dd', cast: false });
  m.box(NEON, 0, 2.74, -2.0, 0.5, 0.1, 0.1, { color: '#ffd166', cast: false });
  for (const sx of [-1, 1]) m.box(NEON, sx * 0.95, 1.2, 3.12, 0.3, 0.4, 0.06, { color: '#8a1218', cast: false });
  const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 1.08, y: R, z: sz > 0 ? 1.75 : -1.7, front: sz < 0 }));
  return {
    wheelR: R, wheelW: 0.36, wheelStyle: 'cart', wheels,
    driver: { x: -0.5, y: 1.0, z: -1.3, scale: 0.92 }, stand: null, passenger: { x: 0.5, y: 1.0, z: -1.3 },
    tailBoxes: 2, exhausts: [[-0.5, 0.6, 3.25], [0.5, 0.6, 3.25]], length: 6.4, width: 2.5, height: 4.5, hasPaint: true,
  };
};

// ── boat: a chunky speedboat with a pointed bow, windscreen, benches and an outboard ──
const buildBoat: Builder = (m, paint) => {
  const L0 = -2.6, L1 = 2.4, HW = 0.98;
  // hull (paint): two side panels, a pointed bow deck, a flat stern deck, a transom
  const side = (s: number): void => {
    // outer hull: from the gunwale down to the keel, bow to stern
    m.quad(paint, [s * 0.0, 0.7, L0], [s * HW, 0.78, -0.5], [s * HW * 0.55, -0.22, -0.5], [0, -0.28, L0]);
    m.quad(paint, [s * HW, 0.78, -0.5], [s * HW, 0.82, L1], [s * HW * 0.6, -0.2, L1], [s * HW * 0.55, -0.22, -0.5]);
  };
  side(1);
  // the left side winds the other way
  m.quad(paint, [0, -0.28, L0], [-HW * 0.55, -0.22, -0.5], [-HW, 0.78, -0.5], [0, 0.7, L0]);
  m.quad(paint, [-HW * 0.55, -0.22, -0.5], [-HW * 0.6, -0.2, L1], [-HW, 0.82, L1], [-HW, 0.78, -0.5]);
  // bottom + transom + decks
  m.quad(paint, [0, -0.28, L0], [HW * 0.55, -0.22, -0.5], [HW * 0.6, -0.2, L1], [-HW * 0.6, -0.2, L1]);
  m.quad(paint, [0, -0.28, L0], [-HW * 0.6, -0.2, L1], [-HW * 0.55, -0.22, -0.5], [-HW * 0.55, -0.22, -0.5]);
  m.quad(paint, [-HW * 0.6, -0.2, L1], [HW * 0.6, -0.2, L1], [HW, 0.82, L1], [-HW, 0.82, L1]);
  // inner floor + front deck
  m.quad(FLAT, [-0.8, 0.28, -0.4], [0.8, 0.28, -0.4], [0.8, 0.28, L1 - 0.05], [-0.8, 0.28, L1 - 0.05], undefined, '#e7e2d6');
  m.quad(paint, [0, 0.72, L0], [-HW, 0.8, -0.5], [HW, 0.8, -0.5], [0, 0.72, L0 + 0.01]);
  m.quad(paint, [-HW, 0.8, -0.5], [-HW, 0.8, -0.1], [HW, 0.8, -0.1], [HW, 0.8, -0.5]);
  // gunwale rails (inner faces), stripe, bow rail
  for (const sx of [-1, 1]) {
    m.quad(FLAT, [sx * (HW - 0.06), 0.3, -0.1], [sx * (HW - 0.06), 0.3, L1], [sx * (HW - 0.06), 0.8, L1], [sx * (HW - 0.06), 0.8, -0.1], undefined, '#f3f2ee');
    m.quad(FLAT, [sx * (HW - 0.06), 0.8, -0.1], [sx * (HW - 0.06), 0.8, L1], [sx * (HW - 0.06), 0.3, L1], [sx * (HW - 0.06), 0.3, -0.1], undefined, '#f3f2ee');
    body(m, FLAT, sx * (HW - 0.02), 0.9, 0.9, 0.06, 0.06, 2.6, CHROME);
    body(m, FLAT, sx * 0.4, 0.88, -1.6, 0.05, 0.05, 1.2, CHROME, sx * 0.3);
  }
  // windscreen + frame, console, benches, steering wheel
  plate(m, FLAT, [-0.85, 0.82, -0.05], [0.85, 0.82, -0.05], [0.7, 1.4, 0.18], [-0.7, 1.4, 0.18], GLASS);
  body(m, FLAT, 0, 0.98, 0.02, 1.8, 0.07, 0.07, CHROME);
  body(m, FLAT, 0, 0.55, 0.15, 1.3, 0.55, 0.4, '#2a2d3a');
  body(m, FLAT, -0.4, 0.86, 0.2, 0.36, 0.05, 0.05, DARK);
  for (const sx of [-1, 1]) {
    body(m, FLAT, sx * 0.4, 0.5, 0.95, 0.7, 0.2, 0.6, SEAT);
    body(m, FLAT, sx * 0.4, 0.82, 1.28, 0.7, 0.5, 0.14, SEAT);
  }
  body(m, FLAT, 0, 0.52, 1.95, 1.7, 0.2, 0.55, '#e7e2d6'); // stern bench
  // outboard motor on the transom
  body(m, FLAT, 0, 0.62, 2.62, 0.5, 0.7, 0.4, '#2a2d3a');
  body(m, paint, 0, 1.02, 2.62, 0.54, 0.14, 0.44);
  body(m, FLAT, 0, 0.0, 2.7, 0.14, 0.7, 0.2, DARK);
  body(m, FLAT, 0, -0.34, 2.72, 0.5, 0.06, 0.34, CHROME);
  // lights
  m.box(NEON, 0, 0.9, -2.2, 0.14, 0.1, 0.14, { color: '#ffffff', cast: false });
  m.box(NEON, 0, 1.45, 2.2, 0.1, 0.5, 0.1, { color: '#ffd166', cast: false });
  m.box(NEON, 0, 0.8, 2.45, 0.9, 0.06, 0.04, { color: '#8a1218', cast: false });
  return {
    wheelR: 0, wheelW: 0, wheelStyle: 'cart', wheels: [],
    driver: { x: -0.4, y: 0.62, z: 0.95, scale: 0.9 }, stand: null, passenger: { x: 0.4, y: 0.62, z: 0.95 },
    tailBoxes: 1, exhausts: [[0, 0.1, 2.9]], length: 5.6, width: 2.1, height: 1.5, hasPaint: true,
  };
};

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
  if (kind === 'sports' && sportsBodyGeo) pg.push(sportsBodyGeo.clone());
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
      const me = new THREE.Mesh(tpl.flat, FLAT_FOLD());
      me.castShadow = false;
      me.receiveShadow = false;
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
    switch (this.style.finish) {
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
    const rim = new THREE.Color(this.style.rims);
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
      this.spec.wheels.forEach((w, i) => {
        EUL.set(-this.spin, (w.front ? steer : 0) + (w.x < 0 ? Math.PI : 0), 0, 'YXZ');
        QUAT.setFromEuler(EUL);
        // the wheel sits on the leaning, bouncing body: apply the rig's lean around the origin too
        V3.set(w.x, w.y + this.rig.position.y * 0.6, w.z);
        TMP.compose(V3, QUAT, ONE);
        wm.setMatrixAt(i, TMP);
      });
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
