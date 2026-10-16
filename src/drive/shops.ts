// Downtown buildings: a generic storefront generator plus the hand-built
// landmarks (the Studio, the Mall, the Cinema, the Arcade, the STYLE boutique,
// boba café, sneaker shop, diner). Modelled in local space (front = +z) and
// placed with the Mesher's transform stack.
import * as THREE from 'three';
import type { Collider } from '../world/townEnv';
import { Mesher } from './mesher';
import { FACADE_TILE, bigSignTexture, facadeMat, mat, signUV, signs, storefrontMat, textMat } from './kit';
import { PAL } from './palette';
import { STAIRS } from '../world/townLayout';

export type Face = 'n' | 's' | 'e' | 'w';
export const faceYaw = (f: Face): number => (f === 's' ? 0 : f === 'n' ? Math.PI : f === 'e' ? Math.PI / 2 : -Math.PI / 2);
export const faceNormal = (f: Face): [number, number] => (f === 's' ? [0, 1] : f === 'n' ? [0, -1] : f === 'e' ? [1, 0] : [-1, 0]);

export interface DoorSpot { x: number; z: number; nx: number; nz: number }
export interface Built {
  colliders: Collider[];
  door: DoorSpot;
  /** top of the building */
  height: number;
}

export interface ShopOpts {
  x: number; z: number; w: number; d: number; h: number;
  face: Face;
  wall: string;
  kind?: 'punch' | 'curtain' | 'ribbon';
  seed?: number;
  sign: { text: string; fg: string; glow: string };
  awning?: [string, string];
  storefront?: 'glass' | 'dark' | 'warm';
  gf?: number;
  roofUnits?: boolean;
}

/** A thin sloped slab (awning / canopy) with both faces. */
export function slab(m: Mesher, x0: number, x1: number, yHi: number, zHi: number, yLo: number, zLo: number, color: string, material = mat.vc()): void {
  m.quad(material, [x0, yHi, zHi], [x0, yLo, zLo], [x1, yLo, zLo], [x1, yHi, zHi], undefined, color); // top
  m.quad(material, [x0, yHi, zHi], [x1, yHi, zHi], [x1, yLo, zLo], [x0, yLo, zLo], undefined, new THREE.Color(color).multiplyScalar(0.7)); // underside
}

/** Striped awning across a storefront. */
export function awning(m: Mesher, w: number, y: number, z: number, depth: number, drop: number, c1: string, c2: string): void {
  const n = Math.max(2, Math.round(w / 0.9));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * sw, x1 = x0 + sw;
    slab(m, x0, x1, y, z, y - drop, z + depth, i % 2 ? c1 : c2);
  }
  // front valance
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * sw, x1 = x0 + sw;
    m.quad(mat.vc(), [x0, y - drop, z + depth], [x1, y - drop, z + depth], [x1, y - drop - 0.35, z + depth], [x0, y - drop - 0.35, z + depth], undefined, i % 2 ? c1 : c2);
  }
}

function signQuad(m: Mesher, rect: ReturnType<ReturnType<typeof signs>['add']>, cx: number, cy: number, z: number, h: number, maxW: number): void {
  const w = Math.min(maxW, h * rect.aspect);
  const hh = w / rect.aspect;
  m.box(mat.trim(), cx, cy, z - 0.07, w + 0.4, hh + 0.3, 0.16);
  m.quad(signs().material, [cx - w / 2, cy - hh / 2, z], [cx + w / 2, cy - hh / 2, z], [cx + w / 2, cy + hh / 2, z], [cx - w / 2, cy + hh / 2, z], signUV(rect));
}

function roofClutter(m: Mesher, w: number, d: number, h: number, seed: number): void {
  let s = seed * 9301 + 49297;
  const r = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const conc = mat.concrete();
  for (let i = 0; i < 3; i++) {
    const bw = 1.4 + r() * 1.6, bd = 1.2 + r() * 1.2, bh = 0.7 + r() * 0.9;
    m.box(conc, (r() - 0.5) * (w - 4), h + 0.1 + bh / 2, (r() - 0.5) * (d - 4) - 1, bw, bh, bd);
  }
  m.box(mat.std('#6c7280', 0.6, 0.5), (r() - 0.5) * (w - 4), h + 0.55, -d / 4, 0.5, 1.0, 0.5);
}

