// Build scene: one orbit-camera scene with two modes.
//   TOWN  - the village: claim a lot (BUILD HERE), visit houses, place trees / planters / benches...
//   HOUSE - edit a lot you own: two storeys, 60+ pieces in 7 categories, finishes,
//           drag from the palette, snap, move, rotate, recolor, duplicate, undo.
// All changes go through store.update (autosave). Sound + squash-and-stretch come
// from the juice layer via events (piecePlaced, pieceDeleted, ...).
import * as THREE from 'three';
import * as LAYOUT from '../world/townLayout';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus, v3, type V3 } from '../core/events';
import { tweens, ease, popScale } from '../core/tween';
import { uid, type Decoration, type DecoType, type Hex, type House, type PieceType, type PlacedPiece } from '../core/model';
import { tuning } from '../tuning';
import { goldenHour, sunDirection, type LightRig } from '../art/env';
import { buildTownEnvironment, type TownEnv } from '../world/townEnv';
import { PLOTS, isReserved } from '../world/townLayout';
import {
  buildTownContent, buildDecorationMesh, refillDecorationObject, buildPieceObject, buildPiecesMesh, PIECE_CATALOG, DECO_CATALOG, CATS, pieceDef, decoDef,
  tickBuildMaterials,
} from '../world/houseMesh';
import { Baker, Brush, bakedToGroup, ghostify, disposeBaked } from '../build/bake';
import { dims } from '../build/kit';
import { pieceRotY } from '../build/pieces';
import {
  canPlace, edgeCells, edgeKey, footprintCells, stairsProblem, isBodyWall, isRoofType, levelOf, makeCtx, snapPiece, type Cand, type HouseCtx, type Level, type Rot,
} from '../build/rules';
import type { PieceCat, PieceDef } from '../build/catalog';
import { finishesFor } from '../build/finishes';
import { OrbitCam } from '../build/orbit';
import { EditView } from '../build/editView';
import { paletteTile, type PalItem, type DragPhase } from '../build/palette';
import { buildStylePicker, type StylePicker } from '../build/stylePicker';
import { TEMPLATES, orientLayout, turnsForFront, type Template } from '../build/templates';
import { templateThumb } from '../build/thumbs';
import { isUnlocked, rewardFor, lockedToast } from '../core/unlocks';
import { el, button, sheet, confirmDialog, toast, nameTag, bindTap } from '../ui/ui';

type Mode = 'town' | 'house';
type CatId = PieceCat | 'mine';

/** What the player is currently placing. */
type Tool =
  | { kind: 'piece'; id: string; type: PieceType; color: Hex; finish?: string; creationId?: string; rot: Rot; paint: boolean }
  | { kind: 'deco'; id: string; type: DecoType; color: Hex; paint: boolean }
  | { kind: 'erase'; id: string }
  | { kind: 'room'; id: string; style: 'floor' | 'wall' }
  | { kind: 'move'; id: string; piece: PlacedPiece; from: { x: number; z: number; rot: Rot; level: Level }; viaDrag: boolean };

/** Where the current tool would land, and whether that is allowed. */
interface Target {
  ok: boolean;
  key: string;
  pos: V3;
  cand?: Cand;                       // house mode
  replace?: PlacedPiece;             // a wall this window/door would swap in for
  color?: Hex;                       // colour the piece will get (a replacement keeps the wall's colour)
  finish?: string;
  why?: string;                      // short friendly reason a drop was refused (stairs that lead nowhere...)
  deco?: { x: number; z: number; rot: number }; // town mode
}

interface Ptr { x: number; y: number; sx: number; sy: number; t0: number; button: number; type: string }
type Gesture = 'none' | 'tap' | 'orbit' | 'pan' | 'multi' | 'paint';

/** Wall-family pieces share one remembered style so windows and doors match the walls. */
const familyOf = (t: PieceType): string => (isBodyWall(t) ? 'wall' : t === 'floor' || t === 'stairs' ? 'floor' : t);

const KIND_ICON: Record<string, string> = { squishy: '🧸', slime: '🫧', wax: '🕯️' };
const LAYOUT_ANY = LAYOUT as unknown as {
  RESIDENTIAL?: { center: { x: number; z: number }; radius: number };
  BOUNDS?: number;
  plotFront?: (p: (typeof PLOTS)[number]) => { nx: number; nz: number };
};

export class BuildScene extends GameScene {
  readonly name = 'build' as const;

  // ── world ──
  private env!: TownEnv;
  private rig!: LightRig;
  private orbit!: OrbitCam;
  private sunOffset = new THREE.Vector3(60, 40, 60);
  private staticGroup = new THREE.Group();   // every house except the one being edited (merged)
  private decoGroup = new THREE.Group();
  private markerGroup = new THREE.Group();   // dashed outlines + pins on empty lots
  private pickGroup = new THREE.Group();     // invisible tap targets
  private plotPicks: THREE.Mesh[] = [];
  private decoPicks = new Map<string, THREE.Mesh>();
  private decoObjs = new Map<string, THREE.Object3D>();
  private pins: THREE.Group[] = [];
  private selMarker = new THREE.Group();
  private selFrame: THREE.Mesh[] = [];       // 4 bars forming a rectangle outline
  private selBar!: THREE.Mesh;
  private selMat!: THREE.MeshBasicMaterial;
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
  private level: Level = 0;
  private cat: CatId = 'build';
  private tool: Tool | null = null;
  private dragTool: Tool | null = null;
  private dragTarget: Target | null = null;
  private target: Target | null = null;
  private moveCtx: HouseCtx | null = null;
  private pendingMove: PlacedPiece | null = null;
  private lastTargetKey = '';
  private sel: { kind: 'piece' | 'deco'; id: string } | null = null;
  private undoStack: (() => void)[] = [];
  private houseVer = 0;
  private roofsShown = true;
  private wallsLow = false;
  private lastStyle = new Map<string, { color: Hex; finish?: string }>();
  private lastRecolor: { id: string; t: number } | null = null;
  private strokeIds: string[] = [];
  private strokeOld: PlacedPiece[] = [];
  private eraseStroke: PlacedPiece[] = [];
  private eraseDecoStroke: Decoration[] = [];
  private paintFirst: Target | null = null;
  private paintTimer = 0;
  private fenceRot = 0;
  private areaStart: { x: number; z: number } | null = null;
  private areaEnd: { x: number; z: number } | null = null;
  private areaFakes: PlacedPiece[] = [];
  private toolRot: Rot = 0;
  private sheetOpen = false;

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
  private tags: { el: HTMLDivElement; pos: THREE.Vector3; kind: 'owner' | 'build' }[] = [];
  private bubble: HTMLDivElement | null = null;
  private bubbleAnchor: (() => THREE.Vector3 | null) | null = null;
  private palItems: HTMLDivElement | null = null;
  private catRow: HTMLDivElement | null = null;
  private brushPanel: HTMLDivElement | null = null;
  private brushStyle: StylePicker | null = null;
  private hint: HTMLDivElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private roofBtn: HTMLButtonElement | null = null;
  private wallBtn: HTMLButtonElement | null = null;
  private levelBtns: HTMLButtonElement[] = [];
  private tplBtn: HTMLButtonElement | null = null;
  private tmpV = new THREE.Vector3();

