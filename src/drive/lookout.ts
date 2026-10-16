// Lookout Hill: guardrails along the hairpin road, and at the top a viewpoint
// with a huge neon town sign, binoculars, benches and a flagpole.
import * as THREE from 'three';
import { LOOKOUT, ROAD_PATHS, SPIRAL } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { bigSignTexture, mat } from './kit';
import { PAL } from './palette';
import { bakeStatic } from './envUtils';
import { bench } from './props';

export function buildLookout(): Piece {
  const m = new Mesher();
  const ex = new THREE.Group();
  const colliders: Collider[] = [];
  const out = { colliders };
  const trim = mat.trim();
  const steel = mat.std('#cfd3dc', 0.35, 0.8);
  const concrete = mat.concrete();
  m.push(0, 0, 0);

  // ── guardrail on the downhill (outer) side of the spiral road ──
  const road = ROAD_PATHS.find((p) => p.id === 'lookout')!;
  let prev: [number, number, number] | null = null;
  for (let i = 0; i < road.pts.length; i += 2) {
    const [px, pz] = road.pts[i];
    const dx = px - LOOKOUT.x, dz = pz - LOOKOUT.z;
    const r = Math.hypot(dx, dz);
    if (r < SPIRAL.r1 + 2) continue;
    const ox = px + (dx / r) * 4.7, oz = pz + (dz / r) * 4.7;
    const gy = groundHeight(ox, oz);
    m.box(trim, ox, gy + 0.55, oz, 0.12, 1.1, 0.12);
    m.box(mat.neon('#ffc93c'), ox, gy + 0.95, oz, 0.14, 0.12, 0.14);
    if (prev) {
      const ex2 = ox - prev[0], ez = oz - prev[1];
      const len = Math.hypot(ex2, ez);
      if (len < 9) {
        const yaw = -Math.atan2(ez, ex2);
        m.box(steel, (ox + prev[0]) / 2, (gy + prev[2]) / 2 + 0.8, (oz + prev[1]) / 2, len, 0.22, 0.06, { yaw });
        m.box(steel, (ox + prev[0]) / 2, (gy + prev[2]) / 2 + 0.45, (oz + prev[1]) / 2, len, 0.12, 0.06, { yaw });
      }
    }
    prev = [ox, oz, gy];
  }

  // ── the viewpoint on top ──
  const top = groundHeight(LOOKOUT.x, LOOKOUT.z);
  const cx = LOOKOUT.x, cz = LOOKOUT.z;
  // a low wall ring with a gap where the road arrives
  const gapA = SPIRAL_END_ANGLE();
  const R = 12.2;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    let d = Math.abs(a - gapA);
    d = Math.min(d, Math.PI * 2 - d);
    if (d < 0.32) continue;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const gy = groundHeight(x, z);
    m.box(concrete, x, gy + 0.5, z, 1.5, 1.0, 0.5, { yaw: -a - Math.PI / 2 });
    m.box(mat.neon(PAL.cyan), x, gy + 1.03, z, 1.5, 0.05, 0.12, { yaw: -a - Math.PI / 2 });
    colliders.push({ kind: 'circle', x, z, r: 0.85 });
  }
  // the big town sign, facing the town (south-east), double sided
  const face = Math.atan2(95, 122); // direction from the hill to downtown
  const sx = cx + Math.cos(face) * 10.5, sz = cz + Math.sin(face) * 10.5;
  const tex = bigSignTexture('SENSORY TOWN', '#ffffff', PAL.pink, 2048, 512, 'WELCOME HOME');
  const signMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const dir of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), signMat);
    p.position.set(sx + Math.cos(face) * 0.12 * dir, top + 7.6, sz + Math.sin(face) * 0.12 * dir);
    p.rotation.y = -face + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ex.add(p);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(26.4, 6.9, 0.2), new THREE.MeshStandardMaterial({ color: '#23222a', roughness: 0.5 }));
  frame.position.set(sx, top + 7.6, sz);
  frame.rotation.y = -face + Math.PI / 2;
  frame.castShadow = true;
  ex.add(frame);
  for (const s of [-1, 1]) {
    const px = sx + Math.cos(face + Math.PI / 2) * s * 11, pz = sz + Math.sin(face + Math.PI / 2) * s * 11;
    m.box(steel, px, top + 2.0, pz, 0.5, 4.0, 0.5);
    colliders.push({ kind: 'circle', x: px, z: pz, r: 0.5 });
  }
  // binoculars on stands, benches, a flagpole
  for (const [bx, bz] of [[cx + 7, cz + 5], [cx + 4, cz + 8]] as [number, number][]) {
    m.cyl(steel, bx, top, bz, 0.12, 0.1, 1.3, 8);
    m.box(mat.std('#2d3038', 0.5, 0.6), bx, top + 1.4, bz, 0.5, 0.35, 0.8, { yaw: -face });
    colliders.push({ kind: 'circle', x: bx, z: bz, r: 0.35 });
  }
  for (const a of [face + 0.7, face - 0.7, face + Math.PI * 0.95]) {
    const bx = cx + Math.cos(a) * 8.2, bz = cz + Math.sin(a) * 8.2;
    bench(m, out, bx, bz, -a - Math.PI / 2 + Math.PI);
  }
  {
    const fx = cx - 4, fz = cz - 3;
    m.cyl(steel, fx, top, fz, 0.12, 0.07, 9, 8);
    m.box(mat.std('#ff2e88', 0.7), fx + 1.1, top + 8.3, fz, 2.0, 1.2, 0.05);
    m.box(mat.std('#00d4ff', 0.7), fx + 1.1, top + 7.1, fz, 2.0, 1.2, 0.05);
    colliders.push({ kind: 'circle', x: fx, z: fz, r: 0.25 });
  }
  // a floodlight ring so the summit glows at golden hour
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const lx = cx + Math.cos(a) * 9, lz = cz + Math.sin(a) * 9;
    m.cyl(steel, lx, top, lz, 0.08, 0.06, 3.4, 6);
    m.box(mat.neon('#ffd98a'), lx, top + 3.5, lz, 0.4, 0.2, 0.4);
  }

  const group = new THREE.Group();
  group.name = 'lookout';
  group.add(m.build('lookout-static'));
  group.add(bakeStatic(ex));
  return { group, colliders, cull: { x: LOOKOUT.x, z: LOOKOUT.z, r: 170 } };
}

function SPIRAL_END_ANGLE(): number {
  // where the spiral road meets the plateau (angle around the hill centre)
  const road = ROAD_PATHS.find((p) => p.id === 'lookout')!;
  const [x, z] = road.pts[road.pts.length - 1];
  return ((Math.atan2(z - LOOKOUT.z, x - LOOKOUT.x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}
