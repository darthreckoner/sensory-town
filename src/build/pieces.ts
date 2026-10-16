// Look of the structural pieces (floors, walls, windows, doors, stairs, roofs)
// and the dispatcher for furniture / outdoor pieces.
//
// Frames: a piece is drawn in "anchor-local" space - origin at the anchor cell
// centre on its level's base plane (y = 0), front facing -z (north). The caller
// applies the piece's rotation and position. Roofs are the exception: they depend
// on their neighbours, so they are drawn world-aligned on their own base plane.
import * as THREE from 'three';
import type { PieceType, PlacedPiece } from '../core/model';
import { tuning } from '../tuning';
import { Baker, Brush, M, boxG, lighten, darken, mix, prismG, type Baked, type Fin } from './bake';
import { dims, K } from './kit';
import { pieceDef } from './catalog';
import { cellKey, edgeKey, isBodyWall, levelOf, makeCtx, roofBaseY, type HouseCtx } from './rules';
import { FURNITURE_GEN } from './furniture';
import { OUTDOOR_GEN } from './outdoor';

export type { HouseCtx };
export { makeCtx, edgeKey, cellKey, isEdgeType, isRoofType } from './rules';

export type GenFn = (br: Brush, p: PlacedPiece, ctx: HouseCtx) => void;

const WALL_FINS = new Set(['brick', 'panel', 'stripe', 'tile']);
const FLOOR_FINS = new Set(['oak', 'dark', 'marble', 'checker', 'carpet', 'tile', 'concrete']);
export const wallFin = (p: PlacedPiece): Fin => (WALL_FINS.has(p.finish ?? '') ? (p.finish as Fin) : 'paint');
export const floorFin = (p: PlacedPiece, dflt: Fin = 'oak'): Fin => (FLOOR_FINS.has(p.finish ?? '') ? (p.finish as Fin) : dflt);

/** Rotation (about y) the piece's Object3D gets. Roofs and floors are rotation-free. */
export function pieceRotY(p: { type: PieceType; rot: number }): number {
  const k = pieceDef(p.type)?.kind;
  if (k === 'roof' || k === 'floor') return 0;
  return (-p.rot * Math.PI) / 2;
}

/** Height (world y) of the plane a piece is drawn on. */
export function pieceBaseY(p: PlacedPiece, ctx: HouseCtx): number {
  const { H } = dims();
  if (pieceDef(p.type)?.kind === 'roof') return roofBaseY(ctx, p.x, p.z);
  return levelOf(p) * H;
}

export interface RoofIssue { type: PieceType; at: [number, number]; issue: string }

/**
 * Do the roofs of a house rest on what is under them? A roof slab may span between walls but never
 * hangs in the air (more than ~0.1 above the walls / floor / ground it rests on) and never sits inside
 * a wall or floor slab. Checked on the real heights (`pieceBaseY`), so it holds for hand-placed roofs too.
 * Used by the dev world check (`__worldcheck.houses()`).
 */
