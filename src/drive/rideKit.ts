// ── v3 rides, lofted ─────────────────────────────────────────────────────────
// Geometry kit for the Fortnite-style rides: one continuous curved body instead of stacked boxes.
//   loftBody(sections)   a skin through superellipse cross-sections (tumblehome, wheel arches) with smooth normals, capped ends, UVs
//   loftRings(rings)     the same skin through any closed outlines (the V-hull of the boat)
//   profile(ctrl)        a smooth (monotone cubic) curve through control points: shapes the plan view and the side view
//   wheel geometry       tyres with a rounded sidewall + shallow tread grooves, dished 5/6-spoke rims, hub caps
// Pure geometry: no materials, no scene. rides.ts decides which draw call each piece joins.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** One cross-section of a body, across the car at height z (front of the car is -z). */
export interface Section {
  z: number;
  /** half the width at the widest point */
  halfWidth: number;
  /** top and bottom of the section (metres above the ground) */
  top: number;
  bottom: number;
  /** 1 = an ellipse … 0 = an almost square rounded box (default 1) */
  round?: number;
  /** tumblehome: the top is narrower than the belt by this fraction (0.2 = 20 % narrower at the very top) */
  taper?: number;
  /** a wheel arch: the lower side corners ride up to this height (absolute y) */
  arch?: number;
}

/** A smooth monotone-cubic curve through (x, value) control points (no overshoot, flat outside the ends). */
export function profile(ctrl: [number, number][]): (x: number) => number {
  const n = ctrl.length;
  const xs = ctrl.map((p) => p[0]), ys = ctrl.map((p) => p[1]);
  const d = new Array<number>(n).fill(0);
  const h: number[] = [], s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    s.push((ys[i + 1] - ys[i]) / h[i]);
  }
  for (let i = 1; i < n - 1; i++) d[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
  d[0] = s[0] ?? 0;
  d[n - 1] = s[n - 2] ?? 0;
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) {
      d[i] = 0;
      d[i + 1] = 0;
    } else {
      const a = d[i] / s[i], b = d[i + 1] / s[i], q = a * a + b * b;
      if (q > 9) {
        const t = 3 / Math.sqrt(q);
        d[i] = t * a * s[i];
        d[i + 1] = t * b * s[i];
      }
    }
  }
  return (x: number): number => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * d[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * d[i + 1];
  };
}

/** The outline of a section: a superellipse (with tumblehome and a wheel arch) as `n` points, counter-clockwise seen from +z. */
export function sectionRing(s: Section, n = 30): [number, number][] {
  const e = 2 + (1 - (s.round ?? 1)) * 4;
  const p = 2 / e;
  // a wheel arch is simply a raised belly over the wheel (the silhouette is the half circle); it never gets thinner than a fender
  const bottom = s.arch !== undefined ? Math.max(s.bottom, Math.min(s.arch, s.top - 0.09)) : s.bottom;
  const mid = (s.top + bottom) / 2, hh = Math.max(0.001, (s.top - bottom) / 2);
  const out: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const ux = Math.sign(c) * Math.pow(Math.abs(c), p), uy = Math.sign(sn) * Math.pow(Math.abs(sn), p);
    let x = ux * s.halfWidth;
    let y = mid + uy * hh;
    if (s.taper) x *= 1 - s.taper * smooth(-0.1, 1, uy);
    out.push([x, y]);
  }
  return out;
}

export interface Ring {
  z: number;
  pts: [number, number][];
}

/**
 * Skin a list of closed outlines (all with the same number of points, sorted by z, front first) into one smooth surface with
 * capped ends. Normals come from the surface itself (smooth); uv = (around, along).
 */
