// The editable 3D view of one house, kept in sync with the saved House data.
//
// Draw-call budget: every piece used to be its own Object3D (hundreds of meshes).
// Now each storey is BAKED into a few merged meshes per material (like the town
// bake): floors+furniture, walls (+ corner posts) and roofs are separate "slots".
// A piece that was just placed / changed / is being moved is pulled out of the bake
// into its own small object so it can pop, rotate and be hidden; a moment later it
// "folds" back in (one slot re-bake, after the edits go quiet).
//
// Two storeys: each level group sits at y = level * wallHeight and everything inside
// it is level-local; roofs live in one group in plot-local space and sit on top of
// whichever storey is highest.
import * as THREE from 'three';
import type { House, PlacedPiece } from '../core/model';
import type { Plot } from '../world/townLayout';
import { tuning } from '../tuning';
import { tweens, ease } from '../core/tween';
import { v3, type V3 } from '../core/events';
import { Baker, Brush, bakedToGroup, disposeBaked } from './bake';
import { buildPieceObject, refillPieceObject } from '../world/houseMesh';
import { dims } from './kit';
import { pieceDef } from './catalog';
import { footprintCells, edgeCells, levelOf, makeCtx, rotOffset, topLevelAt, type HouseCtx, type Level } from './rules';
import { bakePosts, genPiece, pieceBaseY, pieceRotY } from './pieces';

interface LevelGroup {
  root: THREE.Group;   // at y = level * H; hidden as a whole when the other storey is being edited
  stat: THREE.Group;   // floors, rugs, furniture, stairs, creations
  wall: THREE.Group;   // walls, windows, doors, fences, wall decor (+ corner posts); scaled by the "low walls" view
}

/** A range of one merged mesh's index buffer that belongs to a piece. */
interface IdSpan { s: number; e: number; id: string }
interface Span { mesh: THREE.Mesh; s: number; e: number }

/** One merged bake: all baked pieces of one storey's layer (or of the roofs over one storey). */
interface Slot {
  key: string;                        // 's0' 'w0' 's1' 'w1' 'r0' 'r1'
  kind: 's' | 'w' | 'r';
  lv: Level;
  group: THREE.Group;                 // holds the merged meshes
  dirty: boolean;
  where: Map<string, Span[]>;         // piece id -> its triangle ranges
}

/** Selection marker geometry for a piece, in plot-local space. */
export interface MarkerBox {
  kind: 'rect' | 'edge';
  x: number;       // centre
  z: number;
  y: number;       // height of the plane it sits on
  w: number;       // extent along x (rect) / length along the edge (edge)
  d: number;       // extent along z (rect)
  alongX: boolean; // edge runs along x?
}

function findSpan(spans: readonly IdSpan[], at: number): string | undefined {
  let lo = 0, hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const sp = spans[mid];
    if (at < sp.s) hi = mid - 1;
    else if (at >= sp.e) lo = mid + 1;
    else return sp.id;
  }
  return undefined;
}

export class EditView {
  /** Plot-local space (positioned at the plot's origin corner). */
  readonly root = new THREE.Group();
  readonly levels: LevelGroup[];
  readonly roofs = new THREE.Group();
  /** Pieces that currently have their OWN object (just placed / changed / held, and creations). The rest live in the bake. */
  readonly objs = new Map<string, THREE.Group>();
  ctx: HouseCtx;
  level: Level = 0;
  private roofsOn = true;
  private grid: THREE.Mesh;
  readonly origin: { x: number; z: number };
  private slots: Slot[] = [];
  private slotByKey = new Map<string, Slot>();
  private baked = new Map<string, Slot>();        // piece id -> the slot whose bake draws it
  private liveUntil = new Map<string, number>();  // piece id -> clock time its own object may fold back
  private held = new Set<string>();               // hidden on purpose (being moved)
  private clock = 0;
  private lastChange = 0;
  private foldable = 0;                           // own objects that will fold back into the bake (everything but creations)

