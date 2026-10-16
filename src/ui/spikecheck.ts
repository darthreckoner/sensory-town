// ── v3 perf ── `popupSpikes`: how badly does each pop-up hitch the town? For every pop-up type (a toast, a POI title card, a
// reveal card with its 3D item — cold, then warm — the Drive prompt bubble, the charm counter pop) it records the frame
// interval (every game frame, via scenes.frameHooks) and `longtask` entries (Chrome; Safari has none) for a short window
// around the pop-up, next to a baseline measured just before it. Report: max frame ms, frames over 33 / 50 ms, long
// tasks, and how many DOM nodes the pop-up left behind in #ui.
//   __selftest.run('popupSpikes')   or   __layout.spikes()
import { scenes } from '../core/scene';
import { bus } from '../core/events';
import { toast } from './ui';
import { nextReward } from '../core/unlocks';

export interface SpikeRow {
  name: string;
  /** max frame interval (ms) before the pop-up / after it */
  baseMax: number;
  /** median frame interval before it (the pane's own speed) */
  baseMed: number;
  maxMs: number;
  /** mean + 95th percentile frame interval during the pop-up, next to the baseline mean (sustained cost shows here) */
  mean: number;
  p95: number;
  baseMean: number;
  over33: number;
  over50: number;
  longTasks: number;
  longMax: number;
  /** DOM nodes in #ui left over once the pop-up is gone */
  leftover: number;
  /** running animations that animate something other than transform / opacity (repaint every frame on iPad), e.g. "drive-chip box-shadow" */
  badAnims: string[];
  /** elements in #ui with a backdrop-filter (re-blurs the canvas behind them every frame on iPad Safari) */
  blurEls: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Record game-frame intervals + long tasks (each with its start time) for `ms`. */
function record(ms: number): Promise<{ frames: { t: number; dt: number }[]; longs: { t: number; dur: number }[] }> {
  return new Promise((resolve) => {
    const frames: { t: number; dt: number }[] = [];
    const longs: { t: number; dur: number }[] = [];
    let last = performance.now();
    const hook = () => {
      const n = performance.now();
      frames.push({ t: n, dt: n - last });
      last = n;
    };
    scenes.frameHooks.push(hook);
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) longs.push({ t: e.startTime, dur: e.duration });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {
      po = null; // Safari: no longtask
    }
    setTimeout(() => {
      const i = scenes.frameHooks.indexOf(hook);
      if (i >= 0) scenes.frameHooks.splice(i, 1);
      po?.disconnect();
      resolve({ frames, longs });
    }, ms);
  });
}

const meanOf = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const p95Of = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 0);
const maxOf = (a: number[]) => (a.length ? Math.max(...a) : 0);
/** the median frame interval: on a slow / software-rendered pane the whole game runs at ~30 fps, so spikes are judged against it */
const medianOf = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const uiNodes = () => document.querySelectorAll('#ui *').length;

/** Device-independent audit of what a pop-up makes the browser do every frame. */
function audit(): { bad: string[]; blur: number } {
  const ok = new Set(['transform', 'opacity', 'offset', 'easing', 'composite', 'computedOffset', 'scale', 'translate', 'rotate']);
  const bad = new Set<string>();
  for (const a of document.getAnimations()) {
    const eff = a.effect as KeyframeEffect | null;
    const t = eff?.target as Element | null;
    if (!eff || !t || a.playState !== 'running') continue;
    const props = new Set<string>();
    for (const k of eff.getKeyframes()) for (const p of Object.keys(k)) if (!ok.has(p)) props.add(p);
    if (props.size) bad.add(`${(t.className?.toString?.() || t.tagName).split(' ')[0] || t.tagName} ${[...props].join('+')}`);
  }
  let blur = 0;
  document.querySelectorAll('#ui *').forEach((e) => {
    const cs = getComputedStyle(e);
    const bf = cs.getPropertyValue('backdrop-filter') || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none';
    if (bf && bf !== 'none') blur++;
  });
  return { bad: [...bad], blur };
}

