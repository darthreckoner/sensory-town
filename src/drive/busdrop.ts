// ── v3 movement (W4) ── The party-bus drop: the signature "jump onto the island" moment.
//
// At the start of a play session an ORIGINAL flying party bus (hot pink, held up by a bunch of big balloons, a propeller
// on the back) cruises over the island at ~80 m with your character standing on its roof. Drag to look around, honk
// the horn, and tap JUMP! when you see somewhere fun: you skydive (steer with the stick), the glider opens ~25 m above the
// ground, and you land anywhere. Skip goes straight to the street. Never a timer, never stressful: the bus just loops.
import * as THREE from 'three';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import * as Layout from '../world/townLayout';
import { button, el } from '../ui/ui';
import { roundedBox, toyMat } from '../art/materials';
import { clamp, wrapAngle } from './envUtils';
import { hyp } from '../core/fastmath';   // ── v3 perf ── Math.hypot is ~12x slower than this

export interface BusPath {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
}

/** BUS_PATH from townLayout (the world agent) or a temporary diagonal over the island. */
export function busPath(): BusPath {
  const p = (Layout as unknown as { BUS_PATH?: BusPath }).BUS_PATH;
  if (p && Number.isFinite(p.ax)) return p;
  return { ax: -135, az: -95, bx: 135, bz: 85, y: tuning.movement3.busAlt };
}

const BALLOONS = ['#ff2e88', '#00d4ff', '#ffc93c', '#b6ff3b', '#7c4dff', '#ff8a3d', '#ffffff'];

interface BusParts {
  group: THREE.Group;
  balloons: THREE.Group;
  prop: THREE.Object3D;
  wheels: THREE.Object3D[];
  body: THREE.Object3D;
}

/** The bus: local +z is forward, local y = 0 is the underside of the wheels, the roof deck is at y ≈ 2.65. */
function buildBus(): BusParts {
  const g = new THREE.Group();
  g.name = 'partyBus';
  const body = new THREE.Group();
  g.add(body);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pink = toyMat('#ff2e88', 'gloss');
  const cyan = toyMat('#00d4ff', 'gloss');
  const white = toyMat('#ffffff', 'gloss');
  const dark = toyMat('#2a2350', 'glass');
  const black = toyMat('#16151c', 'satin');
  const gold = toyMat('#ffc93c', 'gloss');
  const glow = new THREE.MeshBasicMaterial({ color: '#fff3a0', toneMapped: false });

  add(roundedBox(3.2, 2.1, 7.6, 0.55), pink, 0, 1.5, 0); // main body
  add(roundedBox(3.28, 0.42, 7.68, 0.18), cyan, 0, 0.95, 0); // belt stripe
  add(roundedBox(3.0, 0.22, 7.2, 0.1), white, 0, 2.58, 0); // roof deck
  // side windows + windscreen
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) add(roundedBox(0.08, 0.72, 0.92, 0.12), dark, s * 1.62, 1.85, -2.9 + i * 1.45);
  add(roundedBox(2.6, 0.9, 0.12, 0.16), dark, 0, 1.9, 3.82);
  // headlights + bumper
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.26, 14, 10), glow, s * 1.05, 1.0, 3.78);
  add(roundedBox(3.1, 0.3, 0.3, 0.12), white, 0, 0.62, 3.78);
  // rails on the roof (back + sides), so there is a place to stand
  const post = new THREE.CylinderGeometry(0.06, 0.06, 0.62, 8);
  const bar = (len: number, alongX: boolean, x: number, z: number): void => {
    const b = add(new THREE.CylinderGeometry(0.05, 0.05, len, 8), gold, x, 3.22, z);
    if (alongX) b.rotation.z = Math.PI / 2;
    else b.rotation.x = Math.PI / 2;
  };
  for (const s of [-1, 1]) {
    bar(6.4, false, s * 1.4, -0.2);
    for (const z of [-3.2, -1.6, 0, 1.6, 2.9]) add(post, gold, s * 1.4, 2.93, z);
  }
  bar(2.8, true, 0, -3.35);
  add(post, gold, 0, 2.93, -3.35);

  // wheels
  const wheels: THREE.Object3D[] = [];
  const tyre = new THREE.CylinderGeometry(0.64, 0.64, 0.5, 20);
  const hub = new THREE.CylinderGeometry(0.3, 0.3, 0.54, 12);
  for (const s of [-1, 1])
    for (const z of [-2.4, 2.4]) {
      const w = new THREE.Group();
      w.position.set(s * 1.5, 0.64, z);
      const t = new THREE.Mesh(tyre, black);
      t.rotation.z = Math.PI / 2;
      t.castShadow = true;
      const h = new THREE.Mesh(hub, cyan);
      h.rotation.z = Math.PI / 2;
      w.add(t, h);
      body.add(w);
      wheels.push(w);
    }

  // rear propeller
  const prop = new THREE.Group();
  prop.position.set(0, 1.5, -3.95);
  body.add(prop);
  const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), gold);
  prop.add(spinner);
  const blade = roundedBox(0.34, 1.7, 0.08, 0.1);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(blade, i === 1 ? cyan : white);
    b.position.y = 0;
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * Math.PI * 2) / 3;
    b.position.y = 0.85;
    pivot.add(b);
    prop.add(pivot);
  }

  // the balloons: a big bobbing bunch above the roof, tied to the rails
  const balloons = new THREE.Group();
  balloons.position.set(0, 2.9, 0);
  g.add(balloons);
  const ball = new THREE.SphereGeometry(1, 22, 16);
  const knot = new THREE.ConeGeometry(0.2, 0.34, 10);
  const lines: number[] = [];
  const spots: [number, number, number, number][] = [
    [0, 8.4, 0, 1.9],
    [2.0, 7.0, 1.3, 1.65],
    [-2.0, 7.2, 1.0, 1.7],
    [1.5, 6.9, -2.0, 1.6],
    [-1.6, 7.1, -2.1, 1.65],
    [0.2, 6.6, 2.7, 1.5],
    [0.1, 6.5, -3.0, 1.5],
  ];
  spots.forEach(([x, y, z, r], i) => {
    const mat = toyMat(BALLOONS[i % BALLOONS.length], 'gloss');
    const b = new THREE.Mesh(ball, mat);
    b.position.set(x, y, z);
    b.scale.set(r, r * 1.14, r);
    b.castShadow = true;
    balloons.add(b);
    const k = new THREE.Mesh(knot, mat);
    k.position.set(x, y - r * 1.14 - 0.12, z);
    k.rotation.x = Math.PI;
    balloons.add(k);
    // strings down to the nearest roof rail
    const sx = clamp(x * 0.7, -1.4, 1.4), sz = clamp(z * 0.9, -3.2, 2.9);
    lines.push(x, y - r * 1.14 - 0.28, z, sx, 0.08, sz);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  balloons.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 })));
  return { group: g, balloons, prop, wheels, body };
}