  constructor(readonly house: House, readonly plot: Plot) {
    this.origin = { x: plot.origin.x, z: plot.origin.z };
    this.root.position.set(plot.origin.x, 0, plot.origin.z);
    const { H } = dims();
    this.levels = [0, 1].map((lv) => {
      const g: LevelGroup = { root: new THREE.Group(), stat: new THREE.Group(), wall: new THREE.Group() };
      g.root.position.y = lv * H;
      g.root.add(g.stat, g.wall);
      this.root.add(g.root);
      return g;
    });
    this.root.add(this.roofs);
    const mk = (kind: 's' | 'w' | 'r', lv: Level, parent: THREE.Group) => {
      const slot: Slot = { key: kind + lv, kind, lv, group: new THREE.Group(), dirty: false, where: new Map() };
      parent.add(slot.group);
      this.slots.push(slot);
      this.slotByKey.set(slot.key, slot);
    };
    for (const lv of [0, 1] as const) {
      mk('s', lv, this.levels[lv].stat);
      mk('w', lv, this.levels[lv].wall);
      mk('r', lv, this.roofs);
    }
    this.ctx = makeCtx(house.pieces);
    // creations keep their own objects (they are meshes made elsewhere); everything else is baked
    for (const p of house.pieces) if (p.type === 'creation') this.makeLive(p, true);
    for (const slot of this.slots) this.rebake(slot);
    this.grid = this.makeGrid();
    this.root.add(this.grid);
    this.setLevel(0);
  }

  // ── Which layer a piece belongs to ──
  private slotKey(p: PlacedPiece): string | null {
    const def = pieceDef(p.type);
    if (!def || p.type === 'creation') return null;
    if (def.kind === 'roof') return 'r' + topLevelAt(this.ctx, p.x, p.z);
    return (def.kind === 'edge' || def.kind === 'wallDeco' ? 'w' : 's') + levelOf(p);
  }

  /** Parent of a piece's own object. */
  private parentOf(p: PlacedPiece): THREE.Group {
    const def = pieceDef(p.type);
    if (def?.kind === 'roof') return this.roofs;
    const lv = this.levels[levelOf(p)];
    return def?.kind === 'edge' || def?.kind === 'wallDeco' ? lv.wall : lv.stat;
  }

  /** Put a piece object at its height: roofs in plot-local space, everything else level-local. */
  private seat(g: THREE.Group, p: PlacedPiece): void {
    g.position.y = pieceDef(p.type)?.kind === 'roof' ? pieceBaseY(p, this.ctx) : 0;
  }

  // ── Baking ──
  private rebake(slot: Slot): void {
    slot.dirty = false;
    for (const id of slot.where.keys()) if (this.baked.get(id) === slot) this.baked.delete(id);
    slot.where.clear();
    disposeBaked(slot.group);
    slot.group.clear();

    const { S, H } = dims();
    const roof = slot.kind === 'r';
    const baker = new Baker();
    const br = new Brush(baker);
    const rot = new THREE.Matrix4();
    baker.uvBase.makeTranslation(this.origin.x, roof ? 0 : slot.lv * H, this.origin.z);
    const spans: Record<string, IdSpan[]> = {};
    for (const p of this.house.pieces) {
      if (this.objs.has(p.id) || this.slotKey(p) !== slot.key) continue;
      baker.base.makeTranslation((p.x + 0.5) * S, roof ? pieceBaseY(p, this.ctx) : 0, (p.z + 0.5) * S).multiply(rot.makeRotationY(pieceRotY(p)));
      const m0 = baker.mark();
      genPiece(br, p, this.ctx);
      const m1 = baker.mark();
      for (const f in m1) {
        const s = m0[f] ?? 0;
        if (m1[f] > s) (spans[f] ??= []).push({ s, e: m1[f], id: p.id });
      }
    }
    if (slot.kind === 'w') {
      baker.base.identity();
      bakePosts(br, this.ctx, slot.lv);
    }
    bakedToGroup(baker.bake(), slot.group);
    for (const m of slot.group.children as THREE.Mesh[]) {
      const list = spans[m.userData.fin as string] ?? [];
      m.userData.spans = list;
      for (const sp of list) {
        let w = slot.where.get(sp.id);
        if (!w) slot.where.set(sp.id, (w = []));
        w.push({ mesh: m, s: sp.s, e: sp.e });
        this.baked.set(sp.id, slot);
      }
    }
  }

