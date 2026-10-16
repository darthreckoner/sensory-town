// ── v3 locker ── Little 3D pictures of Locker items (skins, back blings, gliders, rides), rendered
// with the shared WebGL renderer into one offscreen target and cached as transparent PNG data URLs.
// Requests are queued and rendered a few at a time from the scene's frame loop (`thumbs.pump()`),
// so opening a tab with 26 skins never hitches: cards show their emoji first, then swap in the picture.
import * as THREE from 'three';
import { scenes } from '../../core/scene';
import { studioEnv } from '../env';

export interface ThumbSubject {
  object: THREE.Object3D;
  /** camera direction (from the subject toward the camera) */
  view?: [number, number, number];
  /** override the auto fit (needed for skinned characters, whose bounds are the bind pose) */
  fit?: { center: [number, number, number]; radius: number };
  dispose?: () => void;
}
type Maker = () => ThumbSubject | null;

const W = 176;
const H = 220;
const FOV = 28;

/** linear (0..1) -> sRGB byte with a soft highlight shoulder, so bright parts don't clip. */
const LUT = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let x = (i / 255) * 0.97;
    if (x > 0.62) x = 0.62 + 0.38 * (1 - Math.exp(-(x - 0.62) / 0.38));
    const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    t[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
  return t;
})();

class Thumbs {
  private cache = new Map<string, string>();
  private queue: { key: string; make: Maker; cb: (url: string) => void; alive: () => boolean }[] = [];
  private pending = new Map<string, ((url: string) => void)[]>();
  private rt: THREE.WebGLRenderTarget | null = null;
  private scene: THREE.Scene | null = null;
  private cam = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 100);
  private canvas: HTMLCanvasElement | null = null;

  /** Cached picture, if already rendered. */
  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  /** Ask for a picture; `cb` fires immediately when cached, otherwise from a later frame. `alive()` false drops the request. */
  request(key: string, make: Maker, cb: (url: string) => void, alive: () => boolean = () => true): void {
    const hit = this.cache.get(key);
    if (hit) {
      cb(hit);
      return;
    }
    const waiting = this.pending.get(key);
    if (waiting) {
      waiting.push(cb);
      return;
    }
    this.pending.set(key, [cb]);
    this.queue.push({ key, make, cb: (u) => this.pending.get(key)?.forEach((f) => f(u)), alive });
  }

  /** Render queued pictures for up to `budgetMs` (always at least one). Call from the scene's update(). */
  pump(budgetMs = 7): void {
    if (!this.queue.length || !scenes.renderer) return;
    const t0 = performance.now();
    do {
      const job = this.queue.shift()!;
      if (!job.alive()) {
        this.pending.delete(job.key);
        continue;
      }
      const url = this.render(job.make);
      if (url) {
        this.cache.set(job.key, url);
        job.cb(url);
      }
      this.pending.delete(job.key);
    } while (this.queue.length && performance.now() - t0 < budgetMs);
  }

  /** Forget queued (not yet rendered) requests, e.g. when a tab is re-rendered. */
  dropQueued(): void {
    for (const j of this.queue) this.pending.delete(j.key);
    this.queue.length = 0;
  }

  private setup(): THREE.Scene {
    if (this.scene) return this.scene;
    const s = new THREE.Scene();
    s.environment = studioEnv();
    s.environmentIntensity = 0.9;
    s.add(new THREE.HemisphereLight('#ffffff', '#8a7cff', 0.9));
    const key = new THREE.DirectionalLight('#fff4e6', 2.4);
    key.position.set(2.5, 4, 5);
    const rim = new THREE.DirectionalLight('#8fdcff', 1.6);
    rim.position.set(-4, 2, -3);
    const fill = new THREE.DirectionalLight('#ffd9ec', 0.8);
    fill.position.set(-3, 1, 4);
    s.add(key, rim, fill);
    this.scene = s;
    this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    return s;
  }

  private render(make: Maker): string | null {
    const r = scenes.renderer;
    let subject: ThumbSubject | null = null;
    const prevRT = r.getRenderTarget();
    const prevColor = new THREE.Color();
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    try {
      subject = make();
      if (!subject) return null;
      const scene = this.setup();
      scene.add(subject.object);
      // frame it
      let center: THREE.Vector3;
      let radius: number;
      if (subject.fit) {
        center = new THREE.Vector3(...subject.fit.center);
        radius = subject.fit.radius;
      } else {
        const box = new THREE.Box3().setFromObject(subject.object);
        center = box.getCenter(new THREE.Vector3());
        radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      }
      const half = Math.min((FOV / 2) * (Math.PI / 180), Math.atan(Math.tan((FOV / 2) * (Math.PI / 180)) * (W / H)));
      const dist = (radius / Math.sin(half)) * 1.04;
      const dir = new THREE.Vector3(...(subject.view ?? [0.35, 0.22, 1])).normalize();
      this.cam.position.copy(center).addScaledVector(dir, dist);
      this.cam.lookAt(center);
      this.cam.updateProjectionMatrix();
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, this.cam);
      const buf = new Uint8Array(W * H * 4);
      r.readRenderTargetPixels(this.rt!, 0, 0, W, H, buf);
      r.setRenderTarget(prevRT);
      const ctx = this.canvas!.getContext('2d');
      if (!ctx) return null;
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        const src = (H - 1 - y) * W * 4;
        const dst = y * W * 4;
        for (let x = 0; x < W * 4; x += 4) {
          const a = buf[src + x + 3];
          if (a === 0) continue;
          const k = 255 / a; // un-premultiply (MSAA edges)
          img.data[dst + x] = LUT[Math.min(255, Math.round(buf[src + x] * k))];
          img.data[dst + x + 1] = LUT[Math.min(255, Math.round(buf[src + x + 1] * k))];
          img.data[dst + x + 2] = LUT[Math.min(255, Math.round(buf[src + x + 2] * k))];
          img.data[dst + x + 3] = a;
        }
      }
      ctx.putImageData(img, 0, 0);
      scene.remove(subject.object);
      return this.canvas!.toDataURL('image/png');
    } catch (err) {
      console.warn('[locker] thumbnail failed', err);
      return null;
    } finally {
      r.setRenderTarget(prevRT);
      r.setClearColor(prevColor, prevAlpha);
      if (subject) {
        this.scene?.remove(subject.object);
        subject.dispose?.();
      }
    }
  }
}

export const thumbs = new Thumbs();