  // ═══════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════
  init(): void {
    this.pixelRatioCap = tuning.app.townPixelRatio;
    this.fxScale = 1.5;
    this.rig = goldenHour(this.scene, { shadowSize: tuning.build.shadowSizeTown, distance: 1 });
    this.sunOffset = sunDirection().multiplyScalar(110);
    this.camera.fov = 40;
    this.camera.near = 0.5;
    this.camera.far = 700;
    this.camera.updateProjectionMatrix();

    this.env = buildTownEnvironment();
    this.scene.add(this.env.group, this.staticGroup, this.decoGroup, this.markerGroup, this.pickGroup);

    // selection marker: a rectangle outline for footprints, a bar for wall edges
    this.selMat = new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.95, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), this.selMat);
      this.selFrame.push(m);
      this.selMarker.add(m);
    }
    this.selBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), this.selMat);
    this.selMarker.add(this.selBar);
    this.selMarker.visible = false;
    this.selMarker.renderOrder = 3;
    this.scene.add(this.selMarker);

    this.ghostHolder.visible = false;
    this.scene.add(this.ghostHolder);

    this.orbit = new OrbitCam(this.camera);
  }

  /** enter({ plot, claim }): open that plot. `claim` takes an empty lot for the current player first. */
  enter(params?: { plot?: number; claim?: boolean }): void {
    this.ui.innerHTML = '';
    this.resetState();
    this.tagLayer = el('div', '', this.ui) as HTMLDivElement;
    this.hud = el('div', '', this.ui) as HTMLDivElement;

    this.rebuildTown();
    this.setLimitsFor('town');
    const tv = this.townView();
    this.orbit.snapTo(tv.target, tv.dist, 0, tuning.build.townPitch);
    this.setShadowSize(tuning.build.shadowSizeTown);
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
      if (!h && params?.claim) this.claimPlot(plot, true);
      else if (h && h.ownerId === store.profile.id) this.openHouse(plot, true);
      else if (h) {
        this.orbit.snapTo(new THREE.Vector3(PLOTS[plot].center.x, 0, PLOTS[plot].center.z), 30);
        this.visitHouse(plot);
      } else this.orbit.snapTo(new THREE.Vector3(PLOTS[plot].center.x, 0, PLOTS[plot].center.z), 36);
    }
  }

  exit(): void {
    window.clearTimeout(this.paintTimer);
    this.closeBubble();
    this.clearGhost();
    this.edit?.dispose();
    this.edit = null;
    this.house = null;
    this.moveCtx = null;
    this.ptrs.clear();
    this.gesture = 'none';
    this.sheetOpen = false;
  }

  private resetState(): void {
    this.mode = 'town';
    this.plotIdx = -1;
    this.house = null;
    this.edit?.dispose();
    this.edit = null;
    this.level = 0;
    this.cat = 'build';
    this.tool = null;
    this.dragTool = null;
    this.dragTarget = null;
    this.target = null;
    this.moveCtx = null;
    this.pendingMove = null;
    this.sel = null;
    this.undoStack = [];
    this.roofsShown = true;
    this.wallsLow = false;
    this.strokeIds = [];
    this.strokeOld = [];
    this.eraseStroke = [];
    this.eraseDecoStroke = [];
    this.paintFirst = null;
    this.toolRot = 0;
    this.sheetOpen = false;
    this.ptrs.clear();
    this.gesture = 'none';
    this.selMarker.visible = false;
    this.clearGhost();
    this.bubble = null;
    this.brushPanel = null;
    this.brushStyle = null;
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
      level: this.level,
      pieces: this.house?.pieces.length ?? 0,
      bakedMeshes: this.edit?.stats().baked ?? 0,   // merged meshes drawing the house
      liveObjects: this.edit?.objs.size ?? 0,        // pieces that currently have their own object (just placed / moving)
      undo: this.undoStack.length,
      tool: this.tool?.id ?? '-',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Town content
  // ═══════════════════════════════════════════════════════════════════════
  private rebuildTown(): void {
    this.rebuildStatic([]);
    this.decoGroup.visible = true;
    this.rebuildDecos();
    this.rebuildMarkers();
    this.rebuildPicks();
    this.rebuildTags();
    this.markerGroup.visible = true;
    this.tagLayer.style.display = '';
  }

  /** Merged houses (+ merged village decorations in house mode, where nobody picks them: a few draw calls however big the village). */
  private rebuildStatic(skip: number[], withDecorations = false): void {
    disposeBaked(this.staticGroup);
    this.staticGroup.clear();
    this.staticGroup.add(buildTownContent(store.data.town, { skipPlots: skip, decorations: withDecorations }).group);
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
    const h = decoDef(d.type)?.height ?? 2;
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, h, 8));
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
      const h = store.houseOnPlot(plot.index) ? 9 : 0.8;
      const m = new THREE.Mesh(new THREE.BoxGeometry(plot.size, h, plot.size));
      m.visible = false;
      m.position.set(plot.center.x, h / 2, plot.center.z);
      m.userData.plot = plot.index;
      m.updateMatrixWorld(true);
      this.pickGroup.add(m);
      this.plotPicks.push(m);
    }
  }

  /** Dashed outline + a bobbing pin on every lot nobody has claimed. */
  private rebuildMarkers(): void {
    disposeBaked(this.markerGroup);
    this.markerGroup.clear();
    this.pins = [];
    const dashes = new Baker();
    const db = new Brush(dashes);
    for (const plot of PLOTS) {
      if (store.houseOnPlot(plot.index)) continue;
      const { x: cx, z: cz } = plot.center;
      const half = plot.size / 2 - 0.25, dash = 0.9, gap = 0.55;
      for (let t = -half + dash / 2; t < half - dash / 2 + 0.01; t += dash + gap) {
        db.rbox(cx + t, 0.14, cz - half, dash, 0.08, 0.2, '#ff2e88', 0.03, 'glow');
        db.rbox(cx + t, 0.14, cz + half, dash, 0.08, 0.2, '#ff2e88', 0.03, 'glow');
        db.rbox(cx - half, 0.14, cz + t, 0.2, 0.08, dash, '#ff2e88', 0.03, 'glow');
        db.rbox(cx + half, 0.14, cz + t, 0.2, 0.08, dash, '#ff2e88', 0.03, 'glow');
      }
      // a map-pin style marker: sphere on a cone, with a white house glyph
      const b = new Baker();
      const br = new Brush(b);
      br.cyl(0, 0.9, 0, 0.0, 0.5, 1.2, '#ff2e88', 'glow', 18, Math.PI);
      br.ball(0, 1.9, 0, 0.9, '#ff2e88', 'glow');
      br.box(0, 1.78, 0.82, 0.8, 0.5, 0.06, '#ffffff', 'paint');
      br.box(0, 2.2, 0.82, 0.56, 0.06, 0.06, '#ffffff', 'paint', 0, 0, 0.9);
      br.box(0, 2.2, 0.82, 0.56, 0.06, 0.06, '#ffffff', 'paint', 0, 0, -0.9);
      const pin = bakedToGroup(b.bake());
      pin.position.set(cx, 3.2, cz);
      pin.scale.setScalar(1.2);
      pin.userData.baseY = 3.2;
      pin.userData.phase = plot.index * 0.9;
      this.pins.push(pin);
      this.markerGroup.add(pin);
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
    for (const plot of PLOTS) {
      const h = store.houseOnPlot(plot.index);
      if (h) {
        const name = store.profileById(h.ownerId)?.name ?? '?';
        this.tags.push({
          el: nameTag(this.tagLayer, `🏡 ${name}`),
          pos: new THREE.Vector3(plot.center.x, tuning.build.tagHeight, plot.center.z),
          kind: 'owner',
        });
      } else {
        const t = el('div', 'buildtag', this.tagLayer) as HTMLDivElement;
        el('span', 'ico', t, '🏠');
        el('span', '', t, 'BUILD HERE');
        this.tags.push({ el: t, pos: new THREE.Vector3(plot.center.x, 5.6, plot.center.z), kind: 'build' });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Camera + light helpers
  // ═══════════════════════════════════════════════════════════════════════
  private residential(): { cx: number; cz: number; r: number } {
    const R = LAYOUT_ANY.RESIDENTIAL;
    if (R) return { cx: R.center.x, cz: R.center.z, r: R.radius };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of PLOTS) {
      x0 = Math.min(x0, p.center.x - p.size / 2);
      x1 = Math.max(x1, p.center.x + p.size / 2);
      z0 = Math.min(z0, p.center.z - p.size / 2);
      z1 = Math.max(z1, p.center.z + p.size / 2);
    }
    if (x0 > x1) return { cx: 0, cz: 0, r: 30 };
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 };
  }

  private townView(): { target: THREE.Vector3; dist: number } {
    const { cx, cz, r } = this.residential();
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = THREE.MathUtils.clamp((r * 1.05) / (half * Math.min(this.camera.aspect, 1.5)), tuning.build.orbitMinDistance, tuning.build.orbitMaxDistance);
    return { target: new THREE.Vector3(cx, 0, cz), dist };
  }

  /** The side of a lot that faces its street (falls back to south). */
  private plotFrontVec(i: number): { nx: number; nz: number } {
    try {
      return LAYOUT_ANY.plotFront?.(PLOTS[i]) ?? { nx: 0, nz: 1 };
    } catch {
      return { nx: 0, nz: 1 };
    }
  }

  /** A camera yaw that looks at the lot's front from the street. */
  private frontYaw(i: number): number {
    const f = this.plotFrontVec(i);
    return Math.atan2(f.nx, f.nz) + 0.5;
  }

  /**
   * Built extent (cells) of a storey: floors, walls, stairs and furniture on that level (roofs and
   * wall decor don't count). An empty upstairs falls back to the ground floor's footprint below it.
   * Null when nothing is built.
   */
  private storeyBounds(level: Level): { x0: number; z0: number; x1: number; z1: number } | null {
    const pieces = this.house?.pieces ?? [];
    const scan = (lv: Level) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      const add = (x: number, z: number) => {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x + 1);
        z1 = Math.max(z1, z + 1);
      };
      for (const p of pieces) {
        const d = pieceDef(p.type);
        if (!d || levelOf(p) !== lv || (lv === 0 && d.outdoor)) continue;
        if (d.kind === 'floor') add(p.x, p.z);
        else if (d.kind === 'edge') for (const [x, z] of edgeCells(p.x, p.z, p.rot, d.w)) add(x, z);
        else if (d.kind === 'furn' || d.kind === 'stairs') for (const [x, z] of footprintCells(d, p.x, p.z, p.rot)) add(x, z);
      }
      return x0 <= x1 ? { x0, z0, x1, z1 } : null;
    };
    return scan(level) ?? (level === 1 ? scan(0) : null);
  }

  /**
   * Camera pose for editing the current plot (looks a little south of it so it clears the palette).
   * Downstairs frames the whole lot; upstairs frames what is built on that storey (else the house
   * footprint below), raised by one storey - and never sits farther back than the downstairs view.
   */
  private houseView(yaw: number, level: Level = this.level): { target: THREE.Vector3; dist: number } {
    const plot = PLOTS[this.plotIdx];
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const need = (plot.size * 0.62) / (half * this.camera.aspect);
    const plotDist = THREE.MathUtils.clamp(Math.max(tuning.build.houseDistance, need), tuning.build.houseMinDistance, tuning.build.houseMaxDistance);
    const { H, S } = dims();
    let cx = plot.center.x, cz = plot.center.z, dist = plotDist;
    const b = level === 1 ? this.storeyBounds(1) : null;
    if (b) {
      cx = plot.origin.x + ((b.x0 + b.x1) / 2) * S;
      cz = plot.origin.z + ((b.z0 + b.z1) / 2) * S;
      // fit the storey's footprint (turned any way) plus its height and a little air, on the short screen side
      const diag = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) * S;
      const pitch = this.orbit.goalPitch;
      const vExtent = diag * Math.sin(pitch) + (H + 0.5) * Math.cos(pitch) + 2.4 + 2 * Math.min(2.2, plotDist * 0.09) * Math.sin(pitch);
      const hExtent = diag + 2.4;
      const fit = Math.max(vExtent / (2 * half), hExtent / (2 * half * this.camera.aspect)) * 1.05;
      dist = THREE.MathUtils.clamp(fit, Math.max(tuning.build.houseMinDistance, 10), plotDist);
    }
    const lead = Math.min(2.2, dist * 0.09);
    return { target: new THREE.Vector3(cx + Math.sin(yaw) * lead, level * H, cz + Math.cos(yaw) * lead), dist };
  }

  private setLimitsFor(mode: Mode): void {
    const b = tuning.build;
    if (mode === 'town') {
      const lim = (LAYOUT_ANY.BOUNDS ?? 60) * 0.95;
      this.orbit.setLimits(b.orbitMinDistance, b.orbitMaxDistance, { x0: -lim, x1: lim, z0: -lim, z1: lim });
    } else {
      const c = PLOTS[this.plotIdx].center;
      const r = PLOTS[this.plotIdx].size / 2 + 4;
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
  private claimPlot(i: number, snap = false): void {
    const plot = PLOTS[i];
    const house: House = { plot: i, ownerId: store.profile.id, pieces: [] };
    store.update((d) => {
      d.town.houses.push(house);
    });
    bus.emit('plotClaimed', { pos: { x: plot.center.x, y: 1, z: plot.center.z }, plot: i });
    this.openHouse(i, snap);
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
    this.level = 0;
    this.cat = 'build';
    this.roofsShown = true;
    this.wallsLow = false;
    this.toolRot = 0;

    this.rebuildStatic([i], true);
    this.decoGroup.visible = false;
    this.rebuildPicks();
    this.markerGroup.visible = false;
    this.tagLayer.style.display = 'none';
    this.edit = new EditView(house, PLOTS[i]);
    this.scene.add(this.edit.root);

    this.setLimitsFor('house');
    const yaw = snap ? this.frontYaw(i) : this.orbit.goalYaw;
    const hv = this.houseView(yaw);
    if (snap) this.orbit.snapTo(hv.target, hv.dist, yaw, tuning.build.housePitch);
    else this.orbit.flyTo(hv.target, hv.dist, yaw, tuning.build.housePitch);
    this.setShadowSize(tuning.build.shadowSizeHouse);
    this.buildHouseHud();
    if (house.pieces.length === 0 && house.ownerId === store.profile.id) window.setTimeout(() => this.showTemplateSheet(), snap ? 120 : 450);
  }

  /** "Done" - back to the village. An empty claimed lot is given back. */
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
    this.restoreMoved();
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
    this.level = 0;
    this.rebuildTown();
    this.setLimitsFor('town');
    this.orbit.flyTo(new THREE.Vector3(c.x, 0, c.z), Math.min(52, this.townView().dist), undefined, tuning.build.townPitch);
    this.setShadowSize(tuning.build.shadowSizeTown);
    this.buildTownHud();
  }

  private visitHouse(i: number): void {
    const h = store.houseOnPlot(i);
    const plot = PLOTS[i];
    const name = (h && store.profileById(h.ownerId)?.name) ?? 'someone';
    this.orbit.flyTo(new THREE.Vector3(plot.center.x, 0, plot.center.z), 34, undefined, tuning.build.townPitch);
    bus.emit('pieceSelected', { pos: { x: plot.center.x, y: 1, z: plot.center.z } });
    toast(`This is ${name}'s house 🏡`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════════════════════
  private clearHud(): void {
    this.hud.innerHTML = '';
    this.palItems = null;
    this.catRow = null;
    this.brushPanel = null;
    this.brushStyle = null;
    this.hint = null;
    this.undoBtn = null;
    this.roofBtn = null;
    this.wallBtn = null;
    this.levelBtns = [];
    this.tplBtn = null;
  }

  private ownsAHouse(): boolean {
    return store.data.town.houses.some((h) => h.ownerId === store.profile.id);
  }

  private buildTownHud(): void {
    this.clearHud();
    const hud = this.hud;
    const tr = el('div', 'tr row', hud);
    this.undoBtn = button(tr, { icon: '↶', cls: 'round', tap: 'back' }, () => this.doUndo());
    button(tr, { icon: '🚗', label: 'Drive', cls: 'blue big' }, () => void scenes.go('town'));
    this.hint = el('div', this.ownsAHouse() ? 'bhint' : 'bhint pulse', hud, this.ownsAHouse() ? 'Tap your house to edit it' : 'Tap a lot to build your home 🏠') as HTMLDivElement;

    const wrap = el('div', 'bpal', hud);
    this.brushPanel = el('div', 'panel bbrush', wrap) as HTMLDivElement;
    this.brushPanel.style.display = 'none';
    this.palItems = el('div', 'panel bpal-items', wrap) as HTMLDivElement;
    this.fillPalette();
    this.refreshHud();
  }

  private buildHouseHud(): void {
    this.clearHud();
    const hud = this.hud;
    const house = this.house!;
    const owner = store.profileById(house.ownerId)?.name ?? 'Home';
    el('div', 'btitle', hud, `🏠 <b>${escapeHtml(owner)}</b> · Home`);

    const tr = el('div', 'tr row', hud);
    this.undoBtn = button(tr, { icon: '↶', cls: 'round', tap: 'back' }, () => this.doUndo());
    const seg = el('div', 'bseg', tr);
    for (const lv of [0, 1] as const) {
      const b = button(seg, { label: lv === 0 ? '1F' : '2F', cls: 'ghost lvl', tap: 'tab' }, () => this.setLevel(lv));
      this.levelBtns.push(b);
    }
    this.roofBtn = button(tr, { icon: '🏠', cls: 'round' }, () => this.setRoofs(!this.roofsShown));
    this.wallBtn = button(tr, { icon: '🧱', cls: 'round' }, () => this.setWalls(!this.wallsLow));
    button(tr, { icon: '✔️', label: 'Done', cls: 'mint big' }, () => this.closeHouse());

    const lc = el('div', 'blc', hud);
    this.tplBtn = button(lc, { icon: '✨', label: 'Templates', cls: 'butter bob' }, () => this.showTemplateSheet());
    button(lc, { icon: '🗑️', cls: 'round ghost' }, () => void this.removeHouse());

    const wrap = el('div', 'bpal', hud);
    this.brushPanel = el('div', 'panel bbrush', wrap) as HTMLDivElement;
    this.brushPanel.style.display = 'none';
    this.catRow = el('div', 'panel bcats', wrap) as HTMLDivElement;
    this.fillCats();
    this.palItems = el('div', 'panel bpal-items', wrap) as HTMLDivElement;
    this.fillPalette();
    this.refreshHud();
  }

  private refreshHud(): void {
    if (this.undoBtn) this.undoBtn.disabled = this.undoStack.length === 0;
    if (this.tplBtn) this.tplBtn.style.display = this.house && this.house.pieces.length === 0 ? '' : 'none';
    if (this.roofBtn) this.roofBtn.querySelector('.ico')!.textContent = this.roofsShown ? '🏠' : '👀';
    this.wallBtn?.classList.toggle('selected', this.wallsLow);
    this.levelBtns.forEach((b, i) => b.classList.toggle('selected', i === this.level));
  }

  private fillCats(): void {
    const row = this.catRow;
    if (!row) return;
    row.innerHTML = '';
    for (const c of CATS) {
      const b = el('button', 'tab' + (c.id === this.cat ? ' on' : ''), row);
      b.dataset.cat = c.id;
      el('span', 'ico', b, c.icon);
      el('span', '', b, c.name);
      bindTap(b, () => {
        bus.emit('uiTap', { kind: 'tab' });
        this.switchCat(c.id);
      });
    }
  }

  private switchCat(id: CatId): void {
    this.cat = id;
    this.setTool(null);
    this.catRow?.querySelectorAll('.tab').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.cat === id));
    // furnish with the roof off, build with it on
    this.setRoofs(id === 'build' && this.level === 0);
    this.fillPalette();
  }

  private setLevel(l: Level): void {
    if (!this.edit || l === this.level) return;
    this.level = l;
    this.deselect();
    this.setTool(null);
    this.edit.setLevel(l);
    this.setRoofs(this.cat === 'build' && l === 0);
    const hv = this.houseView(this.orbit.goalYaw, l);
    this.orbit.flyTo(hv.target, hv.dist);
    this.fillPalette();
    this.refreshHud();
    bus.emit('uiTap', { kind: 'tab' });
  }

  private fillPalette(): void {
    const box = this.palItems;
    if (!box) return;
    box.innerHTML = '';
    const items: PalItem[] = [];
    if (this.mode === 'town') {
      for (const d of DECO_CATALOG) items.push({ id: `d:${d.type}`, icon: d.icon, label: d.name, dot: d.color, data: { kind: 'deco', def: d } });
      items.push({ id: 'erase', icon: '🧹', label: 'Erase', data: { kind: 'erase' } });
    } else if (this.cat === 'mine') {
      for (const c of store.profile.creations) {
        items.push({ id: `c:${c.id}`, icon: KIND_ICON[c.kind] ?? '⭐', label: c.shape ?? c.kind, dot: c.color, data: { kind: 'piece', type: 'creation', creationId: c.id } });
      }
    } else {
      if (this.cat === 'build') items.push({ id: 'room', icon: '⬛', label: 'Room', data: { kind: 'room' } });
      for (const d of PIECE_CATALOG) {
        if (d.cat !== this.cat) continue;
        const st = this.lastStyle.get(familyOf(d.type));
        const locked = d.reward && !isUnlocked(d.reward) ? `💎${rewardFor(d.reward)?.at ?? ''}` : undefined;
        const dim = this.level === 1 && (d.outdoor || d.kind === 'stairs');
        items.push({ id: `p:${d.type}`, icon: d.icon, label: d.name, dot: st?.color ?? d.color, data: { kind: 'piece', type: d.type }, lock: locked, dim });
      }
      items.push({ id: 'erase', icon: '🧹', label: 'Erase', data: { kind: 'erase' } });
    }
    if (items.length === 0) {
      const empty = el('div', 'bempty', box);
      el('span', 'ico', empty, '🧪');
      button(empty, { label: 'Make something in the Studio', cls: 'peach' }, () => void scenes.go('workshop'));
      return;
    }
    for (const it of items) {
      const tile = paletteTile(box, it, {
        onTap: (item) => this.onTileTap(item),
        onDrag: (item, x, y, phase, touch) => this.onTileDrag(item, x, y, phase, touch),
        onBlocked: (item) => this.onTileBlocked(item),
      });
      if (this.tool?.id === it.id) tile.classList.add('on');
    }
  }

  private onTileBlocked(it: PalItem): void {
    const d = it.data as { type?: PieceType };
    const def = d.type ? pieceDef(d.type) : undefined;
    if (def?.reward && !isUnlocked(def.reward)) lockedToast(def.reward);
    else {
      toast('That goes on the ground floor 🏡');
      bus.emit('placementBlocked', {});
    }
  }

  private toolFromItem(it: PalItem): Tool {
    const d = it.data as { kind: string; type?: PieceType; def?: { type: DecoType; color: Hex; paint: boolean }; creationId?: string };
    if (d.kind === 'erase') return { kind: 'erase', id: it.id };
    if (d.kind === 'room') return { kind: 'room', id: it.id, style: 'floor' };
    if (d.kind === 'deco') return { kind: 'deco', id: it.id, type: d.def!.type, color: d.def!.color, paint: d.def!.paint };
    const def = pieceDef(d.type!)!;
    const st = this.lastStyle.get(familyOf(def.type));
    // keep a remembered finish only if this piece can wear it
    const finish = def.finishSet && st?.finish && finishesFor(def.finishSet).some((f) => f.id === st.finish) ? st.finish : def.finish;
    return { kind: 'piece', id: it.id, type: def.type, color: st?.color ?? def.color, finish, creationId: d.creationId, rot: this.toolRot, paint: def.paint };
  }

  /** Tap a tile: arm it as a brush (tap the world to place, drag to paint); tap again to put it down. */
  private onTileTap(it: PalItem): void {
    this.deselect();
    this.setTool(this.tool?.id === it.id ? null : this.toolFromItem(it));
  }

  private setTool(t: Tool | null): void {
    if (this.tool?.kind === 'move' && t?.kind !== 'move') this.restoreMoved();
    this.tool = t;
    this.moveCtx = null;
    this.clearGhost();
    this.palItems?.querySelectorAll('.ptile').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.id === t?.id));
    if (this.hint) this.hint.style.display = t ? 'none' : '';
    this.refreshBrushPanel();
  }

  /** The panel above the palette while a brush is armed: what it is, rotate, finish + colour. */
  private refreshBrushPanel(): void {
    const bp = this.brushPanel;
    if (!bp) return;
    bp.innerHTML = '';
    this.brushStyle = null;
    const t = this.tool;
    if (!t) {
      bp.style.display = 'none';
      return;
    }
    bp.style.display = '';
    const head = el('div', 'bhead', bp);
    const icon = (this.palItems?.querySelector(`.ptile[data-id="${t.id}"] .ico`) as HTMLElement | null)?.textContent ?? '✨';
    el('span', 'ico', head, icon);
    const name = t.kind === 'erase' ? 'Erase' : t.kind === 'move' ? 'Move' : t.kind === 'room' ? 'Room' : t.kind === 'deco' ? decoDef(t.type)?.name ?? '' : pieceDef(t.type)?.name ?? '';
    el('span', 'nm', head, name);
    const area = this.isAreaTool(t);
    el('span', 'tip', head, t.kind === 'erase' ? 'tap or drag over things' : t.kind === 'move' ? 'drop it somewhere' : t.kind === 'room' ? 'drag a rectangle: floor + walls' : area ? 'drag to fill an area' : 'tap or drag');
    const needRot = t.kind === 'move' || (t.kind === 'piece' && ['furn', 'rug', 'stairs', 'roof', 'creation'].includes(pieceDef(t.type)!.kind) && pieceDef(t.type)!.type !== 'roofGable');
    if (needRot) button(head, { icon: '⟳', cls: 'round ghost', tap: 'tab' }, () => this.rotateTool());
    button(head, { icon: '✖️', cls: 'round ghost', tap: 'back' }, () => this.setTool(null));
    if (t.kind === 'room') {
      const seg = el('div', 'bseg', bp);
      (['floor', 'wall'] as const).forEach((w) => {
        const b = button(seg, { label: w === 'floor' ? 'Floor' : 'Walls', cls: 'ghost lvl' + (t.style === w ? ' selected' : ''), tap: 'tab' }, () => {
          t.style = w;
          this.refreshBrushPanel();
        });
        void b;
      });
      const defType: PieceType = t.style === 'floor' ? 'floor' : 'wall';
      const def = pieceDef(defType)!;
      const st = this.lastStyle.get(familyOf(defType));
      const finish = st?.finish ?? def.finish;
      const color = st?.color ?? def.color;
      this.brushStyle = buildStylePicker(bp, {
        finishes: finishesFor(def.finishSet),
        finish,
        colors: this.colorsFor(def, finish),
        color,
        onFinish: (f) => {
          const c = f.colors.some((x) => x.toLowerCase() === (this.lastStyle.get(familyOf(defType))?.color ?? def.color).toLowerCase()) ? this.lastStyle.get(familyOf(defType))?.color ?? def.color : f.colors[0];
          this.rememberStyle(defType, c, f.id);
          this.brushStyle?.set(f.id, c, f.colors);
          this.ghostKey = '';
        },
        onColor: (c) => {
          this.rememberStyle(defType, c, this.lastStyle.get(familyOf(defType))?.finish ?? def.finish);
          this.ghostKey = '';
        },
      });
    } else if (t.kind === 'piece') {
      const def = pieceDef(t.type)!;
      if (def.kind !== 'creation') {
        const fins = finishesFor(def.finishSet);
        this.brushStyle = buildStylePicker(bp, {
          finishes: fins,
          finish: t.finish,
          colors: this.colorsFor(def, t.finish),
          color: t.color,
          onFinish: (f) => {
            t.finish = f.id;
            if (!f.colors.some((c) => c.toLowerCase() === t.color.toLowerCase())) t.color = f.colors[0];
            this.rememberStyle(def.type, t.color, t.finish);
            this.brushStyle?.set(t.finish, t.color, f.colors);
            this.ghostKey = '';
          },
          onColor: (c) => {
            t.color = c;
            this.rememberStyle(def.type, c, t.finish);
            this.ghostKey = '';
          },
        });
      }
    } else if (t.kind === 'deco') {
      buildStylePicker(bp, { finishes: [], colors: tuning.art.palette, color: t.color, onColor: (c) => { t.color = c; this.ghostKey = ''; } });
    }
  }

  private colorsFor(def: PieceDef, finish?: string): Hex[] {
    const f = finishesFor(def.finishSet).find((x) => x.id === (finish ?? def.finish));
    return f ? f.colors : tuning.art.palette;
  }

  private rememberStyle(type: PieceType, color: Hex, finish?: string): void {
    this.lastStyle.set(familyOf(type), { color, finish });
  }

  private rotateTool(): void {
    const t = this.tool;
    if (!t) return;
    if (t.kind === 'piece') t.rot = (((t.rot + 1) & 3) as Rot);
    if (t.kind === 'move') t.piece.rot = (((t.piece.rot + 1) & 3) as Rot);
    this.toolRot = t.kind === 'piece' ? t.rot : this.toolRot;
    this.ghostKey = '';
    bus.emit('pieceRotated', { pos: this.target?.pos ?? { x: 0, y: 0, z: 0 } });
    if (this.target) this.updateTargetForLast();
  }

  private lastPointer = { x: 0, y: 0 };
  private updateTargetForLast(): void {
    if (this.tool && this.tool.kind !== 'erase') this.updateTargetFor(this.tool, this.lastPointer.x, this.lastPointer.y, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Input
  // ═══════════════════════════════════════════════════════════════════════
  private onKey(e: KeyboardEvent): void {
    if (this.sheetOpen) return;
    if (e.key === 'Escape') {
      this.setTool(null);
      this.deselect();
    } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.doUndo();
    } else if (e.key === 'r' || e.key === 'R') {
      if (this.tool) this.rotateTool();
      else if (this.sel) this.rotateSelected();
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
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.ptrs.size >= 2) {
      this.cancelPaint();
      this.pendingMove = null;
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
    // dragging the selected piece moves it
    this.pendingMove = null;
    if (this.sel?.kind === 'piece' && this.mode === 'house' && this.edit && this.house?.ownerId === store.profile.id) {
      const p = this.selectedPiece();
      if (p && this.pieceUnder(e.clientX, e.clientY)?.id === p.id) this.pendingMove = p;
    }
    this.gesture = 'tap';
  }

  private onMove(e: PointerEvent): void {
    this.lastPointer = { x: e.clientX, y: e.clientY };
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
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > tuning.build.tapMaxPx) {
          if (this.pendingMove) {
            this.beginMove(this.pendingMove, true);
            this.pendingMove = null;
            this.gesture = 'paint';
            this.paintStart(e);
          } else this.gesture = 'orbit';
        }
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
    this.pendingMove = null;
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
    const p = this.pieceUnder(x, y);
    if (p) this.selectPiece(p);
    else this.deselect();
  }

  /** The piece under a screen point (house mode). */
  private pieceUnder(x: number, y: number): PlacedPiece | undefined {
    if (!this.edit) return undefined;
    this.setRay(x, y);
    for (const h of this.ray.intersectObjects(this.edit.pickLayers(), true)) {
      const p = this.edit.pieceFromHit(h);
      if (p) return p;
    }
    return undefined;
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
      this.ghostBaseY = o.position.y;   // storeys + roofs sit at their own height
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

  /** The piece a tool would place (type + style), or undefined for tools that don't place pieces. */
  private pieceSpec(tool: Tool): { type: PieceType; color: Hex; finish?: string; creationId?: string; rot: Rot; ignoreId?: string } | undefined {
    if (tool.kind === 'piece') return { type: tool.type, color: tool.color, finish: tool.finish, creationId: tool.creationId, rot: tool.rot };
    if (tool.kind === 'move') return { type: tool.piece.type, color: tool.piece.color, finish: tool.piece.finish, creationId: tool.piece.creationId, rot: tool.piece.rot, ignoreId: tool.piece.id };
    return undefined;
  }

  /** Work out where `tool` would land for a pointer position. */
  private computeTarget(tool: Tool, x: number, y: number, lift: number): Target | null {
    if (this.mode === 'house' && this.edit && this.house) {
      const spec = this.pieceSpec(tool);
      if (!spec) return null;
      const def = pieceDef(spec.type);
      if (!def) return null;
      const { S, FL, H } = dims();
      const plot = this.edit.plot;
      const hit = this.groundHit(x, y - lift, def.outdoor ? 0.05 : this.level * H + FL);
      if (!hit) return null;
      const gx = (hit.x - plot.origin.x) / S, gz = (hit.z - plot.origin.z) / S;
      const ctx = spec.ignoreId && this.moveCtx ? this.moveCtx : this.edit.ctx;
      const pieces = ctx.pieces;
      const sn = snapPiece(def, gx, gz, this.level, ctx, pieces, spec.rot);
      const cand = sn.cand;
      let ok = sn.inside && canPlace(pieces, cand);
      let replace: PlacedPiece | undefined;
      if (!ok && sn.inside && def.kind === 'edge' && def.w === 1 && isBodyWall(spec.type)) {
        // dropping a window/door on an existing wall swaps it in
        const w = ctx.walls.get(`${cand.level}|${edgeKey(cand)}`);
        if (w && w.type !== spec.type && isBodyWall(w.type) && pieceDef(w.type)?.w === 1) {
          ok = true;
          replace = w;
        }
      }
      const color = replace?.color ?? spec.color;
      const finish = replace ? replace.finish : spec.finish;
      const why = !ok && sn.inside && def.kind === 'stairs' ? stairsProblem(ctx, def, cand) ?? undefined : undefined;
      return {
        ok, cand, replace, color, finish, why,
        key: `${cand.type}|${cand.x}|${cand.z}|${cand.rot}|${cand.level}|${replace?.id ?? ''}`,
        pos: this.edit.worldPos(this.fake(spec, cand, color, finish), 0.3),
      };
    }
    if (this.mode === 'town' && tool.kind === 'deco') {
      const hit = this.groundHit(x, y - lift, 0);
      if (!hit) return null;
      const dx = Math.round(hit.x), dz = Math.round(hit.z);
      const taken = store.data.town.decorations.some((d) => d.x === dx && d.z === dz);
      const ok = !isReserved(dx, dz) && !taken;
      let rot = 0;
      if (tool.type === 'fence' || tool.type === 'hedge') rot = this.fenceRotAt(dx, dz);
      return { ok, deco: { x: dx, z: dz, rot }, key: `${tool.type}|${dx}|${dz}`, pos: { x: dx, y: 0.4, z: dz } };
    }
    return null;
  }

  /** Fences line up with a neighbouring fence, else keep the last direction. */
  private fenceRotAt(x: number, z: number): number {
    const at = (px: number, pz: number) => store.data.town.decorations.find((d) => (d.type === 'fence' || d.type === 'hedge') && d.x === px && d.z === pz);
    const n = at(x + 1, z) ?? at(x - 1, z) ?? at(x, z + 1) ?? at(x, z - 1);
    if (n) this.fenceRot = n.rot;
    return this.fenceRot;
  }

  private fake(spec: { type: PieceType; creationId?: string }, c: Cand, color: Hex, finish?: string): PlacedPiece {
    const p: PlacedPiece = { id: 'ghost', type: c.type, x: c.x, z: c.z, rot: c.rot, color };
    if (c.level === 1) p.level = 1;
    if (finish) p.finish = finish;
    if (spec.creationId) p.creationId = spec.creationId;
    return p;
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
    const spec = this.pieceSpec(tool);
    if (t.cand && spec && this.edit && this.house) {
      const color = t.color ?? spec.color;
      const fake = this.fake(spec, t.cand, color, t.finish);
      const goal = new THREE.Vector3((t.cand.x + 0.5) * S, 0, (t.cand.z + 0.5) * S);
      const edit = this.edit;
      const rest = spec.ignoreId ? this.house.pieces.filter((p) => p.id !== spec.ignoreId) : this.house.pieces;
      this.setGhost(`${t.key}|${t.ok}|${color}|${t.finish ?? ''}|${this.houseVer}`, () => buildPieceObject(fake, makeCtx([...rest, fake]), edit.origin), t.ok, goal, this.edit.root);
    } else if (t.deco && tool.kind === 'deco') {
      const d: Decoration = { id: 'ghost', type: tool.type, x: t.deco.x, z: t.deco.z, rot: t.deco.rot, color: tool.color, ownerId: store.profile.id };
      this.setGhost(`${t.key}|${t.ok}|${tool.color}|${t.deco.rot}`, () => buildDecorationMesh(d), t.ok, new THREE.Vector3(d.x, 0, d.z), this.scene);
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
    if (tool.kind === 'room') {
      // dropping the Room tile gives a ready-made 4 x 4 room centred on the finger
      const c = this.areaCell(x, y - (touch ? tuning.build.touchLift : 0), true);
      if (c) {
        const N = tuning.build.plotCells;
        const x0 = Math.min(Math.max(0, c.x - 2), N - 4), z0 = Math.min(Math.max(0, c.z - 2), N - 4);
        this.areaStart = { x: x0, z: z0 };
        this.areaEnd = { x: x0 + 3, z: z0 + 3 };
        this.updateAreaGhost(tool);
      }
      if (phase === 'end') {
        if (c) this.commitArea(tool);
        this.areaStart = null;
        this.areaEnd = null;
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
    if (this.isAreaTool(tool)) {
      this.areaStart = this.areaCell(e.clientX, e.clientY, false);
      this.areaEnd = this.areaStart;
      this.updateAreaGhost(tool);
      return;
    }
    const t = this.updateTargetFor(tool, e.clientX, e.clientY, 0);
    if (!t || tool.kind === 'move' || tool.kind === 'room' || !tool.paint) return;
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
    if (this.isAreaTool(tool)) {
      const c = this.areaCell(e.clientX, e.clientY, true);
      if (!this.areaStart) this.areaStart = this.areaCell(e.clientX, e.clientY, false);
      if (c && (!this.areaEnd || c.x !== this.areaEnd.x || c.z !== this.areaEnd.z)) {
        this.areaEnd = c;
        this.updateAreaGhost(tool);
      }
      return;
    }
    const prev = this.target?.key;
    const t = this.updateTargetFor(tool, e.clientX, e.clientY, 0);
    if (!t || tool.kind === 'move' || tool.kind === 'room' || !tool.paint || t.key === prev) return;
    this.commitFirst();
    this.commit(tool, t, true, true);
  }

  private paintEnd(e: PointerEvent, cancelled: boolean): void {
    const tool = this.tool;
    window.clearTimeout(this.paintTimer);
    if (tool && !cancelled) {
      if (tool.kind === 'erase') {
        /* strokes finish below */
      } else if (this.isAreaTool(tool)) {
        if (!this.areaEnd) this.areaEnd = this.areaCell(e.clientX, e.clientY, true);
        this.commitArea(tool);
      } else if (tool.kind !== 'move' && tool.kind !== 'room' && tool.paint) {
        this.commitFirst();
      } else {
        const t = this.updateTargetFor(tool, e.clientX, e.clientY, 0);
        if (tool.kind === 'move') {
          const placed = t ? this.commit(tool, t, false) : false;
          if (!placed && tool.viaDrag) this.setTool(null);   // dragged onto an invalid spot: it goes back
          else if (placed) this.setTool(null);
        } else if (t) this.commit(tool, t, false);
      }
    } else if (tool?.kind === 'move' && tool.viaDrag) this.setTool(null);
    this.areaStart = null;
    this.areaEnd = null;
    this.finishStroke();
    if (e.pointerType !== 'mouse' || this.isAreaTool(tool)) this.clearGhost();
  }

  private cancelPaint(): void {
    window.clearTimeout(this.paintTimer);
    this.paintFirst = null;
    this.areaStart = null;
    this.areaEnd = null;
    this.finishStroke();
    if (this.gesture === 'paint') {
      if (this.tool?.kind === 'move' && this.tool.viaDrag) this.setTool(null);
      this.clearGhost();
    }
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
  // Rectangle fills: floors, roofs, and whole rooms
  // ═══════════════════════════════════════════════════════════════════════
  /** Floors / roofs fill a dragged rectangle; the Room tool adds walls around it. */
  private isAreaTool(t: Tool | null): boolean {
    if (!t || this.mode !== 'house') return false;
    if (t.kind === 'room') return true;
    if (t.kind !== 'piece' || !t.paint) return false;
    const k = pieceDef(t.type)?.kind;
    return k === 'floor' || k === 'roof';
  }

  /** The plot cell under a pointer. With `clamp`, dragging past the lot's edge keeps the nearest cell. */
  private areaCell(x: number, y: number, clamp: boolean): { x: number; z: number } | null {
    if (!this.edit) return null;
    const { S, FL, H } = dims();
    const hit = this.groundHit(x, y, this.level * H + FL);
    if (!hit) return null;
    const N = tuning.build.plotCells;
    const o = this.edit.plot.origin;
    const gx = (hit.x - o.x) / S, gz = (hit.z - o.z) / S;
    const inside = gx >= 0 && gx < N && gz >= 0 && gz < N;
    if (!inside && !clamp) return null;
    return { x: Math.min(N - 1, Math.max(0, Math.floor(gx))), z: Math.min(N - 1, Math.max(0, Math.floor(gz))) };
  }

  /** The pieces a rectangle would create (only cells / edges that are free). */
  private areaPieces(tool: Tool, a: { x: number; z: number }, b: { x: number; z: number }): PlacedPiece[] {
    const house = this.house;
    if (!house) return [];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    const out: PlacedPiece[] = [];
    const level = this.level;
    const add = (type: PieceType, x: number, z: number, rot: Rot, color: Hex, finish?: string) => {
      const c: Cand = { type, x, z, rot, level };
      if (!canPlace(house.pieces, c)) return;
      const p: PlacedPiece = { id: 'ghost', type, x, z, rot, color };
      if (level === 1 && !isRoofType(type)) p.level = 1;
      if (finish) p.finish = finish;
      out.push(p);
    };
    const style = (type: PieceType) => {
      const def = pieceDef(type)!;
      const st = this.lastStyle.get(familyOf(type));
      return { color: st?.color ?? def.color, finish: st?.finish ?? def.finish };
    };
    if (tool.kind === 'room') {
      const f = style('floor'), w = style('wall');
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) add('floor', x, z, 0, f.color, f.finish);
      for (let x = x0; x <= x1; x++) {
        add('wall', x, z0, 0, w.color, w.finish);
        add('wall', x, z1, 2, w.color, w.finish);
      }
      for (let z = z0; z <= z1; z++) {
        add('wall', x0, z, 3, w.color, w.finish);
        add('wall', x1, z, 1, w.color, w.finish);
      }
    } else if (tool.kind === 'piece') {
      // gables run along the longer side of the area
      const rot: Rot = tool.type === 'roofGable' ? (x1 - x0 >= z1 - z0 ? 0 : 1) : tool.type === 'roofSlant' ? tool.rot : 0;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) add(tool.type, x, z, rot, tool.color, tool.finish);
    }
    return out;
  }

  private updateAreaGhost(tool: Tool): void {
    const a = this.areaStart, b = this.areaEnd;
    if (!this.edit || !this.house || !a || !b) {
      this.ghostHolder.visible = false;
      this.areaFakes = [];
      return;
    }
    const fakes = this.areaPieces(tool, a, b);
    this.areaFakes = fakes;
    const edit = this.edit;
    const key = `area|${a.x},${a.z}|${b.x},${b.z}|${this.houseVer}|${this.level}|${tool.id}|${fakes.length}`;
    const ctx = makeCtx([...this.house.pieces, ...fakes]);
    this.ghostSnap = true;
    this.setGhost(key, () => buildPiecesMesh(fakes, ctx), fakes.length > 0, new THREE.Vector3(0, 0, 0), edit.root);
    this.ghostHolder.position.set(0, 0, 0);
    const k = `${a.x},${a.z}|${b.x},${b.z}`;
    if (k !== this.lastTargetKey) {
      this.lastTargetKey = k;
      bus.emit('ghostMoved', { pos: edit.worldPos(fakes[0] ?? { id: 'g', type: 'floor', x: b.x, z: b.z, rot: 0, color: '#fff' }, 0.3) });
    }
  }

  /** Stamp the rectangle: everything lands at once with a quick build-up. */
  private commitArea(tool: Tool): void {
    const house = this.house, edit = this.edit;
    const a = this.areaStart, b = this.areaEnd;
    if (!house || !edit || !a || !b) return;
    const fakes = this.areaPieces(tool, a, b);
    if (fakes.length === 0) {
      bus.emit('placementBlocked', { pos: edit.worldPos({ id: 'g', type: 'floor', x: b.x, z: b.z, rot: 0, color: '#fff', ...(this.level === 1 ? { level: 1 as const } : {}) }, 0.3) });
      return;
    }
    const list = fakes.map((f) => ({ ...f, id: uid('pc_') }));
    store.update(() => {
      house.pieces.push(...list);
    });
    edit.ctx = makeCtx(house.pieces);
    const objs = list.map((p) => edit.add(p, false));
    edit.refreshAll();
    this.houseVer++;
    this.ghostKey = '';
    const step = Math.min(22, 700 / list.length);
    const every = Math.max(3, Math.floor(list.length / 10));
    objs.forEach((obj, i) => {
      edit.setHeld(list[i], true);
      window.setTimeout(() => {
        if (!obj.parent) return;
        edit.setHeld(list[i], false, tuning.build.placeBounceSeconds + 0.12);   // revealed; folds into the merged bake right after its pop
        if (i % every === 0) bus.emit('piecePlaced', { pos: this.fxPos(list[i]), type: list[i].type, object: obj });
        else popScale(obj, tuning.build.placeBounceSeconds, 0.22);
      }, step * i);
    });
    const ids = list.map((p) => p.id);
    this.pushUndo(() => this.undoPlaced(ids));
    this.refreshHud();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Placing / erasing
  // ═══════════════════════════════════════════════════════════════════════
  /** Place at a target. `inStroke` collects it into the running stroke's undo step. Returns true when it landed. */
  private commit(tool: Tool, t: Target, inStroke: boolean, quietBlock = false): boolean {
    if (tool.kind === 'room') return false;
    if (!t.ok) {
      if (!quietBlock) {
        bus.emit('placementBlocked', { pos: t.pos });
        if (t.why) toast(t.why);
      }
      return false;
    }
    if (tool.kind === 'move' && t.cand) {
      this.applyMove(tool, t.cand);
      return true;
    }
    if (tool.kind === 'piece' && t.cand) {
      const old = t.replace;
      if (old) this.removePieceData(old, false);
      const p = this.placePiece(tool, t.cand, t.color ?? tool.color, t.finish);
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
    return this.edit!.worldPos(p, isRoofType(p.type) ? 0.3 : 0.4);
  }

  private placePiece(tool: Extract<Tool, { kind: 'piece' }>, c: Cand, color: Hex, finish?: string): PlacedPiece {
    const house = this.house!, edit = this.edit!;
    const piece: PlacedPiece = { id: uid('pc_'), type: c.type, x: c.x, z: c.z, rot: c.rot, color };
    if (c.level === 1 && !isRoofType(c.type)) piece.level = 1;
    if (finish) piece.finish = finish;
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
    if (this.mode === 'house' && this.edit && this.house) {
      const p = this.pieceUnder(x, y);
      if (!p) return;
      this.removePieceData(p, true);
      this.eraseStroke.push(p);
    } else if (this.mode === 'town') {
      this.setRay(x, y);
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
    toast(`That one is ${name}'s`);
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
  // Move + duplicate
  // ═══════════════════════════════════════════════════════════════════════
  /** Pick a piece up: it hides, a ghost follows the pointer, drop to place (or ✖ to put it back). */
  private beginMove(p: PlacedPiece, viaDrag: boolean): void {
    if (!this.edit || !this.house) return;
    this.closeBubble();
    this.selMarker.visible = false;
    this.sel = null;
    this.palItems?.querySelectorAll('.ptile').forEach((n) => n.classList.remove('on'));
    this.tool = { kind: 'move', id: 'move', piece: p, from: { x: p.x, z: p.z, rot: p.rot, level: levelOf(p) }, viaDrag };
    this.moveCtx = makeCtx(this.house.pieces.filter((q) => q.id !== p.id));
    this.edit.setHeld(p, true);
    this.clearGhost();
    this.refreshBrushPanel();
    if (!viaDrag) toast('Drag it where you want it');
    bus.emit('pieceSelected', { pos: this.fxPos(p) });
  }

  /** If a move was abandoned, put the piece back (visible, original spot). */
  private restoreMoved(): void {
    const t = this.tool;
    if (t?.kind !== 'move' || !this.edit) return;
    t.piece.x = t.from.x;
    t.piece.z = t.from.z;
    t.piece.rot = t.from.rot;
    this.edit.setHeld(t.piece, false);
  }

  private applyMove(tool: Extract<Tool, { kind: 'move' }>, c: Cand): void {
    const p = tool.piece, edit = this.edit!;
    const from = { ...tool.from };
    const moved = from.x !== c.x || from.z !== c.z || from.rot !== c.rot || from.level !== c.level;
    store.update(() => {
      p.x = c.x;
      p.z = c.z;
      p.rot = c.rot;
      if (c.level === 1 && !isRoofType(p.type)) p.level = 1;
      else delete p.level;
    });
    edit.setHeld(p, false);
    edit.update(p);
    const obj = edit.live(p);
    obj.rotation.y = pieceRotY(p);
    this.houseVer++;
    this.ghostKey = '';
    bus.emit('piecePlaced', { pos: this.fxPos(p), type: p.type, object: obj });
    if (moved) {
      this.pushUndo(() => {
        store.update(() => {
          p.x = from.x;
          p.z = from.z;
          p.rot = from.rot;
          if (from.level === 1) p.level = 1;
          else delete p.level;
        });
        edit.update(p);
        const o = edit.live(p);
        o.rotation.y = pieceRotY(p);
        popScale(o, 0.3, 0.2);
        this.houseVer++;
      });
    }
    tool.from = { x: p.x, z: p.z, rot: p.rot, level: levelOf(p) };
  }

  /** 📋 Arm a brush that places copies of the selected piece. */
  private duplicateSelected(): void {
    const p = this.selectedPiece();
    if (!p) return;
    const def = pieceDef(p.type);
    if (!def) return;
    this.deselect();
    this.setTool({ kind: 'piece', id: `p:${p.type}`, type: p.type, color: p.color, finish: p.finish, creationId: p.creationId, rot: p.rot, paint: false });
    this.toolRot = p.rot;
    toast('Tap to place a copy');
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
      toast('Only the owner can change this house');
      return;
    }
    const def = pieceDef(p.type)!;
    const canRot = def.kind !== 'floor' && p.type !== 'table' && p.type !== 'lamp' && p.type !== 'rug' && p.type !== 'beanBag' && p.type !== 'hedge' && p.type !== 'yardTree' && p.type !== 'plant' && p.type !== 'monstera';
    const edit = this.edit;
    this.openBubble({
      rotate: canRot,
      move: true,
      dup: true,
      style: def.kind !== 'creation',
      styleFor: p,
      anchor: () => edit.topPoint(p, this.tmpV),
      onRotate: () => this.rotateSelected(),
      onMove: () => this.beginMove(p, false),
      onDup: () => this.duplicateSelected(),
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
    const h = decoDef(d.type)?.height ?? 2;
    this.openBubble({
      rotate: d.type !== 'streetLamp',
      move: false,
      dup: false,
      style: true,
      styleDeco: d,
      anchor: () => this.tmpV.set(d.x, h + 0.3, d.z),
      onRotate: () => this.rotateSelected(),
      onDelete: () => this.deleteSelected(),
    });
  }

  /** Outline on the ground around the selected thing (rectangle for footprints, bar for wall edges). */
  private placeMarker(t: PlacedPiece | Decoration): void {
    this.selMarker.visible = true;
    this.selMarker.scale.setScalar(1);
    this.selMarker.rotation.y = 0;
    const rect = (cx: number, cy: number, cz: number, w: number, d: number) => {
      const th = 0.09;
      this.selBar.visible = false;
      const spec: [number, number, number, number][] = [[0, -d / 2, w + th, th], [0, d / 2, w + th, th], [-w / 2, 0, th, d + th], [w / 2, 0, th, d + th]];
      this.selFrame.forEach((m, i) => {
        m.visible = true;
        m.position.set(spec[i][0], 0, spec[i][1]);
        m.scale.set(spec[i][2], 1, spec[i][3]);
      });
      this.selMarker.position.set(cx, cy, cz);
    };
    if ('ownerId' in t) {
      rect(t.x, 0.14, t.z, 1.4, 1.4);
      return;
    }
    const m = this.edit!.markerBox(t);
    const ox = this.edit!.plot.origin.x, oz = this.edit!.plot.origin.z;
    if (m.kind === 'edge') {
      this.selFrame.forEach((f) => (f.visible = false));
      this.selBar.visible = true;
      this.selBar.scale.set(m.alongX ? m.w : m.d, 1, m.alongX ? m.d : m.w);
      this.selMarker.position.set(ox + m.x, m.y, oz + m.z);
    } else rect(ox + m.x, m.y, oz + m.z, m.w, m.d);
  }

  private openBubble(o: {
    rotate: boolean;
    move: boolean;
    dup: boolean;
    style: boolean;
    styleFor?: PlacedPiece;
    styleDeco?: Decoration;
    anchor: () => THREE.Vector3 | null;
    onRotate: () => void;
    onMove?: () => void;
    onDup?: () => void;
    onDelete: () => void;
  }): void {
    this.closeBubble();
    const b = el('div', 'bbubble panel', this.ui) as HTMLDivElement;
    const row = el('div', 'row', b);
    if (o.rotate) button(row, { icon: '⟳', cls: 'round' }, o.onRotate);
    if (o.move) button(row, { icon: '✋', cls: 'round' }, () => o.onMove?.());
    if (o.dup) button(row, { icon: '📋', cls: 'round' }, () => o.onDup?.());
    let tray: HTMLDivElement | null = null;
    if (o.style) {
      button(row, { icon: '🎨', cls: 'round' }, () => {
        if (tray) {
          tray.style.display = tray.style.display === 'none' ? '' : 'none';
          return;
        }
        tray = el('div', 'btray', b) as HTMLDivElement;
        this.buildBubbleStyle(tray, o.styleFor, o.styleDeco);
      });
    }
    button(row, { icon: '🗑️', cls: 'round' }, o.onDelete);
    this.bubble = b;
    this.bubbleAnchor = o.anchor;
    this.positionOverlays();
  }

  private buildBubbleStyle(tray: HTMLElement, p?: PlacedPiece, d?: Decoration): void {
    if (p) {
      const def = pieceDef(p.type)!;
      const fins = finishesFor(def.finishSet);
      let picker: StylePicker;
      picker = buildStylePicker(tray, {
        finishes: fins,
        finish: p.finish ?? def.finish,
        colors: this.colorsFor(def, p.finish ?? def.finish),
        color: p.color,
        onFinish: (f) => {
          const color = f.colors.some((c) => c.toLowerCase() === p.color.toLowerCase()) ? p.color : f.colors[0];
          this.setStyle(p, color, f.id);
          picker.set(f.id, color, f.colors);
        },
        onColor: (c) => this.setStyle(p, c, p.finish ?? def.finish),
      });
    } else if (d) {
      buildStylePicker(tray, { finishes: [], colors: tuning.art.palette, color: d.color, onColor: (c) => this.recolorDeco(d, c) });
    }
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
      const def = pieceDef(p.type)!;
      const from = p.rot;
      let to: Rot | null = null;
      if (def.kind === 'creation') to = ((from + 1) & 3) as Rot;
      for (let s = 1; s <= 3 && to === null; s++) {
        const r = ((from + s) & 3) as Rot;
        if (p.type === 'roofGable' && r % 2 === from % 2) continue;
        if (canPlace(this.house.pieces, { type: p.type, x: p.x, z: p.z, rot: r, level: levelOf(p) }, p.id)) to = r;
      }
      if (to === null) {
        bus.emit('placementBlocked', { pos: this.fxPos(p) });
        return;
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
    const obj = edit.live(p);
    let steps = (rot - p.rot + 4) % 4;
    if (steps === 3) steps = -1;   // undoing a quarter turn swings back the short way
    store.update(() => {
      p.rot = rot;
    });
    this.houseVer++;
    edit.update(p);
    const flat = pieceDef(p.type)?.kind === 'roof' || pieceDef(p.type)?.kind === 'floor';
    if (!flat && steps !== 0) {
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

  /** Change a piece's colour + finish (recolors within a few seconds merge into one undo step). */
  private setStyle(p: PlacedPiece, color: Hex, finish?: string): void {
    const edit = this.edit;
    if (!edit) return;
    const origColor = p.color, origFinish = p.finish;
    if (origColor === color && origFinish === finish) return;
    const merge = this.lastRecolor && this.lastRecolor.id === p.id && performance.now() - this.lastRecolor.t < tuning.build.undoMergeMs;
    store.update(() => {
      p.color = color;
      if (finish !== undefined) p.finish = finish;
    });
    edit.update(p);
    this.houseVer++;
    this.rememberStyle(p.type, color, p.finish);
    bus.emit('pieceRecolored', { pos: this.fxPos(p), object: edit.live(p) });
    if (merge) this.lastRecolor!.t = performance.now();
    else {
      this.pushUndo(() => {
        store.update(() => {
          p.color = origColor;
          if (origFinish) p.finish = origFinish;
          else delete p.finish;
        });
        this.edit?.update(p);
        this.houseVer++;
      });
      this.lastRecolor = { id: p.id, t: performance.now() };
    }
  }

  private recolorDeco(d: Decoration, color: Hex): void {
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

  // ── Starter templates ──
  /** The big "Choose your starter home" sheet (shown on an empty lot, and from ✨ Templates). */
  private showTemplateSheet(): void {
    const house = this.house;
    if (!house || this.sheetOpen || house.ownerId !== store.profile.id) return;
    if (house.pieces.length > 0) {
      toast('Templates are for empty lots - remove the house to start over');
      return;
    }
    this.sheetOpen = true;
    this.setTool(null);
    sheet((body, close) => {
      body.classList.add('tsheet');
      el('h2', '', body, 'Choose your starter home');
      el('div', 'tsub', body, 'Pick a style, then make it yours. You can change everything.');
      const row = el('div', 'tcards', body);
      TEMPLATES.forEach((t, i) => {
        const card = el('button', 'tcard', row);
        card.style.setProperty('--ca', t.colors[0]);
        card.style.setProperty('--cb', t.colors[1]);
        const thumb = el('div', 'tthumb', card);
        el('span', 'tico', thumb, t.icon);
        el('div', 'tname', card, t.name);
        el('div', 'tblurb', card, t.blurb);
        bindTap(card, () => {
          bus.emit('uiTap', { kind: 'big' });
          close();
          this.sheetOpen = false;
          this.stampTemplate(t);
        });
        window.setTimeout(() => {
          const url = templateThumb(t);
          if (url) {
            thumb.style.backgroundImage = `url(${url})`;
            thumb.classList.add('ready');
          }
        }, 80 + i * 60);
      });
      const bottom = el('div', 'row tbottom', body);
      button(bottom, { label: 'Start from scratch', cls: 'ghost big', tap: 'back' }, () => {
        close();
        this.sheetOpen = false;
      });
      // an explicit way out for anyone who got here by accident (an empty lot is released when you leave)
      button(bottom, { label: 'Not now', cls: 'ghost big', tap: 'back' }, () => {
        close();
        this.sheetOpen = false;
        toast('No rush - tap ✨ Templates any time, or Done to leave');
      });
    }, { dismissable: true });
    // the backdrop closes the sheet without going through our buttons
    const watch = window.setInterval(() => {
      if (!document.querySelector('.tsheet')) {
        this.sheetOpen = false;
        window.clearInterval(watch);
      }
    }, 300);
    this.onExit(() => window.clearInterval(watch));
  }

  /** Stamp a template with a quick build-up animation. */
  private stampTemplate(t: Template): void {
    const house = this.house, edit = this.edit;
    if (!house || !edit || house.pieces.length > 0 || house.ownerId !== store.profile.id) return;
    const f = this.plotFrontVec(this.plotIdx);
    const list = orientLayout(t.build(), turnsForFront(f.nx, f.nz), tuning.build.plotCells);
    store.update(() => {
      house.pieces.push(...list);
    });
    edit.ctx = makeCtx(house.pieces);
    const objs = list.map((p) => edit.add(p, false));
    edit.refreshAll();
    this.houseVer++;
    const step = Math.min(26, 1700 / list.length);
    const every = Math.max(4, Math.floor(list.length / 24));
    objs.forEach((obj, i) => {
      edit.setHeld(list[i], true);
      window.setTimeout(() => {
        if (!obj.parent) return;
        edit.setHeld(list[i], false, tuning.build.placeBounceSeconds + 0.12);   // revealed; folds into the merged bake right after its pop
        if (i % every === 0) bus.emit('piecePlaced', { pos: this.fxPos(list[i]), type: list[i].type, object: obj });
        else popScale(obj, tuning.build.placeBounceSeconds, 0.22);
      }, step * i);
    });
    const ids = list.map((p) => p.id);
    this.pushUndo(() => this.undoPlaced(ids));
    this.refreshHud();
    // show the upstairs too if the template has one: the camera stays on the ground floor
    window.setTimeout(() => toast(`${t.icon} ${t.name} - make it yours`), 600);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Frame update
  // ═══════════════════════════════════════════════════════════════════════
  update(dt: number, t: number): void {
    this.orbit.update(dt);
    this.env.update(dt, t);
    tickBuildMaterials(t);
    this.edit?.tick(dt);   // fold settled piece objects back into the merged bake

    // the sun follows what we look at, so the shadow map stays sharp
    this.rig.sun.target.position.copy(this.orbit.target);
    this.rig.sun.position.copy(this.orbit.target).add(this.sunOffset);

    // pins face the camera and bob
    for (const s of this.pins) {
      s.rotation.y = this.orbit.yaw;
      s.position.y = s.userData.baseY + Math.sin(t * 2 + s.userData.phase) * 0.3;
      s.scale.setScalar(1.2 * (1 + Math.sin(t * 3 + s.userData.phase) * 0.04));
    }

    // ghost glides to its snapped spot and bobs a little
    if (this.ghostHolder.visible) {
      const k = 1 - Math.exp(-tuning.build.ghostLerp * dt);
      this.ghostHolder.position.lerp(this.ghostGoal, k);
      this.ghostBob += dt;
      if (this.ghostObj) this.ghostObj.position.y = this.ghostBaseY + 0.04 + Math.sin(this.ghostBob * 7) * 0.015;
    }

    // selection marker pulse
    if (this.selMarker.visible) this.selMat.opacity = 0.7 + Math.sin(t * 7) * 0.25;

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