export function roofIssues(pieces: readonly PlacedPiece[]): RoofIssue[] {
  const ctx = makeCtx(pieces);
  const { H, FL } = dims();
  const roofs = pieces.filter((p) => pieceDef(p.type)?.kind === 'roof');
  const yAt = new Map<string, number>();
  const at = new Map<string, PlacedPiece>();
  for (const r of roofs) {
    yAt.set(cellKey(r.x, r.z), pieceBaseY(r, ctx));
    at.set(cellKey(r.x, r.z), r);
  }
  const nb = (k: string): string[] => {
    const [x, z] = k.split(',').map(Number);
    return [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`];
  };
  const near = (set: Set<string>, k: string) => set.has(k) || nb(k).some((n) => set.has(n));
  const direct = (k: string, y: number): boolean => {
    const eq = (v: number) => Math.abs(v - y) <= 0.1;
    if (eq(2 * H) && near(ctx.touched[1], k)) return true;      // on the upstairs walls
    if (eq(H) && near(ctx.touched[0], k)) return true;          // on the ground-floor walls
    if (eq(H + FL) && ctx.floors.has(`1|${k}`)) return true;    // on an upstairs floor
    if (eq(FL) && ctx.floors.has(`0|${k}`)) return true;        // on a ground floor
    return eq(0);                                               // on the ground
  };
  const out: RoofIssue[] = [];
  const seen = new Set<string>();
  for (const k0 of yAt.keys()) {
    if (seen.has(k0)) continue;
    // roof cells that touch at the same height hold each other up
    const cluster = [k0];
    seen.add(k0);
    for (let i = 0; i < cluster.length; i++) {
      for (const n of nb(cluster[i])) {
        if (!seen.has(n) && yAt.has(n) && Math.abs(yAt.get(n)! - yAt.get(k0)!) <= 0.05) {
          seen.add(n);
          cluster.push(n);
        }
      }
    }
    if (!cluster.some((k) => direct(k, yAt.get(k)!))) {
      for (const k of cluster) {
        const r = at.get(k)!;
        out.push({ type: r.type, at: [r.x, r.z], issue: `roof floats in the air at y=${yAt.get(k)!.toFixed(2)} (no wall or floor under it)` });
      }
    }
  }
  for (const [k, y] of yAt) {
    const r = at.get(k)!;
    if (ctx.touched[1].has(k) && y < 2 * H - 0.1) out.push({ type: r.type, at: [r.x, r.z], issue: `roof sits inside the upstairs wall (y=${y.toFixed(2)})` });
    else if (ctx.floors.has(`1|${k}`) && y < H + FL - 0.1 && y > H - 0.1) out.push({ type: r.type, at: [r.x, r.z], issue: `roof sits inside the upstairs floor (y=${y.toFixed(2)})` });
  }
  return out;
}

// ── Entry points ────────────────────────────────────────────────────────────
export function genPiece(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  switch (p.type) {
    case 'floor': return genFloor(br, p, 'oak');
    case 'path': return genFloor(br, p, 'concrete');
    case 'wall':
    case 'wallWindow':
    case 'wallWindowBig':
    case 'wallDoor':
    case 'wallGlassDoor':
    case 'wallGarage':
    case 'wallRail':
      return genWall(br, p);
    case 'stairs': return genStairs(br, p);
    case 'roofGable': return genRoofGable(br, p, ctx);
    case 'roofFlat': return genRoofFlat(br, p, ctx);
    case 'roofSlant': return genRoofSlant(br, p, ctx);
    case 'creation': return;   // drawn by houseMesh (needs the owner's creation); gift box fallback below
    default: {
      const g = FURNITURE_GEN[p.type] ?? OUTDOOR_GEN[p.type];
      if (g) g(br, p, ctx);
    }
  }
}

/** Where a creation sits: on a surface in its cell (table, shelf...), else on the floor (or a rug). */
export function creationBaseY(ctx: HouseCtx, level: 0 | 1, x: number, z: number): number {
  const { FL } = dims();
  const f = ctx.furn.get(`${level}|${cellKey(x, z)}`);
  const d = f ? pieceDef(f.type) : undefined;
  if (d?.top) return FL + d.top;
  return FL + (ctx.rugs.has(`${level}|${cellKey(x, z)}`) ? 0.02 : 0);
}

/** Fallback for a creation that no longer exists: a little gift box. */
export function genGift(br: Brush, p: PlacedPiece, y: number): void {
  br.rbox(0, y + 0.14, 0, 0.3, 0.28, 0.3, p.color, 0.02);
  const rib = lighten(p.color, 0.6);
  br.box(0, y + 0.14, 0, 0.06, 0.29, 0.31, rib);
  br.box(0, y + 0.14, 0, 0.31, 0.29, 0.06, rib);
  br.ball(-0.05, y + 0.31, 0, 0.05, rib);
  br.ball(0.05, y + 0.31, 0, 0.05, rib);
}

export function bakePiece(p: PlacedPiece, ctx: HouseCtx, uvBase?: THREE.Matrix4): Baked {
  const baker = new Baker();
  if (uvBase) baker.uvBase.copy(uvBase);
  genPiece(new Brush(baker), p, ctx);
  return baker.bake();
}

// ── Floors ──────────────────────────────────────────────────────────────────
function genFloor(br: Brush, p: PlacedPiece, dflt: Fin): void {
  const { FL } = dims();
  br.box(0, FL / 2, 0, 1, FL, 1, p.color, floorFin(p, dflt));
}

// ── Walls ───────────────────────────────────────────────────────────────────
// A wall lies along the cell's NORTH edge (z = -0.5), running along local +x for
// `span` cells; the outside is -z.
function genWall(br: Brush, p: PlacedPiece): void {
  const { H, T, FL } = dims();
  const def = pieceDef(p.type)!;
  const span = def.w;
  const x0 = -0.5, x1 = span - 0.5, cx = (span - 1) / 2;
  const zc = -0.5, z0 = zc - T / 2, z1 = zc + T / 2;
  const col = p.color, wf = wallFin(p);
  const slab = (xa: number, xb: number, ya: number, yb: number) => br.blk(xa, ya, z0, xb, yb, z1, col, wf);
  const trim = wf === 'paint' || wf === 'stripe' || wf === 'panel';
  const baseboard = (xa: number, xb: number) => {
    if (!trim) return;
    br.blk(xa, 0, z0 - 0.012, xb, 0.1, z0, K.white);
    br.blk(xa, 0, z1, xb, 0.1, z1 + 0.012, K.white);
  };
  const fw = 0.045;                       // frame width
  const fz0 = z0 - 0.015, fz1 = z1 + 0.015;
  const black = K.black;

  switch (p.type) {
    case 'wall':
      slab(x0, x1, 0, H);
      baseboard(x0, x1);
      return;

    case 'wallWindow': {
      const ow = 0.7, y0 = 0.9, y1 = 2.1, a = cx - ow / 2, b = cx + ow / 2;
      slab(x0, a, 0, H);
      slab(b, x1, 0, H);
      slab(a, b, 0, y0);
      slab(a, b, y1, H);
      baseboard(x0, a);
      baseboard(b, x1);
      br.blk(a, y0, fz0, a + fw, y1, fz1, black);
      br.blk(b - fw, y0, fz0, b, y1, fz1, black);
      br.blk(a, y0, fz0, b, y0 + fw, fz1, black);
      br.blk(a, y1 - fw, fz0, b, y1, fz1, black);
      br.blk(cx - 0.015, y0, fz0 + 0.01, cx + 0.015, y1, fz1 - 0.01, black);
      br.blk(a + fw, y0 + fw, zc - 0.008, b - fw, y1 - fw, zc + 0.008, K.glass, 'glass');
      br.blk(a - 0.03, y0 - 0.035, z0 - 0.07, b + 0.03, y0, z1 + 0.02, K.warmGrey);     // sill
      return;
    }

    case 'wallWindowBig': {
      const ow = 0.92, y0 = 0.45, y1 = 2.3, a = cx - ow / 2, b = cx + ow / 2;
      slab(x0, a, 0, H);
      slab(b, x1, 0, H);
      slab(a, b, 0, y0);
      slab(a, b, y1, H);
      baseboard(x0, a);
      baseboard(b, x1);
      const f2 = 0.035;
      br.blk(a, y0, fz0, a + f2, y1, fz1, black);
      br.blk(b - f2, y0, fz0, b, y1, fz1, black);
      br.blk(a, y0, fz0, b, y0 + f2, fz1, black);
      br.blk(a, y1 - f2, fz0, b, y1, fz1, black);
      br.blk(a, 1.55, fz0 + 0.012, b, 1.57, fz1 - 0.012, black);     // transom
      br.blk(a + f2, y0 + f2, zc - 0.008, b - f2, y1 - f2, zc + 0.008, K.glass, 'glass');
      return;
    }

    case 'wallDoor': {
      const ow = 0.86, y1 = 2.1, a = cx - ow / 2, b = cx + ow / 2;
      slab(x0, a, 0, H);
      slab(b, x1, 0, H);
      slab(a, b, y1, H);
      baseboard(x0, a);
      baseboard(b, x1);
      br.blk(a, 0, fz0, a + fw, y1, fz1, black);
      br.blk(b - fw, 0, fz0, b, y1, fz1, black);
      br.blk(a, y1 - fw, fz0, b, y1, fz1, black);
      const door = mix(p.color, '#3a2c26', 0.72);
      br.blk(a + fw, 0.01, zc - 0.028, b - fw, y1 - fw, zc + 0.028, door, 'wood');
      br.blk(a + fw + 0.07, 0.35, zc - 0.034, a + fw + 0.15, 1.95, zc + 0.034, K.glass, 'glass');   // glass slit
      const hx = b - fw - 0.09;
      br.blk(hx - 0.012, 0.85, z0 - 0.07, hx + 0.012, 1.35, z0 - 0.04, black, 'metal');             // pull bar
      br.blk(hx - 0.012, 0.95, z1 + 0.04, hx + 0.012, 1.15, z1 + 0.07, black, 'metal');
      br.blk(cx - 0.6, 0, z0 - 0.5, cx + 0.6, 0.06, z0, '#bdbab5', 'concrete');                      // step
      return;
    }

    case 'wallGlassDoor': {
      const ow = 0.92, y1 = 2.15, a = cx - ow / 2, b = cx + ow / 2;
      slab(x0, a, 0, H);
      slab(b, x1, 0, H);
      slab(a, b, y1, H);
      baseboard(x0, a);
      baseboard(b, x1);
      const f2 = 0.05;
      br.blk(a, 0, fz0, a + f2, y1, fz1, black);
      br.blk(b - f2, 0, fz0, b, y1, fz1, black);
      br.blk(a, y1 - f2, fz0, b, y1, fz1, black);
      br.blk(cx - 0.025, 0, fz0 + 0.005, cx + 0.025, y1, fz1 - 0.005, black);
      br.blk(a + f2, 0.02, zc - 0.01, cx - 0.025, y1 - f2, zc + 0.01, K.glass, 'glass');
      br.blk(cx + 0.025, 0.02, zc - 0.012, b - f2, y1 - f2, zc + 0.012, K.glass, 'glass');
      br.blk(cx - 0.09, 0.95, z0 - 0.045, cx - 0.07, 1.4, z0 - 0.02, black, 'metal');
      br.blk(cx + 0.07, 0.95, z0 - 0.045, cx + 0.09, 1.4, z0 - 0.02, black, 'metal');
      br.blk(cx - 0.55, 0, z0 - 0.45, cx + 0.55, 0.05, z0, '#bdbab5', 'concrete');
      return;
    }

    case 'wallGarage': {
      const ow = 2.7, y1 = 2.3, a = cx - ow / 2, b = cx + ow / 2;
      slab(x0, a, 0, H);
      slab(b, x1, 0, H);
      slab(a, b, y1, H);
      baseboard(x0, a);
      baseboard(b, x1);
      br.blk(a, 0, fz0, a + 0.05, y1, fz1, black);
      br.blk(b - 0.05, 0, fz0, b, y1, fz1, black);
      br.blk(a, y1 - 0.05, fz0, b, y1, fz1, black);
      const dc = mix(p.color, K.grey, 0.45);
      const ph = (y1 - 0.05) / 6;
      for (let i = 0; i < 6; i++) {
        const ya = 0.01 + i * ph;
        br.blk(a + 0.05, ya + 0.012, zc - 0.035, b - 0.05, ya + ph - 0.012, zc + 0.035, dc);
      }
      for (let i = 0; i < 4; i++) {
        const gx = a + 0.2 + i * (ow - 0.4) / 4;
        br.blk(gx + 0.04, 0.01 + 5 * ph + 0.07, zc - 0.045, gx + (ow - 0.4) / 4 - 0.04, 0.01 + 6 * ph - 0.06, zc + 0.045, K.glass, 'glass');
      }
      br.blk(cx - 0.12, 0.9, z0 - 0.06, cx + 0.12, 0.95, z0 - 0.03, black, 'metal');
      return;
    }

    case 'wallRail': {
      const y0 = FL, h = 1.0;
      for (const px of [x0 + 0.05, x1 - 0.05]) br.blk(px - 0.025, y0, zc - 0.025, px + 0.025, y0 + h, zc + 0.025, black, 'metal');
      br.blk(x0, y0 + h - 0.04, zc - 0.03, x1, y0 + h, zc + 0.03, black, 'metal');
      br.blk(x0, y0, zc - 0.025, x1, y0 + 0.05, zc + 0.025, black, 'metal');
      br.blk(x0 + 0.08, y0 + 0.06, zc - 0.01, x1 - 0.08, y0 + h - 0.05, zc + 0.01, K.glass, 'glass');
      return;
    }

    case 'fenceSlat': {
      for (const px of [x0 + 0.06, x1 - 0.06]) br.blk(px - 0.04, 0, zc - 0.04, px + 0.04, 1.75, zc + 0.04, K.black, 'metal');
      for (let i = 0; i < 11; i++) {
        const y = 0.12 + i * 0.145;
        br.blk(x0 + 0.02, y, zc - 0.022 + (i % 2) * 0.012, x1 - 0.02, y + 0.115, zc + 0.012 + (i % 2) * 0.012, col, 'wood');
      }
      return;
    }

    case 'fencePicket': {
      br.blk(x0, 0.2, zc - 0.02, x1, 0.27, zc + 0.02, col);
      br.blk(x0, 0.68, zc - 0.02, x1, 0.75, zc + 0.02, col);
      for (let i = 0; i < 5; i++) {
        const px = x0 + 0.1 + i * 0.2;
        br.blk(px - 0.055, 0, zc - 0.016, px + 0.055, 0.95, zc + 0.016, col);
      }
      for (const px of [x0 + 0.01, x1 - 0.01]) br.blk(px - 0.035, 0, zc - 0.035, px + 0.035, 1.02, zc + 0.035, darken(col, 0.06));
      return;
    }
    default:
      return;
  }
}

/**
 * Corner fills for a whole level, in level-local space. A fill stands at every
 * lattice point where body walls meet or end - except straight pass-throughs.
 */
export function bakePosts(br: Brush, ctx: HouseCtx, level: 0 | 1): void {
  const { H, T } = dims();
  interface V { x: number; z: number; E?: PlacedPiece; S?: PlacedPiece; W?: PlacedPiece; N?: PlacedPiece }
  const verts = new Map<string, V>();
  const get = (x: number, z: number): V => {
    const k = `${x},${z}`;
    let v = verts.get(k);
    if (!v) verts.set(k, (v = { x, z }));
    return v;
  };
  const prefix = `${level}|`;
  for (const [key, p] of ctx.walls) {
    if (!key.startsWith(prefix) || !isBodyWall(p.type)) continue;
    const [kind, a, b] = key.slice(prefix.length).split(':');
    const x = +a, z = +b;
    if (kind === 'h') {
      get(x, z).E = p;
      get(x + 1, z).W = p;
    } else {
      get(x, z).S = p;
      get(x, z + 1).N = p;
    }
  }
  for (const v of verts.values()) {
    if ((v.E && v.W && !v.N && !v.S) || (v.N && v.S && !v.E && !v.W)) continue;
    const owner = (v.E ?? v.S ?? v.W ?? v.N)!;
    const e = T / 2 + 0.004;   // a hair proud of the walls so the faces never z-fight
    br.blk(v.x - e, 0, v.z - e, v.x + e, H + 0.002, v.z + e, owner.color, wallFin(owner));
  }
}

// ── Stairs ──────────────────────────────────────────────────────────────────
/** Map a (u, y, t) prism frame to the world: u along `uAxis`, t along `tAxis`. */
function putPrism(br: Brush, profile: [number, number][], t0: number, t1: number, uAxis: THREE.Vector3, tAxis: THREE.Vector3, color: string, fin: Fin, uvSwap = false): void {
  const map = new THREE.Matrix4().makeBasis(uAxis, new THREE.Vector3(0, 1, 0), tAxis);
  br.b.add(prismG(profile, t0, t1), map, color, fin, uvSwap);
}

const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);

/**
 * Straight stair run climbing toward local +z (1 wide, 4 long) from the floor to the next level:
 * 13 separate treads with risers, a light board along each side and a simple handrail.
 * (Nothing here is black or solid: it has to read as stairs from every angle.)
 */
function genStairs(br: Brush, p: PlacedPiece): void {
  const { H, FL } = dims();
  const n = 13, len = 4, run = len / n, rise = H / n;
  const hw = 0.43;                                    // tread half-width
  const tread = floorFin(p, 'oak');
  const riser = lighten(p.color, 0.72);
  const board = K.white;
  const treadTop = (i: number) => FL + (i + 1) * rise;
  for (let i = 0; i < n; i++) {
    const za = -0.5 + i * run, zb = za + run;
    const top = treadTop(i);
    br.blk(-hw, top - 0.06, za - 0.035, hw, top, zb, p.color, tread);                 // tread with a nosing
    br.blk(-hw, top - rise, za, hw, top - 0.06, za + 0.025, riser);                   // riser
  }
  // side boards (stringers) under the nosing line, one each side, flush with the cell edge
  const ang = Math.atan2(H, len);
  const zMid = (-0.45 + 3.45) / 2;
  const L = Math.hypot(len - 0.1, (H * (len - 0.1)) / len);
  const yMid = FL + (zMid + 0.5) * (H / len) + 0.03;
  for (const sx of [-1, 1]) {
    br.b.add(boxG(0.07, 0.2, L), M(sx * (hw + 0.035), yMid, zMid, 1, 1, 1, 0, -ang, 0), board, 'paint');
  }
  // handrail: a post every 4 treads and a rail along the top
  const post = [0, 4, 8, 12];
  for (const sx of [-1, 1]) {
    const x = sx * (hw + 0.035);
    const pts: [number, number, number][] = [];
    for (const i of post) {
      const z = -0.5 + i * run + run / 2;
      br.rod(x, treadTop(i) + 0.45, z, 0.022, 0.9, board, 'paint', 8);
      pts.push([x, treadTop(i) + 0.9, z]);
    }
    br.rodBetween(pts[0], pts[pts.length - 1], 0.03, K.woodLight, 'paint', 8);
  }
}

// ── Roofs ───────────────────────────────────────────────────────────────────
// All roof geometry is drawn with y = 0 on the wall-top plane (the piece's Object3D
// sits at the top storey's wall tops).
function genRoofFlat(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  const tb = tuning.build;
  const th = tb.roofFlatThickness, ov = tb.roofOverhang;
  const has = (dx: number, dz: number) => ctx.roofs.get(cellKey(p.x + dx, p.z + dz))?.type === 'roofFlat';
  const W = has(-1, 0), E = has(1, 0), N = has(0, -1), Sd = has(0, 1);
  const xmin = -0.5 - (W ? 0 : ov), xmax = 0.5 + (E ? 0 : ov);
  const zmin = -0.5 - (N ? 0 : ov), zmax = 0.5 + (Sd ? 0 : ov);
  br.blk(xmin, 0, zmin, xmax, th, zmax, p.color);
  // light parapet lip (~0.15 high) on the outside edges: contrasts with the slab whatever colour it is painted
  const lip = lighten(p.color, 0.55), lh = th + 0.15, lw = 0.09;
  if (!N) br.blk(xmin, th, zmin, xmax, lh, zmin + lw, lip);
  if (!Sd) br.blk(xmin, th, zmax - lw, xmax, lh, zmax, lip);
  if (!W) br.blk(xmin, th, zmin, xmin + lw, lh, zmax, lip);
  if (!E) br.blk(xmax - lw, th, zmin, xmax, lh, zmax, lip);
  // a few cheap bits of roof gear so it reads as a roof, not a box lid (same 'paint' bucket as the slab)
  const r = roofHash(p.x, p.z) % 30;
  const gear = lighten(p.color, 0.4);
  if (r === 0) {            // vent box with a cap and a stack
    br.rbox(-0.12, th + 0.12, -0.1, 0.4, 0.24, 0.32, gear, 0.02);
    br.rbox(-0.12, th + 0.26, -0.1, 0.46, 0.05, 0.38, lighten(p.color, 0.62), 0.015);
    br.cyl(0.26, th + 0.22, 0.16, 0.05, 0.05, 0.44, K.steel, 'paint', 8);
  } else if (r === 9) {     // skylight
    br.blk(-0.32, th, -0.28, 0.32, th + 0.07, 0.28, lighten(p.color, 0.62));
    br.blk(-0.25, th + 0.07, -0.21, 0.25, th + 0.095, 0.21, K.glass);
    br.blk(-0.012, th + 0.07, -0.21, 0.012, th + 0.11, 0.21, lighten(p.color, 0.62));
  } else if (r === 19) {    // solar panels on small stands
    for (const dz of [-0.21, 0.21]) {
      br.box(0, th + 0.14, dz, 0.76, 0.035, 0.36, '#2f4f86', 'paint', 0, -0.32, 0);
      br.box(0, th + 0.158, dz, 0.76, 0.012, 0.012, K.white, 'paint', 0, -0.32, 0);
      br.box(-0.2, th + 0.158, dz, 0.012, 0.012, 0.34, K.white, 'paint', 0, -0.32, 0);
      br.box(0.2, th + 0.158, dz, 0.012, 0.012, 0.34, K.white, 'paint', 0, -0.32, 0);
      br.blk(-0.34, th, dz - 0.03, -0.28, th + 0.09, dz + 0.03, K.steel);
      br.blk(0.28, th, dz - 0.03, 0.34, th + 0.09, dz + 0.03, K.steel);
    }
  }
}

/** Deterministic little hash of a roof cell (spreads the roof gear around). */
function roofHash(x: number, z: number): number {
  return (Math.imul(x + 101, 73856093) ^ Math.imul(z + 57, 19349663)) >>> 0;
}

/**
 * Gable roof. Cells in a run perpendicular to the ridge together form ONE
 * gable (the peak sits in the middle of the run); cells along the ridge join
 * end to end. Each cell draws its own slice of the shared shape.
 */
function genRoofGable(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  const tb = tuning.build;
  const th = tb.roofThickness, ov = tb.roofOverhang;
  const axisX = p.rot % 2 === 0; // ridge runs along x
  const at = (x: number, z: number) => {
    const q = ctx.roofs.get(cellKey(x, z));
    return q && q.type === 'roofGable' && (q.rot % 2 === 0) === axisX ? q : undefined;
  };
  const ax = axisX ? [0, 1] : [1, 0]; // across-the-ridge step
  const al = axisX ? [1, 0] : [0, 1]; // along-the-ridge step
  let i = 0;
  while (at(p.x - ax[0] * (i + 1), p.z - ax[1] * (i + 1))) i++;
  let j = 0;
  while (at(p.x + ax[0] * (j + 1), p.z + ax[1] * (j + 1))) j++;
  const n = i + j + 1;
  const hasPrev = !!at(p.x - al[0], p.z - al[1]);
  const hasNext = !!at(p.x + al[0], p.z + al[1]);

  const run = n, peak = run / 2;
  const slope = Math.min(tb.roofPitch, tb.roofMaxRise / peak);
  const yTop = (u: number) => Math.max(0.03, th + slope * Math.min(u, run - u));
  const u0 = i - (i === 0 ? ov : 0);
  const u1 = i + 1 + (j === 0 ? ov : 0);
  const uc = i + 0.5;
  const t0 = -0.5 - (hasPrev ? 0 : ov);
  const t1 = 0.5 + (hasNext ? 0 : ov);
  const tc = (t0 + t1) / 2, len = t1 - t0;

  const prof: [number, number][] = [[u0 - uc, 0], [u1 - uc, 0], [u1 - uc, yTop(u1)]];
  if (peak > u0 + 1e-4 && peak < u1 - 1e-4) prof.push([peak - uc, yTop(peak)]);
  prof.push([u0 - uc, yTop(u0)]);

  // (u, y, t) space -> world. Ridge along x maps u->z, t->x (a mirror; the Baker copes).
  const uAx = axisX ? AZ : AX, tAx = axisX ? AX : AZ;
  putPrism(br, prof, t0, t1, uAx, tAx, p.color, 'shingle', !axisX);
  const trim = darken(p.color, 0.45);
  const put = (geo: THREE.BufferGeometry, local: THREE.Matrix4) => {
    const map = new THREE.Matrix4().makeBasis(uAx, new THREE.Vector3(0, 1, 0), tAx);
    br.b.add(geo, new THREE.Matrix4().multiplyMatrices(map, local), trim, 'paint');
  };
  // ridge cap (drawn by the cell that contains the peak)
  if (i === Math.floor(n / 2)) put(boxG(0.14, 0.06, len), M(peak - uc, yTop(peak) + 0.015, tc));
  // fascia boards on the eaves
  if (i === 0) put(boxG(0.04, 0.17, len), M(u0 - uc - 0.01, yTop(u0) - 0.075, tc));
  if (j === 0) put(boxG(0.04, 0.17, len), M(u1 - uc + 0.01, yTop(u1) - 0.075, tc));
}

/** Modern single-slope roof: rises toward the rot direction (0 = north, 1 = east...), runs of cells share one plane. */
function genRoofSlant(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  const tb = tuning.build;
  const th = tb.roofFlatThickness, ov = tb.roofOverhang;
  const dir: [number, number] = p.rot === 0 ? [0, -1] : p.rot === 1 ? [1, 0] : p.rot === 2 ? [0, 1] : [-1, 0];
  const at = (x: number, z: number) => {
    const q = ctx.roofs.get(cellKey(x, z));
    return q && q.type === 'roofSlant' && q.rot === p.rot ? q : undefined;
  };
  let i = 0;
  while (at(p.x - dir[0] * (i + 1), p.z - dir[1] * (i + 1))) i++;       // cells downhill of me
  let j = 0;
  while (at(p.x + dir[0] * (j + 1), p.z + dir[1] * (j + 1))) j++;       // cells uphill of me
  const n = i + j + 1;
  const slope = Math.min(tb.slantPitch, tb.roofMaxRise / n);
  const hAt = (u: number) => th + slope * u;
  const side: [number, number] = [-dir[1], dir[0]];                      // across the slope
  const hasPrev = !!at(p.x - side[0], p.z - side[1]);
  const hasNext = !!at(p.x + side[0], p.z + side[1]);
  const u0 = i - (i === 0 ? ov : 0), u1 = i + 1 + (j === 0 ? ov : 0), uc = i + 0.5;
  const t0 = -0.5 - (hasPrev ? 0 : ov), t1 = 0.5 + (hasNext ? 0 : ov), tc = (t0 + t1) / 2, len = t1 - t0;
  const prof: [number, number][] = [[u0 - uc, 0], [u1 - uc, 0], [u1 - uc, hAt(u1)], [u0 - uc, hAt(u0)]];
  const uAx = new THREE.Vector3(dir[0], 0, dir[1]), tAx = new THREE.Vector3(side[0], 0, side[1]);
  putPrism(br, prof, t0, t1, uAx, tAx, p.color, 'paint');   // matte: a mirror-metal slab reflects the sky and turns navy-black from above
  const trim = lighten(p.color, 0.5);                                    // light edge board: reads against any slab colour
  const map = new THREE.Matrix4().makeBasis(uAx, new THREE.Vector3(0, 1, 0), tAx);
  const put = (geo: THREE.BufferGeometry, local: THREE.Matrix4, color = trim, fin: Fin = 'paint') => br.b.add(geo, new THREE.Matrix4().multiplyMatrices(map, local), color, fin);
  if (i === 0) put(boxG(0.05, 0.2, len), M(u0 - uc - 0.01, hAt(u0) - 0.08, tc));
  if (j === 0) put(boxG(0.05, hAt(u1) + 0.06, len), M(u1 - uc + 0.01, (hAt(u1) + 0.06) / 2 - 0.03, tc));
  // standing-seam ribs down the slope (same paint bucket as the slab) so it reads as roofing from above
  const a = Math.atan(slope), um = (u0 + u1) / 2;
  const ribLen = (u1 - u0) / Math.cos(a);
  const ribC = lighten(p.color, 0.3);
  for (const tt of [-0.33, 0, 0.33]) put(boxG(ribLen, 0.04, 0.045), M(um - uc, hAt(um) + 0.015, tt, 1, 1, 1, 0, 0, a), ribC, 'paint');
  // now and then a skylight or a solar panel lying on the slope (not on the eave cells)
  const r = roofHash(p.x, p.z) % 9;
  if (i > 0 && j > 0 && (r === 2 || r === 6)) {
    const col = r === 2 ? K.glass : '#2f4f86';
    put(boxG(0.62, 0.05, 0.58), M(um - uc, hAt(um) + 0.05, tc, 1, 1, 1, 0, 0, a), lighten(p.color, 0.6), 'paint');
    put(boxG(0.54, 0.055, 0.5), M(um - uc, hAt(um) + 0.058, tc, 1, 1, 1, 0, 0, a), col, 'paint');
  }
}
