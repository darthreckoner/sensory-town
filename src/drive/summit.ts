// Sprinkle Summit (v3): a snowy peak with a big red-roofed ski lodge on a flat pad,
// a chairlift that climbs the slope, candy canes, snowmen, igloos, a frozen pond and
// a field of giant sprinkles lying in the snow. The peak itself is terrain
// (world/heightfield.ts summitH): steep enough to glide off.
import * as THREE from 'three';
import { SUMMIT } from '../world/townLayout';
import { groundHeight, terrainHeight } from '../world/heightfield';
import { nearestRoad, seeded } from '../world/townLayout';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat } from './kit';
import { poiSign } from './poiSign';
import { PAL } from './palette';
import { InstanceBatch, bakeStatic, mergeStaticGroups, put } from './envUtils';

export interface SummitOut extends Piece {
  rocks: { x: number; z: number; s: number }[];
}

const SNOW = '#f6faff';
const circle = (x: number, z: number, r: number): Collider => ({ kind: 'circle', x, z, r });

export function buildSummit(): SummitOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const inst = new THREE.Group();                    // instanced meshes (bakeStatic leaves those alone)
  const colliders: Collider[] = [];
  const rocks: SummitOut['rocks'] = [];
  const G = (x: number, z: number): number => groundHeight(x, z);
  const snow = mat.std(SNOW, 0.7);
  const wood = mat.std('#9a6a3f', 0.8);
  const darkWood = mat.std('#5e3d24', 0.8);
  const stone = mat.std('#8d93a0', 0.9);
  const roofRed = mat.std('#d9433f', 0.7);
  const rng = seeded(7001);

  // ── the ski lodge ──
  const L = SUMMIT.lodge;
  const gy = SUMMIT.pad.h;
  {
    const w = L.w, d = L.d, hw = w / 2, hd = d / 2;
    m.push(L.x, L.z, 0);
    m.box(stone, 0, gy + 0.45, 0, w + 0.6, 0.9, d + 0.6);
    m.box(wood, 0, gy + 2.9, 0, w, 4.0, d);                       // log walls
    for (let k = 0; k < 6; k++) m.box(darkWood, 0, gy + 1.2 + k * 0.62, 0, w + 0.12, 0.1, d + 0.12);   // log lines
    // corner posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(darkWood, sx * hw, gy + 2.9, sz * hd, 0.7, 4.1, 0.7);
    // warm windows + door on the front (z+)
    for (const x of [-10.5, -6.2, 6.2, 10.5]) {
      m.box(darkWood, x, gy + 3.1, hd + 0.04, 3.1, 2.5, 0.12);
      m.box(mat.neon('#ffd98a'), x, gy + 3.1, hd + 0.1, 2.7, 2.1, 0.05);
      m.box(darkWood, x, gy + 3.1, hd + 0.13, 0.12, 2.1, 0.04);
    }
    m.box(darkWood, 0, gy + 1.9, hd + 0.05, 2.8, 3.4, 0.14);
    m.box(mat.std('#c0392b', 0.6), 0, gy + 1.8, hd + 0.14, 2.3, 3.0, 0.06);     // a red door
    m.box(mat.neon('#ffd98a'), 0, gy + 3.3, hd + 0.2, 1.3, 0.9, 0.04);           // its window
    // back windows
    for (const x of [-9, -3, 3, 9]) m.box(mat.neon('#ffd98a'), x, gy + 3.0, -hd - 0.06, 2.2, 1.9, 0.05);
    // an A-frame roof along x, with overhang, and a snow blanket on top
    const e = hd + 1.7, y0 = gy + 4.9, y1 = gy + 12.2, ox = hw + 1.5;
    m.quad(roofRed, [-ox, y0, e], [ox, y0, e], [ox, y1, 0], [-ox, y1, 0]);
    m.quad(roofRed, [ox, y0, -e], [-ox, y0, -e], [-ox, y1, 0], [ox, y1, 0]);
    m.quad(roofRed, [-ox, y0 - 0.3, -e], [-ox, y0 - 0.3, e], [-ox, y1, 0], [-ox, y1, 0]);          // (the gable ends are walls below)
    m.quad(roofRed, [ox, y0 - 0.3, e], [ox, y0 - 0.3, -e], [ox, y1, 0], [ox, y1, 0]);
    const ins = 1.3, f = ins / e;                                                                  // snow stops short of the eaves
    const ys = y0 + (y1 - y0) * f + 0.32;
    m.quad(snow, [-ox + 0.5, ys, e - ins], [ox - 0.5, ys, e - ins], [ox - 0.5, y1 + 0.36, 0], [-ox + 0.5, y1 + 0.36, 0]);
    m.quad(snow, [ox - 0.5, ys, -e + ins], [-ox + 0.5, ys, -e + ins], [-ox + 0.5, y1 + 0.36, 0], [ox - 0.5, y1 + 0.36, 0]);
    m.box(snow, 0, y1 + 0.4, 0, w + 2.4, 0.3, 0.9);
    // gable end walls under the roof (timber triangles)
    for (const sx of [-1, 1]) m.quad(wood, [sx * (hw + 0.02), gy + 4.9, -hd], [sx * (hw + 0.02), gy + 4.9, hd], [sx * (hw + 0.02), y1 - 0.2, 0], [sx * (hw + 0.02), y1 - 0.2, 0]);
    // chimney with a snow cap
    m.box(stone, 8.5, y1 - 0.4, -2.6, 1.7, 5.0, 1.7);
    m.box(snow, 8.5, y1 + 2.2, -2.6, 2.0, 0.4, 2.0);
    // wooden porch pad + steps (flush with the ground, nothing to trip on)
    m.box(wood, 0, gy + 0.07, hd + 2.4, w - 4, 0.14, 4.4);
    for (const x of [-12, -6, 6, 12]) m.cyl(darkWood, x, gy, hd + 4.4, 0.22, 0.22, 3.4, 6);
    m.box(darkWood, 0, gy + 3.5, hd + 4.4, w - 3.4, 0.22, 0.34);
    // a string of warm lights across the porch beam
    for (let i = 0; i < 14; i++) m.box(mat.neon(['#ff7ab8', '#ffd84a', '#7fe0ff', '#9bff7a'][i % 4]), -12.2 + i * 1.88, gy + 3.2 + Math.sin(i * 0.9) * 0.08, hd + 4.4, 0.34, 0.34, 0.34);
    m.pop();
    colliders.push({ kind: 'box', x: L.x, z: L.z, hw: hw + 2.5, hd: hd + 2.5, h: gy + 13 });   // (covers the eave overhang too: the camera must not slide under the roof edge)
    // the lodge sign, a big lit face on the front gable
    // it lies on the front roof slope (tilted to match), lifted a little off the snow
    const sign = poiSign('SPRINKLE LODGE', PAL.pink, 'HOT COCOA · SLEDS · SNOWMEN', 2.6, false);
    sign.position.set(L.x, gy + 8.9, L.z + e * 0.5 + 0.55);
    sign.rotation.x = -Math.atan2(y1 - y0, e);
    ex.add(sign);
  }

  // ── candy canes lining the forecourt and the last stretch of road ──
  const cane = (x: number, z: number, h: number): void => {
    const g0 = G(x, z);
    const stripes = Math.round(h / 0.55);
    for (let i = 0; i < stripes; i++) m.cyl(mat.std(i % 2 ? '#ffffff' : '#e8344a', 0.45), x, g0 + (i * h) / stripes, z, 0.17, 0.17, h / stripes + 0.01, 8);
    // the hook: three short angled bars
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI;                                  // 0..π around the top
      const cx = x + (1 - Math.cos(a)) * 0.0 + Math.sin(a) * 0.0;
      const hx = x - 0.55 + Math.cos(a) * 0.55, hy = g0 + h + Math.sin(a) * 0.55;
      m.box(mat.std(k % 2 ? '#ffffff' : '#e8344a', 0.45), hx, hy, z, 0.3, 0.3, 0.3);
      void cx;
    }
    colliders.push(circle(x, z, 0.25));
  };
  for (let i = 0; i < 6; i++) {
    cane(SUMMIT.x - 19 + i * 7.6, -156.2, 2.8 + (i % 2) * 0.5);
    cane(SUMMIT.x - 21 + i * 8.4, -171.8, 2.6 + ((i + 1) % 2) * 0.5);
  }

  // ── the welcome sign where the road reaches the foothills ──
  {
    const x = 51, z = -135;
    const gyS = G(x, z);
    m.cyl(darkWood, x - 5.4, gyS, z, 0.2, 0.2, 5.0, 8);
    m.cyl(darkWood, x + 5.4, gyS, z, 0.2, 0.2, 5.0, 8);
    colliders.push(circle(x - 5.4, z, 0.3), circle(x + 5.4, z, 0.3));
    const p = poiSign('SPRINKLE SUMMIT', PAL.cyan, 'SNOW · SKIING · SWEETS', 1.9);
    const pw = (p.geometry as THREE.PlaneGeometry).parameters.width;
    p.position.set(x, gyS + 4.0, z);
    ex.add(p);
    m.box(darkWood, x, gyS + 4.0, z, pw + 0.4, 2.3, 0.16);
  }

  // ── snowmen (silly) and igloos ──
  const sph = (g: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx): void => {
    const me = put(ex, g, material, x, y, z, 0, 0, 0, true, true);
    me.scale.set(sx, sy, sz);
  };
  const ball = new THREE.SphereGeometry(1, 14, 10);
  const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const cone = new THREE.ConeGeometry(0.1, 0.7, 6).rotateX(Math.PI / 2);
  const hatCyl = new THREE.CylinderGeometry(0.34, 0.4, 0.55, 10);
  const scarfCols = ['#e8344a', '#2f9bff', '#ffc93c', '#b86bff', '#2fd06a'];
  const snowmanAt = (x: number, z: number, s: number, i: number): void => {
    const g0 = G(x, z);
    sph(ball, snow, x, g0 + 0.72 * s, z, 0.85 * s, 0.78 * s, 0.85 * s);
    sph(ball, snow, x, g0 + 1.85 * s, z, 0.62 * s, 0.6 * s, 0.62 * s);
    sph(ball, snow, x, g0 + 2.7 * s, z, 0.46 * s);
    sph(cone, mat.std('#ff8a3d', 0.6), x + 0.02, g0 + 2.7 * s, z + 0.5 * s, s, s, s);
    sph(ball, mat.std('#1d1b26', 0.5), x - 0.17 * s, g0 + 2.82 * s, z + 0.4 * s, 0.07 * s);
    sph(ball, mat.std('#1d1b26', 0.5), x + 0.17 * s, g0 + 2.82 * s, z + 0.4 * s, 0.07 * s);
    for (let k = 0; k < 3; k++) sph(ball, mat.std('#1d1b26', 0.5), x, g0 + (1.6 + k * 0.3) * s, z + 0.6 * s, 0.07 * s);
    sph(hatCyl, mat.std(i % 2 ? '#d94a8c' : '#2c3e5c', 0.6), x, g0 + 3.25 * s, z, s, s, s);
    sph(ball, mat.std(scarfCols[i % scarfCols.length], 0.7), x, g0 + 2.2 * s, z, 0.55 * s, 0.14 * s, 0.55 * s);
    colliders.push(circle(x, z, 0.8 * s));
  };
  [[30, -158, 1.3], [100, -160, 1.1], [86, -150, 0.9], [38, -190, 1.2], [92, -196, 1.4], [70, -208, 1.0], [54, -222, 1.1], [100, -176, 1.0]].forEach(([x, z, s], i) => snowmanAt(x, z, s, i));
  const igloo = (x: number, z: number, r: number, yaw: number): void => {
    const g0 = G(x, z);
    const me = put(ex, dome, mat.std('#e9f4ff', 0.6), x, g0 - 0.1, z, 0, yaw, 0, true, true);
    me.scale.set(r, r * 0.85, r);
    // the entrance tunnel and a dark doorway
    put(ex, new THREE.BoxGeometry(r * 0.7, r * 0.55, r * 0.8), mat.std('#e2f0fb', 0.6), x + Math.sin(yaw) * r * 0.95, g0 + r * 0.27, z + Math.cos(yaw) * r * 0.95, 0, yaw, 0, true, true);
    put(ex, new THREE.BoxGeometry(r * 0.38, r * 0.4, 0.12), mat.std('#243a5c', 0.8), x + Math.sin(yaw) * r * 1.37, g0 + r * 0.2, z + Math.cos(yaw) * r * 1.37, 0, yaw, 0, false, false);
    colliders.push(circle(x, z, r * 1.05), circle(x + Math.sin(yaw) * r * 1.0, z + Math.cos(yaw) * r * 1.0, r * 0.4));
  };
  igloo(30, -176, 3.4, 0.5);
  igloo(94, -186, 3.0, -0.6);

  // ── frozen pond: a flat sheet of ice + a few "cracks" ──
  {
    const x = 84, z = -168, g0 = G(x, z);
    const ice = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.1, 28), new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.12, metalness: 0.1 }));
    ice.position.set(x, g0 + 0.02, z);
    ice.receiveShadow = true;
    ex.add(ice);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m.box(mat.std('#ffffff', 0.5), x + Math.cos(a) * 3, g0 + 0.09, z + Math.sin(a) * 3, 4.5, 0.02, 0.12, { yaw: -a });
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      m.cyl(mat.std('#e8f4ff', 0.6), x + Math.cos(a) * 7.4, g0 - 0.05, z + Math.sin(a) * 7.4, 0.5, 0.35, 0.6, 7);
    }
  }

  // ── the chairlift: five poles up the slope, a cable, and chairs riding both ways ──
  const steel = mat.std('#cfd3dc', 0.35, 0.8);
  const lift: THREE.Vector3[] = [];
  {
    const pts: [number, number][] = [[42, -174], [40.5, -188], [39, -202], [38, -216], [37, -230]];
    const up = 8.6;
    pts.forEach(([x, z], i) => {
      const g0 = G(x, z);
      m.cyl(steel, x, g0, z, 0.3, 0.2, up, 8);
      m.box(steel, x, g0 + up, z, 4.4, 0.22, 0.22);
      m.box(mat.std('#e8344a', 0.5), x, g0 + up + 0.3, z, 0.9, 0.35, 0.5);
      colliders.push(circle(x, z, 0.4));
      lift.push(new THREE.Vector3(x, g0 + up, z));
      if (i === 0 || i === pts.length - 1) {
        // a little station hut at each end
        m.box(wood, x + (i === 0 ? 4.6 : 4.4), g0 + 1.5, z, 3.2, 3.0, 3.6);
        m.box(roofRed, x + (i === 0 ? 4.6 : 4.4), g0 + 3.2, z, 3.8, 0.4, 4.2);
        m.box(snow, x + (i === 0 ? 4.6 : 4.4), g0 + 3.5, z, 3.6, 0.25, 4.0);
        colliders.push({ kind: 'box', x: x + (i === 0 ? 4.6 : 4.4), z, hw: 1.7, hd: 1.9, h: g0 + 3.6 });
      }
    });
    // the cables (a thin box per span, tilted to follow the pole tops)
    for (const side of [-1.5, 1.5])
      for (let i = 0; i < lift.length - 1; i++) {
        const a = lift[i], b = lift[i + 1];
        const len = a.distanceTo(b);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), mat.std('#2d3038', 0.5));
        cab.position.set((a.x + b.x) / 2 + side, (a.y + b.y) / 2 - 0.1, (a.z + b.z) / 2);
        cab.lookAt(b.x + side, b.y - 0.1, b.z);
        ex.add(cab);
      }
  }
  // chairs: one instanced mesh (the seat, back and bar of a chair, merged)
  const chairGeo = (() => {
    const parts = [
      new THREE.BoxGeometry(1.7, 0.14, 0.75).translate(0, -3.1, 0),
      new THREE.BoxGeometry(1.7, 0.85, 0.12).translate(0, -2.7, -0.38),
      new THREE.BoxGeometry(0.06, 3.0, 0.06).translate(-0.7, -1.6, -0.2),
      new THREE.BoxGeometry(0.06, 3.0, 0.06).translate(0.7, -1.6, -0.2),
      new THREE.BoxGeometry(1.8, 0.06, 0.06).translate(0, -2.75, 0.4),
    ];
    const g = new THREE.BufferGeometry();
    let n = 0;
    for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx: number[] = [];
    let off = 0;
    for (const p of parts) {
      pos.set((p.attributes.position as THREE.BufferAttribute).array as Float32Array, off * 3);
      nor.set((p.attributes.normal as THREE.BufferAttribute).array as Float32Array, off * 3);
      const ix = p.index!;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
      off += p.attributes.position.count;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  })();
  const NCH = 14;
  const chairs = new THREE.InstancedMesh(chairGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), NCH);
  const chairCols = ['#e8344a', '#2f9bff', '#ffc93c', '#b86bff', '#2fd06a', '#ff8a3d', '#ff7ab8'];
  for (let i = 0; i < NCH; i++) chairs.setColorAt(i, new THREE.Color(chairCols[i % chairCols.length]));
  chairs.castShadow = true;
  chairs.frustumCulled = false;
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < lift.length - 1; i++) {
    const l = lift[i].distanceTo(lift[i + 1]);
    segLen.push(l);
    total += l;
  }
  const at = (s: number, out: THREE.Vector3): THREE.Vector3 => {
    s = Math.max(0, Math.min(total - 1e-3, s));
    for (let i = 0; i < segLen.length; i++) {
      if (s <= segLen[i]) return out.lerpVectors(lift[i], lift[i + 1], s / segLen[i]);
      s -= segLen[i];
    }
    return out.copy(lift[lift.length - 1]);
  };
  const tmpV = new THREE.Vector3(), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
  const placeChairs = (t: number): void => {
    const loop = total * 2;
    for (let i = 0; i < NCH; i++) {
      const s = ((i / NCH) * loop + t * 2.3) % loop;
      const goingUp = s < total;
      const along = goingUp ? s : loop - s;
      at(along, tmpV);
      const side = goingUp ? 1.5 : -1.5;
      eul.set(Math.sin(t * 1.3 + i) * 0.04, goingUp ? 0 : Math.PI, Math.sin(t * 1.7 + i * 2) * 0.05);
      q.setFromEuler(eul);
      mtx.compose(new THREE.Vector3(tmpV.x + side, tmpV.y - 0.1, tmpV.z), q, sc);
      chairs.setMatrixAt(i, mtx);
    }
    chairs.instanceMatrix.needsUpdate = true;
  };
  placeChairs(0);

  // ── giant sprinkles lying in the snow around the lodge (Sprinkle Summit's signature) ──
  {
    const capsule = new THREE.CapsuleGeometry(0.16, 0.95, 3, 8).rotateZ(Math.PI / 2);
    const batch = new InstanceBatch(capsule, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), false, true);
    const cols = ['#ff4d9a', '#ffd84a', '#3ec6ff', '#7bff6a', '#b06bff', '#ff8a3d', '#ffffff'];
    let placed = 0;
    for (let i = 0; i < 600 && placed < 200; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * 78;
      const x = SUMMIT.x + Math.cos(a) * r, z = SUMMIT.pad.z + Math.sin(a) * r * 0.9 - 10;
      if (nearestRoad(x, z).edge < 2.5) continue;
      if (Math.abs(x - L.x) < L.w / 2 + 3 && Math.abs(z - L.z) < L.d / 2 + 3) continue;
      const h = terrainHeight(x, z);
      if (h < 8) continue;
      const dx = 0.7;
      const slope = Math.hypot(terrainHeight(x + dx, z) - terrainHeight(x - dx, z), terrainHeight(x, z + dx) - terrainHeight(x, z - dx)) / (2 * dx);
      if (slope > 0.6) continue;
      batch.add(x, h + 0.14, z, rng() * Math.PI * 2, 1, 1, 1, cols[(rng() * cols.length) | 0]);
      placed++;
    }
    const mesh = batch.build();
    if (mesh) inst.add(mesh);
  }

  // ── the summit marker: a cairn and a flag, right at the top ──
  {
    const x = SUMMIT.x, z = SUMMIT.z, g0 = G(x, z);
    m.cyl(mat.std('#8f9bb5', 0.9), x, g0 - 0.3, z, 1.8, 0.9, 1.6, 7);
    m.cyl(mat.std('#8f9bb5', 0.9), x, g0 + 1.2, z, 0.9, 0.5, 0.9, 7);
    m.cyl(steel, x, g0 + 2.0, z, 0.07, 0.05, 5.5, 6);
    m.box(mat.std(PAL.pink, 0.7), x + 1.0, g0 + 6.6, z, 2.0, 1.2, 0.05);
    m.box(mat.std(PAL.cyan, 0.7), x + 1.0, g0 + 5.4, z, 2.0, 1.2, 0.05);
    colliders.push(circle(x, z, 1.5));
    // rocks along the ridge
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * 52;
      const rx = x + Math.cos(a) * r, rz = z + Math.sin(a) * r;
      if (terrainHeight(rx, rz) < 20) continue;
      rocks.push({ x: rx, z: rz, s: 1.0 + rng() * 2.2 });
    }
  }

  const group = new THREE.Group();
  group.name = 'summit';
  group.add(mergeStaticGroups('summit-static', m.build('summit-static'), bakeStatic(ex)));
  group.add(inst);
  group.add(chairs);
  return {
    group,
    colliders,
    rocks,
    cull: { x: SUMMIT.x, z: -210, r: 200 },
    update(_dt: number, t: number) {
      placeChairs(t);
    },
  };
}
