// Typed event bus. Gameplay emits semantic events; the juice layer (src/juice)
// listens and turns them into sound + visuals. Gameplay code must never call
// audio or effects directly.
import type * as THREE from 'three';

export type V3 = { x: number; y: number; z: number };
export type OutfitSlot = 'skin' | 'hair' | 'top' | 'bottom' | 'shoes' | 'accessory';

export interface GameEvents {
  // ── App / UI ──
  uiTap: { kind?: 'soft' | 'tab' | 'back' | 'big' };
  uiOpen: {};
  uiClose: {};
  sceneChange: { from: string | null; to: string };
  profileSwitch: { profileId: string };
  profileCreated: { profileId: string };
  creationSaved: { kind: string; pos?: V3 };
  townExported: {};
  townImported: {};
  reset: { pos?: V3 };
  /** v2: a charm was collected in town / a bonus reward unlocked. */
  charmCollected: { pos: V3; count: number };
  rewardUnlocked: { id: string; icon: string; label: string };
  /** v2: car stunts (ramps / airtime). */
  carJump: { pos: V3; strength: number };
  carLand: { pos: V3; strength: number };
  /** v2: boost fired (⚡ / Shift) and a tyre skid started (drift / handbrake turn). */
  carBoost: { pos: V3 };
  carSkid: { pos: V3; strength: number };
  /** v2: on-foot footfall in town (run = jogging). */
  footstep: { pos: V3; run: boolean };
  /** v2 r3: water. enter = dropped / swam into deep water (strength ~ impact), kick = a dolphin hop, stroke = a swimming stroke, wade = a step through the shallows. pos is on the surface. */
  waterSplash: { pos: V3; strength: number; kind: 'enter' | 'kick' | 'stroke' | 'wade' };
  /** v2 r3: the 🚗 Car button — the parked car pops away from its old spot and drops in beside the walker. */
  carVanish: { pos: V3 };
  carAppear: { pos: V3 };
  /** Picked an option in a station (shape, add-in, etc.). */
  optionPicked: { pos?: V3 };

  // ── Dress-up ──
  outfitChanged: { slot: OutfitSlot; pos?: V3; object?: THREE.Object3D };
  colorPicked: { color: string };
  characterSpin: { speed: number };
  /** camera-flash photo moment in the Style studio */
  photoFlash: { pos?: V3 };

  // ── Building ──
  piecePlaced: { pos: V3; type: string; object?: THREE.Object3D };
  pieceDeleted: { pos: V3; type: string };
  pieceRotated: { pos: V3; object?: THREE.Object3D };
  pieceRecolored: { pos: V3; object?: THREE.Object3D };
  pieceSelected: { pos: V3 };
  placementBlocked: { pos?: V3 };
  ghostMoved: { pos: V3 };
  plotClaimed: { pos: V3; plot: number };
  houseDeleted: { pos: V3; plot: number };
  undo: {};

  // ── Squishy ──
  squishPress: { pos: V3; strength: number };
  squishDrag: { pos: V3; speed: number };
  squishRelease: { pos: V3; depth: number };
  squishRecover: { pos: V3 };

  // ── Slime ──
  // `kind` = slime type id ('glossy' | 'butter' | 'clear' | 'crunchy' | 'cloud' | 'holo' | 'galaxy') so sounds can vary per type.
  slimeGrab: { pos: V3; kind?: string };
  /** One wet click per stretch step. `big` = an occasional larger "air" pop. amount: 0..1 strand pulled out to the rubber band. */
  slimeStretch: { pos: V3; amount: number; speed: number; kind?: string; big?: boolean };
  slimeRelease: { pos: V3; amount: number; kind?: string };
  slimePoke: { pos: V3; kind?: string };
  slimeFold: { pos: V3; kind?: string };
  slimeAddin: { kind: string; pos?: V3 };
  /** Crunchy slime: beads popping under a press / fold / drag. */
  slimeCrunch: { pos: V3; strength: number };
  /** A strand hit its limit and snapped back. */
  slimeSnap: { pos: V3; amount: number; color: string };
  /** An air bubble formed in a fold / popped (by a touch or by itself). */
  slimeBubble: { pos: V3; size: number };
  slimeBubblePop: { pos: V3; size: number; color: string };
  /** Picked a slime type. */
  slimeType: { kind: string; pos?: V3 };

  // ── Wax ──
  waxPourStart: { pos: V3 };
  waxPourFlow: { rate: number; pos: V3 };
  waxPourStop: {};
  waxDip: { pos: V3; color: string };
  waxLift: { pos: V3 };
  waxLayerAdded: { layers: number; color: string; pos: V3 };
  waxHardenStart: {};
  waxCool: { pos: V3 };
  waxHardened: { pos: V3 };
  shellCrack: { pos: V3; intensity: number };
  flakeDetach: { pos: V3; size: number };
  flakeLand: { pos: V3; size: number };
  shellCleared: { pos: V3 };

  // ── Driving ──
  driveStart: {};
  driveStop: {};
  carUpdate: { speed01: number; throttle: number };
  carCollide: { pos: V3; speed: number };
  horn: { pos: V3 };
  passengerWave: { pos: V3 };
  passengerPickup: { pos: V3 };
  passengerDropoff: { pos: V3 };
  arriveWorkshop: { pos: V3 };
  arriveBuild: { pos: V3 };
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] handler for ${String(type)} failed`, err);
      }
    }
  }
}

export const bus = new EventBus();

/** Convenience: copy a THREE.Vector3 (or any xyz) into a plain V3 payload. */
export function v3(p: { x: number; y: number; z: number }): V3 {
  return { x: p.x, y: p.y, z: p.z };
}
