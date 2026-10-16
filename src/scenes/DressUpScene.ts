// The LOCKER (was the Style studio) — Fortnite-STYLE cosmetics, all original.
//
// A big turntable preview on a lobby stage (blue → purple backdrop, light rays, a platform whose ring
// glows in the rarity colour of whatever you just equipped, a warm face light so the face is always the
// best-lit thing on screen). Left: the slot tiles — Outfit, Back Bling, Glider, Contrail, Emotes,
// Ride Wrap and Custom. Right: rarity-framed item cards (common grey · uncommon green · rare blue ·
// epic purple · legendary orange-gold), locked ones show a padlock + "Find N more charms" and can be
// tried on before they're yours. Equipping animates the character (emote), sparkles in the rarity colour
// and autosaves. Drag the preview to spin it; pinch / wheel to zoom.
import * as THREE from 'three';
import { GameScene, scenes } from '../core/scene';
import { store } from '../core/store';
import { bus, v3, type OutfitSlot } from '../core/events';
import { tuning } from '../tuning';
import { Character, EMOTES as CHAR_EMOTES, MIN_ACCENT_GAP, OUTFIT_CATALOG, POSE_ORDER, colorGap, contrastColor, type CatalogSlot } from '../art/character';
import { gradientTexture, studioEnv } from '../art/env';
import { charmCount, charmTotal, charmsNeeded, nextReward, rewardFor } from '../core/unlocks';
import { el, button, bindTap, swatches, toast } from '../ui/ui';
import { InfoBanner, blingThumb, escapeHtml, gliderThumb, lockerCard, outfitThumb, rarityVars, rideThumb } from '../ui/lockerUI';
import type { Outfit, VehicleKind } from '../core/model';
import {
  BACK_BLINGS, CONTRAILS, EMOTES, EMOTE_SLOTS, GLIDERS, RARITY, RARITY_ORDER, RIDES, SKINS, WRAP_FINISHES,
  rarityRank, skinById, styleRarity, styleReward, type GearItem, type LockerSlot, type Rarity, type SkinDef,
} from '../art/gear/catalog';
import {
  clearEmote, equipMyStyle, equipSkin, getLocker, itemOwned, markCustom, owns, partRarity, resolveSkinOutfit, setBackBling, setContrail,
  setEmote, setGlider, setRide, setWrap, skinOwned, styleOwned, wrapOf,
} from '../art/gear/lockerState';
import { FACE_OPTIONS, randomFace, resolveFace } from '../art/characterFace';
import { faceOwned, faceTag, setFace } from '../art/gear/lockerState';
import { faceRewardOf, type FaceField } from '../art/gear/catalog';
import { makeBackBling } from '../art/gear/backBling';
import { makeGlider } from '../art/gear/gliders';
import { makeContrail, type Contrail } from '../art/gear/contrails';
import { makeRidePreview } from '../art/gear/rides';
import { disposeGear } from '../art/gear/gearKit';
import { thumbs } from '../art/gear/thumbs';

type CustomCat = CatalogSlot | 'skin' | 'face' | 'looks';
const CUSTOM_CATS: { id: CustomCat; icon: string; label: string }[] = [
  { id: 'hair', icon: '💇', label: 'Hair' },
  { id: 'top', icon: '👕', label: 'Top' },
  { id: 'bottom', icon: '👖', label: 'Bottom' },
  { id: 'shoes', icon: '👟', label: 'Shoes' },
  { id: 'accessory', icon: '🕶️', label: 'Extras' },
  { id: 'skin', icon: '🧑', label: 'Skin' },
  { id: 'face', icon: '😊', label: 'Face' },
  { id: 'looks', icon: '💾', label: 'Looks' },
];
const PART_SLOTS: CatalogSlot[] = ['hair', 'top', 'bottom', 'shoes', 'accessory'];

const SLOT_TABS: { id: LockerSlot; icon: string; label: string }[] = [
  { id: 'outfit', icon: '🧥', label: 'Outfit' },
  { id: 'backBling', icon: '🎒', label: 'Back Bling' },
  { id: 'glider', icon: '🪂', label: 'Glider' },
  { id: 'contrail', icon: '✨', label: 'Contrail' },
  { id: 'emote', icon: '💃', label: 'Emotes' },
  { id: 'wrap', icon: '🏎️', label: 'Ride Wrap' },
  { id: 'custom', icon: '🎨', label: 'Custom' },
];

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** An undo snapshot: what was worn + which preset it came from. */
interface Snap {
  outfit: Outfit;
  skin: string;
  style: number;
  custom?: Outfit;
}

export class DressUpScene extends GameScene {
  readonly name = 'dressup' as const;

  private char: Character | null = null;
  private stage = new THREE.Group(); // the static set
  private turn = new THREE.Group(); // everything that spins with the drag (player, showroom items)
  private ray = new THREE.Raycaster();

  // lobby look
  private ringMat!: THREE.MeshBasicMaterial;
  private ring2Mat!: THREE.MeshBasicMaterial;
  private glowMat!: THREE.MeshBasicMaterial;
  private rayMat!: THREE.MeshBasicMaterial;
  private rays = new THREE.Group();
  private sparkles!: THREE.Points;
  private sparkleSeed!: Float32Array;
  private faceLight!: THREE.SpotLight;
  private rarityNow = new THREE.Color(RARITY.common.color);
  private rarityTarget = new THREE.Color(RARITY.common.color);
  private pulse = 0;

  // gear shown on the stage
  private blingObj: THREE.Group | null = null;
  private blingId: string | null | undefined = undefined;
  private gliderObj: THREE.Group | null = null;
  private gliderId: string | null = null;
  private contrail: Contrail | null = null;
  private contrailId: string | null = null;
  private orbit = 0;
  private rideObj: THREE.Group | null = null;
  private rideKey = '';
  private wasContrail = false;
  /** the emote being previewed (so juice can play its tune): started / stopped events go out on the bus */
  private curEmote: { id: string; loop: boolean } | null = null;

  // view state
  private rot = 0;
  private rotGoal: number | null = null;
  private spinVel = 0;
  private dist = tuning.dressup.zoomDefault;
  private targetDist = tuning.dressup.zoomDefault;
  private lookY = tuning.dressup.lookYWide;
  private focusLook: number | null = null;
  private idle = 0;
  private spinSoundT = 0;
  private viewShift = 0;
  /** phone layouts: the camera backs off so the whole player fits the small preview area */
  private fitScale = 1;

  // pointer state
  private pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private pinchDist = 0;
  private downT = 0;
  private moved = 0;
  private lastMoveT = 0;

  // ui state
  private slot: LockerSlot = 'outfit';
  private customCat: CustomCat = 'hair';
  private slotTiles = new Map<LockerSlot, HTMLElement>();
  private panel!: HTMLDivElement;
  private setSwatch: ((c: string) => void) | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private flashEl: HTMLDivElement | null = null;
  private vfEl: HTMLDivElement | null = null;
  private chipEl: HTMLElement | null = null;
  private info: InfoBanner | null = null;
  private history: Snap[] = [];
  private timers: number[] = [];
  private poseIdx = 0;
  private poseLock = 0;
  private lookSel = 0;
  private nextOverwrite = 0;
  private emoteSlot = 0;
  private emoteIdx = 0;
  private wrapKind: VehicleKind = 'sports';
  /** a locked item the player is trying on (preview only, never saved) */
  private tryOn: { slot: LockerSlot; id: string; style?: number } | null = null;

  // ── Stage ────────────────────────────────────────────────────────────────
  init(): void {
    this.fxScale = 1.2;
    this.camera.fov = tuning.dressup.fov;
    this.camera.near = 0.1;
    this.camera.far = 90;
    this.buildLobby();
    this.scene.add(this.stage);
    this.stage.add(this.turn);
  }

