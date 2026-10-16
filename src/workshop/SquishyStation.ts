// Squishy station: pick a shape + color, then squish it. Dents track the
// finger exactly (multi-touch), release and it slowly rises back.
import * as THREE from 'three';
import { bus, v3 } from '../core/events';
import { store } from '../core/store';
import { uid, SHAPES, type ShapeId } from '../core/model';
import { tuning } from '../tuning';
import { tweens, ease } from '../core/tween';
import { el, button, swatches, bindTap } from '../ui/ui';
import { blobShadow } from '../art/materials';
import { SquishyBody } from './squishyBody';
import type { Station, StationContext, WPointer } from './station';

export const SHAPE_ICONS: Record<ShapeId, { icon: string; name: string }> = {
  bun: { icon: '🍞', name: 'Bun' },
  cat: { icon: '🐱', name: 'Cat' },
  star: { icon: '⭐', name: 'Star' },
  peach: { icon: '🍑', name: 'Peach' },
  cube: { icon: '🧊', name: 'Cube' },
};

export class SquishyStation implements Station {
  readonly id = 'squishy' as const;
  readonly root = new THREE.Group();
  readonly ui = document.createElement('div');
  private ctx!: StationContext;
  private body!: SquishyBody;
  private holder = new THREE.Group();
  private shape: ShapeId = 'bun';
  private color = '#ff8fb1';
  private last = new Map<number, { x: number; y: number; t: number }>();
  private shapeBtns = new Map<ShapeId, HTMLElement>();

  init(ctx: StationContext): void {
    this.ctx = ctx;
    this.body = new SquishyBody(this.shape, this.color);
    this.body.onRecover = (p) => bus.emit('squishRecover', { pos: v3(p) });
    this.holder.add(this.body.root);
    const shadow = blobShadow(1.6, 0.3);
    shadow.position.y = ctx.tableY + 0.005;
    this.root.add(shadow, this.holder);
    this.placeBody();
    this.buildUi();
  }

  private placeBody(): void {
    this.holder.position.set(0, this.ctx.tableY + this.body.restHeight(), 0.2);
  }

  private buildUi(): void {
    this.ui.className = 'passthrough';
    const left = el('div', 'panel lc col interactive', this.ui);
    left.style.gap = '10px';
    const items = el('div', 'items', left);
    items.style.gridTemplateColumns = 'repeat(1, 84px)';
    for (const s of SHAPES) {
      const b = el('button', 'item', items);
      el('span', 'ico', b, SHAPE_ICONS[s].icon);
      el('span', '', b, SHAPE_ICONS[s].name);
      bindTap(b, () => this.pickShape(s));
      this.shapeBtns.set(s, b);
    }
    const right = el('div', 'panel rc interactive', this.ui);
    swatches(right, tuning.art.palette, this.color, (c) => {
      this.color = c;
      this.body.setColor(c);
    }, '');
    const br = el('div', 'br row interactive', this.ui);
    button(br, { icon: '↺', cls: 'round', tap: 'back' }, () => this.reset());
    button(br, { icon: '💾', label: 'Keep it!', cls: 'pink big' }, () => this.save());
    this.markShape();
  }

  private markShape(): void {
    for (const [s, b] of this.shapeBtns) b.classList.toggle('on', s === this.shape);
  }

  private pickShape(s: ShapeId): void {
    bus.emit('uiTap', { kind: 'soft' });
    this.shape = s;
    this.body.setShape(s);
    this.body.setColor(this.color);
    this.placeBody();
    this.markShape();
    this.popIn();
    bus.emit('optionPicked', { pos: v3(this.holder.position) });
  }

  private popIn(): void {
    const r = this.body.root;
    tweens.add(0.45, (k) => r.scale.setScalar(this.body.scale * (0.6 + 0.4 * k)), { ease: ease.outElastic, key: r });
  }

  private save(): void {
    store.addCreation({ id: uid('c_'), kind: 'squishy', createdAt: Date.now(), color: this.color, shape: this.shape });
    bus.emit('creationSaved', { kind: 'squishy', pos: v3(this.holder.position.clone().add(new THREE.Vector3(0, 1.2, 0))) });
  }

  enter(): void {
    this.popIn();
  }

  exit(): void {
    for (const id of [...this.last.keys()]) this.body.release(id);
    this.last.clear();
  }

  private idleT = 0;

  update(dt: number, _t: number): void {
    // pressing squashes the whole squishy a little (soft body), easing back slowly
    const target = Math.min(0.6, this.last.size * tuning.squishy.squashPerFinger);
    const k = 1 - Math.exp(-(target > this.body.squeeze ? 6 : tuning.squishy.recoverySpeed * 1.5) * dt);
    this.body.squeeze += (target - this.body.squeeze) * k;
    if (this.body.squeeze < 0.001) this.body.squeeze = 0;
    this.body.update(dt);
    // tiny idle sway so it feels alive (pauses while touched)
    if (!this.body.pressing) {
      this.idleT += dt;
      this.holder.rotation.y = Math.sin(this.idleT * 0.6) * 0.12;
    }
  }

  pointerDown(p: WPointer): void {
    const h = this.body.hit(p.ray);
    if (!h) return;
    const inward = p.ray.direction.clone().multiplyScalar(0.5).sub(h.normal.clone().multiplyScalar(0.5)).normalize();
    this.holder.updateMatrixWorld();
    const localDir = inward.applyQuaternion(this.holder.quaternion.clone().invert());
    this.body.press(p.id, h.local, localDir, p.pressure);
    this.last.set(p.id, { x: p.x, y: p.y, t: performance.now() });
    bus.emit('squishPress', { pos: v3(h.world), strength: p.pressure });
  }

  pointerMove(p: WPointer): void {
    const prev = this.last.get(p.id);
    if (!prev) return;
    const h = this.body.hit(p.ray);
    if (!h) {
      this.pointerUp(p);
      return;
    }
    const inward = p.ray.direction.clone().multiplyScalar(0.5).sub(h.normal.clone().multiplyScalar(0.5)).normalize();
    const localDir = inward.applyQuaternion(this.holder.quaternion.clone().invert());
    this.body.press(p.id, h.local, localDir, p.pressure);
    const now = performance.now();
    const speed = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(1, now - prev.t) * 16 / 10;
    this.last.set(p.id, { x: p.x, y: p.y, t: now });
    bus.emit('squishDrag', { pos: v3(h.world), speed });
  }

  pointerUp(p: WPointer): void {
    if (!this.last.has(p.id)) return;
    this.last.delete(p.id);
    const depth = this.body.release(p.id);
    bus.emit('squishRelease', { pos: v3(this.holder.position), depth });
  }

  reset(): void {
    this.body.reset();
    this.popIn();
    bus.emit('reset', { pos: v3(this.holder.position) });
  }

  debugInfo(): Record<string, string | number> {
    return { shape: this.shape, dent: this.body.maxDisplacement.toFixed(3), verts: this.body.vertexCount };
  }
}
