// Scene manager + base class. One shared WebGLRenderer; each activity is a
// GameScene with its own THREE.Scene, camera and DOM overlay.
import * as THREE from 'three';
import { tuning } from '../tuning';
import { bus } from './events';
import { tweens } from './tween';
import { perf, quality } from './perf';   // ── v3 perf ──

export type SceneName = 'picker' | 'dressup' | 'town' | 'build' | 'workshop';

export abstract class GameScene {
  abstract readonly name: SceneName;
  readonly scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  /** DOM overlay for this scene's controls. Shown only while active. */
  readonly ui: HTMLDivElement;
  /** Device pixel ratio cap for this scene (defaults to tuning.app.maxPixelRatio). */
  pixelRatioCap?: number;
  /** Show the global menu button (top-left) while this scene is active. */
  showMenuButton = true;
  /** Particle size multiplier for juice effects in this scene (town is big, workshop is close-up). */
  fxScale = 1;
  private disposers: (() => void)[] = [];

  constructor() {
    this.ui = document.createElement('div');
    this.ui.className = 'scene-ui';
  }

  /** Called once, lazily, the first time the scene is entered. */
  init(): void {}
  enter(_params?: any): void {}
  exit(): void {}
  update(_dt: number, _t: number): void {}
  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  /** F1 — reset the current station/activity. */
  resetStation(): void {}
  /** Extra lines for the debug overlay. */
  debugInfo(): Record<string, string | number> {
    return {};
  }

  /** addEventListener that is automatically removed when the scene exits. */
  protected listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window | Document,
    type: K,
    fn: (ev: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  /** Register any cleanup to run when the scene exits (e.g. bus.on unsubscribers). */
  protected onExit(fn: () => void): void {
    this.disposers.push(fn);
  }

  /** @internal */
  _cleanup(): void {
    for (const d of this.disposers.splice(0)) d();
  }
}

type Factory = () => GameScene;

class SceneManager {
  renderer!: THREE.WebGLRenderer;
  canvas!: HTMLCanvasElement;
  uiRoot!: HTMLElement;
  private fadeEl!: HTMLElement;
  private factories = new Map<SceneName, Factory>();
  private instances = new Map<SceneName, GameScene>();
  private inited = new Set<SceneName>();
  current: GameScene | null = null;
  private clock = new THREE.Clock();
  private switching = false;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  /** Hooks that run every frame after the scene update (fx, debug overlay). */
  readonly frameHooks: ((dt: number, t: number) => void)[] = [];
  /** Hooks that run whenever the active scene changes. */
  readonly sceneHooks: ((s: GameScene) => void)[] = [];

