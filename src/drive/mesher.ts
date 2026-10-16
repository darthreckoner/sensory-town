// A tiny geometry builder for buildings and props: boxes, cylinders, quads and
// prisms are accumulated per material and emitted as ONE mesh per material.
// A 2D rigid-transform stack (translate + yaw) lets a building be modelled in
// its own local space (front = +z) and placed anywhere.
import * as THREE from 'three';

interface Bucket {
  p: number[];
  n: number[];
  uv: number[];
  c: number[];
}

export interface BoxOpts {
  yaw?: number;
  /** tile size in world units for the texture (u, v); omit for plain 0..1 uvs */
  tile?: [number, number];
  /** vertex colour (instead of material colour) */
  color?: THREE.ColorRepresentation;
  /** skip these faces: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' */
  skip?: string[];
  /** y offset of the uv origin (so floors line up) */
  vOff?: number;
  /** force (or forbid) casting a shadow; default: only big masses (>= 4 wide and >= 2.5 tall) cast */
  cast?: boolean;
}

/** Materials that look the same (colour, finish rounded to quarters, maps...) share one mesh: fewer draw calls. */
export function materialSignature(m: THREE.Material): string {
  if (m.userData && m.userData.keep) return m.uuid; // animated / recoloured at runtime: never fold
  const a = m as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial & THREE.MeshBasicMaterial;
  const q = (v: number | undefined): number => Math.round((v ?? 0) * 4);
  return [
    m.type, a.color ? a.color.getHex() : 0, q(a.roughness), q(a.metalness), a.emissive ? a.emissive.getHex() : 0, a.emissiveIntensity ?? 1,
    a.map ? a.map.id : 0, a.emissiveMap ? a.emissiveMap.id : 0, a.vertexColors ? 1 : 0, m.transparent ? 1 : 0, m.opacity, m.side, m.depthWrite ? 1 : 0, a.toneMapped ? 1 : 0,
    a.fog === false ? 0 : 1, m.polygonOffset ? m.polygonOffsetFactor : 0, a.clearcoat ?? 0, a.alphaTest ?? 0,
  ].join('|');
}

const foldCache = new Map<string, THREE.Material>();
/**
 * Flat-coloured materials (no maps, no glow, opaque) share one vertex-coloured material per finish class,
 * so a district's dozens of colours become a handful of meshes. Returns the material to draw with and the
 * colour to bake into the vertices (null when the geometry already has its own colours / is not foldable).
 */
export function foldMaterial(m: THREE.Material): { mat: THREE.Material; color: THREE.Color | null } {
  const a = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  if ((m.userData && m.userData.keep) || (a as THREE.MeshStandardMaterial).flatShading || a.map || (a as THREE.MeshStandardMaterial).emissiveMap || m.transparent || m.side !== THREE.FrontSide || m.polygonOffset || a.alphaTest) return { mat: m, color: null };
  if (m.type === 'MeshStandardMaterial') {
    const e = (a as THREE.MeshStandardMaterial).emissive;
    if (e && e.getHex() !== 0) return { mat: m, color: null };
    const r = Math.round(a.roughness * 4) / 4, mt = Math.round(a.metalness * 4) / 4;
    const key = 'std|' + r + '|' + mt;
    let t = foldCache.get(key);
    if (!t) foldCache.set(key, (t = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: mt })));
    return { mat: t, color: a.vertexColors ? null : a.color };
  }
  if (m.type === 'MeshBasicMaterial' && !a.vertexColors) {
    const key = 'basic|' + (a.toneMapped ? 1 : 0) + '|' + (a.fog === false ? 0 : 1);
    let t = foldCache.get(key);
    if (!t) foldCache.set(key, (t = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: a.toneMapped, fog: a.fog !== false })));
    return { mat: t, color: a.color };
  }
  return { mat: m, color: null };
}

export class Mesher {
  private buckets = new Map<THREE.Material, Bucket>();
  private castBuckets = new Map<THREE.Material, Bucket>();
  private forceCast: boolean | null = null;
  private stack: { x: number; z: number; c: number; s: number }[] = [{ x: 0, z: 0, c: 1, s: 0 }];
  private col = new THREE.Color();
  castShadow = new Set<THREE.Material>();
  noReceive = new Set<THREE.Material>();