  /** Hide a baked piece right now (its triangles collapse to nothing); the slot re-bakes later. */
  private tombstone(id: string): void {
    const slot = this.baked.get(id);
    if (!slot) return;
    for (const sp of slot.where.get(id) ?? []) {
      const idx = sp.mesh.geometry.getIndex();
      if (!idx) continue;
      (idx.array as Uint16Array | Uint32Array).fill(0, sp.s, sp.e);
      idx.needsUpdate = true;
    }
    slot.where.delete(id);
    this.baked.delete(id);
  }

  private dirty(key: string | null): void {
    const slot = key ? this.slotByKey.get(key) : undefined;
    if (slot) slot.dirty = true;
  }

  // ── Live (own-object) pieces ──
  /** Give the piece its own object (pulled out of the bake). */
  private makeLive(p: PlacedPiece, sticky = false): THREE.Group {
    const g = buildPieceObject(p, this.ctx, this.origin);
    g.userData.piece = p;
    if (pieceDef(p.type)?.kind === 'roof') g.userData.capLevel = topLevelAt(this.ctx, p.x, p.z);
    this.seat(g, p);
    this.parentOf(p).add(g);
    this.objs.set(p.id, g);
    if (!sticky) {
      this.foldable++;
      this.keepLive(p.id);
    }
    this.tombstone(p.id);
    this.lastChange = this.clock;
    return g;
  }

  /** The piece's own object: created (and pulled out of the bake) if it only lived in the bake. */
  live(p: PlacedPiece): THREE.Group {
    return this.objs.get(p.id) ?? this.makeLive(p);
  }

  /** Keep the piece's own object for a while longer (an animation is playing on it). */
  keepLive(p: PlacedPiece | string, seconds: number = tuning.build.liveSeconds): void {
    const id = typeof p === 'string' ? p : p.id;
    this.liveUntil.set(id, this.clock + seconds);
  }

  /** Hide (or bring back) a piece's object on purpose, e.g. while it is being moved. `keep` = how long it stays its own object once shown. */
  setHeld(p: PlacedPiece, held: boolean, keep?: number): void {
    const g = this.live(p);
    if (held) this.held.add(p.id);
    else this.held.delete(p.id);
    g.visible = !held;
    if (!held) {
      this.keepLive(p.id, keep);
      this.applyVisibility();   // a roof over the other storey stays hidden
    }
    this.lastChange = this.clock;
  }

  private dropLive(id: string, g: THREE.Group): void {
    tweens.cancel(g);
    tweens.cancel(g.rotation);
    g.parent?.remove(g);
    disposeBaked(g);
    if ((g.userData.piece as PlacedPiece | undefined)?.type !== 'creation') this.foldable--;
    this.objs.delete(id);
    this.liveUntil.delete(id);
    this.held.delete(id);
  }

  /** Create the object for a piece (already in house.pieces). It folds into the bake after a moment. */
  add(p: PlacedPiece, refresh = true): THREE.Group {
    if (refresh) this.ctx = makeCtx(this.house.pieces);
    const g = this.objs.get(p.id) ?? this.makeLive(p, p.type === 'creation');
    if (refresh) this.refreshAround(p);
    return g;
  }

  /** The piece was already removed from house.pieces. */
  remove(p: PlacedPiece): void {
    const g = this.objs.get(p.id);
    if (g) this.dropLive(p.id, g);
    else this.tombstone(p.id);
    this.ctx = makeCtx(this.house.pieces);
    this.lastChange = this.clock;
    this.refreshAround(p);
  }

