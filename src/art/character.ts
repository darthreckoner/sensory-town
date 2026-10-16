// Fortnite-style stylized character (about 1.75 tall, head ~1/6 of the height: almond
// eyes with big catchlights, defined moving brows, a soft nose wedge, natural lips that bend
// into a smile and open into a D-grin on reactions, blush, chunky 5-finger hands), driven by
// an Outfit. Used by the profile picker, the Locker / Style studio, the car (seated),
// waving passengers and on-foot play (walk / sprint / jump / swim / glide).
//
// v3 API on top of the v2 one: setSwim(amount), setGliding(on) + gliderAnchor, setSprint(on),
// setBackBling(obj), lookAt(target), react(). Characters are alive: blinks (sometimes double),
// eye saccades, weight shifts, breathing.
//
// Rig:   group > rig(Bone) > { legs: hip > knee > ankle,
//                              upper (pelvis pivot): torso, arms: shoulder > elbow > wrist, head: neck > head }
// Render: every outfit piece is baked into the bind pose, tagged with the bone that drives
//        it and merged — per material category — into a few SkinnedMeshes sharing one
//        skeleton (see characterSkin.ts). A character costs <= 8 draw calls (typically 5:
//        skin, fabric, gloss, metal, eyes) and <= 4 shadow casters. Colors are vertex colors,
//        so the materials are global.
// Slots: every outfit slot owns "mount" bones (identity transforms) that its vertices bind to,
//        so partObject(slot) returns a proxy whose scale drives those mounts (popScale works),
//        and setOutfit() only re-bakes the slots that changed and re-merges the buffers.
import * as THREE from 'three';
import type { Outfit } from '../core/model';
import type { OutfitSlot } from '../core/events';
import type { Finish } from './materials';
import { tuning } from '../tuning';
import { B, BROW_AT, EYE, FACE_COL, HAND_KINDS, MIN_ACCENT_GAP, MOUTH_AT, NOSE_AT, SMILE, TAU, TY, TORSO_TABLE, cached, colorGap, contrastColor, facePoint, frameQ, getFaceKit, handGeo, headGeo, limbGeo, lipColor, mouthColor, tint, torsoSpace, warmSkin, type HandKind, type Piece } from './characterKit';
import { ALL_CATS, NO_RECEIVE, SHADOW_CATS, assembleGeometry, bakeGeo, catOf, getMats, roleColor, type Cat, type Chunk, type ColorCtx } from './characterSkin';
import { getHair, TAIL_PIVOT } from './characterHair';
import { eyeTints, faceKey, frecklesGeo, freckleColor, getBrowGeo, getEyeKit, getEyeMakeup, getStickerGeo, lipGlossColor, lipHighlightGeo, resolveFace } from './characterFace';
import { clampStyle, getAccessory, getBottom, getShoes, getTop, OUTFIT_CATALOG, type CatalogSlot } from './characterParts';

export { OUTFIT_CATALOG };
export { colorGap, contrastColor, MIN_ACCENT_GAP };
// v3 face customization (the Locker's Custom → Face tab reads FACE_OPTIONS; Outfit.face stores the picks)
export { EYE_COLORS, EYE_SHAPES, FACE_OPTIONS, STICKER_IDS, eyeCoverage, faceKey, randomFace, resolveFace } from './characterFace';
export type { FaceItem, FaceRarity, ResolvedFace } from './characterFace';
export type { CatalogSlot };
export type { CatalogItem } from './characterParts';
/** Emotes: `playEmote(id)` loops (loop = true) until `stopEmote()`, or plays once. Movement cancels them. */
export interface EmoteInfo {
  id: string;
  name: string;
  loop: boolean;
}
export const EMOTES: EmoteInfo[] = [
  { id: 'wave', name: 'Hello!', loop: false },
  { id: 'cheer', name: 'Cheer Jump', loop: false },
  { id: 'tada', name: 'Ta-da!', loop: false },
  { id: 'heart', name: 'Heart Hands', loop: true },
  { id: 'twirl', name: 'Twirl', loop: true },
  { id: 'bounce', name: 'Bounce Party', loop: true },
  { id: 'shuffle', name: 'Side Shuffle', loop: true },
  { id: 'robot', name: 'Robo Bop', loop: true },
  { id: 'sway', name: 'Glow Stick Sway', loop: true },
  { id: 'giggle', name: 'Giggle Fit', loop: true },
  { id: 'swing', name: 'Sit & Swing', loop: true },
];
const EMOTE_SECONDS: Record<string, number> = { cheer: 1.6, tada: 2.2 };
export type PoseKind = 'hips' | 'peace' | 'cross' | 'strut' | 'jump' | 'twirl';
export const POSE_ORDER: PoseKind[] = ['hips', 'peace', 'cross', 'strut', 'jump', 'twirl'];

/** World height of the (scaled) head center. */
const HEAD_Y = B.headCY + B.HY * (B.headScale - 1);
const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** 0 → 1 ramp in, hold, ramp out over k ∈ [0,1]. */
const envelope = (k: number, a = 0.16, b = 0.84) => (k < a ? smooth01(k / a) : k > b ? smooth01((1 - k) / (1 - b)) : 1);

// ═════════════════════════════════════════════════════════════════════════════
// Locomotion: walk / run cycle, jump + airborne pose, landing flex, footsteps
// ═════════════════════════════════════════════════════════════════════════════
interface GaitOut {
  w: number; // walk/run cycle weight (0 = standing)
  run: number; // 0 walk → 1 run
  air: number; // airborne pose weight
  land: number; // landing flex weight
  crouch: number; // jump anticipation squat
  launch: number; // takeoff extension
  hip: [number, number]; // thigh swing (x rotation, negative = forward), [L(+x), R(-x)]
  knee: [number, number];
  arm: [number, number]; // shoulder swing (x rotation, positive = backward)
  elbow: number; // forearm bend
  bob: number;
  lean: number; // forward lean of the upper body
  twist: number; // upper-body counter twist (yaw)
  roll: number; // pelvis side roll
}

class Gait {
  speed = 0;
  target = 0;
  sprint = 0; // smoothed 0..1: a distinct sprint (full run pose, faster cadence, more lean)
  sprintT = 0;
  grounded = true;
  phase = 0;
  airT = 0;
  landT = 0;
  landAmt = 0;
  jumpT = -1;
  airW = 0;
  private stepIdx = 0;
  onStep: ((foot: 'L' | 'R') => void) | null = null;

  setMove(speed: number, grounded: boolean): void {
    this.target = clamp(speed, 0, 1);
    if (this.grounded && !grounded) this.airT = 0;
    if (!this.grounded && grounded) this.touchDown();
    this.grounded = grounded;
  }
  jump(): void {
    this.jumpT = 0;
  }
  private touchDown(): void {
    this.landAmt = Math.max(0.45, Math.min(1, 0.45 + this.airT * 1.1));
    this.landT = 0;
    this.jumpT = -1;
  }

