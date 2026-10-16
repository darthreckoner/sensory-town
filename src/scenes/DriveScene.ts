// The hub (v2): a whole little town to explore. Cruise in a roadster, hop out
// and walk, collect 💎 charms, boost off ramps, ride passengers around, and walk
// (or drive) onto glowing mats to enter the Studio, the STYLE boutique, the
// builder's office, or your own front door. Empty lots in Home Hills have
// FOR SALE · BUILD HERE signs.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { goldenHour } from '../art/env';
import { Car, DEFAULT_STYLE, type CarMotion } from '../art/car';
import { Character } from '../art/character';
import { buildTownEnvironment, type TownEnv } from '../world/townEnv';
import { buildTownContent, disposeBaked, tickBuildMaterials } from '../world/houseMesh';
import { BUILD_YARD, PLOTS, SPAWN, WATER_Y, WORKSHOP, plotFront } from '../world/townLayout';
import { groundHeight, railedAt, waveY } from '../world/heightfield';
import { button, el, toast } from '../ui/ui';
import { popScale } from '../core/tween';
import { nextReward } from '../core/unlocks';
import { CarPhysics, ColliderGrid, NO_INPUT, pushOut, res, type CarInput } from '../drive/physics';
import { FootPhysics } from '../drive/foot';
import { DriveControls } from '../drive/controls';
import { Minimap, NameTags, PromptBubble, TopHud } from '../drive/hud';
import { JobManager } from '../drive/jobs';
import { Charms } from '../drive/charms';
import { DoorLayer, buildPlotLayer, type PlotLayer } from '../drive/doors';
import { makePad, type Pad } from '../drive/pads';
import { Particles, Ripples, SkidMarks, SpeedLines } from '../drive/effects';
import { openPaintSheet } from '../drive/paint';
import { SUN_DIR } from '../drive/sky';
import { PAL } from '../drive/palette';
import { emojiSprite, clamp, lerpAngle, wrapAngle } from '../drive/envUtils';
import type { DoorDef } from '../drive/types';

// ── what survives leaving the town scene (Studio, Style, Build...) ──────────
interface Pose { x: number; z: number; heading: number }
interface Exit extends Pose { mode: 'car' | 'foot' }
const session = {
  profileId: '',
  mode: 'car' as 'car' | 'foot',
  car: { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading } as Pose,
  foot: { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading } as Pose,
  /** set when we leave through a door: where to appear when we come back */
  exit: null as Exit | null,
  /** profile that already got the "build your home" nudge this session */
  homeNudgeFor: '',
};

/** Where a car lands when it returns from the Studio pad / the builder pad. */
const STUDIO_EXIT: Pose = { x: WORKSHOP.pad.x - 8, z: 2.6, heading: Math.PI / 2 };
const BUILD_EXIT: Pose = { x: BUILD_YARD.pad.x + 4, z: 2.6, heading: Math.PI / 2 };

interface Trigger {
  def: DoorDef;
  armed: boolean;
  exit?: Pose;
}

const SPARKLE_COLORS = ['#ff2e88', '#00d4ff', '#ffc93c', '#b6ff3b', '#ffffff', '#7c4dff'];

export class DriveScene extends GameScene {
  readonly name = 'town' as const;
  pixelRatioCap = tuning.app.townPixelRatio;
  fxScale = 3;

  // world
  private env!: TownEnv;
  private content: THREE.Group | null = null;
  private grid!: ColliderGrid;
  private car!: Car;
  private walker!: Character;
  private readonly phys = new CarPhysics();
  private readonly foot = new FootPhysics();
  private jobs!: JobManager;
  private charms!: Charms;
  private doorLayer!: DoorLayer;
  private plotLayer: PlotLayer | null = null;
  private pads: Pad[] = [];
  private triggers: Trigger[] = [];
  private skid!: SkidMarks;
  private fx!: Particles;
  private lines!: SpeedLines;
  private carMarker!: THREE.Sprite;
  private ripples!: Ripples;
  private sun!: THREE.DirectionalLight;
  private readonly lightX = new THREE.Vector3();
  private readonly lightY = new THREE.Vector3();

  // mode
  private mode: 'car' | 'foot' = 'car';

  // camera
  private readonly camPos = new THREE.Vector3();
  private readonly camWant = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();
  private camHeading = 0;
  private camYaw = 0;
  private camPitch = 0.12;
  private camBaseY = 0;
  private lookTmp = { yaw: 0, pitch: 0 };
  private dragIdle = 0;
  private occl = 1;
  private fovScale = 1;
  private fovNow = 0;

  // hud / input
  private controls!: DriveControls;
  private minimap!: Minimap;
  private top!: TopHud;
  private prompt!: PromptBubble;
  private promptTr: Trigger | null = null;
  private tags!: NameTags;
  private modeBtn!: HTMLButtonElement;
  private callBtn!: HTMLButtonElement;
  private winW = 1;
  private winH = 1;
  private mapAcc = 0;
  private homeAcc = 99;
  private homeTarget: { x: number; z: number } | null = null;
  private emptyPlots: typeof PLOTS = [];
  private ownsHouse = false;
  private nudgeIn = -1;
  private touchSeen = false;
  private openSheets = 0;
  private readonly nearCharms: { x: number; z: number }[] = [];
  private mx = 0;
  private mz = 0;

  // state
  private leaving = false;
  private leaveT = 0;
  private lastHorn = 0;
  private lastHit = 0;
  private lastSkid = 0;
  private trailAcc = 0;
  private smokeAcc = 0;
  private flameAcc = 0;
  private boostMeter = 1;
  private boostOn = false;
  private boostLevel = 0;
  private pitch = 0;
  private roll = 0;
  // water + calling the car
  private simT = 0;
  private wasWet = false;
  private wasSwim = false;
  private strokeAcc = 0;
  private lastCall = -1e9;
  /** a car that was just called next to a FOR SALE mat must not offer (or auto-claim) it until it has moved */
  private promptHold = false;
  private dropY = 0;
  private dropV = 0;
  private readonly motion: CarMotion = { speed: 0, speed01: 0, steer: 0, accel: 0, lateral: 0, braking: false, boost: 0, airborne: false, slip: 0 };
  private readonly carUpdate = { speed01: 0, throttle: 0 };
  private readonly carCircle = { kind: 'circle' as const, x: 0, z: 0, r: 1.05 };

  // ─────────────────────────────────────────────────────────────────────────
  init(): void {
    const d = tuning.drive;
    this.camera.near = 0.5;
    this.camera.far = 700;
    this.camera.fov = d.cameraFov;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);

    // Golden hour: low warm sun with a small shadow box that follows the player.
    const rig = goldenHour(this.scene, { shadowSize: d.shadowSize, distance: 120, fog: false });
    this.sun = rig.sun;
    if (this.sun.shadow.mapSize.x !== d.shadowMap) this.sun.shadow.mapSize.set(d.shadowMap, d.shadowMap);
    this.scene.fog = new THREE.Fog(tuning.art.fogColor, d.fogNear, d.fogFar);
    this.lightX.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    this.lightY.crossVectors(SUN_DIR, this.lightX).normalize();

    this.env = buildTownEnvironment();
    this.scene.add(this.env.group);