  /** Colour / rotation / position / finish changed: rebuild the piece's visuals (and re-parent if its level changed). */
  update(p: PlacedPiece): void {
    this.ctx = makeCtx(this.house.pieces);
    const g = this.objs.get(p.id);
    if (!g) this.makeLive(p);
    else {
      const par = this.parentOf(p);
      if (g.parent !== par) par.add(g);
      g.position.x = (p.x + 0.5) * dims().S;
      g.position.z = (p.z + 0.5) * dims().S;
      refillPieceObject(g, p, this.ctx, this.origin);
      if (pieceDef(p.type)?.kind === 'roof') g.userData.capLevel = topLevelAt(this.ctx, p.x, p.z);
      this.seat(g, p);
      if (!this.held.has(p.id)) this.keepLive(p.id);
    }
    this.lastChange = this.clock;
    this.refreshAround(p);
  }

  /** Neighbours that depend on this piece (corner posts, roof runs, roof heights, things on tables). */
  private refreshAround(p: PlacedPiece): void {
    const def = pieceDef(p.type);
    if (!def) return;
    if (def.kind === 'edge') this.dirty('w' + levelOf(p));
    if (def.kind === 'roof') this.refillRoofs(p.id, p);
    else if (def.kind === 'floor' || def.kind === 'edge' || def.kind === 'stairs' || levelOf(p) === 1) {
      // a storey change lifts / lowers the roofs over it
      this.refillRoofs(p.id);
    }
    if (def.top || def.kind === 'rug') {
      for (const q of this.house.pieces) {
        if (q.type === 'creation' && levelOf(q) === levelOf(p)) {
          const g = this.objs.get(q.id);
          if (g) {
            refillPieceObject(g, q, this.ctx, this.origin);
            this.seat(g, q);
          }
        }
      }
    }
    this.applyVisibility();
  }

  private refillRoofs(exceptId?: string, near?: PlacedPiece): void {
    this.dirty('r0');
    this.dirty('r1');
    for (const [id, g] of this.objs) {
      const q = g.userData.piece as PlacedPiece | undefined;
      if (!q || pieceDef(q.type)?.kind !== 'roof' || id === exceptId) continue;
      if (near && q.x !== near.x && q.z !== near.z) continue;
      refillPieceObject(g, q, this.ctx, this.origin);
      g.userData.capLevel = topLevelAt(this.ctx, q.x, q.z);
      this.seat(g, q);
    }
  }

  /** After a bulk change (template stamp, undo of many) rebuild every dependent. */
  refreshAll(): void {
    this.ctx = makeCtx(this.house.pieces);
    for (const slot of this.slots) slot.dirty = true;
    for (const g of this.objs.values()) {
      const q = g.userData.piece as PlacedPiece | undefined;
      if (q && pieceDef(q.type)?.kind === 'roof') {
        refillPieceObject(g, q, this.ctx, this.origin);
        g.userData.capLevel = topLevelAt(this.ctx, q.x, q.z);
        this.seat(g, q);
      }
    }
    this.lastChange = this.clock;
    this.applyVisibility();
  }

  /**
   * Per frame: folds settled piece objects back into the merged bake. Work is spread
   * out - at most one slot is re-baked per call, and only once edits have gone quiet
   * (or too many separate objects pile up).
   */
  tick(dt: number): void {
    this.clock += dt;
    let pending = false;
    for (const slot of this.slots) if (slot.dirty) pending = true;
    if (!pending && this.foldable === 0) return;
    const calm = this.clock - this.lastChange >= tuning.build.foldQuietSeconds;
    const crowded = this.objs.size > tuning.build.maxLive;
    if (!calm && !crowded) return;
    // pieces that are ready to go back into the bake, grouped by slot
    const ready = new Map<string, string[]>();
    for (const [id, g] of this.objs) {
      const p = g.userData.piece as PlacedPiece | undefined;
      if (!p || p.type === 'creation' || this.held.has(id)) continue;
      if ((this.liveUntil.get(id) ?? 0) > this.clock) continue;
      const k = this.slotKey(p);
      if (!k) continue;
      let l = ready.get(k);
      if (!l) ready.set(k, (l = []));
      l.push(id);
    }
    for (const slot of this.slots) {
      const ids = ready.get(slot.key);
      if (!slot.dirty && !ids) continue;
      if (!calm && !ids) continue;   // crowded: only fold, don't chase dirty flags
      for (const id of ids ?? []) {
        const g = this.objs.get(id);
        if (g) this.dropLive(id, g);
      }
      this.rebake(slot);
      return;
    }
  }

