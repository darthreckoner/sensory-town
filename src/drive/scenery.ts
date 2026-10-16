// Scenery: lollipop trees, pines, bushes, flower patches, street lamps and a
// low hedge around the edge of the map. Placed with seeded() so the town
// looks the same every time, only where townLayout.isReserved() allows, and
// drawn with a handful of InstancedMeshes.
import * as THREE from 'three';
import {
  BOUNDS, JOB_SPOTS, RING, ROAD_WIDTH, SPAWN, LANDMARKS,
  isReserved, onRoad, plotAt, seeded,
} from '../world/townLayout';
import { tuning } from '../tuning';
import { toyMat, roundedBox } from '../art/materials';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { InstanceBatch, smoothstep } from './envUtils';
import { SIDEWALK } from './terrain';

/** Anything big that scenery must stay clear of (circle or box). */
export type Keepout =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number };

interface Placed { x: number; z: number; r: number }

const TAU = Math.PI * 2;
const GREENS = ['#8fe0a8', '#a3e68f', '#7fd8b0', '#9be8a0', '#86dca0'];
const BLOSSOM = ['#ffb3d1', '#ffc2da', '#c9a7ff', '#ffd68a'];
const PINES = ['#5fc7a0', '#6fd4a8', '#79d3a2', '#8fd9b0'];
const FLOWERS = ['#ff8fb1', '#ffd166', '#ffffff', '#c9a7ff', '#7fd8ff', '#ffb38a', '#ff5d8f'];