    const prof = store.profile;
    this.car = new Car(prof.carColor, prof.outfit, { ...DEFAULT_STYLE, ...(prof.carStyle as object | undefined) });
    this.scene.add(this.car.group);
    this.walker = new Character(prof.outfit);
    this.walker.onStep = () => {
      const f = this.foot;
      if (f.swimming) return; // strokes are timed in waterFx
      if (f.wet > 0.08) {
        // a step through the shallows: a splash and a ripple at the legs
        const sy = waveY(f.x, f.z, this.simT);
        this.ripples.add(f.x, sy + 0.05, f.z, 0.9, 0.8);
        bus.emit('waterSplash', { pos: { x: f.x, y: sy, z: f.z }, strength: clamp(0.3 + f.move01, 0.3, 1), kind: 'wade' });
      } else bus.emit('footstep', { pos: { x: f.x, y: f.y, z: f.z }, run: f.move01 > 0.7 });
    };
    this.scene.add(this.walker.group);
    this.jobs = new JobManager(this.scene, this.car);
    this.charms = new Charms();
    this.scene.add(this.charms.group);
    this.doorLayer = new DoorLayer();
    this.scene.add(this.doorLayer.group);
    this.pads = [
      makePad(WORKSHOP.pad.x, WORKSHOP.pad.z, PAL.pink, '🧪'),
      makePad(BUILD_YARD.pad.x, BUILD_YARD.pad.z, PAL.gold, '🔨'),
    ];
    for (const p of this.pads) this.scene.add(p.group);
    this.skid = new SkidMarks();
    this.scene.add(this.skid.mesh);
    this.ripples = new Ripples();
    this.scene.add(this.ripples.mesh);
    this.fx = new Particles();
    this.scene.add(this.fx.group);
    this.lines = new SpeedLines();
    this.camera.add(this.lines.group);
    this.carMarker = emojiSprite('🚗', 2.2);
    this.carMarker.renderOrder = 8;
    this.carMarker.visible = false;
    this.scene.add(this.carMarker);

