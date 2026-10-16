// Street furniture and small props, drawn into a district's Mesher (so a whole
// street of lamps, benches and bins is a couple of draw calls).
import type { Collider } from '../world/townEnv';
import { Mesher } from './mesher';
import { mat } from './kit';
import { PAL } from './palette';

export interface PropOut { colliders: Collider[] }

const circle = (x: number, z: number, r: number): Collider => ({ kind: 'circle', x, z, r });

/** Modern LED street lamp. The arm reaches `yaw` direction (towards the road). */
export function lamp(m: Mesher, out: PropOut, x: number, z: number, yaw = 0, h = 6.6): void {
  const metal = mat.std('#4b4f5c', 0.4, 0.7);
  m.push(x, z, yaw);
  m.cyl(metal, 0, 0, 0, 0.16, 0.1, h, 8);
  m.cyl(metal, 0, 0, 0, 0.26, 0.26, 0.3, 8);
  m.box(metal, 0, h + 0.05, 0.9, 0.12, 0.12, 1.8);
  m.box(mat.neon('#fff1c8'), 0, h - 0.04, 1.65, 0.5, 0.1, 0.9);
  m.pop();
  out.colliders.push(circle(x, z, 0.3));
}

/** Traffic light (decor only): pole, arm over the road, signal box. */
export function trafficLight(m: Mesher, out: PropOut, x: number, z: number, yaw: number, armLen = 4.6): void {
  const metal = mat.std('#2d3038', 0.5, 0.5);
  m.push(x, z, yaw);
  m.cyl(metal, 0, 0, 0, 0.14, 0.12, 5.8, 8);
  m.box(metal, 0, 5.6, armLen / 2, 0.12, 0.12, armLen);
  for (const dz of [armLen - 0.4]) {
    m.box(metal, 0, 5.3, dz, 0.46, 1.3, 0.34);
    m.box(mat.neon('#ff3b3b'), 0, 5.7, dz + 0.18, 0.26, 0.26, 0.04);
    m.box(mat.neon('#5a4a0a'), 0, 5.3, dz + 0.18, 0.26, 0.26, 0.04);
    m.box(mat.neon('#3bff7a'), 0, 4.9, dz + 0.18, 0.26, 0.26, 0.04);
  }
  m.box(metal, 0, 4.1, 0.2, 0.3, 0.45, 0.14); // pedestrian signal
  m.pop();
  out.colliders.push(circle(x, z, 0.28));
}

export function bench(m: Mesher, out: PropOut, x: number, z: number, yaw: number): void {
  const wood = mat.wood();
  const metal = mat.std('#2d3038', 0.5, 0.6);
  m.push(x, z, yaw);
  m.box(wood, 0, 0.5, 0, 1.9, 0.1, 0.5);
  m.box(wood, 0, 0.9, -0.25, 1.9, 0.5, 0.08);
  for (const sx of [-0.8, 0.8]) m.box(metal, sx, 0.25, 0, 0.08, 0.5, 0.45);
  m.pop();
  out.colliders.push({ kind: 'box', x, z, hw: Math.abs(Math.cos(yaw)) * 0.95 + Math.abs(Math.sin(yaw)) * 0.3, hd: Math.abs(Math.sin(yaw)) * 0.95 + Math.abs(Math.cos(yaw)) * 0.3 });
}

export function bin(m: Mesher, out: PropOut, x: number, z: number, color = '#3d6b4f'): void {
  m.cyl(mat.std(color, 0.6), x, 0, z, 0.36, 0.32, 0.95, 10);
  m.cyl(mat.std('#23222a', 0.5), x, 0.95, z, 0.38, 0.38, 0.08, 10);
  out.colliders.push(circle(x, z, 0.4));
}

export function hydrant(m: Mesher, x: number, z: number): void {
  m.cyl(mat.std('#d4262d', 0.5), x, 0, z, 0.2, 0.17, 0.7, 8);
  m.cyl(mat.std('#d4262d', 0.5), x, 0.7, z, 0.12, 0.12, 0.14, 8);
}

export function bollard(m: Mesher, out: PropOut, x: number, z: number, color = '#ffc93c'): void {
  m.cyl(mat.std('#3a3d47', 0.6), x, 0, z, 0.13, 0.13, 0.85, 8);
  m.cyl(mat.std(color, 0.5), x, 0.78, z, 0.13, 0.13, 0.1, 8);
  out.colliders.push(circle(x, z, 0.22));
}

