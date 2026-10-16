// Skate & Stunt Park: concrete plaza with painted lines, kickers, a gap jump,
// a funbox, rollers, a half-pipe and a banked curve (all driven by the same
// analytic surfaces the physics uses), rails, bleachers, murals, floodlights.
import * as THREE from 'three';
import { PAVED, STUNTS } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat, signs, signUV } from './kit';
import { PAL } from './palette';
import { bakeStatic } from './envUtils';
import { lamp } from './props';

function mural(seed: number, w = 768, h = 256): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  let s = seed;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  x.fillStyle = '#23222a';
  x.fillRect(0, 0, w, h);
  const cols = [PAL.pink, PAL.cyan, PAL.lime, PAL.gold, PAL.violet, PAL.orange];
  for (let i = 0; i < 14; i++) {
    x.fillStyle = cols[(r() * cols.length) | 0];
    x.globalAlpha = 0.85;
    x.beginPath();
    const cx = r() * w, cy = r() * h, rad = 20 + r() * 70;
    if (i % 3 === 0) x.rect(cx - rad, cy - rad / 2, rad * 2, rad);
    else x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.font = '900 120px "Arial Black",Arial,sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 10;
  x.strokeStyle = '#0f0e17';
  x.strokeText(seed % 2 ? 'SKATE' : 'STUNT', w / 2, h / 2);
  x.fillStyle = '#ffffff';
  x.fillText(seed % 2 ? 'SKATE' : 'STUNT', w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
}

export function buildSkate(): Piece {
  const m = new Mesher();
  const ex = new THREE.Group();
  const colliders: Collider[] = [];
  const out = { colliders };
  const vc = mat.vc();
  const concrete = mat.concrete();
  const trim = mat.trim();
  const accents = [PAL.pink, PAL.cyan, PAL.lime, PAL.gold, PAL.violet, PAL.orange];
  m.push(0, 0, 0);

  // ── stunt solids, sampled from the physics surface ──
  const STEP = 0.75;
  STUNTS.forEach((s, si) => {
    const R = s.kind === 'bank' ? s.r1 + 1 : Math.hypot(s.kind === 'roller' ? (s.n * s.hl) / 2 : s.len / 2, s.w / 2) + 1;
    const x0 = Math.floor((s.x - R) / STEP) * STEP, z0 = Math.floor((s.z - R) / STEP) * STEP;
    const n = Math.ceil((2 * R) / STEP) + 1;
    const accent = accents[si % accents.length];
    const topCol = new THREE.Color('#b4b2bc');
    const accCol = new THREE.Color(accent);
    const sideCol = new THREE.Color('#8c8a96');
    const H = (x: number, z: number): number => groundHeight(x, z);
    const cellH = (i: number, j: number): number => H(x0 + (i + 0.5) * STEP, z0 + (j + 0.5) * STEP);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const hc = cellH(i, j);
        if (hc < 0.04) continue;
        const xa = x0 + i * STEP, xb = xa + STEP, za = z0 + j * STEP, zb = za + STEP;
        // corner heights sampled slightly inside the cell so cliffs stay sharp
        const e = 0.04;
        const ha = H(xa + e, za + e), hb = H(xb - e, za + e), hcn = H(xb - e, zb - e), hd = H(xa + e, zb - e);
        const col = (i + j) % 6 === 0 ? accCol : topCol;
        m.quad(vc, [xa, ha, za], [xa, hd, zb], [xb, hcn, zb], [xb, hb, za], undefined, col);
        // skirts where the neighbour is lower (down to the ground)
        const edges: [number, number, number, number, number, number, number, number][] = [
          [0, -1, xa, za, xb, za, ha, hb],
          [0, 1, xb, zb, xa, zb, hcn, hd],
          [-1, 0, xa, zb, xa, za, hd, ha],
          [1, 0, xb, za, xb, zb, hb, hcn],
        ];
        for (const [di, dj, x1, z1, x2, z2, h1, h2] of edges) {
          if (cellH(i + di, j + dj) >= hc - 0.02) continue;
          m.quad(vc, [x1, 0, z1], [x2, 0, z2], [x2, h2, z2], [x1, h1, z1], undefined, sideCol);
        }
      }
  });

  // ── painted plaza lines: a big ring, lane stripes, arrows into the ramps ──
  const plaza = PAVED.find((p) => p.id === 'skate_plaza')!;
  for (let i = 0; i < 9; i++) {
    const px = plaza.x - plaza.w / 2 + 4 + i * 10.5;
    m.quad(vc, [px - 0.12, 0.05, plaza.z - plaza.d / 2 + 1], [px - 0.12, 0.05, plaza.z + plaza.d / 2 - 1], [px + 0.12, 0.05, plaza.z + plaza.d / 2 - 1], [px + 0.12, 0.05, plaza.z - plaza.d / 2 + 1], undefined, '#d8d6df');
  }
  for (const [rx, rz, col] of [[-22, 104, PAL.pink], [-60, 128, PAL.cyan], [14, 96, PAL.lime]] as [number, number, string][]) {
    for (let k = 0; k < 28; k++) {
      const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2;
      const r0 = 5.0, r1 = 5.5;
      m.quad(vc, [rx + Math.cos(a0) * r0, 0.05, rz + Math.sin(a0) * r0], [rx + Math.cos(a1) * r0, 0.05, rz + Math.sin(a1) * r0], [rx + Math.cos(a1) * r1, 0.05, rz + Math.sin(a1) * r1], [rx + Math.cos(a0) * r1, 0.05, rz + Math.sin(a0) * r1], undefined, col);
    }
  }
  for (const [ax, az0] of [[-6, 118], [-36, 124]] as [number, number][])
    for (let k = 0; k < 5; k++) {
      const z = az0 - k * 3.2;
      m.quad(vc, [ax, 0.05, z - 1.2], [ax - 1.4, 0.05, z], [ax - 0.9, 0.05, z], [ax, 0.05, z - 0.8], undefined, PAL.gold);
      m.quad(vc, [ax, 0.05, z - 1.2], [ax, 0.05, z - 0.8], [ax + 0.9, 0.05, z], [ax + 1.4, 0.05, z], undefined, PAL.gold);
    }

  // ── grind rails + the big hoop ──
  const steel = mat.std('#cfd3dc', 0.3, 0.85);
  for (const [rx, rz, yaw] of [[-14, 136, 0], [-60, 98, Math.PI / 2], [26, 134, 0.3]] as [number, number, number][]) {
    m.push(rx, rz, yaw);
    m.box(steel, 0, 0.85, 0, 9, 0.12, 0.12);
    for (const px of [-4, -1.3, 1.3, 4]) m.box(trim, px, 0.4, 0, 0.12, 0.8, 0.12);
    m.pop();
    const cx = Math.abs(Math.cos(yaw)), sz = Math.abs(Math.sin(yaw));
    colliders.push({ kind: 'box', x: rx, z: rz, hw: cx * 4.5 + sz * 0.3, hd: sz * 4.5 + cx * 0.3, h: 1 });
  }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.35, 8, 40), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: PAL.cyan, emissiveIntensity: 0.6, roughness: 0.3 }));
  hoop.position.set(8, 7.35, 128.5); // bottom of the ring sunk into the bank: walk or drive over it, never through a knee-high tube
  hoop.rotation.y = 0.35;
  ex.add(hoop);
  const hoop2 = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.16, 8, 40), mat.neon(PAL.pink));
  hoop2.position.copy(hoop.position);
  hoop2.rotation.y = 0.35;
  hoop2.scale.setScalar(1.06);
  ex.add(hoop2);
  colliders.push({ kind: 'circle', x: 8 - 6.6, z: 128.5, r: 0.6 }, { kind: 'circle', x: 8 + 6.6, z: 128.5, r: 0.6 });

  // ── floodlights, bleachers, kiosk, murals ──
  for (const [lx, lz] of [[-70, 76], [-30, 76], [10, 76], [-70, 138], [-30, 138], [10, 138]] as [number, number][]) {
    lamp(m, out, lx, lz, lz < 100 ? 0 : Math.PI, 10.5);
    m.box(mat.neon('#fff6e0'), lx, 10.9, lz + (lz < 100 ? 1.3 : -1.3), 1.6, 0.14, 0.7);
  }
  for (let k = 0; k < 4; k++) m.box(mat.std('#6c7280', 0.7), -50, 0.35 + k * 0.5, 78.4 + k * 0.7, 18, 0.7, 0.8);
  colliders.push({ kind: 'box', x: -50, z: 79.6, hw: 9, hd: 1.8, h: 2.5 });
  {
    const x = 13, z = 80;
    m.box(mat.std('#2c3e5c', 0.6, 0.3), x, 1.3, z, 6, 2.6, 2.5);
    m.box(mat.std('#1d1b26', 0.5), x, 1.5, z + 1.26, 3.2, 1.1, 0.06);
    m.box(mat.neon(PAL.lime), x, 2.75, z + 1.3, 6.0, 0.08, 0.08);
    const r = signs().add('SKATE SHOP', { fg: '#ffffff', glow: PAL.lime });
    m.quad(signs().material, [x - 2.8, 2.95, z + 1.32], [x + 2.8, 2.95, z + 1.32], [x + 2.8, 4.0, z + 1.32], [x - 2.8, 4.0, z + 1.32], signUV(r));
    colliders.push({ kind: 'box', x, z, hw: 3, hd: 1.25, h: 2.6 });
  }
  [[-60, 142.6, 40], [-6, 142.6, 28]].forEach(([wx, wz, ww], i) => {
    m.box(concrete, wx, 2.2, wz, ww, 4.4, 0.6);
    const mm = mural(7 + i * 13);
    m.quad(mm, [wx + ww / 2 - 0.3, 0.4, wz - 0.32], [wx - ww / 2 + 0.3, 0.4, wz - 0.32], [wx - ww / 2 + 0.3, 4.0, wz - 0.32], [wx + ww / 2 - 0.3, 4.0, wz - 0.32], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    colliders.push({ kind: 'box', x: wx, z: wz, hw: ww / 2, hd: 0.3 });
  });

  const group = new THREE.Group();
  group.name = 'skate';
  group.add(m.build('skate-static'));
  group.add(bakeStatic(ex));
  return { group, colliders, cull: { x: -28, z: 108, r: 150 } };
}
