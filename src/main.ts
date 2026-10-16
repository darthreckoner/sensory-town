import './ui/style.css';
import { scenes } from './core/scene';
import { store } from './core/store';
import { initJuice } from './juice/juice';
import { initDebug } from './core/debug';
import { initTelemetry } from './core/telemetry';
import { initSelfTest } from './core/selftest';
import { initMenu, syncSettings } from './ui/menu';
import { PickerScene } from './scenes/PickerScene';
import { DressUpScene } from './scenes/DressUpScene';
import { DriveScene } from './scenes/DriveScene';
import { BuildScene } from './scenes/BuildScene';
import { WorkshopScene } from './scenes/WorkshopScene';
import { audio } from './juice/audio';

async function boot(): Promise<void> {
  // Block page gestures iOS still allows despite touch-action.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // Unlock audio on the very first touch anywhere (the profile picker tap).
  // (iOS WebKit only honours some gesture types for audio, so listen to all of them.)
  const unlock = () => audio.unlock();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
    window.addEventListener(type, unlock, { capture: true });
  }

  await store.load();
  syncSettings();
  store.onChange(syncSettings);

  scenes.init();
  initTelemetry();
  initSelfTest();
  initJuice();
  initMenu();
  initDebug();

  scenes.register('picker', () => new PickerScene());
  scenes.register('dressup', () => new DressUpScene());
  scenes.register('town', () => new DriveScene());
  scenes.register('build', () => new BuildScene());
  scenes.register('workshop', () => new WorkshopScene());

  // ?scene=wax|squishy|slime|town|build|dressup for quick testing
  const q = new URLSearchParams(location.search).get('scene');
  if (q && store.data.profiles.length) {
    if (!store.data.activeProfileId) store.setActiveProfile(store.data.profiles[0].id);
    if (q === 'wax' || q === 'squishy' || q === 'slime') await scenes.go('workshop', { station: q });
    else await scenes.go(q as any);
  } else {
    await scenes.go('picker');
  }

  // Service worker (production only) — precaches everything for offline play.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }
  window.addEventListener('pagehide', () => void store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void store.flush();
  });
  (window as any).__game = { scenes, store, audio };
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:20px;white-space:pre-wrap;color:#a00;font:14px monospace">${String(err?.stack ?? err)}</pre>`);
});
