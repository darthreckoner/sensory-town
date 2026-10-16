// The sensory workshop: a cozy close-up craft room with three stations.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { addLights, gradientTexture } from '../art/env';
import { toyMat, mesh, roundedBox } from '../art/materials';
import { buildCreationMesh } from '../art/creationMesh';
import { el, button, tabs } from '../ui/ui';
import type { Station, StationContext, StationId, WPointer } from '../workshop/station';
import { SquishyStation } from '../workshop/SquishyStation';
import { SlimeStation } from '../workshop/SlimeStation';
import { WaxStation } from '../workshop/WaxStation';

export class WorkshopScene extends GameScene {
  readonly name = 'workshop' as const;
  private stations = new Map<StationId, Station>();
  private active: Station | null = null;
  private activeId: StationId = 'wax';
  private shelf = new THREE.Group();
  private stationUi!: HTMLDivElement;
  private setTab!: (id: string) => void;
  private ray = new THREE.Raycaster();
  readonly tableY = 0;

  init(): void {
    this.camera.fov = 38;
    this.scene.background = gradientTexture('#ffe1ec', '#fff4e6', '#ffeaf2');
    addLights(this.scene, { shadowSize: 4, sunPos: new THREE.Vector3(3.5, 7, 4), fill: 0.55, key: 1.35 });
    this.scene.environmentIntensity = 0.55;
    this.buildRoom();

    const ctx: StationContext = {
      camera: this.camera,
      scene: this.scene,
      tableY: this.tableY,
      raycast: (p, objects, recursive = true) => {
        this.ray.set(p.ray.origin, p.ray.direction);
        return this.ray.intersectObjects(objects, recursive);
      },
      rayToPlane: (p, plane) => p.ray.intersectPlane(plane, new THREE.Vector3()),
      cameraPlane: (point) => {
        const n = new THREE.Vector3();
        this.camera.getWorldDirection(n).negate();
        return new THREE.Plane().setFromNormalAndCoplanarPoint(n, point);
      },
    };
    for (const s of [new SquishyStation(), new SlimeStation(), new WaxStation()] as Station[]) {
      s.init(ctx);
      s.root.visible = false;
      this.scene.add(s.root);
      this.stations.set(s.id, s);
    }
    this.scene.add(this.shelf);

    // UI chrome
    this.setTab = tabs(
      this.ui,
      [
        { id: 'squishy', icon: '🧸', label: 'Squishy' },
        { id: 'slime', icon: '🫧', label: 'Slime' },
        { id: 'wax', icon: '🕯️', label: 'Wax' },
      ],
      this.activeId,
      (id) => this.switchTo(id as StationId),
    );
    (this.ui.lastElementChild as HTMLElement).classList.add('tc');
    button(this.ui, { icon: '🚗', label: 'Drive', cls: 'tr blue' }, () => void scenes.go('town', { from: 'workshop' }));
    this.stationUi = el('div', '', this.ui) as HTMLDivElement;
  }

