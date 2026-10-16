// Build scene: one orbit-camera scene with two modes.
//   TOWN  — the whole village: claim a plot (＋), visit houses, place trees/fences/lamps...
//   HOUSE — edit a plot you own: drag pieces from the palette, snap, rotate, recolor, undo.
// All changes go through store.update (autosave). Sound + squash-and-stretch come
// from the juice layer via events (piecePlaced, pieceDeleted, ...).
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus, v3, type V3 } from '../core/events';
import { tweens, ease, popScale } from '../core/tween';
import { uid, type Decoration, type DecoType, type Hex, type House, type PieceType, type PlacedPiece } from '../core/model';
import { tuning } from '../tuning';
import { addLights, skyBackground, type LightRig } from '../art/env';
import { buildTownEnvironment, type TownEnv } from '../world/townEnv';
import { PLOTS, isReserved } from '../world/townLayout';
import {
  buildTownContent, buildDecorationMesh, refillDecorationObject, buildPieceObject, PIECE_CATALOG, DECO_CATALOG, pieceDef, decoDef,
} from '../world/houseMesh';
import { Baker, Brush, bakedToGroup, ghostify, disposeBaked } from '../build/bake';
import { dims, isRoofType, isWallType, makeCtx, pieceRotY } from '../build/pieces';
import { kindOf, snapCell, canPlace, autoRotFurn, autoRotGable, faceOutward, wallAt, type Cand, type Rot } from '../build/rules';
import { OrbitCam } from '../build/orbit';
import { EditView } from '../build/editView';
import { paletteTile, type PalItem, type DragPhase } from '../build/palette';
import { el, button, tabs, swatches, confirmDialog, toast, nameTag } from '../ui/ui';

type Mode = 'town' | 'house';
type TabId = 'build' | 'furn' | 'mine';

/** What the player is currently placing. */
type Tool =
  | { kind: 'piece'; id: string; type: PieceType; color: Hex; creationId?: string; paint: boolean }
  | { kind: 'deco'; id: string; type: DecoType; color: Hex; paint: boolean }
  | { kind: 'erase'; id: string };

/** Where the current tool would land, and whether that is allowed. */
interface Target {
  ok: boolean;
  key: string;
  pos: V3;
  cand?: Cand;                       // house mode
  replace?: PlacedPiece;             // a wall this window/door would swap in for
  color?: Hex;                       // colour the piece will get (a replacement keeps the wall's colour)
  deco?: { x: number; z: number; rot: number }; // town mode
}

interface Ptr { x: number; y: number; sx: number; sy: number; t0: number; button: number; type: string }
type Gesture = 'none' | 'tap' | 'orbit' | 'pan' | 'multi' | 'paint';

/** Wall, window and door share one remembered colour so they match. */
const colorKey = (t: PieceType): string => (t === 'wall' || t === 'wallWindow' || t === 'wallDoor' ? 'wall' : t);

const KIND_ICON: Record<string, string> = { squishy: '🧸', slime: '🫧', wax: '🕯️' };
const STARTER_WALLS = ['#ffc4d6', '#bfe3ff', '#ffe2a8', '#c6f2c9', '#e0d0ff'];
const STARTER_ROOFS = ['#ff5d8f', '#5aa9ff', '#ff9f6e', '#3fbf8a', '#8f7cff'];

export class BuildScene extends GameScene {
  readonly name = 'build' as const;

  // ── world ──
  private env!: TownEnv;
  private rig!: LightRig;
  private orbit!: OrbitCam;
  private sunOffset = new THREE.Vector3(14, 30, 18);
  private staticGroup = new THREE.Group();   // every house except the one being edited (merged)
  private decoGroup = new THREE.Group();
  private markerGroup = new THREE.Group();   // dashed outlines + floating ＋ on empty plots
  private pickGroup = new THREE.Group();     // invisible tap targets
  private plotPicks: THREE.Mesh[] = [];
  private decoPicks = new Map<string, THREE.Mesh>();
  private decoObjs = new Map<string, THREE.Object3D>();
  private plusSigns: THREE.Group[] = [];
  private selMarker = new THREE.Group();
  private selRing!: THREE.Mesh;
  private selBar!: THREE.Mesh;
  private ghostHolder = new THREE.Group();
  private ghostObj: THREE.Object3D | null = null;
  private ghostKey = '';
  private ghostGoal = new THREE.Vector3();
  private ghostSnap = true;
  private ghostBob = 0;
  private ghostBaseY = 0;

  // ── state ──
  private mode: Mode = 'town';
  private plotIdx = -1;
  private house: House | null = null;
  private edit: EditView | null = null;
  private tool: Tool | null = null;
  private dragTool: Tool | null = null;
  private dragTarget: Target | null = null;
  private target: Target | null = null;
  private lastTargetKey = '';
  private sel: { kind: 'piece' | 'deco'; id: string } | null = null;
  private undoStack: (() => void)[] = [];
  private houseVer = 0;
  private tab: TabId = 'build';
  private roofsShown = true;
  private wallsLow = false;
  private lastColor = new Map<string, Hex>();
  private lastRecolor: { id: string; t: number } | null = null;
  private strokeIds: string[] = [];
  private eraseStroke: PlacedPiece[] = [];
  private eraseDecoStroke: Decoration[] = [];
  private strokeOld: PlacedPiece[] = [];     // walls swapped out during the current stroke
  private paintFirst: Target | null = null;
  private paintTimer = 0;
  private fenceRot = 0;

  // ── input ──
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hitPoint = new THREE.Vector3();
  private ptrs = new Map<number, Ptr>();
  private gesture: Gesture = 'none';
  private pinch = { d: 0, a: 0, cx: 0, cy: 0 };

  // ── DOM ──
  private hud!: HTMLDivElement;
  private tagLayer!: HTMLDivElement;
  private tags: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
  private bubble: HTMLDivElement | null = null;
  private bubbleAnchor: (() => THREE.Vector3 | null) | null = null;
  private palItems: HTMLDivElement | null = null;
  private setTabUi: ((id: string) => void) | null = null;
  private chip: HTMLDivElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private roofBtn: HTMLButtonElement | null = null;
  private wallBtn: HTMLButtonElement | null = null;
  private starterBtn: HTMLButtonElement | null = null;
  private tmpV = new THREE.Vector3();

