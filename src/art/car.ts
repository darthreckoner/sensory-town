// The player's car: a cute chunky toy convertible. Facing -z in local space
// (like a three.js camera), so the scene just sets `group.rotation.y = -heading`.
//
//   group            root; positioned/rotated by setPose()
//    ├ shadow        soft contact blob
//    ├ rig           everything that leans / pitches / bounces / squashes
//    │   ├ body      baked, paint-coloured parts + trim + seats
//    │   ├ steering wheel, antenna, driver, passenger seat
//    └ wheels ×4     (front ones yaw with the steering, all spin with speed)
import * as THREE from 'three';
import type { Outfit } from '../core/model';
import { tuning } from '../tuning';
import { toyMat, toyMatUnique, roundedBox, mesh, blobShadow } from './materials';
import { Character } from './character';
import { bakeStatic, lathe, clamp } from '../drive/envUtils';

/** What the physics tells the car's body each frame. */
export interface CarMotion {
  /** Signed forward speed, units / s (negative = reversing). */
  speed: number;
  /** |speed| / topSpeed, 0..1. */
  speed01: number;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  steer: number;
  /** Longitudinal acceleration, units / s² (negative when braking). */
  accel: number;
  /** Cornering force proxy: yawRate × speed. Positive = turning right. */
  lateral: number;
}

const WHEEL_R = 0.52;
const WHEEL_W = 0.46;
const WHEEL_X = 1.12;
const WHEEL_Z = 1.32;

function rollingMat(m: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  m.side = THREE.DoubleSide; // lathe profiles may be wound either way; never disappear
  return m;
}

export class Car {
  readonly group = new THREE.Group();
  readonly driver: Character;
  /** Where a passenger sits (child of the leaning rig). */
  readonly seatRoot = new THREE.Object3D();
  passenger: Character | null = null;

  private readonly rig = new THREE.Group();
  private readonly paint: THREE.MeshPhysicalMaterial;
  private readonly tireMat = rollingMat(toyMatUnique('#4a4663', 'satin'));
  private readonly wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  private readonly swSpin = new THREE.Group();
  private readonly antenna = new THREE.Group();
  private spinAngle = 0;
  private roll = 0;
  private pitch = 0;
  private antX = 0;
  private antZ = 0;
  private bounceY = 0;
  private bounceVel = 0;

