// Look of every house piece and village decoration, drawn with a Brush.
//
// Frames: a piece is drawn in "cell-local" space — origin at the cell center on
// the ground, front of the piece facing -z (north). The caller applies the
// piece's rotation (rot * -90° about y) and cell position. Roofs are the one
// exception: they depend on their neighbours, so they are drawn world-aligned.
import * as THREE from 'three';
import type { PlacedPiece, PieceType, Decoration } from '../core/model';
import { tuning } from '../tuning';
import { seeded } from '../world/townLayout';
import { Baker, Brush, M, boxG, cylG, ballG, prismG, lighten, darken, mix, type Baked } from './bake';

export function dims() {
  const b = tuning.build;
  return { S: b.gridSize, H: b.wallHeight, T: b.wallThickness, FL: b.floorHeight };
}

// ── Piece classification ────────────────────────────────────────────────────
export const isWallType = (t: PieceType) => t === 'wall' || t === 'wallWindow' || t === 'wallDoor';
export const isRoofType = (t: PieceType) => t === 'roofFlat' || t === 'roofGable';
export const isFurnType = (t: PieceType) => t === 'bed' || t === 'sofa' || t === 'table' || t === 'lamp' || t === 'plant' || t === 'shelf';

/** Rotation (about y) the piece's Object3D gets. Roofs/floors/rugs are rotation-free. */
export function pieceRotY(p: { type: PieceType; rot: number }): number {
  if (isRoofType(p.type) || p.type === 'floor' || p.type === 'rug') return 0;
  return (-p.rot * Math.PI) / 2;
}

// ── House context (lookups pieces need about their neighbours) ──────────────
export interface HouseCtx {
  walls: Map<string, PlacedPiece>;   // by normalized edge key
  roofs: Map<string, PlacedPiece>;   // by cell
  furn: Map<string, PlacedPiece>;    // by cell
  rugs: Set<string>;
}
export const cellKey = (x: number, z: number) => `${x},${z}`;

/** A wall's edge, normalized so two cells sharing an edge agree: 'h:x:zLine' / 'v:xLine:z'. */
export function edgeKey(p: { x: number; z: number; rot: number }): string {
  switch (p.rot) {
    case 0: return `h:${p.x}:${p.z}`;
    case 2: return `h:${p.x}:${p.z + 1}`;
    case 3: return `v:${p.x}:${p.z}`;
    default: return `v:${p.x + 1}:${p.z}`;
  }
}

export function makeCtx(pieces: readonly PlacedPiece[]): HouseCtx {
  const ctx: HouseCtx = { walls: new Map(), roofs: new Map(), furn: new Map(), rugs: new Set() };
  for (const p of pieces) {
    if (isWallType(p.type)) ctx.walls.set(edgeKey(p), p);
    else if (isRoofType(p.type)) ctx.roofs.set(cellKey(p.x, p.z), p);
    else if (isFurnType(p.type)) ctx.furn.set(cellKey(p.x, p.z), p);
    else if (p.type === 'rug') ctx.rugs.add(cellKey(p.x, p.z));
  }
  return ctx;
}

// ── Entry points ────────────────────────────────────────────────────────────
export function genPiece(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  switch (p.type) {
    case 'floor': return genFloor(br, p);
    case 'rug': return genRug(br, p);
    case 'wall':
    case 'wallWindow':
    case 'wallDoor': return genWall(br, p);
    case 'roofFlat': return genRoofFlat(br, p, ctx);
    case 'roofGable': return genRoofGable(br, p, ctx);
    case 'bed': return genBed(br, p);
    case 'sofa': return genSofa(br, p);
    case 'table': return genTable(br, p);
    case 'lamp': return genLamp(br, p);
    case 'plant': return genPlant(br, p);
    case 'shelf': return genShelf(br, p);
    case 'creation': return;  // drawn by houseMesh (needs the owner's creation); gift box fallback below
  }
}

