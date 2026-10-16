// The hub: cruise around the shared town in a toy convertible. Drive onto the
// glowing pads to enter the workshop or the build yard, give passengers rides
// (optional, no timer), and repaint the car with the 🎨 button.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { addLights, skyBackground } from '../art/env';
import { Car, type CarMotion } from '../art/car';
import { buildTownEnvironment, type Collider, type TownEnv } from '../world/townEnv';
import { buildTownContent } from '../world/houseMesh';
import { BUILD_YARD, SPAWN, WORKSHOP } from '../world/townLayout';
import { el, button, sheet, swatches } from '../ui/ui';
import { CarPhysics, type CarInput } from '../drive/physics';
import { DriveControls } from '../drive/controls';
import { JobBubble, Minimap, NameTags } from '../drive/hud';
import { JobManager } from '../drive/jobs';
import { clamp, lerpAngle, wrapAngle } from '../drive/envUtils';
import { groundHeight } from '../drive/terrain';

/** Where the sun sits relative to the shadow focus (the light follows the car). */
const SUN_OFFSET = new THREE.Vector3(22, 40, 16);
const BRAKING: CarInput = { steer: 0, gas: 0, brake: 0, handbrake: true };

export class DriveScene extends GameScene {
  readonly name = 'town' as const;
  pixelRatioCap = tuning.app.townPixelRatio;
  fxScale = 3;

  // world
  private env!: TownEnv;
  private content: THREE.Group | null = null;
  private colliders: Collider[] = [];
  private boxes: Extract<Collider, { kind: 'box' }>[] = [];
  private car!: Car;
  private readonly phys = new CarPhysics();
  private jobs!: JobManager;
  private sun!: THREE.DirectionalLight;
  private readonly lightX = new THREE.Vector3();
  private readonly lightY = new THREE.Vector3();

  // camera
  private readonly camPos = new THREE.Vector3();
  private readonly camWant = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();
  private camHeading = 0;
  private occl = 1;
  private fovScale = 1;
  private fovNow = 0;

  // hud / input
  private controls!: DriveControls;
  private minimap!: Minimap;
  private bubble!: JobBubble;
  private tags!: NameTags;
  private winW = 1;
  private winH = 1;
  private mapAcc = 0;
  private touchSeen = false;
  private openSheets = 0;

  // state
  private leaving = false;
  private leaveT = 0;
  private surface = 0;   // current ride height (road / curb)
  private surfaceKind = 0;
  private armed = { workshop: true, build: true };
  private lastHorn = 0;
  private lastHit = 0;
  private readonly motion: CarMotion = { speed: 0, speed01: 0, steer: 0, accel: 0, lateral: 0 };
  private readonly carUpdate = { speed01: 0, throttle: 0 };

  // ─────────────────────────────────────────────────────────────────────────
  init(): void {
    const d = tuning.drive;
    skyBackground(this.scene);
    const fog = new THREE.Color(tuning.art.skyTop).lerp(new THREE.Color(tuning.art.skyBottom), 0.62);
    this.scene.fog = new THREE.Fog(fog, tuning.art.fogNear, tuning.art.fogFar);
    this.camera.near = 0.5;
    this.camera.far = 420;
    this.camera.fov = d.cameraFov;
    this.camera.updateProjectionMatrix();

    // One sun with a small shadow box that follows the car.
    const rig = addLights(this.scene, { shadowSize: d.shadowSize, sunPos: SUN_OFFSET.clone() });
    this.sun = rig.sun;
    const zAxis = SUN_OFFSET.clone().normalize();
    this.lightX.crossVectors(new THREE.Vector3(0, 1, 0), zAxis).normalize();
    this.lightY.crossVectors(zAxis, this.lightX).normalize();

    this.env = buildTownEnvironment();
    this.scene.add(this.env.group);

    this.car = new Car(store.profile.carColor, store.profile.outfit);
    this.scene.add(this.car.group);
    this.jobs = new JobManager(this.scene, this.car);

    // ── HUD ──
    const hud = el('div', 'drive-hud passthrough', this.ui);
    hud.style.setProperty('--drive-map', `${d.minimapSize}px`);
    this.tags = new NameTags(hud);
    this.minimap = new Minimap(hud);
    this.bubble = new JobBubble(hud);
    button(hud, { icon: '🎨', cls: 'round drive-paint' }, () => this.openPaint());
    this.controls = new DriveControls(hud, () => this.honk());
  }