  update(dt: number, moving: boolean): GaitOut {
    const G = tuning.dressup.gait;
    this.speed += ((moving ? this.target : 0) - this.speed) * (1 - Math.exp(-dt * 9));
    this.sprint += (this.sprintT - this.sprint) * (1 - Math.exp(-dt * 7));
    const spd = this.speed;
    const sp = this.sprint * smooth01(spd / 0.3);
    // jump timeline: squat 0.08 s → launch 0.2 s → air (until grounded is reported, or ~0.75 s)
    let crouch = 0;
    let launch = 0;
    let jumpAir = false;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const t = this.jumpT;
      crouch = t < 0.08 ? smooth01(t / 0.08) : Math.max(0, 1 - (t - 0.08) / 0.1);
      launch = t >= 0.08 ? Math.max(0, 1 - (t - 0.08) / 0.22) : 0;
      jumpAir = t >= 0.08 && t < 0.75;
      if (t >= 0.75) {
        this.jumpT = -1;
        if (this.grounded) {
          this.landAmt = 0.6;
          this.landT = 0;
        }
      }
    }
    const airborne = !this.grounded || jumpAir;
    if (!this.grounded) this.airT += dt;
    this.airW += ((airborne ? 1 : 0) - this.airW) * Math.min(1, dt * 14);
    let land = 0;
    if (this.landAmt > 0) {
      this.landT += dt;
      const lt = this.landT / 0.26;
      if (lt >= 1) this.landAmt = 0;
      else land = Math.sin(Math.min(1, lt) * Math.PI) * this.landAmt;
    }
    const w = smooth01(spd / 0.2) * (1 - this.airW);
    const run = Math.max(smooth01((spd - 0.5) / 0.35), sp);
    const hz = lerp(G.walkHz, G.runHz, smooth01((spd - 0.25) / 0.75)) * (1 + 0.14 * sp);
    if (this.grounded && spd > 0.04) this.phase += TAU * hz * dt;
    // footfalls: the +x (L) leg lands at phase = π/2, the other at 3π/2
    const idx = Math.floor((this.phase - Math.PI / 2) / Math.PI);
    if (idx !== this.stepIdx) {
      if (w > 0.35 && this.onStep && this.grounded) this.onStep(((idx % 2) + 2) % 2 === 0 ? 'L' : 'R');
      this.stepIdx = idx;
    }
    const f = this.phase;
    const swing = lerp(G.walkSwing, G.runSwing, run) * lerp(0.55, 1, smooth01(spd / 0.4));
    const kneeMax = lerp(G.walkKnee, G.runKnee, run);
    const armSwing = lerp(G.walkArm, G.runArm, run) * (1 + 0.14 * sp);
    const sinA = Math.abs(Math.sin(f));
    return {
      w,
      run,
      air: this.airW,
      land,
      crouch,
      launch,
      hip: [-swing * Math.sin(f), -swing * Math.sin(f + Math.PI)],
      knee: [kneeMax * Math.max(0, Math.cos(f)) + 0.1 * run, kneeMax * Math.max(0, Math.cos(f + Math.PI)) + 0.1 * run],
      arm: [armSwing * Math.sin(f), armSwing * Math.sin(f + Math.PI)],
      elbow: lerp(0.3, 1.15, run),
      // walking dips at double support; running floats at mid-stride
      bob: lerp(-G.walkBob * sinA, G.runBob * (sinA - 0.35), run),
      lean: lerp(G.walkLean, G.runLean, run) + 0.1 * sp,
      twist: -lerp(0.1, 0.2, run) * Math.sin(f),
      roll: lerp(0.025, 0.04, run) * Math.sin(f),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// The Character
// ═════════════════════════════════════════════════════════════════════════════
type Bone = THREE.Bone;
interface ArmRig { s: number; shoulder: Bone; elbow: Bone; wrist: Bone; upperTop: Bone; lowerTop: Bone }
interface LegRig { s: number; hip: Bone; knee: Bone; ankle: Bone; thighBottom: Bone; shinBottom: Bone; foot: Bone }
interface Swayer { obj: Bone; side: number; phase: number; tilt: number }
type MountSlot = 'top' | 'bottom' | 'shoes' | 'skin' | 'accessory';
type SlotKey = 'body' | 'hair' | 'accessory' | 'top' | 'bottom' | 'shoes';
const SLOT_KEYS: SlotKey[] = ['body', 'hair', 'top', 'bottom', 'shoes', 'accessory'];
type ArmPose = { sx: number; sz: number; ex: number; ez: number; wr: number; wf: number; wx: number }; // wrist: wr roll (1 = palm to the front), wf flex (fingers toward the palm), wx deviation (fingers forward / back)
// wrist roll that turns the palm to the camera when the arm is raised in FRONT of the body (the arm's x rotation flips the hand)
const PEACE_ROLL = -1;
const HEART_ROLL = -1;
const HIPS = { wr: 0, wf: 0, wx: -1.05 }; // wrist angles for hands on hips
const WING_PIVOT = new THREE.Vector3(0.05, 1.3 - TY, -0.095);

export class Character {
  /** Height of the pelvis bottom above the group origin — a seated character's butt sits here. */
  static readonly SEAT_Y = B.seatY;

  readonly group = new THREE.Group();
  seated: boolean;
  private shadows: boolean;
  private outfit: Outfit;

  // skeleton (ids are stable: every character builds the same bones in the same order)
  private bones: Bone[] = [];
  private boneId = new Map<THREE.Object3D, number>();
  private rest: THREE.Matrix4[] = [];
  private skeleton!: THREE.Skeleton;
  private slotChunks: Record<SlotKey, Chunk[]> = { body: [], hair: [], accessory: [], top: [], bottom: [], shoes: [] };
  private catMeshes = new Map<Cat, THREE.SkinnedMesh>();
  // rig
  private rig = new THREE.Bone();
  private upper = new THREE.Bone();
  private headRoot = new THREE.Bone();
  private headBody = new THREE.Bone();
  private arms: ArmRig[] = [];
  private legs: LegRig[] = [];
  // slot mounts
  private topMount = new THREE.Bone();
  private bottomMount = new THREE.Bone();
  private hairMount = new THREE.Bone();
  private tail = new THREE.Bone();
  private accHead = new THREE.Bone();
  private accBody = new THREE.Bone();
  private accBack = new THREE.Bone();
  private accHandR = new THREE.Bone();
  private cupHolder = new THREE.Bone(); // keeps a held cup upright
  private accWristL = new THREE.Bone();
  private wingBones: Bone[] = [new THREE.Bone(), new THREE.Bone()];
  private mounts: Record<'top' | 'bottom' | 'shoes' | 'accessory', Bone[]> = { top: [], bottom: [], shoes: [], accessory: [] };
  private proxy: Record<MountSlot, THREE.Object3D> = {
    top: new THREE.Object3D(), bottom: new THREE.Object3D(), shoes: new THREE.Object3D(), skin: new THREE.Object3D(), accessory: new THREE.Object3D(),
  };
  // face
  private eyes: Bone[] = []; // index 0 = +x side
  private irises: Bone[] = []; // children of the eyes: they slide for the gaze
  private brows: Bone[] = []; // animated pivots (index 0 = +x side)
  private corners: Bone[] = []; // upper lip arms (pivot at the middle's ends), index 0 = +x
  private lowCorners: Bone[] = []; // lower lip arms (children of lipLow)
  private lipLow = new THREE.Bone();
  private mouthAnim = new THREE.Bone();
  private mouthIn = new THREE.Bone();
  private mouthY = 0;
  // hands: one bone per variant under each wrist (scale 0.001 = hidden), index 0 = +x arm
  private handBones: Record<HandKind, Bone[]> = { relax: [], open: [], grip: [], peace: [], heart: [] };
  private handKind: HandKind[] = ['relax', 'relax'];
  private handsBuilt = new Set<HandKind>(['relax']); // hand variants are built on first use (keeps a character light)
  private swayers: Swayer[] = [];
  private wings: { pivot: Bone; side: number }[] = [];
  private ledMat: THREE.MeshStandardMaterial | null = null;
  private hairTopY = 0.14;
  private accTopY = 0;
  private wearsHat = false;
  private holdsCup = false;

  // animation state
  private clock = Math.random() * 20;
  private phase = Math.random() * 10;
  private blinkIn = 1.5 + Math.random() * 2;
  private blinkT = -1;
  private blinkAgain = false; // a double blink is queued
  private emote: { id: string; t: number; dur: number; loop: boolean; stopping: boolean } | null = null;
  private emoteW = 0;
  private emoteYaw = 0;
  private swimTarget = 0;
  private swimW = 0;
  private swimPhase = Math.random() * 6;
  private glideTarget = 0;
  private glideW = 0;
  private skyTarget = 0;
  private skyW = 0;
  /** Where a glider's grip sits while gliding (origin = the point between the hands, canopy above). */
  readonly gliderAnchor = new THREE.Object3D();
  /** Upper-back mount for back blings (origin at the mount, +Z points away from the back). */
  private backMount = new THREE.Object3D();
  private bling: THREE.Object3D | null = null;
  private happyAnim: { t: number; dur: number } | null = null;
  private gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0.8 };
  private lookTarget: THREE.Vector3 | null = null;
  private prevGroupYaw = 0;
  private turnRate = 0;
  private waveAnim: { t: number; dur: number } | null = null;
  private poseAnim: { t: number; dur: number; kind: PoseKind } | null = null;
  private hopAnim: { t: number; dur: number } | null = null;
  private lastPose: PoseKind | null = null;
  private gait = new Gait();
  private steer = 0;
  private steerSmooth = 0;
  private prevYaw = 0;
  private yawVel = 0;
  /** Called at every footfall while walking/running (left or right foot). */
  set onStep(fn: ((foot: 'L' | 'R') => void) | undefined) {
    this.gait.onStep = fn ?? null;
  }
  get onStep(): ((foot: 'L' | 'R') => void) | undefined {
    return this.gait.onStep ?? undefined;
  }

  constructor(outfit: Outfit, opts: { seated?: boolean; shadows?: boolean } = {}) {
    this.outfit = Character.sanitize(outfit);
    this.seated = !!opts.seated;
    this.shadows = opts.shadows !== false;
    this.buildRig();
    this.rebuildAll();
  }

  /**
   * The color an outfit's accessory is drawn in. Accessories that sit on the hair (clip, hats,
   * headphones, crown) must not blend into it: if the saved color is too close to the hair
   * color it is swapped for a palette color that contrasts (so old saves, NPCs and random
   * outfits never show a black cap on black hair). Anything else is drawn as saved.
   */
  static accessoryColor(o: Outfit): string {
    const acc = o.accessory.style > 0 ? getAccessory(o.accessory.style, o.top.style) : null;
    const onHair = !!acc && acc.head.length > 0 && !acc.fixed;
    if (!onHair || colorGap(o.accessory.color, o.hair.color) >= MIN_ACCENT_GAP) return o.accessory.color;
    return contrastColor(o.hair.color, tuning.art.palette, o.accessory.style);
  }

  /** Copy an outfit and wrap out-of-range styles into the catalog (old saves). */
  private static sanitize(o: Outfit): Outfit {
    const c = structuredClone(o);
    for (const s of ['hair', 'top', 'bottom', 'shoes', 'accessory'] as CatalogSlot[]) c[s].style = clampStyle(s, c[s].style);
    return c;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  /** Apply a new outfit. Pass the slot that changed, or omit to diff every slot. */
  setOutfit(outfit: Outfit, changedSlot?: OutfitSlot): void {
    const prev = this.outfit;
    const next = Character.sanitize(outfit);
    this.outfit = next;
    const same = (a: { style: number; color: string }, b: { style: number; color: string }) => a.style === b.style && a.color.toLowerCase() === b.color.toLowerCase();
    const dirty = new Set<OutfitSlot>();
    if (changedSlot) dirty.add(changedSlot);
    else {
      if (prev.skin !== next.skin) dirty.add('skin');
      for (const k of ['hair', 'top', 'bottom', 'shoes', 'accessory'] as const) if (!same(prev[k], next[k])) dirty.add(k);
    }
    // face options (eyes, brows, freckles, makeup, stickers) live in the body mesh: always diffed
    if (faceKey(prev.face) !== faceKey(next.face)) dirty.add('skin');
    // hair and accessory depend on each other (hats hide hair volume, crowns sit on hair);
    // chains and bags sit on the top
    if (dirty.has('hair') || dirty.has('accessory') || dirty.has('top')) {
      dirty.add('hair');
      dirty.add('accessory');
    }
    if (dirty.has('skin') || dirty.has('hair')) this.buildBody(); // skin color (and lips); hair color drives the brows
    if (dirty.has('hair')) this.buildHair();
    if (dirty.has('accessory')) this.buildAccessory();
    if (dirty.has('top')) this.buildTop();
    if (dirty.has('bottom')) this.buildBottom();
    if (dirty.has('shoes')) this.buildShoes();
    this.refreshMeshes();
    if (dirty.size) this.react();
  }

  /** Free the GPU buffers (call when a character is thrown away). */
  dispose(): void {
    for (const m of this.catMeshes.values()) m.geometry.dispose();
    this.ledMat?.dispose();
    this.skeleton.dispose();
  }

  /** Little wave hello (~1.5 s). */
  wave(): void {
    this.waveAnim = { t: 0, dur: tuning.dressup.waveSeconds };
    this.react();
  }
  /** A happy reaction (~0.6 s): open smile, happy squint, brows up. Outfit changes, poses, waves and hops trigger it. */
  react(seconds = 0.62): void {
    this.happyAnim = { t: 0, dur: seconds };
  }
  /**
   * Look at a world point (e.g. the camera's position — pass the same Vector3 and it keeps
   * following). The head turns most of the way and the eyes cover the rest. `null` = look ahead.
   */
  lookAt(target: THREE.Vector3 | null): void {
    this.lookTarget = target;
  }
  /**
   * A cool pose (hands on hips, peace sign + wink, arms crossed, runway strut, jump, twirl).
   * `hold` = total seconds (default tuning.dressup.poseSeconds). Ignored in the first
   * 45% of a running pose so rapid taps don't restart it.
   */
  pose(kind?: PoseKind, hold?: number, force = false): void {
    if (!force && this.poseAnim && this.poseAnim.t < this.poseAnim.dur * 0.45) return;
    this.stopEmote();
    let k = kind;
    if (!k) {
      const choices = POSE_ORDER.filter((p) => p !== this.lastPose);
      k = choices[Math.floor(Math.random() * choices.length)];
    }
    this.lastPose = k;
    const base = hold ?? tuning.dressup.poseSeconds * (k === 'twirl' ? 1.25 : 1);
    this.poseAnim = { t: 0, dur: base, kind: k };
    this.react();
  }
  /** True while a pose is playing (for UI that waits for the "hold"). */
  get posing(): boolean {
    return !!this.poseAnim;
  }
  /** Small happy jump. */
  hop(): void {
    this.hopAnim = { t: 0, dur: tuning.dressup.hopSeconds };
    this.react();
  }
  /**
   * On-foot locomotion (call every frame): 0 = idle, ~0.3-0.6 = walk, 1 = run.
   * `grounded` false plays the airborne pose; landing plays a small knee bend.
   * Ignored while seated.
   */
  setMove(speed01: number, grounded: boolean): void {
    this.gait.setMove(speed01, grounded);
    if (this.emote && (speed01 > 0.12 || !grounded)) this.stopEmote(); // moving cancels an emote
  }
  /**
   * Swimming (call every frame while in water): 0 = not swimming, 1 = fully swimming.
   * The caller sinks the group so the water line sits at the chest; this only poses.
   * Blends (about 0.2 s) into a front crawl when `setMove` speed01 > ~0.1 (torso pitched
   * ~66 deg forward, head up, alternating overarm stroke, flutter kick) and into treading
   * water when idle (upright, sculling arms, slow kick). 0 returns to the normal gait.
   */
  setSwim(amount: number): void {
    this.swimTarget = clamp(amount, 0, 1);
  }
  /**
   * Gliding: arms up holding the glider handles, legs dangling. Attach the glider mesh to
   * `gliderAnchor` (origin = the hands' grip point; the hands are ~0.22 either side of it).
   * Hides the back-bling mount while on.
   */
  setGliding(on: boolean): void {
    this.glideTarget = on ? 1 : 0;
  }
  get gliding(): boolean {
    return this.glideTarget > 0.5;
  }
  /**
   * Skydiving, belly down: arms out to the sides and slightly bent, legs spread and bent back,
   * back arched, head up looking forward. Blends in and out over ~0.2 s. The pose is authored in
   * the character's own (upright) frame: the caller still tilts the group belly-down (the head
   * leads, the belly faces the ground); the limbs, the arched back and the neck are posed here.
   */
  setSkydive(on: boolean): void {
    this.skyTarget = on ? 1 : 0;
  }
  get skydiving(): boolean {
    return this.skyTarget > 0.5;
  }
  /** A distinct sprint (full run pose, faster arms, more lean); call alongside setMove. */
  setSprint(on: boolean): void {
    this.gait.sprintT = on ? 1 : 0;
  }
  /**
   * Hang a back bling on the upper-back mount (origin at the mount, +Z pointing away from the
   * back). Pass null to remove it. The previous bling is detached, not disposed.
   */
  setBackBling(obj: THREE.Object3D | null): void {
    if (this.bling) this.backMount.remove(this.bling);
    this.bling = obj;
    if (obj) this.backMount.add(obj);
  }
  /**
   * Play an emote from `EMOTES` (loops until `stopEmote()` when its `loop` is true; one-shots
   * end by themselves). Moving, jumping, swimming, gliding, posing or sitting in a car cancels
   * it. Returns false for an unknown id. The caller emits the `emoteStarted` event.
   */
  playEmote(id: string): boolean {
    const info = EMOTES.find((e) => e.id === id);
    if (!info || this.seated || this.swimTarget > 0.5 || this.glideTarget > 0.5 || this.skyTarget > 0.5) return false;
    this.poseAnim = null;
    if (id === 'wave') this.waveAnim = { t: 0, dur: tuning.dressup.waveSeconds };
    this.emote = { id, t: 0, dur: id === 'wave' ? tuning.dressup.waveSeconds : EMOTE_SECONDS[id] ?? 0, loop: info.loop, stopping: false };
    if (id !== 'twirl') this.emoteYaw = 0;
    this.react();
    return true;
  }
  /** End the current emote (it eases out; a twirl finishes its turn). */
  stopEmote(): void {
    if (this.emote) this.emote.stopping = true;
  }
  /** The id of the emote that is playing, or null. */
  get emoting(): string | null {
    return this.emote && !this.emote.stopping ? this.emote.id : null;
  }
  /** Start a jump: ~0.08 s squat, then takeoff + airborne poses (the caller moves the group). */
  jump(): void {
    if (!this.seated) {
      this.gait.jump();
      this.stopEmote();
    }
  }
  /** Seated drivers: -1 (left) … 1 (right) — turns the head and the hands on the wheel. */
  setSteer(v: number): void {
    this.steer = clamp(v, -1, 1);
  }

  /** Scale-able object for juice's popScale: scaling it bounces every mesh of that slot. */
  partObject(slot: OutfitSlot): THREE.Object3D | null {
    switch (slot) {
      case 'hair': return this.hairMount;
      case 'accessory': return this.outfit.accessory.style > 0 ? this.proxy.accessory : null;
      case 'top': return this.proxy.top;
      case 'bottom': return this.proxy.bottom;
      case 'shoes': return this.proxy.shoes;
      case 'skin': return this.proxy.skin;
    }
  }

  /** World-space point near a slot (for sparkles). */
  slotAnchor(slot: OutfitSlot): THREE.Vector3 {
    this.group.updateWorldMatrix(true, false);
    const local =
      slot === 'hair' || slot === 'accessory' ? new THREE.Vector3(0, HEAD_Y + this.hairTopY * 0.9 * B.headScale, 0)
        : slot === 'top' ? new THREE.Vector3(0, 1.2, 0.12)
          : slot === 'bottom' ? new THREE.Vector3(0, 0.62, 0.12)
            : slot === 'shoes' ? new THREE.Vector3(0, 0.1, 0.18)
              : new THREE.Vector3(0, 1.1, 0.12);
    return this.group.localToWorld(local);
  }

  /** World point above the head (name tags, speech bubbles). */
  headTop(): THREE.Vector3 {
    const y = HEAD_Y + Math.max(this.hairTopY, this.accTopY) * B.headScale + 0.1;
    return this.group.localToWorld(new THREE.Vector3(0, y, 0));
  }

  update(dt: number, _t?: number): void {
    const D = tuning.dressup;
    this.clock += dt;
    const T = this.clock + this.phase;
    const breath = Math.sin(T * 2.2);

    // ── timers ──
    const adv = <A extends { t: number; dur: number }>(a: A | null): A | null => {
      if (!a) return null;
      a.t += dt;
      return a.t >= a.dur ? null : a;
    };
    const waveA = (this.waveAnim = adv(this.waveAnim));
    const poseA = (this.poseAnim = adv(this.poseAnim));
    const hopA = (this.hopAnim = adv(this.hopAnim));
    this.steerSmooth += (this.steer - this.steerSmooth) * Math.min(1, dt * 8);

    // ── base pose ──
    const A: ArmPose[] = this.arms.map((_, i) => ({ sx: Math.sin(T * 1.7 + i * Math.PI) * 0.03, sz: 0.07 + breath * 0.01, ex: -0.14, ez: 0, wr: 0, wf: 0, wx: 0 }));
    const hk: HandKind[] = ['relax', 'relax'];
    const wristTo = (a: ArmPose, wr: number, wf: number, w: number, wx = 0) => {
      a.wr = lerp(a.wr, wr, w);
      a.wf = lerp(a.wf, wf, w);
      a.wx = lerp(a.wx, wx, w);
    };
    const L = this.legs.map(() => ({ hx: 0, hz: 0.022, kx: 0 }));
    let rigX = 0;
    let rigY = 0, rigYaw = 0, rigRollZ = Math.sin(T * 0.9) * D.idleSway, rigSY = 1, rigSXZ = 1;
    let leanX = 0, twistY = 0, rollZ = 0;
    let headX = Math.sin(T * 0.8) * 0.025, headY = Math.sin(T * 0.55) * 0.1, headZ = Math.sin(T * 0.43) * 0.03;
    // expression: eyes narrowing (squint), winks, smile + smirk, raised brows, open mouth
    let squint = 0, smile = 0.42, smirk = 0, open = 0, browUp = 0;
    const wink = [0, 0];

    if (this.seated) {
      const st = this.steerSmooth;
      A.forEach((a, i) => {
        a.sx = -0.9 + (i === 0 ? 1 : -1) * st * 0.18 + Math.sin(T * 3.1 + i) * 0.008;
        a.sz = 0.1;
        a.ex = -0.55;
      });
      L.forEach((l) => {
        l.hx = -1.5;
        l.hz = 0.05;
        l.kx = 1.5;
      });
      headY = headY * 0.5 + st * 0.3;
      rollZ = -st * 0.04;
      leanX = 0.04;
      rigRollZ = 0;
      hk[0] = hk[1] = 'grip';
    }

    const blend = (a: ArmPose, sx: number, sz: number, ex: number, ez: number, w: number) => {
      a.sx = lerp(a.sx, sx, w);
      a.sz = lerp(a.sz, sz, w);
      a.ex = lerp(a.ex, ex, w);
      a.ez = lerp(a.ez, ez, w);
    };

    // holding a tumbler: the -x hand carries it at waist height
    if (this.holdsCup && !this.seated) {
      blend(A[1], -0.3, 0.09, -1.35, -0.1, 1);
      hk[1] = 'grip';
    }

    // ── locomotion (walk / run / jump / land) ──
    const G = this.gait.update(dt, !this.seated);
    if (!this.seated) {
      const gw = G.w;
      L.forEach((l, i) => {
        l.hx = lerp(l.hx, G.hip[i], gw);
        l.kx = lerp(l.kx, G.knee[i], gw);
        l.hz = lerp(l.hz, 0.03, gw);
      });
      A.forEach((a, i) => {
        if (i === 1 && this.holdsCup) {
          a.sx = lerp(a.sx, -0.3 + G.arm[i] * 0.2, gw);
          return;
        }
        a.sx = lerp(a.sx, G.arm[i], gw);
        a.ex = lerp(a.ex, -G.elbow, gw);
        a.sz = lerp(a.sz, 0.08 + G.run * 0.06, gw);
      });
      rigY += G.bob * gw;
      leanX += G.lean * gw;
      headX -= G.lean * gw * 0.8;
      twistY += G.twist * gw * 0.5;
      rollZ += G.roll * gw;
      // airborne: knees up a bit, arms out
      L.forEach((l, i) => {
        l.hx = lerp(l.hx, i === 0 ? -0.6 : -0.22, G.air);
        l.kx = lerp(l.kx, i === 0 ? 1.0 : 0.65, G.air);
      });
      A.forEach((a) => blend(a, -0.15, 1.0, -0.25, 0.2, G.air));
      // jump anticipation + takeoff extension + landing flex
      const squat = Math.max(G.crouch, G.land);
      rigSY *= 1 - squat * 0.04;
      L.forEach((l) => {
        l.hx = lerp(l.hx, -0.7, squat);
        l.kx = lerp(l.kx, 1.25, squat);
      });
      leanX += squat * 0.12;
      A.forEach((a) => blend(a, 0.35, 0.4, -0.3, 0, G.crouch * 0.7));
      A.forEach((a) => blend(a, -0.4, 1.7, -0.1, 0.15, G.launch * 0.6));
      if (G.launch > 0) L.forEach((l) => { l.hx = lerp(l.hx, 0.1, G.launch * 0.7); l.kx = lerp(l.kx, 0.05, G.launch * 0.7); });
    }

    // ── idle life: shift weight from foot to foot, a little hip sway ──
    this.swimW += (this.swimTarget - this.swimW) * (1 - Math.exp(-dt / 0.07));
    this.glideW += (this.glideTarget - this.glideW) * (1 - Math.exp(-dt / 0.12));
    this.skyW += (this.skyTarget - this.skyW) * (1 - Math.exp(-dt / 0.07));
    {
      const idleW = this.seated ? 0 : (1 - G.w) * (1 - G.air) * (1 - this.swimW) * (1 - this.glideW) * (1 - Math.max(G.crouch, G.land));
      const ws = Math.sin(T * 0.31) * 0.7 + Math.sin(T * 0.77 + 1.3) * 0.3;
      rigX += ws * 0.014 * idleW;
      rollZ -= ws * 0.03 * idleW;
      rigRollZ += ws * 0.012 * idleW;
      L[1].hz += Math.max(0, ws) * 0.07 * idleW;
      L[0].hz += Math.max(0, -ws) * 0.07 * idleW;
      L[1].hx -= Math.max(0, ws) * 0.05 * idleW;
      L[0].hx -= Math.max(0, -ws) * 0.05 * idleW;
    }

    // ── hop ──
    if (hopA) {
      const k = hopA.t / hopA.dur;
      const up = Math.sin(k * Math.PI);
      rigY += up * D.hopHeight;
      const crouch = k < 0.15 ? smooth01(k / 0.15) : k > 0.85 ? smooth01((k - 0.85) / 0.15) : 0;
      rigSY *= 1 - crouch * 0.04;
      A.forEach((a) => blend(a, a.sx - 0.2, 0.7, a.ex, 0.2, up * 0.8));
      if (!this.seated) L.forEach((l) => { l.hx -= 0.3 * up; l.kx += 0.6 * up; });
      smile = Math.max(smile, 0.3 + up * 0.5);
    }

    // ── wave (the +x arm) ──
    if (waveA) {
      const k = waveA.t / waveA.dur;
      const w = envelope(k, 0.14, 0.86);
      blend(A[0], -0.1, 1.9, 0, 0.85 + Math.sin(waveA.t * 13) * 0.4, w);
      wristTo(A[0], 1, 0, w, Math.sin(waveA.t * 13) * 0.3);
      if (w > 0.3) hk[0] = 'open';
      headZ -= 0.1 * w;
      headY += 0.1 * w;
      rollZ -= 0.03 * w;
      squint = Math.max(squint, 0.25 * w);
      smile = Math.max(smile, 0.3 + 0.7 * w);
      open = Math.max(open, 0.25 * w);
    }

    // ── poses ──
    if (poseA) {
      const k = poseA.t / poseA.dur;
      const w = envelope(k, 0.18, 0.84);
      switch (poseA.kind) {
        case 'hips': {
          A.forEach((a) => {
            blend(a, -0.1, 0.72, 0, -1.42, w);
            wristTo(a, HIPS.wr, HIPS.wf, w, HIPS.wx);
          });
          rollZ += 0.05 * w;
          headZ += 0.1 * w;
          headY += 0.16 * w;
          if (!this.seated) {
            L[1].hz += 0.14 * w;
            L[0].hx -= 0.06 * w;
          }
          smile = Math.max(smile, 0.3 + 0.35 * w);
          smirk = Math.max(smirk, 0.7 * w);
          break;
        }
        case 'peace': {
          blend(A[0], -1.0, 0.32, -1.5, 0.0, w);
          blend(A[1], -0.1, 0.72, 0, -1.42, w);
          wristTo(A[1], HIPS.wr, HIPS.wf, w, HIPS.wx);
          wristTo(A[0], PEACE_ROLL, 0, w);
          if (w > 0.5) hk[0] = 'peace';
          headZ -= 0.12 * w;
          headY += 0.12 * w;
          rollZ -= 0.04 * w;
          wink[1] = w;
          smile = Math.max(smile, 0.3 + 0.7 * w);
          smirk = Math.max(smirk, 0.4 * w);
          browUp = Math.max(browUp, 0.5 * w);
          break;
        }
        case 'cross': {
          blend(A[0], -0.5, -0.12, -1.55, -1.0, w);
          blend(A[1], -0.55, -0.12, -1.75, -1.0, w);
          headX -= 0.06 * w;
          headY += 0.1 * w;
          if (!this.seated) {
            L[0].hz += 0.05 * w;
            L[1].hz += 0.05 * w;
          }
          smile = Math.max(smile, 0.25 + 0.2 * w);
          smirk = Math.max(smirk, 0.8 * w);
          squint = Math.max(squint, 0.2 * w);
          break;
        }
        case 'strut': {
          blend(A[0], 0.3, 0.2, -0.3, 0, w);
          blend(A[1], -0.1, 0.72, 0, -1.42, w);
          wristTo(A[1], HIPS.wr, HIPS.wf, w, HIPS.wx);
          if (!this.seated) {
            L[0].hx -= 0.32 * w;
            L[0].hz -= 0.07 * w;
            L[1].hx += 0.14 * w;
          }
          rollZ -= 0.05 * w;
          twistY += 0.16 * w;
          headY += 0.28 * w;
          headX -= 0.06 * w;
          smirk = Math.max(smirk, 0.9 * w);
          smile = Math.max(smile, 0.25 + 0.25 * w);
          break;
        }
        case 'jump': {
          const crouch = k < 0.2 ? smooth01(k / 0.2) : k > 0.82 ? Math.sin(((k - 0.82) / 0.18) * Math.PI) : 0;
          const air = k > 0.2 && k < 0.82 ? (k - 0.2) / 0.62 : 0;
          const armsUp = k < 0.2 ? 0 : k < 0.82 ? smooth01((k - 0.2) / 0.14) : 1 - smooth01((k - 0.82) / 0.18);
          rigY += Math.sin(air * Math.PI) * D.hopHeight * 1.9;
          rigSY *= 1 - crouch * 0.05;
          leanX += crouch * 0.12;
          A.forEach((a) => {
            blend(a, 0.35, 0.4, -0.2, 0, crouch * 0.8);
            blend(a, -0.05, 2.8, 0, 0.1, armsUp);
          });
          const tuck = Math.sin(air * Math.PI);
          if (!this.seated) {
            L.forEach((l) => {
              l.hx += -0.6 * crouch - 0.4 * tuck;
              l.kx += 1.1 * crouch + 0.9 * tuck;
            });
          }
          smile = Math.max(smile, 0.3 + 0.7 * armsUp);
          open = Math.max(open, 0.7 * armsUp);
          squint = Math.max(squint, 0.35 * armsUp);
          headX -= 0.14 * armsUp;
          break;
        }
        case 'twirl': {
          rigYaw += smooth01(k) * TAU;
          rigY += Math.sin(k * Math.PI) * 0.06;
          A.forEach((a) => blend(a, 0, 1.4, -0.05, 0.25, w));
          leanX += Math.sin(k * Math.PI * 2) * 0.03;
          if (!this.seated) L.forEach((l) => { l.hz += 0.05 * w; l.hx -= 0.1 * w; l.kx += 0.2 * w; });
          smile = Math.max(smile, 0.3 + 0.7 * w);
          open = Math.max(open, 0.4 * w);
          break;
        }
      }
    }

    // ── v3: emotes ──
    if (this.emote) {
      const em = this.emote;
      em.t += dt;
      if (!em.loop && !em.stopping && em.t >= em.dur) em.stopping = true;
      if (this.seated || this.swimTarget > 0.5 || this.glideTarget > 0.5 || this.skyTarget > 0.5) em.stopping = true;
      const yawLeft = em.id === 'twirl' ? Math.ceil(this.emoteYaw / TAU - 1e-4) * TAU - this.emoteYaw : 0;
      const hold = em.stopping && yawLeft > 0.03; // a twirl finishes its turn
      this.emoteW += ((em.stopping && !hold ? 0 : 1) - this.emoteW) * (1 - Math.exp(-dt / (em.stopping && !hold ? 0.16 : 0.12)));
      if (em.stopping && !hold && this.emoteW < 0.015) {
        this.emote = null;
        this.emoteW = 0;
        this.emoteYaw = 0;
      } else if (this.emoteW > 0.003) {
        const ew = this.emoteW;
        const t = em.t;
        const beat = t * 2; // 120 bpm
        const bob = Math.abs(Math.sin(Math.PI * beat));
        const mix = (cur: number, tgt: number) => lerp(cur, tgt, ew);
        const arm = (i: number, sx: number, sz: number, ex: number, ez: number) => blend(A[i], sx, sz, ex, ez, ew);
        switch (em.id) {
          case 'wave': break; // the wave overlay above does the work
          case 'cheer': { // two happy jumps with both arms up in a V
            const k = (t / em.dur) * 2;
            const up = Math.abs(Math.sin(Math.PI * k));
            rigY = mix(rigY, up * 0.2);
            A.forEach((_, i) => arm(i, -0.05, 2.55 + 0.15 * Math.sin(t * 16 + i), 0, 0.1));
            L.forEach((l) => { l.hx = mix(l.hx, -0.5 * up - 0.12 * (1 - up)); l.kx = mix(l.kx, 0.2 + 0.9 * up); });
            leanX = mix(leanX, -0.04);
            headX = mix(headX, -0.2);
            smile = Math.max(smile, ew);
            open = Math.max(open, ew);
            squint = Math.max(squint, 0.8 * ew);
            browUp = Math.max(browUp, ew);
            break;
          }
          case 'tada': { // a sweeping bow, then arms thrown wide
            const bow = smooth01(t / 0.4) * (1 - smooth01((t - 0.55) / 0.3));
            const open2 = smooth01((t - 0.6) / 0.3);
            A.forEach((_, i) => arm(i, 0.35 * bow - 0.1 * open2, 0.3 + 1.75 * open2 + 0.3 * bow, -0.2 * (1 - open2), 0));
            leanX = mix(leanX, 0.55 * bow - 0.08 * open2);
            headX = mix(headX, -0.4 * bow - 0.12 * open2);
            rigY = mix(rigY, open2 * Math.abs(Math.sin(t * 6)) * 0.03);
            L.forEach((l) => { l.hx = mix(l.hx, -0.2 * bow); l.kx = mix(l.kx, 0.3 * bow); });
            wristTo(A[0], 0.6, 0, ew * open2);
            wristTo(A[1], 0.6, 0, ew * open2);
            hk[0] = hk[1] = open2 > 0.4 ? 'open' : hk[0];
            smile = Math.max(smile, ew);
            open = Math.max(open, 0.8 * ew * open2);
            squint = Math.max(squint, 0.6 * ew);
            break;
          }
          case 'heart': { // hands together in a heart in front of the chest, swaying
            const pulse = 1 + 0.5 * Math.max(0, Math.sin(t * 5.2));
            A.forEach((_, i) => {
              arm(i, -0.75, 0.14, -2.05, -0.6);
              wristTo(A[i], HEART_ROLL, 0, ew);
            });
            hk[0] = hk[1] = 'heart';
            rollZ = mix(rollZ, Math.sin(t * 2.6) * 0.07);
            headZ = mix(headZ, Math.sin(t * 2.6) * 0.12);
            rigY = mix(rigY, Math.sin(t * 5.2) * 0.012 * pulse);
            leanX = mix(leanX, 0.05);
            smile = Math.max(smile, ew);
            open = Math.max(open, 0.25 * ew);
            squint = Math.max(squint, 0.7 * ew);
            browUp = Math.max(browUp, 0.6 * ew);
            break;
          }
          case 'twirl': { // spin on the spot with arms out; the turn always finishes
            if (!em.stopping) this.emoteYaw += (TAU / 1.5) * dt;
            else this.emoteYaw += Math.min(yawLeft, (TAU / 1.5) * dt);
            rigYaw += this.emoteYaw;
            rigY = mix(rigY, Math.abs(Math.sin(this.emoteYaw / 2)) * 0.05);
            A.forEach((_, i) => arm(i, 0, 1.4 + 0.1 * Math.sin(t * 7 + i), -0.05, 0.2));
            L.forEach((l, i) => { l.hz = mix(l.hz, 0.06); l.hx = mix(l.hx, i === 0 ? -0.18 : 0.05); l.kx = mix(l.kx, i === 0 ? 0.4 : 0.1); });
            leanX = mix(leanX, Math.sin(t * 3) * 0.03);
            hk[0] = hk[1] = 'open';
            smile = Math.max(smile, ew);
            open = Math.max(open, 0.5 * ew);
            break;
          }
          case 'bounce': { // bouncing on both feet, fists pumping
            rigY = mix(rigY, bob * 0.075);
            L.forEach((l) => { l.hx = mix(l.hx, -0.25 * (1 - bob)); l.kx = mix(l.kx, 0.55 * (1 - bob) + 0.1); l.hz = mix(l.hz, 0.09); });
            A.forEach((_, i) => arm(i, -1.0 + 0.55 * Math.sin(Math.PI * beat + i * Math.PI), 0.32, -1.5, 0));
            hk[0] = hk[1] = 'grip';
            leanX = mix(leanX, 0.05 + 0.04 * (1 - bob));
            headX = mix(headX, 0.06 * Math.sin(Math.PI * 2 * beat));
            headZ = mix(headZ, Math.sin(Math.PI * beat) * 0.08);
            smile = Math.max(smile, ew);
            open = Math.max(open, 0.6 * ew);
            squint = Math.max(squint, 0.4 * ew);
            break;
          }
          case 'shuffle': { // side-to-side shuffle with a jog-in-place arm swing
            const sw = Math.sin(Math.PI * beat);
            rigX = mix(rigX, sw * 0.1);
            rigY = mix(rigY, bob * 0.02);
            L.forEach((l, i) => {
              const side = i === 0 ? sw : -sw;
              l.hz = mix(l.hz, 0.1 + 0.18 * Math.max(0, side));
              l.hx = mix(l.hx, -0.2 * Math.max(0, -side));
              l.kx = mix(l.kx, 0.15 + 0.5 * Math.max(0, -side));
            });
            A.forEach((_, i) => arm(i, 0.9 * Math.sin(Math.PI * 2 * beat + i * Math.PI) - 0.2, 0.3, -1.3, 0));
            hk[0] = hk[1] = 'grip';
            rollZ = mix(rollZ, -sw * 0.1);
            twistY = mix(twistY, Math.sin(Math.PI * 2 * beat) * 0.18);
            leanX = mix(leanX, 0.1);
            headY = mix(headY, -sw * 0.2);
            smile = Math.max(smile, 0.8 * ew);
            smirk = Math.max(smirk, 0.5 * ew);
            break;
          }
          case 'robot': { // snappy, stiff, 4-pose robot loop
            const q = t * 2;
            const k0 = Math.floor(q), fr = smooth01((q - k0) * 3.2);
            const POSES: [number, number, number, number][][] = [
              [[-1.57, 0.12, -1.57, 0], [0, 0.12, 0, 0]],
              [[0, 1.57, 0, 0], [-1.57, 0.12, -1.57, 0]],
              [[-1.57, 0.12, 0, 0], [-1.57, 0.12, 0, 0]],
              [[0, 0.12, 0, 0], [0, 1.57, 0, 0]],
            ];
            const pa = POSES[((k0 % 4) + 4) % 4], pb = POSES[(((k0 + 1) % 4) + 4) % 4];
            A.forEach((_, i) => arm(i, lerp(pa[i][0], pb[i][0], fr), lerp(pa[i][1], pb[i][1], fr), lerp(pa[i][2], pb[i][2], fr), lerp(pa[i][3], pb[i][3], fr)));
            hk[0] = hk[1] = 'open';
            const hs = (Math.floor(q / 2) % 2 === 0 ? 1 : -1) * 0.5;
            const hsn = (Math.floor((q - 1) / 2) % 2 === 0 ? 1 : -1) * 0.5;
            headY = mix(headY, lerp(hsn, hs, smooth01((q % 2) * 3.2 > 1 ? 1 : (q % 2) * 3.2)));
            twistY = mix(twistY, (Math.floor(q) % 2 === 0 ? 0.3 : -0.3) * fr + (Math.floor(q) % 2 === 0 ? -0.3 : 0.3) * (1 - fr));
            rigY = mix(rigY, -0.02);
            L.forEach((l, i) => { l.hx = mix(l.hx, (Math.floor(q) % 2 === i ? -0.28 : 0.0) * fr); l.kx = mix(l.kx, (Math.floor(q) % 2 === i ? 0.4 : 0.05) * fr); });
            smile = Math.max(smile, 0.1);
            smile = ew > 0.5 ? 0.15 : smile;
            break;
          }
          case 'sway': { // arms overhead, swaying like glow sticks at a concert
            const sw = Math.sin(t * 2.6);
            A.forEach((_, i) => arm(i, -0.3 + 0.12 * Math.sin(t * 5.2 + i), 2.55 + 0.35 * (i === 0 ? sw : -sw) * 0 + 0.2 * sw * (i === 0 ? 1 : 1), -0.1, 0.25 * sw));
            hk[0] = hk[1] = 'grip';
            rigX = mix(rigX, sw * 0.07);
            rollZ = mix(rollZ, -sw * 0.14);
            rigRollZ = mix(rigRollZ, sw * 0.04);
            L.forEach((l, i) => { l.hz = mix(l.hz, 0.08 + 0.1 * Math.max(0, i === 0 ? sw : -sw)); l.kx = mix(l.kx, 0.12 + 0.1 * Math.abs(sw)); });
            headZ = mix(headZ, sw * 0.18);
            headX = mix(headX, -0.1);
            smile = Math.max(smile, ew);
            open = Math.max(open, 0.35 * ew);
            squint = Math.max(squint, 0.5 * ew);
            break;
          }
          case 'giggle': { // doubled over laughing, hand over mouth
            const sh = Math.sin(t * 15);
            rigY = mix(rigY, sh * 0.012 - 0.02);
            leanX = mix(leanX, 0.3 + 0.07 * sh);
            headX = mix(headX, -0.32 + 0.07 * Math.sin(t * 15 + 1));
            rollZ = mix(rollZ, Math.sin(t * 7.5) * 0.06);
            arm(0, -0.45, 0.2, -1.4, -0.8); // hand on the belly
            arm(1, -1.15, 0.3, -2.0, -0.5); // hand at the mouth
            wristTo(A[1], 0.3, 0, ew);
            hk[0] = 'relax';
            hk[1] = 'relax';
            L.forEach((l) => { l.hx = mix(l.hx, -0.15); l.kx = mix(l.kx, 0.3 + 0.1 * sh); });
            smile = Math.max(smile, ew);
            open = Math.max(open, (0.55 + 0.35 * sh) * ew);
            squint = Math.max(squint, 0.95 * ew);
            browUp = Math.max(browUp, 0.5 * ew);
            break;
          }
          case 'swing': { // sitting on the ground, kicking the legs, leaning back on the hands
            rigY = mix(rigY, -0.76);
            L.forEach((l, i) => {
              const f = Math.sin(t * 5.4 + i * Math.PI);
              l.hx = mix(l.hx, -1.5);
              l.hz = mix(l.hz, 0.1);
              l.kx = mix(l.kx, 0.2 + 0.95 * (0.5 + 0.5 * f));
            });
            A.forEach((_, i) => { arm(i, 0.55, 0.28, -0.12, 0); wristTo(A[i], 0, 0, ew); });
            leanX = mix(leanX, -0.12);
            headX = mix(headX, 0.05 + Math.sin(t * 2.7) * 0.04);
            headY = mix(headY, Math.sin(t * 1.3) * 0.25);
            rollZ = mix(rollZ, Math.sin(t * 2.7) * 0.05);
            smile = Math.max(smile, ew);
            open = Math.max(open, 0.3 * ew);
            break;
          }
        }
      }
    }

    // ── v3: swimming (front crawl when moving, treading water when idle) ──
    if (this.swimW > 0.002) {
      const sw = this.swimW;
      const sp = this.gait.speed;
      const cw = smooth01((sp - 0.06) / 0.2); // 0 = treading, 1 = crawling
      this.swimPhase += TAU * lerp(0.62, 0.7 + 0.8 * sp, cw) * dt;
      const ph = this.swimPhase;
      A.forEach((a, i) => {
        const f = ph + i * Math.PI;
        const c = Math.cos(f), sn = Math.sin(f), rec = Math.max(0, sn);
        // crawl: the arm swings back underwater (pull) and forward over the head (recovery, elbow high)
        const cx = -1.35 + 1.55 * c, cz = 0.12 + 0.28 * rec, ce = -0.25 - 0.9 * rec;
        // tread: arms out to the sides, forearms sculling in small circles
        const tx = -0.45 + 0.3 * sn, tz = 0.95 + 0.15 * c, te = -1.0 + 0.4 * c;
        blend(a, lerp(tx, cx, cw), lerp(tz, cz, cw), lerp(te, ce, cw), 0, sw);
        wristTo(a, 0, 0, sw);
      });
      hk[0] = hk[1] = sw > 0.4 ? 'open' : hk[0];
      L.forEach((l, i) => {
        const f = ph * 2 + i * Math.PI;
        const kick = Math.sin(f), kick2 = Math.sin(ph * 0.7 + i * Math.PI);
        l.hx = lerp(l.hx, lerp(-0.15 + 0.32 * kick2, 0.3 + 0.42 * kick, cw), sw);
        l.kx = lerp(l.kx, lerp(0.7 + 0.35 * Math.max(0, kick2), 0.35 + 0.3 * Math.max(0, kick), cw), sw);
        l.hz = lerp(l.hz, 0.06, sw);
      });
      const lean = lerp(0.12, 1.15, cw);
      leanX = lerp(leanX, lean, sw);
      headX = lerp(headX, -lean * 0.72 + Math.sin(ph) * 0.04, sw); // head stays up: the face looks ahead
      headY = lerp(headY, Math.sin(ph * 0.5) * 0.16 * cw, sw);
      rollZ = lerp(rollZ, Math.sin(ph) * 0.16 * cw, sw);
      twistY = lerp(twistY, Math.cos(ph) * 0.14 * cw, sw);
      rigRollZ = lerp(rigRollZ, 0, sw);
      rigY = lerp(rigY, Math.sin(ph * lerp(1.4, 2, cw)) * lerp(0.03, 0.012, cw), sw);
      rigX = lerp(rigX, 0, sw);
      smile = Math.max(smile, 0.45 * sw);
      open = Math.max(open, 0.3 * sw * cw);
    }

    // ── v3: gliding (arms up on the handles, legs dangling) ──
    if (this.glideW > 0.002) {
      const gw = this.glideW;
      A.forEach((a) => {
        blend(a, -2.78, 0.1, -0.12, 0, gw);
        wristTo(a, 0, 0, gw);
      });
      if (gw > 0.4) hk[0] = hk[1] = 'grip';
      L.forEach((l, i) => {
        l.hx = lerp(l.hx, -0.1 + Math.sin(T * 1.7 + i * 0.9) * 0.05, gw);
        l.kx = lerp(l.kx, 0.25 + Math.sin(T * 1.9 + i * 1.7) * 0.08, gw);
        l.hz = lerp(l.hz, 0.05, gw);
      });
      leanX = lerp(leanX, 0.03, gw);
      headX = lerp(headX, -0.08, gw);
      rollZ = lerp(rollZ, Math.sin(T * 1.1) * 0.05, gw);
      twistY = lerp(twistY, 0, gw);
      rigRollZ = lerp(rigRollZ, 0, gw);
      rigX = lerp(rigX, 0, gw);
      smile = Math.max(smile, 0.5 * gw);
      open = Math.max(open, 0.35 * gw);
    }
    // ── v3: skydive (belly down: arms out + bent, legs spread and bent back, arched back, head up) ──
    if (this.skyW > 0.002) {
      const kw = this.skyW;
      const wind = Math.sin(T * 23) * 0.04, wind2 = Math.sin(T * 19 + 1.7) * 0.04;
      A.forEach((a, i) => {
        blend(a, -0.25 + (i === 0 ? wind : wind2), 1.42 + 0.06 * Math.sin(T * 7 + i), 0, 0.72 + (i === 0 ? wind2 : wind), kw);
        wristTo(a, 0, 0, kw);
      });
      if (kw > 0.4) hk[0] = hk[1] = 'open';
      L.forEach((l, i) => {
        l.hx = lerp(l.hx, 0.22 + (i === 0 ? wind2 : wind) * 1.5, kw);
        l.hz = lerp(l.hz, 0.34 + 0.03 * Math.sin(T * 6 + i), kw);
        l.kx = lerp(l.kx, 1.05 + 0.08 * Math.sin(T * 9 + i * 2), kw);
      });
      leanX = lerp(leanX, -0.22, kw); // a gentle arch
      headX = lerp(headX, -1.15, kw); // neck extended: the face looks forward (the group is belly-down)
      headY = lerp(headY, Math.sin(T * 1.3) * 0.08, kw);
      headZ = lerp(headZ, 0, kw);
      rollZ = lerp(rollZ, Math.sin(T * 2.1) * 0.05, kw);
      twistY = lerp(twistY, 0, kw);
      rigRollZ = lerp(rigRollZ, 0, kw);
      rigX = lerp(rigX, 0, kw);
      rigY = lerp(rigY, 0, kw);
      smile = Math.max(smile, 0.85 * kw);
      open = Math.max(open, 0.7 * kw);
      squint = Math.max(squint, 0.35 * kw);
    }
    this.backMount.visible = this.glideW < 0.5;

    // ── a happy reaction (outfit change, pose, wave, hop): open smile + squint + brows up ──
    const happyA = (this.happyAnim = adv(this.happyAnim));
    if (happyA) {
      const w = envelope(happyA.t / happyA.dur, 0.16, 0.66);
      smile = Math.max(smile, 0.3 + 0.7 * w);
      open = Math.max(open, 0.92 * w);
      squint = Math.max(squint, 0.8 * w);
      browUp = Math.max(browUp, 0.85 * w);
      headZ += Math.sin(happyA.t * 9) * 0.03 * w;
    }

    // ── blink (sometimes a double blink) ──
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.15) {
        this.blinkT = -1;
        if (this.blinkAgain) {
          this.blinkAgain = false;
          this.blinkIn = 0.1;
        } else {
          this.blinkIn = 2.2 + Math.random() * 3.2;
          this.blinkAgain = Math.random() < 0.22;
        }
      }
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) this.blinkT = 0;
    }
    const blink = this.blinkT >= 0 ? Math.sin((this.blinkT / 0.15) * Math.PI) : 0;

