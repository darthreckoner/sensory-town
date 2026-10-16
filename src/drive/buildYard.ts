// The builder's yard: a swinging toy crane, ABC blocks stacked in a pyramid,
// a plank pile, a sand heap, cones, a rainbow picket fence and a 🔨 sign.
import * as THREE from 'three';
import { BUILD_YARD } from '../world/townLayout';
import { toyMat, roundedBox } from '../art/materials';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { InstanceBatch, bakeStatic, decalAtlas, put } from './envUtils';

const YARD_R = 3.65;
const GAP = 0.75; // half-angle (rad) of the fence opening, centred on south (+z)

export function buildYard(): Piece {
  const cx = BUILD_YARD.center.x, cz = BUILD_YARD.center.z;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const colliders: Collider[] = [];
  const fixed = new THREE.Group();
  const decalItems: { char: string; x: number; y: number; z: number; size: number }[] = [];

  const yellow = toyMat('#ffc844');
  const mint = toyMat('#7fe3b8');
  const pink = toyMat('#ff8fb1');
  const wood = toyMat('#b98563', 'satin');
  const cream = toyMat('#fff1e6', 'satin');
  const white = toyMat('#ffffff');
  const orange = toyMat('#ff9f6e');
  const circle = (x: number, z: number, r: number): void => {
    colliders.push({ kind: 'circle', x: cx + x, z: cz + z, r });
  };

  // ── crane ──
  const craneX = 1.9, craneZ = -1.4;
  put(fixed, roundedBox(1.7, 0.5, 1.7, 0.2), yellow, craneX, 0.25, craneZ);
  put(fixed, roundedBox(0.55, 5.5, 0.55, 0.18), yellow, craneX, 3.2, craneZ);
  for (const y of [1.4, 2.6, 3.8, 5.0]) put(fixed, roundedBox(0.72, 0.1, 0.72, 0.04), white, craneX, y, craneZ);
  circle(craneX, craneZ, 1.05);
  const top = new THREE.Group();
  top.position.set(craneX, 6.0, craneZ);
  const topFixed = new THREE.Group();
  put(topFixed, roundedBox(0.9, 0.85, 1.0, 0.28), mint, 0, 0.25, 0);
  put(topFixed, new THREE.SphereGeometry(0.28, 12, 10), toyMat('#fff3a3', 'emissive'), 0, 0.3, -0.5);
  put(topFixed, roundedBox(0.34, 0.34, 4.8, 0.12), yellow, 0, 0.45, -2.5);
  put(topFixed, roundedBox(0.34, 0.34, 1.7, 0.12), yellow, 0, 0.45, 1.1);
  put(topFixed, roundedBox(0.85, 0.75, 0.85, 0.2), pink, 0, 0.35, 1.7);
  put(topFixed, new THREE.ConeGeometry(0.22, 0.6, 12), toyMat('#ff5d8f'), 0, 1.0, 0);
  top.add(bakeStatic(topFixed));
  const hook = new THREE.Group();
  hook.position.set(0, 0.45, -4.2);
  const cable = put(hook, new THREE.CylinderGeometry(0.03, 0.03, 1, 6), toyMat('#4b4766', 'satin'), 0, -0.5, 0, 0, 0, 0, false, false);
  const load = new THREE.Group();
  put(load, new THREE.SphereGeometry(0.16, 10, 8), yellow, 0, 0.05, 0);
  put(load, roundedBox(0.9, 0.9, 0.9, 0.2), toyMat('#7fd8ff'), 0, -0.55, 0);
  hook.add(load);
  top.add(hook);
  group.add(top);

  // ── ABC block pyramid ──
  const bx = -1.3, bz = -0.9;
  const rows: { y: number; xs: number[]; cols: string[]; chars: string[] }[] = [
    { y: 0.45, xs: [-0.95, 0, 0.95], cols: ['#ff8fb1', '#7fd8ff', '#ffd166'], chars: ['A', 'B', 'C'] },
    { y: 1.38, xs: [-0.475, 0.475], cols: ['#5fd3a5', '#c9a7ff'], chars: ['1', '2'] },
    { y: 2.31, xs: [0], cols: ['#ffb38a'], chars: ['⭐'] },
  ];
  for (const row of rows)
    row.xs.forEach((x, i) => {
      put(fixed, roundedBox(0.9, 0.9, 0.9, 0.2), toyMat(row.cols[i]), bx + x, row.y, bz);
      decalItems.push({ char: row.chars[i], x: bx + x, y: row.y, z: bz + 0.46, size: 0.58 });
    });
  circle(bx, bz, 1.6);
  // a couple of loose blocks
  put(fixed, roundedBox(0.8, 0.8, 0.8, 0.18), toyMat('#ffd166'), 0.2, 0.4, 0.8, 0, 0.5, 0);
  put(fixed, roundedBox(0.7, 0.7, 0.7, 0.16), toyMat('#ff8fb1'), 1.0, 0.35, 0.55, 0, -0.3, 0);
  put(fixed, roundedBox(0.6, 0.6, 0.6, 0.14), toyMat('#9d8cff'), 0.25, 1.1, 0.8, 0.0, 0.9, 0.0);
  circle(0.55, 0.7, 1.05);

  // ── plank pile ──
  const plankCols = ['#ffd6a5', '#ffc4a0', '#f9e0a8', '#ffcfd8'];
  plankCols.forEach((c, i) => put(fixed, roundedBox(1.8, 0.15, 0.55, 0.06), toyMat(c, 'satin'), -1.7 + (i % 2) * 0.08, 0.1 + i * 0.16, 1.8 + (i % 3) * 0.04, 0, 0.08 * (i - 1.5), 0));
  circle(-1.7, 1.8, 1.05);

  // ── sand heap with a shovel ──
  const sand = put(fixed, new THREE.SphereGeometry(1, 18, 12), toyMat('#f5deb3', 'matte'), 0.1, 0.0, -2.3);
  sand.scale.set(0.95, 0.65, 0.9);
  put(fixed, new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), wood, 0.3, 0.8, -2.2, 0.25, 0, 0.5);
  put(fixed, roundedBox(0.36, 0.05, 0.4, 0.02), toyMat('#d9d6ee', 'metal'), 0.0, 1.32, -2.3, 0.25, 0, 0.5);
  circle(0.1, -2.3, 0.95);

  // ── cones at the gate ──
  for (const sx of [-1, 1]) {
    const x = sx * 2.2, z = 3.1;
    put(fixed, roundedBox(0.8, 0.1, 0.8, 0.04), orange, x, 0.05, z);
    put(fixed, new THREE.ConeGeometry(0.3, 0.8, 14), orange, x, 0.52, z);
    put(fixed, new THREE.CylinderGeometry(0.17, 0.2, 0.12, 14), white, x, 0.5, z);
    circle(x, z, 0.4);
  }

  // ── 🔨 sign ──
  const sx0 = 1.6, sz0 = 2.3;
  for (const o of [-0.6, 0.6]) put(fixed, new THREE.CylinderGeometry(0.09, 0.11, 2.0, 10), wood, sx0 + o, 1.0, sz0);
  put(fixed, roundedBox(1.75, 1.4, 0.16, 0.18), pink, sx0, 1.7, sz0);
  put(fixed, roundedBox(1.5, 1.15, 0.18, 0.15), cream, sx0, 1.7, sz0 + 0.02);
  decalItems.push({ char: '🔨', x: sx0, y: 1.7, z: sz0 + 0.12, size: 1.0 });
  circle(sx0, sz0, 0.95);

  // ── rainbow picket fence with a gate gap facing the road ──
  const palette = ['#ff8fb1', '#ffd166', '#5fd3a5', '#7fd8ff', '#c9a7ff', '#ffb38a'];
  const picket = new InstanceBatch(roundedBox(0.32, 1.0, 0.14, 0.06, 1), toyMat('#ffffff', 'gloss'));
  const rail = new InstanceBatch(roundedBox(0.56, 0.08, 0.08, 0.03, 1), cream, true, false);
  const total = Math.PI * 2 - GAP * 2;
  const n = Math.round((YARD_R * total) / 0.5);
  for (let i = 0; i <= n; i++) {
    const a = GAP + (i / n) * total;
    const x = YARD_R * Math.sin(a), z = YARD_R * Math.cos(a);
    picket.add(x, 0.5, z, a, 1, 1, 1, palette[i % palette.length]);
    if (i < n) {
      const am = GAP + ((i + 0.5) / n) * total;
      const mx = YARD_R * Math.sin(am), mz = YARD_R * Math.cos(am);
      rail.add(mx, 0.3, mz, am);
      rail.add(mx, 0.72, mz, am);
    }
    if (i % 2 === 0) circle(x, z, 0.55);
  }
  const pm = picket.build();
  if (pm) group.add(pm);
  const rm = rail.build();
  if (rm) group.add(rm);

  group.add(bakeStatic(fixed), decalAtlas(decalItems));

  return {
    group,
    colliders,
    update(_dt: number, t: number) {
      top.rotation.y = 0.35 + Math.sin(t * 0.32) * 0.95;
      const drop = 1.7 + Math.sin(t * 0.9) * 0.9;
      hook.position.y = 0.45;
      cable.scale.y = drop;
      cable.position.y = -drop / 2;
      load.position.y = -drop;
      load.rotation.y = Math.sin(t * 0.7) * 0.4;
    },
  };
}