  constructor(color: string, outfit: Outfit) {
    this.paint = toyMatUnique(color, 'gloss');
    this.paint.clearcoat = 1;
    this.paint.clearcoatRoughness = 0.12;
    this.paint.roughness = 0.32;

    const shadow = blobShadow(1.9, 0.3);
    shadow.scale.set(1.15, 1.75, 1);
    shadow.position.y = 0.03;
    this.group.add(shadow);

    this.group.add(this.rig);
    this.rig.add(this.buildBody());
    this.buildSteeringWheel();
    this.buildAntenna();

    // Wheels live outside the rig so they stay on the ground while the body leans.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * WHEEL_X, WHEEL_R, sz * WHEEL_Z);
      const spin = new THREE.Group();
      spin.add(this.buildWheel(sx));
      pivot.add(spin);
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, front: sz < 0 });
    }

    // Driver (visible so the outfit shows in town) and the back-seat mount.
    const d = tuning.drive;
    this.driver = new Character(outfit, { seated: true });
    // The character's butt rests Character.SEAT_Y above its origin; put that on the seat cushion.
    this.driver.group.position.set(-0.42, d.driverY - Character.SEAT_Y * d.driverScale, -0.06);
    this.driver.group.scale.setScalar(d.driverScale);
    this.driver.group.rotation.y = d.driverYaw;
    this.rig.add(this.driver.group);

    this.seatRoot.position.set(0.42, d.driverY, 0.84);
    this.rig.add(this.seatRoot);
  }

  // ── public API ───────────────────────────────────────────────────────────
  setPose(x: number, z: number, heading: number): void {
    this.group.position.x = x;
    this.group.position.z = z;
    this.group.rotation.y = -heading;
  }

  setColor(hex: string): void {
    this.paint.color.set(hex);
  }

  setOutfit(outfit: Outfit): void {
    this.driver.setOutfit(outfit);
  }

  /** Seat (or remove, with null) a passenger in the back seat. */
  setPassenger(c: Character | null): void {
    if (this.passenger) this.seatRoot.remove(this.passenger.group);
    this.passenger = c;
    if (c) {
      const d = tuning.drive;
      c.group.position.set(0, -Character.SEAT_Y * d.driverScale, 0);
      c.group.scale.setScalar(d.driverScale);
      c.group.rotation.set(0, d.driverYaw, 0);
      this.seatRoot.add(c.group);
    }
  }

  /** World position of the passenger seat (written into `out`). */
  seatWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.seatRoot.getWorldPosition(out);
  }

  /** A little hop + squash (collisions, horn). `strength` ≈ impact speed. */
  bump(strength: number): void {
    this.bounceVel += clamp(strength / 9, 0.25, 1.3) * tuning.drive.carBounceKick;
  }

  honk(): void {
    this.bounceVel += 0.9;
    this.driver.wave();
  }

  update(dt: number, t: number, m: CarMotion): void {
    const d = tuning.drive;
    // Roll outward in turns, nose up on throttle / dive on brake.
    const rollT = clamp(m.lateral / (d.turnRate * d.topSpeed * 0.7), -1, 1) * d.carLean;
    const acc = clamp(m.accel / 10, -1, 1);
    const k = 1 - Math.exp(-9 * dt);
    this.roll += (rollT - this.roll) * k;
    this.pitch += (acc * d.carPitch - this.pitch) * k;

    // Bounce: a damped spring that bumps and honks kick.
    this.bounceVel += (-170 * this.bounceY - 11 * this.bounceVel) * dt;
    this.bounceY += this.bounceVel * dt;
    const buzz = Math.sin(t * 47) * 0.006 + Math.sin(t * 31 + 1) * 0.004;
    this.rig.position.y = Math.max(-0.06, this.bounceY) + buzz * (0.25 + m.speed01) ;
    this.rig.rotation.set(this.pitch, 0, this.roll);
    // Squash on accel / brake, stretch while the bounce is rising.
    const sy = 1 - Math.abs(acc) * d.carSquash + clamp(this.bounceVel * 0.012, -0.05, 0.05);
    const sxz = 1 + Math.abs(acc) * d.carSquash * 0.5 - clamp(this.bounceVel * 0.006, -0.025, 0.025);
    this.rig.scale.set(sxz, sy, sxz);

    // Wheels.
    this.spinAngle += (m.speed / WHEEL_R) * dt;
    const yaw = -m.steer * d.wheelSteerAngle;
    for (const w of this.wheels) {
      w.spin.rotation.x = -this.spinAngle;
      if (w.front) w.pivot.rotation.y = yaw;
    }
    this.swSpin.rotation.z = -m.steer * 1.5;

    // Antenna lags behind the body.
    const ax = acc * 0.28;
    const az = -this.roll * 3.2 + Math.sin(t * 8) * 0.03 * m.speed01;
    this.antX += (ax - this.antX) * (1 - Math.exp(-6 * dt));
    this.antZ += (az - this.antZ) * (1 - Math.exp(-6 * dt));
    this.antenna.rotation.set(this.antX, 0, this.antZ);

    this.driver.setSteer(m.steer);
    this.driver.update(dt, t);
    this.passenger?.update(dt, t);
  }

  // ── construction ─────────────────────────────────────────────────────────
  private buildBody(): THREE.Group {
    const paint = this.paint;
    const trim = toyMat('#ffffff', 'gloss');
    const dark = toyMat('#4b4766', 'satin');
    const seat = toyMat('#ffe9f2', 'fabric');
    const lamp = toyMat('#fff4b8', 'emissive');
    const tail = toyMat('#ff6f91', 'emissive');
    const chrome = toyMat('#d9d6ee', 'metal');
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#cdefff', roughness: 0.05, transparent: true, opacity: 0.38, clearcoat: 1,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, receive = false): THREE.Mesh => {
      const m = mesh(geo, mat, true, receive);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };

    // Painted tub, hood, trunk and the low cockpit walls.
    add(roundedBox(2.1, 0.62, 4.0, 0.28), paint, 0, 0.62, 0);
    add(roundedBox(2.0, 0.5, 1.45, 0.22), paint, 0, 0.98, -1.28);
    add(roundedBox(2.0, 0.5, 0.75, 0.22), paint, 0, 0.98, 1.62);
    for (const sx of [-1, 1]) add(roundedBox(0.2, 0.5, 2.0, 0.09), paint, sx * 0.97, 1.05, 0.33);
    // Fender arches over the wheels.
    const arch = new THREE.TorusGeometry(0.64, 0.085, 8, 18, Math.PI);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const f = add(arch, paint, sx * 1.1, WHEEL_R, sz * WHEEL_Z, 0, Math.PI / 2, 0);
        f.scale.set(1, 1, 3.2);
      }
    // Cockpit: dark floor, cream seats with backrests, dash.
    add(roundedBox(1.8, 0.12, 2.0, 0.05), dark, 0, 0.9, 0.33);
    add(roundedBox(0.78, 0.26, 0.78, 0.12), seat, -0.42, 1.04, -0.06, 0, 0, 0, true);
    add(roundedBox(0.78, 0.26, 0.2, 0.1), seat, -0.42, 1.27, 0.3, -0.1, 0, 0, true);
    add(roundedBox(0.78, 0.26, 0.78, 0.12), seat, 0.42, 1.04, 0.84, 0, 0, 0, true);
    add(roundedBox(0.78, 0.26, 0.2, 0.1), seat, 0.42, 1.27, 1.2, -0.1, 0, 0, true);
    add(roundedBox(1.8, 0.3, 0.42, 0.12), dark, 0, 1.2, -0.5);
    // White trim around the open cabin + windshield.
    for (const sx of [-1, 1]) add(roundedBox(0.22, 0.12, 2.06, 0.05), trim, sx * 0.97, 1.33, 0.33);
    add(roundedBox(1.96, 0.12, 0.2, 0.05), trim, 0, 1.3, 1.3);
    for (const sx of [-1, 1]) add(roundedBox(0.1, 0.7, 0.1, 0.04), trim, sx * 0.88, 1.62, -0.45, 0.35, 0, 0);
    add(roundedBox(1.86, 0.1, 0.1, 0.04), trim, 0, 1.95, -0.32);
    add(new THREE.PlaneGeometry(1.66, 0.62), glass, 0, 1.62, -0.44, 0.35, 0, 0);
    // Bumpers, grille, racing stripes, plate, exhaust.
    for (const sz of [-1, 1]) add(roundedBox(1.9, 0.22, 0.3, 0.1), trim, 0, 0.5, sz * 2.05);
    add(roundedBox(0.66, 0.2, 0.08, 0.04), trim, 0, 0.9, -2.0);
    for (const sx of [-1, 1]) {
      add(roundedBox(0.15, 0.04, 1.4, 0.02), trim, sx * 0.2, 1.235, -1.28);
      add(roundedBox(0.15, 0.04, 0.7, 0.02), trim, sx * 0.2, 1.235, 1.62);
    }
    add(roundedBox(0.7, 0.28, 0.05, 0.03), seat, 0, 0.74, 2.08);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), chrome, -0.62, 0.42, 2.12, Math.PI / 2, 0, 0);
    // Round headlights and taillights.
    const bulb = new THREE.SphereGeometry(0.24, 16, 12);
    const ring = new THREE.TorusGeometry(0.255, 0.045, 8, 20);
    for (const sx of [-1, 1]) {
      const b = add(bulb, lamp, sx * 0.62, 1.0, -1.98);
      b.scale.z = 0.6;
      add(ring, trim, sx * 0.62, 1.0, -1.97);
      add(roundedBox(0.42, 0.2, 0.1, 0.06), tail, sx * 0.66, 0.98, 2.0);
    }
    return bakeStatic(g);
  }

  private buildSteeringWheel(): void {
    const trim = toyMat('#ffffff', 'gloss');
    const dark = toyMat('#4b4766', 'satin');
    const sw = new THREE.Group();
    sw.position.set(-0.42, 1.5, -0.46);
    sw.rotation.x = -0.62;
    const column = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), dark, false, false);
    column.rotation.x = Math.PI / 2;
    column.position.z = -0.25;
    sw.add(column);
    const ring = mesh(new THREE.TorusGeometry(0.21, 0.04, 8, 22), trim, true, false);
    const hub = mesh(new THREE.SphereGeometry(0.075, 10, 8), this.paint, false, false);
    const spoke = mesh(roundedBox(0.4, 0.05, 0.05, 0.02), trim, false, false);
    const mark = mesh(new THREE.SphereGeometry(0.05, 8, 6), this.paint, false, false);
    mark.position.set(0, 0.21, 0);
    this.swSpin.add(ring, hub, spoke, mark);
    sw.add(this.swSpin);
    this.rig.add(sw);
  }

  private buildAntenna(): void {
    const chrome = toyMat('#d9d6ee', 'metal');
    const rod = mesh(new THREE.CylinderGeometry(0.013, 0.02, 1.15, 6), chrome, false, false);
    rod.position.y = 0.575;
    const ball = mesh(new THREE.SphereGeometry(0.1, 12, 10), toyMat('#ffd166', 'gloss'), true, false);
    ball.position.y = 1.18;
    this.antenna.add(rod, ball);
    this.antenna.position.set(0.82, 1.22, 1.72);
    this.rig.add(this.antenna);
  }

  /** Chunky tire with treads, a white hub and a little paint-coloured flower of dots (so the spin reads). */
  private buildWheel(side: number): THREE.Object3D {
    const tireMat = this.tireMat;
    const hubMat = toyMat('#ffffff', 'gloss');
    const R = WHEEL_R, W = WHEEL_W, rr = 0.15;
    const prof: [number, number][] = [[0, -W / 2]];
    for (let i = 0; i <= 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
      prof.push([R - rr + rr * Math.cos(a), -W / 2 + rr + rr * Math.sin(a)]);
    }
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      prof.push([R - rr + rr * Math.cos(a), W / 2 - rr + rr * Math.sin(a)]);
    }
    prof.push([0, W / 2]);
    const asm = new THREE.Group();
    const tire = mesh(lathe(prof, 24), tireMat, true, false);
    tire.rotation.z = Math.PI / 2;
    asm.add(tire);
    // Chunky treads.
    const tread = roundedBox(W * 0.98, 0.09, 0.16, 0.03, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tr = mesh(tread, tireMat, true, false);
      tr.position.set(0, Math.cos(a) * (R + 0.01), Math.sin(a) * (R + 0.01));
      tr.rotation.x = a;
      asm.add(tr);
    }
    // Hub, centre cap and dots on the outer face.
    const hub = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 22), hubMat, true, false);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * (W / 2);
    asm.add(hub);
    const cap = mesh(new THREE.SphereGeometry(0.13, 12, 8), this.paint, false, false);
    cap.scale.x = 0.5;
    cap.position.x = side * (W / 2 + 0.05);
    asm.add(cap);
    const dotGeo = new THREE.SphereGeometry(0.055, 8, 6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const dot = mesh(dotGeo, this.paint, false, false);
      dot.position.set(side * (W / 2 + 0.05), Math.cos(a) * 0.23, Math.sin(a) * 0.23);
      asm.add(dot);
    }
    return bakeStatic(asm);
  }
}
