// ── v3 locker ── Public entry point of the Locker gear, for the world scenes (DriveScene / movement / rides).
//
//   import { attachBackBling, makeGlider, makeContrail, getLocker } from '../art/gear';
//
//   const player = new Character(profile.outfit);
//   attachBackBling(player);                                  // the equipped back bling (or none), disposing the previous one
//   bus.on('lockerEquipped', () => attachBackBling(player));  // optional: stay in sync if the locker changes while in the world
//
//   gliding:  const g = makeGlider(getLocker().glider);  player.gliderAnchor.add(g);  player.setGliding(true);
//   trail:    const t = makeContrail(getLocker().contrail!);  scene.add(t.object);  t.update(dt, worldPos, gliding, velocity);
//   ride:     getLocker().ride (VehicleKind) is what the 🚗 call button brings; getLocker().wraps[kind] is its { color, finish }.
import type * as THREE from 'three';
import type { Character } from '../character';
import { getLocker, wrapOf } from './lockerState';
import { makeBackBling } from './backBling';
import { disposeGear } from './gearKit';

export { makeBackBling, BACK_BLING_IDS } from './backBling';
export { makeGlider, GLIDER_IDS } from './gliders';
export { makeContrail, CONTRAIL_IDS, type Contrail } from './contrails';
export { disposeGear } from './gearKit';
export { getLocker, wrapOf } from './lockerState';

const mounted = new WeakMap<Character, THREE.Object3D>();

/**
 * Hang the equipped back bling on `char` (pass an id to force one, or null for none). The previous bling is
 * disposed. Animated blings (wings, balloon…) expose `userData.tick(t)`; call it each frame if you want them to move:
 *   (bling.userData.tick as ((t: number) => void) | undefined)?.(time)
 */
export function attachBackBling(char: Character, id: string | null | undefined = undefined): THREE.Object3D | null {
  const want = id === undefined ? getLocker().backBling : id;
  const prev = mounted.get(char);
  if (prev) {
    char.setBackBling(null);
    disposeGear(prev);
    mounted.delete(char);
  }
  if (!want) return null;
  const obj = makeBackBling(want);
  char.setBackBling(obj);
  mounted.set(char, obj);
  return obj;
}

/** Call a bling's per-frame animation if it has one. */
export function tickBackBling(char: Character, t: number): void {
  (mounted.get(char)?.userData.tick as ((t: number) => void) | undefined)?.(t);
}

/** What the active player has equipped (ids), for one-line reads. */
export function equippedGear(): { backBling: string | null; glider: string; contrail: string | null; ride: string; wrap: { color: string; finish: string } } {
  const L = getLocker();
  return { backBling: L.backBling, glider: L.glider, contrail: L.contrail, ride: L.ride, wrap: wrapOf(L.ride) };
}
