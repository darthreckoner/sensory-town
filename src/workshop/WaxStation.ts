// Wax cracking station — the kids' #1 request.
//   1 Pick: shape + squishy color.
//   2 Coat: drag the squishy down into the wax pot (dip) or drag the jug over
//     it (pour). Every dip/pour adds a colored layer. Layers harden glossy → matte.
//   3 Crack: squeeze! Cracks start where the finger presses, pieces peel and
//     fall showing the layer stripes, the squishy bulges through the holes.
import * as THREE from 'three';
import { bus, v3 } from '../core/events';
import { store } from '../core/store';
import { uid, type ShapeId } from '../core/model';
import { tuning } from '../tuning';
import { tweens, ease } from '../core/tween';
import { el, button, swatches, bindTap, toast, holdButton } from '../ui/ui';
import { toyMat, mesh, roundedBox, blobShadow } from '../art/materials';
import { SquishyBody } from './squishyBody';
import { Coating, type Layer, type WaxFinish } from './wax/coating';
import { Fracture } from './wax/fracture';
import { shapeTiles } from './SquishyStation';
import { isUnlocked, rewardFor, lockedToast } from '../core/unlocks';
import type { Station, StationContext, WPointer } from './station';

type Step = 'pick' | 'coat' | 'crack';

const POT = { x: 0, z: 0.35, radius: 1.8, height: 1.75, surface: 1.55 };
const JUG_REST = new THREE.Vector3(3.15, 0, 0.35);
/** Spout tip relative to the jug base — the jug tilts around this point. */
const SPOUT = new THREE.Vector3(-0.86, 1.5, 0);
const PIVOT_REST = JUG_REST.clone().add(SPOUT);

export class WaxStation implements Station {
  readonly id = 'wax' as const;
  readonly root = new THREE.Group();
  readonly ui = document.createElement('div');
  private ctx!: StationContext;
  private step: Step = 'pick';
  private shape: ShapeId = 'bun';
  private bodyColor = '#ffffff';
  private waxColor = tuning.wax.waxColors[0];
  private finish: WaxFinish = 'classic';
  private face = false;

  private holder = new THREE.Group();
  private body!: SquishyBody;
  private coating!: Coating;
  private fracture = new Fracture();
  private mask = new Float32Array(0);
  private lockMask = new Float32Array(0);

