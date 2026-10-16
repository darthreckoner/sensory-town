// v3 wardrobe: accessories (styles 14+ of OUTFIT_CATALOG.accessory). An accessory is one AccPart:
//   head   head space (origin = head center, +z forward). Hats sit as authored (hair-independent);
//          non-hat, non-fixed pieces ride on top of the hair (placed from its top + radius); `fixed` = face pieces
//   body   upper-body space (y relative to TY), z NOT flattened: scarves, belts, capes, necklaces
//   wristL left wrist space (hand hangs down -y)   handR right palm space (held items; the arm bends)
//   back   wings (two flapping bones; authored in upper-body space)
import * as THREE from 'three';
import { B, GB, TAU, TY, bodyR, capsule, facePoint, frameQ, pieces, spike, torus, arr3, type Piece } from './characterKit';
import type { AccPart } from './characterParts';
import { PI, blobRing, box, heartGeo, rbox, starGeo, starShape, wrapHead, type Rarity } from './wardrobeKit';

export interface AccDef {
  name: string;
  icon: string;
  rarity: Rarity;
  /** build the part; topOff = the worn top's chest offset (only used when bodyDep) */
  make: (topOff: number) => AccPart;
  /** body pieces depend on the top's thickness (scarf, belt, necklace) */
  bodyDep?: boolean;
  suit?: string;
}

const EMPTY: Piece[] = [];
const base = (over: Partial<AccPart>): AccPart => ({ head: EMPTY, body: EMPTY, handR: EMPTY, wristL: EMPTY, back: EMPTY, hat: false, fixed: false, topLift: 0, ...over });
const U = (y: number) => y - TY;
const Y = new THREE.Vector3(0, 1, 0);
const qTo = (d: THREE.Vector3): THREE.Quaternion => new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
const indexed = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  return g;
};
const ico = (r: number): THREE.BufferGeometry => indexed(new THREE.IcosahedronGeometry(r, 0).toNonIndexed());
const lathePts = (pts: [number, number][], seg = 20, a = 0, b = TAU): THREE.BufferGeometry =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, a, b);

/** Arch band over the head from ear to ear (same shape as the headphones band). */
const headband = (gb: GB, R = 0.118, tube = 0.0075, y = -0.01, sy = 1.38): void => void gb.add(torus(R, tube, PI), { p: [0, y, -0.004], s: [1, sy, 1] });
/** Point on that arch at angle a from the top, plus its outward direction. */
const archAt = (a: number, R = 0.118, y = -0.01, sy = 1.38): { p: THREE.Vector3; out: THREE.Vector3 } => ({
  p: new THREE.Vector3(Math.sin(a) * R, y + R * sy * Math.cos(a), -0.004),
  out: new THREE.Vector3(Math.sin(a) / 1, Math.cos(a) / sy, 0).normalize(),
});

/** A dome (sphere cap) for hats / hoods: radii, center, optional face opening (half-angle in radians) and bottom angle. */
function dome(gb: GB, rx: number, ry: number, rz: number, cy: number, cz = 0, opening = 0, thetaMax = 1.64, tilt = 0): void {
  const g = opening > 0 ? new THREE.SphereGeometry(1, 28, 14, PI / 2 + opening, TAU - 2 * opening, 0, thetaMax) : new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, thetaMax);
  if (tilt) {
    const t = new GB();
    t.add(g, { p: [0, cy, cz], s: [rx, ry, rz] }, true);
    const built = t.build();
    built.rotateX(tilt);
    gb.add(built, {}, true);
  } else gb.add(g, { p: [0, cy, cz], s: [rx, ry, rz] }, true);
}
/** Fur / trim blobs along the two vertical edges of a hood opening. */
function hoodEdge(gb: GB, rx: number, ry: number, rz: number, cy: number, cz: number, opening: number, thetaMax: number, size: number, step = 0.34): void {
  for (const side of [-1, 1]) {
    const phi = PI / 2 + side * opening;
    for (let th = 0.2; th <= thetaMax; th += step) {
      gb.e([-rx * Math.cos(phi) * Math.sin(th), cy + ry * Math.cos(th), cz + rz * Math.sin(phi) * Math.sin(th)], size);
    }
  }
}

