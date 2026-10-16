// Sunny Sands (v3): red dunes with three big rock arches (drive right under them),
// and a lazy-river water park: a ring canal (carved into the terrain, filled by the
// shared water), an island with a slide tower and three tube slides, two arched
// footbridges, umbrellas, cabanas and little floaties drifting round the river.
// Cacti and rocks sit out on the dunes.
import * as THREE from 'three';
import { BRIDGES, SANDS, WATER_Y, nearestRoad, seeded } from '../world/townLayout';
import { groundHeight, terrainHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat } from './kit';
import { poiSign } from './poiSign';
import { PAL } from './palette';
import { InstanceBatch, bakeStatic, put } from './envUtils';

export interface SandsOut extends Piece {
  palms: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
}

const circle = (x: number, z: number, r: number): Collider => ({ kind: 'circle', x, z, r });

/** A natural-looking rock arch: a half torus, lumpy and banded in reds, standing on two broad feet. */
function archMesh(R: number, tube: number, depth: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, tube, 12, 28, Math.PI);
  g.scale(1, 1, depth);
  const rng = seeded(seed);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const memo = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    let d = memo.get(key);
    if (!d) memo.set(key, (d = [(rng() - 0.5) * 1.1, (rng() - 0.5) * 0.8, (rng() - 0.5) * 1.1]));
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  const bands = ['#e0935a', '#c9703f', '#d98b52', '#b85c3a', '#e8a66a'].map((c) => new THREE.Color(c));
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = (Math.sin(pos.getY(i) * 0.9 + pos.getX(i) * 0.07) * 0.5 + 0.5) * (bands.length - 0.001);
    c.copy(bands[Math.floor(k)]).lerp(bands[Math.min(bands.length - 1, Math.floor(k) + 1)], k - Math.floor(k));
    c.multiplyScalar(0.9 + 0.14 * Math.sin(pos.getZ(i) * 1.7 + i * 0.01));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

