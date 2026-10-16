// Tiny tween runner (updated by the scene manager every frame).

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Tween {
  t: number;
  dur: number;
  fn: (k: number, raw: number) => void;
  ease: Ease;
  done?: () => void;
  key?: unknown;
}

class Tweens {
  private list: Tween[] = [];

  /** Run fn(k) with k going 0→1 (eased) over `dur` seconds. A `key` cancels any earlier tween with the same key. */
  add(dur: number, fn: (k: number, raw: number) => void, opts: { ease?: Ease; done?: () => void; key?: unknown } = {}): void {
    if (opts.key !== undefined) this.cancel(opts.key);
    this.list.push({ t: 0, dur: Math.max(1e-4, dur), fn, ease: opts.ease ?? ease.outCubic, done: opts.done, key: opts.key });
  }

  cancel(key: unknown): void {
    this.list = this.list.filter((tw) => tw.key !== key);
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const snapshot = this.list.slice();
    const finished = new Set<Tween>();
    for (const tw of snapshot) {
      tw.t += dt;
      const raw = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(raw), raw);
      if (raw >= 1) finished.add(tw);
    }
    // Remove finished tweens (tweens added during callbacks are kept).
    this.list = this.list.filter((tw) => !finished.has(tw));
    for (const tw of finished) tw.done?.();
  }
}

export const tweens = new Tweens();

/** Squash-and-stretch pop on an object's scale (used by juice). */
export function popScale(obj: { scale: { set(x: number, y: number, z: number): void; x: number; y: number; z: number } }, dur = 0.35, amount = 0.25): void {
  const o = obj as any;
  // Remember the resting scale so overlapping pops don't accumulate.
  o.userData ??= {};
  if (!o.userData.__baseScale) o.userData.__baseScale = [obj.scale.x, obj.scale.y, obj.scale.z];
  const [bx, by, bz] = o.userData.__baseScale as number[];
  tweens.add(
    dur,
    (_k, raw) => {
      const s = Math.sin(raw * Math.PI * 2.5) * Math.exp(-raw * 4) * amount;
      obj.scale.set(bx * (1 + s * 0.6), by * (1 - s), bz * (1 + s * 0.6));
    },
    { ease: ease.linear, key: obj, done: () => { obj.scale.set(bx, by, bz); delete o.userData.__baseScale; } },
  );
}
