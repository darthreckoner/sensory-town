// ═════════════════════════════════════════════════════════════════════════════
// Real motion for the procedural characters (v3.3).
//
// public/anims/moves.glb holds the non-combat clips of the CC0 Universal Animation Library 1+2 (a UE-style
// rig: pelvis, spine_01..03, neck, Head, clavicles, arms, legs). This module
//   1. loads them once (async; the characters stay procedural until the clips are ready),
//   2. retargets every clip onto OUR skeleton (a different, simpler rig: pelvis, one spine bone, head, arms,
//      legs) by world-space rest-pose deltas, once per clip, and caches the result as plain Float32 arrays,
//   3. plays them per character with a tiny blend tree (no AnimationMixer: 15 bones, a few layers).
//
// Retarget maths: for every mapped UE bone the world rotation at time t relative to the UE rest pose is
//   D(t) = W(t) * W_rest^-1.
// Our bone's world rotation is D(t) * R_ref, where R_ref = our bone's rotation in the pose that corresponds to the
// UE rest pose (identity for spine / head / legs; the arms are rotated out to the T-pose, the feet pitched like the
// rest foot). The local rotation is then taken against OUR parent chain, so the result needs no runtime IK:
//   local = (D_parent * R_parent)^-1 * (D * R).
// Fingers and the root / horizontal pelvis translation are ignored (physics moves the body, our hand kinds stay);
// only the vertical pelvis bob is kept.
// ═════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

/** our bones the clips drive */
export const MB = {
  PELVIS: 0, SPINE: 1, HEAD: 2,
  SH_L: 3, EL_L: 4, WR_L: 5, SH_R: 6, EL_R: 7, WR_R: 8,
  HIP_L: 9, KNEE_L: 10, ANK_L: 11, HIP_R: 12, KNEE_R: 13, ANK_R: 14,
} as const;
export const NB = 15;

export interface Retargeted {
  name: string;
  duration: number;
  frames: number;
  loop: boolean;
  /** per frame, per bone: local quaternion x y z w (frames * NB * 4) */
  q: Float32Array;
  /** per frame: the vertical pelvis offset from the rest pose, in meters */
  bob: Float32Array;
  /** normalized time at which the +x (left) leg is furthest forward (locomotion loops), else 0 */
  strike: number;
}

const FPS = 30;
const LOOP = /_Loop$/;
const URL_PATH = 'anims/moves.glb';

// the UE bone each of our bones follows
const UE: Record<number, string> = {
  [MB.PELVIS]: 'pelvis', [MB.HEAD]: 'Head',
  [MB.SH_L]: 'upperarm_l', [MB.EL_L]: 'lowerarm_l', [MB.WR_L]: 'hand_l',
  [MB.SH_R]: 'upperarm_r', [MB.EL_R]: 'lowerarm_r', [MB.WR_R]: 'hand_r',
  [MB.HIP_L]: 'thigh_l', [MB.KNEE_L]: 'calf_l', [MB.ANK_L]: 'foot_l',
  [MB.HIP_R]: 'thigh_r', [MB.KNEE_R]: 'calf_r', [MB.ANK_R]: 'foot_r',
};
// every UE bone the forward kinematics needs, parents first
const CHAIN: [string, string | null][] = [
  ['root', null], ['pelvis', 'root'], ['spine_01', 'pelvis'], ['spine_02', 'spine_01'], ['spine_03', 'spine_02'], ['neck_01', 'spine_03'], ['Head', 'neck_01'],
  ['clavicle_l', 'spine_03'], ['upperarm_l', 'clavicle_l'], ['lowerarm_l', 'upperarm_l'], ['hand_l', 'lowerarm_l'],
  ['clavicle_r', 'spine_03'], ['upperarm_r', 'clavicle_r'], ['lowerarm_r', 'upperarm_r'], ['hand_r', 'lowerarm_r'],
  ['thigh_l', 'pelvis'], ['calf_l', 'thigh_l'], ['foot_l', 'calf_l'],
  ['thigh_r', 'pelvis'], ['calf_r', 'thigh_r'], ['foot_r', 'calf_r'],
];

