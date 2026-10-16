// DEV ONLY (not part of the production build): a lineup viewer for wardrobe parts.
//   /wardrobe-lab.html?slot=top&from=10&n=8&view=front&zoom=upper&col=pal
// slot: hair|top|bottom|shoes|accessory   view: front|side|back|q|walk|run|sit|jump|pose
// zoom: full|upper|head|legs|feet   col: pal | #hex,#hex   rows: lineup rows   skin: 0..5
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character, OUTFIT_CATALOG, type CatalogSlot } from '../art/character';
import type { Outfit } from '../core/model';
import { tuning } from '../tuning';

const Q = new URLSearchParams(location.search);
const slot = (Q.get('slot') ?? 'top') as CatalogSlot;
const from = +(Q.get('from') ?? 0);
const catLen = OUTFIT_CATALOG[slot].length;
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
  const o = structuredClone(base);
  const st = from + i;
  o[slot].style = st;
  const colors = colArg === 'pal' ? undefined : colArg.split(',');
  o[slot].color = colors ? colors[i % colors.length] : pal[(i * 7 + 3) % pal.length];
  if (slot === 'hair' && !Q.has('hc')) o.hair.color = pal[[6, 0, 6, 11, 12, 6, 1, 6][i % 8]];
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
  el.textContent = `${st} ${OUTFIT_CATALOG[slot][st]?.name ?? '?'}`;
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
