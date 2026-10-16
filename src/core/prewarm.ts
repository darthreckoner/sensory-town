// ── v3 perf ── Shader pre-warm. The classic iOS hitch is a material's first appearance: its program compiles on the first frame
// it is drawn. At the first town load (behind the scene fade) we compile everything that can show up later:
//   · the whole town scene (hidden districts included: three's compile walks invisible objects too),
//   · dummies of every build fin (wood / brick / steel...), its see-through ghost variants, the toy finishes,
//   · every glider, back bling and contrail,
// and then initialise + compile the other scenes (lobby, Locker, Studio, Build), whose lights are set up in init().
// Programs are cached by the renderer (keyed by material parameters + scene state), so the throw-away dummies are simply
// removed afterwards; their materials are kept alive on purpose (disposing a material would release its program).
import * as THREE from 'three';
import { FINS, NO_SHADOW, finMat, ghostify } from '../build/mats';
import { toyMat, type Finish } from '../art/materials';
import { BACK_BLING_IDS, CONTRAIL_IDS, GLIDER_IDS, makeBackBling, makeContrail, makeGlider } from '../art/gear';
import { Beacon, prebuildJobNpcs } from '../drive/jobs';

const keepAlive: THREE.Material[] = [];

function dummyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

/** Build the throw-away group whose materials we want compiled. */
function warmGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'prewarm';
  const geo = dummyGeometry();
  const add = (mat: THREE.Material, cast = true, fin?: string): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.frustumCulled = false;
    if (fin) m.userData.fin = fin;
    group.add(m);
    keepAlive.push(mat);
    return m;
  };
  // build pieces (every fin) + their see-through preview variants (cyan when it fits, red when it does not)
  for (const f of FINS) add(finMat(f), !NO_SHADOW.has(f));
  for (const f of ['wplank', 'wbrick', 'wsteel', 'wshingle', 'paint', 'glass'] as const)
    for (const ok of [true, false]) {
      const m = add(finMat(f), false, f);
      ghostify(m, ok, '#8fe6ff');
      keepAlive.push(m.material as THREE.Material);
    }
  // the toy finishes (decor, props, gear, ride bits)
  for (const f of ['gloss', 'satin', 'matte', 'fabric', 'metal', 'glass', 'emissive'] as Finish[]) add(toyMat('#ffffff', f));
  // gliders, back blings, contrails
  const gear = (o: THREE.Object3D): void => {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh && !(c as THREE.Points).isPoints && !(c as THREE.Line).isLine) return;
      m.frustumCulled = false;
      const mt = m.material;
      if (Array.isArray(mt)) keepAlive.push(...mt);
      else if (mt) keepAlive.push(mt);
    });
    group.add(o);
  };
  for (const id of GLIDER_IDS) gear(makeGlider(id));
  for (const id of BACK_BLING_IDS) gear(makeBackBling(id));
  for (const id of CONTRAIL_IDS) gear(makeContrail(id).object);
  return group;
}

/** Compile the town scene plus everything that can appear in it later. Resolves when the programs are ready. */
export async function prewarmTownScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<number> {
  const group = warmGroup();
  scene.add(group);
  let count = 0;
  // the job passengers (Characters cost 15-30 ms each to build: see drive/jobs.ts): built now, drawn once below, parked in the pool
  const npcs = prebuildJobNpcs();
  // the job beacons (ring, light column, arrow, emoji): first draw of their materials / buffers / icon texture
  for (const b of [new Beacon('#ff6fa5'), new Beacon('#ffc844', '🏠', 14)]) {
    b.group.traverse((c) => {
      const m = c as THREE.Mesh;
      m.frustumCulled = false;
      const mt = m.material as THREE.Material | undefined;
      if (mt) keepAlive.push(mt);
    });
    group.add(b.group);
  }
  const culled = new Map<THREE.Object3D, boolean>();
  for (const o of npcs) {
    o.traverse((c) => {
      culled.set(c, c.frustumCulled);
      c.frustumCulled = false;
    });
    group.add(o);
  }
  try {
    scene.updateMatrixWorld(true);
    await renderer.compileAsync(scene, camera);
    count = keepAlive.length;
    // compile() builds the material programs only. One real frame also uploads the dummies' / passengers' buffers and compiles the
    // shadow-depth variants (skinned, instanced, alpha-tested casters), which would otherwise hitch the first frame they show up.
    renderer.render(scene, camera);
  } finally {
    scene.remove(group);   // the dummies go; their programs stay in the renderer
    for (const o of npcs) {
      group.remove(o);
      o.traverse((c) => {
        const was = culled.get(c);
        if (was !== undefined) c.frustumCulled = was;
      });
    }
  }
  return count;
}