    // ── HUD ──
    const hud = el('div', 'drive-hud passthrough', this.ui);
    hud.style.setProperty('--drive-map', `${d.minimapSize}px`);
    this.tags = new NameTags(hud);
    this.minimap = new Minimap(hud);
    this.top = new TopHud(hud);
    this.prompt = new PromptBubble(hud);
    const side = el('div', 'drive-side passthrough', hud);
    button(side, { icon: '🎨', cls: 'round' }, () => this.openPaint());
    this.modeBtn = button(side, { icon: '🚶', cls: 'round drive-mode' }, () => this.toggleMode());
    // on foot: bring the car to me
    this.callBtn = button(side, { icon: '🚗', cls: 'round drive-call' }, () => this.callCar());
    this.callBtn.title = 'Bring my car (C)';
    this.controls = new DriveControls(hud, { onHorn: () => this.honk(), onToggleMode: () => this.toggleMode(), onConfirm: () => this.confirmPrompt(), onCallCar: () => this.callCar() });
  }

  enter(params?: { from?: 'workshop' | 'build' | 'dressup' | string }): void {
    const d = tuning.drive;
    this.pixelRatioCap = tuning.app.townPixelRatio;
    this.camera.near = 0.5;
    this.camera.far = 700;
    const prof = store.profile;

    // ── where to appear ──
    if (session.profileId !== prof.id) {
      session.profileId = prof.id;
      session.mode = 'car';
      session.car = { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading };
      session.foot = { ...session.car };
      session.exit = null;
    }
    let mode = session.mode;
    let carPose: Pose = { ...session.car };
    let footPose: Pose = { ...session.foot };
    const ex = session.exit;
    session.exit = null;
    if (ex) {
      if (ex.mode === 'car') {
        carPose = { x: ex.x, z: ex.z, heading: ex.heading };
        mode = 'car';
      } else {
        footPose = { x: ex.x, z: ex.z, heading: ex.heading };
        mode = 'foot';
      }
    } else if (params?.from === 'workshop' || params?.from === 'build') {
      carPose = { ...(params.from === 'workshop' ? STUDIO_EXIT : BUILD_EXIT) };
      mode = 'car';
    }

    // Houses and decorations change in build mode, so rebuild them every time.
    if (this.content) {
      this.scene.remove(this.content);
      disposeBaked(this.content);
    }
    const built = buildTownContent(store.data.town);
    this.content = built.group;
    this.scene.add(this.content);
    this.plotLayer?.group.removeFromParent();
    this.plotLayer = buildPlotLayer();
    this.scene.add(this.plotLayer.group);
    this.grid = new ColliderGrid([...this.env.colliders, ...built.colliders, ...this.plotLayer.colliders]);

    // doors (visual mats for walkers; the pads are drawn separately)
    const doors = [...(this.env.doors ?? []), ...this.plotLayer.doors];
    this.doorLayer.setDoors(doors);
    this.triggers = doors.map((def) => ({ def, armed: true }));
    this.triggers.push(
      {
        def: { id: 'pad-studio', x: WORKSHOP.pad.x, z: WORKSHOP.pad.z, nx: 0, nz: 1, icon: '🧪', label: 'Studio', scene: 'workshop', radius: d.doorTriggerRadius, carSpeed: d.doorPadCarSpeed, carOnly: true, glow: PAL.pink },
        armed: true,
        exit: STUDIO_EXIT,
      },
      {
        def: { id: 'pad-build', x: BUILD_YARD.pad.x, z: BUILD_YARD.pad.z, nx: 0, nz: 1, icon: '🔨', label: 'Build', scene: 'build', radius: d.doorTriggerRadius, carSpeed: d.doorPadCarSpeed, carOnly: true, glow: PAL.gold },
        armed: true,
        exit: BUILD_EXIT,
      },
    );

    // ── me, my car, my outfit ──
    this.car.setColor(prof.carColor);
    this.car.setStyle({ ...DEFAULT_STYLE, ...(prof.carStyle as object | undefined) });
    this.car.setOutfit(prof.outfit);
    this.walker.setOutfit(prof.outfit);
    this.phys.reset(carPose.x, carPose.z, carPose.heading);
    this.foot.reset(footPose.x, footPose.z, footPose.heading);
    this.foot.time = this.simT;
    this.ripples.clear();
    this.wasWet = this.foot.wet > 0.1;
    this.wasSwim = this.foot.swimming;
    this.strokeAcc = 0;
    this.dropY = this.dropV = 0;
    this.promptHold = false;
    this.leaving = false;
    this.leaveT = 0;
    this.boostMeter = 1;
    this.boostOn = false;
    this.boostLevel = 0;
    this.pitch = this.roll = 0;
    this.motion.speed = this.motion.speed01 = this.motion.steer = this.motion.accel = this.motion.lateral = this.motion.boost = this.motion.slip = 0;
    this.motion.braking = false;
    this.motion.airborne = false;
    this.applyCarPose(0, true);
    this.camHeading = carPose.heading;
    this.camYaw = footPose.heading;
    this.camPitch = 0.12;
    this.setMode(mode, true);
    this.updateMover();
    this.camBaseY = mode === 'car' ? this.phys.y : this.foot.y;
    this.occl = 1;
    this.placeCamera(0, true);
    this.env.setViewer?.(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    this.updateSun();
    // do not re-trigger the door we just came out of
    for (const tr of this.triggers) if (Math.hypot(this.mx - tr.def.x, this.mz - tr.def.z) < (tr.def.radius ?? 1.5) + 2.5) tr.armed = false;

    // ── charms, jobs, fx, HUD ──
    this.charms.refresh();
    this.skid.clear();
    this.fx.clear();
    this.jobs.reset();
    this.controls.releaseAll();
    this.controls.applySizes();
    this.openSheets = 0;
    this.controls.suspended = false;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.controls.showTouch(coarse || this.touchSeen);
    this.minimap.rebuild();
    this.tags.rebuild(store.data.town.houses);
    this.top.job.hide();
    this.promptTr = null;
    this.prompt.hide();
    this.top.setCharms(this.charms.collected, this.charms.total, nextReward());
    this.ownsHouse = store.data.town.houses.some((h) => h.ownerId === prof.id);
    this.emptyPlots = PLOTS.filter((p) => this.plotLayer!.empty.includes(p.index));
    this.homeAcc = 99;
    this.top.home.setMode(this.ownsHouse ? 'own' : this.emptyPlots.length ? 'build' : 'off');
    this.nudgeIn = !this.ownsHouse && this.emptyPlots.length && session.homeNudgeFor !== prof.id ? 1.8 : -1;

    this.listen(window, 'keydown', (e) => this.controls.onKeyDown(e));
    this.listen(window, 'keyup', (e) => this.controls.onKeyUp(e));
    this.listen(window, 'blur', () => this.controls.releaseAll());
    this.listen(
      window,
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') {
          this.touchSeen = true;
          this.controls.showTouch(true);
        }
      },
      { capture: true },
    );
    // Drag the 3D view to look around while walking.
    this.listen(scenes.canvas, 'pointerdown', (e) => this.controls.dragDown(e));
    this.listen(window, 'pointermove', (e) => this.controls.dragMove(e));
    this.listen(window, 'pointerup', (e) => this.controls.dragUp(e));
    this.listen(window, 'pointercancel', (e) => this.controls.dragUp(e));
    // Sheets (paint, the 🏠 menu) pause the steering so the car just rolls to a stop.
    this.onExit(bus.on('uiOpen', () => { this.openSheets++; this.controls.suspended = true; }));
    this.onExit(bus.on('uiClose', () => { this.openSheets = Math.max(0, this.openSheets - 1); this.controls.suspended = this.openSheets > 0; }));
    this.onExit(bus.on('charmCollected', () => this.top.setCharms(this.charms.collected, this.charms.total, nextReward())));

    if (this.mode === 'car') bus.emit('driveStart', {});
  }

  exit(): void {
    bus.emit('driveStop', {});
    // remember where everything is
    session.mode = this.mode;
    session.car = { x: this.phys.x, z: this.phys.z, heading: this.phys.heading };
    session.foot = { x: this.foot.x, z: this.foot.z, heading: this.foot.heading };
    this.controls.releaseAll();
    this.controls.suspended = false;
    this.openSheets = 0;
    this.jobs.clear();
    this.tags.clear();
    this.skid.clear();
    this.fx.clear();
    this.ripples.clear();
    this.plotLayer?.group.removeFromParent();
    this.plotLayer = null;
    if (this.content) {
      this.scene.remove(this.content);
      disposeBaked(this.content); // free the merged town meshes (rebuilt on every visit)
      this.content = null;
    }
  }

  resetStation(): void {
    this.leaving = false;
    this.phys.reset(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.foot.reset(SPAWN.x, SPAWN.z + 3, SPAWN.heading);
    this.setMode('car', false);
    this.camHeading = SPAWN.heading;
    this.applyCarPose(0, true);
    this.updateMover();
    this.camBaseY = this.phys.y;
    this.placeCamera(0, true);
  }

  debugInfo(): Record<string, string | number> {
    return {
      mode: this.mode === 'foot' ? (this.foot.swimming ? 'swim' : this.foot.wet > 0.1 ? 'wade' : 'foot') : this.mode,
      speed: this.phys.fwdSpeed.toFixed(1),
      pos: `${this.mx.toFixed(0)},${this.mz.toFixed(0)}`,
      y: (this.mode === 'car' ? this.phys.y : this.foot.y).toFixed(1),
      job: this.jobs.state,
      charms: `${this.charms.collected}/${this.charms.total}`,
      colls: this.grid ? this.grid.list.length : 0,
    };
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
    this.winW = w;
    this.winH = h;
    // Narrow / portrait windows get a wider view so the road ahead is still visible.
    const aspect = w / Math.max(1, h);
    this.fovScale = aspect < 1.5 ? 1 + (1.5 - aspect) * 0.45 : 1;
    this.fovNow = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  update(dt: number, t: number): void {
    this.simT = t;
    if (this.mode === 'car') this.updateCar(dt, t);
    else this.updateFoot(dt, t);
    this.updateMover();

    this.placeCamera(dt, false);
    this.env.setViewer?.(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    this.env.update(dt, t);
    tickBuildMaterials(t);

    const car = this.mode === 'car';
    const chestY = (car ? this.phys.y : this.foot.y) + (car ? 0.9 : 1.0);
    this.jobs.update(dt, t, this.mx, this.mz, car && !this.leaving);
    this.charms.update(dt, t, this.mx, chestY, this.mz, !this.leaving);
    this.doorLayer.update(t, this.mx, this.mz);
    for (const p of this.pads) p.update(t, this.mx, this.mz, !car);
    this.fx.update(dt, this.camera.quaternion);
    this.ripples.update(dt);
    this.lines.update(dt, car ? this.boostLevel : 0);
    this.checkTriggers(dt);
    this.updateSun();
    this.updateHud(dt, t);
  }

  /** Where the player is right now (car or feet). */
  private updateMover(): void {
    if (this.mode === 'car') {
      this.mx = this.phys.x;
      this.mz = this.phys.z;
    } else {
      this.mx = this.foot.x;
      this.mz = this.foot.z;
    }
  }

  // ── driving ───────────────────────────────────────────────────────────────
  private updateCar(dt: number, t: number): void {
    const d = tuning.drive;
    const p = this.phys;
    const raw: CarInput = this.leaving || this.controls.suspended ? NO_INPUT : this.controls.readCar();

    // the ⚡ meter: a tap fires a burst that lasts while the meter drains
    if (!this.boostOn && raw.boost && this.boostMeter >= 0.6 && p.grounded && !this.leaving) {
      this.boostOn = true;
      bus.emit('carBoost', { pos: { x: p.x, y: p.y + 1, z: p.z } });
    }
    if (this.boostOn) {
      this.boostMeter -= dt / d.boostSeconds;
      if (this.boostMeter <= 0) {
        this.boostMeter = 0;
        this.boostOn = false;
      }
    } else this.boostMeter = Math.min(1, this.boostMeter + dt / d.boostCooldown);
    this.boostLevel += ((this.boostOn ? 1 : 0) - this.boostLevel) * (1 - Math.exp(-7 * dt));
    this.controls.setBoostMeter(this.boostMeter, this.boostMeter >= 0.6 && !this.boostOn, this.boostOn);

    const input: CarInput = this.leaving || this.controls.suspended
      ? { steer: 0, gas: 0, brake: 0, handbrake: true, boost: false }
      : { steer: raw.steer, gas: raw.gas, brake: raw.brake, handbrake: raw.handbrake, boost: this.boostOn };

    // small fixed sub-steps so thin colliders never tunnel
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    let hit = 0, jumped = 0, landed = 0;
    for (let i = 0; i < steps; i++) {
      hit = Math.max(hit, p.step(h, input, this.grid));
      jumped = Math.max(jumped, p.jumped);
      landed = Math.max(landed, p.landed);
    }
    if (hit > 0) this.onImpact(hit);
    if (jumped > 0) bus.emit('carJump', { pos: { x: p.x, y: p.y + 1, z: p.z }, strength: clamp(jumped / 8, 0.3, 2.5) });
    if (landed > 0) {
      bus.emit('carLand', { pos: { x: p.x, y: p.y + 0.3, z: p.z }, strength: clamp(landed / 8, 0.3, 3) });
      this.car.bump(landed * 0.9);
    }

    // ── the car's body ──
    const m = this.motion;
    m.speed = p.fwdSpeed;
    m.speed01 = p.speed01;
    m.steer = p.steer;
    m.accel = p.accel;
    m.lateral = p.yawRate * p.fwdSpeed;
    m.braking = (input.brake > 0.05 && p.fwdSpeed > 0.5) || input.handbrake;
    m.boost = this.boostLevel;
    m.airborne = !p.grounded;
    m.slip = p.latSpeed;
    this.applyCarPose(dt, false);
    this.car.update(dt, t, m);
    this.driveEffects(dt, input);

    // The engine hum follows the car (juice listens).
    this.carUpdate.speed01 = p.speed01;
    this.carUpdate.throttle = p.throttle;
    bus.emit('carUpdate', this.carUpdate);
  }

  /** Put the car mesh on the physics pose, tilted to the ground (or the air). */
  private applyCarPose(dt: number, snap: boolean): void {
    const p = this.phys;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    let pitchT: number, rollT: number, k: number;
    if (p.grounded) {
      const gF = groundHeight(p.x + fx * 1.6, p.z + fz * 1.6), gR = groundHeight(p.x - fx * 1.5, p.z - fz * 1.5);
      const gRt = groundHeight(p.x + rx * 0.8, p.z + rz * 0.8), gLt = groundHeight(p.x - rx * 0.8, p.z - rz * 0.8);
      pitchT = clamp(Math.atan2(gF - gR, 3.1), -0.55, 0.55);
      rollT = clamp(Math.atan2(gRt - gLt, 1.6), -0.4, 0.4);
      k = snap ? 1 : 1 - Math.exp(-14 * dt);
    } else {
      pitchT = clamp(p.vy * 0.022, -0.45, 0.45);
      rollT = 0;
      k = 1 - Math.exp(-3.5 * dt);
    }
    this.pitch += (pitchT - this.pitch) * k;
    this.roll += (rollT - this.roll) * k;
    this.car.setPose(p.x, p.y + this.dropY, p.z, p.heading, this.pitch, this.roll);
  }

  /** Skid marks, tyre smoke, boost flames, sparkle trail. */
  private driveEffects(dt: number, input: CarInput): void {
    const d = tuning.drive;
    const p = this.phys;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    const slip = Math.abs(p.latSpeed);
    const skidding = p.grounded && Math.abs(p.fwdSpeed) > 3 && (p.drifting || slip > d.skidSlip || (input.handbrake && p.fwdSpeed > 12));
    for (let w = 0; w < 2; w++) {
      const s = w === 0 ? -1 : 1;
      const wx = p.x - fx * 1.3 + rx * 0.8 * s, wz = p.z - fz * 1.3 + rz * 0.8 * s;
      this.skid.stamp(w, wx, p.y, wz, skidding);
      if (skidding) {
        this.smokeAcc += dt;
        if (this.smokeAcc > 0.045) {
          this.smokeAcc = 0;
          this.fx.puff(wx, p.y + 0.15, wz, -p.vx, -p.vz);
        }
      }
    }
    if (skidding) {
      const now = performance.now();
      if (now - this.lastSkid > 650) {
        this.lastSkid = now;
        bus.emit('carSkid', { pos: { x: p.x, y: p.y, z: p.z }, strength: clamp(slip / 8 + (p.drifting ? 0.4 : 0), 0.3, 1) });
      }
    } else this.lastSkid = 0;
    // boost flames from the exhausts
    if (this.boostOn && this.boostLevel > 0.3) {
      this.flameAcc += dt;
      if (this.flameAcc > 0.02) {
        this.flameAcc = 0;
        for (const s of [-1, 1]) this.fx.flames(p.x - fx * 2.1 + rx * 0.45 * s, p.y + 0.5, p.z - fz * 2.1 + rz * 0.45 * s, -fx, -fz, s < 0 ? '#ffb347' : '#00d4ff');
      }
    }
    // sparkle trail (a bonus paint option)
    if (this.car.currentStyle.trail && Math.abs(p.fwdSpeed) > 2.5) {
      this.trailAcc += dt;
      while (this.trailAcc > 0.022) {
        this.trailAcc -= 0.022;
        this.fx.sparkle(p.x - fx * (2.2 + Math.random()) + (Math.random() - 0.5) * 1.4, p.y + 0.4 + Math.random() * 0.5, p.z - fz * (2.2 + Math.random()) + (Math.random() - 0.5) * 1.4, SPARKLE_COLORS[(Math.random() * SPARKLE_COLORS.length) | 0]);
      }
    }
  }

  // ── walking ───────────────────────────────────────────────────────────────
  private updateFoot(dt: number, t: number): void {
    const f = this.foot;
    f.time = t;

    // look around: drag, and gently swing behind you when you walk off to the side
    this.controls.takeLook(this.lookTmp);
    if (this.lookTmp.yaw !== 0 || this.lookTmp.pitch !== 0) this.dragIdle = 0;
    else this.dragIdle += dt;
    this.camYaw += this.lookTmp.yaw;
    this.camPitch = clamp(this.camPitch + this.lookTmp.pitch, -0.12, 0.75);
    const inp = this.controls.readFoot(this.camYaw);
    if (!this.controls.dragging && this.dragIdle > 0.8 && inp.mag > 0.15 && f.speed > 1.2) {
      const diff = wrapAngle(f.heading - this.camYaw);
      if (Math.abs(diff) < 2.3) this.camYaw += diff * Math.min(1, dt * 1.5) * inp.mag;
    }

    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    let jumped = false, landed = 0, kicked = false, splash = 0, rescued = false;
    const run = inp.run;
    for (let i = 0; i < steps; i++) {
      f.step(h, inp.dx, inp.dz, inp.mag, run, inp.jump, this.grid);
      this.pushFromCar();
      jumped = jumped || f.jumped;
      landed = Math.max(landed, f.landed);
      kicked = kicked || f.kicked;
      splash = Math.max(splash, f.splash);
      rescued = rescued || f.rescued;
    }
    const w = this.walker;
    w.group.position.set(f.x, f.y, f.z);
    w.group.rotation.y = Math.PI - f.heading;
    w.setSwim(f.swim01);
    w.setMove(f.swimming ? f.stroke01 : f.move01, f.grounded || f.swimming);
    if (jumped) w.jump();
    if (landed > 5 && f.wet < 0.1) bus.emit('footstep', { pos: { x: f.x, y: f.y, z: f.z }, run: true });
    this.waterFx(dt, t, splash, kicked);
    if (rescued) toast('Whoosh! Back on the shore 🏖️');
    w.update(dt, t);

    // the parked car just sits there (or bounces, if it was just called)
    this.stepCarDrop(dt);
    this.car.update(dt, t, this.motion);
  }

  /** Splashes, ripples and strokes for a walker in the water (the sounds and droplets are juice's, via waterSplash). */
  private waterFx(dt: number, t: number, splash: number, kicked: boolean): void {
    const f = this.foot, d = tuning.drive;
    const sy = waveY(f.x, f.z, t);
    const at = { x: f.x, y: sy, z: f.z };
    if (splash > 0) {
      const s = clamp(splash / 9, 0.3, 1.6);
      bus.emit('waterSplash', { pos: at, strength: s, kind: 'enter' });
      this.ripples.add(f.x, sy + 0.05, f.z, 1.7 + s, 1.1);
      this.ripples.add(f.x, sy + 0.05, f.z, 1.0 + s * 0.6, 0.8);
    } else if (f.swimming && !this.wasSwim) {
      // waded out of the shallows into the deep: a little plunge
      bus.emit('waterSplash', { pos: at, strength: 0.5, kind: 'enter' });
      this.ripples.add(f.x, sy + 0.05, f.z, 1.8, 1.0);
    }
    if (kicked) {
      bus.emit('waterSplash', { pos: at, strength: 0.8, kind: 'kick' });
      this.ripples.add(f.x, sy + 0.05, f.z, 1.5, 0.9);
    }
    const wetNow = f.wet > 0.1;
    if (wetNow && !this.wasWet && !f.swimming && splash === 0) {
      // the first step into the water
      bus.emit('waterSplash', { pos: at, strength: 0.7, kind: 'wade' });
      this.ripples.add(f.x, sy + 0.05, f.z, 1.1, 0.8);
    }
    this.wasWet = wetNow;
    this.wasSwim = f.swimming;
    // strokes while swimming
    if (f.swimming && f.speed > 0.7 && f.grounded) {
      this.strokeAcc += dt * clamp(f.speed / d.swimSpeed, 0.5, 1.6);
      if (this.strokeAcc >= d.swimStroke) {
        this.strokeAcc = 0;
        const hx = Math.sin(f.heading), hz = -Math.cos(f.heading);
        const px = f.x + hx * 0.5, pz = f.z + hz * 0.5;
        bus.emit('waterSplash', { pos: { x: px, y: sy, z: pz }, strength: 0.5, kind: 'stroke' });
        this.ripples.add(px, sy + 0.05, pz, 1.2, 0.9);
      }
    } else this.strokeAcc = Math.min(this.strokeAcc, d.swimStroke * 0.6);
  }

  /** The parked car is solid for walkers. */
  private pushFromCar(): void {
    const p = this.phys, f = this.foot;
    if (Math.abs(f.y - p.y) > 1.5) return;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const r = tuning.drive.footRadius;
    for (const o of [-1.4, 0, 1.4]) {
      this.carCircle.x = p.x + sh * o;
      this.carCircle.z = p.z - ch * o;
      if (!pushOut(this.carCircle, f.x, f.z, r)) continue;
      f.x += res.nx * res.pen;
      f.z += res.nz * res.pen;
    }
  }

  // ── hopping out / in ──────────────────────────────────────────────────────
  private toggleMode(): void {
    if (this.leaving || this.controls.suspended) return;
    if (this.mode === 'car') this.getOut();
    else this.getIn();
  }

  private footFree(x: number, z: number, refY: number): boolean {
    const d = tuning.drive;
    const gy = groundHeight(x, z, true);
    if (gy < d.waterWade + 0.05 || Math.abs(gy - refY) > d.stepUp + 0.4) return false;
    const cols = this.grid.near(x, z, d.footRadius + 1);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.only === 'car') continue;
      if (c.h !== undefined && refY > c.h - 0.4) continue;
      if (pushOut(c, x, z, d.footRadius + 0.1)) return false;
    }
    return true;
  }

  private getOut(): void {
    const d = tuning.drive;
    const p = this.phys;
    if (!p.grounded || Math.abs(p.fwdSpeed) > d.getOutMaxSpeed) {
      toast('Slow down to hop out 🚗');
      return;
    }
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    const tries: [number, number, number][] = [[-rx, -rz, 2.2], [rx, rz, 2.2], [-fx, -fz, 3.6], [fx, fz, 3.8], [-rx, -rz, 3.4], [rx, rz, 3.4]];
    let sx = p.x - rx * 2.2, sz = p.z - rz * 2.2;
    for (const [dx, dz, dist] of tries) {
      const x = p.x + dx * dist, z = p.z + dz * dist;
      if (this.footFree(x, z, p.y)) {
        sx = x;
        sz = z;
        break;
      }
    }
    p.vx = p.vz = p.fwdSpeed = 0;
    this.boostOn = false;
    this.foot.reset(sx, sz, p.heading);
    // stepping out onto a mat must not trigger it: it stays asleep until you step off and back on
    for (const tr of this.triggers) if (Math.hypot(sx - tr.def.x, sz - tr.def.z) < (tr.def.radius ?? 1.5) + 2.5) tr.armed = false;
    this.camYaw = p.heading;
    this.camPitch = 0.12;
    this.dragIdle = 0;
    this.setMode('foot', false);
    this.walker.hop();
    bus.emit('optionPicked', { pos: { x: p.x, y: p.y + 1.4, z: p.z } });
  }

  private getIn(): void {
    const d = tuning.drive;
    const p = this.phys, f = this.foot;
    if (Math.hypot(f.x - p.x, f.z - p.z) > d.getInRadius) {
      toast('Walk up to your car to hop in 🚗');
      return;
    }
    this.setMode('car', false);
    this.camHeading = p.heading;
    popScale(this.car.driver.group, 0.3, 0.16);
    this.car.bump(4);
    bus.emit('optionPicked', { pos: { x: p.x, y: p.y + 1.4, z: p.z } });
  }

  // ── 🚗 bring the car to me ─────────────────────────────────────────────────
  /** Is (x, z) a good place to park the car facing hd? Dry, level, not on stairs / decks, nothing in the way, not on a mat or pad. */
  private carSpotOk(x: number, z: number, hd: number): boolean {
    const d = tuning.drive;
    const fx = Math.sin(hd), fz = -Math.cos(hd), rx = Math.cos(hd), rz = Math.sin(hd);
    const y0 = groundHeight(x, z);
    if (Math.abs(y0 - this.foot.y) > 3.5) return false; // a different level (a bridge over this street...)
    for (const [a, b] of [[0, 0], [1.9, 0], [-1.9, 0], [0, 1.0], [0, -1.0], [1.9, 1.0], [1.9, -1.0], [-1.9, 1.0], [-1.9, -1.0]]) {
      const px = x + fx * a + rx * b, pz = z + fz * a + rz * b;
      const g = groundHeight(px, pz);
      if (g < WATER_Y + 0.25) return false; // water, or the wet edge of the shore
      if (Math.abs(g - y0) > 0.55) return false; // a kerb, ramp or step under the car
      if (groundHeight(px, pz, true) - g > 0.25 || railedAt(px, pz)) return false; // stairs / a roof deck
    }
    // gentle slope
    if (Math.abs(groundHeight(x + fx * 1.8, z + fz * 1.8) - groundHeight(x - fx * 1.8, z - fz * 1.8)) > 1.4) return false;
    // nothing solid under the three circles the car is made of
    for (const o of [-1, 0, 1]) {
      const cx = x + fx * o, cz = z + fz * o;
      const cols = this.grid.near(cx, cz, d.carRadius + 2);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.only === 'foot') continue;
        if (c.h !== undefined && y0 > c.h + 0.2) continue;
        if (pushOut(c, cx, cz, d.carRadius + 0.25)) return false;
      }
    }
    // never on a door mat, a FOR SALE lot or the Studio / builder pads
    for (const tr of this.triggers) if (Math.hypot(x - tr.def.x, z - tr.def.z) < (tr.def.radius ?? 1.5) + 3.4) return false;
    // not right on top of the walker
    return Math.hypot(x - this.foot.x, z - this.foot.z) >= 2.6;
  }

  private callCar(): void {
    const d = tuning.drive;
    if (this.mode !== 'foot' || this.leaving || this.controls.suspended) return;
    const now = performance.now();
    if (now - this.lastCall < d.callCooldown * 1000) return;
    const f = this.foot;
    const hd = f.heading;
    // ahead, a little nearer / farther, ahead-left / right, to the sides, then behind
    const tries: [number, number][] = [
      [0, d.callDistance], [0, d.callDistance - 1], [0, d.callDistance + 1.2],
      [0.6, d.callDistance + 0.4], [-0.6, d.callDistance + 0.4], [0.6, d.callDistance + 1.4], [-0.6, d.callDistance + 1.4],
      [1.2, d.callDistance], [-1.2, d.callDistance], [Math.PI, d.callDistance + 0.5], [2.3, d.callDistance + 0.5], [-2.3, d.callDistance + 0.5],
    ];
    let spot: { x: number; z: number } | null = null;
    for (const [da, dist] of tries) {
      const a = hd + da;
      const x = f.x + Math.sin(a) * dist, z = f.z - Math.cos(a) * dist;
      if (this.carSpotOk(x, z, hd)) {
        spot = { x, z };
        break;
      }
    }
    if (!spot) {
      toast('No room for the car here — try an open street 🚗');
      return;
    }
    this.lastCall = now;
    const p = this.phys;
    bus.emit('carVanish', { pos: { x: p.x, y: p.y + 0.8, z: p.z } });
    p.reset(spot.x, spot.z, hd);
    this.pitch = this.roll = 0;
    this.dropY = 3.2;
    this.dropV = 0;
    this.promptHold = true;
    this.setPrompt(null);
    // landing next to a mat must not trigger it when you get in: they sleep until you step off
    for (const tr of this.triggers) if (Math.hypot(spot.x - tr.def.x, spot.z - tr.def.z) < (tr.def.radius ?? 1.5) + 4) tr.armed = false;
    this.applyCarPose(0, true);
    bus.emit('carAppear', { pos: { x: spot.x, y: p.y + 0.6, z: spot.z } });
  }

  /** The called car drops in with a couple of little bounces. */
  private stepCarDrop(dt: number): void {
    if (this.dropY <= 0 && this.dropV === 0) return;
    this.dropV -= 38 * dt;
    this.dropY += this.dropV * dt;
    if (this.dropY <= 0) {
      this.dropY = 0;
      if (this.dropV < -3.5) {
        const p = this.phys;
        this.car.bump(Math.min(10, -this.dropV));
        bus.emit('carLand', { pos: { x: p.x, y: p.y + 0.3, z: p.z }, strength: clamp(-this.dropV / 14, 0.3, 1) });
        this.dropV = -this.dropV * 0.28;
      } else this.dropV = 0;
    }
    this.applyCarPose(dt, false);
  }

  private setMode(mode: 'car' | 'foot', initial: boolean): void {
    const was = this.mode;
    this.mode = mode;
    this.setPrompt(null);
    const car = mode === 'car';
    this.walker.group.visible = !car;
    this.car.setDriverVisible(car);
    this.controls.setMode(mode);
    const ico = this.modeBtn.querySelector('.ico');
    if (ico) ico.textContent = car ? '🚶' : '🚪'; // on foot the 🚗 button calls the car; this one hops in
    this.modeBtn.title = car ? 'Get out (E)' : 'Get in (E)';
    this.callBtn.style.display = car ? 'none' : '';
    if (!car) {
      this.boostOn = false;
      this.boostLevel = 0;
      this.motion.boost = 0;
      this.skid.stamp(0, 0, 0, 0, false);
      this.skid.stamp(1, 0, 0, 0, false);
      this.occl = 1;
      this.camBaseY = this.foot.y;
    } else this.camBaseY = this.phys.y;
    if (!initial && was !== mode) bus.emit(car ? 'driveStart' : 'driveStop', {});
    // the parked car stops humming, and its driver sits out
    this.carMarker.visible = false;
  }

  // ── events from the car ───────────────────────────────────────────────────
  private onImpact(speed: number): void {
    const d = tuning.drive;
    if (speed < d.collideMinSpeed) return;
    const now = performance.now();
    if (now - this.lastHit < d.collideCooldownMs) return;
    this.lastHit = now;
    bus.emit('carCollide', { pos: { x: this.phys.impactX, y: this.phys.y + 0.8, z: this.phys.impactZ }, speed });
    this.car.bump(speed);
  }

  private honk(): void {
    const now = performance.now();
    if (now - this.lastHorn < tuning.drive.hornCooldownMs || this.leaving || this.mode !== 'car') return;
    this.lastHorn = now;
    bus.emit('horn', { pos: { x: this.phys.x, y: this.phys.y + 1.4, z: this.phys.z } });
    this.car.honk();
    this.jobs.onHorn(this.phys.x, this.phys.z);
  }

  // ── doors, pads, mats ─────────────────────────────────────────────────────
  private checkTriggers(dt: number): void {
    if (this.leaving) {
      this.setPrompt(null);
      // If the scene change was refused (another one in flight), try again shortly.
      this.leaveT += dt;
      if (this.leaveT > 1.4) this.leaving = false;
      return;
    }
    const onFoot = this.mode === 'foot';
    const speed = this.phys.fwdSpeed;
    let prompt: Trigger | null = null;
    for (const tr of this.triggers) {
      const def = tr.def;
      const dist = Math.hypot(this.mx - def.x, this.mz - def.z);
      const R = (def.radius ?? 1.5) + (onFoot ? 0 : 0.9);
      // a car on a FOR SALE mat never claims by itself: it gets a big "Build here?" bubble until it drives off
      if (!onFoot && def.carPrompt) {
        if (this.promptHold) {
          // a car that was just called here stays quiet until it has moved off
          if (Math.abs(speed) > 1 || dist > R + 1.5) this.promptHold = false;
          else continue;
        }
        if (dist < (this.promptTr === tr ? R + 1.2 : R) && this.phys.grounded && !prompt) prompt = tr;
        continue;
      }
      // after coming back out of a place (or a visit toast) the mat stays asleep until you step off it
      if (!tr.armed) {
        if (dist > R + 0.8) tr.armed = true;
        continue;
      }
      if (dist >= R) continue;
      if (onFoot ? def.carOnly : def.carSpeed === undefined || Math.abs(speed) > def.carSpeed) continue;
      if (!this.phys.grounded && !onFoot) continue;
      if (def.scene === null) {
        tr.armed = false;
        toast(`${def.visitor ?? 'Someone'}'s house 🏠`);
        bus.emit('uiTap', { kind: 'soft' });
        continue;
      }
      this.setPrompt(null);
      this.enterPlace(tr, onFoot);
      return;
    }
    this.setPrompt(onFoot ? null : prompt);
  }

  private setPrompt(tr: Trigger | null): void {
    if (tr === this.promptTr) return;
    this.promptTr = tr;
    if (tr) this.prompt.show(tr.def.icon, 'Build here?', () => this.confirmPrompt());
    else this.prompt.hide();
  }

  /** Tap (or Enter) on the "Build here?" bubble. */
  private confirmPrompt(): void {
    const tr = this.promptTr;
    if (!tr || this.leaving || this.mode !== 'car' || this.controls.suspended) return;
    this.setPrompt(null);
    this.enterPlace(tr, false);
  }

  private enterPlace(tr: Trigger, onFoot: boolean): void {
    const def = tr.def;
    this.leaving = true;
    this.leaveT = 0;
    // where to appear when we come back
    if (tr.exit) session.exit = { mode: onFoot ? 'foot' : 'car', ...tr.exit };
    else if (onFoot) session.exit = { mode: 'foot', x: def.x + def.nx * 2.6, z: def.z + def.nz * 2.6, heading: Math.atan2(def.nx, -def.nz) };
    else session.exit = { mode: 'car', x: this.phys.x, z: this.phys.z, heading: this.phys.heading };
    // exiting on foot from a pad that has a street exit: keep the car where it is
    const pos = { x: this.mx, y: 1, z: this.mz };
    if (def.scene === 'workshop') bus.emit('arriveWorkshop', { pos });
    else if (def.scene === 'build') bus.emit('arriveBuild', { pos });
    else bus.emit('uiTap', { kind: 'big' });
    void scenes.go(def.scene as 'workshop' | 'dressup' | 'build', def.params);
  }

  // ── camera ────────────────────────────────────────────────────────────────
  private placeCamera(dt: number, snap: boolean): void {
    const d = tuning.drive;
    if (this.mode === 'car') this.placeChaseCamera(dt, snap);
    else this.placeFootCamera(dt, snap);

    // never inside the ground
    const foot = this.mode === 'foot';
    const gy = groundHeight(this.camPos.x, this.camPos.z, foot);
    if (this.camPos.y < gy + 1.4) this.camPos.y = gy + 1.4;
    // ...and never below the water surface (over the lake, the sea, or following a swimmer)
    if (groundHeight(this.camPos.x, this.camPos.z, foot, true) < WATER_Y - 0.1) {
      const minY = waveY(this.camPos.x, this.camPos.z, this.simT) + 0.9;
      if (this.camPos.y < minY) this.camPos.y = minY;
    }
    // ...and never looking at the player THROUGH the ground (a ramp, a hill, a half-pipe wall):
    // rise until the sightline from their head clears every surface in between
    const sx = foot ? this.foot.x : this.phys.x, sz = foot ? this.foot.z : this.phys.z;
    const sy = (foot ? this.foot.y : this.phys.y) + (foot ? 1.3 : 1.0);
    let need = -Infinity;
    for (let i = 2; i <= 8; i++) {
      const t = i / 8;
      const g = groundHeight(sx + (this.camPos.x - sx) * t, sz + (this.camPos.z - sz) * t, foot) + 0.35;
      if (g > sy + (this.camPos.y - sy) * t) need = Math.max(need, sy + (g - sy) / t);
    }
    if (need > this.camPos.y) {
      need = Math.min(need, sy + 8);
      this.camPos.y += (need - this.camPos.y) * (snap ? 1 : 1 - Math.exp(-14 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(sx, sy - 0.2, sz);
    }
    this.camera.position.copy(this.camPos);

    // FOV: a touch wider at speed, a big kick on boost
    const base = this.mode === 'car' ? d.cameraFov + d.cameraFovBoost * this.phys.speed01 + d.boostFov * this.boostLevel : d.cameraFov + 4;
    const fov = base * this.fovScale;
    if (Math.abs(fov - this.fovNow) > 0.05) {
      this.fovNow = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private placeChaseCamera(dt: number, snap: boolean): void {
    const d = tuning.drive;
    const p = this.phys;
    const k = snap ? 1 : 1 - Math.exp(-d.cameraLag * dt);
    this.camHeading = lerpAngle(this.camHeading, p.heading, k);
    this.camBaseY += (p.y - this.camBaseY) * (snap ? 1 : 1 - Math.exp(-(p.grounded ? 5 : 2) * dt));
    const bx = -Math.sin(this.camHeading), bz = Math.cos(this.camHeading); // unit vector behind the camera heading

    // Never inside a building: shorten the arm when a box is in the way.
    const dist = d.cameraFollowDistance * (1 + this.boostLevel * 0.1);
    const tx = p.x + bx * dist, tz = p.z + bz * dist;
    const free = this.freeFraction(p.x, p.z, tx, tz, this.camBaseY + d.cameraHeight);
    const minFrac = clamp(d.cameraMinDistance / dist, 0.1, 1);
    const target = Math.max(minFrac, free);
    if (snap) this.occl = target;
    else if (target < this.occl) this.occl += (target - this.occl) * (1 - Math.exp(-16 * dt));
    else this.occl += (target - this.occl) * (1 - Math.exp(-2.5 * dt));
    const f = this.occl;
    this.camWant.set(p.x + bx * dist * f, this.camBaseY + d.cameraHeight - this.boostLevel * 0.7 + (1 - f) * 4, p.z + bz * dist * f);

    const kp = snap ? 1 : 1 - Math.exp(-d.cameraLag * d.cameraPosLag * dt);
    this.camPos.lerp(this.camWant, kp);
    if (snap) this.camPos.copy(this.camWant);
    this.keepOutOfBoxes();
    // a little rumble when boosting
    const shake = this.boostLevel * 0.05;
    if (shake > 0.002) this.camPos.y += (Math.random() - 0.5) * shake;

    this.camera.position.copy(this.camPos);
    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
    const lookY = this.camBaseY * 0.55 + p.y * 0.45 + d.cameraLookHeight;
    this.camera.lookAt(p.x + fx * d.cameraLookAhead, lookY, p.z + fz * d.cameraLookAhead);
  }

  private placeFootCamera(dt: number, snap: boolean): void {
    const d = tuning.drive;
    const f = this.foot;
    // a swimmer is filmed from the water line, not from the sunken feet
    const ref = f.y + f.swim01 * (WATER_Y - 0.1 - f.y);
    this.camBaseY += (ref - this.camBaseY) * (snap ? 1 : 1 - Math.exp(-6 * dt));
    const bx = -Math.sin(this.camYaw), bz = Math.cos(this.camYaw);
    const dist = d.footCamDistance * (1 + this.camPitch * 0.25);
    const wantY = this.camBaseY + d.footCamHeight + this.camPitch * 4.2;
    const free = this.freeFraction(f.x, f.z, f.x + bx * dist, f.z + bz * dist, wantY);
    const target = Math.max(0.28, free);
    if (snap) this.occl = target;
    else if (target < this.occl) this.occl += (target - this.occl) * (1 - Math.exp(-18 * dt));
    else this.occl += (target - this.occl) * (1 - Math.exp(-3 * dt));
    const fr = this.occl;
    // squeezed in (a corridor, a doorway): come in close and rise above it, looking down
    this.camWant.set(f.x + bx * dist * fr, wantY + (1 - fr) * 4.2, f.z + bz * dist * fr);
    const kp = snap ? 1 : 1 - Math.exp(-d.footCamLag * dt);
    this.camPos.lerp(this.camWant, kp);
    if (snap) this.camPos.copy(this.camWant);
    this.keepOutOfBoxes();
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(f.x, this.camBaseY * 0.4 + f.y * 0.6 + d.footCamLook, f.z);
  }

  /** Last line of defence: keep the lens outside every building box (lagging around corners). */
  private keepOutOfBoxes(): void {
    const cols = this.grid.near(this.camPos.x, this.camPos.z, 6);
    for (let i = 0; i < cols.length; i++) {
      const b = cols[i];
      if (b.kind !== 'box' || b.only === 'foot') continue;
      const ox = b.hw + 0.8 - Math.abs(this.camPos.x - b.x), oz = b.hd + 0.8 - Math.abs(this.camPos.z - b.z);
      if (ox <= 0 || oz <= 0) continue;
      if (b.h !== undefined && b.h - groundHeight(b.x, b.z) < 4.5) {
        // a low wall or hedge: rise over it instead of sliding into the next corridor
        if (this.camPos.y < b.h + 0.4) this.camPos.y = b.h + 0.4;
      } else if (b.h !== undefined && this.camPos.y > b.h + 0.3) {
        continue; // above a roof (walking on the mall)
      } else if (this.camPos.y < 14) {
        if (ox < oz) this.camPos.x += (this.camPos.x >= b.x ? 1 : -1) * ox;
        else this.camPos.z += (this.camPos.z >= b.z ? 1 : -1) * oz;
      }
    }
  }

  /** Fraction (0..1) of the segment a→b that is free of boxes (padded by the camera's radius). */
  private freeFraction(ax: number, az: number, bx: number, bz: number, yLevel: number): number {
    let best = 1;
    const dx = bx - ax, dz = bz - az;
    const cols = this.grid.near((ax + bx) / 2, (az + bz) / 2, Math.hypot(dx, dz) / 2 + 2);
    for (let i = 0; i < cols.length; i++) {
      const b = cols[i];
      if (b.kind !== 'box' || b.only === 'foot') continue;
      if (b.h !== undefined && yLevel > b.h + 0.5) continue;
      const pad = 0.8;
      let t0 = 0, t1 = 1;
      // slab test on x and z
      for (let axis = 0; axis < 2; axis++) {
        const o = axis === 0 ? ax : az;
        const dd = axis === 0 ? dx : dz;
        const lo = (axis === 0 ? b.x - b.hw : b.z - b.hd) - pad;
        const hi = (axis === 0 ? b.x + b.hw : b.z + b.hd) + pad;
        if (Math.abs(dd) < 1e-6) {
          if (o < lo || o > hi) {
            t0 = 2;
            break;
          }
        } else {
          let ta = (lo - o) / dd, tb = (hi - o) / dd;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) break;
        }
      }
      if (t0 <= t1 && t0 < best) best = Math.max(0, t0 - 0.04);
    }
    return best;
  }

  // ── the sun follows the player (snapped to shadow texels so nothing shimmers) ─
  private updateSun(): void {
    const d = tuning.drive;
    const heading = this.mode === 'car' ? this.camHeading : this.camYaw;
    const ahead = this.mode === 'car' ? d.shadowAhead : d.shadowAhead * 0.5;
    let fx = this.mx + Math.sin(heading) * ahead;
    let fz = this.mz - Math.cos(heading) * ahead;
    const texel = (d.shadowSize * 2) / this.sun.shadow.mapSize.x;
    // snap the focus point in light space
    const a = fx * this.lightX.x + fz * this.lightX.z;
    const b = fx * this.lightY.x + fz * this.lightY.z;
    const sa = Math.round(a / texel) * texel - a;
    const sb = Math.round(b / texel) * texel - b;
    fx += sa * this.lightX.x + sb * this.lightY.x;
    fz += sa * this.lightX.z + sb * this.lightY.z;
    const fy = this.mode === 'car' ? this.phys.y : this.foot.y;
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + SUN_DIR.x * 120, fy + SUN_DIR.y * 120, fz + SUN_DIR.z * 120);
    const s = this.sun.shadow.camera;
    if (Math.abs(s.right - d.shadowSize) > 0.01) {
      s.left = -d.shadowSize;
      s.right = d.shadowSize;
      s.top = d.shadowSize;
      s.bottom = -d.shadowSize;
      s.updateProjectionMatrix();
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  private updateHud(dt: number, t: number): void {
    const d = tuning.drive;
    const car = this.mode === 'car';
    this.camera.getWorldDirection(this.camDir);
    const camHeading = Math.atan2(this.camDir.x, -this.camDir.z);
    const bearing = (x: number, z: number): number => wrapAngle(Math.atan2(x - this.mx, -(z - this.mz)) - camHeading);

    // 💎 counter
    this.top.setCharms(this.charms.collected, this.charms.total, nextReward());

    // the job bubble
    const target = this.jobs.target;
    if (target) this.top.job.show(target.icon, `${target.name}!`, target.kind, bearing(target.x, target.z));
    else this.top.job.hide();

    // the home guide: nearest empty lot until you own a house, then a button to find it
    this.homeAcc += dt;
    if (this.homeAcc > 0.4) {
      this.homeAcc = 0;
      this.homeTarget = null;
      if (this.ownsHouse) {
        const own = store.data.town.houses.find((h) => h.ownerId === store.profile.id);
        const plot = own ? PLOTS[own.plot] : undefined;
        if (plot) {
          const fr = plotFront(plot);
          this.homeTarget = { x: fr.x, z: fr.z };
        }
      } else {
        let best = Infinity;
        for (const pl of this.emptyPlots) {
          const fr = plotFront(pl);
          const dd = Math.hypot(fr.x - this.mx, fr.z - this.mz);
          if (dd < best) {
            best = dd;
            this.homeTarget = { x: fr.x, z: fr.z };
          }
        }
      }
    }
    if (this.homeTarget) this.top.home.point(bearing(this.homeTarget.x, this.homeTarget.z), Math.hypot(this.homeTarget.x - this.mx, this.homeTarget.z - this.mz));
    if (this.nudgeIn > 0) {
      this.nudgeIn -= dt;
      if (this.nudgeIn <= 0) {
        this.nudgeIn = -1;
        session.homeNudgeFor = store.profile.id;
        toast('Pick a lot in Home Hills and build your home! 🏠');
      }
    }

    // minimap (30 Hz)
    this.mapAcc += dt;
    if (this.mapAcc >= 1 / 30) {
      this.mapAcc = 0;
      this.charms.nearby(this.mx, this.mz, d.charmMapRange, this.nearCharms);
      this.minimap.draw({
        x: this.mx,
        z: this.mz,
        heading: car ? this.phys.heading : this.foot.heading,
        color: store.profile.carColor,
        car: car ? null : { x: this.phys.x, z: this.phys.z },
        target,
        charms: this.nearCharms,
        emptyPlots: this.ownsHouse ? null : this.emptyPlots,
        home: this.top.home.showsArrowToHome ? this.homeTarget : null,
        t,
      });
    }

    // the parked car marker + the get-in button glow
    if (!car) {
      const dc = Math.hypot(this.foot.x - this.phys.x, this.foot.z - this.phys.z);
      this.carMarker.visible = dc > 9;
      if (this.carMarker.visible) {
        this.carMarker.position.set(this.phys.x, this.phys.y + 3.6 + Math.sin(t * 2.4) * 0.25, this.phys.z);
        const s = 2.2 + Math.min(1.6, dc / 60);
        this.carMarker.scale.set(s, s, 1);
      }
      this.modeBtn.classList.toggle('near', dc <= d.getInRadius);
    } else {
      this.carMarker.visible = false;
      this.modeBtn.classList.remove('near');
    }

    this.tags.update(this.camera, this.mx, this.mz, this.winW, this.winH);
  }

  // ── 🎨 paint shop ─────────────────────────────────────────────────────────
  private openPaint(): void {
    openPaintSheet(this.car, { x: this.phys.x, y: this.phys.y + 1.6, z: this.phys.z });
  }
}