async function measure(name: string, trigger: () => void | Promise<void>, cleanup: () => void | Promise<void>, windowMs = 1900): Promise<SpikeRow> {
  const base = await record(900);
  const nodesBefore = uiNodes();
  const rec = record(windowMs);
  await sleep(120);
  const t0 = performance.now(); // everything from the trigger on counts
  await trigger();
  await sleep(400);
  const aud = audit(); // what is animating / blurring while the pop-up is up
  const r = await rec;
  await cleanup();
  await sleep(2800); // let the pop-up finish (toasts are 2.6 s) and be removed
  const frames = r.frames.filter((f) => f.t >= t0).map((f) => f.dt);
  const longs = r.longs.filter((l) => l.t >= t0 - 5).map((l) => l.dur);
  return {
    name,
    baseMax: Math.round(maxOf(base.frames.slice(2).map((f) => f.dt))),
    baseMed: Math.round(medianOf(base.frames.slice(2).map((f) => f.dt))),
    maxMs: Math.round(maxOf(frames)),
    mean: +meanOf(frames).toFixed(1),
    p95: Math.round(p95Of(frames)),
    baseMean: +meanOf(base.frames.slice(2).map((f) => f.dt)).toFixed(1),
    over33: frames.filter((f) => f > 33).length,
    over50: frames.filter((f) => f > 50).length,
    longTasks: longs.length,
    longMax: Math.round(maxOf(longs)),
    leftover: uiNodes() - nodesBefore,
    badAnims: aud.bad,
    blurEls: aud.blur,
  };
}

/** The town must be the current scene (the self-test sends us there). */
export async function popupSpikes(): Promise<{ pass: boolean; detail: string; rows: SpikeRow[] }> {
  if (scenes.current?.name !== 'town') await scenes.go('town');
  await sleep(2500); // let the first frames, the bus intro and shader compiles settle
  const scene = scenes.current as unknown as Record<string, any>;
  const holder = Object.values(scene).find((v) => v && typeof v === 'object' && v.poi && typeof v.poi.announce === 'function') as { poi: { announce(p: object, x: number, z: number): void } } | undefined;
  const rows: SpikeRow[] = [];
  const closeReveal = async () => {
    const b = document.querySelector('.rv-root .rv-btns .btn') as HTMLElement | null;
    if (b) {
      const r = b.getBoundingClientRect();
      const o = { pointerId: 91, bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'touch', isPrimary: true };
      b.dispatchEvent(new PointerEvent('pointerdown', o));
      b.dispatchEvent(new PointerEvent('pointerup', o));
    }
    await sleep(500);
  };
  const reveal = () =>
    bus.emit('rewardUnlocked', { id: 'skin.cosmicCheer', icon: '⭐', label: 'Cosmic Cheer', rarity: 'epic', slot: 'outfit', itemId: 'cosmicCheer', where: 'Locker · Outfit' });

  rows.push(await measure('toast', () => toast('Found a charm!'), () => undefined));
  if (holder) rows.push(await measure('poi card', () => holder.poi.announce({ id: 'spike', name: 'SPIKE TEST', x: 0, z: 0, r: 1, icon: '🏝️' }, 0, 0), () => undefined, 2400));
  rows.push(await measure('reveal (cold)', reveal, closeReveal, 2600));
  rows.push(await measure('reveal (warm)', reveal, closeReveal, 2600));
  const prompt = scene.prompt as { show(i: string, t: string, f: () => void): void; hide(): void } | undefined;
  if (prompt) rows.push(await measure('prompt bubble', () => prompt.show('🚗', 'Drive', () => undefined), () => prompt.hide(), 1500));
  const top = scene.top as { setCharms(n: number, total: number, next: ReturnType<typeof nextReward>): void } | undefined;
  if (top) {
    let n = 500;
    rows.push(await measure('charm pop', () => top.setCharms(++n, 600, undefined), () => undefined, 1200));
  }
  const worst = Math.max(...rows.map((r) => r.maxMs));
  const longs = rows.reduce((a, r) => a + r.longTasks, 0);
  const detail = rows.map((r) => `${r.name}: max ${r.maxMs}ms p95 ${r.p95}ms mean ${r.mean}ms (base: max ${r.baseMax}, mean ${r.baseMean}), >50ms×${r.over50}, long tasks ${r.longTasks}${r.longTasks ? ` (max ${r.longMax}ms)` : ''}, +${r.leftover} nodes, backdrop-filter els ${r.blurEls}, non-compositor animations: ${r.badAnims.length ? r.badAnims.join('; ') : 'none'}`).join(' | ');
  return { pass: rows.every((r) => r.maxMs <= Math.max(100, r.baseMed * 3) && r.longMax < 100 && r.leftover <= 2 && r.blurEls === 0 && r.badAnims.length === 0), detail: `worst frame ${worst}ms, long tasks ${longs} · ${detail}`, rows };
}
