// The cozy edge of the world: a ring of soft rounded hills and puffy clouds
// that drift slowly around the town.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from '../world/townLayout';
import { tuning } from '../tuning';

function hillGeometry(rng: () => number, ring: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const palettes = ring === 0
    ? ['#a7e3a0', '#9bdca4', '#b4eaa8', '#8fd6b0', '#c3ee9f']
    : ['#a9d9c4', '#b7cdf0', '#c5b8f5', '#a5dcc8', '#bfe0e8'];
  const count = ring === 0 ? 20 : 15;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * (ring === 0 ? 0.22 : 0.3);
    const dist = ring === 0 ? 96 + rng() * 26 : 150 + rng() * 40;
    const rad = ring === 0 ? 18 + rng() * 14 : 30 + rng() * 22;
    const hgt = ring === 0 ? 7 + rng() * 8 : 16 + rng() * 16;
    const g = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.25);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const base = new THREE.Color(palettes[(rng() * palettes.length) | 0]);
    const top = base.clone().lerp(new THREE.Color('#ffffff'), 0.28);
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      c.copy(base).lerp(top, Math.max(0, y));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.scale(rad, hgt, rad * (0.8 + rng() * 0.4));
    g.rotateY(rng() * Math.PI * 2);
    g.translate(Math.cos(a) * dist, -hgt * 0.12, Math.sin(a) * dist);
    // Merge needs identical attributes: drop uvs, keep position/normal/color.
    g.deleteAttribute('uv');
    out.push(g);
  }
  return out;
}

function buildHills(): THREE.Mesh {
  const rng = seeded(404);
  const geos = [...hillGeometry(rng, 1), ...hillGeometry(rng, 0)];
  const m = new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }),
  );
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

interface CloudPivot {
  pivot: THREE.Group;
  speed: number;
}

function buildClouds(): { group: THREE.Group; pivots: CloudPivot[] } {
  const rng = seeded(909);
  const group = new THREE.Group();
  const pivots: CloudPivot[] = [];
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7fb', emissiveIntensity: 0.55, roughness: 1, fog: true });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const puffs: THREE.BufferGeometry[] = [];
    const parts = 4 + ((rng() * 3) | 0);
    for (let k = 0; k < parts; k++) {
      const r = 3.2 + rng() * 3.2;
      const g = new THREE.SphereGeometry(r, 14, 10);
      g.scale(1.25, 0.78, 1);
      g.translate((k - parts / 2) * 4.4 + rng() * 1.5, (rng() - 0.3) * 2, (rng() - 0.5) * 3.2);
      g.deleteAttribute('uv');
      puffs.push(g);
    }
    const cloud = new THREE.Mesh(mergeGeometries(puffs, false), mat);
    const radius = 85 + rng() * 70;
    const ang = (i / n) * Math.PI * 2 + rng() * 0.5;
    cloud.position.set(Math.cos(ang) * radius, 20 + rng() * 22, Math.sin(ang) * radius);
    cloud.rotation.y = -ang + Math.PI / 2 + (rng() - 0.5) * 0.6;
    const s = 0.9 + rng() * 0.8;
    cloud.scale.setScalar(s);
    const pivot = new THREE.Group();
    pivot.add(cloud);
    group.add(pivot);
    pivots.push({ pivot, speed: 0.7 + rng() * 0.8 });
  }
  return { group, pivots };
}

export function buildSky(): { group: THREE.Group; update(dt: number): void } {
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(buildHills());
  const clouds = buildClouds();
  group.add(clouds.group);
  return {
    group,
    update(dt: number) {
      const sp = tuning.drive.cloudSpeed;
      for (const c of clouds.pivots) c.pivot.rotation.y += sp * c.speed * dt;
    },
  };
}
