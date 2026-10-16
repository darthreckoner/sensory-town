// The WORKSHOP: a candy-colored craft lab. Pink walls, a striped umbrella-dome
// roof, a giant bubbling beaker sign, a candy-swirl plaque, round windows,
// a striped awning over a mint arched door (facing north), two chemistry tanks.
import * as THREE from 'three';
import { WORKSHOP } from '../world/townLayout';
import { toyMat, roundedBox } from '../art/materials';
import type { Piece } from './types';
import { archGeometry, bakeStatic, lathe, put, stripeTexture, swirlTexture } from './envUtils';

interface Bubble { speed: number; off: number; ox: number; oz: number; size: number; }

export function buildWorkshop(): Piece {
  const W = WORKSHOP;
  const group = new THREE.Group();
  group.position.set(W.center.x, 0, W.center.z);
  const fixed = new THREE.Group();

  const pink = toyMat('#ffb3d1');
  const pinkDeep = toyMat('#ff7aa6');
  const cream = toyMat('#fff1e6', 'satin');
  const white = toyMat('#ffffff');
  const lilac = toyMat('#c9a7ff');
  const mint = toyMat('#7fe3b8');
  const butter = toyMat('#ffd166');
  const sky = toyMat('#8fd0ff');
  const glowGlass = new THREE.MeshStandardMaterial({ color: '#cfeeff', emissive: '#ffe7a8', emissiveIntensity: 0.75, roughness: 0.2 });

  const F = -W.size.d / 2; // z of the front (north) face, local

  // ── body ──
  put(fixed, roundedBox(13.6, 0.7, 10.6, 0.25), cream, 0, 0.35, 0);
  put(fixed, roundedBox(13, 5.4, 10, 0.55), pink, 0, 3.3, 0);
  put(fixed, roundedBox(13.12, 0.34, 10.12, 0.15), mint, 0, 5.45, 0);
  put(fixed, roundedBox(13.8, 0.4, 10.8, 0.2), white, 0, 6.2, 0);

  // ── umbrella dome roof ──
  const domeMat = new THREE.MeshPhysicalMaterial({
    map: stripeTexture('#c9a7ff', '#f4ecff', 14), roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.25,
  });
  const dome = put(fixed, new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 6.4, 0);
  dome.scale.set(6.3, 2.2, 4.8);
  put(fixed, new THREE.SphereGeometry(0.42, 16, 12), butter, 0, 8.7, 0);

  // ── chimney ──
  put(fixed, new THREE.CylinderGeometry(0.6, 0.72, 2.3, 18), mint, -3.9, 8.5, 2.2);
  put(fixed, new THREE.TorusGeometry(0.64, 0.13, 8, 20).rotateX(Math.PI / 2), white, -3.9, 9.6, 2.2);

  // ── arched door, facing north ──
  put(fixed, archGeometry(3.0, 1.7, 0.14, 0.04), white, 0, 0.7, F - 0.12);
  put(fixed, archGeometry(2.4, 1.7, 0.22, 0.05), toyMat('#6fe3b5'), 0, 0.7, F - 0.26);
  put(fixed, new THREE.SphereGeometry(0.12, 12, 10), butter, 0.78, 1.75, F - 0.4);
  // little round window in the door (door front face is at F - 0.31)
  put(fixed, new THREE.TorusGeometry(0.4, 0.07, 8, 22), white, 0, 3.0, F - 0.33);
  put(fixed, new THREE.CircleGeometry(0.4, 22), glowGlass, 0, 3.0, F - 0.34, 0, Math.PI, 0, false, false);

  // ── striped awning with scalloped edge ──
  for (let i = 0; i < 9; i++) {
    const x = -2.4 + i * 0.6;
    const c = i % 2 === 0 ? pinkDeep : white;
    put(fixed, roundedBox(0.6, 0.12, 2.6, 0.05, 1), c, x, 4.08, F - 1.25, -0.26, 0, 0);
    const s = put(fixed, new THREE.SphereGeometry(0.32, 12, 8), c, x, 3.68, F - 2.5);
    s.scale.set(1, 0.72, 1);
  }

  // ── big round windows with flower boxes ──
  const addRoundWindow = (x: number, y: number, z: number, yaw: number, r: number): void => {
    const w = new THREE.Group();
    w.position.set(x, y, z);
    w.rotation.y = yaw;
    put(w, new THREE.TorusGeometry(r, r * 0.15, 10, 28), white, 0, 0, 0);
    put(w, new THREE.CircleGeometry(r, 28), glowGlass, 0, 0, 0.02, 0, Math.PI, 0, false, false);
    put(w, roundedBox(r * 2, 0.08, 0.08, 0.03), white, 0, 0, 0.05, 0, 0, 0, false, false);
    put(w, roundedBox(0.08, r * 2, 0.08, 0.03), white, 0, 0, 0.05, 0, 0, 0, false, false);
    fixed.add(w);
  };
  // yaw = π faces -z (north); the circle's normal is +z by default.
  addRoundWindow(-4.4, 3.5, F - 0.06, Math.PI, 1.05);
  addRoundWindow(4.4, 3.5, F - 0.06, Math.PI, 1.05);
  addRoundWindow(W.size.w / 2 + 0.06, 3.4, -1.3, Math.PI / 2, 0.85);
  addRoundWindow(W.size.w / 2 + 0.06, 3.4, 2.7, Math.PI / 2, 0.85);
  addRoundWindow(-W.size.w / 2 - 0.06, 3.4, -1.3, -Math.PI / 2, 0.85);
  addRoundWindow(-W.size.w / 2 - 0.06, 3.4, 2.7, -Math.PI / 2, 0.85);
  const flowerCols = ['#ff8fb1', '#ffd166', '#ffffff', '#9d8cff', '#7fd8ff'];
  for (const sx of [-4.4, 4.4]) {
    put(fixed, roundedBox(2.4, 0.4, 0.7, 0.13), lilac, sx, 2.08, F - 0.4);
    for (let k = 0; k < 7; k++) {
      put(fixed, new THREE.SphereGeometry(0.17, 10, 8), toyMat(flowerCols[(k + (sx > 0 ? 2 : 0)) % flowerCols.length]), sx - 1.0 + k * 0.33, 2.42, F - 0.4 + ((k % 2) - 0.5) * 0.18);
    }
  }

  // ── chemistry tanks on the east side ──
  const tankCols = [mint, sky];
  const tankZ = [-1.9, 1.7];
  for (let i = 0; i < 2; i++) {
    const tx = W.size.w / 2 + 1.6;
    put(fixed, new THREE.CylinderGeometry(1.15, 1.15, 4.0, 24), tankCols[i], tx, 2.0, tankZ[i]);
    const top = put(fixed, new THREE.SphereGeometry(1.15, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), tankCols[i], tx, 4.0, tankZ[i]);
    top.scale.y = 0.6;
    for (const by of [1.0, 2.9]) put(fixed, new THREE.TorusGeometry(1.17, 0.1, 8, 28).rotateX(Math.PI / 2), white, tx, by, tankZ[i]);
    put(fixed, new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8).rotateZ(Math.PI / 2), white, tx - 1.55, 3.4, tankZ[i]);
    put(fixed, new THREE.SphereGeometry(0.2, 10, 8), butter, tx, 4.75, tankZ[i]);
  }

  // Everything above is static: bake it into a few draw calls.
  group.add(bakeStatic(fixed));

  // ── animated bits ──
  // swirl plaque over the awning
  const swirlHolder = new THREE.Group();
  swirlHolder.position.set(0, 5.3, F - 0.07);
  swirlHolder.rotation.y = Math.PI;
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(0.64, 32),
    new THREE.MeshStandardMaterial({ map: swirlTexture('#ff7aa6', '#ffffff'), roughness: 0.4 }),
  );
  swirl.castShadow = false;
  const swirlRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.1, 10, 28), toyMat('#ffffff'));
  swirlRing.position.z = -0.02;
  swirlHolder.add(swirl, swirlRing);
  group.add(swirlHolder);

  // giant beaker sign on the roof
  const beaker = new THREE.Group();
  beaker.position.set(0, 8.3, -2.7);
  put(beaker, new THREE.CylinderGeometry(1.5, 1.7, 0.55, 28), white, 0, -0.05, 0);
  const flask: [number, number][] = [[0, 0], [1.25, 0], [1.4, 0.14], [1.36, 0.3], [0.44, 2.1], [0.42, 2.85], [0.58, 3.02], [0.58, 3.2]];
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#e8f8ff', roughness: 0.04, transparent: true, opacity: 0.32, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
  });
  const liquidMat = new THREE.MeshStandardMaterial({ color: '#ff8fd0', emissive: '#ff5fb8', emissiveIntensity: 0.55, roughness: 0.25, side: THREE.DoubleSide });
  const liquidProfile: [number, number][] = [[0, 0.04], [1.2, 0.04], [1.32, 0.16], [1.28, 0.3], [0.9, 1.2], [0, 1.2]];
  const flaskBase = new THREE.Group();
  flaskBase.position.y = 0.26;
  beaker.add(flaskBase);
  const liquid = put(flaskBase, lathe(liquidProfile, 28), liquidMat, 0, 0, 0, 0, 0, 0, false, false);
  liquid.renderOrder = 1;
  const glassMesh = put(flaskBase, lathe(flask, 28), glass, 0, 0, 0, 0, 0, 0, false, false);
  glassMesh.renderOrder = 2;
  // cork-ish rim
  put(flaskBase, new THREE.TorusGeometry(0.58, 0.07, 8, 20).rotateX(Math.PI / 2), white, 0, 3.2, 0, 0, 0, 0, false, false);
  group.add(beaker);

  // Bubbles and chimney puffs are one InstancedMesh each (they shrink away instead of fading).
  const bubbles: Bubble[] = [];
  const bubbleCols = ['#ffffff', '#ffd6ec', '#d6f2ff', '#e6dcff'];
  const NB = 9;
  const bubbleMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.62, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.25 }),
    NB,
  );
  bubbleMesh.frustumCulled = false;
  bubbleMesh.renderOrder = 3;
  for (let i = 0; i < NB; i++) {
    bubbleMesh.setColorAt(i, new THREE.Color(bubbleCols[i % 4]));
    bubbles.push({ speed: 0.22 + (i % 5) * 0.045, off: i / NB, ox: ((i * 37) % 11) / 11 - 0.5, oz: ((i * 53) % 7) / 7 - 0.5, size: 0.11 + (i % 4) * 0.045 });
  }
  beaker.add(bubbleMesh);

  const NP = 5;
  const puffMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }),
    NP,
  );
  puffMesh.frustumCulled = false;
  for (let i = 0; i < NP; i++) puffMesh.setColorAt(i, new THREE.Color(['#ffffff', '#ffd6ec', '#d6f2ff'][i % 3]));
  group.add(puffMesh);
  const dummy = new THREE.Object3D();

  return {
    group,
    colliders: [
      { kind: 'box', x: W.center.x, z: W.center.z, hw: W.size.w / 2 + 0.3, hd: W.size.d / 2 + 0.3 },
      { kind: 'circle', x: W.center.x + W.size.w / 2 + 1.6, z: W.center.z + tankZ[0], r: 1.3 },
      { kind: 'circle', x: W.center.x + W.size.w / 2 + 1.6, z: W.center.z + tankZ[1], r: 1.3 },
    ],
    update(_dt: number, t: number) {
      swirl.rotation.z = t * 0.7;
      liquid.scale.y = 1 + Math.sin(t * 2.1) * 0.03;
      beaker.rotation.y = Math.sin(t * 0.4) * 0.08;
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const k = (t * b.speed + b.off) % 1;
        // 0..0.45 rises inside the flask liquid, then escapes out of the neck and drifts up.
        const y = k < 0.45 ? 0.35 + (k / 0.45) * 1.0 : 1.4 + ((k - 0.45) / 0.55) * 3.4;
        const spread = k < 0.45 ? 0.5 : 0.12 + (k - 0.45) * 0.5;
        dummy.position.set(b.ox * spread * 1.6 + Math.sin(t * 2 + b.off * 9) * 0.07, 0.26 + y, b.oz * spread * 1.6);
        const outside = k >= 0.45;
        const s = b.size * (outside ? 1 + (k - 0.45) * 2.2 : 1) * Math.min(1, k * 8) * (k > 0.8 ? (1 - k) / 0.2 : 1);
        dummy.scale.setScalar(Math.max(0.0001, s));
        dummy.updateMatrix();
        bubbleMesh.setMatrixAt(i, dummy.matrix);
      }
      bubbleMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NP; i++) {
        const off = i / NP;
        const k = (t * 0.22 + off) % 1;
        dummy.position.set(-3.9 + k * 1.6 + Math.sin(t + off * 6) * 0.15, 10.1 + k * 3.2, 2.2 - k * 0.8);
        dummy.scale.setScalar(Math.max(0.0001, (0.3 + k * 0.9) * (k > 0.7 ? (1 - k) / 0.3 : 1)));
        dummy.updateMatrix();
        puffMesh.setMatrixAt(i, dummy.matrix);
      }
      puffMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