  // ── transform stack (2D rigid in xz, around y) ──
  push(x: number, z: number, yaw = 0): this {
    const t = this.stack[this.stack.length - 1];
    const wx = t.x + x * t.c + z * t.s;
    const wz = t.z - x * t.s + z * t.c;
    // combine yaw (rotation about y by `yaw`): total = t.yaw + yaw
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    // child rotation composed with parent: [c s; -s c] * [ca sa; -sa ca]
    const c = t.c * ca - t.s * sa, s = t.c * sa + t.s * ca;
    this.stack.push({ x: wx, z: wz, c, s });
    return this;
  }
  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  /** Local (x, z) → world. */
  toWorld(x: number, z: number): [number, number] {
    const t = this.stack[this.stack.length - 1];
    return [t.x + x * t.c + z * t.s, t.z - x * t.s + z * t.c];
  }
  get yaw(): number {
    const t = this.stack[this.stack.length - 1];
    return Math.atan2(t.s, t.c);
  }

  private bucket(m: THREE.Material, cast = this.forceCast ?? false): Bucket {
    const map = cast || this.castShadow.has(m) ? this.castBuckets : this.buckets;
    let b = map.get(m);
    if (!b) map.set(m, (b = { p: [], n: [], uv: [], c: [] }));
    return b;
  }

  /** One triangle with world-space (already transformed) vertices. */
  private tri(b: Bucket, a: number[], bb: number[], c: number[], n: number[], uvs: number[][], col: THREE.Color | null): void {
    const pts = [a, bb, c];
    for (let i = 0; i < 3; i++) {
      b.p.push(pts[i][0], pts[i][1], pts[i][2]);
      b.n.push(n[0], n[1], n[2]);
      b.uv.push(uvs[i][0], uvs[i][1]);
      if (col) b.c.push(col.r, col.g, col.b);
    }
  }

