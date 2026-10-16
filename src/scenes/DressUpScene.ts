// Dress-up boutique: a glossy podium on a pastel stage with a mirror, curtains,
// a clothes rack and string lights. Pick hair / top / bottom / shoes / extras /
// skin on the left, pick options + colors on the right, spin the character with
// a drag, pinch or wheel to zoom. Every change pops with sparkles + a pose and
// autosaves to the active profile.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus, v3, type OutfitSlot } from '../core/events';
import { tuning } from '../tuning';
import { Character, OUTFIT_CATALOG, type CatalogSlot } from '../art/character';
import { addLights, gradientTexture } from '../art/env';
import { toyMat, toyMatUnique, mesh, roundedBox } from '../art/materials';
import { el, button, bindTap, swatches, tabs } from '../ui/ui';
import type { Outfit } from '../core/model';

type Category = CatalogSlot | 'skin';

const CATEGORIES: { id: Category; icon: string; label: string }[] = [
  { id: 'hair', icon: '💇', label: 'Hair' },
  { id: 'top', icon: '👕', label: 'Top' },
  { id: 'bottom', icon: '👖', label: 'Bottom' },
  { id: 'shoes', icon: '👟', label: 'Shoes' },
  { id: 'accessory', icon: '🎀', label: 'Extras' },
  { id: 'skin', icon: '🙂', label: 'Skin' },
];
const SLOTS: CatalogSlot[] = ['hair', 'top', 'bottom', 'shoes', 'accessory'];