interface Rest {
  local: Map<string, THREE.Quaternion>;
  world: Map<string, THREE.Quaternion>;
  pos: Map<string, THREE.Vector3>;
  pelvisLocalPos: THREE.Vector3;
  rootWorld: THREE.Quaternion;
  refArm: [THREE.Quaternion, THREE.Quaternion];
  refFoot: THREE.Quaternion;
}

let clipsByName: Map<string, THREE.AnimationClip> | null = null;
let rest: Rest | null = null;
const cache = new Map<string, Retargeted>();
let loading: Promise<boolean> | null = null;

/** Start loading the clip pack (idempotent). Resolves true when the characters can use it. */
export function loadMocap(): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + URL_PATH);
      const nodes = new Map<string, THREE.Object3D>();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => nodes.set(o.name, o));
      rest = buildRest(nodes);
      clipsByName = new Map(gltf.animations.map((c) => [c.name, c]));
      return true;
    } catch (e) {
      console.warn('[mocap] clips unavailable, staying procedural', e);
      return false;
    }
  })();
  return loading;
}

export const mocapReady = (): boolean => !!clipsByName && !!rest;

function buildRest(nodes: Map<string, THREE.Object3D>): Rest {
  const local = new Map<string, THREE.Quaternion>();
  const world = new Map<string, THREE.Quaternion>();
  const pos = new Map<string, THREE.Vector3>();
  for (const [name] of CHAIN) {
    const n = nodes.get(name);
    if (!n) throw new Error('mocap: missing bone ' + name);
    local.set(name, n.quaternion.clone());
    world.set(name, n.getWorldQuaternion(new THREE.Quaternion()));
    pos.set(name, n.getWorldPosition(new THREE.Vector3()));
  }
  const ball = nodes.get('ball_l');
  const up = new THREE.Vector3(0, -1, 0);
  const dirOf = (a: string, b: string) => pos.get(b)!.clone().sub(pos.get(a)!).normalize();
  // the arms: our rest hangs straight down; the UE rest is the T-pose (arms along +-x). R_ref = hang -> rest direction.
  const refArm: [THREE.Quaternion, THREE.Quaternion] = [
    new THREE.Quaternion().setFromUnitVectors(up, dirOf('upperarm_l', 'lowerarm_l')),
    new THREE.Quaternion().setFromUnitVectors(up, dirOf('upperarm_r', 'lowerarm_r')),
  ];
  // the feet: our rest foot is flat (toes +z); the UE rest foot points down by ~30 degrees
  const fwd = new THREE.Vector3(0, 0, 1);
  const toe = ball ? ball.getWorldPosition(new THREE.Vector3()).sub(pos.get('foot_l')!).normalize() : fwd.clone();
  const refFoot = new THREE.Quaternion().setFromUnitVectors(fwd, toe);
  const p = nodes.get('pelvis')!;
  return { local, world, pos, pelvisLocalPos: p.position.clone(), rootWorld: world.get('root')!.clone(), refArm, refFoot };
}