/** Generic storefront building. */
export function shop(m: Mesher, o: ShopOpts): Built {
  const { x, z, w, d, h, face } = o;
  const gf = o.gf ?? 4.4;
  const yaw = faceYaw(face);
  m.push(x, z, yaw);
  const wallMat = mat.std(o.wall, 0.92);
  m.box(wallMat, 0, gf / 2, 0, w, gf, d);
  m.box(facadeMat(o.wall, o.kind ?? 'punch', o.seed ?? 1), 0, gf + (h - gf) / 2, 0, w, h - gf, d, { tile: FACADE_TILE, vOff: -gf, skip: ['top', 'bottom'] });
  // shop window + door
  const fz = d / 2 + 0.04;
  m.quad(storefrontMat(o.storefront ?? 'glass'), [-w / 2 + 0.35, 0.25, fz], [w / 2 - 0.35, 0.25, fz], [w / 2 - 0.35, gf - 0.55, fz], [-w / 2 + 0.35, gf - 0.55, fz]);
  // roof slab + parapet
  m.box(mat.roof(), 0, h + 0.06, 0, w - 0.1, 0.14, d - 0.1);
  const t = mat.trim();
  m.box(t, 0, h + 0.3, d / 2 - 0.1, w, 0.55, 0.22);
  m.box(t, 0, h + 0.3, -d / 2 + 0.1, w, 0.55, 0.22);
  m.box(t, -w / 2 + 0.1, h + 0.3, 0, 0.22, 0.55, d);
  m.box(t, w / 2 - 0.1, h + 0.3, 0, 0.22, 0.55, d);
  if (o.roofUnits !== false) roofClutter(m, w, d, h, Math.floor(x * 7 + z * 13));
  // neon sign over the shop window
  signQuad(m, signs().add(o.sign.text, { fg: o.sign.fg, glow: o.sign.glow }), 0, gf + 0.95, d / 2 + 0.12, 1.7, w - 1);
  if (o.awning) awning(m, w - 0.8, gf - 0.4, d / 2, 1.5, 0.55, o.awning[0], o.awning[1]);
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 0.9);
    const [nx, nz] = faceNormal(face);
    return { x: wx, z: wz, nx, nz };
  })();
  m.pop();
  const swap = face === 'e' || face === 'w';
  return { colliders: [{ kind: 'box', x, z, hw: (swap ? d : w) / 2, hd: (swap ? w : d) / 2 }], door, height: h };
}

