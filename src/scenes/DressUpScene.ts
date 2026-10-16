// "Style" — a dark photo-studio / runway. A glossy black stage with a light ring,
// two colored spotlights, LED edge glow, a big mirror, a creator ring light on a
// tripod and a neon sign with the player's name. Pick hair / top / bottom / shoes /
// extras / skin on the left, options + colors on the right, spin the character with a
// drag, pinch or wheel to zoom. Every change pops with sparkles + a pose and autosaves.
// Extras: Random look, Undo, 4 saved Looks, and a Pose button that ends in a camera flash.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus, v3, type OutfitSlot } from '../core/events';
import { tuning } from '../tuning';
import { Character, MIN_ACCENT_GAP, OUTFIT_CATALOG, POSE_ORDER, colorGap, contrastColor, type CatalogSlot } from '../art/character';
import { studioLights } from '../art/env';
import { toyMat, mesh, roundedBox } from '../art/materials';
import { isUnlocked, lockedToast, rewardFor } from '../core/unlocks';
import { el, button, bindTap, swatches, tabs, toast } from '../ui/ui';
import type { Outfit } from '../core/model';

type Category = CatalogSlot | 'skin' | 'looks';

const CATEGORIES: { id: Category; icon: string; label: string }[] = [
  { id: 'hair', icon: '💇', label: 'Hair' },
  { id: 'top', icon: '👕', label: 'Top' },
  { id: 'bottom', icon: '👖', label: 'Bottom' },
  { id: 'shoes', icon: '👟', label: 'Shoes' },
  { id: 'accessory', icon: '🕶️', label: 'Extras' },
  { id: 'skin', icon: '🙂', label: 'Skin' },
  { id: 'looks', icon: '💾', label: 'Looks' },
];
const SLOTS: CatalogSlot[] = ['hair', 'top', 'bottom', 'shoes', 'accessory'];

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export class DressUpScene extends GameScene {
  readonly name = 'dressup' as const;

  private char: Character | null = null;
  private stage = new THREE.Group();
  private mirror = new THREE.Group(); // reflection of the character in the glossy floor
  private ray = new THREE.Raycaster();
  private ledMats: THREE.MeshBasicMaterial[] = [];
  private recDot!: THREE.MeshBasicMaterial;
  private neonCanvas!: HTMLCanvasElement;
  private neonTex!: THREE.CanvasTexture;

  // view state
  private rot = 0;
  private spinVel = 0;
  private dist = tuning.dressup.zoomDefault;
  private targetDist = tuning.dressup.zoomDefault;
  private lookY = tuning.dressup.lookYWide;
  private focusLook: number | null = null; // category focus height (null = follow the zoom)
  private idle = 0;
  private spinSoundT = 0;
  private viewShift = 0;

  // pointer state
  private pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private pinchDist = 0;
  private downT = 0;
  private moved = 0;
  private lastMoveT = 0;

  // ui state
  private cat: Category = 'hair';
  private panel!: HTMLDivElement;
  private setSwatch: ((c: string) => void) | null = null; // highlights a color in the current swatch row
  private tabSet: ((id: string) => void) | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private flashEl: HTMLDivElement | null = null;
  private vfEl: HTMLDivElement | null = null;
  private history: Outfit[] = [];
  private timers: number[] = [];
  private poseIdx = 0;
  private poseLock = 0;
  private lookSel = 0;
  private nextOverwrite = 0;

  // ── Stage ────────────────────────────────────────────────────────────────
  init(): void {
    this.fxScale = 1.2;
    this.camera.fov = tuning.dressup.fov;
    this.camera.near = 0.1;
    this.camera.far = 80;
    this.buildStudio();
    this.scene.add(this.stage);
  }

  private led(color: string, hdr = 1.8): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    m.color.multiplyScalar(hdr);
    return m;
  }

  private buildStudio(): void {
    const S = this.scene;
    const st = this.stage;
    studioLights(S, { shadowSize: 3.4 });
    // soft front fill so faces always read, plus two colored spotlights on the stage
    const fill = new THREE.DirectionalLight('#dfe6ff', 0.9);
    fill.position.set(-2, 2.6, 8);
    S.add(fill);
    const spotL = new THREE.SpotLight('#ffd6ec', 70, 16, 0.55, 0.85);
    spotL.position.set(-3.4, 5.6, 3.4);
    spotL.target.position.set(0, 1.0, 0);
    const spotR = new THREE.SpotLight('#cdeeff', 70, 16, 0.55, 0.85);
    spotR.position.set(3.4, 5.6, 3.4);
    spotR.target.position.set(0, 1.0, 0);
    S.add(spotL, spotR, spotL.target, spotR.target);

    // ── glossy black floor (the reflection is a mirrored copy of the character underneath) ──
    const floorTex = this.canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 6, 128, 128, 128);
      gr.addColorStop(0, '#2c2938');
      gr.addColorStop(0.5, '#15131d');
      gr.addColorStop(1, '#0b0a10');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    });
    const floor = mesh(
      new THREE.CircleGeometry(11, 72),
      new THREE.MeshPhysicalMaterial({
        map: floorTex, color: '#ffffff', roughness: 0.2, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1,
        transparent: true, opacity: tuning.dressup.studio.floorOpacity, envMapIntensity: 1.3,
      }),
      false,
      true,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = 1;
    st.add(floor);
    this.mirror.scale.y = -1;
    st.add(this.mirror);

    // light ring around the stage + a drifting LED edge + a colored light pool
    const ring1 = this.led('#ff2e88', 2.2);
    const ring2 = this.led('#00d4ff', 1.8);
    this.ledMats.push(ring1, ring2);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.03, 8, 96), ring1);
    r1.rotation.x = Math.PI / 2;
    r1.position.y = 0.012;
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.022, 8, 120), ring2);
    r2.rotation.x = Math.PI / 2;
    r2.position.y = 0.01;
    st.add(r1, r2);
    const poolTex = this.canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 48),
      new THREE.MeshBasicMaterial({ map: poolTex, color: '#ff5fa8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.006;
    pool.renderOrder = 2;
    st.add(pool);

    // ── curved dark backdrop with vertical LED strips ──
    const arc = 2.3;
    const wall = mesh(
      new THREE.CylinderGeometry(7.4, 7.4, 9, 64, 1, true, Math.PI - arc / 2, arc),
      new THREE.MeshStandardMaterial({ color: '#13111a', roughness: 0.85, side: THREE.BackSide }),
      false,
      true,
    );
    wall.position.y = 4.5;
    st.add(wall);
    const stripA = this.led('#ff2e88', 2);
    const stripB = this.led('#00d4ff', 2);
    this.ledMats.push(stripA, stripB);
    [[-0.95, stripA], [-0.62, stripB], [0.62, stripA], [0.95, stripB]].forEach(([a, m]) => {
      const th = Math.PI + (a as number);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 6.2, 0.07), m as THREE.Material);
      strip.position.set(Math.sin(th) * 7.2, 3.3, Math.cos(th) * 7.2);
      st.add(strip);
    });

    // ── big mirror (back right) with a glowing frame ──
    this.buildMirror(2.1, -5.5);
    // ── neon sign with the player's name ──
    this.neonCanvas = document.createElement('canvas');
    this.neonCanvas.width = 1024;
    this.neonCanvas.height = 256;
    this.neonTex = new THREE.CanvasTexture(this.neonCanvas);
    this.neonTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.9),
      new THREE.MeshBasicMaterial({ map: this.neonTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    sign.position.set(-1.7, 3.5, -5.7);
    sign.rotation.y = 0.12;
    st.add(sign);
    // ── creator ring light on a tripod, with a phone "recording" ──
    this.buildRingLight(-2.9, -1.5);
    // ── two crossing spotlight beams ──
    for (const [x, col] of [[-3.4, '#ff8cc6'], [3.4, '#8fdcff']] as [number, string][]) st.add(this.beam(x, col));
  }

  private beam(x: number, color: string): THREE.Mesh {
    const g = new THREE.CylinderGeometry(0.15, 1.5, 6.4, 32, 1, true);
    g.translate(0, -3.2, 0);
    const p = g.attributes.position;
    const c = new THREE.Color(color);
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = clamp(1 + p.getY(i) / 6.4, 0, 1); // 1 at the lamp → 0 at the floor
      const v = tuning.dressup.studio.beamAlpha * k * k;
      cols[i * 3] = c.r * v;
      cols[i * 3 + 1] = c.g * v;
      cols[i * 3 + 2] = c.b * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, 5.6, 3.4);
    m.lookAt(0, 1.0, 0);
    m.rotateX(-Math.PI / 2); // the cone extends along -y: point it down the lookAt axis
    m.renderOrder = 5;
    return m;
  }

  /** Small helper: a canvas texture painted by `draw`. */
  private canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildMirror(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -0.18;
    const w = 2.0, h = 3.5;
    // dark glass that reflects the studio environment (ring light, LED strips)
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: '#c9cde0', metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }),
    );
    glass.position.y = 0.4 + h / 2;
    g.add(glass);
    const frame = toyMat('#0f0e17', 'satin');
    const mk = (fw: number, fh: number, px: number, py: number) => {
      const m = mesh(roundedBox(fw, fh, 0.08, 0.02), frame, false, false);
      m.position.set(px, py, -0.02);
      g.add(m);
    };
    mk(w + 0.16, 0.08, 0, 0.4 + h + 0.04);
    mk(w + 0.16, 0.08, 0, 0.36);
    mk(0.08, h + 0.1, -w / 2 - 0.04, 0.4 + h / 2);
    mk(0.08, h + 0.1, w / 2 + 0.04, 0.4 + h / 2);
    const edge = this.led('#ff2e88', 2.2);
    this.ledMats.push(edge);
    for (const sx of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), edge);
      bar.position.set(sx * (w / 2 + 0.01), 0.4 + h / 2, 0.01);
      g.add(bar);
    }
    this.stage.add(g);
  }

  private buildRingLight(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = 0.75;
    const metal = toyMat('#1d1b26', 'metal');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const leg = mesh(new THREE.CapsuleGeometry(0.018, 1.0, 4, 8), metal, true, false);
      leg.position.set(Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3);
      leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
      g.add(leg);
    }
    const pole = mesh(new THREE.CapsuleGeometry(0.014, 0.7, 4, 8), metal, true, false);
    pole.position.y = 1.35;
    g.add(pole);
    const ringMat = this.led('#fff4ea', 2.4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.038, 10, 48), ringMat);
    ring.position.y = 1.75;
    g.add(ring);
    // phone in the middle, red REC dot
    const phone = mesh(roundedBox(0.1, 0.2, 0.012, 0.02), toyMat('#0f0e17', 'gloss'), false, false);
    phone.position.set(0, 1.75, -0.02);
    g.add(phone);
    this.recDot = new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), this.recDot);
    dot.position.set(0.034, 1.835, 0.005);
    g.add(dot);
    this.stage.add(g);
  }

  /** Draw the player's name as a neon sign. */
  private drawNeon(name: string): void {
    const c = this.neonCanvas;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const text = name.toUpperCase().slice(0, 14);
    let size = 170;
    g.font = `900 ${size}px ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif`;
    const w = g.measureText(text).width;
    if (w > 900) {
      size = Math.floor((size * 900) / w);
      g.font = `900 ${size}px ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [blur, col] of [[60, '#ff2e88'], [30, '#ff2e88'], [12, '#ff6fb1']] as [number, string][]) {
      g.shadowColor = col;
      g.shadowBlur = blur;
      g.fillStyle = col;
      g.fillText(text, 512, 118);
    }
    g.shadowBlur = 8;
    g.shadowColor = '#ffffff';
    g.fillStyle = '#ffe9f4';
    g.fillText(text, 512, 118);
    g.shadowColor = '#00d4ff';
    g.shadowBlur = 24;
    g.fillStyle = '#00d4ff';
    g.fillRect(512 - 120, 226, 240, 8);
    this.neonTex.needsUpdate = true;
  }

  /** Keep the mirrored copy in step with the real character (and rebuild it after outfit changes). */
  private rebuildMirror(): void {
    if (!this.char) return;
    this.mirror.clear();
    // skinned characters need their skeleton re-bound on the copy (SkeletonUtils does that)
    const copy = cloneSkinned(this.char.group);
    copy.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    this.mirror.add(copy);
  }
  private syncMirror(): void {
    const src = this.char?.group;
    const dst = this.mirror.children[0];
    if (!src || !dst) return;
    const walk = (a: THREE.Object3D, b: THREE.Object3D) => {
      b.position.copy(a.position);
      b.quaternion.copy(a.quaternion);
      b.scale.copy(a.scale);
      b.visible = a.visible;
      const n = Math.min(a.children.length, b.children.length);
      for (let i = 0; i < n; i++) walk(a.children[i], b.children[i]);
    };
    walk(src, dst);
  }

  // ── Scene lifecycle ──────────────────────────────────────────────────────
  enter(): void {
    this.ui.innerHTML = '';
    this.timers = [];
    const prof = store.profile;
    // wrap styles from older saves into the new catalog
    const o = prof.outfit;
    let fixed = false;
    for (const s of SLOTS) {
      const n = OUTFIT_CATALOG[s].length;
      const st = ((Math.floor(o[s].style) % n) + n) % n;
      if (st !== o[s].style) {
        o[s].style = st;
        fixed = true;
      }
    }
    if (fixed) store.update(() => undefined);
    if (!this.char) {
      this.char = new Character(o);
      this.stage.add(this.char.group);
    } else {
      this.char.setOutfit(o);
    }
    this.rebuildMirror();
    this.drawNeon(prof.name);
    this.history = [];
    this.rot = 0;
    this.spinVel = 0;
    this.idle = 0;
    this.dist = this.targetDist = tuning.dressup.zoomDefault;
    this.lookY = tuning.dressup.lookYWide;
    this.focusLook = null;
    this.cat = 'hair';
    this.lookSel = 0;
    this.pointers.clear();
    this.buildUI();
    this.listenInput();
    this.onExit(() => {
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
      this.pointers.clear();
    });
    this.resize(window.innerWidth, window.innerHeight);
    this.later(420, () => this.char?.wave());
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  resetStation(): void {
    this.rot = 0;
    this.spinVel = 0;
    this.targetDist = tuning.dressup.zoomDefault;
    this.focusLook = null;
  }

  debugInfo(): Record<string, string | number> {
    return { styleCat: this.cat, camDist: +this.dist.toFixed(2), rot: +this.rot.toFixed(2) };
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  private buildUI(): void {
    const ui = this.ui;
    const head = el('div', 'tc dr-title', ui);
    el('div', 'title', head, '<span class="hl">STYLE</span>');
    el('div', 'label', head, escapeHtml(store.profile.name));
    head.style.pointerEvents = 'none';

    // category tabs (left, below the 🏠 button)
    this.tabSet = tabs(ui, CATEGORIES, this.cat, (id) => this.setCategory(id as Category));
    (ui.lastElementChild as HTMLElement).classList.add('dr-tabs');

    // option panel (right)
    this.panel = el('div', 'panel dr-panel', ui) as HTMLDivElement;
    this.renderPanel();

    // bottom bar: zoom out · undo · random · pose · zoom in
    const bar = el('div', 'dr-bar', ui);
    button(bar, { icon: '➖', cls: 'round ghost' }, () => this.zoomBy(tuning.dressup.zoomButtonStep));
    this.undoBtn = button(bar, { icon: '↩️', cls: 'round ghost', tap: 'back' }, () => this.undo());
    button(bar, { icon: '🎲', label: 'Random', cls: 'big', tap: 'big' }, () => this.randomLook());
    button(bar, { icon: '📸', label: 'Pose', cls: 'big', tap: 'big' }, () => this.doPose());
    button(bar, { icon: '➕', cls: 'round ghost' }, () => this.zoomBy(1 / tuning.dressup.zoomButtonStep));
    this.updateUndo();

    // camera flash + viewfinder overlays for the photo moment
    this.flashEl = el('div', 'dr-flash', ui) as HTMLDivElement;
    this.vfEl = el('div', 'dr-vf', ui, '<i></i><i></i><i></i><i></i><b>● REC</b>') as HTMLDivElement;

    // let's ride
    button(ui, { label: "Let's ride 🚗", cls: 'br pink big dr-go', tap: 'big' }, () => void scenes.go('town'));
  }

  private setCategory(c: Category): void {
    this.cat = c;
    this.tabSet?.(c);
    this.renderPanel();
    if (tuning.dressup.autoFocus) {
      this.targetDist = clamp(tuning.dressup.focusDist[c] ?? tuning.dressup.zoomDefault, tuning.dressup.zoomMin, tuning.dressup.zoomMax);
      this.focusLook = tuning.dressup.focusLookY[c] ?? null;
    }
  }

  /** (Re)build the option grid + color swatches for the current category. */
  private renderPanel(): void {
    const p = this.panel;
    p.innerHTML = '';
    const outfit = store.profile.outfit;
    const cat = CATEGORIES.find((c) => c.id === this.cat)!;
    el('div', 'dr-head', p, `${cat.icon} ${cat.label}`);
    if (this.cat === 'skin') {
      swatches(p, tuning.art.skinTones, outfit.skin, (c) => this.pickSkin(c), 'dr-skin');
      return;
    }
    if (this.cat === 'looks') {
      this.renderLooks(p);
      return;
    }
    const slot = this.cat;
    const grid = el('div', 'items dr-items', p);
    const tiles: HTMLElement[] = [];
    OUTFIT_CATALOG[slot].forEach((it, i) => {
      const b = el('button', 'item', grid);
      el('span', 'ico', b, it.icon);
      el('span', '', b, it.name);
      const locked = !!it.reward && !isUnlocked(it.reward);
      if (locked) {
        b.classList.add('locked');
        el('span', 'lock-badge', b, `🔒 💎${rewardFor(it.reward!)?.at ?? ''}`);
      }
      if (outfit[slot].style === i) b.classList.add('on');
      bindTap(b, () => {
        if (locked) {
          lockedToast(it.reward!);
          return;
        }
        tiles.forEach((t, k) => t.classList.toggle('on', k === i));
        this.pickStyle(slot, i);
        syncHint();
      });
      tiles.push(b);
    });
    const colorsBox = el('div', 'dr-colors', p);
    const hint = el('div', 'label dr-hint', p, 'Pick one to add color');
    this.setSwatch = swatches(colorsBox, tuning.art.palette, outfit[slot].color, (c) => this.pickColor(slot, c));
    const syncHint = () => {
      const none = slot === 'accessory' && store.profile.outfit.accessory.style === 0;
      colorsBox.style.display = none ? 'none' : '';
      hint.style.display = none ? '' : 'none';
    };
    syncHint();
  }

  // ── Looks: 4 saved outfits ───────────────────────────────────────────────
  private renderLooks(p: HTMLElement): void {
    const looks = store.profile.looks ?? [];
    const max = tuning.dressup.looksMax;
    const grid = el('div', 'dr-looks', p);
    for (let i = 0; i < max; i++) {
      const look = looks[i];
      const card = el('div', `look${look ? '' : ' empty'}${i === this.lookSel ? ' on' : ''}`, grid);
      el('span', 'look-n', card, String(i + 1));
      if (look) card.appendChild(this.mannequin(look));
      else el('span', 'look-plus', card, '+');
      this.bindLook(card, i);
    }
    el('div', 'label dr-hint', p, 'Tap to wear · hold to save here');
    button(p, { icon: '💾', label: 'Save look', cls: 'pink' }, () => this.saveLook());
  }

  /** Tiny colored mannequin used on the look cards. */
  private mannequin(o: Outfit): HTMLElement {
    const m = el('div', 'mini');
    const part = (cls: string, color: string) => {
      const d = el('i', cls, m);
      d.style.background = color;
    };
    part('m-hair', o.hair.color);
    part('m-head', o.skin);
    part('m-top', o.top.color);
    part('m-bot', o.bottom.color);
    part('m-shoe', o.shoes.color);
    return m;
  }

  /** Tap = wear / save into an empty card, long-press = save here. */
  private bindLook(card: HTMLElement, i: number): void {
    let timer: number | null = null;
    let fired = false;
    let down = false;
    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      down = true;
      fired = false;
      card.classList.add('pressed');
      timer = window.setTimeout(() => {
        fired = true;
        this.saveLook(i);
      }, tuning.dressup.longPressMs);
    });
    card.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      card.classList.remove('pressed');
      clear();
      if (!down) return;
      down = false;
      if (fired) return;
      bus.emit('uiTap', { kind: 'soft' });
      const look = store.profile.looks?.[i];
      this.lookSel = i;
      if (look) this.wearLook(i);
      else this.saveLook(i);
    });
    const cancel = () => {
      down = false;
      card.classList.remove('pressed');
      clear();
    };
    card.addEventListener('pointercancel', cancel);
    card.addEventListener('pointerleave', cancel);
  }

  private saveLook(slot?: number): void {
    const char = this.char;
    if (!char) return;
    const max = tuning.dressup.looksMax;
    const prof = store.profile;
    const looks = (prof.looks ??= []);
    let target = slot ?? this.lookSel;
    if (slot === undefined) {
      // next empty slot, else round-robin overwrite
      target = looks.length < max ? looks.length : this.nextOverwrite++ % max;
    }
    target = clamp(target, 0, Math.min(looks.length, max - 1));
    const snap = structuredClone(prof.outfit);
    store.update(() => {
      looks[target] = snap;
    });
    this.lookSel = target;
    const pos = char.slotAnchor('top');
    pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.5));
    bus.emit('creationSaved', { kind: 'look', pos: v3(pos) });
    toast(`Saved to Look ${target + 1}`);
    char.pose('hips');
    if (this.cat === 'looks') this.renderPanel();
  }

  private wearLook(i: number): void {
    const look = store.profile.looks?.[i];
    if (!look) return;
    this.pushHistory();
    this.transitionTo(structuredClone(look), 'hips');
    if (this.cat === 'looks') this.renderPanel();
  }

  // ── Changing the outfit ──────────────────────────────────────────────────
  private pickStyle(slot: CatalogSlot, style: number): void {
    this.change(slot, (o) => {
      const wasNone = slot === 'accessory' && o.accessory.style === 0;
      o[slot].style = style;
      // a new accessory starts in a color that pops against the hair (it never blends in);
      // the kid can recolor it separately with the swatches below
      if (slot === 'accessory' && style > 0 && (wasNone || colorGap(o.accessory.color, o.hair.color) < MIN_ACCENT_GAP)) {
        o.accessory.color = contrastColor(o.hair.color, tuning.art.palette, style);
      }
    });
    if (slot === 'accessory') this.setSwatch?.(store.profile.outfit.accessory.color);
  }
  private pickColor(slot: CatalogSlot, color: string): void {
    let note = '';
    let accChanged = false;
    this.change(slot, (o) => {
      o[slot].color = color;
      if (slot === 'accessory') {
        // hair accessories can't match the hair — swap to a contrast color and say so
        const eff = Character.accessoryColor(o);
        if (eff !== color) {
          o.accessory.color = eff;
          note = 'Too close to your hair, so we picked a contrast color';
        }
      } else if (slot === 'hair' && o.accessory.style > 0) {
        // changing the hair keeps the accessory visible against it
        const eff = Character.accessoryColor(o);
        if (eff !== o.accessory.color) {
          o.accessory.color = eff;
          accChanged = true;
        }
      }
    });
    if (slot === 'accessory') this.setSwatch?.(store.profile.outfit.accessory.color);
    if (note) toast(note);
    if (accChanged) this.pop('accessory');
  }
  private pickSkin(color: string): void {
    this.change('skin', (o) => {
      o.skin = color;
    });
  }

  /** One outfit edit: save (autosave), update the character, pose, sparkle + pop. */
  private change(slot: OutfitSlot, edit: (o: Outfit) => void): void {
    const char = this.char;
    if (!char) return;
    this.pushHistory();
    const o = store.profile.outfit;
    store.update(() => edit(o));
    char.setOutfit(o, slot);
    this.rebuildMirror();
    char.pose();
    this.pop(slot);
  }

  /** Sparkle burst + squash-and-stretch of the changed part (juice reacts to the event). */
  private pop(slot: OutfitSlot): void {
    const char = this.char;
    if (!char) return;
    const anchor = char.slotAnchor(slot);
    // nudge toward the camera so the sparkles aren't hidden inside the body
    anchor.add(this.camera.position.clone().sub(anchor).normalize().multiplyScalar(0.45));
    bus.emit('outfitChanged', { slot, pos: v3(anchor), object: char.partObject(slot) ?? undefined });
  }

  private pushHistory(): void {
    this.history.push(structuredClone(store.profile.outfit));
    if (this.history.length > tuning.dressup.undoMax) this.history.shift();
    this.updateUndo();
  }
  private updateUndo(): void {
    if (this.undoBtn) this.undoBtn.disabled = this.history.length === 0;
  }

  /** Step back to the previous look. */
  private undo(): void {
    const char = this.char;
    const prev = this.history.pop();
    this.updateUndo();
    if (!char || !prev) return;
    this.transitionTo(prev, 'hips', false);
  }

  /** Switch to a whole outfit; changed pieces pop in one after another (stagger) or all at once. */
  private transitionTo(next: Outfit, pose: 'hips' | 'twirl' | null, stagger = true): void {
    const char = this.char;
    if (!char) return;
    const cur = store.profile.outfit;
    store.update(() => {
      store.profile.outfit = next;
    });
    if (pose) char.pose(pose, undefined, true);
    const changed: OutfitSlot[] = [];
    if (cur.skin !== next.skin) changed.push('skin');
    for (const s of SLOTS) if (cur[s].style !== next[s].style || cur[s].color !== next[s].color) changed.push(s);
    if (!stagger) {
      char.setOutfit(next);
      this.rebuildMirror();
      for (const s of changed) this.pop(s);
      this.renderPanel();
      return;
    }
    const shown = structuredClone(cur);
    changed.forEach((s, i) => {
      this.later(i * tuning.dressup.surpriseStaggerMs, () => {
        if (s === 'skin') shown.skin = next.skin;
        else shown[s] = structuredClone(next[s]);
        char.setOutfit(shown, s);
        this.rebuildMirror();
        this.pop(s);
        if (i === changed.length - 1) this.renderPanel();
      });
    });
    if (!changed.length) this.renderPanel();
  }

  /** 🎲 a whole new random look (never uses locked bonus items), revealed piece by piece. */
  private randomLook(): void {
    const char = this.char;
    if (!char) return;
    this.pushHistory();
    const cur = store.profile.outfit;
    const next = structuredClone(cur);
    const pal = tuning.art.palette;
    const pickColor = () => pal[Math.floor(Math.random() * pal.length)];
    for (const s of SLOTS) {
      const items = OUTFIT_CATALOG[s];
      const ok: number[] = [];
      items.forEach((it, i) => {
        if (s === 'accessory' && i === 0) return;
        if (it.reward && !isUnlocked(it.reward)) return;
        if (i === cur[s].style) return;
        ok.push(i);
      });
      let style = ok.length ? ok[Math.floor(Math.random() * ok.length)] : cur[s].style;
      if (s === 'accessory' && Math.random() < 0.25) style = 0;
      next[s].style = style;
      next[s].color = pickColor();
    }
    // the accessory always pops against the new hair
    if (next.accessory.style > 0) next.accessory.color = contrastColor(next.hair.color, pal, next.accessory.style);
    if (next.top.color === next.bottom.color) next.bottom.color = pal[(pal.indexOf(next.top.color) + 7) % pal.length];
    this.transitionTo(next, 'twirl');
  }

  /** 📸 strike the next cool pose, then flash. */
  private doPose(): void {
    const char = this.char;
    const now = performance.now();
    if (!char || now < this.poseLock) return;
    const hold = tuning.dressup.poseHold;
    this.poseLock = now + hold * 1000 * 0.7;
    const kind = POSE_ORDER[this.poseIdx++ % POSE_ORDER.length];
    char.pose(kind, hold, true);
    this.vfEl?.classList.add('on');
    this.later(tuning.dressup.flashDelayMs, () => {
      this.flashEl?.classList.remove('go');
      void this.flashEl?.offsetWidth; // restart the animation
      this.flashEl?.classList.add('go');
      const pos = char.slotAnchor('top');
      pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.5));
      bus.emit('photoFlash', { pos: v3(pos) });
    });
    this.later(hold * 1000, () => this.vfEl?.classList.remove('on'));
  }

  // ── Input: drag to spin, pinch / wheel / buttons to zoom ─────────────────
  private listenInput(): void {
    const c = scenes.canvas;
    this.listen(c, 'pointerdown', (e) => this.onDown(e));
    this.listen(c, 'pointermove', (e) => this.onMove(e));
    this.listen(c, 'pointerup', (e) => this.onUp(e));
    this.listen(c, 'pointercancel', (e) => this.onUp(e, true));
    this.listen(
      c,
      'wheel',
      (e) => {
        e.preventDefault();
        this.manualZoom(this.targetDist * Math.exp(e.deltaY * tuning.dressup.zoomWheel));
      },
      { passive: false },
    );
    this.listen(window, 'keydown', (e) => {
      if (e.key === 'ArrowLeft') this.spinVel = -2.6;
      else if (e.key === 'ArrowRight') this.spinVel = 2.6;
      else if (e.key === '+' || e.key === '=') this.zoomBy(1 / tuning.dressup.zoomButtonStep);
      else if (e.key === '-' || e.key === '_') this.zoomBy(tuning.dressup.zoomButtonStep);
    });
  }

  /** The player zooms by hand: stop following the category focus height. */
  private manualZoom(d: number): void {
    this.targetDist = clamp(d, tuning.dressup.zoomMin, tuning.dressup.zoomMax);
    this.focusLook = null;
  }
  private zoomBy(f: number): void {
    this.manualZoom(this.targetDist * f);
  }

  private onDown(e: PointerEvent): void {
    try {
      scenes.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragging = true;
      this.downT = performance.now();
      this.lastMoveT = this.downT;
      this.moved = 0;
      this.spinVel = 0;
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.pointerSpan();
      this.moved = 999; // not a tap
    }
    this.idle = 0;
  }

  private onMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    this.idle = 0;
    if (this.pointers.size >= 2) {
      const d = this.pointerSpan();
      if (this.pinchDist > 0 && d > 0) this.manualZoom(this.targetDist * (this.pinchDist / d));
      this.pinchDist = d;
      return;
    }
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.rot += dx * tuning.dressup.rotateSpeed;
    const now = performance.now();
    const dtS = Math.max(0.008, (now - this.lastMoveT) / 1000);
    this.lastMoveT = now;
    this.spinVel = clamp(lerp(this.spinVel, (dx * tuning.dressup.rotateSpeed) / dtS, 0.5), -14, 14);
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size === 0) {
      this.dragging = false;
      const now = performance.now();
      if (now - this.lastMoveT > 90) this.spinVel = 0; // finger rested before lifting: no fling
      if (!cancelled && this.moved < 10 && now - this.downT < 450) this.onTap(e);
    } else if (this.pointers.size === 1) {
      this.pinchDist = 0;
      this.spinVel = 0;
    }
  }

  private pointerSpan(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  /** Tap the character: strike a pose with a little sparkle. */
  private onTap(e: PointerEvent): void {
    const char = this.char;
    if (!char) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(char.group, true)[0];
    if (!hit) return;
    char.pose();
    bus.emit('optionPicked', { pos: v3(hit.point) });
  }

  // ── Frame loop ───────────────────────────────────────────────────────────
  update(dt: number, t: number): void {
    const char = this.char;
    if (!char) return;
    const D = tuning.dressup;

    // spin with inertia; drift back to facing front when left alone
    if (!this.dragging) {
      this.rot += this.spinVel * dt;
      this.spinVel *= Math.pow(D.rotateInertia, dt * 60);
      if (Math.abs(this.spinVel) < 0.05) this.spinVel = 0;
    }
    if (!this.dragging && this.pointers.size === 0 && Math.abs(this.spinVel) < 0.3 && !char.posing) {
      this.idle += dt;
      if (this.idle > D.faceFrontDelay) {
        const target = Math.round(this.rot / TAU) * TAU;
        this.rot += (target - this.rot) * (1 - Math.exp(-D.faceFrontSpeed * dt));
      }
    } else this.idle = 0;
    char.group.rotation.y = this.rot;

    // swishy sound while spinning fast (juice maps characterSpin)
    const sp = Math.abs(this.spinVel);
    if (sp > 1.4 || (this.dragging && sp > 0.9)) {
      this.spinSoundT += dt;
      if (this.spinSoundT > D.spinSoundEvery) {
        this.spinSoundT = 0;
        bus.emit('characterSpin', { speed: sp });
      }
    } else this.spinSoundT = D.spinSoundEvery * 0.6;

    char.update(dt, t);
    this.syncMirror();

    // camera: glide to the target distance + height (focus on the part being styled)
    const k = 1 - Math.exp(-D.zoomSmooth * dt);
    this.dist += (this.targetDist - this.dist) * k;
    const close = smooth((D.zoomMax - this.dist) / (D.zoomMax - D.zoomMin));
    const want = this.focusLook ?? lerp(D.lookYWide, D.lookYClose, close);
    this.lookY += (want - this.lookY) * k;
    this.camera.position.set(0, this.lookY + 0.22 + this.dist * 0.075, this.dist);
    this.camera.lookAt(0, this.lookY, 0);

    // living studio: drifting LED colors, blinking REC dot
    const sp2 = D.studio.ledSpeed;
    this.ledMats.forEach((m, i) => {
      const h = lerp(0.52, 0.93, 0.5 + 0.5 * Math.sin(t * sp2 * TAU + i * 1.3));
      m.color.setHSL(h, 1, 0.55).multiplyScalar(2.0);
    });
    this.recDot.color.set(Math.sin(t * 3.2) > 0 ? '#ff2020' : '#3a0a0a');
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // keep the character in the free space between the tab column and the option panel
    const wide = w >= 900 && w / h > 1.1;
    const panelW = this.panel?.offsetWidth ?? 400;
    this.viewShift = wide ? Math.round((panelW + 30 - 116) / 2) : 0;
    if (this.viewShift) this.camera.setViewOffset(w, h, this.viewShift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.ui.style.setProperty('--dr-shift', `${this.viewShift}px`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
