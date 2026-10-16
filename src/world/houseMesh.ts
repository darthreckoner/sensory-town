// Meshes for houses (built from placed pieces) and village decorations.
//
// Everything is "baked": pieces are drawn with small primitives (src/build/*)
// into a few vertex-coloured geometries, so a whole town costs a handful of draw
// calls. Public API used by the Drive scene and the Build scene:
//   buildHouseMesh(house)        a house in plot-local space (origin = plot origin corner)
//   buildDecorationMesh(deco)    one decoration, positioned at deco.x/z
//   buildTownContent(town)       every house + decoration merged, plus colliders
//   PIECE_CATALOG / DECO_CATALOG what the Build palette offers
//   tickBuildMaterials(t)        animates the RGB-glow materials (call once per frame, optional)
import * as THREE from 'three';
import type { House, Decoration, Town, PlacedPiece } from '../core/model';
import type { Collider } from './townEnv';
import { PLOTS } from './townLayout';
import { store } from '../core/store';
import { buildCreationMesh } from '../art/creationMesh';
import { Baker, Brush, bakedToGroup, disposeBaked, tickBuildMaterials } from '../build/bake';
import { tuning } from '../tuning';
import { dims } from '../build/kit';
import { pieceDef, PIECE_CATALOG, DECO_CATALOG, CATS, decoDef, localCells, type PieceDef, type DecoDef } from '../build/catalog';
import { bakePiece, bakePosts, creationBaseY, genGift, genPiece, pieceBaseY, pieceRotY } from '../build/pieces';
import { genDeco } from '../build/outdoor';
import { footprintCells, isBodyWall, levelOf, makeCtx, edgeCells, rotOffset, type HouseCtx } from '../build/rules';

export { disposeBaked, tickBuildMaterials, PIECE_CATALOG, DECO_CATALOG, CATS, pieceDef, decoDef, localCells };
export type { HouseCtx, PieceDef, DecoDef };

const CREATION_SIZE = 0.5;

// ── Single pieces (used while editing a house: one Object3D per piece) ──────
/**
 * A piece as its own Group: positioned at its anchor cell (plot-local), on the
 * base plane of its level (roofs: on top of the top storey) and rotated.
 * `origin` is the plot's world origin corner so patterns line up with the static town bake.
 */
export function buildPieceObject(p: PlacedPiece, ctx: HouseCtx, origin: { x: number; z: number } = { x: 0, z: 0 }): THREE.Group {
  const { S } = dims();
  const g = new THREE.Group();
  g.userData.pieceId = p.id;
  g.position.set((p.x + 0.5) * S, pieceBaseY(p, ctx), (p.z + 0.5) * S);
  g.rotation.y = pieceRotY(p);
  fillPiece(g, p, ctx, origin);
  return g;
}

/** Rebuild a piece's visuals in place (colour changed, neighbours changed...). Keeps rotation; re-seats the height. */
export function refillPieceObject(g: THREE.Group, p: PlacedPiece, ctx: HouseCtx, origin: { x: number; z: number } = { x: 0, z: 0 }): void {
  disposeBaked(g);
  g.clear();
  g.position.y = pieceBaseY(p, ctx);
  fillPiece(g, p, ctx, origin);
}

function fillPiece(g: THREE.Group, p: PlacedPiece, ctx: HouseCtx, origin: { x: number; z: number }): void {
  g.updateMatrix();
  const uvBase = new THREE.Matrix4().makeTranslation(origin.x, 0, origin.z).multiply(g.matrix);
  bakedToGroup(bakePiece(p, ctx, uvBase), g);
  if (p.type !== 'creation') return;
  const y = creationBaseY(ctx, levelOf(p), p.x, p.z);
  const c = p.creationId ? store.creationById(p.creationId) : undefined;
  if (c) {
    const o = buildCreationMesh(c, CREATION_SIZE);
    o.position.y = y;
    g.add(o);
  } else {
    const b = new Baker();
    genGift(new Brush(b), p, y);
    bakedToGroup(b.bake(), g);
  }
}

/** Corner fills for one level of the house (level-local space; the caller sets the group's y). */
export function buildPostsGroup(ctx: HouseCtx, level: 0 | 1, origin: { x: number; z: number } = { x: 0, z: 0 }): THREE.Group {
  const { H } = dims();
  const b = new Baker();
  b.uvBase.makeTranslation(origin.x, level * H, origin.z);
  bakePosts(new Brush(b), ctx, level);
  return bakedToGroup(b.bake());
}

