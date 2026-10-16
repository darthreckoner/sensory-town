// ── v3 locker ── 12 original gliders (procedural; every one is at most 2 draw calls: one SOLID mesh
// + at most one moving / translucent layer — see gearKit.ts). Canopies are BIG (about 3 m across,
// ~2 m above the grip) and chunky so each one reads from a long way off.
//
// Contract: `makeGlider(id)` returns a THREE.Group whose ORIGIN is the hands' grip point (a short
// bar along X at y = 0) with the canopy ABOVE it (+Y), nose toward +Z (the way the player faces).
// Animated gliders set `group.userData.tick = (t) => …` (optional).
import * as THREE from 'three';
import { GearBuilder, heartShape, starShape, wingShape, type GearFinish } from './gearKit';

export const GLIDER_IDS = [
  'starter', 'umbrella', 'balloons', 'butterfly', 'pizza', 'cloud', 'dragonfly', 'paperplane',
  'kite', 'jellyfish', 'daisy', 'shootingstar',
] as const;
export type GliderId = (typeof GLIDER_IDS)[number];

const RAINBOW = ['#ff3b3b', '#ff8a1f', '#ffe53b', '#4cd964', '#35d6ff', '#4a6bff', '#b65cff'];
const star = starShape(5, 0.52);
const star8 = starShape(5, 0.46);
const heart = heartShape();
type V3 = [number, number, number];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function gripBar(b: GearBuilder, accent = '#ffe53b'): void {
  b.cyl(0.022, 0.022, 0.5, '#2a1d5e', 'metal', { r: [0, 0, Math.PI / 2] }, 10);
  for (const s of [-1, 1]) b.ball(0.036, accent, 'gloss', { p: [s * 0.25, 0, 0] }, true);
}
function lines(b: GearBuilder, pairs: [V3, V3][], color = '#f4f4ff', r = 0.006, finish: GearFinish = 'matte'): void {
  for (const [a, c] of pairs) b.line(a, c, r, color, finish);
}
function withTick(g: THREE.Group, tick: (t: number) => void): THREE.Group {
  g.userData.tick = tick;
  return g;
}
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ── 1. Rainbow Parafoil (the starter glider) ─────────────────────────────────
function starter(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b);
  const pairs: [V3, V3][] = [];
  RAINBOW.forEach((c, i) => {
    const k = i - 3;
    const x = k * 0.47;
    const y = 2.05 - k * k * 0.075;
    const roll = -k * 0.15;
    b.box(0.48, 0.24, 1.7, c, 'gloss', { p: [x, y, 0.05], r: [0, 0, roll] }, 0.11);
    b.box(0.4, 0.03, 0.36, '#ffffff', 'gloss', { p: [x, y + 0.13, 0.66], r: [0, 0, roll] }, 0.012); // leading-edge highlight
    const bx = clamp(x * 0.2, -0.22, 0.22);
    pairs.push([[bx, 0.02, 0], [x, y - 0.12, 0.55]], [[bx, 0.02, 0], [x, y - 0.12, -0.42]]);
  });
  lines(b, pairs);
  b.shape(star, 0.05, '#ffffff', 'gloss', { p: [0, 2.2, 0.1], r: [Math.PI / 2, 0, 0], s: 0.5 }, 0.01); // a star on the middle cell
  return b.build();
}

// ── 2. Brolly (umbrella) ─────────────────────────────────────────────────────
function umbrella(): THREE.Group {
  const b = new GearBuilder();
  const n = 10, R = 1.75, Y = 1.55;
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(1, 8, 10, (i / n) * Math.PI * 2, (Math.PI * 2) / n, 0, 1.12);
    b.add(g, i % 2 ? '#fff6fb' : '#ff4fa3', 'sheet', { p: [0, Y, 0], s: [R, 1.0, R] });
    g.dispose();
    const a = ((i + 0.5) / n) * Math.PI * 2;
    b.ball(0.05, '#ffd23f', 'gloss', { p: [Math.cos(a) * R * 0.9, Y + Math.cos(1.12) * 1.0, Math.sin(a) * R * 0.9] }, true);
  }
  b.cyl(0.026, 0.026, 2.6, '#ffd23f', 'metal', { p: [0, 1.3, 0] }, 10);
  b.ball(0.07, '#ffd23f', 'metal', { p: [0, 2.58, 0] }, true);
  b.torus(0.08, 0.03, '#8a4a26', 'gloss', { p: [0.08, -0.02, 0], r: [0, 0, Math.PI] }, Math.PI); // J-hook handle
  b.cyl(0.032, 0.032, 0.42, '#8a4a26', 'gloss', { p: [0, 0.08, 0] }, 10);
  b.cyl(0.02, 0.02, 0.5, '#2a1d5e', 'metal', { p: [0, 0.0, 0], r: [0, 0, Math.PI / 2] }, 10); // the hands' bar
  return b.build();
}

