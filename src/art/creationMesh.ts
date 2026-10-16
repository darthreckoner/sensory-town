// Small display models of workshop creations (shelves, houses, menus).
import * as THREE from 'three';
import type { Creation } from '../core/model';
import { toyMat, mesh } from './materials';
import { makeShapeGeometry, faceMaterial } from './shapes';

/**
 * A creation as a small model, about `size` world units tall, resting on y = 0.
 * Cheap enough to show dozens (low-detail geometry, cached per shape).
 */
export function buildCreationMesh(c: Creation, size = 0.5): THREE.Object3D {
  const g = new THREE.Group();
  if (c.kind === 'slime') {
    const blob = mesh(new THREE.SphereGeometry(0.5, 28, 18), slimeMat(c.color, (c.glitter ?? 0) > 0 || (c.addins?.length ?? 0) > 0));
    blob.scale.set(1.15, 0.5, 1.15);
    blob.position.y = 0.24;
    g.add(blob);
    // add-ins ride on the dome surface
    const onDome = (o: THREE.Object3D) => {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.42;
      o.position.set(Math.cos(a) * r, 0.24 + 0.24 * Math.sqrt(Math.max(0, 1 - (r / 0.56) ** 2)), Math.sin(a) * r);
      o.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      g.add(o);
    };
    if (c.addins?.includes('sprinkles')) {
      const cols = ['#ff5d8f', '#ffd166', '#5fd3a5', '#7fd8ff', '#ffffff'];
      for (let i = 0; i < 14; i++) onDome(mesh(new THREE.CapsuleGeometry(0.018, 0.06, 3, 6), toyMat(cols[i % cols.length]), false, false));
    }
    if (c.addins?.includes('stars')) {
      for (let i = 0; i < 8; i++) onDome(mesh(new THREE.OctahedronGeometry(0.045), toyMat(i % 2 ? '#ffd166' : '#ffffff'), false, false));
    }
    if (c.addins?.includes('pearls')) {
      for (let i = 0; i < 8; i++) onDome(mesh(new THREE.SphereGeometry(0.035, 10, 8), toyMat('#fff8f0', 'gloss'), false, false));
    }
    if ((c.glitter ?? 0) > 0) {
      for (let i = 0; i < 18; i++) onDome(mesh(new THREE.SphereGeometry(0.012, 6, 4), toyMat('#ffffff', 'emissive'), false, false));
    }
    // a little jar for slime
    const jar = mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.32, 32, 1, true), toyMat('#ffffff', 'glass'), false, false);
    jar.position.y = 0.16;
    g.add(jar);
  } else {
    const shape = c.shape ?? 'bun';
    const body = mesh(makeShapeGeometry(shape, 12), faceMaterial(c.color, shape), true, false);
    g.add(body);
    if (c.kind === 'wax' && c.layers && c.layers.length) {
      const outer = c.layers[c.layers.length - 1];
      const shell = mesh(makeShapeGeometry(shape, 12, 0.06 * Math.min(c.layers.length, 4)), new THREE.MeshPhysicalMaterial({ color: outer, roughness: 0.55, clearcoat: 0.3 }), true, false);
      g.add(shell);
      // drippy rim using the second-to-last layer for a hint of layering
      if (c.layers.length > 1) {
        const ring = mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 32), toyMat(c.layers[c.layers.length - 2], 'satin'), false, false);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.35;
        ring.scale.setScalar(1.02);
        g.add(ring);
      }
    }
    // shape geometry is ~2 units wide centered at origin; normalize to sit on y=0
    const box = new THREE.Box3().setFromObject(g);
    g.children.forEach((ch) => (ch.position.y -= box.min.y));
  }
  const box = new THREE.Box3().setFromObject(g);
  const h = Math.max(0.001, box.max.y - box.min.y, (box.max.x - box.min.x) * 0.7);
  const wrap = new THREE.Group();
  wrap.add(g);
  g.scale.setScalar(size / h);
  wrap.userData.creationId = c.id;
  return wrap;
}

function slimeMat(color: string, glitter: boolean): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: glitter ? 0.6 : 0.15,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffffff'),
  });
}