export function busStop(m: Mesher, out: PropOut, x: number, z: number, yaw: number): void {
  const metal = mat.std('#2d3038', 0.5, 0.5);
  const glass = mat.glass();
  m.push(x, z, yaw);
  m.box(metal, 0, 2.6, 0, 3.4, 0.12, 1.5);
  for (const sx of [-1.6, 1.6]) m.box(metal, sx, 1.3, -0.65, 0.1, 2.6, 0.1);
  m.box(glass, 0, 1.3, -0.7, 3.2, 2.2, 0.05);
  m.box(mat.wood(), 0, 0.5, -0.3, 2.4, 0.1, 0.5);
  m.box(mat.neon('#00d4ff'), 0, 2.5, 0.7, 3.2, 0.05, 0.05);
  m.pop();
  out.colliders.push({ kind: 'box', x, z, hw: Math.abs(Math.cos(yaw)) * 1.7 + Math.abs(Math.sin(yaw)) * 0.8, hd: Math.abs(Math.sin(yaw)) * 1.7 + Math.abs(Math.cos(yaw)) * 0.8 });
}

export function planter(m: Mesher, out: PropOut, x: number, z: number, w = 1.6, d = 1.6): void {
  m.box(mat.concrete(), x, 0.35, z, w, 0.7, d);
  m.box(mat.std('#4a3626', 1), x, 0.72, z, w - 0.2, 0.06, d - 0.2);
  out.colliders.push({ kind: 'box', x, z, hw: w / 2, hd: d / 2 });
}

/** Home Hills mailbox with a flag; the owner's name is shown as a DOM name tag. */
export function mailbox(m: Mesher, out: PropOut, x: number, z: number, yaw: number, color = '#2c3e5c'): void {
  m.push(x, z, yaw);
  m.box(mat.wood(), 0, 0.55, 0, 0.12, 1.1, 0.12);
  m.box(mat.std(color, 0.4, 0.4), 0, 1.2, 0, 0.5, 0.34, 0.8);
  m.box(mat.std('#d4262d', 0.5), 0.3, 1.34, 0.1, 0.05, 0.3, 0.1);
  m.pop();
  out.colliders.push(circle(x, z, 0.3));
}

/** A parked low-poly car (static decor). */
export function parkedCar(m: Mesher, out: PropOut, x: number, z: number, yaw: number, color: string): void {
  const paint = mat.paint(color);
  const dark = mat.std('#1d1b26', 0.5);
  const glass = mat.std('#2a3b52', 0.1, 0.5);
  m.push(x, z, yaw);
  m.box(paint, 0, 0.62, 0, 1.9, 0.7, 4.3);
  m.box(glass, 0, 1.17, -0.1, 1.7, 0.55, 2.2);
  m.box(paint, 0, 1.47, -0.1, 1.6, 0.08, 2.0);
  for (const sx of [-0.92, 0.92])
    for (const sz of [-1.35, 1.35]) m.box(dark, sx, 0.34, sz, 0.22, 0.68, 0.68);
  m.box(mat.neon('#fff1c8'), -0.6, 0.72, -2.16, 0.4, 0.14, 0.06);
  m.box(mat.neon('#fff1c8'), 0.6, 0.72, -2.16, 0.4, 0.14, 0.06);
  m.box(mat.neon('#ff3b3b'), -0.6, 0.78, 2.16, 0.4, 0.12, 0.06);
  m.box(mat.neon('#ff3b3b'), 0.6, 0.78, 2.16, 0.4, 0.12, 0.06);
  m.pop();
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  out.colliders.push({ kind: 'box', x, z, hw: c * 0.95 + s * 2.15, hd: s * 0.95 + c * 2.15, h: 1.5 });
}

/** A wooden picnic table. */
export function picnic(m: Mesher, out: PropOut, x: number, z: number, yaw: number): void {
  const wood = mat.wood();
  m.push(x, z, yaw);
  m.box(wood, 0, 0.78, 0, 2.0, 0.08, 0.9);
  for (const sz of [-0.8, 0.8]) m.box(wood, 0, 0.46, sz, 2.0, 0.08, 0.3);
  for (const sx of [-0.8, 0.8]) m.box(wood, sx, 0.4, 0, 0.1, 0.8, 1.8);
  m.pop();
  out.colliders.push({ kind: 'box', x, z, hw: Math.abs(Math.cos(yaw)) * 1.0 + Math.abs(Math.sin(yaw)) * 1.0, hd: Math.abs(Math.sin(yaw)) * 1.0 + Math.abs(Math.cos(yaw)) * 1.0 });
}

export const accent = PAL;