    // ── gaze: tiny saccades around "straight at you"; the eyes lead the head into turns ──
    let gdy = this.group.rotation.y - this.prevGroupYaw;
    gdy = Math.atan2(Math.sin(gdy), Math.cos(gdy));
    this.prevGroupYaw = this.group.rotation.y;
    this.turnRate += ((dt > 0 ? gdy / dt : 0) - this.turnRate) * Math.min(1, dt * 8);
    const gz = this.gaze;
    gz.next -= dt;
    if (gz.next <= 0) {
      const center = Math.random() < 0.55;
      gz.tx = center ? 0 : (Math.random() * 2 - 1) * 0.55;
      gz.ty = center ? 0 : (Math.random() * 2 - 1) * 0.35;
      gz.next = center ? 0.5 + Math.random() * 1.7 : 0.22 + Math.random() * 0.7;
    }
    let gx = gz.tx * 0.5, gy = gz.ty * 0.5;
    if (this.seated) gx += this.steerSmooth * 0.9;
    else gx += clamp(this.turnRate * 0.18, -0.9, 0.9);
    if (this.lookTarget) {
      this.group.updateWorldMatrix(true, false);
      _look.copy(this.lookTarget);
      this.group.worldToLocal(_look);
      _look.y -= HEAD_Y;
      let yaw = Math.atan2(_look.x, _look.z) - rigYaw;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      const pitch = Math.atan2(_look.y, Math.hypot(_look.x, _look.z));
      const hy = clamp(yaw, -0.9, 0.9) * 0.62, hx = clamp(pitch, -0.5, 0.5) * 0.5;
      headY += hy;
      headX -= hx;
      gx += clamp((yaw - hy) / 0.5, -1, 1);
      gy += clamp((pitch - hx) / 0.4, -1, 1);
    }
    gz.x += (clamp(gx, -1, 1) - gz.x) * Math.min(1, dt * 26);
    gz.y += (clamp(gy, -1, 1) - gz.y) * Math.min(1, dt * 26);