  init(): void {
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.uiRoot = document.getElementById('ui')!;
    this.fadeEl = document.getElementById('fade')!;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = tuning.art.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.lastRaf = performance.now();
      this.frame(true);
    });
    // Watchdog: if rAF stalls (hidden preview panes, some embedded webviews), keep simulating on a timer.
    setInterval(() => {
      if (performance.now() - this.lastRaf > 250 && !document.hidden) this.frame(false);
    }, 33);
    // ── v3 perf ── when the quality ladder moves: pixel ratio cap, sun shadow map size (the town re-applies its own culling)
    quality.listeners.push(() => {
      const a = tuning.app;
      const base = Math.min(window.devicePixelRatio || 1, this.current?.pixelRatioCap ?? a.maxPixelRatio);
      this.qualityCap = quality.dprSteps > 0 ? Math.max(a.adaptiveMinRatio, base - quality.dprSteps * a.adaptiveStep) : 99;
      this.resize();
      if (this.current) applyShadowQuality(this.current.scene);
    });
  }
  private lastRaf = 0;

  register(name: SceneName, factory: Factory): void {
    this.factories.set(name, factory);
  }

  get(name: SceneName): GameScene {
    let s = this.instances.get(name);
    if (!s) {
      const f = this.factories.get(name);
      if (!f) throw new Error(`scene ${name} not registered`);
      s = f();
      this.instances.set(name, s);
    }
    return s;
  }

  async go(name: SceneName, params?: any): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    const from = this.current;
    try {
      if (from) {
        this.fadeEl.classList.add('on');
        await wait(tuning.app.sceneFadeMs);
        from.exit();
        from._cleanup();
        from.ui.remove();
      }
      const next = this.get(name);
      if (!this.inited.has(name)) {
        next.init();
        this.inited.add(name);
      }
      this.uiRoot.appendChild(next.ui);
      this.current = next;
      this.resize();
      next.enter(params);
      applyShadowQuality(next.scene);   // ── v3 perf ── a scene entered while quality is stepped down gets the smaller shadow map
      perf.settleFor(2500);             // ── v3 perf ── a scene change is not a reason to step the quality down
      if (name === 'town' && !this.warmedTown) {
        this.warmedTown = true;
        // ── v3 perf ── compile every shader that can appear later, behind the fade. (`?noprewarm` skips it: A/B on a device)
        if (!new URLSearchParams(location.search).has('noprewarm')) await this.prewarm(next);
      }
      for (const h of this.sceneHooks) h(next);
      bus.emit('sceneChange', { from: from?.name ?? null, to: name });
      // Render one frame before fading back in so there is no flash.
      this.renderer.render(next.scene, next.camera);
      this.fadeEl.classList.remove('on');
    } finally {
      this.switching = false;
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cap = Math.min(this.current?.pixelRatioCap ?? tuning.app.maxPixelRatio, this.qualityCap);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(w, h, false);
    this.current?.resize(w, h);
  }

  private lastFrameAt = 0;
  private warmedTown = false;
  /**
   * ── v3 perf ── The first town load compiles every shader that can show up later (rides, build pieces, gear, the lobby, the
   * Locker, the Studio...) while the screen is still faded, so nothing compiles mid-game. See core/prewarm.ts.
   */
  private async prewarm(town: GameScene): Promise<void> {
    const t0 = performance.now();
    // a friendly note on the faded screen, so a few seconds of black never looks like a freeze
    const note = document.createElement('div');
    note.textContent = '✨ Getting your island ready…';
    note.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:800 22px ui-rounded,system-ui,sans-serif;letter-spacing:0.02em;text-shadow:0 2px 12px rgba(0,0,0,0.5);pointer-events:none';
    this.fadeEl.appendChild(note);
    await new Promise((r) => { requestAnimationFrame(() => r(null)); setTimeout(() => r(null), 120); });   // let the note paint before the heavy work (a hidden tab never fires rAF)
    try {
      const { prewarmTownScene } = await import('./prewarm');
      const n = await prewarmTownScene(this.renderer, town.scene, town.camera);
      const t1 = performance.now();
      for (const other of ['dressup', 'workshop', 'build'] as SceneName[]) {
        if (!this.factories.has(other)) continue;
        const s = this.get(other);
        if (!this.inited.has(other)) {
          s.init();
          this.inited.add(other);
        }
        await this.renderer.compileAsync(s.scene, s.camera);
      }
      console.info(`[prewarm] town + extras: ${n} materials in ${(t1 - t0).toFixed(0)} ms; other scenes ${(performance.now() - t1).toFixed(0)} ms`);
    } catch (e) {
      console.warn('[prewarm] skipped', e);
    } finally {
      note.remove();
    }
  }
  private frame(viaRaf = true): void {
    const t0 = performance.now();   // ── v3 perf ── real frame interval + the work inside it (see core/perf.ts)
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.adaptQuality(this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.tick(dt, this.clock.elapsedTime);
    if (viaRaf) {
      if (this.lastFrameAt > 0) perf.record(t0 - this.lastFrameAt, performance.now() - t0);
      this.lastFrameAt = t0;
    }
  }

  /**
   * ── v3 perf ── Adaptive quality: a slow device steps down the quality ladder (shadow map, tree shadows, tree distance, then
   * the pixel ratio) and steps back up slowly after a long calm spell. The judgement is the 2 s MEAN frame time, so a pop-up
   * or a one-off hitch never triggers it. See core/perf.ts.
   */
  qualityCap = 99;
  private adaptQuality(window: number): void {
    const a = tuning.app;
    const ok = !(this.switching || document.hidden || performance.now() - this.lastRaf > 250);
    const base = Math.min(window_.devicePixelRatio || 1, this.current?.pixelRatioCap ?? a.maxPixelRatio);
    perf.evaluate(window, base, a.adaptiveMinRatio, ok);
  }

  private simTime = 0;
  /** Advance one frame (also used by the debug `__game.step()` hook when rAF is paused). */
  tick(dt: number, t?: number): void {
    this.simTime = t ?? this.simTime + dt;
    tweens.update(dt);
    const s = this.current;
    if (!s) return;
    s.update(dt, this.simTime);
    for (const h of this.frameHooks) h(dt, this.simTime);
    this.renderer.render(s.scene, s.camera);
  }

  /** Debug: run n frames synchronously at a fixed dt. */
  step(n = 1, dt = 1 / 60): void {
    for (let i = 0; i < n; i++) this.tick(dt, this.clock.elapsedTime + i * dt);
  }
}

/** ── v3 perf ── set every directional light's shadow map to the current quality step (and let three rebuild the map). */
export function applyShadowQuality(root: THREE.Object3D): void {
  root.traverse((o) => {
    const l = o as THREE.DirectionalLight;
    if (!l.isDirectionalLight || !l.castShadow) return;
    const base = (l.userData.baseShadowMap ??= l.shadow.mapSize.x) as number;
    const want = quality.shadowMap > 0 ? Math.min(base, quality.shadowMap) : base;
    if (l.shadow.mapSize.x === want) return;
    l.shadow.mapSize.set(want, want);
    const sh = l.shadow as unknown as { map: THREE.WebGLRenderTarget | null };
    sh.map?.dispose();
    sh.map = null;
  });
}

const window_ = window;
function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const scenes = new SceneManager();
