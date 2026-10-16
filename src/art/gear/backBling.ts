// ── v3 locker ── 16 original back blings (procedural; every one is at most 2 draw calls: one SOLID
// mesh + at most one moving / translucent layer — see gearKit.ts).
//
// Contract: `makeBackBling(id)` returns a THREE.Group whose ORIGIN is the upper-back mount
// (between the shoulder blades) and whose +Z points AWAY from the back (+Y up). The mounting code
// (character.setBackBling or `attachBackBling`) rotates it π about Y so +Z lands behind the player.
// Animated ones set `group.userData.tick = (t) => …` (optional — a static bling is fine).
import * as THREE from 'three';
import { GearBuilder, batWing, featherWing, heartShape, starShape, wingShape } from './gearKit';

export const BACK_BLING_IDS = [
  'minipack', 'bunny', 'butterfly', 'guitar', 'jetpack', 'boba',
  'skateboard', 'angel', 'balloon', 'catpack', 'rainbowcape', 'shell',
  'unicorn', 'dragonwings', 'lollipop', 'donut',
] as const;
export type BackBlingId = (typeof BACK_BLING_IDS)[number];

const star = starShape(5, 0.52);
const heart = heartShape();
const RAINBOW = ['#ff3b3b', '#ff8a1f', '#ffe53b', '#4cd964', '#35d6ff', '#4a6bff', '#b65cff'];

