// Glow Grove (v3): a mossy forest of teal and violet trees, giant glowing mushrooms
// you can drive and walk between, hundreds of little ones, fireflies drifting in the
// air, a pond with lily pads, a tree house and a wooden gate where the road ends.
import * as THREE from 'three';
import { GROVE, nearestRoad, seeded } from '../world/townLayout';
import { groundHeight, terrainHeight } from '../world/heightfield';
import type { Collider } from '../world/townEnv';
import type { Piece } from './types';
import { Mesher } from './mesher';
import { mat } from './kit';
import { poiSign } from './poiSign';
import { PAL } from './palette';
import { InstanceBatch, bakeStatic, mergeStaticGroups, put } from './envUtils';

export interface GroveOut extends Piece {
  trees: { x: number; z: number; kind: 'oak' | 'birch'; scale: number }[];
}

const circle = (x: number, z: number, r: number): Collider => ({ kind: 'circle', x, z, r });

/** The giant mushrooms: x, z, scale (1 = a 5 m cap on a 6 m stem). */
export const GIANT_MUSHROOMS: [number, number, number, string][] = [
  [-150, 128, 1.9, '#ff5e9c'], [-170, 108, 1.4, '#9b6bff'], [-132, 112, 1.5, '#3ec6e8'], [-176, 146, 1.2, '#ffb02e'],
  [-122, 138, 1.3, '#ff5470'], [-152, 160, 1.5, '#9b6bff'], [-110, 100, 1.1, '#3ec6e8'], [-186, 126, 1.7, '#ff5e9c'],
  [-140, 88, 1.0, '#ffb02e'], [-100, 126, 1.2, '#ff5e9c'], [-166, 176, 1.3, '#3ec6e8'], [-130, 172, 1.1, '#9b6bff'],
];

