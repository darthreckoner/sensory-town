// The editable 3D view of one house: a Group per placed piece (so each piece
// can pop, rotate and be picked), kept in sync with the saved House data.
import * as THREE from 'three';
import type { House, PlacedPiece } from '../core/model';
import type { Plot } from '../world/townLayout';
import { tuning } from '../tuning';
import { tweens, ease } from '../core/tween';
import { v3, type V3 } from '../core/events';
import { disposeBaked } from './bake';
import { buildPieceObject, refillPieceObject, buildPostsGroup } from '../world/houseMesh';
import { dims, isRoofType, isWallType, makeCtx, pieceRotY, type HouseCtx } from './pieces';

type LayerName = 'floor' | 'wall' | 'furn' | 'roof';

export class EditView {
  /** Plot-local space (positioned at the plot's origin corner). */
  readonly root = new THREE.Group();
  readonly layers: Record<LayerName, THREE.Group> = {
    floor: new THREE.Group(),
    wall: new THREE.Group(),
    furn: new THREE.Group(),
    roof: new THREE.Group(),
  };
  readonly objs = new Map<string, THREE.Group>();
  ctx: HouseCtx;
  private posts: THREE.Group | null = null;
  private grid: THREE.Mesh;

  constructor(readonly house: House, readonly plot: Plot) {
    this.root.position.set(plot.origin.x, 0, plot.origin.z);
    for (const l of Object.values(this.layers)) this.root.add(l);
    this.ctx = makeCtx(house.pieces);
    for (const p of house.pieces) this.add(p, false);
    this.rebuildPosts();
    this.refillRoofs();
    this.grid = this.makeGrid();
    this.root.add(this.grid);
  }

  private layerOf(p: PlacedPiece): THREE.Group {
    if (p.type === 'floor' || p.type === 'rug') return this.layers.floor;
    if (isWallType(p.type)) return this.layers.wall;
    if (isRoofType(p.type)) return this.layers.roof;
    return this.layers.furn;
  }

  /** Create the object for a piece (already in house.pieces). */
  add(p: PlacedPiece, refresh = true): THREE.Group {
    if (refresh) this.ctx = makeCtx(this.house.pieces);
    const g = buildPieceObject(p, this.ctx);
    this.layerOf(p).add(g);
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

  /** Colour / rotation changed: rebuild the piece's visuals. */
  update(p: PlacedPiece): void {
    this.ctx = makeCtx(this.house.pieces);
    const g = this.objs.get(p.id);
    if (g) refillPieceObject(g, p, this.ctx);
    this.refreshAround(p);
  }

  /** Neighbours that depend on this piece (corner posts, roof runs, things on tables). */
  private refreshAround(p: PlacedPiece): void {
    if (isWallType(p.type)) this.rebuildPosts();
    else if (isRoofType(p.type)) this.refillRoofs(p.id, p);
    else if (p.type === 'table' || p.type === 'shelf' || p.type === 'rug') {
      for (const q of this.house.pieces) {
        if (q.type === 'creation' && q.x === p.x && q.z === p.z) {
          const g = this.objs.get(q.id);
          if (g) refillPieceObject(g, q, this.ctx);
        }
      }
    }
  }

  /** Re-draw roofs (all, or just the row + column around `near` — all a roof can depend on). */
  private refillRoofs(exceptId?: string, near?: PlacedPiece): void {
    for (const q of this.house.pieces) {
      if (!isRoofType(q.type) || q.id === exceptId) continue;
      if (near && q.x !== near.x && q.z !== near.z) continue;
      const g = this.objs.get(q.id);
      if (g) refillPieceObject(g, q, this.ctx);
    }
  }

  private rebuildPosts(): void {
    if (this.posts) {
      this.posts.parent?.remove(this.posts);
      disposeBaked(this.posts);
    }
    this.posts = buildPostsGroup(this.ctx);
    this.layers.wall.add(this.posts);
  }

  /** After a bulk change (starter stamp, undo of many) rebuild every dependent. */
  refreshAll(): void {
    this.ctx = makeCtx(this.house.pieces);
    this.rebuildPosts();
    this.refillRoofs();
  }

  // ── Views ──
  setRoofsVisible(v: boolean): void {
    this.layers.roof.visible = v;
  }
  /** "Low walls" view so you can see into the house. */
  setWallsLow(low: boolean): void {
    const wall = this.layers.wall;
    const to = low ? tuning.build.wallLowScale : 1;
    const from = wall.scale.y;
    tweens.add(0.28, (k) => wall.scale.set(1, from + (to - from) * k, 1), { ease: ease.outCubic, key: wall });
  }
  setGridVisible(v: boolean): void {
    this.grid.visible = v;
  }

  /** Layers that can currently be hit by a pointer ray. */
  pickLayers(): THREE.Object3D[] {
    return Object.values(this.layers).filter((l) => l.visible);
  }

  /** Walk up from a hit object to the piece it belongs to. */
  pieceFromObject(o: THREE.Object3D | null): PlacedPiece | undefined {
    while (o) {
      const id = o.userData.pieceId as string | undefined;
      if (id) return this.house.pieces.find((p) => p.id === id);
      o = o.parent;
    }
    return undefined;
  }

  // ── Positions ──
  /** World-space centre of a piece (for fx / bubbles). Walls sit on their edge. */
  worldPos(p: PlacedPiece, y = 0.4): V3 {
    const { S } = dims();
    let x = (p.x + 0.5) * S, z = (p.z + 0.5) * S;
    if (isWallType(p.type)) {
      // the wall is built on the cell's north edge (local -z), then rotated with the piece
      const a = pieceRotY(p), off = S / 2;
      x += -off * Math.sin(a);
      z += -off * Math.cos(a);
    }
    return v3({ x: this.plot.origin.x + x, y, z: this.plot.origin.z + z });
  }

  /** A point above the piece for the selection bubble. */
  topPoint(p: PlacedPiece, out = new THREE.Vector3()): THREE.Vector3 {
    const w = this.worldPos(p);
    const { H, FL } = dims();
    let y = FL + 0.6;
    if (isWallType(p.type)) y = H * this.layers.wall.scale.y + 0.25;
    else if (isRoofType(p.type)) y = H + 1.0;
    else if (p.type === 'lamp') y = 1.5;
    else if (p.type === 'shelf') y = 1.3;
    else if (p.type === 'floor' || p.type === 'rug') y = 0.5;
    return out.set(w.x, y, w.z);
  }

  private makeGrid(): THREE.Mesh {
    const { S, FL } = dims();
    const N = tuning.build.plotCells;
    const w = 0.035, y = FL + 0.022;
    const pos: number[] = [];
    const idx: number[] = [];
    const quad = (x0: number, z0: number, x1: number, z1: number) => {
      const o = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    };
    for (let i = 0; i <= N; i++) {
      const t = i * S;
      const ww = i === 0 || i === N ? w * 2 : w;
      quad(0, t - ww / 2, N * S, t + ww / 2);
      quad(t - ww / 2, 0, t + ww / 2, N * S);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    m.renderOrder = 2;
    return m;
  }

  dispose(): void {
    this.root.traverse((o) => {
      tweens.cancel(o);
      tweens.cancel(o.rotation);
    });
    tweens.cancel(this.layers.wall);
    disposeBaked(this.root);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.root.parent?.remove(this.root);
  }
}

