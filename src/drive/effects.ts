// Scene-owned visual effects for driving: tyre skid marks, a billboard
// particle pool (sparkle trail, boost flames, tyre smoke) and the boost
// speed lines that streak past the camera.
import * as THREE from 'three';

// ── skid marks ──────────────────────────────────────────────────────────────
export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private i = 0;
  private readonly n: number;
  private readonly dummy = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private last: { x: number; z: number; ok: boolean }[] = [{ x: 0, z: 0, ok: false }, { x: 0, z: 0, ok: false }];

  constructor(n = 520) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#0d0d14', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, this.zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Stamp a mark for wheel `w` (0/1) at a ground point, if the wheel is skidding. */
  stamp(w: number, x: number, y: number, z: number, skidding: boolean): void {
    const l = this.last[w];
    if (!skidding) {
      l.ok = false;
      return;
    }
    if (l.ok) {
      const dx = x - l.x, dz = z - l.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.35) {
        this.dummy.position.set((x + l.x) / 2, y + 0.07, (z + l.z) / 2);
        this.dummy.rotation.set(0, Math.atan2(dx, dz), 0);
        this.dummy.scale.set(0.34, 1, len + 0.12);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(this.i, this.dummy.matrix);
        this.i = (this.i + 1) % this.n;
        this.mesh.instanceMatrix.needsUpdate = true;
        l.x = x;
        l.z = z;
      }
    } else {
      l.ok = true;
      l.x = x;
      l.z = z;
    }
  }

  clear(): void {
    for (let k = 0; k < this.n; k++) this.mesh.setMatrixAt(k, this.zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.last[0].ok = this.last[1].ok = false;
  }
}