/** Retarget one clip (cached). */
export function getClip(name: string): Retargeted | null {
  if (!clipsByName || !rest) return null;
  let r = cache.get(name);
  if (r) return r;
  const clip = clipsByName.get(name);
  if (!clip) return null;
  r = retarget(clip, rest);
  cache.set(name, r);
  return r;
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion(), qe = new THREE.Quaternion();

/** Index i with times[i] <= t < times[i+1] (clamped). */
function keyIndex(times: ArrayLike<number>, t: number): number {
  let lo = 0, hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  return lo;
}
function trackQuat(tr: THREE.KeyframeTrack, t: number, out: THREE.Quaternion): void {
  const ts = tr.times, vs = tr.values;
  if (ts.length === 1) { out.set(vs[0], vs[1], vs[2], vs[3]); return; }
  const i = keyIndex(ts, t);
  const k = Math.min(1, Math.max(0, (t - ts[i]) / (ts[i + 1] - ts[i])));
  out.set(vs[i * 4], vs[i * 4 + 1], vs[i * 4 + 2], vs[i * 4 + 3]);
  qd.set(vs[i * 4 + 4], vs[i * 4 + 5], vs[i * 4 + 6], vs[i * 4 + 7]);
  out.slerp(qd, k);
}
function trackVec(tr: THREE.KeyframeTrack, t: number, out: THREE.Vector3): void {
  const ts = tr.times, vs = tr.values;
  if (ts.length === 1) { out.set(vs[0], vs[1], vs[2]); return; }
  const i = keyIndex(ts, t);
  const k = Math.min(1, Math.max(0, (t - ts[i]) / (ts[i + 1] - ts[i])));
  out.set(vs[i * 3] + (vs[i * 3 + 3] - vs[i * 3]) * k, vs[i * 3 + 1] + (vs[i * 3 + 4] - vs[i * 3 + 1]) * k, vs[i * 3 + 2] + (vs[i * 3 + 5] - vs[i * 3 + 2]) * k);
}

function stanceFor(name: string): { legs: number; arms: number; bobAdd: number } {
  if (name === 'Idle_Loop') return { legs: 0.5, arms: 0.6, bobAdd: 0.03 };
  if (/^(Idle_|Interact|Yes)/.test(name)) return { legs: 0.5, arms: 1, bobAdd: 0.03 };
  return { legs: 1, arms: 1, bobAdd: 0 };
}

function retarget(clip: THREE.AnimationClip, R: Rest): Retargeted {
  const tune = stanceFor(clip.name);
  const loop = LOOP.test(clip.name);
  const frames = Math.max(2, Math.round(clip.duration * FPS) + (loop ? 0 : 1));
  const q = new Float32Array(frames * NB * 4);
  const bob = new Float32Array(frames);
  // interpolants for the tracks that exist
  const rot = new Map<string, THREE.KeyframeTrack>();
  let posTrack: THREE.KeyframeTrack | null = null;
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'quaternion') rot.set(bone, t);
    else if (prop === 'position' && bone === 'pelvis') posTrack = t;
  }
  const W = new Map<string, THREE.Quaternion>();
  for (const [n] of CHAIN) W.set(n, new THREE.Quaternion());
  const D = new Map<string, THREE.Quaternion>();
  for (const [n] of CHAIN) D.set(n, new THREE.Quaternion());
  const Wo = new Array<THREE.Quaternion>(NB);
  for (let i = 0; i < NB; i++) Wo[i] = new THREE.Quaternion();
  const ref = (b: number): THREE.Quaternion | null => (b >= MB.SH_L && b <= MB.WR_L ? R.refArm[0] : b >= MB.SH_R && b <= MB.WR_R ? R.refArm[1] : b === MB.ANK_L || b === MB.ANK_R ? R.refFoot : null);
  const parents = [-1, MB.PELVIS, MB.SPINE, MB.SPINE, MB.SH_L, MB.EL_L, MB.SPINE, MB.SH_R, MB.EL_R, MB.PELVIS, MB.HIP_L, MB.KNEE_L, MB.PELVIS, MB.HIP_R, MB.KNEE_R];
  const pelvisRest = R.pos.get('pelvis')!;
  const v = new THREE.Vector3();
  let bestStrike = 0, bestF = -9;
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / FPS);
    // forward kinematics of the UE rig
    for (const [name, parent] of CHAIN) {
      const tr = rot.get(name);
      const local = qa;
      if (tr) trackQuat(tr, t, local);
      else local.copy(R.local.get(name)!);
      const w = W.get(name)!;
      if (parent) w.copy(W.get(parent)!).multiply(local);
      else w.copy(local);
      D.get(name)!.copy(w).multiply(qb.copy(R.world.get(name)!).invert());
    }
    // our bones' world rotations in the clip
    for (let b = 0; b < NB; b++) {
      if (b === MB.SPINE) {
        Wo[b].copy(D.get('spine_02')!).slerp(D.get('spine_03')!, 0.5);
      } else Wo[b].copy(D.get(UE[b])!);
      const rr = ref(b);
      if (rr) Wo[b].multiply(rr);
    }
    // local rotations against OUR parents
    const base = f * NB * 4;
    for (let b = 0; b < NB; b++) {
      const p = parents[b];
      const out = qc;
      if (p < 0) out.copy(Wo[b]);
      else out.copy(Wo[p]).invert().multiply(Wo[b]);
      // the UAL idles are an athletic, staggered stance with the hands clasped low: soften them for our kids
      const k = b >= MB.HIP_L ? tune.legs : b >= MB.SH_L && b <= MB.WR_R ? tune.arms : 1;
      if (k !== 1) out.copy(qe.identity().slerp(out, k));
      q[base + b * 4] = out.x; q[base + b * 4 + 1] = out.y; q[base + b * 4 + 2] = out.z; q[base + b * 4 + 3] = out.w;
    }
    // vertical pelvis bob
    if (posTrack) {
      trackVec(posTrack, t, v);
      v.applyQuaternion(R.rootWorld);
      bob[f] = v.y - pelvisRest.y + tune.bobAdd;
    } else bob[f] = tune.bobAdd;
    // forward-most left leg (the world direction of the left thigh -> its z)
    v.set(0, -1, 0).applyQuaternion(Wo[MB.HIP_L]);
    if (v.z > bestF) { bestF = v.z; bestStrike = f / frames; }
  }
  return { name: clip.name, duration: frames / FPS, frames: loop ? frames : frames - 1, loop, q, bob, strike: bestStrike };
}

