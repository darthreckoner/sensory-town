import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';
import { makePattern } from '../src/build/patterns';
import { MAPPED } from '../src/build/mats';

function crc32(buf: Buffer): number {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function writePng(file: string, w: number, h: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const lin2srgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const patCache = new Map<string, Uint8Array>();
function pat(id: string): Uint8Array {
  let p = patCache.get(id);
  if (!p) { p = makePattern(id as any, 128); patCache.set(id, p); }
  return p;
}

export interface View { target: THREE.Vector3; dist: number; yaw: number; pitch: number; fov?: number }

export function render(file: string, root: THREE.Object3D, view: View, W = 900, H = 620, bg = ['#9fc0ff', '#ffd9bd']) {
  root.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(view.fov ?? 40, W / H, 0.3, 500);
  cam.position.set(view.target.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, view.target.y + Math.sin(view.pitch) * view.dist, view.target.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
  cam.lookAt(view.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const img = new Uint8Array(W * H * 3);
  const c0 = new THREE.Color(bg[0]).convertLinearToSRGB(), c1 = new THREE.Color(bg[1]).convertLinearToSRGB();
  const col0 = new THREE.Color(bg[0]), col1 = new THREE.Color(bg[1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = y / H; const i = (y * W + x) * 3; img[i] = (col0.r + (col1.r - col0.r) * t) * 255; img[i + 1] = (col0.g + (col1.g - col0.g) * t) * 255; img[i + 2] = (col0.b + (col1.b - col0.b) * t) * 255; }
  void c0; void c1;
  const zbuf = new Float32Array(W * H).fill(Infinity);
  const L = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
  interface Tri { p: THREE.Vector3[]; c: number[][]; uv: number[][] | null; pat: Uint8Array | null; a: number }
  const trans: Tri[] = [];
  const nm = new THREE.Matrix3();
  function raster(t: Tri, blend: boolean) {
    const sp = t.p.map((q) => { const r = q.clone().applyMatrix4(vp); return [(r.x * 0.5 + 0.5) * W, (-r.y * 0.5 + 0.5) * H, r.z]; });
    const minX = Math.max(0, Math.floor(Math.min(sp[0][0], sp[1][0], sp[2][0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(sp[0][0], sp[1][0], sp[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(sp[0][1], sp[1][1], sp[2][1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(sp[0][1], sp[1][1], sp[2][1])));
    const [a, b, c] = sp;
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      const idx = y * W + x;
      if (z > zbuf[idx] || z < -1) continue;
      const col = [0, 1, 2].map((k) => t.c[0][k] * l1 + t.c[1][k] * l2 + t.c[2][k] * l3);
      if (t.uv && t.pat) {
        const u = t.uv[0][0] * l1 + t.uv[1][0] * l2 + t.uv[2][0] * l3, v = t.uv[0][1] * l1 + t.uv[1][1] * l2 + t.uv[2][1] * l3;
        const fu = u - Math.floor(u), fv = v - Math.floor(v);
        const tx = Math.min(127, Math.floor(fu * 128)), ty = Math.min(127, Math.floor(fv * 128));
        const m = t.pat[(ty * 128 + tx) * 4] / 255;
        for (let k = 0; k < 3; k++) col[k] *= m;
      }
      const i = idx * 3;
      if (blend) { for (let k = 0; k < 3; k++) img[i + k] = img[i + k] * (1 - t.a) + col[k] * t.a; }
      else { zbuf[idx] = z; for (let k = 0; k < 3; k++) img[i + k] = col[k]; }
    }
  }
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), colA = g.getAttribute('color'), uvA = g.getAttribute('uv');
    const idx = g.getIndex();
    const fin = m.userData.fin as string | undefined;
    const isGlass = fin === 'glass' || fin === 'water', unlit = fin === 'glow' || fin === 'rgb';
    const patId = fin && (MAPPED as any)[fin]?.pattern;
    const patBuf = patId ? pat(patId) : null;
    nm.getNormalMatrix(m.matrixWorld);
    const cache = new Map<number, { p: THREE.Vector3; c: number[]; uv: number[] | null }>();
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const vert = (i: number) => {
      let r = cache.get(i);
      if (!r) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
        let lam = unlit ? 1.35 : 0.42 + 0.6 * Math.max(0, n.dot(L)) + 0.15 * Math.max(0, n.y);
        let base = colA ? [colA.getX(i), colA.getY(i), colA.getZ(i)] : [0.8, 0.8, 0.8];
        if (fin === 'rgb') base = [1, 0.2, 0.55];
        if (fin === 'mirror') { base = [0.75, 0.85, 0.95]; lam = 0.9; }
        if (fin === 'metal') lam *= 1.05;
        r = { p: v.clone(), c: base.map((q) => Math.min(255, lin2srgb(Math.min(1, q * lam)) * 255)), uv: uvA ? [uvA.getX(i), uvA.getY(i)] : null };
        cache.set(i, r);
      }
      return r;
    };
    const count = idx ? idx.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
      const vs = ids.map(vert);
      const e1 = vs[1].p.clone().sub(vs[0].p), e2 = vs[2].p.clone().sub(vs[0].p);
      const fn = e1.cross(e2);
      if (fn.dot(vs[0].p.clone().sub(cam.position)) >= 0) continue;
      const tri: Tri = { p: vs.map((q) => q.p), c: vs.map((q) => q.c), uv: patBuf && vs[0].uv ? vs.map((q) => q.uv!) : null, pat: patBuf, a: fin === 'water' ? 0.7 : 0.4 };
      if (isGlass) trans.push(tri); else raster(tri, false);
    }
  });
  for (const t of trans) raster(t, true);
  writePng(file, W, H, img);
}
