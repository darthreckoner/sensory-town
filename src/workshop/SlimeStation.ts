// Slime station: a glossy blob on a pastel tray. Press and drag to pull a
// gooey strand that thins as it stretches (every stretch step clicks), let go
// and it snaps back with a wobble, tap to poke, drag across it to fold it.
// Pick a color and mix in glitter / sprinkles / stars / pearls.
//
// This file is the station shell (input, UI, events, mesh). The soft-body
// maths lives in slime/slimeSim.ts, the look in slime/slimeMaterial.ts.
import * as THREE from 'three';
import { bus, v3 } from '../core/events';
import { store } from '../core/store';
import { uid } from '../core/model';
import { tuning } from '../tuning';
import { el, button, swatches, bindTap } from '../ui/ui';
import { blobShadow } from '../art/materials';
import { SlimeSim, type SlimeGrab } from './slime/slimeSim';
import { makeSlimeMaterial, type SlimeMaterial } from './slime/slimeMaterial';
import { buildTray } from './slime/tray';
import { SlimeAddins, type InstancedAddin } from './slime/addins';
import type { Station, StationContext, WPointer } from './station';

type AddinId = 'glitter' | InstancedAddin;

const ADDINS: { id: AddinId; icon: string; name: string }[] = [
  { id: 'glitter', icon: '✨', name: 'Glitter' },
  { id: 'sprinkles', icon: '🍬', name: 'Sprinkles' },
  { id: 'stars', icon: '⭐', name: 'Stars' },
  { id: 'pearls', icon: '🫧', name: 'Pearls' },
];

/** One finger's bookkeeping (the physics side lives in SlimeSim's SlimeGrab). */
interface Hold {
  slot: number;
  plane: THREE.Plane;
  t0: number;
  x0: number;
  y0: number;
  /** farthest the finger strayed from where it landed (px) */
  moved: number;
  /** finger position (local space) at the last move, and when */
  lx: number;
  ly: number;
  lz: number;
  lt: number;
  speed: number;
  clickAcc: number;
  clickGoal: number;
  /** fold tracking: where the drag started / last folded, and how far out it has been */
  refX: number;
  refZ: number;
  maxDist: number;
  foldAt: number;
}

const MIN_FINGER_Y = 0.05;

export class SlimeStation implements Station {
  readonly id = 'slime' as const;
  readonly root = new THREE.Group();
  readonly ui = document.createElement('div');
  private ctx!: StationContext;
  private sim!: SlimeSim;
  private mat!: SlimeMaterial;
  private addins!: SlimeAddins;
  private blob = new THREE.Group();
  private blobMesh!: THREE.Mesh;
  private posAttr!: THREE.BufferAttribute;
  private nrmAttr!: THREE.BufferAttribute;
  private thinAttr!: THREE.BufferAttribute;
  /** world position of the local-space origin (centre of the tray floor) */
  private origin = new THREE.Vector3();

  private holds = new Map<number, Hold>();
  private color = tuning.art.palette[0];
  private colorCur = new THREE.Color();
  private colorTarget = new THREE.Color();
  private glitterOn = false;
  private glitterCur = 0;
  private addinBtns = new Map<AddinId, HTMLElement>();

