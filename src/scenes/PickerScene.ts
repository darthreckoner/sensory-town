// Launch screen: pick who's playing. A dark lineup stage — each player stands
// on a glowing floor ring under a spotlight.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { Character } from '../art/character';
import { studioLights } from '../art/env';
import { toyMat, mesh, roundedBox } from '../art/materials';
import { el, button, sheet, bindTap } from '../ui/ui';
import type { Profile } from '../core/model';

interface Slot {
  profile: Profile;
  root: THREE.Group;
  char: Character;
  tag: HTMLDivElement;
  pedestal: THREE.Mesh;
}

export class PickerScene extends GameScene {
  readonly name = 'picker' as const;
  showMenuButton = false;
  private slots: Slot[] = [];
  private stage = new THREE.Group();
  private ray = new THREE.Raycaster();
  private picking = false;
  private tagLayer!: HTMLDivElement;

  private ringMats: THREE.MeshStandardMaterial[] = [];

  init(): void {
    studioLights(this.scene, { shadowSize: 8 });
    // glossy dark floor + back wall with neon strips
    const floor = mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshPhysicalMaterial({ color: '#16141f', roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 }), false, true);
    floor.rotation.x = -Math.PI / 2;
    const wall = mesh(new THREE.PlaneGeometry(60, 20), toyMat('#1b1826', 'matte'), false, true);
    wall.position.set(0, 9, -9);
    this.scene.add(floor, wall, this.stage);
    const neon = (color: string, y: number, w: number) => {
      const m = mesh(roundedBox(w, 0.12, 0.12, 0.05), toyMat(color, 'emissive'), false, false);
      m.position.set(0, y, -8.9);
      this.scene.add(m);
    };
    neon('#ff2e88', 2.2, 22);
    neon('#7c4dff', 6.2, 30);
    // soft bokeh lights far back
    const cols = ['#ff2e88', '#00d4ff', '#7c4dff', '#ffc93c'];
    for (let i = 0; i < 18; i++) {
      const b = mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 12, 8), toyMat(cols[i % cols.length], 'emissive'), false, false);
      b.position.set((Math.random() - 0.5) * 26, 0.8 + Math.random() * 7, -8.5 + Math.random() * 1.5);
      b.userData.bob = Math.random() * 6;
      this.scene.add(b);
    }
    this.camera.position.set(0, 3.2, 9.5);
    this.camera.lookAt(0, 1.3, 0);
  }

  enter(): void {
    this.ui.innerHTML = '';
    const titleWrap = el('div', 'tc', this.ui);
    const title = el('div', 'title', titleWrap, 'SENSORY <span class="hl">TOWN</span>');
    title.style.fontSize = '54px';
    title.style.whiteSpace = 'nowrap';
    title.style.letterSpacing = '2px';
    const sub = el('div', 'label', this.ui, 'Choose your player');
    Object.assign(sub.style, { position: 'absolute', top: 'calc(92px + var(--safe-t))', left: '50%', transform: 'translateX(-50%)', fontSize: '16px' });
    this.tagLayer = el('div', '', this.ui) as HTMLDivElement;
    if (store.data.profiles.length < tuning.app.maxProfiles) {
      button(this.ui, { icon: '＋', label: 'New player', cls: 'br big' }, () => this.addPlayer());
    }
    this.buildSlots();
    this.picking = false;
    this.listen(scenes.canvas, 'pointerdown', (e) => this.onTap(e));
  }

  exit(): void {
    this.clearSlots();
  }

  private clearSlots(): void {
    for (const s of this.slots) {
      this.stage.remove(s.root);
      s.tag.remove();
    }
    this.slots = [];
  }

  private buildSlots(): void {
    this.clearSlots();
    const ps = store.data.profiles;
    const gap = ps.length <= 2 ? 3.6 : ps.length <= 4 ? 2.9 : 2.3;
    ps.forEach((p, i) => {
      const root = new THREE.Group();
      root.position.x = (i - (ps.length - 1) / 2) * gap;
      const ringColor = ['#ff2e88', '#00d4ff', '#b6ff3b', '#7c4dff', '#ffc93c', '#ff8a3d'][i % 6];
      // glowing floor ring (the "spotlight" spot) + a dark plinth
      const plinth = mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.08, 48), new THREE.MeshPhysicalMaterial({ color: '#221f2e', roughness: 0.3, clearcoat: 1 }));
      plinth.position.y = 0.04;
      const ringMat = new THREE.MeshStandardMaterial({ color: ringColor, emissive: ringColor, emissiveIntensity: 1.4, toneMapped: false });
      this.ringMats.push(ringMat);
      const ring = mesh(new THREE.TorusGeometry(1.03, 0.035, 8, 64), ringMat, false, false);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.085;
      const pedestal = plinth;
      root.add(plinth, ring);
      const spot = new THREE.SpotLight('#ffffff', 30, 12, 0.42, 0.6, 1.5);
      spot.position.set(0, 7, 2.5);
      spot.target = plinth;
      root.add(spot);
      const char = new Character(p.outfit);
      char.group.position.y = 0.08;
      char.group.rotation.y = (i - (ps.length - 1) / 2) * -0.15;
      root.add(char.group);
      this.stage.add(root);

      const tag = el('div', 'interactive', this.tagLayer) as HTMLDivElement;
      Object.assign(tag.style, { position: 'absolute', transform: 'translate(-50%, 0)', display: 'flex', gap: '8px', alignItems: 'center' });
      const nameBtn = button(tag, { label: p.name, cls: 'big primary', tap: 'big' }, () => this.pick(i));
      nameBtn.style.minWidth = '150px';
      button(tag, { icon: '✏️', cls: 'round ghost' }, () => this.rename(p));
      this.slots.push({ profile: p, root, char, tag, pedestal });
    });
  }

  private onTap(e: PointerEvent): void {
    if (this.picking) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.slots.map((s) => s.root), true);
    if (!hits.length) return;
    const idx = this.slots.findIndex((s) => {
      let o: THREE.Object3D | null = hits[0].object;
      while (o) {
        if (o === s.root) return true;
        o = o.parent;
      }
      return false;
    });
    if (idx >= 0) {
      bus.emit('uiTap', { kind: 'big' });
      this.pick(idx);
    }
  }

  private pick(i: number): void {
    if (this.picking) return;
    this.picking = true;
    const s = this.slots[i];
    s.char.wave();
    s.char.hop();
    store.setActiveProfile(s.profile.id);
    bus.emit('profileSwitch', { profileId: s.profile.id });
    setTimeout(() => void scenes.go('dressup'), tuning.profiles.waveSeconds * 600);
  }

  private rename(p: Profile): void {
    sheet((body, close) => {
      el('h2', '', body, 'Your name');
      const input = el('input', 'textin', body) as HTMLInputElement;
      input.value = p.name;
      input.maxLength = 14;
      const row = el('div', 'row', body);
      row.style.marginTop = '16px';
      row.style.justifyContent = 'flex-end';
      button(row, { label: 'Save', cls: 'pink big' }, () => {
        const v = input.value.trim().slice(0, 14);
        if (v) store.update(() => (p.name = v));
        close();
        this.buildSlots();
      });
      setTimeout(() => input.focus(), 50);
    });
  }

  private addPlayer(): void {
    sheet((body, close) => {
      el('h2', '', body, 'New player');
      const input = el('input', 'textin', body) as HTMLInputElement;
      input.placeholder = 'Name';
      input.maxLength = 14;
      const row = el('div', 'row', body);
      row.style.marginTop = '16px';
      row.style.justifyContent = 'flex-end';
      button(row, { label: 'Add', cls: 'pink big' }, () => {
        const v = input.value.trim().slice(0, 14) || `Player ${store.data.profiles.length + 1}`;
        const np = store.addProfile(v);
        close();
        if (np) bus.emit('profileCreated', { profileId: np.id });
        this.enter();
      });
      setTimeout(() => input.focus(), 50);
    });
  }

  update(dt: number, t: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const s of this.slots) {
      s.char.update(dt, t);
      s.root.rotation.y = Math.sin(t * tuning.profiles.pickerSpin + s.root.position.x) * 0.25;
      v.set(0, -0.05, 1.2);
      s.root.localToWorld(v);
      v.project(this.camera);
      s.tag.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      s.tag.style.top = `${(-v.y * 0.5 + 0.5) * h + 6}px`;
    }
    this.scene.traverse((o) => {
      if (o.userData.bob !== undefined) o.position.y += Math.sin(t * 0.8 + o.userData.bob) * 0.003;
    });
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
    // fit more players on narrow screens
    const n = Math.max(2, store.data.profiles.length);
    this.camera.position.set(0, 2.9, 7.4 + Math.max(0, n - 2) * 1.6 + (w / h < 1.2 ? 4 : 0));
    this.camera.lookAt(0, 1.45, 0);
  }
}
