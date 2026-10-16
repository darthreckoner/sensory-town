// The sky of the island (v3): a bright blue gradient dome with a warm sun disc,
// big stylized cumulus clouds (white tops, soft blue-grey flat bottoms) drifting
// around the viewer, and a few hazy islands on the horizon.
// Everything follows the viewer so the sky never has parallax.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from '../world/townLayout';
import { tuning } from '../tuning';
import { sunDirection } from '../art/env';
import { PAL } from './palette';

/** Direction TO the sun (the same high warm sun art/env.ts lights every outdoor scene with). */
export const SUN_DIR = sunDirection();

const DOME_R = 520;

function skyTexture(): THREE.CanvasTexture {
  const a = tuning.art;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a.skyTop);
  g.addColorStop(0.22, a.skyTop);
  g.addColorStop(0.38, a.skyMid);
  g.addColorStop(0.47, '#b4dbfa');
  g.addColorStop(0.5, a.skyBottom);
  g.addColorStop(0.53, PAL.fogColor);
  g.addColorStop(1, PAL.fogColor);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // a soft bright halo where the sun is (equirect position of SUN_DIR on a three.js sphere)
  const theta = Math.acos(SUN_DIR.y);
  const phi = Math.atan2(SUN_DIR.z, -SUN_DIR.x);
  const sx = ((phi / (Math.PI * 2) + 1) % 1) * W, sy = (theta / Math.PI) * H;
  for (const [r, al, col] of [[200, 0.3, '255,246,214'], [90, 0.4, '255,250,226'], [34, 0.9, '255,254,240']] as const) {
    const rg = x.createRadialGradient(sx, sy, 0, sx, sy, r);
    rg.addColorStop(0, `rgba(${col},${al})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = rg;
    x.fillRect(sx - r, sy - r, r * 2, r * 2);
    // wrap around the seam
    if (sx - r < 0) x.fillRect(sx - r + W, sy - r, r * 2, r * 2);
    if (sx + r > W) x.fillRect(sx - r - W, sy - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sunSprite(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const rg = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,248,1)');
  rg.addColorStop(0.14, 'rgba(255,250,224,1)');
  rg.addColorStop(0.26, 'rgba(255,236,170,0.55)');
  rg.addColorStop(1, 'rgba(255,225,150,0)');
  x.fillStyle = rg;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  s.scale.set(120, 120, 1);
  s.renderOrder = -5;
  return s;
}

/**
 * Big stylized cumulus: a clump of fat squashed spheres with a flat underside. Vertex colours fake the
 * lighting (white top, a hint of the sun side, soft blue-grey belly), so it stays one unlit draw call.
 */
function cloudMesh(): THREE.Mesh {
  const a = tuning.art;
  const rng = seeded(909);
  const geos: THREE.BufferGeometry[] = [];
  const top = new THREE.Color(a.cloudTop), bottom = new THREE.Color(a.cloudBottom), c = new THREE.Color();
  const count = a.cloudCount;
  const [alt0, alt1] = a.cloudAlt;
  const sunH = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng() * 0.35;
    const dist = 230 + rng() * 210;
    const alt = alt0 + rng() * (alt1 - alt0);
    const parts = 6 + ((rng() * 4) | 0);
    const span = 70 + rng() * 60;
    const yaw = ang + Math.PI / 2 + (rng() - 0.5) * 0.8;
    const base = alt - 7;
    for (let k = 0; k < parts; k++) {
      const u = k / (parts - 1) - 0.5;                       // -0.5..0.5 along the bank
      const r = (12 + 18 * (1 - Math.abs(u) * 1.6) + rng() * 8) * (0.8 + rng() * 0.3);
      const g = new THREE.SphereGeometry(r, 11, 7);
      g.scale(1.25, 0.78, 1);
      g.translate(u * span, base + r * 0.62 + rng() * 5, (rng() - 0.5) * 14);
      g.rotateY(yaw);
      g.translate(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        // lit from above and from the sun's side; the flat belly stays cool
        const lit = THREE.MathUtils.clamp(0.35 + nor.getY(v) * 0.55 + (nor.getX(v) * sunH.x + nor.getZ(v) * sunH.z) * 0.18, 0, 1);
        const belly = THREE.MathUtils.smoothstep(pos.getY(v), base, base + r * 0.7);
        c.copy(bottom).lerp(top, THREE.MathUtils.clamp(lit * 0.4 + belly * 0.75, 0, 1));
        col.set([c.r, c.g, c.b], v * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      geos.push(g);
    }
  }
  const m = new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
  );
  m.renderOrder = -4;
  m.frustumCulled = false;
  return m;
}

/** A few low hazy islands far out on the horizon (never fogged away: they ARE the haze). */
function distantIslands(): THREE.Mesh {
  const rng = seeded(404);
  const geos: THREE.BufferGeometry[] = [];
  const base = new THREE.Color('#cfe4f7'), top = new THREE.Color('#93b8e0'), c = new THREE.Color();
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * Math.PI * 2 + rng() * 0.3;
    const dist = 560 + rng() * 60;
    const w = 50 + rng() * 80, h = 14 + rng() * 40;
    const g = new THREE.ConeGeometry(w, h, 9, 1);
    g.translate(0, h / 2 - 4, 0);
    g.rotateY(rng() * 3);
    g.translate(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      c.copy(base).lerp(top, THREE.MathUtils.clamp((pos.getY(v) + 4) / h, 0, 1));
      col.set([c.r, c.g, c.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.renderOrder = -6;
  m.frustumCulled = false;
  return m;
}

/**
 * A loose flock of gulls wheeling round the viewer (the whole flock follows the sky, so seabirds are always
 * about, over the bay or over the hills). One draw call: each bird is five vertices, flapped and flown in the vertex shader.
 */
function gulls(): { mesh: THREE.Mesh; uniforms: { uTime: { value: number } } } {
  const N = 22;
  const base = new THREE.BufferGeometry();
  // body (a long thin triangle pair) and two wings; aWing = how far out along the wing (flaps more at the tips)
  const P = [0, 0, 0.9, 0.12, 0, -0.2, -0.12, 0, -0.2, 0, 0, -0.9,
    0, 0, 0.35, 0, 0, -0.45, -1.75, 0, -0.15,
    0, 0, 0.35, 1.75, 0, -0.15, 0, 0, -0.45];
  const W = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0];
  base.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  base.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
  base.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 7, 8, 9]);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('aWing', base.getAttribute('aWing'));
  const rng = seeded(1212);
  const bird = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const dir = rng() < 0.5 ? -1 : 1;
    bird.set([35 + rng() * 120, dir * (0.05 + rng() * 0.06), rng() * 6.28, 16 + rng() * 40], i * 4);
  }
  geo.setAttribute('aBird', new THREE.InstancedBufferAttribute(bird, 4));
  geo.instanceCount = N;
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, fog: false,
    vertexShader: `
      attribute float aWing; attribute vec4 aBird; uniform float uTime; varying float vShade;
      void main() {
        float a = uTime * aBird.y + aBird.z;
        float sgn = aBird.y < 0.0 ? -1.0 : 1.0;
        vec3 c = vec3(cos(a) * aBird.x, aBird.w + sin(uTime * 0.4 + aBird.z * 3.0) * 3.0, sin(a) * aBird.x);
        vec3 f = vec3(-sin(a) * sgn, 0.0, cos(a) * sgn);
        vec3 r = vec3(-f.z, 0.0, f.x);
        float flap = sin(uTime * 6.0 + aBird.z * 5.0);
        vec3 p = position * 1.5;
        p.y += aWing * flap * 0.8 + abs(p.x) * 0.05;
        p.y += p.x * -sgn * 0.12;                                     // a little bank into the turn
        vec3 w = c + r * p.x + vec3(0.0, p.y, 0.0) + f * p.z;
        vShade = 0.86 + 0.14 * flap * aWing;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(w, 1.0);   // (the sky group follows the viewer)
      }`,
    fragmentShader: 'varying float vShade; void main() { gl_FragColor = vec4(vec3(1.0, 1.0, 1.0) * vShade, 1.0); }',
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -3;
  mesh.raycast = () => {}; // pure scenery: the world sweeps and any picking must never hit the flock
  return { mesh, uniforms };
}

export interface Sky {
  group: THREE.Group;
  /** Keep the sky centred on the viewer. */
  follow(x: number, y: number, z: number): void;
  update(dt: number): void;
}

export function buildSky(): Sky {
  const group = new THREE.Group();
  group.name = 'sky';
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  const sun = sunSprite();
  sun.position.copy(SUN_DIR).multiplyScalar(DOME_R * 0.9);
  const clouds = cloudMesh();
  const islands = distantIslands();
  const flock = gulls();
  group.add(dome, sun, islands, clouds, flock.mesh);
  let clock = 0;
  return {
    group,
    follow(x, y, z) {
      group.position.set(x, 0, z);
      void y;
    },
    update(dt) {
      clouds.rotation.y += tuning.drive.cloudSpeed * dt;
      clock += dt;
      flock.uniforms.uTime.value = clock;
    },
  };
}