// ── billboard particles ─────────────────────────────────────────────────────
interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; gravity: number; drag: number; r: number; g: number; b: number }

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private parts: P[] = [];
  private readonly n: number;
  private readonly dummy = new THREE.Object3D();
  private readonly col = new THREE.Color();
  private readonly additive: boolean;

  constructor(n: number, additive: boolean, geo: THREE.BufferGeometry) {
    this.n = n;
    this.additive = additive;
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.4, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  add(p: P): void {
    if (this.parts.length >= this.n) this.parts.shift();
    this.parts.push(p);
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    let k = 0;
    const keep: P[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      keep.push(p);
      p.vy -= p.gravity * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.max;
      const s = (p.size + p.grow * t) * (this.additive ? Math.sin(Math.min(1, t * 1.15) * Math.PI) : 1 - t * 0.4);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.quaternion.copy(camQ);
      this.dummy.scale.setScalar(Math.max(0.0001, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(k, this.dummy.matrix);
      this.col.setRGB(p.r, p.g, p.b);
      this.mesh.setColorAt(k, this.col);
      k++;
    }
    this.parts = keep;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.parts.length = 0;
    this.mesh.count = 0;
  }
}

function starGeo(): THREE.BufferGeometry {
  // a 4-point twinkle
  const s = new THREE.Shape();
  const pts = 8;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.5 : 0.13;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}

export class Particles {
  readonly group = new THREE.Group();
  private glow = new Pool(220, true, starGeo());
  private flame = new Pool(120, true, new THREE.CircleGeometry(0.5, 8));
  private smoke = new Pool(90, false, new THREE.CircleGeometry(0.5, 10));
  private tmp = new THREE.Color();

  constructor() {
    this.group.add(this.glow.mesh, this.flame.mesh, this.smoke.mesh);
  }

  private base(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: string, extra: Partial<P> = {}): P {
    this.tmp.set(color);
    return { x, y, z, vx, vy, vz, life: 0, max: life, size, grow: 0, gravity: 0, drag: 2, r: this.tmp.r, g: this.tmp.g, b: this.tmp.b, ...extra };
  }

  sparkle(x: number, y: number, z: number, color: string): void {
    const a = Math.random() * 6.28;
    this.glow.add(this.base(x, y, z, Math.cos(a) * 0.6, 0.4 + Math.random() * 0.6, Math.sin(a) * 0.6, 0.2 + Math.random() * 0.22, 0.7 + Math.random() * 0.5, color, { drag: 2.2 }));
  }
  /** Boost exhaust: hot flames that stream backwards. */
  flames(x: number, y: number, z: number, bx: number, bz: number, color: string): void {
    this.flame.add(this.base(x, y, z, bx * 6 + (Math.random() - 0.5) * 1.2, (Math.random() - 0.4) * 0.8, bz * 6 + (Math.random() - 0.5) * 1.2, 0.34 + Math.random() * 0.18, 0.28 + Math.random() * 0.1, color, { drag: 3 }));
  }
  /** Tyre smoke while drifting. */
  puff(x: number, y: number, z: number, vx: number, vz: number): void {
    this.smoke.add(this.base(x, y, z, vx * 0.25 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, vz * 0.25 + (Math.random() - 0.5) * 0.6, 0.5, 0.9 + Math.random() * 0.4, '#e8e6ee', { grow: 1.8, drag: 1.6 }));
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    this.glow.update(dt, camQ);
    this.flame.update(dt, camQ);
    this.smoke.update(dt, camQ);
  }
  clear(): void {
    this.glow.clear();
    this.flame.clear();
    this.smoke.clear();
  }
}

// ── boost speed lines (children of the camera) ──────────────────────────────
export class SpeedLines {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private data: { a: number; r: number; z: number; len: number; sp: number }[] = [];
  private dummy = new THREE.Object3D();
  private level = 0;

  constructor(n = 34) {
    const geo = new THREE.BoxGeometry(0.04, 0.04, 1);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    for (let i = 0; i < n; i++) this.data.push({ a: Math.random() * 6.283, r: 1.6 + Math.random() * 2.6, z: -2 - Math.random() * 12, len: 1.2 + Math.random() * 2.4, sp: 22 + Math.random() * 18 });
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  update(dt: number, level01: number): void {
    this.level += (level01 - this.level) * (1 - Math.exp(-8 * dt));
    this.group.visible = this.level > 0.02;
    if (!this.group.visible) return;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.level;
    for (let i = 0; i < this.data.length; i++) {
      const p = this.data[i];
      p.z += p.sp * dt * (0.6 + this.level);
      if (p.z > -0.8) {
        p.z = -14 - Math.random() * 4;
        p.a = Math.random() * 6.283;
        p.r = 1.7 + Math.random() * 2.8;
      }
      this.dummy.position.set(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r * 0.62, p.z);
      // streaks point along the view direction
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, p.len * (0.7 + this.level));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ── water ripples: little rings that spread across the surface ──────────────
export class Ripples {
  readonly mesh: THREE.InstancedMesh;
  private rings: { x: number; y: number; z: number; age: number; life: number; size: number }[] = [];
  private readonly n: number;
  private readonly dummy = new THREE.Object3D();
  private readonly col = new THREE.Color();

  constructor(n = 28) {
    this.n = n;
    const geo = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  /** A ring at a point on the water. size ~1 is a footstep, ~2.5 a belly flop. */
  add(x: number, y: number, z: number, size = 1, life = 0.9): void {
    if (this.rings.length >= this.n) this.rings.shift();
    this.rings.push({ x, y, z, age: 0, life, size });
  }

  update(dt: number): void {
    let k = 0;
    const keep: typeof this.rings = [];
    for (const r of this.rings) {
      r.age += dt;
      if (r.age >= r.life) continue;
      keep.push(r);
      const t = r.age / r.life;
      const grow = 0.3 + 1.4 * (1 - (1 - t) * (1 - t));
      const fade = Math.pow(1 - t, 1.6);
      this.dummy.position.set(r.x, r.y, r.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(r.size * grow);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(k, this.dummy.matrix);
      this.col.setRGB(0.55 * fade, 0.92 * fade, 1.0 * fade);
      this.mesh.setColorAt(k, this.col);
      k++;
    }
    this.rings = keep;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.rings.length = 0;
    this.mesh.count = 0;
  }
}

// ── soft contact shadows under every ride: ONE instanced draw call for all of them ──
export class Blobs {
  readonly mesh: THREE.InstancedMesh;
  private k = 0;
  private readonly n: number;
  private readonly dummy = new THREE.Object3D();

  constructor(n = 24) {
    this.n = n;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 64, 4, 32, 64, 60);
    g.addColorStop(0, 'rgba(20,16,30,1)');
    g.addColorStop(1, 'rgba(20,16,30,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 128);
    const tex = new THREE.CanvasTexture(c);
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.42, depthWrite: false }),
      n,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  begin(): void {
    this.k = 0;
  }
  add(x: number, y: number, z: number, heading: number, w: number, l: number): void {
    if (this.k >= this.n) return;
    this.dummy.position.set(x, y + 0.04, z);
    this.dummy.rotation.set(0, -heading, 0);
    this.dummy.scale.set(w, 1, l);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.k++, this.dummy.matrix);
  }
  end(): void {
    this.mesh.count = this.k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