  /** Force every pending fold / re-bake now (tests, teardown). */
  settle(): void {
    for (const [id, g] of [...this.objs]) {
      const p = g.userData.piece as PlacedPiece | undefined;
      if (!p || p.type === 'creation' || this.held.has(id)) continue;
      this.dropLive(id, g);
      this.dirty(this.slotKey(p));
    }
    for (const slot of this.slots) if (slot.dirty) this.rebake(slot);
  }

  /** Debug / budget: how many meshes the view holds right now. */
  stats(): { baked: number; live: number } {
    let baked = 0;
    for (const slot of this.slots) baked += slot.group.children.length;
    let live = 0;
    for (const g of this.objs.values()) g.traverse((o) => { if ((o as THREE.Mesh).isMesh) live++; });
    return { baked, live };
  }

  // ── Views ──
  /** Which storey is being edited. The upper storey is hidden while editing the ground floor. */
  setLevel(l: Level): void {
    this.level = l;
    const { H, FL } = dims();
    this.grid.position.y = l * H + FL + 0.022;
    this.applyVisibility();
  }

  setRoofsVisible(v: boolean): void {
    this.roofsOn = v;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.levels[1].root.visible = this.level === 1;
    this.roofs.visible = this.roofsOn;
    // roofs over the upper storey only show while that storey is being edited
    this.slotByKey.get('r1')!.group.visible = this.level === 1;
    for (const [id, g] of this.objs) {
      const q = g.userData.piece as PlacedPiece | undefined;
      if (!q || pieceDef(q.type)?.kind !== 'roof' || this.held.has(id)) continue;
      g.visible = this.level === 1 || (g.userData.capLevel ?? 0) === 0;
    }
  }

  /** "Low walls" view so you can see into the house. */
  setWallsLow(low: boolean): void {
    const to = low ? tuning.build.wallLowScale : 1;
    for (const lv of this.levels) {
      const wall = lv.wall;
      const from = wall.scale.y;
      tweens.add(0.28, (k) => wall.scale.set(1, from + (to - from) * k, 1), { ease: ease.outCubic, key: wall });
    }
  }
  setGridVisible(v: boolean): void {
    this.grid.visible = v;
  }

  /** Layers that can currently be hit by a pointer ray: the storey being edited (+ roofs when shown). */
  pickLayers(): THREE.Object3D[] {
    const lv = this.levels[this.level];
    const out: THREE.Object3D[] = [lv.stat, lv.wall];
    if (this.roofs.visible) out.push(this.roofs);
    return out;
  }

  /** The piece a ray hit (merged meshes carry per-piece triangle ranges; own objects carry the piece id). */
  pieceFromHit(h: THREE.Intersection): PlacedPiece | undefined {
    for (let a: THREE.Object3D | null = h.object; a; a = a.parent) if (!a.visible) return undefined;
    const spans = h.object.userData.spans as IdSpan[] | undefined;
    let id: string | undefined;
    if (spans && h.faceIndex !== undefined && h.faceIndex !== null) id = findSpan(spans, h.faceIndex * 3);
    else {
      for (let o: THREE.Object3D | null = h.object; o && !id; o = o.parent) id = o.userData.pieceId as string | undefined;
    }
    return id ? this.house.pieces.find((p) => p.id === id) : undefined;
  }

