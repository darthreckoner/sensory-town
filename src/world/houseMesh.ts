// Meshes for houses (built from placed pieces) and village decorations.
//
// Everything is "baked": pieces are drawn with small primitives (src/build/pieces.ts)
// into a few vertex-coloured geometries, so a whole town costs a handful of draw
// calls. Public API used by the Drive scene and the Build scene:
//   buildHouseMesh(house)        a house in plot-local space (origin = plot origin corner)
//   buildDecorationMesh(deco)    one decoration, positioned at deco.x/z
//   buildTownContent(town)       every house + decoration merged, plus colliders
//   PIECE_CATALOG / DECO_CATALOG what the Build palette offers
import * as THREE from 'three';
import type { House, Decoration, Town, PlacedPiece, PieceType, DecoType, Hex } from '../core/model';
import type { Collider } from './townEnv';
import { PLOTS } from './townLayout';
import { store } from '../core/store';
import { buildCreationMesh } from '../art/creationMesh';
import { Baker, Brush, bakedToGroup, disposeBaked } from '../build/bake';
import {
  dims, makeCtx, genPiece, genGift, genDeco, bakePiece, bakeDeco, bakePosts, pieceRotY, creationBaseY, isRoofType, type HouseCtx,
} from '../build/pieces';

export { disposeBaked, type HouseCtx };

// ── Catalogs ────────────────────────────────────────────────────────────────
export interface PieceDef {
  type: PieceType;
  name: string;      // one short word
  icon: string;
  cat: 'build' | 'furniture';
  color: Hex;        // default colour
  paint: boolean;    // can be dragged-out repeatedly ("painted") over many cells
}
export const PIECE_CATALOG: PieceDef[] = [
  { type: 'floor', name: 'Floor', icon: '🟫', cat: 'build', color: '#f2e6da', paint: true },
  { type: 'wall', name: 'Wall', icon: '🧱', cat: 'build', color: '#ffe4ec', paint: true },
  { type: 'wallWindow', name: 'Window', icon: '🪟', cat: 'build', color: '#ffe4ec', paint: true },
  { type: 'wallDoor', name: 'Door', icon: '🚪', cat: 'build', color: '#ffe4ec', paint: true },
  { type: 'roofGable', name: 'Roof', icon: '🔺', cat: 'build', color: '#ff8fb1', paint: true },
  { type: 'roofFlat', name: 'Flat', icon: '🟪', cat: 'build', color: '#9d8cff', paint: true },
  { type: 'bed', name: 'Bed', icon: '🛏️', cat: 'furniture', color: '#7fd8ff', paint: false },
  { type: 'sofa', name: 'Sofa', icon: '🛋️', cat: 'furniture', color: '#9d8cff', paint: false },
  { type: 'table', name: 'Table', icon: '🍽️', cat: 'furniture', color: '#ffd166', paint: false },
  { type: 'lamp', name: 'Lamp', icon: '💡', cat: 'furniture', color: '#fff3a3', paint: false },
  { type: 'plant', name: 'Plant', icon: '🪴', cat: 'furniture', color: '#5fd3a5', paint: false },
  { type: 'shelf', name: 'Shelf', icon: '📚', cat: 'furniture', color: '#e0b48a', paint: false },
  { type: 'rug', name: 'Rug', icon: '⭕', cat: 'furniture', color: '#ff8fb1', paint: true },
];
export function pieceDef(type: PieceType): PieceDef | undefined {
  return PIECE_CATALOG.find((d) => d.type === type);
}

