// Slime station (v2, dark creator studio): a glossy blob in a black acrylic tray with an LED ring.
// Press and drag to pull a gooey strand that thins as it stretches (the clicks get denser the
// faster you pull), hold it at its limit and it tightens, quivers and SNAPS back. Tap to poke, drag
// across it to fold it (folds trap air bubbles you can pop). Pick a slime type, a color and mix in
// glitter / sprinkles / stars / pearls.
//
// This file is the station shell (input, UI, events, mesh). The soft-body maths lives in
// slime/slimeSim.ts, the look in slime/slimeMaterial.ts, the types in slime/types.ts.
import * as THREE from 'three';
import { bus, v3 } from '../core/events';
import { store } from '../core/store';
import { uid } from '../core/model';
import { isUnlocked, lockedToast, rewardFor } from '../core/unlocks';
import { tuning } from '../tuning';
import { el, button, swatches, bindTap } from '../ui/ui';
import { blobShadow } from '../art/materials';
import { SlimeSim, type SlimeGrab } from './slime/slimeSim';
import { makeSlimeMaterial, type SlimeMaterial } from './slime/slimeMaterial';
import { buildTray, type SlimeTray } from './slime/tray';
import { SlimeAddins, type InstancedAddin } from './slime/addins';
import { SlimeBubbles } from './slime/bubbles';
import { SLIME_TYPES, slimeType, type SlimeTypeDef, type SlimeTypeId } from './slime/types';
import type { Station, StationContext, WPointer } from './station';

type AddinId = 'glitter' | Exclude<InstancedAddin, 'beads'>;

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
  lastClick: number;
  /** clicks since the last big air pop */
  sinceBig: number;
  /** fold tracking: where the drag started / last folded, and how far out it has been */
  refX: number;
  refZ: number;
  maxDist: number;
  foldAt: number;
  /** the strand snapped off this finger */
  snapped: boolean;
  /** time of the last tension creak */
  creak: number;
}

