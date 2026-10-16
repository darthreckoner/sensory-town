// ── v3 locker ── 8 original gliders (procedural, 1–6 draw calls each).
//
// Contract: `makeGlider(id)` returns a THREE.Group whose ORIGIN is the hands' grip point (a short
// bar along X at y = 0) with the canopy ABOVE it (+Y), nose toward +Z (the way the player faces).
// Animated gliders set `group.userData.tick = (t) => …` (optional).
import * as THREE from 'three';
import { GearBuilder, heartShape, starShape, wingShape, type GearFinish } from './gearKit';

export const GLIDER_IDS = ['starter', 'umbrella', 'balloons', 'butterfly', 'pizza', 'cloud', 'dragonfly', 'paperplane'] as const;
export type GliderId = (typeof GLIDER_IDS)[number];

const RAINBOW = ['#ff3b3b', '#ff8a1f', '#ffe53b', '#4cd964', '#35d6ff', '#4a6bff', '#b65cff'];
const star = starShape(5, 0.52);
const heart = heartShape();
type V3 = [number, number, number];

function gripBar(b: GearBuilder, accent = '#ffe53b'): void {
  b.cyl(0.02, 0.02, 0.5, '#2a1d5e', 'metal', { r: [0, 0, Math.PI / 2] }, 10);
  for (const s of [-1, 1]) b.ball(0.034, accent, 'gloss', { p: [s * 0.25, 0, 0] }, true);
}
function lines(b: GearBuilder, pairs: [V3, V3][], color = '#f4f4ff', r = 0.005, finish: GearFinish = 'matte'): void {
  for (const [a, c] of pairs) b.line(a, c, r, color, finish);
}

// ── 1. Rainbow Parafoil (the starter glider) ─────────────────────────────────
function starter(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b);
  const pairs: [V3, V3][] = [];
  RAINBOW.forEach((c, i) => {
    const k = i - 3;
    const x = k * 0.31;
    const y = 1.55 - k * k * 0.04;
    b.box(0.31, 0.11, 0.95, c, 'gloss', { p: [x, y, 0.05], r: [0, 0, -k * 0.13] }, 0.05);
    b.box(0.28, 0.02, 0.2, '#ffffff', 'gloss', { p: [x, y + 0.057, 0.38], r: [0, 0, -k * 0.13] }, 0.008); // leading-edge highlight
    const bx = Math.max(-0.22, Math.min(0.22, x * 0.4));
    pairs.push([[bx, 0.02, 0], [x, y - 0.06, 0.32]], [[bx, 0.02, 0], [x, y - 0.06, -0.2]]);
  });
  lines(b, pairs);
  return b.build();
}

// ── 2. Brolly (umbrella) ─────────────────────────────────────────────────────
function umbrella(): THREE.Group {
  const b = new GearBuilder();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(1, 8, 10, (i / n) * Math.PI * 2, (Math.PI * 2) / n, 0, 1.16);
    b.add(g, i % 2 ? '#fff6fb' : '#ff4fa3', 'sheet', { p: [0, 1.15, 0], s: [1.05, 0.62, 1.05] });
    g.dispose();
    const a = ((i + 0.5) / n) * Math.PI * 2;
    b.ball(0.022, '#ffd23f', 'gloss', { p: [Math.cos(a) * 0.945, 1.4, Math.sin(a) * 0.945] }, true);
  }
  b.cyl(0.016, 0.016, 1.85, '#ffd23f', 'metal', { p: [0, 0.88, 0] }, 10);
  b.ball(0.04, '#ffd23f', 'metal', { p: [0, 1.82, 0] }, true);
  b.torus(0.06, 0.02, '#8a4a26', 'gloss', { p: [0.06, -0.02, 0], r: [0, 0, Math.PI] }, Math.PI); // J-hook handle
  b.cyl(0.024, 0.024, 0.34, '#8a4a26', 'gloss', { p: [0, 0.06, 0] }, 10);
  return b.build();
}