// ── the Studio (workshop) ───────────────────────────────────────────────────
export function studio(m: Mesher, ex: THREE.Group, cx: number, cz: number, w: number, d: number, h: number): Built {
  m.push(cx, cz, 0);
  const t = mat.trim();
  const dark = mat.std('#23222a', 0.7);
  const gf = 5.4;
  // concrete shell
  m.box(dark, 0, gf / 2, 0, w, gf, d);
  m.box(facadeMat('#2e2b3a', 'ribbon', 3), 0, gf + (h - gf) / 2, 1.0, w + 0.8, h - gf, d + 2.0, { tile: FACADE_TILE, vOff: -gf, skip: ['bottom'] });
  m.box(mat.roof(), 0, h + 0.07, 1.0, w + 0.8, 0.16, d + 2.0);
  // glass front: full-width curtain, recessed door bay in the middle
  const fz = d / 2 + 0.05;
  m.quad(storefrontMat('dark'), [-w / 2 + 1.1, 0.2, fz], [w / 2 - 1.1, 0.2, fz], [w / 2 - 1.1, gf - 0.3, fz], [-w / 2 + 1.1, gf - 0.3, fz]);
  for (const sx of [-1, 1]) m.box(mat.concrete(), sx * (w / 2 - 0.5), gf / 2, d / 2 + 0.1, 1.0, gf, 0.3);
  // neon edges
  const cyan = mat.neon(PAL.cyan), pink = mat.neon(PAL.pink);
  m.box(cyan, 0, gf + 0.04, d / 2 + 0.13, w - 2, 0.1, 0.1);
  m.box(pink, 0, h - 0.18, d / 2 + 2.05, w + 0.8, 0.12, 0.12);
  for (const sx of [-1, 1]) m.box(cyan, sx * (w / 2 - 1.15), gf / 2, d / 2 + 0.16, 0.1, gf - 0.5, 0.1);
  // entrance canopy with an LED underside
  m.box(t, 0, gf - 0.25, d / 2 + 1.4, 6.4, 0.22, 2.7);
  m.box(mat.neon('#ffffff'), 0, gf - 0.39, d / 2 + 1.4, 6.0, 0.05, 2.3);
  // roof parapet
  const rz = 1.0, rd = d + 2.0;
  m.box(t, 0, h + 0.35, rz + rd / 2 - 0.1, w + 0.8, 0.6, 0.22);
  m.box(t, 0, h + 0.35, rz - rd / 2 + 0.1, w + 0.8, 0.6, 0.22);
  for (const sx of [-1, 1]) m.box(t, sx * (w / 2 + 0.3), h + 0.35, rz, 0.22, 0.6, rd);
  // rooftop AC + tall ring light on a stand (a skyline signature)
  m.box(mat.concrete(), -8, h + 0.7, -2, 3, 1.2, 2);
  m.box(mat.concrete(), 6, h + 0.6, -3, 2.4, 1, 1.8);
  for (const sx of [-1, 1]) m.box(t, sx * 0.9, h + 1.7, 0.5, 0.16, 3.2, 0.16);
  const [rx, rz2] = m.toWorld(0, 0.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 8, 36), mat.neon('#ffffff'));
  ring.position.set(rx, h + 4.1, rz2);
  ring.castShadow = false;
  ex.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.07, 8, 36), mat.neon(PAL.pink));
  ring2.position.copy(ring.position);
  ex.add(ring2);
  // the big sign + ring-light motifs on the facade
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 3.9), new THREE.MeshBasicMaterial({ map: bigSignTexture('STUDIO', '#ffffff', PAL.pink, 1024, 256, 'WAX · SLIME · SQUISH'), toneMapped: false }));
  const [sx, sz] = m.toWorld(0, d / 2 + 2.07);
  sign.position.set(sx, 7.6, sz);
  ex.add(sign);
  for (const [px, col] of [[10.6, PAL.pink], [-10.6, PAL.cyan]] as [number, string][]) {
    const [wx, wz] = m.toWorld(px, d / 2 + 2.12);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.09, 8, 28), mat.neon(col));
    r1.position.set(wx, 7.6, wz);
    ex.add(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 24), mat.neon('#ffffff'));
    r2.position.copy(r1.position);
    ex.add(r2);
  }
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 1.0);
    return { x: wx, z: wz, nx: 0, nz: 1 };
  })();
  m.pop();
  return { colliders: [{ kind: 'box', x: cx, z: cz, hw: w / 2 + 0.4, hd: d / 2 }], door, height: h };
}

