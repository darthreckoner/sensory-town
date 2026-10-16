// ── v3 build (W5): how world build pieces LOOK ─────────────────────────────────
// Wall / floor / ramp / roof x wood / brick / metal, a nicer finish than plain slabs:
//   wood   plank lines (texture) in a darker trim frame: plinth, top rail, corner posts, opening frames
//   brick  mortar courses (texture), alternating corner quoins, a light coping cap, a plinth
//   metal  riveted panels (texture), a dark frame, and a glass strip along the top row
// Everything is procedural, drawn with the same Baker / Brush as the houses (one vertex-coloured
// geometry per material "fin"), so a whole chunk of builds is a handful of draw calls.
// Pieces are drawn in their own local frame (see buildSpace.pieceFrame); the caller sets baker.base.
import * as THREE from 'three';
import type { BuildMat, BuildPiece } from '../../core/model';
import { Baker, Brush, M, boxG, darken, lighten, prismG, bakedToGroup, type Fin } from '../bake';
import { TILE, STOREY, THICK, ROOF_RISE, pieceFrame, rowRuns } from '../../world/buildSpace';
import { groundHeight } from '../../world/heightfield';
import { tuning } from '../../tuning';

export interface MatStyle {
  fin: Fin;            // body (patterned)
  roofFin: Fin;
  base: string;        // body colour (the pattern multiplies it)
  trim: string;        // frame colour
  roof: string;
  icon: string;
  label: string;
}

export const MATS: Record<BuildMat, MatStyle> = {
  wood: { fin: 'wplank', roofFin: 'wshingle', base: '#e0834a', trim: '#7a4326', roof: '#b4623a', icon: '🪵', label: 'Wood' },
  brick: { fin: 'wbrick', roofFin: 'wshingle', base: '#c85a3c', trim: '#ece1cb', roof: '#d0683e', icon: '🧱', label: 'Brick' },
  metal: { fin: 'wsteel', roofFin: 'wsteel', base: '#b7c3d6', trim: '#4a5568', roof: '#8d9bb0', icon: '🔩', label: 'Metal' },
};

/** Piece colour: its tint when it has one, else the material's own. */
export const bodyColor = (p: BuildPiece): string => p.tint ?? MATS[p.mat].base;

/** How far a piece near the ground reaches down so it never floats on a slope (0 when it is buried or high up). */
export function skirtFor(p: BuildPiece): number {
  const f = pieceFrame(p);
  const g = groundHeight(f.x, f.z, false, true);
  const gap = f.y - g;
  return gap > 0.02 ? Math.min(gap + 0.15, tuning.build3.skirtMax) : 0;
}

