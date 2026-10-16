// A deformable squishy. Fingers dent the surface exactly where they press
// (gaussian falloff, slight bulge ring for volume); released dents slowly rise
// back like memory foam. Shared by the Squishy and Wax stations.
import * as THREE from 'three';
import type { ShapeId } from '../core/model';
import { tuning } from '../tuning';
import { makeShapeGeometry, faceMaterial, shapeExtras, shapeBottom } from '../art/shapes';

interface Contact {
  id: number;
  /** contact center on the rest surface, local space */
  p: THREE.Vector3;
  /** inward push direction, local space (unit) */
  n: THREE.Vector3;
  depth: number;
  hold: number;
}

export class SquishyBody {
  readonly root = new THREE.Group();
  mesh!: THREE.Mesh;
  /** invisible rest-shape proxy used for stable raycasts */
  proxy!: THREE.Mesh;
  shape: ShapeId;
  color: string;
  private geo!: THREE.BufferGeometry;
  private rest!: Float32Array;
  private restN!: Float32Array;
  private off!: Float32Array;
  private dent!: Float32Array;
  private contacts = new Map<number, Contact>();
  private extras: THREE.Object3D | null = null;
  private wasDented = false;
  private maxOff = 0;
  /** Global squeeze 0..1 (wax station: pressing on the shell squeezes the whole squishy). */
  squeeze = 0;
  /** Per-vertex 0..1 — where 1, a squeeze makes the surface bulge outward (exposed by cracked wax). */
  bulgeMask: Float32Array | null = null;
  /** Per-vertex 0..1 — where 1, the surface can't move (still under hard wax). */
  lockMask: Float32Array | null = null;
  /** Called when the squishy has fully risen back after a dent. */
  onRecover: ((worldPos: THREE.Vector3) => void) | null = null;
  private tmp = new THREE.Vector3();
  private bottomY = -1;
  private lastRecoverPos = new THREE.Vector3();

  constructor(shape: ShapeId, color: string) {
    this.shape = shape;
    this.color = color;
    this.build();
  }

  get scale(): number {
    return tuning.squishy.bodyRadius;
  }

  get vertexCount(): number {
    return this.rest.length / 3;
  }

  /** Rest positions (unit space) — read only. */
  get restPositions(): Float32Array {
    return this.rest;
  }

  setShape(shape: ShapeId): void {
    if (shape === this.shape) return;
    this.shape = shape;
    this.build();
  }

  setColor(color: string): void {
    this.color = color;
    const m = this.mesh.material as THREE.MeshPhysicalMaterial;
    m.color.set(color);
    m.sheenColor.set(color).lerp(new THREE.Color('#ffffff'), 0.35);
  }

