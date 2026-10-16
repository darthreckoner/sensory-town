// ── v3 locker ── Little 3D pictures of Locker items (skins, back blings, gliders, rides), rendered
// with the shared WebGL renderer into one offscreen target and cached as transparent PNG object URLs.
// v3 perf: never on a busy frame. Requests wait in a queue; `thumbs.pump()` (from the frame loop) only decides whether to start
// one, and starts it in an IDLE callback (requestIdleCallback, or a short timeout on iPad Safari), one at a time, at most one every
// `gapMs`. The GPU read-back is asynchronous (readRenderTargetPixelsAsync: no pipeline stall) and the PNG is encoded off the main
// thread (canvas.toBlob), so one picture costs a single short task (building the subject), never a frame-long stall.
// Cards show their emoji first, then swap in the picture; the reveal card only uses pictures that are already cached.
import * as THREE from 'three';
import { scenes } from '../../core/scene';
import { studioEnv } from '../env';

export interface ThumbSubject {
  object: THREE.Object3D;
  /** camera direction (from the subject toward the camera) */
  view?: [number, number, number];
  /** override the auto fit (needed for skinned characters, whose bounds are the bind pose) */
  fit?: { center: [number, number, number]; radius: number };
  /** tall and thin (a character): fit by height only */
  narrow?: boolean;
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

/** Run `fn` when the main thread is idle (Safari has no requestIdleCallback: a short timeout does the same job). */
function idle(fn: () => void, timeout = 600): void {
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, 48);
}

class Thumbs {
  /** minimum ms between two pictures (the Locker lowers it: its scene is calm) */
  gapMs = 70;
  private busy = false;
  private scheduled = false;
  private lastEnd = 0;
  private lastPump = 0;
  private down = 0;
  private lastTouch = 0;
  private watching = false;
  private cache = new Map<string, string>();
  private queue: { key: string; make: Maker; cb: (url: string) => void; alive: () => boolean; urgent: boolean }[] = [];
  private pending = new Map<string, ((url: string) => void)[]>();
  private rt: THREE.WebGLRenderTarget | null = null;
  private scene: THREE.Scene | null = null;
  private cam = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 100);
  private canvas: HTMLCanvasElement | null = null;

  /** Cached picture, if already rendered. */
  get(key: string): string | undefined {
    return this.cache.get(key);
  }
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Ask for a picture; `cb` fires immediately when cached, otherwise from a later frame. `alive()` false drops the request. */
  request(key: string, make: Maker, cb: (url: string) => void, alive: () => boolean = () => true, urgent = false): void {
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
    const job = { key, make, cb: (u: string) => this.pending.get(key)?.forEach((f) => f(u)), alive, urgent };
    if (urgent) this.queue.unshift(job);
    else this.queue.push(job);
  }

  /** Call every frame (cheap). Starts the next queued picture in an idle slot, never on a heavy frame, never two at once. */
  pump(_budgetMs?: number): void {
    if (this.busy || this.scheduled || !this.queue.length || !scenes.renderer) return;
    if (!this.watching) {
      // background pictures wait for the finger to be up (a held joystick = busy), then a short quiet moment
      this.watching = true;
      const mark = (d: number) => () => {
        this.down = Math.max(0, this.down + d);
        this.lastTouch = performance.now();
      };
      window.addEventListener('pointerdown', mark(1), true);
      window.addEventListener('pointerup', mark(-1), true);
      window.addEventListener('pointercancel', mark(-1), true);
    }
    const now = performance.now();
    const dt = now - this.lastPump;
    this.lastPump = now;
    const urgent = this.queue[0].urgent;
    if (!urgent && dt > 40) return; // a heavy frame: do not pile on
    if (!urgent && (this.down > 0 || now - this.lastTouch < 450)) return; // the player is steering / tapping
    if (now - this.lastEnd < this.gapMs) return;
    this.scheduled = true;
    idle(() => {
      this.scheduled = false;
      void this.runOne();
    }, urgent ? 150 : 700);
  }

  private async runOne(): Promise<void> {
    const job = this.queue.shift();
    if (!job) return;
    if (!job.alive()) {
      this.pending.delete(job.key);
      return;
    }
    this.busy = true;
    let url: string | null = null;
    try {
      url = await this.render(job.make);
    } catch (err) {
      console.warn('[locker] thumbnail failed', err);
    }
    this.busy = false;
    this.lastEnd = performance.now();
    if (url) {
      this.cache.set(job.key, url);
      job.cb(url);
    }
    this.pending.delete(job.key);
  }

  /** Forget queued (not yet rendered) requests, e.g. when a tab is re-rendered. */
  dropQueued(): void {
    for (const j of this.queue) if (!j.urgent) this.pending.delete(j.key);
    this.queue = this.queue.filter((j) => j.urgent);
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

  /** Draw the subject into the offscreen target (synchronous, GPU work only) — false if there is nothing to draw. */
  private draw(make: Maker): boolean {
    const r = scenes.renderer;
    let subject: ThumbSubject | null = null;
    const prevRT = r.getRenderTarget();
    const prevColor = new THREE.Color();
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    try {
      subject = make();
      if (!subject) return false;
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
      const vHalf = (FOV / 2) * (Math.PI / 180);
      const half = subject.narrow ? vHalf : Math.min(vHalf, Math.atan(Math.tan(vHalf) * (W / H)));
      const dist = (radius / Math.sin(half)) * 1.04;
      const dir = new THREE.Vector3(...(subject.view ?? [0.35, 0.22, 1])).normalize();
      this.cam.position.copy(center).addScaledVector(dir, dist);
      this.cam.lookAt(center);
      this.cam.updateProjectionMatrix();
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, this.cam);
      scene.remove(subject.object);
      return true;
    } catch (err) {
      console.warn('[locker] thumbnail failed', err);
      return false;
    } finally {
      r.setRenderTarget(prevRT);
      r.setClearColor(prevColor, prevAlpha);
      if (subject) {
        this.scene?.remove(subject.object);
        subject.dispose?.();
      }
    }
  }

  /** Draw, read the pixels back without stalling the pipeline, and encode the PNG off the main thread. */
  private async render(make: Maker): Promise<string | null> {
    if (!this.draw(make)) return null;
    const r = scenes.renderer as THREE.WebGLRenderer & { readRenderTargetPixelsAsync?: (rt: THREE.WebGLRenderTarget, x: number, y: number, w: number, h: number, buf: Uint8Array) => Promise<Uint8Array> };
    const buf = new Uint8Array(W * H * 4);
    if (typeof r.readRenderTargetPixelsAsync === 'function') await r.readRenderTargetPixelsAsync(this.rt!, 0, 0, W, H, buf);
    else r.readRenderTargetPixels(this.rt!, 0, 0, W, H, buf);
    const cv = this.canvas!;
    const ctx = cv.getContext('2d');
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
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png')); // the canvas is snapshotted now; encoding is async
    return blob ? URL.createObjectURL(blob) : null;
  }
}

export const thumbs = new Thumbs();