export function loftRings(rings: Ring[], capFront = true, capBack = true): THREE.BufferGeometry {
  const M = rings.length, N = rings[0].pts.length;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = (i: number, j: number): THREE.Vector3 => new THREE.Vector3(rings[i].pts[((j % N) + N) % N][0], rings[i].pts[((j % N) + N) % N][1], rings[i].z);
  const z0 = rings[0].z, z1 = rings[M - 1].z;
  const tr = new THREE.Vector3(), tz = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    for (let j = 0; j <= N; j++) {
      const p = P(i, j);
      tr.subVectors(P(i, j + 1), P(i, j - 1));
      tz.subVectors(P(Math.min(M - 1, i + 1), j), P(Math.max(0, i - 1), j));
      nn.crossVectors(tr, tz);
      if (nn.lengthSq() < 1e-12) nn.set(0, 1, 0);
      nn.normalize();
      pos.push(p.x, p.y, p.z);
      nor.push(nn.x, nn.y, nn.z);
      uv.push(j / N, (rings[i].z - z0) / Math.max(1e-6, z1 - z0));
    }
  }
  const W = N + 1;
  for (let i = 0; i < M - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * W + j, b = a + 1, c = (i + 1) * W + j, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (i: number, front: boolean): void => {
    const base = pos.length / 3;
    let cx = 0, cy = 0;
    for (let j = 0; j < N; j++) {
      cx += rings[i].pts[j][0];
      cy += rings[i].pts[j][1];
    }
    cx /= N;
    cy /= N;
    const nz = front ? -1 : 1;
    pos.push(cx, cy, rings[i].z);
    nor.push(0, 0, nz);
    uv.push(0.5, front ? 0 : 1);
    for (let j = 0; j < N; j++) {
      pos.push(rings[i].pts[j][0], rings[i].pts[j][1], rings[i].z);
      nor.push(0, 0, nz);
      uv.push(0.5, front ? 0 : 1);
    }
    for (let j = 0; j < N; j++) {
      const a = base + 1 + j, b = base + 1 + ((j + 1) % N);
      if (front) idx.push(base, b, a);
      else idx.push(base, a, b);
    }
  };
  if (capFront) cap(0, true);
  if (capBack) cap(M - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** A body: superellipse sections lofted along z (28-32 points per ring). */
export function loftBody(sections: Section[], ring = 30, capFront = true, capBack = true): THREE.BufferGeometry {
  return loftRings(sections.map((s) => ({ z: s.z, pts: sectionRing(s, ring) })), capFront, capBack);
}

/** Sections sampled from smooth curves: one per z (the caller lists the stations; more of them around the wheels). */
export function sampleSections(zs: number[], f: { hw: (z: number) => number; top: (z: number) => number; bottom: (z: number) => number; round?: (z: number) => number; taper?: (z: number) => number; arch?: (z: number) => number | undefined }): Section[] {
  return zs.map((z) => ({ z, halfWidth: f.hw(z), top: f.top(z), bottom: f.bottom(z), round: f.round?.(z), taper: f.taper?.(z), arch: f.arch?.(z) }));
}

/** The arch height (absolute y) of the lower side corners over wheels at the given z positions: a half circle round each wheel, else undefined. */
export function archFn(wheels: { z: number; y: number; r: number }[], gap = 0.07): (z: number) => number | undefined {
  return (z: number) => {
    let best: number | undefined;
    for (const w of wheels) {
      const ra = w.r + gap, dz = Math.abs(z - w.z);
      if (dz < ra) {
        const y = w.y + Math.sqrt(ra * ra - dz * dz);
        if (best === undefined || y > best) best = y;
      }
    }
    return best;
  };
}

/** `count` stations from z0 to z1, plus extras (so an arch is traced by a few close stations). */
export function stations(z0: number, z1: number, count: number, extra: number[] = []): number[] {
  const zs = new Set<number>();
  for (let i = 0; i < count; i++) zs.add(Math.round((z0 + ((z1 - z0) * i) / (count - 1)) * 1000) / 1000);
  for (const z of extra) if (z > z0 && z < z1) zs.add(Math.round(z * 1000) / 1000);
  return [...zs].sort((a, b) => a - b);
}

/** Stations clustered round each wheel: dz from the wheel centre. */
export function archStations(wheelZs: number[], r: number, ks: number[] = [0, 0.5, 0.85, 1.05]): number[] {
  const out: number[] = [];
  for (const z of wheelZs) for (const k of ks) out.push(z + k * (r + 0.07), z - k * (r + 0.07));
  return out;
}

/** A tube along points (pillars, rails, mirror stalks). */
export function tube(points: [number, number, number][], radius: number, radial = 7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 3), radius, radial, false);
}

// ── wheels ──────────────────────────────────────────────────────────────────
export interface WheelParts {
  geo: THREE.BufferGeometry;
  tireEnd: number;
  rimEnd: number;
  count: number;
}
export type WheelKit = 'sport' | 'offroad' | 'cart';

