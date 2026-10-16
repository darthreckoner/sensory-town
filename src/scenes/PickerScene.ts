// ── v3 lobby ── The first screen: a bright Fortnite-style LOBBY. Every player stands on their own
// glowing pad on a sunny deck above the sea (the island is out there in the haze), in their
// current outfit, back bling and face, idling with personality and playing an emote from their
// wheel every so often; their eyes follow the camera. Tap a player: they cheer, the camera
// pushes in, and a big yellow PLAY button (plus LOCKER and STUDIO) appears.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { Character, EMOTES } from '../art/character';
import { GB } from '../art/characterKit';
import { goldenHour } from '../art/env';
import { makeBackBling } from '../art/gear/backBling';
import { disposeGear } from '../art/gear/gearKit';
import { el, button, sheet } from '../ui/ui';
import type { Profile } from '../core/model';

interface Slot {
  profile: Profile;
  root: THREE.Group;
  char: Character;
  tag: HTMLDivElement;
  ring: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
  beam: THREE.Mesh;
  glow: THREE.Mesh;
  bling: THREE.Object3D | null;
  color: THREE.Color;
  /** seconds until the next emote, and how long a looping one still plays (-1 = none running) */
  emoteIn: number;
  emoteLeft: number;
  lastEmote: string;
}