  /** A quad from 4 LOCAL points (counter-clockwise seen from the normal side). Normal is computed. */
  quad(m: THREE.Material, p0: number[], p1: number[], p2: number[], p3: number[], uv?: number[][], color?: THREE.ColorRepresentation): this {
    const b = this.bucket(m);
    const W = [p0, p1, p2, p3].map((p) => {
      const [x, z] = this.toWorld(p[0], p[2]);
      return [x, p[1], z];
    });
    const ux = W[1][0] - W[0][0], uy = W[1][1] - W[0][1], uz = W[1][2] - W[0][2];
    const vx = W[2][0] - W[0][0], vy = W[2][1] - W[0][1], vz = W[2][2] - W[0][2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const U = uv ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    const col = color !== undefined ? this.col.set(color) : null;
    this.tri(b, W[0], W[1], W[2], [nx, ny, nz], [U[0], U[1], U[2]], col);
    this.tri(b, W[0], W[2], W[3], [nx, ny, nz], [U[0], U[2], U[3]], col);
    return this;
  }

  /** Axis-aligned (in local space) box centred at (cx,cy,cz). */
  box(m: THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, d: number, o: BoxOpts = {}): this {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const yaw = o.yaw ?? 0;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    // local corner → rotate by yaw about (cx,cz) → push through the stack
    const P = (x: number, y: number, z: number): number[] => [cx + x * ca + z * sa, cy + y, cz - x * sa + z * ca];
    const skip = o.skip ?? [];
    const tile = o.tile;
    const v0 = o.vOff ?? 0;
    // faces: [name, 4 corners CCW from outside, normal]
    const faces: [string, number[][], number[], number, number][] = [
      ['front', [P(-hw, -hh, hd), P(hw, -hh, hd), P(hw, hh, hd), P(-hw, hh, hd)], [0, 0, 1], w, h],
      ['back', [P(hw, -hh, -hd), P(-hw, -hh, -hd), P(-hw, hh, -hd), P(hw, hh, -hd)], [0, 0, -1], w, h],
      ['right', [P(hw, -hh, hd), P(hw, -hh, -hd), P(hw, hh, -hd), P(hw, hh, hd)], [1, 0, 0], d, h],
      ['left', [P(-hw, -hh, -hd), P(-hw, -hh, hd), P(-hw, hh, hd), P(-hw, hh, -hd)], [-1, 0, 0], d, h],
      ['top', [P(-hw, hh, hd), P(hw, hh, hd), P(hw, hh, -hd), P(-hw, hh, -hd)], [0, 1, 0], w, d],
      ['bottom', [P(-hw, -hh, -hd), P(hw, -hh, -hd), P(hw, -hh, hd), P(-hw, -hh, hd)], [0, -1, 0], w, d],
    ];
    const b = this.bucket(m, o.cast ?? (Math.max(w, d) >= 4 && h >= 2.5));
    const col = o.color !== undefined ? new THREE.Color(o.color) : null;
    for (const [name, c, , fw, fh] of faces) {
      if (skip.includes(name)) continue;
      const W = c.map((p) => {
        const [x, z] = this.toWorld(p[0], p[2]);
        return [x, p[1], z];
      });
      const ux = W[1][0] - W[0][0], uy = W[1][1] - W[0][1], uz = W[1][2] - W[0][2];
      const vx = W[2][0] - W[0][0], vy = W[2][1] - W[0][1], vz = W[2][2] - W[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      let uvs: number[][];
      if (tile) {
        const side = name !== 'top' && name !== 'bottom';
        const uMax = fw / tile[0];
        const vMax = (side ? fh : fh) / tile[1];
        const vb = side ? (cy - hh + v0) / tile[1] : 0;
        uvs = [[0, vb], [uMax, vb], [uMax, vb + vMax], [0, vb + vMax]];
      } else uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      this.tri(b, W[0], W[1], W[2], [nx, ny, nz], [uvs[0], uvs[1], uvs[2]], col);
      this.tri(b, W[0], W[2], W[3], [nx, ny, nz], [uvs[0], uvs[2], uvs[3]], col);
    }
    return this;
  }

  /** Vertical cylinder (or tapered / cone with rTop = 0). */
  cyl(m: THREE.Material, cx: number, cy: number, cz: number, rBottom: number, rTop: number, h: number, seg = 10, color?: THREE.ColorRepresentation): this {
    const b = this.bucket(m, rBottom * 2 >= 1.6 && h >= 3);
    const col = color !== undefined ? new THREE.Color(color) : null;
    const slope = (rBottom - rTop) / h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const pts = [
        [cx + c0 * rBottom, cy, cz + s0 * rBottom], [cx + c1 * rBottom, cy, cz + s1 * rBottom],
        [cx + c1 * rTop, cy + h, cz + s1 * rTop], [cx + c0 * rTop, cy + h, cz + s0 * rTop],
      ].map((p) => {
        const [x, z] = this.toWorld(p[0], p[2]);
        return [x, p[1], z];
      });
      const nm = (c: number, s: number): number[] => {
        const [nx, nz] = this.rotDir(c, s);
        const l = Math.hypot(nx, slope, nz);
        return [nx / l, slope / l, nz / l];
      };
      const n0 = nm(c0, s0), n1 = nm(c1, s1);
      const u0 = i / seg, u1 = (i + 1) / seg;
      // two triangles with smooth normals (wound so the outside is the front face)
      this.pushTri(b, pts[0], pts[2], pts[1], n0, n1, n1, [[u0, 0], [u1, 1], [u1, 0]], col);
      this.pushTri(b, pts[0], pts[3], pts[2], n0, n0, n1, [[u0, 0], [u0, 1], [u1, 1]], col);
      // caps
      if (rTop > 0) {
        const t = this.toWorld(cx, cz);
        this.tri(b, [t[0], cy + h, t[1]], pts[2], pts[3], [0, 1, 0], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], col);
      }
      if (rBottom > 0 && rTop > 0) {
        const t = this.toWorld(cx, cz);
        this.tri(b, [t[0], cy, t[1]], pts[0], pts[1], [0, -1, 0], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], col);
      }
    }
    return this;
  }
  private rotDir(c: number, s: number): [number, number] {
    const t = this.stack[this.stack.length - 1];
    return [c * t.c + s * t.s, -c * t.s + s * t.c];
  }
  private pushTri(b: Bucket, a: number[], bb: number[], c: number[], na: number[], nb: number[], nc: number[], uvs: number[][], col: THREE.Color | null): void {
    const pts = [a, bb, c], ns = [na, nb, nc];
    for (let i = 0; i < 3; i++) {
      b.p.push(pts[i][0], pts[i][1], pts[i][2]);
      b.n.push(ns[i][0], ns[i][1], ns[i][2]);
      b.uv.push(uvs[i][0], uvs[i][1]);
      if (col) b.c.push(col.r, col.g, col.b);
    }
  }

  /** Extruded gable-ish prism: a triangle cross-section along local z. ridge along z, base width w, rise h, length d. */
  prism(m: THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, d: number, color?: THREE.ColorRepresentation): this {
    const hw = w / 2, hd = d / 2;
    const col = color !== undefined ? this.col.set(color) : null;
    this.forceCast = Math.max(w, d) >= 4 && h >= 1.5;
    // two sloped quads + two end triangles
    this.quad(m, [cx - hw, cy, cz - hd], [cx - hw, cy, cz + hd], [cx, cy + h, cz + hd], [cx, cy + h, cz - hd], undefined, col ?? undefined);
    this.quad(m, [cx + hw, cy, cz + hd], [cx + hw, cy, cz - hd], [cx, cy + h, cz - hd], [cx, cy + h, cz + hd], undefined, col ?? undefined);
    const b = this.bucket(m);
    const W = (p: number[]): number[] => {
      const [x, z] = this.toWorld(p[0], p[2]);
      return [x, p[1], z];
    };
    this.tri(b, W([cx - hw, cy, cz + hd]), W([cx + hw, cy, cz + hd]), W([cx, cy + h, cz + hd]), this.rotN(0, 0, 1), [[0, 0], [1, 0], [0.5, 1]], col);
    this.tri(b, W([cx + hw, cy, cz - hd]), W([cx - hw, cy, cz - hd]), W([cx, cy + h, cz - hd]), this.rotN(0, 0, -1), [[0, 0], [1, 0], [0.5, 1]], col);
    this.forceCast = null;
    return this;
  }
  private rotN(x: number, y: number, z: number): number[] {
    const [nx, nz] = this.rotDir(x, z);
    return [nx, y, nz];
  }

  /** Emit one mesh per (look-alike material, casts-a-shadow). */
  build(name = 'mesh'): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    const groups = new Map<string, { mat: THREE.Material; b: Bucket; cast: boolean; recv: boolean }>();
    const add = (mat0: THREE.Material, src: Bucket, cast0: boolean): void => {
      if (src.p.length === 0) return;
      const basic = (mat0 as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      const cast = cast0 && !basic;
      const recv = !this.noReceive.has(mat0) && !basic;
      const f = foldMaterial(mat0);
      const mat = f.mat;
      // colours for the vertex-coloured fold (a bucket that already has its own colours keeps them)
      let c = src.c;
      if (f.color) {
        c = new Array(src.p.length);
        for (let i = 0; i < src.p.length; i += 3) {
          c[i] = f.color.r;
          c[i + 1] = f.color.g;
          c[i + 2] = f.color.b;
        }
      } else if ((mat as THREE.MeshStandardMaterial).vertexColors && src.c.length !== src.p.length) {
        // vertex-coloured material without full colour data: paint it the material's own colour
        c = new Array(src.p.length).fill(1);
      }
      const key = (f.color || (mat as THREE.MeshStandardMaterial).vertexColors ? 'fold|' + mat.uuid : materialSignature(mat)) + '|' + (cast ? 1 : 0);
      const hit = groups.get(key);
      if (!hit) groups.set(key, { mat, b: { p: src.p.slice(), n: src.n.slice(), uv: src.uv.slice(), c: c.slice() }, cast, recv });
      else {
        for (let i = 0; i < src.p.length; i++) hit.b.p.push(src.p[i]);
        for (let i = 0; i < src.n.length; i++) hit.b.n.push(src.n[i]);
        for (let i = 0; i < src.uv.length; i++) hit.b.uv.push(src.uv[i]);
        for (let i = 0; i < c.length; i++) hit.b.c.push(c[i]);
        hit.recv = hit.recv && recv;
      }
    };
    for (const [mat, b] of this.buckets) add(mat, b, false);
    for (const [mat, b] of this.castBuckets) add(mat, b, true);
    for (const { mat, b, cast, recv } of groups.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (b.c.length === b.p.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = recv;
      g.add(mesh);
    }
    return g;
  }
}
