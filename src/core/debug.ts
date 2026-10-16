// Debug overlay + hotkeys.
//   `  toggle overlay (fps, scene, key tuning)      — iPad: three-finger tap
//   F1 reset current station
//   F2 fill the town with test houses
//   F3 hardenTime = 0
import { scenes } from './scene';
import { perf } from './perf';   // ── v3 perf ──
import { store } from './store';
import { tuning } from '../tuning';
import { uid, type House, type PlacedPiece } from './model';

let overlay: HTMLDivElement;
let on = false;

export function initDebug(): void {
  overlay = document.createElement('div');
  overlay.id = 'debug';
  document.getElementById('ui')!.appendChild(overlay);

  window.addEventListener('keydown', (e) => {
    if (e.key === tuning.debug.overlayKey) {
      toggle();
    } else if (e.key === 'F1') {
      e.preventDefault();
      scenes.current?.resetStation();
    } else if (e.key === 'F2') {
      e.preventDefault();
      fillTestTown();
    } else if (e.key === 'F3') {
      e.preventDefault();
      tuning.wax.hardenTime = 0;
      flash('hardenTime = 0');
    }
  });

  // three-finger tap on touch devices
  const touches = new Map<number, number>();
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      const now = performance.now();
      touches.set(e.pointerId, now);
      for (const [id, t] of touches) if (now - t > tuning.app.threeFingerTapMs) touches.delete(id);
      if (touches.size >= 3) {
        touches.clear();
        toggle();
      }
    },
    { capture: true },
  );
  window.addEventListener('pointerup', (e) => touches.delete(e.pointerId), { capture: true });
  window.addEventListener('pointercancel', (e) => touches.delete(e.pointerId), { capture: true });

  scenes.frameHooks.push(() => {
    if (!on) return;
    const s = scenes.current;
    const lines: string[] = [
      `fps     ${scenes.fps.toFixed(0)}`,
      `scene   ${s?.name ?? '-'}`,
      `profile ${store.profile?.name ?? '-'}`,
      `dpr     ${scenes.renderer.getPixelRatio().toFixed(2)}`,
      `calls   ${scenes.renderer.info.render.calls}  tris ${scenes.renderer.info.render.triangles}`,
      ...perf.lines(),   // ── v3 perf ── worst ms (5 s), spikes > 50 ms, quality step, Low Power?
      `houses  ${store.data.town.houses.length}  decos ${store.data.town.decorations.length}`,
      `wax.hardenTime ${tuning.wax.hardenTime}  squishy.softness ${tuning.squishy.softness}`,
      `drive.topSpeed ${tuning.drive.topSpeed}  turnRate ${tuning.drive.turnRate}`,
    ];
    if (s) for (const [k, v] of Object.entries(s.debugInfo())) lines.push(`${k.padEnd(7)} ${v}`);
    overlay.textContent = lines.join('\n');
  });
}

function toggle(): void {
  on = !on;
  overlay.classList.toggle('on', on);
}

function flash(msg: string): void {
  const was = on;
  on = true;
  overlay.classList.add('on');
  overlay.textContent = msg;
  setTimeout(() => {
    on = was;
    overlay.classList.toggle('on', on);
  }, 900);
}

/** F2 — fill every empty plot with a simple test house owned by the active profile. */
export function fillTestTown(): void {
  const n = tuning.build.plotsPerTown;
  const owner = store.profile.id;
  const colors = tuning.art.palette;
  store.update((d) => {
    for (let plot = 0; plot < n; plot++) {
      if (d.town.houses.some((h) => h.plot === plot)) continue;
      const pieces: PlacedPiece[] = [];
      const c = colors[(plot * 3) % colors.length];
      for (let x = 2; x <= 5; x++)
        for (let z = 2; z <= 5; z++) {
          pieces.push({ id: uid('pc_'), type: 'floor', x, z, rot: 0, color: '#f2e6da' });
          if (z === 2) pieces.push({ id: uid('pc_'), type: x === 3 ? 'wallDoor' : 'wall', x, z, rot: 0, color: c });
          if (z === 5) pieces.push({ id: uid('pc_'), type: x === 4 ? 'wallWindow' : 'wall', x, z, rot: 2, color: c });
          if (x === 2) pieces.push({ id: uid('pc_'), type: 'wall', x, z, rot: 3, color: c });
          if (x === 5) pieces.push({ id: uid('pc_'), type: z === 3 ? 'wallWindow' : 'wall', x, z, rot: 1, color: c });
          pieces.push({ id: uid('pc_'), type: 'roofGable', x, z, rot: 0, color: '#ff8fb1' });
        }
      pieces.push({ id: uid('pc_'), type: 'sofa', x: 3, z: 4, rot: 0, color: '#9d8cff' });
      pieces.push({ id: uid('pc_'), type: 'plant', x: 5, z: 5, rot: 0, color: '#5fd3a5' });
      const h: House = { plot, ownerId: owner, pieces };
      d.town.houses.push(h);
    }
  });
  flash('F2: test houses added');
  // re-enter the current scene so it rebuilds from data
  const cur = scenes.current?.name;
  if (cur === 'town' || cur === 'build') void scenes.go(cur);
}