export function buildGrove(): GroveOut {
  const m = new Mesher();
  const ex = new THREE.Group();
  const inst = new THREE.Group();                    // instanced meshes (bakeStatic leaves those alone, so they live beside the baked result)
  const colliders: Collider[] = [];
  const trees: GroveOut['trees'] = [];
  const G = (x: number, z: number): number => groundHeight(x, z);
  const rng = seeded(7003);
  const wood = mat.std(PAL.wood, 0.8);

  // ── giant mushrooms: stems, glowing caps and white spots (instanced) ──
  const stemGeo = (() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(0.62 - 0.18 * Math.sin(t * Math.PI * 0.9) + 0.34 * Math.pow(t, 6) * 0 + 0.0, t * 6));
    }
    pts[0].x = 0.95;
    return new THREE.LatheGeometry(pts, 14);
  })();
  const capGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(5, 2.6, 5);
  const spotGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const glowMat = (): THREE.MeshStandardMaterial => {
    const mt = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 });
    mt.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.5;');
    };
    return mt;
  };
  const caps = new InstanceBatch(capGeo, glowMat(), true, true);
  const stems = new InstanceBatch(stemGeo, mat.std('#f6ecd6', 0.8), true, true);
  const spots = new InstanceBatch(spotGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.25 }), false, false);
  for (const [x, z, s, col] of GIANT_MUSHROOMS) {
    const g0 = G(x, z), yaw = rng() * 6.28;
    const stemH = 6 * s;
    stems.add(x, g0 - 0.3, z, yaw, s, s, s);
    caps.add(x, g0 + stemH - 0.6 * s, z, yaw, s, s, s, col);
    for (let k = 0; k < 9; k++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 0.8;
      const sx = Math.cos(a) * rr * 5 * s, sz = Math.sin(a) * rr * 5 * s;
      const hh = Math.sqrt(Math.max(0, 1 - rr * rr)) * 2.6 * s;
      spots.add(x + sx, g0 + stemH - 0.6 * s + hh - 0.08, z + sz, 0, s * 0.85, s * 0.35, s * 0.85);
    }
    colliders.push(circle(x, z, 0.95 * s));
  }
  // little ones: thousands of tiny glowing mushrooms around the floor
  {
    const smallCap = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.5, 0.3, 0.5);
    const smallStem = new THREE.CylinderGeometry(0.1, 0.14, 0.5, 5, 1, true).translate(0, 0.25, 0);
    const sCaps = new InstanceBatch(smallCap, glowMat(), false, false);
    const sStems = new InstanceBatch(smallStem, mat.std('#f6ecd6', 0.8), false, false);
    const cols = ['#ff5e9c', '#9b6bff', '#3ec6e8', '#ffb02e', '#ff5470', '#7bff9a'];
    let n = 0;
    for (let i = 0; i < 2600 && n < 300; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (GROVE.r + 10);
      const x = GROVE.x + Math.cos(a) * r, z = GROVE.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 0.3 || nearestRoad(x, z).edge < 2.2) continue;
      const s = 0.8 + rng() * 1.6;
      sStems.add(x, h - 0.05, z, rng() * 6, s);
      sCaps.add(x, h + 0.45 * s, z, rng() * 6, s, s, s, cols[(rng() * cols.length) | 0]);
      n++;
    }
    for (const b of [sStems, sCaps]) {
      const mesh = b.build();
      if (mesh) {
        mesh.name = 'vegetation'; // soft ground cover (walk-through), like bushes, for the world sweeps
        inst.add(mesh);
      }
    }
  }
  for (const b of [stems, caps, spots]) {
    const mesh = b.build();
    if (mesh) inst.add(mesh);
  }

  // ── the grove's big tree house tree ──
  {
    const x = -118, z = 118, g0 = G(x, z);
    const bark = mat.std('#6b4a63', 0.9);
    m.cyl(bark, x, g0 - 0.5, z, 3.0, 1.9, 11, 12);
    colliders.push(circle(x, z, 2.6));
    const crown = mat.std('#3fc4a0', 0.7);
    const glowLeaf = new THREE.MeshStandardMaterial({ color: '#4fe0b8', roughness: 0.6, emissive: '#2fd0a8', emissiveIntensity: 0.25 });
    for (const [dx, dy, dz, r] of [[0, 13, 0, 6.5], [4.5, 11.5, 2, 4.5], [-4.4, 11.8, -1.5, 4.8], [1, 16, -2, 4.2], [-2, 12, 5, 4.4], [3, 12.6, -4.5, 4.2]] as number[][])
      put(ex, new THREE.SphereGeometry(r, 12, 9), dy > 15 ? glowLeaf : crown, x + dx, g0 + dy, z + dz, 0, 0, 0, true, true);
    // the house, on a platform wrapped round the trunk
    m.cyl(wood, x, g0 + 6.4, z, 4.4, 4.4, 0.3, 10);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      m.box(wood, x + Math.cos(a) * 4.2, g0 + 7.1, z + Math.sin(a) * 4.2, 0.18, 1.2, 0.18);
    }
    m.box(mat.std('#c98c52', 0.8), x + 1.6, g0 + 8.3, z + 0.4, 2.8, 2.4, 2.8);
    m.cyl(mat.std('#d9433f', 0.7), x + 1.6, g0 + 9.4, z + 0.4, 2.5, 0.0, 1.9, 4);
    m.box(mat.neon('#ffe08a'), x + 1.6, g0 + 8.5, z + 1.82, 0.9, 0.9, 0.05);
    // a rope ladder + glowing lanterns
    for (let i = 0; i < 7; i++) m.box(wood, x - 3.4, g0 + 0.6 + i * 0.95, z + 2.2, 0.8, 0.07, 0.07);
    m.box(mat.std('#8c6a4a', 0.9), x - 3.7, g0 + 3.4, z + 2.2, 0.04, 6.8, 0.04);
    m.box(mat.std('#8c6a4a', 0.9), x - 3.1, g0 + 3.4, z + 2.2, 0.04, 6.8, 0.04);
    for (let i = 0; i < 5; i++) {
      const a = 0.4 + i * 0.5;
      m.box(mat.neon(['#7bffd8', '#ffb8f0', '#ffe08a'][i % 3]), x + Math.cos(a) * 4.4, g0 + 6.0, z + Math.sin(a) * 4.4, 0.4, 0.5, 0.4);
    }
  }

  // ── the pond: lily pads and glowing flowers on the water ──
  {
    const P = GROVE.pond;
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (P.r - 1.5);
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      m.cyl(mat.std('#3fae52', 0.8), x, -0.3, z, 0.7 + rng() * 0.4, 0.7, 0.05, 9);
      if (i % 3 === 0) m.cyl(mat.neon(['#ff8ad8', '#8affea', '#fff08a'][i % 9 === 0 ? 0 : i % 2 ? 1 : 2]), x, -0.28, z, 0.2, 0.05, 0.28, 6);
    }
    // stepping stones round the bank + reeds
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const x = P.x + Math.cos(a) * (P.r + 1.1), z = P.z + Math.sin(a) * (P.r + 1.1);
      m.cyl(mat.std('#8d93a0', 0.9), x, G(x, z) - 0.3, z, 0.55 + (i % 3) * 0.12, 0.45, 0.5, 7);
      if (i % 2) for (let k = 0; k < 3; k++) m.box(mat.std('#3a9a50', 0.8), x + Math.cos(a) * 0.9 + k * 0.1, G(x, z) + 0.7, z + Math.sin(a) * 0.9, 0.06, 1.5 + k * 0.2, 0.06);
    }
  }

  // ── the entrance gate where the road ends: mossy posts, a beam, a lit sign ──
  {
    const x = -148, z = 104, g0 = G(x, z);
    for (const sx of [-5.2, 5.2]) {
      m.cyl(mat.std('#6b4a63', 0.9), x + sx, g0 - 0.3, z, 0.55, 0.45, 6.6, 8);
      m.cyl(mat.neon(sx < 0 ? '#7bffd8' : '#ffb8f0'), x + sx, g0 + 6.3, z, 0.4, 0.1, 0.5, 8);
      colliders.push(circle(x + sx, z, 0.6));
    }
    m.box(mat.std('#6b4a63', 0.9), x, g0 + 6.0, z, 11.6, 0.7, 0.8);
    const p = poiSign('GLOW GROVE', '#7bffd8', 'MUSHROOMS · FIREFLIES', 2.4);
    const pw = (p.geometry as THREE.PlaneGeometry).parameters.width;
    p.position.set(x, g0 + 7.8, z);
    ex.add(p);
    m.box(mat.std('#3a2f4a', 0.8), x, g0 + 7.8, z, pw + 0.4, 2.8, 0.16);
  }

  // ── fireflies: drifting, twinkling points (animated entirely on the GPU) ──
  const N = 260;
  const base: number[] = [], phase: number[] = [], tint: number[] = [];
  const cA = new THREE.Color('#d8ff6a'), cB = new THREE.Color('#7bffe0'), cC = new THREE.Color('#ffb8f0');
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (GROVE.r + 6);
    const x = GROVE.x + Math.cos(a) * r, z = GROVE.z + Math.sin(a) * r;
    base.push(x, Math.max(0.2, terrainHeight(x, z)) + 0.8 + rng() * 4.5, z);
    phase.push(rng() * 100);
    const c = rng() < 0.55 ? cA : rng() < 0.7 ? cB : cC;
    tint.push(c.r, c.g, c.b);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
  fg.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  fg.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
  fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(GROVE.x, 3, GROVE.z), GROVE.r + 20);
  const fireMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 520 } },
    vertexShader: `
      uniform float uTime; uniform float uScale; attribute float aPhase; attribute vec3 aTint; varying vec3 vC; varying float vA;
      void main() {
        float t = uTime * 0.5 + aPhase;
        vec3 p = position + vec3(sin(t * 1.3) * 2.2 + sin(t * 0.7) * 1.4, sin(t * 1.1) * 0.9, cos(t * 0.9) * 2.2 + sin(t * 1.7) * 1.1);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uScale * (0.25 + 0.2 * sin(uTime * 2.0 + aPhase * 3.0)) / -mv.z, 2.0, 22.0);
        vC = aTint; vA = 0.55 + 0.45 * sin(uTime * 3.0 + aPhase * 7.0);
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vC * (0.6 + 1.4 * a * a), a * a * vA); }`,
  });
  const fire = new THREE.Points(fg, fireMat);
  fire.frustumCulled = false;
  fire.renderOrder = 5;

  const group = new THREE.Group();
  group.name = 'grove';
  group.add(mergeStaticGroups('grove-static', m.build('grove-static'), bakeStatic(ex)));
  group.add(inst);
  group.add(fire);
  void trees;
  return {
    group,
    colliders,
    trees,
    cull: { x: GROVE.x, z: GROVE.z, r: 190 },
    update(_dt: number, t: number) {
      fireMat.uniforms.uTime.value = t;
    },
  };
}
