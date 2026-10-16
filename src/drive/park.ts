// Park & Lake: an arched bridge across the lake, a gazebo, a dock with
// rowboats, a hedge maze (corridors too narrow for a car), a playground,
// picnic lawns, trail signs and lake reeds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGES, PIERS, WATER_Y } from '../world/townLayout';
import { LAKE, groundHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat } from './kit';
import { PAL } from './palette';
import { bakeStatic, mergeStaticGroups, roundedRectShape } from './envUtils';
import { seeded } from '../world/townLayout';
import { bench, bin, lamp, picnic } from './props';

export interface ParkOut extends Piece {
  trees: { x: number; z: number; kind: 'oak' | 'birch'; scale: number }[];
}

const MAZE = { cx: 123, cz: -128, cells: 8, cell: 3.0, wall: 1.0 };

/** Seeded depth-first maze: returns walls as merged axis-aligned boxes (centre + half sizes). */
function mazeWalls(): { x: number; z: number; hw: number; hd: number }[] {
  const n = MAZE.cells, rng = seeded(555);
  const visited = Array.from({ length: n }, () => Array(n).fill(false));
  // open[x][z] = [east, south] passages
  const east = Array.from({ length: n }, () => Array(n).fill(false));
  const south = Array.from({ length: n }, () => Array(n).fill(false));
  const stack: [number, number][] = [[Math.floor(n / 2), n - 1]];
  visited[Math.floor(n / 2)][n - 1] = true;
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const nb: [number, number, number][] = [];
    if (x + 1 < n && !visited[x + 1][z]) nb.push([x + 1, z, 0]);
    if (x - 1 >= 0 && !visited[x - 1][z]) nb.push([x - 1, z, 1]);
    if (z + 1 < n && !visited[x][z + 1]) nb.push([x, z + 1, 2]);
    if (z - 1 >= 0 && !visited[x][z - 1]) nb.push([x, z - 1, 3]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [nx, nz, dir] = nb[(rng() * nb.length) | 0];
    if (dir === 0) east[x][z] = true;
    else if (dir === 1) east[nx][nz] = true;
    else if (dir === 2) south[x][z] = true;
    else south[nx][nz] = true;
    visited[nx][nz] = true;
    stack.push([nx, nz]);
  }
  const c = MAZE.cell, x0 = MAZE.cx - (n * c) / 2, z0 = MAZE.cz - (n * c) / 2, t = MAZE.wall;
  const walls: { x: number; z: number; hw: number; hd: number }[] = [];
  // horizontal wall lines (between rows), merged along runs
  for (let zl = 0; zl <= n; zl++) {
    let run = -1;
    for (let x = 0; x <= n; x++) {
      const solid = x < n && (zl === 0 || (zl === n ? x !== Math.floor(n / 2) : !south[x][zl - 1]));
      if (solid && run < 0) run = x;
      if (!solid && run >= 0) {
        walls.push({ x: x0 + ((run + x) / 2) * c, z: z0 + zl * c, hw: ((x - run) * c + t) / 2, hd: t / 2 });
        run = -1;
      }
    }
  }
  for (let xl = 0; xl <= n; xl++) {
    let run = -1;
    for (let z = 0; z <= n; z++) {
      const solid = z < n && (xl === 0 || xl === n || !east[xl - 1][z]);
      if (solid && run < 0) run = z;
      if (!solid && run >= 0) {
        walls.push({ x: x0 + xl * c, z: z0 + ((run + z) / 2) * c, hw: t / 2, hd: ((z - run) * c + t) / 2 });
        run = -1;
      }
    }
  }
  return walls;
}

