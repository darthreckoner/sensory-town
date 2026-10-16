// Launch screen: pick who's playing. Each kid's character poses on a pedestal.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { Character } from '../art/character';
import { addLights, gradientTexture } from '../art/env';
import { toyMat, mesh } from '../art/materials';
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

  init(): void {
    this.scene.background = gradientTexture('#ffd6e8', '#fff3e0', '#ffe4f0');
    addLights(this.scene, { shadowSize: 8, sunPos: new THREE.Vector3(3, 10, 8) });
    const floor = mesh(new THREE.CircleGeometry(30, 64), toyMat('#ffe9f2', 'matte'), false, true);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor, this.stage);
    // floating candy balls for depth
    const cols = ['#ff8fb1', '#7fd8ff', '#ffd166', '#c9a7ff', '#5fd3a5'];
    for (let i = 0; i < 14; i++) {
      const b = mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 24, 16), toyMat(cols[i % cols.length]), false, false);
      const a = (i / 14) * Math.PI * 2;
      b.position.set(Math.cos(a) * (9 + Math.random() * 4), 1 + Math.random() * 5, -6 - Math.random() * 6);
      b.userData.bob = Math.random() * 6;
      this.scene.add(b);
    }
    this.camera.position.set(0, 3.2, 9.5);
    this.camera.lookAt(0, 1.3, 0);
  }

  enter(): void {
    this.ui.innerHTML = '';
    const titleWrap = el('div', 'tc', this.ui);
    const title = el('div', 'title bob', titleWrap, 'Sensory Town');
    title.style.fontSize = '52px';
    title.style.whiteSpace = 'nowrap';
    const sub = el('div', 'label', this.ui, 'Who is playing?');
    Object.assign(sub.style, { position: 'absolute', top: 'calc(86px + var(--safe-t))', left: '50%', transform: 'translateX(-50%)', fontSize: '24px' });
    this.tagLayer = el('div', '', this.ui) as HTMLDivElement;
    if (store.data.profiles.length < tuning.app.maxProfiles) {
      button(this.ui, { icon: '➕', label: 'New Player', cls: 'br mint big' }, () => this.addPlayer());
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
      const pedColor = ['#ff8fb1', '#7fd8ff', '#ffd166', '#c9a7ff', '#5fd3a5', '#ffb38a'][i % 6];
      const pedestal = mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.35, 48), toyMat(pedColor));
      pedestal.position.y = 0.175;
      root.add(pedestal);
      const char = new Character(p.outfit);
      char.group.position.y = 0.35;
      char.group.scale.setScalar(1.3);
      char.group.rotation.y = (i - (ps.length - 1) / 2) * -0.15;
      root.add(char.group);
      this.stage.add(root);

      const tag = el('div', 'interactive', this.tagLayer) as HTMLDivElement;
      Object.assign(tag.style, { position: 'absolute', transform: 'translate(-50%, 0)', display: 'flex', gap: '8px', alignItems: 'center' });
      const nameBtn = button(tag, { label: p.name, cls: 'big', tap: 'big' }, () => this.pick(i));
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
      el('h2', '', body, '✏️ Your name');
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
      el('h2', '', body, '🌟 New player');
      const input = el('input', 'textin', body) as HTMLInputElement;
      input.placeholder = 'Name';
      input.maxLength = 14;
      const row = el('div', 'row', body);
      row.style.marginTop = '16px';
      row.style.justifyContent = 'flex-end';
      button(row, { label: 'Add', cls: 'mint big' }, () => {
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
