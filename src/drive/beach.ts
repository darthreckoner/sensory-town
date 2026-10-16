// Beach & Pier: a boardwalk along the sand, striped umbrellas, a lifeguard
// tower, cabanas, a volleyball court, a tiki bar, a long pier on pylons and a
// lighthouse with a sweeping beam at the end.
import * as THREE from 'three';
import { PIERS, WATER_Y } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat } from './kit';
import { PAL } from './palette';
import { bakeStatic } from './envUtils';
import { bench, bin, lamp } from './props';

export interface BeachOut extends Piece {
  palms: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
}

export function buildBeach(): BeachOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const colliders: Collider[] = [];
  const out = { colliders };
  const palms: { x: number; z: number; s: number }[] = [];
  const rocks: { x: number; z: number; s: number }[] = [];
  const G = (x: number, z: number): number => groundHeight(x, z);
  const wood = mat.wood();
  const dark = mat.trim();
  const white = mat.std('#f3f2ee', 0.8);

  // ── boardwalk furniture ──
  for (let z = -44; z <= 60; z += 26) {
    lamp(m, out, 94.8, z, -Math.PI / 2, 4.4);
    lamp(m, out, 89.2, z + 13, Math.PI / 2, 4.4);
  }
  for (let z = -36; z <= 56; z += 18) {
    bench(m, out, 94.4, z + 3, Math.PI / 2);
    bin(m, out, 94.4, z + 5.2);
  }
  // boardwalk railing along the sea side
  for (let z = -52; z <= 66; z += 3) {
    const gy = G(94.6, z);
    m.box(dark, 94.6, gy + 0.55, z, 0.1, 1.1, 0.1);
  }
  m.box(wood, 94.6, G(94.6, 7) + 1.1, 7, 0.08, 0.08, 118);
  // palms along the boardwalk
  for (let z = -48; z <= 62; z += 11) {
    if (Math.abs(z - 12) < 9) continue;
    palms.push({ x: 88.2 + ((z * 7) % 2), z, s: 0.95 + ((z * 13) % 10) / 40 });
    palms.push({ x: 97.6 + ((z * 5) % 3), z: z + 5, s: 0.9 + ((z * 11) % 10) / 40 });
  }

  // ── umbrellas + loungers + towels ──
  const cols = [PAL.pink, PAL.cyan, PAL.gold, PAL.lime, PAL.orange, PAL.violet];
  const umb: [number, number][] = [[101, -36], [104, -30], [100, -14], [103, -8], [100, 30], [104, 36], [101, 44], [105, 48], [102, 60], [99, -44]];
  umb.forEach(([ux, uz], i) => {
    const gy = G(ux, uz);
    const c = cols[i % cols.length];
    m.cyl(mat.std('#e6e6ec', 0.5), ux, gy, uz, 0.05, 0.05, 2.5, 6);
    // canopy: a flat 8-gore cone made of two colours
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      const col = k % 2 ? '#ffffff' : c;
      const R = 1.7;
      m.quad(mat.vc(), [ux, gy + 2.95, uz], [ux + Math.cos(a1) * R, gy + 2.35, uz + Math.sin(a1) * R], [ux + Math.cos(a0) * R, gy + 2.35, uz + Math.sin(a0) * R], [ux, gy + 2.95, uz], undefined, col);
    }
    // lounger + towel beside it
    m.box(mat.std('#f3f2ee', 0.9), ux + 2.2, gy + 0.18, uz + 0.3, 0.8, 0.14, 1.9);
    m.box(mat.std(c, 0.9), ux + 2.2, gy + 0.27, uz + 0.1, 0.7, 0.04, 1.3);
    m.box(mat.std(cols[(i + 2) % cols.length], 0.95), ux - 2.0, gy + 0.03, uz + 0.4, 1.0, 0.05, 1.9);
    colliders.push({ kind: 'circle', x: ux, z: uz, r: 0.35, h: 3 });
  });

  // ── lifeguard tower ──
  {
    const x = 98, z = -24, gy = G(x, z);
    const red = mat.std('#d4262d', 0.6);
    for (const [px, pz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) m.box(wood, x + px, gy + 1.2, z + pz, 0.18, 2.4, 0.18);
    m.box(white, x, gy + 2.45, z, 3.0, 0.16, 3.0);
    m.box(white, x, gy + 3.5, z - 0.9, 2.6, 2.0, 0.14);
    m.box(white, x - 1.3, gy + 3.5, z, 0.14, 2.0, 1.9);
    m.box(white, x + 1.3, gy + 3.5, z, 0.14, 2.0, 1.9);
    m.box(red, x, gy + 4.58, z, 3.6, 0.2, 3.4);
    m.box(red, x, gy + 3.1, z + 1.45, 2.4, 0.5, 0.1); // front rail panel
    // steps
    for (let i = 0; i < 5; i++) m.box(wood, x + 2.0 + i * 0.0, gy + 0.2 + i * 0.5, z + 1.1 + i * 0.2 - 0.0, 1.2, 0.1, 0.5 + 0 * i);
    m.box(mat.neon('#ffffff'), x, gy + 3.2, z + 1.0, 0.7, 0.35, 0.05);
    colliders.push({ kind: 'box', x, z, hw: 1.6, hd: 1.6, h: 4.6 });
    // a surfboard rack next to it
    for (let i = 0; i < 5; i++) m.box(mat.std(cols[i % cols.length], 0.4), x - 4 + i * 0.5, gy + 1.0, z + 0.2, 0.3, 2.0, 0.08);
    m.box(wood, x - 3, gy + 0.2, z + 0.2, 3.2, 0.12, 0.5);
  }

  // ── cabanas (a row of striped beach huts) ──
  for (let i = 0; i < 5; i++) {
    const x = 98.6, z = 22 + i * 4.2, gy = G(x, z);
    const c = cols[(i + 1) % cols.length];
    m.box(white, x, gy + 1.15, z, 2.6, 2.3, 3.0);
    m.box(mat.std(c, 0.7), x, gy + 1.15, z - 1.51, 2.0, 2.0, 0.06); // door colour (west side faces the boardwalk)
    m.prism(mat.std('#3a3a44', 0.9), x, gy + 2.3, z, 3.0, 0.7, 3.2);
    m.box(mat.std(c, 0.7), x - 1.31, gy + 1.15, z, 0.06, 2.2, 3.0);
    colliders.push({ kind: 'box', x, z, hw: 1.3, hd: 1.5, h: 3 });
  }

  // ── volleyball court ──
  {
    const x = 106, z = -4, gy = G(x, z);
    void gy;
    for (const sz of [-3.6, 3.6]) m.box(mat.std('#d4262d', 0.6), x, G(x, z + sz) + 1.2, z + sz, 0.14, 2.4, 0.14);
    m.box(mat.std('#f3f2ee', 0.9), x, G(x, z) + 2.0, z, 0.04, 0.9, 7.2);
    colliders.push(
      { kind: 'circle', x, z: z - 3.6, r: 0.3, h: 3 },
      { kind: 'circle', x, z: z + 3.6, r: 0.3, h: 3 },
    );
  }

  // ── tiki bar ──
  {
    const x = 99, z = 52, gy = G(x, z);
    m.box(wood, x, gy + 0.55, z, 4.2, 1.1, 1.0);
    m.box(mat.std('#8a5a2b', 0.9), x, gy + 1.15, z, 4.4, 0.1, 1.2);
    for (const px of [-2, 2]) for (const pz of [-1.2, 1.2]) m.cyl(wood, x + px, gy, z + pz, 0.12, 0.12, 2.8, 6);
    // thatched roof: stacked tapered slabs
    m.cyl(mat.std('#c9a357', 1), x, gy + 2.7, z, 3.3, 0.2, 1.3, 10);
    m.box(mat.neon(PAL.orange), x, gy + 2.55, z + 1.1, 3.2, 0.06, 0.06);
    for (let i = 0; i < 3; i++) m.cyl(mat.std('#f3f2ee', 0.6), x - 1.4 + i * 1.4, gy + 0.2, z + 1.5, 0.28, 0.28, 0.6, 8);
    colliders.push({ kind: 'box', x, z, hw: 2.3, hd: 1.4, h: 3 });
  }

  // ── the pier ──
  const pier = PIERS.find((p) => p.id === 'main')!;
  {
    const L = pier.bx - pier.ax;
    const y = pier.y;
    const plank = new THREE.MeshStandardMaterial({ color: '#a9794b', roughness: 0.8 });
    // deck: a ramp for the first 4 units, then flat
    const w = pier.w;
    m.box(plank, pier.ax + 2, G(pier.ax + 2, pier.az) - 0.1, pier.az, 4, 0.2, w); // under-ramp bulk
    m.box(plank, (pier.ax + 4 + pier.bx) / 2, y - 0.12, pier.az, L - 4, 0.24, w);
    m.quad(plank, [pier.ax, y * 0.45 + 0.02, pier.az + w / 2], [pier.ax + 4, y + 0.0, pier.az + w / 2], [pier.ax + 4, y + 0.0, pier.az - w / 2], [pier.ax, y * 0.45 + 0.02, pier.az - w / 2]);
    // plank lines
    for (let x = pier.ax + 4; x < pier.bx; x += 1.6) m.box(dark, x, y + 0.005, pier.az, 0.03, 0.01, w);
    // pylons
    for (let x = pier.ax + 5; x <= pier.bx; x += 4.5)
      for (const sz of [-1, 1]) m.cyl(wood, x, -2.4, pier.az + sz * (w / 2 - 0.35), 0.28, 0.28, 2.4 + y, 8);
    // railings + lantern posts
    for (const sz of [-1, 1]) {
      for (let x = pier.ax + 5; x <= pier.bx - 0.5; x += 2.5) m.box(wood, x, y + 0.55, pier.az + sz * (w / 2 - 0.08), 0.1, 1.1, 0.1);
      m.box(wood, (pier.ax + 5 + pier.bx) / 2, y + 1.1, pier.az + sz * (w / 2 - 0.08), pier.bx - pier.ax - 5, 0.08, 0.08);
      m.box(wood, (pier.ax + 5 + pier.bx) / 2, y + 0.65, pier.az + sz * (w / 2 - 0.08), pier.bx - pier.ax - 5, 0.05, 0.05);
      colliders.push({ kind: 'box', x: (pier.ax + 5 + pier.bx) / 2, z: pier.az + sz * (w / 2 + 0.05), hw: (pier.bx - pier.ax - 5) / 2, hd: 0.12, h: y + 1.2 });
    }
    for (let x = pier.ax + 10; x < pier.bx - 6; x += 10)
      for (const sz of [-1, 1]) {
        m.cyl(mat.std('#2d3038', 0.5, 0.5), x, y, pier.az + sz * (w / 2 - 0.08), 0.07, 0.07, 2.6, 6);
        m.box(mat.neon('#ffd98a'), x, y + 2.7, pier.az + sz * (w / 2 - 0.08), 0.3, 0.34, 0.3);
      }
    // benches and a couple of fishing buckets
    for (const x of [pier.ax + 18, pier.ax + 34]) {
      bench(m, out, x, pier.az + 2.7, 0);
      bench(m, out, x + 2, pier.az - 2.7, Math.PI);
    }
    m.cyl(mat.std('#2c3e5c', 0.6), pier.ax + 26, y, pier.az + 2.6, 0.3, 0.26, 0.6, 8);
  }

  // ── the lighthouse (white tower with red bands, glowing lantern, sweeping beam) ──
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(5, 70, 14, 1, true).translate(0, -35, 0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }),
  );
  {
    const x = 145.5, z = pier.az, y0 = pier.y;
    m.cyl(white, x, y0, z, 3.2, 2.1, 6, 14);
    m.cyl(mat.std('#d4262d', 0.6), x, y0 + 6, z, 2.12, 1.75, 4.2, 14);
    m.cyl(white, x, y0 + 10.2, z, 1.77, 1.5, 4, 14);
    m.cyl(mat.std('#d4262d', 0.6), x, y0 + 14.2, z, 1.52, 1.4, 2.8, 14);
    m.cyl(dark, x, y0 + 17, z, 2.2, 2.2, 0.35, 14); // gallery
    m.cyl(mat.neon('#ffe9a8'), x, y0 + 17.35, z, 1.0, 1.0, 1.6, 12);
    m.cyl(mat.std('#d4262d', 0.5), x, y0 + 18.95, z, 1.5, 0.15, 1.2, 12);
    // gallery railing posts
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      m.box(dark, x + Math.cos(a) * 2.1, y0 + 17.9, z + Math.sin(a) * 2.1, 0.06, 1.0, 0.06);
    }
    // a little door and windows
    m.box(mat.std('#d4262d', 0.5), x - 3.18, y0 + 1.0, z, 0.1, 2.0, 1.0);
    beam.position.set(x, y0 + 18.2, z);
    ex.add(beam);
    colliders.push({ kind: 'circle', x, z, r: 3.3 });
  }

  // ── rocks along the shore and a few buoys ──
  for (let z = -50; z <= 62; z += 14) rocks.push({ x: 105 + ((z * 13) % 7), z: z + 3, s: 0.7 + ((z * 7) % 5) / 8 });
  const buoyCols = [PAL.orange, PAL.white, PAL.pink];
  for (let i = 0; i < 12; i++) {
    const bz = -60 + i * 12, bx = 148;
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat.neon(buoyCols[i % 3]));
    buoy.position.set(bx, WATER_Y + 0.2, bz);
    buoy.userData.bob = i;
    ex.add(buoy);
  }

  const group = new THREE.Group();
  group.name = 'beach';
  group.add(m.build('beach-static'));
  const buoys = ex.children.filter((c) => c.userData.bob !== undefined);
  const rest = new THREE.Group();
  for (const c of ex.children.slice()) if (c !== beam && !buoys.includes(c)) rest.add(c);
  group.add(bakeStatic(rest));
  group.add(beam);
  for (const b of buoys) group.add(b);
  return {
    group,
    colliders,
    palms,
    rocks,
    cull: { x: 110, z: 8, r: 170 },
    update(_dt: number, t: number) {
      beam.rotation.y = t * 0.8;
      for (const b of buoys) b.position.y = WATER_Y + 0.15 + Math.sin(t * 1.6 + (b.userData.bob as number)) * 0.12;
    },
  };
}
