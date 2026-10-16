// Optional pickup / drop-off rides. No timer, no penalty, no money.
//
//   cooldown → waiting (NPC waves, pink beacon) → boarding (hop into the back
//   seat) → riding (gold destination beacon) → alighting (hop out, cheer,
//   poof) → cooldown → a new passenger somewhere else.
import * as THREE from 'three';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { JOB_SPOTS, type Spot } from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import { Character, OUTFIT_CATALOG } from '../art/character';
import type { Outfit } from '../core/model';
import type { Car } from '../art/car';
import { ease, popScale, tweens } from '../core/tween';
import { clamp, emojiSprite, lerpAngle, lightBeam } from './envUtils';
import type { MapTarget } from './hud';

export type JobState = 'cooldown' | 'waiting' | 'boarding' | 'riding' | 'alighting';

export interface JobTarget extends MapTarget {
  name: string;
}

// ── a tall bouncing marker: ground ring, light column, spinning arrow (+ icon) ──
class Beacon {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly arrow: THREE.Mesh;
  private readonly icon: THREE.Sprite | null;

  constructor(color: string, icon?: string, tall = 12) {
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.disc.position.y = this.ring.position.y = 0.1;
    this.disc.renderOrder = this.ring.renderOrder = 2;
    this.beam = lightBeam(color, 0.45, tall, 0.42);
    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 1.15, 14).rotateX(Math.PI),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    this.arrow.castShadow = false;
    this.group.add(this.disc, this.ring, this.beam, this.arrow);
    if (icon) {
      this.icon = emojiSprite(icon, 2.8);
      this.icon.renderOrder = 6;
      this.group.add(this.icon);
    } else this.icon = null;
  }

  update(t: number): void {
    const r = tuning.drive.jobTriggerRadius;
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    this.disc.scale.set(r, 1, r);
    this.ring.scale.set(r * pulse, 1, r * pulse);
    const bob = Math.abs(Math.sin(t * 2.6));
    this.arrow.position.y = 4.4 + bob * 1.1;
    this.arrow.rotation.y = t * 2;
    if (this.icon) this.icon.position.y = 6.6 + bob * 0.9;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      } else if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.dispose();
    });
  }
}

function pick<T>(a: readonly T[]): T {
  return a[(Math.random() * a.length) | 0];
}

/** A random but tidy outfit built from the same catalog + palette the dress-up uses. */
export function randomOutfit(): Outfit {
  const pal = tuning.art.palette;
  const part = (n: number): { style: number; color: string } => ({ style: (Math.random() * n) | 0, color: pick(pal) });
  return {
    skin: pick(tuning.art.skinTones),
    hair: part(OUTFIT_CATALOG.hair.length),
    top: part(OUTFIT_CATALOG.top.length),
    bottom: part(OUTFIT_CATALOG.bottom.length),
    shoes: part(OUTFIT_CATALOG.shoes.length),
    accessory: part(OUTFIT_CATALOG.accessory.length),
  };
}

export class JobManager {
  state: JobState = 'cooldown';
  private timer = 0;
  private spot: Spot | null = null;
  private dest: Spot | null = null;
  private lastSpot: Spot | null = null;
  private outfit: Outfit | null = null;
  private standing: Character | null = null;
  private seated: Character | null = null;
  private pickupBeacon: Beacon | null = null;
  private destBeacon: Beacon | null = null;
  private waveTimer = 0;
  private nearTimer = 0;
  private hopT = 0;
  private cheerT = 0;
  private phase: 'hop' | 'cheer' | 'leave' = 'hop';
  private readonly hopFrom = new THREE.Vector3();
  private readonly hopTo = new THREE.Vector3();
  private readonly tgt: JobTarget = { x: 0, z: 0, icon: '', name: '', kind: 'pickup' };

  constructor(private readonly parent: THREE.Object3D, private readonly car: Car) {}

  /** Start over (scene enter). The first passenger shows up after jobFirstSeconds. */
  reset(): void {
    this.clear();
    this.state = 'cooldown';
    this.timer = tuning.drive.jobFirstSeconds;
  }

  /** Remove everything from the scene (scene exit). */
  clear(): void {
    this.standing?.group.removeFromParent();
    this.car.setPassenger(null);
    this.seated = null;
    this.standing = null;
    this.pickupBeacon?.dispose();
    this.destBeacon?.dispose();
    this.pickupBeacon = this.destBeacon = null;
    this.spot = this.dest = null;
    this.state = 'cooldown';
  }