// ═════════════════════════════════════════════════════════════════════════════
// Per-character player: a small blend tree + a state machine
// ═════════════════════════════════════════════════════════════════════════════
export type SeatKind = 'drive' | 'sit' | null;
export interface MocapState {
  /** on foot with no special pose: the locomotion tree (idle / walk / jog / sprint) is the base */
  loco: boolean;
  speed: number; // 0..1 (Character.setMove)
  sprint: number; // 0..1
  air: boolean;
  seat: SeatKind;
  slide: boolean;
  /** swimming: 0 = not, else the stroke speed 0..1 */
  swim: number;
  swimming: boolean;
  dance: boolean;
  /** dev / tests: hold one named clip as the whole pose */
  force?: string;
}
export interface MocapRates { walk: number; jog: number; sprint: number }

/** Sample one retargeted clip at time t (seconds) into q (NB*4, nlerp between frames); returns the pelvis bob. */
export function sampleClip(c: Retargeted, t: number, out: Float32Array): number {
  let f = (t * FPS);
  let f0: number, f1: number, k: number;
  if (c.loop) {
    const n = c.frames;
    f = ((f % n) + n) % n;
    f0 = Math.floor(f);
    k = f - f0;
    f1 = (f0 + 1) % n;
  } else {
    f = Math.min(c.frames - 1, Math.max(0, f));
    f0 = Math.floor(f);
    k = f - f0;
    f1 = Math.min(c.frames - 1, f0 + 1);
  }
  const a = f0 * NB * 4, b = f1 * NB * 4;
  for (let i = 0; i < NB; i++) {
    const o = i * 4;
    const x0 = c.q[a + o], y0 = c.q[a + o + 1], z0 = c.q[a + o + 2], w0 = c.q[a + o + 3];
    let x1 = c.q[b + o], y1 = c.q[b + o + 1], z1 = c.q[b + o + 2], w1 = c.q[b + o + 3];
    if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, z = z0 + (z1 - z0) * k, w = w0 + (w1 - w0) * k;
    const n = 1 / Math.hypot(x, y, z, w);
    out[o] = x * n; out[o + 1] = y * n; out[o + 2] = z * n; out[o + 3] = w * n;
  }
  return c.bob[f0] + (c.bob[f1] - c.bob[f0]) * k;
}