// ── walls ───────────────────────────────────────────────────────────────────
function genWall(br: Brush, p: BuildPiece, skirt: number): void {
  const T = TILE, S = STOREY, th = THICK;
  const cw = T / 3, rh = S / 3, x0 = -T / 2, h2 = th / 2;
  const mask = p.edit ?? 0;
  const st = MATS[p.mat];
  const col = bodyColor(p);
  const trim = p.tint ? darken(p.tint, 0.38) : st.trim;
  const fin = st.fin;
  const has = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3 && !(mask & (1 << (r * 3 + c)));
  const rows = [0, 1, 2].map((r) => rowRuns(mask, r));

  // ── body: rows with identical runs merge into one taller slab ──
  let r = 0;
  while (r < 3) {
    let r2 = r;
    while (r2 + 1 < 3 && JSON.stringify(rows[r2 + 1]) === JSON.stringify(rows[r])) r2++;
    const yt = (3 - r) * rh, yb = (2 - r2) * rh - (r2 === 2 ? skirt : 0);
    for (const [c0, c1] of rows[r]) br.blk(x0 + c0 * cw, yb, -h2, x0 + (c1 + 1) * cw, yt, h2, col, fin);
    r = r2 + 1;
  }

  const pro = 0.05;                    // how far trim stands proud of each face
  const zt = h2 + pro;
  const bar = (xa: number, ya: number, xb: number, yb2: number, color = trim, f: Fin = fin) => br.blk(xa, ya, -zt, xb, yb2, zt, color, f);

  if (p.mat === 'wood') {
    // plinth + top rail over the panels that are there, posts down the ends, frames round the openings
    for (const [c0, c1] of rows[2]) bar(x0 + c0 * cw, 0, x0 + (c1 + 1) * cw, 0.22);
    for (const [c0, c1] of rows[0]) bar(x0 + c0 * cw - (c0 === 0 ? 0.04 : 0), S - 0.2, x0 + (c1 + 1) * cw + (c1 === 2 ? 0.04 : 0), S);
    for (let rr = 0; rr < 3; rr++) {
      if (has(rr, 0)) bar(x0 - 0.04, (2 - rr) * rh, x0 + 0.2, (3 - rr) * rh);
      if (has(rr, 2)) bar(x0 + T - 0.2, (2 - rr) * rh, x0 + T + 0.04, (3 - rr) * rh);
    }
    // a cross brace on solid middle panels (a barn-door look) when the wall is untouched
    if (!mask) {
      for (const sx of [-1, 1]) br.b.add(boxG(0.16, 2.3, th + 0.08), M(sx * (T / 2 - 0.9), S / 2, 0), trim, fin);
    }
  } else if (p.mat === 'brick') {
    // light quoins up both ends (alternating long / short) and a coping cap
    const stone = lighten(col, 0.55);
    for (let rr = 0; rr < 3; rr++) {
      for (const [side, cc] of [[-1, 0], [1, 2]] as const) {
        if (!has(rr, cc)) continue;
        for (let k = 0; k < 3; k++) {
          const y = (2 - rr) * rh + k * (rh / 3);
          const wide = (k + (side > 0 ? 1 : 0)) % 2 === 0 ? 0.52 : 0.3;
          const xa = side < 0 ? x0 - 0.02 : x0 + T - wide + 0.02, xb = side < 0 ? x0 + wide : x0 + T + 0.02;
          br.blk(xa, y + 0.02, -zt, xb, y + rh / 3 - 0.02, zt, stone, fin);
        }
      }
    }
    for (const [c0, c1] of rows[0]) br.blk(x0 + c0 * cw - 0.06, S - 0.16, -h2 - 0.09, x0 + (c1 + 1) * cw + 0.06, S + 0.06, h2 + 0.09, stone, fin);
    for (const [c0, c1] of rows[2]) br.blk(x0 + c0 * cw - 0.03, 0, -h2 - 0.05, x0 + (c1 + 1) * cw + 0.03, 0.24, h2 + 0.05, darken(col, 0.18), fin);
  } else {
    // metal: a dark frame and posts, with the glass strip across what is left of the top row
    for (const [c0, c1] of rows[2]) bar(x0 + c0 * cw, 0, x0 + (c1 + 1) * cw, 0.18);
    for (const [c0, c1] of rows[0]) bar(x0 + c0 * cw - (c0 === 0 ? 0.04 : 0), S - 0.16, x0 + (c1 + 1) * cw + (c1 === 2 ? 0.04 : 0), S);
    for (let rr = 0; rr < 3; rr++) {
      if (has(rr, 0)) bar(x0 - 0.04, (2 - rr) * rh, x0 + 0.16, (3 - rr) * rh);
      if (has(rr, 2)) bar(x0 + T - 0.16, (2 - rr) * rh, x0 + T + 0.04, (3 - rr) * rh);
    }
    for (const [c0, c1] of rows[0]) {
      const xa = x0 + c0 * cw + 0.28, xb = x0 + (c1 + 1) * cw - 0.28;
      if (xb - xa < 0.5) continue;
      const y0 = S - rh + 0.3, y1 = S - 0.3;
      br.blk(xa - 0.06, y0 - 0.06, -zt, xb + 0.06, y1 + 0.06, zt, trim, fin);
      br.blk(xa, y0, -zt - 0.012, xb, y1, zt + 0.012, '#a8e2ff', fin);   // the "glass": a bright pale-blue pane in the same steel bucket (no extra draw call)
    }
  }

  // frames round every opening (the edges where a removed panel meets one that is left)
  const fw = 0.12;
  const frameCol = p.mat === 'brick' ? lighten(col, 0.55) : trim;
  const ff: Fin = p.mat === 'brick' ? fin : fin;
  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      if (has(rr, cc)) continue;
      const xa = x0 + cc * cw, xb = xa + cw, yb = (2 - rr) * rh, yt = yb + rh;
      if (has(rr - 1, cc)) br.blk(xa - (has(rr, cc - 1) ? 0 : 0), yt - fw / 2, -zt, xb, yt + fw / 2, zt, frameCol, ff);       // lintel under the panel above
      if (has(rr + 1, cc)) br.blk(xa, yb - fw / 2, -zt, xb, yb + fw / 2, zt, frameCol, ff);                                      // sill on the panel below
      if (has(rr, cc - 1)) br.blk(xa - fw / 2, yb, -zt, xa + fw / 2, yt, zt, frameCol, ff);
      if (has(rr, cc + 1)) br.blk(xb - fw / 2, yb, -zt, xb + fw / 2, yt, zt, frameCol, ff);
    }
  }
}

