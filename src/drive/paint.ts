// The paint shop: colour, finish (gloss / matte / chrome), neon underglow,
// sparkle trail and rims. Bonus options are locked until enough 💎 charms are
// found (core/unlocks.ts); tapping a locked one explains how to unlock it.
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { isUnlocked, lockedToast } from '../core/unlocks';
import { bindTap, button, el, sheet, swatches } from '../ui/ui';
import type { Car, CarFinish } from '../art/car';

const NEONS = ['#00d4ff', '#ff2e88', '#b6ff3b', '#7c4dff', '#ffc93c', '#ffffff'];
const RIMS = ['#d9dce6', '#1d1b26', '#ffc93c', '#ff2e88', '#00d4ff'];
const FINISHES: { id: CarFinish; icon: string; label: string; lock?: string }[] = [
  { id: 'gloss', icon: '✨', label: 'Gloss' },
  { id: 'matte', icon: '🌫️', label: 'Matte' },
  { id: 'chrome', icon: '🪞', label: 'Chrome', lock: 'car.chrome' },
];

/** Open the paint shop for `car`. */
export function openPaintSheet(car: Car, where: { x: number; y: number; z: number }): void {
  sheet((body, close) => {
    body.classList.add('paint-sheet');
    el('h2', '', body, '🎨 Paint shop');

    const cur = (): { finish: CarFinish; neon: string | null; trail: boolean; rims: string } => {
      const s = car.currentStyle;
      return { finish: s.finish, neon: s.neon, trail: s.trail, rims: s.rims };
    };
    const save = (patch: Partial<ReturnType<typeof cur>>): void => {
      car.setStyle(patch);
      const s = cur();
      store.update(() => {
        store.profile.carStyle = { finish: s.finish, neon: s.neon, trail: s.trail, rims: s.rims };
      });
      bus.emit('optionPicked', { pos: where });
    };

    // chips: a row of options, one selected; locked ones show 🔒
    const chips = <T>(
      parent: HTMLElement,
      items: { value: T; icon: string; label?: string; lock?: string; swatch?: string }[],
      selected: () => T,
      onPick: (v: T) => void,
    ): void => {
      const row = el('div', 'paint-chips', parent);
      const els: { b: HTMLElement; v: T }[] = [];
      const refresh = (): void => {
        for (const { b, v } of els) b.classList.toggle('on', v === selected());
      };
      for (const it of items) {
        const locked = !!it.lock && !isUnlocked(it.lock);
        const b = el('div', `paint-chip${locked ? ' locked' : ''}`, row);
        if (it.swatch) {
          const s = el('span', 'sw', b);
          s.style.background = it.swatch;
        } else el('span', 'ico', b, it.icon);
        if (it.label) el('span', 'lbl', b, it.label);
        if (locked) el('span', 'lock', b, '🔒');
        bindTap(b, () => {
          if (it.lock && !isUnlocked(it.lock)) {
            lockedToast(it.lock);
            return;
          }
          onPick(it.value);
          refresh();
        });
        els.push({ b, v: it.value });
      }
      refresh();
    };

    el('div', 'label', body, 'Color');
    swatches(
      body,
      tuning.art.palette,
      store.profile.carColor,
      (c) => {
        store.update(() => {
          store.profile.carColor = c;
        });
        car.setColor(c);
        bus.emit('optionPicked', { pos: where });
      },
      'wide',
    );

    el('div', 'label', body, 'Finish');
    chips<CarFinish>(
      body,
      FINISHES.map((f) => ({ value: f.id, icon: f.icon, label: f.label, lock: f.lock })),
      () => cur().finish,
      (v) => save({ finish: v }),
    );

    el('div', 'label', body, 'Underglow');
    chips<string | null>(
      body,
      [{ value: null, icon: '🚫', label: 'Off' }, ...NEONS.map((c) => ({ value: c as string | null, icon: '', swatch: c, lock: 'car.neon' }))],
      () => cur().neon,
      (v) => save({ neon: v }),
    );

    el('div', 'label', body, 'Sparkle trail');
    chips<boolean>(
      body,
      [
        { value: false, icon: '🚫', label: 'Off' },
        { value: true, icon: '💫', label: 'Sparkles', lock: 'car.trail' },
      ],
      () => cur().trail,
      (v) => save({ trail: v }),
    );

    el('div', 'label', body, 'Rims');
    chips<string>(
      body,
      RIMS.map((c) => ({ value: c, icon: '', swatch: c })),
      () => cur().rims,
      (v) => save({ rims: v }),
    );

    const row = el('div', 'row', body);
    row.style.justifyContent = 'center';
    row.style.marginTop = '14px';
    button(row, { label: 'Done', cls: 'pink big' }, close);
  });
}