export function buildPark(): ParkOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const colliders: Collider[] = [];
  const out = { colliders };
  const trees: ParkOut['trees'] = [];
  const G = (x: number, z: number): number => groundHeight(x, z);
  const concrete = mat.concrete();
  const trim = mat.trim();
  const wood = mat.wood();
  const white = mat.std('#f3f2ee', 0.8);

  // ── the lake bridge (arched deck, parapets with an LED rail, piers) ──
  const br = BRIDGES[0];
  {
    const L = br.bx - br.ax;
    const seg = 2;
    const lift = 0.05;
    for (let u = 0; u < L; u += seg) {
      const xa = br.ax + u, xb = Math.min(br.bx, xa + seg);
      const ya = G(xa, br.az), yb = G(xb, br.az);
      const hw = br.w / 2;
      // deck slab (top is the drivable surface); a thick fascia below it
      m.quad(concrete, [xa, ya - 0.02, br.az + hw + 0.5], [xb, yb - 0.02, br.az + hw + 0.5], [xb, yb - 0.02, br.az - hw - 0.5], [xa, ya - 0.02, br.az - hw - 0.5]);
      for (const s of [-1, 1]) {
        const z = br.az + s * (hw + 0.5);
        const n = s > 0 ? [0, 0, 1] : [0, 0, -1];
        void n;
        m.quad(concrete, [xa, ya - 0.7, z], [xb, yb - 0.7, z], [xb, yb - 0.02, z], [xa, ya - 0.02, z]);
        // parapet
        const px = (xa + xb) / 2, py = (ya + yb) / 2;
        m.box(concrete, px, py + 0.5, br.az + s * (hw + 0.2), xb - xa + 0.02, 1.0, 0.4);
        m.box(mat.neon(PAL.cyan), px, py + 1.05, br.az + s * (hw + 0.2), xb - xa, 0.06, 0.1);
        colliders.push({ kind: 'box', x: px, z: br.az + s * (hw + 0.2), hw: (xb - xa) / 2 + 0.02, hd: 0.25, h: py + 1.0, y0: py - 0.1 });
      }
      void lift;
    }
    // piers: concrete columns from the lake bed to the deck
    for (const px of [72, 88, 104]) {
      const top = G(px, br.az) - 0.6;
      for (const s of [-1, 1]) m.box(concrete, px, (top - 1.8) / 2 - 0.0, br.az + s * (br.w / 2 - 0.4), 1.4, top + 1.8, 1.2);
    }
    // lamps on the bridge
    for (const px of [68, 80, 92, 104, 116]) {
      lamp(m, out, px, br.az + br.w / 2 - 0.1, Math.PI, 4.6);
      lamp(m, out, px + 6, br.az - br.w / 2 + 0.1, 0, 4.6);
    }
  }

  // ── gazebo (octagon, slate roof) ──
  {
    const x = 60, z = -76;
    const R = 3.4;
    // seated on the LOWEST ground under it, with a plinth whose top is only 10 cm above that: nobody stands inside the floor
    let gy = G(x, z);
    for (let k = 0; k < 8; k++) gy = Math.min(gy, G(x + Math.cos((k / 8) * Math.PI * 2) * (R + 0.2), z + Math.sin((k / 8) * Math.PI * 2) * (R + 0.2)));
    m.cyl(wood, x, gy - 0.7, z, R + 0.2, R + 0.2, 0.8, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = x + Math.cos(a) * (R - 0.2), pz = z + Math.sin(a) * (R - 0.2);
      m.box(white, px, gy + 1.9, pz, 0.28, 3.0, 0.28);
      colliders.push({ kind: 'circle', x: px, z: pz, r: 0.3 });
      if (i !== 2 && i !== 6) {
        const a2 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
        const qx = x + Math.cos(a2) * (R - 0.2), qz = z + Math.sin(a2) * (R - 0.2);
        m.box(white, (px + qx) / 2, gy + 1.0, (pz + qz) / 2, Math.hypot(px - qx, pz - qz), 0.08, 0.08, { yaw: -Math.atan2(qz - pz, qx - px) });
        m.box(white, (px + qx) / 2, gy + 0.6, (pz + qz) / 2, Math.hypot(px - qx, pz - qz), 0.05, 0.05, { yaw: -Math.atan2(qz - pz, qx - px) });
        for (const t of [0.25, 0.5, 0.75]) colliders.push({ kind: 'circle', x: px + (qx - px) * t, z: pz + (qz - pz) * t, r: 0.2, h: gy + 1.2 }); // the rails
      }
    }
    m.cyl(mat.std('#3a3a44', 0.85), x, gy + 3.4, z, R + 0.9, 0.12, 1.9, 8);
    m.cyl(mat.neon('#ffd98a'), x, gy + 3.25, z, 0.14, 0.14, 0.14, 6);
    m.box(wood, x, gy + 0.55, z, 3.0, 0.1, 0.5); // a bench in the middle
    colliders.push({ kind: 'box', x, z, hw: 1.55, hd: 0.3, h: gy + 2 }); // (h is tall: a walker standing at bench height must not skip it as "on the roof")
    colliders.push({ kind: 'circle', x, z, r: R + 0.4, only: 'car' });
  }

  // ── the dock + rowboats ──
  const dock = PIERS.find((p) => p.id === 'dock')!;
  {
    const len = Math.abs(dock.bz - dock.az);
    const zc = (dock.az + dock.bz) / 2;
    m.box(wood, dock.ax, dock.y - 0.1, zc, dock.w, 0.18, len);
    for (let z = Math.min(dock.az, dock.bz); z <= Math.max(dock.az, dock.bz); z += 1.6)
      for (const s of [-1, 1]) m.box(wood, dock.ax + s * (dock.w / 2 - 0.1), WATER_Y - 0.5, z, 0.14, 1.9, 0.14);
    m.box(mat.neon('#ffd98a'), dock.ax, dock.y + 0.9, dock.bz + 0.2, 0.18, 0.18, 0.18);
    m.cyl(wood, dock.ax, dock.y, dock.bz + 0.2, 0.08, 0.08, 0.9, 6);
    // narrow: the car can't drive out here (on foot only)
    colliders.push({ kind: 'box', x: dock.ax, z: dock.az + 0.4, hw: 2.2, hd: 0.3, only: 'car' });
  }
  // v3 draw-call diet: the four rowboats are ONE instanced mesh (the bob and roll are matrix updates)
  const boatSpots = [[92, -83.5, 0.5], [83.5, -85, -0.3], [97, -90, 1.4], [80, -92, 0.9]];
  let boatMesh: THREE.InstancedMesh | null = null;
  {
    const shape = new THREE.Shape();
    shape.moveTo(-1.8, 0);
    shape.quadraticCurveTo(-1.2, 0.7, 0.3, 0.72);
    shape.quadraticCurveTo(1.5, 0.6, 2.0, 0);
    shape.quadraticCurveTo(1.5, -0.6, 0.3, -0.72);
    shape.quadraticCurveTo(-1.2, -0.7, -1.8, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    const cols = ['#d4262d', '#2c3e5c', '#f3f2ee', '#ffc93c'];
    // a thwart across the middle, merged into the hull
    const bare = geo.index ? geo.toNonIndexed() : geo;
    const thwart = new THREE.BoxGeometry(0.08, 0.06, 1.2).translate(0.1, 0.34, 0).toNonIndexed();
    for (const g of [bare, thwart]) for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    const hull = mergeGeometries([bare, thwart], false);
    boatMesh = new THREE.InstancedMesh(hull, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), boatSpots.length);
    boatMesh.castShadow = true;
    boatMesh.frustumCulled = false;
    boatSpots.forEach((_, i) => boatMesh!.setColorAt(i, new THREE.Color(cols[i % cols.length])));
  }
  const boatM = new THREE.Matrix4(), boatQ = new THREE.Quaternion(), boatE = new THREE.Euler(), boatP = new THREE.Vector3(), boatS = new THREE.Vector3(1, 1, 1);
  const placeBoats = (t: number): void => {
    if (!boatMesh) return;
    boatSpots.forEach(([bx, bz, rot], i) => {
      boatE.set(0, rot, Math.sin(t * 1.1 + i * 2) * 0.03);
      boatQ.setFromEuler(boatE);
      boatM.compose(boatP.set(bx, WATER_Y + 0.02 + Math.sin(t * 1.3 + i) * 0.05, bz), boatQ, boatS);
      boatMesh!.setMatrixAt(i, boatM);
    });
    boatMesh.instanceMatrix.needsUpdate = true;
  };
  placeBoats(0);

  // ── hedge maze ──
  {
    const walls = mazeWalls();
    const rng = seeded(77);
    const greens = ['#2f7a45', '#35844b', '#2a6e3e', '#3b8d4d'];
    for (const w of walls) {
      const gy = G(w.x, w.z);
      m.box(mat.vc(), w.x, gy + 1.05, w.z, w.hw * 2, 3.0, w.hd * 2, { color: greens[(rng() * greens.length) | 0] });
      m.box(mat.vc(), w.x, gy + 2.6, w.z, w.hw * 2 - 0.2, 0.3, w.hd * 2 - 0.2, { color: '#3f8f4a' });
      colliders.push({ kind: 'box', x: w.x, z: w.z, hw: w.hw, hd: w.hd, h: gy + 2.9 });
    }
    // a little fountain / statue at the very centre
    const gy = G(MAZE.cx, MAZE.cz);
    m.cyl(concrete, MAZE.cx, gy, MAZE.cz, 0.9, 0.9, 0.5, 12);
    m.cyl(mat.std('#7fd8ff', 0.1, 0.2), MAZE.cx, gy + 0.45, MAZE.cz, 0.78, 0.78, 0.06, 12);
    m.cyl(concrete, MAZE.cx, gy + 0.4, MAZE.cz, 0.18, 0.18, 1.0, 8);
    m.cyl(mat.neon(PAL.cyan), MAZE.cx, gy + 1.4, MAZE.cz, 0.25, 0.1, 0.3, 8);
    colliders.push({ kind: 'circle', x: MAZE.cx, z: MAZE.cz, r: 0.5 });
  }

  // ── playground (modern: timber slide tower, swings, climbing frame) ──
  {
    const x = 30, z = -88, gy = G(x, z);
    const steel = mat.std('#cfd3dc', 0.35, 0.8);
    const cols = [PAL.pink, PAL.cyan, PAL.gold, PAL.lime];
    m.box(mat.std('#b8805a', 0.9), x, gy + 0.05, z, 14, 0.1, 10); // rubber surface
    // tower + slide
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.box(wood, x - 4 + px, gy + 1.2, z + pz, 0.2, 2.4, 0.2);
    m.box(wood, x - 4, gy + 2.4, z, 2.4, 0.15, 2.4);
    m.box(mat.std(cols[0], 0.6), x - 4, gy + 3.5, z, 2.7, 0.15, 2.7);
    m.box(mat.std('#3a3a44', 0.8), x - 4, gy + 3.8, z, 2.0, 0.5, 2.0);
    for (let i = 0; i < 8; i++) {
      const u = i / 7;
      m.box(mat.std(cols[1], 0.4), x - 2.6 + u * 3.6, gy + 2.3 - u * 2.1, z, 0.9, 0.08, 1.1);
    }
    colliders.push({ kind: 'box', x: x - 4, z, hw: 1.5, hd: 1.5 });
    // swing frame
    for (const sx of [-1.6, 1.6]) {
      m.box(steel, x + 3 + sx, gy + 1.4, z - 1.2, 0.1, 2.8, 0.1);
      m.box(steel, x + 3 + sx, gy + 1.4, z + 1.2, 0.1, 2.8, 0.1);
    }
    m.box(steel, x + 3, gy + 2.8, z, 3.4, 0.1, 0.1);
    for (const sx of [-0.7, 0.7]) {
      m.box(mat.std('#1d1b26', 0.8), x + 3 + sx, gy + 0.55, z, 0.5, 0.06, 0.3);
      m.box(steel, x + 3 + sx - 0.2, gy + 1.7, z, 0.02, 2.2, 0.02);
      m.box(steel, x + 3 + sx + 0.2, gy + 1.7, z, 0.02, 2.2, 0.02);
    }
    colliders.push({ kind: 'circle', x: x + 1.4, z: z - 1.2, r: 0.3 }, { kind: 'circle', x: x + 4.6, z: z - 1.2, r: 0.3 });
    // a climbing dome of ropes (rings)
    for (let i = 0; i < 4; i++) m.cyl(mat.std(cols[i], 0.5), x + 0, gy + 0.1 + i * 0.7, z + 3.4, 1.8 - i * 0.4, 1.8 - i * 0.4, 0.08, 14);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m.box(steel, x + Math.cos(a) * 1.6, gy + 1.0, z + 3.4 + Math.sin(a) * 1.6, 0.06, 2.0, 0.06);
    }
    colliders.push({ kind: 'circle', x, z: z + 3.4, r: 1.9 });
  }

  // ── picnic areas, benches, lamps, bins, trail signs ──
  for (const [px, pz, yaw] of [[126, -104, 0.3], [132, -108, -0.4], [128, -98, 1.2], [66, -66, 0.6], [74, -70, -0.2]] as [number, number, number][]) picnic(m, out, px, pz, yaw);
  for (const [bx, bz, yaw] of [[48, -90, Math.PI / 2], [46, -110, Math.PI / 2], [58, -70, 0], [96, -76, 0], [124, -96, -0.5]] as [number, number, number][]) {
    bench(m, out, bx, bz, yaw);
    bin(m, out, bx + 1.4, bz + 0.6);
  }
  for (const [lx, lz] of [[46, -70], [46, -96], [54, -118], [106, -78], [118, -114], [128, -92]] as [number, number][]) lamp(m, out, lx, lz, 0, 5);
  // trail signposts
  const post = (x: number, z: number, yaw: number): void => {
    m.push(x, z, yaw);
    m.box(wood, 0, 1.0, 0, 0.14, 2.0, 0.14);
    m.box(wood, 0.4, 1.7, 0.1, 1.2, 0.3, 0.06);
    m.box(mat.neon(PAL.lime), 0.4, 1.7, 0.14, 1.0, 0.03, 0.02);
    m.pop();
    colliders.push({ kind: 'circle', x, z, r: 0.2 });
  };
  for (const [sx, sz, yaw] of [[41, -90, 0.3], [62, -124, 2.0], [110, -86, 2.6], [78, -70, 0]] as [number, number, number][]) post(sx, sz, yaw);

  // lake: lily pads + reeds (flat discs / thin boxes at the water line)
  {
    const rng = seeded(31);
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2, r = 4 + rng() * 15;
      const x = LAKE.x + Math.cos(a) * r * 1.2, z = LAKE.z + Math.sin(a) * r * 0.8;
      if (groundHeight(x, z) > WATER_Y - 0.5) continue;
      m.cyl(mat.std('#3f8f4a', 0.8), x, WATER_Y + 0.02, z, 0.55, 0.55, 0.04, 8);
      if (i % 4 === 0) m.cyl(mat.neon(PAL.pink), x, WATER_Y + 0.05, z, 0.14, 0.04, 0.16, 6);
    }
  }

  // tree sites around the playground and trails are handled by the scatter; a few hero trees by the gazebo
  trees.push({ x: 56, z: -82, kind: 'oak', scale: 1.25 }, { x: 64, z: -72, kind: 'birch', scale: 1.1 }, { x: 34, z: -80, kind: 'oak', scale: 1.2 });

  const group = new THREE.Group();
  group.name = 'park';
  group.add(mergeStaticGroups('park-static', m.build('park-static'), bakeStatic(ex)));
  if (boatMesh) group.add(boatMesh);
  void roundedRectShape;
  return {
    group,
    colliders,
    trees,
    cull: { x: 82, z: -102, r: 150 },
    update(_dt: number, t: number) {
      placeBoats(t);
    },
  };
}