// ── 3. Balloon Bunch ─────────────────────────────────────────────────────────
function balloons(): THREE.Group {
  const root = new THREE.Group();
  const b = new GearBuilder();
  gripBar(b, '#ff4fa3');
  const list: [number, number, number, string][] = [
    [-0.42, 1.5, 0.08, '#ff3b6e'], [0.0, 1.78, 0.0, '#ffe53b'], [0.42, 1.52, -0.04, '#35d6ff'],
    [-0.2, 1.36, 0.27, '#b65cff'], [0.22, 1.4, 0.22, '#4cd964'], [-0.3, 1.72, -0.22, '#ff8a1f'], [0.3, 1.8, -0.2, '#ff4fa3'],
  ];
  for (const [x, y, z, c] of list) {
    b.ball([0.27, 0.32, 0.27], c, 'gloss', { p: [x, y, z] });
    b.cone(0.03, 0.06, c, 'gloss', { p: [x, y - 0.33, z], r: [Math.PI, 0, 0] }, 8);
    b.ball([0.04, 0.025, 0.04], '#ffffff', 'glow', { p: [x - 0.09, y + 0.12, z + 0.2] }, true); // shine
    b.line([x, y - 0.36, z], [(x * 0.1), 0.05, 0], 0.004, '#f4f4ff');
  }
  b.cone(0.05, 0.1, '#ff3d8b', 'gloss', { p: [-0.06, 0.1, 0], r: [0, 0, Math.PI / 2] }, 8);
  b.cone(0.05, 0.1, '#ff3d8b', 'gloss', { p: [0.06, 0.1, 0], r: [0, 0, -Math.PI / 2] }, 8);
  root.add(b.build());
  return withTick(root, (t) => {
    root.rotation.z = Math.sin(t * 1.6) * 0.03;
    root.rotation.x = Math.sin(t * 1.2) * 0.02;
  });
}

// ── 4. Flutterwing (butterfly) ───────────────────────────────────────────────
function butterfly(): THREE.Group {
  const root = new THREE.Group();
  const up = wingShape(0.95, 0.75, 0.2, 0.4);
  const lo = wingShape(0.7, 0.5, 0.1, 0.2);
  const pivots: { g: THREE.Group; side: number }[] = [];
  for (const side of [1, -1]) {
    const b = new GearBuilder();
    const rx = Math.PI / 2, ry = side > 0 ? 0 : Math.PI;
    b.shape(up, 0.02, '#6a2cff', 'sheet', { p: [side * 0.04, 0, 0.04], r: [rx, ry, 0.1] }, 0.005);
    b.shape(up, 0.02, '#ff4fa3', 'sheet', { p: [side * 0.12, 0.012, 0.07], r: [rx, ry, 0.1], s: [0.8, 0.8, 1] }, 0.005);
    b.shape(up, 0.02, '#ffd23f', 'sheet', { p: [side * 0.2, 0.024, 0.1], r: [rx, ry, 0.1], s: [0.5, 0.5, 1] }, 0.005);
    b.shape(lo, 0.02, '#6a2cff', 'sheet', { p: [side * 0.04, -0.005, -0.04], r: [rx, ry, -0.55] }, 0.005);
    b.shape(lo, 0.02, '#35d6ff', 'sheet', { p: [side * 0.1, 0.007, -0.08], r: [rx, ry, -0.55], s: [0.74, 0.74, 1] }, 0.005);
    b.ball([0.05, 0.012, 0.05], '#ffffff', 'matte', { p: [side * 0.7, 0.05, 0.3] }, true);
    b.ball([0.04, 0.012, 0.04], '#ffffff', 'matte', { p: [side * 0.45, 0.04, -0.42] }, true);
    const piv = new THREE.Group();
    piv.add(b.build());
    piv.position.set(0, 1.28, 0);
    root.add(piv);
    pivots.push({ g: piv, side });
  }
  const bd = new GearBuilder();
  gripBar(bd, '#6a2cff');
  bd.ball([0.05, 0.05, 0.34], '#2a1d5e', 'gloss', { p: [0, 1.28, 0.0] });
  bd.ball(0.06, '#2a1d5e', 'gloss', { p: [0, 1.29, 0.36] }, true);
  bd.line([0, 1.32, 0.38], [0.1, 1.5, 0.55], 0.007, '#2a1d5e');
  bd.line([0, 1.32, 0.38], [-0.1, 1.5, 0.55], 0.007, '#2a1d5e');
  bd.ball(0.02, '#ffe53b', 'gloss', { p: [0.1, 1.5, 0.55] }, true);
  bd.ball(0.02, '#ffe53b', 'gloss', { p: [-0.1, 1.5, 0.55] }, true);
  lines(bd, [[[-0.2, 0.02, 0], [-0.04, 1.26, 0.18]], [[0.2, 0.02, 0], [0.04, 1.26, 0.18]], [[-0.2, 0.02, 0], [-0.04, 1.26, -0.12]], [[0.2, 0.02, 0], [0.04, 1.26, -0.12]]]);
  root.add(bd.build());
  return withTick(root, (t) => {
    const f = Math.sin(t * 4.6) * 0.14;
    for (const p of pivots) p.g.rotation.z = p.side * f;
  });
}