interface Layer {
  clip: string;
  t: number;
  rate: number;
  w: number;
  target: number;
  fade: number; // seconds to reach the target
  loop: boolean;
  /** one-shots end themselves: when they reach the end the target drops to 0 */
  once: boolean;
  /** locomotion layers are phase driven instead of time driven */
  phased: boolean;
  /** an idle fidget (the plain idle makes room for it) */
  fidget?: boolean;
}

const FIDGETS: { clip: string; secs: number }[] = [
  { clip: 'Yes', secs: 0 }, // a one-shot (a happy nod)
  { clip: 'Idle_FoldArms_Loop', secs: 4 },
  { clip: 'Idle_TalkingPhone_Loop', secs: 4 },
  { clip: 'Idle_Talking_Loop', secs: 4 },
  { clip: 'Idle_No_Loop', secs: 2.5 },
];
const sm01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Per-character mocap state. `pose` (NB*4) and `bob` are valid when `weight` > 0. */
export class MocapPlayer {
  readonly pose = new Float32Array(NB * 4);
  bob = 0;
  /** how much of the pelvis bob to apply (a climb or a seat brings its own height) */
  bobScale = 1;
  /** 0..1: how much of the final pose the clips own (blend against the procedural pose) */
  weight = 0;
  /** share of the locomotion that is the plain idle (the caller relaxes the arms a little then) */
  idleShare = 0;
  /** share of the pose that is a jog / sprint (the chest is stood up a bit more then) */
  runShare = 0;
  /** normalized locomotion phase, 0 at the reference foot strike; wraps */
  phase = 0.25;
  /** the clip name that currently owns the most weight (debug / tests) */
  dominant = '';
  private layers: Layer[] = [];
  /** smoothed 'the locomotion tree is the active base' */
  private onW = 0;
  private tmp = new Float32Array(NB * 4);
  private acc = new Float32Array(NB * 4);
  // state machine
  private jump: 'ground' | 'start' | 'loop' | 'land' = 'ground';
  private landLeft = 0;
  private slidePhase: 'off' | 'start' | 'loop' | 'exit' = 'off';
  private climbLeft = 0;
  private fidgetIn = 8 + Math.random() * 7;
  private fidgetLeft = 0;
  private fidgetClip = '';
  private idleFor = 0;
  private forced = '';

  /** Fire a one-shot / loop (replaces a running layer of the same clip). */
  play(clip: string, o: { loop?: boolean; rate?: number; fade?: number; start?: number; once?: boolean } = {}): void {
    let l = this.layers.find((x) => x.clip === clip && !x.phased);
    if (!l) {
      l = { clip, t: o.start ?? 0, rate: o.rate ?? 1, w: 0, target: 1, fade: o.fade ?? 0.15, loop: !!o.loop, once: !!o.once, phased: false };
      this.layers.push(l);
    } else {
      l.t = o.start ?? 0;
      l.rate = o.rate ?? 1;
      l.target = 1;
      l.fade = o.fade ?? l.fade;
      l.loop = !!o.loop;
      l.once = !!o.once;
    }
  }
  /** Fade a clip out (and drop it when it is gone). */
  stop(clip: string, fade = 0.15): void {
    const l = this.layers.find((x) => x.clip === clip && !x.phased);
    if (l && l.target > 0) { l.target = 0; l.fade = fade; }
  }
  isPlaying(clip: string): boolean {
    const l = this.layers.find((x) => x.clip === clip && !x.phased);
    return !!l && l.target > 0;
  }
  /** Time left of a clip that is playing (seconds). */
  remaining(clip: string): number {
    const l = this.layers.find((x) => x.clip === clip && !x.phased);
    const c = getClip(clip);
    return l && c && l.target > 0 ? Math.max(0, (c.duration - l.t) / Math.max(0.01, l.rate)) : 0;
  }
  private hold(clip: string, on: boolean, fade = 0.2, rate = 1): void {
    if (on) { if (!this.isPlaying(clip)) this.play(clip, { loop: true, fade, rate }); }
    else this.stop(clip, fade);
  }

