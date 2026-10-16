// Finish chips + colour swatches, used in the selection bubble and in the brush
// panel. One component so both look and behave the same.
import { bus } from '../core/events';
import type { Hex } from '../core/model';
import { bindTap, el } from '../ui/ui';
import type { Finish } from './finishes';

export interface StyleOpts {
  finishes: Finish[];
  finish?: string;
  colors: Hex[];
  color: Hex;
  onFinish?(f: Finish): void;
  onColor(c: Hex): void;
}

export interface StylePicker {
  root: HTMLElement;
  /** Re-sync the highlights (and the swatch list when the finish changed). */
  set(finish: string | undefined, color: Hex, colors?: Hex[]): void;
}

export function buildStylePicker(parent: HTMLElement, o: StyleOpts): StylePicker {
  const root = el('div', 'bstyle', parent);
  let colors = o.colors;
  let finish = o.finish;
  let color = o.color;

  const fRow = o.finishes.length > 1 ? el('div', 'bfins', root) : null;
  const chips = new Map<string, HTMLElement>();
  if (fRow) {
    for (const f of o.finishes) {
      const b = el('button', 'bfin', fRow);
      el('span', 'ico', b, f.icon);
      el('span', 'lbl', b, f.name);
      bindTap(b, () => {
        bus.emit('uiTap', { kind: 'tab' });
        finish = f.id;
        o.onFinish?.(f);
        sync();
      });
      chips.set(f.id, b);
    }
  }

  const sRow = el('div', 'bswatches', root);
  const drawSwatches = () => {
    sRow.innerHTML = '';
    for (const c of colors) {
      const s = el('div', 'swatch', sRow);
      s.style.background = c;
      s.dataset.c = c;
      bindTap(s, () => {
        color = c;
        bus.emit('colorPicked', { color: c });
        o.onColor(c);
        sync();
      });
    }
  };
  const sync = () => {
    chips.forEach((b, id) => b.classList.toggle('on', id === finish));
    sRow.querySelectorAll('.swatch').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.c?.toLowerCase() === color.toLowerCase()));
  };
  drawSwatches();
  sync();

  return {
    root,
    set(f, c, cs) {
      finish = f;
      color = c;
      if (cs && cs !== colors) {
        colors = cs;
        drawSwatches();
      }
      sync();
    },
  };
}