// ── the Mall ────────────────────────────────────────────────────────────────
export function mall(m: Mesher, ex: THREE.Group, cx: number, cz: number, w: number, d: number, h: number): Built {
  // building (front faces north)
  m.push(cx, cz, Math.PI);
  const plaster = mat.std('#d8d2c6', 0.92);
  m.box(plaster, 0, 3.0, 0, w, 6.0, d);
  m.box(facadeMat('#d8d2c6', 'ribbon', 5), 0, 6 + (h - 6) / 2, 0, w, h - 6, d, { tile: FACADE_TILE, vOff: -6, skip: ['top', 'bottom'] });
  // glass atrium
  m.box(facadeMat('#6f95bd', 'curtain', 2), 0, h / 2, d / 2 + 0.25, 13, h - 0.2, 0.5, { tile: FACADE_TILE });
  m.quad(storefrontMat('warm'), [-w / 2 + 0.5, 0.3, d / 2 + 0.05], [-6.6, 0.3, d / 2 + 0.05], [-6.6, 5.3, d / 2 + 0.05], [-w / 2 + 0.5, 5.3, d / 2 + 0.05]);
  m.quad(storefrontMat('warm'), [6.6, 0.3, d / 2 + 0.05], [w / 2 - 0.5, 0.3, d / 2 + 0.05], [w / 2 - 0.5, 5.3, d / 2 + 0.05], [6.6, 5.3, d / 2 + 0.05]);
  const t = mat.trim();
  m.box(mat.roof(), 0, h + 0.05, 0, w - 0.1, 0.14, d - 0.1);
  // entrance canopy
  m.box(t, 0, 4.4, d / 2 + 1.8, 9, 0.24, 3.6);
  m.box(mat.neon('#ffffff'), 0, 4.27, d / 2 + 1.8, 8.6, 0.05, 3.2);
  for (const sx of [-4.2, 4.2]) m.box(mat.chrome(), sx, 2.2, d / 2 + 3.4, 0.22, 4.4, 0.22);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.6), new THREE.MeshBasicMaterial({ map: bigSignTexture('MALL', '#fff6df', PAL.gold, 1024, 256), toneMapped: false }));
  const [sx, sz] = m.toWorld(0, d / 2 + 0.6);
  sign.position.set(sx, h - 1.6, sz);
  sign.rotation.y = Math.PI;
  ex.add(sign);
  m.box(mat.neon(PAL.gold), 0, h - 0.2, d / 2 + 0.55, 13, 0.1, 0.1);
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 1.2);
    return { x: wx, z: wz, nx: 0, nz: -1 };
  })();
  m.pop();

  // rooftop terrace, in world coordinates: railing, planters, benches, string lights
  m.push(0, 0, 0);
  const y0 = h + 0.14;
  const rail = mat.std('#23222a', 0.5, 0.4);
  const glass = mat.glass();
  const x0 = cx - w / 2 + 0.3, x1 = cx + w / 2 - 0.3, z0 = cz - d / 2 + 0.3, z1 = cz + d / 2 - 0.3;
  const gap0 = 8.5, gap1 = 14.2; // the stairs come up through this gap in the back railing (world x)
  m.box(rail, (x0 + x1) / 2, y0 + 1.0, z0, x1 - x0, 0.08, 0.08); // north (front) rail
  m.box(glass, (x0 + x1) / 2, y0 + 0.5, z0, x1 - x0, 0.95, 0.04);
  for (const sx2 of [x0, x1]) {
    m.box(rail, sx2, y0 + 1.0, (z0 + z1) / 2, 0.08, 0.08, z1 - z0);
    m.box(glass, sx2, y0 + 0.5, (z0 + z1) / 2, 0.04, 0.95, z1 - z0);
  }
  for (const [a, b] of [[x0, gap0], [gap1, x1]]) {
    m.box(rail, (a + b) / 2, y0 + 1.0, z1, b - a, 0.08, 0.08);
    m.box(glass, (a + b) / 2, y0 + 0.5, z1, b - a, 0.95, 0.04);
  }
  // planters with shrubs, benches, a couple of loungers, bulbs
  const wood = mat.wood();
  const green = mat.std('#3f8f4a', 0.9);
  for (let i = 0; i < 5; i++) {
    const px = x0 + 3 + i * ((x1 - x0 - 6) / 4);
    m.box(wood, px, y0 + 0.3, z0 + 1.2, 2.2, 0.6, 0.8);
    m.box(green, px, y0 + 0.85, z0 + 1.2, 2.0, 0.6, 0.6);
  }
  for (const [bx, bz] of [[cx - 5, cz - 1], [cx + 4, cz + 1], [cx + 9, cz - 4]]) {
    m.box(wood, bx, y0 + 0.45, bz, 2.4, 0.12, 0.7);
    m.box(wood, bx, y0 + 0.8, bz - 0.3, 2.4, 0.5, 0.1);
    m.box(t, bx - 1.0, y0 + 0.22, bz, 0.12, 0.44, 0.6);
    m.box(t, bx + 1.0, y0 + 0.22, bz, 0.12, 0.44, 0.6);
  }
  // string lights on two poles
  for (const px of [cx - 8, cx + 8]) m.box(t, px, y0 + 1.6, cz + 3, 0.1, 3.2, 0.1);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, px = cx - 8 + 16 * u, py = y0 + 3.0 - Math.sin(Math.PI * u) * 0.45;
    m.box(mat.neon('#ffd98a'), px, py, cz + 3, 0.16, 0.16, 0.16);
  }
  // the exterior stairs (solid steps matching the stepped walk surface in heightfield.ts)
  const st = STAIRS.find((s) => s.id === 'mall');
  if (st) {
    const n = Math.max(2, Math.round(st.len / 0.9));
    const xs = st.x - st.len / 2 * Math.sin(st.yaw) * -1; // yaw -π/2: ascends towards -x, start at +x end
    const startX = st.x + st.len / 2;
    void xs;
    const concrete = mat.concrete();
    for (let i = 0; i < n; i++) {
      const top = (st.h * (i + 1)) / n;
      m.box(concrete, startX - (i + 0.5) * (st.len / n), top / 2, st.z, st.len / n, top, st.w);
    }
    // the top landing (DECKS 'mall_landing'): a slab on posts, railed on the open sides
    {
      const lx0 = 8.5, lx1 = startX - st.len + 0.4, lz0 = cz + d / 2, lz1 = 30.8;
      const ly = st.h + 0.1;
      m.box(concrete, (lx0 + lx1) / 2, ly - 0.15, (lz0 + lz1) / 2, lx1 - lx0, 0.3, lz1 - lz0);
      for (const [px, pz] of [[lx0 + 0.25, lz1 - 0.25], [lx1 - 0.25, lz1 - 0.25], [lx0 + 0.25, lz0 + 0.3]] as [number, number][])
        m.box(concrete, px, (ly - 0.3) / 2, pz, 0.35, ly - 0.3, 0.35);
      m.box(rail, (lx0 + lx1) / 2, ly + 1.0, lz1, lx1 - lx0, 0.08, 0.08);
      m.box(rail, lx0, ly + 1.0, (lz0 + lz1) / 2, 0.08, 0.08, lz1 - lz0);
      for (const [px, pz] of [[lx0, lz1], [lx1, lz1], [lx0, lz0]] as [number, number][]) m.box(rail, px, ly + 0.5, pz, 0.07, 1.0, 0.07);
    }
    // handrails on both sides + posts
    for (const sd of [-1, 1]) {
      const zz = st.z + sd * (st.w / 2 + 0.05);
      m.quad(rail, [startX, 1.0, zz], [startX - st.len, st.h + 1.0, zz], [startX - st.len, st.h + 1.06, zz], [startX, 1.06, zz]);
      m.quad(rail, [startX, 1.0, zz], [startX, 1.06, zz], [startX - st.len, st.h + 1.06, zz], [startX - st.len, st.h + 1.0, zz]);
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        m.box(rail, startX - st.len * u, ((st.h * u) + 1.0) / 2, zz, 0.07, (st.h * u) + 1.0, 0.07);
      }
    }
  }
  m.pop();
  return { colliders: [{ kind: 'box', x: cx, z: cz, hw: w / 2, hd: d / 2, h: h }], door, height: h };
}

