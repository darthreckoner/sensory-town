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

  /**
   * v3 phone: the in-world UI on a phone, at the CURRENT window size (run it at 852x393, 844x390, 667x375, 932x430 and portrait 390x844). With the notch / home-indicator
   * insets faked (59 px left and right, 21 px at the bottom) it checks that: the pill stack, prompt bubbles (Drive, Zip!), POI card, build bar and its panels, emote wheel
   * and the party-bus overlay all stay inside the safe area, are not smaller than 44 px to tap, and do not run into each other, the button column, the pedals / stick,
   * the minimap or the menu button. In portrait the "turn your phone sideways" card must be up (and only then).
   */
  async phoneLayout() {
    const { SPAWN } = await import('../world/townLayout');
    await scenes.go('town');
    await sleep(300);
    const d = cur();
    d.mv?.cancel?.();
    ensureFoot(d);
    const root = document.documentElement;
    const keys = ['--safe-t', '--safe-r', '--safe-b', '--safe-l'];
    const saved = keys.map((k) => root.style.getPropertyValue(k));
    const W = window.innerWidth, H = window.innerHeight;
    const phone = Math.min(W, H) <= 520;   // a phone has a notch on its side; an iPad only has the home bar
    const S = phone ? { t: 0, r: 59, b: 21, l: 59 } : { t: 24, r: 0, b: 20, l: 0 };   // (an iPad web app: a status bar on top, the home bar below)
    keys.forEach((k, i) => root.style.setProperty(k, `${[S.t, S.r, S.b, S.l][i]}px`));
    const prevShow: boolean = d.controls.touchShown;
    d.controls.showTouch(true);
    const problems: string[] = [];
    const notes: string[] = [];
    const shown = (e: HTMLElement) => e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    const q = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter(shown);
    const tag = (e: Element) => (e.className as string).split(/\s+/).filter((c) => c && !/^(btn|round|interactive|passthrough)$/.test(c)).slice(0, 2).join('.') || e.tagName.toLowerCase();
    const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
    const fail = (m: string) => problems.length < 14 && problems.push(m);
    // what of an element can be seen: a scrolling strip (decor items, swatches) clips the part outside it; null = scrolled right out of sight
    const seen = (e: HTMLElement): DOMRect | null => {
      let r = e.getBoundingClientRect();
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o !== 'auto' && o !== 'scroll') continue;
        const c = a.getBoundingClientRect();
        const l = Math.max(r.left, c.left), t = Math.max(r.top, c.top), rt = Math.min(r.right, c.right), bt = Math.min(r.bottom, c.bottom);
        if (rt - l < 2 || bt - t < 2) return null;
        r = new DOMRect(l, t, rt - l, bt - t);
      }
      return r;
    };
    const inside = (label: string, els: HTMLElement[]) => {
      for (const e of els) {
        const r = seen(e);
        if (r && (r.left < S.l - 1 || r.right > W - S.r + 1 || r.top < S.t - 1 || r.bottom > H - S.b + 1)) fail(`${label}: ${tag(e)} outside the safe area (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`);
      }
    };
    const taps = (label: string, els: HTMLElement[]) => {
      for (const e of els) {
        if (!seen(e)) continue;
        const r = e.getBoundingClientRect();
        if (Math.min(r.width, r.height) < 43.5) fail(`${label}: ${tag(e)} is ${Math.round(r.width)}x${Math.round(r.height)}, too small to tap`);
      }
    };
    const apart = (label: string, a: HTMLElement[], b: HTMLElement[]) => {
      for (const x of a) {
        const rx = seen(x);
        if (!rx) continue;
        for (const y of b) {
          const ry = seen(y);
          if (ry && x !== y && !x.contains(y) && !y.contains(x) && hit(rx, ry)) fail(`${label}: ${tag(x)} runs into ${tag(y)}`);
        }
      }
    };
    const hud = () => ({ map: q('.drive-minimap'), menu: q('#menu-btn'), col: q('.drive-side .btn'), pedals: q('.drive-pedal, .drive-horn'), stick: q('.drive-joy .joy-base'), pills: q('.drive-top > *') });

    scenes.step(3);
    // portrait: the rotate card
    const card = document.querySelector<HTMLElement>('.v3-rotate');
    const wantCard = W <= 500 && H > W;
    const cardUp = !!card && getComputedStyle(card).display !== 'none';
    if (cardUp !== wantCard) fail(`rotate card is ${cardUp ? 'up' : 'missing'} but should be ${wantCard ? 'up' : 'hidden'} at ${W}x${H}`);
    notes.push(`rotate ${cardUp ? 'up' : 'off'}`);
    if (cardUp) {
      // the card covers the island: nothing else is on show, so there is nothing more to measure
      const r = card!.getBoundingClientRect();
      if (r.width < W - 1 || r.height < H - 1) fail(`rotate card does not cover the screen (${Math.round(r.width)}x${Math.round(r.height)})`);
      keys.forEach((k, i) => (saved[i] ? root.style.setProperty(k, saved[i]) : root.style.removeProperty(k)));
      d.controls.showTouch(prevShow);
      return { name: 'phoneLayout', pass: problems.length === 0, detail: `${W}x${H}: ${notes.join(', ')}${problems.length ? ' | ' + problems.join('; ') : ''}` };
    }

    // the permanent HUD (+ a job pill)
    d.top.job.show('🛍️', 'Drop Mia at the Mall', 'dropoff', 0.4);   // (measured right away: a frame would let the job manager hide it again)
    {
      const h = hud();
      const all = [...h.map, ...h.menu, ...h.col, ...h.pedals, ...h.stick, ...h.pills];
      inside('hud', all);
      taps('hud', [...h.col, ...h.menu]);
      apart('hud', h.pills, [...h.map, ...h.menu, ...h.col, ...h.pedals, ...h.stick]);
      apart('hud', h.map, [...h.col, ...h.menu]);
      apart('hud', h.menu, [...h.stick]);
      apart('hud', h.col, [...h.pedals, ...h.stick]);
      notes.push(`pills ${h.pills.length}`);
    }

    // prompt bubbles: Drive (ride prompt) and Zip!
    const zip = document.querySelector<HTMLElement>('.v3-zip-prompt');
    for (const [name, el] of [['drive', document.querySelector<HTMLElement>('.drive-prompt:not(.v3-zip-prompt)')], ['zip', zip]] as const) {
      if (!el) continue;
      const hid = el.classList.contains('hidden');
      if (name === 'drive') d.prompt.show('🚗', 'Drive', () => undefined);
      else el.classList.remove('hidden');
      scenes.step(2);
      const h = hud();
      inside(name, [el]);
      taps(name, [el]);
      apart(name, [el], [...h.map, ...h.menu, ...h.col, ...h.pedals, ...h.stick, ...h.pills]);
      if (name === 'drive') d.prompt.hide();
      else if (hid) el.classList.add('hidden');
    }
    d.top.job.hide();

    // the place card: the longest place name, with the animation parked on its last frame
    const poiRoot = document.querySelector<HTMLElement>('.v3-poi');
    if (poiRoot) {
      const nameEl = poiRoot.querySelector<HTMLElement>('.v3-poi-name')!, subEl = poiRoot.querySelector<HTMLElement>('.v3-poi-sub')!;
      const was = [nameEl.textContent, subEl.textContent, poiRoot.className];
      const longest = ((d.mv.poi.pois as { name: string }[]) ?? []).reduce((a, p) => (p.name.length > a.length ? p.name : a), 'SPARKLE SQUARE');
      nameEl.textContent = longest.toUpperCase();
      subEl.textContent = 'NOW ENTERING';
      poiRoot.classList.add('show');
      poiRoot.style.animation = 'none';
      poiRoot.style.opacity = '1';
      d.top.job.show('🛍️', 'Drop Mia at the Mall', 'dropoff', 0.4);
      const inner = poiRoot.querySelector<HTMLElement>('.v3-poi-inner')!;
      const r = inner.getBoundingClientRect();
      const h = hud();
      if (r.height > H * 0.3) fail(`place card is ${Math.round(r.height)} px tall (more than 30% of the screen)`);
      if (r.width > W - S.l - S.r + 1) fail(`place card is ${Math.round(r.width)} px wide, wider than the safe area`);
      apart('poi', [inner], phone ? [...h.map, ...h.menu, ...h.pills] : [...h.menu, ...h.pills]);   // (it fades after 2.5 s, so it may pass over the button column or, on an iPad, the minimap)
      notes.push(`poi ${Math.round(r.width)}x${Math.round(r.height)}`);
      d.top.job.hide();
      poiRoot.style.animation = '';
      poiRoot.style.opacity = '';
      nameEl.textContent = was[0];
      subEl.textContent = was[1];
      poiRoot.className = was[2] as string;
    }

    // the build bar and its panels
    d.build3.toggle(true);
    scenes.step(3);
    {
      const place = document.querySelector<HTMLElement>('.b3-place');
      const placeWas = place?.style.display ?? '';
      if (place) place.style.display = 'flex';   // (only shows on touch devices; show it so it is measured too)
      const stage = (label: string) => {
        scenes.step(2);
        const h = hud();
        const dock = q('.b3-dock .b3-bar, .b3-dock .b3-panel.show');
        const btns = q('.b3-bar .b3-btn, .b3-panel.show .b3-btn, .b3-panel.show .item, .b3-panel.show .sw, .b3-panel.show .card, .b3-panel.show .cell');
        inside(label, [...dock, ...btns, ...q('.b3-place'), ...q('.b3-edit.show')]);
        taps(label, [...btns, ...q('.b3-place')]);
        apart(label, [...dock, ...q('.b3-edit.show')], [...h.map, ...h.menu, ...h.pills, ...h.pedals, ...h.stick, ...h.col, ...q('.b3-place')]);
        apart(label, q('.b3-place'), [...h.pedals, ...h.col, ...h.map, ...h.stick]);
        const all = [...dock, ...q('.b3-edit.show')];
        const hh = Math.max(...all.map((e) => e.getBoundingClientRect().bottom)) - Math.min(...all.map((e) => e.getBoundingClientRect().top));
        notes.push(`${label} ${Math.round((hh / H) * 100)}%`);
        if (hh > H * 0.62) fail(`${label}: the build UI covers ${Math.round((hh / H) * 100)}% of the screen height`);
      };
      stage('bar');
      d.build3.toggleStarters();
      stage('starters');
      d.build3.setTool('decor');
      stage('decor');
      d.build3.setTool('build');
      d.build3.openEdit({ id: 'phone-test', kind: 'wall', mat: 'wood', ix: 0, iy: 0, iz: 0, dir: 0, ownerId: 'x' });
      stage('edit');
      d.build3.closePanels();
      if (place) place.style.display = placeWas;
    }
    d.build3.toggle(false);

    // the emote wheel
    d.emote3.show();
    scenes.step(3);
    {
      const slots = q('.em3-slot'), core = q('.em3-core');
      inside('wheel', [...slots, ...core]);
      taps('wheel', [...slots, ...core]);
      apart('wheel', slots, [...slots, ...core]);
      notes.push(`wheel ${slots.length}`);
    }
    d.emote3.close();

    // the party-bus overlay
    d.mv.startBus();
    scenes.step(3);
    {
      const parts = q('.v3-bus-title, .v3-bus .v3-jump, .v3-bus .v3-skip, .v3-bus .v3-honk');
      inside('bus', parts);
      taps('bus', parts.filter((e) => !e.classList.contains('v3-bus-title')));
      apart('bus', parts, parts);
      notes.push(`bus ${parts.length}`);
    }
    d.mv.cancel();
    d.foot.reset(SPAWN.x, SPAWN.z + 3, SPAWN.heading);
    scenes.step(5);

    keys.forEach((k, i) => (saved[i] ? root.style.setProperty(k, saved[i]) : root.style.removeProperty(k)));
    d.controls.showTouch(prevShow);
    return { name: 'phoneLayout', pass: problems.length === 0, detail: `${W}x${H}: ${notes.join(', ')}${problems.length ? ' | ' + problems.join('; ') : ''}` };
  },

  /**
   * v3 phone (lobby): run at the CURRENT window size (852x393, 844x390, 667x375, 932x430, 393x852, 375x667, 1180x820). With the notch / home-bar insets faked
   * (landscape 59 px left and right + 21 at the bottom; portrait 59 at the top + 34 at the bottom) it checks, for 2, 4 and 6 players, both unpicked and with the
   * first player picked, that: the name plates, the title, New player, the back / rename buttons and PLAY / LOCKER / STUDIO stay inside the safe area, are at
   * least 44 px to tap, never overlap each other, and never cover a player's face. (The extra players are throw-away clones, swapped back before anything saves.)
   */
  async lobbyLayout() {
    const { checkLayout } = await import('./layoutcheck');
    await scenes.go('picker');
    await sleep(250);
    const p = cur();
    const W = window.innerWidth, H = window.innerHeight;
    const portrait = H > W;
    const S = W >= 900 && H >= 600 ? { t: 0, r: 0, b: 20, l: 0 } : portrait ? { t: 59, r: 0, b: 34, l: 0 } : { t: 0, r: 59, b: 21, l: 59 }; // (a tablet only has the home bar)
    const root = document.documentElement;
    const keys = ['--safe-t', '--safe-r', '--safe-b', '--safe-l'];
    const saved = keys.map((k) => root.style.getPropertyValue(k));
    keys.forEach((k, i) => root.style.setProperty(k, `${[S.t, S.r, S.b, S.l][i]}px`));
    window.dispatchEvent(new Event('resize'));
    scenes.step(2);
    const real = store.data.profiles;
    const camera: THREE.PerspectiveCamera = p.camera;
    const calm = document.createElement('style'); // CSS pop-in animations would be caught half way (and do not run in a hidden pane at all)
    calm.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.appendChild(calm);
    const problems: string[] = [];
    const notes: string[] = [];
    const faces = () =>
      (p.slots as any[]).map((sl) => {
        const c: THREE.Vector3 = sl.char.headTop().clone();
        c.y -= 0.33;
        camera.updateMatrixWorld(true);
        const dist = camera.position.distanceTo(c);
        const pxPerM = H / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
        const v = c.clone().project(camera);
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, hs = 0.3 * pxPerM;
        return { name: `face:${sl.profile.name}`, x: x - hs, y: y - hs, w: hs * 2, h: hs * 2 };
      });
    const run = (label: string) => {
      const t = p.ui.querySelector('.tc') as HTMLElement | null;
      const probes = faces();
      if (t && getComputedStyle(t).display !== 'none') {
        const r = t.getBoundingClientRect();
        probes.push({ name: 'title', x: r.left, y: r.top, w: r.width, h: r.height });
      }
      const rep = checkLayout(p.ui, { probes });
      notes.push(`${label}: ${rep.groups} blocks, ${rep.taps} taps${rep.tight.length ? `, ${rep.tight.length} under 52px` : ''}`);
      for (const i of rep.issues) problems.length < 16 && problems.push(`${label}: ${i.kind} ${i.a}${i.b ? ' / ' + i.b : ''} (${i.value})`);
    };
    try {
      for (const n of [2, 4, 6]) {
        const fakes: any[] = [];
        for (let i = real.length; i < n; i++) {
          const c = structuredClone(real[i % real.length]);
          c.id = `fake_${i}`;
          c.name = ['Zoe', 'Maya', 'Nia', 'Ava', 'Kai', 'Lola'][i % 6];
          fakes.push(c);
        }
        store.data.profiles = [...real.slice(0, n), ...fakes];
        p.picked = null;
        p.buildUi();
        store.data.profiles = real; // back at once: nothing may save the clones
        p.fit();
        p.camera.position.copy(p.camGoal);
        p.look.copy(p.lookGoal);
        scenes.step(200);
        run(`${n}p`);
        p.pick(0);
        scenes.step(260);
        run(`${n}p picked`);
        p.unpick();
        scenes.step(30);
      }
    } finally {
      calm.remove();
      store.data.profiles = real;
      keys.forEach((k, i) => (saved[i] ? root.style.setProperty(k, saved[i]) : root.style.removeProperty(k)));
      window.dispatchEvent(new Event('resize'));
      p.picked = null;
      p.buildUi();
      p.fit();
    }
    return { name: 'lobbyLayout', pass: problems.length === 0, detail: `${W}x${H}: ${notes.join('; ')}${problems.length ? ' | ' + problems.join('; ') : ''}` };
  },

  /**
   * v3 phone (Studio): run at the CURRENT window size. Faked safe-area insets as in lobbyLayout. For Squishy, Slime and Wax (pick / coat / crack) it checks that the
   * shape / swatch / mix-in panels, the station tabs, Exit, the menu button, the PICK / COAT / CRACK bar and the action buttons stay inside the safe area, are at
   * least 44 px to tap, do not overlap each other, and never cover the toy (nor the wax pot or the jug).
   */
  async studioLayout() {
    const { checkLayout } = await import('./layoutcheck');
    const W = window.innerWidth, H = window.innerHeight;
    const portrait = H > W;
    const S = W >= 900 && H >= 600 ? { t: 0, r: 0, b: 20, l: 0 } : portrait ? { t: 59, r: 0, b: 34, l: 0 } : { t: 0, r: 59, b: 21, l: 59 }; // (a tablet only has the home bar)
    const root = document.documentElement;
    const keys = ['--safe-t', '--safe-r', '--safe-b', '--safe-l'];
    const saved = keys.map((k) => root.style.getPropertyValue(k));
    keys.forEach((k, i) => root.style.setProperty(k, `${[S.t, S.r, S.b, S.l][i]}px`));
    const calm = document.createElement('style');
    calm.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.appendChild(calm);
    const problems: string[] = [];
    const notes: string[] = [];
    const rectOf = (name: string, obj: THREE.Object3D, cam: THREE.PerspectiveCamera) => {
      obj.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return null;
      cam.updateMatrixWorld(true);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const mx = (x1 - x0) * 0.14, my = (y1 - y0) * 0.14; // the toy's core, not its soft edge
      return { name: name, x: x0 + mx, y: y0 + my, w: x1 - x0 - 2 * mx, h: y1 - y0 - 2 * my };
    };
    const check = (label: string) => {
      const w = cur();
      const st = w.active;
      const probes: { name: string; x: number; y: number; w: number; h: number }[] = [];
      const add = (nm: string, o: THREE.Object3D | undefined) => {
        if (!o || !o.visible) return;
        const r = rectOf(nm, o, w.camera);
        if (r) probes.push(r);
      };
      add('toy', st.body?.root ?? st.blob ?? st.holder);
      add('pot', st.pot);
      add('jug', st.jug);
      // the 3D things must be on screen (not cut off by the edge), and clear of the ☰ menu button
      for (const pr of probes) if (pr.x < 0 || pr.y < 0 || pr.x + pr.w > W || pr.y + pr.h > H) problems.length < 16 && problems.push(`${label}: offscreen ${pr.name} (${Math.round(pr.x)},${Math.round(pr.y)} ${Math.round(pr.w)}x${Math.round(pr.h)})`);
      const mb = document.getElementById('menu-btn');
      if (mb && getComputedStyle(mb).display !== 'none') {
        const r = mb.getBoundingClientRect();
        probes.push({ name: 'menu', x: r.left, y: r.top, w: r.width, h: r.height });
      }
      const rep = checkLayout(w.ui, { probes });
      notes.push(`${label}: ${rep.groups} blocks, ${rep.taps} taps${rep.tight.length ? `, ${rep.tight.length} under 52px` : ''}`);
      for (const i of rep.issues) problems.length < 16 && problems.push(`${label}: ${i.kind} ${i.a}${i.b ? ' / ' + i.b : ''} (${i.value})`);
    };
    try {
      for (const id of ['squishy', 'slime', 'wax']) {
        await scenes.go('workshop', { station: id });
        await sleep(260);
        window.dispatchEvent(new Event('resize'));
        scenes.step(240);
        check(id);
        if (id === 'wax') {
          const w: any = cur();
          const st = w.active;
          st.coating.clear();
          const l = st.coating.beginLayer('#ff2e88', 'dip');
          st.coating.dipTo(l, 2);
          l.final = true;
          st.setStep('coat', true);
          scenes.step(200);
          check('wax coat');
          st.setStep('crack', true);
          scenes.step(200);
          check('wax crack');
          st.setStep('pick', true);
          st.coating.clear();
          scenes.step(20);
        }
      }
    } finally {
      calm.remove();
      keys.forEach((k, i) => (saved[i] ? root.style.setProperty(k, saved[i]) : root.style.removeProperty(k)));
      window.dispatchEvent(new Event('resize'));
    }
    return { name: 'studioLayout', pass: problems.length === 0, detail: `${W}x${H}: ${notes.join('; ')}${problems.length ? ' | ' + problems.join('; ') : ''}` };
  },

  /** Draw calls in town (spawn view) within the iPad budget. */
  /** v3 phone (W2): the Locker at the CURRENT window size (faked notch insets): every slot tab has no overlaps, nothing off-screen, taps >= 44 px, room for the player; and the reveal card fits. */
  async lockerLayout() {
    const { lockerLayoutAt } = await import('../ui/layoutcheck');
    const r = await lockerLayoutAt();
    return { name: 'lockerLayout', pass: r.pass, detail: r.detail };
  },

  /** v3 phone (W2): the ☰ menu sheet at the CURRENT window size: 6 cards, no overlap, on screen, close button reachable, taps >= 44 px. */
  async menuLayout() {
    const { menuLayoutAt } = await import('../ui/layoutcheck');
    const r = await menuLayoutAt();
    return { name: 'menuLayout', pass: r.pass, detail: r.detail };
  },

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
