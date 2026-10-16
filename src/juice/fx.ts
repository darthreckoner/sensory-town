// World-space particle bursts (sparkles, confetti, dust puffs, droplets).
// Attached to whichever scene is active. Only the juice layer calls this.
import * as THREE from 'three';
import type { V3 } from '../core/events';

export type FxKind = 'sparkle' | 'confetti' | 'puff' | 'drop' | 'frost';

interface P {
  kind: FxKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  gravity: number;
  drag: number;
  color: THREE.Color;
  floorY: number;
}

const MAX = 600;
const CONFETTI_COLORS = ['#ff5d8f', '#ffd166', '#5fd3a5', '#7fd8ff', '#9d8cff', '#ffb38a', '#ffffff'];

function starGeometry(): THREE.BufferGeometry {
  // 4-point twinkle star, flat, double-sided billboard-ish (we face it to camera)
  const shape = new THREE.Shape();
  const pts = 8;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.28;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape);
}

class Fx {
  private root = new THREE.Group();
  private meshes = new Map<FxKind, THREE.InstancedMesh>();
  private parts: P[] = [];
  private camera: THREE.Camera | null = null;
  /** World-size multiplier — big scenes (town) use bigger particles. */
  scale = 1;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor() {
    this.root.name = 'fx';
    this.root.renderOrder = 10;
    const mk = (kind: FxKind, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes.set(kind, m);
      this.root.add(m);
    };
    mk('sparkle', starGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false }));
    mk('frost', starGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    mk('confetti', new THREE.PlaneGeometry(1, 1.6), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1 }));
    mk('puff', new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1, flatShading: true, depthWrite: false }));
    mk('drop', new THREE.SphereGeometry(1, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1 }));
  }

  attach(scene: THREE.Scene, camera: THREE.Camera, scale = 1): void {
    this.parts.length = 0;
    scene.add(this.root);
    this.camera = camera;
    this.scale = scale;
  }

  burst(
    kind: FxKind,
    at: V3,
    opts: { count?: number; color?: string | string[]; speed?: number; size?: number; up?: number; floorY?: number; spread?: number } = {},
  ): void {
    const s = this.scale * (opts.size ?? 1);
    const count = opts.count ?? 16;
    const colors = Array.isArray(opts.color) ? opts.color : opts.color ? [opts.color] : kind === 'confetti' ? CONFETTI_COLORS : ['#ffffff'];
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      const speed = (opts.speed ?? 1) * s;
      const spread = (opts.spread ?? 0) * s;
      const p: P = {
        kind,
        pos: new THREE.Vector3(at.x + dir.x * spread, at.y + dir.y * spread, at.z + dir.z * spread),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5),
        life: 0,
        max: 0.6,
        size: s,
        gravity: 0,
        drag: 2,
        color: new THREE.Color(colors[i % colors.length]),
        floorY: opts.floorY ?? -1e9,
      };
      switch (kind) {
        case 'sparkle':
          p.vel.copy(dir).multiplyScalar(speed * (1.2 + Math.random() * 1.8));
          p.vel.y += (opts.up ?? 0.8) * s;
          p.max = 0.5 + Math.random() * 0.5;
          p.size = s * (0.06 + Math.random() * 0.07);
          p.drag = 3;
          break;
        case 'frost':
          p.vel.copy(dir).multiplyScalar(speed * 0.6);
          p.max = 0.8 + Math.random() * 0.6;
          p.size = s * (0.04 + Math.random() * 0.05);
          p.color.set('#dff6ff');
          p.drag = 1.5;
          break;
        case 'confetti':
          p.vel.set(dir.x * 2.2, 2.5 + Math.random() * 3, dir.z * 2.2).multiplyScalar(speed);
          p.max = 1.6 + Math.random() * 0.8;
          p.size = s * 0.09;
          p.gravity = 6 * s;
          p.drag = 1.2;
          break;
        case 'puff':
          p.vel.set(dir.x, Math.abs(dir.y) * 0.6 + 0.2, dir.z).multiplyScalar(speed * 1.4);
          p.max = 0.5 + Math.random() * 0.3;
          p.size = s * (0.14 + Math.random() * 0.12);
          p.drag = 4;
          if (!opts.color) p.color.set('#fff4e8');
          break;
        case 'drop':
          p.vel.set(dir.x * 1.2, 1.2 + Math.random() * 1.5, dir.z * 1.2).multiplyScalar(speed);
          p.max = 0.9 + Math.random() * 0.4;
          p.size = s * (0.03 + Math.random() * 0.04);
          p.gravity = 9 * s;
          p.drag = 0.5;
          break;
      }
      this.parts.push(p);
    }
  }

  update(dt: number): void {
    const counts = new Map<FxKind, number>();
    for (const k of this.meshes.keys()) counts.set(k, 0);
    const keep: P[] = [];
    const camQ = this.camera ? (this.camera as THREE.Object3D).quaternion : null;
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      keep.push(p);
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floorY) {
        p.pos.y = p.floorY;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const k = p.life / p.max;
      let sc = p.size;
      if (p.kind === 'sparkle' || p.kind === 'frost') sc *= Math.sin(Math.min(1, k * 1.2) * Math.PI) * (0.8 + 0.4 * Math.sin(p.life * 40));
      else if (p.kind === 'puff') sc *= (0.6 + k * 1.2) * (1 - k * k);
      else if (p.kind === 'confetti') sc *= k > 0.8 ? (1 - k) / 0.2 : 1;
      else if (p.kind === 'drop') sc *= k > 0.7 ? (1 - k) / 0.3 : 1;
      const mesh = this.meshes.get(p.kind)!;
      const i = counts.get(p.kind)!;
      this.dummy.position.copy(p.pos);
      if ((p.kind === 'sparkle' || p.kind === 'frost') && camQ) {
        this.dummy.quaternion.copy(camQ);
        this.dummy.rotateZ(p.rot.z);
      } else this.dummy.rotation.copy(p.rot);
      this.dummy.scale.setScalar(Math.max(0.0001, sc));
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.copy(p.color);
      mesh.setColorAt(i, this.tmpColor);
      counts.set(p.kind, i + 1);
    }
    this.parts = keep;
    for (const [k, m] of this.meshes) {
      m.count = counts.get(k)!;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

export const fx = new Fx();
