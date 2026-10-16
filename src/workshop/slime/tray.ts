// The shallow round tray the slime sits in: a glossy pastel dish with a
// rounded lip. Local origin = top of the tray floor (the slime's y = 0); the
// bottom sits `trayFloor` below that, on the table. The profile matches
// SlimeSim.groundY so slime drapes over the same rim it collides with.
import * as THREE from 'three';
import { tuning } from '../../tuning';
import { mesh, toyMat } from '../../art/materials';
import { TRAY_LIP } from './slimeSim';

export function buildTray(): THREE.Mesh {
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
  return mesh(geo, toyMat('#cfe3ff', 'gloss'), true, true);
}
