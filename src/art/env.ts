// Lighting rigs + environments, shared so every scene reads as one style.
//   goldenHour()   — town / build: low warm sun, cool sky fill, gradient sky, warm fog,
//                    and a sky environment so car paint and glass catch the sunset.
//   studioLights() — workshop / style: dark creator studio with a softbox key, pink +
//                    cyan LED rims and a RING LIGHT that shows up in glossy reflections.
//   addLights()    — the old neutral rig (kept for anything that still uses it).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { scenes } from '../core/scene';
import { tuning } from '../tuning';

let envTex: THREE.Texture | null = null;
let skyEnvTex: THREE.Texture | null = null;
let studioEnvTex: THREE.Texture | null = null;

/** Neutral PMREM'd room environment (generated in code). */
export function studioEnv(): THREE.Texture {
  if (!envTex) {
    const pmrem = new THREE.PMREMGenerator(scenes.renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envTex;
}

/** HDR emissive material for building environment scenes (values > 1 are fine). */
function glow(color: THREE.ColorRepresentation, intensity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  m.color.multiplyScalar(intensity);
  return m;
}

/** Sunset sky environment for outdoor reflections. */
export function skyEnv(): THREE.Texture {
  if (!skyEnvTex) {
    const a = tuning.art;
    const env = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color(a.skyTop) }, mid: { value: new THREE.Color(a.skyMid) }, bot: { value: new THREE.Color(a.skyBottom) }, ground: { value: new THREE.Color('#5a4c42') } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 ground; varying vec3 vP;
          void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mix(bot, mid, smoothstep(0.0, 0.25, y)), top, smoothstep(0.25, 0.9, y)) : mix(bot, ground, smoothstep(0.0, -0.25, y));
          gl_FragColor = vec4(c * 1.1, 1.0); }`,
      }),
    );
    env.add(dome);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), glow(a.sunColor, 24));
    sun.position.copy(sunDirection().multiplyScalar(44));
    env.add(sun);
    const pmrem = new THREE.PMREMGenerator(scenes.renderer);
    skyEnvTex = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
  }
  return skyEnvTex;
}

/** Dark studio environment: softbox overhead, ring light in front, colored LED strips. */
export function ringLightEnv(): THREE.Texture {
  if (!studioEnvTex) {
    const a = tuning.art;
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 30), new THREE.MeshBasicMaterial({ color: '#100e18', side: THREE.BackSide }));
    room.position.y = 4;
    env.add(room);
    // ring light — in front of the subject, slightly above (shows as a ring highlight on gloss)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.42, 16, 64), glow('#fff6ee', a.ringLight));
    ring.position.set(0, 3.5, 11);
    ring.lookAt(0, 1, 0);
    env.add(ring);
    // softbox overhead
    const box = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), glow('#ffffff', 3.2));
    box.position.set(0, 11.5, 2);
    box.rotation.x = Math.PI / 2;
    env.add(box);
    // LED strips (pink left, cyan right) + a violet back strip
    const stripA = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 0.4), glow(a.studioRimA, 6));
    stripA.position.set(-12, 4, -6);
    const stripB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 0.4), glow(a.studioRimB, 6));
    stripB.position.set(12, 4, -6);
    const back = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 0.35), glow('#7c4dff', 4));
    back.position.set(0, 1.5, -14);
    env.add(stripA, stripB, back);
    const pmrem = new THREE.PMREMGenerator(scenes.renderer);
    studioEnvTex = pmrem.fromScene(env, 0.015).texture;
    pmrem.dispose();
  }
  return studioEnvTex;
}

/** Unit vector toward the sun (from tuning elevation/azimuth). */
export function sunDirection(): THREE.Vector3 {
  const a = tuning.art;
  const el = THREE.MathUtils.degToRad(a.sunElevation);
  const az = THREE.MathUtils.degToRad(a.sunAzimuth);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
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

function shadowed(sun: THREE.DirectionalLight, size: number): void {
  sun.castShadow = true;
  sun.shadow.camera.left = -size;
  sun.shadow.camera.right = size;
  sun.shadow.camera.top = size;
  sun.shadow.camera.bottom = -size;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 400;
  sun.shadow.mapSize.set(tuning.art.shadowMapSize, tuning.art.shadowMapSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
}

/**
 * Golden hour for outdoor scenes. The sun is a DirectionalLight placed along
 * sunDirection() at `distance` from its target — move `rig.sun.target` (and the
 * sun with it) to keep shadows near the camera/car.
 */
export function goldenHour(scene: THREE.Scene, opts: { shadowSize?: number; shadows?: boolean; distance?: number; fog?: boolean } = {}): LightRig {
  const a = tuning.art;
  scene.background = gradientTexture(a.skyTop, a.skyBottom, a.skyMid);
  scene.environment = skyEnv();
  scene.environmentIntensity = 0.75;
  if (opts.fog !== false) scene.fog = new THREE.Fog(a.fogColor, a.fogNear, a.fogFar);
  const hemi = new THREE.HemisphereLight(a.hemiSky, a.hemiGround, a.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(a.sunColor, a.sunIntensity);
  sun.position.copy(sunDirection().multiplyScalar(opts.distance ?? 120));
  if (opts.shadows !== false) shadowed(sun, opts.shadowSize ?? 30);
  scene.add(sun, sun.target);
  return { hemi, sun };
}

/**
 * Dark creator studio for close-ups. Returns the key light as `sun` so callers can
 * still tweak it. Glossy objects reflect the ring light from ringLightEnv().
 */
export function studioLights(scene: THREE.Scene, opts: { shadowSize?: number; shadows?: boolean; target?: THREE.Vector3 } = {}): LightRig {
  const a = tuning.art;
  scene.background = new THREE.Color(a.studioBg);
  scene.environment = ringLightEnv();
  scene.environmentIntensity = a.studioEnvIntensity;
  scene.fog = null;
  const hemi = new THREE.HemisphereLight('#c9c2ff', '#1a1626', 0.35);
  scene.add(hemi);
  // softbox key: above + slightly in front
  const sun = new THREE.DirectionalLight('#fff4ea', a.studioKey);
  sun.position.set(1.5, 9, 6);
  if (opts.shadows !== false) shadowed(sun, opts.shadowSize ?? 4);
  scene.add(sun, sun.target);
  if (opts.target) sun.target.position.copy(opts.target);
  // colored LED rim lights from behind-left (pink) and behind-right (cyan)
  const rimA = new THREE.DirectionalLight(a.studioRimA, a.studioRim);
  rimA.position.set(-6, 3, -5);
  const rimB = new THREE.DirectionalLight(a.studioRimB, a.studioRim);
  rimB.position.set(6, 3, -5);
  scene.add(rimA, rimB);
  return { hemi, sun };
}

/** The original neutral rig (v1). */
export function addLights(scene: THREE.Scene, opts: { shadowSize?: number; shadows?: boolean; sunPos?: THREE.Vector3; intensity?: number; fill?: number; key?: number } = {}): LightRig {
  scene.environment = studioEnv();
  scene.environmentIntensity = tuning.art.envIntensity;
  const hemi = new THREE.HemisphereLight('#fff6fb', '#d9c7ff', 1.1 * (opts.intensity ?? 1) * (opts.fill ?? 1));
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e2', 2.2 * (opts.intensity ?? 1) * (opts.key ?? 1));
  sun.position.copy(opts.sunPos ?? new THREE.Vector3(4, 9, 6));
  if (opts.shadows !== false) shadowed(sun, opts.shadowSize ?? 4);
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

export function skyBackground(scene: THREE.Scene, top = tuning.art.skyTop, bottom = tuning.art.skyBottom): void {
  scene.background = gradientTexture(top, bottom, tuning.art.skyMid);
}
