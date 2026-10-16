// ── v3 build (W5): BUILD MODE in the world (on foot, anywhere) ─────────────────
// A 🔨 button (or B) turns it on. A see-through ghost snaps to the grid cell in front of the
// player along the camera's look direction, at the storey the player stands on (Fortnite logic):
//   wall   on the nearest cell edge in front      floor   the cell in front, level with your feet
//   ramp   the cell in front, rising away         roof    a pyramid on top of the storey
// Tap / click (or the big Place button) places; hold and sweep to place a run. Edit mode cuts
// windows, doors and arches out of a wall (3x3 panels) or holes in a floor; Delete removes;
// Decor mode puts furniture anywhere; ↶ undoes. Pieces live in store.data.town.builds / .decor,
// are indexed by world/buildSpace (walk up ramps, stand on floors, walls block), and are drawn by
// BuildLayer / DecorLayer (merged chunks). The Drive scene only owns the toggle button and update().
import * as THREE from 'three';
import type { BuildKind, BuildMat, BuildPiece, WorldDecor } from '../../core/model';
import { uid } from '../../core/model';
import { store } from '../../core/store';
import { bus } from '../../core/events';
import { tuning } from '../../tuning';
import { el, toast, bindTap } from '../../ui/ui';
import { groundHeight } from '../../world/heightfield';
import { WATER_Y } from '../../world/townLayout';
import { anchorY, buildSpace, isBuildCollider, pieceFrame, surfaceBelow, TILE, STOREY, THICK } from '../../world/buildSpace';
import type { ColliderGrid } from '../../drive/physics';
import { ghostify } from '../mats';
import { pieceDef, type PieceDef } from '../catalog';
import { disposeBaked } from '../bake';
import { BuildLayer } from './layer';
import { MATS } from './geo';
import { DecorLayer, DECOR_COLORS, decorCatalog, decorObject, decorRadius } from './decor';

const B = tuning.build3;

export interface BuildHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  /** where the build bar and panels go */
  hud: HTMLElement;
  foot(): { x: number; y: number; z: number; grounded: boolean };
  onFoot(): boolean;
  /** try to hop out of the car; true when the player is on foot afterwards */
  getOut(): boolean;
}

type Tool = 'build' | 'edit' | 'delete' | 'decor';
interface Action { undo(): void }
interface Target { piece: BuildPiece; ok: boolean; why?: string }

const KIND_UI: { kind: BuildKind; icon: string; label: string; key: string }[] = [
  { kind: 'wall', icon: '🧱', label: 'Wall', key: '1' },
  { kind: 'floor', icon: '⬜', label: 'Floor', key: '2' },
  { kind: 'ramp', icon: '📐', label: 'Ramp', key: '3' },
  { kind: 'roof', icon: '🛖', label: 'Roof', key: '4' },
];
const MAT_ORDER: BuildMat[] = ['wood', 'brick', 'metal'];

const PRESETS: { id: string; label: string; icon: string; wall: number[]; floor?: number[] }[] = [
  { id: 'window', label: 'Window', icon: '🪟', wall: [4], floor: [4] },
  { id: 'door', label: 'Door', icon: '🚪', wall: [4, 7], floor: [4, 7] },
  { id: 'arch', label: 'Arch', icon: '⛩️', wall: [1, 4, 7] },
  { id: 'garage', label: 'Garage', icon: '🚗', wall: [3, 4, 5, 6, 7, 8] },
  { id: 'clear', label: 'Fill in', icon: '🧱', wall: [] },
];

const bit = (r: number, c: number) => 1 << (r * 3 + c);
const maskOf = (cells: number[]) => cells.reduce((m, i) => m | (1 << i), 0);

export class BuildMode {
  active = false;
  kind: BuildKind = 'wall';
  mat: BuildMat = 'wood';
  tool: Tool = 'build';
  readonly layer = new BuildLayer();
  readonly decor = new DecorLayer();

  private grid: ColliderGrid | null = null;
  private undoStack: Action[] = [];
  private fwd = new THREE.Vector2(0, -1);
  private v3 = new THREE.Vector3();
  private target: Target | null = null;
  private lastKey = '';
  private lastPlaceAt = 0;
  private placedKey = '';
  private blockedToast = 0;

  // pointer
  private ptr: { id: number; x: number; y: number; t0: number; moved: boolean; held: boolean } | null = null;
  private placeHeld = false;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  // decor
  private decorDef: PieceDef | null = null;
  private decorRot = 0;
  private decorColor = DECOR_COLORS[0];
  private decorGhost: THREE.Group | null = null;
  private decorGhostKey = '';
  private selDecor: WorldDecor | null = null;
  private ring: THREE.Mesh;