// ── the Cinema ──────────────────────────────────────────────────────────────
function posterMat(title: string, emoji: string, c1: string, c2: string): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 384);
  x.font = '120px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(emoji, 128, 150);
  x.font = '900 40px "Arial Black",Arial,sans-serif';
  x.fillStyle = '#ffffff';
  x.shadowColor = '#000';
  x.shadowBlur = 10;
  x.fillText(title, 128, 290);
  x.font = '800 22px Arial,sans-serif';
  x.fillText('NOW SHOWING', 128, 335);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
}

export function cinema(m: Mesher, ex: THREE.Group, cx: number, cz: number, w: number, d: number, h: number, beams: THREE.Mesh[]): Built {
  m.push(cx, cz, 0);
  const navy = mat.std('#2c3e5c', 0.9);
  const t = mat.trim();
  m.box(navy, 0, h / 2, 0, w, h, d);
  m.box(mat.roof(), 0, h + 0.06, 0, w - 0.1, 0.14, d - 0.1);
  m.box(t, 0, h + 0.3, d / 2 - 0.1, w, 0.55, 0.22);
  // three posters in lit frames
  const posters: [string, string, string, string][] = [['STAR RUN', '🚀', '#7c4dff', '#ff2e88'], ['DINO PARK', '🦖', '#2f7a45', '#ffc93c'], ['NEON KISS', '💫', '#00d4ff', '#7c4dff']];
  posters.forEach(([title, emoji, c1, c2], i) => {
    const px = -w / 2 + 3.6 + i * 5.6;
    const pm = posterMat(title, emoji, c1, c2);
    m.box(t, px, 3.6, d / 2 + 0.06, 3.5, 4.9, 0.12);
    m.quad(pm, [px - 1.6, 1.25, d / 2 + 0.14], [px + 1.6, 1.25, d / 2 + 0.14], [px + 1.6, 5.85, d / 2 + 0.14], [px - 1.6, 5.85, d / 2 + 0.14]);
  });
  // dark box-office glass under the marquee
  m.quad(storefrontMat('dark'), [-w / 2 + 0.5, 0.2, d / 2 + 0.05], [w / 2 - 0.5, 0.2, d / 2 + 0.05], [w / 2 - 0.5, 1.15, d / 2 + 0.05], [-w / 2 + 0.5, 1.15, d / 2 + 0.05]);
  // marquee with a row of gold bulbs
  m.box(t, 0, 7.2, d / 2 + 1.6, w - 1, 0.7, 3.2);
  const gold = mat.neon(PAL.gold);
  for (let i = 0; i < 22; i++) m.box(gold, -w / 2 + 1 + i * ((w - 2) / 21), 7.2, d / 2 + 3.25, 0.2, 0.2, 0.2);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2), new THREE.MeshBasicMaterial({ map: bigSignTexture('CINEMA', '#fff2cf', PAL.pink, 1024, 256, 'ULTRA SCREENS'), toneMapped: false }));
  const [sx, sz] = m.toWorld(0, d / 2 + 0.12);
  sign.position.set(sx, 9.8, sz);
  ex.add(sign);
  // premiere searchlights on the roof
  for (const sx2 of [-1, 1]) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 34, 12, 1, true).translate(0, 17, 0),
      new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }),
    );
    const [bx, bz] = m.toWorld(sx2 * 7, 0);
    beam.position.set(bx, h + 0.4, bz);
    beam.userData.phase = sx2;
    ex.add(beam);
    beams.push(beam);
    m.box(t, sx2 * 7, h + 0.7, 0, 0.9, 0.7, 0.9);
  }
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 1.0);
    return { x: wx, z: wz, nx: 0, nz: 1 };
  })();
  m.pop();
  return { colliders: [{ kind: 'box', x: cx, z: cz, hw: w / 2, hd: d / 2 }], door, height: h };
}

