// ── v3 locker ── 12 original back blings (procedural, cheap: 1–4 draw calls each).
//
// Contract: `makeBackBling(id)` returns a THREE.Group whose ORIGIN is the upper-back mount
// (between the shoulder blades) and whose +Z points AWAY from the back (+Y up). The mounting code
// (character.setBackBling or `attachBackBling`) rotates it π about Y so +Z lands behind the player.
// Animated ones set `group.userData.tick = (t) => …` (optional — a static bling is fine).
import * as THREE from 'three';
import { GearBuilder, heartShape, starShape, wingShape } from './gearKit';

export const BACK_BLING_IDS = [
  'minipack', 'bunny', 'butterfly', 'guitar', 'jetpack', 'boba',
  'skateboard', 'angel', 'balloon', 'catpack', 'rainbowcape', 'shell',
] as const;
export type BackBlingId = (typeof BACK_BLING_IDS)[number];

const S2 = Math.SQRT2;
const star = starShape(5, 0.52);
const heart = heartShape();

type Tick = (t: number) => void;
function withTick(g: THREE.Group, tick: Tick): THREE.Group {
  g.userData.tick = tick;
  return g;
}

// ── 1. Mini Pack ─────────────────────────────────────────────────────────────
function minipack(): THREE.Group {
  const b = new GearBuilder();
  b.box(0.3, 0.36, 0.13, '#ff4fa3', 'gloss', { p: [0, -0.17, 0.07] }, 0.05);
  b.box(0.31, 0.12, 0.14, '#ffd23f', 'gloss', { p: [0, -0.02, 0.07] }, 0.05); // top flap
  b.box(0.23, 0.16, 0.05, '#ff9fd0', 'gloss', { p: [0, -0.26, 0.145] }, 0.025); // pocket
  b.box(0.2, 0.012, 0.012, '#ffffff', 'matte', { p: [0, -0.2, 0.173] }, 0.005); // zip
  b.cyl(0.012, 0.012, 0.045, '#e8e8f4', 'metal', { p: [0.075, -0.2, 0.18], r: [Math.PI / 2, 0, 0] }, 8);
  b.torus(0.04, 0.009, '#2a1d5e', 'matte', { p: [0, 0.055, 0.07], r: [0, 0, 0] }, Math.PI); // carry handle
  b.line([0.12, -0.33, 0.12], [0.13, -0.4, 0.13], 0.004, '#e8e8f4', 'metal');
  b.shape(star, 0.06, '#ffe53b', 'gloss', { p: [0.13, -0.43, 0.13], s: 0.075 }, 0.01); // keychain star
  b.box(0.032, 0.34, 0.012, '#2a1d5e', 'matte', { p: [-0.14, -0.17, 0.006] }, 0.004); // strap edges
  b.box(0.032, 0.34, 0.012, '#2a1d5e', 'matte', { p: [0.14, -0.17, 0.006] }, 0.004);
  return b.build();
}

