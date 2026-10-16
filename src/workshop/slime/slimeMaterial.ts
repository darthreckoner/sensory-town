// The slime's look: wet glossy physical material (clearcoat, soft sheen, a touch
// of iridescence — no `transmission`, it's too slow on iPad) plus a few cheap
// shader tricks:
//   • fake subsurface — color lightens toward the rim (fresnel) and wherever the
//     slime has been stretched thin (per-vertex `aThin`), like light shining through;
//   • glitter — hash-cell flakes keyed to the rest-pose uv, so they ride the
//     deformation (the lattice coarsens where the slime is stretched thin so
//     flakes keep a steady size), each a tiny mirror with a wobbling normal that
//     catches the sun and twinkles with time and surface angle.
import * as THREE from 'three';

export interface SlimeMaterial {
  material: THREE.MeshPhysicalMaterial;
  /** 0..1 glitter amount (1 = a flake in half the lattice cells, 0 = no glitter) */
  glitter: { value: number };
  time: { value: number };
  setColor(c: THREE.ColorRepresentation): void;
}

const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform float uGlitter;
uniform float uGlitterScale;
uniform vec3 uThinColor;
varying float vSThin;
varying vec2 vSUv;
vec2 sHash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// One glitter lattice: a hashed flake per cell, each a tiny mirror whose normal wobbles around N.
// pix = lattice cells per screen pixel (for edge antialiasing).
vec3 sFlakes( vec2 gp, float pix, vec3 N, vec3 V, vec3 L, float dens ) {
  vec2 gc = floor( gp );
  vec2 gf = fract( gp );
  vec2 h1 = sHash22( gc );
  vec2 h2 = sHash22( gc + 17.3 );
  float live = step( h2.x, dens );
  vec2 ctr = 0.25 + 0.5 * h1;
  float rad = 0.2 + 0.18 * h2.y;
  float fl = ( 1.0 - smoothstep( rad - pix * 0.3, rad + pix * 0.7, length( gf - ctr ) ) ) * live;
  float ph = h1.x * 6.2831 + uTime * ( 0.5 + h2.y * 1.6 );
  vec3 fn = normalize( N + 0.9 * vec3( sin( ph ), cos( ph * 1.31 + h1.y * 6.2831 ), sin( ph * 0.73 + h2.x * 6.2831 ) ) );
  float sp = pow( saturate( dot( fn, normalize( L + V ) ) ), 38.0 );
  float tw = 0.5 + 0.5 * sin( uTime * ( 2.0 + h1.y * 5.0 ) + h2.x * 40.0 );
  vec3 fcol = mix( vec3( 1.0 ), 0.5 + 0.5 * cos( 6.2831 * ( h1.x + vec3( 0.0, 0.33, 0.67 ) ) ), 0.4 );
  return fcol * fl * ( 0.25 + 3.2 * sp * ( 0.35 + 0.65 * tw ) );
}
`;

const GLSL_BODY = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 sV = normalize( vViewPosition );
  float sNdv = saturate( dot( normal, sV ) );
  float sRim = pow( 1.0 - sNdv, 2.2 );
  float sTh = vSThin;
  // lighter, glowier where the slime thins or turns away from the eye
  vec3 sGlow = mix( diffuseColor.rgb, uThinColor, 0.7 );
  diffuseColor.rgb = mix( diffuseColor.rgb, sGlow, saturate( sTh * 0.8 + sRim * 0.35 ) );
  totalEmissiveRadiance += sGlow * ( sRim * 0.30 + sTh * 0.20 );

  if ( uGlitter > 0.001 ) {
    #if NUM_DIR_LIGHTS > 0
      vec3 sL = normalize( directionalLights[ 0 ].direction );
    #else
      vec3 sL = normalize( vec3( 0.3, 0.8, 0.5 ) );
    #endif
    // where the slime is stretched thin the rest-pose uv bunches up: coarsen the flake lattice
    // there (cross-faded between two levels) so the glitter keeps a steady size on screen
    vec2 gp = vSUv * uGlitterScale;
    float cpp = max( fwidth( gp.x ), fwidth( gp.y ) );
    float lod = max( 0.0, log2( max( cpp, 1e-4 ) / 0.22 ) );
    float l0 = floor( lod );
    float lf = lod - l0;
    float k0 = exp2( l0 );
    float dens = uGlitter * 0.5;
    vec3 gl = sFlakes( gp / k0, cpp / k0, normal, sV, sL, dens ) * ( 1.0 - lf );
    if ( lf > 0.01 ) gl += sFlakes( gp / ( k0 * 2.0 ), cpp / ( k0 * 2.0 ), normal, sV, sL, dens ) * lf;
    totalEmissiveRadiance += gl;
  }
}
`;

export function makeSlimeMaterial(color: THREE.ColorRepresentation): SlimeMaterial {
  const c = new THREE.Color(color);
  const material = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    sheen: 0.55,
    sheenRoughness: 0.35,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.6),
    iridescence: 0.28,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 380],
    ior: 1.45,
    side: THREE.DoubleSide,
  });
  const glitter = { value: 0 };
  const time = { value: 0 };
  const scale = { value: 84 };
  const thinColor = { value: new THREE.Color() };
  const setColor = (col: THREE.ColorRepresentation) => {
    material.color.set(col);
    material.sheenColor.set(col).lerp(new THREE.Color('#ffffff'), 0.6);
    // the "light shining through" tint: lighter and a touch more saturated
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl);
    thinColor.value.setHSL(hsl.h, Math.min(1, hsl.s * 1.05 + 0.05), Math.min(0.9, hsl.l * 0.45 + 0.52));
  };
  setColor(c);

  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uGlitter = glitter;
    sh.uniforms.uGlitterScale = scale;
    sh.uniforms.uThinColor = thinColor;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aThin;\nvarying float vSThin;\nvarying vec2 vSUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSThin = aThin;\nvSUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <emissivemap_fragment>', GLSL_BODY);
  };
  material.customProgramCacheKey = () => 'slime-v1';
  return { material, glitter, time, setColor };
}
