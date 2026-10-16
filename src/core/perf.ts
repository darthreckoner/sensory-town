// ── v3 perf ── frame-time stats, Low Power Mode detection, and the adaptive quality ladder.
//
//   perf.record(intervalMs, workMs)   the scene manager calls this once per real rAF frame
//   perf.evaluate(mgr)                the scene manager calls this every ~0.5 s: steps quality down / up
//   perf.lines()                      the lines the three-finger debug readout adds
//
// The quality ladder replaces the old "drop the pixel ratio" rule. Cheapest-to-lose first:
//   1  sun shadow map 2048 -> 1024
//   2  trees / rocks / small props stop casting sun shadows
//   3  vegetation draw distance x0.7
//   4+ pixel ratio, 0.25 at a time, down to tuning.app.adaptiveMinRatio
// The decision uses the MEAN frame time over 2 s (never a single frame, so a pop-up or a scene change does not trigger it),
// and recovery is slow with hysteresis (a step only comes back after a long calm spell, and each failed recovery doubles the wait).
import { tuning } from '../tuning';

export interface QualityState {
  step: number;
  /** sun shadow map edge in texels (0 = leave each scene's own size alone) */
  shadowMap: number;
  /** do trees / rocks / small props cast sun shadows */
  smallCasters: boolean;
  /** multiplier on tuning.drive.cullVegetation */
  vegDistScale: number;
  /** pixel ratio steps taken below the scene's own cap (0.25 each) */
  dprSteps: number;
  /** called whenever the ladder moves (townEnv re-applies its culling, the manager resizes, lights resize their shadow maps) */
  listeners: (() => void)[];
}

export const quality: QualityState = { step: 0, shadowMap: 0, smallCasters: true, vegDistScale: 1, dprSteps: 0, listeners: [] };

const FIXED_STEPS = 3;
const LABELS = ['full', 'shadows 1024', 'no tree shadows', 'shorter trees'];

function setStep(n: number, maxStep: number): void {
  n = Math.max(0, Math.min(maxStep, n));
  quality.step = n;
  quality.shadowMap = n >= 1 ? Math.max(512, Math.round(tuning.drive.shadowMap / 2)) : 0;
  quality.smallCasters = n < 2;
  quality.vegDistScale = n >= 3 ? 0.7 : 1;
  quality.dprSteps = Math.max(0, n - FIXED_STEPS);
  for (const l of quality.listeners) l();
}

class PerfMonitor {
  // ── frame log: the last ~12 s of real frame intervals ──
  private readonly ts: number[] = [];
  private readonly iv: number[] = [];
  private readonly wk: number[] = [];
  private readonly spikeTimes: number[] = [];
  /** session-long totals */
  spikesTotal = 0;
  worstEver = 0;
  /** is the device capped at ~30 Hz while the work is cheap (iOS Low Power Mode)? */
  lowPower = false;
  private lpFrames = 0;
  private lpSince = 0;
  private calmSince = 0;

  // ── ladder bookkeeping ──
  private slowFor = 0;
  private calmFor = 0;
  private settle = 0;                 // seconds to wait after a change before judging again
  private recoverHold = 12;           // seconds of calm needed before stepping up
  private lastUp = -1e9;
  private maxStep = FIXED_STEPS;
  private clock = 0;
  private ignoreUntil = 0;

  /** Called for every real rAF frame: wall-clock interval since the previous frame, and the CPU work inside the frame. */
  record(intervalMs: number, workMs: number): void {
    const now = performance.now();
    this.ts.push(now);
    this.iv.push(intervalMs);
    this.wk.push(workMs);
    while (this.ts.length && now - this.ts[0] > 12000) {
      this.ts.shift();
      this.iv.shift();
      this.wk.shift();
    }
    if (intervalMs > 50 && intervalMs < 2000) {
      this.spikeTimes.push(now);
      this.spikesTotal++;
    }
    while (this.spikeTimes.length && now - this.spikeTimes[0] > 60000) this.spikeTimes.shift();
    if (intervalMs < 2000 && intervalMs > this.worstEver) this.worstEver = intervalMs;
    this.detectLowPower(now, intervalMs, workMs);
  }

  /** iOS Low Power Mode caps requestAnimationFrame at ~30 Hz: steady 27-40 ms frames while the work inside each is cheap. */
  private detectLowPower(now: number, intervalMs: number, workMs: number): void {
    const capped = intervalMs > 27 && intervalMs < 40 && workMs < 16;
    if (capped) {
      if (this.lpFrames === 0) this.lpSince = now;
      this.lpFrames++;
      if (!this.lowPower && now - this.lpSince > 3000 && this.lpFrames > 60) this.lowPower = true;
      this.calmSince = 0;
    } else {
      this.lpFrames = 0;
      if (this.lowPower && intervalMs < 22) {
        if (!this.calmSince) this.calmSince = now;
        else if (now - this.calmSince > 2000) this.lowPower = false;
      } else if (intervalMs >= 22) this.calmSince = 0;
    }
  }