// ── 5. Pizza Slice ───────────────────────────────────────────────────────────
function pizza(): THREE.Group {
  const sh = new THREE.Shape();
  sh.moveTo(-0.66, -0.66);
  sh.lineTo(0.66, -0.66);
  sh.lineTo(0.1, 0.86);
  sh.quadraticCurveTo(0, 0.96, -0.1, 0.86);
  sh.closePath();
  const b = new GearBuilder();
  gripBar(b, '#ff3b3b');
  b.shape(sh, 0.09, '#ffc83a', 'gloss', { p: [0, 1.35, 0.0], r: [Math.PI / 2, 0, 0] }, 0.03);
  b.cyl(0.11, 0.11, 1.38, '#e0903a', 'matte', { p: [0, 1.35, -0.7], r: [0, 0, Math.PI / 2] }, 14);
  for (const s of [-1, 1]) b.ball(0.11, '#e0903a', 'matte', { p: [s * 0.69, 1.35, -0.7] }, true);
  const pep: [number, number, number][] = [[-0.25, -0.35, 0.13], [0.28, -0.3, 0.12], [0.0, 0.02, 0.12], [-0.12, 0.4, 0.1], [0.2, 0.15, 0.09], [-0.4, -0.05, 0.08]];
  for (const [x, z, r] of pep) {
    b.cyl(r, r, 0.03, '#d7352b', 'gloss', { p: [x, 1.405, z] }, 14);
    b.cyl(r * 0.55, r * 0.55, 0.034, '#b52219', 'gloss', { p: [x, 1.408, z] }, 12);
  }
  for (const [x, z, a] of [[0.1, -0.5, 0.4], [-0.3, 0.2, 1.1], [0.35, 0.45, 2.0]] as [number, number, number][]) {
    b.ball([0.07, 0.012, 0.04], '#3ec04a', 'matte', { p: [x, 1.41, z], r: [0, a, 0] }, true);
  }
  for (const x of [-0.45, -0.1, 0.25, 0.5]) b.cone(0.05, 0.12, '#ffc83a', 'gloss', { p: [x, 1.3, -0.8], r: [Math.PI, 0, 0] }, 8); // cheese drips
  lines(b, [[[-0.2, 0.02, 0], [-0.5, 1.3, -0.5]], [[0.2, 0.02, 0], [0.5, 1.3, -0.5]], [[-0.2, 0.02, 0], [-0.1, 1.3, 0.6]], [[0.2, 0.02, 0], [0.1, 1.3, 0.6]]]);
  return b.build();
}

