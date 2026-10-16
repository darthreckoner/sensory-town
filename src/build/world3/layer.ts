// ── v3 build (W5): drawing the player's builds ─────────────────────────────────
// The world is cut into chunks (tuning.build3.chunk tiles square). Each chunk bakes all of its
// pieces into a few merged meshes (one per material, plus glass), so hundreds of pieces are a
// handful of draw calls and only the chunk that changed re-bakes (at most one per frame).
// A piece that was just placed keeps its own little object for its build-in animation (rise,
// squash and bounce), then folds into its chunk.
import * as THREE from 'three';
import type { BuildPiece } from '../../core/model';
import { Baker, Brush, bakedToGroup, disposeBaked } from '../bake';
import { ghostify } from '../mats';
import { buildSpace, TILE, STOREY, THICK, ROOF_RISE, pieceFrame, pieceTopAt } from '../../world/buildSpace';
import { tuning } from '../../tuning';
import { genBuildPiece, skirtFor } from './geo';

const C = tuning.build3.chunk;
const chunkKey = (p: Pick<BuildPiece, 'ix' | 'iz'>) => `${Math.floor(p.ix / C)},${Math.floor(p.iz / C)}`;

const _rot = new THREE.Matrix4();
/** The matrix that carries a piece's local frame into the world. */
export function frameMatrix(p: BuildPiece, out = new THREE.Matrix4()): THREE.Matrix4 {
  const f = pieceFrame(p);
  const ry = p.kind === 'ramp' ? (-p.dir * Math.PI) / 2 : f.rotY;
  return out.makeTranslation(f.x, f.y, f.z).multiply(_rot.makeRotationY(ry));
}

interface Chunk {
  key: string;
  group: THREE.Group;
  ids: Set<string>;
  dirty: boolean;
}

interface Live {
  piece: BuildPiece;
  anchor: THREE.Group;
  t: number;
  dur: number;
  kind: 'in' | 'pop';
}

const easeOutBack = (k: number) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

export class BuildLayer {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Chunk>();
  private live = new Map<string, Live>();
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private lastBake = 0;
  /** a piece finished its build-in (juice may add dust) */
  onSettled: ((p: BuildPiece) => void) | null = null;

  constructor() {
    this.group.name = 'builds';
  }

  /** (Re)build everything from the indexed pieces, no animation. */
  load(): void {
    for (const ch of this.chunks.values()) this.dropChunk(ch);
    this.chunks.clear();
    for (const l of this.live.values()) this.killLive(l);
    this.live.clear();
    for (const p of buildSpace.pieces.values()) this.chunkFor(p).ids.add(p.id);
    for (const ch of this.chunks.values()) this.bake(ch);
  }

  private chunkFor(p: BuildPiece): Chunk {
    const key = chunkKey(p);
    let ch = this.chunks.get(key);
    if (!ch) {
      ch = { key, group: new THREE.Group(), ids: new Set(), dirty: false };
      this.group.add(ch.group);
      this.chunks.set(key, ch);
    }
    return ch;
  }

  private dropChunk(ch: Chunk): void {
    disposeBaked(ch.group);
    ch.group.removeFromParent();
  }

  private bake(ch: Chunk): void {
    ch.dirty = false;
    disposeBaked(ch.group);
    ch.group.clear();
    const baker = new Baker();
    baker.fine = false;
    const br = new Brush(baker);
    let n = 0;
    for (const id of ch.ids) {
      if (this.live.has(id)) continue;           // still animating on its own
      const p = buildSpace.pieces.get(id);
      if (!p) continue;
      frameMatrix(p, baker.base);
      genBuildPiece(br, p, skirtFor(p));
      n++;
    }
    baker.base.identity();
    if (n) bakedToGroup(baker.bake(), ch.group);
  }