  // scratch (no per-frame allocation)
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  init(ctx: StationContext): void {
    this.ctx = ctx;
    const t = tuning.slime;
    this.root.position.set(0, ctx.tableY, t.trayZ);
    this.origin.set(0, ctx.tableY + t.trayFloor, t.trayZ);

    // fake contact shadow on the table under the tray
    const shadow = blobShadow(t.radius + t.trayMargin + 0.55, 0.28);
    shadow.position.y = 0.006;
    this.root.add(shadow);

    const tray = buildTray();
    tray.position.y = t.trayFloor;
    this.root.add(tray);

    this.sim = new SlimeSim(t);
    this.color = tuning.art.palette[0];
    this.mat = makeSlimeMaterial(this.color);
    this.colorCur.set(this.color);
    this.colorTarget.set(this.color);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.sim.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(this.sim.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    this.thinAttr = new THREE.BufferAttribute(this.sim.thin, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.nrmAttr);
    geo.setAttribute('aThin', this.thinAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(this.sim.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(this.sim.index, 1));
    this.blobMesh = new THREE.Mesh(geo, this.mat.material);
    this.blobMesh.castShadow = true;
    this.blobMesh.receiveShadow = true;
    this.blobMesh.frustumCulled = false; // the shape changes every frame
    this.blob.position.y = t.trayFloor;
    this.blob.add(this.blobMesh);

    this.addins = new SlimeAddins(this.sim);
    this.blob.add(this.addins.group);
    this.root.add(this.blob);

    this.buildUi();
    // settle the first frame so the mesh is valid before it is ever shown
    this.sim.update(1 / 60, 0);
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  private buildUi(): void {
    this.ui.className = 'passthrough';
    const left = el('div', 'panel lc col interactive', this.ui);
    left.style.gap = '10px';
    const items = el('div', 'items', left);
    items.style.gridTemplateColumns = 'repeat(1, 84px)';
    for (const a of ADDINS) {
      const b = el('button', 'item addin', items);
      el('span', 'ico', b, a.icon);
      el('span', '', b, a.name);
      bindTap(b, () => this.toggleAddin(a.id));
      this.addinBtns.set(a.id, b);
    }

    const right = el('div', 'panel rc interactive', this.ui);
    swatches(right, [...tuning.art.palette, ...tuning.slime.extraColors], this.color, (c) => this.setColor(c), '');
    right.lastElementChild?.classList.add('slime-sw');

    const br = el('div', 'br row interactive', this.ui);
    button(br, { icon: '↺', cls: 'round', tap: 'back' }, () => this.reset());
    button(br, { icon: '💾', label: 'Keep it!', cls: 'pink big' }, () => this.save());
    this.markAddins();
  }

  private markAddins(): void {
    for (const [id, b] of this.addinBtns) b.classList.toggle('on', this.isAddinOn(id));
  }

  private isAddinOn(id: AddinId): boolean {
    return id === 'glitter' ? this.glitterOn : this.addins.isOn(id);
  }

  private setColor(c: string): void {
    this.color = c;
    this.colorTarget.set(c);
    this.sim.kick(0.03, 0.8);
  }

  private toggleAddin(id: AddinId): void {
    bus.emit('uiTap', { kind: 'soft' });
    const on = !this.isAddinOn(id);
    if (id === 'glitter') this.glitterOn = on;
    else this.addins.set(id, on);
    this.markAddins();
    const above = this.blobWorld(0, 1.5, 0);
    if (on) {
      bus.emit('slimeAddin', { kind: id, pos: v3(above) });
      this.sim.kick(0, -0.9);
      this.sim.ripple(0, 0, -0.5, 0.45);
    } else {
      bus.emit('optionPicked', {});
    }
  }

  private save(): void {
    const addins: string[] = ADDINS.filter((a) => this.isAddinOn(a.id)).map((a) => a.id);
    store.addCreation({
      id: uid('c_'),
      kind: 'slime',
      createdAt: Date.now(),
      color: this.color,
      addins,
      glitter: this.glitterOn ? tuning.slime.glitterDensity : 0,
    });
    bus.emit('creationSaved', { kind: 'slime', pos: v3(this.blobWorld(0, 1.4, 0)) });
    this.sim.kick(0.05, 3.4);
    this.sim.ripple(0, 0, 0.6, 0.5);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  /** 0..1 how far a strand is pulled; 1 = out to where the rubber band starts to resist */
  private stretchAmount(g: SlimeGrab): number {
    return THREE.MathUtils.clamp(g.stretch / (tuning.slime.stretchLimit * 0.6), 0, 1);
  }

  /** local → world (the slime lives at a fixed offset, no rotation/scale) */
  private blobWorld(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x + this.origin.x, y + this.origin.y, z + this.origin.z);
  }

  private tipWorld(g: SlimeGrab): THREE.Vector3 {
    return this.blobWorld(g.tx, g.ty, g.tz);
  }

  /** Finger point on the camera-facing plane through the grab, in local space. */
  private fingerLocal(p: WPointer, h: Hold, out: THREE.Vector3): boolean {
    const hit = p.ray.intersectPlane(h.plane, this.v1);
    if (!hit) return false;
    out.copy(hit).sub(this.origin);
    if (out.y < MIN_FINGER_Y) {
      // finger slid below the tray: follow the tray surface instead of diving into it
      this.floorPlane.constant = -(this.origin.y + MIN_FINGER_Y);
      const hit2 = p.ray.intersectPlane(this.floorPlane, this.v3);
      if (hit2) out.copy(hit2).sub(this.origin);
    }
    // stay over the table
    const tz = tuning.slime.trayZ;
    out.x = THREE.MathUtils.clamp(out.x, -3.6, 3.6);
    out.z = THREE.MathUtils.clamp(out.z, -2.1 - tz, 1.95 - tz);
    return true;
  }

  // ── Station ────────────────────────────────────────────────────────────────
  enter(): void {
    this.sim.kick(-0.2, 0);
    this.markAddins();
  }

  exit(): void {
    for (const h of this.holds.values()) this.sim.release(h.slot);
    this.holds.clear();
  }

  update(dt: number, t: number): void {
    this.sim.update(dt, t);
    this.posAttr.needsUpdate = true;
    this.nrmAttr.needsUpdate = true;
    this.thinAttr.needsUpdate = true;
    this.addins.update(dt);
    this.mat.time.value = t;

    // glitter fades in/out
    const gt = this.glitterOn ? tuning.slime.glitterDensity : 0;
    if (Math.abs(gt - this.glitterCur) > 1e-3) {
      this.glitterCur += (gt - this.glitterCur) * (1 - Math.exp(-5 * dt));
      this.mat.glitter.value = this.glitterCur;
    } else if (this.glitterCur !== gt) {
      this.glitterCur = gt;
      this.mat.glitter.value = gt;
    }
    // color eases to the picked swatch
    if (!this.colorCur.equals(this.colorTarget)) {
      this.colorCur.lerp(this.colorTarget, 1 - Math.exp(-10 * dt));
      if (Math.abs(this.colorCur.r - this.colorTarget.r) + Math.abs(this.colorCur.g - this.colorTarget.g) + Math.abs(this.colorCur.b - this.colorTarget.b) < 0.004) {
        this.colorCur.copy(this.colorTarget);
      }
      this.mat.setColor(this.colorCur);
    }
  }

  pointerDown(p: WPointer): void {
    const o = p.ray.origin, d = p.ray.direction;
    const slot = this.sim.grabAt(o.x - this.origin.x, o.y - this.origin.y, o.z - this.origin.z, d.x, d.y, d.z, p.id);
    if (slot < 0) return;
    const g = this.sim.grabs[slot];
    const now = performance.now();
    const tipW = this.tipWorld(g);
    const h: Hold = {
      slot,
      plane: this.ctx.cameraPlane(tipW),
      t0: now,
      x0: p.x,
      y0: p.y,
      moved: 0,
      lx: g.tx,
      ly: g.ty,
      lz: g.tz,
      lt: now,
      speed: 0,
      clickAcc: 0,
      clickGoal: tuning.slime.clickDistance * (0.7 + Math.random() * 0.6),
      refX: g.gx,
      refZ: g.gz,
      maxDist: 0,
      foldAt: -1e9,
    };
    this.holds.set(p.id, h);
    // a quick press dimple so every touch answers at once
    this.sim.poke(g.gx, g.gz, 0.07);
    bus.emit('slimeGrab', { pos: v3(tipW) });
  }

  pointerMove(p: WPointer): void {
    const h = this.holds.get(p.id);
    if (!h) return;
    const g = this.sim.grabs[h.slot];
    const f = this.v2.set(0, 0, 0);
    if (!this.fingerLocal(p, h, f)) return;
    // fingertip → physics
    this.sim.setFinger(h.slot, f.x, f.y, f.z);
    h.moved = Math.max(h.moved, Math.hypot(p.x - h.x0, p.y - h.y0));

    // the wet clicks: one every `clickDistance` of finger travel
    const now = performance.now();
    const step = Math.hypot(f.x - h.lx, f.y - h.ly, f.z - h.lz);
    const dtS = Math.max(0.004, (now - h.lt) / 1000);
    h.speed += (step / dtS - h.speed) * 0.4;
    h.lx = f.x; h.ly = f.y; h.lz = f.z; h.lt = now;
    if (h.moved > 6) {
      h.clickAcc += step;
      let emitted = 0;
      while (h.clickAcc >= h.clickGoal && emitted < 2) {
        h.clickAcc -= h.clickGoal;
        h.clickGoal = tuning.slime.clickDistance * (0.7 + Math.random() * 0.6);
        emitted++;
        bus.emit('slimeStretch', {
          pos: v3(this.tipWorld(g)),
          amount: this.stretchAmount(g),
          speed: h.speed,
        });
      }
      if (h.clickAcc > h.clickGoal * 3) h.clickAcc = 0;
    }
    this.checkFold(h, g, now);
  }

  /** A low drag that sweeps across the blob, or goes out and doubles back, folds it. */
  private checkFold(h: Hold, g: SlimeGrab, now: number): void {
    if (now - h.foldAt < 700 || g.ty > 1.4) return;
    const R = tuning.slime.radius;
    if (Math.hypot(g.tx, g.tz) > R * 1.1) return;
    const dist = Math.hypot(g.tx - h.refX, g.tz - h.refZ);
    if (dist > h.maxDist) h.maxDist = dist;
    let fold = false;
    if (dist > R * 0.7) fold = true; // swept across
    else if (h.maxDist > 1.0 && dist < h.maxDist - 0.75) fold = true; // out and back
    if (!fold) return;
    h.foldAt = now;
    h.refX = g.tx;
    h.refZ = g.tz;
    h.maxDist = 0;
    const r = Math.hypot(g.tx, g.tz);
    const k = r > R * 0.9 ? (R * 0.9) / r : 1;
    this.sim.fold(g.tx * k, g.tz * k);
    bus.emit('slimeFold', { pos: v3(this.tipWorld(g)) });
  }

  pointerUp(p: WPointer): void {
    const h = this.holds.get(p.id);
    if (!h) return;
    this.holds.delete(p.id);
    const g = this.sim.grabs[h.slot];
    const tap = performance.now() - h.t0 < 260 && h.moved < 14 && g.peak < 0.5;
    const amount = this.stretchAmount(g);
    const tipW = this.tipWorld(g);
    this.sim.release(h.slot);
    if (tap) {
      this.sim.poke(g.gx, g.gz, tuning.slime.pokeDepth);
      bus.emit('slimePoke', { pos: v3(this.blobWorld(g.gx, g.gy, g.gz)) });
    } else if (g.stretch > 0.25) {
      bus.emit('slimeRelease', { pos: v3(tipW), amount });
    }
  }

  reset(): void {
    for (const h of this.holds.values()) this.sim.release(h.slot);
    this.holds.clear();
    this.sim.reset();
    this.addins.clear();
    this.glitterOn = false;
    this.markAddins();
    // a little pop
    this.sim.kick(-0.3, 2.2);
    bus.emit('reset', { pos: v3(this.blobWorld(0, 0.9, 0)) });
  }

  debugInfo(): Record<string, string | number> {
    let held = 0;
    for (const g of this.sim.grabs) if (g.active) held++;
    return { verts: this.sim.n, grabs: held, stretch: this.sim.maxOff.toFixed(2) };
  }
}