// ── 3. Balloon Bunch ─────────────────────────────────────────────────────────
function balloons(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#ff4fa3');
  const list: [number, number, number, string][] = [
    [-0.7, 2.25, 0.1, '#ff3b6e'], [0.0, 2.75, 0.0, '#ffe53b'], [0.7, 2.28, -0.06, '#35d6ff'],
    [-0.36, 1.95, 0.45, '#b65cff'], [0.38, 2.0, 0.4, '#4cd964'], [-0.5, 2.7, -0.36, '#ff8a1f'], [0.5, 2.78, -0.34, '#ff4fa3'],
  ];
  for (const [x, y, z, c] of list) {
    b.ball([0.42, 0.5, 0.42], c, 'gloss', { p: [x, y, z] });
    b.cone(0.05, 0.1, c, 'gloss', { p: [x, y - 0.51, z], r: [Math.PI, 0, 0] }, 8);
    b.ball([0.07, 0.04, 0.07], '#ffffff', 'glow', { p: [x - 0.14, y + 0.2, z + 0.31] }, true); // shine
    b.line([x, y - 0.55, z], [x * 0.08, 0.06, 0], 0.006, '#f4f4ff');
  }
  b.cone(0.06, 0.12, '#ff3d8b', 'gloss', { p: [-0.07, 0.1, 0], r: [0, 0, Math.PI / 2] }, 8); // ribbon bow
  b.cone(0.06, 0.12, '#ff3d8b', 'gloss', { p: [0.07, 0.1, 0], r: [0, 0, -Math.PI / 2] }, 8);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.6) * 0.03;
    g.rotation.x = Math.sin(t * 1.2) * 0.02;
  });
}

// ── 4. Flutterwing (butterfly) ───────────────────────────────────────────────
function butterfly(): THREE.Group {
  const b = new GearBuilder();
  const up = wingShape(1.55, 1.2, 0.2, 0.4);
  const lo = wingShape(1.1, 0.78, 0.1, 0.2);
  const Y = 1.9;
  b.layer('wings');
  for (const side of [1, -1]) {
    const rx = Math.PI / 2, ry = side > 0 ? 0 : Math.PI;
    b.within({ p: [side * 0.06, Y, 0.06], r: [0, 0, side * 0.34] }, () => {
      b.shape(up, 0.05, '#6a2cff', 'gloss', { r: [rx, ry, 0.1] }, 0.01);
      for (const d of [1, -1]) {
        b.shape(up, 0.04, '#ff4fa3', 'gloss', { p: [side * 0.16, d * 0.032, 0.04], r: [rx, ry, 0.1], s: [0.8, 0.8, 1] }, 0.01);
        b.shape(up, 0.04, '#ffd23f', 'gloss', { p: [side * 0.3, d * 0.06, 0.08], r: [rx, ry, 0.1], s: [0.5, 0.5, 1] }, 0.01);
        b.shape(lo, 0.04, '#35d6ff', 'gloss', { p: [side * 0.16, d * 0.03, -0.12], r: [rx, ry, -0.55], s: [0.74, 0.74, 1] }, 0.01);
        b.ball([0.1, 0.03, 0.1], '#ffffff', 'gloss', { p: [side * 1.1, d * 0.07, 0.55] }, true);
        b.ball([0.08, 0.03, 0.08], '#ffffff', 'gloss', { p: [side * 0.7, d * 0.06, -0.78] }, true);
      }
      b.shape(lo, 0.05, '#6a2cff', 'gloss', { p: [0, -0.01, -0.06], r: [rx, ry, -0.55] }, 0.01);
    });
  }
  b.layer('main');
  gripBar(b, '#6a2cff');
  b.ball([0.09, 0.09, 0.62], '#2a1d5e', 'gloss', { p: [0, Y, 0.0] });
  b.ball(0.11, '#2a1d5e', 'gloss', { p: [0, Y + 0.02, 0.66] }, true);
  b.line([0, Y + 0.08, 0.7], [0.18, Y + 0.38, 1.0], 0.012, '#2a1d5e');
  b.line([0, Y + 0.08, 0.7], [-0.18, Y + 0.38, 1.0], 0.012, '#2a1d5e');
  b.ball(0.035, '#ffe53b', 'gloss', { p: [0.18, Y + 0.38, 1.0] }, true);
  b.ball(0.035, '#ffe53b', 'gloss', { p: [-0.18, Y + 0.38, 1.0] }, true);
  lines(b, [[[-0.2, 0.02, 0], [-0.06, Y - 0.1, 0.34]], [[0.2, 0.02, 0], [0.06, Y - 0.1, 0.34]], [[-0.2, 0.02, 0], [-0.06, Y - 0.1, -0.22]], [[0.2, 0.02, 0], [0.06, Y - 0.1, -0.22]]]);
  const g = b.build();
  const wings = b.mesh('wings')!;
  return withTick(g, (t) => {
    wings.scale.x = 1 - 0.3 * (0.5 + 0.5 * Math.sin(t * 4.6));
  });
}

