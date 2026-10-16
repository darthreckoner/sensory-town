// Dev-only WORLD INVARIANT sweep (round 3). Instead of a few scripted spots,
// sample the whole map and measure, against the real rendered geometry:
//   feet   — where the walker's feet are vs the visible surface under them
//            (sunk into the road / floating / standing inside a ramp)
//   camera — whether the follow camera is inside geometry or has a big mesh
//            right in front of the lens (clipping)
// Usage: await window.__worldcheck.feet(), .camera('foot' | 'car'), .houses()
import * as THREE from 'three';
import { scenes } from './scene';
import { store } from './store';
import { tuning } from '../tuning';
import { roofIssues } from '../build/pieces';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Spot = { x: number; z: number; d: number; note: string };

function visibleStatic(scene: THREE.Object3D, exclude: THREE.Object3D[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const skip = new Set<THREE.Object3D>();
  for (const e of exclude) e.traverse((o) => skip.add(o));
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip.has(m) || (m as any).isSkinnedMesh) return;
    const mat = m.material as THREE.Material;
    if ((mat as any)?.transparent && (mat as any).opacity < 0.5) return; // glows, beams, mats
    if ((m as any).isInstancedMesh && (m as any).count === 0) return;
    out.push(m);
  });
  return out;
}

const rc = new THREE.Raycaster();

/** Surface height under (x,z) from the actual rendered meshes (topmost hit below `from`). */
function surfaceY(meshes: THREE.Mesh[], x: number, z: number, from = 60): number | null {
  rc.set(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0));
  rc.far = from + 20;
  const hits = rc.intersectObjects(meshes, false);
  return hits.length ? hits[0].point.y : null;
}

async function town(): Promise<any> {
  if (scenes.current?.name !== 'town') await scenes.go('town');
  await new Promise((r) => setTimeout(r, 300));
  return scenes.current as any;
}

function hold(d: any): void {
  // a teleporting sweep must not walk through a door into another scene: hold the triggers
  // asleep (checkTriggers bails while `leaving`), and re-arm them a few seconds after it ends
  d.leaving = true;
  d.leaveT = -1e9;
  clearTimeout(thawTimer);
  thawTimer = window.setTimeout(() => {
    d.leaveT = 0;
    d.leaving = false;
    for (const t of d.triggers ?? []) t.armed = false;
  }, 3000);
}
let thawTimer = 0;