// ── floors ──────────────────────────────────────────────────────────────────
function genFloor(br: Brush, p: BuildPiece, skirt: number): void {
  const T = TILE, th = THICK, h = T / 2;
  const st = MATS[p.mat];
  const col = bodyColor(p);
  const trim = p.tint ? darken(p.tint, 0.35) : st.trim;
  const mask = p.edit ?? 0;
  const swap = p.dir % 2 === 1;                    // planks run the other way
  const slab = (xa: number, za: number, xb: number, zb: number, y0 = 0) => br.b.add(boxG(xb - xa, th + skirt - y0, zb - za), M((xa + xb) / 2, (th - skirt + y0) / 2 + 0 , (za + zb) / 2), col, st.fin, swap);
  if (!mask) slab(-h, -h, h, h);
  else {
    // the 3x3 sub-cells that are still there, merged along x
    const c3 = T / 3;
    for (let r = 0; r < 3; r++) {
      for (const [c0, c1] of rowRuns(mask, r)) slab(-h + c0 * c3, -h + r * c3, -h + (c1 + 1) * c3, -h + (r + 1) * c3);
    }
  }
  // trim frame round the edge, a hair proud
  const e = 0.22, lift = th + 0.025;
  const solid = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3 && !(mask & (1 << (r * 3 + c)));
  const c3 = T / 3;
  for (let i = 0; i < 3; i++) {
    if (solid(0, i)) br.blk(-h + i * c3, th - 0.04, -h, -h + (i + 1) * c3, lift, -h + e, trim, st.fin);
    if (solid(2, i)) br.blk(-h + i * c3, th - 0.04, h - e, -h + (i + 1) * c3, lift, h, trim, st.fin);
    if (solid(i, 0)) br.blk(-h, th - 0.04, -h + i * c3, -h + e, lift, -h + (i + 1) * c3, trim, st.fin);
    if (solid(i, 2)) br.blk(h - e, th - 0.04, -h + i * c3, h, lift, -h + (i + 1) * c3, trim, st.fin);
  }
  // a hole gets its own little edging
  if (mask) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if (solid(r, c)) continue;
      const xa = -h + c * c3, za = -h + r * c3, xb = xa + c3, zb = za + c3;
      if (solid(r - 1, c)) br.blk(xa, th - 0.04, za - 0.06, xb, lift, za + 0.06, trim, st.fin);
      if (solid(r + 1, c)) br.blk(xa, th - 0.04, zb - 0.06, xb, lift, zb + 0.06, trim, st.fin);
      if (solid(r, c - 1)) br.blk(xa - 0.06, th - 0.04, za, xa + 0.06, lift, zb, trim, st.fin);
      if (solid(r, c + 1)) br.blk(xb - 0.06, th - 0.04, za, xb + 0.06, lift, zb, trim, st.fin);
    }
  }
}

// ── ramps ───────────────────────────────────────────────────────────────────
/** A ramp is drawn rising toward local -z (the piece frame turns it to its direction). */
function genRamp(br: Brush, p: BuildPiece, skirt: number): void {
  const T = TILE, S = STOREY, th = THICK;
  const st = MATS[p.mat];
  const col = bodyColor(p);
  const trim = p.tint ? darken(p.tint, 0.35) : st.trim;
  // sloped slab: top line y = S * u / T (u from the low edge), thickness th below it, a little more at the low end into the ground
  const prof: [number, number][] = [[0, -th - skirt * 0.5], [T, S - th], [T, S], [0, 0]];
  const map = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  map.setPosition(0, 0, T / 2);
  br.b.add(prismG(prof, -T / 2, T / 2), map, col, st.fin);
  // side curbs along both edges, stepping rails across the surface
  const a = Math.atan2(S, T), L = Math.hypot(T, S);
  for (const sx of [-1, 1]) {
    br.b.add(boxG(0.2, 0.3, L), M(sx * (T / 2 - 0.1), S / 2 + 0.15, 0, 1, 1, 1, 0, a, 0), trim, st.fin);
  }
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const u = ((i + 0.5) / steps) * T;
    br.b.add(boxG(T - 0.4, 0.07, 0.16), M(0, (S * u) / T + 0.03, T / 2 - u, 1, 1, 1, 0, a, 0), darken(col, 0.18), st.fin);
  }
}