export interface DecoDef {
  type: DecoType;
  name: string;
  icon: string;
  color: Hex;
  paint: boolean;
  height: number;    // for tap targets
}
export const DECO_CATALOG: DecoDef[] = [
  { type: 'tree', name: 'Tree', icon: '🌳', color: '#8fdc8f', paint: false, height: 2.2 },
  { type: 'pine', name: 'Pine', icon: '🌲', color: '#5fbf8a', paint: false, height: 2.5 },
  { type: 'bush', name: 'Bush', icon: '🌿', color: '#7bd88f', paint: false, height: 0.7 },
  { type: 'flowers', name: 'Flowers', icon: '🌸', color: '#ff8fb1', paint: true, height: 0.6 },
  { type: 'fence', name: 'Fence', icon: '🚧', color: '#ffffff', paint: true, height: 0.8 },
  { type: 'streetLamp', name: 'Lamp', icon: '🏮', color: '#6b6780', paint: false, height: 2.7 },
  { type: 'bench', name: 'Bench', icon: '🪑', color: '#ffb38a', paint: false, height: 0.9 },
];
export function decoDef(type: DecoType): DecoDef | undefined {
  return DECO_CATALOG.find((d) => d.type === type);
}

// ── Single pieces (used while editing a house: one Object3D per piece) ──────
/**
 * A piece as its own Group, positioned at its cell centre (plot-local) and rotated.
 * Roofs pivot at wall-top height so their squash-and-stretch pops from their base.
 */
export function buildPieceObject(p: PlacedPiece, ctx: HouseCtx): THREE.Group {
  const { S, H } = dims();
  const g = new THREE.Group();
  g.userData.pieceId = p.id;
  g.position.set((p.x + 0.5) * S, isRoofType(p.type) ? H : 0, (p.z + 0.5) * S);
  g.rotation.y = pieceRotY(p);
  fillPiece(g, p, ctx);
  return g;
}

/** Rebuild a piece's visuals in place (colour changed, neighbours changed...). Keeps its transform. */
export function refillPieceObject(g: THREE.Group, p: PlacedPiece, ctx: HouseCtx): void {
  disposeBaked(g);
  g.clear();
  fillPiece(g, p, ctx);
}

function fillPiece(g: THREE.Group, p: PlacedPiece, ctx: HouseCtx): void {
  bakedToGroup(bakePiece(p, ctx), g);
  if (isRoofType(p.type)) {
    const { H } = dims();
    for (const c of g.children) c.position.y = -H;   // the group itself sits at y = H
    return;
  }
  if (p.type !== 'creation') return;
  const y = creationBaseY(ctx, p.x, p.z);
  const c = p.creationId ? store.creationById(p.creationId) : undefined;
  if (c) {
    const o = buildCreationMesh(c, 0.42);
    o.position.y = y;
    g.add(o);
  } else {
    const b = new Baker();
    genGift(new Brush(b), p, y);
    bakedToGroup(b.bake(), g);
  }
}

/** Corner posts for the whole house (plot-local). */
export function buildPostsGroup(ctx: HouseCtx): THREE.Group {
  const b = new Baker();
  bakePosts(new Brush(b), ctx.walls);
  return bakedToGroup(b.bake());
}

// ── Whole houses (merged) ───────────────────────────────────────────────────
function bakeHouseInto(baker: Baker, house: House, ox: number, oz: number, extras: THREE.Object3D[]): void {
  const { S } = dims();
  const ctx = makeCtx(house.pieces);
  const br = new Brush(baker);
  const rot = new THREE.Matrix4();
  for (const p of house.pieces) {
    const cx = ox + (p.x + 0.5) * S, cz = oz + (p.z + 0.5) * S;
    baker.base.makeTranslation(cx, 0, cz).multiply(rot.makeRotationY(pieceRotY(p)));
    if (p.type === 'creation') {
      const y = creationBaseY(ctx, p.x, p.z);
      const c = p.creationId ? store.creationById(p.creationId) : undefined;
      if (c) {
        const o = buildCreationMesh(c, 0.42);
        o.position.set(cx, y, cz);
        o.rotation.y = pieceRotY(p);
        extras.push(o);
      } else genGift(br, p, y);
    } else genPiece(br, p, ctx);
  }
  baker.base.makeTranslation(ox, 0, oz);
  bakePosts(br, ctx.walls);
  baker.base.identity();
}

