// ── v3 build (W5): decor placed anywhere in the world ──────────────────────────
// Furniture and decor reuse the house catalog's generators (sofa, bed, lamp, TV, rug, plants,
// shelves, kitchen, bath, outdoor...). Each item is baked around its own footprint centre, at any
// position / height / angle, into merged meshes per chunk (decor is lots of small material
// changes, so it is a few more draw calls than builds, but still merged).
import * as THREE from 'three';
import type { Hex, PieceType, PlacedPiece, WorldDecor } from '../../core/model';
import { Baker, Brush, bakedToGroup, disposeBaked } from '../bake';
import { PIECE_CATALOG, localCells, pieceDef, type PieceDef } from '../catalog';
import { genPiece } from '../pieces';
import { makeCtx } from '../rules';
import { tuning } from '../../tuning';
import { drawnMeshes, newLodChunk, resetLod, stepLod, type LodChunk, type LodRanges } from './lod';

const CH = 36;   // metres per decor chunk
const chunkOf = (d: Pick<WorldDecor, 'x' | 'z'>) => `${Math.floor(d.x / CH)},${Math.floor(d.z / CH)}`;
interface DecorChunk extends LodChunk {
  key: string;
  ids: Set<string>;
  dirty: boolean;
}

/** Catalog items that make sense standing free in the world: furniture, rugs, plants, outdoor props. */
export function decorCatalog(): PieceDef[] {
  return PIECE_CATALOG.filter((d) => (d.kind === 'furn' || d.kind === 'rug') && d.type !== ('creation' as PieceType) && d.cat !== 'mine');
}

/** Offset (in the item's own frame, metres) from its anchor cell centre to the centre of its footprint. */
export function footprintCentre(def: PieceDef): [number, number] {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [i, j] of localCells(def)) {
    a = Math.min(a, i);
    b = Math.max(b, i);
    c = Math.min(c, j);
    d = Math.max(d, j);
  }
  return [(a + b) / 2, (c + d) / 2];
}

/** Radius that roughly contains an item (for picking and the selection ring). */
export function decorRadius(def: PieceDef): number {
  let w = 1, d = 1;
  for (const [i, j] of localCells(def)) {
    w = Math.max(w, i + 1);
    d = Math.max(d, j + 1);
  }
  return Math.max(0.55, Math.hypot(w, d) / 2);
}

const _t = new THREE.Matrix4(), _r = new THREE.Matrix4();
function placeBase(baker: Baker, d: WorldDecor, def: PieceDef): void {
  const [ci, cj] = footprintCentre(def);
  baker.base.makeTranslation(d.x, d.y, d.z).multiply(_r.makeRotationY(d.rot)).multiply(_t.makeTranslation(-ci, 0, -cj));
}

const emptyCtx = () => makeCtx([]);

function fake(d: WorldDecor): PlacedPiece {
  return { id: d.id, type: d.type as PieceType, x: 0, z: 0, rot: 0, color: d.color ?? pieceDef(d.type as PieceType)?.color ?? '#cccccc' } as PlacedPiece;
}

/** A decor item as its own object (the ghost). */
export function decorObject(d: WorldDecor): THREE.Group | null {
  const def = pieceDef(d.type as PieceType);
  if (!def) return null;
  const baker = new Baker();
  placeBase(baker, d, def);
  genPiece(new Brush(baker), fake(d), emptyCtx());
  return bakedToGroup(baker.bake());
}

export class DecorLayer {
  readonly group = new THREE.Group();
  readonly items = new Map<string, WorldDecor>();
  private chunks = new Map<string, DecorChunk>();
  private cam = new THREE.Vector3();
  private camSet = false;

  constructor() {
    this.group.name = 'decor';
  }

  load(list: readonly WorldDecor[]): void {
    for (const ch of this.chunks.values()) {
      disposeBaked(ch.group);
      ch.group.removeFromParent();
    }
    this.chunks.clear();
    this.items.clear();
    for (const d of list) this.add(d);
    this.settle();
  }