  // ═══════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════
  init(): void {
    this.pixelRatioCap = tuning.app.townPixelRatio;
    this.fxScale = 1.5;
    skyBackground(this.scene);
    this.rig = addLights(this.scene, { shadowSize: 38, sunPos: this.sunOffset.clone() });
    this.rig.sun.shadow.mapSize.set(2048, 2048);
    this.camera.fov = 40;
    this.camera.near = 0.5;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();

    this.env = buildTownEnvironment();
    this.scene.add(this.env.group, this.staticGroup, this.decoGroup, this.markerGroup, this.pickGroup);

    // selection marker (ring for cells, bar for wall edges)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5d8f, transparent: true, opacity: 0.9, depthWrite: false });
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 8, 36), mat);
    this.selRing.rotation.x = Math.PI / 2;
    this.selBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.44), mat);
    this.selMarker.add(this.selRing, this.selBar);
    this.selMarker.visible = false;
    this.selMarker.renderOrder = 3;
    this.scene.add(this.selMarker);

    this.ghostHolder.visible = false;
    this.scene.add(this.ghostHolder);

    this.orbit = new OrbitCam(this.camera);
  }

  enter(params?: { plot?: number }): void {
    this.ui.innerHTML = '';
    this.resetState();
    this.tagLayer = el('div', '', this.ui) as HTMLDivElement;
    this.hud = el('div', '', this.ui) as HTMLDivElement;

    this.rebuildTown();
    this.setLimitsFor('town');
    const tv = this.townView();
    this.orbit.snapTo(tv.target, tv.dist, 0, tuning.build.townPitch);
    this.setShadowSize(38);
    this.buildTownHud();

    const cv = scenes.canvas;
    this.listen(cv, 'pointerdown', (e) => this.onDown(e));
    this.listen(cv, 'pointermove', (e) => this.onMove(e));
    this.listen(cv, 'pointerup', (e) => this.onUp(e, false));
    this.listen(cv, 'pointercancel', (e) => this.onUp(e, true));
    this.listen(cv, 'pointerleave', (e) => {
      // mouse wandered off to the palette: drop the hover ghost
      if (e.pointerType === 'mouse' && this.ptrs.size === 0 && !this.dragTool) this.ghostHolder.visible = false;
    });
    this.listen(cv, 'wheel', (e) => {
      e.preventDefault();
      this.orbit.zoomBy(Math.exp(e.deltaY * tuning.build.zoomWheelSpeed));
    }, { passive: false });
    this.listen(window, 'keydown', (e) => this.onKey(e));
    this.listen(window, 'resize', () => this.positionOverlays());

    const plot = params?.plot;
    if (plot !== undefined && PLOTS[plot]) {
      const h = store.houseOnPlot(plot);
      if (h && h.ownerId === store.profile.id) this.openHouse(plot, true);
      else this.orbit.snapTo(new THREE.Vector3(PLOTS[plot].center.x, 0, PLOTS[plot].center.z), 26);
    }
  }

  exit(): void {
    window.clearTimeout(this.paintTimer);
    this.closeBubble();
    this.clearGhost();
    this.edit?.dispose();
    this.edit = null;
    this.house = null;
    this.ptrs.clear();
    this.gesture = 'none';
    tweens.cancel(this.selMarker);
  }

  private resetState(): void {
    this.mode = 'town';
    this.plotIdx = -1;
    this.house = null;
    this.edit?.dispose();
    this.edit = null;
    this.tool = null;
    this.dragTool = null;
    this.dragTarget = null;
    this.target = null;
    this.sel = null;
    this.undoStack = [];
    this.tab = 'build';
    this.roofsShown = true;
    this.wallsLow = false;
    this.strokeIds = [];
    this.eraseStroke = [];
    this.eraseDecoStroke = [];
    this.paintFirst = null;
    this.ptrs.clear();
    this.gesture = 'none';
    this.selMarker.visible = false;
    this.clearGhost();
    this.bubble = null;
    this.chip = null;
  }

  resetStation(): void {
    // F1: put the camera back where it starts
    if (this.mode === 'house' && this.edit) {
      const hv = this.houseView(0.6);
      this.orbit.flyTo(hv.target, hv.dist, 0.6, tuning.build.housePitch);
    } else {
      const tv = this.townView();
      this.orbit.flyTo(tv.target, tv.dist, 0, tuning.build.townPitch);
    }
  }

  debugInfo(): Record<string, string | number> {
    return {
      mode: this.mode,
      plot: this.plotIdx,
      pieces: this.house?.pieces.length ?? 0,
      undo: this.undoStack.length,
      tool: this.tool?.id ?? '-',
    };
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Town content
  // ═══════════════════════════════════════════════════════════════════════
  private rebuildTown(): void {
    this.rebuildStatic([]);
    this.rebuildDecos();
    this.rebuildMarkers();
    this.rebuildPicks();
    this.rebuildTags();
    this.markerGroup.visible = true;
    this.tagLayer.style.display = '';
  }

  private rebuildStatic(skip: number[]): void {
    disposeBaked(this.staticGroup);
    this.staticGroup.clear();
    this.staticGroup.add(buildTownContent(store.data.town, { skipPlots: skip, decorations: false }).group);
  }

  private rebuildDecos(): void {
    disposeBaked(this.decoGroup);
    this.decoGroup.clear();
    this.decoObjs.clear();
    for (const m of this.decoPicks.values()) {
      this.pickGroup.remove(m);
      m.geometry.dispose();
    }
    this.decoPicks.clear();
    for (const d of store.data.town.decorations) this.addDecoObject(d);
  }

  private addDecoObject(d: Decoration): THREE.Object3D {
    const o = buildDecorationMesh(d);
    this.decoGroup.add(o);
    this.decoObjs.set(d.id, o);
    const h = decoDef(d.type)?.height ?? 1.5;
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h, 8));
    pick.visible = false;
    pick.position.set(d.x, h / 2, d.z);
    pick.userData.decoId = d.id;
    pick.updateMatrixWorld(true);
    this.pickGroup.add(pick);
    this.decoPicks.set(d.id, pick);
    return o;
  }

  private removeDecoObject(id: string): void {
    const o = this.decoObjs.get(id);
    if (o) {
      tweens.cancel(o);
      this.decoGroup.remove(o);
      disposeBaked(o);
      this.decoObjs.delete(id);
    }
    const p = this.decoPicks.get(id);
    if (p) {
      this.pickGroup.remove(p);
      p.geometry.dispose();
      this.decoPicks.delete(id);
    }
  }

  private rebuildPicks(): void {
    for (const m of this.plotPicks) {
      this.pickGroup.remove(m);
      m.geometry.dispose();
    }
    this.plotPicks = [];
    for (const plot of PLOTS) {
      const h = store.houseOnPlot(plot.index) ? 4.8 : 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(plot.size, h, plot.size));
      m.visible = false;
      m.position.set(plot.center.x, h / 2, plot.center.z);
      m.userData.plot = plot.index;
      m.updateMatrixWorld(true);
      this.pickGroup.add(m);
      this.plotPicks.push(m);
    }
  }

  /** Dashed outline + a floating ＋ on every plot nobody has claimed. */
  private rebuildMarkers(): void {
    disposeBaked(this.markerGroup);
    this.markerGroup.clear();
    this.plusSigns = [];
    const dashes = new Baker();
    const db = new Brush(dashes);
    for (const plot of PLOTS) {
      if (store.houseOnPlot(plot.index)) continue;
      const { x: cx, z: cz } = plot.center;
      const half = plot.size / 2 - 0.2, dash = 0.7, gap = 0.45;
      for (let t = -half + dash / 2; t < half - dash / 2 + 0.01; t += dash + gap) {
        db.rbox(cx + t, 0.11, cz - half, dash, 0.06, 0.16, '#ff8fb1', 0.03);
        db.rbox(cx + t, 0.11, cz + half, dash, 0.06, 0.16, '#ff8fb1', 0.03);
        db.rbox(cx - half, 0.11, cz + t, 0.16, 0.06, dash, '#ff8fb1', 0.03);
        db.rbox(cx + half, 0.11, cz + t, 0.16, 0.06, dash, '#ff8fb1', 0.03);
      }
      const b = new Baker();
      const br = new Brush(b);
      br.cyl(0, 0, 0, 1.25, 1.25, 0.3, '#ff8fb1', 'gloss', 28, Math.PI / 2);
      br.rbox(0, 0, 0.2, 1.3, 0.38, 0.14, '#ffffff', 0.06);
      br.rbox(0, 0, 0.2, 0.38, 1.3, 0.14, '#ffffff', 0.06);
      const sign = bakedToGroup(b.bake());
      sign.position.set(cx, 3.2, cz);
      sign.scale.setScalar(1.25);
      sign.userData.baseY = 3.2;
      sign.userData.phase = plot.index * 0.9;
      this.plusSigns.push(sign);
      this.markerGroup.add(sign);
    }
    const dg = bakedToGroup(dashes.bake());
    this.markerGroup.add(dg);
    this.markerGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = false;
    });
  }

  private rebuildTags(): void {
    this.tagLayer.innerHTML = '';
    this.tags = [];
    for (const h of store.data.town.houses) {
      const plot = PLOTS[h.plot];
      if (!plot) continue;
      const name = store.profileById(h.ownerId)?.name ?? '?';
      this.tags.push({
        el: nameTag(this.tagLayer, `🏡 ${name}`),
        pos: new THREE.Vector3(plot.center.x, tuning.build.tagHeight, plot.center.z),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Camera + light helpers
  // ═══════════════════════════════════════════════════════════════════════
  private townView(): { target: THREE.Vector3; dist: number } {
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = THREE.MathUtils.clamp(24 / (half * Math.min(this.camera.aspect, 1.6)), tuning.build.orbitMinDistance, tuning.build.orbitMaxDistance);
    return { target: new THREE.Vector3(0, 0, -14), dist };
  }

  /** Camera pose for editing the current plot (looks a little south of it so it clears the palette). */
  private houseView(yaw: number): { target: THREE.Vector3; dist: number } {
    const c = PLOTS[this.plotIdx].center;
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = THREE.MathUtils.clamp(Math.max(tuning.build.houseDistance, 4.9 / (half * this.camera.aspect)), tuning.build.houseMinDistance, tuning.build.houseMaxDistance);
    return { target: new THREE.Vector3(c.x + Math.sin(yaw) * 1.4, 0.4, c.z + Math.cos(yaw) * 1.4), dist };
  }

  private setLimitsFor(mode: Mode): void {
    const b = tuning.build;
    if (mode === 'town') this.orbit.setLimits(b.orbitMinDistance, b.orbitMaxDistance, { x0: -48, x1: 48, z0: -48, z1: 40 });
    else {
      const c = PLOTS[this.plotIdx].center;
      const r = PLOTS[this.plotIdx].size / 2 + 3;
      this.orbit.setLimits(b.houseMinDistance, b.houseMaxDistance, { x0: c.x - r, x1: c.x + r, z0: c.z - r, z1: c.z + r });
    }
  }

  private setShadowSize(s: number): void {
    const cam = this.rig.sun.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.updateProjectionMatrix();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mode switching
  // ═══════════════════════════════════════════════════════════════════════
  private claimPlot(i: number): void {
    const plot = PLOTS[i];
    const house: House = { plot: i, ownerId: store.profile.id, pieces: [] };
    store.update((d) => {
      d.town.houses.push(house);
    });
    bus.emit('plotClaimed', { pos: { x: plot.center.x, y: 1, z: plot.center.z }, plot: i });
    this.openHouse(i);
  }

  private openHouse(i: number, snap = false): void {
    const house = store.houseOnPlot(i);
    if (!house) return;
    this.closeBubble();
    this.clearGhost();
    this.mode = 'house';
    this.plotIdx = i;
    this.house = house;
    this.tool = null;
    this.sel = null;
    this.selMarker.visible = false;
    this.undoStack = [];
    this.houseVer++;
    this.tab = 'build';
    this.roofsShown = true;
    this.wallsLow = false;

    this.rebuildStatic([i]);
    this.rebuildPicks();
    this.markerGroup.visible = false;
    this.tagLayer.style.display = 'none';
    this.edit = new EditView(house, PLOTS[i]);
    this.scene.add(this.edit.root);

    this.setLimitsFor('house');
    const yaw = snap ? 0.5 : this.orbit.goalYaw;
    const hv = this.houseView(yaw);
    if (snap) this.orbit.snapTo(hv.target, hv.dist, yaw, tuning.build.housePitch);
    else this.orbit.flyTo(hv.target, hv.dist, yaw, tuning.build.housePitch);
    this.setShadowSize(12);
    this.buildHouseHud();
  }

  /** "Done" — back to the village. An empty claimed plot is given back. */
  private closeHouse(): void {
    const house = this.house;
    if (!house) return;
    const c = PLOTS[this.plotIdx].center;
    if (house.pieces.length === 0) {
      store.update((d) => {
        d.town.houses = d.town.houses.filter((h) => h !== house);
      });
    }
    this.leaveHouse(c);
  }

  private async removeHouse(): Promise<void> {
    const house = this.house;
    if (!house || house.ownerId !== store.profile.id) return;
    const ok = await confirmDialog('Remove this house?', 'Yes, remove', 'Keep it', '🗑️');
    if (!ok || this.house !== house) return;
    const c = PLOTS[this.plotIdx].center;
    store.update((d) => {
      d.town.houses = d.town.houses.filter((h) => h !== house);
    });
    bus.emit('houseDeleted', { pos: { x: c.x, y: 1.2, z: c.z }, plot: this.plotIdx });
    this.leaveHouse(c);
  }

  private leaveHouse(c: { x: number; z: number }): void {
    this.closeBubble();
    this.clearGhost();
    this.edit?.dispose();
    this.edit = null;
    this.house = null;
    this.mode = 'town';
    this.tool = null;
    this.dragTool = null;
    this.sel = null;
    this.selMarker.visible = false;
    this.undoStack = [];
    this.plotIdx = -1;
    this.rebuildTown();
    this.setLimitsFor('town');
    this.orbit.flyTo(new THREE.Vector3(c.x, 0, c.z), 34, undefined, tuning.build.townPitch);
    this.setShadowSize(38);
    this.buildTownHud();
  }

  private visitHouse(i: number): void {
    const h = store.houseOnPlot(i);
    const plot = PLOTS[i];
    const name = (h && store.profileById(h.ownerId)?.name) ?? 'someone';
    this.orbit.flyTo(new THREE.Vector3(plot.center.x, 0, plot.center.z), 22, undefined, tuning.build.townPitch);
    bus.emit('pieceSelected', { pos: { x: plot.center.x, y: 1, z: plot.center.z } });
    toast(`This is ${name}'s house 🏡`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════════════════════
  private clearHud(): void {
    this.hud.innerHTML = '';
    this.palItems = null;
    this.setTabUi = null;
    this.chip = null;
    this.undoBtn = null;
    this.roofBtn = null;
    this.wallBtn = null;
    this.starterBtn = null;
  }

  private buildTownHud(): void {
    this.clearHud();
    const hud = this.hud;
    const tr = el('div', 'tr row', hud);
    this.undoBtn = button(tr, { icon: '↶', cls: 'round', tap: 'back' }, () => this.doUndo());
    button(tr, { icon: '🚗', label: 'Drive', cls: 'blue big' }, () => void scenes.go('town'));
    el('div', 'bhint', hud, 'Tap ＋ to build 🏡');

    const wrap = el('div', 'bpal', hud);
    this.palItems = el('div', 'panel bpal-items', wrap) as HTMLDivElement;
    this.fillPalette();
    this.refreshHud();
  }

  private buildHouseHud(): void {
    this.clearHud();
    const hud = this.hud;
    const tr = el('div', 'tr row', hud);
    this.undoBtn = button(tr, { icon: '↶', cls: 'round', tap: 'back' }, () => this.doUndo());
    this.roofBtn = button(tr, { icon: '🏠', cls: 'round' }, () => this.setRoofs(!this.roofsShown));
    this.wallBtn = button(tr, { icon: '🧱', cls: 'round' }, () => this.setWalls(!this.wallsLow));
    button(tr, { icon: '✔️', label: 'Done', cls: 'mint big' }, () => this.closeHouse());

    const lc = el('div', 'lc col', hud);
    this.starterBtn = button(lc, { icon: '🪄', label: 'Starter', cls: 'butter bob' }, () => this.stampStarter());
    button(lc, { icon: '🗑️', cls: 'round ghost' }, () => void this.removeHouse());

    const wrap = el('div', 'bpal', hud);
    this.setTabUi = tabs(
      wrap,
      [
        { id: 'build', icon: '🧱', label: 'Build' },
        { id: 'furn', icon: '🛋️', label: 'Furniture' },
        { id: 'mine', icon: '⭐', label: 'Mine' },
      ],
      this.tab,
      (id) => this.switchTab(id as TabId),
    );
    this.palItems = el('div', 'panel bpal-items', wrap) as HTMLDivElement;
    this.fillPalette();
    this.refreshHud();
  }

  private refreshHud(): void {
    if (this.undoBtn) this.undoBtn.disabled = this.undoStack.length === 0;
    if (this.starterBtn) this.starterBtn.style.display = this.house && this.house.pieces.length === 0 ? '' : 'none';
    if (this.roofBtn) this.roofBtn.querySelector('.ico')!.textContent = this.roofsShown ? '🏠' : '👀';
    this.wallBtn?.classList.toggle('selected', this.wallsLow);
  }

  private switchTab(id: TabId): void {
    this.tab = id;
    this.setTool(null);
    // furnish with the roof off, build with it on
    this.setRoofs(id === 'build');
    this.fillPalette();
  }

  private fillPalette(): void {
    const box = this.palItems;
    if (!box) return;
    box.innerHTML = '';
    const items: PalItem[] = [];
    if (this.mode === 'town') {
      for (const d of DECO_CATALOG) items.push({ id: `d:${d.type}`, icon: d.icon, label: d.name, dot: d.color, data: { kind: 'deco', def: d } });
      items.push({ id: 'erase', icon: '🧹', label: 'Erase', data: { kind: 'erase' } });
    } else if (this.tab === 'build') {
      for (const d of PIECE_CATALOG) if (d.cat === 'build') items.push({ id: `p:${d.type}`, icon: d.icon, label: d.name, dot: this.lastColor.get(colorKey(d.type)) ?? d.color, data: { kind: 'piece', type: d.type } });
      items.push({ id: 'erase', icon: '🧹', label: 'Erase', data: { kind: 'erase' } });
    } else if (this.tab === 'furn') {
      for (const d of PIECE_CATALOG) if (d.cat === 'furniture') items.push({ id: `p:${d.type}`, icon: d.icon, label: d.name, dot: this.lastColor.get(colorKey(d.type)) ?? d.color, data: { kind: 'piece', type: d.type } });
      items.push({ id: 'erase', icon: '🧹', label: 'Erase', data: { kind: 'erase' } });
    } else {
      for (const c of store.profile.creations) {
        items.push({ id: `c:${c.id}`, icon: KIND_ICON[c.kind] ?? '⭐', label: c.shape ?? c.kind, dot: c.color, data: { kind: 'piece', type: 'creation', creationId: c.id } });
      }
    }
    if (items.length === 0) {
      const empty = el('div', 'bempty', box);
      el('span', 'ico', empty, '🧪');
      button(empty, { label: 'Make something!', cls: 'peach' }, () => void scenes.go('workshop'));
      return;
    }
    for (const it of items) {
      const tile = paletteTile(box, it, {
        onTap: (item) => this.onTileTap(item),
        onDrag: (item, x, y, phase, touch) => this.onTileDrag(item, x, y, phase, touch),
      });
      if (this.tool?.id === it.id) tile.classList.add('on');
    }
  }

  private toolFromItem(it: PalItem): Tool {
    const d = it.data as { kind: string; type?: PieceType; def?: { type: DecoType; color: Hex; paint: boolean }; creationId?: string };
    if (d.kind === 'erase') return { kind: 'erase', id: it.id };
    if (d.kind === 'deco') return { kind: 'deco', id: it.id, type: d.def!.type, color: d.def!.color, paint: d.def!.paint };
    const def = pieceDef(d.type!);
    return {
      kind: 'piece',
      id: it.id,
      type: d.type!,
      color: this.lastColor.get(colorKey(d.type!)) ?? def?.color ?? '#ffffff',
      creationId: d.creationId,
      paint: def?.paint ?? false,
    };
  }

  /** Tap a tile: arm it as a brush (tap the world to place, drag to paint); tap again to put it down. */
  private onTileTap(it: PalItem): void {
    this.deselect();
    this.setTool(this.tool?.id === it.id ? null : this.toolFromItem(it));
  }

  private setTool(t: Tool | null): void {
    this.tool = t;
    this.clearGhost();
    this.palItems?.querySelectorAll('.ptile').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.id === t?.id));
    this.chip?.remove();
    this.chip = null;
    const hint = this.hud.querySelector('.bhint') as HTMLElement | null;
    if (hint) hint.style.display = t ? 'none' : '';
    if (t) {
      const icon = (this.palItems?.querySelector(`.ptile[data-id="${t.id}"] .ico`) as HTMLElement | null)?.textContent ?? '✨';
      const chip = el('div', 'bchip', this.hud);
      el('span', 'ico', chip, icon);
      el('span', '', chip, t.kind === 'erase' ? 'Tap to erase' : 'Tap or drag');
      button(chip, { icon: '✖️', cls: 'round ghost', tap: 'back' }, () => this.setTool(null));
      this.chip = chip;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Input
  // ═══════════════════════════════════════════════════════════════════════
  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.setTool(null);
      this.deselect();
    } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.doUndo();
    } else if (e.key === 'r' || e.key === 'R') {
      if (this.sel) this.rotateSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.sel) this.deleteSelected();
    }
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    try {
      scenes.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), button: e.button, type: e.pointerType });
    if (this.ptrs.size >= 2) {
      this.cancelPaint();
      this.gesture = 'multi';
      this.startMulti();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) {
      this.gesture = 'pan';
      return;
    }
    if (this.tool) {
      this.gesture = 'paint';
      this.paintStart(e);
      return;
    }
    this.gesture = 'tap';
  }

  private onMove(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      // mouse hover: show the ghost for the armed brush
      if (e.pointerType === 'mouse' && this.tool && this.tool.kind !== 'erase') this.updateTargetFor(this.tool, e.clientX, e.clientY, 0);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    switch (this.gesture) {
      case 'tap':
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > tuning.build.tapMaxPx) this.gesture = 'orbit';
        break;
      case 'orbit':
        this.orbit.orbit(dx, dy);
        break;
      case 'pan':
        this.orbit.panPx(dx, dy, window.innerHeight);
        break;
      case 'multi':
        this.updateMulti();
        break;
      case 'paint':
        this.paintMove(e);
        break;
      default:
        break;
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    try {
      scenes.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!p) return;
    if (this.gesture === 'tap' && !cancelled) {
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      if (moved <= tuning.build.tapMaxPx && performance.now() - p.t0 <= tuning.build.tapMaxMs) this.onTap(e.clientX, e.clientY);
    } else if (this.gesture === 'paint') {
      this.paintEnd(e, cancelled);
    }
    if (this.ptrs.size === 0) this.gesture = 'none';
    else if (this.gesture !== 'multi') this.gesture = 'none';
    else if (this.ptrs.size === 1) this.gesture = 'none';
  }

  private startMulti(): void {
    const [a, b] = [...this.ptrs.values()];
    this.pinch.d = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinch.a = Math.atan2(b.y - a.y, b.x - a.x);
    this.pinch.cx = (a.x + b.x) / 2;
    this.pinch.cy = (a.y + b.y) / 2;
  }

  /** Two fingers: pinch = zoom, drag = pan, twist = turn the view. */
  private updateMulti(): void {
    if (this.ptrs.size < 2) return;
    const [a, b] = [...this.ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (this.pinch.d > 8 && d > 8) this.orbit.zoomBy(this.pinch.d / d);
    let da = ang - this.pinch.a;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    this.orbit.rotateYaw(-da);
    this.orbit.panPx(cx - this.pinch.cx, cy - this.pinch.cy, window.innerHeight);
    this.pinch.d = d;
    this.pinch.a = ang;
    this.pinch.cx = cx;
    this.pinch.cy = cy;
  }

  // ── Tap on the world ──
  private onTap(x: number, y: number): void {
    this.setRay(x, y);
    if (this.mode === 'town') {
      const hits = this.ray.intersectObjects([...this.decoPicks.values(), ...this.plotPicks], false);
      const h = hits[0];
      if (!h) {
        this.deselect();
        return;
      }
      const decoId = h.object.userData.decoId as string | undefined;
      if (decoId) {
        this.selectDeco(decoId);
        return;
      }
      this.deselect();
      const i = h.object.userData.plot as number;
      const house = store.houseOnPlot(i);
      if (!house) this.claimPlot(i);
      else if (house.ownerId === store.profile.id) this.openHouse(i);
      else this.visitHouse(i);
      return;
    }
    if (!this.edit) return;
    const hits = this.ray.intersectObjects(this.edit.pickLayers(), true);
    for (const h of hits) {
      const p = this.edit.pieceFromObject(h.object);
      if (p) {
        this.selectPiece(p);
        return;
      }
    }
    this.deselect();
  }

  // ── Ray helpers ──
  private setRay(x: number, y: number): void {
    const r = scenes.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
  }

  private groundHit(x: number, y: number, py: number): THREE.Vector3 | null {
    this.setRay(x, y);
    this.plane.constant = -py;
    return this.ray.ray.intersectPlane(this.plane, this.hitPoint);
  }

  private overCanvas(x: number, y: number): boolean {
    return document.elementFromPoint(x, y) === scenes.canvas;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Ghost + targets
  // ═══════════════════════════════════════════════════════════════════════
  private clearGhostObj(): void {
    if (this.ghostObj) {
      this.ghostHolder.remove(this.ghostObj);
      disposeBaked(this.ghostObj);
      this.ghostObj = null;
    }
    this.ghostKey = '';
  }

  private clearGhost(): void {
    this.clearGhostObj();
    this.ghostHolder.visible = false;
    this.target = null;
    this.lastTargetKey = '';
  }

  private setGhost(key: string, make: () => THREE.Object3D, ok: boolean, goal: THREE.Vector3, parent: THREE.Object3D): void {
    if (this.ghostHolder.parent !== parent) {
      this.ghostHolder.parent?.remove(this.ghostHolder);
      parent.add(this.ghostHolder);
      this.ghostSnap = true;
    }
    if (key !== this.ghostKey) {
      this.clearGhostObj();
      const o = make();
      this.ghostBaseY = o.position.y;   // roofs pivot at wall height
      o.position.x = 0;
      o.position.z = 0;
      ghostify(o, ok);
      this.ghostHolder.add(o);
      this.ghostObj = o;
      this.ghostKey = key;
    }
    if (!this.ghostHolder.visible || this.ghostSnap) {
      this.ghostHolder.position.copy(goal);
      this.ghostSnap = false;
    }
    this.ghostHolder.visible = true;
    this.ghostGoal.copy(goal);
  }

  /** Work out where `tool` would land for a pointer position, and show the ghost there. */
  private computeTarget(tool: Tool, x: number, y: number, lift: number): Target | null {
    if (this.mode === 'house' && this.edit && this.house && tool.kind === 'piece') {
      const { S, FL } = dims();
      const plot = this.edit.plot;
      const hit = this.groundHit(x, y - lift, FL);
      if (!hit) return null;
      const gx = (hit.x - plot.origin.x) / S, gz = (hit.z - plot.origin.z) / S;
      const kind = kindOf(tool.type);
      const sn = snapCell(kind, gx, gz);
      let rot: Rot = sn.rot;
      const ctx = this.edit.ctx;
      if (kind === 'furn') rot = autoRotFurn(ctx, sn.x, sn.z, 0);
      else if (tool.type === 'roofGable') rot = autoRotGable(this.house.pieces, ctx, sn.x, sn.z);
      let cand: Cand = { type: tool.type, x: sn.x, z: sn.z, rot };
      if (kind === 'edge') cand = faceOutward(this.house.pieces, cand);
      let ok = sn.inside && canPlace(this.house.pieces, cand);
      let replace: PlacedPiece | undefined;
      if (!ok && sn.inside && kind === 'edge') {
        // dropping a window/door on an existing wall swaps it in
        const w = wallAt(this.house.pieces, cand);
        if (w && w.type !== cand.type && canPlace(this.house.pieces, cand, w.id)) {
          ok = true;
          replace = w;
        }
      }
      const color = replace?.color ?? tool.color;
      return {
        ok, cand, replace, color,
        key: `${cand.type}|${cand.x}|${cand.z}|${cand.rot}|${replace?.id ?? ''}`,
        pos: this.edit.worldPos(this.fake(tool, cand, color), 0.3),
      };
    }
    if (this.mode === 'town' && tool.kind === 'deco') {
      const hit = this.groundHit(x, y - lift, 0);
      if (!hit) return null;
      const dx = Math.round(hit.x), dz = Math.round(hit.z);
      const taken = store.data.town.decorations.some((d) => d.x === dx && d.z === dz);
      const ok = !isReserved(dx, dz) && !taken;
      let rot = 0;
      if (tool.type === 'fence') rot = this.fenceRotAt(dx, dz);
      return { ok, deco: { x: dx, z: dz, rot }, key: `${tool.type}|${dx}|${dz}`, pos: { x: dx, y: 0.4, z: dz } };
    }
    return null;
  }

  /** Fences line up with a neighbouring fence, else keep the last direction. */
  private fenceRotAt(x: number, z: number): number {
    const at = (px: number, pz: number) => store.data.town.decorations.find((d) => d.type === 'fence' && d.x === px && d.z === pz);
    const n = at(x + 1, z) ?? at(x - 1, z) ?? at(x, z + 1) ?? at(x, z - 1);
    if (n) this.fenceRot = n.rot;
    return this.fenceRot;
  }

  private fake(tool: Extract<Tool, { kind: 'piece' }>, c: Cand, color: Hex = tool.color): PlacedPiece {
    return { id: 'ghost', type: c.type, x: c.x, z: c.z, rot: c.rot, color, creationId: tool.creationId };
  }

  /** Compute + display the target; returns it. */
  private updateTargetFor(tool: Tool, x: number, y: number, lift: number): Target | null {
    const t = tool.kind === 'erase' ? null : this.computeTarget(tool, x, y, lift);
    this.target = t;
    if (!t) {
      this.ghostHolder.visible = false;
      return null;
    }
    const { S } = dims();
    if (t.cand && tool.kind === 'piece' && this.edit && this.house) {
      const color = t.color ?? tool.color;
      const fake = this.fake(tool, t.cand, color);
      const goal = new THREE.Vector3((t.cand.x + 0.5) * S, 0, (t.cand.z + 0.5) * S);
      const house = this.house;
      this.setGhost(`${t.key}|${t.ok}|${color}|${this.houseVer}`, () => buildPieceObject(fake, makeCtx([...house.pieces, fake])), t.ok, goal, this.edit.root);
    } else if (t.deco && tool.kind === 'deco') {
      const d: Decoration = { id: 'ghost', type: tool.type, x: t.deco.x, z: t.deco.z, rot: t.deco.rot, color: tool.color, ownerId: store.profile.id };
      this.setGhost(`${t.key}|${t.ok}|${tool.color}|${t.deco.rot}`, () => buildDecorationMesh(d), t.ok, new THREE.Vector3(d.x, 0, d.z), this.scene);
      // the deco mesh carries its own rotation; the holder only moves it
      if (this.ghostObj) this.ghostObj.rotation.y = d.rot;
    }
    if (t.key !== this.lastTargetKey) {
      this.lastTargetKey = t.key;
      bus.emit('ghostMoved', { pos: t.pos });
    }
    return t;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Palette drag (drag a tile out into the world)
  // ═══════════════════════════════════════════════════════════════════════
  private onTileDrag(it: PalItem, x: number, y: number, phase: DragPhase, touch: boolean): void {
    if (phase === 'start') {
      const t = this.toolFromItem(it);
      this.dragTool = t.kind === 'erase' ? null : t;
      this.dragTarget = null;
      this.deselect();
      if (this.dragTool) this.setTool(null);
    }
    const tool = this.dragTool;
    if (!tool) return;
    if (phase === 'cancel') {
      this.clearGhost();
      this.dragTool = null;
      return;
    }
    if (!this.overCanvas(x, y)) {
      this.ghostHolder.visible = false;
      this.dragTarget = null;
      if (phase === 'end') {
        this.clearGhost();
        this.dragTool = null;
      }
      return;
    }
    this.dragTarget = this.updateTargetFor(tool, x, y, touch ? tuning.build.touchLift : 0);
    if (phase === 'end') {
      const t = this.dragTarget;
      if (t) this.commit(tool, t, false);
      this.clearGhost();
      this.dragTool = null;
      this.dragTarget = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Painting with an armed brush
  // ═══════════════════════════════════════════════════════════════════════
  private paintStart(e: PointerEvent): void {
    const tool = this.tool!;
    this.strokeIds = [];
    this.strokeOld = [];
    this.eraseStroke = [];
    this.eraseDecoStroke = [];
    this.paintFirst = null;
    if (tool.kind === 'erase') {
      this.eraseAt(e.clientX, e.clientY);
      return;
    }
    const t = this.updateTargetFor(tool, e.clientX, e.clientY, 0);
    if (!t || !tool.paint) return;
    this.paintFirst = t;
    // a finger might be about to become a two-finger gesture: wait a beat before the first stamp
    if (e.pointerType === 'mouse') this.commitFirst();
    else this.paintTimer = window.setTimeout(() => this.commitFirst(), 90);
  }

  private commitFirst(): void {
    window.clearTimeout(this.paintTimer);
    const tool = this.tool, t = this.paintFirst;
    this.paintFirst = null;
    if (tool && t && this.gesture === 'paint') this.commit(tool, t, true);
  }

  private paintMove(e: PointerEvent): void {
    const tool = this.tool;
    if (!tool) return;
    if (tool.kind === 'erase') {
      this.eraseAt(e.clientX, e.clientY);
      return;
    }
    const prev = this.target?.key;
    const t = this.updateTargetFor(tool, e.clientX, e.clientY, 0);
    if (!t || !tool.paint || t.key === prev) return;
    this.commitFirst();
    this.commit(tool, t, true, true);
  }

  private paintEnd(e: PointerEvent, cancelled: boolean): void {
    const tool = this.tool;
    window.clearTimeout(this.paintTimer);
    if (tool && !cancelled) {
      if (tool.kind === 'erase') {
        /* strokes finish below */
      } else if (tool.paint) {
        this.commitFirst();
      } else {
        const t = this.updateTargetFor(tool, e.clientX, e.clientY, 0);
        if (t) this.commit(tool, t, false);
      }
    }
    this.finishStroke();
    if (e.pointerType !== 'mouse') this.clearGhost();
  }

  private cancelPaint(): void {
    window.clearTimeout(this.paintTimer);
    this.paintFirst = null;
    this.finishStroke();
    if (this.gesture === 'paint') this.clearGhost();
  }

  /** Bundle everything a stroke placed/erased into ONE undo step. */
  private finishStroke(): void {
    if (this.mode === 'house' && this.house && this.edit) {
      if (this.strokeIds.length) {
        const ids = this.strokeIds.slice();
        const old = this.strokeOld.slice();
        this.pushUndo(() => {
          this.undoPlaced(ids);
          if (old.length) this.undoErased(old);
        });
      }
      if (this.eraseStroke.length) {
        const gone = this.eraseStroke.slice();
        this.pushUndo(() => this.undoErased(gone));
      }
    } else if (this.mode === 'town') {
      if (this.strokeIds.length) {
        const ids = this.strokeIds.slice();
        this.pushUndo(() => this.undoDecoPlaced(ids));
      }
      if (this.eraseDecoStroke.length) {
        const gone = this.eraseDecoStroke.slice();
        this.pushUndo(() => this.undoDecoErased(gone));
      }
    }
    this.strokeIds = [];
    this.strokeOld = [];
    this.eraseStroke = [];
    this.eraseDecoStroke = [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Placing / erasing
  // ═══════════════════════════════════════════════════════════════════════
  /** Place at a target. `inStroke` collects it into the running stroke's undo step. */
  private commit(tool: Tool, t: Target, inStroke: boolean, quietBlock = false): boolean {
    if (!t.ok) {
      if (!quietBlock) bus.emit('placementBlocked', { pos: t.pos });
      return false;
    }
    if (tool.kind === 'piece' && t.cand) {
      const old = t.replace;
      if (old) this.removePieceData(old, false);
      const p = this.placePiece(tool, t.cand, t.color ?? tool.color);
      if (inStroke) {
        this.strokeIds.push(p.id);
        if (old) this.strokeOld.push(old);
      } else {
        this.pushUndo(() => {
          this.undoPlaced([p.id]);
          if (old) this.undoErased([old]);
        });
      }
      return true;
    }
    if (tool.kind === 'deco' && t.deco) {
      const d = this.placeDeco(tool, t.deco);
      if (inStroke) this.strokeIds.push(d.id);
      else this.pushUndo(() => this.undoDecoPlaced([d.id]));
      return true;
    }
    return false;
  }

  private fxPos(p: PlacedPiece): V3 {
    const { H, FL } = dims();
    return this.edit!.worldPos(p, isRoofType(p.type) ? H + 0.3 : isWallType(p.type) ? 0.5 : FL + 0.25);
  }

  private placePiece(tool: Extract<Tool, { kind: 'piece' }>, c: Cand, color: Hex): PlacedPiece {
    const house = this.house!, edit = this.edit!;
    const piece: PlacedPiece = { id: uid('pc_'), type: c.type, x: c.x, z: c.z, rot: c.rot, color };
    if (tool.creationId) piece.creationId = tool.creationId;
    store.update(() => {
      house.pieces.push(piece);
    });
    const obj = edit.add(piece);
    this.houseVer++;
    this.ghostKey = '';
    bus.emit('piecePlaced', { pos: this.fxPos(piece), type: piece.type, object: obj });
    this.refreshHud();
    return piece;
  }

  private placeDeco(tool: Extract<Tool, { kind: 'deco' }>, at: { x: number; z: number; rot: number }): Decoration {
    const d: Decoration = { id: uid('d_'), type: tool.type, x: at.x, z: at.z, rot: at.rot, color: tool.color, ownerId: store.profile.id };
    store.update((s) => {
      s.town.decorations.push(d);
    });
    const obj = this.addDecoObject(d);
    this.ghostKey = '';
    bus.emit('piecePlaced', { pos: { x: d.x, y: 0.3, z: d.z }, type: d.type, object: obj });
    this.refreshHud();
    return d;
  }

  /** Erase brush: remove whatever is under the pointer. */
  private eraseAt(x: number, y: number): void {
    this.setRay(x, y);
    if (this.mode === 'house' && this.edit && this.house) {
      for (const h of this.ray.intersectObjects(this.edit.pickLayers(), true)) {
        const p = this.edit.pieceFromObject(h.object);
        if (!p) continue;
        this.removePieceData(p, true);
        this.eraseStroke.push(p);
        return;
      }
    } else if (this.mode === 'town') {
      const h = this.ray.intersectObjects([...this.decoPicks.values()], false)[0];
      const id = h?.object.userData.decoId as string | undefined;
      const d = id ? store.data.town.decorations.find((q) => q.id === id) : undefined;
      if (!d) return;
      if (d.ownerId !== store.profile.id) {
        this.notMine(d.ownerId);
        return;
      }
      this.removeDecoData(d, true);
      this.eraseDecoStroke.push(d);
    }
  }

  private removePieceData(p: PlacedPiece, fx: boolean): void {
    const house = this.house!, edit = this.edit!;
    const pos = this.fxPos(p);
    store.update(() => {
      const i = house.pieces.indexOf(p);
      if (i >= 0) house.pieces.splice(i, 1);
    });
    edit.remove(p);
    this.houseVer++;
    this.ghostKey = '';
    if (this.sel?.id === p.id) this.deselect();
    if (fx) bus.emit('pieceDeleted', { pos, type: p.type });
    this.refreshHud();
  }

  private removeDecoData(d: Decoration, fx: boolean): void {
    store.update((s) => {
      const i = s.town.decorations.indexOf(d);
      if (i >= 0) s.town.decorations.splice(i, 1);
    });
    this.removeDecoObject(d.id);
    if (this.sel?.id === d.id) this.deselect();
    if (fx) bus.emit('pieceDeleted', { pos: { x: d.x, y: 0.4, z: d.z }, type: d.type });
    this.refreshHud();
  }

  private notMine(ownerId: string): void {
    const name = store.profileById(ownerId)?.name ?? 'someone';
    toast(`That one is ${name}'s 🌳`);
  }

  // ── Undo ──
  private pushUndo(fn: () => void): void {
    this.lastRecolor = null;
    this.undoStack.push(fn);
    if (this.undoStack.length > tuning.build.maxUndo) this.undoStack.shift();
    this.refreshHud();
  }

  private doUndo(): void {
    const fn = this.undoStack.pop();
    if (!fn) return;
    this.lastRecolor = null;
    this.deselect();
    fn();
    bus.emit('undo', {});
    this.refreshHud();
  }

  private undoPlaced(ids: string[]): void {
    const house = this.house;
    if (!house || !this.edit) return;
    let first = true;
    for (const id of ids) {
      const p = house.pieces.find((q) => q.id === id);
      if (!p) continue;
      this.removePieceData(p, first && ids.length <= 3);
      first = false;
    }
  }

  private undoErased(gone: PlacedPiece[]): void {
    const house = this.house;
    if (!house || !this.edit) return;
    store.update(() => {
      house.pieces.push(...gone);
    });
    const edit = this.edit;
    edit.ctx = makeCtx(house.pieces);
    for (const p of gone) {
      const o = edit.add(p, false);
      popScale(o, 0.3, 0.2);
    }
    edit.refreshAll();
    this.houseVer++;
    this.ghostKey = '';
    this.refreshHud();
  }

  private undoDecoPlaced(ids: string[]): void {
    for (const id of ids) {
      const d = store.data.town.decorations.find((q) => q.id === id);
      if (d) this.removeDecoData(d, ids.length <= 3);
    }
  }

  private undoDecoErased(gone: Decoration[]): void {
    store.update((s) => {
      s.town.decorations.push(...gone);
    });
    for (const d of gone) popScale(this.addDecoObject(d), 0.3, 0.2);
    this.refreshHud();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Selection + bubble
  // ═══════════════════════════════════════════════════════════════════════
  private deselect(): void {
    this.sel = null;
    this.selMarker.visible = false;
    this.closeBubble();
  }

  private selectPiece(p: PlacedPiece): void {
    if (!this.house || !this.edit) return;
    this.closeBubble();
    this.sel = { kind: 'piece', id: p.id };
    this.placeMarker(p);
    bus.emit('pieceSelected', { pos: this.fxPos(p) });
    if (this.house.ownerId !== store.profile.id) {
      toast("Only the owner can change this 🏡");
      return;
    }
    const canRot = !(p.type === 'floor' || p.type === 'roofFlat' || p.type === 'rug' || p.type === 'table' || p.type === 'lamp' || p.type === 'plant');
    const canColor = p.type !== 'creation';
    const edit = this.edit;
    this.openBubble({
      rotate: canRot,
      color: canColor,
      current: p.color,
      anchor: () => edit.topPoint(p, this.tmpV),
      onRotate: () => this.rotateSelected(),
      onColor: (c) => this.recolorSelected(c),
      onDelete: () => this.deleteSelected(),
    });
  }

  private selectDeco(id: string): void {
    const d = store.data.town.decorations.find((q) => q.id === id);
    if (!d) return;
    this.closeBubble();
    this.sel = { kind: 'deco', id };
    this.placeMarker(d);
    bus.emit('pieceSelected', { pos: { x: d.x, y: 0.4, z: d.z } });
    if (d.ownerId !== store.profile.id) {
      this.notMine(d.ownerId);
      return;
    }
    const h = decoDef(d.type)?.height ?? 1.5;
    this.openBubble({
      rotate: d.type !== 'streetLamp',
      color: true,
      current: d.color,
      anchor: () => this.tmpV.set(d.x, h + 0.2, d.z),
      onRotate: () => this.rotateSelected(),
      onColor: (c) => this.recolorSelected(c),
      onDelete: () => this.deleteSelected(),
    });
  }

  /** Ring on the ground (or a bar along a wall edge) around the selected thing. */
  private placeMarker(t: PlacedPiece | Decoration): void {
    this.selMarker.visible = true;
    this.selMarker.scale.setScalar(1);
    if ('ownerId' in t) {
      this.selMarker.position.set(t.x, 0.14, t.z);
      this.selMarker.rotation.y = 0;
      this.selRing.visible = true;
      this.selBar.visible = false;
      this.selRing.scale.setScalar(1.05);
      return;
    }
    const w = this.edit!.worldPos(t, 0.14);
    const { H, FL } = dims();
    if (isWallType(t.type)) {
      this.selBar.visible = true;
      this.selRing.visible = false;
      this.selMarker.position.set(w.x, 0.14, w.z);
      this.selMarker.rotation.y = t.rot % 2 ? Math.PI / 2 : 0;
    } else {
      this.selBar.visible = false;
      this.selRing.visible = true;
      this.selRing.scale.setScalar(1);
      this.selMarker.rotation.y = 0;
      this.selMarker.position.set(w.x, isRoofType(t.type) ? H + 0.3 : FL + 0.04, w.z);
    }
  }

  private openBubble(o: {
    rotate: boolean;
    color: boolean;
    current: Hex;
    anchor: () => THREE.Vector3 | null;
    onRotate: () => void;
    onColor: (c: Hex) => void;
    onDelete: () => void;
  }): void {
    this.closeBubble();
    const b = el('div', 'bbubble panel', this.ui) as HTMLDivElement;
    const row = el('div', 'row', b);
    if (o.rotate) button(row, { icon: '⟳', cls: 'round' }, o.onRotate);
    let tray: HTMLDivElement | null = null;
    if (o.color) {
      button(row, { icon: '🎨', cls: 'round' }, () => {
        if (tray) {
          tray.style.display = tray.style.display === 'none' ? '' : 'none';
          return;
        }
        tray = el('div', '', b) as HTMLDivElement;
        swatches(tray, tuning.art.palette, o.current, o.onColor, 'wide');
      });
    }
    button(row, { icon: '🗑️', cls: 'round' }, o.onDelete);
    this.bubble = b;
    this.bubbleAnchor = o.anchor;
    this.positionOverlays();
  }

  private closeBubble(): void {
    this.bubble?.remove();
    this.bubble = null;
    this.bubbleAnchor = null;
  }

  // ── Selected piece / decoration actions ──
  private selectedPiece(): PlacedPiece | undefined {
    if (!this.sel || this.sel.kind !== 'piece' || !this.house) return undefined;
    return this.house.pieces.find((p) => p.id === this.sel!.id);
  }

  private selectedDeco(): Decoration | undefined {
    if (!this.sel || this.sel.kind !== 'deco') return undefined;
    return store.data.town.decorations.find((d) => d.id === this.sel!.id);
  }

  private rotateSelected(): void {
    const p = this.selectedPiece();
    if (p && this.edit && this.house) {
      const from = p.rot;
      let to: Rot = ((from + 1) % 4) as Rot;
      if (isWallType(p.type)) {
        // a wall swings to the next free edge of its cell
        let found = false;
        for (let s = 1; s <= 3; s++) {
          const r = ((from + s) % 4) as Rot;
          if (canPlace(this.house.pieces, { type: p.type, x: p.x, z: p.z, rot: r }, p.id)) {
            to = r;
            found = true;
            break;
          }
        }
        if (!found) {
          bus.emit('placementBlocked', { pos: this.fxPos(p) });
          return;
        }
      }
      this.setRotation(p, to);
      this.pushUndo(() => this.setRotation(p, from, true));
      return;
    }
    const d = this.selectedDeco();
    if (d) {
      const from = d.rot;
      const to = from + Math.PI / 2;
      this.setDecoRotation(d, to);
      this.pushUndo(() => this.setDecoRotation(d, from, true));
    }
  }

  private setRotation(p: PlacedPiece, rot: Rot, quiet = false): void {
    const edit = this.edit!;
    const obj = edit.objs.get(p.id);
    let steps = (rot - p.rot + 4) % 4;
    if (steps === 3) steps = -1;   // undoing a quarter turn swings back the short way
    store.update(() => {
      p.rot = rot;
    });
    this.houseVer++;
    edit.update(p);
    if (obj && !isRoofType(p.type) && steps !== 0) {
      const a0 = obj.rotation.y, a1 = a0 - steps * (Math.PI / 2);
      const end = pieceRotY(p);
      tweens.add(0.22, (k) => (obj.rotation.y = a0 + (a1 - a0) * k), { ease: ease.outBack, key: obj.rotation, done: () => (obj.rotation.y = end) });
    }
    if (this.sel?.id === p.id) this.placeMarker(p);
    if (!quiet) bus.emit('pieceRotated', { pos: this.fxPos(p), object: obj });
  }

  private setDecoRotation(d: Decoration, rot: number, quiet = false): void {
    const obj = this.decoObjs.get(d.id);
    store.update(() => {
      d.rot = rot;
    });
    if (obj) {
      const a0 = obj.rotation.y;
      tweens.add(0.22, (k) => (obj.rotation.y = a0 + (rot - a0) * k), { ease: ease.outBack, key: obj.rotation, done: () => (obj.rotation.y = rot) });
    }
    if (!quiet) bus.emit('pieceRotated', { pos: { x: d.x, y: 0.5, z: d.z }, object: obj });
  }

  private recolorSelected(color: Hex): void {
    const p = this.selectedPiece();
    if (p && this.edit) {
      const orig = p.color;
      if (orig === color) return;
      const merge = this.lastRecolor && this.lastRecolor.id === p.id && performance.now() - this.lastRecolor.t < tuning.build.undoMergeMs;
      store.update(() => {
        p.color = color;
      });
      this.edit.update(p);
      this.houseVer++;
      this.lastColor.set(colorKey(p.type), color);
      const obj = this.edit.objs.get(p.id);
      bus.emit('pieceRecolored', { pos: this.fxPos(p), object: obj });
      if (merge) this.lastRecolor!.t = performance.now();
      else {
        this.pushUndo(() => {
          store.update(() => {
            p.color = orig;
          });
          this.edit?.update(p);
          this.houseVer++;
        });
        this.lastRecolor = { id: p.id, t: performance.now() };
      }
      return;
    }
    const d = this.selectedDeco();
    if (d) {
      const orig = d.color;
      if (orig === color) return;
      const merge = this.lastRecolor && this.lastRecolor.id === d.id && performance.now() - this.lastRecolor.t < tuning.build.undoMergeMs;
      store.update(() => {
        d.color = color;
      });
      const obj = this.decoObjs.get(d.id);
      if (obj) refillDecorationObject(obj, d);
      bus.emit('pieceRecolored', { pos: { x: d.x, y: 0.6, z: d.z }, object: obj });
      if (merge) this.lastRecolor!.t = performance.now();
      else {
        this.pushUndo(() => {
          store.update(() => {
            d.color = orig;
          });
          const o = this.decoObjs.get(d.id);
          if (o) refillDecorationObject(o, d);
        });
        this.lastRecolor = { id: d.id, t: performance.now() };
      }
    }
  }

  private deleteSelected(): void {
    const p = this.selectedPiece();
    if (p && this.edit && this.house) {
      const house = this.house;
      this.removePieceData(p, true);
      this.pushUndo(() => {
        store.update(() => {
          house.pieces.push(p);
        });
        const o = this.edit?.add(p);
        if (o) popScale(o, 0.3, 0.2);
        this.houseVer++;
        this.ghostKey = '';
        this.refreshHud();
      });
      return;
    }
    const d = this.selectedDeco();
    if (d) {
      this.removeDecoData(d, true);
      this.pushUndo(() => this.undoDecoErased([d]));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // House-mode extras
  // ═══════════════════════════════════════════════════════════════════════
  private setRoofs(show: boolean): void {
    this.roofsShown = show;
    this.edit?.setRoofsVisible(show);
    this.refreshHud();
  }

  private setWalls(low: boolean): void {
    this.wallsLow = low;
    this.edit?.setWallsLow(low);
    this.refreshHud();
  }

  /** 🪄 A small 4×4 house in one tap. */
  private stampStarter(): void {
    const house = this.house, edit = this.edit;
    if (!house || !edit || house.pieces.length > 0 || house.ownerId !== store.profile.id) return;
    const N = tuning.build.plotCells;
    const o = Math.floor((N - 4) / 2);
    const k = this.plotIdx % STARTER_WALLS.length;
    const wallC = this.lastColor.get('wall') ?? STARTER_WALLS[k];
    const roofC = this.lastColor.get('roofGable') ?? STARTER_ROOFS[k];
    const floorC = this.lastColor.get('floor') ?? pieceDef('floor')!.color;
    const list: PlacedPiece[] = [];
    const add = (type: PieceType, x: number, z: number, rot: Rot, color: Hex) => list.push({ id: uid('pc_'), type, x: o + x, z: o + z, rot, color });
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) add('floor', x, z, 0, floorC);
    const south: PieceType[] = ['wall', 'wallDoor', 'wallWindow', 'wall'];
    const north: PieceType[] = ['wall', 'wallWindow', 'wallWindow', 'wall'];
    const west: PieceType[] = ['wall', 'wallWindow', 'wall', 'wall'];
    const east: PieceType[] = ['wall', 'wall', 'wallWindow', 'wall'];
    for (let i = 0; i < 4; i++) {
      add(south[i], i, 3, 2, wallC);
      add(north[i], i, 0, 0, wallC);
      add(west[i], 0, i, 3, wallC);
      add(east[i], 3, i, 1, wallC);
    }
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) add('roofGable', x, z, 0, roofC);

    store.update(() => {
      house.pieces.push(...list);
    });
    edit.ctx = makeCtx(house.pieces);
    const objs = list.map((p) => edit.add(p, false));
    edit.refreshAll();
    this.houseVer++;
    // build it up piece by piece
    objs.forEach((obj, i) => {
      obj.visible = false;
      window.setTimeout(() => {
        if (!obj.parent) return;
        obj.visible = true;
        if (i % 4 === 0) bus.emit('piecePlaced', { pos: this.fxPos(list[i]), type: list[i].type, object: obj });
        else popScale(obj, tuning.build.placeBounceSeconds, 0.28);
      }, 24 * i);
    });
    const ids = list.map((p) => p.id);
    this.pushUndo(() => this.undoPlaced(ids));
    this.refreshHud();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Frame update
  // ═══════════════════════════════════════════════════════════════════════
  update(dt: number, t: number): void {
    this.orbit.update(dt);
    this.env.update(dt, t);

    // the sun follows what we look at, so the shadow map stays sharp
    this.rig.sun.target.position.copy(this.orbit.target);
    this.rig.sun.position.copy(this.orbit.target).add(this.sunOffset);

    // floating ＋ signs face the camera and bob
    for (const s of this.plusSigns) {
      s.quaternion.copy(this.camera.quaternion);   // billboard: face the camera exactly
      s.position.y = s.userData.baseY + Math.sin(t * 2 + s.userData.phase) * 0.22;
      s.scale.setScalar(1.25 * (1 + Math.sin(t * 3 + s.userData.phase) * 0.04));
    }

    // ghost glides to its snapped spot and bobs a little
    if (this.ghostHolder.visible) {
      const k = 1 - Math.exp(-tuning.build.ghostLerp * dt);
      this.ghostHolder.position.lerp(this.ghostGoal, k);
      this.ghostBob += dt;
      if (this.ghostObj) this.ghostObj.position.y = this.ghostBaseY + 0.05 + Math.sin(this.ghostBob * 7) * 0.02;
    }

    // selection marker pulse
    if (this.selMarker.visible) {
      const s = 1 + Math.sin(t * 7) * 0.05;
      this.selRing.scale.setScalar(s);
      this.selBar.scale.set(1, 1, 1 + Math.sin(t * 7) * 0.2);
    }

    this.positionOverlays();
  }

  /** Project 3D anchors (owner tags, selection bubble) onto the screen. */
  private positionOverlays(): void {
    if (!this.hud) return;
    const w = window.innerWidth, h = window.innerHeight;
    const v = this.tmpV;
    if (this.mode === 'town') {
      for (const tg of this.tags) {
        v.copy(tg.pos).project(this.camera);
        if (v.z > 1 || v.z < -1) {
          tg.el.style.display = 'none';
          continue;
        }
        tg.el.style.display = '';
        tg.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
        tg.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      }
    }
    if (this.bubble && this.bubbleAnchor) {
      const a = this.bubbleAnchor();
      if (!a) return;
      const p = a.clone().project(this.camera);
      if (p.z > 1) {
        this.bubble.style.display = 'none';
        return;
      }
      this.bubble.style.display = '';
      const bw = this.bubble.offsetWidth, bh = this.bubble.offsetHeight;
      const x = THREE.MathUtils.clamp((p.x * 0.5 + 0.5) * w, bw / 2 + 8, w - bw / 2 - 8);
      const y = THREE.MathUtils.clamp((-p.y * 0.5 + 0.5) * h - 14, bh + 96, h - 8);
      this.bubble.style.left = `${x}px`;
      this.bubble.style.top = `${y}px`;
    }
  }
}