// ── 2. Bunny Plush ───────────────────────────────────────────────────────────
function bunny(): THREE.Group {
  const b = new GearBuilder();
  const W = '#fff7fb', P = '#ffa6c9';
  b.ball([0.15, 0.17, 0.12], W, 'matte', { p: [0, -0.16, 0.1] });
  b.ball(0.12, W, 'matte', { p: [0, 0.05, 0.13] });
  for (const s of [-1, 1]) {
    b.ball([0.036, 0.16, 0.03], W, 'matte', { p: [s * 0.06, 0.24, 0.12], r: [0, 0, -s * 0.22] });
    b.ball([0.02, 0.12, 0.012], P, 'matte', { p: [s * 0.063, 0.24, 0.145], r: [0, 0, -s * 0.22] });
    b.ball(0.016, '#2a1d5e', 'gloss', { p: [s * 0.045, 0.075, 0.243] }, true);
    b.ball([0.022, 0.016, 0.01], P, 'matte', { p: [s * 0.075, 0.035, 0.235] }, true); // cheeks
    b.ball([0.042, 0.09, 0.042], W, 'matte', { p: [s * 0.14, -0.04, 0.06], r: [0, 0, s * 0.5] }); // arms hugging
    b.ball([0.065, 0.04, 0.095], W, 'matte', { p: [s * 0.085, -0.31, 0.16] }); // feet
    b.ball([0.04, 0.025, 0.06], P, 'matte', { p: [s * 0.085, -0.318, 0.2] }, true);
  }
  b.ball([0.02, 0.014, 0.012], P, 'gloss', { p: [0, 0.052, 0.25] }, true); // nose
  // bow tie
  b.cone(0.045, 0.07, '#ff3d8b', 'gloss', { p: [-0.04, -0.045, 0.2], r: [0, 0, Math.PI / 2] }, 10);
  b.cone(0.045, 0.07, '#ff3d8b', 'gloss', { p: [0.04, -0.045, 0.2], r: [0, 0, -Math.PI / 2] }, 10);
  b.ball(0.016, '#ffe53b', 'gloss', { p: [0, -0.045, 0.205] }, true);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 2.2) * 0.04;
  });
}

// ── 3. Butterfly Wings ───────────────────────────────────────────────────────
function butterfly(): THREE.Group {
  const root = new THREE.Group();
  const up = wingShape(0.5, 0.4, 0.28, 0.4);
  const lo = wingShape(0.34, 0.26, 0.1, 0.2);
  const pivots: { g: THREE.Group; side: number }[] = [];
  for (const side of [1, -1]) {
    const b = new GearBuilder();
    b.shape(up, 0.012, '#6a2cff', 'sheet', { p: [0, 0.02, 0], r: [0, 0, 0.32] }, 0.004);
    b.shape(up, 0.012, '#ff4fa3', 'sheet', { p: [0.035, 0.022, 0.009], r: [0, 0, 0.32], s: [0.8, 0.8, 1] }, 0.004);
    b.shape(up, 0.012, '#ffd23f', 'sheet', { p: [0.08, 0.026, 0.018], r: [0, 0, 0.32], s: [0.5, 0.5, 1] }, 0.004);
    b.shape(lo, 0.012, '#6a2cff', 'sheet', { p: [0, -0.03, -0.004], r: [0, 0, -0.62] }, 0.004);
    b.shape(lo, 0.012, '#35d6ff', 'sheet', { p: [0.03, -0.03, 0.005], r: [0, 0, -0.62], s: [0.76, 0.76, 1] }, 0.004);
    b.ball([0.028, 0.028, 0.012], '#ffffff', 'matte', { p: [0.34, 0.2, 0.026] }, true);
    b.ball([0.022, 0.022, 0.012], '#ffffff', 'matte', { p: [0.22, -0.2, 0.014] }, true);
    const w = b.build();
    const piv = new THREE.Group();
    piv.add(w);
    piv.position.set(side * 0.035, 0.0, 0.05);
    piv.rotation.y = side > 0 ? -0.5 : Math.PI + 0.5;
    root.add(piv);
    pivots.push({ g: piv, side });
  }
  const body = new GearBuilder();
  body.ball([0.022, 0.15, 0.022], '#2a1d5e', 'gloss', { p: [0, -0.04, 0.06] });
  body.ball(0.03, '#2a1d5e', 'gloss', { p: [0, 0.12, 0.06] }, true);
  body.line([0, 0.14, 0.06], [0.04, 0.24, 0.07], 0.004, '#2a1d5e');
  body.line([0, 0.14, 0.06], [-0.04, 0.24, 0.07], 0.004, '#2a1d5e');
  root.add(body.build());
  return withTick(root, (t) => {
    const f = Math.sin(t * 4.2) * 0.2;
    for (const p of pivots) p.g.rotation.y = p.side > 0 ? -0.5 + f : Math.PI + 0.5 - f;
  });
}

