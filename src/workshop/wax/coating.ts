// Wax coating layers. Each dip/pour adds a layer: a thin shell over the
// squishy (same sphere topology) with per-vertex coverage. Layers start wet
// and glossy and harden to matte over tuning.wax.hardenTime.
import * as THREE from 'three';
import type { ShapeId } from '../../core/model';
import { tuning } from '../../tuning';
import { makeShapeGeometry } from '../../art/shapes';

export interface Layer {
  color: string;
  /** per-vertex coverage 0..1 (≥0.5 = covered) */
  cov: Float32Array;
  /** per-vertex surface radius offset (unit space) for this layer */
  offset: Float32Array;
  mesh: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  uniforms: { uHard: { value: number } };
  hard: number;
  final: boolean;
  kind: 'dip' | 'pour';
  /** pour: accumulated spread angle (radians) */
  amount: number;
  /** extra drip growth after pouring stops (0..1) */
  drip: number;
  seed: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Coating {
  /** Lives in the body's unit space: parent it under a group scaled by bodyRadius. */
  readonly group = new THREE.Group();
  layers: Layer[] = [];
  shape: ShapeId;
  base!: THREE.BufferGeometry;
  /** rest positions (unit space) */
  rest!: Float32Array;
  dirs!: Float32Array;
  radius!: Float32Array;
  azimuth!: Float32Array;
  count = 0;

  constructor(shape: ShapeId) {
    this.shape = shape;
    this.setShape(shape);
  }

  get unit(): number {
    return tuning.squishy.bodyRadius;
  }
  get thick(): number {
    return tuning.wax.layerThickness / this.unit;
  }
  get gap(): number {
    return tuning.wax.shellGap / this.unit;
  }

  setShape(shape: ShapeId): void {
    this.clear();
    this.shape = shape;
    this.base = makeShapeGeometry(shape, tuning.squishy.meshDetail);
    this.rest = this.base.attributes.position.array as Float32Array;
    this.dirs = this.base.attributes.restDir.array as Float32Array;
    this.count = this.rest.length / 3;
    this.radius = new Float32Array(this.count);
    this.azimuth = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1], z = this.rest[i * 3 + 2];
      this.radius[i] = Math.hypot(x, y, z);
      this.azimuth[i] = Math.atan2(z, x);
    }
  }

  clear(): void {
    for (const l of this.layers) {
      this.group.remove(l.mesh);
      l.mesh.geometry.dispose();
      l.mat.dispose();
    }
    this.layers = [];
  }

  /** Remove the newest layer (undo). */
  popLayer(): void {
    const l = this.layers.pop();
    if (!l) return;
    this.group.remove(l.mesh);
    l.mesh.geometry.dispose();
    l.mat.dispose();
  }

  /** Number of covering layers at vertex i among layers [0, upTo). */
  coveredBelow(i: number, upTo = this.layers.length): number {
    let n = 0;
    for (let k = 0; k < upTo; k++) if (this.layers[k].cov[i] >= 0.5) n++;
    return n;
  }

  beginLayer(color: string, kind: 'dip' | 'pour'): Layer {
    const n = this.count;
    const cov = new Float32Array(n);
    const offset = new Float32Array(n);
    const idx = this.layers.length;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const below = this.coveredBelow(i, idx);
      const off = this.gap + (below + 1) * this.thick;
      offset[i] = off;
      const r = this.radius[i] + off;
      pos[i * 3] = this.dirs[i * 3] * r;
      pos[i * 3 + 1] = this.dirs[i * 3 + 1] * r;
      pos[i * 3 + 2] = this.dirs[i * 3 + 2] * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const covAttr = new THREE.BufferAttribute(cov, 1);
    covAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('cov', covAttr);
    geo.setIndex(this.base.index);
    geo.computeVertexNormals();
    const { mat, uniforms } = layerMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = idx + 1;
    this.group.add(mesh);
    const layer: Layer = { color, cov, offset, mesh, mat, uniforms, hard: 0, final: false, kind, amount: 0, drip: 0, seed: Math.random() * 100 };
    this.layers.push(layer);
    return layer;
  }

  private dripNoise(theta: number, seed: number): number {
    const v =
      0.5 +
      0.28 * Math.sin(theta * 7 + seed) +
      0.18 * Math.sin(theta * 13 + seed * 2.3) +
      0.12 * Math.sin(theta * 23 + seed * 0.7);
    return Math.pow(Math.max(0, Math.min(1, v)), 3);
  }

  /** Dip: cover everything below local height yLocal (unit space, body frame). */
  dipTo(layer: Layer, yLocal: number): number {
    let covered = 0;
    for (let i = 0; i < this.count; i++) {
      const y = this.rest[i * 3 + 1];
      const wave = 0.025 * Math.sin(this.azimuth[i] * 5 + layer.seed) + 0.015 * Math.sin(this.azimuth[i] * 11 + layer.seed * 3);
      const c = smooth(-0.025, 0.025, yLocal + wave - y);
      if (c > layer.cov[i]) layer.cov[i] = c;
      if (layer.cov[i] >= 0.5) covered++;
    }
    (layer.mesh.geometry.attributes.cov as THREE.BufferAttribute).needsUpdate = true;
    return covered / this.count;
  }

  /** Pour: wax lands at unit direction L and spreads (biased downward, with drips). */
  pourAt(layer: Layer, L: THREE.Vector3, amount: number): number {
    let covered = 0;
    const dripLen = 0.9 * Math.min(1, amount / 1.2) * (1 + layer.drip * 0.8);
    for (let i = 0; i < this.count; i++) {
      const dx = this.dirs[i * 3], dy = this.dirs[i * 3 + 1], dz = this.dirs[i * 3 + 2];
      const dot = Math.max(-1, Math.min(1, dx * L.x + dy * L.y + dz * L.z));
      let a = Math.acos(dot);
      const up = dy - L.y;
      if (up > 0) a *= 1 + 2.2 * up; // hard to flow uphill
      else {
        const down = Math.min(1, -up);
        a *= 1 - 0.3 * down; // easy to flow downhill
        a -= dripLen * this.dripNoise(this.azimuth[i], layer.seed) * down; // drips run down
      }
      const c = smooth(amount + 0.035, amount - 0.035, a);
      if (c > layer.cov[i]) layer.cov[i] = c;
      if (layer.cov[i] >= 0.5) covered++;
    }
    (layer.mesh.geometry.attributes.cov as THREE.BufferAttribute).needsUpdate = true;
    return covered / this.count;
  }

  /** Fraction of the surface covered by at least one layer. */
  coverage(): number {
    let c = 0;
    for (let i = 0; i < this.count; i++) if (this.coveredBelow(i) > 0) c++;
    return c / this.count;
  }

  /** Advance hardening. Returns true when every layer is fully hard. */
  update(dt: number, cooling: boolean): boolean {
    const rate = (cooling ? tuning.wax.coolSpeedMultiplier : 1) / Math.max(0.0001, tuning.wax.hardenTime);
    let allHard = this.layers.length > 0;
    for (const l of this.layers) {
      if (l.final) {
        l.hard = tuning.wax.hardenTime <= 0 ? 1 : Math.min(1, l.hard + dt * rate);
      }
      l.uniforms.uHard.value = l.hard;
      if (l.hard < 1) allHard = false;
    }
    return allHard;
  }

  get allHard(): boolean {
    return this.layers.length > 0 && this.layers.every((l) => l.hard >= 1);
  }
}

/** Wax layer material: coverage cut-out with a thick-looking rim; wet → matte. */
export function layerMaterial(color: string): { mat: THREE.MeshPhysicalMaterial; uniforms: { uHard: { value: number } } } {
  const uniforms = { uHard: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHard = uniforms.uHard;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float cov;\nvarying float vCov;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCov = cov;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCov;\nuniform float uHard;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vCov < 0.5) discard;
// thick rim near the coverage edge, a bit darker (reads as wax thickness)
float rim = 1.0 - smoothstep(0.5, 0.72, vCov);
diffuseColor.rgb *= 1.0 - 0.28 * rim;
// cooled wax goes paler and more opaque-looking
diffuseColor.rgb = mix(diffuseColor.rgb * 0.94, mix(diffuseColor.rgb, vec3(1.0), 0.12), uHard);`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.08, 0.64, uHard);')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.clearcoat = mix(1.0, 0.1, uHard);
material.clearcoatRoughness = mix(0.03, 0.45, uHard);
material.sheenColor *= (1.0 - uHard) * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => 'wax-layer';
  return { mat, uniforms };
}
