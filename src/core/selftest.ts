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

/** Test setup: make sure the town scene is on foot (hop out of the parked car). */
function ensureFoot(d: any): void {
  if (d.mode === 'foot') return;
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

  /** Round 3: jump in the sea, swim (water line at the chest), swim back and walk out — nobody is ever stuck in the water. */
  async swimOut() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureFoot(d);
    d.leaving = true; // a teleport must not walk through a door; checkTriggers is held
    d.leaveT = -1e9;
    d.foot.reset(121, -40, -Math.PI / 2); // the north beach, well past the shelf: deep water
    d.camYaw = -Math.PI / 2;
    d.placeCamera?.(0, true);
    scenes.step(40);
    const swimming = d.foot.swimming;
    const feet = d.walker.group.position.y;
    const camOk = d.camera.position.y > -0.35 + 0.5;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    await sleep(9000);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }));
    const out = !d.foot.swimming && d.foot.wet < 0.15;
    const x = d.foot.x;
    d.leaveT = 0;
    d.leaving = false;
    for (const t of d.triggers ?? []) t.armed = false;
    return { name: 'swimOut', pass: swimming && camOk && out && feet < -0.9, detail: `swimming=${swimming} feetY=${feet.toFixed(2)} cameraAboveWater=${camOk} → after 9 s walking west: out=${out} at x=${x.toFixed(1)}` };
  },

  /** Round 3: the 🚗 Car button / C brings the car to a free spot in front of the walker (not into the sea). */
  async callCar() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureFoot(d);
    d.foot.reset(60, 2.6, Math.PI / 2); // out on the east road, far from where the car was left
    d.lastCall = -1e9;
    d.placeCamera?.(0, true);
    scenes.step(10);
    const before = { x: d.phys.x, z: d.phys.z };
    let vanish = 0, appear = 0;
    const offA = bus.on('carVanish' as any, () => vanish++);
    const offB = bus.on('carAppear' as any, () => appear++);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'c', code: 'KeyC', bubbles: true }));
    await sleep(1800);
    offA();
    offB();
    const moved = Math.hypot(d.phys.x - before.x, d.phys.z - before.z);
    const dist = Math.hypot(d.phys.x - d.foot.x, d.phys.z - d.foot.z);
    const dry = d.phys.y > -0.3;
    return { name: 'callCar', pass: moved > 5 && dist >= 3.5 && dist <= 7.5 && dry && vanish === 1 && appear === 1 && d.dropY === 0, detail: `car moved ${moved.toFixed(0)} u, now ${dist.toFixed(1)} u from the walker, vanish=${vanish} appear=${appear}, settled=${d.dropY === 0}` };
  },

  // ── v3 rides ──────────────────────────────────────────────────────────────
  /** Every parked ride kind: walk up → "Drive" prompt → hop in (the right handling) → hop out leaves it parked where it was. */
  async ridesParked() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureFoot(d);
    const kinds = ['sports', 'pickup', 'golfcart', 'hoverboard', 'icecream', 'boat'];
    const notes: string[] = [];
    let ok = true;
    for (const kind of kinds) {
      ensureFoot(d);
      const w = d.rides.find((q: any) => q.kind === kind && q !== d.driving) ?? d.rides.find((q: any) => q.kind === kind);
      if (!w) {
        ok = false;
        notes.push(kind + ': none parked');
        continue;
      }
      d.foot.reset(w.x + 1.2, w.z, 0);
      for (const tr of d.triggers ?? []) tr.armed = false; // a teleport must not walk through a door
      scenes.step(8);
      const prompt = !!d.rideTarget;
      d.getIn(w);
      scenes.step(20);
      const inCar = d.mode === 'car' && d.car.kind === kind;
      const handling = kind === 'hoverboard' ? d.phys.hover > 0 : kind === 'boat' ? d.phys.waterOnly : d.phys.hover === 0 && !d.phys.waterOnly;
      const at = { x: w.x, z: w.z };
      d.phys.vx = d.phys.vz = d.phys.fwdSpeed = 0;
      d.toggleMode();
      scenes.step(8);
      const parked = d.mode === 'foot' && d.rides.includes(w) && Math.hypot(w.x - at.x, w.z - at.z) < 3;
      const good = prompt && inCar && handling && parked;
      if (!good) ok = false;
      notes.push(`${kind}:${good ? 'ok' : `prompt=${prompt} in=${inCar} handling=${handling} parked=${parked}`}`);
    }
    for (const tr of d.triggers ?? []) tr.armed = false;
    return { name: 'ridesParked', pass: ok, detail: notes.join(' | ') };
  },

  /** The Locker's boat: 🚗 / C drops it in open water, it floats and sails; it will not leave the water. */
  async callBoat() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureFoot(d);
    const prev = store.profile.locker?.ride;
    if (store.profile.locker) store.profile.locker.ride = 'boat';
    d.foot.reset(113, -40, Math.PI / 2); // the shallows on the north beach, facing the sea
    for (const tr of d.triggers ?? []) tr.armed = false;
    d.lastCall = -1e9;
    scenes.step(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'c', code: 'KeyC', bubbles: true }));
    await sleep(1800);
    const kind = d.car.kind;
    const afloat = d.phys.waterOnly && d.phys.y < 0.2;
    // sail: hold W for 3 s, the boat gets going and stays on the water
    d.getIn(d.driving);
    scenes.step(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    await sleep(3000);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }));
    const speed = Math.abs(d.phys.fwdSpeed);
    const wet = d.phys.waterOnly && d.phys.y < 0.2;
    d.phys.vx = d.phys.vz = d.phys.fwdSpeed = 0;
    scenes.step(10);
    d.toggleMode();
    scenes.step(10);
    if (store.profile.locker && prev) store.profile.locker.ride = prev;
    for (const tr of d.triggers ?? []) tr.armed = false;
    return { name: 'callBoat', pass: kind === 'boat' && afloat && speed > 5 && wet && d.mode === 'foot', detail: `ride=${kind} afloat=${afloat} speed=${speed.toFixed(1)} onWater=${wet} mode=${d.mode}` };
  },

  // ── v3 emote ──────────────────────────────────────────────────────────────
  /** The in-world emote wheel: Q opens it with the Locker's emotes, a tap plays one (and the camera swings to her front), walking ends it. Every emote has a tune. */
  async emoteWheel() {
    const { checkTunes, tuneFor } = await import('../juice/emoteMusic');
    const { EMOTES } = await import('../art/character');
    const bad = checkTunes();
    const silent = EMOTES.filter((e) => !tuneFor(e.id)).map((e) => e.id);
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    ensureFoot(d);
    for (const tr of d.triggers ?? []) tr.armed = false;
    const { SPAWN } = await import('../world/townLayout');   // dry flat ground (an earlier test may have left her swimming)
    d.foot.reset(SPAWN.x, SPAWN.z + 3, SPAWN.heading);
    scenes.step(8);
    const L = store.profile.locker;
    const prevEmotes = L ? [...L.emotes] : [];
    if (L) L.emotes = ['bounce', 'wave', 'cheer'];
    const key = (code: string, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { key: code, code, bubbles: true, cancelable: true }));
    let started = 0, stopped = 0;
    const o1 = bus.on('emoteStarted', () => started++);
    const o2 = bus.on('emoteStopped', () => stopped++);
    key('KeyQ');
    const opened = !!d.emote3?.open && d.controls.suspended === true;
    const slots = [...document.querySelectorAll<HTMLElement>('.em3-slot')];
    const filled = slots.filter((x) => !x.classList.contains('empty')).length;
    const [cx, cy] = centerOf(slots[0]);
    tapAt(cx, cy, 901);
    scenes.step(2);
    const closed = !d.emote3.open && d.controls.suspended === false;
    const playing = d.walker.emoting;
    scenes.step(90);
    const swung = d.mv.emoteK > 0.5;
    key('KeyW');
    scenes.step(20);
    const ended = d.walker.emoting === null && stopped === 1 && d.mv.emoteCam === false;
    key('KeyW', 'keyup');
    scenes.step(120);
    const back = d.mv.emoteK < 0.05;
    key('KeyQ');
    key('Escape');
    const escClosed = !d.emote3.open;
    o1();
    o2();
    if (L) L.emotes = prevEmotes;
    const pass = bad.length === 0 && silent.length === 0 && opened && slots.length === 6 && filled === 3 && closed && playing === 'bounce' && started === 1 && swung && ended && back && escClosed;
    return {
      name: 'emoteWheel',
      pass,
      detail: `tunes ok=${bad.length === 0} silent=[${silent}] open=${opened} slots=${slots.length}/filled ${filled} closed=${closed} playing=${playing} started=${started} camSwung=${swung} walkEnds=${ended} stopped=${stopped} camBack=${back} esc=${escClosed}${bad.length ? ' ' + bad.join('; ') : ''}`,
    };
  },

  // ── v3 hud ────────────────────────────────────────────────────────────────
  /** The right-hand round buttons (paint, get in, call, build, emote) stay on screen and never intersect the pedals / SLIDE / HOP / horn, the minimap or the stick, on foot and in a ride, at the CURRENT window size (run it at several sizes). */
  async hudLayout() {
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    d.mv?.cancel?.();
    const prevShow: boolean = d.controls.touchShown;
    d.controls.showTouch(true);   // the touch controls are what the column has to keep clear of
    const W = window.innerWidth, H = window.innerHeight;
    const shown = (e: HTMLElement) => e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
    const tag = (e: Element) => (e.className as string).split(' ').filter((c) => /^(drive|joy|btn)/.test(c) && c !== 'btn' && c !== 'round').slice(0, 2).join('.') || e.tagName;
    const problems: string[] = [];
    const notes: string[] = [];
    const check = (label: string) => {
      scenes.step(3);
      const btns = [...document.querySelectorAll<HTMLElement>('.drive-side .btn')].filter(shown);
      const others = [...document.querySelectorAll<HTMLElement>('.drive-pedal, .drive-horn, .drive-minimap, .drive-joy .joy-base')].filter(shown);
      btns.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) problems.push(`${label}: ${tag(b)} off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}px)`);
        if (r.width < 51.5) problems.push(`${label}: ${tag(b)} only ${r.width.toFixed(0)}px wide`);
        for (const o of others) if (hit(r, o.getBoundingClientRect())) problems.push(`${label}: ${tag(b)} runs into ${tag(o)}`);
        for (let j = i + 1; j < btns.length; j++) if (hit(r, btns[j].getBoundingClientRect())) problems.push(`${label}: ${tag(b)} overlaps ${tag(btns[j])}`);
      });
      const cols = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().left))).size;
      notes.push(`${label} ${btns.length} btns/${cols} col`);
    };
    ensureFoot(d);
    check('foot');
    ensureCar(d);
    check('ride');
    d.controls.setHop(true);   // the hoverboard's HOP button stacks up the right edge
    check('hop');
    d.controls.setHop(d.phys.hover > 0);
    ensureFoot(d);
    d.controls.showTouch(prevShow);
    return { name: 'hudLayout', pass: problems.length === 0, detail: `${W}x${H}: ${notes.join(', ')}${problems.length ? ' | ' + problems.slice(0, 6).join('; ') : ''}` };
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
