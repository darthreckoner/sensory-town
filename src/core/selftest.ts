// Dev-only regression self-test (round-2 protocol in SCORECARD.md). Each test
// reproduces a bug found in the v2 cold run through real inputs (DOM pointer
// and key events into the game's own handlers), so the same script that showed
// the bug can prove the fix. Setup may use internal calls to reach a state;
// assertions are about player-visible behaviour.
//   window.__selftest.run()          → all tests
//   window.__selftest.run('waxReflow')
import * as THREE from 'three';
import { scenes } from './scene';
import { store } from './store';
import { bus } from './events';

type Result = { name: string; pass: boolean; detail: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* eslint-disable @typescript-eslint/no-explicit-any */
const cur = (): any => scenes.current;

/** Test setup: make sure the town scene is in the car (walk the player to the car first). */
function ensureCar(d: any): void {
  if (d.mode === 'car') return;
  d.foot.x = d.phys.x + 1.5;
  d.foot.z = d.phys.z;
  d.toggleMode();
  scenes.step(4);
}

function tapAt(x: number, y: number, id = 900): string {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const o = { pointerId: id, bubbles: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true };
  (el ?? scenes.canvas).dispatchEvent(new PointerEvent('pointerdown', o));
  (el ?? scenes.canvas).dispatchEvent(new PointerEvent('pointerup', o));
  return el?.textContent?.trim() ?? '(canvas)';
}

function buttonByLabel(label: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('.btn, .tab')].find((e) => e.offsetParent && e.textContent?.trim().endsWith(label)) ?? null;
}

function centerOf(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}

function count(type: string, fn: () => Promise<void>): Promise<number> {
  let n = 0;
  const off = bus.on(type as any, () => n++);
  return fn().then(() => {
    off();
    return n;
  });
}