/** Where a creation sits: on a table/shelf in its cell, else on the floor (or a rug). */
export function creationBaseY(ctx: HouseCtx, x: number, z: number): number {
  const { FL } = dims();
  const f = ctx.furn.get(cellKey(x, z));
  if (f?.type === 'table') return FL + 0.465;
  if (f?.type === 'shelf') return FL + 0.9;
  return FL + (ctx.rugs.has(cellKey(x, z)) ? 0.03 : 0);
}

/** Fallback for a creation that no longer exists: a little gift box. */
export function genGift(br: Brush, p: PlacedPiece, y: number): void {
  br.rbox(0, y + 0.14, 0, 0.3, 0.28, 0.3, p.color, 0.05);
  const rib = lighten(p.color, 0.6);
  br.rbox(0, y + 0.14, 0, 0.07, 0.3, 0.32, rib, 0.02);
  br.rbox(0, y + 0.14, 0, 0.32, 0.3, 0.07, rib, 0.02);
  br.ball(-0.05, y + 0.32, 0, 0.06, rib);
  br.ball(0.05, y + 0.32, 0, 0.06, rib);
}

export function bakePiece(p: PlacedPiece, ctx: HouseCtx): Baked {
  const baker = new Baker();
  genPiece(new Brush(baker), p, ctx);
  return baker.bake();
}

// ── Floor & rug ─────────────────────────────────────────────────────────────
function genFloor(br: Brush, p: PlacedPiece): void {
  const { S, FL } = dims();
  const c = p.color;
  // dark grout slab + four checker plates; parity makes the checker continue across tiles
  br.rbox(0, FL / 2, 0, S, FL, S, darken(c, 0.1), 0.035);
  const par = (p.x + p.z) & 1;
  const a = par ? lighten(c, 0.2) : c;
  const b = par ? c : lighten(c, 0.2);
  const q = S * 0.235, ps = S * 0.44;
  br.box(-q, FL + 0.004, -q, ps, 0.012, ps, a);
  br.box(q, FL + 0.004, q, ps, 0.012, ps, a);
  br.box(q, FL + 0.004, -q, ps, 0.012, ps, b);
  br.box(-q, FL + 0.004, q, ps, 0.012, ps, b);
}

function genRug(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  const c = p.color;
  const top = FL + 0.03;
  br.cyl(0, top / 2, 0, 0.44, 0.44, top, c, 'satin', 22);
  br.cyl(0, top / 2 + 0.002, 0, 0.34, 0.34, top + 0.004, lighten(c, 0.28), 'satin', 22);
  br.cyl(0, top / 2 + 0.004, 0, 0.22, 0.22, top + 0.008, c, 'satin', 20);
  br.cyl(0, top / 2 + 0.006, 0, 0.09, 0.09, top + 0.012, lighten(c, 0.4), 'satin', 14);
}