  private build(): void {
    if (this.mesh) {
      this.root.remove(this.mesh, this.proxy);
      this.geo.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    if (this.extras) this.root.remove(this.extras);
    const base = makeShapeGeometry(this.shape, tuning.squishy.meshDetail);
    this.geo = base.clone();
    this.rest = (base.attributes.position.array as Float32Array).slice();
    this.restN = (base.attributes.normal.array as Float32Array).slice();
    this.off = new Float32Array(this.rest.length);
    (this.geo.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.dent = new Float32Array(this.rest.length / 3);
    const dentAttr = new THREE.BufferAttribute(this.dent, 1);
    dentAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aDent', dentAttr);
    this.mesh = new THREE.Mesh(this.geo, faceMaterial(this.color, this.shape));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.proxy = new THREE.Mesh(base, new THREE.MeshBasicMaterial({ visible: false }));
    this.root.add(this.mesh, this.proxy);
    this.extras = shapeExtras(this.shape);
    if (this.extras) this.root.add(this.extras);
    this.root.scale.setScalar(this.scale);
    this.bottomY = shapeBottom(this.shape);
    this.contacts.clear();
    this.bulgeMask = null;
    this.lockMask = null;
    this.squeeze = 0;
  }

  /** y offset so the squishy rests on y=0 (in parent space). */
  restHeight(): number {
    return -shapeBottom(this.shape) * this.scale;
  }

  /** Raycast the rest shape; returns local hit point + local normal. */
  hit(ray: THREE.Ray): { local: THREE.Vector3; normal: THREE.Vector3; world: THREE.Vector3 } | null {
    const rc = new THREE.Raycaster(ray.origin, ray.direction);
    this.root.updateMatrixWorld();
    const hits = rc.intersectObject(this.proxy, false);
    if (!hits.length) return null;
    const h = hits[0];
    const local = this.root.worldToLocal(h.point.clone());
    const normal = h.face ? h.face.normal.clone() : local.clone().normalize();
    return { local, normal, world: h.point.clone() };
  }

  /** Start / update a finger contact (local-space point + inward direction). */
  press(id: number, local: THREE.Vector3, inward: THREE.Vector3, pressure = 0.5): void {
    let c = this.contacts.get(id);
    const t = tuning.squishy;
    const base = (t.pressDepth * t.softness * (0.6 + pressure * 0.8)) / this.scale;
    if (!c) {
      c = { id, p: local.clone(), n: inward.clone().normalize(), depth: base * 0.6, hold: 0 };
      this.contacts.set(id, c);
    } else {
      c.p.copy(local);
      c.n.lerp(inward, 0.5).normalize();
    }
  }

  release(id: number): number {
    const c = this.contacts.get(id);
    this.contacts.delete(id);
    return c ? c.depth * this.scale : 0;
  }

  get pressing(): boolean {
    return this.contacts.size > 0;
  }

  reset(): void {
    this.contacts.clear();
    this.off.fill(0);
    this.squeeze = 0;
    this.writePositions();
  }

  update(dt: number): void {
    const t = tuning.squishy;
    const sc = this.scale;
    // grow each contact's depth while held
    for (const c of this.contacts.values()) {
      c.hold += dt;
      const target = Math.min(t.maxDent, t.pressDepth * t.softness + c.hold * t.holdDeepenRate * t.softness) / sc;
      c.depth += (target - c.depth) * (1 - Math.exp(-14 * dt));
    }
    const R = t.falloffRadius / sc;
    const inv2R2 = 1 / (2 * R * R);
    const ringR = R * 1.9;
    const invRing = 1 / (2 * ringR * ringR);
    const fast = 1 - Math.exp(-35 * dt);
    const slow = 1 - Math.exp(-t.recoverySpeed * dt);
    const rest = this.rest, rn = this.restN, off = this.off;
    const n = rest.length / 3;
    const contacts = [...this.contacts.values()];
    const squeeze = this.squeeze;
    const bulge = tuning.wax.bulgeAmount / sc;
    const bm = this.bulgeMask, lm = this.lockMask;
    let maxOff = 0;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const px = rest[ix], py = rest[ix + 1], pz = rest[ix + 2];
      let tx = 0, ty = 0, tz = 0;
      for (const c of contacts) {
        const dx = px - c.p.x, dy = py - c.p.y, dz = pz - c.p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > ringR * ringR * 9) continue;
        const g = Math.exp(-d2 * inv2R2);
        const ring = (Math.exp(-d2 * invRing) - g) * t.bulgeRing; // volume bulge around the dent
        const push = c.depth * g;
        tx += c.n.x * push - rn[ix] * ring * c.depth;
        ty += c.n.y * push - rn[ix + 1] * ring * c.depth;
        tz += c.n.z * push - rn[ix + 2] * ring * c.depth;
      }
      if (squeeze > 0) {
        // whole-body squash: flatten y, widen xz a touch, bulge where exposed
        tx += px * squeeze * 0.06;
        tz += pz * squeeze * 0.06;
        ty -= (py - this.bottomY) * squeeze * 0.1;
        if (bm) {
          const b = bm[i] * squeeze * bulge;
          tx += rn[ix] * b;
          ty += rn[ix + 1] * b;
          tz += rn[ix + 2] * b;
        }
      }
      if (lm && lm[i] > 0) {
        const k = 1 - lm[i];
        tx *= k; ty *= k; tz *= k;
      }
      const ox = off[ix], oy = off[ix + 1], oz = off[ix + 2];
      const tl = tx * tx + ty * ty + tz * tz;
      const ol = ox * ox + oy * oy + oz * oz;
      const k = tl >= ol ? fast : slow;
      const nx = ox + (tx - ox) * k, ny = oy + (ty - oy) * k, nz = oz + (tz - oz) * k;
      off[ix] = nx;
      off[ix + 1] = ny;
      off[ix + 2] = nz;
      const m = nx * nx + ny * ny + nz * nz;
      if (m > maxOff) {
        maxOff = m;
        this.lastRecoverPos.set(px, py, pz);
      }
    }
    maxOff = Math.sqrt(maxOff) * sc;
    this.maxOff = maxOff;
    this.writePositions();
    // recovery pop
    if (maxOff > t.popThreshold * 4) this.wasDented = true;
    if (this.wasDented && contacts.length === 0 && squeeze < 0.01 && maxOff < t.popThreshold) {
      this.wasDented = false;
      if (this.onRecover) {
        this.root.updateMatrixWorld();
        this.onRecover(this.root.localToWorld(this.tmp.copy(this.lastRecoverPos)));
      }
    }
  }

  private writePositions(): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const rest = this.rest, off = this.off, rn = this.restN, dent = this.dent;
    for (let i = 0; i < a.length; i++) a[i] = rest[i] + off[i];
    pos.needsUpdate = true;
    // inward displacement → shading cue (0..1)
    const inv = this.scale / Math.max(0.05, tuning.squishy.maxDent * 0.7);
    for (let v = 0, ix = 0; v < dent.length; v++, ix += 3) {
      const inward = -(off[ix] * rn[ix] + off[ix + 1] * rn[ix + 1] + off[ix + 2] * rn[ix + 2]);
      dent[v] = inward > 0 ? Math.min(1, inward * inv) : 0;
    }
    this.geo.attributes.aDent.needsUpdate = true;
    if (this.maxOff > 1e-4 || this.squeeze > 0) {
      this.geo.computeVertexNormals();
    } else {
      (this.geo.attributes.normal.array as Float32Array).set(this.restN);
      this.geo.attributes.normal.needsUpdate = true;
    }
  }

  get maxDisplacement(): number {
    return this.maxOff;
  }
}