  private glow(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildLobby(): void {
    const S = this.scene;
    const st = this.stage;
    const L = tuning.locker;
    // deep blue → purple backdrop with the lobby glow behind the player
    S.background = gradientTexture('#0a1480', '#8a3dff', '#3524cc');
    S.environment = studioEnv();
    S.environmentIntensity = 0.7;
    S.fog = null;
    S.add(new THREE.HemisphereLight('#aab8ff', '#4a2aa8', 0.85));
    const key = new THREE.DirectionalLight('#fff4ea', 2.0);
    key.position.set(2.6, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    const rimC = new THREE.DirectionalLight('#35d6ff', 1.3);
    rimC.position.set(-5, 3, -4);
    const rimP = new THREE.DirectionalLight('#c27cff', 1.2);
    rimP.position.set(5, 3, -4);
    S.add(key, key.target, rimC, rimP);
    // warm face fill (aimed at the head) + a soft hair rim from behind: the face is the best-lit thing on screen
    const F = L.faceLight;
    // (the character agent's spec: warm key at the camera side, cool rim from behind, both aimed at the head, no shadows;
    //  the face fill is the brightest light on the head — brighter than the coloured rims)
    this.faceLight = new THREE.SpotLight(F.color, F.intensity, F.range, F.angle, F.penumbra, 2);
    this.faceLight.position.set(F.x, F.y, F.z);
    this.faceLight.target.position.set(0, 1.62, 0);
    const R = L.coolRim;
    const coolRim = new THREE.SpotLight(R.color, R.intensity, 10, 0.45, 0.9, 2);
    coolRim.position.set(R.x, R.y, R.z);
    coolRim.target.position.set(0, 1.62, 0);
    const hairRim = new THREE.DirectionalLight('#ffe9d2', F.rim);
    hairRim.position.set(-1.5, 3.2, -3);
    S.add(this.faceLight, this.faceLight.target, coolRim, coolRim.target, hairRim);

    // soft stage floor that fades into the backdrop + a shadow catcher
    const floorTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
      gr.addColorStop(0, 'rgba(18,24,150,0.95)');
      gr.addColorStop(0.55, 'rgba(14,16,110,0.7)');
      gr.addColorStop(1, 'rgba(10,10,80,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 64), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.004;
    st.add(floor);
    const catcher = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.ShadowMaterial({ opacity: 0.38 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    st.add(catcher);

    // the platform: dark glossy disc, a ring that glows in the rarity colour, a glow decal
    const plat = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.8, 0.16, 72),
      new THREE.MeshPhysicalMaterial({ color: '#0b1470', roughness: 0.28, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.15 }),
    );
    plat.position.y = -0.08;
    plat.receiveShadow = true;
    st.add(plat);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.04, 10, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.004;
    st.add(ring);
    this.ring2Mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.55 });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.022, 8, 120), this.ring2Mat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.003;
    st.add(ring2);
    this.glowMat = new THREE.MeshBasicMaterial({ map: this.glow(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.7 });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), this.glowMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.006;
    pool.renderOrder = 2;
    st.add(pool);

    // light rays fanning out from behind the player
    const rc = document.createElement('canvas');
    rc.width = 32;
    rc.height = 256;
    const rg = rc.getContext('2d')!;
    const lin = rg.createLinearGradient(0, 256, 0, 0);
    // transparent at the hub (so no bright halo sits behind her head), bright a little way out, fading to nothing
    lin.addColorStop(0, 'rgba(255,255,255,0)');
    lin.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    lin.addColorStop(1, 'rgba(255,255,255,0)');
    rg.fillStyle = lin;
    rg.fillRect(0, 0, 32, 256);
    const side = rg.createLinearGradient(0, 0, 32, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.5, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    rg.globalCompositeOperation = 'destination-out';
    rg.fillStyle = side;
    rg.fillRect(0, 0, 32, 256);
    const rayTex = new THREE.CanvasTexture(rc);
    rayTex.colorSpace = THREE.SRGBColorSpace;
    this.rayMat = new THREE.MeshBasicMaterial({ map: rayTex, color: '#ffffff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.rays.position.set(0, 0.6, -5);
    for (let i = 0; i < L.rayCount; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = (i / L.rayCount) * TAU + (i % 2) * 0.08;
      const w = 0.7 + ((i * 37) % 10) * 0.12;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 22), this.rayMat);
      m.position.y = 11;
      piv.add(m);
      this.rays.add(piv);
    }
    st.add(this.rays);

    // floating sparkle dust
    const n = L.sparkleCount;
    this.sparkleSeed = new Float32Array(n * 4);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.sparkleSeed[i * 4] = Math.random() * TAU;
      this.sparkleSeed[i * 4 + 1] = 1.2 + Math.random() * 3.2;
      this.sparkleSeed[i * 4 + 2] = 0.1 + Math.random() * 0.3;
      this.sparkleSeed[i * 4 + 3] = Math.random();
      pos[i * 3] = Math.cos(this.sparkleSeed[i * 4]) * this.sparkleSeed[i * 4 + 1];
      pos[i * 3 + 1] = this.sparkleSeed[i * 4 + 3] * 5;
      pos[i * 3 + 2] = Math.sin(this.sparkleSeed[i * 4]) * this.sparkleSeed[i * 4 + 1] - 0.5;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkles = new THREE.Points(sg, new THREE.PointsMaterial({ map: this.glow(), color: '#ffffff', size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sparkles.frustumCulled = false;
    st.add(this.sparkles);
  }

  /** Make the stage glow in a rarity colour (it eases there). `bump` flashes the ring. */
  private setGlow(r: Rarity, bump = false): void {
    this.rarityTarget.set(RARITY[r].color);
    if (bump) this.pulse = 1;
  }

  // ── Scene lifecycle ──────────────────────────────────────────────────────
  enter(): void {
    this.ui.innerHTML = '';
    this.timers = [];
    this.tryOn = null;
    const prof = store.profile;
    // dev only: ?charms=N pretends N charms were found (to look at unlocked items), ?slot=glider opens that tab
    const dq = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
    const fake = dq ? Number(dq.get('charms')) : 0;
    if (fake > 0 && prof.charms.length < fake) store.update(() => { while (prof.charms.length < fake) prof.charms.push('dev' + prof.charms.length); });
    // wrap styles from older saves into the catalog
    const o = prof.outfit;
    let fixed = false;
    for (const s of PART_SLOTS) {
      const n = OUTFIT_CATALOG[s].length;
      const st = ((Math.floor(o[s].style) % n) + n) % n;
      if (st !== o[s].style) {
        o[s].style = st;
        fixed = true;
      }
    }
    if (fixed) store.update(() => undefined);
    const L = getLocker();
    if (!this.char) {
      this.char = new Character(o);
      this.turn.add(this.char.group);
    } else {
      this.char.setOutfit(o);
    }
    this.char.setGliding(false);
    this.char.setMove(0, true);
    this.blingId = undefined;
    this.history = [];
    this.rot = 0;
    this.rotGoal = null;
    this.spinVel = 0;
    this.idle = 0;
    this.slot = 'outfit';
    this.customCat = 'hair';
    this.lookSel = 0;
    this.emoteSlot = 0;
    this.wrapKind = L.ride;
    this.pointers.clear();
    this.dist = this.targetDist = tuning.locker.slotDist.outfit;
    this.lookY = tuning.locker.slotLookY.outfit;
    this.focusLook = null;
    this.setGlow(this.currentRarity('outfit'));
    this.rarityNow.copy(this.rarityTarget);
    this.syncStage();
    thumbs.gapMs = 35; // the Locker is calm: its pictures can come a little faster than in the world
    this.buildUI();
    this.listenInput();
    this.onExit(() => {
      thumbs.gapMs = 70;
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
      this.pointers.clear();
      this.endEmote('swap');
      this.char?.stopEmote();
      this.char?.setGliding(false);
      this.clearContrail();
      thumbs.dropQueued();
    });
    this.resize(window.innerWidth, window.innerHeight);
    const dslot = dq?.get('slot') as LockerSlot | null;
    if (dslot && SLOT_TABS.some((t) => t.id === dslot)) this.setSlot(dslot);
    this.later(420, () => {
      if (this.slot === 'outfit' || this.slot === 'custom') this.char?.playEmote('wave') || this.char?.wave();
    });
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  resetStation(): void {
    this.rot = 0;
    this.rotGoal = null;
    this.spinVel = 0;
    this.focusSlot();
  }

  debugInfo(): Record<string, string | number> {
    return { lockerSlot: this.slot, camDist: +this.dist.toFixed(2), rot: +this.rot.toFixed(2), charms: `${charmCount()}/${charmTotal()}` };
  }

  // ── What's on the stage ──────────────────────────────────────────────────
  /** Rarity of what is currently equipped in a slot (drives the tile + stage glow). */
  private currentRarity(slot: LockerSlot): Rarity {
    const L = getLocker();
    switch (slot) {
      case 'outfit': {
        const s = L.skin === 'custom' ? null : skinById(L.skin);
        return s ? styleRarity(s, L.skinStyle) : 'common';
      }
      case 'backBling': return BACK_BLINGS.find((i) => i.id === L.backBling)?.rarity ?? 'common';
      case 'glider': return GLIDERS.find((i) => i.id === L.glider)?.rarity ?? 'common';
      case 'contrail': return CONTRAILS.find((i) => i.id === L.contrail)?.rarity ?? 'common';
      case 'emote': return EMOTES.find((i) => i.id === L.emotes[0])?.rarity ?? 'common';
      case 'wrap': return RIDES.find((i) => i.id === L.ride)?.rarity ?? 'common';
      default: return 'common';
    }
  }

  /** Put the right gear on the stage for the current slot (+ any try-on). Cheap when nothing changed. */
  private syncStage(): void {
    const char = this.char;
    if (!char) return;
    const L = getLocker();
    const t = this.tryOn;
    this.setBling(t?.slot === 'backBling' ? t.id : L.backBling);
    const showGlider = this.slot === 'glider';
    char.setGliding(showGlider);
    this.setGlider(showGlider ? (t?.slot === 'glider' ? t.id : L.glider) : null);
    this.setContrail(this.slot === 'contrail' ? (t?.slot === 'contrail' ? t.id : L.contrail) : null);
    const showRide = this.slot === 'wrap';
    char.group.visible = !showRide;
    if (showRide) this.setRide(this.wrapKind);
    else this.clearRide();
    if (this.slot !== 'contrail' && this.wasContrail) {
      char.setMove(0, true);
      char.group.position.set(0, 0, 0);
      char.group.rotation.y = 0;
      this.wasContrail = false;
    }
  }

  private setBling(id: string | null): void {
    if (this.blingId === id || !this.char) return;
    this.blingId = id;
    this.char.setBackBling(null);
    if (this.blingObj) disposeGear(this.blingObj);
    this.blingObj = null;
    if (id) {
      this.blingObj = makeBackBling(id);
      this.char.setBackBling(this.blingObj);
    }
  }
  private setGlider(id: string | null): void {
    if (this.gliderId === id || !this.char) return;
    this.gliderId = id;
    if (this.gliderObj) {
      this.gliderObj.parent?.remove(this.gliderObj);
      disposeGear(this.gliderObj);
      this.gliderObj = null;
    }
    if (id) {
      this.gliderObj = makeGlider(id);
      this.char.gliderAnchor.add(this.gliderObj);
    }
  }
  private setContrail(id: string | null): void {
    if (this.contrailId === id) return;
    this.clearContrail();
    this.contrailId = id;
    if (id) {
      this.contrail = makeContrail(id);
      this.scene.add(this.contrail.object);
    }
  }
  private clearContrail(): void {
    if (this.contrail) {
      this.scene.remove(this.contrail.object);
      this.contrail.dispose();
      this.contrail = null;
    }
    this.contrailId = null;
  }
  private setRide(kind: VehicleKind): void {
    const w = wrapOf(kind);
    const key = `${kind}|${w.color}|${w.finish}`;
    if (key === this.rideKey && this.rideObj) return;
    this.clearRide();
    this.rideKey = key;
    this.rideObj = makeRidePreview(kind, w);
    this.turn.add(this.rideObj);
    this.frameRide();
  }
  /** Back the camera off to fit whatever ride is on the plinth (an ice-cream truck is taller than a hoverboard). */
  private frameRide(): void {
    if (!this.rideObj || this.slot !== 'wrap') return;
    const box = new THREE.Box3().setFromObject(this.rideObj);
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    this.targetDist = clamp(r * 3.4, 6.2, 13);
    this.focusLook = Math.max(0.8, box.getCenter(new THREE.Vector3()).y);
  }
  private clearRide(): void {
    if (!this.rideObj) return;
    this.turn.remove(this.rideObj);
    disposeGear(this.rideObj);
    this.rideObj = null;
    this.rideKey = '';
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  private buildUI(): void {
    const ui = this.ui;
    const head = el('div', 'tc lk-title', ui);
    el('div', 'title', head, 'LOCK<span class="hl">ER</span>');
    el('div', 'label', head, escapeHtml(store.profile.name));
    head.style.pointerEvents = 'none';
    this.chipEl = el('div', 'lk-charms', ui);
    this.updateChip();

    // slot tiles (left, under the ☰ button)
    const col = el('div', 'lk-slots', ui);
    this.slotTiles.clear();
    for (const t of SLOT_TABS) {
      const b = el('button', 'lk-slot', col);
      el('span', 'ico', b, t.icon);
      el('span', 'lbl', b, t.label);
      el('i', 'bar', b);
      bindTap(b, () => {
        bus.emit('uiTap', { kind: 'tab' });
        this.setSlot(t.id);
      });
      this.slotTiles.set(t.id, b);
    }
    this.refreshTiles();

    // option panel (right)
    this.panel = el('div', 'lk-panel', ui) as HTMLDivElement;
    this.renderPanel();

    // bottom bar: zoom out · undo · random · emote · photo · zoom in
    const bar = el('div', 'dr-bar', ui);
    button(bar, { icon: '➖', cls: 'round ghost' }, () => this.zoomBy(tuning.dressup.zoomButtonStep));
    this.undoBtn = button(bar, { icon: '↩️', cls: 'round ghost', tap: 'back' }, () => this.undo());
    button(bar, { icon: '🎲', label: 'Surprise', cls: 'big blue', tap: 'big' }, () => this.randomLook());
    button(bar, { icon: '💃', label: 'Emote', cls: 'big', tap: 'big' }, () => this.playWheelEmote());
    button(bar, { icon: '📸', label: 'Photo', cls: 'big', tap: 'big' }, () => this.doPose());
    button(bar, { icon: '➕', cls: 'round ghost' }, () => this.zoomBy(1 / tuning.dressup.zoomButtonStep));
    this.updateUndo();

    // camera flash + viewfinder overlays for the photo moment
    this.flashEl = el('div', 'dr-flash', ui) as HTMLDivElement;
    this.vfEl = el('div', 'dr-vf', ui, '<i></i><i></i><i></i><i></i><b>● REC</b>') as HTMLDivElement;

    // let's play
    button(ui, { label: "Let's play!", cls: 'br pink big dr-go', tap: 'big' }, () => void scenes.go('town'));
  }

  private updateChip(): void {
    if (!this.chipEl) return;
    const n = charmCount();
    const nx = nextReward();
    this.chipEl.innerHTML = `<span class="gem">💎</span><b>${n}/${charmTotal()}</b>` + (nx ? `<span class="nx">NEXT: ${nx.icon} ${escapeHtml(nx.label)} · ${nx.at - n} to go</span>` : '<span class="nx">ALL UNLOCKED! 🎉</span>');
  }

  /** The slot tiles show the rarity of what's equipped. */
  private refreshTiles(): void {
    for (const [id, b] of this.slotTiles) {
      b.classList.toggle('on', id === this.slot);
      rarityVars(b, this.currentRarity(id));
    }
  }

  private setSlot(s: LockerSlot): void {
    if (s === this.slot) return;
    this.endEmote('swap');
    this.char?.stopEmote();
    this.tryOn = null;
    this.slot = s;
    this.rotGoal = this.nearest(this.homeAngle(s));
    this.focusSlot();
    this.syncStage();
    this.setGlow(this.currentRarity(s));
    this.refreshTiles();
    this.panel.scrollTop = 0;
    this.renderPanel();
    if (s === 'wrap') this.pulse = 0.6;
  }

  /** Where the turntable rests: the back for back blings, a 3/4 view for rides, the front for the rest. */
  private homeAngle(s: LockerSlot = this.slot): number {
    return s === 'backBling' ? Math.PI : s === 'wrap' ? 0.55 : 0;
  }

  /** Nearest angle ≡ `a` (mod 2π) to the current rotation. */
  private nearest(a: number): number {
    return a + Math.round((this.rot - a) / TAU) * TAU;
  }

  private focusSlot(): void {
    const T = tuning.locker;
    if (this.slot === 'custom') {
      this.targetDist = clamp(tuning.dressup.focusDist[this.customCat] ?? T.slotDist.custom, tuning.dressup.zoomMin, tuning.dressup.zoomMax + 2);
      this.focusLook = tuning.dressup.focusLookY[this.customCat] ?? T.slotLookY.custom;
    } else {
      this.targetDist = T.slotDist[this.slot];
      this.focusLook = T.slotLookY[this.slot];
    }
  }

  /** (Re)build the right-hand panel for the current slot. */
  private renderPanel(): void {
    const p = this.panel;
    const keep = p.scrollTop;
    thumbs.dropQueued();
    p.innerHTML = '';
    const tab = SLOT_TABS.find((t) => t.id === this.slot)!;
    const head = el('div', 'lk-head', p);
    el('span', 'lk-head-ico', head, tab.icon);
    el('span', 'lk-head-t', head, tab.label);
    this.setSwatch = null;
    this.info = null;
    switch (this.slot) {
      case 'outfit': this.renderOutfit(p); break;
      case 'backBling': this.renderGearGrid(p, 'backBling', BACK_BLINGS, true); break;
      case 'glider': this.renderGearGrid(p, 'glider', GLIDERS, false); break;
      case 'contrail': this.renderGearGrid(p, 'contrail', CONTRAILS, true); break;
      case 'emote': this.renderEmotes(p); break;
      case 'wrap': this.renderWrap(p); break;
      case 'custom': this.renderCustom(p); break;
    }
    p.scrollTop = keep;
    this.refreshTiles();
    this.updateChip();
  }

  /** Show an item in the banner. */
  private showInfo(item: GearItem | { name: string; rarity: Rarity }, state: 'equipped' | 'owned' | 'locked' | 'info', need = 0, extra = '', ownedText?: string): void {
    this.info?.set(item.name, item.rarity, state, need, extra, ownedText);
  }

  // ── Outfit (skins + styles) ──────────────────────────────────────────────
  private renderOutfit(p: HTMLElement): void {
    const L = getLocker();
    const tone = store.profile.outfit.skin;
    this.info = new InfoBanner(p);
    const t = this.tryOn?.slot === 'outfit' ? this.tryOn : null;
    const selId = t ? t.id : L.skin;
    const selStyle = t ? (t.style ?? 0) : L.skinStyle;
    const sel = selId === 'custom' ? null : skinById(selId);
    const skinNeed = (sk: SkinDef) => Math.max(charmsNeeded(sk.reward ?? ''), ...(sk.needs ?? []).map((r) => charmsNeeded(r)), 1);

    // banner for the selected look
    if (sel) {
      const owned = skinOwned(sel);
      const sOwned = styleOwned(sel, selStyle);
      const need = !owned ? skinNeed(sel) : charmsNeeded(styleReward(sel.id, selStyle) ?? '');
      const equipped = !t && L.skin === sel.id;
      this.showInfo({ name: sel.name, rarity: styleRarity(sel, selStyle) }, owned && sOwned ? (equipped ? 'equipped' : 'owned') : 'locked', need, sel.styles[selStyle]?.name ?? '');
    } else this.showInfo({ name: 'My Style', rarity: 'common' }, L.skin === 'custom' ? 'equipped' : 'owned', 0, 'Your own mix');

    // styles of the selected skin sit right under the banner (so they are never scrolled away)
    if (sel) {
      const row = el('div', 'lk-styles', p);
      sel.styles.forEach((s, n) => {
        const r = styleRarity(sel, n);
        const owned = styleOwned(sel, n);
        const b = el('button', `lk-style${n === selStyle ? ' on' : ''}${owned ? '' : ' locked'}`, row);
        rarityVars(b, r);
        const dots = el('span', 'dots', b);
        for (const c of [s.c[1], s.c[2], s.c[0], s.c[3]]) el('i', '', dots).style.background = c;
        el('span', 'nm', b, escapeHtml(s.name));
        if (!owned) el('span', 'pad', b, '🔒');
        bindTap(b, () => this.pickStyleOfSkin(sel, n));
      });
    }

    const grid = el('div', 'lk-grid tall', p);
    // my style (the piece-by-piece look)
    const mine = L.skin === 'custom' ? store.profile.outfit : L.customOutfit ?? store.profile.outfit;
    lockerCard(grid, {
      name: 'My Style', icon: '✨', rarity: 'common', tall: true, on: !t && L.skin === 'custom', sub: 'Custom',
      thumbKey: `my:${JSON.stringify(mine)}`, thumb: outfitThumb(mine),
    }, () => this.wearMyStyle());
    // owned first, then by rarity, so a new kid sees her outfits at the top and the shiny locked ones below
    const sorted = [...SKINS].sort((a, b) => Number(!skinOwned(a)) - Number(!skinOwned(b)) || rarityRank(a.rarity) - rarityRank(b.rarity));
    for (const sk of sorted) {
      const owned = skinOwned(sk);
      lockerCard(grid, {
        name: sk.name, icon: sk.icon, rarity: sk.rarity, tall: true, need: owned ? 0 : skinNeed(sk), on: !t && L.skin === sk.id,
        thumbKey: `skin:${sk.id}:0:${tone}:${faceTag()}`, thumb: outfitThumb(resolveSkinOutfit(sk, 0, tone)),
      }, () => this.pickSkin(sk));
    }
    if (!sel) el('div', 'label lk-hint', p, 'Pick an outfit, then a style');
    const own = SKINS.filter(skinOwned).length;
    el('div', 'label lk-hint', p, `${own} / ${SKINS.length} outfits collected`);
  }

  private pickSkin(sk: SkinDef): void {
    const L = getLocker();
    if (!skinOwned(sk)) {
      this.tryOutfit(sk, 0);
      return;
    }
    const style = L.skin === sk.id ? L.skinStyle : 0;
    this.wearSkin(sk, style);
  }
  private pickStyleOfSkin(sk: SkinDef, n: number): void {
    if (!skinOwned(sk) || !styleOwned(sk, n)) {
      this.tryOutfit(sk, n);
      return;
    }
    this.wearSkin(sk, n);
  }

  /** Preview a skin you don't own yet (never saved). */
  private tryOutfit(sk: SkinDef, style: number): void {
    const char = this.char;
    if (!char) return;
    this.tryOn = { slot: 'outfit', id: sk.id, style };
    const next = resolveSkinOutfit(sk, style, store.profile.outfit.skin);
    this.visualOutfit(next);
    this.setGlow(styleRarity(sk, style), true);
    const need = !skinOwned(sk) ? Math.max(charmsNeeded(sk.reward ?? ''), ...(sk.needs ?? []).map((r) => charmsNeeded(r)), 1) : charmsNeeded(styleReward(sk.id, style) ?? '');
    bus.emit('uiTap', { kind: 'soft' });
    bus.emit('placementBlocked', {});
    toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} to wear ${sk.name}`);
    char.pose('twirl', undefined, true);
    this.renderPanel();
  }

  private wearSkin(sk: SkinDef, style: number): void {
    const char = this.char;
    if (!char) return;
    this.pushHistory();
    this.tryOn = null;
    const before = structuredClone(store.profile.outfit);
    const next = equipSkin(sk.id, style);
    this.animateOutfit(before, next);
    this.afterEquip('outfit', sk.id, styleRarity(sk, style), 'top');
    this.renderPanel();
  }
  private wearMyStyle(): void {
    if (!this.char) return;
    this.pushHistory();
    this.tryOn = null;
    const before = structuredClone(store.profile.outfit);
    const next = equipMyStyle();
    this.animateOutfit(before, next);
    this.afterEquip('outfit', 'custom', 'common', 'top');
    this.renderPanel();
  }

  /** Set the character's look without saving (previews). */
  private visualOutfit(o: Outfit): void {
    this.char?.setOutfit(o);
  }
  /** Stagger the changed pieces in one after another (hair → top → bottom → shoes → extras) with a flourish. */
  private animateOutfit(prev: Outfit, next: Outfit): void {
    const char = this.char;
    if (!char) return;
    char.pose('twirl', undefined, true);
    const changed: OutfitSlot[] = [];
    if (prev.skin !== next.skin) changed.push('skin');
    for (const s of PART_SLOTS) if (prev[s].style !== next[s].style || prev[s].color !== next[s].color) changed.push(s);
    const shown = structuredClone(prev);
    if (!changed.length) {
      char.setOutfit(next);
      return;
    }
    changed.forEach((s, i) => {
      this.later(i * tuning.dressup.surpriseStaggerMs, () => {
        if (s === 'skin') shown.skin = next.skin;
        else shown[s] = structuredClone(next[s]);
        char.setOutfit(shown, s);
        this.pop(s);
      });
    });
  }

  // ── Back bling / glider / contrail (one grid, three slots) ───────────────
  private renderGearGrid(p: HTMLElement, slot: 'backBling' | 'glider' | 'contrail', items: GearItem[], hasNone: boolean): void {
    const L = getLocker();
    this.info = new InfoBanner(p);
    const grid = el('div', 'lk-grid', p);
    const equippedId = slot === 'backBling' ? L.backBling : slot === 'glider' ? L.glider : L.contrail;
    const t = this.tryOn?.slot === slot ? this.tryOn : null;
    const sel = t ? t.id : equippedId;
    if (hasNone) {
      lockerCard(grid, { name: 'None', icon: '🚫', rarity: 'common', on: !t && !equippedId }, () => this.equipGear(slot, null));
    }
    const sorted = [...items].sort((a, b) => Number(!itemOwned(a)) - Number(!itemOwned(b)) || rarityRank(a.rarity) - rarityRank(b.rarity));
    for (const it of sorted) {
      const need = itemOwned(it) ? 0 : Math.max(1, charmsNeeded(it.reward ?? ''));
      lockerCard(grid, {
        name: it.name, icon: it.icon, rarity: it.rarity, need, on: !t && equippedId === it.id,
        thumbKey: slot === 'backBling' ? `bling:${it.id}` : slot === 'glider' ? `glider:${it.id}` : undefined,
        thumb: slot === 'backBling' ? blingThumb(it.id) : slot === 'glider' ? gliderThumb(it.id) : undefined,
      }, () => this.equipGear(slot, it.id));
    }
    const it = items.find((i) => i.id === sel);
    if (it) this.showInfo(it, !itemOwned(it) ? 'locked' : !t && equippedId === it.id ? 'equipped' : 'owned', charmsNeeded(it.reward ?? ''));
    else this.showInfo({ name: 'None', rarity: 'common' }, 'equipped');
    const owned = items.filter(itemOwned).length;
    el('div', 'label lk-hint', p, `${owned} / ${items.length} collected`);
  }

  private equipGear(slot: 'backBling' | 'glider' | 'contrail', id: string | null): void {
    const char = this.char;
    if (!char) return;
    const list = slot === 'backBling' ? BACK_BLINGS : slot === 'glider' ? GLIDERS : CONTRAILS;
    const it = id ? list.find((i) => i.id === id) : undefined;
    // locked → try it on (preview only)
    if (it && !itemOwned(it)) {
      this.tryOn = { slot, id: it.id };
      this.syncStage();
      this.setGlow(it.rarity, true);
      bus.emit('uiTap', { kind: 'soft' });
      bus.emit('placementBlocked', {});
      const need = Math.max(1, charmsNeeded(it.reward ?? ''));
      toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} to unlock ${it.name}`);
      this.popGear(slot);
      this.renderPanel();
      return;
    }
    this.tryOn = null;
    if (slot === 'backBling') setBackBling(id);
    else if (slot === 'glider') setGlider(id ?? 'starter');
    else setContrail(id);
    this.syncStage();
    this.popGear(slot);
    const r = it?.rarity ?? 'common';
    if (slot === 'backBling') this.rotGoal = this.nearest(Math.PI);
    char.pose(undefined, undefined, true);
    this.afterEquip(slot, id ?? 'none', r, slot);
    if (slot === 'glider') this.pulse = 1;
    this.renderPanel();
  }

  private popGear(slot: 'backBling' | 'glider' | 'contrail'): void {
    const o = slot === 'backBling' ? this.blingObj : slot === 'glider' ? this.gliderObj : null;
    if (o) bus.emit('lockerEquipped', { slot, id: '', rarity: 'common', object: o, pos: undefined });
  }

  // ── Emotes: a wheel of 6 ─────────────────────────────────────────────────
  private renderEmotes(p: HTMLElement): void {
    const L = getLocker();
    this.info = new InfoBanner(p);
    const wheel = el('div', 'lk-wheel', p);
    el('div', 'lk-wheel-c', wheel, '<b>EMOTE</b><span>WHEEL</span>');
    for (let i = 0; i < EMOTE_SLOTS; i++) {
      const a = -Math.PI / 2 + (i / EMOTE_SLOTS) * TAU;
      const id = L.emotes[i];
      const em = id ? EMOTES.find((e) => e.id === id) : undefined;
      const b = el('button', `lk-wslot${i === this.emoteSlot ? ' on' : ''}${em ? '' : ' empty'}`, wheel);
      b.style.left = `${50 + Math.cos(a) * 36}%`;
      b.style.top = `${50 + Math.sin(a) * 36}%`;
      rarityVars(b, em?.rarity ?? 'common');
      el('span', 'ico', b, em ? em.icon : '＋');
      if (em) el('span', 'nm', b, escapeHtml(em.name));
      el('i', 'n', b, String(i + 1));
      bindTap(b, () => {
        bus.emit('uiTap', { kind: 'soft' });
        this.emoteSlot = i;
        if (em) this.playEmote(em.id);
        this.renderPanel();
      });
    }
    el('div', 'label lk-sub-t', p, `Slot ${this.emoteSlot + 1} · tap an emote to put it there`);
    const grid = el('div', 'lk-grid', p);
    const t = this.tryOn?.slot === 'emote' ? this.tryOn : null;
    for (const e of EMOTES) {
      const need = itemOwned(e) ? 0 : Math.max(1, charmsNeeded(e.reward ?? ''));
      lockerCard(grid, { name: e.name, icon: e.icon, rarity: e.rarity, need, on: L.emotes.includes(e.id), sub: L.emotes.includes(e.id) ? `Slot ${L.emotes.indexOf(e.id) + 1}` : undefined }, () => this.pickEmote(e));
    }
    const hl = t ? EMOTES.find((e) => e.id === t.id) : L.emotes[this.emoteSlot] ? EMOTES.find((e) => e.id === L.emotes[this.emoteSlot]) : undefined;
    if (hl) this.showInfo(hl, !itemOwned(hl) ? 'locked' : L.emotes.includes(hl.id) ? 'equipped' : 'owned', charmsNeeded(hl.reward ?? ''));
    else this.showInfo({ name: 'Empty slot', rarity: 'common' }, 'info');
    if (L.emotes[this.emoteSlot] && L.emotes.length > 1) {
      button(p, { icon: '🗑️', label: 'Clear slot', cls: 'ghost' }, () => {
        clearEmote(this.emoteSlot);
        this.emoteSlot = Math.min(this.emoteSlot, getLocker().emotes.length);
        this.renderPanel();
      });
    }
  }
  private pickEmote(e: GearItem): void {
    if (!itemOwned(e)) {
      this.tryOn = { slot: 'emote', id: e.id };
      this.playEmote(e.id);
      this.setGlow(e.rarity, true);
      bus.emit('placementBlocked', {});
      const need = Math.max(1, charmsNeeded(e.reward ?? ''));
      toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} to unlock ${e.name}`);
      this.renderPanel();
      return;
    }
    this.tryOn = null;
    setEmote(this.emoteSlot, e.id);
    const L = getLocker();
    this.emoteSlot = Math.min(L.emotes.indexOf(e.id) + 1, EMOTE_SLOTS - 1) === this.emoteSlot ? this.emoteSlot : this.emoteSlot;
    this.playEmote(e.id);
    this.afterEquip('emote', e.id, e.rarity, 'top');
    this.renderPanel();
  }
  private playEmote(id: string): void {
    const char = this.char;
    if (!char) return;
    char.setGliding(false);
    this.endEmote('swap');
    if (char.playEmote(id)) {
      const loop = CHAR_EMOTES.find((e) => e.id === id)?.loop ?? false;
      this.curEmote = { id, loop };
      bus.emit('emoteStarted', { id, loop, pos: this.charPos() });
    } else char.pose(undefined, undefined, true);
  }
  private charPos(): { x: number; y: number; z: number } {
    const p = new THREE.Vector3();
    this.char?.group.getWorldPosition(p);
    return v3(p);
  }
  /** Stop the previewed emote (and tell the bus, so its tune stops too). */
  private endEmote(reason: 'done' | 'swap'): void {
    const e = this.curEmote;
    if (!e) return;
    this.curEmote = null;
    this.char?.stopEmote();
    bus.emit('emoteStopped', { id: e.id, pos: this.charPos(), reason });
  }
  /** 💃: play the next emote on the wheel. */
  private playWheelEmote(): void {
    const L = getLocker();
    if (!L.emotes.length) return;
    this.emoteIdx = (this.emoteIdx + 1) % L.emotes.length;
    const id = L.emotes[this.emoteIdx];
    if (this.slot === 'glider' || this.slot === 'contrail' || this.slot === 'wrap') this.setSlot('emote');
    this.playEmote(id);
    const pos = this.char!.slotAnchor('top');
    pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.5));
    bus.emit('optionPicked', { pos: v3(pos) });
  }

  // ── Ride wraps ───────────────────────────────────────────────────────────
  private renderWrap(p: HTMLElement): void {
    const L = getLocker();
    this.info = new InfoBanner(p);
    const kind = this.wrapKind;
    const look = wrapOf(kind);
    const grid = el('div', 'lk-grid', p);
    for (const r of RIDES) {
      const need = itemOwned(r) ? 0 : Math.max(1, charmsNeeded(r.reward ?? ''));
      const w = wrapOf(r.id);
      lockerCard(grid, {
        name: r.name, icon: r.icon, rarity: r.rarity, need, on: r.id === kind, star: L.ride === r.id,
        thumbKey: `ride:${r.id}:${w.color}:${w.finish}`, thumb: rideThumb(r.id, w),
      }, () => this.pickRide(r.id));
    }
    const ride = RIDES.find((r) => r.id === kind)!;
    this.showInfo(ride, !itemOwned(ride) ? 'locked' : L.ride === ride.id ? 'equipped' : 'owned', charmsNeeded(ride.reward ?? ''), L.ride === ride.id ? 'My ride' : '', 'READY TO ROLL');
    if (itemOwned(ride) && L.ride !== ride.id) {
      button(p, { icon: '⭐', label: 'Make this my ride', cls: 'blue' }, () => {
        setRide(ride.id);
        this.afterEquip('ride', ride.id, ride.rarity, 'top');
        toast(`⭐ ${ride.name} is your ride — the 🚗 button brings it`);
        this.renderPanel();
      });
    }
    el('div', 'label lk-sub-t', p, 'Wrap colour');
    swatches(p, tuning.art.palette, look.color, (c) => this.changeWrap(kind, c, look.finish), 'lk-wrapsw');
    el('div', 'label lk-sub-t', p, 'Finish');
    const fin = el('div', 'lk-fins', p);
    for (const f of WRAP_FINISHES) {
      const owned = itemOwned(f);
      const b = el('button', `lk-fin${f.id === look.finish ? ' on' : ''}${owned ? '' : ' locked'}`, fin);
      rarityVars(b, f.rarity);
      el('span', 'ico', b, f.icon);
      el('span', 'nm', b, f.name);
      if (!owned) el('span', 'pad', b, '🔒');
      bindTap(b, () => {
        if (!owned) {
          const need = Math.max(1, charmsNeeded(f.reward ?? ''));
          toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} to unlock the ${f.name} finish`);
          bus.emit('placementBlocked', {});
          return;
        }
        this.changeWrap(kind, look.color, f.id);
      });
    }
  }
  private pickRide(kind: VehicleKind): void {
    const r = RIDES.find((x) => x.id === kind)!;
    this.wrapKind = kind;
    bus.emit('uiTap', { kind: 'soft' });
    this.setRide(kind);
    this.setGlow(r.rarity, true);
    if (!itemOwned(r)) {
      bus.emit('placementBlocked', {});
      const need = Math.max(1, charmsNeeded(r.reward ?? ''));
      toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} to unlock ${r.name}`);
    }
    this.renderPanel();
  }
  private changeWrap(kind: VehicleKind, color: string, finish: string): void {
    setWrap(kind, color, finish);
    this.setRide(kind);
    const pos = new THREE.Vector3(0, 1.3, 0).applyMatrix4(this.turn.matrixWorld);
    const f = WRAP_FINISHES.find((x) => x.id === finish);
    bus.emit('lockerEquipped', { slot: 'wrap', id: finish, rarity: f?.rarity ?? 'common', pos: v3(pos), object: this.rideObj ?? undefined });
    this.pulse = 0.7;
    this.renderPanel();
  }

  // ── Custom: piece-by-piece (hair / top / bottom / shoes / extras / skin tone / looks) ──
  private renderCustom(p: HTMLElement): void {
    const outfit = store.profile.outfit;
    const sub = el('div', 'lk-subtabs', p);
    for (const c of CUSTOM_CATS) {
      const b = el('button', `lk-subtab${c.id === this.customCat ? ' on' : ''}`, sub);
      el('span', 'ico', b, c.icon);
      el('span', 'lbl', b, c.label);
      bindTap(b, () => {
        bus.emit('uiTap', { kind: 'tab' });
        this.customCat = c.id;
        this.focusSlot();
        this.renderPanel();
      });
    }
    if (this.customCat === 'skin') {
      swatches(p, tuning.art.skinTones, outfit.skin, (c) => this.pickSkinTone(c), 'dr-skin');
      return;
    }
    if (this.customCat === 'face') {
      this.renderFace(p);
      return;
    }
    if (this.customCat === 'looks') {
      this.renderLooks(p);
      return;
    }
    const slot = this.customCat;
    const grid = el('div', 'lk-grid parts', p);
    OUTFIT_CATALOG[slot].forEach((it, i) => {
      const rw = (it as { reward?: string }).reward;
      const locked = !!rw && !owns(rw);
      lockerCard(grid, {
        name: it.name, icon: it.icon, rarity: partRarity(slot, i), need: locked ? Math.max(1, charmsNeeded(rw!)) : 0,
        on: outfit[slot].style === i,
      }, () => {
        if (locked) {
          const need = Math.max(1, charmsNeeded(rw!));
          toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} in town to unlock ${rewardFor(rw!)?.label ?? it.name}`);
          bus.emit('placementBlocked', {});
          return;
        }
        this.pickStyle(slot, i);
        this.renderPanel();
      });
    });
    const colorsBox = el('div', 'dr-colors', p);
    const hint = el('div', 'label dr-hint', p, 'Pick one to add color');
    this.setSwatch = swatches(colorsBox, tuning.art.palette, outfit[slot].color, (c) => this.pickColor(slot, c));
    const none = slot === 'accessory' && outfit.accessory.style === 0;
    colorsBox.style.display = none ? 'none' : '';
    hint.style.display = none ? '' : 'none';
  }

  // ── Face: eyes · eye colour · brows · freckles · makeup · stickers ───────
  private renderFace(p: HTMLElement): void {
    const f = resolveFace(store.profile.outfit.face);
    const need = (field: FaceField, id: unknown): number => {
      const r = faceRewardOf(field, id);
      return r && !faceOwned(field, id) ? Math.max(1, charmsNeeded(r)) : 0;
    };
    const cards = (title: string, field: 'eyes' | 'brows' | 'makeup' | 'sticker', current: unknown): void => {
      el('div', 'label lk-sub-t', p, title);
      const grid = el('div', 'lk-grid parts', p);
      for (const it of FACE_OPTIONS[field]) {
        const n = need(field, it.id);
        lockerCard(grid, { name: it.name, icon: it.icon, rarity: it.rarity, need: n, on: current === it.id }, () => this.pickFace(field, it.id, it.name, it.rarity, n));
      }
    };
    cards('Eyes', 'eyes', f.eyes);
    el('div', 'label lk-sub-t', p, 'Eye colour');
    const row = el('div', 'lk-ecols', p);
    for (const c of FACE_OPTIONS.eyeColor) {
      const n = need('eyeColor', c.id);
      const b = el('button', `lk-ecol${(c.value ?? '').toLowerCase() === f.eyeColor.toLowerCase() ? ' on' : ''}${n ? ' locked' : ''}`, row);
      rarityVars(b, c.rarity);
      b.style.setProperty('--ec', c.value ?? '#8e5c38');
      el('i', 'iris', b);
      el('span', 'nm', b, escapeHtml(c.name));
      if (n) el('span', 'pad', b, '🔒');
      bindTap(b, () => this.pickFace('eyeColor', c.id, c.name + ' eyes', c.rarity, n, c.value));
    }
    cards('Brows', 'brows', f.brows);
    el('div', 'label lk-sub-t', p, 'Freckles');
    const fr = el('div', 'lk-fins', p);
    for (const it of FACE_OPTIONS.freckles) {
      const b = el('button', `lk-fin${f.freckles === it.id ? ' on' : ''}`, fr);
      rarityVars(b, it.rarity);
      el('span', 'ico', b, it.icon);
      el('span', 'nm', b, escapeHtml(it.name));
      bindTap(b, () => this.pickFace('freckles', it.id, it.name, it.rarity, 0));
    }
    cards('Makeup', 'makeup', f.makeup);
    cards('Face stickers', 'sticker', f.sticker);
  }

  private pickFace(field: FaceField, id: number | string | boolean | null, name: string, rarity: Rarity, need: number, hex?: string): void {
    const char = this.char;
    if (!char) return;
    if (need > 0) {
      bus.emit('uiTap', { kind: 'soft' });
      bus.emit('placementBlocked', {});
      toast(`🔒 Find ${need} more 💎 charm${need === 1 ? '' : 's'} to unlock ${name}`);
      return;
    }
    this.pushHistory();
    if (field === 'eyeColor') setFace({ eyeColor: hex });
    else setFace({ [field]: id } as never);
    char.setOutfit(store.profile.outfit); // the face diff is live (and plays the happy reaction)
    const pos = char.slotAnchor('hair');
    pos.y -= 0.16;
    pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.4));
    bus.emit('lockerEquipped', { slot: 'face', id: String(id), rarity, pos: v3(pos) });
    this.setGlow(rarity, true);
    this.renderPanel();
  }

  // ── Looks: 4 saved outfits ───────────────────────────────────────────────
  private renderLooks(p: HTMLElement): void {
    const looks = store.profile.looks ?? [];
    const max = tuning.dressup.looksMax;
    const grid = el('div', 'dr-looks', p);
    for (let i = 0; i < max; i++) {
      const look = looks[i];
      const card = el('div', `look${look ? '' : ' empty'}${i === this.lookSel ? ' on' : ''}`, grid);
      el('span', 'look-n', card, String(i + 1));
      if (look) card.appendChild(this.mannequin(look));
      else el('span', 'look-plus', card, '+');
      this.bindLook(card, i);
    }
    el('div', 'label dr-hint', p, 'Tap to wear · hold to save here');
    button(p, { icon: '💾', label: 'Save look', cls: 'pink' }, () => this.saveLook());
  }

  /** Tiny colored mannequin used on the look cards. */
  private mannequin(o: Outfit): HTMLElement {
    const m = el('div', 'mini');
    const part = (cls: string, color: string) => {
      const d = el('i', cls, m);
      d.style.background = color;
    };
    part('m-hair', o.hair.color);
    part('m-head', o.skin);
    part('m-top', o.top.color);
    part('m-bot', o.bottom.color);
    part('m-shoe', o.shoes.color);
    return m;
  }

  /** Tap = wear / save into an empty card, long-press = save here. */
  private bindLook(card: HTMLElement, i: number): void {
    let timer: number | null = null;
    let fired = false;
    let down = false;
    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      down = true;
      fired = false;
      card.classList.add('pressed');
      timer = window.setTimeout(() => {
        fired = true;
        this.saveLook(i);
      }, tuning.dressup.longPressMs);
    });
    card.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      card.classList.remove('pressed');
      clear();
      if (!down) return;
      down = false;
      if (fired) return;
      bus.emit('uiTap', { kind: 'soft' });
      const look = store.profile.looks?.[i];
      this.lookSel = i;
      if (look) this.wearLook(i);
      else this.saveLook(i);
    });
    const cancel = () => {
      down = false;
      card.classList.remove('pressed');
      clear();
    };
    card.addEventListener('pointercancel', cancel);
    card.addEventListener('pointerleave', cancel);
  }

  private saveLook(slot?: number): void {
    const char = this.char;
    if (!char) return;
    const max = tuning.dressup.looksMax;
    const prof = store.profile;
    const looks = (prof.looks ??= []);
    let target = slot ?? this.lookSel;
    if (slot === undefined) {
      // next empty slot, else round-robin overwrite
      target = looks.length < max ? looks.length : this.nextOverwrite++ % max;
    }
    target = clamp(target, 0, Math.min(looks.length, max - 1));
    const snap = structuredClone(prof.outfit);
    store.update(() => {
      looks[target] = snap;
    });
    this.lookSel = target;
    const pos = char.slotAnchor('top');
    pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.5));
    bus.emit('creationSaved', { kind: 'look', pos: v3(pos) });
    toast(`Saved to Look ${target + 1}`);
    char.pose('hips');
    if (this.slot === 'custom' && this.customCat === 'looks') this.renderPanel();
  }

  private wearLook(i: number): void {
    const look = store.profile.looks?.[i];
    if (!look) return;
    this.pushHistory();
    this.transitionTo(structuredClone(look), 'hips');
    markCustom();
    if (this.slot === 'custom' && this.customCat === 'looks') this.renderPanel();
  }

  // ── Changing the outfit by hand ──────────────────────────────────────────
  private pickStyle(slot: CatalogSlot, style: number): void {
    this.change(slot, (o) => {
      const wasNone = slot === 'accessory' && o.accessory.style === 0;
      o[slot].style = style;
      // a new accessory starts in a color that pops against the hair (it never blends in);
      // the kid can recolor it separately with the swatches below
      if (slot === 'accessory' && style > 0 && (wasNone || colorGap(o.accessory.color, o.hair.color) < MIN_ACCENT_GAP)) {
        o.accessory.color = contrastColor(o.hair.color, tuning.art.palette, style);
      }
    });
    if (slot === 'accessory') this.setSwatch?.(store.profile.outfit.accessory.color);
  }
  private pickColor(slot: CatalogSlot, color: string): void {
    let note = '';
    let accChanged = false;
    this.change(slot, (o) => {
      o[slot].color = color;
      if (slot === 'accessory') {
        // hair accessories can't match the hair — swap to a contrast color and say so
        const eff = Character.accessoryColor(o);
        if (eff !== color) {
          o.accessory.color = eff;
          note = 'Too close to your hair, so we picked a contrast color';
        }
      } else if (slot === 'hair' && o.accessory.style > 0) {
        // changing the hair keeps the accessory visible against it
        const eff = Character.accessoryColor(o);
        if (eff !== o.accessory.color) {
          o.accessory.color = eff;
          accChanged = true;
        }
      }
    });
    if (slot === 'accessory') this.setSwatch?.(store.profile.outfit.accessory.color);
    if (note) toast(note);
    if (accChanged) this.pop('accessory');
  }
  private pickSkinTone(color: string): void {
    this.change('skin', (o) => {
      o.skin = color;
    });
  }

  /** One outfit edit: save (autosave), update the character, pose, sparkle + pop. The look becomes "My Style". */
  private change(slot: OutfitSlot, edit: (o: Outfit) => void): void {
    const char = this.char;
    if (!char) return;
    this.pushHistory();
    const o = store.profile.outfit;
    store.update(() => edit(o));
    markCustom();
    this.tryOn = null;
    char.setOutfit(o, slot);
    char.pose();
    this.pop(slot);
    this.refreshTiles();
  }

  /** Sparkle burst + squash-and-stretch of the changed part (juice reacts to the event). */
  private pop(slot: OutfitSlot): void {
    const char = this.char;
    if (!char) return;
    const anchor = char.slotAnchor(slot);
    // nudge toward the camera so the sparkles aren't hidden inside the body
    anchor.add(this.camera.position.clone().sub(anchor).normalize().multiplyScalar(0.45));
    bus.emit('outfitChanged', { slot, pos: v3(anchor), object: char.partObject(slot) ?? undefined });
  }

  /** Common equip flourish: rarity sparkles + sound (juice), the stage glows in the rarity colour, tiles update. */
  private afterEquip(slot: string, id: string, rarity: Rarity, anchorKind: OutfitSlot | 'backBling' | 'glider' | 'contrail'): void {
    const char = this.char;
    if (!char) return;
    let pos: THREE.Vector3;
    if (anchorKind === 'backBling') pos = new THREE.Vector3(0, 1.3, -0.3);
    else if (anchorKind === 'glider') pos = new THREE.Vector3(0, 2.4, 0.2);
    else if (anchorKind === 'contrail') pos = new THREE.Vector3(0, 1.3, -0.2);
    else pos = char.slotAnchor(anchorKind);
    if (anchorKind === 'backBling' || anchorKind === 'glider' || anchorKind === 'contrail') pos.applyMatrix4(char.group.matrixWorld);
    pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.5));
    this.setGlow(rarity, true);
    char.react(); // a happy face
    bus.emit('lockerEquipped', { slot, id, rarity, pos: v3(pos) });
    this.refreshTiles();
    this.updateChip();
  }

  // ── Undo / random / pose ─────────────────────────────────────────────────
  private snap(): Snap {
    const L = getLocker();
    return { outfit: structuredClone(store.profile.outfit), skin: L.skin, style: L.skinStyle, custom: L.customOutfit ? structuredClone(L.customOutfit) : undefined };
  }
  private pushHistory(): void {
    this.history.push(this.snap());
    if (this.history.length > tuning.dressup.undoMax) this.history.shift();
    this.updateUndo();
  }
  private updateUndo(): void {
    if (this.undoBtn) this.undoBtn.disabled = this.history.length === 0;
  }

  /** Step back to the previous look. */
  private undo(): void {
    const char = this.char;
    const prev = this.history.pop();
    this.updateUndo();
    if (!char || !prev) return;
    const L = getLocker();
    store.update(() => {
      L.skin = prev.skin;
      L.skinStyle = prev.style;
      L.customOutfit = prev.custom;
    });
    this.tryOn = null;
    this.transitionTo(prev.outfit, 'hips', false);
  }

  /** Switch to a whole outfit (saved); changed pieces pop in one after another (stagger) or all at once. */
  private transitionTo(next: Outfit, pose: 'hips' | 'twirl' | null, stagger = true): void {
    const char = this.char;
    if (!char) return;
    const cur = structuredClone(store.profile.outfit);
    store.update(() => {
      store.profile.outfit = next;
    });
    if (pose) char.pose(pose, undefined, true);
    const changed: OutfitSlot[] = [];
    if (cur.skin !== next.skin) changed.push('skin');
    for (const s of PART_SLOTS) if (cur[s].style !== next[s].style || cur[s].color !== next[s].color) changed.push(s);
    if (!stagger) {
      char.setOutfit(next);
      for (const s of changed) this.pop(s);
      this.renderPanel();
      return;
    }
    const shown = structuredClone(cur);
    changed.forEach((s, i) => {
      this.later(i * tuning.dressup.surpriseStaggerMs, () => {
        if (s === 'skin') shown.skin = next.skin;
        else shown[s] = structuredClone(next[s]);
        char.setOutfit(shown, s);
        this.pop(s);
        if (i === changed.length - 1) this.renderPanel();
      });
    });
    if (!changed.length) this.renderPanel();
  }

  /** 🎲 surprise me: a random owned item in the current slot (a whole new look in Custom). */
  private randomLook(): void {
    const char = this.char;
    if (!char) return;
    const L = getLocker();
    switch (this.slot) {
      case 'outfit': {
        const ok = SKINS.filter(skinOwned);
        const sk = pick(ok.filter((s) => s.id !== L.skin).length ? ok.filter((s) => s.id !== L.skin) : ok);
        const styles = sk.styles.map((_, n) => n).filter((n) => styleOwned(sk, n));
        this.wearSkin(sk, pick(styles));
        return;
      }
      case 'backBling': {
        const ok = BACK_BLINGS.filter(itemOwned).filter((i) => i.id !== L.backBling);
        if (ok.length) this.equipGear('backBling', pick(ok).id);
        return;
      }
      case 'glider': {
        const ok = GLIDERS.filter(itemOwned).filter((i) => i.id !== L.glider);
        if (ok.length) this.equipGear('glider', pick(ok).id);
        return;
      }
      case 'contrail': {
        const ok = CONTRAILS.filter(itemOwned).filter((i) => i.id !== L.contrail);
        if (ok.length) this.equipGear('contrail', pick(ok).id);
        return;
      }
      case 'emote': {
        const ok = EMOTES.filter(itemOwned);
        this.pickEmote(pick(ok));
        return;
      }
      case 'wrap': {
        const pal = tuning.art.palette;
        const owned = WRAP_FINISHES.filter(itemOwned);
        this.changeWrap(this.wrapKind, pick(pal), pick(owned).id);
        return;
      }
      default:
        break;
    }
    if (this.slot === 'custom' && this.customCat === 'face') {
      // a surprise face (only things she owns)
      this.pushHistory();
      const r = randomFace();
      const cur = store.profile.outfit.face ?? {};
      const hexId = FACE_OPTIONS.eyeColor.find((c) => (c.value ?? '').toLowerCase() === (r.eyeColor ?? '').toLowerCase())?.id;
      setFace({
        eyes: faceOwned('eyes', r.eyes) ? r.eyes : cur.eyes,
        eyeColor: hexId === undefined || faceOwned('eyeColor', hexId) ? r.eyeColor : cur.eyeColor,
        brows: r.brows,
        freckles: r.freckles,
        makeup: faceOwned('makeup', r.makeup) ? r.makeup : cur.makeup,
        sticker: r.sticker === null || faceOwned('sticker', r.sticker) ? r.sticker : cur.sticker,
      });
      char.setOutfit(store.profile.outfit);
      this.pulse = 0.8;
      this.renderPanel();
      return;
    }
    this.pushHistory();
    const cur = store.profile.outfit;
    const next = structuredClone(cur);
    const pal = tuning.art.palette;
    const pickColor = () => pal[Math.floor(Math.random() * pal.length)];
    for (const s of PART_SLOTS) {
      const items = OUTFIT_CATALOG[s];
      const ok: number[] = [];
      items.forEach((it, i) => {
        if (s === 'accessory' && i === 0) return;
        const rw = (it as { reward?: string }).reward;
        if (rw && !owns(rw)) return;
        if (i === cur[s].style) return;
        ok.push(i);
      });
      let style = ok.length ? ok[Math.floor(Math.random() * ok.length)] : cur[s].style;
      if (s === 'accessory' && Math.random() < 0.25) style = 0;
      next[s].style = style;
      next[s].color = pickColor();
    }
    // the accessory always pops against the new hair
    if (next.accessory.style > 0) next.accessory.color = contrastColor(next.hair.color, pal, next.accessory.style);
    if (next.top.color === next.bottom.color) next.bottom.color = pal[(pal.indexOf(next.top.color) + 7) % pal.length];
    this.tryOn = null;
    this.transitionTo(next, 'twirl');
    markCustom();
  }

  /** 📸 strike the next cool pose, then flash. */
  private doPose(): void {
    const char = this.char;
    const now = performance.now();
    if (!char || now < this.poseLock) return;
    if (this.slot === 'wrap' || this.slot === 'glider') {
      // showrooms: no pose, just a flash of the stage
      this.pulse = 1;
    }
    char.setGliding(this.slot === 'glider');
    const hold = tuning.dressup.poseHold;
    this.poseLock = now + hold * 1000 * 0.7;
    const kind = POSE_ORDER[this.poseIdx++ % POSE_ORDER.length];
    if (this.slot !== 'glider' && this.slot !== 'wrap') char.pose(kind, hold, true);
    this.vfEl?.classList.add('on');
    this.later(tuning.dressup.flashDelayMs, () => {
      this.flashEl?.classList.remove('go');
      void this.flashEl?.offsetWidth; // restart the animation
      this.flashEl?.classList.add('go');
      const pos = char.slotAnchor('top');
      pos.add(this.camera.position.clone().sub(pos).normalize().multiplyScalar(0.5));
      bus.emit('photoFlash', { pos: v3(pos) });
    });
    this.later(hold * 1000, () => this.vfEl?.classList.remove('on'));
  }

  // ── Input: drag to spin, pinch / wheel / buttons to zoom ─────────────────
  private listenInput(): void {
    const c = scenes.canvas;
    this.listen(c, 'pointerdown', (e) => this.onDown(e));
    this.listen(c, 'pointermove', (e) => this.onMove(e));
    this.listen(c, 'pointerup', (e) => this.onUp(e));
    this.listen(c, 'pointercancel', (e) => this.onUp(e, true));
    this.listen(
      c,
      'wheel',
      (e) => {
        e.preventDefault();
        this.manualZoom(this.targetDist * Math.exp(e.deltaY * tuning.dressup.zoomWheel));
      },
      { passive: false },
    );
    this.listen(window, 'keydown', (e) => {
      if (e.key === 'ArrowLeft') this.spinVel = -2.6;
      else if (e.key === 'ArrowRight') this.spinVel = 2.6;
      else if (e.key === '+' || e.key === '=') this.zoomBy(1 / tuning.dressup.zoomButtonStep);
      else if (e.key === '-' || e.key === '_') this.zoomBy(tuning.dressup.zoomButtonStep);
    });
  }

  /** The player zooms by hand: stop following the slot focus height. */
  private manualZoom(d: number): void {
    this.targetDist = clamp(d, tuning.dressup.zoomMin, tuning.dressup.zoomMax + 4);
    this.focusLook = null;
  }
  private zoomBy(f: number): void {
    this.manualZoom(this.targetDist * f);
  }

  private onDown(e: PointerEvent): void {
    try {
      scenes.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragging = true;
      this.downT = performance.now();
      this.lastMoveT = this.downT;
      this.moved = 0;
      this.spinVel = 0;
      this.rotGoal = null;
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.pointerSpan();
      this.moved = 999; // not a tap
    }
    this.idle = 0;
  }

  private onMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    this.idle = 0;
    if (this.pointers.size >= 2) {
      const d = this.pointerSpan();
      if (this.pinchDist > 0 && d > 0) this.manualZoom(this.targetDist * (this.pinchDist / d));
      this.pinchDist = d;
      return;
    }
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.rot += dx * tuning.dressup.rotateSpeed;
    const now = performance.now();
    const dtS = Math.max(0.008, (now - this.lastMoveT) / 1000);
    this.lastMoveT = now;
    this.spinVel = clamp(lerp(this.spinVel, (dx * tuning.dressup.rotateSpeed) / dtS, 0.5), -14, 14);
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size === 0) {
      this.dragging = false;
      const now = performance.now();
      if (now - this.lastMoveT > 90) this.spinVel = 0; // finger rested before lifting: no fling
      if (!cancelled && this.moved < 10 && now - this.downT < 450) this.onTap(e);
    } else if (this.pointers.size === 1) {
      this.pinchDist = 0;
      this.spinVel = 0;
    }
  }

  private pointerSpan(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  /** Tap the character: strike a pose with a little sparkle. */
  private onTap(e: PointerEvent): void {
    const char = this.char;
    if (!char || !char.group.visible) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(char.group, true)[0];
    if (!hit) return;
    if (this.slot === 'glider' || this.slot === 'contrail') char.pose();
    else this.playWheelEmote();
    bus.emit('optionPicked', { pos: v3(hit.point) });
  }

  // ── Frame loop ───────────────────────────────────────────────────────────
  update(dt: number, t: number): void {
    const char = this.char;
    if (!char) return;
    const D = tuning.dressup;
    const LK = tuning.locker;
    thumbs.pump(LK.thumbBudgetMs);

    // spin with inertia; drift back to the home angle when left alone
    const home = this.homeAngle();
    if (this.rotGoal !== null && !this.dragging) {
      this.rot += (this.rotGoal - this.rot) * (1 - Math.exp(-6 * dt));
      if (Math.abs(this.rotGoal - this.rot) < 0.01) this.rotGoal = null;
    } else if (!this.dragging) {
      this.rot += this.spinVel * dt;
      this.spinVel *= Math.pow(D.rotateInertia, dt * 60);
      if (Math.abs(this.spinVel) < 0.05) this.spinVel = 0;
    }
    if (!this.dragging && this.pointers.size === 0 && this.rotGoal === null && Math.abs(this.spinVel) < 0.3 && !char.posing && !char.emoting) {
      this.idle += dt;
      if (this.idle > D.faceFrontDelay) {
        const target = this.nearest(home);
        this.rot += (target - this.rot) * (1 - Math.exp(-D.faceFrontSpeed * dt));
      }
    } else this.idle = 0;
    this.turn.rotation.y = this.rot;

    // swishy sound while spinning fast (juice maps characterSpin)
    const sp = Math.abs(this.spinVel);
    if (sp > 1.4 || (this.dragging && sp > 0.9)) {
      this.spinSoundT += dt;
      if (this.spinSoundT > D.spinSoundEvery) {
        this.spinSoundT = 0;
        bus.emit('characterSpin', { speed: sp });
      }
    } else this.spinSoundT = D.spinSoundEvery * 0.6;

    // contrail showroom: the player flies a lazy circle so the trail curls behind
    if (this.slot === 'contrail') {
      this.wasContrail = true;
      this.orbit += dt * 0.8;
      const R = LK.orbitRadius;
      char.group.position.set(Math.cos(this.orbit) * R, 0.45 + Math.sin(t * 2.2) * 0.06, Math.sin(this.orbit) * R * 0.8);
      char.group.rotation.y = Math.PI / 2 - this.orbit - 0.15 + Math.PI; // heading along the circle
      char.setMove(0.7, false);
      char.group.updateWorldMatrix(true, true);
      if (this.contrail) {
        const em = new THREE.Vector3(0, 1.25, -0.25).applyMatrix4(char.group.matrixWorld);
        const vel = new THREE.Vector3(Math.sin(this.orbit) * R * 0.8, 0, -Math.cos(this.orbit) * R * 0.64);
        this.contrail.update(dt, em, true, vel);
      }
    }

    if (this.curEmote && char.emoting !== this.curEmote.id) {
      const e = this.curEmote; // it ended by itself (one-shots) or got interrupted
      this.curEmote = null;
      bus.emit('emoteStopped', { id: e.id, pos: this.charPos(), reason: 'done' });
    }
    char.lookAt(this.camera.position); // her eyes follow the camera
    char.update(dt, t);

    // gear animations (wings flap, balloons sway…)
    (this.blingObj?.userData.tick as ((t: number) => void) | undefined)?.(t);
    (this.gliderObj?.userData.tick as ((t: number) => void) | undefined)?.(t);
    if (this.gliderObj && this.slot === 'glider') char.group.position.y = 0.25 + Math.sin(t * 1.8) * 0.05;
    else if (this.slot !== 'contrail') char.group.position.y = 0;
    if (this.rideObj) this.rideObj.position.y = Math.sin(t * 1.6) * 0.0; // (kept still: it is a showroom plinth)

    // camera: glide to the target distance + height
    const k = 1 - Math.exp(-D.zoomSmooth * dt);
    this.dist += (this.targetDist - this.dist) * k;
    const dEff = this.dist * this.fitScale;
    const close = smooth((D.zoomMax - this.dist) / (D.zoomMax - D.zoomMin));
    const want = this.focusLook ?? lerp(D.lookYWide, D.lookYClose, close);
    this.lookY += (want - this.lookY) * k;
    this.camera.position.set(0, this.lookY + (LK.slotElev[this.slot] ?? 0.22) + dEff * 0.075, dEff);
    this.camera.lookAt(0, this.lookY, 0);

    // living stage: glow follows the rarity colour, rays turn, sparkles drift
    this.rarityNow.lerp(this.rarityTarget, 1 - Math.exp(-LK.glowLerp * dt));
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    const hdr = 1.5 + this.pulse * 1.6;
    this.ringMat.color.copy(this.rarityNow).multiplyScalar(hdr);
    this.ring2Mat.color.copy(this.rarityNow).multiplyScalar(1.1);
    this.glowMat.color.copy(this.rarityNow);
    this.glowMat.opacity = 0.62 + this.pulse * 0.35;
    this.rayMat.color.copy(this.rarityNow).lerp(new THREE.Color('#ffffff'), 0.35);
    this.rayMat.opacity = 0.26 + this.pulse * 0.2;
    this.rays.rotation.z += LK.raySpeed * dt;
    const pos = this.sparkles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const sd = this.sparkleSeed;
      let y = pos.getY(i) + sd[i * 4 + 2] * dt;
      if (y > 5) y = 0;
      const a = sd[i * 4] + t * 0.05;
      pos.setXYZ(i, Math.cos(a) * sd[i * 4 + 1], y, Math.sin(a) * sd[i * 4 + 1] - 0.5);
    }
    pos.needsUpdate = true;
    (this.sparkles.material as THREE.PointsMaterial).size = 0.2 + Math.sin(t * 3) * 0.02;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // keep the player in the free space between the slot column and the option panel
    const phoneLand = h <= 520 && w > h; // a phone on its side: the right column holds rail + grid + PLAY
    const phonePort = w <= 700 && w < h; // a phone held upright: preview on top, the grid below
    const wide = w >= 900 && w / h > 1.1;
    const panelW = this.panel?.offsetWidth ?? 440;
    let sx = 0;
    let sy = 0;
    this.fitScale = 1;
    const rect = (sel: string): DOMRect | null => (this.ui.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect() ?? null;
    if (phoneLand) {
      // free room = between the ☰ button and the right column, under the title / charm chip, above the icon bar
      const menu = document.getElementById('menu-btn')?.getBoundingClientRect();
      const left = (menu && menu.width ? menu.right : 60) + 8;
      const right = (rect('.lk-panel')?.left ?? w - panelW - 16) - 8;
      const top = (rect('.lk-charms')?.bottom ?? 56) + 4;
      const bottom = (rect('.dr-bar')?.top ?? h - 66) - 4;
      sx = Math.round(w / 2 - (left + right) / 2);
      this.fitScale = clamp(0.677 / ((bottom - top) / h), 0.9, 1.8);
    } else if (phonePort) {
      // preview on top: under the title / charm chip, above the slot strip
      const top = (rect('.lk-charms')?.bottom ?? 84) + 6;
      const bottom = (rect('.lk-slots')?.top ?? h * 0.5) - 6;
      const previewH = Math.max(120, bottom - top);
      sy = Math.round(h / 2 - (top + bottom) / 2);
      this.fitScale = clamp(0.677 / (previewH / h), 1, 3.4);
    } else if (wide) sx = Math.round((panelW + 30 - 110) / 2);
    this.viewShift = sx;
    if (sx || sy) this.camera.setViewOffset(w, h, sx, sy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.ui.style.setProperty('--dr-shift', `${sx}px`);
  }
}