  // ── Positions ──
  /** Footprint box of a piece in plot-local cell units (cells from the origin). */
  private cellsBox(p: PlacedPiece): { x0: number; z0: number; x1: number; z1: number } {
    const def = pieceDef(p.type)!;
    const cells = def.kind === 'edge' ? edgeCells(p.x, p.z, p.rot, def.w) : def.kind === 'wallDeco' || def.kind === 'floor' || def.kind === 'roof' || def.kind === 'creation' ? [[p.x, p.z] as [number, number]] : footprintCells(def, p.x, p.z, p.rot);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of cells) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x + 1);
      z1 = Math.max(z1, z + 1);
    }
    return { x0, z0, x1, z1 };
  }

  /** Selection marker placement for a piece (plot-local). */
  markerBox(p: PlacedPiece): MarkerBox {
    const { S, FL } = dims();
    const def = pieceDef(p.type)!;
    const y = pieceBaseY(p, this.ctx) + (def.kind === 'roof' ? 0.05 : FL + 0.04);
    if (def.kind === 'edge' || def.kind === 'wallDeco') {
      const [ex, ez] = def.kind === 'edge' ? this.edgeCenter(p) : this.edgeCenter({ ...p, type: 'wall' });
      return { kind: 'edge', x: ex, z: ez, y, w: (def.kind === 'edge' ? def.w : 1) * S, d: 0.4, alongX: p.rot % 2 === 0 };
    }
    const b = this.cellsBox(p);
    return { kind: 'rect', x: ((b.x0 + b.x1) / 2) * S, z: ((b.z0 + b.z1) / 2) * S, y, w: (b.x1 - b.x0) * S, d: (b.z1 - b.z0) * S, alongX: true };
  }

  /** Centre of an edge piece's edge line (cells->world, plot-local). */
  private edgeCenter(p: PlacedPiece): [number, number] {
    const { S } = dims();
    const def = pieceDef(p.type)!;
    const span = def.kind === 'edge' ? def.w : 1;
    const [mx, mz] = rotOffset((span - 1) / 2, -0.5, p.rot);   // middle of the span, half a cell toward the front (north in local)
    return [(p.x + 0.5 + mx) * S, (p.z + 0.5 + mz) * S];
  }

  /** World-space centre of a piece (for fx / bubbles). */
  worldPos(p: PlacedPiece, y?: number): V3 {
    const m = this.markerBox(p);
    const yy = y !== undefined ? pieceBaseY(p, this.ctx) + y : m.y;
    return v3({ x: this.plot.origin.x + m.x, y: yy, z: this.plot.origin.z + m.z });
  }

  /** A point above the piece for the selection bubble. */
  topPoint(p: PlacedPiece, out = new THREE.Vector3()): THREE.Vector3 {
    const def = pieceDef(p.type)!;
    const { H, FL } = dims();
    const m = this.markerBox(p);
    const base = pieceBaseY(p, this.ctx);
    let h = FL + (def.top ?? 1.0) + 0.4;
    if (def.kind === 'edge' || def.kind === 'wallDeco') h = FL + (def.kind === 'wallDeco' ? 2.2 : H * this.levels[levelOf(p)].wall.scale.y) + 0.3;
    else if (def.kind === 'roof') h = 1.6;
    else if (def.kind === 'floor' || def.kind === 'rug') h = 0.6;
    else if (def.kind === 'stairs') h = H * 0.6;
    else if (def.outdoor) h = Math.max(h, 1.6);
    return out.set(this.plot.origin.x + m.x, base + h, this.plot.origin.z + m.z);
  }

  private makeGrid(): THREE.Mesh {
    const { S } = dims();
    const N = tuning.build.plotCells;
    const w = 0.03, y = 0;
    const pos: number[] = [];
    const idx: number[] = [];
    const quad = (x0: number, z0: number, x1: number, z1: number) => {
      const o = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    };
    for (let i = 0; i <= N; i++) {
      const t = i * S;
      const ww = i === 0 || i === N ? w * 2.5 : w;
      quad(0, t - ww / 2, N * S, t + ww / 2);
      quad(t - ww / 2, 0, t + ww / 2, N * S);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    m.renderOrder = 2;
    return m;
  }

  dispose(): void {
    this.root.traverse((o) => {
      tweens.cancel(o);
      tweens.cancel(o.rotation);
    });
    for (const lv of this.levels) tweens.cancel(lv.wall);
    disposeBaked(this.root);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.root.parent?.remove(this.root);
  }
}