// ── 5. Pizza Slice ───────────────────────────────────────────────────────────
function pizzaShape(w: number, len: number): THREE.Shape {
  // a fat slice: wide crust at the back (-z), a rounded point at the front (+z). Shape XY → lies flat via rotation x = π/2 (shape +y → +z).
  const sh = new THREE.Shape();
  sh.moveTo(-w, -len * 0.5);
  sh.lineTo(w, -len * 0.5);
  sh.lineTo(0.16 * w, len * 0.5 - 0.1);
  sh.quadraticCurveTo(0, len * 0.5 + 0.06, -0.16 * w, len * 0.5 - 0.1);
  sh.closePath();
  return sh;
}
function pizza(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#ff3b3b');
  const Y = 2.0, W = 0.98, LEN = 2.5;
  const tilt = 0.4; // nose down, so the toppings face a camera behind
  b.within({ p: [0, Y, 0.05], r: [tilt, 0, 0] }, () => {
    const R = Math.PI / 2;
    b.shape(pizzaShape(W, LEN), 0.18, '#e8a95c', 'matte', { r: [R, 0, 0], p: [0, 0, 0] }, 0.04); // the doughy slice
    b.shape(pizzaShape(W * 0.93, LEN * 0.95), 0.07, '#ffcf45', 'gloss', { r: [R, 0, 0], p: [0, 0.12, 0.02] }, 0.03); // melted cheese
    b.cyl(0.17, 0.17, W * 2.0, '#d98c3a', 'matte', { p: [0, 0.03, -LEN * 0.5], r: [0, 0, Math.PI / 2] }, 14); // the fat crust
    for (const s of [-1, 1]) b.ball(0.17, '#d98c3a', 'matte', { p: [s * W, 0.03, -LEN * 0.5] }, true);
    // the underside: golden dough with grill stripes and a heart stamp (what you see from below)
    for (let i = 0; i < 5; i++) b.box(W * (1.55 - i * 0.28), 0.03, 0.07, '#b5702a', 'matte', { p: [0, -0.1, -0.85 + i * 0.5] }, 0.012);
    b.shape(heart, 0.03, '#ffcf45', 'gloss', { p: [0, -0.115, 0.1], r: [Math.PI / 2, 0, 0], s: 0.55 }, 0.006);
    // cheese drips over the crust edge
    for (const x of [-0.7, -0.25, 0.2, 0.62]) b.cone(0.075, 0.26, '#ffcf45', 'gloss', { p: [x, -0.04, -LEN * 0.5 + 0.18], r: [Math.PI, 0, 0] }, 8);
    // toppings: pepperoni, olives, basil, mushrooms
    const pep: [number, number, number][] = [[-0.42, -0.7, 0.26], [0.45, -0.55, 0.24], [0.0, 0.0, 0.25], [-0.2, 0.7, 0.19], [0.22, 0.45, 0.16], [-0.55, -0.05, 0.17]];
    for (const [x, z, r] of pep) {
      b.cyl(r, r, 0.05, '#d7352b', 'gloss', { p: [x, 0.18, z] }, 16);
      b.cyl(r * 0.5, r * 0.5, 0.056, '#a81e16', 'gloss', { p: [x, 0.185, z + r * 0.15] }, 12);
    }
    for (const [x, z] of [[0.55, 0.15], [-0.15, -0.38], [0.15, 0.95]] as [number, number][]) b.torus(0.075, 0.03, '#2a2433', 'gloss', { p: [x, 0.2, z], r: [Math.PI / 2, 0, 0] });
    for (const [x, z, a] of [[0.12, -0.95, 0.4], [-0.4, 0.38, 1.1], [0.38, 0.8, 2.0], [-0.1, 1.15, 0.2]] as [number, number, number][]) b.ball([0.16, 0.02, 0.09], '#3ec04a', 'gloss', { p: [x, 0.2, z], r: [0, a, 0] }, true);
    for (const [x, z] of [[-0.65, -0.95], [0.7, -0.2]] as [number, number][]) b.ball([0.1, 0.07, 0.1], '#f1e4cf', 'matte', { p: [x, 0.2, z] }, true);
  });
  lines(b, [[[-0.2, 0.02, 0], [-0.75, Y - 0.12, -0.9]], [[0.2, 0.02, 0], [0.75, Y - 0.12, -0.9]], [[-0.2, 0.02, 0], [-0.1, Y - 0.1, 1.0]], [[0.2, 0.02, 0], [0.1, Y - 0.1, 1.0]]]);
  return b.build();
}