  // edit
  private selPiece: BuildPiece | null = null;

  // ui
  private root: HTMLElement | null = null;
  private bar!: HTMLElement;
  private kindBtns = new Map<BuildKind, HTMLElement>();
  private matBtns = new Map<BuildMat, HTMLElement>();
  private toolBtns = new Map<Tool, HTMLElement>();
  private info!: HTMLElement;
  private hint!: HTMLElement;
  private editPanel!: HTMLElement;
  private editGrid!: HTMLElement;
  private editTitle!: HTMLElement;
  private editCells: HTMLElement[] = [];
  private decorPanel!: HTMLElement;
  private decorList!: HTMLElement;
  private decorSel!: HTMLElement;
  private hintT = 0;
  private placeBtn!: HTMLElement;

  constructor(private host: BuildHost) {
    host.scene.add(this.layer.group, this.decor.group);
    this.layer.onSettled = (p) => {
      const f = pieceFrame(p);
      bus.emit('buildSettled', { pos: { x: f.x, y: f.y + 0.4, z: f.z }, kind: p.kind, mat: p.mat });
    };
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    host.scene.add(this.ring);
    this.buildUi();
    window.addEventListener('keydown', this.onKey);
  }

  // ───────────────────────────────────────────────────────────────────────
  // scene lifecycle (called by the Drive scene)
  // ───────────────────────────────────────────────────────────────────────
  /** The scene is (re)entered: load the saved builds + decor and join the collision grid. */
  enter(grid: ColliderGrid): void {
    this.grid = grid;
    buildSpace.load(store.data.town.builds ?? []);
    buildSpace.attach(grid);
    this.layer.load();
    this.decor.load(store.data.town.decor ?? []);
    this.undoStack = [];
  }

  exit(): void {
    this.setActive(false);
    buildSpace.attach(null);
    buildSpace.clear();
    this.layer.dispose();
    this.decor.dispose();
    this.grid = null;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.exit();
    this.root?.remove();
    this.layer.group.removeFromParent();
    this.decor.group.removeFromParent();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.ring.removeFromParent();
  }

  /** 🔨: switch build mode (hops out of the car first when needed). */
  toggle(on = !this.active): void {
    if (on === this.active) return;
    if (on && !this.host.onFoot() && !this.host.getOut()) return;
    this.setActive(on);
  }