  /** Mantle: climb up a ledge, stretched to `seconds`. */
  playClimb(seconds: number): void {
    const c = getClip('ClimbUp_1m');
    if (!c) return;
    this.play('ClimbUp_1m', { rate: c.duration / Math.max(0.2, seconds), fade: 0.08, once: true });
    this.climbLeft = seconds;
  }

  /** The locomotion tree: idle / walk / jog / sprint with phase-synced loops. */
  private setLoco(on: boolean, speed: number, sprint: number, rates: MocapRates, dt: number): void {
    this.onW += ((on ? 1 : 0) - this.onW) * (1 - Math.exp(-dt / 0.09));
    const active = this.onW > 0.002;
    const s = Math.min(1, Math.max(0, speed));
    const moving = sm01(0.04, 0.22, s);
    const run = sm01(0.5, 0.95, s);
    const sp = run * Math.min(1, Math.max(0, sprint));
    const fw = this.layers.reduce((m, l) => (l.fidget ? Math.max(m, l.w) : m), 0); // fidget share
    const want: Record<string, number> = {
      Idle_Loop: active ? (1 - moving) * this.onW * (1 - fw) : 0,
      Walk_Loop: active ? moving * (1 - run) * this.onW : 0,
      Jog_Fwd_Loop: active ? moving * run * (1 - sp) * this.onW : 0,
      Sprint_Loop: active ? moving * sp * this.onW : 0,
    };
    this.idleShare = want.Idle_Loop;
    const rate: Record<string, number> = { Walk_Loop: rates.walk, Jog_Fwd_Loop: rates.jog, Sprint_Loop: rates.sprint };
    for (const clip of Object.keys(want)) {
      let l = this.layers.find((x) => x.clip === clip && x.phased);
      if (!l) {
        if (want[clip] <= 0.001) continue;
        l = { clip, t: 0, rate: rate[clip] ?? 1, w: 0, target: 0, fade: 0, loop: true, once: false, phased: true };
        this.layers.push(l);
      }
      l.rate = rate[clip] ?? 1;
      l.target = want[clip];
      l.w = want[clip];
    }
  }