    // ── apply to the rig ──
    const sk = this.proxy.skin.scale;
    this.rig.position.set(rigX, rigY, 0);
    this.rig.rotation.set(0, rigYaw, rigRollZ);
    this.rig.scale.set(rigSXZ * sk.x, rigSY * sk.y, rigSXZ * sk.z);
    this.upper.rotation.set(leanX, twistY, rollZ);
    this.upper.scale.set(1 - breath * 0.004, 1 + breath * D.breath * 0.5, 1 - breath * 0.004);
    this.headRoot.rotation.set(headX, headY, headZ);
    this.arms.forEach((arm, i) => {
      const a = A[i];
      arm.shoulder.rotation.set(a.sx, 0, arm.s * a.sz);
      arm.elbow.rotation.set(a.ex, 0, arm.s * a.ez);
      arm.wrist.rotation.set(a.wx, arm.s * a.wr * (Math.PI / 2), arm.s * a.wf, 'YXZ');
      for (const k of HAND_KINDS) this.handBones[k][i].scale.setScalar(k === hk[i] ? 1 : 0.001);
    });
    // a hand variant is built the first time a pose asks for it
    for (const k of hk) {
      if (!this.handsBuilt.has(k)) {
        this.handsBuilt.add(k);
        this.buildBody();
        this.refreshMeshes();
        break;
      }
    }
    this.legs.forEach((leg, i) => {
      const l = L[i];
      leg.hip.rotation.set(l.hx, 0, leg.s * l.hz);
      leg.knee.rotation.x = l.kx;
    });
    this.cupHolder.scale.setScalar(this.seated ? 0.001 : 1); // no drink while driving
    // a held cup stays upright whatever the arm does
    if (this.holdsCup) this.cupHolder.rotation.x = -(A[1].sx + A[1].ex) * 0.95;
    // face
    const base = 1 - Math.max(blink * 0.94, squint * 0.5);
    this.eyes.forEach((e, i) => (e.scale.y = Math.max(0.06, base - wink[i] * 0.95)));
    this.irises.forEach((ir, i) => ir.position.set(gz.x * EYE.gazeX * (i === 0 ? 1 : -1), gz.y * EYE.gazeY, 0));
    const sm = clamp(smile, 0, 1);
    const armAng = (i: number) => clamp(0.1 + sm * 0.52 * (1 + (i === 0 ? smirk : -smirk) * 0.9), -0.15, 0.95);
    this.corners.forEach((c, i) => {
      const side = i === 0 ? 1 : -1;
      c.rotation.z = side * armAng(i);
      c.scale.x = 1 + sm * 0.1;
    });
    this.lowCorners.forEach((c, i) => {
      const side = i === 0 ? 1 : -1;
      c.rotation.z = side * armAng(i) * 0.55;
      c.scale.x = 1 + sm * 0.1;
    });
    this.mouthAnim.rotation.z = smirk * 0.06;
    this.mouthAnim.position.y = this.mouthY + open * 0.0035; // the upper lip lifts a little as the jaw drops
    this.lipLow.position.y = -open * 0.0185;
    this.mouthIn.scale.set(open > 0.03 ? 1 : 0.001, open > 0.03 ? open : 0.001, 1);
    this.brows.forEach((b, i) => {
      const side = i === 0 ? 1 : -1;
      const raise = browUp * (i === 0 ? 1 : 0.6) + Math.max(0, smirk * side * 0.5) + blink * 0.002;
      b.position.y = raise * 0.0058;
      b.rotation.z = -raise * 0.18 * side;
    });