// ── 6. Puff Cloud ────────────────────────────────────────────────────────────
function cloud(): THREE.Group {
  const root = new THREE.Group();
  const b = new GearBuilder();
  const puffs: [number, number, number, number, string][] = [
    [0, 0, 0, 0.5, '#ffffff'], [-0.55, -0.08, 0.05, 0.38, '#ffffff'], [0.55, -0.08, 0.0, 0.4, '#ffffff'], [-0.95, -0.17, 0.0, 0.26, '#f3efff'],
    [0.95, -0.17, 0.02, 0.27, '#f3efff'], [-0.25, 0.26, 0.1, 0.36, '#ffffff'], [0.3, 0.24, -0.08, 0.34, '#ffffff'],
    [-0.3, -0.12, 0.38, 0.3, '#f6f2ff'], [0.25, -0.12, 0.4, 0.3, '#f6f2ff'], [0, -0.1, -0.38, 0.32, '#e9e2ff'], [-0.6, -0.1, -0.3, 0.24, '#e0d8ff'], [0.6, -0.1, -0.28, 0.25, '#e0d8ff'],
  ];
  for (const [x, y, z, r, c] of puffs) b.ball([r, r * 0.82, r], c, 'matte', { p: [x, y, z] });
  // little rainbow on the front
  [['#ff3b3b', 0.34], ['#ffe53b', 0.28], ['#35d6ff', 0.22]].forEach(([c, R]) => {
    b.torus(R as number, 0.032, c as string, 'gloss', { p: [0.0, 0.0, 0.52], r: [0, 0, 0] }, Math.PI);
  });
  const g = b.build();
  g.position.set(0, 1.4, 0);
  root.add(g);
  const r = new GearBuilder();
  gripBar(r, '#b65cff');
  r.line([-0.25, 0.02, 0], [-0.32, 1.25, 0.1], 0.016, '#ff7ab8', 'gloss');
  r.line([0.25, 0.02, 0], [0.32, 1.25, 0.1], 0.016, '#35d6ff', 'gloss');
  r.line([-0.25, 0.02, 0], [-0.3, 1.25, -0.2], 0.012, '#ffd23f', 'gloss');
  r.line([0.25, 0.02, 0], [0.3, 1.25, -0.2], 0.012, '#4cd964', 'gloss');
  root.add(r.build());
  return withTick(root, (t) => {
    g.position.y = 1.4 + Math.sin(t * 2.2) * 0.03;
    g.rotation.z = Math.sin(t * 1.3) * 0.02;
  });
}

// ── 7. Dragonfly ─────────────────────────────────────────────────────────────
function dragonfly(): THREE.Group {
  const root = new THREE.Group();
  const b = new GearBuilder();
  gripBar(b, '#10c9c0');
  const Y = 1.3;
  b.ball([0.1, 0.1, 0.17], '#10c9c0', 'gloss', { p: [0, Y, 0.42] }); // thorax
  b.ball(0.095, '#0a8f9a', 'gloss', { p: [0, Y + 0.01, 0.66] }, true); // head
  for (const s of [-1, 1]) {
    b.ball(0.07, '#8cff3b', 'gloss', { p: [s * 0.075, Y + 0.04, 0.7] }, true); // big eyes
    b.ball(0.018, '#ffffff', 'glow', { p: [s * 0.1, Y + 0.07, 0.76] }, true);
  }
  for (let i = 0; i < 9; i++) {
    const z = 0.22 - i * 0.12;
    const r = 0.055 - i * 0.003;
    b.ball([r, r, 0.075], i % 2 ? '#ff4fa3' : '#10c9c0', 'gloss', { p: [0, Y, z] }, true);
  }
  b.ball([0.02, 0.02, 0.07], '#0a8f9a', 'gloss', { p: [0, Y, -0.88] }, true);
  lines(b, [[[-0.2, 0.02, 0], [-0.04, Y - 0.07, 0.5]], [[0.2, 0.02, 0], [0.04, Y - 0.07, 0.5]], [[-0.2, 0.02, 0], [-0.03, Y - 0.06, 0.0]], [[0.2, 0.02, 0], [0.03, Y - 0.06, 0.0]]]);
  root.add(b.build());
  const pivots: { g: THREE.Group; side: number; ph: number }[] = [];
  for (const side of [1, -1]) {
    for (const [z, len, ph] of [[0.46, 0.78, 0], [0.18, 0.68, 1.6]] as [number, number, number][]) {
      const w = new GearBuilder();
      w.ball([len / 2, 0.01, 0.14], '#bff4ff', 'wing', { p: [side * (len / 2 + 0.06), 0, 0] });
      for (let i = 0; i < 4; i++) w.line([side * 0.06, 0, (i - 1.5) * 0.04], [side * (len * (0.55 + i * 0.1)), 0, (i - 1.5) * 0.07], 0.004, '#ffffff', 'glow');
      const piv = new THREE.Group();
      piv.add(w.build());
      piv.position.set(0, Y + 0.08, z);
      piv.rotation.y = side * (z > 0.3 ? -0.18 : 0.1);
      root.add(piv);
      pivots.push({ g: piv, side, ph });
    }
  }
  return withTick(root, (t) => {
    for (const p of pivots) p.g.rotation.z = p.side * (0.08 + Math.sin(t * 16 + p.ph) * 0.1);
  });
}

