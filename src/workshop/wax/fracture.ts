// The hardened wax shell, pre-fractured into Voronoi-style pieces.
// Pressing accumulates stress near the finger; hairline cracks radiate from
// exactly where the finger presses; pieces over the threshold peel and fall,
// showing the colored layers in their broken edges.
import * as THREE from 'three';
import { tuning } from '../../tuning';
import { bus, v3 } from '../../core/events';
import type { Coating } from './coating';

type PieceState = 'attached' | 'peeling' | 'falling' | 'resting' | 'gone';

export interface Piece {
  mesh: THREE.Mesh;
  /** outer centroid, body unit space */
  center: THREE.Vector3;
  /** outward direction */
  normal: THREE.Vector3;
  verts: number[];
  neighbors: number[];
  area: number;
  stress: number;
  cracked: boolean;
  state: PieceState;
  t: number;
  hinge: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  bounces: number;
}

const SLOTS = 8;

export class Fracture {
  /** Body unit space (parent under the squishy root). */
  readonly group = new THREE.Group();
  /** World space container for detached flakes (parent under the station root). */
  readonly flakes = new THREE.Group();
  pieces: Piece[] = [];
  /** per base-vertex piece index, -1 = no shell */
  vertPiece = new Int32Array(0);
  readonly material: THREE.MeshPhysicalMaterial;
  private uCrack = { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) };
  private uSeed = { value: new Array(SLOTS).fill(0) as number[] };
  private nextSlot = 0;
  private crunchTimer = 0;
  private tmp = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  tableY = 0;
  cleared = false;
  detachedCount = 0;
  /** set whenever the exposed set changes (station refreshes body masks) */
  dirty = true;

  constructor() {
    this.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.45, side: THREE.FrontSide });
    const uCrack = this.uCrack, uSeed = this.uSeed;
    this.material.onBeforeCompile = (sh) => {
      sh.uniforms.uCrack = uCrack;
      sh.uniforms.uSeed = uSeed;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aBody;\nattribute float aSurf;\nvarying vec3 vBody;\nvarying float vSurf;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = aBody;\nvSurf = aSurf;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vBody;
varying float vSurf;
uniform vec4 uCrack[${SLOTS}];
uniform float uSeed[${SLOTS}];`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
if (vSurf > 0.5) {
  float halo = 0.0;
  float core = 0.0;
  for (int i = 0; i < ${SLOTS}; i++) {
    vec4 cr = uCrack[i];
    if (cr.w <= 0.0) continue;
    vec3 v = vBody - cr.xyz;
    float d = length(v);
    if (d > cr.w * 1.05) continue;
    vec3 n = normalize(cr.xyz);
    vec3 t1 = normalize(abs(n.y) < 0.95 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(n, t1);
    vec2 q = vec2(dot(v, t1), dot(v, t2));
    float dq = length(q);
    float ang = atan(q.y, q.x);
    float s = uSeed[i];
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      float len = cr.w * (0.55 + 0.45 * fract(sin(s * 31.7 + fk * 12.9) * 43758.5));
      if (dq > len) continue;
      float a = s * 6.2831 + fk * 0.8976 + 0.35 * sin(s * 17.0 + fk * 3.7);
      float jag = (0.16 * sin(dq * 9.0 + fk * 5.1 + s * 9.0) + 0.05 * sin(dq * 29.0 + fk * 2.3) + 0.03 * sign(sin(dq * 17.0 + fk))) * smoothstep(0.0, 0.08, dq);
      float da = abs(mod(ang - a - jag + 3.14159, 6.28318) - 3.14159);
      float lat = da * dq;
      float taper = 1.0 - dq / len;
      float w = 0.006 + 0.014 * taper;
      float fade = smoothstep(0.0, 0.015, dq);
      halo = max(halo, (1.0 - smoothstep(w * 0.5, w * 1.4, lat)) * fade);
      core = max(core, (1.0 - smoothstep(w * 0.12, w * 0.35, lat)) * fade);
      // a short branch off each ray
      float ba = a + 0.7 * (fract(s * 7.0 + fk) > 0.5 ? 1.0 : -1.0);
      float bstart = len * 0.45;
      vec2 bo = vec2(cos(a), sin(a)) * bstart;
      vec2 bq = q - bo;
      float bd = length(bq);
      float blen = len * 0.35;
      if (bd < blen && dot(bq, vec2(cos(ba), sin(ba))) > 0.0) {
        float bang = atan(bq.y, bq.x);
        float bda = abs(mod(bang - ba - 0.2 * sin(bd * 40.0 + fk) + 3.14159, 6.28318) - 3.14159);
        float blat = bda * bd;
        float bw = 0.004 + 0.008 * (1.0 - bd / blen);
        halo = max(halo, 1.0 - smoothstep(bw * 0.5, bw * 1.4, blat));
        core = max(core, 1.0 - smoothstep(bw * 0.12, bw * 0.35, blat));
      }
    }
  }
  // stress-whitened wax around the crack, dark hairline in the middle
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.98, 0.96), halo * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.25, core * 0.85);
}`,
        );
    };
    this.material.customProgramCacheKey = () => 'wax-shell';
  }

  clear(): void {
    for (const p of this.pieces) {
      p.mesh.removeFromParent();
      p.mesh.geometry.dispose();
    }
    this.pieces = [];
    for (const v of this.uCrack.value) v.set(0, 0, 0, 0);
    this.nextSlot = 0;
    this.cleared = false;
    this.detachedCount = 0;
    this.dirty = true;
  }

  /** Build the fractured shell from the coating layers (all assumed hard). */
  build(coat: Coating): void {
    this.clear();
    const t = tuning.wax;
    const n = coat.count;
    const layers = coat.layers;
    if (!layers.length) return;
    const thick = coat.thick, gap = coat.gap;
    const dirs = coat.dirs, radius = coat.radius;
    const baseN = coat.base.attributes.normal.array as Float32Array;
    const index = coat.base.index!.array;

    // per-vertex layer stacks (inner → outer)
    const stacks: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const s: number[] = [];
      for (let k = 0; k < layers.length; k++) if (layers[k].cov[i] >= 0.5) s.push(k);
      stacks[i] = s;
    }
    // match the look of hardened layers (cooled wax is a touch paler)
    const colors = layers.map((l) => new THREE.Color(l.color).lerp(new THREE.Color('#ffffff'), 0.12));

    // seeds: jittered fibonacci sphere, random rotation each build
    const K = Math.max(6, Math.round(t.pieceCount));
    const seeds: THREE.Vector3[] = [];
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    for (let i = 0; i < K; i++) {
      const y = 1 - (2 * (i + 0.5)) / K;
      const r = Math.sqrt(1 - y * y);
      const phi = i * 2.399963 + (Math.random() - 0.5) * 0.5;
      seeds.push(new THREE.Vector3(Math.cos(phi) * r, y + (Math.random() - 0.5) * 0.12, Math.sin(phi) * r).normalize().applyQuaternion(rot));
    }

    // assign covered triangles to the nearest seed (by centroid direction)
    const triCount = index.length / 3;
    const triPiece = new Int32Array(triCount).fill(-1);
    const c = new THREE.Vector3();
    for (let tIdx = 0; tIdx < triCount; tIdx++) {
      const a = index[tIdx * 3], b = index[tIdx * 3 + 1], d = index[tIdx * 3 + 2];
      if (!stacks[a].length || !stacks[b].length || !stacks[d].length) continue;
      c.set(dirs[a * 3] + dirs[b * 3] + dirs[d * 3], dirs[a * 3 + 1] + dirs[b * 3 + 1] + dirs[d * 3 + 1], dirs[a * 3 + 2] + dirs[b * 3 + 2] + dirs[d * 3 + 2]).normalize();
      // slight noise so borders are jagged like real cracks
      let best = -1, bestD = -2;
      for (let s = 0; s < K; s++) {
        const dd = c.dot(seeds[s]) + Math.sin(c.x * 37 + c.y * 53 + s) * 0.006;
        if (dd > bestD) {
          bestD = dd;
          best = s;
        }
      }
      triPiece[tIdx] = best;
    }

    const outerR = (i: number) => radius[i] + gap + stacks[i].length * thick;
    const innerR = (i: number) => radius[i] + gap * 0.4;
    const P = (i: number, r: number, out: number[]) => out.push(dirs[i * 3] * r, dirs[i * 3 + 1] * r, dirs[i * 3 + 2] * r);

    this.vertPiece = new Int32Array(n).fill(-1);
    const pieceTris: number[][] = Array.from({ length: K }, () => []);
    for (let tIdx = 0; tIdx < triCount; tIdx++) if (triPiece[tIdx] >= 0) pieceTris[triPiece[tIdx]].push(tIdx);

    const edgeKey = (a: number, b: number) => (a < b ? a * 1048576 + b : b * 1048576 + a);
    // global edge → pieces, for neighbor lookup
    const edgeOwners = new Map<number, number[]>();

    const built: { k: number; piece: Piece }[] = [];
    for (let k = 0; k < K; k++) {
      const tris = pieceTris[k];
      if (!tris.length) continue;
      const pos: number[] = [], nor: number[] = [], col: number[] = [], body: number[] = [], surf: number[] = [];
      const vset = new Set<number>();
      const edgeCount = new Map<number, { a: number; b: number; n: number }>();
      const center = new THREE.Vector3();
      let area = 0;
      const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
      for (const tIdx of tris) {
        const ids = [index[tIdx * 3], index[tIdx * 3 + 1], index[tIdx * 3 + 2]];
        // outer
        for (const i of ids) {
          const r = outerR(i);
          P(i, r, pos);
          nor.push(baseN[i * 3], baseN[i * 3 + 1], baseN[i * 3 + 2]);
          const top = colors[stacks[i][stacks[i].length - 1]];
          col.push(top.r, top.g, top.b);
          surf.push(1);
          vset.add(i);
        }
        pa.fromArray(pos, pos.length - 9);
        pb.fromArray(pos, pos.length - 6);
        pc.fromArray(pos, pos.length - 3);
        const triArea = pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() / 2;
        area += triArea;
        center.addScaledVector(pa.add(pb).add(pc), triArea / 3);
        // inner (reversed winding)
        for (const i of [ids[0], ids[2], ids[1]]) {
          P(i, innerR(i), pos);
          nor.push(-baseN[i * 3], -baseN[i * 3 + 1], -baseN[i * 3 + 2]);
          const inn = colors[stacks[i][0]];
          col.push(inn.r * 0.82, inn.g * 0.82, inn.b * 0.82);
          surf.push(0);
        }
        // edges (a→b in winding order)
        for (let e = 0; e < 3; e++) {
          const a = ids[e], b = ids[(e + 1) % 3];
          const key = edgeKey(a, b);
          const rec = edgeCount.get(key);
          if (rec) rec.n++;
          else edgeCount.set(key, { a, b, n: 1 });
        }
      }
      center.divideScalar(Math.max(1e-6, area));

      // side walls on boundary edges — banded by layer color
      for (const [key, e] of edgeCount) {
        let owners = edgeOwners.get(key);
        if (!owners) edgeOwners.set(key, (owners = []));
        owners.push(k);
        if (e.n !== 1) continue;
        const { a, b } = e;
        const sa = stacks[a], sb = stacks[b];
        const bands = Math.max(1, Math.min(sa.length, sb.length));
        for (let band = 0; band < bands; band++) {
          const ra0 = band === 0 ? innerR(a) : radius[a] + gap + band * thick;
          const rb0 = band === 0 ? innerR(b) : radius[b] + gap + band * thick;
          const ra1 = band === bands - 1 ? outerR(a) : radius[a] + gap + (band + 1) * thick;
          const rb1 = band === bands - 1 ? outerR(b) : radius[b] + gap + (band + 1) * thick;
          const A0: number[] = [], B0: number[] = [], A1: number[] = [], B1: number[] = [];
          P(a, ra0, A0); P(b, rb0, B0); P(a, ra1, A1); P(b, rb1, B1);
          const vA0 = new THREE.Vector3().fromArray(A0), vB0 = new THREE.Vector3().fromArray(B0), vB1 = new THREE.Vector3().fromArray(B1);
          const fn = vB0.clone().sub(vA0).cross(vB1.clone().sub(vA0)).normalize();
          const layerIdx = sa[Math.min(band, sa.length - 1)];
          const lc = colors[layerIdx];
          // slightly lighter toward the outside of each band → crisp stripes
          for (const [v, shade] of [[A0, 0.86], [B0, 0.86], [B1, 1.0], [A0, 0.86], [B1, 1.0], [A1, 1.0]] as [number[], number][]) {
            pos.push(v[0], v[1], v[2]);
            nor.push(fn.x, fn.y, fn.z);
            col.push(lc.r * shade, lc.g * shade, lc.b * shade);
            surf.push(0);
          }
        }
      }

      // geometry relative to the piece center so it rotates nicely when peeling
      for (let i = 0; i < pos.length; i += 3) {
        body.push(pos[i], pos[i + 1], pos[i + 2]);
        pos[i] -= center.x;
        pos[i + 1] -= center.y;
        pos[i + 2] -= center.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 3));
      geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.copy(center);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const idx = this.pieces.length;
      for (const v of vset) this.vertPiece[v] = idx;
      const piece: Piece = {
        mesh, center: center.clone(), normal: center.clone().normalize(), verts: [...vset], neighbors: [], area,
        stress: 0, cracked: false, state: 'attached', t: 0, hinge: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3(), spin: new THREE.Vector3(), bounces: 0,
      };
      this.pieces.push(piece);
      built.push({ k, piece });
    }
    // neighbors via shared edges
    const kToIdx = new Map<number, number>();
    built.forEach((b, i) => kToIdx.set(b.k, i));
    for (const owners of edgeOwners.values()) {
      if (owners.length < 2) continue;
      const [a, b] = owners.map((k) => kToIdx.get(k)!);
      if (a === undefined || b === undefined || a === b) continue;
      if (!this.pieces[a].neighbors.includes(b)) this.pieces[a].neighbors.push(b);
      if (!this.pieces[b].neighbors.includes(a)) this.pieces[b].neighbors.push(a);
    }
    this.dirty = true;
  }

  get attachedCount(): number {
    return this.pieces.filter((p) => p.state === 'attached').length;
  }

  /** Is this mesh an attached shell piece? */
  isAttached(obj: THREE.Object3D): boolean {
    return this.pieces.some((p) => p.mesh === obj && p.state === 'attached');
  }

  attachedMeshes(): THREE.Mesh[] {
    return this.pieces.filter((p) => p.state === 'attached').map((p) => p.mesh);
  }

  /**
   * Finger pressing the shell at `pt` (body unit space). Grows a hairline
   * crack at that exact point and stresses nearby pieces.
   */
  press(pt: THREE.Vector3, dt: number, pressure: number, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    const t = tuning.wax;
    const unit = tuning.squishy.bodyRadius;
    // crack slot: reuse the nearest active slot, else start a new crack here
    let slot = -1;
    let bestD = 0.14;
    this.uCrack.value.forEach((v, i) => {
      if (v.w <= 0) return;
      const d = this.tmp.set(v.x, v.y, v.z).distanceTo(pt);
      if (d < bestD) {
        bestD = d;
        slot = i;
      }
    });
    const k = 0.5 + pressure;
    if (slot < 0) {
      slot = this.nextSlot;
      this.nextSlot = (this.nextSlot + 1) % SLOTS;
      this.uCrack.value[slot].set(pt.x, pt.y, pt.z, 0.06);
      this.uSeed.value[slot] = Math.random() * 10;
      bus.emit('shellCrack', { pos: v3(toWorld(pt.clone())), intensity: 1 });
      this.crunchTimer = 0;
    } else {
      const cr = this.uCrack.value[slot];
      cr.w = Math.min(1.6, cr.w + (t.crackSpreadRate / unit) * dt * k * (1 / (1 + cr.w)));
    }
    // crackle while it spreads
    this.crunchTimer += dt;
    if (this.crunchTimer > 0.11) {
      this.crunchTimer = 0;
      bus.emit('shellCrack', { pos: v3(toWorld(pt.clone())), intensity: 0.5 });
    }
    // stress pieces near the press
    const R = t.stressRadius / unit;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.state !== 'attached') continue;
      const d = p.center.distanceTo(pt);
      const f = Math.exp(-(d * d) / (R * R));
      if (f < 0.01) continue;
      p.stress += t.stressRate * dt * f * k;
      this.checkPiece(i, pt, toWorld);
    }
  }

  private checkPiece(i: number, from: THREE.Vector3, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    const t = tuning.wax;
    const p = this.pieces[i];
    if (p.state !== 'attached') return;
    if (!p.cracked && p.stress > t.stressThreshold * 0.35) {
      p.cracked = true;
      // open a hairline gap around the piece
      p.mesh.scale.setScalar(0.975);
      p.mesh.position.copy(p.center).addScaledVector(p.normal, 0.006);
      bus.emit('shellCrack', { pos: v3(toWorld(p.center.clone())), intensity: 0.8 });
    }
    if (p.stress >= t.stressThreshold) this.detach(i, from, toWorld);
  }

  private detach(i: number, from: THREE.Vector3, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    const p = this.pieces[i];
    p.state = 'peeling';
    p.t = 0;
    // hinge axis: perpendicular to the direction away from the press, so it peels outward
    const away = p.center.clone().sub(from);
    away.addScaledVector(p.normal, -away.dot(p.normal));
    if (away.lengthSq() < 1e-6) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    p.hinge.copy(p.normal).cross(away).normalize();
    this.detachedCount++;
    this.dirty = true;
    bus.emit('flakeDetach', { pos: v3(toWorld(p.center.clone())), size: p.area * 4 });
    // chain reaction: neighbors get a jolt of stress
    for (const nIdx of p.neighbors) {
      const nb = this.pieces[nIdx];
      if (nb.state !== 'attached') continue;
      nb.stress += tuning.wax.stressThreshold * tuning.wax.chainStress;
      this.checkPiece(nIdx, p.center, toWorld);
    }
  }

  /** Release everything that's left (e.g. when almost cleared). */
  dropAll(toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    this.pieces.forEach((p, i) => {
      if (p.state === 'attached') {
        p.stress = 999;
        this.detach(i, p.center.clone().multiplyScalar(0.5), toWorld);
      }
    });
  }

  /** 1 where the squishy is exposed (no attached shell), else 0. */
  exposedMask(out: Float32Array): void {
    for (let i = 0; i < out.length; i++) {
      const pi = this.vertPiece[i];
      out[i] = pi < 0 || this.pieces[pi]?.state !== 'attached' ? 1 : 0;
    }
    this.dirty = false;
  }

  update(dt: number): void {
    const t = tuning.wax;
    for (const p of this.pieces) {
      if (p.state === 'attached' || p.state === 'gone') continue;
      p.t += dt;
      if (p.state === 'peeling') {
        const k = Math.min(1, p.t / Math.max(0.01, t.peelHingeSeconds));
        this.tmpQ.setFromAxisAngle(p.hinge, k * 0.85);
        p.mesh.quaternion.copy(this.tmpQ);
        p.mesh.position.copy(p.center).addScaledVector(p.normal, 0.02 + k * 0.08);
        if (k >= 1) {
          // hand over to world space and let gravity take it
          this.flakes.attach(p.mesh);
          const n = p.normal.clone().transformDirection(this.group.matrixWorld);
          p.vel.copy(n).multiplyScalar(1.4 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4 + 0.3));
          p.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
          p.mesh.scale.multiplyScalar(t.flakeSize);
          p.state = 'falling';
          p.t = 0;
        }
      } else if (p.state === 'falling' || p.state === 'resting') {
        if (p.state === 'falling') {
          p.vel.y -= t.flakeGravity * dt;
          p.vel.multiplyScalar(Math.exp(-0.4 * dt));
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.spin.x * dt;
          p.mesh.rotation.y += p.spin.y * dt;
          p.mesh.rotation.z += p.spin.z * dt;
          const floor = this.tableY + 0.03;
          if (p.mesh.position.y < floor) {
            p.mesh.position.y = floor;
            if (p.bounces === 0) bus.emit('flakeLand', { pos: v3(p.mesh.position), size: p.area * 4 });
            p.bounces++;
            p.vel.y = Math.abs(p.vel.y) * 0.28;
            p.vel.x *= 0.5;
            p.vel.z *= 0.5;
            p.spin.multiplyScalar(0.4);
            if (p.bounces >= 3 || Math.abs(p.vel.y) < 0.3) p.state = 'resting';
          }
        }
        // fade out at end of life
        const life = t.flakeLife;
        if (p.t > life) {
          const s = Math.max(0, 1 - (p.t - life) / 0.5);
          p.mesh.scale.setScalar(t.flakeSize * s * tuning.squishy.bodyRadius);
          if (s <= 0) {
            p.state = 'gone';
            p.mesh.removeFromParent();
          }
        }
      }
    }
  }
}