// ── Walls ───────────────────────────────────────────────────────────────────
// A wall lies along the cell's NORTH edge (z = -S/2); the outside is -z.
function genWall(br: Brush, p: PlacedPiece): void {
  const { S, H, T } = dims();
  const th = T + ((p.x + p.z) & 1) * 0.004;   // tiny per-cell thickness change so overlaps never z-fight
  const L = S + 0.08;                           // overlaps neighbours so no groove shows at joints
  const zc = -S / 2;
  const main = p.color;
  const trim = darken(main, 0.2);

  if (p.type === 'wall') {
    br.rbox(0, H / 2, zc, L, H, th, main, 0.04);
    const panel = lighten(main, 0.16);
    for (const side of [-1, 1]) br.box(0, H * 0.56, zc + side * (th / 2 + 0.003), S * 0.72, H * 0.55, 0.012, panel);
    br.rbox(0, 0.08, zc, L, 0.16, th + 0.05, trim, 0.03);
  } else if (p.type === 'wallWindow') {
    const ow = S * 0.6, y0 = 0.5, y1 = Math.min(1.2, H - 0.32), oh = y1 - y0, ym = (y0 + y1) / 2;
    const pw = L / 2 - ow / 2, px = ow / 2 + pw / 2;
    br.rbox(0, y0 / 2, zc, L, y0, th, main, 0.03);
    br.rbox(0, (y1 + H) / 2, zc, L, H - y1, th, main, 0.03);
    for (const sx of [-1, 1]) br.rbox(sx * px, ym, zc, pw + 0.01, oh + 0.02, th, main, 0.02);
    br.rbox(0, 0.08, zc, L, 0.16, th + 0.05, trim, 0.03);
    // white frame, cross bars and a sill that sticks out
    const wf = '#ffffff';
    br.rbox(0, y1 - 0.02, zc, ow + 0.14, 0.08, th + 0.07, wf, 0.025);
    br.rbox(0, y0 + 0.01, zc - 0.03, ow + 0.18, 0.06, th + 0.14, wf, 0.025);
    for (const sx of [-1, 1]) br.rbox(sx * (ow / 2 + 0.015), ym, zc, 0.07, oh + 0.03, th + 0.06, wf, 0.025);
    br.box(0, ym, zc, 0.035, oh, th + 0.03, wf);
    br.box(0, ym, zc, ow, 0.035, th + 0.03, wf);
    br.box(0, ym, zc, ow, oh, 0.02, '#bfe6ff', 'glass');
    // flower box outside
    const fz = zc - th / 2 - 0.1;
    br.rbox(0, y0 - 0.075, fz, ow + 0.12, 0.13, 0.16, '#e6b88a', 0.04);
    const fl = ['#ff8fb1', '#ffd166', '#ffffff', '#ff8fb1', '#ffd166'];
    for (let k = 0; k < 5; k++) {
      const fx = (k - 2) * 0.12;
      br.ball(fx + 0.03, y0 - 0.01, fz + 0.03, 0.05, '#7bd88f', 'satin');
      br.ball(fx, y0 + 0.03, fz, 0.055, fl[k]);
    }
  } else {
    const dw = S * 0.56, dh = Math.min(1.2, H - 0.3);
    const pw = L / 2 - dw / 2, px = dw / 2 + pw / 2;
    for (const sx of [-1, 1]) {
      br.rbox(sx * px, H / 2, zc, pw + 0.01, H, th, main, 0.03);
      br.rbox(sx * px, 0.08, zc, pw + 0.01, 0.16, th + 0.05, trim, 0.03);
    }
    br.rbox(0, (dh + H) / 2, zc, L, H - dh, th, main, 0.03);
    // frame
    br.rbox(0, dh + 0.03, zc, dw + 0.12, 0.07, th + 0.05, trim, 0.025);
    for (const sx of [-1, 1]) br.rbox(sx * (dw / 2 + 0.02), dh / 2, zc, 0.05, dh, th + 0.05, trim, 0.02);
    // arched door on a dark backing (so no gaps show at the arch corners)
    const door = mix(main, '#b0705a', 0.55);
    br.box(0, dh / 2, zc, dw, dh, 0.04, darken(door, 0.4));
    const ar = (dw - 0.06) / 2, lh = dh - 0.03;
    br.rbox(0, 0.02 + (lh - ar) / 2, zc, ar * 2, lh - ar, 0.07, door, 0.03);
    br.cyl(0, 0.02 + lh - ar, zc, ar, ar, 0.07, door, 'gloss', 16, Math.PI / 2);
    const wy = 0.02 + lh - ar;
    br.cyl(0, wy, zc - 0.037, 0.115, 0.115, 0.02, '#ffffff', 'gloss', 14, Math.PI / 2);
    br.cyl(0, wy, zc - 0.045, 0.085, 0.085, 0.02, '#bfe6ff', 'glass', 14, Math.PI / 2);
    br.ball(ar - 0.09, 0.5, zc - 0.06, 0.04, '#ffd166');
    br.ball(ar - 0.09, 0.5, zc + 0.06, 0.04, '#ffd166');
    // doorstep outside
    br.rbox(0, 0.03, zc - th / 2 - 0.17, dw + 0.22, 0.06, 0.34, '#efe6f2', 0.03, 'satin');
  }
  // top rail
  br.rbox(0, H - 0.035, zc, L, 0.07, th + 0.05, trim, 0.03);
}

/**
 * Corner / end posts for a whole house, in plot-local space. A post stands at
 * every lattice point where walls meet or end — except straight pass-throughs.
 */