  private makeAnchor(p: BuildPiece): THREE.Group {
    const baker = new Baker();
    baker.fine = false;
    baker.uvBase.copy(frameMatrix(p));            // patterns line up with the baked chunk
    genBuildPiece(new Brush(baker), p, skirtFor(p));
    const g = bakedToGroup(baker.bake());
    const f = pieceFrame(p);
    const anchor = new THREE.Group();
    anchor.add(g);
    anchor.position.set(f.x, f.y, f.z);
    anchor.rotation.y = p.kind === 'ramp' ? (-p.dir * Math.PI) / 2 : f.rotY;
    return anchor;
  }

  /** A piece was added to the data: show it building in (`delay` seconds from now, so a whole stamp can cascade). */
  add(p: BuildPiece, animate = true, delay = 0): void {
    const ch = this.chunkFor(p);
    ch.ids.add(p.id);
    if (!animate) {
      ch.dirty = true;
      return;
    }
    const anchor = this.makeAnchor(p);
    this.group.add(anchor);
    const dur = tuning.build3.animSeconds;
    this.live.set(p.id, { piece: p, anchor, t: -delay, dur, kind: 'in' });
    this.applyAnim(this.live.get(p.id)!);
  }

  /** The piece was removed from the data. */
  remove(id: string, p?: BuildPiece): void {
    const l = this.live.get(id);
    if (l) {
      this.killLive(l);
      this.live.delete(id);
    }
    for (const ch of this.chunks.values()) {
      if (ch.ids.delete(id)) ch.dirty = true;
    }
    void p;
  }

  /** The piece changed (cut panels, tint...): re-bake its chunk, with a little pop. */
  update(p: BuildPiece): void {
    const ch = this.chunkFor(p);
    ch.ids.add(p.id);
    ch.dirty = true;
  }

  private killLive(l: Live): void {
    disposeBaked(l.anchor);
    l.anchor.removeFromParent();
  }

  private applyAnim(l: Live): void {
    l.anchor.visible = l.t >= 0;
    const k = Math.max(0, Math.min(1, l.t / l.dur));
    const e = easeOutBack(k);
    const sy = Math.max(0.05, e);
    const sxz = 1 + (1 - Math.min(1, e)) * 0.0 + Math.sin(k * Math.PI) * 0.035;
    l.anchor.scale.set(sxz, sy, sxz);
    const f = pieceFrame(l.piece);
    l.anchor.position.y = f.y - (1 - Math.min(1, k * 1.6)) * 0.5;
  }

  /** Per frame: advance build-ins, fold finished pieces into their chunk, re-bake at most one dirty chunk. */
  tick(dt: number): void {
    for (const [id, l] of this.live) {
      l.t += dt;
      if (l.t >= l.dur + tuning.build3.foldSeconds - tuning.build3.animSeconds) {
        // settled: fold into the chunk (the chunk bake picks it up now that it is no longer live)
        this.killLive(l);
        this.live.delete(id);
        const ch = this.chunks.get(chunkKey(l.piece));
        if (ch) ch.dirty = true;
        this.onSettled?.(l.piece);
      } else this.applyAnim(l);
    }
    const now = performance.now();
    if (now - this.lastBake < tuning.build3.rebakeEveryMs) return;
    for (const ch of this.chunks.values()) {
      if (!ch.dirty) continue;
      if (ch.ids.size === 0) {
        this.dropChunk(ch);
        this.chunks.delete(ch.key);
      } else this.bake(ch);
      this.lastBake = now;
      break;
    }
  }

  /** Force every pending bake and animation to finish (tests, sweeps). */
  settle(): void {
    for (const [id, l] of [...this.live]) {
      this.killLive(l);
      this.live.delete(id);
      const ch = this.chunks.get(chunkKey(l.piece));
      if (ch) ch.dirty = true;
    }
    for (const ch of [...this.chunks.values()]) {
      if (ch.ids.size === 0) {
        this.dropChunk(ch);
        this.chunks.delete(ch.key);
      } else if (ch.dirty) this.bake(ch);
    }
  }

