// Home Hills: the curvy residential street (lamps, street trees, entrance
// gate, dead-end barricade) and the Builder's lot (site office with its own
// door, containers, an excavator and a swinging tower crane).
// The lots themselves (FOR SALE signs, mailboxes, front doors) are dynamic and
// live in doors.ts because they depend on who owns what.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILD_YARD, HOME_SPINE_X1, PLOTS, SIDEWALK, plotFront } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { DoorDef, Piece } from './types';
import { Mesher } from './mesher';
import { bigSignTexture, mat, signs, signUV } from './kit';
import { PAL } from './palette';
import { bakeStatic, mergeStaticGroups } from './envUtils';
import { along } from './pathwalk';
import { lamp } from './props';

export interface HomeOut extends Piece {
  trees: { x: number; z: number; kind: 'oak' | 'birch'; scale: number }[];
}

export function buildHomeHills(): HomeOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const colliders: Collider[] = [];
  const out = { colliders };
  const doors: DoorDef[] = [];
  const trees: HomeOut['trees'] = [];
  const trim = mat.trim();
  const concrete = mat.concrete();
  m.push(0, 0, 0);

  // ── lamps along both streets ──
  for (const id of ['spine', 'branch']) {
    for (const sd of [-1, 1]) {
      along(id, sd, 20, 4 + SIDEWALK * 0.5 - 0.3, sd > 0 ? 6 : 16, (x, z, nx, nz) => {
        if (PLOTS.some((p) => Math.abs(x - p.center.x) < p.size / 2 + 0.2 && Math.abs(z - p.center.z) < p.size / 2 + 0.2)) return;
        lamp(m, out, x, z, Math.atan2(nx, nz), 5.4);
      });
    }
  }
  // ── a street tree in the gap beside every lot (alternating sides) ──
  PLOTS.forEach((p, i) => {
    const f = plotFront(p);
    const px = -f.nz, pz = f.nx; // perpendicular
    const side = i % 2 ? -1 : 1;
    trees.push({
      x: p.center.x + f.nx * (p.size / 2 + 1.2) + px * side * (p.size / 2 + 1.0),
      z: p.center.z + f.nz * (p.size / 2 + 1.2) + pz * side * (p.size / 2 + 1.0),
      kind: i % 3 ? 'oak' : 'birch',
      scale: 0.7,
    });
  });

  // ── entrance gate over the street: two pillars and a sign ──
  {
    const gx = -64, gz = 3 + 6 * Math.sin((gx + 62) / 24);
    const gy = groundHeight(gx, gz);
    for (const s of [-1, 1]) {
      m.box(concrete, gx, gy + 5.3, gz + s * 7.6, 1.3, 10.6, 1.3);
      m.box(mat.neon(PAL.lime), gx - 0.68, gy + 5.3, gz + s * 7.6, 0.06, 10.2, 0.12);
      colliders.push({ kind: 'box', x: gx, z: gz + s * 7.6, hw: 0.65, hd: 0.65 });
    }
    // the whole gate is raised well above the chase camera (it flies about 6-7 units up), so you drive under it, never through it
    m.box(trim, gx, gy + 10.4, gz, 0.6, 0.8, 16.4);
    // two lit faces on a slim frame: the lots behind the gate see a real sign, not a black slab
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: bigSignTexture('HOME HILLS', '#ffffff', PAL.lime, 1024, 256, 'BUILD YOUR PLACE'), toneMapped: false }));
    sign.position.set(gx + 0.39, gy + 12.6, gz);
    sign.rotation.y = Math.PI / 2;
    ex.add(sign);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: bigSignTexture('DOWNTOWN', '#ffffff', PAL.cyan, 1024, 256, 'SKATE PARK · MALL · BEACH'), toneMapped: false }));
    back.position.set(gx + 0.23, gy + 12.6, gz);
    back.rotation.y = -Math.PI / 2;
    ex.add(back);
    m.box(trim, gx + 0.31, gy + 12.6, gz, 0.14, 3.7, 14.2);
  }
  // dead-end barricade at the far end of the spine
  {
    const bx = HOME_SPINE_X1 - 0.5, bz = 3 + 6 * Math.sin((HOME_SPINE_X1 + 62) / 24);
    for (let i = 0; i < 4; i++) {
      m.box(mat.std(i % 2 ? '#f3f2ee' : '#d4262d', 0.6), bx, 0.55, bz - 3 + i * 2, 0.2, 0.5, 1.9);
    }
    colliders.push({ kind: 'box', x: bx, z: bz, hw: 0.4, hd: 4.2 });
  }

  // ── the Builder's lot ──
  const Y = BUILD_YARD;
  {
    const cx = Y.center.x, cz = Y.center.z, gy = groundHeight(cx, cz);
    // fence with a gate gap on the north side
    const fence = mat.std('#8a8d96', 0.5, 0.6);
    const post = (x: number, z: number): void => {
      m.box(trim, x, gy + 1.1, z, 0.1, 2.2, 0.1);
    };
    for (const [x0, z0, x1, z1] of [[-66, 19.2, -59.5, 19.2], [-52.5, 19.2, -46, 19.2], [-66, 37, -46, 37], [-66, 19.2, -66, 37], [-46, 19.2, -46, 37]] as number[][]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i <= steps; i++) post(x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * i) / steps);
      const yaw = -Math.atan2(z1 - z0, x1 - x0);
      m.box(fence, (x0 + x1) / 2, gy + 1.1, (z0 + z1) / 2, len, 1.9, 0.04, { yaw });
      colliders.push({ kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2 + 0.1, hd: Math.abs(z1 - z0) / 2 + 0.1 });
    }
    // gate sign with hazard stripes
    const r = signs().add("BUILDER'S LOT", { fg: '#1d1b26', glow: PAL.gold, bg: '#ffc93c', border: null });
    m.quad(signs().material, [Y.pad.x + 3.3, gy + 4.6, 19.0], [Y.pad.x - 3.3, gy + 4.6, 19.0], [Y.pad.x - 3.3, gy + 6.2, 19.0], [Y.pad.x + 3.3, gy + 6.2, 19.0], signUV(r));
    for (const s of [-1, 1]) m.box(trim, Y.pad.x + s * 3.4, gy + 2.6, 19.0, 0.2, 5.2, 0.2);
    m.box(trim, Y.pad.x, gy + 4.5, 19.0, 6.8, 0.16, 0.2);

    // site office (a cabin with a porch); its door opens build mode
    const ox = -62, oz = 25;
    m.box(mat.std('#f3f2ee', 0.7), ox, gy + 1.7, oz, 7.2, 3.2, 4.4);
    m.box(mat.std('#2c3e5c', 0.6), ox, gy + 3.45, oz, 7.6, 0.3, 4.8);
    m.box(mat.neon('#9fd8ff'), ox - 1.8, gy + 1.8, oz - 2.22, 1.6, 1.0, 0.04);
    m.box(mat.neon('#9fd8ff'), ox + 1.8, gy + 1.8, oz - 2.22, 1.6, 1.0, 0.04);
    m.box(mat.std('#ffc93c', 0.6), ox, gy + 1.15, oz - 2.22, 1.0, 2.1, 0.06);
    m.box(mat.wood(), ox, gy + 0.2, oz - 3.0, 3.0, 0.2, 1.4);
    const so = signs().add('BUILD', { fg: '#1d1b26', glow: PAL.gold, bg: '#ffc93c', border: null });
    m.quad(signs().material, [ox + 1.8, gy + 3.9, oz - 2.5], [ox - 1.8, gy + 3.9, oz - 2.5], [ox - 1.8, gy + 4.8, oz - 2.5], [ox + 1.8, gy + 4.8, oz - 2.5], signUV(so));
    colliders.push({ kind: 'box', x: ox, z: oz, hw: 3.6, hd: 2.2 });
    doors.push({ id: 'office', x: ox, z: oz - 3.4, nx: 0, nz: -1, icon: '🔨', label: 'Build', scene: 'build', glow: PAL.gold, radius: 1.8 });

    // shipping containers
    const cont = (x: number, z: number, y: number, col: string, yaw = 0): void => {
      m.box(mat.std(col, 0.55, 0.25), x, gy + y + 1.3, z, 6, 2.6, 2.4, { yaw });
      for (let i = -2; i <= 2; i++) m.box(mat.std('#151320', 1), x + i * 1.1 * Math.cos(yaw), gy + y + 1.3, z - i * 1.1 * Math.sin(yaw), 0.05, 2.5, 2.45, { yaw });
    };
    cont(-60, 34, 0, '#2c3e5c');
    cont(-60, 34, 2.6, '#d4262d');
    cont(-52, 35.2, 0, '#2f7a45');
    colliders.push({ kind: 'box', x: -60, z: 34, hw: 3, hd: 1.2 }, { kind: 'box', x: -52, z: 35.2, hw: 3, hd: 1.2 });

    // an excavator (static) + dirt mound + pallets + cones
    const ey = '#ffc93c';
    m.box(mat.std('#2d3038', 0.8), -53, gy + 0.45, 24, 4.2, 0.9, 1.9);
    m.box(mat.std(ey, 0.5), -53, gy + 1.3, 24, 2.4, 1.2, 1.9);
    m.box(mat.std(ey, 0.5), -52.8, gy + 2.2, 24, 1.5, 0.9, 1.6);
    m.box(mat.std(ey, 0.5), -51.1, gy + 2.5, 24, 3.2, 0.3, 0.45, { yaw: -0.4 });
    m.box(mat.std(ey, 0.5), -49.5, gy + 2.0, 24, 0.3, 1.8, 0.4);
    m.cyl(mat.std('#6b4d36', 1), -48.5, gy, 29, 2.3, 0.3, 1.6, 9);
    colliders.push({ kind: 'box', x: -52, z: 24, hw: 2.4, hd: 1.2 }, { kind: 'circle', x: -48.5, z: 29, r: 2.2 });
    for (let i = 0; i < 3; i++) m.box(mat.std('#c2603f', 0.9), -50 + i * 1.3, gy + 0.55, 31, 1.2, 0.9, 1.0);
    colliders.push({ kind: 'box', x: -48.8, z: 31, hw: 2.1, hd: 0.6 });
    for (const [kx, kz] of [[-58.8, 20.2], [-53.2, 20.2], [-64, 20.6]]) {
      m.cyl(mat.std('#ff8a3d', 0.6), kx, gy, kz, 0.22, 0.1, 0.7, 8);
      m.cyl(mat.std('#ffffff', 0.6), kx, gy + 0.3, kz, 0.17, 0.14, 0.12, 8);
      colliders.push({ kind: 'circle', x: kx, z: kz, r: 0.25 });
    }
  }
  // the tower crane (animated: the jib slowly swings)
  const crane = new THREE.Group();
  {
    const cx = -48, cz = 21;
    const gy = groundHeight(cx, cz);
    crane.position.set(cx, gy, cz);
    const yel = new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.5, metalness: 0.2 });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 20, 1.0), yel);
    mast.position.y = 10;
    mast.castShadow = true;
    crane.add(mast);
    const head = new THREE.Group();
    head.position.y = 20.4;
    // v3 draw-call diet: the whole turning head (jib, counterweight, cab, light, cable and hook) is ONE vertex-coloured mesh
    const parts: { g: THREE.BufferGeometry; c: string; x: number; y: number; z: number }[] = [
      { g: new THREE.BoxGeometry(0.5, 0.7, 20), c: '#ffc93c', x: 0, y: 0.9, z: -7 },
      { g: new THREE.BoxGeometry(0.5, 0.7, 6), c: '#ffc93c', x: 0, y: 0.9, z: 6.5 },
      { g: new THREE.BoxGeometry(1.6, 1.0, 2.4), c: '#7fd8ff', x: 0, y: 0.2, z: 0.2 },
      { g: new THREE.BoxGeometry(1.8, 1.4, 1.8), c: '#8a8d96', x: 0, y: 0.5, z: 8.6 },
      { g: new THREE.ConeGeometry(0.5, 1.2, 4), c: '#ff3b3b', x: 0, y: 2.2, z: 0 },
      { g: new THREE.BoxGeometry(0.06, 7, 0.06), c: '#2d3038', x: 0, y: 0.5 - 3.5, z: -14 },
      { g: new THREE.BoxGeometry(1.6, 1.0, 1.6), c: '#00d4ff', x: 0, y: 0.5 - 7.6, z: -14 },
    ];
    const col = new THREE.Color();
    const pieces = parts.map(({ g, c, x, y, z }) => {
      const q = g.toNonIndexed();
      q.translate(x, y, z);
      for (const n of Object.keys(q.attributes)) if (n !== 'position' && n !== 'normal') q.deleteAttribute(n);
      col.set(c);
      const arr = new Float32Array(q.attributes.position.count * 3);
      for (let i = 0; i < q.attributes.position.count; i++) arr.set([col.r, col.g, col.b], i * 3);
      q.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return q;
    });
    const headMesh = new THREE.Mesh(mergeGeometries(pieces, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }));
    headMesh.castShadow = true;
    head.add(headMesh);
    crane.add(head);
    colliders.push({ kind: 'circle', x: cx, z: cz, r: 0.9 });
    (crane.userData as { head: THREE.Group }).head = head;
  }

  const group = new THREE.Group();
  group.name = 'homehills';
  group.add(mergeStaticGroups('home-static', m.build('home-static'), bakeStatic(ex)));
  group.add(crane);
  return {
    group,
    colliders,
    doors,
    trees,
    cull: { x: -100, z: 2, r: 160 },
    update(_dt: number, t: number) {
      const h = (crane.userData as { head: THREE.Group }).head;
      h.rotation.y = 0.9 + Math.sin(t * 0.2) * 0.8;
    },
  };
}
