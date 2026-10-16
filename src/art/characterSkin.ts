// Skinning support for the character: every outfit piece is baked into the bind pose
// (model space), tagged with the bone that drives it, and merged — per material
// category — into a handful of SkinnedMeshes that share one skeleton. A character is
// therefore <= 8 draw calls (skin, fabric, gloss, metal, eyes + optional plaid / LED /
// wings | diamonds | lenses) and <= 4 shadow casters, however many pieces it wears.
//
// Colors live in vertex colors, so the materials are global and shared.
import * as THREE from 'three';
import type { Finish } from './materials';
import { contrast, lum, tint, warmSkin, type Role } from './characterKit';

// ── categories ──────────────────────────────────────────────────────────────
export type Cat = 'skin' | 'fabric' | 'plaid' | 'gloss' | 'acc' | 'metal' | 'eyes' | 'led' | 'wing' | 'glow' | 'lens';
export const ALL_CATS: Cat[] = ['skin', 'fabric', 'plaid', 'gloss', 'acc', 'metal', 'eyes', 'led', 'wing', 'glow', 'lens'];
/** Categories that cast shadows (kept to 4 so a character is cheap in the shadow pass). */
export const SHADOW_CATS = new Set<Cat>(['skin', 'fabric', 'plaid', 'gloss']); // accessories are small: no shadow pass
/** Categories that should not receive shadows (tiny or see-through). */
export const NO_RECEIVE = new Set<Cat>(['eyes', 'lens', 'led']);

/**
 * Which merged mesh a piece lands in. Hair and shoes use 'gloss'; accessories (`acc` = true)
 * never do — glossy accessory parts get their own 'acc' mesh, satin ones ride on the satin
 * 'skin' mesh, metal on 'metal' — so a clip, bow or crown never shares the hair's material.
 */
export function catOf(role: Role, finish: Finish, acc = false): Cat {
  switch (role) {
    case 'skin': return 'skin';
    case 'led': return 'led';
    case 'wing': return 'wing';
    case 'lens': return 'lens';
    case 'diamond': return 'glow';
    case 'gold': return 'metal';
    case 'plaid': return 'plaid';
    case 'hair': return 'gloss'; // actual hair (e.g. the twist under a claw clip)
    case 'glass': return acc ? 'acc' : 'gloss';
    default:
      if (finish === 'metal') return 'metal';
      if (finish === 'fabric' || finish === 'matte') return 'fabric';
      if (acc) return finish === 'satin' ? 'skin' : 'acc';
      return 'gloss';
  }
}

export interface ColorCtx {
  skin: string;
  hair: string;
}
const _c = new THREE.Color();
/** Linear vertex color for a role (the outfit part color `color` drives main / trim / dark ...). */
export function roleColor(role: Role, color: string, ctx: ColorCtx): THREE.Color {
  switch (role) {
    case 'main': case 'plaid': case 'wing': return _c.set(color).clone();
    case 'trim': return _c.set(lum(color) > 0.75 ? tint(color, -0.18) : tint(color, 0.3)).clone();
    case 'dark': return _c.set(tint(color, -0.4)).clone();
    case 'white': return _c.set('#f4f2ee').clone();
    case 'cream': return _c.set('#efe6d2').clone();
    case 'gold': return _c.set('#ffc93c').clone();
    case 'skin': return _c.set(warmSkin(ctx.skin)).clone();
    case 'hair': return _c.set(ctx.hair).clone();
    case 'ink': return _c.set('#1d1b26').clone();
    case 'print': return _c.set(contrast(color)).clone();
    case 'pink': return _c.set('#ff2e88').clone();
    case 'cyan': return _c.set('#00d4ff').clone();
    case 'leaf': return _c.set('#2f6b4f').clone();
    case 'denim': return _c.set('#3d5a80').clone();
    case 'glass': return _c.set('#14131a').clone();
    case 'diamond': return _c.set('#e4fbff').clone();
    case 'led': return _c.set('#ffffff').clone();
    case 'lens': return _c.set('#d8f0ff').clone();
  }
}

// ── shared materials ────────────────────────────────────────────────────────
export interface Mats {
  skin: THREE.Material;
  fabric: THREE.Material;
  plaid: THREE.Material;
  gloss: THREE.Material;
  acc: THREE.Material;
  metal: THREE.Material;
  eyes: THREE.Material;
  wing: THREE.Material;
  glow: THREE.Material;
  lens: THREE.Material;
}
let mats: Mats | null = null;

function plaidTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(6, 0, 20, 64);
  g.fillRect(0, 6, 64, 20);
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.fillRect(38, 0, 10, 64);
  g.fillRect(0, 38, 64, 10);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(55, 0, 2, 64);
  g.fillRect(0, 55, 64, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function getMats(): Mats {
  if (mats) return mats;
  // Fabric: rough, almost no specular and NO sheen — black cloth must stay black under
  // bright studio lights and the ring-light environment.
  const fabric = { vertexColors: true, roughness: 0.95, metalness: 0, specularIntensity: 0.12, clearcoat: 0 } as const;
  mats = {
    // warm skin: soft sheen (a faint rosy glow at grazing angles reads as subsurface scattering) + a gentle clearcoat
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, clearcoat: 0.22, clearcoatRoughness: 0.5, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffa58a') }),
    fabric: new THREE.MeshPhysicalMaterial({ ...fabric }),
    plaid: new THREE.MeshPhysicalMaterial({ ...fabric, map: plaidTexture() }),
    gloss: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.28, clearcoatRoughness: 0.32, specularIntensity: 0.7 }),
    // accessories: glossy lacquer so a clip / headphones / bag catches the light and pops
    acc: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, specularIntensity: 1 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.9 }),
    eyes: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }),
    wing: new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, specularIntensity: 0.5, emissive: new THREE.Color('#9fb4ff'), emissiveIntensity: 0.2 }),
    glow: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.15, clearcoat: 1, emissive: new THREE.Color('#79e6ff'), emissiveIntensity: 0.5, flatShading: true }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#d8f0ff', roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
  };
  return mats;
}