export function bakePosts(br: Brush, walls: Map<string, PlacedPiece>): void {
  const { S, H, T } = dims();
  interface V { x: number; z: number; E?: PlacedPiece; S?: PlacedPiece; W?: PlacedPiece; N?: PlacedPiece }
  const verts = new Map<string, V>();
  const get = (x: number, z: number): V => {
    const k = `${x},${z}`;
    let v = verts.get(k);
    if (!v) verts.set(k, (v = { x, z }));
    return v;
  };
  for (const [key, p] of walls) {
    const [kind, a, b] = key.split(':');
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
    const c = darken(owner.color, 0.2);
    br.rbox(v.x * S, H / 2 + 0.025, v.z * S, T + 0.09, H + 0.05, T + 0.09, c, 0.045);
    br.ball(v.x * S, H + 0.05, v.z * S, 0.085, c, 'gloss', 1, 0.85, 1);
  }
}

// ── Roofs ───────────────────────────────────────────────────────────────────
function genRoofFlat(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  const { S, H } = dims();
  const th = tuning.build.roofThickness, ov = tuning.build.roofOverhang;
  const has = (dx: number, dz: number) => ctx.roofs.get(cellKey(p.x + dx, p.z + dz))?.type === 'roofFlat';
  const W = has(-1, 0), E = has(1, 0), N = has(0, -1), Sd = has(0, 1);
  const xmin = -S / 2 - (W ? 0 : ov), xmax = S / 2 + (E ? 0 : ov);
  const zmin = -S / 2 - (N ? 0 : ov), zmax = S / 2 + (Sd ? 0 : ov);
  const xm = (xmin + xmax) / 2, zm = (zmin + zmax) / 2, w = xmax - xmin, d = zmax - zmin;
  const trim = darken(p.color, 0.2);
  br.box(xm, H + th / 2, zm, w, th, d, p.color);
  br.box(0, H + th + 0.006, 0, S - 0.22, 0.012, S - 0.22, lighten(p.color, 0.14));
  const ry = H + th + 0.035;
  if (!N) br.rbox(xm, ry, zmin + 0.05, w, 0.09, 0.1, trim, 0.03);
  if (!Sd) br.rbox(xm, ry, zmax - 0.05, w, 0.09, 0.1, trim, 0.03);
  if (!W) br.rbox(xmin + 0.05, ry, zm, 0.1, 0.09, d, trim, 0.03);
  if (!E) br.rbox(xmax - 0.05, ry, zm, 0.1, 0.09, d, trim, 0.03);
}

/**
 * Gable roof. Cells in a run perpendicular to the ridge together form ONE
 * gable (the peak sits in the middle of the run); cells along the ridge join
 * end to end. Each cell draws its own slice of the shared shape.
 */