// ── 6. Puff Cloud ────────────────────────────────────────────────────────────
function cloud(): THREE.Group {
  const b = new GearBuilder();
  const Y = 2.1;
  // a big cumulus: white tops, pastel lavender / pink undersides, so it reads from below too
  const puffs: [number, number, number, number, string][] = [
    [0, 0.1, 0, 0.85, '#ffffff'], [-0.95, 0.0, 0.05, 0.62, '#ffffff'], [0.95, 0.0, 0.0, 0.64, '#ffffff'], [-1.5, -0.15, 0.0, 0.42, '#f3efff'],
    [1.5, -0.15, 0.02, 0.43, '#f3efff'], [-0.45, 0.55, 0.15, 0.58, '#ffffff'], [0.5, 0.52, -0.1, 0.55, '#ffffff'],
    [-0.5, -0.12, 0.7, 0.5, '#fff7ff'], [0.45, -0.12, 0.72, 0.5, '#fff7ff'], [0, -0.1, -0.7, 0.55, '#f0e8ff'], [-1.0, -0.12, -0.5, 0.42, '#e8defa'], [1.0, -0.12, -0.48, 0.44, '#e8defa'],
    [0.0, -0.32, 0.12, 0.7, '#e2d6ff'], [-0.7, -0.28, 0.2, 0.46, '#ffd9ee'], [0.72, -0.28, 0.2, 0.48, '#d4ecff'],
  ];
  for (const [x, y, z, r, c] of puffs) b.ball([r, r * 0.78, r], c, 'matte', { p: [x, Y + y, z] });
  // a rainbow arching over the top, and sparkly stars
  RAINBOW.slice(0, 5).forEach((c, i) => b.torus(0.62 - i * 0.07, 0.04, c, 'gloss', { p: [0, Y + 0.72, 0.1], r: [0.2, 0, 0] }, Math.PI));
  for (const [x, y, z] of [[-0.9, 0.55, 0.6], [1.05, 0.5, 0.55], [0.1, 0.95, -0.5]] as V3[]) b.shape(star, 0.05, '#ffe53b', 'gloss', { p: [x, Y + y, z], s: 0.26 }, 0.01);
  // a cute face on the front (+z)
  for (const s of [-1, 1]) {
    b.ball([0.075, 0.095, 0.04], '#2a1d5e', 'gloss', { p: [s * 0.3, Y + 0.12, 1.1] }, true);
    b.ball(0.022, '#ffffff', 'glow', { p: [s * 0.3 - 0.02, Y + 0.16, 1.14] }, true);
    b.ball([0.1, 0.06, 0.04], '#ff9ec9', 'matte', { p: [s * 0.52, Y - 0.04, 1.06] }, true);
  }
  b.torus(0.1, 0.022, '#2a1d5e', 'gloss', { p: [0, Y + 0.0, 1.12], r: [0, 0, Math.PI] }, Math.PI);
  gripBar(b, '#b65cff');
  lines(b, [[[-0.25, 0.02, 0], [-0.7, Y - 0.2, 0.3]], [[0.25, 0.02, 0], [0.7, Y - 0.2, 0.3]], [[-0.25, 0.02, 0], [-0.6, Y - 0.2, -0.5]], [[0.25, 0.02, 0], [0.6, Y - 0.2, -0.5]]], '#ff9ad7', 0.014, 'gloss');
  const g = b.build();
  return withTick(g, (t) => {
    g.position.y = Math.sin(t * 2.2) * 0.04;
    g.rotation.z = Math.sin(t * 1.3) * 0.02;
  });
}