  /** What the HUD should point at right now. */
  get target(): JobTarget | null {
    const t = this.tgt;
    if (this.state === 'waiting' && this.spot) {
      t.x = this.spot.x;
      t.z = this.spot.z;
      t.icon = '🙋';
      t.name = 'Hello';
      t.kind = 'pickup';
      return t;
    }
    if ((this.state === 'riding' || this.state === 'boarding') && this.dest) {
      t.x = this.dest.x;
      t.z = this.dest.z;
      t.icon = this.dest.icon;
      t.name = this.dest.name;
      t.kind = 'dropoff';
      return t;
    }
    return null;
  }

  /** Honking at a waiting passenger makes them hop and wave back. */
  onHorn(cx: number, cz: number): void {
    if (this.state !== 'waiting' || !this.standing || !this.spot) return;
    const s = this.spot;
    if (Math.hypot(cx - s.x, cz - s.z) > tuning.drive.jobWaveRadius * 1.6) return;
    this.standing.hop();
    this.standing.wave();
    this.waveTimer = 1.7;
    bus.emit('passengerWave', { pos: { x: s.x, y: 1.6, z: s.z } });
  }

  /** cx, cz = where the player is (car or feet); canTrigger = in the car (a ride needs the car). */
  update(dt: number, t: number, cx: number, cz: number, canTrigger = true): void {
    const d = tuning.drive;
    this.pickupBeacon?.update(t);
    this.destBeacon?.update(t);
    this.standing?.update(dt, t);

    switch (this.state) {
      case 'cooldown':
        this.timer -= dt;
        if (this.timer <= 0) this.spawn(cx, cz);
        break;

      case 'waiting': {
        const npc = this.standing!, s = this.spot!;
        const dist = Math.hypot(cx - s.x, cz - s.z);
        if (dist < 28) {
          const want = Math.atan2(cx - s.x, cz - s.z);
          npc.group.rotation.y = lerpAngle(npc.group.rotation.y, want, 1 - Math.exp(-6 * dt));
        }
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          npc.wave();
          this.waveTimer = 1.7;
        }
        this.nearTimer -= dt;
        if (dist < d.jobWaveRadius && this.nearTimer <= 0) {
          this.nearTimer = d.jobWaveEverySeconds;
          bus.emit('passengerWave', { pos: { x: s.x, y: 1.6, z: s.z } });
        }
        if (canTrigger && dist < d.jobTriggerRadius) this.startBoarding(cx, cz);
        break;
      }

      case 'boarding': {
        const npc = this.standing!;
        this.hopT += dt / Math.max(0.05, d.passengerHopSeconds);
        const k = clamp(this.hopT, 0, 1);
        const e = k * k * (3 - 2 * k);
        this.car.seatWorld(this.hopTo);
        npc.group.position.lerpVectors(this.hopFrom, this.hopTo, e);
        npc.group.position.y += Math.sin(Math.PI * k) * 1.9;
        npc.group.rotation.y = lerpAngle(npc.group.rotation.y, Math.atan2(this.hopTo.x - npc.group.position.x, this.hopTo.z - npc.group.position.z), 1 - Math.exp(-14 * dt));
        if (k >= 0.9 && this.seated && !this.car.passenger) {
          // swap the standing hopper for the seated version
          this.car.setPassenger(this.seated);
          popScale(this.seated.group, 0.35, 0.18);
          npc.group.removeFromParent();
        }
        if (k >= 1) {
          this.state = 'riding';
          this.seated?.wave();
          this.waveTimer = 2.2;
          this.pickupBeacon?.dispose();
          this.pickupBeacon = null;
          if (this.dest) {
            this.destBeacon = new Beacon('#ffc844', this.dest.icon, 14);
            this.destBeacon.group.position.set(this.dest.x, groundHeight(this.dest.x, this.dest.z), this.dest.z);
            this.parent.add(this.destBeacon.group);
          }
        }
        break;
      }

      case 'riding': {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.seated?.wave();
          this.waveTimer = 3 + Math.random() * 2;
        }
        const s = this.dest!;
        if (canTrigger && Math.hypot(cx - s.x, cz - s.z) < d.jobTriggerRadius) this.startAlighting(cx, cz);
        break;
      }

