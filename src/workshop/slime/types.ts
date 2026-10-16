// Slime types. Each type is a (sim override table in tuning.slime.types) + a look (shader mode and
// physical-material settings) + a "kind" string that travels with the slime events so juice can pick
// a matching sound. Holo and Galaxy are bonus rewards behind charms (see core/unlocks.ts).
import type { SlimeLook } from './slimeMaterial';

export type SlimeTypeId = 'glossy' | 'butter' | 'clear' | 'crunchy' | 'cloud' | 'holo' | 'galaxy';

export interface SlimeTypeDef {
  id: SlimeTypeId;
  name: string;
  icon: string;
  /** reward id in core/unlocks.ts, if this type is a bonus */
  reward?: string;
  /** crunchy: beads inside */
  beads?: boolean;
  look: SlimeLook;
}

const BASE: SlimeLook = {
  mode: 0,
  roughness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  sheen: 0.5,
  sheenRoughness: 0.35,
  iridescence: 0.28,
  iridescenceIOR: 1.35,
  iridescenceThickness: [120, 380],
  ior: 1.45,
  env: 1.4,
  thinK: 1,
  ringMul: 1,
  ledMul: 1,
  whiten: 0,
};

export const SLIME_TYPES: SlimeTypeDef[] = [
  { id: 'glossy', name: 'Glossy', icon: '💧', look: { ...BASE } },
  {
    id: 'butter',
    name: 'Butter',
    icon: '🧈',
    look: { ...BASE, mode: 1, roughness: 0.72, clearcoat: 0.15, clearcoatRoughness: 0.45, sheen: 1, sheenRoughness: 0.5, iridescence: 0, env: 0.7, thinK: 0.4, ringMul: 0.15, ledMul: 0.5, whiten: 0.14 },
  },
  {
    id: 'clear',
    name: 'Clear',
    icon: '🧊',
    look: { ...BASE, mode: 2, roughness: 0.03, clearcoatRoughness: 0.01, sheen: 0.2, iridescence: 0.35, ior: 1.5, env: 1.9, thinK: 0.7, ringMul: 1.3, ledMul: 1.2 },
  },
  {
    id: 'crunchy',
    name: 'Crunchy',
    icon: '🍡',
    beads: true,
    look: { ...BASE, mode: 3, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.4, iridescence: 0, env: 1, thinK: 0.8, ringMul: 0.5, ledMul: 0.8 },
  },
  {
    id: 'cloud',
    name: 'Cloud',
    icon: '☁️',
    look: { ...BASE, mode: 4, roughness: 0.92, clearcoat: 0, sheen: 1, sheenRoughness: 0.25, iridescence: 0, env: 0.5, thinK: 0.5, ringMul: 0, ledMul: 0.8 },
  },
  {
    id: 'holo',
    name: 'Holo',
    icon: '🪩',
    reward: 'slime.holo',
    look: { ...BASE, mode: 5, roughness: 0.12, clearcoatRoughness: 0.02, sheen: 0.6, iridescence: 1, iridescenceIOR: 1.6, iridescenceThickness: [200, 700], env: 1.8, thinK: 0.5, ringMul: 1.2 },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    icon: '🌌',
    reward: 'slime.galaxy',
    look: { ...BASE, mode: 6, roughness: 0.2, clearcoatRoughness: 0.05, sheen: 0.3, iridescence: 0.5, env: 1.3, thinK: 0.3, ringMul: 0.9, ledMul: 1.2 },
  },
];

export function slimeType(id: string | undefined): SlimeTypeDef {
  return SLIME_TYPES.find((t) => t.id === id) ?? SLIME_TYPES[0];
}