// ── 7. Dragonfly ─────────────────────────────────────────────────────────────
function dragonfly(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#10c9c0');
  const Y = 1.95;
  b.ball([0.19, 0.18, 0.3], '#10c9c0', 'gloss', { p: [0, Y, 0.55] }); // thorax
  b.ball([0.17, 0.16, 0.17], '#0a8f9a', 'gloss', { p: [0, Y + 0.02, 0.92] }, true); // head
  for (const s of [-1, 1]) {
    b.ball(0.13, '#8cff3b', 'gloss', { p: [s * 0.12, Y + 0.08, 1.0] }, true); // big eyes
    b.ball(0.035, '#ffffff', 'glow', { p: [s * 0.16, Y + 0.14, 1.1] }, true);
  }
  for (let i = 0; i < 10; i++) {
    const z = 0.28 - i * 0.2;
    const r = 0.12 - i * 0.007;
    b.ball([r, r, 0.13], i % 2 ? '#ff4fa3' : '#10c9c0', 'gloss', { p: [0, Y, z] }, true);
  }
  b.ball([0.035, 0.035, 0.12], '#0a8f9a', 'gloss', { p: [0, Y, -1.78] }, true);
  lines(b, [[[-0.22, 0.02, 0], [-0.08, Y - 0.14, 0.7]], [[0.22, 0.02, 0], [0.08, Y - 0.14, 0.7]], [[-0.22, 0.02, 0], [-0.06, Y - 0.12, -0.1]], [[0.22, 0.02, 0], [0.06, Y - 0.12, -0.1]]]);
  // four big shimmering wings (their own translucent layer, so they can beat together)
  b.layer('wings');
  for (const side of [1, -1]) {
    for (const [z, len, chord, tone] of [[0.62, 1.55, 0.5, '#8ff0ff'], [0.12, 1.35, 0.42, '#c7a8ff']] as [number, number, number, string][]) {
      b.ball([len / 2, 0.018, chord], tone, 'wing', { p: [side * (len / 2 + 0.1), Y + 0.12, z], r: [0, side * (z > 0.4 ? -0.16 : 0.1), side * 0.06] });
      b.ball([len * 0.2, 0.02, chord * 0.55], '#ffffff', 'wing', { p: [side * (len * 0.78 + 0.1), Y + 0.13, z - 0.05], r: [0, 0, 0] }, true);
      for (let i = 0; i < 4; i++) b.line([side * 0.1, Y + 0.12, z + (i - 1.5) * 0.08], [side * (len * (0.6 + i * 0.1) + 0.1), Y + 0.13, z + (i - 1.5) * 0.17], 0.01, '#ffffff', 'wing');
    }
  }
  const g = b.build();
  const wings = b.mesh('wings', true);
  return withTick(g, (t) => {
    if (wings) wings.scale.x = 1 - 0.16 * (0.5 + 0.5 * Math.sin(t * 15));
  });
}