// ── 4. Strum Buddy (guitar) ──────────────────────────────────────────────────
function guitar(): THREE.Group {
  const b = new GearBuilder();
  const BODY = '#10c9c0', WOOD = '#6a3b1d';
  b.ball([0.125, 0.15, 0.045], BODY, 'gloss', { p: [0, -0.36, 0] });
  b.ball([0.095, 0.11, 0.045], BODY, 'gloss', { p: [0, -0.19, 0] });
  b.cyl(0.042, 0.042, 0.012, '#1c1240', 'matte', { p: [0, -0.3, 0.043], r: [Math.PI / 2, 0, 0] }, 20);
  b.shape(heart, 0.012, '#ff5fa8', 'gloss', { p: [0.06, -0.42, 0.045], s: 0.085 }, 0.003); // heart pickguard
  b.box(0.1, 0.02, 0.018, '#f1e7d8', 'matte', { p: [0, -0.46, 0.046] }, 0.006); // bridge
  b.box(0.042, 0.5, 0.026, WOOD, 'gloss', { p: [0, 0.07, 0.004] }, 0.01);
  b.box(0.034, 0.46, 0.008, '#2a1608', 'matte', { p: [0, 0.07, 0.02] }, 0.003);
  b.box(0.06, 0.12, 0.024, WOOD, 'gloss', { p: [0, 0.37, 0.0], r: [-0.18, 0, 0] }, 0.012);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.ball(0.011, '#ffd23f', 'metal', { p: [s * 0.04, 0.34 + i * 0.034, 0.0] }, true);
  for (let i = 0; i < 6; i++) b.line([(i - 2.5) * 0.0055, -0.46, 0.055], [(i - 2.5) * 0.0045, 0.3, 0.03], 0.0015, '#f4f4ff', 'metal');
  const g = b.build();
  const w = new THREE.Group();
  g.position.set(0, 0.0, 0.1);
  w.add(g);
  w.rotation.z = -0.55;
  w.position.set(0.06, -0.08, 0);
  return w;
}

// ── 5. Tiny Jetpack ──────────────────────────────────────────────────────────
function jetpack(): THREE.Group {
  const root = new THREE.Group();
  const b = new GearBuilder();
  for (const s of [-1, 1]) {
    b.cyl(0.065, 0.065, 0.3, '#e9ecf7', 'metal', { p: [s * 0.08, -0.17, 0.1] });
    b.ball([0.065, 0.045, 0.065], '#ff4fa3', 'gloss', { p: [s * 0.08, -0.015, 0.1] }, true);
    b.cyl(0.067, 0.067, 0.025, '#ffd23f', 'gloss', { p: [s * 0.08, -0.12, 0.1] });
    b.cyl(0.05, 0.062, 0.06, '#3a3a52', 'metal', { p: [s * 0.08, -0.35, 0.1] });
    b.cone(0.03, 0.06, '#ff4fa3', 'gloss', { p: [s * 0.135, -0.18, 0.06], r: [0, 0, -s * 0.9] }, 4); // fins
  }
  b.box(0.1, 0.07, 0.05, '#6a2cff', 'gloss', { p: [0, -0.1, 0.09] }, 0.02);
  b.box(0.26, 0.03, 0.03, '#3a3a52', 'metal', { p: [0, -0.04, 0.05] }, 0.01);
  b.ball(0.014, '#8cff3b', 'glow', { p: [0, -0.1, 0.12] }, true);
  root.add(b.build());
  const flames: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const f = new GearBuilder();
    f.cone(0.045, 0.2, '#ff9a2e', 'glow', { p: [0, -0.1, 0], r: [Math.PI, 0, 0] }, 12);
    f.cone(0.028, 0.14, '#fff6a8', 'glow', { p: [0, -0.07, 0], r: [Math.PI, 0, 0] }, 12);
    const g = f.build();
    g.position.set(s * 0.08, -0.38, 0.1);
    root.add(g);
    flames.push(g);
  }
  return withTick(root, (t) => {
    flames.forEach((f, i) => {
      f.scale.set(1 + Math.sin(t * 31 + i) * 0.1, 0.85 + Math.sin(t * 23 + i * 2) * 0.25, 1 + Math.sin(t * 29 + i) * 0.1);
    });
  });
}

