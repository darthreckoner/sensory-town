// Dev-only playtest telemetry (for the games-user-research protocol in
// SCORECARD.md). Records every bus event with a timestamp, every console error /
// uncaught exception, scene changes, and per-scene render cost — so the juice
// audit and the "zero console errors" check are measured, not eyeballed.
// Enabled in dev builds or with ?telemetry in the URL. Read via window.__telemetry.
import { bus, type GameEvents } from './events';
import { scenes } from './scene';

interface Entry {
  t: number;
  type: string;
  scene: string;
}

export function initTelemetry(): void {
  const on = import.meta.env.DEV || new URLSearchParams(location.search).has('telemetry');
  if (!on) return;
  const t0 = performance.now();
  const events: Entry[] = [];
  const counts: Record<string, number> = {};
  const errors: { t: number; msg: string }[] = [];
  const sceneLog: { t: number; to: string }[] = [];
  const renderCost: Record<string, { calls: number; tris: number; frames: number }> = {};

  // wrap bus.emit (no wildcard listener on the bus)
  const emit = bus.emit.bind(bus);
  (bus as { emit: typeof bus.emit }).emit = <K extends keyof GameEvents>(type: K, payload: GameEvents[K]) => {
    const scene = scenes.current?.name ?? '-';
    events.push({ t: Math.round(performance.now() - t0), type: String(type), scene });
    if (events.length > 5000) events.shift();
    counts[String(type)] = (counts[String(type)] ?? 0) + 1;
    if (type === 'sceneChange') sceneLog.push({ t: Math.round(performance.now() - t0), to: (payload as GameEvents['sceneChange']).to });
    emit(type, payload);
  };

  const pushErr = (msg: string) => errors.push({ t: Math.round(performance.now() - t0), msg: msg.slice(0, 400) });
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    pushErr(args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' '));
    origError(...args);
  };
  window.addEventListener('error', (e) => pushErr(`uncaught: ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => pushErr(`unhandled rejection: ${String(e.reason?.stack ?? e.reason)}`));

  scenes.frameHooks.push(() => {
    const s = scenes.current?.name;
    if (!s) return;
    const info = scenes.renderer.info.render;
    const r = (renderCost[s] ??= { calls: 0, tris: 0, frames: 0 });
    r.calls = Math.max(r.calls, info.calls);
    r.tris = Math.max(r.tris, info.triangles);
    r.frames++;
  });

  (window as unknown as { __telemetry: unknown }).__telemetry = {
    events,
    counts,
    errors,
    sceneLog,
    renderCost,
    /** events since a mark (ms since boot) */
    since: (ms: number) => events.filter((e) => e.t >= ms),
    now: () => Math.round(performance.now() - t0),
    reset: () => {
      events.length = 0;
      errors.length = 0;
      sceneLog.length = 0;
      for (const k of Object.keys(counts)) delete counts[k];
      for (const k of Object.keys(renderCost)) delete renderCost[k];
    },
  };
}
