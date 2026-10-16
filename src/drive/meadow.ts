// Bloom Meadow (v3): rolling flower hills (terrain + flower tufts from scenery.ts),
// three windmills with turning sails on the crests, a tethered hot-air balloon,
// giant garden flowers, a red barn with fences and a big rainbow over the south end.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MEADOW, seeded } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat } from './kit';
import { poiSign } from './poiSign';
import { PAL } from './palette';
import { bakeStatic, put } from './envUtils';

export interface MeadowOut extends Piece {
  trees: { x: number; z: number; kind: 'oak' | 'birch'; scale: number }[];
}

const circle = (x: number, z: number, r: number): Collider => ({ kind: 'circle', x, z, r });

/** Four sails on a hub, as one merged vertex-coloured geometry (a spar, a lattice and a coloured cloth per sail). */
function sailGeometry(len: number, cloth: string[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  const paint = (g: THREE.BufferGeometry, c: string): THREE.BufferGeometry => {
    col.set(c);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    const spar = new THREE.BoxGeometry(0.34, len, 0.28).translate(0, len / 2 + 0.6, 0);
    const sail = new THREE.BoxGeometry(1.7, len * 0.62, 0.08).translate(0.95, len * 0.58 + 0.9, 0.12);
    const bar = new THREE.BoxGeometry(1.9, 0.12, 0.12).translate(0.95, len * 0.9, 0.04);
    for (const [g, c] of [[spar, '#f1ead8'], [sail, cloth[k % cloth.length]], [bar, '#f1ead8']] as [THREE.BufferGeometry, string][]) {
      g.rotateZ(rot);
      parts.push(paint(g, c));
    }
  }
  const hub = new THREE.CylinderGeometry(0.55, 0.7, 0.9, 10).rotateX(Math.PI / 2);
  parts.push(paint(hub, '#7a4a2a'));
  return mergeGeometries(parts, false);
}

export function buildMeadow(): MeadowOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const colliders: Collider[] = [];
  const trees: MeadowOut['trees'] = [];
  const G = (x: number, z: number): number => groundHeight(x, z);
  const rng = seeded(7002);
  const live = new THREE.Group();                    // the parts that move (never baked)
  const sails: { wheel: THREE.Mesh; spin: number }[] = [];
  const sailGeo = sailGeometry(7.2, ['#ff7ab8', '#ffd84a', '#7fd8ff', '#ffffff']);
  const sailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
  const wood = mat.std(PAL.wood, 0.8);

  // ── windmills: a tapered white tower with a colour band, a pointed cap, turning sails ──
  MEADOW.windmills.forEach(([x, z], i) => {
    const g0 = G(x, z);
    const yaw = 0.5 + i * 1.7;                       // each one turns its face to a different wind
    const band = ['#ff7ab8', '#ffd84a', '#5bc8f5'][i % 3];
    m.cyl(mat.std('#f4efe2', 0.8), x, g0 - 0.5, z, 3.0, 2.0, 10.5, 12);
    m.cyl(mat.std(band, 0.6), x, g0 + 3.6, z, 2.6, 2.45, 1.2, 12);
    m.cyl(mat.std(band, 0.6), x, g0 + 7.2, z, 2.2, 2.1, 0.8, 12);
    m.cyl(mat.std('#8c5a35', 0.8), x, g0 + 9.9, z, 2.45, 2.45, 0.5, 12);
    m.cyl(mat.std('#c0392b', 0.7), x, g0 + 10.4, z, 2.6, 0.0, 3.0, 12);        // the cap
    m.push(x, z, yaw);
    m.box(mat.std('#8c5a35', 0.8), 0, g0 + 1.3, 2.05, 1.5, 2.6, 0.3);          // door
    m.box(mat.std('#ffffff', 0.7), 0, g0 + 1.35, 2.2, 0.8, 1.7, 0.1);
    m.box(mat.neon('#ffd98a'), 0, g0 + 5.4, 2.1, 0.9, 1.0, 0.1);               // a lit window
    m.pop();
    colliders.push(circle(x, z, 3.1));
    // the sails turn on the front of the cap
    const grp = new THREE.Group();
    const front = 2.9;
    grp.position.set(x + Math.sin(yaw) * front, g0 + 9.4, z + Math.cos(yaw) * front);
    grp.rotation.y = yaw;
    const wheel = new THREE.Mesh(sailGeo, sailMat);
    wheel.castShadow = true;
    grp.add(wheel);
    live.add(grp);
    sails.push({ wheel, spin: (i % 2 ? -1 : 1) * (0.35 + i * 0.07) });
  });

  // ── the tethered hot-air balloon ──
  const balloon = new THREE.Group();
  const B = MEADOW.balloon;
  const bg = G(B.x, B.z);
  const lift = 10.5;                                  // the basket hangs this far above the grass (a charm waits in it)
  {
    // envelope: a sphere with coloured gores (vertex colours by longitude)
    const env = new THREE.SphereGeometry(6.2, 32, 22);
    const pos = env.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const gores = ['#ff4d6d', '#ffd84a', '#3ec6ff', '#ffffff', '#7bff6a', '#b06bff'].map((c) => new THREE.Color(c));
    const c1 = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = Math.floor(((a / (Math.PI * 2) + 1) % 1) * 12);
      c1.copy(gores[k % gores.length]);
      // a pale crown and a darker mouth
      const y = pos.getY(i) / 6.2;
      c1.lerp(new THREE.Color('#ffffff'), Math.max(0, y - 0.8) * 2.5);
      c1.multiplyScalar(0.8 + 0.2 * Math.min(1, (y + 1) * 1.2));
      col.set([c1.r, c1.g, c1.b], i * 3);
      // pinch the bottom into a mouth
      if (y < -0.6) {
        const f = 0.55 + 0.45 * ((y + 1) / 0.4);
        pos.setX(i, pos.getX(i) * f);
        pos.setZ(i, pos.getZ(i) * f);
      }
    }
    env.setAttribute('color', new THREE.BufferAttribute(col, 3));
    env.computeVertexNormals();
    const eMesh = new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    eMesh.position.y = lift + 9.5;
    eMesh.castShadow = true;
    balloon.add(eMesh);
    // basket + burner + ropes
    const basket = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 2.2), mat.std('#a8743f', 0.9));
    basket.position.y = lift + 0.65;
    basket.castShadow = true;
    balloon.add(basket);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 2.5), mat.std('#6e4726', 0.9));
    rim.position.y = lift + 1.3;
    balloon.add(rim);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 8), new THREE.MeshBasicMaterial({ color: '#ffb02e', toneMapped: false }));
    flame.position.y = lift + 4.6;
    balloon.add(flame);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]])
      put(balloon, new THREE.CylinderGeometry(0.05, 0.05, 7.8, 5), mat.std('#6e4726', 0.9), sx * 1.0, lift + 5.2, sz * 1.0, sz * 0.18, 0, -sx * 0.18, false, false);
    balloon.position.set(B.x, bg, B.z);
    // tether lines down to four stakes
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ax = B.x + sx * 9, az = B.z + sz * 9, ag = G(ax, az);
      const top = new THREE.Vector3(B.x + sx * 0.9, bg + lift + 0.3, B.z + sz * 0.9), bot = new THREE.Vector3(ax, ag + 0.3, az);
      const len = top.distanceTo(bot);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 4), mat.std('#6e4726', 0.9));
      rope.position.copy(top).lerp(bot, 0.5);
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      ex.add(rope);
      m.cyl(mat.std('#6e4726', 0.9), ax, ag, az, 0.14, 0.12, 0.7, 6);
    }
    colliders.push(circle(B.x, B.z, 1.0));
  }

  // ── giant garden flowers ──
  const petalGeo = new THREE.SphereGeometry(1, 10, 8);
  const giant = (x: number, z: number, h: number, petal: string, i: number): void => {
    const g0 = G(x, z);
    m.cyl(mat.std('#3fae52', 0.7), x, g0, z, 0.2, 0.14, h, 7);
    const leaf = put(ex, new THREE.SphereGeometry(1, 8, 6), mat.std('#3fae52', 0.7), x + 0.7, g0 + h * 0.4, z, 0, i, 0.5, true, true);
    leaf.scale.set(0.9, 0.12, 0.38);
    const n = 8, r = h * 0.2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = put(ex, petalGeo, mat.std(petal, 0.55), x + Math.cos(a) * r, g0 + h + 0.1, z + Math.sin(a) * r, 0, -a, 0, true, true);
      p.scale.set(r * 0.9, r * 0.28, r * 0.5);
    }
    put(ex, petalGeo, mat.std('#ffcf3a', 0.5), x, g0 + h + 0.25, z, 0, 0, 0, true, true).scale.set(r * 0.55, r * 0.4, r * 0.55);
    colliders.push(circle(x, z, 0.3));
  };
  const pet = ['#ff7ab8', '#ffffff', '#b78cff', '#ff9a52', '#7fd8ff', '#ff5470'];
  const spots: [number, number][] = [[-16, 188], [8, 214], [46, 226], [72, 190], [0, 150], [24, 146], [76, 226], [-30, 232], [60, 136]];
  spots.forEach(([x, z], i) => giant(x, z, 4.2 + (i % 3) * 1.2, pet[i % pet.length], i));

  // ── a red barn, a silo and fences ──
  {
    const x = 86, z = 178, gy = G(x, z), yaw = -0.35;
    m.push(x, z, yaw);
    const red = mat.std('#d4352f', 0.75), white = mat.std('#fbf6ec', 0.7);
    m.box(red, 0, gy + 2.6, 0, 11, 5.2, 8);
    // gambrel roof: two lower steep slopes and two upper shallow ones (a long prism along x)
    const quad = (y0: number, z0: number, y1: number, z1: number, col: THREE.Material): void => {
      m.quad(col, [-5.8, y0, z0], [5.8, y0, z0], [5.8, y1, z1], [-5.8, y1, z1]);
      m.quad(col, [5.8, y0, -z0], [-5.8, y0, -z0], [-5.8, y1, -z1], [5.8, y1, -z1]);
    };
    const roof = mat.std('#5b5f6c', 0.7);
    quad(gy + 5.2, 4.3, gy + 7.4, 3.0, roof);
    quad(gy + 7.4, 3.0, gy + 9.0, 0.0, roof);
    for (const sx of [-1, 1]) {
      m.quad(red, [sx * 5.5, gy + 5.2, -4.0], [sx * 5.5, gy + 5.2, 4.0], [sx * 5.5, gy + 7.4, 3.0], [sx * 5.5, gy + 7.4, -3.0]);
      m.quad(red, [sx * 5.5, gy + 7.4, -3.0], [sx * 5.5, gy + 7.4, 3.0], [sx * 5.5, gy + 9.0, 0], [sx * 5.5, gy + 9.0, 0]);
    }
    m.box(white, 0, gy + 2.2, 4.02, 4.0, 4.4, 0.1);                            // big doors
    m.box(red, 0, gy + 2.2, 4.08, 3.6, 4.0, 0.06);
    m.box(white, -0.9, gy + 2.2, 4.12, 0.12, 4.0, 0.04);
    m.box(white, 0.9, gy + 2.2, 4.12, 0.12, 4.0, 0.04);
    m.box(white, 0, gy + 4.0, 4.12, 3.6, 0.12, 0.04);
    m.box(mat.neon('#ffe9a8'), 0, gy + 6.4, 3.4, 1.2, 1.2, 0.08);              // the hay-loft window
    m.pop();
    colliders.push({ kind: 'box', x, z, hw: 5.8, hd: 4.4, h: gy + 9.2 });
    // silo
    const sx = x + 9 * Math.cos(yaw), sz = z - 9 * Math.sin(yaw);
    m.cyl(mat.std('#cfd6e0', 0.5, 0.3), sx, G(sx, sz) - 0.4, sz, 2.4, 2.4, 11, 14);
    m.cyl(mat.std('#8f9bb5', 0.5, 0.3), sx, G(sx, sz) + 10.6, sz, 2.5, 0.0, 2.6, 14);
    colliders.push(circle(sx, sz, 2.5));
    // a paddock fence
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3));
      for (let k = 0; k <= n; k++) {
        const fx = x0 + ((x1 - x0) * k) / n, fz = z0 + ((z1 - z0) * k) / n;
        m.box(wood, fx, G(fx, fz) + 0.6, fz, 0.18, 1.2, 0.18);
      }
      const yw = -Math.atan2(z1 - z0, x1 - x0);
      for (const hh of [0.45, 0.95]) m.box(wood, (x0 + x1) / 2, G((x0 + x1) / 2, (z0 + z1) / 2) + hh, (z0 + z1) / 2, len, 0.12, 0.08, { yaw: yw });
      colliders.push({ kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2 + 0.2, hd: Math.abs(z1 - z0) / 2 + 0.2 });
    };
    fence(x - 14, z + 8, x + 14, z + 14);
    fence(x + 14, z + 14, x + 14, z + 36);
    fence(x - 14, z + 36, x + 14, z + 36);
    fence(x - 14, z + 8, x - 14, z + 16);
    fence(x - 14, z + 28, x - 14, z + 36);
    // a sign
    const p = poiSign('BLOOM MEADOW', PAL.pink, 'FLOWERS · WINDMILLS · BALLOON', 1.7);
    p.position.set(x - 24, G(x - 24, z - 6) + 3.6, z - 6);
    p.rotation.y = 0.5;
    ex.add(p);
    m.cyl(wood, x - 24 - 3.9, G(x - 27.9, z - 6), z - 6, 0.16, 0.16, 4.2, 6);
    m.cyl(wood, x - 24 + 3.9, G(x - 20.1, z - 6), z - 6, 0.16, 0.16, 4.2, 6);
    colliders.push(circle(x - 27.9, z - 6, 0.3), circle(x - 20.1, z - 6, 0.3));
  }

  // ── a rainbow over the south end of the meadow ──
  {
    const cols = ['#ff4d4d', '#ff9a3c', '#ffe14a', '#5be06a', '#3ec6ff', '#5a6cff', '#b06bff'];
    const R = 74, band = 1.9, segs = 40;
    const P: number[] = [], C: number[] = [], I: number[] = [];
    const c = new THREE.Color();
    cols.forEach((hex, bi) => {
      c.set(hex);
      const r0 = R + bi * band, r1 = r0 + band;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI;
        for (const r of [r0, r1]) {
          P.push(Math.cos(a) * r, Math.sin(a) * r, 0);
          C.push(c.r, c.g, c.b);
        }
        if (s < segs) {
          const k = (bi * (segs + 1) + s) * 2;
          I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I);
    const rb = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    rb.position.set(MEADOW.x + 6, -4, MEADOW.z + 70);
    rb.rotation.y = 0.12;
    rb.renderOrder = 3;
    rb.frustumCulled = false;
    live.add(rb);
  }
  void rng;

  const group = new THREE.Group();
  group.name = 'meadow';
  group.add(m.build('meadow-static'));
  group.add(bakeStatic(ex));
  group.add(balloon, live);
  return {
    group,
    colliders,
    trees,
    cull: { x: MEADOW.x, z: MEADOW.z + 10, r: 190 },
    update(_dt: number, t: number) {
      for (const s of sails) s.wheel.rotation.z = t * s.spin;
      balloon.position.y = bg + Math.sin(t * 0.7) * 0.5;
      balloon.rotation.y = Math.sin(t * 0.25) * 0.25;
    },
  };
}