type Tick = (t: number) => void;
function withTick(g: THREE.Group, tick: Tick): THREE.Group {
  g.userData.tick = tick;
  return g;
}
/** Tiny deterministic random for sprinkles etc. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ── 1. Mini Pack ─────────────────────────────────────────────────────────────
function minipack(): THREE.Group {
  const b = new GearBuilder();
  b.box(0.32, 0.38, 0.14, '#ff4fa3', 'gloss', { p: [0, -0.17, 0.075] }, 0.055);
  b.box(0.33, 0.13, 0.15, '#ffd23f', 'gloss', { p: [0, -0.02, 0.075] }, 0.055); // top flap
  b.box(0.25, 0.17, 0.055, '#ff9fd0', 'gloss', { p: [0, -0.26, 0.155] }, 0.028); // pocket
  b.box(0.21, 0.014, 0.014, '#ffffff', 'matte', { p: [0, -0.2, 0.185] }, 0.005); // zip
  b.cyl(0.013, 0.013, 0.048, '#e8e8f4', 'metal', { p: [0.075, -0.2, 0.19], r: [Math.PI / 2, 0, 0] }, 8);
  b.torus(0.045, 0.011, '#2a1d5e', 'matte', { p: [0, 0.06, 0.075] }, Math.PI); // carry handle
  b.line([0.12, -0.34, 0.12], [0.13, -0.41, 0.13], 0.005, '#e8e8f4', 'metal');
  b.shape(star, 0.06, '#ffe53b', 'gloss', { p: [0.13, -0.45, 0.13], s: 0.09 }, 0.01); // keychain star
  b.box(0.034, 0.36, 0.014, '#2a1d5e', 'matte', { p: [-0.145, -0.17, 0.006] }, 0.004); // strap edges
  b.box(0.034, 0.36, 0.014, '#2a1d5e', 'matte', { p: [0.145, -0.17, 0.006] }, 0.004);
  return b.build();
}

// ── 2. Bunny Plush ───────────────────────────────────────────────────────────
function bunny(): THREE.Group {
  const b = new GearBuilder();
  const W = '#fff7fb', P = '#ffa6c9';
  b.ball([0.155, 0.175, 0.125], W, 'matte', { p: [0, -0.16, 0.1] });
  b.ball(0.125, W, 'matte', { p: [0, 0.05, 0.13] });
  for (const s of [-1, 1]) {
    b.ball([0.04, 0.17, 0.034], W, 'matte', { p: [s * 0.062, 0.25, 0.12], r: [0, 0, -s * 0.22] });
    b.ball([0.022, 0.13, 0.014], P, 'matte', { p: [s * 0.065, 0.25, 0.148], r: [0, 0, -s * 0.22] });
    b.ball(0.019, '#2a1d5e', 'gloss', { p: [s * 0.047, 0.075, 0.246] }, true);
    b.ball(0.006, '#ffffff', 'gloss', { p: [s * 0.043, 0.083, 0.262] }, true);
    b.ball([0.025, 0.018, 0.01], P, 'matte', { p: [s * 0.078, 0.035, 0.238] }, true); // cheeks
    b.ball([0.045, 0.095, 0.045], W, 'matte', { p: [s * 0.145, -0.04, 0.06], r: [0, 0, s * 0.5] }); // arms hugging
    b.ball([0.07, 0.044, 0.1], W, 'matte', { p: [s * 0.088, -0.31, 0.16] }); // feet
    b.ball([0.042, 0.027, 0.065], P, 'matte', { p: [s * 0.088, -0.318, 0.205] }, true);
  }
  b.ball([0.022, 0.015, 0.013], P, 'gloss', { p: [0, 0.052, 0.253] }, true); // nose
  b.cone(0.05, 0.075, '#ff3d8b', 'gloss', { p: [-0.042, -0.045, 0.205], r: [0, 0, Math.PI / 2] }, 10); // bow tie
  b.cone(0.05, 0.075, '#ff3d8b', 'gloss', { p: [0.042, -0.045, 0.205], r: [0, 0, -Math.PI / 2] }, 10);
  b.ball(0.018, '#ffe53b', 'gloss', { p: [0, -0.045, 0.21] }, true);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 2.2) * 0.04;
  });
}

// ── 3. Butterfly Wings ───────────────────────────────────────────────────────
function butterfly(): THREE.Group {
  const b = new GearBuilder();
  const up = wingShape(0.55, 0.44, 0.28, 0.4);
  const lo = wingShape(0.38, 0.29, 0.1, 0.2);
  b.layer('wings');
  for (const side of [1, -1]) {
    const q = side; // the left wing is rotated π about Y, so its layers stack the other way in local z
    b.within({ p: [side * 0.035, 0, 0.05], r: [0, side > 0 ? -0.5 : Math.PI + 0.5, 0] }, () => {
      b.shape(up, 0.014, '#6a2cff', 'gloss', { p: [0, 0.02, 0], r: [0, 0, 0.32] }, 0.005);
      b.shape(up, 0.014, '#ff4fa3', 'gloss', { p: [0.04, 0.022, 0.011 * q], r: [0, 0, 0.32], s: [0.8, 0.8, 1] }, 0.005);
      b.shape(up, 0.014, '#ffd23f', 'gloss', { p: [0.09, 0.026, 0.022 * q], r: [0, 0, 0.32], s: [0.5, 0.5, 1] }, 0.005);
      b.shape(lo, 0.014, '#6a2cff', 'gloss', { p: [0, -0.03, -0.005 * q], r: [0, 0, -0.62] }, 0.005);
      b.shape(lo, 0.014, '#35d6ff', 'gloss', { p: [0.035, -0.03, 0.006 * q], r: [0, 0, -0.62], s: [0.76, 0.76, 1] }, 0.005);
      b.ball([0.032, 0.032, 0.014], '#ffffff', 'gloss', { p: [0.37, 0.22, 0.03 * q] }, true);
      b.ball([0.025, 0.025, 0.014], '#ffffff', 'gloss', { p: [0.24, -0.22, 0.016 * q] }, true);
    });
  }
  b.layer('main');
  b.ball([0.024, 0.16, 0.024], '#2a1d5e', 'gloss', { p: [0, -0.04, 0.06] });
  b.ball(0.034, '#2a1d5e', 'gloss', { p: [0, 0.13, 0.06] }, true);
  b.line([0, 0.15, 0.06], [0.045, 0.26, 0.07], 0.005, '#2a1d5e');
  b.line([0, 0.15, 0.06], [-0.045, 0.26, 0.07], 0.005, '#2a1d5e');
  const g = b.build();
  const wings = b.mesh('wings')!;
  return withTick(g, (t) => {
    wings.scale.x = 1 - 0.34 * (0.5 + 0.5 * Math.sin(t * 4.4));
  });
}

// ── 4. Strum Buddy (guitar) ──────────────────────────────────────────────────
function guitar(): THREE.Group {
  const b = new GearBuilder();
  const BODY = '#10c9c0', WOOD = '#6a3b1d';
  b.within({ p: [0.06, -0.08, 0.1], r: [0, 0, -0.55] }, () => {
    b.ball([0.13, 0.155, 0.05], BODY, 'gloss', { p: [0, -0.36, 0] });
    b.ball([0.1, 0.115, 0.05], BODY, 'gloss', { p: [0, -0.19, 0] });
    b.cyl(0.044, 0.044, 0.014, '#1c1240', 'matte', { p: [0, -0.3, 0.047], r: [Math.PI / 2, 0, 0] }, 20);
    b.shape(heart, 0.012, '#ff5fa8', 'gloss', { p: [0.062, -0.42, 0.05], s: 0.09 }, 0.003); // heart pickguard
    b.box(0.1, 0.02, 0.018, '#f1e7d8', 'matte', { p: [0, -0.46, 0.05] }, 0.006); // bridge
    b.box(0.046, 0.5, 0.028, WOOD, 'gloss', { p: [0, 0.07, 0.004] }, 0.01);
    b.box(0.036, 0.46, 0.008, '#2a1608', 'matte', { p: [0, 0.07, 0.022] }, 0.003);
    b.box(0.066, 0.13, 0.026, WOOD, 'gloss', { p: [0, 0.37, 0.0], r: [-0.18, 0, 0] }, 0.012);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.ball(0.012, '#ffd23f', 'metal', { p: [s * 0.042, 0.34 + i * 0.036, 0.0] }, true);
    for (let i = 0; i < 6; i++) b.line([(i - 2.5) * 0.0055, -0.46, 0.06], [(i - 2.5) * 0.0045, 0.3, 0.034], 0.0017, '#f4f4ff', 'metal');
  });
  return b.build();
}

// ── 5. Tiny Jetpack ──────────────────────────────────────────────────────────
function jetpack(): THREE.Group {
  const b = new GearBuilder();
  for (const s of [-1, 1]) {
    b.cyl(0.068, 0.068, 0.3, '#e9ecf7', 'metal', { p: [s * 0.082, -0.17, 0.1] });
    b.ball([0.068, 0.048, 0.068], '#ff4fa3', 'gloss', { p: [s * 0.082, -0.015, 0.1] }, true);
    b.cyl(0.07, 0.07, 0.028, '#ffd23f', 'gloss', { p: [s * 0.082, -0.12, 0.1] });
    b.cyl(0.052, 0.065, 0.065, '#3a3a52', 'metal', { p: [s * 0.082, -0.35, 0.1] });
    b.cone(0.034, 0.07, '#ff4fa3', 'gloss', { p: [s * 0.14, -0.18, 0.06], r: [0, 0, -s * 0.9] }, 4); // fins
  }
  b.box(0.1, 0.07, 0.05, '#6a2cff', 'gloss', { p: [0, -0.1, 0.09] }, 0.02);
  b.box(0.27, 0.03, 0.03, '#3a3a52', 'metal', { p: [0, -0.04, 0.05] }, 0.01);
  b.ball(0.016, '#8cff3b', 'glow', { p: [0, -0.1, 0.125] }, true);
  // the flames are their own layer (both together, scaled about the nozzles)
  b.layer('flames');
  for (const s of [-1, 1]) {
    b.cone(0.05, 0.22, '#ff9a2e', 'glow', { p: [s * 0.082, -0.11, 0], r: [Math.PI, 0, 0] }, 12);
    b.cone(0.03, 0.15, '#fff6a8', 'glow', { p: [s * 0.082, -0.075, 0], r: [Math.PI, 0, 0] }, 12);
  }
  const g = b.build();
  const flames = b.mesh('flames')!;
  flames.position.set(0, -0.385, 0.1);
  return withTick(g, (t) => {
    flames.scale.set(1 + Math.sin(t * 31) * 0.1, 0.85 + Math.sin(t * 23) * 0.28, 1 + Math.sin(t * 29) * 0.1);
  });
}

// ── 6. Boba Buddy ────────────────────────────────────────────────────────────
function boba(): THREE.Group {
  const b = new GearBuilder();
  b.cyl(0.108, 0.08, 0.37, '#dff6ff', 'glass', { p: [0, -0.2, 0.13] }, 22);
  b.cyl(0.1, 0.077, 0.26, '#f0b88f', 'gloss', { p: [0, -0.265, 0.13] }, 22); // milk tea
  b.cyl(0.1, 0.1, 0.014, '#ffe0c8', 'gloss', { p: [0, -0.14, 0.13] }, 22);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = 0.05 * Math.sqrt(((i % 6) + 1) / 6);
    b.ball(0.021, '#241325', 'gloss', { p: [Math.cos(a) * r, -0.35 + Math.floor(i / 6) * 0.038, 0.13 + Math.sin(a) * r] }, true);
  }
  b.cyl(0.113, 0.113, 0.03, '#ffffff', 'gloss', { p: [0, -0.015, 0.13] }, 22);
  b.ball([0.103, 0.042, 0.103], '#ffffff', 'gloss', { p: [0, -0.005, 0.13] }, true);
  b.cyl(0.018, 0.018, 0.36, '#ff4fa3', 'gloss', { p: [0.03, 0.12, 0.13], r: [0, 0, -0.18] }, 10); // fat straw
  b.cyl(0.085, 0.079, 0.11, '#ffd23f', 'matte', { p: [0, -0.26, 0.13] }, 22); // sleeve
  b.shape(heart, 0.012, '#ff4fa3', 'matte', { p: [0, -0.26, 0.205], s: 0.055 }, 0.002);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 2.6) * 0.035;
  });
}

// ── 7. Deck Back (skateboard) ────────────────────────────────────────────────
function skateboard(): THREE.Group {
  const b = new GearBuilder();
  b.within({ p: [-0.03, -0.2, 0], r: [0, 0, 0.3] }, () => {
    b.box(0.21, 0.74, 0.024, '#ff3d8b', 'gloss', { p: [0, 0, 0.03] }, 0.011);
    b.box(0.21, 0.052, 0.028, '#35d6ff', 'gloss', { p: [0, -0.2, 0.031] }, 0.005); // stripes
    b.box(0.21, 0.052, 0.028, '#35d6ff', 'gloss', { p: [0, 0.2, 0.031] }, 0.005);
    b.shape(star, 0.012, '#ffe53b', 'gloss', { p: [0, 0, 0.046], s: 0.16 }, 0.003);
    for (const y of [-0.25, 0.25]) {
      b.box(0.17, 0.032, 0.026, '#c9ceea', 'metal', { p: [0, y, 0.056] }, 0.008); // trucks
      for (const x of [-0.1, 0.1]) b.cyl(0.04, 0.04, 0.034, '#ffe53b', 'gloss', { p: [x, y, 0.072], r: [0, 0, Math.PI / 2] }, 16);
    }
  });
  return b.build();
}

// ── 8. Halo Wings (angel) ────────────────────────────────────────────────────
function angel(): THREE.Group {
  const b = new GearBuilder();
  const L = 0.78, H = 0.62;
  const outer = featherWing(L, H, 6), mid = featherWing(L * 0.8, H * 0.7, 5), inner = featherWing(L * 0.56, H * 0.46, 4);
  b.layer('wings');
  for (const side of [1, -1]) {
    const q = side;
    b.within({ p: [side * 0.04, 0.02, 0.05], r: [0, side > 0 ? -0.3 : Math.PI + 0.3, 0] }, () => {
      b.shape(outer, 0.034, '#ffffff', 'gloss', { r: [0, 0, 0.42] }, 0.009);
      b.shape(mid, 0.034, '#fff0cf', 'gloss', { p: [0.02, -0.03, 0.026 * q], r: [0, 0, 0.38] }, 0.009);
      b.shape(inner, 0.034, '#e6dcff', 'gloss', { p: [0.02, -0.06, 0.052 * q], r: [0, 0, 0.34] }, 0.009);
      b.ball(0.034, '#ffe36a', 'metal', { p: [0.02, 0.0, 0.06 * q] }, true); // golden shoulder clasp
    });
  }
  b.layer('main');
  b.torus(0.115, 0.018, '#ffe36a', 'glow', { p: [0, 0.6, 0.15], r: [Math.PI / 2 + 0.12, 0, 0] }); // halo
  b.ball(0.05, '#ffffff', 'gloss', { p: [0, 0.02, 0.06] }, true);
  const g = b.build();
  const wings = b.mesh('wings')!;
  const main = b.mesh('main')!;
  return withTick(g, (t) => {
    wings.scale.x = 1 - 0.3 * (0.5 + 0.5 * Math.sin(t * 2.4));
    main.position.y = Math.sin(t * 2.4) * 0.014;
  });
}

// ── 9. Star Balloon ──────────────────────────────────────────────────────────
function balloon(): THREE.Group {
  const b = new GearBuilder();
  b.line([0, -0.02, 0.03], [0.02, 0.2, 0.1], 0.005, '#ffffff');
  b.line([0.02, 0.2, 0.1], [0.04, 0.42, 0.15], 0.005, '#ffffff');
  b.ball(0.03, '#ffd23f', 'gloss', { p: [0, -0.02, 0.03] }, true);
  b.layer('star');
  b.shape(star, 0.5, '#ffe53b', 'gloss', { s: 0.58 }, 0.14);
  b.shape(star, 0.5, '#fff4a0', 'gloss', { p: [0, 0.03, 0.17], s: 0.3 }, 0.1); // a lighter face
  b.cone(0.024, 0.055, '#ff4fa3', 'gloss', { p: [0, -0.22, 0], r: [Math.PI, 0, 0] }, 8);
  const g = b.build();
  const sg = b.mesh('star')!;
  sg.position.set(0.05, 0.68, 0.18);
  return withTick(g, (t) => {
    sg.rotation.z = Math.sin(t * 1.7) * 0.12;
    sg.rotation.y = Math.sin(t * 1.1) * 0.25;
    sg.position.y = 0.68 + Math.sin(t * 2.1) * 0.015;
  });
}

// ── 10. Cat Pack ─────────────────────────────────────────────────────────────
function catpack(): THREE.Group {
  const b = new GearBuilder();
  const O = '#ff9d3d', D = '#e07418', C = '#fff0d6', PK = '#ff7aa8', K = '#2a1d5e';
  b.ball([0.18, 0.18, 0.115], O, 'matte', { p: [0, -0.17, 0.09] });
  for (const s of [-1, 1]) {
    b.cone(0.075, 0.14, O, 'matte', { p: [s * 0.105, 0.0, 0.08], r: [0, 0, -s * 0.28] }, 4);
    b.cone(0.043, 0.09, PK, 'matte', { p: [s * 0.105, -0.005, 0.108], r: [0, 0, -s * 0.28] }, 4);
    b.ball([0.03, 0.04, 0.013], K, 'gloss', { p: [s * 0.078, -0.13, 0.19] }, true);
    b.ball(0.009, '#ffffff', 'glow', { p: [s * 0.083, -0.117, 0.2] }, true);
    for (let i = 0; i < 3; i++) b.line([s * 0.07, -0.205 - (i - 1) * 0.02, 0.195], [s * 0.21, -0.205 - (i - 1) * 0.048, 0.175], 0.003, '#ffffff', 'matte');
    b.ball([0.048, 0.064, 0.042], C, 'matte', { p: [s * 0.105, -0.335, 0.135] }, true); // paws
    b.box(0.016, 0.054, 0.016, D, 'matte', { p: [s * 0.042, -0.07, 0.195], r: [0.25, 0, s * 0.15] }, 0.005); // forehead stripes
  }
  b.box(0.016, 0.064, 0.016, D, 'matte', { p: [0, -0.065, 0.195], r: [0.25, 0, 0] }, 0.005);
  b.ball([0.08, 0.055, 0.037], C, 'matte', { p: [0, -0.205, 0.175] });
  b.ball([0.022, 0.015, 0.013], PK, 'gloss', { p: [0, -0.18, 0.205] }, true);
  const tail: [number, number, number][] = [[0.14, -0.3, 0.06], [0.205, -0.26, 0.05], [0.24, -0.19, 0.05], [0.23, -0.11, 0.05], [0.195, -0.06, 0.055]];
  tail.forEach((p, i) => b.ball(0.037 - i * 0.003, i === tail.length - 1 ? D : O, 'matte', { p }, true));
  return b.build();
}

// ── 11. Rainbow Cape-Pack ────────────────────────────────────────────────────
function capeStrip(i: number): THREE.BufferGeometry {
  const rows = 12, w = 0.056, len = 0.9;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const flare = 1 + t * 0.55;
    const y = -0.01 - t * len;
    const z = 0.035 + 0.2 * Math.pow(t, 1.35) + Math.sin(t * 6 + i * 0.8) * 0.012 * t;
    for (const c of [0, 1]) {
      const x = ((i - 3) * w + (c - 0.5) * w) * flare;
      pos.push(x, y, z + Math.abs(x) * 0.25);
    }
  }
  for (let r = 0; r < rows; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function rainbowcape(): THREE.Group {
  const b = new GearBuilder();
  RAINBOW.forEach((c, i) => {
    const g = capeStrip(i);
    b.add(g, c, 'sheet');
    g.dispose();
  });
  b.box(0.42, 0.055, 0.065, '#ffd23f', 'gloss', { p: [0, 0.0, 0.042] }, 0.022); // collar band
  b.shape(star, 0.05, '#fff6a8', 'gloss', { p: [0, -0.005, 0.088], s: 0.12 }, 0.01);
  b.ball(0.015, '#ff3d8b', 'glow', { p: [0, -0.005, 0.108] }, true);
  return b.build();
}

// ── 12. Shell Pack ───────────────────────────────────────────────────────────
// A big, chunky scallop: a fan of fat ridges spreading up from a hinge at the small of the back,
// a scalloped rim of pearls, little hinge ears and a glowing pearl in front.
function shell(): THREE.Group {
  const b = new GearBuilder();
  const HX = 0, HY = -0.4, HZ = 0.09;
  const n = 11;
  const ridgeCols = ['#ff9ec9', '#ffd0e6', '#ff8fc0', '#ffe3f0', '#ff9ec9', '#ffd0e6'];
  b.ball([0.2, 0.3, 0.07], '#ffcfe5', 'gloss', { p: [HX, HY + 0.2, HZ - 0.01] }); // fill behind the ridges
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5; // -0.5 … 0.5
    const a = k * 1.9; // fan angle (rad) from straight up
    const len = 0.52 - Math.abs(k) * 0.12;
    const c = ridgeCols[i % ridgeCols.length];
    const cx = HX + Math.sin(a) * len * 0.5, cy = HY + Math.cos(a) * len * 0.5;
    b.ball([0.062, len * 0.5, 0.052], c, 'gloss', { p: [cx, cy, HZ + 0.015 - Math.abs(k) * 0.05], r: [0, 0, -a] });
    b.ball(0.036, '#ffffff', 'gloss', { p: [HX + Math.sin(a) * len * 0.97, HY + Math.cos(a) * len * 0.97, HZ + 0.015 - Math.abs(k) * 0.05] }, true); // rim pearl
  }
  for (const s of [-1, 1]) b.ball([0.085, 0.05, 0.06], '#ffd0e4', 'gloss', { p: [s * 0.1, HY + 0.005, HZ + 0.025], r: [0, 0, s * 0.45] }, true); // hinge ears
  b.ball([0.13, 0.07, 0.085], '#ffc2dc', 'gloss', { p: [HX, HY - 0.005, HZ + 0.02] }, true);
  b.ball(0.062, '#ffffff', 'gloss', { p: [0, HY + 0.03, HZ + 0.1] }); // pearl
  b.ball([0.018, 0.012, 0.008], '#d6eeff', 'glow', { p: [-0.02, HY + 0.05, HZ + 0.158] }, true);
  b.ball(0.014, '#ff5fa8', 'gloss', { p: [0.045, HY + 0.012, HZ + 0.115] }, true);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.6) * 0.025;
  });
}

// ── 13. Unicorn Plush ────────────────────────────────────────────────────────
function unicorn(): THREE.Group {
  const b = new GearBuilder();
  const W = '#fff6ff', PK = '#ffa6d6', GOLD = '#ffd23f';
  b.ball([0.155, 0.175, 0.125], W, 'matte', { p: [0, -0.16, 0.1] });
  b.ball(0.128, W, 'matte', { p: [0, 0.05, 0.13] });
  b.shape(heart, 0.02, PK, 'gloss', { p: [0, -0.16, 0.222], s: 0.1 }, 0.004); // heart on the tummy
  for (const s of [-1, 1]) {
    b.cone(0.042, 0.1, W, 'matte', { p: [s * 0.082, 0.185, 0.12], r: [0, 0, -s * 0.3] }, 6);
    b.cone(0.024, 0.065, PK, 'matte', { p: [s * 0.083, 0.185, 0.14], r: [0, 0, -s * 0.3] }, 6);
    b.ball([0.022, 0.026, 0.012], '#2a1d5e', 'gloss', { p: [s * 0.05, 0.07, 0.247] }, true);
    b.ball(0.007, '#ffffff', 'gloss', { p: [s * 0.045, 0.08, 0.26] }, true);
    b.ball([0.027, 0.019, 0.01], PK, 'matte', { p: [s * 0.083, 0.03, 0.238] }, true); // cheeks
    b.ball([0.045, 0.095, 0.045], W, 'matte', { p: [s * 0.145, -0.04, 0.06], r: [0, 0, s * 0.5] }); // arms
    b.ball([0.07, 0.044, 0.1], W, 'matte', { p: [s * 0.088, -0.31, 0.16] }); // feet
    b.ball([0.042, 0.027, 0.065], GOLD, 'metal', { p: [s * 0.088, -0.318, 0.205] }, true); // golden hooves
  }
  b.ball([0.02, 0.014, 0.012], PK, 'gloss', { p: [0, 0.03, 0.255] }, true); // nose
  // the horn: a gold spiral cone
  b.cone(0.036, 0.2, GOLD, 'metal', { p: [0, 0.255, 0.215], r: [0.28, 0, 0] }, 12);
  for (let i = 0; i < 3; i++) b.torus(0.03 - i * 0.007, 0.007, '#ff7ac0', 'gloss', { p: [0, 0.2 + i * 0.05, 0.2 + i * 0.015], r: [0.28 + Math.PI / 2, 0, 0] });
  // rainbow mane down one side + a rainbow tail
  const mane: [number, number, number][] = [[0.105, 0.15, 0.1], [0.13, 0.085, 0.085], [0.138, 0.015, 0.08], [0.128, -0.055, 0.08], [0.11, -0.12, 0.085], [0.09, -0.18, 0.09]];
  mane.forEach((p, i) => b.ball(0.04, RAINBOW[(i * 5 + 1) % 7], 'gloss', { p }, true));
  const tail: [number, number, number][] = [[-0.15, -0.26, 0.06], [-0.2, -0.3, 0.05], [-0.235, -0.25, 0.05], [-0.23, -0.18, 0.05], [-0.2, -0.13, 0.055]];
  tail.forEach((p, i) => b.ball(0.036 - i * 0.002, RAINBOW[(i * 2 + 3) % 7], 'gloss', { p }, true));
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 2.0) * 0.045;
  });
}

// ── 14. Dragon Wings ─────────────────────────────────────────────────────────
function dragonwings(): THREE.Group {
  const b = new GearBuilder();
  const { shape, tips, knuckle } = batWing(0.7, 0.62);
  b.layer('wings');
  for (const side of [1, -1]) {
    const q = side;
    b.within({ p: [side * 0.04, 0.02, 0.05], r: [0, side > 0 ? -0.38 : Math.PI + 0.38, 0] }, () => {
      b.within({ r: [0, 0, 0.14] }, () => {
        b.shape(shape, 0.024, '#8a3dff', 'gloss', {}, 0.007);
        b.shape(shape, 0.024, '#d2a0ff', 'gloss', { p: [0.05, -0.03, 0.018 * q], s: [0.7, 0.68, 1] }, 0.007);
        for (const t of tips) {
          b.line([knuckle[0], knuckle[1], 0.022 * q], [t[0], t[1], 0.022 * q], 0.014, '#19d3c5', 'gloss');
          b.cone(0.024, 0.07, '#ffd23f', 'gloss', { p: [t[0], t[1], 0.022 * q], r: [0, 0, Math.atan2(t[1] - knuckle[1], t[0] - knuckle[0]) - Math.PI / 2] }, 6); // claws
        }
        b.line([0, 0, 0.022 * q], [knuckle[0], knuckle[1], 0.022 * q], 0.018, '#19d3c5', 'gloss');
        b.ball(0.034, '#19d3c5', 'gloss', { p: [knuckle[0], knuckle[1], 0.022 * q] }, true);
      });
    });
  }
  b.layer('main');
  // a ridge of golden spikes down the spine and a pink heart gem
  for (let i = 0; i < 5; i++) b.cone(0.034 - i * 0.003, 0.09 - i * 0.008, '#ffd23f', 'gloss', { p: [0, 0.13 - i * 0.085, 0.09 + i * 0.002], r: [-0.5, 0, 0] }, 6);
  b.shape(heart, 0.03, '#ff4fa3', 'gloss', { p: [0, -0.02, 0.105], s: 0.1 }, 0.005);
  const g = b.build();
  const wings = b.mesh('wings')!;
  return withTick(g, (t) => {
    wings.scale.x = 1 - 0.32 * (0.5 + 0.5 * Math.sin(t * 3.4));
  });
}

// ── 15. Swirl Lollipop ───────────────────────────────────────────────────────
function lollipop(): THREE.Group {
  const b = new GearBuilder();
  b.within({ p: [0.05, -0.05, 0.1], r: [0, 0, -0.5] }, () => {
    b.cyl(0.21, 0.21, 0.06, '#ff5fa8', 'gloss', { p: [0, 0.22, 0], r: [Math.PI / 2, 0, 0] }, 32);
    const rings: [number, string][] = [[0.175, '#ffffff'], [0.135, '#ff3d8b'], [0.095, '#ffffff'], [0.055, '#35d6ff']];
    for (const [R, c] of rings) b.torus(R, 0.026, c, 'gloss', { p: [0, 0.22, 0.035] });
    b.ball(0.034, '#ffe53b', 'gloss', { p: [0, 0.22, 0.04] }, true);
    b.cyl(0.02, 0.02, 0.62, '#ffffff', 'gloss', { p: [0, -0.12, 0] }, 12);
    b.cone(0.058, 0.1, '#4a6bff', 'gloss', { p: [-0.06, -0.01, 0.005], r: [0, 0, Math.PI / 2] }, 10); // bow
    b.cone(0.058, 0.1, '#4a6bff', 'gloss', { p: [0.06, -0.01, 0.005], r: [0, 0, -Math.PI / 2] }, 10);
    b.ball(0.026, '#ffe53b', 'gloss', { p: [0, -0.01, 0.01] }, true);
    b.line([0.02, -0.03, 0], [0.07, -0.13, 0.02], 0.008, '#4a6bff', 'gloss');
    b.line([-0.02, -0.03, 0], [-0.07, -0.13, 0.02], 0.008, '#4a6bff', 'gloss');
  });
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 2.1) * 0.03;
  });
}

// ── 16. Donut Float ──────────────────────────────────────────────────────────
function donut(): THREE.Group {
  const b = new GearBuilder();
  const R = 0.2, r = 0.085;
  b.within({ p: [0, -0.1, 0.12] }, () => {
    b.torus(R, r, '#e9a455', 'matte', {}); // dough
    b.torus(R, r * 0.95, '#ff74b0', 'gloss', { p: [0, 0, 0.026] }); // icing, sitting proud of the dough on the front face
    const rand = rng(7);
    const cols = ['#ffffff', '#ffe53b', '#35d6ff', '#7cff6b', '#b65cff', '#ff3b3b'];
    for (let i = 0; i < 30; i++) {
      const u = rand() * Math.PI * 2, v = (rand() - 0.5) * 1.5;
      const rr = R + r * 0.9 * Math.cos(v);
      b.cyl(0.0055, 0.0055, 0.034, cols[i % cols.length], 'gloss', { p: [Math.cos(u) * rr, Math.sin(u) * rr, 0.026 + r * 0.95 * Math.sin(v) * 0.9 + 0.006], r: [rand() * 3, rand() * 3, rand() * 3] }, 6);
    }
    b.ball([0.05, 0.016, 0.01], '#ffffff', 'glow', { p: [-0.115, 0.145, 0.108], r: [0, 0, -0.9] }, true); // shine
  });
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.4) * 0.05;
  });
}

const BUILDERS: Record<BackBlingId, () => THREE.Group> = {
  minipack, bunny, butterfly, guitar, jetpack, boba, skateboard, angel, balloon, catpack, rainbowcape, shell,
  unicorn, dragonwings, lollipop, donut,
};

/** Build a back bling (origin = upper-back mount, +Z away from the back). Unknown ids return an empty group. */
export function makeBackBling(id: string): THREE.Group {
  const f = BUILDERS[id as BackBlingId];
  const g = f ? f() : new THREE.Group();
  g.name = `backbling:${id}`;
  return g;
}