const TESTS: Record<string, () => Promise<Result>> = {
  /** v2 bug: after tapping Crack, the action stack reflows and "✨ New" lands where "❄️ Cool"
   *  was — a kid tapping Cool again wipes the coat. Tap where Cool was; the coat must survive. */
  async waxReflow() {
    await scenes.go('workshop', { station: 'wax' });
    const st = cur().stations.get('wax');
    st.setStep('coat');
    scenes.step(30);
    st.coating.clear();
    const l = st.coating.beginLayer('#ff2e88', 'dip');
    st.coating.dipTo(l, 2);
    l.final = true; // soft → the Cool button shows
    st.renderPanels();
    const action = (label: string) => [...document.querySelectorAll<HTMLElement>('.wax-actions .btn')].find((e) => e.offsetParent && e.textContent?.trim().endsWith(label)) ?? null;
    const cool = action('Cool'), crack = action('Crack');
    if (!cool || !crack) return { name: 'waxReflow', pass: false, detail: `missing buttons cool=${!!cool} crack=${!!crack}` };
    const [cx, cy] = centerOf(cool);
    const [kx, ky] = centerOf(crack);
    tapAt(kx, ky); // → crack step
    scenes.step(20);
    const hit = tapAt(cx, cy); // kid taps where Cool used to be
    scenes.step(20);
    const layers = st.coating.layers.length;
    return { name: 'waxReflow', pass: layers === 1, detail: `tap at old Cool spot hit "${hit}", layers after = ${layers}` };
  },

  /** Rolling slowly over a FOR SALE mat in the car must not claim the lot by itself. */
  async carClaim() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureCar(d);
    const tr = d.triggers.find((t: any) => t.def.params?.claim);
    if (!tr) return { name: 'carClaim', pass: true, detail: 'no empty lots' };
    const houses = store.data.town.houses.length;
    d.phys.reset(tr.def.x - tr.def.nx * 4, tr.def.z - tr.def.nz * 4, Math.atan2(tr.def.nx, -tr.def.nz));
    for (const t of d.triggers) t.armed = true;
    // creep forward onto the mat
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    await sleep(450);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }));
    await sleep(1500);
    const after = store.data.town.houses.length;
    const scene = scenes.current?.name;
    if (scene !== 'town') await scenes.go('town');
    return { name: 'carClaim', pass: after === houses && scene === 'town', detail: `scene=${scene}, houses ${houses}→${after}` };
  },

  /** Arriving at the Studio pad plays the arrive cue exactly once (real time). */
  async arriveOnce() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureCar(d);
    const tr = d.triggers.find((t: any) => t.def.scene === 'workshop' && t.def.carOnly) ?? d.triggers.find((t: any) => t.def.scene === 'workshop' && t.def.carSpeed !== undefined);
    for (const t of d.triggers) t.armed = true;
    const n = await count('arriveWorkshop', async () => {
      d.phys.reset(tr.def.x, tr.def.z, 0);
      await sleep(2500);
    });
    return { name: 'arriveOnce', pass: n === 1 && scenes.current?.name === 'workshop', detail: `arriveWorkshop fired ${n}×, scene=${scenes.current?.name}` };
  },

  /** Black clothes must render dark: torso luma well below the mid-grey. */
  async blackFabric() {
    const p = store.profile;
    const saved = structuredClone(p.outfit);
    store.update(() => {
      p.outfit.top = { style: 4, color: '#16151c' };
    });
    await scenes.go('dressup');
    scenes.step(60);
    const s = cur();
    const ch = s.character ?? s.char;
    const anchor: THREE.Vector3 = ch.slotAnchor('top');
    const v = anchor.clone().project(s.camera);
    const gl = scenes.renderer.getContext();
    scenes.renderer.render(s.scene, s.camera);
    const pr = scenes.renderer.getPixelRatio();
    const W = scenes.renderer.domElement.width, H = scenes.renderer.domElement.height;
    const cx = Math.round((v.x * 0.5 + 0.5) * W), cy = Math.round((v.y * 0.5 + 0.5) * H);
    const px = new Uint8Array(4 * 9);
    gl.readPixels(cx - 1, cy - 1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let luma = 0;
    for (let i = 0; i < 9; i++) luma += (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    luma /= 9;
    store.update(() => (p.outfit = saved));
    void pr;
    return { name: 'blackFabric', pass: luma < 0.3, detail: `black puffer torso luma = ${luma.toFixed(2)} (needs < 0.30)` };
  },

  /** The ⭐ Mine tab is fully on screen in house mode (no scrolling needed). */
  async mineTab() {
    const h = store.data.town.houses.find((x) => x.ownerId === store.profile.id);
    if (!h) return { name: 'mineTab', pass: true, detail: 'no house (skipped)' };
    await scenes.go('build', { plot: h.plot });
    scenes.step(30);
    const tab = [...document.querySelectorAll<HTMLElement>('.tab')].find((e) => e.offsetParent && e.textContent?.includes('Mine'));
    if (!tab) return { name: 'mineTab', pass: false, detail: 'no Mine tab' };
    const r = tab.getBoundingClientRect();
    const ok = r.left >= 0 && r.right <= window.innerWidth - 4;
    return { name: 'mineTab', pass: ok, detail: `Mine tab x ${Math.round(r.left)}–${Math.round(r.right)} of ${window.innerWidth}` };
  },

  /** Chase camera keeps line of sight to the car while driving under the Home Hills gate. */
  async gateway() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureCar(d);
    const gx = -64, gz = 3 + 6 * Math.sin((gx + 62) / 24);
    d.phys.reset(gx + 26, gz, -Math.PI / 2); // east of the gate, heading west
    d.placeCamera?.(0, true);
    const rc = new THREE.Raycaster();
    let blocked = 0, frames = 0;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    for (let i = 0; i < 160; i++) {
      scenes.step(2);
      const cam = d.camera.position.clone();
      const car = d.car.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const dir = car.clone().sub(cam);
      const dist = dir.length();
      rc.set(cam, dir.normalize());
      rc.far = dist - 1.5;
      const meshes: THREE.Object3D[] = [];
      d.scene.traverseVisible((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !(m as any).isInstancedMesh && !(m as any).isSkinnedMesh && m.geometry) meshes.push(m);
      });
      const hits = rc.intersectObjects(meshes, false);
      if (hits.some((h: THREE.Intersection) => {
        const g = (h.object as THREE.Mesh).geometry;
        g.computeBoundingSphere?.();
        return (g.boundingSphere?.radius ?? 0) > 4; // big occluders only (signs, walls)
      })) blocked++;
      frames++;
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }));
    return { name: 'gateway', pass: blocked <= 2, detail: `camera blocked by a big mesh in ${blocked}/${frames} frames` };
  },

  /** Draw calls in town (spawn view) within the iPad budget. */
  async drawCallsTown() {
    await scenes.go('town');
    await sleep(300);
    scenes.step(10);
    const calls = scenes.renderer.info.render.calls;
    return { name: 'drawCallsTown', pass: calls <= 300, detail: `${calls} calls, ${scenes.renderer.info.render.triangles} tris (budget ≤300)` };
  },

  /** Draw calls in build house mode within the iPad budget. */
  async drawCallsBuild() {
    const h = store.data.town.houses.find((x) => x.ownerId === store.profile.id);
    if (!h) return { name: 'drawCallsBuild', pass: true, detail: 'no house (skipped)' };
    await scenes.go('build', { plot: h.plot });
    scenes.step(30);
    const calls = scenes.renderer.info.render.calls;
    return { name: 'drawCallsBuild', pass: calls <= 300, detail: `${calls} calls, ${scenes.renderer.info.render.triangles} tris (budget ≤300)` };
  },
};

export function initSelfTest(): void {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('selftest')) return;
  (window as any).__selftest = {
    names: Object.keys(TESTS),
    async run(only?: string) {
      const out: Result[] = [];
      for (const [name, fn] of Object.entries(TESTS)) {
        if (only && name !== only) continue;
        try {
          out.push(await fn());
        } catch (e) {
          out.push({ name, pass: false, detail: `threw: ${(e as Error).message}` });
        }
      }
      return out;
    },
  };
}