export interface BusHost {
  /** the player hopped off: start the skydive from here */
  onJump(x: number, y: number, z: number, vx: number, vz: number, heading: number): void;
  /** Skip: go straight to the street */
  onSkip(): void;
}

/** where the character stands on the bus roof (bus-local) */
const STAND = new THREE.Vector3(0, 2.7, -0.9);

export class BusDrop {
  readonly group: THREE.Group;
  /** the ride is on and the player is aboard */
  active = false;
  /** the bus is visible (aboard, or flying away after the jump) */
  visible = false;
  x = 0;
  z = 0;
  y = 0;
  heading = 0;
  /** the roof spot (world) where the walker stands */
  readonly stand = new THREE.Vector3();
  /** seconds aboard */
  age = 0;

  private readonly parts: BusParts;
  private readonly ui: HTMLDivElement;
  private readonly jumpBtn: HTMLButtonElement;
  private toB = true;
  private clock = 0;
  private honkSquash = 0;
  private lastHonk = 0;
  private path: BusPath = busPath();
  private readonly eul = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tmp = new THREE.Vector3();

  constructor(parent: HTMLElement, private readonly host: BusHost) {
    this.parts = buildBus();
    this.group = this.parts.group;
    this.group.visible = false;

    this.ui = el('div', 'v3-bus passthrough', parent) as HTMLDivElement;
    el('div', 'v3-bus-title', this.ui, '🚌 PARTY BUS');
    this.jumpBtn = button(this.ui, { label: 'JUMP!', icon: '🪂', cls: 'pink big v3-jump' }, () => this.jump());
    button(this.ui, { label: 'Skip', icon: '⏭️', cls: 'ghost v3-skip' }, () => this.skip());
    button(this.ui, { icon: '📯', cls: 'round v3-honk' }, () => this.honk());
    this.ui.style.display = 'none';
  }