  enter(params?: { from?: 'workshop' | 'build' | string }): void {
    this.pixelRatioCap = tuning.app.townPixelRatio;
    this.camera.near = 0.5;
    this.camera.far = 420;

    // Houses and decorations change in build mode, so rebuild them every time.
    if (this.content) this.scene.remove(this.content);
    const built = buildTownContent(store.data.town);
    this.content = built.group;
    this.scene.add(this.content);
    this.colliders = [...this.env.colliders, ...built.colliders];
    this.boxes = this.colliders.filter((c): c is Extract<Collider, { kind: 'box' }> => c.kind === 'box');

    // My car, my outfit.
    const prof = store.profile;
    this.car.setColor(prof.carColor);
    this.car.setOutfit(prof.outfit);

    // Spawn: at SPAWN, or on the pad we just came out of (facing away from it).
    let x = SPAWN.x, z = SPAWN.z, heading = SPAWN.heading;
    this.armed = { workshop: true, build: true };
    if (params?.from === 'workshop') {
      x = WORKSHOP.pad.x;
      z = WORKSHOP.pad.z;
      heading = 0; // north, away from the door
      this.armed.workshop = false;
    } else if (params?.from === 'build') {
      x = BUILD_YARD.pad.x;
      z = BUILD_YARD.pad.z;
      heading = Math.PI; // south, away from the yard
      this.armed.build = false;
    }
    this.phys.reset(x, z, heading);
    this.leaving = false;
    this.leaveT = 0;
    this.motion.speed = this.motion.speed01 = this.motion.steer = this.motion.accel = this.motion.lateral = 0;
    this.surface = this.surfaceKind = groundHeight(x, z);
    this.car.setPose(x, z, heading);
    this.car.group.position.y = this.surface;
    this.camHeading = heading;
    this.occl = 1;
    this.placeCamera(0, true);
    this.updateSun();

    // HUD + controls
    this.controls.releaseAll();
    this.controls.applySizes();
    this.openSheets = 0;
    this.controls.suspended = false;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.controls.showTouch(coarse || this.touchSeen);
    this.minimap.rebuild();
    this.tags.rebuild(store.data.town.houses);
    this.bubble.hide();
    this.jobs.reset();

    this.listen(window, 'keydown', (e) => this.controls.onKeyDown(e));
    this.listen(window, 'keyup', (e) => this.controls.onKeyUp(e));
    this.listen(window, 'blur', () => this.controls.releaseAll());
    this.listen(
      window,
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') {
          this.touchSeen = true;
          this.controls.showTouch(true);
        }
      },
      { capture: true },
    );
    // Sheets (paint, the 🏠 menu) pause the steering so the car just rolls to a stop.
    this.onExit(bus.on('uiOpen', () => { this.openSheets++; this.controls.suspended = true; }));
    this.onExit(bus.on('uiClose', () => { this.openSheets = Math.max(0, this.openSheets - 1); this.controls.suspended = this.openSheets > 0; }));

    bus.emit('driveStart', {});
  }

  exit(): void {
    bus.emit('driveStop', {});
    this.controls.releaseAll();
    this.controls.suspended = false;
    this.openSheets = 0;
    this.jobs.clear();
    this.tags.clear();
    if (this.content) {
      this.scene.remove(this.content);
      this.content = null;
    }
  }

  resetStation(): void {
    this.phys.reset(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.camHeading = SPAWN.heading;
    this.placeCamera(0, true);
  }

  debugInfo(): Record<string, string | number> {
    return {
      speed: this.phys.fwdSpeed.toFixed(1),
      pos: `${this.phys.x.toFixed(0)},${this.phys.z.toFixed(0)}`,
      job: this.jobs.state,
      colls: this.colliders.length,
    };
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
    this.winW = w;
    this.winH = h;
    // Narrow / portrait windows get a wider view so the road ahead is still visible.
    const aspect = w / Math.max(1, h);
    this.fovScale = aspect < 1.5 ? 1 + (1.5 - aspect) * 0.45 : 1;
    this.fovNow = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  update(dt: number, t: number): void {
    const p = this.phys;

    // ── input → physics (small fixed sub-steps so thin colliders never tunnel) ──
    const input = this.leaving || this.controls.suspended ? BRAKING : this.controls.read();
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    let hit = 0;
    for (let i = 0; i < steps; i++) hit = Math.max(hit, p.step(h, input, this.colliders));
    if (hit > 0) this.onImpact(hit);

    // ── the car's body ──
    const m = this.motion;
    m.speed = p.fwdSpeed;
    m.speed01 = p.speed01;
    m.steer = p.steer;
    m.accel = p.accel;
    m.lateral = p.yawRate * p.fwdSpeed;
    // Ride on the road / hop up the curb.
    const gy = groundHeight(p.x, p.z);
    if (gy !== this.surfaceKind) {
      if (p.speed01 > 0.15 && Math.abs(gy - this.surfaceKind) > 0.08) this.car.bump(3 + p.speed01 * 4);
      this.surfaceKind = gy;
    }
    this.surface += (gy - this.surface) * (1 - Math.exp(-20 * dt));
    this.car.setPose(p.x, p.z, p.heading);
    this.car.group.position.y = this.surface;
    this.car.update(dt, t, m);

    this.env.update(dt, t);
    this.jobs.update(dt, t, p.x, p.z);
    this.checkPads(dt);

    // The engine hum follows the car (juice listens).
    this.carUpdate.speed01 = p.speed01;
    this.carUpdate.throttle = p.throttle;
    bus.emit('carUpdate', this.carUpdate);

    this.placeCamera(dt, false);
    this.updateSun();
    this.updateHud(dt, t);
  }

  // ── events from the car ───────────────────────────────────────────────────
  private onImpact(speed: number): void {
    const d = tuning.drive;
    if (speed < d.collideMinSpeed) return;
    const now = performance.now();
    if (now - this.lastHit < d.collideCooldownMs) return;
    this.lastHit = now;
    bus.emit('carCollide', { pos: { x: this.phys.impactX, y: 0.8, z: this.phys.impactZ }, speed });
    this.car.bump(speed);
  }

  private honk(): void {
    const now = performance.now();
    if (now - this.lastHorn < tuning.drive.hornCooldownMs || this.leaving) return;
    this.lastHorn = now;
    bus.emit('horn', { pos: { x: this.phys.x, y: 1.4, z: this.phys.z } });
    this.car.honk();
    this.jobs.onHorn(this.phys.x, this.phys.z);
  }

  // ── pads: workshop door and the build yard ────────────────────────────────
  private checkPads(dt: number): void {
    const p = this.phys;
    const R = tuning.drive.doorTriggerRadius;
    if (this.leaving) {
      // If the scene change was refused (another one in flight), try again shortly.
      this.leaveT += dt;
      if (this.leaveT > 1.4) this.leaving = false;
      return;
    }
    const dw = Math.hypot(p.x - WORKSHOP.pad.x, p.z - WORKSHOP.pad.z);
    const db = Math.hypot(p.x - BUILD_YARD.pad.x, p.z - BUILD_YARD.pad.z);
    // After coming back out of a place the pad stays asleep until the car has left it.
    if (!this.armed.workshop && dw > R + 0.8) this.armed.workshop = true;
    if (!this.armed.build && db > R + 0.8) this.armed.build = true;
    if (this.armed.workshop && dw < R) this.enterPlace('workshop');
    else if (this.armed.build && db < R) this.enterPlace('build');
  }

  private enterPlace(where: 'workshop' | 'build'): void {
    this.leaving = true;
    this.leaveT = 0;
    const pos = { x: this.phys.x, y: 1, z: this.phys.z };
    bus.emit(where === 'workshop' ? 'arriveWorkshop' : 'arriveBuild', { pos });
    void scenes.go(where);
  }

  // ── chase camera ──────────────────────────────────────────────────────────
  private placeCamera(dt: number, snap: boolean): void {
    const d = tuning.drive;
    const p = this.phys;
    const k = snap ? 1 : 1 - Math.exp(-d.cameraLag * dt);
    this.camHeading = lerpAngle(this.camHeading, p.heading, k);
    const bx = -Math.sin(this.camHeading), bz = Math.cos(this.camHeading); // unit vector behind the camera heading

    // Never inside a building: shorten the arm when a box is in the way.
    const dist = d.cameraFollowDistance;
    const tx = p.x + bx * dist, tz = p.z + bz * dist;
    const free = this.freeFraction(p.x, p.z, tx, tz);
    const minFrac = clamp(d.cameraMinDistance / dist, 0.1, 1);
    const target = Math.max(minFrac, free);
    if (snap) this.occl = target;
    else if (target < this.occl) this.occl += (target - this.occl) * (1 - Math.exp(-16 * dt));
    else this.occl += (target - this.occl) * (1 - Math.exp(-2.5 * dt));
    const f = this.occl;
    this.camWant.set(p.x + bx * dist * f, d.cameraHeight + (1 - f) * 4, p.z + bz * dist * f);

    const kp = snap ? 1 : 1 - Math.exp(-d.cameraLag * d.cameraPosLag * dt);
    this.camPos.lerp(this.camWant, kp);
    if (snap) this.camPos.copy(this.camWant);
    // last line of defence: keep the lens outside every box (lagging around corners)
    for (const b of this.boxes) {
      const ox = b.hw + 0.8 - Math.abs(this.camPos.x - b.x), oz = b.hd + 0.8 - Math.abs(this.camPos.z - b.z);
      if (ox > 0 && oz > 0 && this.camPos.y < 12) {
        if (ox < oz) this.camPos.x += (this.camPos.x >= b.x ? 1 : -1) * ox;
        else this.camPos.z += (this.camPos.z >= b.z ? 1 : -1) * oz;
      }
    }
    this.camPos.y = Math.max(2.2, this.camPos.y);
    this.camera.position.copy(this.camPos);

    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
    this.camera.lookAt(p.x + fx * d.cameraLookAhead, d.cameraLookHeight, p.z + fz * d.cameraLookAhead);

    // A touch wider at speed.
    const fov = (d.cameraFov + d.cameraFovBoost * p.speed01) * this.fovScale;
    if (Math.abs(fov - this.fovNow) > 0.05) {
      this.fovNow = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Fraction (0..1) of the segment a→b that is free of boxes (padded by the camera's radius). */
  private freeFraction(ax: number, az: number, bx: number, bz: number): number {
    let best = 1;
    const dx = bx - ax, dz = bz - az;
    for (const b of this.boxes) {
      const pad = 0.8;
      let t0 = 0, t1 = 1;
      // slab test on x and z
      for (let axis = 0; axis < 2; axis++) {
        const o = axis === 0 ? ax : az;
        const dd = axis === 0 ? dx : dz;
        const lo = (axis === 0 ? b.x - b.hw : b.z - b.hd) - pad;
        const hi = (axis === 0 ? b.x + b.hw : b.z + b.hd) + pad;
        if (Math.abs(dd) < 1e-6) {
          if (o < lo || o > hi) {
            t0 = 2;
            break;
          }
        } else {
          let ta = (lo - o) / dd, tb = (hi - o) / dd;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) break;
        }
      }
      if (t0 <= t1 && t0 < best) best = Math.max(0, t0 - 0.04);
    }
    return best;
  }

  // ── the sun follows the car (snapped to shadow texels so nothing shimmers) ─
  private updateSun(): void {
    const d = tuning.drive;
    const p = this.phys;
    let fx = p.x + Math.sin(this.camHeading) * d.shadowAhead;
    let fz = p.z - Math.cos(this.camHeading) * d.shadowAhead;
    const texel = (d.shadowSize * 2) / tuning.art.shadowMapSize;
    // snap the focus point in light space
    const a = fx * this.lightX.x + fz * this.lightX.z;
    const b = fx * this.lightY.x + fz * this.lightY.z;
    const sa = Math.round(a / texel) * texel - a;
    const sb = Math.round(b / texel) * texel - b;
    fx += sa * this.lightX.x + sb * this.lightY.x;
    fz += sa * this.lightX.z + sb * this.lightY.z;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + SUN_OFFSET.x, SUN_OFFSET.y, fz + SUN_OFFSET.z);
    const s = this.sun.shadow.camera;
    if (Math.abs(s.right - d.shadowSize) > 0.01) {
      s.left = -d.shadowSize;
      s.right = d.shadowSize;
      s.top = d.shadowSize;
      s.bottom = -d.shadowSize;
      s.updateProjectionMatrix();
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  private updateHud(dt: number, t: number): void {
    const p = this.phys;
    const target = this.jobs.target;

    this.mapAcc += dt;
    if (this.mapAcc >= 1 / 30) {
      this.mapAcc = 0;
      this.minimap.draw(p.x, p.z, p.heading, store.profile.carColor, target, t);
    }

    if (target) {
      this.camera.getWorldDirection(this.camDir);
      const camHeading = Math.atan2(this.camDir.x, -this.camDir.z);
      const bearing = Math.atan2(target.x - p.x, -(target.z - p.z));
      this.bubble.show(target.icon, `${target.name}!`, target.kind, wrapAngle(bearing - camHeading));
    } else this.bubble.hide();

    this.tags.update(this.camera, p.x, p.z, this.winW, this.winH);
  }

  // ── 🎨 repaint ────────────────────────────────────────────────────────────
  private openPaint(): void {
    sheet((body, close) => {
      el('h2', '', body, '🎨 Paint your car');
      swatches(
        body,
        tuning.art.palette,
        store.profile.carColor,
        (c) => {
          store.update(() => {
            store.profile.carColor = c;
          });
          this.car.setColor(c);
          bus.emit('optionPicked', { pos: { x: this.phys.x, y: 1.6, z: this.phys.z } });
        },
        'wide',
      );
      const row = el('div', 'row', body);
      row.style.justifyContent = 'center';
      row.style.marginTop = '18px';
      button(row, { label: 'Done', cls: 'pink big' }, close);
    });
  }
}
