// Palette tiles for the Build scene. A tile can be TAPPED (arms it as a brush)
// or DRAGGED out onto the world (ghost follows, release places).
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { el } from '../ui/ui';

export interface PalItem {
  id: string;
  icon: string;
  label: string;
  dot?: string;     // small colour dot (default colour of the piece)
  data: unknown;    // whatever the scene needs to start a brush from this tile
}

export type DragPhase = 'start' | 'move' | 'end' | 'cancel';

export interface TileHandlers {
  onTap(item: PalItem, tile: HTMLElement): void;
  onDrag(item: PalItem, x: number, y: number, phase: DragPhase, touch: boolean): void;
}

export function paletteTile(parent: HTMLElement, item: PalItem, h: TileHandlers): HTMLButtonElement {
  const t = el('button', 'item ptile', parent) as HTMLButtonElement;
  t.dataset.id = item.id;
  el('span', 'ico', t, item.icon);
  el('span', '', t, item.label);
  if (item.dot) {
    const d = el('span', 'pdot', t);
    d.style.background = item.dot;
  }
  let pid: number | null = null;
  let sx = 0, sy = 0;
  let dragging = false;

  const finish = () => {
    pid = null;
    dragging = false;
    t.classList.remove('lifted', 'pressed');
  };

  t.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (pid !== null) return;
    pid = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    dragging = false;
    t.classList.add('pressed');
    try {
      t.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  t.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const touch = e.pointerType !== 'mouse';
    if (!dragging) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > tuning.build.dragStartPx) {
        dragging = true;
        t.classList.add('lifted');
        h.onDrag(item, e.clientX, e.clientY, 'start', touch);
      }
    } else h.onDrag(item, e.clientX, e.clientY, 'move', touch);
  });
  t.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (e.pointerId !== pid) return;
    const touch = e.pointerType !== 'mouse';
    const was = dragging;
    finish();
    if (was) h.onDrag(item, e.clientX, e.clientY, 'end', touch);
    else {
      bus.emit('uiTap', { kind: 'soft' });
      h.onTap(item, t);
    }
  });
  t.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pid) return;
    const was = dragging;
    finish();
    if (was) h.onDrag(item, e.clientX, e.clientY, 'cancel', e.pointerType !== 'mouse');
  });
  t.addEventListener('click', (e) => e.preventDefault());
  return t;
}