// ── 8. Paper Plane ───────────────────────────────────────────────────────────
function paperplane(): THREE.Group {
  const b = new GearBuilder();
  gripBar(b, '#4a6bff');
  const Y = 1.28;
  const tip: V3 = [0, Y + 0.02, 1.0];
  b.tri(tip, [0.98, Y + 0.16, -0.7], [0.0, Y, -0.7], '#ffffff');
  b.tri(tip, [0, Y, -0.7], [-0.98, Y + 0.16, -0.7], '#f0f3ff');
  b.tri(tip, [0, Y, -0.7], [0.0, Y - 0.28, -0.7], '#c9d3ff'); // keel fold
  b.tri([0, Y, 0.55], [0.5, Y + 0.08, -0.5], [0.0, Y - 0.005, -0.5], '#dfe6ff'); // crease shading
  b.shape(heart, 0.012, '#ff4fa3', 'sheet', { p: [0.46, Y + 0.095, -0.18], r: [Math.PI / 2, 0, 0.1], s: 0.22 }, 0.002);
  b.shape(star, 0.012, '#ffd23f', 'sheet', { p: [-0.46, Y + 0.095, -0.2], r: [Math.PI / 2, 0, -0.1], s: 0.22 }, 0.002);
  b.line([0.05, Y + 0.03, 0.8], [0.9, Y + 0.15, -0.62], 0.008, '#b9c4f5');
  b.line([-0.05, Y + 0.03, 0.8], [-0.9, Y + 0.15, -0.62], 0.008, '#b9c4f5');
  lines(b, [[[-0.2, 0.02, 0], [-0.4, Y + 0.08, -0.2]], [[0.2, 0.02, 0], [0.4, Y + 0.08, -0.2]], [[-0.2, 0.02, 0], [-0.04, Y - 0.15, -0.5]], [[0.2, 0.02, 0], [0.04, Y - 0.15, -0.5]]]);
  const g = b.build();
  return withTick(g, (t) => {
    g.rotation.z = Math.sin(t * 1.4) * 0.03;
    g.rotation.x = Math.sin(t * 1.9) * 0.02;
  });
}

function withTick(g: THREE.Group, tick: (t: number) => void): THREE.Group {
  g.userData.tick = tick;
  return g;
}

const BUILDERS: Record<GliderId, () => THREE.Group> = { starter, umbrella, balloons, butterfly, pizza, cloud, dragonfly, paperplane };

/** Build a glider (origin = grip point, canopy above, nose +Z). Unknown ids fall back to the starter. */
export function makeGlider(id: string): THREE.Group {
  const f = BUILDERS[id as GliderId] ?? starter;
  const g = f();
  g.name = `glider:${id}`;
  return g;
}