/** A house in plot-local space: cell (x,z) centre = ((x+0.5)*grid, 0, (z+0.5)*grid) from the plot origin corner. */
export function buildHouseMesh(house: House): THREE.Group {
  const baker = new Baker();
  const extras: THREE.Object3D[] = [];
  bakeHouseInto(baker, house, 0, 0, extras);
  const g = bakedToGroup(baker.bake());
  g.name = 'house';
  for (const e of extras) g.add(e);
  return g;
}

// ── Decorations ─────────────────────────────────────────────────────────────
export function buildDecorationMesh(deco: Decoration): THREE.Object3D {
  const baker = new Baker();
  genDeco(new Brush(baker), deco);
  const g = bakedToGroup(baker.bake());
  g.position.set(deco.x, 0, deco.z);
  g.rotation.y = deco.rot;
  g.userData.decoId = deco.id;
  return g;
}

/** Rebuild a decoration's visuals in place (after a recolour). */
export function refillDecorationObject(g: THREE.Object3D, deco: Decoration): void {
  disposeBaked(g);
  (g as THREE.Group).clear();
  bakedToGroup(bakeDeco(deco), g as THREE.Group);
}

// ── The whole town (Drive + Build) ──────────────────────────────────────────
export interface TownContentOpts {
  /** Plots to leave out (the Build scene draws the house being edited itself). */
  skipPlots?: number[];
  houses?: boolean;       // default true
  decorations?: boolean;  // default true
}

/** All houses (placed on their plots) + decorations, merged into a few meshes, plus colliders for driving. */
export function buildTownContent(town: Town, opts: TownContentOpts = {}): { group: THREE.Group; colliders: Collider[] } {
  const { S } = dims();
  const baker = new Baker();
  const extras: THREE.Object3D[] = [];
  const colliders: Collider[] = [];

  if (opts.houses !== false) {
    for (const h of town.houses) {
      const plot = PLOTS[h.plot];
      if (!plot || opts.skipPlots?.includes(h.plot)) continue;
      bakeHouseInto(baker, h, plot.origin.x, plot.origin.z, extras);
      // one box over the occupied cells
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const p of h.pieces) {
        if (p.type === 'rug') continue;
        x0 = Math.min(x0, p.x);
        z0 = Math.min(z0, p.z);
        x1 = Math.max(x1, p.x + 1);
        z1 = Math.max(z1, p.z + 1);
      }
      if (x0 <= x1) {
        const wx0 = plot.origin.x + x0 * S, wx1 = plot.origin.x + x1 * S;
        const wz0 = plot.origin.z + z0 * S, wz1 = plot.origin.z + z1 * S;
        colliders.push({ kind: 'box', x: (wx0 + wx1) / 2, z: (wz0 + wz1) / 2, hw: (wx1 - wx0) / 2, hd: (wz1 - wz0) / 2 });
      }
    }
  }

  if (opts.decorations !== false) {
    const br = new Brush(baker);
    const rot = new THREE.Matrix4();
    for (const d of town.decorations) {
      baker.base.makeTranslation(d.x, 0, d.z).multiply(rot.makeRotationY(d.rot));
      genDeco(br, d);
      switch (d.type) {
        case 'tree': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.45 }); break;
        case 'pine': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.5 }); break;
        case 'streetLamp': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.25 }); break;
        case 'bench': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.65 }); break;
        case 'fence': {
          const c = Math.abs(Math.cos(d.rot)), s = Math.abs(Math.sin(d.rot));
          colliders.push({ kind: 'box', x: d.x, z: d.z, hw: c * 0.5 + s * 0.08, hd: s * 0.5 + c * 0.08 });
          break;
        }
        default: break; // bushes + flowers are soft: drive right through
      }
    }
    baker.base.identity();
  }

  const group = bakedToGroup(baker.bake());
  group.name = 'townContent';
  for (const e of extras) group.add(e);
  return { group, colliders };
}