// ── Whole houses (merged) ───────────────────────────────────────────────────
function bakeHouseInto(baker: Baker, house: House, ox: number, oz: number, extras: THREE.Object3D[]): void {
  const { S, H } = dims();
  const ctx = makeCtx(house.pieces);
  const br = new Brush(baker);
  const rot = new THREE.Matrix4();
  baker.uvBase.identity();
  for (const p of house.pieces) {
    if (!pieceDef(p.type)) continue;
    const cx = ox + (p.x + 0.5) * S, cz = oz + (p.z + 0.5) * S, cy = pieceBaseY(p, ctx);
    baker.base.makeTranslation(cx, cy, cz).multiply(rot.makeRotationY(pieceRotY(p)));
    if (p.type === 'creation') {
      const y = creationBaseY(ctx, levelOf(p), p.x, p.z);
      const c = p.creationId ? store.creationById(p.creationId) : undefined;
      if (c) {
        const o = buildCreationMesh(c, CREATION_SIZE);
        o.position.set(cx, cy + y, cz);
        o.rotation.y = pieceRotY(p);
        extras.push(o);
      } else genGift(br, p, y);
    } else genPiece(br, p, ctx);
  }
  for (const lv of [0, 1] as const) {
    if (![...ctx.walls.keys()].some((k) => k.startsWith(`${lv}|`))) continue;
    baker.base.makeTranslation(ox, lv * H, oz);
    bakePosts(br, ctx, lv);
  }
  baker.base.identity();
}

/**
 * A batch of pieces (plot-local) baked into a few meshes, using `ctx` for neighbour
 * lookups and heights. Used for rectangle-fill ghosts.
 */
export function buildPiecesMesh(pieces: PlacedPiece[], ctx: HouseCtx): THREE.Group {
  const { S } = dims();
  const baker = new Baker();
  const br = new Brush(baker);
  const rot = new THREE.Matrix4();
  for (const p of pieces) {
    if (!pieceDef(p.type) || p.type === 'creation') continue;
    baker.base.makeTranslation((p.x + 0.5) * S, pieceBaseY(p, ctx), (p.z + 0.5) * S).multiply(rot.makeRotationY(pieceRotY(p)));
    genPiece(br, p, ctx);
  }
  baker.base.identity();
  return bakedToGroup(baker.bake());
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

interface CellBox { x0: number; z0: number; x1: number; z1: number }

/** Bounding box (in cells) of the building itself: its walls and floors. (Furniture and stairs get their own colliders.) */
function buildingBox(h: House): CellBox | null {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const add = (x: number, z: number) => {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x + 1);
    z1 = Math.max(z1, z + 1);
  };
  for (const p of h.pieces) {
    const d = pieceDef(p.type);
    if (!d || d.outdoor) continue;
    if (d.kind === 'edge') {
      if (isBodyWall(p.type)) for (const [x, z] of edgeCells(p.x, p.z, p.rot, d.w)) add(x, z);
    } else if (d.kind === 'floor') {
      add(p.x, p.z);
    }
  }
  return x0 <= x1 ? { x0, z0, x1, z1 } : null;
}

/**
 * Solid things the walker / car must not pass through that the building box does not cover: stairs, a
 * carport's posts, trees, hedges, the barbecue, furniture left on the lawn... (a piece that sits
 * entirely inside the building box is already part of it). Fences are left walkable on purpose.
 */