// ── baking ──────────────────────────────────────────────────────────────────
/** A piece of geometry in model (bind-pose) space, ready to be concatenated. */
export interface Baked {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  col: Float32Array | null; // colors baked into the geometry (eyes, head blush) — multiplied by the chunk color
  w2: Float32Array | null; // per-vertex weight of a second bone (the w2 attribute of the geometry): bends the lips
  index: Uint32Array;
  n: number;
}
const bakeCache = new WeakMap<THREE.BufferGeometry, Map<string, Baked>>();
const _v = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * Transform `geo` by `m` (bone rest-world × optional placement). Cached per geometry when
 * `key` is given — the key must identify the matrix (bone id + placement).
 */
export function bakeGeo(geo: THREE.BufferGeometry, m: THREE.Matrix4, key?: string): Baked {
  if (key) {
    const hit = bakeCache.get(geo)?.get(key);
    if (hit) return hit;
  }
  const pa = geo.attributes.position;
  const na = geo.attributes.normal;
  const ua = geo.attributes.uv;
  const ca = geo.attributes.color;
  const n = pa.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  _nm.getNormalMatrix(m);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pa, i).applyMatrix4(m);
    pos[i * 3] = _v.x;
    pos[i * 3 + 1] = _v.y;
    pos[i * 3 + 2] = _v.z;
    if (na) {
      _v.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize();
      nrm[i * 3] = _v.x;
      nrm[i * 3 + 1] = _v.y;
      nrm[i * 3 + 2] = _v.z;
    }
    if (ua) {
      uv[i * 2] = ua.getX(i);
      uv[i * 2 + 1] = ua.getY(i);
    }
  }
  let col: Float32Array | null = null;
  if (ca) {
    col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = ca.getX(i);
      col[i * 3 + 1] = ca.getY(i);
      col[i * 3 + 2] = ca.getZ(i);
    }
  }
  const idx = geo.index;
  const ic = idx ? idx.count : n;
  const index = new Uint32Array(ic);
  for (let i = 0; i < ic; i++) index[i] = idx ? idx.getX(i) : i;
  // a mirrored matrix flips the winding: swap two indices per triangle to keep faces outward
  if (m.determinant() < 0) {
    for (let i = 0; i < ic; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
  }
  let w2: Float32Array | null = null;
  const wa = geo.attributes.w2;
  if (wa) {
    w2 = new Float32Array(n);
    for (let i = 0; i < n; i++) w2[i] = wa.getX(i);
  }
  const out: Baked = { pos, nrm, uv, col, w2, index, n };
  if (key) {
    let mp = bakeCache.get(geo);
    if (!mp) bakeCache.set(geo, (mp = new Map()));
    mp.set(key, out);
  }
  return out;
}

/** One baked piece placed on a bone, with its (linear) vertex color. */
export interface Chunk {
  cat: Cat;
  bone: number;
  /** optional second bone: vertices blend between `bone` and `bone2` by the geometry w2 attribute */
  bone2?: number;
  baked: Baked;
  r: number;
  g: number;
  b: number;
}

/** Concatenate chunks into one skinned BufferGeometry (rigid skinning: one bone per vertex). */
export function assembleGeometry(chunks: Chunk[]): THREE.BufferGeometry | null {
  let n = 0;
  let ni = 0;
  for (const c of chunks) {
    n += c.baked.n;
    ni += c.baked.index.length;
  }
  if (!n) return null;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const index = n < 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const c of chunks) {
    const b = c.baked;
    pos.set(b.pos, vo * 3);
    nrm.set(b.nrm, vo * 3);
    uv.set(b.uv, vo * 2);
    for (let i = 0; i < b.n; i++) {
      const k = vo + i;
      // baked vertex colors (eyes, the blushing head) are multiplied by the chunk color
      // (white for the eyes, the skin tone for the head)
      col[k * 3] = (b.col ? b.col[i * 3] : 1) * c.r;
      col[k * 3 + 1] = (b.col ? b.col[i * 3 + 1] : 1) * c.g;
      col[k * 3 + 2] = (b.col ? b.col[i * 3 + 2] : 1) * c.b;
      skinIndex[k * 4] = c.bone;
      if (b.w2 && c.bone2 !== undefined) {
        skinIndex[k * 4 + 1] = c.bone2;
        skinWeight[k * 4] = 1 - b.w2[i];
        skinWeight[k * 4 + 1] = b.w2[i];
      } else skinWeight[k * 4] = 1;
    }
    for (let i = 0; i < b.index.length; i++) index[io + i] = b.index[i] + vo;
    vo += b.n;
    io += b.index.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.6);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.1, -1), new THREE.Vector3(1, 2.3, 1));
  return g;
}