// ── 8. Paper Plane ───────────────────────────────────────────────────────────
function paperplane(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#4a6bff');
  const Y = 1.95;
  const tip: V3 = [0, Y + 0.04, 1.7];
  const R: V3 = [1.7, Y + 0.28, -1.15], Lf: V3 = [-1.7, Y + 0.28, -1.15], C: V3 = [0, Y, -1.15];
  b.tri(tip, R, C, '#ffb3da');
  b.tri(tip, C, Lf, '#a9d8ff');
  b.tri(tip, C, [0, Y - 0.5, -1.15], '#d3c2ff'); // keel fold
  b.tri([0, Y, 0.95], [0.85, Y + 0.14, -0.85], [0, Y - 0.01, -0.85], '#ff8ec8'); // crease shading
  b.tri([0, Y, 0.95], [-0.85, Y + 0.14, -0.85], [0, Y - 0.01, -0.85], '#7fc6ff');
  b.shape(heart, 0.02, '#ff4fa3', 'sheet', { p: [0.8, Y + 0.17, -0.3], r: [Math.PI / 2, 0, 0.1], s: 0.38 }, 0.003);
  b.shape(star, 0.02, '#ffd23f', 'sheet', { p: [-0.8, Y + 0.17, -0.34], r: [Math.PI / 2, 0, -0.1], s: 0.38 }, 0.003);
  b.line([0.08, Y + 0.05, 1.4], [1.55, Y + 0.26, -1.05], 0.014, '#9fb0f5');
  b.line([-0.08, Y + 0.05, 1.4], [-1.55, Y + 0.26, -1.05], 0.014, '#9fb0f5');
  lines(b, [[[-0.22, 0.02, 0], [-0.7, Y + 0.14, -0.35]], [[0.22, 0.02, 0], [0.7, Y + 0.14, -0.35]], [[-0.22, 0.02, 0], [-0.05, Y - 0.25, -0.85]], [[0.22, 0.02, 0], [0.05, Y - 0.25, -0.85]]]);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.4) * 0.03;
    g.rotation.x = Math.sin(t * 1.9) * 0.02;
  });
}

// ── 9. Candy Kite ────────────────────────────────────────────────────────────
function kite(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#ff4fa3');
  const Y = 2.05;
  const nose: V3 = [0, Y + 0.18, 1.7], tail: V3 = [0, Y - 0.05, -1.35], Rt: V3 = [1.45, Y + 0.34, 0.0], Lt: V3 = [-1.45, Y + 0.34, 0.0], C: V3 = [0, Y + 0.12, 0.05];
  b.tri(nose, Rt, C, '#ff4fa3');
  b.tri(Rt, tail, C, '#ffd23f');
  b.tri(tail, Lt, C, '#35d6ff');
  b.tri(Lt, nose, C, '#b65cff');
  b.line(nose, tail, 0.03, '#ffffff', 'gloss'); // spars
  b.line(Rt, Lt, 0.03, '#ffffff', 'gloss');
  for (const p of [nose, tail, Rt, Lt]) b.ball(0.07, '#ffffff', 'gloss', { p }, true);
  b.shape(heart, 0.03, '#ffffff', 'sheet', { p: [0.55, Y + 0.28, 0.5], r: [Math.PI / 2, 0, 0.3], s: 0.4 }, 0.004);
  b.shape(star, 0.03, '#ffffff', 'sheet', { p: [-0.55, Y + 0.28, 0.5], r: [Math.PI / 2, 0, -0.3], s: 0.4 }, 0.004);
  // a long ribbon tail with bows
  let px = 0, py = tail[1], pz = tail[2];
  const cols = ['#ff4fa3', '#ffd23f', '#35d6ff', '#b65cff', '#ff8a1f', '#4cd964'];
  for (let i = 0; i < 6; i++) {
    const nx = Math.sin(i * 0.9) * 0.18, ny = py - 0.2, nz = pz - 0.32;
    b.line([px, py, pz], [nx, ny, nz], 0.012, '#ffffff', 'gloss');
    b.cone(0.1, 0.17, cols[i], 'gloss', { p: [nx - 0.09, ny, nz], r: [0, 0, Math.PI / 2] }, 8);
    b.cone(0.1, 0.17, cols[i], 'gloss', { p: [nx + 0.09, ny, nz], r: [0, 0, -Math.PI / 2] }, 8);
    px = nx; py = ny; pz = nz;
  }
  lines(b, [[[-0.22, 0.02, 0], [Lt[0] * 0.5, Lt[1] - 0.03, 0.0]], [[0.22, 0.02, 0], [Rt[0] * 0.5, Rt[1] - 0.03, 0.0]], [[-0.1, 0.02, 0], [0, nose[1] - 0.02, nose[2] - 0.3]], [[0.1, 0.02, 0], [0, tail[1], tail[2] + 0.3]]]);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.8) * 0.04;
    g.rotation.x = Math.sin(t * 1.3) * 0.025;
  });
}

