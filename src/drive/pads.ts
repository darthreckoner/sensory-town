// Glowing entry pads: a pulsing ring, a slowly turning dashed ring, a faint
// column of light and a floating emoji icon. Drive onto one to enter a place.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tuning } from '../tuning';
import { ROAD_Y } from './terrain';
import { emojiSprite, lightBeam } from './envUtils';

export interface Pad {
  group: THREE.Group;
  update(t: number): void;
}

export function makePad(x: number, z: number, color: string, emoji: string): Pad {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const y = ROAD_Y + 0.03;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 44).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  disc.position.y = y;
  disc.renderOrder = 1;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  ring.position.y = y + 0.01;
  ring.renderOrder = 2;

  // Chunky dashes that turn slowly inside the ring.
  const dashGeos: THREE.BufferGeometry[] = [];
  const dashes = 10;
  for (let i = 0; i < dashes; i++) {
    const g = new THREE.RingGeometry(0.58, 0.7, 6, 1, (i / dashes) * Math.PI * 2, (Math.PI * 2 / dashes) * 0.55);
    g.rotateX(-Math.PI / 2);
    dashGeos.push(g);
  }
  const dashRing = new THREE.Mesh(
    mergeGeometries(dashGeos, false),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  dashRing.renderOrder = 2;
  dashRing.position.y = y + 0.02;

  const beam = lightBeam(color, 0.5, 6.5, 0.2);
  const icon = emojiSprite(emoji, 2.5);
  icon.position.y = 3.1;
  icon.renderOrder = 6;

  group.add(disc, ring, dashRing, beam, icon);

  return {
    group,
    update(t: number) {
      const r = tuning.drive.doorTriggerRadius;
      const pulse = 1 + Math.sin(t * 2.6) * 0.045;
      disc.scale.set(r, 1, r);
      ring.scale.set(r * pulse, 1, r * pulse);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 2.6) * 0.25;
      dashRing.scale.set(r, 1, r);
      dashRing.rotation.y = t * 0.5;
      beam.scale.set(r * 0.22, 1, r * 0.22);
      icon.position.y = 3.0 + Math.sin(t * 2.2) * 0.28;
      const s = 2.5 + Math.sin(t * 4.4) * 0.08;
      icon.scale.set(s, s, 1);
    },
  };
}