function genRoofGable(br: Brush, p: PlacedPiece, ctx: HouseCtx): void {
  const { S, H } = dims();
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

  const run = n * S, peak = run / 2;
  const slope = Math.min(tb.roofPitch, tb.roofMaxRise / peak);
  const yTop = (u: number) => Math.max(H + 0.02, H + th + slope * Math.min(u, run - u));
  const u0 = i * S - (i === 0 ? ov : 0);
  const u1 = (i + 1) * S + (j === 0 ? ov : 0);
  const uc = (i + 0.5) * S;
  const t0 = -S / 2 - (hasPrev ? 0 : ov);
  const t1 = S / 2 + (hasNext ? 0 : ov);
  const tc = (t0 + t1) / 2, len = t1 - t0;

  const prof: [number, number][] = [[u0 - uc, H], [u1 - uc, H], [u1 - uc, yTop(u1)]];
  if (peak > u0 + 1e-4 && peak < u1 - 1e-4) prof.push([peak - uc, yTop(peak)]);
  prof.push([u0 - uc, yTop(u0)]);

  // (u, y, t) space → world: ridge along x maps u→z, t→x (a mirror; the Baker copes), else identity.
  const map = axisX
    ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    : new THREE.Matrix4();
  const put = (geo: THREE.BufferGeometry, local: THREE.Matrix4, color: string) =>
    br.b.add(geo, new THREE.Matrix4().multiplyMatrices(map, local), color, 'gloss');

  put(prismG(prof, t0, t1), new THREE.Matrix4(), p.color);

  // shingle rows
  const rowStep = 0.22, rowCol = darken(p.color, 0.12), ang = Math.atan(slope);
  const strip = boxG(0.045, 0.014, len);
  for (let k = 0; (k + 0.5) * rowStep < peak - 0.09; k++) {
    const d = (k + 0.5) * rowStep;
    for (const u of [d, run - d]) {
      if (u < i * S || u >= (i + 1) * S) continue;
      put(strip, M(u - uc, yTop(u) + 0.007, tc, 1, 1, 1, 0, 0, u < peak ? ang : -ang), rowCol);
    }
  }
  const trim = darken(p.color, 0.22);
  // ridge cap (drawn by the cell that contains the peak)
  if (i === Math.floor(n / 2)) {
    const pu = peak - uc, py = yTop(peak) + 0.01;
    put(cylG(0.075, 0.075, 1, 10), M(pu, py, tc, 1, len, 1, 0, Math.PI / 2, 0), trim);
    if (!hasPrev) put(ballG(true), M(pu, py, t0, 0.075), trim);
    if (!hasNext) put(ballG(true), M(pu, py, t1, 0.075), trim);
  }
  // rounded eave edges
  if (i === 0) put(cylG(0.042, 0.042, 1, 8), M(u0 - uc, yTop(u0) - 0.012, tc, 1, len, 1, 0, Math.PI / 2, 0), trim);
  if (j === 0) put(cylG(0.042, 0.042, 1, 8), M(u1 - uc, yTop(u1) - 0.012, tc, 1, len, 1, 0, Math.PI / 2, 0), trim);
}

// ── Furniture (resting on the floor tile top; back toward +z) ───────────────
const WOOD = '#e0b48a';

function genBed(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  const c = p.color;
  br.rbox(0, FL + 0.11, 0, 0.86, 0.14, 0.98, WOOD, 0.05);
  br.rbox(0, FL + 0.235, 0, 0.78, 0.13, 0.9, '#fffaf5', 0.06, 'satin');
  br.rbox(0, FL + 0.29, -0.16, 0.8, 0.1, 0.6, c, 0.05, 'satin');
  br.rbox(0, FL + 0.3, 0.14, 0.8, 0.11, 0.1, lighten(c, 0.32), 0.04, 'satin');
  for (const sx of [-1, 1]) br.rbox(sx * 0.2, FL + 0.345, 0.31, 0.32, 0.1, 0.2, '#ffffff', 0.05, 'satin', sx * -0.08);
  br.rbox(0, FL + 0.32, 0.5, 0.92, 0.52, 0.08, WOOD, 0.05);
  for (const sx of [-1, 1]) br.ball(sx * 0.4, FL + 0.6, 0.5, 0.055, WOOD);
}

function genSofa(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  const c = p.color, cu = lighten(c, 0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) br.cyl(sx * 0.38, FL + 0.03, sz * 0.27, 0.04, 0.03, 0.06, '#6b5b73', 'gloss', 8);
  br.rbox(0, FL + 0.17, 0, 0.92, 0.22, 0.7, c, 0.07, 'satin');
  br.rbox(0, FL + 0.43, 0.3, 0.92, 0.42, 0.2, c, 0.08, 'satin');
  for (const sx of [-1, 1]) br.rbox(sx * 0.39, FL + 0.31, 0.02, 0.16, 0.34, 0.72, c, 0.07, 'satin');
  for (const sx of [-1, 1]) {
    br.rbox(sx * 0.16, FL + 0.33, -0.04, 0.3, 0.12, 0.5, cu, 0.06, 'satin');
    br.rbox(sx * 0.17, FL + 0.46, 0.2, 0.3, 0.26, 0.1, cu, 0.06, 'satin', 0, -0.25);
  }
  br.rbox(-0.3, FL + 0.43, -0.02, 0.17, 0.17, 0.07, '#ffd166', 0.04, 'satin', 0.5, -0.3);
}