// ── 6. Boba Buddy ────────────────────────────────────────────────────────────
function boba(): THREE.Group {
  const b = new GearBuilder();
  b.cyl(0.105, 0.078, 0.36, '#dff6ff', 'glass', { p: [0, -0.2, 0.13] }, 22);
  b.cyl(0.098, 0.075, 0.25, '#f0b88f', 'gloss', { p: [0, -0.265, 0.13] }, 22); // milk tea
  b.cyl(0.098, 0.098, 0.014, '#ffe0c8', 'gloss', { p: [0, -0.14, 0.13] }, 22);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = 0.05 * Math.sqrt(((i % 6) + 1) / 6);
    b.ball(0.02, '#241325', 'gloss', { p: [Math.cos(a) * r, -0.35 + Math.floor(i / 6) * 0.036, 0.13 + Math.sin(a) * r] }, true);
  }
  b.cyl(0.11, 0.11, 0.03, '#ffffff', 'gloss', { p: [0, -0.015, 0.13] }, 22);
  b.ball([0.1, 0.04, 0.1], '#ffffff', 'gloss', { p: [0, -0.005, 0.13] }, true);
  b.cyl(0.016, 0.016, 0.34, '#ff4fa3', 'gloss', { p: [0.03, 0.12, 0.13], r: [0, 0, -0.18] }, 10); // fat straw
  b.cyl(0.082, 0.077, 0.1, '#ffd23f', 'matte', { p: [0, -0.26, 0.13] }, 22); // sleeve
  b.shape(heart, 0.012, '#ff4fa3', 'matte', { p: [0, -0.26, 0.2], s: 0.05 }, 0.002);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 2.6) * 0.035;
  });
}

// ── 7. Deck Back (skateboard) ────────────────────────────────────────────────
function skateboard(): THREE.Group {
  const b = new GearBuilder();
  b.box(0.2, 0.72, 0.022, '#ff3d8b', 'gloss', { p: [0, 0, 0.03] }, 0.01);
  b.box(0.2, 0.05, 0.026, '#35d6ff', 'gloss', { p: [0, -0.2, 0.031] }, 0.005); // stripes
  b.box(0.2, 0.05, 0.026, '#35d6ff', 'gloss', { p: [0, 0.2, 0.031] }, 0.005);
  b.shape(star, 0.012, '#ffe53b', 'gloss', { p: [0, 0, 0.045], s: 0.15 }, 0.003);
  for (const y of [-0.25, 0.25]) {
    b.box(0.16, 0.03, 0.025, '#c9ceea', 'metal', { p: [0, y, 0.055] }, 0.008); // trucks
    for (const x of [-0.095, 0.095]) b.cyl(0.036, 0.036, 0.032, '#ffe53b', 'gloss', { p: [x, y, 0.07], r: [0, 0, Math.PI / 2] }, 16);
  }
  const g = b.build();
  const w = new THREE.Group();
  w.add(g);
  w.rotation.z = 0.3;
  w.position.set(-0.03, -0.2, 0);
  return w;
}