      case 'alighting':
        this.updateAlighting(dt, cx, cz);
        break;
    }
  }

  // ── transitions ──────────────────────────────────────────────────────────
  private spawn(cx: number, cz: number): void {
    const d = tuning.drive;
    // A pickup spot that is not right on top of the car, and not the last one.
    const dist = (s: Spot): number => Math.hypot(s.x - cx, s.z - cz);
    const mid = JOB_SPOTS.filter((s) => s !== this.lastSpot && dist(s) > 24 && dist(s) < 130);
    const far = JOB_SPOTS.filter((s) => s !== this.lastSpot && dist(s) > 24);
    const spot = pick(mid.length ? mid : far.length ? far : JOB_SPOTS.filter((s) => s !== this.lastSpot));
    // A destination well away from the pickup.
    const ride = JOB_SPOTS.filter((s) => s !== spot && Math.hypot(s.x - spot.x, s.z - spot.z) >= d.jobMinDistance && Math.hypot(s.x - spot.x, s.z - spot.z) < 200);
    const dest = pick(ride.length ? ride : JOB_SPOTS.filter((s) => s !== spot));
    this.spot = spot;
    this.dest = dest;
    this.lastSpot = spot;
    this.outfit = randomOutfit();
    const npc = new Character(this.outfit);
    npc.group.position.set(spot.x, groundHeight(spot.x, spot.z, true), spot.z);
    npc.group.rotation.y = Math.atan2(-spot.x, -spot.z);
    npc.group.scale.setScalar(0.01);
    this.parent.add(npc.group);
    tweens.add(0.5, (k) => npc.group.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    npc.wave();
    this.standing = npc;
    this.pickupBeacon = new Beacon('#ff6fa5');
    this.pickupBeacon.group.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    this.parent.add(this.pickupBeacon.group);
    this.waveTimer = 1.2;
    this.nearTimer = 0;
    this.state = 'waiting';
  }

  private startBoarding(cx: number, cz: number): void {
    const npc = this.standing!;
    bus.emit('passengerPickup', { pos: { x: cx, y: 1.6, z: cz } });
    this.seated = new Character(this.outfit!, { seated: true, shadows: false });
    this.hopFrom.copy(npc.group.position);
    this.hopT = 0;
    npc.hop();
    this.state = 'boarding';
  }

  private startAlighting(cx: number, cz: number): void {
    bus.emit('passengerDropoff', { pos: { x: cx, y: 1.6, z: cz } });
    const npc = this.standing!;
    this.car.seatWorld(this.hopFrom);
    this.car.setPassenger(null);
    this.seated = null;
    npc.group.position.copy(this.hopFrom);
    npc.group.scale.setScalar(1);
    this.parent.add(npc.group);
    npc.hop();
    // Land on the spot itself, a little beside where the car stopped.
    const s = this.dest!;
    const hx = s.x + (cx < s.x ? 1 : -1) * 1.2, hz = s.z + (cz < s.z ? 1 : -1) * 1.2;
    this.hopTo.set(hx, groundHeight(hx, hz, true), hz);
    this.destBeacon?.dispose();
    this.destBeacon = null;
    this.hopT = 0;
    this.phase = 'hop';
    this.state = 'alighting';
  }

  private updateAlighting(dt: number, cx: number, cz: number): void {
    const npc = this.standing!;
    const d = tuning.drive;
    if (this.phase === 'hop') {
      this.hopT += dt / Math.max(0.05, d.passengerHopSeconds);
      const k = clamp(this.hopT, 0, 1);
      const e = ease.outCubic(k);
      npc.group.position.lerpVectors(this.hopFrom, this.hopTo, e);
      npc.group.position.y += Math.sin(Math.PI * k) * 1.5;
      if (k >= 1) {
        this.phase = 'cheer';
        this.cheerT = d.jobCelebrateSeconds;
        npc.wave();
        npc.hop();
        this.waveTimer = 1.3;
      }
    } else if (this.phase === 'cheer') {
      this.cheerT -= dt;
      npc.group.rotation.y = lerpAngle(npc.group.rotation.y, Math.atan2(cx - npc.group.position.x, cz - npc.group.position.z), 1 - Math.exp(-8 * dt));
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        npc.wave();
        this.waveTimer = 1.3;
      }
      if (this.cheerT <= 0) {
        this.phase = 'leave';
        this.hopT = 0;
      }
    } else {
      this.hopT += dt / 0.4;
      const k = clamp(this.hopT, 0, 1);
      npc.group.scale.setScalar(Math.max(0.001, 1 - ease.inOutCubic(k)));
      npc.group.position.y = this.hopTo.y + Math.sin(Math.PI * k) * 0.5;
      if (k >= 1) {
        npc.group.removeFromParent();
        this.standing = null;
        this.state = 'cooldown';
        this.timer = d.jobRespawnSeconds;
      }
    }
  }
}
