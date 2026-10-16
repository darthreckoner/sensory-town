// The editable 3D view of one house: a Group per placed piece (so each piece
// can pop, rotate and be picked), kept in sync with the saved House data.
// Two storeys: each level has its own base plane (y = level * wallHeight);
// roofs live in one group and sit on top of whichever storey is highest.
import * as THREE from 'three';
import type { House, PlacedPiece } from '../core/model';
import type { Plot } from '../world/townLayout';
import { tuning } from '../tuning';
import { tweens, ease } from '../core/tween';
import { v3, type V3 } from '../core/events';
import { disposeBaked } from './bake';
import { buildPieceObject, refillPieceObject, buildPostsGroup } from '../world/houseMesh';
import { dims } from './kit';
import { pieceDef } from './catalog';
import { footprintCells, edgeCells, levelOf, makeCtx, rotOffset, topLevelAt, type HouseCtx, type Level } from './rules';
import { pieceBaseY } from './pieces';

type LayerName = 'floor' | 'wall' | 'furn';

interface LevelGroup {
  root: THREE.Group;
  floor: THREE.Group;
  wall: THREE.Group;
  furn: THREE.Group;
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

export class EditView {
  /** Plot-local space (positioned at the plot's origin corner). */
  readonly root = new THREE.Group();
  readonly levels: LevelGroup[];
  readonly roofs = new THREE.Group();
  readonly objs = new Map<string, THREE.Group>();
  ctx: HouseCtx;
  level: Level = 0;
  private roofsOn = true;
  private posts: (THREE.Group | null)[] = [null, null];
  private grid: THREE.Mesh;
  readonly origin: { x: number; z: number };

  constructor(readonly house: House, readonly plot: Plot) {
    this.origin = { x: plot.origin.x, z: plot.origin.z };
    this.root.position.set(plot.origin.x, 0, plot.origin.z);
    const { H } = dims();
    this.levels = [0, 1].map((lv) => {
      const g: LevelGroup = { root: new THREE.Group(), floor: new THREE.Group(), wall: new THREE.Group(), furn: new THREE.Group() };
      g.root.position.y = lv * H;
      g.root.add(g.floor, g.wall, g.furn);
      this.root.add(g.root);
      return g;
    });
    this.root.add(this.roofs);
    this.ctx = makeCtx(house.pieces);
    for (const p of house.pieces) this.add(p, false);
    this.rebuildPosts();
    this.refillRoofs();
    this.grid = this.makeGrid();
    this.root.add(this.grid);
    this.setLevel(0);
  }

  private parentOf(p: PlacedPiece): THREE.Group {
    const def = pieceDef(p.type);
    if (def?.kind === 'roof') return this.roofs;
    const lv = this.levels[levelOf(p)];
    const k: LayerName = def?.kind === 'floor' || def?.kind === 'rug' ? 'floor' : def?.kind === 'edge' ? 'wall' : 'furn';
    return lv[k];
  }

  /** Create the object for a piece (already in house.pieces). */
  add(p: PlacedPiece, refresh = true): THREE.Group {
    if (refresh) this.ctx = makeCtx(this.house.pieces);
    const g = buildPieceObject(p, this.ctx, this.origin);
    g.userData.capLevel = topLevelAt(this.ctx, p.x, p.z);
    this.parentOf(p).add(g);
    this.objs.set(p.id, g);
    if (refresh) this.refreshAround(p);
    return g;
  }

  /** The piece was already removed from house.pieces. */
  remove(p: PlacedPiece): void {
    const g = this.objs.get(p.id);
    if (g) {
      tweens.cancel(g);
      tweens.cancel(g.rotation);
      g.parent?.remove(g);
      disposeBaked(g);
      this.objs.delete(p.id);
    }
    this.ctx = makeCtx(this.house.pieces);
    this.refreshAround(p);
  }

  /** Colour / rotation / position / finish changed: rebuild the piece's visuals (and re-parent if its level changed). */
  update(p: PlacedPiece): void {
    this.ctx = makeCtx(this.house.pieces);
    const g = this.objs.get(p.id);
    if (g) {
      const par = this.parentOf(p);
      if (g.parent !== par) par.add(g);
      g.position.x = (p.x + 0.5) * dims().S;
      g.position.z = (p.z + 0.5) * dims().S;
      refillPieceObject(g, p, this.ctx, this.origin);
    }
    this.refreshAround(p);
  }

  /** Neighbours that depend on this piece (corner fills, roof runs, roof heights, things on tables). */
  private refreshAround(p: PlacedPiece): void {
    const def = pieceDef(p.type);
    if (!def) return;
    if (def.kind === 'edge') this.rebuildPosts();
    if (def.kind === 'roof') this.refillRoofs(p.id, p);
    else if (def.kind === 'floor' || def.kind === 'edge' || def.kind === 'stairs' || levelOf(p) === 1) {
      // a storey change lifts / lowers the roofs over it
      this.refillRoofs(p.id);
    }
    if (def.top || def.kind === 'rug') {
      for (const q of this.house.pieces) {
        if (q.type === 'creation' && levelOf(q) === levelOf(p)) {
          const g = this.objs.get(q.id);
          if (g) refillPieceObject(g, q, this.ctx, this.origin);
        }
      }
    }
    this.applyVisibility();
  }

  private refillRoofs(exceptId?: string, near?: PlacedPiece): void {
    for (const q of this.house.pieces) {
      if (pieceDef(q.type)?.kind !== 'roof' || q.id === exceptId) continue;
      if (near && q.x !== near.x && q.z !== near.z) continue;
      const g = this.objs.get(q.id);
      if (!g) continue;
      refillPieceObject(g, q, this.ctx, this.origin);
      g.userData.capLevel = topLevelAt(this.ctx, q.x, q.z);
    }
  }

  private rebuildPosts(): void {
    for (const lv of [0, 1] as const) {
      const old = this.posts[lv];
      if (old) {
        old.parent?.remove(old);
        disposeBaked(old);
      }
      const g = buildPostsGroup(this.ctx, lv, this.origin);
      this.levels[lv].wall.add(g);
      this.posts[lv] = g;
    }
  }

  /** After a bulk change (template stamp, undo of many) rebuild every dependent. */
  refreshAll(): void {
    this.ctx = makeCtx(this.house.pieces);
    this.rebuildPosts();
    this.refillRoofs();
    for (const q of this.house.pieces) {
      const g = this.objs.get(q.id);
      if (g && pieceDef(q.type)?.kind === 'roof') g.userData.capLevel = topLevelAt(this.ctx, q.x, q.z);
    }
    this.applyVisibility();
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
    for (const c of this.roofs.children) c.visible = this.level === 1 || (c.userData.capLevel ?? 0) === 0;
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
    const out: THREE.Object3D[] = [lv.floor, lv.wall, lv.furn];
    if (this.roofs.visible) out.push(this.roofs);
    return out;
  }

  /** Walk up from a hit object to the piece it belongs to (ignoring anything hidden). */
  pieceFromObject(o: THREE.Object3D | null): PlacedPiece | undefined {
    for (let a: THREE.Object3D | null = o; a; a = a.parent) if (!a.visible) return undefined;
    while (o) {
      const id = o.userData.pieceId as string | undefined;
      if (id) return this.house.pieces.find((p) => p.id === id);
      o = o.parent;
    }
    return undefined;
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
    const { H } = dims();
    const yy = y !== undefined ? pieceBaseY(p, this.ctx) + y : m.y;
    void H;
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