// ── 10. Jelly Drift (jellyfish) ──────────────────────────────────────────────
function jellyfish(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#ff7ac0');
  const Y = 1.75;
  // tentacles: soft wavy ribbons hanging from the rim (solid), and the bell is the translucent layer
  const rand = rng(11);
  const cols = ['#7fe7ff', '#ff9ad7', '#ffe14d', '#c9a6ff'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, rr = 1.3;
    const x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
    const len = 0.9 + rand() * 0.55;
    let px = x0, py = Y, pz = z0;
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const nx = x0 * (1 - 0.35 * t) + Math.sin(k * 1.7 + i) * 0.1, ny = Y - len * t, nz = z0 * (1 - 0.35 * t) + Math.cos(k * 1.4 + i) * 0.1;
      b.line([px, py, pz], [nx, ny, nz], 0.04 - 0.007 * k, cols[i % cols.length], 'gloss');
      b.ball(0.05 - 0.007 * k, cols[i % cols.length], 'gloss', { p: [nx, ny, nz] }, true);
      px = nx; py = ny; pz = nz;
    }
  }
  for (const s of [-1, 1]) for (const z of [0.6, -0.6]) b.line([s * 0.22, 0.02, 0], [s * 0.9, Y - 0.05, z], 0.01, '#ffffff', 'gloss');
  b.torus(1.36, 0.075, '#ff7ac0', 'glow', { p: [0, Y + 0.02, 0], r: [Math.PI / 2, 0, 0] }); // glowing rim
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.3, rr = 0.25 + (i % 3) * 0.3;
    b.ball(0.07, '#ffffff', 'glow', { p: [Math.cos(a) * rr, Y + 0.9 - rr * 0.35, Math.sin(a) * rr] }, true); // glowing spots
  }
  b.layer('bell');
  const bell = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(bell, '#ff9ad7', 'glass', { p: [0, Y, 0], s: [1.42, 1.15, 1.42] });
  b.add(bell, '#fff0fa', 'wing', { p: [0, Y + 0.02, 0], s: [1.12, 0.9, 1.12] });
  bell.dispose();
  const g = b.build();
  return withTick(g, (t) => {
    g.scale.set(1 + Math.sin(t * 2.4) * 0.025, 1 - Math.sin(t * 2.4) * 0.03, 1 + Math.sin(t * 2.4) * 0.025);
    g.rotation.z = Math.sin(t * 1.5) * 0.03;
  });
}

