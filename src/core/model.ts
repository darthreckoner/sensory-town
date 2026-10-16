// Shared data model for saves. Bump SAVE_VERSION and add a step to
// migrate() in save.ts whenever the shape of SaveData changes.

export const SAVE_VERSION = 2;

export type Hex = string; // '#rrggbb'

// ── Characters ──────────────────────────────────────────────────────────────
export interface OutfitPart {
  style: number; // index into the catalog for that slot
  color: Hex;
}
export interface Outfit {
  skin: Hex;
  hair: OutfitPart;
  top: OutfitPart;
  bottom: OutfitPart;
  shoes: OutfitPart;
  accessory: OutfitPart; // style 0 = none
}

// ── Workshop creations ──────────────────────────────────────────────────────
export type ShapeId = 'bun' | 'cat' | 'star' | 'peach' | 'cube' | 'heart' | 'bear' | 'strawberry' | 'cloud' | 'dragon';
export const SHAPES: ShapeId[] = ['bun', 'heart', 'star', 'cube', 'cloud', 'cat', 'bear', 'peach', 'strawberry', 'dragon'];

export type CreationKind = 'squishy' | 'slime' | 'wax';
export interface Creation {
  id: string;
  kind: CreationKind;
  createdAt: number;
  color: Hex;            // squishy body color / slime color
  shape?: ShapeId;       // squishy + wax
  face?: boolean;        // squishy/wax: kawaii face on (default off in v2)
  layers?: Hex[];        // wax coat layers, inner → outer
  finish?: string;       // wax finish: 'classic' | 'glitter' | 'chrome' | 'glow'
  slimeType?: string;    // slime: 'glossy' | 'butter' | 'clear' | 'crunchy' | 'holo' | 'galaxy'
  addins?: string[];     // slime add-ins: 'glitter' | 'sprinkles' | 'stars' | 'pearls'
  glitter?: number;      // slime glitter amount 0..1
}

// ── Profiles ────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  name: string;
  outfit: Outfit;
  carColor: Hex;
  /** car paint finish / extras: 'gloss' | 'chrome' | … and optional 'neon' underglow, 'trail' (rewards) */
  carStyle?: { finish?: string; neon?: Hex | null; trail?: boolean; rims?: Hex };
  creations: Creation[];
  /** charm ids collected around town (v2) */
  charms: string[];
  /** saved outfits ("Looks" in the Style studio), up to 4; slot i = looks[i] */
  looks?: Outfit[];
  createdAt: number;
}

// ── Town ────────────────────────────────────────────────────────────────────
export type PieceType =
  // structure (v1 names kept)
  | 'floor' | 'wall' | 'wallWindow' | 'wallDoor' | 'roofFlat' | 'roofGable'
  // structure (v2)
  | 'wallWindowBig' | 'wallGlassDoor' | 'wallGarage' | 'wallRail' | 'stairs' | 'roofSlant' | 'path'
  // living
  | 'sofa' | 'sofaL' | 'armchair' | 'coffeeTable' | 'table' | 'tvStand' | 'shelf' | 'lamp' | 'rug' | 'rugRect' | 'plant'
  // bedroom
  | 'bed' | 'bunkBed' | 'desk' | 'gamingChair' | 'vanity' | 'wardrobe' | 'beanBag' | 'nightstand'
  // kitchen
  | 'counter' | 'kitchenSink' | 'fridge' | 'stove' | 'island' | 'stool' | 'diningTable' | 'chair'
  // bath
  | 'tub' | 'toilet' | 'sink' | 'shower'
  // decor
  | 'gamingSetup' | 'ledStrip' | 'poster' | 'wallShelf' | 'mirror' | 'stringLights' | 'neonSign' | 'monstera'
  // outdoor
  | 'fenceSlat' | 'fencePicket' | 'hedge' | 'gardenBed' | 'trampoline' | 'bbq' | 'patioSet' | 'swing'
  | 'pool' | 'hotTub' | 'mailbox' | 'carport' | 'yardTree'
  | 'creation';