function genTable(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  br.cyl(0, FL + 0.43, 0, 0.4, 0.4, 0.07, p.color, 'gloss', 22);
  br.cyl(0, FL + 0.385, 0, 0.34, 0.34, 0.03, darken(p.color, 0.15), 'gloss', 22);
  br.cyl(0, FL + 0.2, 0, 0.065, 0.09, 0.4, WOOD, 'gloss', 10);
  br.cyl(0, FL + 0.03, 0, 0.24, 0.26, 0.06, WOOD, 'gloss', 16);
}

function genLamp(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  br.cyl(0, FL + 0.025, 0, 0.17, 0.19, 0.05, '#d9d0e3', 'gloss', 16);
  br.cyl(0, FL + 0.5, 0, 0.022, 0.022, 1.0, '#b9b0c9', 'gloss', 8);
  br.cyl(0, FL + 1.02, 0, 0.15, 0.24, 0.3, p.color, 'glow', 16);
  br.ball(0, FL + 1.2, 0, 0.04, '#d9d0e3');
}

function genPlant(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  const c = p.color;
  br.cyl(0, FL + 0.14, 0, 0.2, 0.15, 0.28, '#e9a37c', 'gloss', 14);
  br.cyl(0, FL + 0.285, 0, 0.225, 0.225, 0.05, '#f0b490', 'gloss', 14);
  br.cyl(0, FL + 0.3, 0, 0.19, 0.19, 0.03, '#6b4a3a', 'satin', 12);
  br.ball(0, FL + 0.53, 0, 0.26, c, 'satin');
  br.ball(0.17, FL + 0.43, 0.05, 0.18, lighten(c, 0.12), 'satin');
  br.ball(-0.16, FL + 0.45, -0.06, 0.17, darken(c, 0.08), 'satin');
  br.ball(0.02, FL + 0.72, -0.02, 0.15, lighten(c, 0.2), 'satin');
  br.ball(0.2, FL + 0.58, 0.14, 0.045, '#ff8fb1');
  br.ball(-0.1, FL + 0.7, 0.12, 0.045, '#ffffff');
  br.ball(0.04, FL + 0.84, -0.04, 0.045, '#ffd166');
}

const BOOKS = ['#ff5d8f', '#ffd166', '#5fd3a5', '#5aa9ff', '#9d8cff', '#ffffff', '#ffb38a'];
function genShelf(br: Brush, p: PlacedPiece): void {
  const { FL } = dims();
  const c = p.color;
  const sw = 0.86, sh = 0.9, sd = 0.34, zz = 0.3;
  br.rbox(0, FL + sh / 2, zz + sd / 2 - 0.025, sw, sh, 0.05, darken(c, 0.2), 0.02);
  for (const sx of [-1, 1]) br.rbox(sx * (sw / 2 - 0.03), FL + sh / 2, zz, 0.06, sh, sd, c, 0.03);
  for (const y of [0.03, 0.32, 0.61]) br.rbox(0, FL + y, zz, sw, 0.05, sd, c, 0.02);
  br.rbox(0, FL + sh - 0.025, zz, sw + 0.04, 0.05, sd + 0.03, lighten(c, 0.12), 0.025);
  const rnd = seeded(p.x * 131 + p.z * 17 + 7);
  for (const y of [0.055, 0.345, 0.635]) {
    let x = -0.33;
    while (x < 0.3) {
      if (rnd() < 0.15) { x += 0.07; continue; }
      const w = 0.055 + rnd() * 0.045, h = 0.15 + rnd() * 0.08;
      br.box(x + w / 2, FL + y + h / 2, zz - 0.02, w, h, 0.2, BOOKS[Math.floor(rnd() * BOOKS.length)]);
      x += w + 0.008;
    }
  }
}

