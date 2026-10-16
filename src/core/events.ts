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
  /** Picked an option in a station (shape, add-in, etc.). */
  optionPicked: { pos?: V3 };

  // ── Dress-up ──
  outfitChanged: { slot: OutfitSlot; pos?: V3; object?: THREE.Object3D };
  colorPicked: { color: string };
  characterSpin: { speed: number };

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
  slimeGrab: { pos: V3 };
  slimeStretch: { pos: V3; amount: number; speed: number };
  slimeRelease: { pos: V3; amount: number };
  slimePoke: { pos: V3 };
  slimeFold: { pos: V3 };
  slimeAddin: { kind: string; pos?: V3 };

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
