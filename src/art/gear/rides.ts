// ── v3 locker / rides ── The Locker's Ride Wrap showroom now shows the REAL ride models (src/drive/rides.ts): the same chunky toys that drive
// around the island, wearing the player's wrap colour + finish. (This file used to hold Locker-only stand-ins; the drive agent owns it now.)
//   makeRidePreview(kind, wrap) → a group standing on y = 0 facing +Z. Dispose it with disposeGear(group) — it carries a dispose hook that
//   frees the ride's own paint material and its per-ride buffers (the shared model geometry stays with the world's rides).
import * as THREE from 'three';
import type { Hex, VehicleKind } from '../../core/model';
import { Ride, DEFAULT_STYLE, type RideFinish, type RideMotion } from '../../drive/rides';

export interface WrapLook {
  color: Hex;
  finish: string;
}

/** how far each ride floats above the plinth (the hoverboard hovers, the boat's keel hangs below the waterline) */
const LIFT: Record<VehicleKind, number> = { sports: 0, pickup: 0, golfcart: 0, hoverboard: 0.45, icecream: 0, boat: 0.42 };
const FINISHES: readonly string[] = ['gloss', 'matte', 'pearl', 'chrome', 'glitter'];
const STILL: RideMotion = { speed: 0, speed01: 0, steer: 0, accel: 0, lateral: 0, braking: false, boost: 0, airborne: false, slip: 0 };

/** The real ride `kind` in a wrap (the ride's own rims, no underglow): `group` stands on y = 0 and faces +Z. */
export function makeRideModel(kind: VehicleKind, wrap: WrapLook): { ride: Ride; group: THREE.Group } {
  const ride = new Ride(kind, wrap.color);
  const finish = (FINISHES.includes(wrap.finish) ? wrap.finish : 'gloss') as RideFinish;
  ride.setStyle({ ...DEFAULT_STYLE, finish });
  ride.setPose(0, LIFT[kind], 0, Math.PI); // the model faces -Z at heading 0: turn it round to face +Z
  ride.update(0.016, 0, STILL); // wheels onto their axles, the body to rest
  // the boost flames are hidden meshes: they would only stretch the bounds the Locker frames the ride with
  const hidden: THREE.Mesh[] = [];
  ride.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.visible) hidden.push(m);
  });
  for (const m of hidden) {
    m.removeFromParent();
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  const group = new THREE.Group();
  group.add(ride.group);
  group.name = `ride:${kind}`;
  group.userData.dispose = () => ride.dispose();
  return { ride, group };
}

export function makeRidePreview(kind: VehicleKind, wrap: WrapLook): THREE.Group {
  return makeRideModel(kind, wrap).group;
}
