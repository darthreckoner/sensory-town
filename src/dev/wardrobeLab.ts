// DEV ONLY (not part of the production build): a lineup viewer for wardrobe parts.
//   /wardrobe-lab.html?slot=top&from=10&n=8&view=front&zoom=upper&col=pal
// slot: hair|top|bottom|shoes|accessory   view: front|side|back|q|walk|run|sit|jump|pose
// zoom: full|upper|head|legs|feet   col: pal | #hex,#hex   rows: lineup rows   skin: 0..5
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character, OUTFIT_CATALOG, type CatalogSlot } from '../art/character';
import { WARDROBE_PRESETS, suggestedColor, suitOutfit } from '../art/wardrobeCatalog';
import { getTop } from '../art/characterParts';
import { getHair } from '../art/characterHair';
import type { Outfit } from '../core/model';
import { tuning } from '../tuning';

const Q = new URLSearchParams(location.search);
const isSuit = Q.get('slot') === 'suit';
const slot = (isSuit ? 'top' : Q.get('slot') ?? 'top') as CatalogSlot;
const from = +(Q.get('from') ?? 0);
const catLen = isSuit ? WARDROBE_PRESETS.length : OUTFIT_CATALOG[slot].length;
const n = Math.min(+(Q.get('n') ?? 8), Math.max(1, catLen - from));
const view = Q.get('view') ?? 'front';
const zoom = Q.get('zoom') ?? 'full';
const rows = +(Q.get('rows') ?? 1);
const pal = tuning.art.palette;
const colArg = Q.get('col') ?? 'pal';
const skinIdx = +(Q.get('skin') ?? 1);