  /** Climb aboard at the start of the route. */
  start(): void {
    this.path = busPath();
    const p = this.path;
    this.x = p.ax;
    this.z = p.az;
    this.y = p.y;
    this.toB = true;
    this.heading = Math.atan2(p.bx - p.ax, -(p.bz - p.az));
    this.active = true;
    this.visible = true;
    this.age = 0;
    this.clock = 0;
    this.lastHonk = 0;
    this.group.visible = true;
    this.ui.style.display = '';
    this.ui.classList.remove('gone');
    this.place(0);
    bus.emit('busStart', { pos: { x: this.x, y: this.y, z: this.z } });
    window.setTimeout(() => {
      if (this.active) this.honk();
    }, 700);
  }

  /** Leave the bus (jump or skip). The bus keeps flying away if `keepFlying`. */
  private leave(keepFlying: boolean): void {
    this.active = false;
    this.ui.style.display = 'none';
    if (!keepFlying) this.hide();
  }

  hide(): void {
    this.active = false;
    this.visible = false;
    this.group.visible = false;
    this.ui.style.display = 'none';
  }

  jump(): void {
    if (!this.active || this.age < 0.35) return;
    const sp = tuning.movement3.busSpeed;
    bus.emit('busJump', { pos: { x: this.stand.x, y: this.stand.y, z: this.stand.z } });
    this.leave(true);
    this.host.onJump(this.stand.x, this.stand.y, this.stand.z, Math.sin(this.heading) * sp * 0.6, -Math.cos(this.heading) * sp * 0.6, this.heading);
  }

  skip(): void {
    if (!this.active) return;
    this.leave(false);
    this.host.onSkip();
  }

  honk(): void {
    if (!this.visible) return;
    this.honkSquash = 0.0001;
    this.lastHonk = this.clock;
    bus.emit('busHonk', { pos: { x: this.x, y: this.y + 2, z: this.z } });
  }

  /** Cruise (aboard, or flying away after the jump). */
  update(dt: number): void {
    if (!this.visible) return;
    this.clock += dt;
    if (this.active) {
      this.age += dt;
      if (this.clock - this.lastHonk > tuning.movement3.busHonkEveryS) this.honk();
    }
    // pure pursuit toward the next end of the route: the turn-around is a wide, lazy loop
    const p = this.path;
    const tx = this.toB ? p.bx : p.ax, tz = this.toB ? p.bz : p.az;
    if (hyp(tx - this.x, tz - this.z) < 26) this.toB = !this.toB;
    const want = Math.atan2(tx - this.x, -(tz - this.z));
    const turn = 0.75 * dt;
    this.heading += clamp(wrapAngle(want - this.heading), -turn, turn);
    const sp = tuning.movement3.busSpeed;
    this.x += Math.sin(this.heading) * sp * dt;
    this.z += -Math.cos(this.heading) * sp * dt;
    this.y = p.y + Math.sin(this.clock * 1.7) * 0.35;
    this.place(dt);
  }

  private place(dt: number): void {
    const t = this.clock;
    const g = this.group;
    // sway: a gentle roll and pitch
    this.eul.set(Math.sin(t * 0.9) * 0.025, Math.PI - this.heading, Math.sin(t * 1.3) * 0.045, 'YXZ');
    g.rotation.copy(this.eul);
    g.position.set(this.x, this.y, this.z);
    // honk: the whole bus squashes and pops
    let sq = 1;
    if (this.honkSquash > 0) {
      this.honkSquash += dt;
      const k = this.honkSquash / 0.5;
      if (k >= 1) this.honkSquash = 0;
      else sq = 1 + Math.sin(k * Math.PI * 3) * 0.1 * (1 - k);
    }
    g.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    const b = this.parts.balloons;
    b.rotation.set(Math.sin(t * 1.1) * 0.05, 0, Math.sin(t * 0.8 + 1) * 0.06);
    this.parts.prop.rotation.z += dt * 24;
    for (const w of this.parts.wheels) w.rotation.x += dt * 5;
    // where the character stands (world)
    this.tmp.copy(STAND).multiplyScalar(1);
    this.tmp.applyEuler(this.eul);
    this.stand.set(this.x + this.tmp.x, this.y + this.tmp.y, this.z + this.tmp.z);
  }

  dispose(): void {
    this.ui.remove();
  }
}
