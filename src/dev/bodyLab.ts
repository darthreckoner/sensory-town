// DEV ONLY (not part of the production build): multi-view body / face viewer at a fixed 1280x613.
//   /body-lab.html?z=full|upper|head&views=0,0.7,1.57,3.14&pose=idle|walk|run|sit|wave|swim|glide|skydive|slide|<emote id>
//   &n=1&top=0&bottom=1&hair=1&skin=1&save=name   (save → POSTs the PNG to http://localhost:5195/ if a receiver runs)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character } from '../art/character';
import type { Outfit } from '../core/model';
import { tuning } from '../tuning';

const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') ?? 1280), H = +(Q.get('h') ?? 613);
const zoom = Q.get('z') ?? 'full';
const views = (Q.get('views') ?? '0,0.7,1.57,3.14').split(',').map(Number);
const pose = Q.get('pose') ?? 'idle';
const n = +(Q.get('n') ?? 1);
const ZR: Record<string, [number, number]> = { full: [0, 1.95], upper: [0.85, 1.95], head: [1.4, 1.92], legs: [0, 1.0], hands: [0.7, 1.2] };
const yr: [number, number] = Q.has('y0') ? [+Q.get('y0')!, +Q.get('y1')!] : ZR[zoom] ?? ZR.full;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(Q.get('bg') ?? '#aab9d8');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
scene.add(new THREE.HemisphereLight('#fff6fb', '#d9c7ff', 1.0));
const sun = new THREE.DirectionalLight('#fff3e2', 2.4);
sun.position.set(3, 7, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun, sun.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#d6dcea', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const skins = tuning.art.skinTones;
const chars: Character[] = [];
const pivots: THREE.Group[] = [];
const handKinds = Q.has('hands') ? Q.get('hands')!.split(',') : null; // per panel: relax|open|grip|peace|heart
for (let i = 0; i < n; i++) {
  const o: Outfit = {
    skin: skins[(+(Q.get('skin') ?? 1) + i) % skins.length],
    hair: { style: +(Q.get('hair') ?? 1), color: Q.get('hc') ?? '#6e4a33' },
    top: { style: +(Q.get('top') ?? 0), color: Q.get('tc') ?? '#3d6bff' },
    bottom: { style: +(Q.get('bottom') ?? 0), color: Q.get('bc') ?? '#22304f' },
    shoes: { style: +(Q.get('shoes') ?? 0), color: Q.get('sc') ?? '#f6f6f4' },
    accessory: { style: +(Q.get('acc') ?? 0), color: Q.get('ac') ?? '#ff2e88' },
  };
  const c = new Character(o, { seated: pose === 'sit' });
  // the pivot (rotated per view) sits at the look-at point: hx/hz pick a body part (a hand: hx=0.2) to orbit around
  c.group.position.set((i - (n - 1) / 2) * 0.9 - +(Q.get('hx') ?? 0), 0, -+(Q.get('hz') ?? 0));
  const pv = new THREE.Group();
  pv.add(c.group);
  scene.add(pv);
  pivots.push(pv);
  chars.push(c);
}
const speed = pose === 'walk' ? 0.45 : pose === 'run' ? 1 : 0;
let t = 0;
function step(dt: number): void {
  t += dt;
  for (const c of chars) {
    c.setMove(speed, true);
    c.update(dt, t);
  }
}
if (pose === 'wave') chars.forEach((c) => c.wave());
if (pose === 'swim') chars.forEach((c) => c.setSwim(1));
if (pose === 'glide') chars.forEach((c) => c.setGliding(true));
if (pose === 'skydive') chars.forEach((c) => c.setSkydive(true));
if (pose === 'slide') chars.forEach((c) => c.setSlide(true));
if (!['idle', 'walk', 'run', 'sit', 'wave', 'swim', 'glide', 'skydive', 'slide'].includes(pose)) chars.forEach((c) => c.playEmote(pose));
const warm = +(Q.get('warm') ?? 1.4);
for (let i = 0; i < warm * 60; i++) step(1 / 60);

const camera = new THREE.PerspectiveCamera(Q.has('fov') ? +Q.get('fov')! : 24, 1, 0.1, 100);
const pw = W / views.length;
const cy = (yr[0] + yr[1]) / 2;
const hh = yr[1] - yr[0] + 0.1;
const tanV = Math.tan((camera.fov * Math.PI) / 360);
camera.aspect = pw / H;
const dist = Math.max(hh / 2 / tanV, (n * (Q.has('wm') ? +Q.get('wm')! : zoom === 'head' ? 0.34 : zoom === 'upper' ? 0.6 : 0.8) + 0.05) / 2 / (tanV * camera.aspect)) + 0.2;
camera.position.set(0, cy, dist);
camera.lookAt(0, cy, 0);
camera.updateProjectionMatrix();
sun.target.position.set(0, 0.8, 0);
renderer.setScissorTest(true);
renderer.autoClear = false;
function draw(): void {
  renderer.setViewport(0, 0, W, H);
  renderer.setScissor(0, 0, W, H);
  renderer.clear();
  views.forEach((ry, k) => {
    pivots.forEach((pv) => (pv.rotation.y = ry));
    if (handKinds) chars.forEach((c) => { c.debugHand = handKinds[k % handKinds.length] as never; c.update(0.0001); });
    renderer.setViewport(k * pw, 0, pw, H);
    renderer.setScissor(k * pw, 0, pw, H);
    renderer.render(scene, camera);
  });
}
function frame(): void {
  step(1 / 60);
  draw();
  requestAnimationFrame(frame);
}
draw();
(window as unknown as { __lab: unknown }).__lab = { chars, scene, camera, renderer, step, draw };
const save = Q.get('save');
if (save) {
  // freeze on one drawn frame, then hand the PNG to the dev receiver
  setTimeout(() => {
    draw();
    void fetch('http://localhost:5195/?name=' + encodeURIComponent(save), { method: 'POST', mode: 'no-cors', body: canvas.toDataURL('image/png') });
    (window as unknown as { __saved: boolean }).__saved = true;
  }, 800);
} else requestAnimationFrame(frame);
