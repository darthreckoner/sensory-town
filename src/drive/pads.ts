// Glowing entry pads for cars: a dark glass disc with a neon ring, a slowly
// turning dashed ring, a column of light and a floating icon. Drive onto one to
// enter the Studio or the builder's lot. (On foot, the door mats do the same.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tuning } from '../tuning';
import { groundHeight } from '../world/heightfield';
import { ROAD_LIFT } from './terrain';
import { emojiSprite, lightBeam } from './envUtils';

export interface Pad {
  group: THREE.Group;
  /** onFoot: the pad is only a ring on the ground (no light column / icon in the walker's face) */
  update(t: number, vx: number, vz: number, onFoot?: boolean): void;
}

export function makePad(x: number, z: number, color: string, emoji: string): Pad {
  const group = new THREE.Group();
  const y = groundHeight(x, z) + ROAD_LIFT + 0.04;
  group.position.set(x, y, z);
  const col = new THREE.Color(color);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#12101c', transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  );
  disc.renderOrder = 2;

  const glowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.86, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  );
  glowDisc.position.y = 0.01;
  glowDisc.renderOrder = 3;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
  );
  ring.position.y = 0.02;
  ring.renderOrder = 4;

  // chunky dashes that turn slowly inside the ring
  const dashGeos: THREE.BufferGeometry[] = [];
  const dashes = 12;
  for (let i = 0; i < dashes; i++) {
    const g = new THREE.RingGeometry(0.62, 0.72, 6, 1, (i / dashes) * Math.PI * 2, ((Math.PI * 2) / dashes) * 0.5);
    g.rotateX(-Math.PI / 2);
    dashGeos.push(g);
  }
  const dashRing = new THREE.Mesh(
    mergeGeometries(dashGeos, false),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
  );
  dashRing.renderOrder = 4;
  dashRing.position.y = 0.03;

  const beam = lightBeam(color, 0.5, 7, 0.22);
  const icon = emojiSprite(emoji, 2.6);
  icon.position.y = 3.2;
  icon.renderOrder = 8;

  group.add(disc, glowDisc, ring, dashRing, beam, icon);

  return {
    group,
    update(t: number, vx: number, vz: number, onFoot = false) {
      const near = Math.hypot(vx - x, vz - z) < 120;
      group.visible = near;
      if (!near) return;
      beam.visible = !onFoot;
      icon.visible = !onFoot;
      const r = tuning.drive.doorTriggerRadius;
      const pulse = 1 + Math.sin(t * 2.6) * 0.045;
      disc.scale.set(r, 1, r);
      glowDisc.scale.set(r, 1, r);
      ring.scale.set(r * pulse, 1, r * pulse);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 2.6) * 0.3;
      dashRing.scale.set(r, 1, r);
      dashRing.rotation.y = t * 0.5;
      beam.scale.set(r * 0.22, 1, r * 0.22);
      icon.position.y = 3.1 + Math.sin(t * 2.2) * 0.28;
      const s = 2.6 + Math.sin(t * 4.4) * 0.08;
      icon.scale.set(s, s, 1);
    },
  };
}