  // ── the ghost ──
  /** Show a see-through preview piece (green-white when it can be placed, red when not). */
  setGhost(p: BuildPiece | null, ok: boolean): void {
    if (!p) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const key = `${p.kind}|${p.mat}|${p.ix}|${p.iy}|${p.iz}|${p.dir}|${p.edit ?? 0}|${p.tint ?? ''}|${ok}`;
    if (key !== this.ghostKey || !this.ghost) {
      if (this.ghost) {
        disposeBaked(this.ghost);
        this.ghost.removeFromParent();
      }
      this.ghost = this.makeAnchor(p);
      ghostify(this.ghost, ok, '#8fe6ff');   // a cool blue-white when it can go, red when not
      this.ghost.renderOrder = 5;
      this.group.add(this.ghost);
      this.ghostKey = key;
    }
    this.ghost.visible = true;
  }

  // ── picking: the piece a ray hits first ──
  /** Ray (world) vs the built pieces within maxDist: the nearest hit piece, or null. */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist = 60): { piece: BuildPiece; dist: number } | null {
    let best: { piece: BuildPiece; dist: number } | null = null;
    const reach2 = (maxDist + TILE * 2) * (maxDist + TILE * 2);
    for (const p of buildSpace.pieces.values()) {
      const f = pieceFrame(p);
      const ddx = f.x - ox, ddz = f.z - oz;
      if (ddx * ddx + ddz * ddz > reach2) continue;
      const t = rayPiece(p, f, ox, oy, oz, dx, dy, dz, maxDist);
      if (t !== null && (!best || t < best.dist)) best = { piece: p, dist: t };
    }
    return best;
  }

  stats(): { meshes: number; chunks: number; live: number; pieces: number } {
    let meshes = 0;
    for (const ch of this.chunks.values()) meshes += ch.group.children.length;
    return { meshes, chunks: this.chunks.size, live: this.live.size, pieces: buildSpace.size };
  }

  dispose(): void {
    for (const ch of this.chunks.values()) this.dropChunk(ch);
    this.chunks.clear();
    for (const l of this.live.values()) this.killLive(l);
    this.live.clear();
    if (this.ghost) {
      disposeBaked(this.ghost);
      this.ghost.removeFromParent();
      this.ghost = null;
    }
    this.ghostKey = '';
  }
}

// ── ray vs piece ────────────────────────────────────────────────────────────
function slab(o: number, d: number, lo: number, hi: number, t: [number, number]): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let a = (lo - o) / d, b = (hi - o) / d;
  if (a > b) [a, b] = [b, a];
  t[0] = Math.max(t[0], a);
  t[1] = Math.min(t[1], b);
  return t[0] <= t[1];
}

function rayPiece(p: BuildPiece, f: { x: number; y: number; z: number; rotY: number }, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number | null {
  // the piece's bounding box
  let x0: number, x1: number, z0: number, z1: number, y0 = f.y, y1: number;
  if (p.kind === 'wall') {
    const along = f.rotY === 0;
    const hl = TILE / 2, ht = THICK / 2 + 0.1;
    x0 = f.x - (along ? hl : ht);
    x1 = f.x + (along ? hl : ht);
    z0 = f.z - (along ? ht : hl);
    z1 = f.z + (along ? ht : hl);
    y1 = f.y + STOREY;
  } else {
    x0 = p.ix * TILE;
    x1 = x0 + TILE;
    z0 = p.iz * TILE;
    z1 = z0 + TILE;
    y1 = f.y + (p.kind === 'floor' ? THICK : p.kind === 'ramp' ? STOREY : ROOF_RISE);
    if (p.kind === 'floor') y0 -= 0.2;
  }
  const t: [number, number] = [0, maxDist];
  if (!slab(ox, dx, x0, x1, t) || !slab(oy, dy, y0, y1, t) || !slab(oz, dz, z0, z1, t)) return null;
  if (p.kind === 'wall' || p.kind === 'floor') return t[0];
  // sloped pieces: march along the ray inside the box until it touches the surface
  for (let s = t[0]; s <= t[1]; s += 0.12) {
    const x = ox + dx * s, y = oy + dy * s, z = oz + dz * s;
    const top = pieceTopAt(p, x, z);
    if (top > -Infinity && y <= top + 0.15 && y >= top - 0.7) return s;
  }
  return null;
}