  private setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.root?.classList.toggle('on', on);
    for (const [t, ev, fn, o] of this.listeners) t.removeEventListener(ev, fn, o);
    this.listeners = [];
    if (on) {
      const add = (t: EventTarget, ev: string, fn: EventListener, o?: AddEventListenerOptions) => {
        t.addEventListener(ev, fn, o);
        this.listeners.push([t, ev, fn, o]);
      };
      add(this.host.canvas, 'pointerdown', this.onDown as EventListener);
      add(window, 'pointermove', this.onMove as EventListener);
      add(window, 'pointerup', this.onUp as EventListener);
      add(window, 'pointercancel', this.onUp as EventListener);
      this.setTool('build');
      this.showHint(`🔨 Build: tap to place a ${this.mat} ${this.kind}. Hold and sweep to build a run.`, 7);
    } else {
      this.ptr = null;
      this.placeHeld = false;
      this.layer.setGhost(null, true);
      this.clearDecorGhost();
      this.closePanels();
      this.selDecor = null;
      this.ring.visible = false;
    }
    bus.emit('buildMode', { on });
    this.refreshUi();
  }

  // ───────────────────────────────────────────────────────────────────────
  // per frame
  // ───────────────────────────────────────────────────────────────────────
  update(dt: number, _t: number): void {
    this.layer.tick(dt);
    this.decor.tick();
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hint.classList.remove('show');
    }
    if (!this.active) return;
    if (!this.host.onFoot()) {
      this.setActive(false);
      return;
    }
    // the look direction (flat)
    this.host.camera.getWorldDirection(this.v3);
    const l = Math.hypot(this.v3.x, this.v3.z);
    if (l > 0.05) this.fwd.set(this.v3.x / l, this.v3.z / l);

    if (this.ptr && !this.ptr.held && !this.ptr.moved && performance.now() - this.ptr.t0 > B.holdMs) {
      this.ptr.held = true;
      this.holdAct();
    }
    if (this.tool === 'build') {
      this.target = this.computeTarget();
      this.layer.setGhost(this.target.piece, this.target.ok);
      const key = this.target.piece.kind + this.target.piece.ix + ',' + this.target.piece.iy + ',' + this.target.piece.iz + ',' + this.target.piece.dir;
      if (key !== this.lastKey) {
        this.lastKey = key;
        if (this.placeHeld || this.ptr?.held) this.tryRepeat();
      }
      this.updateInfo();
    } else {
      this.layer.setGhost(null, true);
      this.target = null;
    }
    if (this.tool === 'decor') this.updateDecorGhost();
    else this.clearDecorGhost();
    this.updateRing();
  }

  // ───────────────────────────────────────────────────────────────────────
  // the ghost: where the next piece would go
  // ───────────────────────────────────────────────────────────────────────
  private computeTarget(): Target {
    const f = this.host.foot();
    const reach = B.reach * TILE;
    const rx = f.x + this.fwd.x * reach, rz = f.z + this.fwd.y * reach;
    const ix = Math.floor(rx / TILE), iz = Math.floor(rz / TILE);
    // the storey you stand on, counted from where the ground storey of that cell column starts
    const iy = Math.max(0, Math.floor((f.y - anchorY(ix, iz) + 0.4) / STOREY));
    const axis: 0 | 1 | 2 | 3 = Math.abs(this.fwd.x) > Math.abs(this.fwd.y) ? (this.fwd.x > 0 ? 1 : 3) : this.fwd.y < 0 ? 0 : 2;
    let dir: 0 | 1 | 2 | 3 = 0;
    let piyy = iy;
    if (this.kind === 'wall') {
      const u = rx / TILE - ix, v = rz / TILE - iz;
      // nearest edge of the cell; edges facing the way you look win ties
      const cand: [number, 0 | 1 | 2 | 3, number, number][] = [
        [v, 0, 0, -1], [1 - u, 1, 1, 0], [1 - v, 2, 0, 1], [u, 3, -1, 0],
      ];
      let best = Infinity;
      for (const [d, k, nx, nz] of cand) {
        const s = d - 0.1 * (nx * this.fwd.x + nz * this.fwd.y);
        if (s < best) {
          best = s;
          dir = k;
        }
      }
    } else if (this.kind === 'ramp') dir = axis;
    else if (this.kind === 'floor') dir = (axis % 2) as 0 | 1;
    // a roof goes on top of the walls of your storey; with no wall under it, it rests on the floor / ground instead of floating
    if (this.kind === 'roof') piyy = buildSpace.roofHasSupport(ix, iy + 1, iz) ? iy + 1 : iy;
    const piece: BuildPiece = { id: 'ghost', kind: this.kind, mat: this.mat, ix, iy: piyy, iz, dir, ownerId: store.profile.id };
    const why = this.blockReason(piece);
    return { piece, ok: !why, why: why ?? undefined };
  }

  /** Why a piece can't go here (null when it can): taken, underwater, inside a building, over the cap. */
  blockReason(p: BuildPiece): string | null {
    if (!buildSpace.free(p)) return 'taken';
    if (buildSpace.size >= B.maxPieces) return 'cap';
    const f = pieceFrame(p);
    const bed = groundHeight(f.x, f.z, false, true);
    if (bed < WATER_Y - STOREY) return 'water';
    return this.inStatic(p) ? 'building' : null;
  }

  /** Does the piece's footprint overlap a house / shop / wall of the static world? */
  private inStatic(p: BuildPiece): boolean {
    if (!this.grid) return false;
    const f = pieceFrame(p);
    let hx = TILE / 2, hz = TILE / 2, cx = f.x, cz = f.z;
    if (p.kind === 'wall') {
      const along = f.rotY === 0;
      hx = along ? TILE / 2 : THICK / 2;
      hz = along ? THICK / 2 : TILE / 2;
    } else {
      cx = (p.ix + 0.5) * TILE;
      cz = (p.iz + 0.5) * TILE;
    }
    const y0 = f.y, y1 = f.y + (p.kind === 'floor' ? THICK : STOREY);
    const cols = this.grid.near(cx, cz, Math.max(hx, hz) + 2);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (isBuildCollider(c) || c.only === 'foot') continue;
      if (c.h !== undefined && c.h < y0 + 0.3) continue;
      if (c.y0 !== undefined && c.y0 > y1 - 0.3) continue;
      if (c.kind === 'box') {
        if (Math.abs(c.x - cx) < c.hw + hx - 0.12 && Math.abs(c.z - cz) < c.hd + hz - 0.12) return true;
      } else if (c.r >= 1.2) {
        const qx = Math.max(Math.abs(c.x - cx) - hx, 0), qz = Math.max(Math.abs(c.z - cz) - hz, 0);
        if (qx * qx + qz * qz < c.r * c.r) return true;
      }
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────────
  // actions
  // ───────────────────────────────────────────────────────────────────────
  private push(a: Action): void {
    this.undoStack.push(a);
    if (this.undoStack.length > B.undoMax) this.undoStack.shift();
    this.refreshUi();
  }

  undo(): void {
    const a = this.undoStack.pop();
    if (!a) {
      toast('Nothing to undo');
      return;
    }
    a.undo();
    this.refreshUi();
  }

  private addPiece(piece: BuildPiece, animate = true): void {
    store.update((d) => {
      (d.town.builds ??= []).push(piece);
    });
    buildSpace.add(piece);
    this.layer.add(piece, animate);
    const f = pieceFrame(piece);
    bus.emit('buildPlaced', { pos: { x: f.x, y: f.y + 0.6, z: f.z }, kind: piece.kind, mat: piece.mat });
  }

  private removePiece(id: string, fx = true): BuildPiece | undefined {
    const p = buildSpace.remove(id);
    if (!p) return undefined;
    store.update((d) => {
      d.town.builds = (d.town.builds ?? []).filter((q) => q.id !== id);
    });
    this.layer.remove(id, p);
    if (fx) {
      const f = pieceFrame(p);
      bus.emit('buildDeleted', { pos: { x: f.x, y: f.y + 1, z: f.z }, kind: p.kind, mat: p.mat });
    }
    return p;
  }

  /** Place the ghost. Returns true when a piece was placed. */
  place(): boolean {
    const t = this.target;
    if (!t) return false;
    if (!t.ok) {
      const f = pieceFrame(t.piece);
      bus.emit('buildBlocked', { pos: { x: f.x, y: f.y + 0.8, z: f.z } });
      const now = performance.now();
      if (now - this.blockedToast > 1500) {
        this.blockedToast = now;
        toast(t.why === 'taken' ? 'Something is already built there' : t.why === 'water' ? "That's too deep to build in" : t.why === 'cap' ? "That's a lot of building! Remove some pieces first" : "Can't build inside a building");
      }
      return false;
    }
    const piece: BuildPiece = { ...t.piece, id: uid('b_'), ownerId: store.profile.id };
    this.addPiece(piece);
    this.placedKey = this.lastKey;
    this.push({ undo: () => void this.removePiece(piece.id) });
    return true;
  }

  private tryRepeat(): void {
    const now = performance.now();
    if (now - this.lastPlaceAt < B.placeEveryMs || this.lastKey === this.placedKey) return;
    this.lastPlaceAt = now;
    this.place();
  }

  private holdAct(): void {
    if (this.tool === 'build') {
      this.lastPlaceAt = performance.now();
      this.place();
    }
  }

  // ── tapping the world (edit / delete / decor) ──
  private rayAt(clientX: number, clientY: number): { o: THREE.Vector3; d: THREE.Vector3 } {
    const r = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    this.host.camera.updateMatrixWorld();
    rc.setFromCamera(ndc, this.host.camera);
    return { o: rc.ray.origin.clone(), d: rc.ray.direction.clone() };
  }

  private tapWorld(clientX: number, clientY: number): void {
    if (this.tool === 'build') {
      this.place();
      return;
    }
    const { o, d } = this.rayAt(clientX, clientY);
    if (this.tool === 'delete') {
      const dec = this.decor.pick(o.x, o.y, o.z, d.x, d.y, d.z, 40);
      const hit = this.layer.pick(o.x, o.y, o.z, d.x, d.y, d.z, 60);
      if (dec && (!hit || dec.dist < hit.dist)) this.deleteDecor(dec.item);
      else if (hit) this.deletePiece(hit.piece);
      return;
    }
    if (this.tool === 'edit') {
      const hit = this.layer.pick(o.x, o.y, o.z, d.x, d.y, d.z, 60);
      if (!hit) {
        this.closePanels();
        return;
      }
      if (hit.piece.kind === 'wall' || hit.piece.kind === 'floor') this.openEdit(hit.piece);
      else toast('Walls and floors can be cut into windows, doors and holes');
      return;
    }
    // decor: tap an item to select it, tap anywhere else to put the next one down
    const dec = this.decor.pick(o.x, o.y, o.z, d.x, d.y, d.z, 40);
    if (dec) {
      this.selectDecor(dec.item);
      return;
    }
    if (this.selDecor) {
      this.selectDecor(null);
      return;
    }
    this.placeDecor();
  }

  private deletePiece(p: BuildPiece): void {
    const old: BuildPiece = { ...p };
    const mine = this.removePiece(p.id);
    if (!mine) return;
    this.push({
      undo: () => {
        this.addPiece(old, true);
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // edit: the 3x3 panel grid
  // ───────────────────────────────────────────────────────────────────────
  private openEdit(p: BuildPiece): void {
    this.selPiece = p;
    this.editPanel.classList.add('show');
    this.editTitle.textContent = p.kind === 'wall' ? `Edit ${p.mat} wall` : `Edit ${p.mat} floor`;
    this.renderEdit();
    this.ring.visible = false;
  }

  private flipFor(p: BuildPiece): boolean {
    if (p.kind !== 'wall') return false;
    const f = pieceFrame(p), cam = this.host.camera.position;
    return p.dir === 0 || p.dir === 2 ? cam.z < f.z : cam.x > f.x;
  }

  private renderEdit(): void {
    const p = this.selPiece;
    if (!p) return;
    const mask = p.edit ?? 0;
    const flip = this.flipFor(p);
    this.editCells.forEach((cell, i) => {
      const r = Math.floor(i / 3), c = i % 3;
      const cc = flip ? 2 - c : c;
      cell.dataset.r = String(r);
      cell.dataset.c = String(cc);
      const cut = !!(mask & bit(r, cc));
      cell.classList.toggle('cut', cut);
      cell.textContent = cut ? '' : p.kind === 'wall' ? '▦' : '▩';
    });
  }

  private setEdit(p: BuildPiece, mask: number): void {
    const before = p.edit ?? 0;
    if (before === mask) return;
    p.edit = mask || undefined;
    store.update(() => undefined);
    buildSpace.update(p);
    this.layer.update(p);
    const f = pieceFrame(p);
    bus.emit('buildEdited', { pos: { x: f.x, y: f.y + 1.6, z: f.z }, mat: p.mat });
    this.push({
      undo: () => {
        p.edit = before || undefined;
        store.update(() => undefined);
        buildSpace.update(p);
        this.layer.update(p);
        if (this.selPiece === p) this.renderEdit();
      },
    });
    this.renderEdit();
  }

  private toggleCell(r: number, c: number): void {
    const p = this.selPiece;
    if (!p) return;
    this.setEdit(p, (p.edit ?? 0) ^ bit(r, c));
  }

  private applyPreset(id: string): void {
    const p = this.selPiece;
    const pr = PRESETS.find((x) => x.id === id);
    if (!p || !pr) return;
    const cells = p.kind === 'wall' ? pr.wall : pr.floor ?? (pr.id === 'clear' ? [] : [4]);
    this.setEdit(p, maskOf(cells));
  }

  // ───────────────────────────────────────────────────────────────────────
  // decor
  // ───────────────────────────────────────────────────────────────────────
  private decorPos(): { x: number; y: number; z: number } {
    const f = this.host.foot();
    let x = f.x + this.fwd.x * B.decorReach, z = f.z + this.fwd.y * B.decorReach;
    x = Math.round(x * 4) / 4;
    z = Math.round(z * 4) / 4;
    const g = groundHeight(x, z, true);
    const s = surfaceBelow(x, z, f.y + 0.3, 1.4);
    return { x, y: Math.max(g, s), z };
  }

  private decorBlocked(x: number, y: number, z: number): boolean {
    if (this.decor.items.size >= B.decorMax) return true;
    if (y < WATER_Y - 0.3) return true;
    if (!this.grid) return false;
    const cols = this.grid.near(x, z, 1.2);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (isBuildCollider(c) || c.only === 'foot' || c.kind !== 'box') continue;
      if (c.h !== undefined && c.h < y + 0.2) continue;
      if (Math.abs(c.x - x) < c.hw + 0.3 && Math.abs(c.z - z) < c.hd + 0.3) return true;
    }
    return false;
  }

  private updateDecorGhost(): void {
    if (!this.decorDef || this.selDecor) {
      this.clearDecorGhost();
      return;
    }
    const pos = this.decorPos();
    const ok = !this.decorBlocked(pos.x, pos.y, pos.z);
    const key = `${this.decorDef.type}|${pos.x}|${pos.y.toFixed(2)}|${pos.z}|${this.decorRot}|${this.decorColor}|${ok}`;
    if (key === this.decorGhostKey && this.decorGhost) return;
    this.clearDecorGhost();
    const item: WorldDecor = { id: 'ghost', type: this.decorDef.type, x: pos.x, y: pos.y, z: pos.z, rot: this.decorRot, color: this.decorColor, ownerId: store.profile.id };
    const g = decorObject(item);
    if (!g) return;
    ghostify(g, ok);
    this.host.scene.add(g);
    this.decorGhost = g;
    this.decorGhostKey = key;
    this.decorOk = ok;
  }
  private decorOk = true;

  private clearDecorGhost(): void {
    if (!this.decorGhost) return;
    disposeBaked(this.decorGhost);
    this.decorGhost.removeFromParent();
    this.decorGhost = null;
    this.decorGhostKey = '';
  }

  private placeDecor(): void {
    if (!this.decorDef) {
      toast('Pick something from the list first');
      return;
    }
    const pos = this.decorPos();
    if (this.decorBlocked(pos.x, pos.y, pos.z)) {
      bus.emit('buildBlocked', { pos: { x: pos.x, y: pos.y + 0.6, z: pos.z } });
      toast("Can't put that there");
      return;
    }
    const item: WorldDecor = { id: uid('d3_'), type: this.decorDef.type, x: pos.x, y: pos.y, z: pos.z, rot: this.decorRot, color: this.decorColor, ownerId: store.profile.id };
    store.update((d) => {
      (d.town.decor ??= []).push(item);
    });
    this.decor.add(item);
    this.clearDecorGhost();
    bus.emit('decorPlaced', { pos: { x: pos.x, y: pos.y + 0.8, z: pos.z }, type: item.type });
    this.push({ undo: () => void this.removeDecorItem(item.id, true) });
  }

  private removeDecorItem(id: string, fx: boolean): WorldDecor | undefined {
    const d = this.decor.items.get(id);
    if (!d) return undefined;
    this.decor.remove(id);
    store.update((s) => {
      s.town.decor = (s.town.decor ?? []).filter((q) => q.id !== id);
    });
    if (this.selDecor?.id === id) this.selectDecor(null);
    if (fx) bus.emit('decorDeleted', { pos: { x: d.x, y: d.y + 0.8, z: d.z }, type: d.type });
    return d;
  }

  private deleteDecor(d: WorldDecor): void {
    const copy = { ...d };
    if (!this.removeDecorItem(d.id, true)) return;
    this.push({
      undo: () => {
        store.update((s) => {
          (s.town.decor ??= []).push(copy);
        });
        this.decor.add(copy);
        bus.emit('decorPlaced', { pos: { x: copy.x, y: copy.y + 0.8, z: copy.z }, type: copy.type });
      },
    });
  }

  private selectDecor(d: WorldDecor | null): void {
    this.selDecor = d;
    this.decorSel.classList.toggle('show', !!d);
    if (d) {
      const def = pieceDef(d.type as never);
      if (def) this.decorDef = def;
    }
    this.updateRing();
  }

  private editSelected(change: (d: WorldDecor) => void): void {
    const d = this.selDecor;
    if (!d) return;
    const before = { rot: d.rot, color: d.color, x: d.x, z: d.z };
    change(d);
    store.update(() => undefined);
    this.decor.update(d, before);
    this.push({
      undo: () => {
        const cur = { x: d.x, z: d.z };
        d.rot = before.rot;
        d.color = before.color;
        store.update(() => undefined);
        this.decor.update(d, cur);
      },
    });
  }

  private rotateDecor(): void {
    if (this.selDecor) this.editSelected((d) => (d.rot += Math.PI / 4));
    else this.decorRot += Math.PI / 4;
    bus.emit('uiTap', { kind: 'soft' });
  }

  private recolorDecor(c: string): void {
    this.decorColor = c;
    if (this.selDecor) this.editSelected((d) => (d.color = c));
    this.refreshUi();
  }

  private updateRing(): void {
    const d = this.selDecor;
    if (!d || this.tool !== 'decor' || !this.active) {
      this.ring.visible = false;
      return;
    }
    const def = pieceDef(d.type as never);
    const r = def ? decorRadius(def) : 1;
    this.ring.visible = true;
    this.ring.position.set(d.x, d.y + 0.06, d.z);
    this.ring.scale.setScalar(r);
  }

  // ───────────────────────────────────────────────────────────────────────
  // pointer + keys
  // ───────────────────────────────────────────────────────────────────────
  private onDown = (e: PointerEvent): void => {
    if (e.button > 0 && e.pointerType === 'mouse') return;
    if (this.ptr) return;
    this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false, held: false };
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    if (!p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.moved = true;
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    this.ptr = null;
    if (!p.held && !p.moved && e.type === 'pointerup' && performance.now() - p.t0 < 500) this.tapWorld(e.clientX, e.clientY);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey) {
      this.toggle();
      e.preventDefault();
      return;
    }
    if (!this.active) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      this.undo();
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'Escape': this.setActive(false); break;
      case 'Digit1': this.setKind('wall'); break;
      case 'Digit2': this.setKind('floor'); break;
      case 'Digit3': this.setKind('ramp'); break;
      case 'Digit4': this.setKind('roof'); break;
      case 'KeyT': this.setMat(MAT_ORDER[(MAT_ORDER.indexOf(this.mat) + 1) % 3]); break;
      case 'KeyG': this.setTool(this.tool === 'edit' ? 'build' : 'edit'); break;
      case 'KeyX': this.setTool(this.tool === 'delete' ? 'build' : 'delete'); break;
      case 'KeyV': this.setTool(this.tool === 'decor' ? 'build' : 'decor'); break;
      case 'KeyU': this.undo(); break;
      case 'KeyR': if (this.tool === 'decor') this.rotateDecor(); break;
      case 'Enter': if (this.tool === 'build') this.place(); break;
      default: return;
    }
    e.preventDefault();
  };

  // ───────────────────────────────────────────────────────────────────────
  // state setters
  // ───────────────────────────────────────────────────────────────────────
  setKind(k: BuildKind): void {
    this.kind = k;
    if (this.tool !== 'build') this.setTool('build');
    this.refreshUi();
    bus.emit('uiTap', { kind: 'tab' });
  }

  setMat(m: BuildMat): void {
    this.mat = m;
    this.refreshUi();
    bus.emit('uiTap', { kind: 'tab' });
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.closePanels();
    if (t === 'decor') {
      this.decorPanel.classList.add('show');
      if (!this.decorDef) this.decorDef = decorCatalog()[0] ?? null;
      this.fillDecorList();
    } else this.selDecor = null;
    this.placeBtn.style.display = t === 'build' ? '' : 'none';
    if (t === 'edit') this.showHint('✏️ Edit: tap a wall or floor, then tap squares to cut windows, doors and arches.', 6);
    if (t === 'delete') this.showHint('🗑️ Delete: tap any piece or decor to remove it. ↶ brings it back.', 6);
    if (t === 'decor') this.showHint('🛋️ Decor: pick something, tap to put it down. Tap an item to turn, recolour or remove it.', 7);
    this.refreshUi();
  }

  private closePanels(): void {
    this.editPanel?.classList.remove('show');
    this.decorPanel?.classList.remove('show');
    this.decorSel?.classList.remove('show');
    this.selPiece = null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // UI (the bar at the bottom, the edit grid, the decor shelf)
  // ───────────────────────────────────────────────────────────────────────
  private showHint(text: string, secs = 5): void {
    this.hint.textContent = text;
    this.hint.classList.add('show');
    this.hintT = secs;
  }

  private mkBtn(parent: HTMLElement, cls: string, icon: string, label: string, on: () => void, key?: string): HTMLElement {
    const b = el('button', 'b3-btn ' + cls, parent);
    el('span', 'ico', b, icon);
    if (label) el('span', 'lbl', b, label);
    if (key) el('span', 'key', b, key);
    bindTap(b, () => {
      bus.emit('uiTap', { kind: 'soft' });
      on();
    });
    return b;
  }

  private buildUi(): void {
    const root = el('div', 'b3 passthrough', this.host.hud);
    this.root = root;
    this.hint = el('div', 'b3-hint', root);
    this.info = el('div', 'b3-info', root);

    // the bar
    this.bar = el('div', 'b3-bar interactive', root);
    const kinds = el('div', 'b3-row', this.bar);
    for (const k of KIND_UI) {
      this.kindBtns.set(k.kind, this.mkBtn(kinds, 'kind', k.icon, k.label, () => this.setKind(k.kind), k.key));
    }
    const mats = el('div', 'b3-row mats', this.bar);
    for (const m of MAT_ORDER) {
      const b = this.mkBtn(mats, 'mat ' + m, MATS[m].icon, MATS[m].label, () => this.setMat(m));
      this.matBtns.set(m, b);
    }
    const tools = el('div', 'b3-row tools', this.bar);
    this.toolBtns.set('edit', this.mkBtn(tools, 'tool', '✏️', 'Edit', () => this.setTool(this.tool === 'edit' ? 'build' : 'edit'), 'G'));
    this.toolBtns.set('delete', this.mkBtn(tools, 'tool', '🗑️', 'Delete', () => this.setTool(this.tool === 'delete' ? 'build' : 'delete'), 'X'));
    this.toolBtns.set('decor', this.mkBtn(tools, 'tool', '🛋️', 'Decor', () => this.setTool(this.tool === 'decor' ? 'build' : 'decor'), 'V'));
    this.mkBtn(tools, 'undo', '↶', 'Undo', () => this.undo(), 'U');
    this.mkBtn(tools, 'done', '✓', 'Done', () => this.setActive(false), 'B');

    // the big touch place button
    this.placeBtn = el('button', 'b3-place interactive', root);
    el('span', 'ico', this.placeBtn, '🔨');
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        this.placeBtn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.placeHeld = true;
      this.lastPlaceAt = performance.now();
      this.placedKey = '';
      this.place();
      this.placedKey = this.lastKey;
      this.placeBtn.classList.add('pressed');
    };
    const up = (e: PointerEvent) => {
      e.stopPropagation();
      this.placeHeld = false;
      this.placeBtn.classList.remove('pressed');
    };
    this.placeBtn.addEventListener('pointerdown', down);
    this.placeBtn.addEventListener('pointerup', up);
    this.placeBtn.addEventListener('pointercancel', up);

    // edit panel
    this.editPanel = el('div', 'b3-panel b3-edit interactive', root);
    this.editTitle = el('div', 'ttl', this.editPanel, 'Edit');
    this.editGrid = el('div', 'grid3', this.editPanel);
    for (let i = 0; i < 9; i++) {
      const c = el('button', 'cell', this.editGrid);
      bindTap(c, () => {
        bus.emit('uiTap', { kind: 'soft' });
        this.toggleCell(+(c.dataset.r ?? 0), +(c.dataset.c ?? 0));
      });
      this.editCells.push(c);
    }
    const pre = el('div', 'b3-row presets', this.editPanel);
    for (const p of PRESETS) this.mkBtn(pre, 'preset', p.icon, p.label, () => this.applyPreset(p.id));
    this.mkBtn(this.editPanel, 'done wide', '✓', 'Done', () => this.closePanels());

    // decor shelf
    this.decorPanel = el('div', 'b3-panel b3-decor interactive', root);
    this.decorList = el('div', 'list', this.decorPanel);
    const ctl = el('div', 'b3-row ctl', this.decorPanel);
    this.mkBtn(ctl, 'tool', '⟳', 'Turn', () => this.rotateDecor(), 'R');
    const sw = el('div', 'swatches', ctl);
    for (const c of DECOR_COLORS) {
      const s = el('button', 'sw', sw);
      s.style.background = c;
      s.dataset.c = c;
      bindTap(s, () => this.recolorDecor(c));
    }
    this.decorSel = el('div', 'b3-sel', this.decorPanel);
    el('span', 'lbl', this.decorSel, 'Selected');
    this.mkBtn(this.decorSel, 'tool', '🗑️', 'Remove', () => {
      if (this.selDecor) this.deleteDecor(this.selDecor);
    });
    this.mkBtn(this.decorSel, 'tool', '✓', 'Done', () => this.selectDecor(null));
  }

  private fillDecorList(): void {
    if (this.decorList.childElementCount) return;
    const cats = new Map<string, PieceDef[]>();
    for (const d of decorCatalog()) {
      const k = String(d.cat);
      if (!cats.has(k)) cats.set(k, []);
      cats.get(k)!.push(d);
    }
    for (const [cat, list] of cats) {
      el('div', 'cat', this.decorList, cat);
      for (const d of list) {
        const b = el('button', 'item', this.decorList);
        b.dataset.type = d.type;
        el('span', 'ico', b, d.icon);
        el('span', 'lbl', b, d.name);
        bindTap(b, () => {
          bus.emit('uiTap', { kind: 'soft' });
          this.decorDef = d;
          this.selectDecor(null);
          this.refreshUi();
        });
      }
    }
  }

  private refreshUi(): void {
    for (const [k, b] of this.kindBtns) b.classList.toggle('on', this.tool === 'build' && this.kind === k);
    for (const [m, b] of this.matBtns) b.classList.toggle('on', this.mat === m);
    for (const [t, b] of this.toolBtns) b.classList.toggle('on', this.tool === t);
    this.decorList?.querySelectorAll('.item').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.type === this.decorDef?.type));
    this.decorPanel?.querySelectorAll('.sw').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.c === this.decorColor));
    this.updateInfo();
  }

  private updateInfo(): void {
    if (!this.info) return;
    const n = buildSpace.size;
    const t = this.tool;
    const what = t === 'build' ? `${this.mat} ${this.kind}` : t === 'edit' ? 'edit' : t === 'delete' ? 'delete' : this.decorDef?.name ?? 'decor';
    const text = `🔨 ${what} · ${n} piece${n === 1 ? '' : 's'}`;
    if (this.info.textContent !== text) this.info.textContent = text;
  }

  // ── for tests / sweeps ──
  debug(): { active: boolean; tool: Tool; layer: ReturnType<BuildLayer['stats']>; decor: ReturnType<DecorLayer['stats']>; target: { ok: boolean; kind: string; ix: number; iy: number; iz: number; dir: number; why?: string } | null } {
    const t = this.target;
    return { active: this.active, tool: this.tool, layer: this.layer.stats(), decor: this.decor.stats(), target: t ? { ok: t.ok, kind: t.piece.kind, ix: t.piece.ix, iy: t.piece.iy, iz: t.piece.iz, dir: t.piece.dir, why: t.why } : null };
  }
}