export interface PlacedPiece {
  id: string;
  type: PieceType;
  x: number;        // anchor cell column inside the plot (0..plotCells-1)
  z: number;        // anchor cell row inside the plot
  rot: 0 | 1 | 2 | 3; // quarter turns; for walls = which cell edge
  color: Hex;
  creationId?: string; // when type === 'creation' (owner's creation)
  level?: 0 | 1;       // v2: storey (default 0 = ground floor, 1 = upstairs)
  finish?: string;     // v2: material variant ('brick', 'oak', 'marble', neon shape...) - see build/finishes.ts
}

export interface House {
  plot: number;       // index into townLayout.plots
  ownerId: string;    // profile id
  pieces: PlacedPiece[];
}

export type DecoType = 'tree' | 'pine' | 'birch' | 'palm' | 'bush' | 'hedge' | 'planter' | 'flowers' | 'fence' | 'streetLamp' | 'bench';
export interface Decoration {
  id: string;
  type: DecoType;
  x: number;  // world units
  z: number;
  rot: number; // radians
  color: Hex;
  ownerId: string;
}

export interface Town {
  houses: House[];
  decorations: Decoration[];
}

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  musicInWorkshop: boolean;
}

export interface SaveData {
  version: number;
  profiles: Profile[];
  activeProfileId: string | null;
  town: Town;
  settings: Settings;
}

// ── Factories ───────────────────────────────────────────────────────────────
export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/** v2 starter looks (tween-cool, see docs/ART_DIRECTION.md). Indices = OUTFIT_CATALOG v2. */
export const STARTER_OUTFITS: Outfit[] = [
  {
    skin: '#f6c9a8',
    hair: { style: 4, color: '#6e4a33' }, // waves
    top: { style: 3, color: '#ff2e88' }, // varsity
    bottom: { style: 0, color: '#3d5a80' }, // baggy denim
    shoes: { style: 0, color: '#f6f6f4' }, // chunky
    accessory: { style: 1, color: '#16151c' }, // headphones
  },
  {
    skin: '#c58a5f',
    hair: { style: 0, color: '#16151c' }, // fade
    top: { style: 1, color: '#7c4dff' }, // hoodie
    bottom: { style: 3, color: '#6b7a3c' }, // cargo
    shoes: { style: 1, color: '#e23b3b' }, // hi-tops
    accessory: { style: 10, color: '#16151c' }, // cap
  },
];
/** v1 starter looks — used only to upgrade untouched v1 saves (see save.ts migrate). */
export const V1_STARTER_OUTFITS: Outfit[] = [
  { skin: '#f6c9a8', hair: { style: 1, color: '#8a5a44' }, top: { style: 0, color: '#ff8fb1' }, bottom: { style: 2, color: '#9d8cff' }, shoes: { style: 0, color: '#ffffff' }, accessory: { style: 3, color: '#ffd166' } },
  { skin: '#e0a87e', hair: { style: 3, color: '#3d3a4b' }, top: { style: 1, color: '#5fd3a5' }, bottom: { style: 0, color: '#5aa9ff' }, shoes: { style: 3, color: '#ff5d8f' }, accessory: { style: 1, color: '#3d3a4b' } },
];
const STARTER_CARS: Hex[] = ['#e23b3b', '#3d6bff', '#16151c', '#f6f6f4', '#7c4dff', '#ffc93c'];
export const V1_STARTER_CARS: Hex[] = ['#ff5d8f', '#5aa9ff', '#ffd166', '#5fd3a5', '#9d8cff', '#ffb38a'];

export function makeProfile(name: string, index: number): Profile {
  const outfit = structuredClone(STARTER_OUTFITS[index % STARTER_OUTFITS.length]);
  return {
    id: uid('p_'),
    name,
    outfit,
    carColor: STARTER_CARS[index % STARTER_CARS.length],
    creations: [],
    charms: [],
    createdAt: Date.now(),
  };
}

export function defaultSettings(): Settings {
  return { master: 0.9, sfx: 0.9, music: 0.35, musicInWorkshop: false };
}

export function emptySave(names: string[]): SaveData {
  const profiles = names.map((n, i) => makeProfile(n, i));
  return {
    version: SAVE_VERSION,
    profiles,
    activeProfileId: null,
    town: { houses: [], decorations: [] },
    settings: defaultSettings(),
  };
}
