// The slime tray for the dark creator studio: a glossy black acrylic dish with a rounded lip and a
// glowing LED ring just inside the wall (it takes on the slime's color), plus a soft colored
// underglow on the desk. Local origin = top of the tray floor (the slime's y = 0); the bottom sits
// `trayFloor` below that, on the table. The profile matches SlimeSim.groundY so slime drapes over
// the same rim it collides with.
import * as THREE from 'three';
import { tuning } from '../../tuning';
import { TRAY_LIP } from './slimeSim';

export interface SlimeTray {
  root: THREE.Group;
  /** tint the LED ring + underglow */
  setGlow(c: THREE.ColorRepresentation): void;
}

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}

export function buildTray(): SlimeTray {
  const t = tuning.slime;
  const rin = t.radius + t.trayMargin; // inner wall
  const lip = TRAY_LIP;
  const rout = rin + lip;
  const fil = t.trayMargin; // inner floor fillet
  const rimH = t.trayRim;
  const bot = -t.trayFloor;
  const bf = 0.07;
  const pts: THREE.Vector2[] = [];
  const add = (x: number, y: number) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - x, l.y - y) > 1e-4) pts.push(new THREE.Vector2(x, y)); // lathe normals hate duplicate points
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, steps: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      add(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  // outward along the bottom, up the outer wall, over the lip, down the inner wall, along the floor
  add(0, bot);
  arc(rout - bf, bot + bf, bf, -Math.PI / 2, 0, 6);
  add(rout, rimH - lip / 2);
  arc(rin + lip / 2, rimH - lip / 2, lip / 2, 0, Math.PI, 8);
  arc(rin - fil, fil, fil, 0, -Math.PI / 2, 10);
  add(0, 0);
  const geo = new THREE.LatheGeometry(pts, 96);
  const dish = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({ color: '#15131c', roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.2 }),
  );
  dish.castShadow = true;
  dish.receiveShadow = true;

  const root = new THREE.Group();
  root.add(dish);

  // LED ring hugging the inside of the wall
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ff2e88', toneMapped: false });
  const led = new THREE.Mesh(new THREE.TorusGeometry(rin - 0.02, 0.012, 8, 120), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.y = 0.12;
  root.add(led);

  // colored underglow on the desk
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), color: '#ff2e88', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry((rout + 0.9) * 2, (rout + 0.9) * 2), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = bot + 0.004;
  glow.renderOrder = -1;
  root.add(glow);

  const col = new THREE.Color();
  return {
    root,
    setGlow(c) {
      col.set(c);
      ledMat.color.copy(col);
      glowMat.color.copy(col);
    },
  };
}
