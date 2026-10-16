// Charms: glowing, slowly spinning gems hidden around the map. Drive (or walk)
// through one to collect it; it persists per profile (core/unlocks.ts) and the
// bonus rewards unlock as the count grows. A light beam shows up when you are
// within range so exploring pays off.
import * as THREE from 'three';
import { CHARMS } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { charmCount, collectCharm, hasCharm } from '../core/unlocks';
import { beamTexture, clamp, smoothstep } from './envUtils';
import { PAL } from './palette';
import { hyp } from '../core/fastmath';   // ── v3 perf ── Math.hypot is ~12x slower than this

interface Entry {
  id: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  /** 0..1 pop-away progress (>0 while collecting) */
  pop: number;
  phase: number;
  color: THREE.Color;
  /** ground height under the gem (static) */
  gy: number;
  /** hidden because the player is far away (matrices zeroed once) */
  far: boolean;
}

export class Charms {
  readonly group = new THREE.Group();
  private readonly gems: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  private readonly beams: THREE.InstancedMesh;
  private entries: Entry[] = [];
  private readonly dummy = new THREE.Object3D();
  private colorsDirty = true;
  /** the beam colour is drawn from this palette */
  private static COLORS = [PAL.cyan, PAL.pink, PAL.gold, PAL.lime, PAL.violet, PAL.orange];

  constructor() {
    const n = CHARMS.length;
    const gemGeo = new THREE.OctahedronGeometry(0.5, 0);
    gemGeo.scale(0.8, 1.2, 0.8);
    this.gems = new THREE.InstancedMesh(
      gemGeo,
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.3, flatShading: true }),
      n,
    );
    const haloGeo = new THREE.RingGeometry(0.5, 1, 28).rotateX(-Math.PI / 2);
    this.halos = new THREE.InstancedMesh(
      haloGeo,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
      n,
    );
    const beamGeo = new THREE.CylinderGeometry(1, 1.2, 1, 14, 1, true).translate(0, 0.5, 0);
    this.beams = new THREE.InstancedMesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: '#ffffff', map: beamTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false }),
      n,
    );
    for (const im of [this.gems, this.halos, this.beams]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.gems.castShadow = false;
    this.halos.renderOrder = 6;
    this.beams.renderOrder = 6;
    this.entries = CHARMS.map((c, i) => ({
      id: c.id,
      x: c.x,
      z: c.z,
      gy: groundHeight(c.x, c.z, true),
      far: false,
      y: groundHeight(c.x, c.z, true) + (c.y ?? 1.3) + (c.y === undefined || c.y < 1 ? 1.0 : 0),
      alive: true,
      pop: 0,
      phase: i * 1.7,
      color: new THREE.Color(Charms.COLORS[i % Charms.COLORS.length]),
    }));
    this.entries.forEach((e, i) => {
      this.gems.setColorAt(i, e.color);
      this.halos.setColorAt(i, e.color);
      this.beams.setColorAt(i, e.color);
    });
    this.refresh();
  }

  /** Re-read which charms the active profile has already collected. */
  refresh(): void {
    for (const e of this.entries) {
      e.alive = !hasCharm(e.id);
      e.pop = 0;
    }
  }

  get total(): number {
    return this.entries.length;
  }
  get collected(): number {
    return charmCount();
  }

  /** Uncollected charms within `range` of a point (for the minimap). */
  nearby(x: number, z: number, range: number, out: { x: number; z: number }[]): void {
    out.length = 0;
    for (const e of this.entries) if (e.alive && e.pop === 0 && hyp(e.x - x, e.z - z) < range) out.push(e);
  }

  /** `px,py,pz` is the player's chest; `vx,vz` the viewer (for beam fading). */
  update(dt: number, t: number, px: number, py: number, pz: number, collectEnabled = true): void {
    const d = tuning.drive;
    const R2 = d.charmRadius * d.charmRadius;
    let dirty = false;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const dx = px - e.x, dz = pz - e.z;
      const dist = hyp(dx, dz);
      // far away: nothing to draw or animate (fog hides it anyway)
      if (dist > 230 && e.pop === 0) {
        if (!e.far) {
          e.far = true;
          this.dummy.position.set(e.x, e.y, e.z);
          this.dummy.scale.setScalar(0.0001);
          this.dummy.updateMatrix();
          this.gems.setMatrixAt(i, this.dummy.matrix);
          this.halos.setMatrixAt(i, this.dummy.matrix);
          this.beams.setMatrixAt(i, this.dummy.matrix);
          dirty = true;
        }
        continue;
      }
      e.far = false;
      dirty = true;
      let sc = 1;
      if (!e.alive) sc = 0;
      else if (e.pop > 0) {
        e.pop += dt / 0.35;
        sc = 1 + e.pop * 0.9;
        if (e.pop >= 1) {
          e.alive = false;
          sc = 0;
        }
      } else if (collectEnabled && dx * dx + dz * dz + (py - e.y) * (py - e.y) < R2) {
        e.pop = 0.001;
        const unlocked = collectCharm(e.id);
        bus.emit('charmCollected', { pos: { x: e.x, y: e.y, z: e.z }, count: charmCount() });
        void unlocked;
      }
      const bob = Math.sin(t * 2.0 + e.phase) * 0.18;
      this.dummy.position.set(e.x, e.y + bob, e.z);
      this.dummy.rotation.set(0, t * 1.6 + e.phase, 0);
      this.dummy.scale.setScalar(sc * (1 + Math.sin(t * 3 + e.phase) * 0.05));
      this.dummy.updateMatrix();
      this.gems.setMatrixAt(i, this.dummy.matrix);
      // halo on the ground under the gem
      this.dummy.position.set(e.x, Math.max(e.gy + 0.12, e.y - 3.2), e.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(sc * (1.4 + Math.sin(t * 2.6 + e.phase) * 0.18));
      this.dummy.updateMatrix();
      this.halos.setMatrixAt(i, this.dummy.matrix);
      // light beam, visible from afar when you are close-ish
      const fade = e.alive && e.pop === 0 ? 1 - smoothstep(d.charmBeamRange * 0.55, d.charmBeamRange, dist) : 0;
      this.dummy.position.set(e.x, Math.max(e.gy, e.y - 6), e.z);
      this.dummy.scale.set(0.26 * (1 + Math.sin(t * 4 + e.phase) * 0.1), 16 * clamp(fade, 0, 1) + 0.001, 0.26);
      this.dummy.updateMatrix();
      this.beams.setMatrixAt(i, this.dummy.matrix);
    }
    if (!dirty && !this.colorsDirty) return;
    this.gems.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.colorsDirty) {
      for (const im of [this.gems, this.halos, this.beams]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.colorsDirty = false;
    }
  }
}