// ── 8. Halo Wings (angel) ────────────────────────────────────────────────────
function angel(): THREE.Group {
  const root = new THREE.Group();
  const pivots: { g: THREE.Group; side: number }[] = [];
  for (const side of [1, -1]) {
    const b = new GearBuilder();
    // two rows of feathers fanned from the shoulder
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      const ang = 1.15 - k * 1.7; // from up-and-out to down-and-out
      const len = 0.2 + Math.sin(k * Math.PI) * 0.1 + k * 0.17;
      b.ball([0.034, len * 0.5, 0.012], '#ffffff', 'matte', { p: [Math.cos(ang) * len * 0.5, Math.sin(ang) * len * 0.5, 0.0], r: [0, 0, ang - Math.PI / 2] });
      b.ball([0.018, 0.04, 0.012], '#ffe9a8', 'gloss', { p: [Math.cos(ang) * len * 0.96, Math.sin(ang) * len * 0.96, 0.002], r: [0, 0, ang - Math.PI / 2] }, true);
    }
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const ang = 1.0 - k * 1.2;
      const len = 0.17 + Math.sin(k * Math.PI) * 0.05;
      b.ball([0.032, len * 0.5, 0.012], '#f1edff', 'matte', { p: [0.03 + Math.cos(ang) * len * 0.5, 0.04 + Math.sin(ang) * len * 0.5, 0.012], r: [0, 0, ang - Math.PI / 2] });
    }
    b.ball(0.035, '#ffffff', 'matte', { p: [0, 0, 0.0] }, true);
    const w = b.build();
    const piv = new THREE.Group();
    piv.add(w);
    piv.position.set(side * 0.04, 0.0, 0.05);
    piv.rotation.y = side > 0 ? -0.55 : Math.PI + 0.55;
    root.add(piv);
    pivots.push({ g: piv, side });
  }
  const halo = new GearBuilder();
  halo.torus(0.1, 0.014, '#ffe36a', 'glow', { r: [Math.PI / 2 + 0.12, 0, 0] });
  const hg = halo.build();
  hg.position.set(0, 0.59, 0.15);
  root.add(hg);
  return withTick(root, (t) => {
    const f = Math.sin(t * 2.2) * 0.1;
    for (const p of pivots) p.g.rotation.y = p.side > 0 ? -0.55 + f : Math.PI + 0.55 - f;
    hg.position.y = 0.59 + Math.sin(t * 2.4) * 0.012;
  });
}

// ── 9. Star Balloon ──────────────────────────────────────────────────────────
function balloon(): THREE.Group {
  const root = new THREE.Group();
  const b = new GearBuilder();
  b.line([0, -0.02, 0.03], [0.02, 0.2, 0.1], 0.004, '#ffffff');
  b.line([0.02, 0.2, 0.1], [0.04, 0.42, 0.15], 0.004, '#ffffff');
  root.add(b.build());
  const star2 = new GearBuilder();
  star2.shape(star, 0.5, '#ffe53b', 'gloss', { s: 0.52 }, 0.12);
  star2.cone(0.022, 0.05, '#ff4fa3', 'gloss', { p: [0, -0.2, 0], r: [Math.PI, 0, 0] }, 8);
  const sg = star2.build();
  sg.position.set(0.05, 0.65, 0.18);
  root.add(sg);
  return withTick(root, (t) => {
    sg.rotation.z = Math.sin(t * 1.7) * 0.12;
    sg.rotation.y = Math.sin(t * 1.1) * 0.25;
    sg.position.y = 0.65 + Math.sin(t * 2.1) * 0.015;
  });
}

