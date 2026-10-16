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
import { Ride, RIDE_INFO, DEFAULT_STYLE, rideSpec, type RideKind, type RideFinish, type RideMotion } from '../drive/rides';
import { Character } from '../art/character';
import { buildTownEnvironment, type Collider, type TownEnv } from '../world/townEnv';
import { buildTownContent, disposeBaked, tickBuildMaterials } from '../world/houseMesh';
import { BUILD_YARD, PLOTS, SPAWN, WATER_Y, WORKSHOP, plotFront } from '../world/townLayout';
import { groundHeight, railedAt, waveY } from '../world/heightfield';
import { surfaceBelow } from '../world/buildSpace';   // v3 rides: parked rides + hop-out spots respect the player's builds
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
import { Blobs, Particles, Ripples, SkidMarks, SpeedLines } from '../drive/effects';
import { openPaintSheet } from '../drive/paint';
import { defaultLocker } from '../core/model';
import { SUN_DIR } from '../drive/sky';
import { PAL } from '../drive/palette';
import { emojiSprite, emojiTexture, clamp, lerpAngle, wrapAngle } from '../drive/envUtils';
import * as Layout from '../world/townLayout';
import type { DoorDef } from '../drive/types';
import { BuildMode } from '../build/world3/mode';   // v3 build
import { EmoteWheel } from '../drive/emotewheel';   // v3 emote
import { Movement } from '../drive/movement';   // ── v3 movement ── over-the-shoulder cam, sprint, mantle, glide, pads, bus drop, POI cards

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
  /** v3 rides: every ride in the world and where it is parked (the last driven one is flagged active) */
  rides: [] as SavedRide[],
};
interface SavedRide { kind: RideKind; x: number; z: number; heading: number; mine: boolean; active: boolean; y?: number }

/** Where a car lands when it returns from the Studio pad / the builder pad. */
const STUDIO_EXIT: Pose = { x: WORKSHOP.pad.x - 8, z: 2.6, heading: Math.PI / 2 };
const BUILD_EXIT: Pose = { x: BUILD_YARD.pad.x + 4, z: 2.6, heading: Math.PI / 2 };

interface Trigger {
  def: DoorDef;
  armed: boolean;
  exit?: Pose;
}

/** A ride standing in the world (v3 rides). Its pose is x, z, heading; y follows the surface. */
interface WorldRide {
  ride: Ride;
  kind: RideKind;
  x: number;
  z: number;
  heading: number;
  /** the player's own ride (the Locker's favourite — what the 🚗 button brings) */
  mine: boolean;
  /** the surface it stands on (ground or a built floor); null = the ground */
  y?: number | null;
}

const STILL: RideMotion = { speed: 0, speed01: 0, steer: 0, accel: 0, lateral: 0, braking: false, boost: 0, airborne: false, slip: 0 };

// TEMPORARY until W6 lands RIDE_SPAWNS in townLayout (the scene switches over by itself when it exists).
const LOCAL_RIDE_SPAWNS: { kind: RideKind; x: number; z: number; heading: number }[] = [
  { kind: 'pickup', x: -70, z: -9, heading: Math.PI / 2 },
  { kind: 'golfcart', x: 56, z: -72, heading: 0 },
  { kind: 'hoverboard', x: -18, z: 98, heading: Math.PI },
  { kind: 'icecream', x: 86, z: -26, heading: Math.PI },
  { kind: 'boat', x: 122, z: 24, heading: Math.PI / 2 },
  { kind: 'boat', x: 90, z: -92, heading: 0 },
  { kind: 'hoverboard', x: 8, z: 9, heading: 0 },
  { kind: 'sports', x: 34, z: -7, heading: Math.PI },
];

const SPRINKLES = ['#ff4d8d', '#ffd166', '#6ee7ff', '#b6ff3b', '#ffffff', '#c084fc'];
const SPARKLE_COLORS = ['#ff2e88', '#00d4ff', '#ffc93c', '#b6ff3b', '#ffffff', '#7c4dff'];

export class DriveScene extends GameScene {
  readonly name = 'town' as const;
  pixelRatioCap = tuning.app.townPixelRatio;
  fxScale = 3;

  // world
  private env!: TownEnv;
  private content: THREE.Group | null = null;
  private grid!: ColliderGrid;
  /** the ride you are in — or, on foot, the one you last drove (v3: any of six kinds) */
  private car!: Ride;
  private walker!: Character;
  /** the seated driver (a ride with a standing rider — the hoverboard — borrows the walker instead) */
  private driver!: Character;
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
  private blobs!: Blobs;
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
  private emote3!: EmoteWheel;   // v3 emote: the in-world emote wheel (😀 / Q)
  private emoteBtn!: HTMLButtonElement;   // v3 emote
  private build3!: BuildMode;   // v3 build: build mode in the world (wall / floor / ramp / roof, decor)
  private mv!: Movement;   // ── v3 movement ──
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
  private wakeAcc = 0;
  private moteAcc = 0;
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
  private readonly motion: RideMotion = { speed: 0, speed01: 0, steer: 0, accel: 0, lateral: 0, braking: false, boost: 0, airborne: false, slip: 0 };
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
    this.driver = new Character(prof.outfit, { seated: true, shadows: false });
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
    this.jobs = new JobManager(this.scene, null);
    this.blobs = new Blobs();
    this.scene.add(this.blobs.mesh);
    this.charms = new Charms();
    this.scene.add(this.charms.group);
    this.doorLayer = new DoorLayer();
    this.scene.add(this.doorLayer.group);
    this.pads = [
      makePad(WORKSHOP.pad.x, WORKSHOP.pad.z, PAL.pink, '🧪'),
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
    // ── v3 build ── 🔨 / B: build anywhere. The mode draws its own bar and panels into the HUD.
    this.build3 = new BuildMode({
      scene: this.scene,
      camera: this.camera,
      canvas: scenes.canvas,
      hud,
      foot: () => this.foot,
      onFoot: () => this.mode === 'foot',
      busy: () => this.mv.busy,
      getOut: () => {
        if (this.mode === 'car') this.getOut();
        return this.mode === 'foot';
      },
    });
    const buildBtn = button(side, { icon: '🔨', cls: 'round drive-build' }, () => this.build3.toggle());
    buildBtn.title = 'Build (B)';
    // ── v3 emote ── 😀 / Q: the emote wheel (on foot). Emotes play right here in the world; juice gives each its own tune.
    this.emote3 = new EmoteWheel({
      hud,
      walker: () => this.walker,
      foot: () => this.foot,
      mv: () => this.mv,
      onFoot: () => this.mode === 'foot',
      canOpen: () => !this.leaving && this.openSheets === 0,
    });
    this.emoteBtn = button(side, { icon: '😀', cls: 'round drive-emote' }, () => this.emote3.toggle());
    this.emoteBtn.title = 'Emotes (Q)';
    this.controls = new DriveControls(hud, { onHorn: () => this.honk(), onToggleMode: () => this.toggleMode(), onConfirm: () => this.confirmPrompt(), onCallCar: () => this.callCar() });

    // ── v3 movement ── the on-foot movement hub (camera, sprint, mantle, glide, launch pads, bus drop, POI cards): drive/movement.ts
    const where = { x: 0, z: 0 };
    this.mv = new Movement({
      scene: this.scene,
      ui: this.ui,
      camera: this.camera,
      camPos: this.camPos,
      foot: this.foot,
      walker: this.walker,
      grid: () => this.grid,
      freeFraction: (ax, az, bx, bz, y) => this.freeFraction(ax, az, bx, bz, y),
      keepOutOfBoxes: () => this.keepOutOfBoxes(),
      toFootMode: () => {
        if (this.mode === 'foot') return;
        this.dragIdle = 0;
        this.setMode('foot', false);
      },
      toCarMode: () => {
        // Skip (or leaving mid-ride): back to the street, in the ride we were in
        this.foot.reset(this.phys.x - Math.cos(this.phys.heading) * 2.4, this.phys.z - Math.sin(this.phys.heading) * 2.4, this.phys.heading);
        this.setMode('car', false);
        this.camHeading = this.phys.heading;
        this.camBaseY = this.phys.y;
        this.updateMover();
        this.placeCamera(0, true);
      },
      leaving: () => this.leaving,
      isFoot: () => this.mode === 'foot',
      where: () => {
        where.x = this.mx;
        where.z = this.mz;
        return where;
      },
      setLook: (yaw, pitch) => {
        this.camYaw = yaw;
        this.camPitch = pitch;
        this.dragIdle = 0;
      },
    });
  }

