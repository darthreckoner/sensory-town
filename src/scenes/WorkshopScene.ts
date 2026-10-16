// The Studio: a dark creator studio (TikTok/Coverstar ASMR vibe) with three
// stations — a ring light reflects in every glossy object, LED strips glow,
// a phone on a tripod is "recording".
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { studioLights } from '../art/env';
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
    studioLights(this.scene, { shadowSize: 4.5, target: new THREE.Vector3(0, 0, 0) });
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
    button(this.ui, { icon: '🚪', label: 'Exit', cls: 'tr' }, () => void scenes.go('town', { from: 'workshop' }));
    this.stationUi = el('div', '', this.ui) as HTMLDivElement;
    this.ui.classList.add('ws'); // v3 phone: scopes the Studio's compact strips / drawer in style.css
    this.ui.dataset.st = this.activeId;
  }

  private buildRoom(): void {
    const room = new THREE.Group();
    // dark back wall + acoustic foam panels (the classic creator-studio look)
    const wall = mesh(new THREE.PlaneGeometry(40, 18), toyMat('#17151f', 'matte'), false, true);
    wall.position.set(0, 4, -4.2);
    room.add(wall);
    const foamGeo = roundedBox(0.95, 0.95, 0.18, 0.04);
    const foamMats = [toyMat('#211d2c', 'matte'), toyMat('#1c1926', 'matte')];
    const foam = new THREE.InstancedMesh(foamGeo, foamMats[0], 18 * 6);
    const dummy = new THREE.Object3D();
    let fi = 0;
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 18; c++) {
        dummy.position.set(-8.5 + c * 1.0, 0.4 + r * 1.0, -4.1);
        dummy.rotation.set(0, 0, (r + c) % 2 ? 0 : Math.PI / 2);
        dummy.updateMatrix();
        foam.setMatrixAt(fi++, dummy.matrix);
      }
    foam.receiveShadow = true;
    room.add(foam);
    // floor
    const floor = mesh(new THREE.PlaneGeometry(40, 24), toyMat('#0f0d15', 'matte'), false, true);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    room.add(floor);
    // desk: dark walnut top with a black edge + a cutting mat under the work area
    const top = mesh(roundedBox(10, 0.3, 5, 0.04), new THREE.MeshPhysicalMaterial({ color: '#2a2027', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 }), false, true);
    top.position.set(0, this.tableY - 0.15, 0);
    const edge = mesh(roundedBox(10.02, 0.08, 5.02, 0.02), toyMat('#0d0b12', 'satin'), false, false);
    edge.position.set(0, this.tableY - 0.33, 0);
    const mat = mesh(new THREE.PlaneGeometry(6.4, 3.8), new THREE.MeshStandardMaterial({ map: this.matTexture(), roughness: 0.85 }), false, true);
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, this.tableY + 0.002, 0.25);
    room.add(top, edge, mat);
    // LED strips: under the desk edge (pink) and along the wall (violet → cyan)
    const led = (color: string, w: number, x: number, y: number, z: number) => {
      const m = mesh(roundedBox(w, 0.06, 0.06, 0.02), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, toneMapped: false }), false, false);
      m.position.set(x, y, z);
      room.add(m);
    };
    led('#ff2e88', 9.8, 0, this.tableY - 0.36, 2.48);
    led('#7c4dff', 20, 0, 6.6, -4.0);
    led('#00d4ff', 20, 0, -0.9, -4.0);
    // neon sign on the wall
    const sign = mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: this.neonTexture(store.profile?.name ?? 'MY'), transparent: true, toneMapped: false }), false, false);
    sign.position.set(0, 4.6, -4.0);
    room.add(sign);
    this.neonSign = sign;
    // floating shelf for saved creations, with an LED underglow
    const shelfBoard = mesh(roundedBox(7.6, 0.12, 0.9, 0.03), toyMat('#2a2027', 'satin'));
    shelfBoard.position.set(0, 1.62, -3.55);
    room.add(shelfBoard);
    led('#ff2e88', 7.4, 0, 1.54, -3.15);
    // phone on a tripod, "recording" the desk
    const tripod = new THREE.Group();
    const legMat = toyMat('#15131c', 'metal');
    for (let i = 0; i < 3; i++) {
      const leg = mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 6), legMat, true, false);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.28, 0.7, Math.sin(a) * 0.28);
      leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      tripod.add(leg);
    }
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), legMat, true, false);
    pole.position.y = 1.8;
    const phone = mesh(roundedBox(0.5, 0.95, 0.06, 0.06), toyMat('#101016', 'gloss'), true, false);
    phone.position.set(0, 2.45, 0);
    const screen = mesh(new THREE.PlaneGeometry(0.44, 0.86), new THREE.MeshBasicMaterial({ map: this.recTexture(), toneMapped: false }), false, false);
    screen.position.set(0, 2.45, 0.035);
    tripod.add(pole, phone, screen);
    tripod.position.set(-4.3, this.tableY, 1.1);
    tripod.rotation.y = 0.55;
    tripod.scale.setScalar(0.85);
    room.add(tripod);
    this.recScreen = screen;
    this.scene.add(room);
  }

  private neonSign: THREE.Mesh | null = null;
  private recScreen: THREE.Mesh | null = null;

  /** Dark self-healing cutting mat with a faint grid (the ASMR desk classic). */
  private matTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 304;
    const g = c.getContext('2d')!;
    g.fillStyle = '#23302d';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(180, 255, 220, 0.14)';
    g.lineWidth = 1;
    for (let x = 0; x <= c.width; x += 16) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, c.height);
      g.stroke();
    }
    for (let y = 0; y <= c.height; y += 16) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(c.width, y + 0.5);
      g.stroke();
    }
    g.strokeStyle = 'rgba(180, 255, 220, 0.3)';
    g.lineWidth = 2;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /** "<NAME> STUDIO" in pink neon tubes. */
  private neonTexture(name: string): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const g = c.getContext('2d')!;
    const text = `${name.toUpperCase()}'S STUDIO`;
    g.font = '900 120px -apple-system, "SF Pro Display", "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 120;
    while (g.measureText(text).width > 960 && size > 50) {
      size -= 6;
      g.font = `900 ${size}px -apple-system, "SF Pro Display", "Segoe UI", sans-serif`;
    }
    for (const [blur, color] of [[40, '#ff2e88'], [18, '#ff5aa5'], [0, '#ffe3f0']] as const) {
      g.shadowBlur = blur;
      g.shadowColor = '#ff2e88';
      g.fillStyle = color;
      g.fillText(text, 512, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Phone screen: a dark viewfinder with a red REC dot. */
  private recTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 248;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 248);
    grd.addColorStop(0, '#2a2238');
    grd.addColorStop(1, '#120f1a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 248);
    g.fillStyle = '#ff3355';
    g.beginPath();
    g.arc(26, 26, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '800 20px -apple-system, "Segoe UI", sans-serif';
    g.fillText('REC', 42, 33);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 3;
    g.strokeRect(20, 70, 88, 110);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private refreshShelf(): void {
    this.shelf.clear();
    const list = store.profile.creations.slice(0, 10);
    list.forEach((c, i) => {
      const m = buildCreationMesh(c, 0.42);
      m.position.set(-3.15 + i * 0.7, 1.68, -3.5);
      m.rotation.y = (Math.random() - 0.5) * 0.5;
      this.shelf.add(m);
    });
  }

  enter(params?: { station?: StationId }): void {
    this.refreshShelf();
    if (this.neonSign) {
      const m = this.neonSign.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = this.neonTexture(store.profile.name);
      m.needsUpdate = true;
    }
    this.onExit(bus.on('creationSaved', () => this.refreshShelf()));
    const id = params?.station ?? this.activeId;
    // hide every station first — the last visit may have left a different one visible
    for (const st of this.stations.values()) st.root.visible = false;
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
    this.ui.dataset.st = id;
    this.freeT = 0; // re-measure the free area right away
    this.zoomK = 1;
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
    if (this.recScreen) this.recScreen.visible = Math.sin(t * 4) > -0.6;
    this.updateCamera(dt);
    this.tickFree(dt);
  }

  // ── v3 phone: keep the toy in the free area between the side strips / above the bottom drawer ──────────
  private shiftX = 0;
  private shiftY = 0;
  private wantX = 0;
  private wantY = 0;
  private freeT = 0;
  private zoomK = 1;
  private scratch = new THREE.PerspectiveCamera();
  private safe = { t: 0, r: 0, b: 0, l: 0 };

  /** Every size gets the measured framing: it only pulls back / shifts when the toy would run into a panel. */
  private isPhone(): { land: boolean; phone: boolean } | null {
    const W = window.innerWidth, H = window.innerHeight;
    if (H < 520 && W > H) return { land: true, phone: true };
    if (W < 560 && H > W) return { land: false, phone: true };
    // tablets and desktop windows: panels stay at the sides, the toy (and the wax pot) is kept clear of them and of the bottom bar
    return { land: W > H, phone: false };
  }

  /** The safe-area insets in CSS px (the tokens are env() values: read them through a probe element). */
  private readSafe(): void {
    const sp = document.createElement('div');
    sp.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l)';
    document.body.appendChild(sp);
    const st = getComputedStyle(sp);
    this.safe = { t: parseFloat(st.paddingTop) || 0, r: parseFloat(st.paddingRight) || 0, b: parseFloat(st.paddingBottom) || 0, l: parseFloat(st.paddingLeft) || 0 };
    sp.remove();
  }

  /** Measure what the panels leave free (from the DOM) and ease the picture toward the middle of it. */
  private tickFree(dt: number): void {
    this.freeT -= dt;
    if (this.freeT <= 0) {
      this.freeT = 0.12;
      this.measureFree();
    }
    const k = 1 - Math.exp(-dt * 6);
    this.shiftX += (this.wantX - this.shiftX) * k;
    this.shiftY += (this.wantY - this.shiftY) * k;
    if (Math.abs(this.wantX - this.shiftX) < 0.05) this.shiftX = this.wantX;
    if (Math.abs(this.wantY - this.shiftY) < 0.05) this.shiftY = this.wantY;
    this.applyShift();
  }

  private measureFree(): void {
    const ph = this.isPhone();
    if (!ph) {
      this.wantX = this.wantY = 0;
      this.zoomK = 1;
      return;
    }
    this.readSafe();
    const W = window.innerWidth, H = window.innerHeight;
    let l = this.safe.l + 8, r = W - this.safe.r - 8, t = this.safe.t + 8, b = H - this.safe.b - 8;
    const q = (e: Element) => {
      const rc = e.getBoundingClientRect();
      if (rc.width < 2 || rc.height < 2) return null;
      for (let n: Element | null = e; n && n !== this.ui.parentElement; n = n.parentElement) {
        const st = getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden') return null;
      }
      return rc;
    };
    const blocks = this.ui.querySelectorAll('.panel, .tr, .br, .bc, .tc, .wax-actions, .wax-reset, .slime-left, .slime-adds, .slime-colors, .wax-hint');
    blocks.forEach((e) => {
      if (e.parentElement?.closest('.panel') && !e.classList.contains('panel')) return;
      const rc = q(e);
      if (!rc) return;
      const cx = (rc.left + rc.right) / 2, cy = (rc.top + rc.bottom) / 2;
      if ((!ph.land && ph.phone) || rc.width > W * 0.5) {
        if (cy < H * 0.5) t = Math.max(t, rc.bottom + 6);
        else b = Math.min(b, rc.top - 6);
      } else if (cx < W * 0.34) l = Math.max(l, rc.right + 6);
      else if (cx > W * 0.66) r = Math.min(r, rc.left - 6);
      else if (cy < H * 0.5) t = Math.max(t, rc.bottom + 6);
      else b = Math.min(b, rc.top - 6);
    });
    const cx = (l + r) / 2, cy = (t + b) / 2;
    const sub = this.subjectRect();
    if (sub) {
      // zoom out until the toy fits the free area (never in past the station's own framing), then centre it there
      const need = Math.max(sub.h / Math.max(40, (b - t) * 0.94), sub.w / Math.max(40, (r - l) * 0.94));
      if (need > 1.03) this.zoomK = Math.min(2.2, this.zoomK * need);
      else if (need < 0.82 && this.zoomK > 1) this.zoomK = Math.max(1, this.zoomK * (need / 0.9));
      this.wantX = Math.max(-W * 0.35, Math.min(W * 0.35, cx - sub.cx));
      this.wantY = Math.max(-H * 0.35, Math.min(H * 0.35, cy - sub.cy));
    } else {
      this.wantX = Math.max(-W * 0.3, Math.min(W * 0.3, cx - W / 2));
      this.wantY = Math.max(-H * 0.3, Math.min(H * 0.3, cy - H / 2));
    }
  }

  /** Where the toy (plus the wax pot and jug while they show) is on screen right now, ignoring the view offset. */
  private subjectRect(): { cx: number; cy: number; w: number; h: number } | null {
    const st = this.active as any;
    if (!st) return null;
    const box = new THREE.Box3();
    let any = false;
    for (const o of [st.body?.root ?? st.blob ?? st.holder, st.pot, st.jug] as (THREE.Object3D | undefined)[]) {
      if (!o || !o.visible) continue;
      const b = new THREE.Box3().setFromObject(o);
      if (!b.isEmpty()) {
        box.union(b);
        any = true;
      }
    }
    if (!any) return null;
    const c = this.scratch;
    c.fov = this.camera.fov;
    c.aspect = this.camera.aspect;
    c.near = this.camera.near;
    c.far = this.camera.far;
    c.position.copy(this.camera.position);
    c.quaternion.copy(this.camera.quaternion);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
    const W = window.innerWidth, H = window.innerHeight;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(c);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    // (the box corners overshoot the soft shape: use ~86% of it)
    const w = (x1 - x0) * 0.86, h = (y1 - y0) * 0.86;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h };
  }

  /** Camera view offset: +shift moves the picture right / down (projection and picking stay consistent). */
  private applyShift(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const c = this.camera;
    if (this.shiftX === 0 && this.shiftY === 0) {
      if (c.view?.enabled) {
        c.clearViewOffset();
        c.updateProjectionMatrix();
      }
      return;
    }
    const v = c.view;
    if (v && v.enabled && v.offsetX === -this.shiftX && v.offsetY === -this.shiftY && v.fullWidth === w && v.fullHeight === h) return;
    c.setViewOffset(w, h, -this.shiftX, -this.shiftY, w, h);
  }

  /** Ease the camera toward the active station's framing (or the default). */
  private updateCamera(dt: number, snap = false): void {
    const v = this.active?.view?.() ?? { lookY: 0.62, dist: 6.3 };
    let aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (!Number.isFinite(aspect) || aspect <= 0) aspect = 1.44; // 0×0 during rotation / hidden webviews
    // keep the same table width in view on narrower screens (portrait iPad = ~0.7)
    // (phones in portrait only need the toy, not the whole table: a gentler pull-back keeps it big)
    const fit = Math.pow(Math.max(1, 1.44 / aspect), window.innerWidth < 560 && aspect < 1 ? 0.55 : 0.9);
    // phones: zoomK pulls the camera back until the toy (and the pot + jug) fit the free area between the panels (see solveFree)
    const want = v.dist * fit * this.zoomK;
    const k = snap ? 1 : 1 - Math.exp(-4 * dt);
    this.camLookY += (v.lookY - this.camLookY) * k;
    this.camDist += (want - this.camDist) * k;
    if (!Number.isFinite(this.camDist) || !Number.isFinite(this.camLookY)) {
      this.camDist = want;
      this.camLookY = v.lookY;
    }
    const d = this.camDist;
    this.camera.position.set(0, this.camLookY + d * 0.52, d);
    this.camera.lookAt(0, this.camLookY, 0);
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
    this.updateCamera(0, true);
    // settle the phone framing at once (a few passes: zoom, then centre)
    for (let i = 0; i < 4; i++) {
      this.measureFree();
      this.updateCamera(0, true);
      this.camera.updateMatrixWorld(true);
    }
    this.freeT = 0.12;
    this.shiftX = this.wantX;
    this.shiftY = this.wantY;
    this.applyShift();
  }

  resetStation(): void {
    this.active?.reset();
  }

  debugInfo(): Record<string, string | number> {
    return { station: this.activeId, ...(this.active?.debugInfo?.() ?? {}) };
  }
}