    // swaying hair (ponytail): idle breeze + lag behind spins
    let dy = rigYaw - this.prevYaw;
    if (dy > Math.PI) dy -= TAU;
    if (dy < -Math.PI) dy += TAU;
    this.prevYaw = rigYaw;
    this.yawVel += ((dt > 0 ? dy / dt : 0) - this.yawVel) * Math.min(1, dt * 10);
    const lag = clamp(this.yawVel * 0.07, -1.2, 1.2);
    const bounce = hopA ? Math.sin((hopA.t / hopA.dur) * Math.PI) : 0;
    const gait = this.gait.speed;
    for (const sw of this.swayers) {
      const idle = Math.sin(T * 2.1 + sw.phase) * 0.06;
      sw.obj.rotation.x = sw.tilt + idle + bounce * 0.2 + gait * 0.35 * Math.sin(this.gait.phase * 2 + sw.phase) * 0.4 - (poseA?.kind === 'jump' ? 0.25 : 0);
      sw.obj.rotation.z = sw.side * 0.06 + Math.sin(T * 1.6 + sw.phase) * 0.04 - lag * 0.8 + sw.side * lag * 0.2;
    }
    // angel wings flap gently (faster while moving)
    if (this.wings.length) {
      const flap = Math.sin(T * (2 + gait * 4)) * (0.14 + gait * 0.12);
      for (const w of this.wings) {
        w.pivot.rotation.y = w.side * (0.25 + flap - (this.seated ? 0.3 : 0));
        w.pivot.rotation.z = w.side * 0.12;
      }
    }
    // LED soles cycle through colors
    if (this.ledMat && this.catMeshes.get('led')?.visible) {
      const hue = (T * 0.22) % 1;
      this.ledMat.color.setHSL(hue, 1, 0.55);
      this.ledMat.emissive.setHSL(hue, 1, 0.55);
    }
    // proxies → real mounts (juice pops the proxy's scale)
    for (const slot of ['top', 'bottom', 'shoes', 'accessory'] as const) {
      const s = this.proxy[slot].scale;
      for (const m of this.mounts[slot]) m.scale.copy(s);
    }
  }

  // ── Construction ─────────────────────────────────────────────────────────
  private ctx(): ColorCtx {
    return { skin: this.outfit.skin, hair: this.outfit.hair.color };
  }

  /** Register a bone (ids follow creation order, so every character gets the same ids). */
  private reg(b: Bone, parent: THREE.Object3D, x = 0, y = 0, z = 0): Bone {
    b.position.set(x, y, z);
    parent.add(b);
    this.boneId.set(b, this.bones.length);
    this.bones.push(b);
    return b;
  }

  /** Bake one geometry onto a bone (bind pose) and queue it in a slot. `extra` = placement inside the bone. */
  private chunk(slot: SlotKey, bone: THREE.Object3D, geo: THREE.BufferGeometry, cat: Cat, color: THREE.Color | null, extra?: THREE.Matrix4, extraKey?: string, bone2?: THREE.Object3D): void {
    const id = this.boneId.get(bone)!;
    const m = extra ? this.rest[id].clone().multiply(extra) : this.rest[id];
    const key = extra ? (extraKey ? `${id}|${extraKey}` : undefined) : `${id}`;
    this.slotChunks[slot].push({ cat, bone: id, bone2: bone2 ? this.boneId.get(bone2) : undefined, baked: bakeGeo(geo, m, key), r: color?.r ?? 1, g: color?.g ?? 1, b: color?.b ?? 1 });
  }

  /** Pieces → chunks: each piece's role picks its vertex color and its material category. */
  private put(slot: SlotKey, bone: THREE.Object3D, ps: Piece[], color: string, finish: Finish, extra?: THREE.Matrix4, extraKey?: string): void {
    const ctx = this.ctx();
    // accessories never share the hair's material: catOf routes them to acc / satin / metal / fabric
    for (const p of ps) this.chunk(slot, bone, p.geo, catOf(p.role, p.finish ?? finish, slot === 'accessory'), roleColor(p.role, color, ctx), extra, extraKey);
  }

  private buildRig(): void {
    const g = this.group;
    const rig = this.reg(this.rig, g);
    // legs (index 0 = +x)
    for (const s of [1, -1]) {
      const hip = this.reg(new THREE.Bone(), rig, s * B.hipX, B.hipY, 0);
      const knee = this.reg(new THREE.Bone(), hip, 0, -B.thighLen, 0);
      const ankle = this.reg(new THREE.Bone(), knee, 0, -B.shinLen, 0);
      const thighBottom = this.reg(new THREE.Bone(), hip);
      const shinBottom = this.reg(new THREE.Bone(), knee);
      const foot = this.reg(new THREE.Bone(), ankle);
      this.legs.push({ s, hip, knee, ankle, thighBottom, shinBottom, foot });
      this.mounts.bottom.push(thighBottom, shinBottom);
      this.mounts.shoes.push(foot);
    }
    // upper body
    const upper = this.reg(this.upper, rig, 0, TY, 0);
    this.reg(this.topMount, upper);
    this.reg(this.bottomMount, upper);
    this.mounts.top.push(this.topMount);
    this.mounts.bottom.push(this.bottomMount);
    // arms
    for (const s of [1, -1]) {
      const shoulder = this.reg(new THREE.Bone(), upper, s * B.shoulderX, B.shoulderY - TY, 0);
      const elbow = this.reg(new THREE.Bone(), shoulder, 0, -B.armUp, 0);
      const wrist = this.reg(new THREE.Bone(), elbow, 0, -B.armLow, 0);
      const upperTop = this.reg(new THREE.Bone(), shoulder);
      const lowerTop = this.reg(new THREE.Bone(), elbow);
      this.arms.push({ s, shoulder, elbow, wrist, upperTop, lowerTop });
      this.mounts.top.push(upperTop, lowerTop);
      for (const k of HAND_KINDS) this.handBones[k].push(this.reg(new THREE.Bone(), wrist));
    }
    // head
    this.reg(this.headRoot, upper, 0, B.neckY - TY, 0);
    this.reg(this.headBody, this.headRoot, 0, B.headCY - B.neckY + B.HY * (B.headScale - 1), 0);
    this.headBody.scale.setScalar(B.headScale);
    this.reg(this.hairMount, this.headBody);
    this.reg(this.tail, this.hairMount, ...TAIL_PIVOT);
    // accessories
    this.reg(this.accHead, this.headBody);
    this.reg(this.accBody, upper);
    this.reg(this.accBack, upper);
    this.wingBones.forEach((w, i) => {
      const s = i === 0 ? 1 : -1;
      this.reg(w, this.accBack, WING_PIVOT.x * s, WING_PIVOT.y, WING_PIVOT.z);
      w.scale.x = s;
    });
    this.reg(this.accHandR, this.arms[1].wrist);
    this.reg(this.cupHolder, this.accHandR, 0.056, -0.054, 0); // the cup sits on the palm side (+x for this arm), inside the gripping fist
    this.reg(this.accWristL, this.arms[0].wrist);
    this.mounts.accessory.push(this.accBody, this.accBack, this.accHead, this.accHandR, this.accWristL);
    // back-bling mount (upper back, +Z away from the back) and the glider grip anchor
    this.backMount.position.set(0, 1.31 - TY, -0.11);
    this.backMount.rotation.y = Math.PI;
    upper.add(this.backMount);
    this.gliderAnchor.position.set(0, 1.92 - TY, 0.2);
    upper.add(this.gliderAnchor);

    // face bones: eyes and brows are mirrored copies (index 0 = +x)
    for (const s of [1, -1]) {
      const e = facePoint(EYE.theta, EYE.phi, -EYE.sink);
      const eye = this.reg(new THREE.Bone(), this.headBody, e.p.x * s, e.p.y, e.p.z);
      eye.quaternion.copy(frameQ(new THREE.Vector3(e.n.x * s, e.n.y, e.n.z)));
      eye.scale.x = s;
      this.eyes.push(eye);
      this.irises.push(this.reg(new THREE.Bone(), eye));
    }
    for (const s of [1, -1]) {
      const bp = facePoint(BROW_AT.theta, BROW_AT.phi, 0.002);
      const place = this.reg(new THREE.Bone(), this.headBody, bp.p.x * s, bp.p.y, bp.p.z);
      place.quaternion.copy(frameQ(new THREE.Vector3(bp.n.x * s, bp.n.y, bp.n.z)));
      place.scale.x = s;
      this.brows.push(this.reg(new THREE.Bone(), place));
    }
    const mp = facePoint(0, MOUTH_AT.phi, 0.0012);
    const mouthPlace = this.reg(new THREE.Bone(), this.headBody, mp.p.x, mp.p.y, mp.p.z);
    mouthPlace.quaternion.copy(frameQ(mp.n));
    this.reg(this.mouthAnim, mouthPlace);
    this.mouthY = this.mouthAnim.position.y;
    for (const s of [1, -1]) this.corners.push(this.reg(new THREE.Bone(), this.mouthAnim, s * SMILE.mid, 0, 0));
    this.reg(this.lipLow, this.mouthAnim);
    for (const s of [1, -1]) this.lowCorners.push(this.reg(new THREE.Bone(), this.lipLow, s * SMILE.mid, 0, 0));
    this.reg(this.mouthIn, this.mouthAnim, 0, 0, 0.0003);

    // bind pose: world matrices at rest (the group is still at the origin)
    g.updateMatrixWorld(true);
    this.rest = this.bones.map((b) => b.matrixWorld.clone());
    this.skeleton = new THREE.Skeleton(this.bones);
  }

  private rebuildAll(): void {
    this.buildBody();
    this.buildHair();
    this.buildAccessory();
    this.buildTop();
    this.buildBottom();
    this.buildShoes();
    this.refreshMeshes();
  }

  /** Skin: body, head, hands, ears, nose, lips — and the eyes (colors baked in the geometry). */
  private buildBody(): void {
    const ch = this.slotChunks.body;
    ch.length = 0;
    const skinHex = warmSkin(this.outfit.skin);
    const skin = new THREE.Color(skinHex);
    const fo = resolveFace(this.outfit.face);
    const glossy = fo.makeup === 2;
    const lip = new THREE.Color(glossy ? lipGlossColor(skinHex) : lipColor(skinHex));
    const lipCat: Cat = glossy ? 'eyes' : 'skin';
    const mline = new THREE.Color(mouthColor(skinHex));
    const add = (bone: THREE.Object3D, geo: THREE.BufferGeometry, color: THREE.Color | null = skin, cat: Cat = 'skin', extra?: THREE.Matrix4, key?: string, bone2?: THREE.Object3D) =>
      this.chunk('body', bone, geo, cat, color, extra, key, bone2);
    add(this.upper, torsoSkinGeo());
    for (const leg of this.legs) {
      add(leg.hip, limbGeo(0.08, 0.063, B.thighLen));
      add(leg.knee, limbGeo(0.061, 0.04, B.shinLen));
    }
    this.arms.forEach((arm, i) => {
      add(arm.shoulder, limbGeo(0.046, 0.039, B.armUp));
      add(arm.elbow, limbGeo(0.037, 0.028, B.armLow));
      for (const k of this.handsBuilt) add(this.handBones[k][i], handGeo(arm.s, k));
    });
    add(this.headBody, headGeo(fo.makeup === 1 ? 1 : fo.makeup === 3 ? 2 : 0));
    const kit = getFaceKit();
    add(this.headBody, kit.ear, skin, 'skin', earMatrix(1), 'earR');
    add(this.headBody, kit.ear, skin, 'skin', earMatrix(-1), 'earL');
    add(this.headBody, kit.nose, skin, 'skin', noseMatrix(), 'nose');
    // eyes: shape + color (the iris discs are tinted by the chunk color), makeup around them
    const ek = getEyeKit(fo.eyes);
    const tints = eyeTints(fo.eyeColor);
    const emk = getEyeMakeup(fo.makeup, fo.eyes);
    this.eyes.forEach((e) => {
      add(e, ek.eye, null, 'eyes');
      if (emk) add(e, emk, null, 'eyes');
    });
    this.irises.forEach((e, i) => {
      add(e, ek.irisOuter, tints.outer, 'eyes');
      add(e, ek.irisInner, tints.inner, 'eyes');
      add(e, ek.detail[i], null, 'eyes');
    });
    // brows follow the hair color (a bit darker so they stay natural)
    const bc = new THREE.Color(this.outfit.hair.color).lerp(new THREE.Color('#2a1d17'), 0.6);
    const browGeo = getBrowGeo(fo.brows);
    for (const b of this.brows) add(b, browGeo, bc, 'gloss');
    if (fo.freckles) add(this.headBody, frecklesGeo(), freckleColor(skinHex), 'skin');
    const stk = fo.sticker ? getStickerGeo(fo.sticker) : null;
    if (stk) add(this.headBody, stk, null, 'eyes');
    // mouth: lips (subtle tint) over a dark line. Each half-lip blends between the mouth bone
    // and its corner bone, so the lips bend smoothly into a smile
    this.corners.forEach((c, i) => {
      add(this.mouthAnim, kit.upLip[i], lip, lipCat, undefined, undefined, c);
      add(this.mouthAnim, kit.line[i], mline, 'gloss', undefined, undefined, c);
    });
    this.lowCorners.forEach((c, i) => add(this.lipLow, kit.loLip[i], lip, lipCat, undefined, undefined, c));
    if (glossy) add(this.lipLow, lipHighlightGeo(), null, 'eyes'); // a little shine on the lower lip
    add(this.mouthIn, kit.grin, new THREE.Color(FACE_COL.grin), 'gloss');
    add(this.mouthIn, kit.teeth, new THREE.Color(FACE_COL.teeth), 'gloss', mat4(new THREE.Vector3(0, 0, 0.0002)), 'teeth');
    add(this.mouthIn, kit.tongue, new THREE.Color(FACE_COL.tongue), 'gloss', mat4(new THREE.Vector3(0, 0, 0.0002)), 'tongue');
  }

  private buildHair(): void {
    const o = this.outfit;
    const ch = this.slotChunks.hair;
    ch.length = 0;
    const acc = getAccessory(o.accessory.style, o.top.style);
    this.wearsHat = !!acc?.hat;
    const parts = getHair(o.hair.style);
    this.hairTopY = this.wearsHat ? getHair(0).topY : parts.topY;
    this.swayers = [];
    const hc = new THREE.Color(o.hair.color);
    const add = (geo: THREE.BufferGeometry, color: THREE.Color, bone: THREE.Object3D = this.hairMount) => this.chunk('hair', bone, geo, 'gloss', color);
    add(parts.base, hc);
    if (parts.vol && !this.wearsHat) add(parts.vol, hc);
    if (parts.front && !this.wearsHat) add(parts.front, hc);
    if (parts.dark) add(parts.dark, new THREE.Color(tint(o.hair.color, -0.4)));
    // hair ties / scrunchies: satin (the skin mesh), never the hair's gloss, in a color that contrasts with the hair
    if (parts.accent && !(this.wearsHat && parts.vol)) this.chunk('hair', this.hairMount, parts.accent, 'skin', new THREE.Color(contrastColor(o.hair.color, tuning.art.palette, 0)));
    const t = parts.tails[0];
    if (t) {
      add(t.geo, hc, this.tail);
      this.swayers.push({ obj: this.tail, side: t.side, phase: 0, tilt: t.tilt });
    }
  }

  private buildAccessory(): void {
    const o = this.outfit;
    this.slotChunks.accessory.length = 0;
    this.accTopY = 0;
    this.wings = [];
    this.holdsCup = false;
    const acc = getAccessory(o.accessory.style, o.top.style);
    if (!acc) return;
    const color = Character.accessoryColor(o);
    const hair = getHair(o.hair.style);
    const hr = acc.hat || acc.fixed ? 1.1 : hair.hairR;
    const topY = acc.hat ? getHair(0).topY : hair.topY;
    this.holdsCup = !!acc.holds;
    if (acc.head.length) {
      // head pieces are placed on top of the hair (or on its surface) — a per-outfit transform
      const m = new THREE.Matrix4();
      if (acc.onSurface) {
        const f = acc.onSurface;
        const { p, n } = facePoint(f.theta, f.phi, f.off, hr);
        m.compose(p, frameQ(n, f.roll), new THREE.Vector3(1, 1, 1));
      } else if (!acc.fixed) {
        const s = hr / 1.1;
        m.compose(new THREE.Vector3(0, topY - 0.14 * s, 0), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      }
      this.put('accessory', this.accHead, acc.head, color, 'gloss', m);
      this.accTopY = acc.fixed ? 0 : topY + acc.topLift;
    }
    if (acc.body.length) this.put('accessory', this.accBody, acc.body, color, 'gloss');
    if (acc.handR.length) this.put('accessory', this.cupHolder, acc.handR, color, 'gloss');
    if (acc.wristL.length) this.put('accessory', this.accWristL, acc.wristL, color, 'fabric');
    if (acc.back.length) {
      // wings: one bone per side so they can flap; the pieces are authored in upper-body space
      const toPivot = new THREE.Matrix4().makeTranslation(-WING_PIVOT.x, -WING_PIVOT.y, -WING_PIVOT.z);
      this.wingBones.forEach((w, i) => {
        this.put('accessory', w, acc.back, color, 'gloss', toPivot, 'wing');
        this.wings.push({ pivot: w, side: i === 0 ? 1 : -1 });
      });
    }
  }

  private buildTop(): void {
    const o = this.outfit;
    this.slotChunks.top.length = 0;
    this.put('top', this.topMount, getTop(o.top.style, 0).torso, o.top.color, 'fabric');
    this.arms.forEach((arm, i) => {
      const parts = getTop(o.top.style, i);
      this.put('top', arm.upperTop, parts.upper, o.top.color, 'fabric');
      this.put('top', arm.lowerTop, parts.lower, o.top.color, 'fabric');
    });
  }

  private buildBottom(): void {
    const o = this.outfit;
    const st = o.bottom.style;
    this.slotChunks.bottom.length = 0;
    this.put('bottom', this.bottomMount, getBottom(st, 0).torso, o.bottom.color, 'fabric');
    this.legs.forEach((leg, i) => {
      const parts = getBottom(st, i);
      this.put('bottom', leg.thighBottom, parts.thigh, o.bottom.color, 'fabric');
      this.put('bottom', leg.shinBottom, parts.shin, o.bottom.color, 'fabric');
    });
  }

  private buildShoes(): void {
    const o = this.outfit;
    this.slotChunks.shoes.length = 0;
    const ps = getShoes(o.shoes.style);
    for (const leg of this.legs) this.put('shoes', leg.foot, ps, o.shoes.color, 'satin');
  }

  /** Re-merge every category's chunks into its SkinnedMesh (creating meshes on demand). */
  private refreshMeshes(): void {
    const per = new Map<Cat, Chunk[]>();
    for (const slot of SLOT_KEYS) for (const c of this.slotChunks[slot]) (per.get(c.cat) ?? per.set(c.cat, []).get(c.cat)!).push(c);
    // keep to <= 8 draw calls: in the (rare) worst mix — plaid + LED + metal + a glass / glow / wing accessory +
    // lacquered accessory parts — the lacquered accessory bucket folds into the shared gloss one
    if (per.size > 8 && per.has('acc')) {
      const g = per.get('gloss') ?? [];
      for (const c of per.get('acc')!) g.push({ ...c, cat: 'gloss' });
      per.delete('acc');
      per.set('gloss', g);
    }
    for (const cat of ALL_CATS) {
      const list = per.get(cat);
      const geo = list ? assembleGeometry(list) : null;
      let mesh = this.catMeshes.get(cat);
      if (!geo) {
        if (mesh) {
          mesh.visible = false;
          mesh.geometry.dispose();
          mesh.geometry = new THREE.BufferGeometry();
        }
        continue;
      }
      if (!mesh) mesh = this.makeMesh(cat);
      const old = mesh.geometry;
      mesh.geometry = geo;
      old.dispose();
      // raycasting recomputes these lazily from the skinned vertices
      mesh.boundingSphere = null as unknown as THREE.Sphere;
      mesh.boundingBox = null as unknown as THREE.Box3;
      mesh.visible = true;
    }
  }

  private makeMesh(cat: Cat): THREE.SkinnedMesh {
    let mat: THREE.Material;
    if (cat === 'led') {
      this.ledMat ??= new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.8, roughness: 0.3 });
      mat = this.ledMat;
    } else mat = getMats()[cat];
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), mat);
    mesh.name = `char-${cat}`;
    mesh.frustumCulled = false; // limbs swing outside the bind-pose bounds
    mesh.castShadow = this.shadows && SHADOW_CATS.has(cat);
    mesh.receiveShadow = this.shadows && !NO_RECEIVE.has(cat);
    this.group.add(mesh);
    mesh.bind(this.skeleton, new THREE.Matrix4()); // bind pose was captured with the group at the origin
    this.catMeshes.set(cat, mesh);
    return mesh;
  }
}