export const ACC_V3: AccDef[] = [
  // 14 ── Cat Ears
  {
    name: 'Cat Ears', icon: '🐱', rarity: 'common',
    make: () => base({
      topLift: 0.07,
      head: pieces('accv3|catears', (pb) => {
        const m = pb.at('main', 'fabric'), pink = pb.at('pink');
        headband(m, 0.118, 0.0085);
        for (const s of [-1, 1]) {
          const { p } = archAt(0.62);
          const q = qTo(new THREE.Vector3(0.2 * s, 1, -0.06));
          m.add(spike(), { p: [p.x * s, p.y - 0.014, p.z], s: [0.072, 0.09, 0.034], q });
          pink.add(spike(), { p: [p.x * s + 0.002 * s, p.y - 0.008, p.z + 0.007], s: [0.046, 0.062, 0.02], q });
        }
      }),
    }),
  },
  // 15 ── Bunny Ears
  {
    name: 'Bunny Ears', icon: '🐰', rarity: 'uncommon',
    make: () => base({
      topLift: 0.2,
      head: pieces('accv3|bunny', (pb) => {
        const m = pb.at('main', 'fabric'), pink = pb.at('pink');
        headband(m, 0.118, 0.0085);
        for (const s of [-1, 1]) {
          const { p } = archAt(0.5);
          const d = new THREE.Vector3(0.2 * s, 1, -0.14).normalize();
          const c = new THREE.Vector3(p.x * s, p.y, p.z).addScaledVector(d, 0.1);
          const q = qTo(d);
          m.add(capsule(0.03, 0.17), { p: arr3(c), q, s: [1, 1, 0.5] });
          pink.add(capsule(0.016, 0.15), { p: [c.x, c.y, c.z + 0.009], q, s: [1, 1, 0.4] });
        }
      }),
    }),
  },
  // 16 ── Pom Beanie
  {
    name: 'Pom Beanie', icon: '🧶', rarity: 'common',
    make: () => base({
      hat: true, topLift: 0.085,
      head: pieces('accv3|pombeanie', (pb) => {
        const main = pb.at('main', 'fabric');
        const tilt = -0.18;
        const d = new GB();
        d.add(new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.64), { p: [0, 0.04, -0.012], s: [0.124, 0.12, 0.134] });
        const dg = d.build();
        dg.rotateX(tilt);
        main.add(dg, {}, true);
        const band = lathePts([[0.11, -0.026], [0.124, -0.026], [0.134, -0.018], [0.136, 0], [0.134, 0.018], [0.124, 0.026], [0.11, 0.026]], 22);
        const c = new GB();
        c.add(band, { p: [0, 0.038, -0.012], s: [1, 1, 1.03] }, true);
        const cg = c.build();
        cg.rotateX(tilt);
        pb.at('trim', 'fabric').add(cg, {}, true);
        const w = pb.at('white', 'fabric');
        w.e([0, 0.188, -0.036], [0.04, 0.04, 0.04]);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          w.e([Math.sin(a) * 0.034, 0.188 + Math.cos(a * 2) * 0.012, -0.036 + Math.cos(a) * 0.034], 0.016);
        }
        w.e([0, 0.222, -0.036], 0.018);
      }),
    }),
  },
  // 17 ── Ball Cap (brim to the front)
  {
    name: 'Ball Cap', icon: '⚾', rarity: 'common',
    make: () => base({
      hat: true, topLift: 0.04,
      head: pieces('accv3|ballcap', (pb) => {
        const main = pb.at('main', 'fabric');
        const d = new GB();
        d.add(new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.64), { p: [0, 0.036, -0.012], s: [0.122, 0.118, 0.132] });
        const dg = d.build();
        dg.rotateX(-0.08);
        main.add(dg, {}, true);
        const br = new GB();
        br.add(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, PI / 2), { p: [0, 0.03, 0.13], s: [0.08, 0.012, 0.085], r: [0.12, 0, 0] });
        pb.at('dark').add(br.build(), {}, true);
        pb.at('white').e([0, 0.155, -0.02], [0.012, 0.01, 0.012]);
        pb.at('white').e([0, 0.085, 0.118], [0.026, 0.02, 0.01], [0.6, 0, 0]);
        pb.at('trim').ring(0.036, 0.113, 0.004);
      }),
    }),
  },
  // 18 ── Star Shades
  {
    name: 'Star Shades', icon: '🌟', rarity: 'uncommon',
    make: () => base({
      fixed: true,
      head: pieces('accv3|starshades', (pb) => {
        const lens = pb.at('main'), frame = pb.at('trim');
        const pts: THREE.Vector3[] = [];
        for (const s of [-1, 1]) {
          const { p, n } = facePoint(23 * s, 4, 0.015);
          const q = frameQ(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.4));
          frame.add(starGeo(0.047, 0.026), { p: arr3(p.clone().add(new THREE.Vector3(0, 0, -0.003))), q });
          lens.add(starGeo(0.038, 0.02), { p: arr3(p), q });
          pb.at('dark').seg(arr3(new THREE.Vector3(0.03 * s, 0.002, 0).applyQuaternion(q).add(p)), [0.094 * s, 0.002, -0.02], 0.0045);
          pts.push(p);
        }
        frame.seg([pts[0].x + 0.03, pts[0].y + 0.004, pts[0].z], [pts[1].x - 0.03, pts[1].y + 0.004, pts[1].z], 0.0045);
      }),
    }),
  },
  // 19 ── Heart Shades
  {
    name: 'Heart Shades', icon: '💖', rarity: 'common',
    make: () => base({
      fixed: true,
      head: pieces('accv3|heartshades', (pb) => {
        const lens = pb.at('main'), frame = pb.at('trim');
        const pts: THREE.Vector3[] = [];
        for (const s of [-1, 1]) {
          const { p, n } = facePoint(23 * s, 4, 0.015);
          const q = frameQ(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.4));
          frame.add(heartGeo(0.036), { p: arr3(p.clone().add(new THREE.Vector3(0, 0.002, -0.003))), q });
          lens.add(heartGeo(0.03), { p: arr3(p), q });
          pb.at('dark').seg(arr3(new THREE.Vector3(0.03 * s, 0.002, 0).applyQuaternion(q).add(p)), [0.094 * s, 0.002, -0.02], 0.0045);
          pts.push(p);
        }
        frame.seg([pts[0].x + 0.025, pts[0].y + 0.01, pts[0].z], [pts[1].x - 0.025, pts[1].y + 0.01, pts[1].z], 0.0045);
      }),
    }),
  },
  // 20 ── Ski Goggles
  {
    name: 'Ski Goggles', icon: '🥽', rarity: 'uncommon',
    make: () => base({
      fixed: true,
      head: pieces('accv3|goggles', (pb) => {
        // frame in matte plastic ('fabric') so the goggles only add the lens category
        const frame = pb.at('main', 'fabric'), dark = pb.at('dark', 'fabric'), white = pb.at('white', 'fabric'), lens = pb.at('lens');
        for (const s of [-1, 1]) {
          const { p, n } = facePoint(25 * s, 3, 0.02);
          const q = frameQ(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.3));
          const at = (dx: number, dy: number, dz = 0) => arr3(new THREE.Vector3(dx, dy, dz).applyQuaternion(q).add(p));
          for (const [dx, dy, w, h] of [[0, 0.034, 0.104, 0.013], [0, -0.034, 0.104, 0.013], [-0.046, 0, 0.013, 0.07], [0.046, 0, 0.013, 0.07]]) {
            frame.add(rbox(w, h, 0.024, 0.005), { p: at(dx, dy), q }, true);
          }
          lens.add(rbox(0.09, 0.062, 0.006, 0.02), { p: at(0, 0, 0.006), q }, true);
        }
        dark.seg([-0.012, 0.01, 0.094], [0.012, 0.01, 0.094], 0.012);
        frame.seg([-0.045, 0.006, 0.098], [0.045, 0.006, 0.098], 0.006);
        dark.add(torus(0.112, 0.012), { p: [0, 0.012, -0.006], r: [PI / 2, 0, 0], s: [1, 1.14, 1] });
        pb.at('cyan', 'fabric').seg([-0.02, 0.0, 0.108], [0.02, 0.0, 0.108], 0.0035);
      }),
    }),
  },
  // 21 ── Tiara
  {
    name: 'Tiara', icon: '👸', rarity: 'epic',
    make: () => base({
      topLift: 0.07,
      head: pieces('accv3|tiara', (pb) => {
        const m = pb.at('main', 'metal'), dia = pb.at('diamond');
        const R = 0.098, sy = 0.78, cy = 0.04, cz = 0.028;
        m.add(torus(R, 0.007, PI), { p: [0, cy, cz], s: [1, sy, 1] });
        for (let i = 0; i < 5; i++) {
          const a = -0.9 + i * 0.45;
          const h = i === 2 ? 0.07 : i % 2 === 0 ? 0.048 : 0.034;
          const px = Math.sin(a) * R, py = cy + Math.cos(a) * R * sy;
          const dir = new THREE.Vector3(Math.sin(a) * 0.4, 1, 0).normalize();
          m.add(spike(), { p: [px, py - 0.004, cz], s: [0.022, h, 0.014], q: qTo(dir) });
          dia.add(ico(i === 2 ? 0.0145 : 0.0095), { p: [px + dir.x * h, py + h * 0.95, cz] }, true);
        }
        dia.add(ico(0.012), { p: [0, cy + R * sy - 0.002, cz + 0.008], s: [1, 1.2, 0.8] }, true);
      }),
    }),
  },
  // 22 ── Flower Crown
  {
    name: 'Flower Crown', icon: '🌸', rarity: 'uncommon',
    make: () => base({
      topLift: 0.04,
      head: pieces('accv3|flowercrown', (pb) => {
        const leaf = pb.at('leaf'), petal = pb.at('main'), gold = pb.at('gold'), pink = pb.at('pink'), white = pb.at('white');
        leaf.add(torus(0.108, 0.008), { p: [0, 0.088, -0.006], r: [PI / 2 + 0.1, 0, 0], s: [1, 1.1, 1] });
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const x = Math.sin(a) * 0.112, z = -0.006 + Math.cos(a) * 0.12;
          const y = 0.088 + (z - -0.006) * -0.1 * 0.7 + 0.004;
          const col = i % 3 === 0 ? petal : i % 3 === 1 ? pink : white;
          for (let k = 0; k < 5; k++) {
            const b = (k / 5) * TAU;
            col.e([x + Math.cos(b) * 0.014 * Math.cos(a), y + Math.sin(b) * 0.014, z - Math.cos(b) * 0.014 * Math.sin(a) * 0 + Math.sin(a) * 0.0], [0.011, 0.011, 0.011]);
          }
          gold.e([x, y, z + 0.004], 0.009);
          leaf.e([Math.sin(a + 0.35) * 0.112, y - 0.004, -0.006 + Math.cos(a + 0.35) * 0.12], [0.02, 0.008, 0.012], [0, a, 0]);
        }
      }),
    }),
  },
  // 23 ── Gamer Headset
  {
    name: 'Headset', icon: '🎮', rarity: 'rare',
    make: () => base({
      topLift: 0.04,
      head: pieces('accv3|headset', (pb) => {
        const m = pb.at('main', 'fabric'), dark = pb.at('dark', 'fabric'), led = pb.at('led');
        headband(dark, 0.118, 0.0085);
        pb.at('trim', 'fabric').add(torus(0.118, 0.0095, 1.0), { p: [0, -0.01, -0.004], s: [1, 1.38, 1], r: [0, 0, PI / 2 - 0.5] });
        for (const s of [-1, 1]) {
          m.e([0.115 * s, -0.012, -0.004], [0.026, 0.05, 0.046]);
          dark.ringAt([0.105 * s, -0.012, -0.004], [s, 0, 0], 0.04, 0.012);
          led.ringAt([0.141 * s, -0.012, -0.004], [s, 0, 0], 0.03, 0.0045);
          led.e([0.141 * s, -0.012, -0.004], [0.002, 0.024, 0.024]);
        }
        const A = new THREE.Vector3(-0.118, -0.04, 0.02), C = new THREE.Vector3(-0.07, -0.08, 0.085), D = new THREE.Vector3(-0.026, -0.082, 0.1);
        dark.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([A, new THREE.Vector3(-0.108, -0.07, 0.06), C, D]), 12, 0.0045, 5, false), {}, true);
        m.e(arr3(D), [0.011, 0.011, 0.014]);
      }),
    }),
  },
  // 24 ── Big Bow
  {
    name: 'Big Bow', icon: '🎀', rarity: 'common',
    make: () => base({
      topLift: 0.07,
      head: pieces('accv3|bigbow', (pb) => {
        const m = pb.at('main', 'satin'), t = pb.at('trim', 'satin');
        const c: [number, number, number] = [0.055, 0.128, 0.03];
        for (const s of [-1, 1]) {
          m.e([c[0] + 0.052 * s, c[1] + 0.008, c[2]], [0.058, 0.04, 0.022], [0, 0, 0.35 * s]);
          t.e([c[0] + 0.052 * s, c[1] + 0.008, c[2] + 0.014], [0.04, 0.022, 0.006], [0, 0, 0.35 * s]);
          m.seg([c[0] + 0.01 * s, c[1] - 0.01, c[2] - 0.002], [c[0] + 0.04 * s, c[1] - 0.085, c[2] - 0.012], 0.014);
        }
        t.e([c[0], c[1], c[2] + 0.004], [0.022, 0.026, 0.02]);
      }),
    }),
  },
  // 25 ── Scarf
  {
    name: 'Scarf', icon: '🧣', rarity: 'uncommon', bodyDep: true,
    make: (topOff) => base({
      body: pieces(`accv3|scarf|${topOff}`, (pb) => {
        const m = pb.at('main', 'fabric'), t = pb.at('trim', 'fabric');
        const o = Math.max(topOff, 0.02);
        const R = (y: number) => bodyR(y) + o + 0.012;
        m.add(torus(R(1.408) + 0.014, 0.028), { p: [0, U(1.408), -0.004], r: [PI / 2, 0, 0], s: [1, 0.72, 1] });
        m.add(torus(R(1.378) + 0.016, 0.026), { p: [0, U(1.378), -0.004], r: [PI / 2, 0, 0], s: [1, 0.72, 1] });
        t.add(torus(R(1.408) + 0.014, 0.0075), { p: [0, U(1.396), -0.004], r: [PI / 2, 0, 0], s: [1.01, 0.73, 1.01] });
        const fz = (R(1.2) + 0.02) * 0.72;
        box(m, 0.08, 0.3, 0.026, 0.012, [0.07, U(1.2), fz], [0.1, 0.0, -0.06]);
        box(t, 0.082, 0.014, 0.028, 0.006, [0.07, U(1.14), fz + 0.001], [0.1, 0.0, -0.06]);
        box(t, 0.082, 0.014, 0.028, 0.006, [0.07, U(1.1), fz + 0.001], [0.1, 0.0, -0.06]);
        for (let i = 0; i < 5; i++) m.seg([0.04 + i * 0.015, U(1.05), fz], [0.04 + i * 0.015, U(1.0), fz - 0.002], 0.005);
      }),
    }),
  },
  // 26 ── Choker
  {
    name: 'Choker', icon: '📿', rarity: 'common',
    make: () => base({
      body: pieces('accv3|choker', (pb) => {
        pb.at('dark', 'satin').add(torus(0.06, 0.0095), { p: [0, U(1.446), -0.004], r: [PI / 2, 0, 0], s: [1, 0.78, 1] });
        const g = pb.at('gold');
        g.add(starGeo(0.0145, 0.007), { p: [0, U(1.43), 0.052] });
        g.e([0, U(1.444), 0.048], 0.005);
      }),
    }),
  },
  // 27 ── Chain Belt
  {
    name: 'Chain Belt', icon: '⛓️', rarity: 'uncommon', bodyDep: true,
    make: (topOff) => base({
      body: pieces(`accv3|chainbelt|${topOff}`, (pb) => {
        const m = pb.at('main', 'metal'), g = pb.at('gold');
        const y = 0.99;
        const o = Math.max(topOff, 0.034) + 0.014;
        const R = bodyR(y) + o;
        m.add(torus(R, 0.0055), { p: [0, U(y), 0], r: [PI / 2, 0, 0], s: [1, 0.72, 1] });
        g.add(torus(0.026, 0.006), { p: [0, U(y), R * 0.72 + 0.003] });
        g.e([0, U(y), R * 0.72 + 0.012], [0.012, 0.012, 0.006]);
        for (const [x0, x1, drop] of [[-0.07, 0.07, 0.1], [-0.13, 0.0, 0.07]]) {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 8; i++) {
            const k = i / 8, x = x0 + (x1 - x0) * k;
            const yy = y - Math.sin(Math.PI * k) * drop;
            const zz = Math.sqrt(Math.max(0, R * R - x * x)) * 0.72 + 0.004;
            pts.push(new THREE.Vector3(x, U(yy), zz));
          }
          m.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.0042, 4, false), {}, true);
        }
        g.e([0.0, U(y - 0.1), R * 0.72 + 0.006], 0.011);
      }),
    }),
  },
  // 28 ── Wrist Stack: scrunchie + bangles on the left wrist
  {
    name: 'Wrist Stack', icon: '🌈', rarity: 'common',
    make: () => base({
      wristL: pieces('accv3|wriststack', (pb) => {
        pb.at('main', 'satin').add(torus(0.034, 0.0125), { p: [0, 0.012, 0], r: [PI / 2, 0, 0] });
        pb.at('pink').add(torus(0.033, 0.0065), { p: [0, 0.038, 0], r: [PI / 2, 0, 0] });
        pb.at('gold').add(torus(0.034, 0.0055), { p: [0, 0.054, 0], r: [PI / 2, 0, 0] });
        pb.at('cyan').add(torus(0.035, 0.0065), { p: [0, 0.07, 0], r: [PI / 2, 0, 0] });
        pb.at('gold').add(torus(0.0285, 0.005), { p: [0, -0.012, 0], r: [PI / 2, 0, 0] });
      }),
    }),
  },
  // 29 ── Face Stickers: stars and hearts on the cheeks
  {
    name: 'Face Stickers', icon: '⭐', rarity: 'common',
    make: () => base({
      fixed: true,
      head: pieces('accv3|facestickers', (pb) => {
        pb.at('pink').add(wrapHead(starGeo(0.0165, 0.0075), 41, -13, 0.002), {}, true);
        pb.at('main').add(wrapHead(heartGeo(0.0105), -41, -15, 0.002), {}, true);
        pb.at('cyan').add(wrapHead(starGeo(0.008, 0.0036), 33, -6, 0.002), {}, true);
        pb.at('white').add(wrapHead(starGeo(0.0055, 0.0025), -33, -7, 0.002), {}, true);
        pb.at('white').add(wrapHead(starGeo(0.0045, 0.002), 45, -19, 0.0022), {}, true);
      }),
    }),
  },
  // 30 ── Whisker Paint: cat whiskers + a nose dot
  {
    name: 'Whisker Paint', icon: '😺', rarity: 'common',
    make: () => base({
      fixed: true,
      head: pieces('accv3|whiskers', (pb) => {
        const ink = pb.at('ink');
        for (const s of [-1, 1]) {
          for (const [dy, rot] of [[0.012, 0.28], [0.0, 0.0], [-0.012, -0.28]]) {
            const g = new THREE.PlaneGeometry(0.044, 0.0048, 6, 1);
            g.rotateZ(rot * s);
            ink.add(wrapHead(g, 40 * s, -15, 0.0016, 0.01), {}, true);
            void dy;
          }
        }
        pb.at('pink').add(wrapHead(heartGeo(0.0075), 0, -9.5, 0.006), {}, true);
      }),
    }),
  },
  // 31 ── Royal Mantle: short cape with a fluffy collar and a gold clasp
  {
    name: 'Royal Mantle', icon: '👑', rarity: 'legendary',
    make: () => base({
      body: pieces('accv3|mantle', (pb) => {
        const m = pb.at('main', 'fabric'), t = pb.at('trim', 'fabric'), w = pb.at('white', 'fabric'), g = pb.at('gold'), ink = pb.at('ink', 'fabric');
        // profile runs bottom to top so the lathe faces outward
        const prof: [number, number][] = ([[0.098, U(1.425)], [0.152, U(1.37)], [0.2, U(1.26)], [0.232, U(1.12)], [0.243, U(1.0)]] as [number, number][]).reverse();
        const c = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)));
        m.add(new THREE.LatheGeometry(c.getPoints(10), 22, PI - 1.4, 2.8), { s: [1, 1, 0.8] }, true);
        // lining: the same sheet seen from the inside (reversed profile) in the trim color
        const inner = new THREE.SplineCurve(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r - 0.004, y)));
        t.add(new THREE.LatheGeometry(inner.getPoints(10), 22, PI - 1.4, 2.8), { s: [1, 1, 0.8] }, true);
        t.add(new THREE.LatheGeometry([new THREE.Vector2(0.243, U(1.0)), new THREE.Vector2(0.247, U(1.012))], 22, PI - 1.4, 2.8), { s: [1, 1, 0.8] }, true);
        blobRing(w, U(1.41), 0.092, 14, [0.034, 0.026, 0.034], 0, 0.78);
        blobRing(w, U(1.385), 0.118, 16, [0.032, 0.024, 0.032], 0, 0.78);
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + 0.3;
          ink.e([Math.sin(a) * 0.12, U(1.372), Math.cos(a) * 0.12 * 0.78 + 0.002], [0.008, 0.012, 0.008]);
        }
        g.add(torus(0.022, 0.005), { p: [0, U(1.36), 0.1] });
        g.e([-0.035, U(1.37), 0.098], 0.008);
        g.e([0.035, U(1.37), 0.098], 0.008);
      }),
    }),
  },
  // 32 ── Fairy Wings: butterfly wings
  {
    name: 'Fairy Wings', icon: '🦋', rarity: 'epic',
    make: () => {
      const a = base({ topLift: 0 });
      a.wings = true;
      a.back = pieces('accv3|fairywings', (pb) => {
        const wing = pb.at('wing'), trim = pb.at('trim', 'fabric'), white = pb.at('white', 'fabric');
        const upper = new THREE.Shape();
        upper.moveTo(0, 0);
        upper.bezierCurveTo(0.06, 0.2, 0.2, 0.38, 0.33, 0.34);
        upper.bezierCurveTo(0.4, 0.3, 0.38, 0.14, 0.26, 0.06);
        upper.bezierCurveTo(0.18, 0.0, 0.08, -0.02, 0, 0);
        const lower = new THREE.Shape();
        lower.moveTo(0, -0.01);
        lower.bezierCurveTo(0.14, 0.0, 0.26, -0.06, 0.25, -0.17);
        lower.bezierCurveTo(0.24, -0.27, 0.12, -0.3, 0.05, -0.2);
        lower.bezierCurveTo(0.02, -0.14, 0.0, -0.08, 0, -0.01);
        const place = { p: [0.05, U(1.31), -0.1] as [number, number, number], r: [0.1, 0.55, 0] as [number, number, number] };
        wing.add(new THREE.ShapeGeometry(upper, 10), place, true);
        wing.add(new THREE.ShapeGeometry(lower, 10), place, true);
        const o = { p: [0.05, U(1.31), -0.101] as [number, number, number], r: [0.1, 0.55, 0] as [number, number, number] };
        const dots = new GB();
        dots.e([0.27, 0.27, 0], [0.04, 0.04, 0.002]);
        dots.e([0.17, -0.17, 0], [0.032, 0.032, 0.002]);
        dots.e([0.12, 0.2, 0], [0.022, 0.022, 0.002]);
        const dg = dots.build();
        white.add(dg, o, true);
        const veins = new GB();
        veins.seg([0.01, 0.0, 0], [0.31, 0.3, 0.001], 0.0035);
        veins.seg([0.01, -0.005, 0], [0.22, -0.2, 0.001], 0.0035);
        trim.add(veins.build(), { ...o, p: [0.05, U(1.31), -0.099] }, true);
      });
      return a;
    },
  },
  // 33 ── Bat Wings: scalloped, spooky-cute
  {
    name: 'Bat Wings', icon: '🦇', rarity: 'epic',
    make: () => {
      const a = base({});
      a.wings = true;
      a.back = pieces('accv3|batwings', (pb) => {
        const wing = pb.at('wing'), dark = pb.at('dark', 'fabric');
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        sh.bezierCurveTo(0.08, 0.2, 0.28, 0.36, 0.46, 0.32);
        sh.quadraticCurveTo(0.4, 0.2, 0.43, 0.08);
        sh.quadraticCurveTo(0.35, 0.12, 0.33, -0.02);
        sh.quadraticCurveTo(0.25, 0.06, 0.2, -0.1);
        sh.quadraticCurveTo(0.12, -0.0, 0.06, -0.14);
        sh.quadraticCurveTo(0.04, -0.06, 0, 0);
        const place = { p: [0.05, U(1.31), -0.1] as [number, number, number], r: [0.1, 0.6, 0] as [number, number, number] };
        wing.add(new THREE.ShapeGeometry(sh, 10), place, true);
        const ribs = new GB();
        ribs.seg([0.0, 0.0, 0.002], [0.45, 0.31, 0.002], 0.006);
        ribs.seg([0.12, 0.09, 0.002], [0.42, 0.08, 0.002], 0.0045);
        ribs.seg([0.1, 0.07, 0.002], [0.2, -0.1, 0.002], 0.0045);
        ribs.seg([0.1, 0.07, 0.002], [0.33, -0.02, 0.002], 0.0045);
        dark.add(ribs.build(), place, true);
      });
      return a;
    },
  },
  // 34 ── Pearls
  {
    name: 'Pearls', icon: '🦪', rarity: 'rare', bodyDep: true,
    make: (topOff) => base({
      body: pieces(`accv3|pearls|${topOff}`, (pb) => {
        const w = pb.at('white'), g = pb.at('gold');
        const o = Math.max(topOff, 0.014) + 0.012;
        const N = 30;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TAU;
          const drop = Math.pow(Math.max(0, Math.cos(a)), 1.4) * 0.07;
          const y = 1.41 - drop;
          const R = bodyR(y) + o;
          w.e([Math.sin(a) * R, U(y), Math.cos(a) * R * 0.72 + 0.002], 0.0088);
        }
        const yP = 1.41 - 0.07;
        g.e([0, U(yP) - 0.012, (bodyR(yP) + o) * 0.72 + 0.012], [0.009, 0.013, 0.007]);
      }),
    }),
  },
  // 35 ── Bandana: tied at the back with two tails
  {
    name: 'Bandana', icon: '🏴‍☠️', rarity: 'common',
    make: () => base({
      hat: true, topLift: 0.01,
      head: pieces('accv3|bandana', (pb) => {
        const m = pb.at('main', 'fabric'), w = pb.at('white', 'fabric');
        dome(m, 0.112, 0.11, 0.122, 0.028, -0.006, 0.0, 1.45, -0.16);
        m.add(torus(0.107, 0.0095), { p: [0, 0.0, -0.006], r: [PI / 2 - 0.16, 0, 0], s: [1, 1.1, 1] });
        for (const [x, y, z] of [[0.04, 0.12, 0.04], [-0.05, 0.11, 0.0], [0.02, 0.125, -0.05], [0.07, 0.09, -0.04], [-0.07, 0.09, 0.05], [0.0, 0.115, 0.07]]) w.e([x, y, z], [0.011, 0.005, 0.011]);
        m.e([0, 0.0, -0.128], [0.026, 0.02, 0.016]);
        m.e([-0.026, -0.04, -0.134], [0.022, 0.05, 0.012], [0, 0, 0.3]);
        m.e([0.026, -0.04, -0.134], [0.022, 0.05, 0.012], [0, 0, -0.3]);
      }),
    }),
  },
  // 36 ── Star Clips: three little stars on the temple
  {
    name: 'Star Clips', icon: '✨', rarity: 'uncommon',
    make: () => {
      const a = base({ fixed: false });
      a.onSurface = { theta: 64, phi: 26, roll: 0.5, off: 0.004 };
      a.head = pieces('accv3|starclips', (pb) => {
        const ex = (r: number) => new THREE.ExtrudeGeometry(starShape(r, r * 0.45), { depth: 0.008, bevelEnabled: false });
        pb.at('gold').add(ex(0.02), { p: [-0.03, 0.026, 0.0] }, true);
        pb.at('main', 'metal').add(ex(0.015), { p: [0.0, 0.0, 0.0] }, true);
        pb.at('white', 'metal').add(ex(0.012), { p: [0.028, -0.024, 0.0] }, true);
      });
      return a;
    },
  },
  // 37 ── Ear Muffs: big fluffy ear warmers
  {
    name: 'Ear Muffs', icon: '🎧', rarity: 'uncommon',
    make: () => base({
      topLift: 0.04,
      head: pieces('accv3|earmuffs', (pb) => {
        const f = pb.at('main', 'fabric'), dark = pb.at('dark', 'metal'), w = pb.at('white', 'fabric');
        headband(dark, 0.118, 0.0075);
        for (const s of [-1, 1]) {
          const c: [number, number, number] = [0.114 * s, -0.012, -0.004];
          f.e(c, [0.03, 0.054, 0.054]);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            w.e([c[0] + 0.012 * s, c[1] + Math.sin(a) * 0.04, c[2] + Math.cos(a) * 0.04], [0.017, 0.017, 0.017]);
          }
          w.e([c[0] + 0.022 * s, c[1], c[2]], [0.016, 0.034, 0.034]);
        }
      }),
    }),
  },
  // 38 ── Sweatband: terry headband with stripes
  {
    name: 'Sweatband', icon: '💪', rarity: 'common',
    make: () => base({
      topLift: 0.0,
      head: pieces('accv3|sweatband', (pb) => {
        const m = pb.at('main', 'fabric'), w = pb.at('white', 'fabric');
        m.add(torus(0.106, 0.0125), { p: [0, 0.062, -0.006], r: [PI / 2 + 0.12, 0, 0], s: [1, 1.1, 1] });
        w.add(torus(0.1055, 0.0042), { p: [0, 0.071, -0.006 + 0.0], r: [PI / 2 + 0.12, 0, 0], s: [1.0, 1.1, 1] });
        w.add(torus(0.1055, 0.0042), { p: [0, 0.053, -0.006], r: [PI / 2 + 0.12, 0, 0], s: [1.0, 1.1, 1] });
      }),
    }),
  },
  // 39 ── Cowboy Hat
  {
    name: 'Cowboy Hat', icon: '🤠', rarity: 'uncommon',
    make: () => base({
      hat: true, topLift: 0.07,
      head: pieces('accv3|cowboy', (pb) => {
        const m = pb.at('main', 'fabric');
        const brim = lathePts([[0.1, 0.05], [0.16, 0.054], [0.215, 0.066], [0.222, 0.074], [0.2, 0.074], [0.14, 0.066], [0.1, 0.07]].reverse() as [number, number][], 28);
        const p = brim.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i);
          const r = Math.hypot(x, z);
          p.setY(i, p.getY(i) + Math.pow(Math.max(0, (r - 0.1) / 0.12), 1.6) * (0.045 * Math.pow(x / Math.max(r, 1e-4), 2) - 0.012));
        }
        brim.computeVertexNormals();
        m.add(brim, { p: [0, 0.0, -0.006] }, true);
        m.add(lathePts([[0.104, 0.05], [0.106, 0.09], [0.098, 0.13], [0.078, 0.155], [0.045, 0.158], [0.0, 0.14]], 22).clone(), { p: [0, 0.0, -0.008], s: [1, 1, 1.05] }, true);
        pb.at('trim').ring(0.075, 0.108, 0.01);
        pb.at('gold').e([0.0, 0.075, 0.112], [0.014, 0.011, 0.006]);
      }),
    }),
  },
  // 40 ── Wizard Hat
  {
    name: 'Wizard Hat', icon: '🧙', rarity: 'rare',
    make: () => base({
      hat: true, topLift: 0.29,
      head: pieces('accv3|wizard', (pb) => {
        const m = pb.at('main', 'fabric'), gold = pb.at('gold'), t = pb.at('trim', 'fabric');
        const brim = lathePts([[0.0, 0.052], [0.2, 0.05], [0.208, 0.058], [0.12, 0.078], [0.0, 0.078]], 28);
        m.add(brim, { p: [0, 0, -0.004] }, true);
        const cone = lathePts([[0.114, 0.07], [0.1, 0.13], [0.078, 0.2], [0.05, 0.28], [0.026, 0.34], [0.0, 0.385]], 20);
        const p = cone.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          const k = Math.max(0, y - 0.16);
          p.setZ(i, p.getZ(i) - k * k * 1.9);
          p.setY(i, y - k * k * 0.5);
        }
        cone.computeVertexNormals();
        m.add(cone, { p: [0, 0, -0.004] }, true);
        t.ring(0.076, 0.112, 0.012);
        gold.e([0, 0.076, 0.118], [0.016, 0.012, 0.006]);
        for (const [y, x] of [[0.14, 0.03], [0.2, -0.02], [0.105, -0.05]]) {
          const r = 0.1 - (y - 0.13) * 0.55;
          gold.add(starGeo(0.016, 0.007), { p: [x, y, Math.max(0.03, r) * 0.98 + 0.002 - 0.01] });
        }
      }),
    }),
  },
  // 41 ── Lollipop (held)
  {
    name: 'Lollipop', icon: '🍭', rarity: 'common',
    make: () => base({
      holds: true,
      handR: pieces('accv3|lollipop', (pb) => {
        pb.at('white').seg([0, -0.075, 0.034], [0, 0.1, 0.034], 0.0042);
        const m = pb.at('main');
        m.add(new THREE.CylinderGeometry(0.058, 0.058, 0.018, 20), { p: [0, 0.15, 0.034], r: [PI / 2, 0, 0] });
        pb.at('pink').add(new THREE.TorusGeometry(0.04, 0.0065, 4, 18), { p: [0, 0.15, 0.044] });
        pb.at('white').add(new THREE.TorusGeometry(0.022, 0.0065, 4, 14), { p: [0, 0.15, 0.045] });
        pb.at('pink').e([0, 0.15, 0.046], 0.008);
      }),
    }),
  },
  // 42 ── Balloon (held, floats overhead)
  {
    name: 'Balloon', icon: '🎈', rarity: 'uncommon',
    make: () => base({
      holds: true,
      handR: pieces('accv3|balloon', (pb) => {
        const m = pb.at('main');
        pb.at('white').add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.0, 0.034), new THREE.Vector3(0.012, 0.25, 0.03), new THREE.Vector3(-0.01, 0.5, 0.03), new THREE.Vector3(0.0, 0.66, 0.034)]), 14, 0.0018, 4, false), {}, true);
        m.add(new THREE.SphereGeometry(1, 20, 14), { p: [0, 0.84, 0.034], s: [0.115, 0.14, 0.115] });
        m.add(new THREE.ConeGeometry(0.02, 0.03, 8), { p: [0, 0.688, 0.034], r: [PI, 0, 0] });
        pb.at('white').e([-0.04, 0.89, 0.12], [0.028, 0.045, 0.012], [0, 0, 0.5]);
      }),
    }),
  },
  // 43 ── Ice Cream (held)
  {
    name: 'Ice Cream', icon: '🍦', rarity: 'common',
    make: () => base({
      holds: true,
      handR: pieces('accv3|icecream', (pb) => {
        const cone = pb.at('cream');
        cone.add(new THREE.ConeGeometry(0.03, 0.11, 10), { p: [0, 0.0, 0.034], r: [PI, 0, 0] });
        pb.at('dark').add(new THREE.TorusGeometry(0.024, 0.0025, 3, 12), { p: [0, 0.01, 0.034], r: [PI / 2, 0, 0] });
        pb.at('main').e([0, 0.07, 0.034], [0.04, 0.034, 0.04]);
        pb.at('pink').e([0, 0.108, 0.034], [0.032, 0.028, 0.032]);
        pb.at('white').e([0, 0.14, 0.034], [0.02, 0.026, 0.02]);
        pb.at('pink').e([0.012, 0.162, 0.034], 0.011);
      }),
    }),
  },
  // 44 ── Antennae: bobbing stalks with gold pom-poms
  {
    name: 'Antennae', icon: '🐝', rarity: 'uncommon',
    make: () => base({
      topLift: 0.19,
      head: pieces('accv3|antennae', (pb) => {
        const m = pb.at('main');
        headband(m, 0.118, 0.0075);
        for (const s of [-1, 1]) {
          const { p } = archAt(0.3);
          const pts = [new THREE.Vector3(p.x * s, p.y, p.z), new THREE.Vector3(p.x * s * 1.1, p.y + 0.06, 0.0), new THREE.Vector3(p.x * s * 1.5, p.y + 0.12, 0.03), new THREE.Vector3(p.x * s * 1.7, p.y + 0.17, 0.07)];
          pb.at('dark').add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0035, 4, false), {}, true);
          pb.at('gold').e(arr3(pts[3]), 0.02);
        }
      }),
    }),
  },
  // 45 ── Halo: a glowing ring floating above
  {
    name: 'Halo', icon: '😇', rarity: 'legendary',
    make: () => base({
      topLift: 0.25,
      head: pieces('accv3|halo', (pb) => {
        pb.at('main', 'metal').add(torus(0.086, 0.0095), { p: [0, 0.255, -0.01], r: [PI / 2 + 0.3, 0, 0], s: [1, 1.1, 1] });
        pb.at('diamond').add(ico(0.012), { p: [0, 0.255 + 0.0, 0.1], s: [1, 1, 1] }, true);
      }),
    }),
  },
];

void B;
void box;
void blobRing;
void dome;
void hoodEdge;

import { SUIT_ACCS } from './wardrobeSuits';
ACC_V3.push(...SUIT_ACCS); // full-body suit head gear + cape (wardrobeSuits.ts)