  private buildRoom(): void {
    const room = new THREE.Group();
    // back wall with a wainscot stripe
    const wall = mesh(new THREE.PlaneGeometry(30, 14), toyMat('#ffe3ee', 'matte'), false, true);
    wall.position.set(0, 4, -4);
    const wains = mesh(new THREE.PlaneGeometry(30, 2.2), toyMat('#ffc9dc', 'matte'), false, true);
    wains.position.set(0, -0.3, -3.98);
    // floor
    const floor = mesh(new THREE.PlaneGeometry(30, 20), toyMat('#f6dcc8', 'matte'), false, true);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    // table
    const top = mesh(roundedBox(9, 0.36, 4.6, 0.16), toyMat('#fff6ef', 'satin'), false, true);
    top.position.set(0, this.tableY - 0.18, 0);
    const apron = mesh(roundedBox(8.6, 0.5, 4.2, 0.12), toyMat('#ffd1e1', 'satin'), false, true);
    apron.position.set(0, this.tableY - 0.55, 0);
    // shelf on the wall for saved creations
    const shelfBoard = mesh(roundedBox(7.5, 0.16, 0.9, 0.06), toyMat('#ffffff', 'satin'));
    shelfBoard.position.set(0, 1.62, -3.5);
    const bracketMat = toyMat('#ff8fb1');
    for (const x of [-3.2, 3.2]) {
      const br = mesh(roundedBox(0.16, 0.5, 0.7, 0.05), bracketMat);
      br.position.set(x, 1.37, -3.6);
      room.add(br);
    }
    // pendant lamps
    for (const x of [-2.6, 2.6]) {
      const cord = mesh(new THREE.CylinderGeometry(0.015, 0.015, 3, 6), toyMat('#ffffff', 'matte'), false, false);
      cord.position.set(x, 5.3, -1.2);
      const shade = mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toyMat(x < 0 ? '#7fd8ff' : '#ffd166'), false, false);
      shade.position.set(x, 3.85, -1.2);
      const bulb = mesh(new THREE.SphereGeometry(0.16, 16, 10), toyMat('#fff8e0', 'emissive'), false, false);
      bulb.position.set(x, 3.8, -1.2);
      room.add(cord, shade, bulb);
    }
    // little window with sky
    const frame = mesh(roundedBox(3.2, 2.2, 0.2, 0.1), toyMat('#ffffff', 'satin'), false, false);
    frame.position.set(-5.6, 3.6, -3.9);
    const glass = mesh(new THREE.PlaneGeometry(2.8, 1.8), new THREE.MeshBasicMaterial({ map: gradientTexture('#7fd0ff', '#d8f3ff') }), false, false);
    glass.position.set(-5.6, 3.6, -3.78);
    room.add(wall, wains, floor, top, apron, shelfBoard, frame, glass);
    this.scene.add(room);
  }

  private refreshShelf(): void {
    this.shelf.clear();
    const list = store.profile.creations.slice(0, 10);
    list.forEach((c, i) => {
      const m = buildCreationMesh(c, 0.42);
      m.position.set(-3.15 + i * 0.7, 1.7, -3.45);
      m.rotation.y = (Math.random() - 0.5) * 0.5;
      this.shelf.add(m);
    });
  }

  enter(params?: { station?: StationId }): void {
    this.refreshShelf();
    this.onExit(bus.on('creationSaved', () => this.refreshShelf()));
    const id = params?.station ?? this.activeId;
    this.active = null;
    this.switchTo(id);
    this.setTab(id);
    const c = scenes.canvas;
    const pointers = new Set<number>();
    this.listen(c, 'pointerdown', (e) => {
      pointers.add(e.pointerId);
      try {
        c.setPointerCapture(e.pointerId);
      } catch { /* ignore */ }
      this.active?.pointerDown(this.toPointer(e));
    });
    this.listen(c, 'pointermove', (e) => {
      if (!pointers.has(e.pointerId) && e.pointerType !== 'mouse') return;
      this.active?.pointerMove(this.toPointer(e));
    });
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      this.active?.pointerUp(this.toPointer(e));
    };
    this.listen(c, 'pointerup', up);
    this.listen(c, 'pointercancel', up);
  }

  exit(): void {
    this.active?.exit();
  }

  private toPointer(e: PointerEvent): WPointer {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    return {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ndc,
      ray: this.ray.ray.clone(),
      pressure: e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5,
      type: e.pointerType,
    };
  }

  private switchTo(id: StationId): void {
    if (this.active?.id === id) return;
    if (this.active) {
      this.active.exit();
      this.active.root.visible = false;
    }
    this.activeId = id;
    const s = this.stations.get(id)!;
    this.active = s;
    s.root.visible = true;
    this.stationUi.replaceChildren(s.ui);
    s.enter();
  }

  private camLookY = 0.62;
  private camDist = 6.3;

  update(dt: number, t: number): void {
    this.active?.update(dt, t);
    this.updateCamera(dt);
  }

  /** Ease the camera toward the active station's framing (or the default). */
  private updateCamera(dt: number, snap = false): void {
    const v = this.active?.view?.() ?? { lookY: 0.62, dist: 6.3 };
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    // keep the same table width in view on narrower screens (portrait iPad = ~0.7)
    const fit = Math.pow(Math.max(1, 1.44 / aspect), 0.9);
    const k = snap ? 1 : 1 - Math.exp(-4 * dt);
    this.camLookY += (v.lookY - this.camLookY) * k;
    this.camDist += (v.dist * fit - this.camDist) * k;
    const d = this.camDist;
    this.camera.position.set(0, this.camLookY + d * 0.52, d);
    this.camera.lookAt(0, this.camLookY, 0);
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
    this.updateCamera(0, true);
  }

  resetStation(): void {
    this.active?.reset();
  }

  debugInfo(): Record<string, string | number> {
    return { station: this.activeId, ...(this.active?.debugInfo?.() ?? {}) };
  }
}
