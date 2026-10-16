// ── v3 locker ── Locker showroom stand-ins for the six rides (chunky, original, ~6 draw calls each).
// These are ONLY for the Locker's Ride Wrap tab and the ride cards; the in-world rides are the drive
// agent's models. `makeRidePreview(kind, wrap)` → a group standing on y = 0 facing +Z, wrap colour + finish applied.
// TODO(rides agent): if you export `makeRideModel(kind, { color, finish })`, the Locker can swap to it.
import * as THREE from 'three';
import type { Hex, VehicleKind } from '../../core/model';
import { GearBuilder, type GearFinish } from './gearKit';

export interface WrapLook {
  color: Hex;
  finish: string;
}

/** wrap finish → how the body paint is shaded (and a tint push so pearl / glitter read differently) */
function bodyLook(w: WrapLook): { finish: GearFinish; color: Hex; sparkle: boolean } {
  const c = new THREE.Color(w.color);
  switch (w.finish) {
    case 'matte':
      return { finish: 'matte', color: w.color, sparkle: false };
    case 'chrome':
      return { finish: 'metal', color: '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.45).getHexString(), sparkle: false };
    case 'pearl':
      return { finish: 'gloss', color: '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.5).getHexString(), sparkle: false };
    case 'glitter':
      return { finish: 'metal', color: w.color, sparkle: true };
    default:
      return { finish: 'gloss', color: w.color, sparkle: false };
  }
}

const DARK = '#1c1b2e', GLASS = '#a9e6ff', CHROME = '#dfe3f2', LIGHT = '#fff6c2';

function wheel(b: GearBuilder, x: number, y: number, z: number, r: number, w: number): void {
  b.cyl(r, r, w, DARK, 'matte', { p: [x, y, z], r: [0, 0, Math.PI / 2] }, 18);
  b.cyl(r * 0.58, r * 0.58, w + 0.02, CHROME, 'metal', { p: [x, y, z], r: [0, 0, Math.PI / 2] }, 12);
}

export function makeRidePreview(kind: VehicleKind, wrap: WrapLook): THREE.Group {
  const b = new GearBuilder();
  const L = bodyLook(wrap);
  const P = L.color, F = L.finish;
  switch (kind) {
    case 'sports': {
      b.box(1.8, 0.5, 3.9, P, F, { p: [0, 0.62, 0] }, 0.2);
      b.box(1.5, 0.42, 1.7, P, F, { p: [0, 1.0, -0.35] }, 0.18);
      b.box(1.36, 0.36, 1.4, GLASS, 'glass', { p: [0, 1.04, -0.32] }, 0.15);
      b.box(1.9, 0.07, 0.5, DARK, 'gloss', { p: [0, 1.06, -1.82] }, 0.03); // spoiler
      for (const s of [-1, 1]) {
        b.box(0.07, 0.3, 0.07, DARK, 'matte', { p: [s * 0.7, 0.9, -1.78] });
        b.ball([0.2, 0.09, 0.1], LIGHT, 'glow', { p: [s * 0.6, 0.7, 1.9] }, true);
        wheel(b, s * 0.92, 0.38, 1.2, 0.38, 0.3);
        wheel(b, s * 0.92, 0.38, -1.2, 0.4, 0.34);
      }
      break;
    }
    case 'pickup': {
      b.box(1.95, 0.7, 4.1, P, F, { p: [0, 0.8, 0] }, 0.14);
      b.box(1.8, 0.62, 1.6, P, F, { p: [0, 1.4, 0.55] }, 0.16);
      b.box(1.62, 0.44, 1.3, GLASS, 'glass', { p: [0, 1.44, 0.57] }, 0.12);
      b.box(1.7, 0.08, 1.7, DARK, 'matte', { p: [0, 1.17, -1.2] }, 0.02); // bed floor
      for (const s of [-1, 1]) {
        b.box(0.08, 0.34, 1.7, P, F, { p: [s * 0.86, 1.34, -1.2] }, 0.03);
        b.ball([0.2, 0.12, 0.1], LIGHT, 'glow', { p: [s * 0.66, 0.92, 2.05] }, true);
        wheel(b, s * 1.0, 0.5, 1.35, 0.5, 0.36);
        wheel(b, s * 1.0, 0.5, -1.3, 0.5, 0.36);
      }
      b.box(1.9, 0.18, 0.12, CHROME, 'metal', { p: [0, 0.7, 2.08] });
      break;
    }
    case 'golfcart': {
      b.box(1.5, 0.4, 2.6, P, F, { p: [0, 0.6, 0] }, 0.16);
      b.box(1.3, 0.2, 0.9, '#f4efe4', 'matte', { p: [0, 0.92, -0.45] }, 0.08); // seat
      b.box(1.3, 0.55, 0.14, '#f4efe4', 'matte', { p: [0, 1.15, -0.95] }, 0.06);
      b.box(1.6, 0.1, 2.0, P, F, { p: [0, 2.0, -0.2] }, 0.04); // roof
      for (const s of [-1, 1]) for (const z of [0.55, -0.9]) b.box(0.07, 1.1, 0.07, DARK, 'matte', { p: [s * 0.72, 1.45, z] });
      for (const s of [-1, 1]) {
        b.ball([0.15, 0.1, 0.08], LIGHT, 'glow', { p: [s * 0.45, 0.7, 1.3] }, true);
        wheel(b, s * 0.74, 0.3, 0.8, 0.3, 0.22);
        wheel(b, s * 0.74, 0.3, -0.8, 0.3, 0.22);
      }
      break;
    }
    case 'hoverboard': {
      b.box(0.8, 0.12, 2.2, P, F, { p: [0, 0.55, 0] }, 0.1);
      b.box(0.82, 0.05, 2.22, DARK, 'matte', { p: [0, 0.62, 0] }, 0.02); // grip
      for (const z of [-0.7, 0.7]) {
        b.cyl(0.26, 0.26, 0.06, '#35d6ff', 'glow', { p: [0, 0.44, z] }, 20);
        b.cyl(0.34, 0.34, 0.04, '#b65cff', 'glow', { p: [0, 0.38, z] }, 20);
      }
      b.ball([0.4, 0.06, 0.18], P, F, { p: [0, 0.6, 1.1] }, true);
      b.ball([0.4, 0.06, 0.18], P, F, { p: [0, 0.6, -1.1] }, true);
      break;
    }
    case 'icecream': {
      b.box(2.1, 1.9, 3.5, P, F, { p: [0, 1.5, -0.5] }, 0.2);
      b.box(1.9, 1.2, 1.2, P, F, { p: [0, 1.15, 1.7] }, 0.18);
      b.box(1.7, 0.7, 0.9, GLASS, 'glass', { p: [0, 1.5, 1.9] }, 0.12);
      b.box(1.4, 0.7, 0.06, '#26233a', 'matte', { p: [1.07, 1.8, -0.7] }); // serving window
      for (let i = 0; i < 5; i++) b.box(0.3, 0.06, 0.55, i % 2 ? '#ffffff' : '#ff4fa3', 'matte', { p: [1.18, 2.22, -1.3 + i * 0.3], r: [0, 0, 0.45] });
      b.cone(0.5, 1.2, '#e9a85a', 'matte', { p: [0, 3.35, -0.5], r: [Math.PI, 0, 0] }, 14); // the giant cone
      b.ball(0.58, '#ff9fd0', 'gloss', { p: [0, 3.95, -0.5] });
      b.ball(0.46, '#fff2c9', 'gloss', { p: [0, 4.55, -0.5] });
      b.ball(0.1, '#e23b3b', 'gloss', { p: [0, 5.0, -0.5] }, true);
      for (const s of [-1, 1]) {
        b.ball([0.2, 0.12, 0.1], LIGHT, 'glow', { p: [s * 0.68, 1.0, 2.32] }, true);
        wheel(b, s * 1.0, 0.45, 1.5, 0.46, 0.34);
        wheel(b, s * 1.0, 0.45, -1.4, 0.46, 0.34);
      }
      break;
    }
    case 'boat': {
      b.ball([1.0, 0.5, 2.2], P, F, { p: [0, 0.62, -0.1] });
      b.box(1.7, 0.1, 2.9, '#f4efe4', 'matte', { p: [0, 0.98, -0.2] }, 0.04); // deck
      b.box(1.3, 0.55, 0.12, GLASS, 'glass', { p: [0, 1.32, 0.5], r: [-0.4, 0, 0] }, 0.05); // windshield
      b.box(0.9, 0.3, 0.8, '#f4efe4', 'matte', { p: [0, 1.15, -0.9] }, 0.1); // seat
      b.cone(0.3, 0.7, P, F, { p: [0, 0.9, 2.2], r: [Math.PI / 2, 0, 0] }, 12); // bow
      b.box(0.3, 0.5, 0.3, DARK, 'matte', { p: [0, 0.8, -2.35] }, 0.06); // outboard
      b.cyl(0.04, 0.04, 0.7, '#e8e8f4', 'metal', { p: [0, 1.7, -1.6] }, 8); // flag pole
      b.box(0.5, 0.3, 0.02, '#ffe53b', 'sheet', { p: [0.27, 1.9, -1.6] });
      break;
    }
  }
  const g = b.build();
  if (L.sparkle) {
    // glitter: a light dusting of sparkles over the body
    const sp = new GearBuilder();
    for (let i = 0; i < 28; i++) {
      const a = i * 2.399, r = 0.4 + ((i * 37) % 10) * 0.07;
      sp.ball(0.035, i % 3 ? '#ffffff' : '#fff2a8', 'glow', { p: [Math.cos(a) * r, 0.9 + ((i * 13) % 7) * 0.12, Math.sin(a) * r * 1.8] }, true);
    }
    g.add(sp.build());
  }
  g.name = `ride:${kind}`;
  return g;
}
