// Lit name boards for the v3 places (lodge, meadow, grove, sands...). The canvas is as wide as
// the words need, so a long name is never cropped; the plane keeps the canvas aspect.
import * as THREE from 'three';
import { bigSignTexture } from './kit';

/** A glowing sign plane `height` metres tall. Faces +z (rotate it yourself); optionally double sided. */
export function poiSign(text: string, glow: string, sub: string | undefined, height: number, doubleSided = true): THREE.Mesh {
  const h = sub ? 320 : 256;
  const w = Math.max(1024, Math.ceil(Math.max(text.length * h * (sub ? 0.4 : 0.46), (sub?.length ?? 0) * h * 0.2) + h * 0.5));
  const tex = bigSignTexture(text, '#ffffff', glow, w, h, sub);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry((height * w) / h, height),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide }),
  );
  return m;
}