export function buildScenery(keepouts: Keepout[]): Piece {
  const d = tuning.drive;
  const rng = seeded(d.scenerySeed);
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const placed: Placed[] = [];

  // ── placement rules ──
  const blocked = (x: number, z: number, margin: number): boolean => {
    for (const k of keepouts) {
      if (k.kind === 'circle') {
        if (Math.hypot(x - k.x, z - k.z) < k.r + margin) return true;
      } else if (Math.abs(x - k.x) < k.hw + margin && Math.abs(z - k.z) < k.hd + margin) return true;
    }
    return false;
  };
  const allowed = (x: number, z: number, r: number): boolean => {
    if (Math.abs(x) > BOUNDS - 3 || Math.abs(z) > BOUNDS - 3) return false;
    if (isReserved(x, z)) return false;
    if (onRoad(x, z, SIDEWALK + 1.3)) return false;      // keep clear of the sidewalks
    if (plotAt(x, z, 2.4)) return false;                  // breathing room around house plots
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) return false;
    for (const s of JOB_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 4.6) return false;
    for (const l of LANDMARKS) if (Math.hypot(x - l.x, z - l.z) < l.radius + 3.2) return false;
    if (blocked(x, z, 1.8 + r)) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < p.r + r + 0.5) return false;
    return true;
  };
  /** Pick a spot; more likely towards the outskirts so the middle of town stays airy. */
  const pick = (r: number, tries = 60): { x: number; z: number } | null => {
    for (let i = 0; i < tries; i++) {
      const x = (rng() * 2 - 1) * (BOUNDS - 3), z = (rng() * 2 - 1) * (BOUNDS - 3);
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (rng() > 0.3 + 0.7 * smoothstep(24, 48, edge)) continue;
      if (allowed(x, z, r)) {
        placed.push({ x, z, r });
        return { x, z };
      }
    }
    return null;
  };

  // ── batches ──
  const trunk = new InstanceBatch(new THREE.CylinderGeometry(0.17, 0.26, 1, 8), toyMat('#c79a78', 'satin'));
  const canopy = new InstanceBatch(new THREE.SphereGeometry(1, 12, 9), toyMat('#ffffff', 'gloss'));
  const cone = new InstanceBatch(new THREE.ConeGeometry(1, 1, 10), toyMat('#ffffff', 'satin'));
  const bush = new InstanceBatch(new THREE.SphereGeometry(1, 10, 8), toyMat('#ffffff', 'satin'));
  const berry = new InstanceBatch(new THREE.SphereGeometry(1, 6, 4), toyMat('#ffffff', 'gloss'), false, false);
  const stem = new InstanceBatch(new THREE.CylinderGeometry(0.02, 0.025, 1, 5), toyMat('#6fc48b', 'matte'), false, false);
  const bloom = new InstanceBatch(new THREE.SphereGeometry(1, 6, 4), toyMat('#ffffff', 'satin'), false, false);
  const pole = new InstanceBatch(new THREE.CylinderGeometry(0.07, 0.1, 1, 8), toyMat('#a49fc4', 'metal'));
  const lampBase = new InstanceBatch(new THREE.CylinderGeometry(0.2, 0.28, 0.3, 10), toyMat('#8f8aab', 'metal'));
  const globe = new InstanceBatch(new THREE.SphereGeometry(0.3, 12, 10), toyMat('#fff0b8', 'emissive'), false, false);
  const hedge = new InstanceBatch(roundedBox(3.7, 1.5, 1.4, 0.5, 1), toyMat('#ffffff', 'satin'), false, true);

  const circle = (x: number, z: number, r: number): void => {
    colliders.push({ kind: 'circle', x, z, r });
  };

  // ── lollipop trees ──
  for (let i = 0; i < d.sceneryTrees; i++) {
    const s = 0.85 + rng() * 0.6;
    const p = pick(1.6 * s);
    if (!p) continue;
    const th = (1.5 + rng() * 0.7) * s;
    trunk.add(p.x, th / 2, p.z, 0, s, th, s);
    const c = rng() < 0.62 ? GREENS[(rng() * GREENS.length) | 0] : BLOSSOM[(rng() * BLOSSOM.length) | 0];
    const R = 1.25 * s;
    const cy = th + R * 0.55;
    canopy.add(p.x, cy, p.z, 0, R, R * 0.94, R, c);
    canopy.add(p.x + R * 0.62, cy - R * 0.3, p.z + R * 0.2, 0, R * 0.62, R * 0.58, R * 0.62, c);
    canopy.add(p.x - R * 0.55, cy - R * 0.34, p.z - R * 0.3, 0, R * 0.58, R * 0.54, R * 0.58, c);
    circle(p.x, p.z, 0.55 * s);
  }
  // ── pines ──
  for (let i = 0; i < d.sceneryPines; i++) {
    const s = 0.85 + rng() * 0.7;
    const p = pick(1.5 * s);
    if (!p) continue;
    trunk.add(p.x, 0.5 * s, p.z, 0, s * 0.9, 1.0 * s, s * 0.9);
    const c = PINES[(rng() * PINES.length) | 0];
    cone.add(p.x, 1.35 * s, p.z, 0, 1.55 * s, 1.7 * s, 1.55 * s, c);
    cone.add(p.x, 2.4 * s, p.z, 0, 1.2 * s, 1.5 * s, 1.2 * s, c);
    cone.add(p.x, 3.3 * s, p.z, 0, 0.85 * s, 1.4 * s, 0.85 * s, c);
    circle(p.x, p.z, 0.6 * s);
  }
  // ── bushes (some with berries) ──
  const berryCols = ['#ff5d8f', '#7fd8ff', '#ffd166', '#ffffff'];
  for (let i = 0; i < d.sceneryBushes; i++) {
    const s = 0.6 + rng() * 0.55;
    const p = pick(0.9 * s);
    if (!p) continue;
    const c = GREENS[(rng() * GREENS.length) | 0];
    bush.add(p.x, 0.5 * s, p.z, 0, s, s * 0.78, s, c);
    if (rng() < 0.6) bush.add(p.x + s * 0.7, 0.35 * s, p.z + s * 0.2, 0, s * 0.62, s * 0.5, s * 0.62, c);
    if (rng() < 0.4) {
      const bc = berryCols[(rng() * berryCols.length) | 0];
      for (let k = 0; k < 5; k++) {
        const a = rng() * TAU, h = 0.4 + rng() * 0.45;
        berry.add(p.x + Math.cos(a) * s * 0.85, 0.5 * s + h * s * 0.5, p.z + Math.sin(a) * s * 0.85, 0, 0.1, 0.1, 0.1, bc);
      }
    }
    circle(p.x, p.z, 0.75 * s);
  }
  // ── flower patches (no colliders, you drive over them) ──
  const addPatch = (cx: number, cz: number, n: number, rad: number, col: string): void => {
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * rad;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const h = 0.32 + rng() * 0.3;
      stem.add(x, h / 2, z, 0, 1, h, 1);
      bloom.add(x, h + 0.02, z, rng() * TAU, 0.13, 0.08, 0.13, rng() < 0.2 ? '#ffffff' : col);
    }
  };
  for (let i = 0; i < d.sceneryFlowerPatches; i++) {
    const p = pick(1.0, 80);
    if (!p) continue;
    addPatch(p.x, p.z, 6 + ((rng() * 5) | 0), 0.9, FLOWERS[(rng() * FLOWERS.length) | 0]);
  }
  // A ring of flowerbeds around the fountain.
  const fountain = LANDMARKS.find((l) => l.id === 'fountain');
  if (fountain) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      addPatch(fountain.x + Math.cos(a) * 3.55, fountain.z + Math.sin(a) * 3.55, 4, 0.45, FLOWERS[i % FLOWERS.length]);
    }
  }

  // ── street lamps along the sidewalks ──
  const lampPlaces: [number, number][] = [];
  const inner = RING - ROAD_WIDTH / 2 - SIDEWALK / 2;
  const outer = RING + ROAD_WIDTH / 2 + SIDEWALK / 2;
  for (let t = -27; t <= 27.01; t += 13.5)
    for (const o of [inner, outer]) {
      lampPlaces.push([t, -o], [t, o], [-o, t], [o, t]);
    }
  for (let x = -24; x <= 24; x += 12) lampPlaces.push([x, -(ROAD_WIDTH / 2 + SIDEWALK / 2)], [x, ROAD_WIDTH / 2 + SIDEWALK / 2]);
  for (const [x, z] of lampPlaces) {
    if (onRoad(x, z, 0.1)) continue;
    if (blocked(x, z, 0.6)) continue;
    if (plotAt(x, z, 0.1)) continue;
    // Keep the first seconds clear: nothing near the spawn or straight along its heading.
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 11) continue;
    const ahead = (x - SPAWN.x) * Math.sin(SPAWN.heading) - (z - SPAWN.z) * Math.cos(SPAWN.heading);
    const side = (x - SPAWN.x) * Math.cos(SPAWN.heading) + (z - SPAWN.z) * Math.sin(SPAWN.heading);
    if (ahead > 0 && ahead < 45 && Math.abs(side) < 3) continue;
    pole.add(x, 1.7, z, 0, 1, 3.4, 1);
    lampBase.add(x, 0.15, z);
    globe.add(x, 3.55, z);
    circle(x, z, 0.3);
  }

  // ── hedge ring just outside BOUNDS ──
  const hedgeCols = ['#7fd48f', '#8be09a', '#73cc88', '#86dc96'];
  const hedgeAt = BOUNDS + 0.7;
  const seg = 3.6;
  const count = Math.ceil((BOUNDS + 1.5) * 2 / seg);
  let hi = 0;
  for (let i = 0; i < count; i++) {
    const t = -BOUNDS - 1.5 + (i + 0.5) * seg;
    const c = hedgeCols[hi++ % hedgeCols.length];
    hedge.add(t, 0.75, -hedgeAt, 0, 1, 1, 1, c);
    hedge.add(t, 0.75, hedgeAt, 0, 1, 1, 1, c);
    hedge.add(-hedgeAt, 0.75, t, Math.PI / 2, 1, 1, 1, c);
    hedge.add(hedgeAt, 0.75, t, Math.PI / 2, 1, 1, 1, c);
    // a few blossoms on top (slid along the hedge direction)
    for (let k = 0; k < 4; k++) {
      if (rng() > 0.55) continue;
      const col = BLOSSOM[(rng() * BLOSSOM.length) | 0];
      const o = t + (rng() - 0.5) * (seg - 0.6);
      const sideOff = (rng() - 0.5) * 0.6;
      if (k === 0) bloom.add(o, 1.52, -hedgeAt + sideOff, 0, 0.2, 0.14, 0.2, col);
      else if (k === 1) bloom.add(o, 1.52, hedgeAt + sideOff, 0, 0.2, 0.14, 0.2, col);
      else if (k === 2) bloom.add(-hedgeAt + sideOff, 1.52, o, 0, 0.2, 0.14, 0.2, col);
      else bloom.add(hedgeAt + sideOff, 1.52, o, 0, 0.2, 0.14, 0.2, col);
    }
  }

  for (const b of [trunk, canopy, cone, bush, berry, stem, bloom, pole, lampBase, globe, hedge]) {
    const m = b.build();
    if (m) group.add(m);
  }
  return { group, colliders };
}
