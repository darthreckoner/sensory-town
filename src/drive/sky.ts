// Golden-hour sky: a gradient dome with a low sun (and its glow), warm
// clouds drifting around the viewer, and a haze of far mountains.
// Everything follows the viewer so the sky never has parallax.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from '../world/townLayout';
import { tuning } from '../tuning';
import { sunDirection } from '../art/env';
import { PAL } from './palette';

/** Direction TO the sun (the same low golden-hour sun art/env.ts lights every outdoor scene with). */
export const SUN_DIR = sunDirection();

const DOME_R = 520;

function skyTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, PAL.skyTop);
  g.addColorStop(0.3, '#6d8fdc');
  g.addColorStop(0.44, '#f0b9a6');
  g.addColorStop(0.5, PAL.skyHorizon);
  g.addColorStop(0.53, PAL.fogColor);
  g.addColorStop(1, PAL.fogColor);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // sun glow where the sun is (equirect position of SUN_DIR on a three.js sphere)
  const theta = Math.acos(SUN_DIR.y);
  const phi = Math.atan2(SUN_DIR.z, -SUN_DIR.x);
  const sx = ((phi / (Math.PI * 2) + 1) % 1) * W, sy = (theta / Math.PI) * H;
  for (const [r, a, col] of [[220, 0.42, '255,196,140'], [110, 0.5, '255,222,170'], [46, 0.9, '255,244,220']] as const) {
    const rg = x.createRadialGradient(sx, sy, 0, sx, sy, r);
    rg.addColorStop(0, `rgba(${col},${a})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = rg;
    x.fillRect(sx - r, sy - r, r * 2, r * 2);
    // wrap around the seam
    if (sx - r < 0) x.fillRect(sx - r + W, sy - r, r * 2, r * 2);
    if (sx + r > W) x.fillRect(sx - r - W, sy - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sunSprite(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const rg = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,240,1)');
  rg.addColorStop(0.18, 'rgba(255,246,210,1)');
  rg.addColorStop(0.3, 'rgba(255,214,150,0.55)');
  rg.addColorStop(1, 'rgba(255,190,120,0)');
  x.fillStyle = rg;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  s.scale.set(150, 150, 1);
  s.renderOrder = -5;
  return s;
}

function cloudMesh(): THREE.Mesh {
  const rng = seeded(909);
  const geos: THREE.BufferGeometry[] = [];
  const top = new THREE.Color('#fff4e6'), bottom = new THREE.Color('#ffa77a'), c = new THREE.Color();
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + rng() * 0.4;
    const dist = 240 + rng() * 170;
    const alt = 70 + rng() * 80;
    const parts = 4 + ((rng() * 3) | 0);
    for (let k = 0; k < parts; k++) {
      const r = 9 + rng() * 14;
      const g = new THREE.SphereGeometry(r, 9, 6);
      g.scale(2.1, 0.5, 1);
      g.translate((k - parts / 2) * 18 + rng() * 6, (rng() - 0.4) * 4, (rng() - 0.5) * 12);
      g.rotateY(ang + Math.PI / 2);
      g.translate(Math.cos(ang) * dist, alt, Math.sin(ang) * dist);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const t = THREE.MathUtils.clamp((pos.getY(v) - alt + 6) / 12, 0, 1);
        c.copy(bottom).lerp(top, t);
        col.set([c.r, c.g, c.b], v * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      geos.push(g);
    }
  }
  const m = new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, fog: false, depthWrite: false }),
  );
  m.renderOrder = -4;
  m.frustumCulled = false;
  return m;
}

/** A ring of hazy mountains on the horizon (never fogged away: they ARE the haze). */
function mountainRing(): THREE.Mesh {
  const rng = seeded(404);
  const geos: THREE.BufferGeometry[] = [];
  const base = new THREE.Color('#e7b590'), top = new THREE.Color('#7f86b4'), c = new THREE.Color();
  for (let i = 0; i < 40; i++) {
    const ang = (i / 40) * Math.PI * 2 + rng() * 0.12;
    const r = 120 + rng() * 150, h = 45 + rng() * 85;
    const g = new THREE.ConeGeometry(r * 0.5, h, 7, 1);
    g.translate(0, h / 2 - 6, 0);
    g.rotateY(rng() * 3);
    g.translate(Math.cos(ang) * (400 + rng() * 40), 0, Math.sin(ang) * (400 + rng() * 40));
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      c.copy(base).lerp(top, THREE.MathUtils.clamp((pos.getY(v) + 6) / h, 0, 1));
      col.set([c.r, c.g, c.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.renderOrder = -6;
  m.frustumCulled = false;
  return m;
}

export interface Sky {
  group: THREE.Group;
  /** Keep the sky centred on the viewer. */
  follow(x: number, y: number, z: number): void;
  update(dt: number): void;
}

export function buildSky(): Sky {
  const group = new THREE.Group();
  group.name = 'sky';
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  const sun = sunSprite();
  sun.position.copy(SUN_DIR).multiplyScalar(DOME_R * 0.9);
  const clouds = cloudMesh();
  const mountains = mountainRing();
  group.add(dome, sun, mountains, clouds);
  return {
    group,
    follow(x, y, z) {
      group.position.set(x, 0, z);
      void y;
    },
    update(dt) {
      clouds.rotation.y += tuning.drive.cloudSpeed * dt;
    },
  };
}