// ── roofs ───────────────────────────────────────────────────────────────────
const pyramidCache = new Map<string, THREE.BufferGeometry>();
function pyramidG(hw: number, h: number): THREE.BufferGeometry {
  const key = `${hw.toFixed(3)}|${h.toFixed(3)}`;
  let g = pyramidCache.get(key);
  if (g) return g;
  const pos: number[] = [];
  const nor: number[] = [];
  const apex = new THREE.Vector3(0, h, 0);
  const c = [new THREE.Vector3(-hw, 0, -hw), new THREE.Vector3(hw, 0, -hw), new THREE.Vector3(hw, 0, hw), new THREE.Vector3(-hw, 0, hw)];
  const mid = new THREE.Vector3(0, h / 3, 0);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const cen = new THREE.Vector3().add(a).add(b).add(d).multiplyScalar(1 / 3);
    if (n.dot(cen.sub(mid)) < 0) {
      [b, d] = [d, b];
      n.negate();
    }
    for (const v of [a, b, d]) {
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
    }
  };
  for (let i = 0; i < 4; i++) tri(c[i], c[(i + 1) % 4], apex);
  // the underside
  pos.push(c[0].x, 0, c[0].z, c[1].x, 0, c[1].z, c[2].x, 0, c[2].z, c[0].x, 0, c[0].z, c[2].x, 0, c[2].z, c[3].x, 0, c[3].z);
  for (let i = 0; i < 6; i++) nor.push(0, -1, 0);
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  pyramidCache.set(key, g);
  return g;
}

function genRoof(br: Brush, p: BuildPiece): void {
  const T = TILE, th = THICK;
  const st = MATS[p.mat];
  const body = p.tint ?? st.roof;
  const trim = p.mat === 'brick' ? lighten(body, 0.5) : p.tint ? darken(p.tint, 0.4) : st.trim;
  const hw = T / 2 + 0.16, R = ROOF_RISE;
  br.b.add(pyramidG(hw, R * (hw / (T / 2)) * 0.97), M(0, 0, 0), body, st.roofFin);
  // fascia round the eaves, hips down the corners, a finial on top
  const e = 0.2;
  br.blk(-hw, 0, -hw, hw, e, -hw + 0.1, trim, st.fin);
  br.blk(-hw, 0, hw - 0.1, hw, e, hw, trim, st.fin);
  br.blk(-hw, 0, -hw, -hw + 0.1, e, hw, trim, st.fin);
  br.blk(hw - 0.1, 0, -hw, hw, e, hw, trim, st.fin);
  const ay = R * (hw / (T / 2)) * 0.97;
  for (const [x, z] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]]) br.rodBetween([x * 0.98, 0.04, z * 0.98], [0, ay, 0], 0.07, trim, st.fin, 6);
  br.ball(0, ay + 0.1, 0, 0.2, trim, st.fin);
  void th;
}

/** Draw one piece in its local frame (walls: along local x, centred on their edge; the rest: centred on the cell). */
export function genBuildPiece(br: Brush, p: BuildPiece, skirt = 0): void {
  switch (p.kind) {
    case 'wall': return genWall(br, p, skirt);
    case 'floor': return genFloor(br, p, skirt);
    case 'ramp': return genRamp(br, p, skirt);
    default: return genRoof(br, p);
  }
}

const _rot = new THREE.Matrix4();
/** Frame a piece is baked in: translate to its anchor, turn to its direction. */
export function setBase(baker: Baker, p: BuildPiece, extra?: { dy?: number; sc?: number }): void {
  const f = pieceFrame(p);
  let ry = f.rotY;
  if (p.kind === 'ramp') ry = (-p.dir * Math.PI) / 2;
  baker.base.makeTranslation(f.x, f.y + (extra?.dy ?? 0), f.z).multiply(_rot.makeRotationY(ry));
  if (extra?.sc && extra.sc !== 1) baker.base.multiply(_rot.makeScale(extra.sc, extra.sc, extra.sc));
}

/** A piece as its own little object (the ghost, and the build-in animation), in world space. */
export function buildPieceObject(p: BuildPiece): THREE.Group {
  const baker = new Baker();
  const br = new Brush(baker);
  setBase(baker, p);
  genBuildPiece(br, p, skirtFor(p));
  const g = bakedToGroup(baker.bake());
  g.userData.buildId = p.id;
  return g;
}