export function buildSands(): SandsOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const live = new THREE.Group();
  const colliders: Collider[] = [];
  const palms: SandsOut['palms'] = [];
  const rocks: SandsOut['rocks'] = [];
  const G = (x: number, z: number): number => groundHeight(x, z);
  const rng = seeded(7004);
  const P = SANDS.park;
  const wood = mat.std(PAL.wood, 0.8);
  const white = mat.std('#fbf6ec', 0.7);
  const palette = [PAL.pink, PAL.cyan, PAL.gold, PAL.lime, PAL.orange, PAL.violet];

  // ── the three rock arches ──
  const archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  SANDS.arches.forEach(([x, z, yaw], i) => {
    const R = [11, 8.5, 9.5][i] ?? 10, tube = [3.4, 2.8, 3.1][i] ?? 3;
    const g = archMesh(R, tube, 1.55, 31 + i * 7);
    const g0 = G(x, z);
    const mesh = put(ex, g, archMat, x, g0 - 0.4, z, 0, yaw, 0, true, true);
    mesh.name = 'arch';
    // broad feet at both ends, so it sits in the dune like a real arch
    for (const s of [-1, 1]) {
      const fx = x + Math.cos(yaw) * R * s, fz = z - Math.sin(yaw) * R * s;
      m.cyl(mat.std('#c9703f', 0.95), fx, G(fx, fz) - 3.5, fz, tube + 2.0, tube + 0.4, 4.2, 9);
      colliders.push(circle(fx, fz, tube + 1.6));
    }
  });

  // ── the lazy river resort ──
  const cx = P.x, cz = P.z, g0 = 1.5;
  // the island: a round deck of pale concrete with a lip
  m.cyl(mat.std('#efe3c6', 0.9), cx, g0 - 0.02, cz, 14.6, 14.6, 0.14, 28);
  m.cyl(mat.std('#d9ccaa', 0.9), cx, g0 - 0.2, cz, 15.2, 15.2, 0.22, 28);
  // the slide tower: a square tower with a platform, a striped roof and a lit sign
  {
    m.box(mat.std('#fbf6ec', 0.7), cx, g0 + 4.6, cz, 5.2, 9.2, 5.2);
    for (let k = 0; k < 4; k++) m.box(mat.std(palette[k % palette.length], 0.6), cx, g0 + 1.2 + k * 2.2, cz, 5.35, 0.7, 5.35);
    m.box(mat.std('#2a2f3a', 0.7), cx, g0 + 9.4, cz, 6.4, 0.3, 6.4);                   // the platform
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.box(wood, cx + sx * 2.9, g0 + 10.3, cz + sz * 2.9, 0.22, 2.0, 0.22);
    m.cyl(mat.std('#ff4d6d', 0.6), cx, g0 + 11.6, cz, 4.8, 0.0, 3.2, 4);                // a pointed roof
    for (const [sx, sz, ry] of [[0, 2.62, 0], [0, -2.62, Math.PI], [2.62, 0, Math.PI / 2], [-2.62, 0, -Math.PI / 2]] as number[][]) {
      const p = poiSign('LAZY RIVER', PAL.cyan, 'SPLASH PARK', 1.3, false);
      p.position.set(cx + sx, g0 + 6.8, cz + sz);
      p.rotation.y = ry;
      ex.add(p);
    }
    colliders.push({ kind: 'box', x: cx, z: cz, hw: 2.7, hd: 2.7, h: g0 + 13 });
  }
  // three tube slides spiralling from the platform down into the river
  {
    const cols = ['#ff4d9a', '#2fc8ff', '#ffd23a'];
    cols.forEach((hex, k) => {
      const pts: THREE.Vector3[] = [];
      const a0 = (k / 3) * Math.PI * 2, turns = 1.15, N = 28;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = a0 + t * turns * Math.PI * 2;
        const r = 3.4 + (P.ring - P.w / 2 - 0.4 - 3.4 + 1.2) * Math.pow(t, 0.8);
        const y = g0 + 9.6 - t * (9.6 - 0.2) - Math.sin(t * Math.PI) * 0.0;
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y + 0.95, cz + Math.sin(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.TubeGeometry(curve, 90, 0.95, 10, false);
      const tm = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.88 }));
      tm.castShadow = true;
      ex.add(tm);
      // support posts every few metres, and a collider where the tube is low enough to walk into
      for (let i = 2; i <= N; i += 3) {
        const p = pts[i];
        const gy = G(p.x, p.z);
        if (p.y - 0.95 > gy + 0.5) m.cyl(mat.std('#eae6da', 0.7), p.x, gy - 0.2, p.z, 0.2, 0.18, p.y - 0.95 - gy + 0.2, 6);
        colliders.push(circle(p.x, p.z, 0.4));
      }
      for (let i = N - 3; i <= N; i++) colliders.push(circle(pts[i].x, pts[i].z, 1.1));
    });
  }
  // two arched footbridges across the river (the physics deck is in BRIDGES; this draws it)
  for (const br of BRIDGES.filter((b) => b.id.startsWith('canal'))) {
    const L = Math.hypot(br.bx - br.ax, br.bz - br.az), fx = (br.bx - br.ax) / L, fz = (br.bz - br.az) / L;
    const hw = br.w / 2, seg = 1.6;
    for (let u = 0; u < L - 1e-3; u += seg) {
      const u1 = Math.min(L, u + seg);
      const xa = br.ax + fx * u, za = br.az + fz * u, xb = br.ax + fx * u1, zb = br.az + fz * u1;
      const ya = G(xa, za), yb = G(xb, zb);
      const px = -fz, pz = fx;
      m.quad(mat.std('#b98a58', 0.8), [xa + px * (hw + 0.2), ya - 0.03, za + pz * (hw + 0.2)], [xb + px * (hw + 0.2), yb - 0.03, zb + pz * (hw + 0.2)], [xb - px * (hw + 0.2), yb - 0.03, zb - pz * (hw + 0.2)], [xa - px * (hw + 0.2), ya - 0.03, za - pz * (hw + 0.2)]);
      for (const s of [-1, 1]) {
        const ox = px * s * (hw + 0.05), oz = pz * s * (hw + 0.05);
        m.quad(mat.std('#8a5f38', 0.8), [xa + ox, ya - 0.6, za + oz], [xb + ox, yb - 0.6, zb + oz], [xb + ox, yb - 0.02, zb + oz], [xa + ox, ya - 0.02, za + oz]);
        m.box(white, (xa + xb) / 2 + ox, (ya + yb) / 2 + 0.55, (za + zb) / 2 + oz, seg + 0.02, 0.1, 0.14, { yaw: -Math.atan2(zb - za, xb - xa) });
        if (Math.round(u / seg) % 2 === 0) m.box(white, xa + ox, ya + 0.35, za + oz, 0.12, 0.7, 0.12);
        colliders.push({ kind: 'box', x: (xa + xb) / 2 + ox, z: (za + zb) / 2 + oz, hw: Math.abs(fx) * seg / 2 + 0.12, hd: Math.abs(fz) * seg / 2 + 0.12, h: (ya + yb) / 2 + 1.0, y0: (ya + yb) / 2 - 0.1 });
      }
    }
  }
  // umbrellas + loungers + cabanas round the outer deck
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) !== 0) continue;                // keep the bridge ends clear
    const r = P.ring + P.w / 2 + 7.5 + (i % 2) * 2.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, gy = G(x, z);
    const c = palette[i % palette.length];
    m.cyl(mat.std('#e6e6ec', 0.5), x, gy, z, 0.05, 0.05, 2.5, 6);
    m.cyl(mat.std(c, 0.6), x, gy + 2.3, z, 2.0, 0.05, 0.75, 8);
    m.cyl(mat.std('#ffffff', 0.6), x, gy + 2.28, z, 1.2, 0.05, 0.5, 8);
    m.box(white, x + Math.cos(a + 1.6) * 1.9, gy + 0.2, z + Math.sin(a + 1.6) * 1.9, 0.8, 0.14, 1.9, { yaw: -a });
    m.box(mat.std(c, 0.9), x + Math.cos(a + 1.6) * 1.9, gy + 0.29, z + Math.sin(a + 1.6) * 1.9, 0.7, 0.04, 1.3, { yaw: -a });
    colliders.push(circle(x, z, 0.35));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = P.ring + P.w / 2 + 12.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, gy = G(x, z);
    const c = palette[(i + 2) % palette.length];
    m.push(x, z, -a + Math.PI / 2);
    m.box(white, 0, gy + 1.5, 0, 3.4, 3.0, 3.4);
    m.box(mat.std(c, 0.7), 0, gy + 1.5, 1.72, 2.4, 2.6, 0.06);
    m.cyl(mat.std(c, 0.7), 0, gy + 3.0, 0, 3.0, 0.1, 1.7, 4);
    m.pop();
    colliders.push({ kind: 'box', x, z, hw: 1.75, hd: 1.75, h: gy + 4 });
  }
  // palms on the island and round the deck
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = cx + Math.cos(a) * 11.5, z = cz + Math.sin(a) * 11.5;
    palms.push({ x, z, s: 0.95 + rng() * 0.3 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const r = P.ring + P.w / 2 + 18;
    palms.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, s: 0.9 + rng() * 0.4 });
  }
  // a big beach ball on the island
  {
    const g = new THREE.SphereGeometry(2.0, 24, 16);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const cc = new THREE.Color();
    const cols = ['#ff4d6d', '#ffffff', '#3ec6ff', '#ffe14a', '#ffffff', '#7bff6a'];
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      cc.set(cols[Math.floor(((a / (Math.PI * 2) + 1) % 1) * 6)]);
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    put(ex, g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), cx + 7.6, g0 + 2.1, cz - 6.4, 0.3, 0, 0.4, true, true);
    colliders.push(circle(cx + 7.6, cz - 6.4, 2.0));
  }
  // floaties drifting round the river
  const donut = new THREE.TorusGeometry(0.8, 0.34, 8, 18).rotateX(Math.PI / 2);
  const floats = new THREE.InstancedMesh(donut, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), 12);
  const fcols = ['#ff7ab8', '#ffd84a', '#3ec6ff', '#ffffff', '#7bff9a', '#ff9a52'];
  for (let i = 0; i < 12; i++) floats.setColorAt(i, new THREE.Color(fcols[i % fcols.length]));
  floats.frustumCulled = false;
  floats.castShadow = true;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
  const place = (t: number): void => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.045;
      const lane = (i % 3 - 1) * 1.7;
      const r = P.ring + lane;
      pp.set(cx + Math.cos(a) * r, WATER_Y + 0.08 + Math.sin(t * 1.6 + i * 1.7) * 0.05, cz + Math.sin(a) * r);
      e.set(Math.sin(t * 1.1 + i) * 0.06, -a + i, Math.cos(t * 0.9 + i) * 0.06);
      q.setFromEuler(e);
      mtx.compose(pp, q, one);
      floats.setMatrixAt(i, mtx);
    }
    floats.instanceMatrix.needsUpdate = true;
  };
  place(0);
  live.add(floats);

  // ── cacti and boulders out on the dunes ──
  {
    const green = mat.std('#4aa65a', 0.8), dark = mat.std('#3a8a4c', 0.8);
    let n = 0;
    for (let i = 0; i < 800 && n < 46; i++) {
      const a = rng() * Math.PI * 2, r = 14 + Math.sqrt(rng()) * (SANDS.r - 4);
      const x = SANDS.x + Math.cos(a) * r, z = SANDS.z + Math.sin(a) * r;
      if (Math.hypot(x - cx, z - cz) < P.ring + 30) continue;
      if (nearestRoad(x, z).edge < 4) continue;
      const h = terrainHeight(x, z);
      if (h < 0.8) continue;
      const s = 0.8 + rng() * 0.9;
      m.cyl(green, x, h - 0.1, z, 0.5 * s, 0.42 * s, 3.4 * s, 8);
      m.cyl(green, x, h + 3.3 * s, z, 0.42 * s, 0.0, 0.5 * s, 8);
      for (const side of [-1, 1]) {
        if (rng() < 0.3) continue;
        const ay = h + (1.4 + rng() * 0.8) * s;
        m.box(dark, x + side * 0.7 * s, ay, z, 0.9 * s, 0.34 * s, 0.34 * s);
        m.cyl(dark, x + side * 1.05 * s, ay - 0.15 * s, z, 0.17 * s, 0.17 * s, (0.9 + rng() * 0.6) * s, 6);
      }
      colliders.push(circle(x, z, 0.6 * s));
      n++;
    }
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, r = 30 + rng() * (SANDS.r - 20);
      rocks.push({ x: SANDS.x + Math.cos(a) * r, z: SANDS.z + Math.sin(a) * r, s: 1.2 + rng() * 2.2 });
    }
  }

  // ── the welcome gate across the road in ──
  {
    const gx = 112, gz = 100, d = { x: 0.65, z: 0.76 }, n = { x: -0.76, z: 0.65 };
    const yaw = Math.atan2(-d.x, -d.z);
    for (const s of [-1, 1]) {
      const px = gx + n.x * 6.8 * s, pz = gz + n.z * 6.8 * s, gy = G(px, pz);
      m.cyl(mat.std('#e07a48', 0.9), px, gy - 0.2, pz, 0.7, 0.55, 7.4, 8);
      m.cyl(mat.neon(s < 0 ? PAL.cyan : PAL.pink), px, gy + 7.1, pz, 0.45, 0.1, 0.5, 8);
      colliders.push(circle(px, pz, 0.8));
    }
    const gy = G(gx, gz);
    m.box(mat.std('#e07a48', 0.9), gx, gy + 7.0, gz, 0.7, 0.9, 14.4, { yaw: -Math.atan2(n.z, n.x) + Math.PI / 2 });
    const sign = poiSign('SUNNY SANDS', PAL.orange, 'ARCHES · LAZY RIVER', 2.2);
    sign.position.set(gx, gy + 8.6, gz);
    sign.rotation.y = yaw;
    ex.add(sign);
  }

  const group = new THREE.Group();
  group.name = 'sands';
  group.add(m.build('sands-static'));
  group.add(bakeStatic(ex));
  group.add(live);
  void InstanceBatch;
  return {
    group,
    colliders,
    palms,
    rocks,
    cull: { x: SANDS.x, z: SANDS.z, r: 190 },
    update(_dt: number, t: number) {
      place(t);
    },
  };
}