  private chunkFor(d: WorldDecor) {
    const key = chunkOf(d);
    let ch = this.chunks.get(key);
    if (!ch) {
      ch = { ...newLodChunk(new THREE.Group()), key, ids: new Set(), dirty: true };
      this.group.add(ch.group);
      this.chunks.set(key, ch);
    }
    return ch;
  }

  add(d: WorldDecor): void {
    this.items.set(d.id, d);
    const ch = this.chunkFor(d);
    ch.ids.add(d.id);
    ch.dirty = true;
  }

  remove(id: string): void {
    const d = this.items.get(id);
    if (!d) return;
    this.items.delete(id);
    const ch = this.chunks.get(chunkOf(d));
    if (ch) {
      ch.ids.delete(id);
      ch.dirty = true;
    }
  }

  /** The item moved / turned / was recoloured. `before` = where it used to be (to dirty the old chunk). */
  update(d: WorldDecor, before?: { x: number; z: number }): void {
    if (before) {
      const old = this.chunks.get(chunkOf(before));
      if (old && old.key !== chunkOf(d)) {
        old.ids.delete(d.id);
        old.dirty = true;
      }
    }
    this.add(d);
  }

  private bake(ch: DecorChunk): void {
    ch.dirty = false;
    disposeBaked(ch.group);
    ch.group.clear();
    const baker = new Baker();
    baker.fine = false;
    const br = new Brush(baker);
    const ctx = emptyCtx();
    let n = 0;
    for (const id of ch.ids) {
      const d = this.items.get(id);
      const def = d && pieceDef(d.type as PieceType);
      if (!d || !def) continue;
      placeBase(baker, d, def);
      genPiece(br, fake(d), ctx);
      n++;
    }
    baker.base.identity();
    if (n) bakedToGroup(baker.bake(), ch.group);
    resetLod(ch);
    if (this.camSet) stepLod(ch, this.cam.x, this.cam.y, this.cam.z, this.ranges());
  }

  // ── distance detail (lod.ts): decor is lots of small material changes, so far chunks draw as ONE flat mesh and very far ones not at all ──
  private ranges(): LodRanges {
    const b = tuning.build3;
    return { flatAt: b.decorFlat, hideAt: b.decorHide, shadowAt: b.decorShadow, hyst: b.lodHyst };
  }
  lod(x: number, y: number, z: number): void {
    this.cam.set(x, y, z);
    this.camSet = true;
    const r = this.ranges();
    for (const ch of this.chunks.values()) stepLod(ch, x, y, z, r);
  }

  /** At most one dirty chunk re-bakes per call. */
  tick(): void {
    for (const ch of this.chunks.values()) {
      if (!ch.dirty) continue;
      this.bake(ch);
      return;
    }
  }

  settle(): void {
    for (const ch of this.chunks.values()) if (ch.dirty) this.bake(ch);
  }

  /** The item a ray passes closest to (within its radius), or null. */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist = 40): { item: WorldDecor; dist: number } | null {
    let best: { item: WorldDecor; dist: number } | null = null;
    for (const d of this.items.values()) {
      const def = pieceDef(d.type as PieceType);
      if (!def) continue;
      const r = decorRadius(def);
      const cy = d.y + 0.5 * Math.min(1.6, r + 0.4);
      const px = d.x - ox, py = cy - oy, pz = d.z - oz;
      const t = px * dx + py * dy + pz * dz;
      if (t < 0 || t > maxDist) continue;
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
      if (qx * qx + qy * qy + qz * qz < r * r && (!best || t < best.dist)) best = { item: d, dist: t };
    }
    return best;
  }

  stats(): { meshes: number; chunks: number; items: number } {
    let meshes = 0;
    for (const ch of this.chunks.values()) meshes += drawnMeshes(ch);
    return { meshes, chunks: this.chunks.size, items: this.items.size };
  }

  dispose(): void {
    for (const ch of this.chunks.values()) disposeBaked(ch.group);
    this.chunks.clear();
    this.items.clear();
  }
}

export const DECOR_COLORS: Hex[] = ['#f3f2ee', '#e8d7b9', '#cf9b62', '#6b6f7d', '#2c3e5c', '#c2603f', '#2f7a45', '#ff2e88', '#7c4dff', '#00b3a4'];
void tuning;
