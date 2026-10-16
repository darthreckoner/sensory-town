// The five landmarks: fountain, windmill, ice-cream stand, duck pond, playground.
// Each is a self-contained Piece with its own colliders and animation.
import * as THREE from 'three';
import { LANDMARKS, seeded, type Landmark } from '../world/townLayout';
import { toyMat, roundedBox } from '../art/materials';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { InstanceBatch, archGeometry, bakeStatic, decalAtlas, lathe, lathedMat, put, stripeTexture } from './envUtils';

const TAU = Math.PI * 2;
const lm = (id: string): Landmark => LANDMARKS.find((l) => l.id === id)!;

function glassWater(color = '#8fe0ff', opacity = 0.88): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fountain
// ─────────────────────────────────────────────────────────────────────────────
function buildFountain(): Piece {
  const L = lm('fountain');
  const group = new THREE.Group();
  group.position.set(L.x, 0, L.z);
  const fixed = new THREE.Group();
  const cream = toyMat('#fff1f6', 'satin');
  const pink = toyMat('#ffb3d1');
  const lilac = toyMat('#c9a7ff');
  const butter = toyMat('#ffd166');

  put(fixed, new THREE.CylinderGeometry(2.55, 2.65, 0.75, 40), cream, 0, 0.375, 0);
  put(fixed, new THREE.TorusGeometry(2.5, 0.2, 10, 44).rotateX(Math.PI / 2), pink, 0, 0.78, 0);
  put(fixed, new THREE.CylinderGeometry(0.26, 0.4, 1.6, 16), cream, 0, 1.5, 0);
  put(fixed, new THREE.CylinderGeometry(0.1, 0.16, 0.7, 12), cream, 0, 2.6, 0);
  put(fixed, new THREE.SphereGeometry(0.2, 12, 10), butter, 0, 2.98, 0);
  const bowl = (r: number, h: number, y: number, col: string): void => {
    const b = put(fixed, new THREE.SphereGeometry(1, 28, 10, 0, TAU, Math.PI / 2, Math.PI / 2), lathedMat(col), 0, y, 0);
    b.scale.set(r, h, r);
    put(fixed, new THREE.TorusGeometry(r, 0.09, 8, 32).rotateX(Math.PI / 2), toyMat('#ffffff'), 0, y, 0);
  };
  bowl(1.5, 0.52, 1.5, '#c9a7ff');
  bowl(0.9, 0.34, 2.3, '#ffb3d1');
  // four park benches facing the fountain
  const woodBench = toyMat('#ffcba4', 'satin');
  const benchCols: Collider[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const bench = new THREE.Group();
    bench.position.set(Math.sin(a) * 4.5, 0, Math.cos(a) * 4.5);
    bench.rotation.y = a + Math.PI;
    put(bench, roundedBox(1.7, 0.14, 0.55, 0.05), woodBench, 0, 0.5, 0);
    put(bench, roundedBox(1.7, 0.5, 0.1, 0.05), woodBench, 0, 0.85, -0.26);
    for (const lx of [-0.7, 0.7]) put(bench, roundedBox(0.12, 0.5, 0.5, 0.04), lilac, lx, 0.25, 0);
    fixed.add(bench);
    benchCols.push({ kind: 'circle', x: L.x + Math.sin(a) * 4.5, z: L.z + Math.cos(a) * 4.5, r: 0.95 });
  }
  group.add(bakeStatic(fixed));

  // Water surfaces (basin + both bowls).
  const waterMat = glassWater();
  const basin = new THREE.Mesh(new THREE.CircleGeometry(2.38, 36).rotateX(-Math.PI / 2), waterMat);
  basin.position.y = 0.66;
  const w1 = new THREE.Mesh(new THREE.CircleGeometry(1.38, 28).rotateX(-Math.PI / 2), waterMat);
  w1.position.y = 1.42;
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.82, 24).rotateX(-Math.PI / 2), waterMat);
  w2.position.y = 2.24;
  group.add(basin, w1, w2);

  // Expanding ripples in the basin.
  const ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; off: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2), mat);
    mesh.position.y = 0.675;
    group.add(mesh);
    ripples.push({ mesh, mat, off: i / 3 });
  }

  // Spray: three arcs of droplets, each a parabola that lands in the next bowl down.
  const drops = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 7, 6),
    new THREE.MeshStandardMaterial({ color: '#c8f2ff', emissive: '#7fd8ff', emissiveIntensity: 0.45, roughness: 0.1 }),
    72,
  );
  drops.frustumCulled = false;
  drops.castShadow = false;
  group.add(drops);
  const tiers = [
    { y0: 3.0, r0: 0.05, vy: 1.7, T: 0.62, r1: 0.8 },
    { y0: 2.3, r0: 0.9, vy: 1.0, T: 0.73, r1: 2.0 },
    { y0: 1.5, r0: 1.5, vy: 0.5, T: 0.49, r1: 2.15 },
  ];
  const G = 9;
  const dropData = Array.from({ length: 72 }, (_, i) => {
    const tier = tiers[i % 3];
    return { tier, ang: ((i * 2.399963) % TAU), off: (i / 72) * 3 % 1 };
  });
  const dummy = new THREE.Object3D();

  return {
    group,
    colliders: [
      { kind: 'circle', x: L.x, z: L.z, r: 2.75 },
      ...benchCols,
    ],
    update(_dt: number, t: number) {
      basin.position.y = 0.66 + Math.sin(t * 1.3) * 0.01;
      for (const r of ripples) {
        const k = (t * 0.35 + r.off) % 1;
        const s = 0.5 + k * 1.9;
        r.mesh.scale.set(s, 1, s);
        r.mat.opacity = 0.5 * (1 - k);
      }
      for (let i = 0; i < dropData.length; i++) {
        const d = dropData[i];
        const k = (t * 1.1 + d.off) % 1;
        const tau = k * d.tier.T;
        const rad = d.tier.r0 + ((d.tier.r1 - d.tier.r0) * tau) / d.tier.T;
        dummy.position.set(Math.cos(d.ang) * rad, d.tier.y0 + d.tier.vy * tau - 0.5 * G * tau * tau, Math.sin(d.ang) * rad);
        const s = k > 0.85 ? (1 - k) / 0.15 : 1;
        dummy.scale.setScalar(Math.max(0.0001, s));
        dummy.updateMatrix();
        drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Windmill
// ─────────────────────────────────────────────────────────────────────────────
function buildWindmill(): Piece {
  const L = lm('windmill');
  const group = new THREE.Group();
  group.position.set(L.x, 0, L.z);
  const colliders: Collider[] = [{ kind: 'circle', x: L.x, z: L.z, r: 2.7 }];
  const fixed = new THREE.Group();
  const pinkDeep = toyMat('#ff7aa6');
  const mint = toyMat('#7fe3b8');
  const white = toyMat('#ffffff');
  const butter = toyMat('#ffd166');

  // tapered round tower with candy bands
  put(fixed, lathe([[0, 0], [2.55, 0], [2.55, 0.35], [2.35, 0.45], [1.6, 6.6], [1.75, 6.75], [0, 6.75]], 32), lathedMat('#fff0e0', 'satin'), 0, 0, 0);
  const radiusAt = (y: number): number => 2.35 - 0.122 * (y - 0.45);
  [[1.9, pinkDeep], [3.7, mint], [5.4, pinkDeep]].forEach(([y, m]) => {
    put(fixed, new THREE.TorusGeometry(radiusAt(y as number) + 0.02, 0.12, 8, 32).rotateX(Math.PI / 2), m as THREE.Material, 0, y as number, 0);
  });
  const cap = put(fixed, new THREE.SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2), pinkDeep, 0, 6.65, 0);
  cap.scale.set(2.15, 1.55, 2.15);
  put(fixed, new THREE.SphereGeometry(0.25, 12, 10), butter, 0, 8.25, 0);

  // Everything that faces the town (door, windows, rotor) lives in `front`, yawed toward the town centre.
  const yaw = Math.atan2(-L.x, -L.z);
  const front = new THREE.Group();
  front.rotation.y = yaw;
  const frontFixed = new THREE.Group();
  // the tower leans in by atan(0.122) per unit height, so the door leans with it
  put(frontFixed, archGeometry(1.5, 0.9, 0.2, 0.04), white, 0, 0.45, 2.3, -0.121, 0, 0);
  put(frontFixed, archGeometry(1.15, 0.9, 0.2, 0.04), toyMat('#6fe3b5'), 0, 0.45, 2.4, -0.121, 0, 0);
  const glow = new THREE.MeshStandardMaterial({ color: '#cfeeff', emissive: '#ffe7a8', emissiveIntensity: 0.7 });
  for (const [wx, wy] of [[-0.9, 3.0], [0.9, 3.0], [0, 4.4]]) {
    const r = radiusAt(wy) - 0.02;
    const phi = Math.asin(wx / r);
    const zz = Math.sqrt(r * r - wx * wx);
    put(frontFixed, new THREE.TorusGeometry(0.34, 0.07, 8, 20), white, wx, wy, zz + 0.02, 0, phi, 0);
    put(frontFixed, new THREE.CircleGeometry(0.34, 20), glow, wx + Math.sin(phi) * 0.04, wy, zz + Math.cos(phi) * 0.04, 0, phi, 0, false, false);
  }
  put(frontFixed, new THREE.CylinderGeometry(0.28, 0.28, 0.9, 14).rotateX(Math.PI / 2), white, 0, 6.2, 1.9);
  front.add(bakeStatic(frontFixed));
  // Rotor: hub + four sails.
  const rotor = new THREE.Group();
  rotor.position.set(0, 6.2, 2.45);
  const rotorFixed = new THREE.Group();
  put(rotorFixed, new THREE.SphereGeometry(0.46, 14, 12), butter, 0, 0, 0);
  const sailCols = ['#ff8fb1', '#7fe3b8', '#ffd166', '#c9a7ff'];
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    put(arm, roundedBox(0.3, 5.3, 0.16, 0.07), toyMat('#e9c9a6', 'satin'), 0, 2.75, 0);
    put(arm, roundedBox(1.15, 3.7, 0.07, 0.04), toyMat(sailCols[k], 'fabric'), 0.68, 3.05, 0.1, 0, 0, 0, true, false);
    for (const y of [1.6, 2.6, 3.6, 4.6]) put(arm, roundedBox(1.15, 0.05, 0.05, 0.02), white, 0.68, y, 0.15);
    rotorFixed.add(arm);
  }
  rotor.add(bakeStatic(rotorFixed));
  front.add(rotor);
  group.add(bakeStatic(fixed), front);

  // hay bales + a patch of wheat
  const bales = new THREE.Group();
  const baleGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.3, 18).rotateZ(Math.PI / 2);
  const baleMat = toyMat('#f4d27a', 'satin');
  [[-3.4, 2.4, 0.4], [-4.9, 1.6, -0.5], [-3.9, 3.8, 0.9]].forEach(([bx, bz, rot], i) => {
    put(bales, baleGeo, baleMat, bx, 0.85, bz, 0, rot, 0);
    put(bales, new THREE.TorusGeometry(0.86, 0.06, 6, 24).rotateY(Math.PI / 2), toyMat('#d9a441', 'satin'), bx, 0.85, bz, 0, rot, 0, true, false);
    colliders.push({ kind: 'circle', x: L.x + bx, z: L.z + bz, r: 1.05 });
    void i;
  });
  group.add(bakeStatic(bales));
  const rng = seeded(77);
  const wheat = new InstanceBatch(new THREE.ConeGeometry(0.07, 1.1, 5), toyMat('#ffe08a', 'matte'), false, false);
  for (let i = 0; i < 140; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 3.4;
    wheat.add(5.5 + Math.cos(a) * r * 1.3, 0.55, 2.5 + Math.sin(a) * r, rng() * TAU, 1, 0.8 + rng() * 0.6, 1, ['#ffe08a', '#ffd166', '#f9e79f'][i % 3], (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25);
  }
  const wm = wheat.build();
  if (wm) group.add(wm);

  return {
    group,
    colliders,
    update(dt: number) {
      rotor.rotation.z -= dt * 0.55;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ice-cream stand with a giant cone
// ─────────────────────────────────────────────────────────────────────────────
function waffleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2c887';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#c98f46';
  x.lineWidth = 7;
  for (let i = -128; i < 256; i += 32) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 128, 128);
    x.moveTo(i + 128, 0);
    x.lineTo(i, 128);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.anisotropy = 4;
  return t;
}

function buildIceCream(): Piece {
  const L = lm('icecream');
  const group = new THREE.Group();
  group.position.set(L.x, 0, L.z);
  group.rotation.y = Math.PI / 2; // local +z (the serving window) faces east, towards the town
  const fixed = new THREE.Group();
  const pink = toyMat('#ffb3d1');
  const mint = toyMat('#7fe3b8');
  const white = toyMat('#ffffff');
  const lilac = toyMat('#c9a7ff');
  const cream = toyMat('#fff3d6');

  put(fixed, roundedBox(3.5, 0.3, 2.9, 0.12), pink, 0, 0.15, 0);
  const bodyMat = new THREE.MeshPhysicalMaterial({ map: stripeTexture('#ffc2da', '#ffffff', 6), roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  put(fixed, roundedBox(3.2, 2.9, 2.6, 0.35), bodyMat, 0, 1.75, 0);
  put(fixed, roundedBox(2.0, 1.0, 0.12, 0.08), toyMat('#5b4f78', 'satin'), 0, 1.95, 1.3);
  put(fixed, roundedBox(2.4, 0.14, 0.75, 0.06), lilac, 0, 1.38, 1.62);
  // striped awning with scallops
  for (let i = 0; i < 7; i++) {
    const x = -1.2 + i * 0.4;
    const c = i % 2 === 0 ? mint : white;
    put(fixed, roundedBox(0.4, 0.1, 1.5, 0.04), c, x, 2.78, 2.05, 0.25, 0, 0);
    const s = put(fixed, new THREE.SphereGeometry(0.22, 10, 8), c, x, 2.47, 2.78);
    s.scale.set(1, 0.7, 1);
  }
  put(fixed, roundedBox(3.7, 0.3, 3.1, 0.14), lilac, 0, 3.35, 0);
  // two tiny cones on the counter
  [[-0.65, '#ffb3d1'], [0.65, '#fff3a3']].forEach(([x, col]) => {
    put(fixed, new THREE.ConeGeometry(0.15, 0.36, 12).rotateX(Math.PI), toyMat('#f2c887', 'satin'), x as number, 1.64, 1.62);
    put(fixed, new THREE.SphereGeometry(0.2, 12, 10), toyMat(col as string), x as number, 1.9, 1.62);
  });
  // menu board
  const mx = 2.5, mz = 1.5;
  put(fixed, new THREE.CylinderGeometry(0.07, 0.08, 1.5, 8), toyMat('#b98563', 'satin'), mx, 0.75, mz);
  put(fixed, roundedBox(1.35, 1.0, 0.1, 0.1), toyMat('#4b4766', 'satin'), mx, 1.7, mz);
  put(fixed, roundedBox(1.5, 1.15, 0.08, 0.12), pink, mx, 1.7, mz - 0.03);
  // parasol table
  const tx = -2.4, tz = 1.9;
  put(fixed, new THREE.CylinderGeometry(0.6, 0.6, 0.08, 20), cream, tx, 0.8, tz);
  put(fixed, new THREE.CylinderGeometry(0.06, 0.1, 0.8, 8), white, tx, 0.4, tz);
  put(fixed, new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), white, tx, 1.05, tz);
  for (const o of [-0.95, 0.95]) put(fixed, new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14), o < 0 ? pink : mint, tx + o, 0.45, tz + (o < 0 ? 0.2 : -0.2));
  const umbrella = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 0.6, 20, 1, true),
    new THREE.MeshStandardMaterial({ map: stripeTexture('#ff8fb1', '#ffffff', 6), roughness: 0.6, side: THREE.DoubleSide }),
  );
  umbrella.position.set(tx, 2.45, tz);
  umbrella.castShadow = true;
  fixed.add(umbrella);
  group.add(bakeStatic(fixed));
  group.add(decalAtlas([
    { char: '🍦', x: mx - 0.32, y: 1.7, z: mz + 0.07, size: 0.58 },
    { char: '🍨', x: mx + 0.32, y: 1.7, z: mz + 0.07, size: 0.58 },
  ]));

  // The giant cone: tilted, slowly turning.
  const tilt = new THREE.Group();
  tilt.position.set(0, 3.4, 0);
  tilt.rotation.z = 0.1;
  const spin = new THREE.Group();
  tilt.add(spin);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.6, 24).rotateX(Math.PI), new THREE.MeshPhysicalMaterial({ map: waffleTexture(), roughness: 0.55, clearcoat: 0.25 }));
  cone.position.y = 1.4;
  cone.castShadow = true;
  spin.add(cone);
  const topFixed = new THREE.Group();
  put(topFixed, new THREE.TorusGeometry(0.97, 0.09, 8, 28).rotateX(Math.PI / 2), toyMat('#e0a85c', 'satin'), 0, 2.7, 0);
  put(topFixed, new THREE.SphereGeometry(1.0, 24, 18), pink, 0, 3.15, 0);
  const lip = put(topFixed, new THREE.SphereGeometry(1, 20, 10), pink, 0, 2.78, 0);
  lip.scale.set(1.05, 0.33, 1.05);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const d = put(topFixed, new THREE.SphereGeometry(0.15, 10, 8), pink, Math.cos(a) * 0.98, 2.62 - (i % 3) * 0.08, Math.sin(a) * 0.98);
    d.scale.y = 1.9 + (i % 3) * 0.5;
  }
  put(topFixed, new THREE.SphereGeometry(0.78, 22, 16), toyMat('#fff3a3'), 0, 4.1, 0);
  put(topFixed, new THREE.SphereGeometry(0.22, 12, 10), toyMat('#ff4f6d'), 0, 4.98, 0.05);
  put(topFixed, new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), toyMat('#6b8f4e'), 0.05, 5.25, 0.05, 0, 0, -0.4);
  const sprinkleCols = ['#ff5d8f', '#5aa9ff', '#5fd3a5', '#ffd166', '#9d8cff'];
  const rng = seeded(5);
  for (let i = 0; i < 16; i++) {
    const u = rng() * TAU, v = Math.acos(1 - rng() * 0.9); // upper-ish cap
    const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
    const s = put(topFixed, roundedBox(0.16, 0.05, 0.05, 0.02), toyMat(sprinkleCols[i % 5]), nx * 0.8, 4.1 + ny * 0.8, nz * 0.8, rng() * 3, rng() * 3, rng() * 3);
    s.castShadow = false;
  }
  spin.add(bakeStatic(topFixed));
  group.add(tilt);

  // Colliders in world space (local → world for a +90° yaw: x' = lz, z' = -lx).
  const w = (lx: number, lz: number): { x: number; z: number } => ({ x: L.x + lz, z: L.z - lx });
  const booth = w(0, 0.25);
  const table = w(tx, tz);
  const menu = w(mx, mz);
  return {
    group,
    colliders: [
      { kind: 'box', x: booth.x, z: booth.z, hw: 1.75, hd: 1.8 },
      { kind: 'circle', x: table.x, z: table.z, r: 0.85 },
      { kind: 'circle', x: menu.x, z: menu.z, r: 0.6 },
    ],
    update(_dt: number, t: number) {
      spin.rotation.y = t * 0.6;
      tilt.position.y = 3.4 + Math.sin(t * 1.6) * 0.05;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Duck pond
// ─────────────────────────────────────────────────────────────────────────────
const pondRadius = (a: number): number => 5.6 + 0.6 * Math.sin(3 * a + 1) + 0.35 * Math.sin(5 * a + 2);

function blobShape(scale: (a: number) => number, steps = 56): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const r = scale(a);
    // y is negated because the flat shape is rotated -90° about X (shape y -> world -z)
    const x = Math.cos(a) * r, y = -Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

function buildDuck(body: string): THREE.Group {
  const g = new THREE.Group();
  const yellow = toyMat(body);
  const dark = toyMat('#3d3a4b', 'gloss');
  const b = put(g, new THREE.SphereGeometry(0.5, 16, 12), yellow, 0, 0.32, 0);
  b.scale.set(0.82, 0.62, 1.0);
  const tail = put(g, new THREE.SphereGeometry(0.2, 10, 8), yellow, 0, 0.5, -0.52);
  tail.scale.set(0.7, 0.9, 1.1);
  for (const sx of [-1, 1]) {
    const wing = put(g, new THREE.SphereGeometry(0.3, 10, 8), toyMat('#ffe98a'), sx * 0.4, 0.36, -0.05);
    wing.scale.set(0.3, 0.5, 0.85);
  }
  put(g, new THREE.SphereGeometry(0.29, 16, 12), yellow, 0, 0.82, 0.4);
  const beak = put(g, new THREE.ConeGeometry(0.11, 0.3, 10), toyMat('#ffa94d'), 0, 0.74, 0.74, Math.PI / 2, 0, 0);
  beak.scale.set(1.4, 1, 0.6);
  for (const sx of [-1, 1]) {
    put(g, new THREE.SphereGeometry(0.05, 8, 6), dark, sx * 0.14, 0.9, 0.62);
    const blush = put(g, new THREE.SphereGeometry(0.05, 8, 6), toyMat('#ff9fb8'), sx * 0.21, 0.78, 0.58);
    blush.scale.z = 0.5;
  }
  return bakeStatic(g);
}

function buildPond(): Piece {
  const L = lm('pond');
  const group = new THREE.Group();
  group.position.set(L.x, 0, L.z);
  const fixed = new THREE.Group();

  // shore sand, then water
  const sandGeo = new THREE.ShapeGeometry(blobShape((a) => pondRadius(a) + 1.0), 4).rotateX(-Math.PI / 2);
  put(fixed, sandGeo, toyMat('#f7e7bd', 'matte'), 0, 0.03, 0, 0, 0, 0, false, true);
  const water = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(pondRadius), 4).rotateX(-Math.PI / 2), glassWater('#97e0f3', 0.93));
  water.position.y = 0.07;
  water.receiveShadow = true;
  group.add(water);

  // rocks around the edge
  const rng = seeded(33);
  const rocks = new InstanceBatch(new THREE.IcosahedronGeometry(1, 1), toyMat('#d7d3ea', 'satin'));
  const rockCols = ['#d7d3ea', '#c9c3e6', '#e6e0f2', '#bfd0e8'];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + (rng() - 0.5) * 0.2;
    const r = pondRadius(a) + 0.35 + rng() * 0.5;
    const s = 0.28 + rng() * 0.3;
    rocks.add(Math.cos(a) * r, s * 0.35, Math.sin(a) * r, rng() * TAU, s * 1.2, s * 0.8, s, rockCols[i % 4]);
  }
  const rm = rocks.build();
  if (rm) group.add(rm);

  // reeds with cattails (3 clumps)
  const stems = new InstanceBatch(new THREE.CylinderGeometry(0.025, 0.035, 1.7, 5), toyMat('#6fc48b', 'matte'), true, false);
  const heads = new InstanceBatch(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), toyMat('#a0694a', 'satin'), true, false);
  for (const ca of [0.6, 2.4, 4.4]) {
    const r0 = pondRadius(ca) + 0.2;
    for (let i = 0; i < 6; i++) {
      const x = Math.cos(ca) * r0 + (rng() - 0.5) * 1.0, z = Math.sin(ca) * r0 + (rng() - 0.5) * 1.0;
      const h = 0.8 + rng() * 0.5;
      stems.add(x, 0.85 * h, z, 0, 1, h, 1, undefined, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.15);
      heads.add(x, 1.7 * h, z, 0, 1, 1, 1);
    }
  }
  for (const m of [stems.build(), heads.build()]) if (m) group.add(m);

  // lily pads and lotus flowers
  const padMat = toyMat('#78d68f', 'satin');
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU, r = rng() * 3.6;
    const p = put(fixed, new THREE.CircleGeometry(0.5 + rng() * 0.18, 18).rotateX(-Math.PI / 2), padMat, Math.cos(a) * r, 0.09, Math.sin(a) * r, 0, 0, 0, false, true);
    if (i % 3 === 0) {
      const f = put(fixed, new THREE.SphereGeometry(0.16, 10, 8), toyMat('#ff9fc4'), p.position.x, 0.2, p.position.z);
      f.scale.y = 1.2;
      put(fixed, new THREE.SphereGeometry(0.07, 8, 6), toyMat('#ffe08a'), p.position.x, 0.33, p.position.z);
    }
  }
  group.add(bakeStatic(fixed));

  // ducks
  const ducks: { g: THREE.Group; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; ph: number; sp: number; rho: number; sq: number }[] = [];
  const duckCols = ['#ffe066', '#ffe066', '#fff6f0', '#ffd23f'];
  for (let i = 0; i < 4; i++) {
    const g = buildDuck(duckCols[i]);
    g.scale.setScalar(i === 3 ? 0.62 : 1);
    group.add(g);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.085;
    group.add(ring);
    ducks.push({ g, ring, ringMat, ph: i * 1.7, sp: (0.11 + i * 0.03) * (i % 2 ? -1 : 1), rho: 1.8 + i * 0.55, sq: 0.8 + i * 0.04 });
  }

  const colliders: Collider[] = [{ kind: 'circle', x: L.x, z: L.z, r: 3.1 }];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const d = pondRadius(a) - 1.3;
    colliders.push({ kind: 'circle', x: L.x + Math.cos(a) * d, z: L.z + Math.sin(a) * d, r: 2.1 });
  }

  const pos = (d: (typeof ducks)[number], t: number): [number, number] => {
    const a = d.ph + t * d.sp;
    const r = d.rho + Math.sin(t * 0.31 + d.ph) * 0.6;
    return [Math.cos(a) * r, Math.sin(a) * r * d.sq];
  };
  return {
    group,
    colliders,
    update(_dt: number, t: number) {
      for (const d of ducks) {
        const [x, z] = pos(d, t);
        const [x2, z2] = pos(d, t + 0.05);
        d.g.position.set(x, 0.1 + Math.sin(t * 2.6 + d.ph) * 0.025, z);
        d.g.rotation.y = Math.atan2(x2 - x, z2 - z);
        d.g.rotation.z = Math.sin(t * 2.2 + d.ph) * 0.05;
        d.ring.position.x = x;
        d.ring.position.z = z;
        const k = (t * 0.6 + d.ph) % 1;
        d.ring.scale.set(0.7 + k * 0.9, 1, 0.7 + k * 0.9);
        d.ringMat.opacity = 0.4 * (1 - k);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Playground
// ─────────────────────────────────────────────────────────────────────────────
function buildPlayground(): Piece {
  const L = lm('playground');
  const group = new THREE.Group();
  group.position.set(L.x, 0, L.z);
  const fixed = new THREE.Group();
  const colliders: Collider[] = [];
  const circle = (x: number, z: number, r: number): void => {
    colliders.push({ kind: 'circle', x: L.x + x, z: L.z + z, r });
  };
  const white = toyMat('#ffffff');
  const lilac = toyMat('#c9a7ff');
  const pink = toyMat('#ff9fc4');
  const mint = toyMat('#7fe3b8');
  const butter = toyMat('#ffd166');

  // soft rubber floor
  put(fixed, new THREE.CircleGeometry(4.3, 40).rotateX(-Math.PI / 2), toyMat('#f3dcff', 'matte'), 0, 0.04, 0, 0, 0, 0, false, true);
  put(fixed, new THREE.TorusGeometry(4.3, 0.12, 8, 48).rotateX(Math.PI / 2), pink, 0, 0.08, 0, 0, 0, 0, false, true);

  // slide tower
  const tx = -1.6, tz = -1.4;
  for (const [ox, oz] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) put(fixed, new THREE.CylinderGeometry(0.08, 0.09, 2.3, 10), white, tx + ox, 1.15, tz + oz);
  put(fixed, roundedBox(1.55, 0.14, 1.55, 0.06), lilac, tx, 2.1, tz);
  put(fixed, roundedBox(1.55, 0.5, 0.08, 0.04), mint, tx, 2.42, tz - 0.74);
  put(fixed, roundedBox(0.08, 0.5, 1.55, 0.04), mint, tx + 0.74, 2.42, tz);
  put(fixed, new THREE.ConeGeometry(1.35, 0.9, 4).rotateY(Math.PI / 4), pink, tx, 3.2, tz);
  // ladder on the west side
  for (const oz of [-0.4, 0.4]) put(fixed, new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), white, tx - 0.95, 1.1, tz + oz, 0, 0, -0.14);
  for (let i = 0; i < 5; i++) {
    const ry = 0.35 + i * 0.4;
    put(fixed, new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8).rotateX(Math.PI / 2), white, tx - 0.95 + (ry - 1.1) * 0.14, ry, tz);
  }
  circle(tx, tz, 1.2);
  // slide ramp
  const slide = new THREE.Group();
  slide.position.set(tx, 2.1, tz + 0.75);
  slide.rotation.x = 0.509;
  put(slide, roundedBox(0.9, 0.1, 3.9, 0.04), butter, 0, -0.05, 1.95);
  for (const sx of [-1, 1]) put(slide, roundedBox(0.08, 0.2, 3.9, 0.03), pink, sx * 0.5, 0.05, 1.95);
  fixed.add(slide);
  circle(tx, tz + 2.4, 0.8);
  circle(tx, tz + 1.5, 0.6);

  // sandbox with toys
  const sx = 1.1, sz = -2.1;
  put(fixed, roundedBox(2.3, 0.12, 2.3, 0.04), toyMat('#f6dfa8', 'matte'), sx, 0.06, sz, 0, 0, 0, false, true);
  for (const [ox, oz, w, d] of [[0, -1.1, 2.4, 0.2], [0, 1.1, 2.4, 0.2], [-1.1, 0, 0.2, 2.4], [1.1, 0, 0.2, 2.4]]) put(fixed, roundedBox(w, 0.34, d, 0.08), lilac, sx + ox, 0.17, sz + oz);
  put(fixed, new THREE.CylinderGeometry(0.28, 0.2, 0.36, 14), toyMat('#ff8fb1'), sx - 0.4, 0.28, sz + 0.2);
  put(fixed, new THREE.SphereGeometry(0.2, 12, 10), toyMat('#7fd8ff'), sx + 0.45, 0.22, sz - 0.3);
  circle(sx, sz, 1.4);

  // seesaw (animated board is separate)
  put(fixed, new THREE.CylinderGeometry(0.0, 0.32, 0.55, 3), pink, 0, 0.28, 0.4, 0, 0, 0);
  const seesaw = new THREE.Group();
  seesaw.position.set(0, 0.6, 0.4);
  put(seesaw, roundedBox(2.5, 0.1, 0.36, 0.04), butter, 0, 0, 0);
  for (const ox of [-1, 1]) put(seesaw, new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), white, ox * 0.95, 0.2, 0);
  group.add(seesaw);
  circle(0, 0.4, 0.55);

  // swing set (A-frames, top bar, two swinging seats)
  const wx = 1.6, wz = 1.5;
  for (const ax of [-1.6, 1.6])
    for (const s of [-1, 1]) {
      put(fixed, new THREE.CylinderGeometry(0.07, 0.08, 2.55, 8), lilac, wx + ax, 1.2, wz + s * 0.4, s * -0.31, 0, 0);
      circle(wx + ax, wz + s * 0.8, 0.4);
    }
  put(fixed, new THREE.CylinderGeometry(0.07, 0.07, 3.5, 10).rotateZ(Math.PI / 2), pink, wx, 2.4, wz);
  const swings: { pivot: THREE.Group; ph: number }[] = [];
  [-0.65, 0.65].forEach((ox, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(wx + ox, 2.4, wz);
    for (const cx of [-0.2, 0.2]) put(pivot, new THREE.CylinderGeometry(0.018, 0.018, 1.75, 5), toyMat('#d9d6ee', 'metal'), cx, -0.88, 0, 0, 0, 0, false, false);
    put(pivot, roundedBox(0.55, 0.08, 0.32, 0.04), i === 0 ? mint : butter, 0, -1.78, 0);
    group.add(pivot);
    swings.push({ pivot, ph: i * 1.3 });
  });

  group.add(bakeStatic(fixed));

  return {
    group,
    colliders,
    update(_dt: number, t: number) {
      for (const s of swings) s.pivot.rotation.x = Math.sin(t * 1.7 + s.ph) * 0.5;
      seesaw.rotation.z = Math.sin(t * 1.3) * 0.2;
    },
  };
}

export function buildLandmarks(): Piece[] {
  return [buildFountain(), buildWindmill(), buildIceCream(), buildPond(), buildPlayground()];
}