export function initWorldCheck(): void {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('selftest')) return;
  (window as any).__tuning = tuning; // v3 world: dev handle (live culling / fog / look knobs while screenshotting)
  (window as any).__worldcheck = {
    /**
     * Walk-feet sweep: put the walker at grid points across the map, let physics
     * settle, then compare the walker's feet to the visible surface under them.
     */
    async feet(step = 7, tol = 0.3, area?: [number, number, number, number]) {
      const d = await town();
      if (d.mode !== 'foot') {
        d.toggleMode();
        scenes.step(4);
      }
      hold(d);
      const L = await import('../world/townLayout');
      const B = (L as any).BOUNDS as number;
      const bad: Spot[] = [];
      let tested = 0;
      let waterTested = 0;
      // v3 world: the whole island (WORLD_AREA), skipping the open sea
      const [ax0, az0, ax1, az1] = area ?? (L as any).WORLD_AREA ?? [-B + 4, -B + 4, B - 4, B - 4];
      const HF = await import('../world/heightfield');
      for (let x = ax0; x <= ax1; x += step)
        for (let z = az0; z <= az1; z += step) {
          if (HF.shoreDist(x, z) < -26) continue;
          const water = HF.isWater(x, z);
          d.foot.reset(x, z, d.foot.heading ?? 0); // a real teleport (y snapped), not a fall from the last sample
          scenes.step(2);
          d.placeCamera?.(0, true); // camera (and the district culling that follows it) must come along
          scenes.step(3);
          const fx = d.foot.x, fz = d.foot.z;
          if (Math.hypot(fx - x, fz - z) > 1.5) continue; // pushed out by a collider (inside a building) — fine
          if (water) {
            // wading / swimming: the feet are measured against the water surface (and the floor), not the rendered meshes
            waterTested++;
            const f = d.foot;
            const surf = HF.waveY(f.x, f.z, d.simT ?? 0);
            const floor = HF.groundHeight(f.x, f.z, true);
            const over = (L as any).WATER_Y - floor;
            const feetY = d.walker.group.position.y;
            const dr = tuning.drive;
            if (f.swimming) {
              const want = Math.max(surf - dr.swimChest, floor);
              if (Math.abs(feetY - want) > 0.45) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +(feetY - want).toFixed(2), note: `SWIM level feet=${feetY.toFixed(2)}` });
              if (d.camera.position.y < surf + 0.4) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +(d.camera.position.y - surf).toFixed(2), note: `SWIM camera under the surface feet=${feetY.toFixed(2)}` });
            } else if (Math.abs(feetY - floor) > tol) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +(feetY - floor).toFixed(2), note: `WADE feet off the floor feet=${feetY.toFixed(2)}` });
            if (over > dr.swimOn + 0.1 && !f.swimming) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +over.toFixed(2), note: `WADE should be swimming feet=${feetY.toFixed(2)}` });
            if (over < dr.swimOff - 0.1 && f.swimming) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +over.toFixed(2), note: `SWIM in the shallows feet=${feetY.toFixed(2)}` });
            continue;
          }
          const meshes = visibleStatic(d.scene, [d.walker.group, d.car.group]);
          const feet = d.walker.group.position.y;
          rc.set(new THREE.Vector3(fx, feet + 40, fz), new THREE.Vector3(0, -1, 0));
          rc.far = 80;
          const hits = rc.intersectObjects(meshes, false);
          if (!hits.length) continue;
          tested++;
          const nm = (h: THREE.Intersection) => (h.object as any).name || (h.object.parent as any)?.name || 'mesh';
          // body inside geometry: a surface between the ankles and the head (overhead canopies/awnings are fine)
          // foliage is soft (bushes are walk-through by design; pine skirts brush the head)
          const inside = hits.find((h) => h.point.y > feet + tol && h.point.y < feet + 1.5 && nm(h) !== 'vegetation');
          // what the feet stand on: the highest surface at or below the ankles
          const support = hits.find((h) => h.point.y <= feet + tol);
          if (inside) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +(feet - inside.point.y).toFixed(2), note: `SUNK in ${nm(inside)} feet=${feet.toFixed(2)}` });
          else if (support && feet - support.point.y > tol) bad.push({ x: +fx.toFixed(1), z: +fz.toFixed(1), d: +(feet - support.point.y).toFixed(2), note: `FLOAT over ${nm(support)} feet=${feet.toFixed(2)}` });
        }
      const byKind: Record<string, number> = {};
      const samples: Record<string, string[]> = {};
      for (const b of bad) {
        const k = b.note.split(' feet=')[0];
        byKind[k] = (byKind[k] ?? 0) + 1;
        (samples[k] ??= []).length < 10 && samples[k].push(`${b.x},${b.z} d=${b.d} ${b.note.split(' ').pop()}`);
      }
      return { tested, waterTested, bad: bad.length, byKind, samples, worst: bad.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 40) };
    },

    /** Camera sweep: is the follow camera inside geometry / blocked right at the lens? */
    async camera(mode: 'foot' | 'car' = 'foot', step = 9, area?: [number, number, number, number]) {
      const d = await town();
      if (d.mode !== mode) {
        if (mode === 'car') {
          d.foot.x = d.phys.x + 1.5;
          d.foot.z = d.phys.z;
        }
        d.toggleMode();
        scenes.step(4);
      }
      hold(d);
      const L = await import('../world/townLayout');
      const B = (L as any).BOUNDS as number;
      const bad: Spot[] = [];
      let tested = 0;
      const [ax0, az0, ax1, az1] = area ?? (L as any).WORLD_AREA ?? [-B + 4, -B + 4, B - 4, B - 4];
      const HFc = await import('../world/heightfield');
      for (let x = ax0; x <= ax1; x += step)
        for (let z = az0; z <= az1; z += step)
          for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            if (HFc.shoreDist(x, z) < -4) continue; // the camera sweep stays on land (and the first metres of sea)
            if (mode === 'foot') {
              d.foot.reset(x, z, heading);
              d.camYaw = heading; // the foot camera orbits on its own yaw
            } else d.phys.reset(x, z, heading);
            d.placeCamera?.(0, true);
            scenes.step(2);
            const subj = (mode === 'foot' ? d.walker.group : d.car.group).position.clone().add(new THREE.Vector3(0, 1.1, 0));
            if (Math.hypot(subj.x - x, subj.z - z) > 1.5) continue;
            tested++;
            const cam = d.camera.position.clone();
            const dir = subj.clone().sub(cam);
            const dist = dir.length();
            rc.set(cam, dir.normalize());
            rc.far = dist - 0.8;
            const meshes = visibleStatic(d.scene, [d.walker.group, d.car.group]);
            const hits = rc.intersectObjects(meshes, false);
            const near = hits.find((h) => h.distance < Math.max(1.2, dist * 0.35));
            if (near) bad.push({ x: +x.toFixed(0), z: +z.toFixed(0), d: +near.distance.toFixed(2), note: `${(near.object as any).name || (near.object.parent as any)?.name || 'mesh'} @h${(heading * 57.3).toFixed(0)}` });
          }
      const byMesh: Record<string, number> = {};
      for (const b of bad) {
        const k = b.note.split(' @')[0];
        byMesh[k] = (byMesh[k] ?? 0) + 1;
      }
      return { tested, bad: bad.length, byMesh, worst: bad.filter((b) => !b.note.startsWith('vegetation')).slice(0, 40) };
    },

    /** Debug one spot: walker feet vs groundHeight vs the meshes under it. */
    async probe(x: number, z: number) {
      const d = await town();
      if (d.mode !== 'foot') {
        d.toggleMode();
        scenes.step(4);
      }
      hold(d);
      d.foot.reset(x, z, d.foot.heading ?? 0);
      scenes.step(2);
      d.placeCamera?.(0, true);
      scenes.step(3);
      const HF = await import('../world/heightfield');
      rc.set(new THREE.Vector3(d.foot.x, d.foot.y + 6, d.foot.z), new THREE.Vector3(0, -1, 0));
      rc.far = 200;
      const meshes: THREE.Mesh[] = [];
      d.scene.traverseVisible((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !(m as any).isSkinnedMesh) meshes.push(m);
      });
      const hits = rc.intersectObjects(meshes, false).slice(0, 6).map((h) => ({ y: +h.point.y.toFixed(2), name: h.object.name || h.object.parent?.name || h.object.type, transparent: !!(h.object as any).material?.transparent }));
      return { at: [d.foot.x, d.foot.z], footY: +d.foot.y.toFixed(2), walkerY: +d.walker.group.position.y.toFixed(2), groundFoot: +HF.groundHeight(x, z, true).toFixed(2), terrain: +HF.terrainHeight(x, z).toFixed(2), hits };
    },

    /** House sanity: roofs float only above real walls, pieces inside the plot. */
    houses() {
      const out: any[] = [];
      for (const h of store.data.town.houses) {
        const N = 12;
        for (const p of h.pieces) {
          if (p.x < 0 || p.z < 0 || p.x >= N || p.z >= N) out.push({ plot: h.plot, id: p.id, type: p.type, issue: 'outside plot' });
        }
        // roofs: each one must rest on the walls / floor / ground under it (build/pieces.roofIssues uses the real heights;
        // a roof legitimately spans interior cells between walls, so "no wall anchored in this very cell" is not a fault)
        for (const r of roofIssues(h.pieces)) out.push({ plot: h.plot, ...r });
      }
      return out;
    },

    // ── v3 build ── the player's world builds: surfaces, feet on built floors / ramps, roofs on walls (build/world3/check.ts)
    async builds() {
      return (await import('../build/world3/check')).buildsIssues();
    },
  };
}