  /** One frame: state machine -> layer weights -> sampled pose. */
  update(st: MocapState, rates: MocapRates, dt: number): void {
    // a climb owns the body (the mantle also reports 'airborne')
    if (this.climbLeft > 0) {
      st = { ...st, air: false };
      if (this.jump !== 'ground') { this.jump = 'ground'; this.stop('Jump_Start', 0.05); this.stop('Jump_Loop', 0.05); this.stop('Jump_Land', 0.05); }
    }
    // jump: start (takeoff, from a few frames in: the squat is already over) -> loop (airborne) -> land
    switch (this.jump) {
      case 'ground':
        if (st.air) { this.jump = 'start'; this.play('Jump_Start', { start: 0.13, rate: 1.7, fade: 0.06 }); }
        break;
      case 'start':
        if (!st.air) this.land(st.speed);
        else if (this.remaining('Jump_Start') <= 0.1) { this.jump = 'loop'; this.play('Jump_Loop', { loop: true, fade: 0.18 }); this.stop('Jump_Start', 0.18); }
        break;
      case 'loop':
        if (!st.air) this.land(st.speed);
        break;
      case 'land':
        this.landLeft -= dt;
        if (st.air) { this.jump = 'start'; this.play('Jump_Start', { start: 0.13, rate: 1.7, fade: 0.06 }); this.stop('Jump_Land', 0.08); }
        else if (this.landLeft <= 0) { this.jump = 'ground'; this.stop('Jump_Land', 0.12); }
        break;
    }
    // seats
    this.hold('Driving_Loop', st.seat === 'drive');
    this.hold('Sitting_Idle_Loop', st.seat === 'sit');
    // slide: start -> loop -> exit
    if (st.slide && this.slidePhase !== 'start' && this.slidePhase !== 'loop') {
      this.slidePhase = 'start';
      this.play('Slide_Start', { fade: 0.1, rate: 1.3 });
    } else if (st.slide && this.slidePhase === 'start' && this.remaining('Slide_Start') <= 0.1) {
      this.slidePhase = 'loop';
      this.play('Slide_Loop', { loop: true, fade: 0.1 });
      this.stop('Slide_Start', 0.1);
    } else if (!st.slide && (this.slidePhase === 'start' || this.slidePhase === 'loop')) {
      this.slidePhase = 'exit';
      this.stop('Slide_Start', 0.1);
      this.stop('Slide_Loop', 0.1);
      this.play('Slide_Exit', { fade: 0.08, rate: 1.4, once: true });
    } else if (this.slidePhase === 'exit' && this.remaining('Slide_Exit') <= 0.05) this.slidePhase = 'off';
    // swim
    const swimMove = st.swimming ? sm01(0.06, 0.26, st.swim) : 0;
    if (st.swimming) {
      this.hold('Swim_Idle_Loop', swimMove < 0.5, 0.3);
      this.hold('Swim_Fwd_Loop', swimMove >= 0.5, 0.3);
    } else {
      this.stop('Swim_Idle_Loop', 0.2);
      this.stop('Swim_Fwd_Loop', 0.2);
    }
    this.hold('Dance_Loop', st.dance, 0.25);
    if (st.force && st.force !== this.forced) { if (this.forced) this.stop(this.forced, 0.1); this.forced = st.force; }
    if (this.forced) {
      if (st.force) { if (!this.isPlaying(this.forced)) this.play(this.forced, { loop: true, fade: 0.15 }); } else { this.stop(this.forced, 0.15); this.forced = ''; }
    }
    this.climbLeft = Math.max(0, this.climbLeft - dt);
    // locomotion is the base when nothing else owns the body
    const special = !!st.force || st.seat !== null || this.slidePhase !== 'off' || st.swimming || st.dance || this.jump !== 'ground' || this.climbLeft > 0;
    // idle fidgets: every 8-15 s of standing still (a nod, folded arms, a phone call, a chat, a head shake)
    const standing = st.loco && !special && st.speed < 0.04;
    this.idleFor = standing ? this.idleFor + dt : 0;
    if (this.fidgetClip) {
      this.fidgetLeft -= dt;
      const l = this.layers.find((x) => x.clip === this.fidgetClip && !x.phased);
      if (!standing || (l && !l.loop && l.w < 0.02 && l.target <= 0) || this.fidgetLeft <= 0) {
        if (l) { l.target = 0; l.fade = 0.35; }
        this.fidgetClip = '';
        this.fidgetIn = 8 + Math.random() * 7;
      }
    } else if (standing && this.idleFor > this.fidgetIn) {
      const f = FIDGETS[Math.floor(Math.random() * FIDGETS.length)];
      const c = getClip(f.clip);
      if (c) {
        this.fidgetClip = f.clip;
        this.fidgetLeft = f.secs > 0 ? f.secs : c.duration;
        this.play(f.clip, { loop: f.secs > 0, once: f.secs === 0, fade: 0.35 });
        const l = this.layers.find((x) => x.clip === f.clip && !x.phased);
        if (l) l.fidget = true;
        this.idleFor = 0;
      }
    }
    this.setLoco(st.loco && !special, st.speed, st.sprint, rates, dt);

    // advance + fade
    let locoRate = 0, locoW = 0;
    for (const l of this.layers) {
      const c = getClip(l.clip);
      if (!c) continue;
      if (l.phased) {
        if (l.clip !== 'Idle_Loop') { locoRate += (l.w / c.duration) * l.rate; locoW += l.w; }
      } else {
        l.t += dt * l.rate;
        if (l.once && !c.loop && l.t >= c.duration) l.target = 0;
        if (!l.loop && !c.loop && l.t >= c.duration - 1e-3 && !l.once) l.t = c.duration - 1e-3; // hold the last pose
        const k = l.fade > 0 ? 1 - Math.exp(-dt / (l.fade * 0.4)) : 1;
        l.w += (l.target - l.w) * k;
      }
    }
    if (locoW > 0.001) this.phase = (this.phase + (locoRate / locoW) * dt) % 1;
    else this.phase = 0.25;
    // sample + accumulate
    const acc = this.acc;
    acc.fill(0);
    let wsum = 0, bob = 0, bestW = 0;
    for (const l of this.layers) {
      if (l.w < 0.002) continue;
      const c = getClip(l.clip);
      if (!c) continue;
      let t: number;
      if (l.phased) {
        if (l.clip === 'Idle_Loop') { l.t += dt; t = l.t; }
        else t = ((((this.phase - 0.25 + c.strike) % 1) + 1) % 1) * c.duration; // left leg forward at phase 0.25 in every clip
      } else t = l.t;
      const b = sampleClip(c, t, this.tmp);
      const tm = this.tmp;
      for (let i = 0; i < NB; i++) {
        const o = i * 4;
        const dot = acc[o] * tm[o] + acc[o + 1] * tm[o + 1] + acc[o + 2] * tm[o + 2] + acc[o + 3] * tm[o + 3];
        const s = dot < 0 ? -l.w : l.w;
        acc[o] += tm[o] * s; acc[o + 1] += tm[o + 1] * s; acc[o + 2] += tm[o + 2] * s; acc[o + 3] += tm[o + 3] * s;
      }
      bob += (b * (CLIP_BOB[l.clip] ?? 1) + (CLIP_LIFT[l.clip] ?? 0)) * l.w;
      wsum += l.w;
      if (l.w > bestW) { bestW = l.w; this.dominant = l.clip; }
    }
    this.runShare = 0;
    for (const l of this.layers) if (l.phased && (l.clip === 'Jog_Fwd_Loop' || l.clip === 'Sprint_Loop')) this.runShare += l.w;
    this.runShare = wsum > 1e-4 ? Math.min(1, this.runShare / wsum) : 0;
    this.layers = this.layers.filter((l) => l.phased || l.w > 0.002 || l.target > 0);
    if (wsum > 1e-4) {
      for (let i = 0; i < NB; i++) {
        const o = i * 4;
        const n = 1 / Math.hypot(acc[o], acc[o + 1], acc[o + 2], acc[o + 3]);
        this.pose[o] = acc[o] * n; this.pose[o + 1] = acc[o + 1] * n; this.pose[o + 2] = acc[o + 2] * n; this.pose[o + 3] = acc[o + 3] * n;
      }
      this.bob = bob / wsum;
    }
    this.weight = Math.min(1, wsum);
  }

  private land(speed: number): void {
    this.jump = 'land';
    this.stop('Jump_Start', 0.06);
    this.stop('Jump_Loop', 0.06);
    const moving = speed > 0.45;
    // a short, soft landing (the clip's own crouch is deep and slow)
    this.play('Jump_Land', { start: 0.1, rate: moving ? 3.2 : 2.3, fade: 0.05, once: true });
    this.landLeft = moving ? 0.22 : 0.34;
  }
}

/** how much of a clip's own vertical pelvis bob is applied (the scene already moves the body for these) */
/** extra height (m) for a clip: the slides drop the pelvis to ~5 cm above the ground, so the body is lifted a little */
export const CLIP_LIFT: Record<string, number> = { Slide_Start: 0.14, Slide_Loop: 0.14, Slide_Exit: 0.14 };
const CLIP_BOB: Record<string, number> = {
  ClimbUp_1m: 0.35,
  Driving_Loop: 0, Sitting_Idle_Loop: 0, Sitting_Enter: 0, Sitting_Exit: 0,
  Swim_Fwd_Loop: 0, Swim_Idle_Loop: 0,
};