// ── the Arcade ──────────────────────────────────────────────────────────────
function invaderMat(): THREE.MeshBasicMaterial {
  const pat = [
    '..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...',
  ];
  const c = document.createElement('canvas');
  c.width = 11 * 8;
  c.height = 8 * 8;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0f0e17';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = PAL.lime;
  x.shadowColor = PAL.lime;
  x.shadowBlur = 10;
  pat.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && x.fillRect(i * 8 + 1, j * 8 + 1, 6, 6)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
}

export function arcade(m: Mesher, cx: number, cz: number, w: number, d: number, h: number): Built {
  m.push(cx, cz, 0);
  const black = mat.std('#1d1b26', 0.85);
  const t = mat.trim();
  m.box(black, 0, h / 2, 0, w, h, d);
  m.box(mat.roof(), 0, h + 0.06, 0, w - 0.1, 0.14, d - 0.1);
  m.box(t, 0, h + 0.3, d / 2 - 0.1, w, 0.55, 0.22);
  m.quad(storefrontMat('dark'), [-w / 2 + 0.4, 0.2, d / 2 + 0.05], [w / 2 - 0.4, 0.2, d / 2 + 0.05], [w / 2 - 0.4, 4.2, d / 2 + 0.05], [-w / 2 + 0.4, 4.2, d / 2 + 0.05]);
  // magenta + cyan edge neon
  m.box(mat.neon(PAL.pink), 0, 4.45, d / 2 + 0.1, w - 0.6, 0.12, 0.12);
  m.box(mat.neon(PAL.cyan), 0, 0.12, d / 2 + 0.1, w - 0.6, 0.1, 0.1);
  signQuad(m, signs().add('ARCADE', { fg: '#ffffff', glow: PAL.cyan, slotW: 1 }), 0, 5.4, d / 2 + 0.12, 1.8, w - 0.6);
  // pixel invader mural
  m.quad(invaderMat(), [-3.6, 6.1, d / 2 + 0.06], [3.6, 6.1, d / 2 + 0.06], [3.6, 11.8 - 3.1, d / 2 + 0.06], [-3.6, 11.8 - 3.1, d / 2 + 0.06]);
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 1.0);
    return { x: wx, z: wz, nx: 0, nz: 1 };
  })();
  m.pop();
  return { colliders: [{ kind: 'box', x: cx, z: cz, hw: w / 2, hd: d / 2 }], door, height: h };
}

