// DEV ONLY (not part of the production build): close-ups of the seated driver / the standing rider in every ride.
//   /seat-lab.html?kind=sports&views=-90,-35,35,180&dist=2.6&dy=0.45&h=1.2&save=name
// views = camera yaw in degrees around the driver (0 = from the front of the ride, +90 = its left side), dist/dy/h = camera
// distance, look-at height above the seat and camera height above the seat; roof=0 hides nothing (the roof is part of the mesh).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Ride, RIDE_KINDS, DEFAULT_STYLE, type RideKind } from '../drive/rides';
import { Character } from '../art/character';
import { makeProfile } from '../core/model';

const Q = new URLSearchParams(location.search);
const kind = (Q.get('kind') ?? 'sports') as RideKind;
if (!RIDE_KINDS.includes(kind)) throw new Error('unknown kind ' + kind);
const views = (Q.get('views') ?? '-90,-35,35,180').split(',').map((d) => (+d * Math.PI) / 180);
const dist = +(Q.get('dist') ?? 2.6), dy = +(Q.get('dy') ?? 0.45), camH = +(Q.get('h') ?? 0.9);
const W = +(Q.get('w') ?? 1280), H = +(Q.get('hh') ?? 613);

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc4f0');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#fff6fb', '#a8c98a', 1.0));
const sun = new THREE.DirectionalLight('#fff3e2', 2.6);
sun.position.set(6, 12, 8);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: kind === 'boat' ? '#2a8aa8' : '#8fbf6a', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const prof = makeProfile('Lab', 0);
const ride = new Ride(kind, Q.get('color') ?? undefined);
ride.setStyle({ ...DEFAULT_STYLE, finish: 'gloss' });
scene.add(ride.group);
const char = new Character(prof.outfit, { seated: !!ride.spec.driver, shadows: false });
ride.mountRider(char);
if (!ride.spec.driver) char.setMove(0, true);
ride.setPose(0, kind === 'hoverboard' ? 0.42 : kind === 'boat' ? 0.1 : 0, 0, 0);
const STILL = { speed: 0, speed01: 0, steer: Q.has('steer') ? +Q.get('steer')! : 0, accel: 0, lateral: 0, braking: false, boost: 0, airborne: false, slip: 0 };
for (let i = 0; i < 90; i++) {
  ride.update(1 / 60, i / 60, STILL);
  char.update(1 / 60, i / 60);
}

// look-at: the driver's hips (seated) or the rider's hips (standing), in world space
const sp = ride.spec;
const seat = sp.driver ? new THREE.Vector3(sp.driver.x, sp.driver.y, sp.driver.z) : new THREE.Vector3(sp.stand!.x, sp.stand!.y + 0.9, sp.stand!.z);
const tgt = ride.group.localToWorld(seat.clone().add(new THREE.Vector3(0, dy, 0)));
// section cuts so the inside shows: cut = keep x >= driver x - cut (removes the near door wall), top = keep y <= driver y + top (removes the roof)
const planes: THREE.Plane[] = [];
if (Q.has('cut')) planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -(tgt.x - +Q.get('cut')!)));
if (Q.has('top')) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), tgt.y - dy + +Q.get('top')!));
renderer.clippingPlanes = planes;
const cam = new THREE.PerspectiveCamera(Q.has('fov') ? +Q.get('fov')! : 30, 1, 0.05, 200);
const pw = W / views.length;
cam.aspect = pw / H;
cam.updateProjectionMatrix();
renderer.setScissorTest(true);
renderer.autoClear = false;
function draw(): void {
  renderer.setViewport(0, 0, W, H);
  renderer.setScissor(0, 0, W, H);
  renderer.clear();
  views.forEach((a, k) => {
    // ride faces -z: yaw 0 = camera in front of it (at -z), +90 = on its +x side
    cam.position.set(tgt.x + Math.sin(a) * dist, tgt.y - dy + camH, tgt.z - Math.cos(a) * dist);
    cam.lookAt(tgt);
    renderer.setViewport(k * pw, 0, pw, H);
    renderer.setScissor(k * pw, 0, pw, H);
    renderer.render(scene, cam);
  });
}
function measure(): Record<string, unknown> {
  // every ride mesh double-sided so a ray from inside hits the roof / dash from below
  const meshes: THREE.Mesh[] = [];
  ride.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !char.group.getObjectById(m.id)) {
      meshes.push(m);
      const mat = m.material as THREE.Material;
      if (mat) mat.side = THREE.DoubleSide;
    }
  });
  scene.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const hit = (o: THREE.Vector3, d: THREE.Vector3): number | null => {
    rc.set(o, d.clone().normalize());
    rc.far = 3;
    const h = rc.intersectObjects(meshes, false);
    return h.length ? +h[0].distance.toFixed(3) : null;
  };
  // skinned vertices of the driver, in world space
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  char.group.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.visible || !/skin/.test(sm.name)) return;
    sm.skeleton.update();
    const pa = sm.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      sm.applyBoneTransform(i, v);
      pts.push(v.clone().applyMatrix4(sm.matrixWorld));
    }
  });
  let footMin = 9;
  char.group.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.visible) return;
    sm.skeleton.update();
    const pa = sm.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      sm.applyBoneTransform(i, v);
      footMin = Math.min(footMin, v.applyMatrix4(sm.matrixWorld).y);
    }
  });
  const top = pts.reduce((a, b) => (b.y > a.y ? b : a));
  const front = pts.filter((q) => q.y < tgt.y - dy + 0.5).reduce((a, b) => (b.z < a.z ? b : a)); // furthest forward (-z) below the chest
  const hips = char.group.localToWorld(new THREE.Vector3(0, 0.9, 0));
  const f = (n: number): number => +n.toFixed(3);
  const wheelHands = pts.filter((q) => q.y > tgt.y - dy + 0.3 && q.z < tgt.z - 0.25);
  const out: Record<string, unknown> = {
    kind,
    seatPoint: [f(seat.x), f(seat.y), f(seat.z)],
    footMinY: f(footMin),
    headTopWorld: [f(top.x), f(top.y), f(top.z)],
    roofAboveHead: hit(new THREE.Vector3(top.x, top.y, top.z), new THREE.Vector3(0, 1, 0)),
    hairTopAboveRoofCheck: 'ray from the head top upward: distance to the first ride surface (null = open / > 3 m)',
    forwardMostBelowChest: [f(front.x), f(front.y), f(front.z)],
    dashAheadOfKnee: hit(front.clone(), new THREE.Vector3(0, 0, -1)),
    dashAheadOfKneeUp: hit(front.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(0, 0, -1)),
    seatBelowHips: hit(hips, new THREE.Vector3(0, -1, 0)),
    handsForwardMostZ: wheelHands.length ? f(Math.min(...wheelHands.map((q) => q.z))) : null,
    handsX: wheelHands.length ? [f(Math.min(...wheelHands.map((q) => q.x))), f(Math.max(...wheelHands.map((q) => q.x)))] : null,
    handsY: wheelHands.length ? [f(Math.min(...wheelHands.map((q) => q.y))), f(Math.max(...wheelHands.map((q) => q.y)))] : null,
  };
  return out;
}
draw();
(window as unknown as { __seat: unknown }).__seat = { ride, char, scene, draw, THREE, measure };
const save = Q.get('save');
if (save) {
  setTimeout(() => {
    draw();
    void fetch('http://localhost:5195/?name=' + encodeURIComponent(save), { method: 'POST', mode: 'no-cors', body: canvas.toDataURL('image/png') });
    (window as unknown as { __saved: boolean }).__saved = true;
  }, 600);
}
