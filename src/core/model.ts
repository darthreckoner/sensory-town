// Shared data model for saves. Bump SAVE_VERSION and add a step to
// migrate() in save.ts whenever the shape of SaveData changes.

export const SAVE_VERSION = 1;

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
export type ShapeId = 'bun' | 'cat' | 'star' | 'peach' | 'cube';
export const SHAPES: ShapeId[] = ['bun', 'cat', 'star', 'peach', 'cube'];

export type CreationKind = 'squishy' | 'slime' | 'wax';
export interface Creation {
  id: string;
  kind: CreationKind;
  createdAt: number;
  color: Hex;            // squishy body color / slime color
  shape?: ShapeId;       // squishy + wax
  layers?: Hex[];        // wax coat layers, inner → outer
  addins?: string[];     // slime add-ins: 'glitter' | 'sprinkles' | 'stars' | 'pearls'
  glitter?: number;      // slime glitter amount 0..1
}

// ── Profiles ────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  name: string;
  outfit: Outfit;
  carColor: Hex;
  creations: Creation[];
  createdAt: number;
}

// ── Town ────────────────────────────────────────────────────────────────────
export type PieceType =
  | 'floor' | 'wall' | 'wallWindow' | 'wallDoor' | 'roofFlat' | 'roofGable'
  | 'bed' | 'sofa' | 'table' | 'lamp' | 'plant' | 'shelf' | 'rug'
  | 'creation';

export interface PlacedPiece {
  id: string;
  type: PieceType;
  x: number;        // cell column inside the plot (0..plotCells-1)
  z: number;        // cell row inside the plot
  rot: 0 | 1 | 2 | 3; // quarter turns; for walls = which cell edge
  color: Hex;
  creationId?: string; // when type === 'creation' (owner's creation)
}

export interface House {
  plot: number;       // index into townLayout.plots
  ownerId: string;    // profile id
  pieces: PlacedPiece[];
}

export type DecoType = 'tree' | 'pine' | 'bush' | 'flowers' | 'fence' | 'streetLamp' | 'bench';
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

const STARTER_OUTFITS: Outfit[] = [
  {
    skin: '#f6c9a8',
    hair: { style: 1, color: '#8a5a44' },
    top: { style: 0, color: '#ff8fb1' },
    bottom: { style: 2, color: '#9d8cff' },
    shoes: { style: 0, color: '#ffffff' },
    accessory: { style: 3, color: '#ffd166' },
  },
  {
    skin: '#e0a87e',
    hair: { style: 3, color: '#3d3a4b' },
    top: { style: 1, color: '#5fd3a5' },
    bottom: { style: 0, color: '#5aa9ff' },
    shoes: { style: 3, color: '#ff5d8f' },
    accessory: { style: 1, color: '#3d3a4b' },
  },
];
const STARTER_CARS: Hex[] = ['#ff5d8f', '#5aa9ff', '#ffd166', '#5fd3a5', '#9d8cff', '#ffb38a'];

export function makeProfile(name: string, index: number): Profile {
  const outfit = structuredClone(STARTER_OUTFITS[index % STARTER_OUTFITS.length]);
  return {
    id: uid('p_'),
    name,
    outfit,
    carColor: STARTER_CARS[index % STARTER_CARS.length],
    creations: [],
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