const PODIUM_TOP = 0.29; // character stands here
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class DressUpScene extends GameScene {
  readonly name = 'dressup' as const;

  private char: Character | null = null;
  private stage = new THREE.Group();
  private sway: { obj: THREE.Object3D; phase: number; amp: number }[] = [];
  private bulbMats: THREE.MeshStandardMaterial[] = [];
  private ray = new THREE.Raycaster();

  // view state
  private rot = 0;
  private spinVel = 0;
  private dist = tuning.dressup.zoomDefault;
  private targetDist = tuning.dressup.zoomDefault;
  private lookBias = 0;
  private targetBias = 0;
  private idle = 0;
  private spinSoundT = 0;
  private viewShift = 0;

  // pointer state
  private pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private pinchDist = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private moved = 0;
  private lastMoveT = 0;

  // ui state
  private cat: Category = 'hair';
  private panel!: HTMLDivElement;
  private tabSet: ((id: string) => void) | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private history: Outfit[] = [];
  private timers: number[] = [];

  // ── Stage ────────────────────────────────────────────────────────────────
  init(): void {
    this.fxScale = 1.3;
    this.camera.fov = tuning.dressup.fov;
    this.camera.near = 0.1;
    this.camera.far = 80;
    this.buildStage();
    this.scene.add(this.stage);
  }

  private buildStage(): void {
    const S = this.scene;
    const st = this.stage;
    S.background = gradientTexture('#ffc9e0', '#f0e2ff', '#ffe8f2');
    addLights(S, { shadowSize: 4.5, sunPos: new THREE.Vector3(2.8, 6.5, 5.5) });
    // warm key accent, pink + lilac rims for a "spotlit stage" feel
    const warm = new THREE.PointLight('#ffd9b3', 14, 0, 2);
    warm.position.set(1.2, 3.4, 3.2);
    const rimPink = new THREE.PointLight('#ff9fd0', 9, 0, 2);
    rimPink.position.set(-2.6, 2.6, -1.4);
    const rimLilac = new THREE.PointLight('#b9a6ff', 7, 0, 2);
    rimLilac.position.set(2.8, 2.2, -1.6);
    S.add(warm, rimPink, rimLilac);

    // ── floor: soft checker + a round rug ──
    const floorTex = this.canvasTex(128, 128, (g) => {
      g.fillStyle = '#fff3f8';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffdce9';
      g.fillRect(0, 0, 64, 64);
      g.fillRect(64, 64, 64, 64);
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(9, 9);
    const floor = mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }), false, true);
    floor.rotation.x = -Math.PI / 2;
    st.add(floor);
    const rug = mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.03, 64), toyMat('#e6d9ff', 'satin'), false, true);
    rug.position.y = 0.015;
    const rugRing = mesh(new THREE.TorusGeometry(2.0, 0.04, 8, 64), toyMat('#ffc2da', 'satin'), false, true);
    rugRing.rotation.x = Math.PI / 2;
    rugRing.position.y = 0.04;
    st.add(rug, rugRing);

    // ── glossy podium ──
    const podBase = mesh(new THREE.CylinderGeometry(1.08, 1.17, 0.22, 64), toyMat('#ff9ec6', 'gloss'));
    podBase.position.y = 0.14;
    const podTop = mesh(new THREE.CylinderGeometry(0.96, 1.0, 0.07, 64), toyMat('#fff6fa', 'gloss'));
    podTop.position.y = 0.255;
    const podRing = mesh(new THREE.TorusGeometry(0.98, 0.032, 10, 72), toyMat('#ffd166', 'metal'), false, false);
    podRing.rotation.x = Math.PI / 2;
    podRing.position.y = 0.29;
    st.add(podBase, podTop, podRing);

    // ── curved striped back wall + wainscot ──
    const wallTex = this.canvasTex(256, 256, (g) => {
      g.fillStyle = '#ffe7f1';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#ffd8e7';
      for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 64, 256);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let y = 20; y < 256; y += 64) for (let x = 32; x < 256; x += 128) {
        g.beginPath();
        g.arc(x, y, 5, 0, TAU);
        g.fill();
      }
    });
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.repeat.set(9, 1);
    const arc = 2.5;
    const wall = mesh(
      new THREE.CylinderGeometry(6.2, 6.2, 7, 64, 1, true, Math.PI - arc / 2, arc),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, side: THREE.BackSide }),
      false,
      true,
    );
    wall.position.y = 3.5;
    const wains = mesh(
      new THREE.CylinderGeometry(6.17, 6.17, 1.2, 64, 1, true, Math.PI - arc / 2, arc),
      new THREE.MeshStandardMaterial({ color: '#efe4ff', roughness: 0.6, side: THREE.BackSide }),
      false,
      true,
    );
    wains.position.y = 0.6;
    st.add(wall, wains);

    // ── arched mirror (back, slightly right of the character) ──
    this.buildMirror(0.7, -4.9);
    // ── curtains ──
    this.buildCurtains();
    // ── clothes rack, plant, string lights ──
    this.buildRack(-2.0, -2.7);
    this.buildPlant(2.7, -2.7);
    this.buildLights();

    // ── faint spotlight cone from above ──
    const cone = new THREE.CylinderGeometry(0.2, 2.1, 5.4, 40, 1, true);
    const cpos = cone.attributes.position;
    const cols = new Float32Array(cpos.count * 3);
    for (let i = 0; i < cpos.count; i++) {
      const k = clamp((cpos.getY(i) + 2.7) / 5.4, 0, 1); // 0 bottom → 1 top
      const v = 0.11 * k * k;
      cols[i * 3] = v * 1.0;
      cols[i * 3 + 1] = v * 0.93;
      cols[i * 3 + 2] = v * 0.82;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const beam = new THREE.Mesh(
      cone,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    beam.position.set(0, 3.0, 0);
    beam.renderOrder = 5;
    st.add(beam);
  }

  /** Small helper: a canvas texture painted by `draw`. */
  private canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  private buildMirror(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const w = 2.5, straight = 2.3, r = w / 2, bottom = 0.45;
    // mirror glass (flat arch) with a soft sky gradient + glints
    const shape = new THREE.Shape();
    shape.moveTo(-r, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, straight);
    shape.absarc(0, straight, r, 0, Math.PI, false);
    shape.lineTo(-r, 0);
    const geo = new THREE.ShapeGeometry(shape, 32);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + r) / w, pos.getY(i) / (straight + r));
    const tex = this.canvasTex(128, 256, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#f4fbff');
      gr.addColorStop(1, '#cfe3ff');
      c.fillStyle = gr;
      c.fillRect(0, 0, 128, 256);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.moveTo(20, 256);
      c.lineTo(52, 256);
      c.lineTo(110, 0);
      c.lineTo(78, 0);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.moveTo(66, 256);
      c.lineTo(80, 256);
      c.lineTo(128, 40);
      c.lineTo(114, 40);
      c.fill();
    });
    const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    glass.position.set(0, bottom, 0);
    g.add(glass);
    // gold arched frame
    const gold = toyMat('#ffd166', 'metal');
    const frameR = r + 0.07;
    const arch = mesh(new THREE.TorusGeometry(frameR, 0.075, 12, 48, Math.PI), gold, false, false);
    arch.position.set(0, bottom + straight, 0.02);
    g.add(arch);
    for (const s of [-1, 1]) {
      const post = mesh(new THREE.CapsuleGeometry(0.075, straight, 6, 12), gold, false, false);
      post.position.set(s * frameR, bottom + straight / 2, 0.02);
      g.add(post);
    }
    const base = mesh(roundedBox(w + 0.5, 0.18, 0.3, 0.08), toyMat('#ffb3d1', 'gloss'), false, true);
    base.position.set(0, bottom - 0.06, 0.05);
    g.add(base);
    this.stage.add(g);
  }

  private buildCurtains(): void {
    const mat = toyMatUnique('#d8c4ff', 'fabric');
    mat.side = THREE.DoubleSide;
    const rodMat = toyMat('#ffd166', 'metal');
    const rod = mesh(new THREE.CapsuleGeometry(0.05, 10.6, 6, 12), rodMat, false, false);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 5.45, -4.6);
    this.stage.add(rod);
    for (const s of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(1.9, 5.1, 40, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / 1.9 + 0.5;
        // ruffled folds
        p.setZ(i, Math.sin(u * Math.PI * 2 * 4) * 0.13);
      }
      geo.computeVertexNormals();
      const c = mesh(geo, mat, false, false);
      c.position.set(s * 3.55, 2.85, -4.55);
      this.stage.add(c);
      // a ribbon tie-back around the folds
      const tie = mesh(new THREE.TorusGeometry(0.96, 0.05, 8, 40), toyMat('#ffb3d1', 'gloss'), false, false);
      tie.rotation.x = Math.PI / 2;
      tie.scale.set(1, 0.17, 1);
      tie.position.set(s * 3.55, 1.9, -4.55);
      this.stage.add(tie);
    }
    // pelmet along the top
    const pelmet = mesh(roundedBox(10.8, 0.5, 0.35, 0.16), toyMat('#c9b0ff', 'fabric'), false, false);
    pelmet.position.set(0, 5.45, -4.5);
    this.stage.add(pelmet);
  }

  private buildRack(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = 0.22;
    const metal = toyMat('#fff2c4', 'metal');
    const pink = toyMat('#ff9ec6', 'gloss');
    for (const s of [-1, 1]) {
      const post = mesh(new THREE.CapsuleGeometry(0.04, 1.9, 6, 10), metal, true, false);
      post.position.set(s * 1.0, 1.05, 0);
      const foot = mesh(new THREE.CapsuleGeometry(0.04, 0.9, 6, 10), metal, true, false);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(s * 1.0, 0.12, 0);
      g.add(post, foot);
      for (const zz of [-0.45, 0.45]) {
        const wheel = mesh(new THREE.SphereGeometry(0.07, 12, 10), pink, true, false);
        wheel.position.set(s * 1.0, 0.07, zz);
        g.add(wheel);
      }
    }
    const railBar = mesh(new THREE.CapsuleGeometry(0.04, 2.0, 6, 10), pink, true, false);
    railBar.rotation.z = Math.PI / 2;
    railBar.position.set(0, 2.0, 0);
    g.add(railBar);
    const cols = ['#ff8fb1', '#9d8cff', '#ffd166', '#7fd8ff', '#5fd3a5', '#ffb38a'];
    for (let i = 0; i < 6; i++) {
      const piece = this.garment(i % 5, cols[i]);
      piece.position.set(-0.8 + i * 0.32, 1.98, 0.02 * (i % 2 ? 1 : -1));
      piece.rotation.y = (i % 2 ? 1 : -1) * 0.25;
      g.add(piece);
      this.sway.push({ obj: piece, phase: i * 1.3, amp: 0.035 });
    }
    this.stage.add(g);
  }

  /** A tiny garment on a hanger; the group origin is the hook. */
  private garment(kind: number, color: string): THREE.Group {
    const g = new THREE.Group();
    const fab = toyMat(color, 'fabric');
    const gold = toyMat('#ffd166', 'metal');
    const hook = mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI * 1.6), gold, false, false);
    hook.position.y = 0.04;
    const bar = mesh(new THREE.CapsuleGeometry(0.014, 0.28, 4, 8), gold, false, false);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = -0.07;
    g.add(hook, bar);
    const part = (geo: THREE.BufferGeometry, x: number, y: number, rz = 0) => {
      const m = mesh(geo, fab, true, false);
      m.position.set(x, y, 0);
      m.rotation.z = rz;
      g.add(m);
    };
    switch (kind) {
      case 0: // tee
      case 3: // hoodie
        part(roundedBox(0.3, 0.36, 0.07, 0.05), 0, -0.27);
        part(new THREE.CapsuleGeometry(0.05, 0.1, 4, 8), -0.2, -0.14, 1.0);
        part(new THREE.CapsuleGeometry(0.05, 0.1, 4, 8), 0.2, -0.14, -1.0);
        if (kind === 3) part(new THREE.SphereGeometry(0.1, 12, 10), 0, -0.1);
        break;
      case 1: { // dress
        const pts = [[0.001, -0.78], [0.2, -0.78], [0.25, -0.73], [0.2, -0.5], [0.1, -0.24], [0.07, -0.12], [0.001, -0.1]].map(([r, y]) => new THREE.Vector2(r, y));
        const m = mesh(new THREE.LatheGeometry(pts, 20), fab, true, false);
        g.add(m);
        break;
      }
      case 2: { // skirt
        const pts = [[0.001, -0.5], [0.2, -0.5], [0.22, -0.46], [0.15, -0.3], [0.1, -0.15], [0.001, -0.14]].map(([r, y]) => new THREE.Vector2(r, y));
        g.add(mesh(new THREE.LatheGeometry(pts, 20), fab, true, false));
        break;
      }
      default: // pants
        part(roundedBox(0.28, 0.12, 0.07, 0.05), 0, -0.16);
        part(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), -0.075, -0.4);
        part(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), 0.075, -0.4);
        break;
    }
    return g;
  }

  private buildPlant(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const potPts = [[0.001, 0], [0.2, 0], [0.25, 0.04], [0.3, 0.5], [0.33, 0.55], [0.3, 0.58]].map(([r, y]) => new THREE.Vector2(r, y));
    const pot = mesh(new THREE.LatheGeometry(potPts, 28), toyMat('#9fe8c8', 'gloss'));
    g.add(pot);
    const soil = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), toyMat('#8a5a44', 'matte'), false, false);
    soil.position.y = 0.5;
    g.add(soil);
    const leafGeo = new THREE.SphereGeometry(1, 12, 8);
    const greens = ['#5fd3a5', '#7fe0b4', '#4bc596'];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const lean = 0.35 + (i % 3) * 0.22;
      const leaf = mesh(leafGeo, toyMat(greens[i % 3], 'gloss'), true, false);
      leaf.scale.set(0.11, 0.42 + (i % 2) * 0.12, 0.035);
      const pivot = new THREE.Group();
      pivot.position.y = 0.52;
      pivot.rotation.y = a;
      leaf.position.set(0, 0.36, 0);
      const tilt = new THREE.Group();
      tilt.rotation.x = lean;
      tilt.add(leaf);
      pivot.add(tilt);
      g.add(pivot);
      this.sway.push({ obj: tilt, phase: i * 0.7, amp: 0.04 });
    }
    this.stage.add(g);
  }

  private buildLights(): void {
    // a sagging string of warm party bulbs across the back
    const pts: THREE.Vector3[] = [];
    const span = 5.2;
    for (let i = 0; i <= 24; i++) {
      const x = -span + (i / 24) * span * 2;
      pts.push(new THREE.Vector3(x, 4.85 - 0.55 * (1 - Math.pow(x / span, 2)), -5.2));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    this.stage.add(mesh(new THREE.TubeGeometry(curve, 60, 0.012, 5, false), toyMat('#6b6780', 'matte'), false, false));
    const colors = ['#fff3a3', '#ffc6e0', '#c9f1ff', '#e0d0ff'];
    for (const c of colors) this.bulbMats.push(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.0, roughness: 0.3 }));
    const geo = new THREE.SphereGeometry(0.1, 14, 10);
    for (let i = 1; i < 16; i++) {
      const p = curve.getPoint(i / 16);
      const b = new THREE.Mesh(geo, this.bulbMats[i % this.bulbMats.length]);
      b.position.set(p.x, p.y - 0.1, p.z);
      this.stage.add(b);
    }
  }

  // ── Scene lifecycle ──────────────────────────────────────────────────────
  enter(): void {
    this.ui.innerHTML = '';
    this.timers = [];
    const outfit = store.profile.outfit;
    if (!this.char) {
      this.char = new Character(outfit);
      this.char.group.position.y = PODIUM_TOP;
      this.stage.add(this.char.group);
    } else {
      this.char.setOutfit(outfit);
    }
    this.history = [];
    this.rot = 0;
    this.spinVel = 0;
    this.idle = 0;
    this.dist = this.targetDist = tuning.dressup.zoomDefault;
    this.lookBias = this.targetBias = 0;
    this.cat = 'hair';
    this.pointers.clear();
    this.buildUI();
    this.listenInput();
    this.onExit(() => {
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
      this.pointers.clear();
    });
    this.resize(window.innerWidth, window.innerHeight);
    this.later(380, () => this.char?.wave());
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  resetStation(): void {
    this.rot = 0;
    this.spinVel = 0;
    this.targetDist = tuning.dressup.zoomDefault;
    this.targetBias = 0;
  }

  debugInfo(): Record<string, string | number> {
    return { dressCat: this.cat, camDist: +this.dist.toFixed(2), rot: +this.rot.toFixed(2) };
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  private buildUI(): void {
    const ui = this.ui;
    const title = el('div', 'tc title dr-title', ui, `${escapeHtml(store.profile.name)}'s Look ✨`);
    title.style.pointerEvents = 'none';

    // category tabs (left, below the 🏠 button)
    this.tabSet = tabs(ui, CATEGORIES, this.cat, (id) => this.setCategory(id as Category));
    (ui.lastElementChild as HTMLElement).classList.add('dr-tabs');

    // option panel (right)
    this.panel = el('div', 'panel dr-panel', ui) as HTMLDivElement;
    this.renderPanel();

    // bottom bar: zoom out, undo, surprise, zoom in
    const bar = el('div', 'dr-bar', ui);
    button(bar, { icon: '➖', cls: 'round ghost' }, () => this.zoomBy(tuning.dressup.zoomButtonStep));
    this.undoBtn = button(bar, { icon: '↩️', cls: 'round ghost', tap: 'back' }, () => this.undo());
    button(bar, { icon: '🎲', label: 'Surprise', cls: 'big butter', tap: 'big' }, () => this.surprise());
    button(bar, { icon: '➕', cls: 'round ghost' }, () => this.zoomBy(1 / tuning.dressup.zoomButtonStep));
    this.updateUndo();

    // let's go!
    button(ui, { label: "Let's go! 🚗", cls: 'br pink big dr-go', tap: 'big' }, () => void scenes.go('town'));
  }

  private setCategory(c: Category): void {
    this.cat = c;
    this.tabSet?.(c);
    this.renderPanel();
    if (tuning.dressup.autoFocus) {
      this.targetDist = clamp(tuning.dressup.focusDist[c] ?? tuning.dressup.zoomDefault, tuning.dressup.zoomMin, tuning.dressup.zoomMax);
      this.targetBias = tuning.dressup.focusLookBias[c] ?? 0;
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
    const slot = this.cat;
    const grid = el('div', 'items dr-items', p);
    const tiles: HTMLElement[] = [];
    OUTFIT_CATALOG[slot].forEach((it, i) => {
      const b = el('button', 'item', grid);
      el('span', 'ico', b, it.icon);
      el('span', '', b, it.name);
      if (outfit[slot].style === i) b.classList.add('on');
      bindTap(b, () => {
        tiles.forEach((t, k) => t.classList.toggle('on', k === i));
        this.pickStyle(slot, i);
        syncHint();
      });
      tiles.push(b);
    });
    const colorsBox = el('div', 'dr-colors', p);
    const hint = el('div', 'label dr-hint', p, 'Pick one to add color ✨');
    swatches(colorsBox, tuning.art.palette, outfit[slot].color, (c) => this.pickColor(slot, c));
    const syncHint = () => {
      const none = slot === 'accessory' && store.profile.outfit.accessory.style === 0;
      colorsBox.style.display = none ? 'none' : '';
      hint.style.display = none ? '' : 'none';
    };
    syncHint();
  }

  // ── Changing the outfit ──────────────────────────────────────────────────
  private pickStyle(slot: CatalogSlot, style: number): void {
    this.change(slot, (o) => {
      o[slot].style = style;
    });
  }
  private pickColor(slot: CatalogSlot, color: string): void {
    this.change(slot, (o) => {
      o[slot].color = color;
    });
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
    char.pose();
    this.pop(slot);
  }

  /** Sparkle burst + squash-and-stretch of the changed part (juice reacts to the event). */
  private pop(slot: OutfitSlot): void {
    const char = this.char;
    if (!char) return;
    const anchor = char.slotAnchor(slot);
    // nudge toward the camera so the sparkles aren't hidden inside the body
    anchor.add(this.camera.position.clone().sub(anchor).normalize().multiplyScalar(0.55));
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
    const cur = store.profile.outfit;
    const changed: OutfitSlot[] = [];
    if (cur.skin !== prev.skin) changed.push('skin');
    for (const s of SLOTS) if (cur[s].style !== prev[s].style || cur[s].color !== prev[s].color) changed.push(s);
    store.update(() => {
      store.profile.outfit = prev;
    });
    char.setOutfit(prev);
    char.pose('hips');
    for (const s of changed) this.pop(s);
    this.renderPanel();
  }

  /** 🎲 a whole new random look, revealed piece by piece. */
  private surprise(): void {
    const char = this.char;
    if (!char) return;
    this.pushHistory();
    const cur = store.profile.outfit;
    const next = structuredClone(cur);
    const pal = tuning.art.palette;
    const pickColor = () => pal[Math.floor(Math.random() * pal.length)];
    for (const s of SLOTS) {
      const n = OUTFIT_CATALOG[s].length;
      let style = Math.floor(Math.random() * n);
      if (s === 'accessory' && Math.random() < 0.2) style = 0;
      if (style === cur[s].style) style = (style + 1 + Math.floor(Math.random() * (n - 1))) % n;
      next[s].style = style;
      next[s].color = pickColor();
    }
    if (next.top.color === next.bottom.color) next.bottom.color = pal[(pal.indexOf(next.top.color) + 5) % pal.length];
    store.update(() => {
      store.profile.outfit = next;
    });
    char.pose('twirl');
    const shown = structuredClone(cur);
    SLOTS.forEach((s, i) => {
      this.later(i * tuning.dressup.surpriseStaggerMs, () => {
        shown[s] = structuredClone(next[s]);
        char.setOutfit(shown, s);
        this.pop(s);
        if (i === SLOTS.length - 1) this.renderPanel();
      });
    });
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
        this.targetDist = clamp(this.targetDist * Math.exp(e.deltaY * tuning.dressup.zoomWheel), tuning.dressup.zoomMin, tuning.dressup.zoomMax);
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

  private zoomBy(f: number): void {
    this.targetDist = clamp(this.targetDist * f, tuning.dressup.zoomMin, tuning.dressup.zoomMax);
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
      this.downX = e.clientX;
      this.downY = e.clientY;
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
      if (this.pinchDist > 0 && d > 0) this.targetDist = clamp(this.targetDist * (this.pinchDist / d), tuning.dressup.zoomMin, tuning.dressup.zoomMax);
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
    if (!this.dragging && this.pointers.size === 0 && Math.abs(this.spinVel) < 0.3) {
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

    // camera: glide to the target distance, look at the upper body when close
    const k = 1 - Math.exp(-D.zoomSmooth * dt);
    this.dist += (this.targetDist - this.dist) * k;
    this.lookBias += (this.targetBias - this.lookBias) * k;
    const close = clamp((D.zoomMax - this.dist) / (D.zoomMax - D.zoomMin), 0, 1);
    const lookY = lerp(D.lookYWide, D.lookYClose, close * close * (3 - 2 * close)) + this.lookBias * (1 - close * 0.5);
    this.camera.position.set(0, lookY + 0.2 + this.dist * 0.085, this.dist);
    this.camera.lookAt(0, lookY, 0);

    // living set: swaying garments / leaves, twinkling bulbs
    for (const s of this.sway) s.obj.rotation.z = Math.sin(t * 1.4 + s.phase) * s.amp;
    this.bulbMats.forEach((m, i) => (m.emissiveIntensity = 0.75 + 0.35 * Math.sin(t * 2.2 + i * 1.7)));
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // keep the character in the free space between the tab column and the option panel
    const wide = w >= 900 && w / h > 1.1;
    const panelW = this.panel?.offsetWidth ?? 330;
    this.viewShift = wide ? Math.round((panelW + 30 - 110) / 2) : 0;
    if (this.viewShift) this.camera.setViewOffset(w, h, this.viewShift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.ui.style.setProperty('--dr-shift', `${this.viewShift}px`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
