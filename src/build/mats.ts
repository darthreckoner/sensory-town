// Materials ("fins") for baked building geometry. Colour is stored per vertex,
// so ONE shared material per fin serves every colour. Believable stylized PBR
// per docs/ART_DIRECTION.md: matte paint, wood roughness 0.6, fabric sheen,
// metal 0.8+, reflective glass; the glossy "toy" finish is only for small bits.
import * as THREE from 'three';
import { patternTexture, type PatternId } from './patterns';

export type Fin =
  | 'paint' | 'wood' | 'fabric' | 'metal' | 'mirror' | 'gloss' | 'glass' | 'water' | 'glow' | 'rgb'
  | 'brick' | 'panel' | 'stripe' | 'tile' | 'oak' | 'dark' | 'marble' | 'checker' | 'carpet' | 'concrete' | 'shingle'
  // v3 world builds: the same patterns at chunky world scale
  | 'wplank' | 'wbrick' | 'wsteel' | 'wshingle';

export const FINS: Fin[] = [
  'paint', 'wood', 'fabric', 'metal', 'mirror', 'gloss', 'glass', 'water', 'glow', 'rgb',
  'brick', 'panel', 'stripe', 'tile', 'oak', 'dark', 'marble', 'checker', 'carpet', 'concrete', 'shingle',
  'wplank', 'wbrick', 'wsteel', 'wshingle',
];

/** Fins that carry a pattern texture, and how many world units one texture tile covers. */
export const MAPPED: Partial<Record<Fin, { pattern: PatternId; scale: number }>> = {
  brick: { pattern: 'brick', scale: 1 },
  panel: { pattern: 'panel', scale: 1 },
  stripe: { pattern: 'stripe', scale: 1 },
  tile: { pattern: 'tile', scale: 1 },
  oak: { pattern: 'oak', scale: 1 },
  dark: { pattern: 'dark', scale: 1 },
  marble: { pattern: 'marble', scale: 2 },
  checker: { pattern: 'checker', scale: 1 },
  carpet: { pattern: 'carpet', scale: 0.5 },
  concrete: { pattern: 'concrete', scale: 1 },
  shingle: { pattern: 'shingle', scale: 1 },
  wplank: { pattern: 'plank', scale: 2.4 },       // 8 boards per 2.4 m: a board is 0.3 m tall
  wbrick: { pattern: 'brick', scale: 3.2 },       // courses 0.2 m, bricks 0.8 m: chunky and readable at distance
  wsteel: { pattern: 'steel', scale: 3.2 },       // riveted 1.6 m panels
  wshingle: { pattern: 'shingle', scale: 2.4 },
};

/** Finishes that never cast shadows. */
export const NO_SHADOW = new Set<Fin>(['glass', 'water', 'glow', 'rgb']);

let mats: Partial<Record<Fin, THREE.Material>> | null = null;
let rgbMat: THREE.MeshBasicMaterial | null = null;

function make(f: Fin): THREE.Material {
  const vc = { vertexColors: true } as const;
  switch (f) {
    case 'paint': return new THREE.MeshStandardMaterial({ ...vc, roughness: 0.62, metalness: 0 });
    case 'wood': return new THREE.MeshStandardMaterial({ ...vc, roughness: 0.6, metalness: 0 });
    case 'fabric': return new THREE.MeshPhysicalMaterial({ ...vc, roughness: 0.88, sheen: 0.9, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') });
    case 'metal': return new THREE.MeshStandardMaterial({ ...vc, roughness: 0.32, metalness: 0.85 });
    case 'mirror': return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 1, vertexColors: true, envMapIntensity: 1.4 });
    case 'gloss': return new THREE.MeshPhysicalMaterial({ ...vc, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        ...vc, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.34, clearcoat: 1, clearcoatRoughness: 0.03,
        envMapIntensity: 2.2, depthWrite: false,
      });
    case 'water':
      return new THREE.MeshPhysicalMaterial({
        ...vc, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.05,
        envMapIntensity: 1.6,
      });
    case 'glow': return new THREE.MeshBasicMaterial({ ...vc });
    case 'rgb': {
      rgbMat = new THREE.MeshBasicMaterial({ color: 0xff2e88 });
      return rgbMat;
    }
    default: {
      const m = MAPPED[f]!;
      if (f === 'wsteel') return new THREE.MeshStandardMaterial({ ...vc, map: patternTexture(m.pattern), roughness: 0.42, metalness: 0.4 });
      const rough = f === 'marble' ? 0.18 : f === 'tile' ? 0.3 : f === 'checker' ? 0.3 : f === 'carpet' ? 0.95 : f === 'brick' || f === 'wbrick' ? 0.9 : f === 'shingle' || f === 'wshingle' ? 0.82 : f === 'concrete' ? 0.9 : 0.58;
      const phys = f === 'marble' || f === 'tile' || f === 'checker';
      const opts = { ...vc, map: patternTexture(m.pattern), roughness: rough, metalness: 0 };
      if (phys) return new THREE.MeshPhysicalMaterial({ ...opts, clearcoat: f === 'marble' ? 0.6 : 0.3, clearcoatRoughness: 0.18 });
      if (f === 'carpet') return new THREE.MeshPhysicalMaterial({ ...opts, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') });
      return new THREE.MeshStandardMaterial(opts);
    }
  }
}

export function finMat(f: Fin): THREE.Material {
  if (!mats) mats = {};
  let m = mats[f];
  if (!m) {
    m = make(f);
    mats[f] = m;
  }
  return m;
}

/** Animate the rainbow "rgb" glow (gaming rigs, LED strips). Call once per frame from a scene. */
export function tickBuildMaterials(t: number): void {
  if (rgbMat) rgbMat.color.setHSL((t * 0.12) % 1, 1, 0.58);
}

const ghostMats = new Map<string, THREE.Material>();
function ghostMat(f: Fin, ok: boolean, okColor = '#ffffff'): THREE.Material {
  const key = `${f}|${ok}|${okColor}`;
  let m = ghostMats.get(key);
  if (!m) {
    m = finMat(f).clone();
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = f === 'glass' || f === 'water' ? 0.3 : 0.6;
    const std = m as THREE.MeshStandardMaterial;
    std.color.set(ok ? okColor : '#ff5c5c');
    if (!ok && std.emissive) {
      std.emissive.set('#ff1f1f');
      std.emissiveIntensity = 0.32;
    }
    ghostMats.set(key, m);
  }
  return m;
}

/** Turn a baked object into a see-through preview (normal colours when ok, red when not). */
export function ghostify(root: THREE.Object3D, ok: boolean, okColor = '#ffffff'): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.fin) {
      m.material = ghostMat(m.userData.fin as Fin, ok, okColor);
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
}
