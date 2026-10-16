import * as THREE from 'three';

export interface LightRig { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight }

export function goldenHour(scene: THREE.Scene, _opts: any = {}): LightRig {
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  scene.add(hemi, sun, sun.target);
  return { hemi, sun };
}
export function addLights(scene: THREE.Scene, opts: { sunPos?: THREE.Vector3 } = {}): LightRig {
  return goldenHour(scene);
}
export function sunDirection(): THREE.Vector3 { return new THREE.Vector3(0.5, 0.45, 0.7).normalize(); }
export function skyBackground(_s: THREE.Scene): void {}
export function gradientTexture(): THREE.Texture { return new THREE.Texture(); }
export function studioEnv(): THREE.Texture { return new THREE.Texture(); }