/** Emotes used in the lobby when a wheel has fewer than three valid ones. */
const LOBBY_EXTRAS = ['bounce', 'heart', 'sway', 'twirl', 'shuffle', 'cheer'];
const PAD_COLORS = ['#ff2e88', '#00d4ff', '#b6ff3b', '#9a5cff', '#ffc93c', '#ff8a3d'];
const DECK_R = 14;
/** Island relief: heights of the hill profile are squashed so a 26 m wide island is ~9 m tall. */
const HILL = 0.14;
const SEA_Y = -1.3;

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, mid);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PickerScene extends GameScene {
  readonly name = 'picker' as const;
  showMenuButton = false;
  private slots: Slot[] = [];
  private stage = new THREE.Group();
  private ray = new THREE.Raycaster();
  private picked: number | null = null;
  private leaving = false;
  private tagLayer!: HTMLDivElement;
  private actions: HTMLDivElement | null = null;
  private back: HTMLButtonElement | null = null;
  private addBtn: HTMLButtonElement | null = null;
  private subtitle!: HTMLDivElement;
  // backdrop animation
  private seaTex!: THREE.Texture;
  private clouds: THREE.Mesh[] = [];
  private gulls: { g: THREE.Group; wings: THREE.Mesh[]; r: number; y: number; speed: number; phase: number; cz: number }[] = [];
  private motes!: THREE.Points;
  private moteSeed: Float32Array = new Float32Array(0);
  // camera
  private camGoal = new THREE.Vector3();
  private lookGoal = new THREE.Vector3(0, 1.45, 0);
  private look = new THREE.Vector3(0, 1.45, 0);
  private baseCam = new THREE.Vector3(0, 2.3, 9);

  init(): void {
    // bright day: sky gradient, sun, sky reflections; a hazy fog so the island sits in the distance
    goldenHour(this.scene, { shadowSize: 9, fog: false });
    this.scene.fog = new THREE.Fog(tuning.art.fogColor, 70, 270);
    const key = new THREE.DirectionalLight('#fff3e2', 1.7); // faces: the sun is behind the lineup
    key.position.set(3, 5, 10);
    const rim = new THREE.DirectionalLight('#9fd0ff', 0.8);
    rim.position.set(-6, 3, -4);
    this.scene.add(key, rim, this.stage);
    this.buildSea();
    this.buildDeck();
    this.buildSun();
    this.buildIslands();
    this.buildClouds();
    this.buildGulls();
    this.buildMotes();
    this.camera.fov = 42;
    this.camera.near = 0.2;
    this.camera.far = 700;
    this.camera.position.copy(this.baseCam);
    this.camera.lookAt(this.look);
  }

  // ── backdrop ───────────────────────────────────────────────────────────────
  private buildSea(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(150, 215, 255, 0.55)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, w = 14 + Math.random() * 26;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w / 2, y - 5, x + w, y);
      g.stroke();
    }
    this.seaTex = new THREE.CanvasTexture(c);
    this.seaTex.wrapS = this.seaTex.wrapT = THREE.RepeatWrapping;
    this.seaTex.repeat.set(70, 70);
    this.seaTex.colorSpace = THREE.SRGBColorSpace;
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ color: tuning.art.waterMid, map: this.seaTex, roughness: 0.28, metalness: 0, envMapIntensity: 0.9 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    sea.receiveShadow = false;
    this.scene.add(sea);
    // soft white foam ring around the deck
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(DECK_R + 0.1, DECK_R + 2.2, 64),
      new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)'), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = SEA_Y + 0.02;
    this.scene.add(foam);
  }

  private buildDeck(): void {
    // colour map: a deep blue-violet stage; emissive map: the glowing ring + spoke pattern on black
    const col = document.createElement('canvas');
    const glo = document.createElement('canvas');
    col.width = col.height = glo.width = glo.height = 512;
    const g = col.getContext('2d')!;
    const gr = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    gr.addColorStop(0, '#6a45f0');
    gr.addColorStop(0.55, '#3b2fc4');
    gr.addColorStop(1, '#1d1a78');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    const e = glo.getContext('2d')!;
    e.fillStyle = '#000000';
    e.fillRect(0, 0, 512, 512);
    const ringAt = (r: number, color: string, w: number) => {
      e.strokeStyle = color;
      e.lineWidth = w;
      e.beginPath();
      e.arc(256, 256, r, 0, Math.PI * 2);
      e.stroke();
    };
    ringAt(236, '#35d6ff', 7);
    ringAt(190, '#ff3da6', 4);
    ringAt(146, '#35d6ff', 3);
    ringAt(104, '#a68bff', 3);
    ringAt(62, '#ff3da6', 3);
    e.strokeStyle = 'rgba(120, 190, 255, 0.55)';
    e.lineWidth = 2;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      e.beginPath();
      e.moveTo(256 + Math.cos(a) * 66, 256 + Math.sin(a) * 66);
      e.lineTo(256 + Math.cos(a) * 232, 256 + Math.sin(a) * 232);
      e.stroke();
    }
    e.fillStyle = '#ffffff';
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, r = 190;
      e.beginPath();
      e.arc(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 3.2, 0, Math.PI * 2);
      e.fill();
    }
    const tex = new THREE.CanvasTexture(col);
    tex.colorSpace = THREE.SRGBColorSpace;
    const glowTex = new THREE.CanvasTexture(glo);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(DECK_R, DECK_R * 1.02, 0.6, 72),
      [
        new THREE.MeshPhysicalMaterial({ color: '#2a21a8', roughness: 0.4, clearcoat: 0.5 }), // side
        new THREE.MeshPhysicalMaterial({ map: tex, emissive: '#ffffff', emissiveMap: glowTex, emissiveIntensity: 1.25, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }), // top
        new THREE.MeshPhysicalMaterial({ color: '#15125a', roughness: 0.6 }), // bottom
      ],
    );
    deck.position.y = -0.3;
    deck.receiveShadow = true;
    this.scene.add(deck);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DECK_R, 0.11, 8, 120), new THREE.MeshStandardMaterial({ color: '#ffe53b', emissive: '#ffd200', emissiveIntensity: 1.3, toneMapped: false }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.01;
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(DECK_R - 0.55, 0.045, 8, 120), new THREE.MeshStandardMaterial({ color: '#35d6ff', emissive: '#35d6ff', emissiveIntensity: 1.5, toneMapped: false }));
    rim2.rotation.x = Math.PI / 2;
    rim2.position.y = 0.012;
    this.scene.add(rim, rim2);
  }

  private buildSun(): void {
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,225,1)', 'rgba(255,236,170,0.55)'), color: '#fff3c8', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sun.position.set(-70, 62, -260);
    sun.scale.setScalar(150);
    this.scene.add(sun);
  }

  /** Distant islands: a low-poly lathe hill (vertex-colored by height) plus merged houses and palms. */
  private buildIslands(): void {
    const lathe = (): THREE.BufferGeometry => {
      const prof: [number, number][] = ([[0, 2.4], [0.1, 2.25], [0.24, 1.75], [0.42, 1.2], [0.6, 0.78], [0.76, 0.42], [0.88, 0.2], [0.97, 0.06], [1.0, 0], [1.06, -0.5], [1.2, -1.4]] as [number, number][]).map(([r, y]) => [r, y * HILL]);
      const g = new THREE.LatheGeometry(prof.reverse().map(([r, y]) => new THREE.Vector2(r, y)), 14); // bottom → top: outward faces
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      const rock = new THREE.Color('#aeb4c8'), grass = new THREE.Color('#58c468'), light = new THREE.Color('#8fdc6a'), sand = new THREE.Color('#f5dfa4'), wet = new THREE.Color('#d9bf86');
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / HILL;
        if (y > 1.75) c.copy(rock).lerp(grass, Math.max(0, (2.1 - y) / 0.4));
        else if (y > 0.7) c.copy(grass).lerp(light, (1.75 - y) / 1.05);
        else if (y > 0.18) c.copy(light).lerp(sand, (0.7 - y) / 0.52);
        else if (y > 0) c.copy(sand);
        else c.copy(wet);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    const details = (seed: number): THREE.BufferGeometry => {
      const b = new GB(true, true);
      let s = seed;
      const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const roofs = ['#ff5a7a', '#ffb02e', '#35a8ff', '#a06bff', '#ff8a3d'];
      // little houses on the slope
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, r = 0.34 + rnd() * 0.3, y = (1.4 - r * 1.1) * HILL;
        const x = Math.cos(a) * r * 1, z = Math.sin(a) * r * 1;
        const w = 0.16 + rnd() * 0.08;
        b.add(new THREE.BoxGeometry(1, 1, 1), { p: [x, y + w * 0.5, z], s: [w, w, w * 1.1], r: [0, rnd() * 3, 0], c: '#fbf2e2' });
        b.spk([x, y + w, z], [0, 1, 0], w * 0.75, w * 0.78, roofs[i % roofs.length]);
      }
      // palms near the beach
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2, r = 0.78 + rnd() * 0.16;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.26 + rnd() * 0.14, lean = (rnd() - 0.5) * 0.08;
        b.seg([x, 0.004, z], [x + lean, h, z], 0.014, '#8b5a2b');
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2 + rnd();
          b.e([x + lean + Math.cos(ang) * 0.05, h + 0.012, z + Math.sin(ang) * 0.05], [0.07, 0.012, 0.022], [0, -ang, 0.3], '#2fae52');
        }
      }
      // a striped lighthouse on the peak
      const top = 2.3 * HILL;
      b.seg([0, top, 0], [0, top + 0.42, 0], 0.06, '#ffffff');
      b.seg([0, top + 0.14, 0], [0, top + 0.21, 0], 0.062, '#ff4b5c');
      b.seg([0, top + 0.3, 0], [0, top + 0.37, 0], 0.062, '#ff4b5c');
      b.e([0, top + 0.47, 0], 0.07, undefined, '#ffe14d');
      return b.build();
    };
    const land = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const place = (x: number, z: number, scale: number, seed: number, rot: number) => {
      const grp = new THREE.Group();
      const hill = new THREE.Mesh(lathe(), land);
      const det = new THREE.Mesh(details(seed), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
      grp.add(hill, det);
      grp.position.set(x, SEA_Y + 0.05, z);
      grp.scale.setScalar(scale);
      grp.rotation.y = rot;
      this.scene.add(grp);
    };
    place(-34, -105, 26, 11, 0.4);
    place(48, -92, 15, 23, 2.1);
    place(8, -190, 38, 5, 1.0); // far, hazy
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#7fa5d6', emissiveIntensity: 0.3 });
    for (let i = 0; i < 12; i++) {
      const puffs: THREE.BufferGeometry[] = [];
      const n = 4 + (i % 3);
      for (let k = 0; k < n; k++) {
        const g = new THREE.SphereGeometry(1, 10, 7);
        const sz = 1.1 + Math.random() * 0.9;
        g.scale(sz * 1.3, sz * 0.8, sz);
        g.translate((k - (n - 1) / 2) * 1.5 + Math.random() * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
        puffs.push(g);
      }
      const cloud = new THREE.Mesh(mergeGeometries(puffs, false), mat);
      const s = 5 + Math.random() * 7;
      cloud.scale.setScalar(s);
      cloud.position.set((Math.random() - 0.5) * 360, 18 + Math.random() * 38, -80 - Math.random() * 150);
      cloud.userData.speed = 0.5 + Math.random() * 1.2;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  private buildGulls(): void {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.1, 0.9, 0.06, -0.05, 0, 0, 0.1], 3));
    wingGeo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const wings = [1, -1].map((s) => {
        const w = new THREE.Mesh(wingGeo, mat);
        w.scale.x = s;
        g.add(w);
        return w;
      });
      g.scale.setScalar(1.4);
      this.scene.add(g);
      this.gulls.push({ g, wings, r: 16 + Math.random() * 20, y: 5 + Math.random() * 6, speed: 0.16 + Math.random() * 0.12, phase: Math.random() * 6, cz: -34 - Math.random() * 12 });
    }
  }

  private buildMotes(): void {
    const n = 90;
    this.moteSeed = new Float32Array(n * 4);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cols = ['#ffe14d', '#7fe0ff', '#ff9ad0', '#ffffff', '#c9a6ff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      this.moteSeed[i * 4] = (Math.random() - 0.5) * 18; // x
      this.moteSeed[i * 4 + 1] = Math.random() * 6; // y phase
      this.moteSeed[i * 4 + 2] = -3 + Math.random() * 7; // z
      this.moteSeed[i * 4 + 3] = 0.25 + Math.random() * 0.5; // speed
      const c = cols[i % cols.length];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────
  enter(): void {
    this.picked = null;
    this.leaving = false;
    this.buildUi();
    this.listen(scenes.canvas, 'pointerdown', (e) => this.onTap(e));
    this.camera.position.copy(this.baseCam);
    this.fit();
    this.camera.position.copy(this.camGoal);
    this.look.copy(this.lookGoal);
  }

  exit(): void {
    this.clearSlots();
    this.actions = null;
    this.back = null;
  }

  /** (Re)build the DOM overlay and the lineup. */
  private buildUi(): void {
    this.ui.innerHTML = '';
    const titleWrap = el('div', 'tc', this.ui);
    const title = el('div', 'title', titleWrap, 'SENSORY <span class="hl">TOWN</span>');
    title.style.fontSize = '54px';
    title.style.whiteSpace = 'nowrap';
    title.style.letterSpacing = '2px';
    this.subtitle = el('div', 'label lb-sub', this.ui, 'Tap your player') as HTMLDivElement;
    this.tagLayer = el('div', '', this.ui) as HTMLDivElement;
    this.addBtn = null;
    if (store.data.profiles.length < tuning.app.maxProfiles) {
      this.addBtn = button(this.ui, { icon: '＋', label: 'New player', cls: 'br big' }, () => this.addPlayer());
    }
    this.buildSlots();
  }

  private clearSlots(): void {
    for (const s of this.slots) {
      this.stage.remove(s.root);
      if (s.bling) {
        s.char.setBackBling(null);
        disposeGear(s.bling);
      }
      s.char.dispose?.(); // skinned characters own their merged GPU buffers
      s.tag.remove();
      s.ringMat.dispose();
    }
    this.slots = [];
    this.actions?.remove();
    this.back?.remove();
    this.actions = null;
    this.back = null;
  }

  /** The emotes a player may show in the lobby: their wheel's valid ids, padded so it is never boring. */
  private emoteChoices(p: Profile): string[] {
    const valid = (p.locker?.emotes ?? []).filter((id) => EMOTES.some((e) => e.id === id));
    const out = [...valid];
    for (const x of LOBBY_EXTRAS) if (out.length < 4 && !out.includes(x)) out.push(x);
    return out;
  }

  private buildSlots(): void {
    this.clearSlots();
    const ps = store.data.profiles;
    ps.forEach((p, i) => {
      const root = new THREE.Group();
      const color = new THREE.Color(PAD_COLORS[i % PAD_COLORS.length]);
      // the pad: a glossy white disc, a glowing ring, a soft beam and a floor glow
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.14, 48), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1 }));
      base.position.y = 0.07;
      base.receiveShadow = true;
      const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.045, 8, 64), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.15;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.025;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 3.4, 40, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
      );
      beam.position.y = 1.85;
      root.add(base, ring, glow, beam);

      const char = new Character(p.outfit);
      char.group.position.y = 0.14;
      char.group.scale.setScalar(1.22);
      char.lookAt(this.camera.position); // eyes (and head) follow the camera
      let bling: THREE.Object3D | null = null;
      const bid = p.locker?.backBling;
      if (bid) {
        try {
          bling = makeBackBling(bid);
          char.setBackBling(bling);
        } catch {
          bling = null;
        }
      }
      root.add(char.group);
      this.stage.add(root);

      // name plate above the head: the name (tap = pick) and a pencil (rename)
      const tag = el('div', 'interactive lb-plate', this.tagLayer) as HTMLDivElement;
      const nameBtn = button(tag, { label: p.name, cls: 'big lb-name', tap: 'big' }, () => this.pick(i));
      nameBtn.style.minWidth = '130px';
      button(tag, { icon: '✏️', cls: 'round ghost lb-pencil' }, () => this.rename(p));
      this.slots.push({ profile: p, root, char, tag, ring, ringMat, beam, glow, bling, color, emoteIn: 2.5 + i * 1.7 + Math.random() * 3, emoteLeft: -1, lastEmote: '' });
    });
    this.applyLayout();
  }

  /**
   * Where each player stands: one gentle arc on wide screens, two staggered rows on tall ones
   * (so portrait iPads still show everyone at a good size). Returns the half width of the lineup.
   */
  private applyLayout(): { halfW: number; zFront: number } {
    const n = this.slots.length;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    let halfW = 0, zFront = 0;
    this.slots.forEach((s, i) => {
      let x: number, z: number;
      if (aspect >= 1.15 || n <= 2) {
        const gap = n <= 2 ? 3.4 : n <= 4 ? 2.7 : 2.25;
        const mid = i - (n - 1) / 2;
        x = mid * gap;
        z = -mid * mid * 0.09; // a gentle arc away from the camera
      } else {
        const cols = Math.ceil(n / 2);
        const row = i % 2, col = Math.floor(i / 2);
        x = (col - (cols - 1) / 2) * 2.2 + (row ? 1.1 : -0.0) - (cols > 1 || n > 2 ? 0.55 : 0);
        z = row ? -1.4 : 0.9;
      }
      s.root.position.set(x, 0, z);
      halfW = Math.max(halfW, Math.abs(x));
      zFront = Math.max(zFront, z);
    });
    return { halfW: halfW + 1.15, zFront };
  }

  // ── picking ────────────────────────────────────────────────────────────────
  private onTap(e: PointerEvent): void {
    if (this.picked !== null || this.leaving) return;
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
    if (this.picked !== null || this.leaving) return;
    this.picked = i;
    const s = this.slots[i];
    store.setActiveProfile(s.profile.id);
    bus.emit('profileSwitch', { profileId: s.profile.id });
    s.char.stopEmote();
    s.char.playEmote('cheer');
    s.emoteLeft = -1;
    s.emoteIn = 4;
    this.reframe();
    this.showActions(s);
  }

  /** Camera framing: all players, or pushed in on the picked one. */
  private reframe(): void {
    const s = this.picked !== null ? this.slots[this.picked] : null;
    if (s) {
      const p = s.root.position;
      this.camGoal.set(p.x * 0.7, 2.0, p.z + this.pushDist());
      this.lookGoal.set(p.x, 1.5, p.z);
    } else this.fit();
    this.subtitle.textContent = s ? `${s.profile.name} — ready?` : 'Tap your player';
    this.slots.forEach((o, k) => {
      const sel = this.picked === null || this.picked === k;
      o.tag.classList.toggle('off', this.picked !== null);
      o.ringMat.emissiveIntensity = sel ? 1.8 : 0.35;
      (o.beam.material as THREE.MeshBasicMaterial).opacity = sel ? 0.13 : 0.03;
      (o.glow.material as THREE.MeshBasicMaterial).opacity = sel ? 0.65 : 0.18;
    });
    this.addBtn?.classList.toggle('lb-hide', this.picked !== null);
  }

  private pushDist(): number {
    return window.innerWidth / window.innerHeight < 1.1 ? 5.6 : 4.3;
  }

  private showActions(s: Slot): void {
    this.actions?.remove();
    this.back?.remove();
    // bottom-right, Fortnite-style: LOCKER and STUDIO stacked above a big slanted yellow PLAY
    const wrap = el('div', 'lb-actions interactive', this.ui) as HTMLDivElement;
    this.actions = wrap;
    const col = el('div', 'lb-sub-col', wrap);
    button(col, { icon: '🎒', label: 'Locker', cls: 'blue lb-mini' }, () => this.go('dressup'));
    button(col, { icon: '🧪', label: 'Studio', cls: 'lilac lb-mini' }, () => this.go('workshop'));
    const play = button(wrap, { label: 'PLAY', cls: 'big primary lb-play', tap: 'big' }, () => this.go('town', { intro: 'bus' }));
    play.setAttribute('aria-label', `Play as ${s.profile.name}`);
    this.back = button(this.ui, { icon: '‹', cls: 'round ghost lb-back' }, () => this.unpick());
  }

  private unpick(): void {
    if (this.picked === null || this.leaving) return;
    const s = this.slots[this.picked];
    s.char.stopEmote();
    this.picked = null;
    this.actions?.remove();
    this.back?.remove();
    this.actions = null;
    this.back = null;
    this.reframe();
  }

  private go(scene: 'town' | 'dressup' | 'workshop', params?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    void scenes.go(scene, params);
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
        this.buildUi();
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
        this.picked = null;
        this.buildUi();
        this.fit();
      });
      setTimeout(() => input.focus(), 50);
    });
  }

  // ── frame update ───────────────────────────────────────────────────────────
  update(dt: number, t: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    this.slots.forEach((s, i) => {
      // face the camera a little, with a slow sway, then update the character (it handles blinks, eyes, idle)
      s.root.rotation.y = -s.root.position.x * 0.06 + Math.sin(t * 0.5 + i * 1.7) * 0.05;
      this.tickEmote(s, dt, i);
      s.char.update(dt, t);
      // pad glow breathes; the picked pad pulses brighter
      const sel = this.picked === i;
      s.ringMat.emissiveIntensity = (this.picked === null ? 1.45 : sel ? 1.9 : 0.35) + Math.sin(t * 2.4 + i) * (sel ? 0.45 : 0.18);
      // name plate above the head
      v.copy(s.char.headTop());
      v.project(this.camera);
      s.tag.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      s.tag.style.top = `${(-v.y * 0.5 + 0.5) * h - 4}px`;
    });
    this.updateBackdrop(dt, t);
    // camera glides to its goal (all players, or pushed in on the picked one)
    const k = 1 - Math.exp(-dt * 3.2);
    this.camera.position.lerp(this.camGoal, k);
    this.look.lerp(this.lookGoal, k);
    this.camera.lookAt(this.look);
  }

  /** Every so often a player plays an emote from their wheel (loops last a few seconds). */
  private tickEmote(s: Slot, dt: number, i: number): void {
    if (this.picked !== null && this.picked !== i) {
      if (s.char.emoting) s.char.stopEmote();
      return;
    }
    if (this.picked === i) {
      // the picked player keeps dancing happily while the buttons are up
      s.emoteIn -= dt;
      if (s.emoteIn <= 0 && !s.char.emoting) {
        s.char.playEmote(Math.random() < 0.5 ? 'bounce' : 'heart');
        s.emoteLeft = 3 + Math.random() * 2;
        s.emoteIn = 5 + Math.random() * 3;
      }
    } else {
      s.emoteIn -= dt;
      if (s.emoteIn <= 0 && !s.char.emoting) {
        const choices = this.emoteChoices(s.profile).filter((id) => id !== s.lastEmote);
        const id = choices[Math.floor(Math.random() * choices.length)] ?? 'wave';
        s.lastEmote = id;
        if (s.char.playEmote(id)) s.emoteLeft = 3.4 + Math.random() * 2.6;
        s.emoteIn = 7 + Math.random() * 7;
      }
    }
    if (s.emoteLeft > 0) {
      s.emoteLeft -= dt;
      if (s.emoteLeft <= 0) s.char.stopEmote();
    }
  }

  private updateBackdrop(dt: number, t: number): void {
    this.seaTex.offset.x += dt * 0.004;
    this.seaTex.offset.y += dt * 0.0025;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 190) c.position.x = -190;
    }
    for (const g of this.gulls) {
      const a = t * g.speed + g.phase;
      const x = Math.cos(a) * g.r, z = g.cz + Math.sin(a) * g.r * 0.6;
      g.g.position.set(x, g.y + Math.sin(a * 2.3) * 0.6, z);
      g.g.rotation.y = -a + Math.PI; // wingtips lead
      const f = Math.sin(t * 5 + g.phase * 3) * 0.4;
      g.wings[0].rotation.z = 0.15 + f;
      g.wings[1].rotation.z = -(0.15 + f);
    }
    // floating motes drift up around the deck
    const p = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const sx = this.moteSeed[i * 4], sy = this.moteSeed[i * 4 + 1], sz = this.moteSeed[i * 4 + 2], sp = this.moteSeed[i * 4 + 3];
      const y = ((sy + t * sp) % 6.5);
      p.setXYZ(i, sx + Math.sin(t * 0.7 + i) * 0.25, 0.3 + y, sz);
    }
    p.needsUpdate = true;
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  /** Camera distance so every player fits (wider lineups and portrait screens pull back). */
  private fit(): void {
    const { halfW, zFront } = this.applyLayout();
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const tv = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(halfW / (tv * aspect), 5.2) + zFront;
    this.camGoal.set(0, 2.3 + dist * 0.025, dist);
    this.lookGoal.set(0, 1.4 + dist * 0.01, 0);
    this.baseCam.copy(this.camGoal);
  }

  resize(w: number, h: number): void {
    super.resize(w, h);
    if (this.picked !== null) this.reframe();
    else this.fit();
  }
}