// ── Village decorations (local frame: origin on the ground at the deco's x,z) ─
export function genDeco(br: Brush, d: Decoration): void {
  const c = d.color;
  switch (d.type) {
    case 'tree':
      br.cyl(0, 0.38, 0, 0.1, 0.14, 0.76, '#a9744f', 'satin', 10);
      br.ball(0, 1.32, 0, 0.62, c, 'gloss', 1, 0.95, 1);
      br.ball(0.38, 1.0, 0.12, 0.42, lighten(c, 0.08));
      br.ball(-0.33, 1.05, -0.2, 0.4, darken(c, 0.06));
      br.ball(0.05, 1.78, 0, 0.38, lighten(c, 0.12));
      break;
    case 'pine':
      br.cyl(0, 0.25, 0, 0.09, 0.12, 0.5, '#a9744f', 'satin', 8);
      br.cyl(0, 0.875, 0, 0, 0.75, 0.95, darken(c, 0.04), 'gloss', 12);
      br.cyl(0, 1.4, 0, 0, 0.58, 0.8, c, 'gloss', 12);
      br.cyl(0, 1.9, 0, 0, 0.42, 0.7, lighten(c, 0.08), 'gloss', 12);
      br.ball(0, 2.3, 0, 0.1, '#ffd166');
      break;
    case 'bush':
      br.ball(0, 0.28, 0, 0.38, c, 'gloss', 1, 0.8, 1);
      br.ball(0.3, 0.22, 0.12, 0.28, lighten(c, 0.08));
      br.ball(-0.28, 0.22, -0.1, 0.3, darken(c, 0.07));
      for (let k = 0; k < 5; k++) {
        const a = k * 1.7 + 0.4;
        br.ball(Math.cos(a) * 0.3, 0.3 + (k % 2) * 0.12, Math.sin(a) * 0.3, 0.045, '#ff5d8f');
      }
      break;
    case 'flowers': {
      br.ball(0, 0.06, 0, 0.4, '#8fdc8f', 'satin', 1, 0.35, 1);
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4, r = 0.08 + (k % 3) * 0.1, h = 0.26 + (k % 4) * 0.07;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        br.rod(px, h / 2, pz, 0.012, h, '#6fcf7f', 'satin', 6);
        br.ball(px, h + 0.02, pz, 0.075, k % 2 ? c : lighten(c, 0.38));
        br.ball(px, h + 0.065, pz, 0.035, '#ffd166');
      }
      break;
    }
    case 'fence':
      br.rbox(0, 0.22, 0, 1.0, 0.06, 0.05, c, 0.02);
      br.rbox(0, 0.46, 0, 1.0, 0.06, 0.05, c, 0.02);
      for (let k = 0; k < 3; k++) br.rbox(-0.25 + k * 0.25, 0.3, 0, 0.13, 0.6, 0.045, c, 0.045);
      for (const sx of [-1, 1]) {
        br.rbox(sx * 0.45, 0.35, 0, 0.09, 0.7, 0.09, darken(c, 0.12), 0.04);
        br.ball(sx * 0.45, 0.72, 0, 0.055, darken(c, 0.12));
      }
      break;
    case 'streetLamp':
      br.cyl(0, 0.06, 0, 0.14, 0.18, 0.12, c, 'gloss', 12);
      br.cyl(0, 1.1, 0, 0.045, 0.055, 2.0, c, 'gloss', 8);
      br.cyl(0, 2.2, 0, 0.1, 0.1, 0.08, c, 'gloss', 10);
      br.ball(0, 2.38, 0, 0.2, '#fff0b0', 'glow');
      br.cyl(0, 2.62, 0, 0.02, 0.28, 0.16, c, 'gloss', 12);
      break;
    case 'bench':
      for (const sx of [-1, 1]) br.rbox(sx * 0.55, 0.22, 0, 0.08, 0.44, 0.38, darken(c, 0.15), 0.03);
      br.rbox(0, 0.44, 0, 1.3, 0.08, 0.4, c, 0.035);
      br.rbox(0, 0.52, 0.18, 1.3, 0.34, 0.07, lighten(c, 0.1), 0.035, 'gloss', 0, -0.12);
      break;
  }
}

export function bakeDeco(d: Decoration): Baked {
  const baker = new Baker();
  genDeco(new Brush(baker), d);
  return baker.bake();
}
