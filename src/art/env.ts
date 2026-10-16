// Lighting rig + environment used by every scene, for a consistent soft look.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { scenes } from '../core/scene';
import { tuning } from '../tuning';

let envTex: THREE.Texture | null = null;

/** Shared PMREM'd studio environment for glossy reflections (generated in code). */
export function studioEnv(): THREE.Texture {
  if (!envTex) {
    const pmrem = new THREE.PMREMGenerator(scenes.renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envTex;
}

/** Vertical gradient sky texture (cheap background). */
export function gradientTexture(top: string, bottom: string, mid?: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  if (mid) g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface LightRig {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

/**
 * Standard soft lighting. `shadowSize` is the half-extent of the shadow
 * camera box in world units (small for close-ups, large for the town).
 */
export function addLights(scene: THREE.Scene, opts: { shadowSize?: number; shadows?: boolean; sunPos?: THREE.Vector3; intensity?: number; fill?: number; key?: number } = {}): LightRig {
  scene.environment = studioEnv();
  scene.environmentIntensity = tuning.art.envIntensity;
  const hemi = new THREE.HemisphereLight('#fff6fb', '#d9c7ff', 1.1 * (opts.intensity ?? 1) * (opts.fill ?? 1));
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e2', 2.2 * (opts.intensity ?? 1) * (opts.key ?? 1));
  sun.position.copy(opts.sunPos ?? new THREE.Vector3(4, 9, 6));
  if (opts.shadows !== false) {
    sun.castShadow = true;
    const s = opts.shadowSize ?? 4;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    sun.shadow.mapSize.set(tuning.art.shadowMapSize, tuning.art.shadowMapSize);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
  }
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

export function skyBackground(scene: THREE.Scene, top = tuning.art.skyTop, bottom = tuning.art.skyBottom): void {
  scene.background = gradientTexture(top, bottom);
}