function solidColliders(h: House, ox: number, oz: number, box: CellBox | null): Collider[] {
  const { S } = dims();
  const out: Collider[] = [];
  const inside = (x: number, z: number) => !!box && x >= box.x0 && x < box.x1 && z >= box.z0 && z < box.z1;
  for (const p of h.pieces) {
    const d = pieceDef(p.type);
    if (!d || (d.kind !== 'furn' && d.kind !== 'stairs') || levelOf(p) !== 0) continue;
    const cells = footprintCells(d, p.x, p.z, p.rot);
    if (cells.every(([x, z]) => inside(x, z))) continue;
    // anchor cell centre, and a helper from the piece's own frame (local x right, z back) to the world
    const cx = ox + (p.x + 0.5) * S, cz = oz + (p.z + 0.5) * S;
    const at = (lx: number, lz: number): [number, number] => {
      const [dx, dz] = rotOffset(lx, lz, p.rot);
      return [cx + dx * S, cz + dz * S];
    };
    const swap = p.rot % 2 === 1;
    const box2 = (lx: number, lz: number, hw: number, hd: number) => {
      const [x, z] = at(lx, lz);
      out.push({ kind: 'box', x, z, hw: (swap ? hd : hw) * S, hd: (swap ? hw : hd) * S });
    };
    const ring = (lx: number, lz: number, r: number) => {
      const [x, z] = at(lx, lz);
      out.push({ kind: 'circle', x, z, r: r * S });
    };
    switch (p.type) {
      case 'pool': break;                                              // open water: left alone
      case 'stairs': box2(0, 1.5, 0.48, 1.98); break;
      case 'carport':
        // the four posts only: a car can still be driven (and walked) in underneath; a car parked there is
        // already solid for walkers in the Drive scene
        for (const [lx, lz] of [[-0.4, -0.4], [2.4, -0.4], [-0.4, 2.4], [2.4, 2.4]]) ring(lx, lz, 0.12);
        break;
      case 'yardTree': ring(0, 0, 0.45); break;
      case 'hedge': box2(0, 0, 0.5, 0.4); break;
      case 'mailbox': ring(0, 0.14, 0.22); break;
      case 'bbq': box2(0, 0.04, 0.48, 0.3); break;
      case 'gardenBed': box2(0.5, 0, 1.0, 0.4); break;
      case 'patioSet':
      case 'trampoline':
      case 'hotTub': ring(0.5, 0.5, 0.95); break;
      case 'swing':
        box2(-0.42, 0.5, 0.12, 0.98);
        box2(2.42, 0.5, 0.12, 0.98);
        break;
      default: {
        // anything else standing outside the walls: its footprint, trimmed a little
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const [x, z] of cells) {
          x0 = Math.min(x0, x);
          z0 = Math.min(z0, z);
          x1 = Math.max(x1, x + 1);
          z1 = Math.max(z1, z + 1);
        }
        out.push({ kind: 'box', x: ox + ((x0 + x1) / 2) * S, z: oz + ((z0 + z1) / 2) * S, hw: ((x1 - x0) / 2 - 0.06) * S, hd: ((z1 - z0) / 2 - 0.06) * S });
      }
    }
  }
  return out;
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
  const baker = new Baker();
  genDeco(new Brush(baker), deco);
  bakedToGroup(baker.bake(), g as THREE.Group);
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
  // lots of pieces -> drop the fine detail (books, keys, ...) to keep the town light
  const total = town.houses.reduce((n, h) => n + h.pieces.length, 0);
  baker.fine = total < tuning.build.fineDetailBelow;

  if (opts.houses !== false) {
    for (const h of town.houses) {
      const plot = PLOTS[h.plot];
      if (!plot || opts.skipPlots?.includes(h.plot)) continue;
      bakeHouseInto(baker, h, plot.origin.x, plot.origin.z, extras);
      const box = buildingBox(h);
      colliders.push(...solidColliders(h, plot.origin.x, plot.origin.z, box));
      if (box) {
        const wx0 = plot.origin.x + box.x0 * S, wx1 = plot.origin.x + box.x1 * S;
        const wz0 = plot.origin.z + box.z0 * S, wz1 = plot.origin.z + box.z1 * S;
        colliders.push({ kind: 'box', x: (wx0 + wx1) / 2, z: (wz0 + wz1) / 2, hw: (wx1 - wx0) / 2, hd: (wz1 - wz0) / 2 });
      }
    }
  }

  if (opts.decorations !== false) {
    const br = new Brush(baker);
    const rot = new THREE.Matrix4();
    baker.uvBase.identity();
    for (const d of town.decorations) {
      baker.base.makeTranslation(d.x, 0, d.z).multiply(rot.makeRotationY(d.rot));
      genDeco(br, d);
      switch (d.type) {
        case 'tree': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.5 }); break;
        case 'birch': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.35 }); break;
        case 'pine': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.55 }); break;
        case 'palm': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.45 }); break;
        case 'streetLamp': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.25 }); break;
        case 'bench': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.65 }); break;
        case 'planter': colliders.push({ kind: 'circle', x: d.x, z: d.z, r: 0.45 }); break;
        case 'hedge':
        case 'fence': {
          const c = Math.abs(Math.cos(d.rot)), s = Math.abs(Math.sin(d.rot));
          const hl = 0.5, ht = d.type === 'hedge' ? 0.4 : 0.08;
          colliders.push({ kind: 'box', x: d.x, z: d.z, hw: c * hl + s * ht, hd: s * hl + c * ht });
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
