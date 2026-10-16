// ── v3 movement (W4) ── Launch pads: bouncy pads at the points of interest.
// Step on one and BOING: you shoot 20 m+ into the air, skydive, and the glider takes you down.
// Positions come from LAUNCH_PADS in townLayout (the world agent); until it is there, a local list of six.
import * as THREE from 'three';
import { tuning } from '../tuning';
import * as Layout from '../world/townLayout';
import { groundHeight } from '../world/heightfield';
import { lightBeam } from './envUtils';
import { hyp } from '../core/fastmath';   // ── v3 perf ── Math.hypot is ~12x slower than this

export interface PadSpot {
  x: number;
  z: number;
}

/** Temporary spots (used only while townLayout has no LAUNCH_PADS): one per district, on open ground. */
const FALLBACK_PADS: PadSpot[] = [
  { x: 30, z: -8 }, // downtown plaza, east of the Studio drive
  { x: -60, z: 96 }, // skate plaza
  { x: 72, z: -82 }, // park lawn
  { x: 100, z: 30 }, // beach sand
  { x: -74, z: -20 }, // Home Hills field
  { x: -96, z: -62 }, // foot of Lookout Hill
];

export function padSpots(): PadSpot[] {
  const l = (Layout as unknown as { LAUNCH_PADS?: PadSpot[] }).LAUNCH_PADS;
  return l && l.length ? l : FALLBACK_PADS;
}

interface Pad {
  x: number;
  y: number;
  z: number;
  group: THREE.Group;
  cushion: THREE.Mesh;
  glow: THREE.Mesh[];
  beam: THREE.Mesh;
  cool: number;
  squash: number; // 0 = rest, >0 = playing the boing squash (seconds elapsed)
  phase: number;
}

interface Wave {
  mesh: THREE.Mesh;
  t: number;
  delay: number;
  x: number;
  y: number;
  z: number;
  rise: boolean;
}

const BASE_COL = '#1d1b26';
const CUSHION = '#ff2e88';
const GLOW = '#00d4ff';

export class LaunchPads {
  readonly group = new THREE.Group();
  private pads: Pad[] = [];
  private waves: Wave[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);

  constructor() {
    this.group.name = 'launchPads';
    const baseMat = new THREE.MeshStandardMaterial({ color: BASE_COL, roughness: 0.4, metalness: 0.3 });
    const cushionMat = new THREE.MeshStandardMaterial({ color: CUSHION, roughness: 0.3, emissive: CUSHION, emissiveIntensity: 0.28 });
    const glowMat = new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false });
    const whiteMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const baseGeo = new THREE.CylinderGeometry(1.7, 1.85, 0.26, 28);
    const lipGeo = new THREE.TorusGeometry(1.56, 0.1, 8, 36).rotateX(Math.PI / 2);
    const cushGeo = new THREE.CylinderGeometry(1.32, 1.42, 0.3, 28);
    const dotGeo = new THREE.RingGeometry(0.34, 0.5, 28).rotateX(-Math.PI / 2);
    const dot2Geo = new THREE.RingGeometry(0.78, 0.9, 32).rotateX(-Math.PI / 2);

    for (const sp of padSpots()) {
      const y = groundHeight(sp.x, sp.z, true);
      const g = new THREE.Group();
      g.position.set(sp.x, y, sp.z);
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.13;
      base.receiveShadow = true;
      const lip = new THREE.Mesh(lipGeo, glowMat);
      lip.position.y = 0.3;
      const cushion = new THREE.Mesh(cushGeo, cushionMat);
      cushion.position.y = 0.4;
      cushion.castShadow = true;
      // the bullseye rings ride on the cushion (its local y = 0 is the cushion's middle) so they squash with it
      const r1 = new THREE.Mesh(dotGeo, whiteMat);
      r1.position.y = 0.152;
      const r2 = new THREE.Mesh(dot2Geo, whiteMat);
      r2.position.y = 0.152;
      cushion.add(r1, r2);
      g.add(base, lip, cushion);
      const beam = lightBeam(GLOW, 1.1, 16, 0.32);
      g.add(beam);
      this.group.add(g);
      this.pads.push({ x: sp.x, y, z: sp.z, group: g, cushion, glow: [lip, r1, r2], beam, cool: 0, squash: 0, phase: Math.random() * 6 });
    }
    // a small pool of expanding rings for the boing
    const ringMat = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.ringGeo, ringMat());
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.waves.push({ mesh, t: 99, delay: 0, x: 0, y: 0, z: 0, rise: false });
    }
  }

  /** Is the walker (feet at x, y, z, on the ground) on a pad? Returns it and starts the squash + rings. */
  trigger(x: number, y: number, z: number): { x: number; y: number; z: number } | null {
    const R = tuning.movement3.padRadius;
    for (const p of this.pads) {
      if (p.cool > 0) continue;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > R * R || Math.abs(y - p.y) > 1.2) continue;
      p.cool = tuning.movement3.padCooldown;
      p.squash = 0.0001;
      this.rings(p);
      return { x: p.x, y: p.y, z: p.z };
    }
    return null;
  }

  private rings(p: Pad): void {
    // three flat rings spreading across the ground, three rising up the launch column
    let n = 0;
    for (const w of this.waves) {
      if (w.t < 0.9 || n >= 6) continue;
      w.t = 0;
      w.delay = (n % 3) * 0.1;
      w.rise = n >= 3;
      w.x = p.x;
      w.y = p.y;
      w.z = p.z;
      w.mesh.visible = false;
      n++;
    }
  }

  update(dt: number, t: number, px: number, pz: number): void {
    const cull = tuning.movement3.padCullDist;
    for (const p of this.pads) {
      p.cool = Math.max(0, p.cool - dt);
      const near = hyp(p.x - px, p.z - pz) < cull;
      p.group.visible = near;
      if (!near) continue;
      // idle: the glow breathes
      const breathe = 0.5 + 0.5 * Math.sin(t * 3 + p.phase);
      (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.18 * breathe;
      let sy = 1 + 0.03 * Math.sin(t * 3 + p.phase);
      let sxz = 1;
      if (p.squash > 0) {
        p.squash += dt;
        const k = p.squash / 0.55;
        if (k >= 1) p.squash = 0;
        else {
          // squash flat, then overshoot tall, then settle (a spring)
          sy = 1 + Math.sin(k * Math.PI * 3) * 0.55 * Math.pow(1 - k, 1.4) - 0.7 * Math.max(0, 1 - k * 6);
          sxz = 1 - (sy - 1) * 0.35;
        }
      }
      p.cushion.scale.set(sxz, Math.max(0.15, sy), sxz);
    }
    for (const w of this.waves) {
      if (w.t >= 0.9) {
        w.mesh.visible = false;
        continue;
      }
      w.t += dt;
      const u = (w.t - w.delay) / 0.75;
      if (u < 0) continue;
      if (u >= 1) {
        w.mesh.visible = false;
        w.t = 99;
        continue;
      }
      w.mesh.visible = true;
      const e = 1 - Math.pow(1 - u, 2.2);
      const m = w.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = 0.85 * (1 - u);
      if (w.rise) {
        w.mesh.position.set(w.x, w.y + 0.5 + e * 16, w.z);
        w.mesh.scale.setScalar(1.7 - e * 0.5);
      } else {
        w.mesh.position.set(w.x, w.y + 0.12, w.z);
        w.mesh.scale.setScalar(1.6 + e * 4.5);
      }
    }
  }

  get spots(): { x: number; z: number }[] {
    return this.pads;
  }
}
