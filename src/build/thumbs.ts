// Little 3D preview pictures of the starter templates, rendered once with the
// shared WebGL renderer into an offscreen target and cached as data URLs.
import * as THREE from 'three';
import { scenes } from '../core/scene';
import { goldenHour } from '../art/env';
import { buildHouseMesh } from '../world/houseMesh';
import { disposeBaked } from './bake';
import type { Template } from './templates';

const cache = new Map<string, string>();

/** linear (0..1) -> sRGB byte with a soft highlight shoulder, so bright roofs don't clip. */
const LUT = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let x = (i / 255) * 0.95;
    if (x > 0.6) x = 0.6 + 0.4 * (1 - Math.exp(-(x - 0.6) / 0.4));
    const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    t[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
  return t;
})();

export function templateThumb(t: Template, w = 440, h = 300): string | null {
  const hit = cache.get(t.id);
  if (hit) return hit;
  const r = scenes.renderer;
  if (!r) return null;
  const prev = r.getRenderTarget();
  let rt: THREE.WebGLRenderTarget | null = null;
  const scene = new THREE.Scene();
  let house: THREE.Group | null = null;
  try {
    goldenHour(scene, { shadows: false, fog: false });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(15, 0.2, 15), new THREE.MeshStandardMaterial({ color: '#5d9e48', roughness: 0.95 }));
    ground.position.set(0, -0.11, 0);
    scene.add(ground);
    house = buildHouseMesh({ plot: 0, ownerId: '', pieces: t.build() });
    house.position.set(-6, 0, -6);
    scene.add(house);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 300);
    cam.position.set(15.5, 17, 19);
    cam.lookAt(0.3, 1.5, 0.6);
    rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    r.setRenderTarget(rt);
    r.render(scene, cam);
    const buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    r.setRenderTarget(prev);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4, dst = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        img.data[dst + x] = LUT[buf[src + x]];
        img.data[dst + x + 1] = LUT[buf[src + x + 1]];
        img.data[dst + x + 2] = LUT[buf[src + x + 2]];
        img.data[dst + x + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL('image/jpeg', 0.9);
    cache.set(t.id, url);
    return url;
  } catch (err) {
    console.warn('[build] template thumbnail failed', err);
    return null;
  } finally {
    r.setRenderTarget(prev);
    rt?.dispose();
    if (house) disposeBaked(house);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.fin) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