// ── STYLE boutique: a glass display window with mannequins ──────────────────
export function boutique(m: Mesher, ex: THREE.Group, cx: number, cz: number, w: number, d: number, h: number): Built {
  m.push(cx, cz, Math.PI); // front faces north
  const white = mat.std('#f3f2ee', 0.9);
  const t = mat.trim();
  const gf = 4.6;
  // solid rear part of the ground floor, then the display alcove in front
  const alcove = 4.6;
  m.box(white, 0, gf / 2, -alcove / 2, w, gf, d - alcove);
  m.box(facadeMat('#f3f2ee', 'punch', 9), 0, gf + (h - gf) / 2, 0, w, h - gf, d, { tile: FACADE_TILE, vOff: -gf, skip: ['top', 'bottom'] });
  // alcove: warm lit back wall, floor, side walls, ceiling
  const fz = d / 2;
  m.box(mat.neon('#ffe0b8'), 0, gf / 2, fz - alcove + 0.05, w - 0.6, gf - 0.6, 0.1);
  m.box(mat.std('#cfc8bd', 0.5, 0), 0, 0.08, fz - alcove / 2, w - 0.6, 0.16, alcove);
  for (const sx of [-1, 1]) m.box(white, sx * (w / 2 - 0.15), gf / 2, fz - alcove / 2, 0.3, gf, alcove);
  m.box(white, 0, gf - 0.1, fz - alcove / 2, w, 0.3, alcove);
  // glass panes (transparent) with black frames, door in the middle
  const glass = memoGlass();
  for (const [x0, x1] of [[-w / 2 + 0.3, -1.1], [1.1, w / 2 - 0.3]]) m.quad(glass, [x0, 0.2, fz], [x1, 0.2, fz], [x1, gf - 0.3, fz], [x0, gf - 0.3, fz]);
  for (const x of [-w / 2 + 0.3, -1.1, 1.1, w / 2 - 0.3]) m.box(t, x, gf / 2, fz, 0.14, gf - 0.3, 0.14);
  m.box(t, 0, gf - 0.3, fz, w - 0.6, 0.14, 0.14);
  m.box(t, 0, 0.2, fz, w - 0.6, 0.14, 0.14);
  m.quad(storefrontMat('glass'), [-1.1, 0.2, fz + 0.02], [1.1, 0.2, fz + 0.02], [1.1, gf - 0.3, fz + 0.02], [-1.1, gf - 0.3, fz + 0.02]);
  // neon sign
  signQuad(m, signs().add('STYLE', { fg: '#ffffff', glow: PAL.pink }), 0, gf + 0.9, fz + 0.1, 1.7, w - 0.5);
  m.box(mat.neon(PAL.pink), 0, 0.02, fz + 0.1, w - 0.4, 0.07, 0.07);
  m.box(mat.roof(), 0, h + 0.06, 0, w - 0.1, 0.14, d - 0.1);
  m.box(t, 0, h + 0.3, fz - 0.1, w, 0.55, 0.22);
  // mannequins in the window (capsule body + sphere head on a little plinth)
  const outfits: [string, string][] = [['#ff2e88', '#23222a'], ['#2c3e5c', '#f3f2ee'], ['#b6ff3b', '#7c4dff']];
  outfits.forEach(([top, bottom], i) => {
    const mx = -2.7 + i * 2.7;
    const [wx, wz] = m.toWorld(mx, fz - 2.0);
    const g = new THREE.Group();
    g.position.set(wx, 0.16, wz);
    const skin = mat.std('#e8e4dc', 0.5);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.14, 16), mat.std('#23222a', 0.4));
    plinth.position.y = 0.07;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 10), mat.std(bottom, 0.8));
    legs.position.y = 0.14 + 0.78;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 10), mat.std(top, 0.75));
    torso.position.y = 1.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
    head.position.y = 2.6;
    g.add(plinth, legs, torso, head);
    g.rotation.y = Math.PI + 0.25 * (i - 1);
    ex.add(g);
  });
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 1.3);
    return { x: wx, z: wz, nx: 0, nz: -1 };
  })();
  m.pop();
  return { colliders: [{ kind: 'box', x: cx, z: cz, hw: w / 2, hd: d / 2 }], door, height: h };
}
let glassMat: THREE.MeshStandardMaterial | null = null;
function memoGlass(): THREE.MeshStandardMaterial {
  return (glassMat ??= new THREE.MeshStandardMaterial({ color: '#cfeaff', roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
}

// ── boba café (giant cup on the roof) and sneaker shop (giant shoe) ─────────
export function boba(m: Mesher, ex: THREE.Group, o: ShopOpts): Built {
  const b = shop(m, { ...o, awning: ['#fff3e0', '#ff2e88'], roofUnits: false });
  // a giant milk-tea cup with pearls and a straw
  const g = new THREE.Group();
  g.position.set(o.x, o.h + 0.2, o.z);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.1, 3.0, 20), new THREE.MeshStandardMaterial({ color: '#e0bf9a', roughness: 0.35 }));
  cup.position.y = 1.5;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.55, 20), new THREE.MeshStandardMaterial({ color: '#ff2e88', roughness: 0.4 }));
  band.position.y = 1.5;
  const lid = new THREE.Mesh(new THREE.SphereGeometry(1.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.25 }));
  lid.position.y = 3.0;
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#b6ff3b', roughness: 0.4 }));
  straw.position.set(0.3, 4.4, 0);
  straw.rotation.z = -0.16;
  g.add(cup, band, lid, straw);
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: '#2b1d17', roughness: 0.3 }));
    const a = i * 0.7;
    p.position.set(Math.cos(a) * 0.85, 0.35 + (i % 3) * 0.28, Math.sin(a) * 0.85);
    g.add(p);
  }
  ex.add(g);
  return b;
}

