// Shared "soft glossy toy" look. Use these instead of ad-hoc materials so the
// whole game reads as one style: pastel colors, clearcoat gloss, soft light.
import * as THREE from 'three';
import { tuning } from '../tuning';

const cache = new Map<string, THREE.Material>();

export type Finish = 'gloss' | 'satin' | 'matte' | 'fabric' | 'metal' | 'glass' | 'emissive';

/** Glossy toy plastic (default), or another finish. Cached per color+finish — do NOT mutate the result; use toyMatUnique for per-object changes. */
export function toyMat(color: THREE.ColorRepresentation, finish: Finish = 'gloss'): THREE.Material {
  const key = `${new THREE.Color(color).getHexString()}|${finish}`;
  let m = cache.get(key);
  if (!m) {
    m = makeMat(color, finish);
    cache.set(key, m);
  }
  return m;
}

/** A fresh (uncached) material you are free to mutate (recolor, fade...). */
export function toyMatUnique(color: THREE.ColorRepresentation, finish: Finish = 'gloss'): THREE.MeshPhysicalMaterial {
  return makeMat(color, finish) as THREE.MeshPhysicalMaterial;
}

function makeMat(color: THREE.ColorRepresentation, finish: Finish): THREE.Material {
  const a = tuning.art;
  const c = new THREE.Color(color);
  switch (finish) {
    case 'gloss':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: a.roughness, clearcoat: a.clearcoat, clearcoatRoughness: a.clearcoatRoughness });
    case 'satin':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.5 });
    case 'matte':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    case 'fabric':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.78, sheen: 1, sheenRoughness: 0.6, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.5) });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.85 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.45, clearcoat: 1 });
    case 'emissive':
      return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.4 });
  }
}

/** Rounded box geometry (soft toy edges everywhere). Cached by params. */
const geoCache = new Map<string, THREE.BufferGeometry>();
export function roundedBox(w: number, h: number, d: number, r = 0.08, seg = 3): THREE.BufferGeometry {
  const key = `${w}|${h}|${d}|${r}|${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = makeRoundedBox(w, h, d, Math.min(r, w / 2, h / 2, d / 2), seg);
    geoCache.set(key, g);
  }
  return g;
}

function makeRoundedBox(w: number, h: number, d: number, r: number, seg: number): THREE.BufferGeometry {
  // Start from a subdivided box, then push vertices onto a rounded-box surface.
  const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const n = v.clone().sub(inner);
    if (n.lengthSq() > 1e-12) {
      n.normalize().multiplyScalar(r);
      v.copy(inner).add(n);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Mesh helper that also sets shadow flags. */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Soft fake contact shadow (radial gradient decal) — cheap alternative to real shadows. */
let blobTex: THREE.Texture | null = null;
export function blobShadow(radius: number, opacity = 0.35): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const grd = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(60,40,80,1)');
    grd.addColorStop(1, 'rgba(60,40,80,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}