  /** Ignore the next `ms` of frames for ladder decisions (a scene switch, a big build, ...). */
  settleFor(ms: number): void {
    this.ignoreUntil = performance.now() + ms;
  }

  /** Mean of the real frame intervals over the last `ms`, skipping stalls (a hidden tab, a debugger pause). */
  meanInterval(ms: number): number {
    const now = performance.now();
    let sum = 0, n = 0;
    for (let i = this.ts.length - 1; i >= 0 && now - this.ts[i] <= ms; i--) {
      if (this.iv[i] > 400) continue;
      sum += this.iv[i];
      n++;
    }
    return n >= 20 ? sum / n : 0;
  }

  worstMs(ms = 5000): number {
    const now = performance.now();
    let w = 0;
    for (let i = this.ts.length - 1; i >= 0 && now - this.ts[i] <= ms; i--) if (this.iv[i] < 2000 && this.iv[i] > w) w = this.iv[i];
    return w;
  }

  spikes(): number {
    return this.spikeTimes.length;
  }

  /** p50 / p95 / max of the logged interval window (for the overlay and tests). */
  percentiles(): { p50: number; p95: number; max: number; n: number } {
    const a = this.iv.filter((v) => v < 2000).sort((x, y) => x - y);
    if (!a.length) return { p50: 0, p95: 0, max: 0, n: 0 };
    return { p50: a[Math.floor((a.length - 1) * 0.5)], p95: a[Math.floor((a.length - 1) * 0.95)], max: a[a.length - 1], n: a.length };
  }

  /**
   * Every ~0.5 s from the scene manager. `dprBase` = the pixel ratio the current scene would use with no quality cap,
   * `minRatio` = the floor. Returns true when the ladder moved.
   */
  evaluate(window: number, dprBase: number, minRatio: number, okToJudge: boolean): boolean {
    this.clock += window;
    const stepDpr = tuning.app.adaptiveStep;
    this.maxStep = FIXED_STEPS + Math.max(0, Math.floor((dprBase - minRatio) / stepDpr + 1e-6));
    if (this.settle > 0) this.settle = Math.max(0, this.settle - window);
    if (!okToJudge || performance.now() < this.ignoreUntil || this.settle > 0) {
      this.slowFor = 0;
      return false;
    }
    const mean = this.meanInterval(2000);
    if (!mean) return false;
    // In Low Power Mode the rAF cap makes ~33 ms the best a good device can do: only a real shortfall counts as slow.
    const slowMs = this.lowPower ? 1000 / 26 : 1000 / tuning.app.adaptiveFpsFloor;
    const goodMs = this.lowPower ? 1000 / 28 : 1000 / 54;
    if (mean > slowMs) {
      this.slowFor += window;
      this.calmFor = 0;
      if (this.slowFor >= tuning.app.adaptiveSeconds && quality.step < this.maxStep) {
        this.slowFor = 0;
        // dropping again soon after a recovery means the recovery was too eager: wait twice as long next time
        if (this.clock - this.lastUp < 40) this.recoverHold = Math.min(192, this.recoverHold * 2);
        setStep(quality.step + 1, this.maxStep);
        this.settle = 3;
        console.info(`[quality] ${mean.toFixed(1)} ms/frame → step ${quality.step} (${this.label()})`);
        return true;
      }
    } else {
      this.slowFor = 0;
      if (mean < goodMs && quality.step > 0) {
        this.calmFor += window;
        if (this.calmFor >= this.recoverHold) {
          this.calmFor = 0;
          this.lastUp = this.clock;
          setStep(quality.step - 1, this.maxStep);
          this.settle = 4;
          console.info(`[quality] calm for a while → step ${quality.step} (${this.label()})`);
          return true;
        }
      } else this.calmFor = 0;
    }
    return false;
  }

  label(): string {
    return quality.step <= FIXED_STEPS ? LABELS[quality.step] : `pixel ratio -${(quality.dprSteps * tuning.app.adaptiveStep).toFixed(2)}`;
  }

  /** Lines for the three-finger debug readout. */
  lines(): string[] {
    const p = this.percentiles();
    return [
      `worst   ${this.worstMs(5000).toFixed(0)} ms (5 s)   p50 ${p.p50.toFixed(1)}  p95 ${p.p95.toFixed(1)}`,
      `spikes  >50ms ${this.spikes()} (60 s)  ${this.spikesTotal} total`,
      `quality step ${quality.step} · ${this.label()}`,
      `LowPower? ${this.lowPower ? 'YES (rAF capped ~30 Hz)' : 'no'}`,
    ];
  }

  /** Reset the ladder (new session / tests). */
  reset(): void {
    setStep(0, this.maxStep);
    this.slowFor = this.calmFor = 0;
    this.recoverHold = 12;
  }
}

export const perf = new PerfMonitor();
if (import.meta.env.DEV || new URLSearchParams(location.search).has('selftest') || new URLSearchParams(location.search).has('telemetry')) {
  (window as unknown as { __perf: unknown }).__perf = { perf, quality, setStep: (n: number) => setStep(n, 99) };
}
