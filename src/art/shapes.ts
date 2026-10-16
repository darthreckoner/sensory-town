// Squishy shapes as radial functions over a sphere. Because every shape is
// "star-shaped" (one radius per direction), the squishy, its wax shell and
// the shell's crack pieces can all share the same sphere topology.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShapeId } from '../core/model';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const EAR_L = new THREE.Vector3(-0.55, 0.8, 0.12).normalize();
const EAR_R = new THREE.Vector3(0.55, 0.8, 0.12).normalize();
const SNOUT = new THREE.Vector3(0, -0.12, 1).normalize();
const BEAR_L = new THREE.Vector3(-0.62, 0.74, 0.0).normalize();
const BEAR_R = new THREE.Vector3(0.62, 0.74, 0.0).normalize();
const HORN_L = new THREE.Vector3(-0.42, 0.88, -0.22).normalize();
const HORN_R = new THREE.Vector3(0.42, 0.88, -0.22).normalize();
const CLOUD_BUMPS = [
  [0, 0.85, 0.2], [-0.62, 0.55, 0.25], [0.62, 0.55, 0.25], [-0.35, 0.7, -0.5], [0.4, 0.65, -0.5], [0, 0.4, 0.85], [-0.85, 0.15, 0], [0.85, 0.15, 0],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

/** Implicit 3D heart (inside < 0), facing +z, point down. */
function heartF(x: number, y: number, z: number): number {
  const X = x / 0.86, Y = (z / 0.86) * 1.45, Z = y / 0.86 + 0.12;
  const a = X * X + 2.25 * Y * Y + Z * Z - 1;
  return a * a * a - X * X * Z * Z * Z - 0.1125 * Y * Y * Z * Z * Z;
}
/** Radius along d where an implicit surface crosses zero (origin inside). */
function implicitRadius(f: (x: number, y: number, z: number) => number, d: THREE.Vector3): number {
  let lo = 0.05, hi = 2.2;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (f(d.x * m, d.y * m, d.z * m) < 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Radius of the shape (unit-ish scale) in direction `d` (normalized). */
export function shapeRadius(shape: ShapeId, d: THREE.Vector3): number {
  const { x, y, z } = d;
  switch (shape) {
    case 'bun': {
      // soft bao bun: wide, flat-ish bottom, domed top
      const b = y < 0 ? 0.62 : 0.8;
      const r = 1 / Math.sqrt((x * x + z * z) / (1.1 * 1.1) + (y * y) / (b * b));
      return r * (1 - 0.04 * Math.pow(Math.max(0, -y), 3));
    }
    case 'cat': {
      const base = 1 / Math.sqrt((x * x + z * z) / (1.05 * 1.05) + (y * y) / (0.9 * 0.9));
      const ear = (e: THREE.Vector3) => Math.pow(Math.max(0, d.dot(e)), 28) * 0.55;
      return base + ear(EAR_L) + ear(EAR_R);
    }
    case 'star': {
      const phi = Math.atan2(y, x);
      const k = 0.5 + 0.5 * Math.cos(5 * (phi - Math.PI / 2));
      const sr = 0.68 + 0.42 * Math.pow(k, 1.6);
      const th = 0.52;
      const rr = (1 - z * z) / (sr * sr) + (z * z) / (th * th);
      return 1 / Math.sqrt(rr);
    }
    case 'peach': {
      let r = 1.0;
      r += 0.14 * Math.pow(Math.max(0, y), 5); // little point on top
      r -= 0.09 * Math.exp(-((x / 0.13) ** 2)) * smooth(-0.3, 0.5, z) * smooth(-0.9, 0.2, y); // cleft
      r *= 1 - 0.06 * Math.max(0, -y);
      return r;
    }
    case 'cube': {
      const p = 5;
      const s = Math.pow(Math.pow(Math.abs(x), p) + Math.pow(Math.abs(y), p) + Math.pow(Math.abs(z), p), 1 / p);
      return 0.88 / s;
    }
    case 'heart':
      return implicitRadius(heartF, d);
    case 'bear': {
      const base = 1 / Math.sqrt((x * x + z * z) / (1.02 * 1.02) + (y * y) / (0.92 * 0.92));
      // round ears: soft domes instead of points
      const ear = (e: THREE.Vector3) => {
        const ang = Math.acos(Math.min(1, d.dot(e)));
        return 0.34 * Math.sqrt(Math.max(0, 1 - (ang / 0.3) ** 2));
      };
      // little snout
      const snout = 0.12 * Math.pow(Math.max(0, d.dot(SNOUT)), 14);
      return base + ear(BEAR_L) + ear(BEAR_R) + snout;
    }
    case 'strawberry': {
      // wide shoulders, pointed tip at the bottom
      let r = 0.95 * (1 - 0.42 * Math.pow(Math.max(0, -y), 1.6));
      r *= 1 + 0.06 * Math.max(0, y) - 0.12 * Math.pow(Math.max(0, y), 4);
      return r;
    }
    case 'cloud': {
      let r = 0.72;
      for (const b of CLOUD_BUMPS) r += 0.22 * Math.pow(Math.max(0, d.dot(b)), 6);
      r *= y < 0 ? 1 - 0.35 * Math.pow(-y, 1.5) : 1;
      return r * 1.08;
    }
    case 'dragon': {
      const base = 1 / Math.sqrt((x * x) / (1.0 * 1.0) + (y * y) / (0.9 * 0.9) + (z * z) / (1.05 * 1.05));
      const horn = (e: THREE.Vector3) => Math.pow(Math.max(0, d.dot(e)), 40) * 0.7;
      // ridge of spikes down the back (behind the head, from top to back)
      let spikes = 0;
      if (z < 0.1 && Math.abs(x) < 0.25) {
        const t = Math.atan2(y, -z); // angle along the back meridian
        spikes = 0.16 * Math.pow(Math.max(0, Math.cos(t * 9)), 8) * Math.exp(-((x / 0.08) ** 2));
      }
      const snout = 0.18 * Math.pow(Math.max(0, d.dot(SNOUT)), 10);
      return base + horn(HORN_L) + horn(HORN_R) + spikes + snout;
    }
  }
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Indexed geometry for a shape. `detail` = icosphere edge subdivisions
 * (verts ≈ 10·(detail+1)²). `offset` pushes the surface outward (unit space),
 * used for wax shell layers. Has a `restDir` attribute (unit direction).
 * Returned geometry is cached — clone() it if you will mutate positions.
 */
export function makeShapeGeometry(shape: ShapeId, detail = 24, offset = 0): THREE.BufferGeometry {
  const key = `${shape}|${detail}|${offset.toFixed(4)}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const dirs = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    dirs[i * 3] = d.x;
    dirs[i * 3 + 1] = d.y;
    dirs[i * 3 + 2] = d.z;
    const r = shapeRadius(shape, d) + offset;
    pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
  }
  g.setAttribute('restDir', new THREE.BufferAttribute(dirs, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/** Lowest y of a shape (unit space) — used to rest it on a table. */
export function shapeBottom(shape: ShapeId): number {
  return -shapeRadius(shape, new THREE.Vector3(0, -1, 0));
}

/**
 * Soft foam material with a kawaii face painted in the shader (eyes with
 * highlights, blush, smile; cats get a "w" mouth). Uses the `restDir`
 * attribute so the face sticks to the surface while it deforms.
 */
export function faceMaterial(color: THREE.ColorRepresentation, shape: ShapeId, opts: { face?: boolean } = {}): THREE.MeshPhysicalMaterial {
  // v2: faces are opt-in (the Coverstar look is plain); strawberries get seeds
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
  });
  const face = opts.face ?? false;
  const seeds = shape === 'strawberry' ? 1 : 0;
  const mouth = shape === 'cat' ? 1 : 0;
  const eyeY = shape === 'bun' ? 0.1 : shape === 'star' ? 0.08 : 0.08;
  const faceScale = shape === 'star' ? 0.85 : shape === 'cube' ? 0.95 : 1.0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFace = { value: face ? 1 : 0 };
    sh.uniforms.uMouth = { value: mouth };
    sh.uniforms.uEyeY = { value: eyeY };
    sh.uniforms.uFaceScale = { value: faceScale };
    sh.uniforms.uSeeds = { value: seeds };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 restDir;\nattribute float aDent;\nvarying vec3 vRestDir;\nvarying float vDent;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestDir = restDir;\nvDent = aDent;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRestDir;
varying float vDent;
float gFaceInk = 0.0;
uniform float uFace; uniform float uMouth; uniform float uEyeY; uniform float uFaceScale; uniform float uSeeds;
float arcMask(vec2 p, vec2 c, float r, float w, float ymax) {
  float d = abs(length(p - c) - r);
  float m = 1.0 - smoothstep(w * 0.6, w, d);
  return m * step(p.y, c.y - ymax);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uSeeds > 0.5) {
  // strawberry seeds: little golden teardrops on a jittered lat/long grid
  vec3 sd = normalize(vRestDir);
  float lat = acos(clamp(sd.y, -1.0, 1.0));
  float lon = atan(sd.z, sd.x);
  vec2 g = vec2(lon * 3.2, lat * 6.5);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5 + 0.18 * vec2(fract(sin(dot(cell, vec2(12.9, 78.2))) * 437.5) - 0.5, fract(sin(dot(cell, vec2(39.3, 11.1))) * 917.3) - 0.5);
  float seed = 1.0 - smoothstep(0.08, 0.13, length(f * vec2(1.0, 0.7)));
  seed *= step(0.35, lat) * step(lat, 2.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.45), seed * 0.9);
}
// squished foam gets deeper + darker in the dent
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.36, 0.28, 0.42), smoothstep(0.0, 0.75, vDent));
{
  vec3 rd = normalize(vRestDir);
  if (uFace > 0.5 && rd.z > 0.25) {
    vec2 uv = (rd.xy / rd.z) / uFaceScale;
    vec3 ink = vec3(0.07, 0.05, 0.1);
    // eyes
    for (int i = 0; i < 2; i++) {
      float sx = i == 0 ? -1.0 : 1.0;
      vec2 c = vec2(sx * 0.25, uEyeY);
      float d = length((uv - c) * vec2(1.0, 0.85));
      float e = 1.0 - smoothstep(0.066, 0.074, d);
      diffuseColor.rgb = mix(diffuseColor.rgb, ink, e);
      gFaceInk = max(gFaceInk, e);
      float hl = 1.0 - smoothstep(0.016, 0.022, length(uv - c - vec2(-0.022, 0.026)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), hl * e);
      // blush
      vec2 bc = vec2(sx * 0.4, uEyeY - 0.13);
      float b = 1.0 - smoothstep(0.03, 0.095, length((uv - bc) * vec2(0.8, 1.2)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.52, 0.62), b * 0.55);
    }
    // mouth
    float m = 0.0;
    if (uMouth > 0.5) {
      m = max(arcMask(uv, vec2(-0.04, uEyeY - 0.06), 0.04, 0.014, 0.0), arcMask(uv, vec2(0.04, uEyeY - 0.06), 0.04, 0.014, 0.0));
    } else {
      m = arcMask(uv, vec2(0.0, uEyeY - 0.04), 0.07, 0.015, 0.035);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, ink, m);
    gFaceInk = max(gFaceInk, m);
  }
}`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.sheenColor *= (1.0 - gFaceInk) * (1.0 - 0.75 * vDent);
material.roughness = mix(material.roughness, 0.25, gFaceInk);`,
      );
  };
  m.customProgramCacheKey = () => `face-${face}-${mouth}-${eyeY}-${faceScale}-${seeds}`;
  return m;
}

/** Extra decorative bits for a shape (peach leaf), attached as children. */
export function shapeExtras(shape: ShapeId): THREE.Object3D | null {
  if (shape === 'strawberry') {
    const g = new THREE.Group();
    const leafMat = new THREE.MeshPhysicalMaterial({ color: '#3fa34d', roughness: 0.45, clearcoat: 0.5 });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.22, 0.93, Math.sin(a) * 0.22);
      leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      leaf.scale.set(1, 1, 0.35);
      g.add(leaf);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8), leafMat);
    stem.position.y = 1.05;
    g.add(stem);
    return g;
  }
  if (shape !== 'peach') return null;
  const g = new THREE.Group();
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.22, 0.12, 0.42, 0);
  leafShape.quadraticCurveTo(0.22, -0.12, 0, 0);
  const leaf = new THREE.Mesh(
    new THREE.ExtrudeGeometry(leafShape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }),
    new THREE.MeshPhysicalMaterial({ color: '#5fd3a5', roughness: 0.4, clearcoat: 0.6 }),
  );
  leaf.position.set(0.02, 1.08, -0.02);
  leaf.rotation.set(0.3, 0.4, 0.35);
  leaf.castShadow = true;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 8), new THREE.MeshStandardMaterial({ color: '#8a5a44', roughness: 0.7 }));
  stem.position.set(0, 1.12, 0);
  g.add(leaf, stem);
  return g;
}