// ── static body geometry helpers ────────────────────────────────────────────
function torsoSkinGeo(): THREE.BufferGeometry {
  return cached('torsoSkin', () => {
    const last = TORSO_TABLE.length - 1;
    const g = new THREE.LatheGeometry(TORSO_TABLE.filter((_, i) => i % 8 === 0 || i === last).map((p) => new THREE.Vector2(p.r, p.y)), 18);
    torsoSpace(g);
    return g;
  });
}
const mat4 = (pos: THREE.Vector3, q?: THREE.Quaternion) => new THREE.Matrix4().compose(pos, q ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
let _ear: [THREE.Matrix4, THREE.Matrix4] | null = null;
function earMatrix(s: number): THREE.Matrix4 {
  _ear ??= [mat4(new THREE.Vector3(B.HX * 0.985, -0.004, -0.006)), mat4(new THREE.Vector3(-B.HX * 0.985, -0.004, -0.006))];
  return s > 0 ? _ear[0] : _ear[1];
}
let _nose: THREE.Matrix4 | null = null;
function noseMatrix(): THREE.Matrix4 {
  if (!_nose) {
    const n = facePoint(0, NOSE_AT.phi, 0.0015);
    _nose = mat4(n.p, frameQ(n.n));
  }
  return _nose;
}
const _look = new THREE.Vector3();