// ── 11. Daisy Drift ──────────────────────────────────────────────────────────
function daisy(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#ffd23f');
  const Y = 2.1;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const L = 1.55;
    const dx = Math.cos(a), dz = Math.sin(a);
    // each petal: a fat ellipsoid lying along its ray, drooping a little, white with a pink tip
    const mid = 0.38 + L * 0.5;
    b.ball([0.24, 0.07, L * 0.5], i % 2 ? '#ffe3f1' : '#ffc4e2', 'gloss', { p: [dx * mid, Y - 0.04 + (i % 2) * 0.02, dz * mid], r: [0, -a + Math.PI / 2, 0] });
    b.ball([0.2, 0.06, 0.28], '#ff6fb4', 'gloss', { p: [dx * (0.38 + L * 0.9), Y - 0.1 + (i % 2) * 0.02, dz * (0.38 + L * 0.9)], r: [0, -a + Math.PI / 2, 0] }, true);
  }
  b.ball([0.55, 0.3, 0.55], '#ffcc22', 'gloss', { p: [0, Y - 0.12, 0] }); // the flower's golden eye (a dome seen from below)
  const rand = rng(5);
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.42;
    b.ball(0.035, '#e0901a', 'gloss', { p: [Math.cos(a) * r, Y - 0.38 + r * 0.2, Math.sin(a) * r] }, true);
  }
  for (const [x, z] of [[1.0, 0.7], [-1.0, 0.7], [1.0, -0.7], [-1.0, -0.7], [0.0, 1.1], [0.0, -1.1]] as [number, number][]) b.line([x > 0 ? 0.22 : x < 0 ? -0.22 : 0, 0.02, 0], [x, Y - 0.1, z], 0.008, '#ffffff', 'gloss');
  b.cyl(0.04, 0.04, Y - 0.35, '#2fae52', 'gloss', { p: [0, (Y - 0.35) / 2 + 0.1, 0] }, 8); // the stem you hold
  for (const s of [-1, 1]) b.ball([0.2, 0.03, 0.09], '#3ec04a', 'gloss', { p: [s * 0.2, 0.7, 0], r: [0, 0, s * -0.5] }, true); // leaves
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.y = Math.sin(t * 0.9) * 0.08;
    g.rotation.z = Math.sin(t * 1.4) * 0.025;
  });
}

// ── 12. Shooting Star ────────────────────────────────────────────────────────
function shootingstar(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#ffe53b');
  const Y = 2.05;
  // the big gold star lies flat (one point forward) …
  b.shape(star8, 0.16, '#ffd23f', 'gloss', { p: [0, Y, 0.1], r: [Math.PI / 2, 0, 0], s: 3.3 }, 0.05);
  b.shape(star8, 0.1, '#fff2a0', 'gloss', { p: [0, Y + 0.1, 0.1], r: [Math.PI / 2, 0, 0], s: 1.95 }, 0.04);
  b.shape(star8, 0.06, '#ffffff', 'glow', { p: [0, Y + 0.17, 0.1], r: [Math.PI / 2, 0, 0], s: 0.9 }, 0.02);
  // … with a sparkly comet tail
  const tail: [number, number, string][] = [[-1.9, 0.9, '#ffb3e6'], [-2.5, 0.65, '#a9e4ff'], [-3.0, 0.5, '#fff0a0'], [-3.5, 0.38, '#c9a6ff']];
  tail.forEach(([z, s, c], i) => {
    b.shape(star8, 0.06, c, 'glow', { p: [Math.sin(i * 1.3) * 0.25, Y - 0.05 - i * 0.04, z], r: [Math.PI / 2, 0, i * 0.4], s }, 0.015);
  });
  const rand = rng(21);
  for (let i = 0; i < 14; i++) b.ball(0.035 + rand() * 0.03, ['#ffffff', '#ffe14d', '#ff9ad7', '#7fe7ff'][i % 4], 'glow', { p: [(rand() - 0.5) * 0.9, Y - 0.1 + (rand() - 0.5) * 0.3, -1.6 - rand() * 2.2] }, true);
  lines(b, [[[-0.22, 0.02, 0], [-0.9, Y - 0.1, -0.6]], [[0.22, 0.02, 0], [0.9, Y - 0.1, -0.6]], [[-0.22, 0.02, 0], [-0.4, Y - 0.1, 0.8]], [[0.22, 0.02, 0], [0.4, Y - 0.1, 0.8]]]);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.7) * 0.04;
    g.position.y = Math.sin(t * 2.3) * 0.03;
  });
}

const BUILDERS: Record<GliderId, () => THREE.Group> = { starter, umbrella, balloons, butterfly, pizza, cloud, dragonfly, paperplane, kite, jellyfish, daisy, shootingstar };

/** Build a glider (origin = grip point, canopy above, nose +Z). Unknown ids fall back to the starter. */
export function makeGlider(id: string): THREE.Group {
  const f = BUILDERS[id as GliderId] ?? starter;
  const g = f();
  g.name = `glider:${id}`;
  return g;
}
