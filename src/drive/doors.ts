// Doors: glowing mats with a floating icon (walk onto them, or drive onto the
// car pads). Static ones come from the districts (Studio, STYLE, builder's
// office); the Home Hills ones are built from the save: every EMPTY lot gets a
// big FOR SALE sign + a "build here" mat, every claimed lot a mailbox and a
// front-door mat.
import * as THREE from 'three';
import { PLOTS, plotFront, type Plot } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import type { House } from '../core/model';
import { tuning } from '../tuning';
import { store } from '../core/store';
import type { DoorDef } from './types';
import type { Collider } from '../world/townEnv';
import { Mesher } from './mesher';
import { mat, textMat } from './kit';
import { PAL } from './palette';
import { emojiSprite, lightBeam } from './envUtils';
import { mailbox } from './props';
import { ROAD_LIFT } from './terrain';

// ── textures ────────────────────────────────────────────────────────────────
/** Rounded-rect path that works on every browser (ctx.roundRect is missing before iOS 16). */
function rr(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
let matTex: THREE.CanvasTexture | null = null;
/** A glowing floor mat: a rounded frame with chevrons pointing at the door (+z edge = the door). */
function floorMatTexture(): THREE.CanvasTexture {
  if (!matTex) {
    const W = 256, H = 192;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.28)';
    x.beginPath();
    rr(x, 10, 10, W - 20, H - 20, 26);
    x.fill();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 8;
    x.shadowColor = '#ffffff';
    x.shadowBlur = 14;
    x.beginPath();
    rr(x, 14, 14, W - 28, H - 28, 24);
    x.stroke();
    x.lineWidth = 12;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const y = 50 + i * 36;
      x.globalAlpha = 0.45 + i * 0.25;
      x.beginPath();
      x.moveTo(W / 2 - 40, y);
      x.lineTo(W / 2, y + 22);
      x.lineTo(W / 2 + 40, y);
      x.stroke();
    }
    matTex = new THREE.CanvasTexture(c);
    matTex.colorSpace = THREE.SRGBColorSpace;
    matTex.anisotropy = 4;
  }
  return matTex;
}
const labelCache = new Map<string, THREE.CanvasTexture>();
function labelTexture(text: string): THREE.CanvasTexture {
  let t = labelCache.get(text);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 90;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(18,16,28,0.78)';
    x.beginPath();
    rr(x, 4, 8, 312, 74, 37);
    x.fill();
    x.font = '800 40px "Helvetica Neue",Arial,sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#ffffff';
    x.fillText(text, 160, 47);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(text, t);
  }
  return t;
}

interface Marker {
  def: DoorDef;
  group: THREE.Group;
  icon: THREE.Sprite;
  label: THREE.Sprite;
  beam: THREE.Mesh;
  matMesh: THREE.Mesh;
  phase: number;
}

/** Visuals for a list of doors. Rebuilt whenever the save's houses change. */
export class DoorLayer {
  readonly group = new THREE.Group();
  private markers: Marker[] = [];
  private fixed = new THREE.Group();

  clear(): void {
    for (const mk of this.markers) {
      mk.group.removeFromParent();
      mk.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose?.();
        }
      });
    }
    this.markers = [];
    this.fixed.removeFromParent();
    this.fixed = new THREE.Group();
    this.group.add(this.fixed);
  }

  /** Add the glowing mat + icon + label for every door. */
  setDoors(doors: DoorDef[]): void {
    this.clear();
    for (const def of doors) {
      const g = new THREE.Group();
      const y = groundHeight(def.x, def.z) + ROAD_LIFT + 0.04;
      g.position.set(def.x, y, def.z);
      g.rotation.y = Math.atan2(-def.nx, -def.nz); // the chevrons (+z) point at the door, i.e. against the outward normal
      const color = new THREE.Color(def.glow);
      const matMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.8, 2.1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: floorMatTexture(), color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      );
      matMesh.renderOrder = 3;
      g.add(matMesh);
      const beam = lightBeam(def.glow, 0.32, 4.5, 0.2);
      g.add(beam);
      const icon = emojiSprite(def.icon, 1.4);
      icon.position.set(0, 2.5, 0);
      icon.renderOrder = 8;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(def.label), transparent: true, depthWrite: false }));
      label.scale.set(2.5, 0.7, 1);
      label.position.set(0, 3.6, 0);
      label.renderOrder = 8;
      // the sprites live in world orientation, not the mat's
      const top = new THREE.Group();
      top.add(icon, label);
      g.add(top);
      this.group.add(g);
      this.markers.push({ def, group: g, icon, label, beam, matMesh, phase: Math.random() * 6 });
      void top;
    }
  }

  update(t: number, vx: number, vz: number): void {
    for (const mk of this.markers) {
      const d = Math.hypot(vx - mk.def.x, vz - mk.def.z);
      mk.group.visible = d < 70;
      if (!mk.group.visible) continue;
      // level of detail: the glowing mat from afar, the light column nearer, the icon + label up close
      mk.beam.visible = d < 50;
      mk.icon.visible = mk.label.visible = d < 26;
      const pulse = 0.72 + Math.sin(t * 3 + mk.phase) * 0.18;
      (mk.matMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
      mk.icon.position.y = 2.4 + Math.sin(t * 2.2 + mk.phase) * 0.2;
    }
  }
}