// ── 10. Cat Pack ─────────────────────────────────────────────────────────────
function catpack(): THREE.Group {
  const b = new GearBuilder();
  const O = '#ff9d3d', D = '#e07418', C = '#fff0d6', PK = '#ff7aa8', K = '#2a1d5e';
  b.ball([0.17, 0.17, 0.11], O, 'matte', { p: [0, -0.17, 0.09] });
  for (const s of [-1, 1]) {
    b.cone(0.07, 0.13, O, 'matte', { p: [s * 0.1, 0.0, 0.08], r: [0, 0, -s * 0.28] }, 4);
    b.cone(0.04, 0.085, PK, 'matte', { p: [s * 0.1, -0.005, 0.105], r: [0, 0, -s * 0.28] }, 4);
    b.ball([0.027, 0.036, 0.012], K, 'gloss', { p: [s * 0.075, -0.13, 0.185] }, true);
    b.ball(0.008, '#ffffff', 'glow', { p: [s * 0.08, -0.118, 0.195] }, true);
    for (let i = 0; i < 3; i++) b.line([s * 0.07, -0.205 - (i - 1) * 0.02, 0.19], [s * 0.2, -0.205 - (i - 1) * 0.045, 0.17], 0.0025, '#ffffff', 'matte');
    b.ball([0.045, 0.06, 0.04], C, 'matte', { p: [s * 0.1, -0.33, 0.13] }, true); // paws
    b.box(0.014, 0.05, 0.014, D, 'matte', { p: [s * 0.04, -0.07, 0.19], r: [0.25, 0, s * 0.15] }, 0.005); // forehead stripes
  }
  b.box(0.014, 0.06, 0.014, D, 'matte', { p: [0, -0.065, 0.19], r: [0.25, 0, 0] }, 0.005);
  b.ball([0.075, 0.052, 0.035], C, 'matte', { p: [0, -0.205, 0.17] });
  b.ball([0.02, 0.014, 0.012], PK, 'gloss', { p: [0, -0.18, 0.2] }, true);
  // curly tail
  const tail: [number, number, number][] = [[0.14, -0.3, 0.06], [0.2, -0.26, 0.05], [0.235, -0.19, 0.05], [0.225, -0.11, 0.05], [0.19, -0.06, 0.055]];
  tail.forEach((p, i) => b.ball(0.034 - i * 0.003, i === tail.length - 1 ? D : O, 'matte', { p }, true));
  return b.build();
}

// ── 11. Rainbow Cape-Pack ────────────────────────────────────────────────────
const RAINBOW = ['#ff3b3b', '#ff8a1f', '#ffe53b', '#4cd964', '#35d6ff', '#4a6bff', '#b65cff'];
function capeStrip(i: number): THREE.BufferGeometry {
  const rows = 12, w = 0.052, len = 0.88;
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
  b.box(0.4, 0.05, 0.06, '#ffd23f', 'gloss', { p: [0, 0.0, 0.04] }, 0.02); // collar band
  b.shape(star, 0.05, '#fff6a8', 'gloss', { p: [0, -0.005, 0.082], s: 0.11 }, 0.01);
  b.ball(0.014, '#ff3d8b', 'glow', { p: [0, -0.005, 0.1] }, true);
  return b.build();
}

// ── 12. Shell Pack ───────────────────────────────────────────────────────────
function shell(): THREE.Group {
  const b = new GearBuilder();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) - 0.5) * 1.75; // fan angle
    const len = 0.34 - Math.abs(i - (n - 1) / 2) * 0.012;
    b.ball([0.052, len * 0.5, 0.045], i % 2 ? '#fff0f6' : '#ffb3d4', 'gloss', { p: [Math.sin(a) * len * 0.5, -0.4 + Math.cos(a) * len * 0.5, 0.09], r: [0, 0, -a] });
  }
  b.ball([0.1, 0.045, 0.07], '#ffd0e4', 'gloss', { p: [0, -0.4, 0.09] }, true); // hinge
  b.ball(0.044, '#ffffff', 'gloss', { p: [0, -0.36, 0.17] }); // pearl
  b.ball(0.012, '#cfeaff', 'glow', { p: [-0.012, -0.345, 0.205] }, true);
  const g = b.build();
  g.position.y = 0.2;
  const w = new THREE.Group();
  w.add(g);
  return w;
}

const BUILDERS: Record<BackBlingId, () => THREE.Group> = {
  minipack, bunny, butterfly, guitar, jetpack, boba, skateboard, angel, balloon, catpack, rainbowcape, shell,
};

/** Build a back bling (origin = upper-back mount, +Z away from the back). Unknown ids return an empty group. */
export function makeBackBling(id: string): THREE.Group {
  const f = BUILDERS[id as BackBlingId];
  const g = f ? f() : new THREE.Group();
  g.name = `backbling:${id}`;
  return g;
}
void S2;