export function kicks(m: Mesher, ex: THREE.Group, o: ShopOpts): Built {
  const b = shop(m, { ...o, awning: ['#ffffff', '#b6ff3b'], roofUnits: false });
  // a chunky sneaker (sole, upper, toe cap, laces) pointing along the street
  const g = new THREE.Group();
  g.position.set(o.x, o.h + 0.25, o.z);
  g.rotation.y = faceYaw(o.face);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 4.6), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 }));
  sole.position.y = 0.22;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 3.1), new THREE.MeshStandardMaterial({ color: '#ff2e88', roughness: 0.5 }));
  upper.position.set(0, 1.0, 0.6);
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10), new THREE.MeshStandardMaterial({ color: '#ff2e88', roughness: 0.5 }));
  toe.scale.set(0.9, 0.7, 1.2);
  toe.position.set(0, 0.75, -1.0);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: '#23222a', roughness: 0.6 }));
  collar.position.set(0, 1.85, 1.5);
  const swoosh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 2.0), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  swoosh.position.set(0.86, 1.0, 0.5);
  g.add(sole, upper, toe, collar, swoosh);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    l.position.set(0, 1.7, -0.5 + i * 0.3);
    g.add(l);
  }
  ex.add(g);
  return b;
}

// ── the Diner ───────────────────────────────────────────────────────────────
export function diner(m: Mesher, ex: THREE.Group, o: { x: number; z: number; face: Face }): Built {
  const w = 16, d = 9, h = 5.2;
  m.push(o.x, o.z, faceYaw(o.face));
  const t = mat.trim();
  m.box(mat.std('#e9eaee', 0.35, 0.6), 0, h / 2, 0, w, h, d);
  m.box(mat.std('#d4262d', 0.5), 0, 1.2, 0, w + 0.06, 0.7, d + 0.06);
  m.box(mat.std('#d4262d', 0.5), 0, 3.9, 0, w + 0.06, 0.5, d + 0.06);
  m.box(mat.roof(), 0, h + 0.06, 0, w - 0.1, 0.14, d - 0.1);
  m.box(t, 0, h + 0.25, d / 2 - 0.1, w, 0.45, 0.2);
  m.quad(storefrontMat('warm'), [-w / 2 + 0.6, 1.7, d / 2 + 0.05], [w / 2 - 0.6, 1.7, d / 2 + 0.05], [w / 2 - 0.6, 3.6, d / 2 + 0.05], [-w / 2 + 0.6, 3.6, d / 2 + 0.05]);
  signQuad(m, signs().add('DINER', { fg: '#ffffff', glow: PAL.orange }), 0, h + 1.9, d / 2 - 0.4, 1.9, 8);
  m.box(t, 0, h + 1.0, d / 2 - 0.5, 0.16, 1.8, 0.16);
  m.box(mat.neon(PAL.cyan), 0, 4.5, d / 2 + 0.06, w - 0.4, 0.1, 0.1);
  const door: DoorSpot = (() => {
    const [wx, wz] = m.toWorld(0, d / 2 + 1.0);
    const [nx, nz] = faceNormal(o.face);
    return { x: wx, z: wz, nx, nz };
  })();
  m.pop();
  const swap = o.face === 'e' || o.face === 'w';
  void ex;
  return { colliders: [{ kind: 'box', x: o.x, z: o.z, hw: (swap ? d : w) / 2, hd: (swap ? w : d) / 2 }], door, height: h };
}

export { textMat };