// ── the Home Hills lots, built from the save ────────────────────────────────
const EDGE: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // rot 0..3 → outward edge normal

function houseDoorSpot(h: House, plot: Plot): { x: number; z: number; nx: number; nz: number } {
  const S = tuning.build.gridSize;
  const f = plotFront(plot);
  let best: { x: number; z: number; nx: number; nz: number; score: number } | null = null;
  for (const p of h.pieces) {
    if ((p.type !== 'wallDoor' && p.type !== 'wallGlassDoor') || (p.level ?? 0) !== 0) continue;
    const [nx, nz] = EDGE[p.rot];
    const x = plot.origin.x + (p.x + 0.5) * S + nx * 0.5 * S + nx * 1.1;
    const z = plot.origin.z + (p.z + 0.5) * S + nz * 0.5 * S + nz * 1.1;
    const score = nx * f.nx + nz * f.nz;
    if (!best || score > best.score) best = { x, z, nx, nz, score };
  }
  if (best) return best;
  // no door yet: the street-side edge of the lot
  return { x: plot.center.x + f.nx * (plot.size / 2 + 0.2), z: plot.center.z + f.nz * (plot.size / 2 + 0.2), nx: f.nx, nz: f.nz };
}

export interface PlotLayer {
  group: THREE.Group;
  doors: DoorDef[];
  /** Plot indices that are still empty. */
  empty: number[];
  /** Mailboxes and sign boards (solid for cars and walkers). */
  colliders: Collider[];
  update(t: number, vx: number, vz: number): void;
}

/** FOR SALE signs on empty lots, mailboxes on claimed ones, front-door triggers on claimed houses. */
export function buildPlotLayer(): PlotLayer {
  const d = tuning.drive;
  const group = new THREE.Group();
  group.name = 'plot-signs';
  const doors: DoorDef[] = [];
  const empty: number[] = [];
  const colliders: Collider[] = [];
  const m = new Mesher();
  m.push(0, 0, 0);
  const me = store.profile?.id;
  const sale = textMat(['FOR SALE', 'BUILD HERE'], { bg: '#f3f2ee', fg: '#d4262d', accent: '#d4262d', w: 512, h: 320 });
  const pulses: THREE.Object3D[] = [];
  for (const plot of PLOTS) {
    const h = store.houseOnPlot(plot.index);
    const f = plotFront(plot);
    const px = -f.nz, pz = f.nx; // along the street
    const sx = plot.center.x + f.nx * (plot.size / 2 + 1.0) + px * (plot.size / 2 - 1.8);
    const sz = plot.center.z + f.nz * (plot.size / 2 + 1.0) + pz * (plot.size / 2 - 1.8);
    const gy = groundHeight(sx, sz);
    if (!h) {
      empty.push(plot.index);
      // sign: two posts + a board facing the street
      m.push(sx, sz, Math.atan2(f.nx, f.nz));
      for (const o of [-0.9, 0.9]) m.box(mat.wood(), o, gy + 1.0, 0, 0.12, 2.0, 0.12);
      m.box(mat.std('#f3f2ee', 0.6), 0, gy + 1.55, 0, 2.2, 1.5, 0.1);
      m.quad(sale, [-1.0, gy + 0.9, 0.07], [1.0, gy + 0.9, 0.07], [1.0, gy + 2.2, 0.07], [-1.0, gy + 2.2, 0.07], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      m.box(mat.std('#d4262d', 0.5), 0, gy + 0.62, 0, 2.2, 0.08, 0.12);
      m.pop();
      const alongX = Math.abs(px) > 0.5;
      colliders.push({ kind: 'box', x: sx, z: sz, hw: alongX ? 1.1 : 0.2, hd: alongX ? 0.2 : 1.1, h: gy + 2.3 });
      // the mat in front of the lot, on the street side
      doors.push({
        id: `plot${plot.index}`,
        x: plot.center.x + f.nx * (plot.size / 2 + 1.7),
        z: plot.center.z + f.nz * (plot.size / 2 + 1.7),
        nx: f.nx,
        nz: f.nz,
        icon: '🏠',
        label: 'Build here',
        scene: 'build',
        params: { plot: plot.index, claim: true },
        radius: d.plotDoorRadius,
        carSpeed: d.plotCarSpeed,
        glow: PAL.lime,
      });
    } else {
      const own = store.profileById(h.ownerId);
      // mailbox at the street edge
      mailbox(m, { colliders }, sx, sz, Math.atan2(f.nx, f.nz), h.ownerId === me ? '#2c3e5c' : '#8d8b96');
      const spot = houseDoorSpot(h, plot);
      const mine = h.ownerId === me;
      doors.push({
        id: `house${plot.index}`,
        x: spot.x,
        z: spot.z,
        nx: spot.nx,
        nz: spot.nz,
        icon: mine ? '🏡' : '🏠',
        label: mine ? 'My house' : `${own?.name ?? 'Someone'}'s house`,
        scene: mine ? 'build' : null,
        params: mine ? { plot: plot.index } : undefined,
        visitor: mine ? undefined : own?.name ?? 'Someone',
        radius: d.doorRadius,
        glow: mine ? PAL.cyan : PAL.gold,
      });
    }
  }
  group.add(m.build('plot-static'));
  void pulses;
  return {
    group,
    doors,
    empty,
    colliders,
    update() {},
  };
}