  enter(params?: { from?: 'workshop' | 'build' | 'dressup' | string }): void {
    const d = tuning.drive;
    this.pixelRatioCap = tuning.app.townPixelRatio;
    this.camera.near = 0.5;
    this.camera.far = 700;
    const prof = store.profile;

    // ── where to appear ──
    const freshSession = session.profileId !== prof.id;   // ── v3 movement ── the first entry of this profile offers the party-bus drop
    if (session.profileId !== prof.id) {
      session.profileId = prof.id;
      session.mode = 'car';
      session.car = { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading };
      session.foot = { ...session.car };
      session.exit = null;
      session.rides = [];
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
    // ── v3 build ── the FOR SALE signs, "build here" mats and the separate Build scene are retired: you build anywhere now
    void buildPlotLayer;
    this.plotLayer = { group: new THREE.Group(), doors: [], empty: [], colliders: [], update() {} };
    this.scene.add(this.plotLayer.group);
    this.grid = new ColliderGrid([...this.env.colliders, ...built.colliders, ...this.plotLayer.colliders]);
    this.build3.enter(this.grid);   // ── v3 build ── the saved builds + decor join the world and the collision grid

    // doors (visual mats for walkers; the pads are drawn separately)
    const doors = [...(this.env.doors ?? []), ...this.plotLayer.doors];   // (v3 build: a door whose scene is 'build' now just switches build mode on, see enterPlace)
    this.doorLayer.setDoors(doors);
    this.triggers = doors.map((def) => ({ def, armed: true }));
    this.triggers.push(
      {
        def: { id: 'pad-studio', x: WORKSHOP.pad.x, z: WORKSHOP.pad.z, nx: 0, nz: 1, icon: '🧪', label: 'Studio', scene: 'workshop', radius: d.doorTriggerRadius, carSpeed: d.doorPadCarSpeed, carOnly: true, glow: PAL.pink },
        armed: true,
        exit: STUDIO_EXIT,
      },
    );

    // ── me, my rides, my outfit ──
    this.driver.setOutfit(prof.outfit);
    this.walker.setOutfit(prof.outfit);
    this.initRides(carPose);
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
    this.camPitch = tuning.movement3.camPitchDefault;   // ── v3 movement ──
    this.setMode(mode, true);
    this.updateMover();
    this.camBaseY = mode === 'car' ? this.phys.y : this.foot.y;
    this.occl = 1;
    this.onExit(this.mv.enter(freshSession));   // ── v3 movement ── (its bus-intro listener is removed when the scene exits)
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
    this.top.home.setMode('off');   // ── v3 build ── the "my house / build here" guide pill belongs to the retired plot flow
    this.nudgeIn = !this.ownsHouse && this.emptyPlots.length && session.homeNudgeFor !== prof.id ? 1.8 : -1;

    this.listen(window, 'keydown', (e) => this.controls.onKeyDown(e));
    this.listen(window, 'keyup', (e) => this.controls.onKeyUp(e));
    this.listen(window, 'keydown', this.emote3.onKey, { capture: true });   // v3 emote: Q opens the wheel (before the camera-turn keys see it)
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
    this.onExit(bus.on('buildToggle', (e) => this.build3.toggle(e.on)));   // v3 build: ☰ menu → Build
    this.onExit(bus.on('charmCollected', () => this.top.setCharms(this.charms.collected, this.charms.total, nextReward())));

    if (this.mode === 'car') bus.emit('driveStart', { kind: this.car.kind });
  }

  exit(): void {
    this.mv.exit();   // ── v3 movement ── put anyone mid-air (or on the bus) back on the ground first
    bus.emit('driveStop', {});
    // remember where everything is
    session.mode = this.mode;
    session.car = { x: this.phys.x, z: this.phys.z, heading: this.phys.heading };
    this.saveRides();
    this.disposeRides();
    session.foot = { x: this.foot.x, z: this.foot.z, heading: this.foot.heading };
    this.controls.releaseAll();
    this.controls.suspended = false;
    this.openSheets = 0;
    this.jobs.clear();
    this.tags.clear();
    this.skid.clear();
    this.fx.clear();
    this.ripples.clear();
    this.emote3.reset();   // v3 emote
    this.build3.exit();   // v3 build
    this.plotLayer?.group.removeFromParent();
    this.plotLayer = null;
    if (this.content) {
      this.scene.remove(this.content);
      disposeBaked(this.content); // free the merged town meshes (rebuilt on every visit)
      this.content = null;
    }
  }

  resetStation(): void {
    this.mv.cancel();   // ── v3 movement ──
    this.leaving = false;
    this.phys.reset(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.syncDriving();
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
      ride: this.car ? this.car.kind : '-',
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
    this.build3.update(dt, t);   // v3 build: ghost, placing, build-in animations
    this.emote3.update();   // v3 emote: notices when the dance is over (moved, jumped, got in a ride)
    this.env.setViewer?.(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    this.env.update(dt, t);
    tickBuildMaterials(t);

    const car = this.mode === 'car';
    const chestY = (car ? this.phys.y : this.foot.y) + (car ? 0.9 : 1.0);
    this.jobs.update(dt, t, this.mx, this.mz, car && !this.leaving && this.car.hasPassengerSeat);
    this.charms.update(dt, t, this.mx, chestY, this.mz, !this.leaving);
    this.doorLayer.update(t, this.mx, this.mz);
    for (const p of this.pads) p.update(t, this.mx, this.mz, !car);
    this.fx.update(dt, this.camera.quaternion);
    this.ripples.update(dt);
    this.lines.update(dt, car ? this.boostLevel : 0);
    this.mv.tick(dt, t);   // ── v3 movement ── launch pads, the contrail, the bus flying away, POI cards
    this.checkTriggers(dt);
    this.updateRides(dt, t);
    this.updateRidePrompt();
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
    p.time = t;
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
      ? { steer: 0, gas: 0, brake: 0, handbrake: true, boost: false, hop: false }
      : { steer: raw.steer, gas: raw.gas, brake: raw.brake, handbrake: raw.handbrake, boost: this.boostOn, hop: !!raw.hop };

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
    // ── v3 rides ── launch pads: a grounded ride that rolls over a pad is flung up (the boat ignores them). 0.6 × the walker's
    // kick (tuning.movement3.padSpeed): a good big jump that still lands sanely. The pad's own squash + rings + boing come with the event.
    if (p.grounded && !p.waterOnly && !this.leaving && this.dropY <= 0) {
      const base = p.y - p.hover;
      const pad = this.mv.pads.trigger(p.x, base, p.z) ?? this.mv.pads.trigger(p.x + Math.sin(p.heading) * 1.2, base, p.z - Math.cos(p.heading) * 1.2);
      if (pad) {
        const vy = tuning.movement3.padSpeed * 0.6;
        p.launch(vy);
        bus.emit('launchPad', { pos: { x: pad.x, y: pad.y + 0.4, z: pad.z }, strength: 1 });
        bus.emit('carJump', { pos: { x: p.x, y: p.y + 1, z: p.z }, strength: clamp(vy / 8, 0.3, 2.5) });
        this.car.bump(6);
      }
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

  /** Put the ride on the physics pose, tilted to its surface (or the air). */
  private applyCarPose(dt: number, snap: boolean): void {
    const p = this.phys;
    const sp = this.car.spec;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    const hl = sp.length * 0.36, hw = sp.width * 0.4;
    let pitchT: number, rollT: number, k: number;
    if (p.grounded) {
      const S = (x: number, z: number): number => p.surfaceAt(x, z, p.y);
      pitchT = clamp(Math.atan2(S(p.x + fx * hl, p.z + fz * hl) - S(p.x - fx * hl, p.z - fz * hl), hl * 2), -0.55, 0.55);
      rollT = clamp(Math.atan2(S(p.x + rx * hw, p.z + rz * hw) - S(p.x - rx * hw, p.z - rz * hw), hw * 2), -0.4, 0.4);
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

  /** Skid marks, tyre smoke, drift sparks, boost effects (flames / sprinkles / spray), the boat's wake, hover motes, the sparkle trail. */
  private driveEffects(dt: number, input: CarInput): void {
    const d = tuning.drive;
    const p = this.phys;
    const kind = p.kind;
    const sp = this.car.spec;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    const slip = Math.abs(p.latSpeed);
    const wheeled = sp.wheels.length > 0;
    const skidding = wheeled && p.grounded && Math.abs(p.fwdSpeed) > 3 && (p.drifting || slip > d.skidSlip || (input.handbrake && p.fwdSpeed > 12));
    if (wheeled)
      for (let w = 0; w < 2; w++) {
        const s = w === 0 ? -1 : 1;
        const back = sp.length * 0.3, half = sp.width * 0.42;
        const wx = p.x - fx * back + rx * half * s, wz = p.z - fz * back + rz * half * s;
        this.skid.stamp(w, wx, p.y, wz, skidding);
        if (skidding) {
          this.smokeAcc += dt;
          if (this.smokeAcc > 0.045) {
            this.smokeAcc = 0;
            this.fx.puff(wx, p.y + 0.15, wz, -p.vx, -p.vz);
            // the sports car throws drift sparks
            if (kind === 'sports') this.fx.sparkle(wx, p.y + 0.12, wz, '#ffb347');
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
    // boost: flames (cars), sprinkles (the ice-cream truck), cyan streaks (hoverboard), spray (boat)
    if (this.boostOn && this.boostLevel > 0.3) {
      this.flameAcc += dt;
      if (this.flameAcc > 0.02) {
        this.flameAcc = 0;
        let i = 0;
        for (const [lx, ly, lz] of sp.exhausts) {
          const wx = p.x + rx * lx - fx * lz, wz = p.z + rz * lx - fz * lz, wy = p.y + ly;
          if (kind === 'icecream') {
            for (let n = 0; n < 3; n++) this.fx.sparkle(wx + (Math.random() - 0.5) * 0.6, wy + Math.random() * 0.6, wz + (Math.random() - 0.5) * 0.6, SPRINKLES[(Math.random() * SPRINKLES.length) | 0]);
          } else if (kind === 'boat') {
            this.fx.puff(wx, waveY(wx, wz, this.simT) + 0.2, wz, -p.vx * 0.5, -p.vz * 0.5);
          } else this.fx.flames(wx, wy, wz, -fx, -fz, kind === 'hoverboard' ? '#00d4ff' : i % 2 ? '#00d4ff' : '#ffb347');
          i++;
        }
      }
    }
    // the boat's wake: rings and foam behind the stern, spray at the bow
    if (kind === 'boat' && Math.abs(p.fwdSpeed) > 2) {
      this.wakeAcc += dt;
      if (this.wakeAcc > 0.1) {
        this.wakeAcc = 0;
        const sx = p.x - fx * sp.length * 0.4, sz = p.z - fz * sp.length * 0.4;
        const wy = waveY(sx, sz, this.simT);
        this.ripples.add(sx, wy + 0.05, sz, 1.1 + p.speed01 * 1.8, 1.3);
        this.fx.puff(sx, wy + 0.2, sz, -p.vx * 0.2, -p.vz * 0.2);
        if (p.speed01 > 0.5) this.fx.puff(p.x + fx * sp.length * 0.4 + rx * (Math.random() - 0.5), wy + 0.3, p.z + fz * sp.length * 0.4 + rz * (Math.random() - 0.5), p.vx * 0.1, p.vz * 0.1);
      }
    }
    // hover motes under the board
    if (kind === 'hoverboard' && Math.abs(p.fwdSpeed) > 1) {
      this.moteAcc += dt;
      if (this.moteAcc > 0.05) {
        this.moteAcc = 0;
        this.fx.sparkle(p.x - fx * 0.7 + (Math.random() - 0.5) * 0.5, p.y - p.hover + 0.15, p.z - fz * 0.7 + (Math.random() - 0.5) * 0.5, '#7cf6ff');
      }
    }
    // sparkle trail (a bonus paint option)
    if (this.car.currentStyle.trail && Math.abs(p.fwdSpeed) > 2.5) {
      this.trailAcc += dt;
      while (this.trailAcc > 0.022) {
        this.trailAcc -= 0.022;
        const back = sp.length * 0.5;
        this.fx.sparkle(p.x - fx * (back + Math.random()) + (Math.random() - 0.5) * 1.4, p.y + 0.4 + Math.random() * 0.5, p.z - fz * (back + Math.random()) + (Math.random() - 0.5) * 1.4, SPARKLE_COLORS[(Math.random() * SPARKLE_COLORS.length) | 0]);
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
    // ── v3 movement ── the over-the-shoulder rig orbits: wider pitch limits (tuning.movement3), and the view only swings in
    // behind a player who is walking FORWARD (strafing no longer spirals the camera)
    const m3 = tuning.movement3;
    this.camYaw += this.lookTmp.yaw;
    this.camPitch = clamp(this.camPitch + this.lookTmp.pitch, m3.camPitchMin, m3.camPitchMax);
    const inp = this.controls.readFoot(this.camYaw);
    if (!this.controls.dragging && this.dragIdle > m3.camRecenterDelay && inp.mag > 0.15 && f.speed > 1.2) {
      const diff = wrapAngle(f.heading - this.camYaw);
      const fwd = inp.dx * Math.sin(this.camYaw) - inp.dz * Math.cos(this.camYaw);
      if (Math.abs(diff) < 2.3 && fwd > 0.2) this.camYaw += diff * Math.min(1, dt * m3.camRecenterRate) * inp.mag * fwd;
    }
    // ── v3 movement ── flying: the view follows the flyer. The hub also says whether it owns the walker this frame
    // (the party bus, a skydive / glide, a mantle): then the foot physics is skipped.
    const look = this.mv.camAssist(dt, this.dragIdle, this.controls.dragging, this.camYaw, this.camPitch);
    this.camYaw = look.yaw;
    this.camPitch = look.pitch;
    const owned = this.mv.footFrame(dt, inp);

    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    let jumped = false, landed = 0, kicked = false, splash = 0, rescued = false;
    const run = inp.run;
    for (let i = 0; i < (owned ? 0 : steps); i++) {
      f.step(h, inp.dx, inp.dz, inp.mag, run, inp.jump, this.grid);
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
    this.mv.afterFoot(dt, w);   // ── v3 movement ── poses the walker on the bus / in a glide / mid-mantle; launch pads; long falls open the glider
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

  // ── v3 rides ───────────────────────────────────────────────────────────────
  // Every ride in the world (the six kinds), parked where it was left. `car` / `phys` are the ride you are in — or, on foot, the one you
  // last drove. Walk up to any parked ride for a "Drive" prompt; getting out leaves it where it is; 🚗 brings YOUR ride (the Locker's favourite).
  private rides: WorldRide[] = [];
  private driving: WorldRide | null = null;
  private rideTarget: WorldRide | null = null;

  /** The wrap the player chose for a kind (Locker), else that kind's own colour (the sports car keeps the old car colour). */
  private wrapFor(kind: RideKind): { color: string; finish: RideFinish } {
    const prof = store.profile;
    const w = prof.locker?.wraps?.[kind];
    const color = w?.color ?? (kind === 'sports' ? prof.carColor : RIDE_INFO[kind].color);
    const f = w?.finish ?? prof.carStyle?.finish ?? 'gloss';
    return { color, finish: (['gloss', 'matte', 'chrome', 'glitter'].includes(f) ? f : 'gloss') as RideFinish };
  }

  /** Wrap + the paint-sheet extras (underglow, sparkle trail, rims). */
  private dress(ride: Ride): void {
    const { color, finish } = this.wrapFor(ride.kind);
    const st = store.profile.carStyle;
    ride.setColor(color);
    ride.setStyle({ ...DEFAULT_STYLE, finish, neon: st?.neon ?? null, trail: !!st?.trail, rims: st?.rims ?? DEFAULT_STYLE.rims });
  }

  /** Re-dress every ride (after the paint sheet) */
  private dressAll(): void {
    for (const w of this.rides) this.dress(w.ride);
  }

  private spawnRide(kind: RideKind, x: number, z: number, heading: number, mine: boolean, y: number | null = null): WorldRide {
    const ride = new Ride(kind);
    this.dress(ride);
    this.scene.add(ride.group);
    const w: WorldRide = { ride, kind, x, z, heading, mine, y };
    this.rides.push(w);
    this.placeRide(w);
    return w;
  }

  private removeRide(w: WorldRide): void {
    const i = this.rides.indexOf(w);
    if (i >= 0) this.rides.splice(i, 1);
    w.ride.dispose();
    if (this.driving === w) this.driving = null;
  }

  /** Sit a parked ride on its surface (tilted to it). The water for a boat, a hover above the ground for the hoverboard. */
  private placeRide(w: WorldRide): void {
    const r = w.ride, sp = r.spec;
    const water = w.kind === 'boat';
    const hover = w.kind === 'hoverboard' ? tuning.rides.hoverboard.hover : 0;
    // a ride left on a player-built floor / ramp stays on it (surfaceBelow looks a step above where it stood)
    const ref = (w.y ?? groundHeight(w.x, w.z)) + 0.5;
    const surf = (x: number, z: number): number => (water ? waveY(x, z, this.simT) : Math.max(groundHeight(x, z), surfaceBelow(x, z, ref), hover > 0 ? WATER_Y : -99));
    const fx = Math.sin(w.heading), fz = -Math.cos(w.heading), rx = Math.cos(w.heading), rz = Math.sin(w.heading);
    const hl = sp.length * 0.36, hw = sp.width * 0.4;
    const pitch = water ? 0 : clamp(Math.atan2(surf(w.x + fx * hl, w.z + fz * hl) - surf(w.x - fx * hl, w.z - fz * hl), hl * 2), -0.5, 0.5);
    const roll = water ? 0 : clamp(Math.atan2(surf(w.x + rx * hw, w.z + rz * hw) - surf(w.x - rx * hw, w.z - rz * hw), hw * 2), -0.4, 0.4);
    const sy = surf(w.x, w.z);
    if (!water) w.y = sy;
    r.setPose(w.x, sy + hover, w.z, w.heading, pitch, roll);
    r.update(0.016, this.simT, STILL);
  }

  /** Parked rides are solid (circles along their length); the one you are driving is not. */
  private rebuildRideColliders(): void {
    const list: Collider[] = [];
    for (const w of this.rides) {
      if (this.mode === 'car' && w === this.driving) continue;
      const sp = w.ride.spec;
      const r = Math.max(0.55, sp.width * 0.45);
      const sh = Math.sin(w.heading), ch = Math.cos(w.heading);
      const gy = w.kind === 'boat' ? WATER_Y : w.y ?? groundHeight(w.x, w.z);
      for (const o of [-0.3, 0, 0.3]) list.push({ kind: 'circle', x: w.x + sh * sp.length * o, z: w.z - ch * sp.length * o, r, h: gy + sp.height });
    }
    this.grid.setDynamic(list);
  }

  /** (Re)build the world's rides for this visit: from the session (where they were left) or from the spawn list. */
  private initRides(carPose: Pose): void {
    for (const w of this.rides) w.ride.dispose();
    this.rides = [];
    this.driving = null;
    const prof = store.profile;
    const saved = session.profileId === prof.id ? session.rides : [];
    let active: WorldRide | null = null;
    if (saved.length) {
      for (const s of saved) {
        const w = this.spawnRide(s.kind, s.x, s.z, s.heading, s.mine, s.y ?? null);
        if (s.active) active = w;
      }
    } else {
      const spawns = ((Layout as unknown as { RIDE_SPAWNS?: typeof LOCAL_RIDE_SPAWNS }).RIDE_SPAWNS ?? LOCAL_RIDE_SPAWNS);
      for (const sp of spawns) this.spawnRide(sp.kind, sp.x, sp.z, sp.heading, false);
    }
    if (!active) {
      const kind = (prof.locker ?? defaultLocker()).ride;
      active = this.rides.find((w) => w.mine) ?? this.spawnRide(kind, carPose.x, carPose.z, carPose.heading, true);
    }
    // the ride you were in / left last is exactly where the player says it is
    if (Math.hypot(active.x - carPose.x, active.z - carPose.z) > 0.05) active.y = null;   // moved: forget the old level
    active.x = carPose.x;
    active.z = carPose.z;
    active.heading = carPose.heading;
    this.placeRide(active);
    this.activate(active);
  }

  /** Make `w` the ride the physics and the HUD talk about. */
  private activate(w: WorldRide): void {
    this.driving = w;
    this.car = w.ride;
    this.phys.setKind(w.kind);
    this.phys.time = this.simT;
    this.phys.reset(w.x, w.z, w.heading, w.y ?? undefined);
    this.pitch = this.roll = 0;
    this.jobs.setCar(w.ride);
    const mat = this.carMarker.material as THREE.SpriteMaterial;
    mat.map = emojiTexture(RIDE_INFO[w.kind].icon);
    mat.needsUpdate = true;
    this.rebuildRideColliders();
  }

  /** The ride you drive is parked where the physics left it. */
  private syncDriving(): void {
    const w = this.driving;
    if (!w) return;
    w.x = this.phys.x;
    w.z = this.phys.z;
    w.heading = this.phys.heading;
    if (!this.phys.waterOnly) w.y = this.phys.y - this.phys.hover;
  }

  private saveRides(): void {
    this.syncDriving();
    session.rides = this.rides.map((w) => ({ kind: w.kind, x: w.x, z: w.z, heading: w.heading, mine: w.mine, active: w === this.driving, y: w.y ?? undefined }));
  }

  private disposeRides(): void {
    this.dismountRider();
    for (const w of this.rides) w.ride.dispose();
    this.rides = [];
    this.driving = null;
    this.rideTarget = null;
    this.blobs.begin();
    this.blobs.end();
  }

  /** Seat the rider: a seated driver in most rides, the (standing) walker on the hoverboard. */
  private mountRider(): void {
    const r = this.car;
    const c = r.spec.driver ? this.driver : this.walker;
    const other = c === this.driver ? this.walker : this.driver;
    r.dismount();
    other.group.removeFromParent();
    other.group.visible = false;
    r.mountRider(c);
    c.group.visible = true;
    if (c === this.walker) {
      c.setMove(0, true);
      c.setSwim(0);
    }
  }

  private dismountRider(): void {
    this.car?.dismount();
    this.driver.group.removeFromParent();
    this.driver.group.visible = false;
    this.walker.group.removeFromParent();
    this.scene.add(this.walker.group);
    this.walker.group.visible = true;
  }

  private nearestRide(x: number, z: number, extra = 0): WorldRide | null {
    let best: WorldRide | null = null, bd = 1e9;
    for (const w of this.rides) {
      const dd = Math.hypot(w.x - x, w.z - z);
      const lim = tuning.drive.getInRadius + w.ride.spec.length * 0.2 + extra;
      if (dd < lim && dd < bd) {
        bd = dd;
        best = w;
      }
    }
    return best;
  }

  /** The parked rides near the minimap dial (the one you drive is the arrow / the car marker). */
  private mapRides(): { x: number; z: number; icon: string }[] {
    const out = this.mapRideList;
    out.length = 0;
    const reach = tuning.drive.minimapRadius + 4;
    for (const w of this.rides) {
      if (w === this.driving) continue;
      if (Math.abs(w.x - this.mx) > reach || Math.abs(w.z - this.mz) > reach) continue;
      out.push({ x: w.x, z: w.z, icon: RIDE_INFO[w.kind].icon });
    }
    return out;
  }
  private mapRideList: { x: number; z: number; icon: string }[] = [];

  /** On foot, near a parked ride: a big "Drive" bubble (tap, Enter or E hops in). */
  private updateRidePrompt(): void {
    const f = this.foot;
    let best: WorldRide | null = null;
    if (this.mode === 'foot' && !this.leaving && !this.controls.suspended && !this.mv.busy) {
      const near = this.nearestRide(f.x, f.z);
      if (near && (!f.swimming || near.kind === 'boat')) best = near;   // a swimmer can climb into a boat
    }
    if (best === this.rideTarget) return;
    this.rideTarget = best;
    if (best) this.prompt.show(RIDE_INFO[best.kind].icon, 'Drive', () => this.confirmPrompt());
    else this.prompt.hide();
  }

  /** Every frame: parked rides near the player are drawn (and the boats and hoverboards bob); each one gets a soft contact shadow. */
  private updateRides(dt: number, t: number): void {
    void dt;
    this.blobs.begin();
    for (const w of this.rides) {
      const active = w === this.driving;
      const px = active ? this.phys.x : w.x, pz = active ? this.phys.z : w.z;
      const hd = active ? this.phys.heading : w.heading;
      const dist = Math.hypot(px - this.mx, pz - this.mz);
      const show = active || dist < 120; // a parked ride is a few pixels beyond this (and each one costs up to 4 draw calls)
      w.ride.group.visible = show;
      if (!show) continue;
      if (!active && dist < 70 && (w.kind === 'boat' || w.kind === 'hoverboard')) this.placeRide(w);
      if (w.kind !== 'boat') this.blobs.add(px, active ? this.phys.y - this.phys.hover : w.y ?? groundHeight(px, pz), pz, hd, w.ride.spec.width * 1.5, w.ride.spec.length * 1.15);
    }
    void t;
    this.blobs.end();
  }

  // ── hopping out / in ──────────────────────────────────────────────────────
  private toggleMode(): void {
    if (this.leaving || this.controls.suspended || this.mv.busy) return;   // v3 movement: not on the bus / in the air / mid-climb
    if (this.mode === 'foot' && this.mv.tryZip()) return;   // v3 movement: E / F at a zipline post = Zip!
    if (this.mode === 'car') this.getOut();
    else this.getIn(this.rideTarget);
  }

  private footFree(x: number, z: number, refY: number, reach = tuning.drive.stepUp + 0.4): boolean {
    const d = tuning.drive;
    const gy = Math.max(groundHeight(x, z, true), surfaceBelow(x, z, refY));   // ── v3 build ── a built floor counts
    if (gy < d.waterWade + 0.05 || Math.abs(gy - refY) > reach) return false;
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
    const kind = this.car.kind;
    if ((!p.grounded && !p.waterOnly) || Math.abs(p.fwdSpeed) > d.getOutMaxSpeed) {
      toast(kind === 'boat' ? 'Slow down to hop out 🚤' : 'Slow down to hop out 🚗');
      return;
    }
    const sp = this.car.spec;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    const side = sp.width * 0.5 + 1.5, end = sp.length * 0.5 + 1.5;
    const tries: [number, number, number][] = [[-rx, -rz, side], [rx, rz, side], [-fx, -fz, end], [fx, fz, end], [-rx, -rz, side + 1.2], [rx, rz, side + 1.2]];
    let sx = p.x - rx * side, sz = p.z - rz * side;
    const refY = p.y - p.hover;
    const reach = kind === 'boat' ? 1.9 : d.stepUp + 0.4;
    for (const [dx, dz, dist] of tries) {
      const x = p.x + dx * dist, z = p.z + dz * dist;
      if (this.footFree(x, z, refY, reach)) {
        sx = x;
        sz = z;
        break;
      }
    }
    p.vx = p.vz = p.fwdSpeed = 0;
    this.boostOn = false;
    this.foot.reset(sx, sz, p.heading, refY);
    this.syncDriving();
    // stepping out onto a mat must not trigger it: it stays asleep until you step off and back on
    for (const tr of this.triggers) if (Math.hypot(sx - tr.def.x, sz - tr.def.z) < (tr.def.radius ?? 1.5) + 2.5) tr.armed = false;
    this.camYaw = p.heading;
    this.camPitch = tuning.movement3.camPitchDefault;   // ── v3 movement ──
    this.dragIdle = 0;
    this.setMode('foot', false);
    this.walker.hop();
    bus.emit('rideExit', { kind, pos: { x: p.x, y: p.y + 1.4, z: p.z } });
  }

  private getIn(target?: WorldRide | null): void {
    const f = this.foot;
    const w = target ?? this.nearestRide(f.x, f.z);
    if (!w) {
      toast('Walk up to a ride to hop in 🚗');
      return;
    }
    if (w !== this.driving) this.activate(w);
    this.setMode('car', false);
    const p = this.phys;
    this.camHeading = p.heading;
    const rider = this.car.rider;
    if (rider) popScale(rider.group, 0.3, 0.16);
    this.car.bump(4);
    bus.emit('rideEnter', { kind: w.kind, pos: { x: p.x, y: p.y + 1.4, z: p.z } });
  }

  // ── 🚗 bring MY ride to me (the Locker's favourite) ─────────────────────────
  /** Is (x, z) a good place to park a `kind` ride facing hd? Dry (water for a boat), level, not on stairs / decks, nothing in the way, not on a mat or pad. */
  private carSpotOk(x: number, z: number, hd: number, kind: RideKind): boolean {
    const d = tuning.drive;
    const sp = rideSpec(kind);
    const fx = Math.sin(hd), fz = -Math.cos(hd), rx = Math.cos(hd), rz = Math.sin(hd);
    const boat = kind === 'boat';
    const hl = sp.length * 0.45, hw = sp.width * 0.4;
    // the surface a ride would stand on: the ground, or a floor / ramp the player built at about the walker's height
    const ref = this.foot.y + 0.5;
    const sf = (px: number, pz: number): number => Math.max(groundHeight(px, pz), surfaceBelow(px, pz, ref));
    const y0 = boat ? groundHeight(x, z) : sf(x, z);
    if (!boat && Math.abs(y0 - this.foot.y) > 3.5) return false; // a different level (a bridge over this street...)
    for (const [a, b] of [[0, 0], [hl, 0], [-hl, 0], [0, hw], [0, -hw], [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]) {
      const px = x + fx * a + rx * b, pz = z + fz * a + rz * b;
      const g = boat ? groundHeight(px, pz) : sf(px, pz);
      if (boat) {
        // open water, not under a bridge or pier
        if (groundHeight(px, pz, false, true) > d.shoreLimit - 0.35 || g !== groundHeight(px, pz, false, true)) return false;
        continue;
      }
      if (g < (kind === 'hoverboard' ? WATER_Y - 0.8 : WATER_Y + 0.25)) return false; // water, or the wet edge of the shore
      if (Math.abs(g - y0) > 0.55) return false; // a kerb, ramp or step under the ride
      if (groundHeight(px, pz, true) - g > 0.25 || railedAt(px, pz)) return false; // stairs / a roof deck
    }
    if (!boat && Math.abs(sf(x + fx * hl * 0.8, z + fz * hl * 0.8) - sf(x - fx * hl * 0.8, z - fz * hl * 0.8)) > 1.4) return false; // gentle slope
    // nothing solid under the three circles the ride is made of
    const r = Math.max(0.55, sp.width * 0.45);
    for (const o of [-0.3, 0, 0.3]) {
      const cx = x + fx * sp.length * o, cz = z + fz * sp.length * o;
      const cols = this.grid.near(cx, cz, r + 2);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.only === 'foot') continue;
        if (c.h !== undefined && y0 > c.h + 0.2) continue;
        if (c.y0 !== undefined && c.y0 > y0 + 2.2) continue;   // a floor / railing high above
        if (pushOut(c, cx, cz, r + 0.25)) return false;
      }
    }
    // never on a door mat, a FOR SALE lot or the Studio / builder pads
    for (const tr of this.triggers) if (Math.hypot(x - tr.def.x, z - tr.def.z) < (tr.def.radius ?? 1.5) + 3.4) return false;
    // not right on top of the walker
    return Math.hypot(x - this.foot.x, z - this.foot.z) >= 2.6;
  }

  private callCar(): void {
    const d = tuning.drive;
    if (this.mode !== 'foot' || this.leaving || this.controls.suspended || this.mv.busy) return;   // v3 movement: not on the bus / in the air
    const now = performance.now();
    if (now - this.lastCall < d.callCooldown * 1000) return;
    const f = this.foot;
    const hd = f.heading;
    const kind = ((store.profile.locker ?? defaultLocker()).ride ?? 'sports') as RideKind;
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
      if (this.carSpotOk(x, z, hd, kind)) {
        spot = { x, z };
        break;
      }
    }
    if (!spot) {
      toast(kind === 'boat' ? 'No water here for the boat — try the shore 🚤' : 'No room for the ride here — try an open street 🚗');
      return;
    }
    this.lastCall = now;
    // my ride: the one I have, or a new one (an old favourite is retired with a puff)
    let own = this.rides.find((w) => w.mine && w.kind === kind) ?? null;
    if (own) {
      if (own === this.driving) this.syncDriving();
      bus.emit('carVanish', { pos: { x: own.x, y: groundHeight(own.x, own.z) + 0.8, z: own.z } });
    } else {
      const old = this.rides.find((w) => w.mine);
      if (old) {
        bus.emit('carVanish', { pos: { x: old.x, y: groundHeight(old.x, old.z) + 0.8, z: old.z } });
        this.removeRide(old);
      }
      own = this.spawnRide(kind, spot.x, spot.z, hd, true);
    }
    own.x = spot.x;
    own.z = spot.z;
    own.heading = hd;
    own.y = f.y;   // it lands on the same level as the walker (a built deck, or the ground)
    this.placeRide(own);
    this.activate(own);
    this.dropY = 3.2;
    this.dropV = 0;
    this.promptHold = true;
    this.setPrompt(null);
    // landing next to a mat must not trigger it when you get in: they sleep until you step off
    for (const tr of this.triggers) if (Math.hypot(spot.x - tr.def.x, spot.z - tr.def.z) < (tr.def.radius ?? 1.5) + 4) tr.armed = false;
    this.applyCarPose(0, true);
    bus.emit('carAppear', { pos: { x: spot.x, y: this.phys.y + 0.6, z: spot.z } });
  }

  /** The called ride drops in with a couple of little bounces. */
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
    if (car) {
      this.mountRider();
      if (this.rideTarget) {
        this.rideTarget = null;
        this.prompt.hide();
      }
    } else this.dismountRider();
    this.controls.setHop(car && this.phys.hover > 0);
    this.controls.setMode(mode);
    const ico = this.modeBtn.querySelector('.ico');
    if (ico) ico.textContent = car ? '🚶' : '🚪'; // on foot the 🚗 button calls the car; this one hops in
    this.modeBtn.title = car ? 'Get out (E)' : 'Get in (E)';
    this.callBtn.style.display = car ? 'none' : '';
    this.emoteBtn.style.display = car ? 'none' : '';   // v3 emote: the wheel is for walking
    if (car) this.emote3.reset();
    if (!car) {
      this.boostOn = false;
      this.boostLevel = 0;
      this.motion.boost = 0;
      this.skid.stamp(0, 0, 0, 0, false);
      this.skid.stamp(1, 0, 0, 0, false);
      this.occl = 1;
      this.camBaseY = this.foot.y;
      if (!initial && was === 'car') this.mv.cam.reset();   // ── v3 movement ── hopped out: the over-the-shoulder lens flies in from the chase view
    } else this.camBaseY = this.phys.y;
    if (this.grid) this.rebuildRideColliders();
    if (!initial && was !== mode) {
      if (car) bus.emit('driveStart', { kind: this.car.kind });
      else bus.emit('driveStop', {});
    }
    // the parked ride stops humming
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
    bus.emit('horn', { pos: { x: this.phys.x, y: this.phys.y + 1.4, z: this.phys.z }, kind: this.car.kind });
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
    // ── v3 movement ── mats and doors sleep while the player is on the party bus or in the air
    if (this.mv.airborne) {
      this.setPrompt(null);
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
    if (this.rideTarget && this.mode === 'foot' && !this.leaving && !this.controls.suspended) {
      this.getIn(this.rideTarget);
      return;
    }
    const tr = this.promptTr;
    if (!tr || this.leaving || this.mode !== 'car' || this.controls.suspended) return;
    this.setPrompt(null);
    this.enterPlace(tr, false);
  }

  private enterPlace(tr: Trigger, onFoot: boolean): void {
    const def = tr.def;
    // ── v3 build ── the builder's office mat no longer opens the old Build scene: it switches build mode on right here
    if (def.scene === 'build') {
      tr.armed = false;   // asleep until you step off the mat, so switching build mode off again sticks
      this.build3.toggle(true);
      return;
    }
    this.leaving = true;
    this.leaveT = 0;
    // where to appear when we come back
    if (tr.exit) session.exit = { mode: onFoot ? 'foot' : 'car', ...tr.exit };
    else if (onFoot) session.exit = { mode: 'foot', x: def.x + def.nx * 2.6, z: def.z + def.nz * 2.6, heading: Math.atan2(def.nx, -def.nz) };
    else session.exit = { mode: 'car', x: this.phys.x, z: this.phys.z, heading: this.phys.heading };
    // exiting on foot from a pad that has a street exit: keep the car where it is
    const pos = { x: this.mx, y: 1, z: this.mz };
    if (def.scene === 'workshop') bus.emit('arriveWorkshop', { pos });
    else bus.emit('uiTap', { kind: 'big' });   // (v3 build: the 'build' branch is gone, see the early return above)
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
      if (foot) this.camera.lookAt(this.mv.cam.look);   // ── v3 movement ── keep the over-the-shoulder framing
      else this.camera.lookAt(sx, sy - 0.2, sz);
    }
    this.camera.position.copy(this.camPos);

    // FOV: a touch wider at speed, a big kick on boost (on foot: the sprint / launch / glide kicks of the movement rig)
    const rc = this.phys.cam;   // ── v3 rides ── a ride may set its own lens
    const base = this.mode === 'car' ? rc.cameraFov + rc.cameraFovBoost * this.phys.speed01 + rc.boostFov * this.boostLevel : d.cameraFov + 4 + this.mv.fov;
    const fov = base * this.fovScale;
    if (Math.abs(fov - this.fovNow) > 0.05) {
      this.fovNow = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private placeChaseCamera(dt: number, snap: boolean): void {
    const d = this.phys.cam;   // ── v3 rides ── per-ride camera knobs: tuning.rides.<kind>.camera*
    const p = this.phys;
    const k = snap ? 1 : 1 - Math.exp(-d.cameraLag * dt);
    this.camHeading = lerpAngle(this.camHeading, p.heading, k);
    this.camBaseY += (p.y - this.camBaseY) * (snap ? 1 : 1 - Math.exp(-(p.grounded ? 5 : 2) * dt));
    const bx = -Math.sin(this.camHeading), bz = Math.cos(this.camHeading); // unit vector behind the camera heading

    // Never inside a building: shorten the arm when a box is in the way.
    // each ride has its own arm (tuning.rides.<kind>): the hoverboard and the cart are filmed close and low, the trucks from further back
    const dist = d.cameraFollowDistance * (1 + this.boostLevel * 0.1);
    const tx = p.x + bx * dist, tz = p.z + bz * dist;
    const free = this.freeFraction(p.x, p.z, tx, tz, this.camBaseY + d.cameraHeight);
    const minFrac = clamp(d.cameraMinDistance / dist, 0.1, 1);
    const target = Math.max(minFrac, free);
    if (snap) this.occl = target;
    else if (target < this.occl) this.occl += (target - this.occl) * (1 - Math.exp(-16 * dt));
    else this.occl += (target - this.occl) * (1 - Math.exp(-2.5 * dt));
    const f = this.occl;
    this.camWant.set(p.x + bx * dist * f, this.camBaseY + d.cameraHeight - this.boostLevel * Math.min(0.7, d.cameraHeight * 0.12) + (1 - f) * Math.min(4, d.cameraHeight * 0.7), p.z + bz * dist * f);

    const kp = snap ? 1 : 1 - Math.exp(-d.cameraLag * d.cameraPosLag * dt);
    this.camPos.lerp(this.camWant, kp);
    if (snap) this.camPos.copy(this.camWant);
    this.keepOutOfBoxes();
    // a little rumble when boosting
    const shake = this.boostLevel * 0.05;
    if (shake > 0.002) this.camPos.y += (Math.random() - 0.5) * shake;

    this.camera.position.copy(this.camPos);
    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
    const lookY = this.camBaseY * 0.55 + p.y * 0.45 + d.cameraLookHeight + this.car.spec.height * 0.12;
    this.camera.lookAt(p.x + fx * d.cameraLookAhead, lookY, p.z + fz * d.cameraLookAhead);
  }

  // ── v3 movement ── the Fortnite-style over-the-shoulder camera lives in drive/footcam.ts (via drive/movement.ts): a true orbit
  // behind the right shoulder, drag-look yaw + pitch, the same occlusion (freeFraction / keepOutOfBoxes), FOV kicks, and the
  // framing for the skydive / glider / party bus. placeCamera() below still adds the ground clamp, the sight-line lift and the FOV.
  private placeFootCamera(dt: number, snap: boolean): void {
    this.mv.placeCam(dt, snap, this.camYaw, this.camPitch);
    this.camBaseY = this.foot.y; // (kept in step for the code that reads it when hopping back into a ride)
  }

  /** Last line of defence: keep the lens outside every building box (lagging around corners). */
  private keepOutOfBoxes(): void {
    const cols = this.grid.near(this.camPos.x, this.camPos.z, 6);
    for (let i = 0; i < cols.length; i++) {
      const b = cols[i];
      if (b.kind !== 'box' || b.only === 'foot') continue;
      if (b.y0 !== undefined && b.y0 > this.camPos.y + 1.2) continue; // v3: a wall on an upper storey is no concern of a lens down here
      const ox = b.hw + 0.8 - Math.abs(this.camPos.x - b.x), oz = b.hd + 0.8 - Math.abs(this.camPos.z - b.z);
      if (ox <= 0 || oz <= 0) continue;
      if (b.y0 === undefined && b.h !== undefined && b.h - groundHeight(b.x, b.z) < 4.5) {
        // a low wall or hedge: rise over it instead of sliding into the next corridor
        // (v3: not for a player's build wall, y0 defined: rising over a storey's wall would put the lens above the room's ceiling; it is pushed in / out sideways instead)
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
      if (b.y0 !== undefined && b.y0 > yLevel + 1.2) continue; // v3: a wall on an upper storey does not shorten a ground-level arm
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
    const fy = this.mode === 'car' ? this.phys.y : this.mv.sunY(this.foot.y);   // ── v3 movement ── a flyer's shadows stay on the ground below
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
        color: '#' + this.car.color.getHexString(),
        car: car ? null : { x: this.phys.x, z: this.phys.z, icon: RIDE_INFO[this.car.kind].icon },
        rides: this.mapRides(),
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