  // props
  private plate = new THREE.Group();
  private pot = new THREE.Group();
  private potWax!: THREE.Mesh;
  private potWaxMat = new THREE.MeshPhysicalMaterial({ color: '#ff6f91', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  private stick = new THREE.Group();
  private jug = new THREE.Group();
  private jugTilt = new THREE.Group();
  private jugWaxMat = new THREE.MeshPhysicalMaterial({ color: '#ff6f91', roughness: 0.08, clearcoat: 1 });
  private stream!: THREE.Mesh;
  private streamMat = new THREE.MeshPhysicalMaterial({ color: '#ff6f91', roughness: 0.05, clearcoat: 1 });
  private ripple!: THREE.Mesh;

  // interaction state
  private dipPointer: number | null = null;
  private dipGrabY = 0;
  private dipStartHolderY = 0;
  private dipLayer: Layer | null = null;
  private jugPointer: number | null = null;
  private jugGrabOffset = new THREE.Vector3();
  private jugPos = PIVOT_REST.clone();
  private pourLayer: Layer | null = null;
  private pouring = false;
  private dripSettle: { layer: Layer; L: THREE.Vector3; t: number } | null = null;
  private lastL = new THREE.Vector3(0, 1, 0);
  private shellPointers = new Map<number, { local: THREE.Vector3; pressure: number }>();
  private squishPointers = new Set<number>();
  private cooling = false;
  private hardAnnounced = false;
  private clearedAnnounced = false;
  private hoverY = 0;
  private holderTarget = new THREE.Vector3();

  // ui
  private leftPanel!: HTMLDivElement;
  private rightPanel!: HTMLDivElement;
  private actions!: HTMLDivElement;
  private hint!: HTMLDivElement;
  private stepBtns = new Map<Step, HTMLElement>();
  private coolBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;

  init(ctx: StationContext): void {
    this.ctx = ctx;
    this.fracture.tableY = ctx.tableY;
    this.body = new SquishyBody(this.shape, this.bodyColor);
    this.body.onRecover = (p) => bus.emit('squishRecover', { pos: v3(p) });
    this.coating = new Coating(this.shape);
    this.body.root.add(this.coating.group, this.fracture.group);
    this.holder.add(this.body.root);
    this.root.add(this.holder, this.fracture.flakes);
    this.buildProps();
    this.resetMasks();
    this.buildUi();
    this.setStep('pick', true);
  }

  // ── props ──────────────────────────────────────────────────────────────
  private buildProps(): void {
    const ty = this.ctx.tableY;
    // plate (pick + crack)
    const dish = mesh(new THREE.CylinderGeometry(1.75, 1.55, 0.14, 48), new THREE.MeshPhysicalMaterial({ color: '#1d1b26', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
    dish.position.y = ty + 0.07;
    const rim = mesh(new THREE.TorusGeometry(1.72, 0.035, 10, 64), new THREE.MeshStandardMaterial({ color: '#00d4ff', emissive: '#00d4ff', emissiveIntensity: 1.6, toneMapped: false }), false, false);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = ty + 0.14;
    const sh = blobShadow(2.0, 0.25);
    sh.position.y = ty + 0.004;
    this.plate.add(sh, dish, rim);
    this.plate.position.set(POT.x, 0, POT.z);
    this.root.add(this.plate);

    // pot (coat)
    const potMat = new THREE.MeshPhysicalMaterial({ color: '#22202b', roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4 });
    const pts: THREE.Vector2[] = [];
    const R = POT.radius, H = POT.height;
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(R * 0.86, 0), new THREE.Vector2(R, 0.18), new THREE.Vector2(R * 1.02, H * 0.8), new THREE.Vector2(R * 1.06, H - 0.06), new THREE.Vector2(R * 1.08, H), new THREE.Vector2(R * 0.97, H), new THREE.Vector2(R * 0.93, H - 0.12), new THREE.Vector2(R * 0.9, 0.3), new THREE.Vector2(0, 0.3));
    const potBody = mesh(new THREE.LatheGeometry(pts, 48), potMat);
    const band = mesh(new THREE.TorusGeometry(R * 1.035, 0.06, 10, 64), new THREE.MeshStandardMaterial({ color: '#c8794a', metalness: 0.9, roughness: 0.3 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = H * 0.45;
    this.potWax = mesh(new THREE.CircleGeometry(R * 0.93, 48), this.potWaxMat, false, true);
    this.potWax.rotation.x = -Math.PI / 2;
    this.potWax.position.y = POT.surface;
    this.ripple = mesh(new THREE.RingGeometry(0.2, 0.28, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), false, false);
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.y = POT.surface + 0.01;
    // little steam swirl on the side so it reads as "warm"
    const potShadow = blobShadow(2.3, 0.3);
    potShadow.position.y = ty + 0.004;
    this.pot.add(potShadow, potBody, band, this.potWax, this.ripple);
    this.pot.position.set(POT.x, ty, POT.z);
    this.root.add(this.pot);

    // candy stick the squishy hangs from (coat step)
    const stickGeo = new THREE.CylinderGeometry(0.06, 0.06, 4.5, 12);
    const stick = mesh(stickGeo, toyMat('#16151c', 'gloss'));
    stick.position.y = 2.25;
    for (let i = 0; i < 9; i++) {
      const stripe = mesh(new THREE.TorusGeometry(0.065, 0.025, 6, 16), toyMat('#ff5d8f', 'gloss'), false, false);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = 0.4 + i * 0.45;
      this.stick.add(stripe);
    }
    this.stick.add(stick);
    this.holder.add(this.stick);

    // jug (pour)
    const jugMat = new THREE.MeshStandardMaterial({ color: '#b9bcc6', metalness: 0.85, roughness: 0.28 });
    const jp: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0.7, 0.12), new THREE.Vector2(0.72, 0.9), new THREE.Vector2(0.6, 1.3), new THREE.Vector2(0.66, 1.5), new THREE.Vector2(0.58, 1.5), new THREE.Vector2(0.52, 1.32), new THREE.Vector2(0.62, 0.9), new THREE.Vector2(0.6, 0.18), new THREE.Vector2(0, 0.18)];
    const jugBody = mesh(new THREE.LatheGeometry(jp, 36), jugMat);
    const handle = mesh(new THREE.TorusGeometry(0.36, 0.07, 10, 24, Math.PI * 1.2), jugMat);
    handle.position.set(0.72, 0.85, 0);
    handle.rotation.z = -Math.PI * 0.6;
    const spout = mesh(new THREE.ConeGeometry(0.2, 0.5, 16, 1, true), jugMat);
    spout.position.set(-0.68, 1.38, 0);
    spout.rotation.z = Math.PI / 2 + 0.5;
    const jugWax = mesh(new THREE.CircleGeometry(0.55, 32), this.jugWaxMat, false, false);
    jugWax.rotation.x = -Math.PI / 2;
    jugWax.position.y = 1.28;
    // the jug tilts around its spout tip, so the stream starts right where the finger holds it
    const inner = new THREE.Group();
    inner.add(jugBody, handle, spout, jugWax);
    inner.position.copy(SPOUT).multiplyScalar(-1);
    this.jugTilt.add(inner);
    const jugShadow = blobShadow(0.9, 0.3);
    jugShadow.position.y = 0.004;
    this.jug.add(this.jugTilt);
    this.jug.userData.shadow = jugShadow;
    this.root.add(jugShadow);
    this.jug.position.copy(PIVOT_REST);
    this.root.add(this.jug);

    // pour stream
    this.stream = mesh(new THREE.CylinderGeometry(1, 0.85, 1, 14, 1, true), this.streamMat, true, false);
    this.stream.visible = false;
    this.root.add(this.stream);
    this.setWaxColor(this.waxColor);
  }

  private setWaxColor(c: string): void {
    this.waxColor = c;
    this.potWaxMat.color.set(c);
    this.jugWaxMat.color.set(c);
    this.streamMat.color.set(c);
  }

  // ── UI ─────────────────────────────────────────────────────────────────
  private buildUi(): void {
    this.ui.className = 'passthrough';
    this.leftPanel = el('div', 'panel lc col interactive', this.ui) as HTMLDivElement;
    this.rightPanel = el('div', 'panel rc interactive', this.ui) as HTMLDivElement;
    const bar = el('div', 'tabs panel bc interactive wax-steps', this.ui);
    const steps: { id: Step; icon: string; label: string }[] = [
      { id: 'pick', icon: '🧸', label: 'Pick' },
      { id: 'coat', icon: '🫗', label: 'Coat' },
      { id: 'crack', icon: '💥', label: 'Crack' },
    ];
    for (const s of steps) {
      const b = el('button', 'tab', bar);
      el('span', 'ico', b, s.icon);
      el('span', '', b, s.label);
      bindTap(b, () => {
        bus.emit('uiTap', { kind: 'tab' });
        this.setStep(s.id);
      });
      this.stepBtns.set(s.id, b);
    }
    // three fixed slots (top / middle / bottom) so no button ever jumps under a finger between steps
    this.actions = el('div', 'br interactive wax-actions', this.ui) as HTMLDivElement;
    // destructive "start over" lives bottom-left, away from the action column, and needs a hold
    this.resetBtn = holdButton(null, { icon: '✨', label: 'New', cls: 'wax-reset', hint: 'Hold ✨ New to start over' }, () => this.newCoating());
    this.ui.appendChild(this.resetBtn);
    this.hint = el('div', 'wax-hint', this.ui) as HTMLDivElement;
    this.coolBtn = button(null, { icon: '❄️', label: 'Cool', cls: 'blue big' }, () => this.cool());
  }

  private setHint(text: string): void {
    this.hint.textContent = text;
    this.hint.style.display = text ? '' : 'none';
  }

  private renderPanels(): void {
    this.leftPanel.replaceChildren();
    this.rightPanel.replaceChildren();
    this.actions.replaceChildren();
    for (const [s, b] of this.stepBtns) b.classList.toggle('on', s === this.step);
    if (this.resetBtn) this.resetBtn.style.display = this.step === 'pick' || (this.step === 'coat' && !this.coating.layers.length) ? 'none' : '';
    if (this.step === 'pick') {
      this.leftPanel.style.display = '';
      this.rightPanel.style.display = '';
      shapeTiles(this.leftPanel, this.shape, (sh) => {
        bus.emit('uiTap', { kind: 'soft' });
        this.pickShape(sh);
      });
      const faceBtn = button(this.leftPanel, { icon: this.face ? '😊' : '😶', label: 'Face', cls: 'ghost' }, () => {
        this.face = !this.face;
        this.body.setFace(this.face);
        faceBtn.querySelector('.ico')!.textContent = this.face ? '😊' : '😶';
        faceBtn.classList.toggle('selected', this.face);
      });
      faceBtn.classList.toggle('selected', this.face);
      swatches(this.rightPanel, tuning.art.palette, this.bodyColor, (c) => {
        this.bodyColor = c;
        this.body.setColor(c);
      });
      this.fillSlots(null, null, button(null, { icon: '🫗', label: 'Coat', cls: 'primary big' }, () => this.setStep('coat')));
      this.setHint('Pick a squishy');
    } else if (this.step === 'coat') {
      this.leftPanel.style.display = '';
      this.rightPanel.style.display = '';
      el('div', 'label', this.leftPanel, 'Layers');
      const chips = el('div', 'wax-chips', this.leftPanel);
      const layers = this.coating.layers;
      for (let i = tuning.wax.maxLayers - 1; i >= 0; i--) {
        const chip = el('div', 'wax-chip', chips);
        if (layers[i]) chip.style.background = layers[i].color;
        else chip.classList.add('empty');
      }
      button(this.leftPanel, { icon: '↶', cls: 'round', tap: 'back' }, () => this.undoLayer());
      el('div', 'label', this.rightPanel, 'Wax color');
      swatches(this.rightPanel, tuning.wax.waxColors, this.waxColor, (c) => this.setWaxColor(c), 'wax-swatches');
      el('div', 'label', this.rightPanel, 'Finish').style.marginTop = '10px';
      const fins = el('div', 'items', this.rightPanel);
      fins.style.gridTemplateColumns = 'repeat(2, 56px)';
      const FINISHES: { id: WaxFinish; icon: string; name: string; reward?: string }[] = [
        { id: 'classic', icon: '🕯️', name: 'Classic' },
        { id: 'glitter', icon: '✨', name: 'Glitter', reward: 'wax.glitter' },
        { id: 'chrome', icon: '🪞', name: 'Chrome', reward: 'wax.chrome' },
        { id: 'glow', icon: '🟢', name: 'Glow', reward: 'wax.glow' },
      ];
      for (const f of FINISHES) {
        const b = el('button', 'item', fins);
        b.style.width = b.style.height = '56px';
        el('span', 'ico', b, f.icon).style.fontSize = '24px';
        const locked = f.reward && !isUnlocked(f.reward);
        if (locked) {
          b.classList.add('locked');
          el('span', 'lock-badge', b, `🔒${rewardFor(f.reward!)?.at}`);
        }
        if (f.id === this.finish) b.classList.add('on');
        bindTap(b, () => {
          if (f.reward && !isUnlocked(f.reward)) return lockedToast(f.reward);
          bus.emit('uiTap', { kind: 'soft' });
          this.finish = f.id;
          fins.querySelectorAll('.item').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        });
      }
      this.fillSlots(null, this.coolBtn, button(null, { icon: '💥', label: 'Crack', cls: 'primary big' }, () => this.setStep('crack')));
      this.updateCoolBtn();
      this.setHint(layers.length ? 'Add another layer — dip or pour' : 'Drag it down into the wax ⬇️  or tilt the jug 🫗');
    } else {
      this.leftPanel.style.display = 'none';
      this.rightPanel.style.display = 'none';
      this.fillSlots(
        button(null, { icon: '🔁', label: 'Again', cls: 'big' }, () => this.crackAgain()),
        this.coolBtn,
        button(null, { icon: '💾', label: 'Save', cls: 'primary big' }, () => this.save()),
      );
      this.updateCoolBtn();
      this.setHint(this.coating.allHard ? 'Squeeze to crack 👆' : 'Letting it set… or hit Cool ❄️');
    }
  }

  /** Fill the three fixed action slots: [top, middle (Cool's home), bottom (primary)]. */
  private fillSlots(top: HTMLElement | null, mid: HTMLElement | null, bottom: HTMLElement | null): void {
    for (const b of [top, mid, bottom]) {
      if (b) this.actions.appendChild(b);
      else el('div', 'btn big slot-empty', this.actions);
    }
  }

  private updateCoolBtn(): void {
    const soft = this.coating.layers.length > 0 && !this.coating.allHard;
    this.coolBtn.style.display = '';
    this.coolBtn.style.visibility = soft ? 'visible' : 'hidden';
  }

  // ── steps ──────────────────────────────────────────────────────────────
  private setStep(step: Step, instant = false): void {
    if (step === 'crack' && this.coating.layers.length === 0) {
      toast('Coat it first 🫗');
      bus.emit('placementBlocked', {});
      step = 'coat';
    }
    if (step !== 'crack' && this.step === 'crack' && this.fracture.pieces.length) {
      // leaving crack → keep layers but rebuild the shell next time
      this.fracture.clear();
      this.coating.group.visible = true;
      this.body.reset();
      this.resetMasks();
    }
    this.step = step;
    this.endDip();
    this.endPour();
    this.shellPointers.clear();
    const showPot = step === 'coat';
    this.animateProp(this.pot, showPot, instant);
    this.animateProp(this.jug, showPot, instant);
    (this.jug.userData.shadow as THREE.Object3D).visible = showPot;
    this.animateProp(this.plate, !showPot, instant);
    this.stick.visible = showPot;
    const ty = this.ctx.tableY;
    if (showPot) {
      this.hoverY = ty + POT.height + 0.45 + this.body.restHeight();
      this.holderTarget.set(POT.x, this.hoverY, POT.z);
    } else {
      this.holderTarget.set(POT.x, ty + 0.14 + this.body.restHeight(), POT.z);
    }
    if (instant) this.holder.position.copy(this.holderTarget);
    else if (showPot) {
      // drop in from above so it never passes through the pot
      const to = this.holderTarget.clone();
      const from = to.clone().add(new THREE.Vector3(0, 2.5, 0));
      this.holder.position.copy(from);
      tweens.add(0.6, (k) => this.holder.position.lerpVectors(from, to, k), { ease: ease.outBack, key: this.holder });
    } else {
      const from = this.holder.position.clone();
      const to = this.holderTarget.clone();
      tweens.add(0.55, (k) => this.holder.position.lerpVectors(from, to, k), { ease: ease.inOutCubic, key: this.holder });
    }
    if (step === 'crack') {
      this.hardAnnounced = this.coating.allHard;
      this.clearedAnnounced = false;
      if (this.coating.allHard) this.buildShell();
    }
    this.renderPanels();
  }

  private animateProp(obj: THREE.Object3D, show: boolean, instant: boolean): void {
    if (instant) {
      obj.visible = show;
      obj.scale.setScalar(show ? 1 : 0.001);
      return;
    }
    if (show) obj.visible = true;
    const from = obj.scale.x;
    const to = show ? 1 : 0.001;
    tweens.add(0.35, (k) => obj.scale.setScalar(from + (to - from) * k), { ease: show ? ease.outBack : ease.inOutCubic, key: obj, done: () => (obj.visible = show) });
  }

  private pickShape(s: ShapeId): void {
    if (s === this.shape) return;
    this.shape = s;
    this.body.setShape(s);
    this.body.setColor(this.bodyColor);
    this.body.setFace(this.face);
    this.body.root.add(this.coating.group, this.fracture.group);
    this.coating.setShape(s);
    this.fracture.clear();
    this.resetMasks();
    this.setStep(this.step, false);
    bus.emit('optionPicked', { pos: v3(this.holder.position) });
  }

  private resetMasks(): void {
    const n = this.body.vertexCount;
    this.mask = new Float32Array(n).fill(1);
    this.lockMask = new Float32Array(n);
    this.body.bulgeMask = this.mask;
    this.body.lockMask = null;
  }

  private buildShell(): void {
    this.fracture.build(this.coating);
    this.coating.group.visible = false;
    this.fracture.group.visible = true;
    this.clearedAnnounced = false;
    this.refreshMasks();
  }

  private refreshMasks(): void {
    if (this.mask.length !== this.body.vertexCount) this.resetMasks();
    this.fracture.exposedMask(this.mask);
    for (let i = 0; i < this.mask.length; i++) this.lockMask[i] = 1 - this.mask[i];
    this.body.bulgeMask = this.mask;
    this.body.lockMask = this.fracture.pieces.length ? this.lockMask : null;
  }

  private cool(): void {
    if (!this.coating.layers.length || this.coating.allHard) return;
    this.cooling = true;
    this.coating.layers.forEach((l) => (l.final = true));
    bus.emit('waxCool', { pos: v3(this.holder.position) });
  }

  private undoLayer(): void {
    if (!this.coating.layers.length) return;
    this.endDip();
    this.endPour();
    this.coating.popLayer();
    bus.emit('undo', {});
    this.renderPanels();
  }

  private crackAgain(): void {
    if (!this.coating.layers.length) return;
    for (const l of this.coating.layers) l.hard = 1;
    this.body.reset();
    this.buildShell();
    bus.emit('reset', { pos: v3(this.holder.position) });
    this.setHint('Squeeze to crack 👆');
  }

  private newCoating(): void {
    this.fracture.clear();
    this.coating.clear();
    this.body.reset();
    this.resetMasks();
    this.coating.group.visible = true;
    bus.emit('reset', { pos: v3(this.holder.position) });
    this.setStep('coat');
  }

  private save(): void {
    if (!this.coating.layers.length) {
      toast('Coat it first 🫗');
      return;
    }
    store.addCreation({ id: uid('c_'), kind: 'wax', createdAt: Date.now(), color: this.bodyColor, shape: this.shape, face: this.face, finish: this.coating.layers[this.coating.layers.length - 1]?.finish ?? 'classic', layers: this.coating.layers.map((l) => l.color) });
    bus.emit('creationSaved', { kind: 'wax', pos: v3(this.holder.position.clone().add(new THREE.Vector3(0, 1.2, 0))) });
  }

  // ── station API ──────────────────────────────────────────────────────────
  enter(): void {
    this.renderPanels();
  }

  exit(): void {
    this.endDip();
    this.endPour();
    this.shellPointers.clear();
    for (const id of this.squishPointers) this.body.release(id);
    this.squishPointers.clear();
  }

  view(): { lookY: number; dist: number } {
    if (this.step === 'coat') return { lookY: 2.45, dist: 9.9 };
    if (this.step === 'crack') return { lookY: 0.85, dist: 5.6 };
    return { lookY: 0.75, dist: 6.4 };
  }

  reset(): void {
    if (this.step === 'crack' && this.coating.layers.length) this.crackAgain();
    else this.newCoating();
  }

  pointerDown(p: WPointer): void {
    if (this.step === 'coat') {
      // jug first (it can be in front of the squishy)
      const jh = this.ctx.raycast(p, [this.jug], true);
      if (jh.length) {
        this.jugPointer = p.id;
        const plane = this.ctx.cameraPlane(this.jugPos);
        const hit = this.ctx.rayToPlane(p, plane);
        this.jugGrabOffset.copy(this.jugPos).sub(hit ?? this.jugPos);
        bus.emit('uiTap', { kind: 'soft' });
        return;
      }
      const h = this.body.hit(p.ray);
      if (h && this.dipPointer === null) {
        if (this.coating.layers.length >= tuning.wax.maxLayers) {
          toast('Max layers — time to crack 💥');
          bus.emit('placementBlocked', {});
          return;
        }
        this.dipPointer = p.id;
        this.dipGrabY = this.planeY(p);
        this.dipStartHolderY = this.holder.position.y;
        tweens.cancel(this.holder);
        bus.emit('uiTap', { kind: 'soft' });
      }
      return;
    }
    if (this.step === 'crack') {
      const pieces = this.fracture.attachedMeshes();
      const hits = pieces.length ? this.ctx.raycast(p, pieces, false) : [];
      if (hits.length) {
        if (!this.coating.allHard) {
          this.setHint('Still soft — hit Cool ❄️');
          bus.emit('placementBlocked', {});
          return;
        }
        const local = this.body.root.worldToLocal(hits[0].point.clone());
        this.shellPointers.set(p.id, { local, pressure: p.pressure });
        return;
      }
      const h = this.body.hit(p.ray);
      if (h) {
        if (!this.fracture.pieces.length && !this.coating.allHard) {
          this.setHint('Still soft — hit Cool ❄️');
          return;
        }
        this.pressSquishy(p, h);
      }
      return;
    }
    // pick step: squish it for fun
    const h = this.body.hit(p.ray);
    if (h) this.pressSquishy(p, h);
  }

  private pressSquishy(p: WPointer, h: { local: THREE.Vector3; normal: THREE.Vector3; world: THREE.Vector3 }): void {
    const inward = p.ray.direction.clone().multiplyScalar(0.5).sub(h.normal.clone().multiplyScalar(0.5)).normalize();
    this.body.press(p.id, h.local, inward, p.pressure);
    this.squishPointers.add(p.id);
    bus.emit('squishPress', { pos: v3(h.world), strength: p.pressure });
  }

  pointerMove(p: WPointer): void {
    if (this.jugPointer === p.id) {
      const plane = this.ctx.cameraPlane(this.jugPos);
      const hit = this.ctx.rayToPlane(p, plane);
      if (hit) {
        hit.add(this.jugGrabOffset);
        this.jugPos.set(THREE.MathUtils.clamp(hit.x, -1.2, PIVOT_REST.x + 0.4), THREE.MathUtils.clamp(hit.y, PIVOT_REST.y, 5.0), PIVOT_REST.z);
      }
      return;
    }
    if (this.dipPointer === p.id) {
      const dy = this.planeY(p) - this.dipGrabY;
      const top = this.topLocal() * this.body.scale;
      const minY = this.ctx.tableY + POT.surface - top - 0.08;
      this.holder.position.y = THREE.MathUtils.clamp(this.dipStartHolderY + dy, minY, this.hoverY + 0.6);
      return;
    }
    const sp = this.shellPointers.get(p.id);
    if (sp) {
      const pieces = this.fracture.attachedMeshes();
      const hits = pieces.length ? this.ctx.raycast(p, pieces, false) : [];
      if (hits.length) sp.local.copy(this.body.root.worldToLocal(hits[0].point.clone()));
      else {
        // slid onto exposed squishy → becomes a squish
        this.shellPointers.delete(p.id);
        const h = this.body.hit(p.ray);
        if (h) this.pressSquishy(p, h);
      }
      return;
    }
    if (this.squishPointers.has(p.id)) {
      const h = this.body.hit(p.ray);
      if (!h) {
        this.pointerUp(p);
        return;
      }
      const inward = p.ray.direction.clone().multiplyScalar(0.5).sub(h.normal.clone().multiplyScalar(0.5)).normalize();
      this.body.press(p.id, h.local, inward, p.pressure);
    }
  }

  pointerUp(p: WPointer): void {
    if (this.jugPointer === p.id) {
      this.jugPointer = null;
      return;
    }
    if (this.dipPointer === p.id) {
      this.dipPointer = null;
      const from = this.holder.position.y;
      tweens.add(0.5, (k) => (this.holder.position.y = from + (this.hoverY - from) * k), { ease: ease.outBack, key: this.holder });
      return;
    }
    if (this.shellPointers.delete(p.id)) return;
    if (this.squishPointers.delete(p.id)) {
      const depth = this.body.release(p.id);
      bus.emit('squishRelease', { pos: v3(this.holder.position), depth });
    }
  }

  private planeY(p: WPointer): number {
    const plane = this.ctx.cameraPlane(this.holder.position);
    return this.ctx.rayToPlane(p, plane)?.y ?? 0;
  }

  /** Highest point of the shape, unit space. */
  private topLocal(): number {
    let m = 0;
    const r = this.coating.rest;
    for (let i = 1; i < r.length; i += 3) if (r[i] > m) m = r[i];
    return m + this.coating.gap + this.coating.thick * this.coating.layers.length;
  }
  private bottomLocal(): number {
    let m = 0;
    const r = this.coating.rest;
    for (let i = 1; i < r.length; i += 3) if (r[i] < m) m = r[i];
    return m;
  }

  // ── per-frame ──────────────────────────────────────────────────────────
  update(dt: number, t: number): void {
    if (this.step === 'coat') this.updateCoat(dt, t);
    if (this.step === 'crack') this.updateCrack(dt);
    // hardening runs in every step
    const wasHard = this.coating.allHard;
    const allHard = this.coating.update(dt, this.cooling);
    if (allHard) this.cooling = false;
    if (allHard && !wasHard) {
      bus.emit('waxHardened', { pos: v3(this.holder.position) });
      this.updateCoolBtn();
      if (this.step === 'crack') {
        this.buildShell();
        this.setHint('Squeeze to crack 👆');
      }
    }
    if (this.cooling && Math.random() < dt * 12) bus.emit('waxCool', { pos: v3(this.holder.position) });
    this.fracture.update(dt);
    if (this.fracture.dirty && this.fracture.pieces.length) this.refreshMasks();
    this.body.update(dt);
  }

  private updateCoat(dt: number, t: number): void {
    // ── dip ──
    const unit = this.body.scale;
    const surfaceY = this.ctx.tableY + POT.surface;
    const yLocal = (surfaceY - this.holder.position.y) / unit; // wax line in body space
    // only the player's dip counts (not the holder gliding in from another step)
    const dipping = this.dipPointer !== null || this.dipLayer !== null;
    const inWax = dipping && yLocal > this.bottomLocal() + 0.02;
    if (inWax) {
      if (!this.dipLayer) {
        if (this.coating.layers.length < tuning.wax.maxLayers) {
          this.dipLayer = this.coating.beginLayer(this.waxColor, 'dip', this.finish);
          this.cooling = false;
          bus.emit('waxDip', { pos: { x: POT.x, y: surfaceY, z: POT.z }, color: this.waxColor });
          this.splash();
        }
      }
      if (this.dipLayer) this.coating.dipTo(this.dipLayer, yLocal);
    } else if (this.dipLayer) {
      this.finishLayer(this.dipLayer);
      this.dipLayer = null;
      bus.emit('waxLift', { pos: v3(this.holder.position) });
      this.splash();
    }
    // gentle sway while hanging
    if (this.dipPointer === null) this.holder.rotation.y = Math.sin(t * 0.7) * 0.15;

    // ── jug ──
    if (this.jugPointer === null) this.jugPos.lerp(PIVOT_REST, 1 - Math.exp(-8 * dt));
    this.jug.position.copy(this.jugPos);
    const sh = this.jug.userData.shadow as THREE.Object3D;
    sh.position.set(this.jugPos.x - SPOUT.x, this.ctx.tableY + 0.004, this.jugPos.z);
    // tilts as you carry it up and over toward the squishy
    const tiltK = this.jugPointer === null ? 0 : (1 - THREE.MathUtils.smoothstep(this.jugPos.x, 0.7, 2.2)) * THREE.MathUtils.smoothstep(this.jugPos.y, PIVOT_REST.y + 0.5, PIVOT_REST.y + 1.8);
    const targetTilt = tiltK * 1.95;
    this.jugTilt.rotation.z += (targetTilt - this.jugTilt.rotation.z) * (1 - Math.exp(-10 * dt));
    const tilt = this.jugTilt.rotation.z;
    const flow = THREE.MathUtils.smoothstep(tilt, 0.95, 1.55);
    this.updateStream(flow, dt, t);

    // drips keep running for a moment after pouring stops
    if (this.dripSettle) {
      const d = this.dripSettle;
      d.t += dt;
      d.layer.drip = Math.min(1, d.t / 0.9);
      this.coating.pourAt(d.layer, d.L, d.layer.amount);
      if (d.t >= 0.9) this.dripSettle = null;
    }
    // ripple on the pot surface
    const rm = this.ripple.material as THREE.MeshBasicMaterial;
    if (rm.opacity > 0) {
      rm.opacity = Math.max(0, rm.opacity - dt * 1.2);
      this.ripple.scale.multiplyScalar(1 + dt * 2.2);
    }
  }

  private updateStream(flow: number, dt: number, t: number): void {
    if (flow <= 0.02) {
      this.stream.visible = false;
      this.endPour();
      return;
    }
    // spout tip in world space
    this.jug.updateMatrixWorld();
    const tip = this.jugTilt.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-0.05, -0.05, 0));
    // where does it land? body → pot → table
    const down = new THREE.Ray(tip.clone(), new THREE.Vector3(0, -1, 0));
    const bh = this.body.hit(down);
    let land: THREE.Vector3;
    let onBody = false;
    if (bh && bh.world.y < tip.y) {
      land = bh.world;
      onBody = true;
    } else if (Math.hypot(tip.x - POT.x, tip.z - POT.z) < POT.radius * 0.93) {
      land = new THREE.Vector3(tip.x, this.ctx.tableY + POT.surface, tip.z);
    } else {
      land = new THREE.Vector3(tip.x, this.ctx.tableY + 0.02, tip.z);
    }
    const len = Math.max(0.05, tip.y - land.y);
    const r = 0.035 + 0.06 * flow;
    this.stream.visible = true;
    this.stream.position.set(tip.x + Math.sin(t * 13) * 0.01, (tip.y + land.y) / 2, tip.z);
    this.stream.scale.set(r, len, r);
    if (!this.pouring) {
      this.pouring = true;
      bus.emit('waxPourStart', { pos: v3(land) });
    }
    bus.emit('waxPourFlow', { rate: flow, pos: v3(land) });
    if (onBody && bh) {
      if (!this.pourLayer) {
        if (this.coating.layers.length >= tuning.wax.maxLayers) return;
        this.pourLayer = this.coating.beginLayer(this.waxColor, 'pour', this.finish);
        this.cooling = false;
        this.dripSettle = null;
      }
      const L = bh.local.clone().normalize();
      this.lastL.copy(L);
      this.pourLayer.amount = Math.min(Math.PI * 1.15, this.pourLayer.amount + tuning.wax.pourRate * dt * flow);
      this.coating.pourAt(this.pourLayer, L, this.pourLayer.amount);
    }
  }

  private endPour(): void {
    if (this.pouring) {
      this.pouring = false;
      bus.emit('waxPourStop', {});
    }
    if (this.pourLayer) {
      const l = this.pourLayer;
      this.pourLayer = null;
      this.dripSettle = { layer: l, L: this.lastL.clone(), t: 0 };
      this.finishLayer(l);
    }
    if (this.stream) this.stream.visible = false;
  }

  private endDip(): void {
    if (this.dipLayer) {
      this.finishLayer(this.dipLayer);
      this.dipLayer = null;
    }
    this.dipPointer = null;
    this.jugPointer = null;
  }

  private finishLayer(l: Layer): void {
    if (l.final) return;
    l.final = true;
    bus.emit('waxHardenStart', {});
    bus.emit('waxLayerAdded', { layers: this.coating.layers.length, color: l.color, pos: v3(this.holder.position.clone().add(new THREE.Vector3(0, 1.1, 0))) });
    if (this.step === 'coat') this.renderPanels();
  }

  private splash(): void {
    const rm = this.ripple.material as THREE.MeshBasicMaterial;
    rm.opacity = 0.8;
    this.ripple.scale.setScalar(1);
  }

  private updateCrack(dt: number): void {
    // squeeze level follows active presses
    const pressing = this.shellPointers.size + this.squishPointers.size;
    const target = pressing ? Math.min(1, 0.45 + 0.25 * pressing) : 0;
    this.body.squeeze += (target - this.body.squeeze) * (1 - Math.exp(-(target > this.body.squeeze ? 10 : 3) * dt));
    if (this.body.squeeze < 0.002) this.body.squeeze = 0;
    if (!this.fracture.pieces.length) return;
    const toWorld = (v: THREE.Vector3) => this.body.root.localToWorld(v);
    this.body.root.updateMatrixWorld();
    for (const sp of this.shellPointers.values()) this.fracture.press(sp.local, dt, sp.pressure, toWorld);
    // almost bare? let the rest fall away
    const total = this.fracture.pieces.length;
    if (!this.clearedAnnounced && total && this.fracture.detachedCount / total > 0.82) {
      this.clearedAnnounced = true;
      this.fracture.dropAll(toWorld);
      setTimeout(() => bus.emit('shellCleared', { pos: v3(this.holder.position.clone().add(new THREE.Vector3(0, 1, 0))) }), 450);
      this.setHint('Clean crack! 🔥  Again or New');
    }
  }

  debugInfo(): Record<string, string | number> {
    return {
      step: this.step,
      layers: this.coating.layers.length,
      hard: this.coating.layers.map((l) => l.hard.toFixed(2)).join(','),
      pieces: `${this.fracture.attachedCount}/${this.fracture.pieces.length}`,
    };
  }
}
