// DEV ONLY (not part of the production build): look at the six rides in real WebGL.
//   /ride-lab.html?kind=sports&view=front34&finish=gloss&color=%23ff2e88&rider=1
// kind: sports|pickup|golfcart|hoverboard|icecream|boat|all (a lineup)   view: front|front34|side|rear34|rear|top|chase
// finish: gloss|matte|pearl|chrome|glitter   rider=0 hides the driver   spin=1 turns it round   w/h: canvas size
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Ride, RIDE_KINDS, DEFAULT_STYLE, type RideKind, type RideFinish } from '../drive/rides';
import { rideTune } from '../drive/physics';
import { Character } from '../art/character';
import { makeProfile } from '../core/model';

const Q = new URLSearchParams(location.search);
const kindArg = Q.get('kind') ?? 'all';
const view = Q.get('view') ?? 'front34';
const finish = (Q.get('finish') ?? 'gloss') as RideFinish;
const colorArg = Q.get('color');
const rider = Q.get('rider') !== '0';
const spin = Q.get('spin') === '1';
const kinds: RideKind[] = kindArg === 'all' ? RIDE_KINDS : [kindArg as RideKind];

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc4f0');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.0;
scene.add(new THREE.HemisphereLight('#fff6fb', '#a8c98a', 1.0));
const sun = new THREE.DirectionalLight('#fff3e2', 2.6);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 10, bottom: -10, near: 1, far: 50 });
scene.add(sun, sun.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: kindArg === 'boat' ? '#2a8aa8' : '#8fbf6a', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const prof = makeProfile('Lab', 0);
const rides: { ride: Ride; kind: RideKind; char: Character | null }[] = [];
const spacing = 8;
kinds.forEach((kind, i) => {
  const ride = new Ride(kind, colorArg ?? undefined);
  ride.setStyle({ ...DEFAULT_STYLE, finish });
  ride.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  scene.add(ride.group);
  let char: Character | null = null;
  if (rider) {
    char = new Character(prof.outfit, { seated: !!ride.spec.driver, shadows: false });
    ride.mountRider(char);
    if (!ride.spec.driver) char.setMove(0, true);
  }
  const x = (i - (kinds.length - 1) / 2) * spacing;
  ride.setPose(x, kind === 'hoverboard' ? 0.42 : kind === 'boat' ? 0.1 : 0, 0, 0);
  rides.push({ ride, kind, char });
});
if (kindArg === 'boat') floor.position.y = -0.3;

const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
function frameCamera(t: number): void {
  const n = kinds.length;
  const r0 = rides[0];
  const sp = r0.ride.spec;
  const x0 = r0.ride.group.position.x;
  const ang = spin ? t * 0.5 : 0;
  if (view === 'chase' && n === 1) {
    const d = rideTune(kinds[0]);
    cam.fov = d.cameraFov;
    cam.position.set(x0, d.cameraHeight + (kinds[0] === 'hoverboard' ? 0.42 : 0), d.cameraFollowDistance);
    cam.lookAt(x0, d.cameraLookHeight + sp.height * 0.12, -d.cameraLookAhead);
  } else {
    cam.fov = 36;
    const L = n === 1 ? sp.length : (n - 1) * spacing + 8;
    const dist = n === 1 ? L * 1.3 + 1.6 : L * 0.62;
    const h = n === 1 ? sp.height * 0.55 + 0.5 : 3.2;
    const tgt = new THREE.Vector3(x0 + (n === 1 ? 0 : ((n - 1) * spacing) / 2), n === 1 ? sp.height * 0.4 : 1, 0);
    const a = view === 'side' ? Math.PI / 2 : view === 'rear' ? Math.PI : view === 'rear34' ? Math.PI * 0.8 : view === 'front' ? 0 : view === 'top' ? 0 : -0.62;
    const aa = a + ang;
    if (view === 'top') cam.position.set(tgt.x, dist * 0.9, 0.001);
    else cam.position.set(tgt.x + Math.sin(aa) * dist * (n === 1 ? 1 : 0.9), h, -Math.cos(aa) * dist * (n === 1 ? 1 : 0.9));
    cam.lookAt(tgt);
  }
}

function resize(): void {
  const w = +(Q.get('w') ?? window.innerWidth), h = +(Q.get('h') ?? window.innerHeight);
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

const hud = document.getElementById('hud')!;
const STILL = { speed: 0, speed01: 0, steer: 0, accel: 0, lateral: 0, braking: false, boost: 0, airborne: false, slip: 0 };
const clock = new THREE.Clock();
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  for (const r of rides) {
    r.ride.update(dt, t, STILL);
    r.char?.update(dt, t);
  }
  frameCamera(t);
  renderer.render(scene, cam);
  const info = renderer.info.render;
  hud.textContent = `${kindArg} · ${view} · ${finish}\ncalls ${info.calls} · tris ${info.triangles}`;
  requestAnimationFrame(frame);
}
frame();