const base: Outfit = {
  skin: tuning.art.skinTones[skinIdx % 6],
  hair: { style: +(Q.get('hair') ?? 1), color: Q.get('hc') ?? '#6e4a33' },
  top: { style: +(Q.get('top') ?? 0), color: Q.get('tc') ?? '#3d6bff' },
  bottom: { style: +(Q.get('bottom') ?? 0), color: Q.get('bc') ?? '#22304f' },
  shoes: { style: +(Q.get('shoes') ?? 0), color: Q.get('sc') ?? '#f6f6f4' },
  accessory: { style: +(Q.get('acc') ?? 0), color: Q.get('ac') ?? '#ff2e88' },
};

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#aab9d8');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
scene.add(new THREE.HemisphereLight('#fff6fb', '#d9c7ff', 1.0));
const sun = new THREE.DirectionalLight('#fff3e2', 2.4);
sun.position.set(3, 7, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun, sun.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#d6dcea', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const ry = Q.has('ry') ? +Q.get('ry')! : view === 'side' ? Math.PI / 2 : view === 'back' ? Math.PI : view === 'q' ? 0.7 : 0;
const ZOOMS: Record<string, { sp: number; yr: [number, number] }> = {
  full: { sp: 0.95, yr: [0, 1.95] }, upper: { sp: 0.85, yr: [0.75, 1.95] }, torso: { sp: 0.66, yr: [0.82, 1.72] }, hips: { sp: 0.7, yr: [0.3, 1.12] },
  head: { sp: 0.5, yr: [1.38, 1.98] }, legs: { sp: 0.7, yr: [0, 1.05] }, feet: { sp: 0.55, yr: [0, 0.45] }, wide: { sp: 0.9, yr: [0, 1.95] },
};
const Z = ZOOMS[zoom] ?? ZOOMS.full;
const spacing = Z.sp;
const yr: [number, number] = Q.has('y0') ? [+Q.get('y0')!, +Q.get('y1')!] : [...Z.yr];
if (view === 'sit') { yr[0] = Math.min(yr[0], 0); }
const cols = Math.ceil(n / rows);
const chars: Character[] = [];
const labels: { el: HTMLElement; pos: THREE.Vector3; row: number }[] = [];
const seated = view === 'sit';
for (let i = 0; i < n; i++) {
  let o = structuredClone(base);
  const st = from + i;
  if (isSuit) o = suitOutfit(WARDROBE_PRESETS[st].id, base);
  else o[slot].style = st;
  const colors = colArg === 'pal' || colArg === 'sugg' ? undefined : colArg.split(',');
  if (!isSuit) o[slot].color = colArg === 'sugg' ? suggestedColor(slot, st) : colors ? colors[i % colors.length] : pal[(i * 7 + 3) % pal.length];
  if (!isSuit && slot === 'hair' && !Q.has('hc')) o.hair.color = pal[[6, 0, 6, 11, 12, 6, 1, 6][i % 8]];
  if (isSuit && !Q.has('keephair')) o.hair = { style: WARDROBE_PRESETS[st].hair?.style ?? base.hair.style, color: WARDROBE_PRESETS[st].hair?.color ?? base.hair.color };
  if (Q.has('hcol')) o.hair.color = Q.get('hcol')!;
  const c = new Character(o, { seated });
  const col = i % cols, row = Math.floor(i / cols);
  c.group.position.set((col - (cols - 1) / 2) * spacing, 0, 0);
  c.group.userData.row = row;
  c.group.rotation.y = ry;
  if (seated) c.group.position.y = 0.0;
  scene.add(c.group);
  chars.push(c);
  const el = document.createElement('div');
  el.className = 'lab-label';
  el.textContent = isSuit ? WARDROBE_PRESETS[st].name : `${st} ${OUTFIT_CATALOG[slot][st]?.name ?? '?'}`;
  document.body.appendChild(el);
  labels.push({ el, pos: new THREE.Vector3((col - (cols - 1) / 2) * spacing, yr[0] - 0.01, 0), row });
}
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
let W = 1, H = 1;
function fit(): void {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  const bandH = H / rows;
  camera.aspect = W / bandH;
  const h = yr[1] - yr[0] + 0.22;
  const w = cols * spacing + 0.2;
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const dist = Math.max(h / 2 / tanV, w / 2 / (tanV * camera.aspect)) + 0.4;
  const cy = (yr[0] + yr[1]) / 2;
  const tilt = Q.has('cam') ? +Q.get('cam')! : 0;
  camera.position.set(Math.sin(tilt) * dist, cy + 0.05, Math.cos(tilt) * dist);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
  sun.target.position.set(0, 0.8, 0);
}
fit();
window.addEventListener('resize', fit);

const speed = view === 'walk' ? 0.45 : view === 'run' ? 1 : 0;
let t = 0;
const warm = +(Q.get('warm') ?? 1.2);
const live = Q.has('live');
let frames = 0;
function step(dt: number): void {
  t += dt;
  chars.forEach((c, i) => {
    if (view === 'jump') c.setMove(0.3, false);
    else c.setMove(speed, true);
    if (Q.has('emote') && frames === 1) c.playEmote(Q.get('emote')!);
    if (view === 'pose' && frames === 1) c.pose(['hips', 'peace', 'cross', 'strut', 'twirl'][i % 5] as 'hips', 4, true);
    c.update(dt, t);
  });
}
function frame(): void {
  if (live || t < warm) step(1 / 60);
  frames++;
  const bandH = H / rows;
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  renderer.setViewport(0, 0, W, H);
  renderer.setScissor(0, 0, W, H);
  renderer.clear();
  for (let r = 0; r < rows; r++) {
    chars.forEach((ch) => (ch.group.visible = ch.group.userData.row === r));
    renderer.setViewport(0, H - (r + 1) * bandH, W, bandH);
    renderer.setScissor(0, H - (r + 1) * bandH, W, bandH);
    renderer.render(scene, camera);
    labels.forEach((l) => {
      if (l.row !== r) return;
      const p = l.pos.clone().project(camera);
      l.el.style.left = `${((p.x + 1) / 2) * W}px`;
      l.el.style.top = `${r * bandH + ((1 - p.y) / 2) * bandH}px`;
    });
  }
  if (frames > 3 && t >= warm) (window as unknown as { __labReady: boolean }).__labReady = true;
  requestAnimationFrame(frame);
}
(window as unknown as { __lab: unknown }).__lab = { chars, scene, camera, renderer, step };
if (Q.has('hairdbg')) {
  for (const st of [0, 1, 10]) {
    const p = getHair(st);
    for (const [nm, g] of [['dark', p.dark], ['base', p.base]] as const) {
      if (!g) continue;
      const pa = g.attributes.position, na = g.attributes.normal;
      let s = 0;
      for (let q = 0; q < pa.count; q++) s += pa.getX(q) * na.getX(q) + pa.getY(q) * na.getY(q) + pa.getZ(q) * na.getZ(q);
      g.computeBoundingBox();
      console.log('HAIRDBG ' + st + ' ' + nm + ' avg(p.n)=' + (s / pa.count).toFixed(4) + ' bb=' + JSON.stringify(g.boundingBox!.min.toArray().map((v) => +v.toFixed(3))) + JSON.stringify(g.boundingBox!.max.toArray().map((v) => +v.toFixed(3))) + ' idx=' + (g.index ? g.index.count : 'none'));
    }
    console.log('HAIRDBG ' + st + ' counts dark=' + (p.dark ? p.dark.attributes.position.count : 'null') + ' base=' + p.base.attributes.position.count);
  }
}
if (Q.has('tris')) {
  // dev: triangles per dressed character (body ~17k; target <= ~35k)
  chars.forEach((c, i) => {
    let tris = 0, bodyTris = 0;
    c.group.traverse((m) => {
      const s = m as THREE.SkinnedMesh;
      if (s.isSkinnedMesh && s.visible && s.geometry.index) { tris += s.geometry.index.count / 3; if (Q.has('bycat')) console.log('TRIS   ' + s.name + ' ' + s.geometry.index.count / 3); }
    });
    console.log('TRIS ' + i + ' ' + tris);
    void bodyTris;
  });
}
if (Q.has('trisall')) {
  const baseO: Outfit = { skin: '#f6c9a8', hair: { style: 1, color: '#6e4a33' }, top: { style: 0, color: '#3d6bff' }, bottom: { style: 1, color: '#22304f' }, shoes: { style: 0, color: '#f6f6f4' }, accessory: { style: 0, color: '#ff2e88' } };
  const count = (o: Outfit): number => {
    const c = new Character(o);
    let t = 0;
    c.group.traverse((m) => { const s = m as THREE.SkinnedMesh; if (s.isSkinnedMesh && s.visible && s.geometry.index) t += s.geometry.index.count / 3; });
    c.dispose();
    return t;
  };
  const b0 = count(baseO);
  console.log('TRIS base ' + b0);
  for (const s of ['hair', 'top', 'bottom', 'shoes', 'accessory'] as CatalogSlot[]) {
    for (let i = 0; i < OUTFIT_CATALOG[s].length; i++) {
      const o = structuredClone(baseO);
      o[s].style = i;
      console.log('TRIS ' + s + ' ' + i + ' ' + OUTFIT_CATALOG[s][i].name + ' ' + (count(o) - b0));
    }
  }
}
if (Q.has('cats')) {
  // dev: material categories (= draw calls) each part adds on top of a plain base outfit
  const baseO: Outfit = { skin: '#f6c9a8', hair: { style: 1, color: '#6e4a33' }, top: { style: 0, color: '#3d6bff' }, bottom: { style: 1, color: '#22304f' }, shoes: { style: 0, color: '#f6f6f4' }, accessory: { style: 0, color: '#ff2e88' } };
  const cats = (o: Outfit): string[] => {
    const c = new Character(o);
    const out: string[] = [];
    c.group.traverse((m) => { if ((m as THREE.SkinnedMesh).isSkinnedMesh && m.visible) out.push(m.name.replace('char-', '')); });
    c.dispose();
    return out.sort();
  };
  console.log('CATS base ' + JSON.stringify(cats(baseO)));
  for (const s of ['hair', 'top', 'bottom', 'shoes', 'accessory'] as CatalogSlot[]) {
    for (let i = 0; i < OUTFIT_CATALOG[s].length; i++) {
      const o = structuredClone(baseO);
      o[s].style = i;
      console.log('CATS ' + s + ' ' + i + ' ' + OUTFIT_CATALOG[s][i].name + ' ' + JSON.stringify(cats(o)));
    }
  }
}
if (Q.has('dbg')) {
  if (Q.has('piece')) {
    const tp = getTop(+Q.get('piece')!, 0);
    for (const k of ['torso', 'upper', 'lower'] as const) {
      for (const pc of tp[k]) {
        pc.geo.computeBoundingBox();
        const b = pc.geo.boundingBox!;
        console.log(`DBG piece ${k} role ${pc.role} y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}`);
      }
    }
  }
  // dev: report stray vertices far above the head (bind pose) and the draw-call count per character
  chars.forEach((c, i) => {
    let calls = 0;
    c.group.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || !m.visible) return;
      calls++;
      const p = m.geometry.attributes.position;
      let hi = 0, top = 0;
      const v = new THREE.Vector3();
      c.group.updateMatrixWorld(true);
      m.skeleton.update();
      for (let k = 0; k < p.count; k++) { m.getVertexPosition(k, v); v.applyMatrix4(m.matrixWorld); if (v.y > 1.9) { hi++; if (hi < 3) console.log(`DBG   v ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)} bone ${m.geometry.attributes.skinIndex.getX(k)}`); } top = Math.max(top, v.y); }
      if (hi) console.log(`DBG char ${i} mesh ${m.name} verts>1.9: ${hi} top ${top.toFixed(2)} of ${p.count}`);
    });
    console.log(`DBG char ${i} drawcalls ${calls}`);
  });
}
if (seated) {
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.82, 0.6), new THREE.MeshStandardMaterial({ color: '#6a6f86', roughness: 0.7 }));
  bench.position.set(0, 0.41, -0.18);
  bench.castShadow = bench.receiveShadow = true;
  scene.add(bench);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.12), new THREE.MeshStandardMaterial({ color: '#555a70', roughness: 0.7 }));
  back.position.set(0, 1.17, -0.36);
  scene.add(back);
}
frame();