const MIN_FINGER_Y = 0.05;
const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export class SlimeStation implements Station {
  readonly id = 'slime' as const;
  readonly root = new THREE.Group();
  readonly ui = document.createElement('div');
  private ctx!: StationContext;
  private sim!: SlimeSim;
  private mat!: SlimeMaterial;
  private addins!: SlimeAddins;
  private bubbles!: SlimeBubbles;
  private tray!: SlimeTray;
  private blob = new THREE.Group();
  private blobMesh!: THREE.Mesh;
  private posAttr!: THREE.BufferAttribute;
  private nrmAttr!: THREE.BufferAttribute;
  private thinAttr!: THREE.BufferAttribute;
  /** world position of the local-space origin (centre of the tray floor) */
  private origin = new THREE.Vector3();

  private holds = new Map<number, Hold>();
  private typeId: SlimeTypeId = 'glossy';
  private type: SlimeTypeDef = SLIME_TYPES[0];
  /** effective slime tuning = tuning.slime + the current type's overrides */
  private eff = { ...tuning.slime } as typeof tuning.slime;
  private color: string = tuning.slime.defaultColor;
  private colorCur = new THREE.Color();
  private colorTarget = new THREE.Color();
  private glowCol = new THREE.Color();
  private hsl = { h: 0, s: 0, l: 0 };
  private glitterOn = false;
  private glitterCur = 0;
  private addinBtns = new Map<AddinId, HTMLElement>();
  private typeBtns = new Map<SlimeTypeId, HTMLElement>();
  private land = { x: 0, z: 0, amount: 0 };

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

    // contact shadow on the desk under the tray
    const shadow = blobShadow(t.radius + t.trayMargin + 0.55, 0.5);
    shadow.position.y = 0.006;
    this.root.add(shadow);

    this.tray = buildTray();
    this.tray.root.position.y = t.trayFloor;
    this.root.add(this.tray.root);

    this.sim = new SlimeSim(t);
    this.mat = makeSlimeMaterial(this.color);
    this.mat.setLook(this.type.look);
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
    this.bubbles = new SlimeBubbles(this.sim);
    this.bubbles.onSpawn = (x, y, z, size) => bus.emit('slimeBubble', { pos: v3(this.blobWorld(x, y, z)), size });
    this.bubbles.onPop = (x, y, z, size, vertex, byTouch) => {
      bus.emit('slimeBubblePop', { pos: v3(this.blobWorld(x, y, z)), size, color: this.color });
      // a pop dimples the slime a little
      this.sim.poke(this.sim.rest[3 * vertex], this.sim.rest[3 * vertex + 2], byTouch ? 0.12 : 0.06);
    };
    this.blob.add(this.bubbles.mesh);
    this.root.add(this.blob);
    this.applyColor(this.colorCur);

    this.buildUi();
    bus.on('rewardUnlocked', () => this.refreshTypes());
    // settle the first frame so the mesh is valid before it is ever shown
    this.sim.update(1 / 60, 0);
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  private buildUi(): void {
    this.ui.className = 'passthrough';
    const dock = el('div', 'slime-dock', this.ui);

    // slime types
    const left = el('div', 'panel slime-left interactive', dock);
    for (const ty of SLIME_TYPES) {
      const b = el('button', 'item slime-type', left);
      el('span', 'ico', b, ty.icon);
      el('span', 'nm', b, ty.name);
      el('span', 'lk', b);
      bindTap(b, () => this.pickType(ty.id));
      this.typeBtns.set(ty.id, b);
    }

    const right = el('div', 'slime-right', dock);
    // mix-ins
    const adds = el('div', 'panel slime-adds interactive', right);
    for (const a of ADDINS) {
      const b = el('button', 'item slime-add', adds);
      el('span', 'ico', b, a.icon);
      el('span', 'nm', b, a.name);
      bindTap(b, () => this.toggleAddin(a.id));
      this.addinBtns.set(a.id, b);
    }
    // colors: vivid slime colors first, then the fashion palette
    const colors = el('div', 'panel slime-colors interactive', right);
    const list = [...tuning.slime.extraColors];
    for (const c of tuning.art.palette) if (!list.some((x) => x.toLowerCase() === c.toLowerCase())) list.push(c);
    swatches(colors, list, this.color, (c) => this.setColor(c), '');
    colors.lastElementChild?.classList.add('slime-sw');

    const br = el('div', 'br row interactive', this.ui);
    button(br, { icon: '↺', cls: 'round', tap: 'back' }, () => this.reset());
    button(br, { label: 'Save', cls: 'pink big' }, () => this.save());
    this.markAddins();
    this.refreshTypes();
  }

  /** Locks, selection and labels of the type tiles (charms can unlock rewards at any time). */
  private refreshTypes(): void {
    for (const ty of SLIME_TYPES) {
      const b = this.typeBtns.get(ty.id);
      if (!b) continue;
      const locked = !!ty.reward && !isUnlocked(ty.reward);
      b.classList.toggle('locked', locked);
      b.classList.toggle('on', ty.id === this.typeId);
      const lk = b.lastElementChild as HTMLElement;
      const r = ty.reward ? rewardFor(ty.reward) : undefined;
      lk.textContent = locked && r ? `🔒 💎${r.at}` : '';
    }
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

  private pickType(id: SlimeTypeId): void {
    const def = slimeType(id);
    if (def.reward && !isUnlocked(def.reward)) {
      lockedToast(def.reward);
      return;
    }
    bus.emit('uiTap', { kind: 'soft' });
    if (id !== this.typeId) {
      this.applyType(def);
      bus.emit('slimeType', { kind: id, pos: v3(this.blobWorld(0, 1.2, 0)) });
    }
    this.sim.kick(-0.22, 1.6);
    this.sim.ripple(0, 0, -0.5, 0.5);
  }

  private applyType(def: SlimeTypeDef): void {
    this.typeId = def.id;
    this.type = def;
    this.sim.setType(tuning.slime.types[def.id] ?? {});
    this.mat.setLook(def.look);
    this.addins.set('beads', !!def.beads);
    this.refreshTypes();
  }

  private toggleAddin(id: AddinId): void {
    bus.emit('uiTap', { kind: 'soft' });
    const on = !this.isAddinOn(id);
    if (id === 'glitter') this.glitterOn = on;
    else this.addins.set(id, on);
    this.markAddins();
    if (on) {
      bus.emit('slimeAddin', { kind: id, pos: v3(this.blobWorld(0, 1.5, 0)) });
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
      slimeType: this.typeId,
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
    return THREE.MathUtils.clamp(g.stretch / (this.eff.stretchLimit * this.eff.bandStart), 0, 1);
  }

  /** tuning.slime + the current type's overrides (no allocation) */
  private refreshEff(): void {
    Object.assign(this.eff, tuning.slime, tuning.slime.types[this.typeId]);
  }

  /** local → world (the slime lives at a fixed offset, no rotation/scale) */
  private blobWorld(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x + this.origin.x, y + this.origin.y, z + this.origin.z);
  }

  private tipWorld(g: SlimeGrab): THREE.Vector3 {
    return this.blobWorld(g.tx, g.ty, g.tz);
  }

  /** The slime color on the material, bubbles and tray LED (the LED never goes dark). */
  private applyColor(c: THREE.Color): void {
    this.mat.setColor(c);
    this.bubbles.setColor(c);
    this.glowCol.copy(c).getHSL(this.hsl);
    this.glowCol.setHSL(this.hsl.h, Math.max(this.hsl.s, 0.75), THREE.MathUtils.clamp(this.hsl.l, 0.45, 0.62));
    this.tray.setGlow(this.glowCol);
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
    this.refreshTypes();
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
    this.bubbles.update(dt);
    this.mat.time.value = t;
    // reflections: use the room's env (ring light, softbox, LEDs) with a per-type boost
    const sc = this.ctx.scene;
    const m = this.mat.material;
    if (m.envMap !== sc.environment) {
      m.envMap = sc.environment;
      m.needsUpdate = true;
    }
    m.envMapIntensity = this.type.look.env * sc.environmentIntensity;
    this.bubbles.setEnv(sc.environment, sc.environmentIntensity);
    this.mat.ring.value = tuning.slime.ringLight * this.type.look.ringMul;
    this.mat.led.value = tuning.slime.ledRim * this.type.look.ledMul;

    // a strand held at its limit creaks faster and higher as the tension builds…
    if (this.holds.size > 0) {
      const now = performance.now();
      for (const h of this.holds.values()) {
        if (h.snapped) continue;
        const g = this.sim.grabs[h.slot];
        if (g.tension > 0.3 && now - h.creak > 130 - 80 * g.tension) {
          h.creak = now;
          bus.emit('slimeStretch', { pos: v3(this.tipWorld(g)), amount: 0.7 + 0.3 * g.tension, speed: 0.4, kind: this.typeId, big: false });
        }
      }
    }
    // …and a strand that snaps off its finger lets go with a crack
    const sl = this.sim.takeSnap();
    if (sl >= 0) this.onSnap(sl);
    // a long strand landed: the fold traps a little air
    if (this.sim.takeLanding(this.land)) this.bubbles.spawn(this.land.x, this.land.z, this.land.amount > 0.8 ? 2 : 1);

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
      this.applyColor(this.colorCur);
    }
  }

  private onSnap(slot: number): void {
    const g = this.sim.grabs[slot];
    for (const h of this.holds.values()) if (h.slot === slot) h.snapped = true;
    bus.emit('slimeSnap', { pos: v3(this.tipWorld(g)), amount: this.stretchAmount(g), color: this.color });
    if (this.type.beads) this.crunch(g, 1);
  }

  /** Crunchy slime: beads pop under the strand's root. */
  private crunch(g: SlimeGrab, strength: number): void {
    if (!this.type.beads) return;
    this.addins.crunchAt(g.gx, g.gz, 0.45 + 0.5 * strength);
    bus.emit('slimeCrunch', { pos: v3(this.blobWorld(g.gx, g.gy, g.gz)), strength });
  }

  pointerDown(p: WPointer): void {
    const o = p.ray.origin, d = p.ray.direction;
    const ox = o.x - this.origin.x, oy = o.y - this.origin.y, oz = o.z - this.origin.z;
    // a press on an air bubble pops it (and still grabs the slime under it)
    this.bubbles.hit(ox, oy, oz, d.x, d.y, d.z);
    const slot = this.sim.grabAt(ox, oy, oz, d.x, d.y, d.z, p.id);
    if (slot < 0) return;
    this.refreshEff();
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
      clickGoal: this.eff.clickDistance * (0.7 + Math.random() * 0.6),
      lastClick: 0,
      sinceBig: 0,
      refX: g.gx,
      refZ: g.gz,
      maxDist: 0,
      foldAt: -1e9,
      snapped: false,
      creak: 0,
    };
    this.holds.set(p.id, h);
    // a quick press dimple so every touch answers at once
    this.sim.poke(g.gx, g.gz, 0.07);
    bus.emit('slimeGrab', { pos: v3(tipW), kind: this.typeId });
    this.crunch(g, 0.5);
  }

  pointerMove(p: WPointer): void {
    const h = this.holds.get(p.id);
    if (!h || h.snapped) return;
    const g = this.sim.grabs[h.slot];
    const f = this.v2.set(0, 0, 0);
    if (!this.fingerLocal(p, h, f)) return;
    this.refreshEff();
    // fingertip → physics
    this.sim.setFinger(h.slot, f.x, f.y, f.z);
    h.moved = Math.max(h.moved, Math.hypot(p.x - h.x0, p.y - h.y0));

    // sliding over an air bubble pops it
    const o = p.ray.origin, d = p.ray.direction;
    this.bubbles.hit(o.x - this.origin.x, o.y - this.origin.y, o.z - this.origin.z, d.x, d.y, d.z, 1.2);

    // the wet clicks: sparse when slow, dense crackle when fast, with the odd bigger air pop
    const now = performance.now();
    const step = Math.hypot(f.x - h.lx, f.y - h.ly, f.z - h.lz);
    const dtS = Math.max(0.004, (now - h.lt) / 1000);
    h.speed += (step / dtS - h.speed) * 0.4;
    h.lx = f.x; h.ly = f.y; h.lz = f.z; h.lt = now;
    if (h.moved > 6) {
      // a drag that isn't actually deforming the slime clicks less
      const live = 0.35 + 0.65 * Math.min(1, g.stretch / 0.4);
      h.clickAcc += step * live;
      if (h.clickAcc >= h.clickGoal && now - h.lastClick >= this.eff.clickMinMs) {
        const amount = this.stretchAmount(g);
        const rate = smooth01(h.speed / 3.5);
        h.clickAcc = 0;
        h.clickGoal = this.eff.clickDistance * (this.eff.clickSlow + (this.eff.clickFast - this.eff.clickSlow) * rate) * (0.75 + Math.random() * 0.5);
        h.lastClick = now;
        h.sinceBig++;
        let big = Math.random() < this.eff.bigPopChance * (1 + 2 * amount);
        if (!big && h.sinceBig > 12 && Math.random() < 0.25) big = true;
        if (big) h.sinceBig = 0;
        const pos = v3(this.tipWorld(g));
        bus.emit('slimeStretch', { pos, amount, speed: h.speed, kind: this.typeId, big });
        if (this.type.beads && (big || Math.random() < 0.5)) this.crunch(g, Math.min(1, 0.3 + h.speed / 4));
      }
    }
    this.checkFold(h, g, now);
  }

  /** A low drag that sweeps across the blob, or goes out and doubles back, folds it (and traps air). */
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
    const pos = v3(this.tipWorld(g));
    bus.emit('slimeFold', { pos, kind: this.typeId });
    // folding air in: a bigger pop and a few bubbles
    bus.emit('slimeStretch', { pos, amount: this.stretchAmount(g), speed: h.speed, kind: this.typeId, big: true });
    this.bubbles.spawn(g.tx * k, g.tz * k, 2 + ((Math.random() * 3) | 0));
    h.sinceBig = 0;
    this.crunch(g, 1);
  }

  pointerUp(p: WPointer): void {
    const h = this.holds.get(p.id);
    if (!h) return;
    this.holds.delete(p.id);
    const g = this.sim.grabs[h.slot];
    const tap = !h.snapped && performance.now() - h.t0 < 260 && h.moved < 14 && g.peak < 0.5;
    const amount = this.stretchAmount(g);
    const tipW = this.tipWorld(g);
    this.sim.release(h.slot);
    if (h.snapped) return;
    if (tap) {
      this.sim.poke(g.gx, g.gz, tuning.slime.pokeDepth);
      bus.emit('slimePoke', { pos: v3(this.blobWorld(g.gx, g.gy, g.gz)), kind: this.typeId });
      this.crunch(g, 0.8);
    } else if (g.stretch > 0.25) {
      bus.emit('slimeRelease', { pos: v3(tipW), amount, kind: this.typeId });
    }
  }

  reset(): void {
    for (const h of this.holds.values()) this.sim.release(h.slot);
    this.holds.clear();
    this.sim.reset();
    this.addins.clear();
    this.addins.set('beads', !!this.type.beads);
    this.bubbles.clear();
    this.glitterOn = false;
    this.markAddins();
    // a little pop
    this.sim.kick(-0.3, 2.2);
    bus.emit('reset', { pos: v3(this.blobWorld(0, 0.9, 0)) });
  }

  debugInfo(): Record<string, string | number> {
    let held = 0;
    for (const g of this.sim.grabs) if (g.active) held++;
    return { type: this.typeId, verts: this.sim.n, grabs: held, bubbles: this.bubbles.count, stretch: this.sim.maxOff.toFixed(2) };
  }
}