/**
 * A wheel (axle along x, outer face at +x) as ONE non-indexed buffer: [tyre | rim | hub cap] with a colour attribute to fill.
 * The tyre is a lathe with a rounded sidewall and shallow tread grooves; the rim is a dished disc with 5 / 6 spokes and a hub.
 */
export function makeWheel(R: number, W: number, kind: WheelKit): WheelParts {
  const rimR = R * (kind === 'offroad' ? 0.6 : kind === 'cart' ? 0.62 : 0.68);
  const shoulder = Math.min(0.09, R * 0.2);
  const groove = kind === 'offroad' ? 0.022 : 0.012;
  // tyre outline: bead → sidewall bulge → shoulder → tread (with grooves) → and back down the other side. (radius, along the axle)
  const half: [number, number][] = [
    [rimR * 0.98, 0.36 * W],
    [rimR + (R - rimR) * 0.32, 0.5 * W],
    [rimR + (R - rimR) * 0.7, 0.485 * W],
    [R - shoulder, 0.43 * W],
    [R - shoulder * 0.35, 0.37 * W],
  ];
  const treadHalf = 0.33 * W;
  const lands = kind === 'offroad' ? 4 : 3;
  const tread: [number, number][] = [];
  // alternate land / groove across the tread (symmetric)
  const cells = lands * 2 - 1;
  for (let c = 0; c < cells; c++) {
    const a0 = -treadHalf + ((2 * treadHalf) / cells) * c, a1 = -treadHalf + ((2 * treadHalf) / cells) * (c + 1);
    const r = c % 2 === 0 ? R : R - groove;
    tread.push([r, a0 + 0.004], [r, a1 - 0.004]);
  }
  const prof: [number, number][] = [
    ...half.map(([r, a]): [number, number] => [r, -a]),
    ...tread,
    ...half.slice().reverse().map(([r, a]): [number, number] => [r, a]),
  ];
  const seg = kind === 'cart' ? 22 : 26;
  const lat = new THREE.LatheGeometry(prof.map(([r, a]) => new THREE.Vector2(r, a)), seg);
  const T = new THREE.Matrix4().makeRotationZ(-Math.PI / 2); // lathe axis y → x (outer face at +x)
  const piece = (g: THREE.BufferGeometry, m4?: THREE.Matrix4): THREE.BufferGeometry => {
    let c = g.clone();
    if (m4) c.applyMatrix4(m4);
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name);
    if (c.index) c = c.toNonIndexed();
    return c;
  };
  const tire = [piece(lat, T)];
  const face = 0.34 * W;
  // the rim: a dish (outer lip → well → hub boss), a barrel lip, and 5 / 6 spokes
  const dish: [number, number][] = [
    [rimR, face],
    [rimR * 0.93, face - 0.02 * W],
    [rimR * 0.62, face - 0.1 * W],
    [rimR * 0.3, face - 0.06 * W],
    [rimR * 0.26, face + 0.02 * W],
    [0.001, face + 0.03 * W],
  ];
  const rim: THREE.BufferGeometry[] = [piece(new THREE.LatheGeometry(dish.map(([r, a]) => new THREE.Vector2(r, a)), 18), T)];
  const lip: [number, number][] = [
    [rimR, face + 0.004],
    [rimR + 0.012, face - 0.02 * W],
    [rimR * 1.02, face - 0.08 * W],
  ];
  rim.push(piece(new THREE.LatheGeometry(lip.map(([r, a]) => new THREE.Vector2(r, a)), 22), T));
  const spokes = kind === 'offroad' ? 6 : kind === 'sport' ? 5 : 0;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    const len = rimR * 0.86, wd = kind === 'offroad' ? 0.1 * R : 0.085 * R;
    const m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(face + 0.025 * W, Math.cos(a) * len * 0.58, Math.sin(a) * len * 0.58),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    rim.push(piece(new THREE.BoxGeometry(0.03 * W + 0.01, len, wd), m4));
  }
  const cap = [piece(new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.26, 0.05 * W + 0.01, 12).rotateZ(-Math.PI / 2), new THREE.Matrix4().makeTranslation(face + 0.045 * W, 0, 0))];
  const cnt = (l: THREE.BufferGeometry[]): number => l.reduce((s, g) => s + g.attributes.position.count, 0);
  const geo = mergeGeometries([...tire, ...rim, ...cap], false)!;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  geo.computeBoundingSphere();
  return { geo, tireEnd: cnt(tire), rimEnd: cnt(tire) + cnt(rim), count: geo.attributes.position.count };
}
