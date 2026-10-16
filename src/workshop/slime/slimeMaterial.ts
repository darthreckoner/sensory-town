// The slime's look. One wet physical material (clearcoat, soft sheen, iridescence —
// no `transmission`, it's too slow on iPad) plus cheap shader tricks:
//   • fake subsurface — color lightens toward the rim (fresnel) and wherever the
//     slime has been stretched thin (per-vertex `aThin`), like light shining through;
//   • studio lighting — an analytic RING-LIGHT catchlight and pink / cyan LED rim glow,
//     so the dark-studio look reads even when the room's env map is subtle;
//   • glitter — hash-cell flakes keyed to the rest-pose uv, so they ride the deformation
//     (the lattice coarsens where the slime is stretched thin so flakes keep a steady size);
//   • per-type surfaces (uMode): glossy, butter (matte cream), clear (glassy jelly with
//     tiny parallax bubbles), crunchy (bead bumps), cloud (fluffy fibres), holo (view-angle
//     rainbow foil) and galaxy (dark base, warped nebula, twinkling stars).
import * as THREE from 'three';

export interface SlimeLook {
  /** shader mode: 0 glossy, 1 butter, 2 clear, 3 crunchy, 4 cloud, 5 holo, 6 galaxy */
  mode: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThickness: [number, number];
  ior: number;
  env: number;
  /** how strongly stretched-thin slime glows */
  thinK: number;
  /** × tuning.slime.ringLight / ledRim */
  ringMul: number;
  ledMul: number;
  /** mix the color toward white (butter / cloud are paler) */
  whiten: number;
}

export interface SlimeMaterial {
  material: THREE.MeshPhysicalMaterial;
  /** 0..1 glitter amount (1 = a flake in half the lattice cells, 0 = no glitter) */
  glitter: { value: number };
  time: { value: number };
  ring: { value: number };
  led: { value: number };
  setColor(c: THREE.ColorRepresentation): void;
  setLook(look: SlimeLook): void;
}

const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform float uGlitter;
uniform float uGlitterScale;
uniform vec3 uThinColor;
uniform vec3 uTint;
uniform float uMode;
uniform float uRing;
uniform float uLed;
uniform float uThinK;
uniform float uWhiten;
varying float vSThin;
varying vec2 vSUv;
float sHash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 sHash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float sNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = sHash21(i), b = sHash21(i + vec2(1.0, 0.0)), c = sHash21(i + vec2(0.0, 1.0)), d = sHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float sFbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * sNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
// uv offset -> screen-pixel offset (so bumps tilt the right way whatever the surface orientation)
vec2 sScreenDir( vec2 duv ) {
  vec2 dx = dFdx( vSUv ); vec2 dy = dFdy( vSUv );
  float det = dx.x * dy.y - dx.y * dy.x;
  if ( abs( det ) < 1e-12 ) return vec2( 0.0 );
  return vec2( dy.y * duv.x - dy.x * duv.y, -dx.y * duv.x + dx.x * duv.y ) / det;
}
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
// Flakes over the whole surface; where the slime is stretched thin the rest-pose uv bunches up, so the
// lattice is coarsened there (cross-faded between two levels) to keep the flakes a steady size on screen.
vec3 sGlitter( float scale, float dens, vec3 N, vec3 V, vec3 L ) {
  vec2 gp = vSUv * scale;
  float cpp = max( fwidth( gp.x ), fwidth( gp.y ) );
  float lod = max( 0.0, log2( max( cpp, 1e-4 ) / 0.22 ) );
  float l0 = floor( lod );
  float lf = lod - l0;
  float k0 = exp2( l0 );
  vec3 gl = sFlakes( gp / k0, cpp / k0, N, V, L, dens ) * ( 1.0 - lf );
  if ( lf > 0.01 ) gl += sFlakes( gp / ( k0 * 2.0 ), cpp / ( k0 * 2.0 ), N, V, L, dens ) * lf;
  return gl;
}
`;

const GLSL_BODY = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 sV = normalize( vViewPosition );
  vec2 suv = vSUv;
  int sMode = int( uMode + 0.5 );
  vec3 sEmit = vec3( 0.0 );
  #if NUM_DIR_LIGHTS > 0
    vec3 sL = normalize( directionalLights[ 0 ].direction );
  #else
    vec3 sL = normalize( vec3( 0.3, 0.8, 0.5 ) );
  #endif
  float sNdv = saturate( dot( normal, sV ) );

  // ── per-type surface ──
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), uWhiten );
  if ( sMode == 2 ) {
    // clear: dark saturated core, bright rim, tiny bubbles floating at two depths (parallax)
    float rimC = pow( 1.0 - sNdv, 2.0 );
    diffuseColor.rgb *= mix( 0.42, 1.0, rimC );
    sEmit += uThinColor * rimC * 0.5;
    vec2 par = sV.xy;
    float bub = 0.0;
    float body = 0.0;
    for ( int k = 0; k < 2; k++ ) {
      float sc = 62.0 - 20.0 * float( k );
      float dep = 0.04 + 0.07 * float( k );
      vec2 bp = suv * sc + par * dep * sc + float( k ) * 13.7;
      float fwb = max( fwidth( bp.x ), fwidth( bp.y ) );
      float fadeB = 1.0 - smoothstep( 0.3, 0.7, fwb );
      vec2 bc = floor( bp ); vec2 bf = fract( bp );
      vec2 bh = sHash22( bc ); vec2 bh2 = sHash22( bc + 9.1 );
      float ex = step( 0.88, bh2.x ) * fadeB;
      vec2 ctr = 0.22 + 0.56 * bh;
      float rr = 0.09 + 0.13 * bh2.y;
      float d = length( bf - ctr );
      body += ( 1.0 - smoothstep( rr * 0.8, rr, d ) ) * ex;
      bub += smoothstep( rr * 0.55, rr * 0.95, d ) * ( 1.0 - smoothstep( rr * 0.95, rr * 1.1, d ) ) * ex * 0.55;
      bub += ( 1.0 - smoothstep( 0.0, rr * 0.32, length( bf - ctr - vec2( -0.3, -0.3 ) * rr ) ) ) * ex * 1.3;
    }
    diffuseColor.rgb *= 1.0 - 0.3 * saturate( body );
    sEmit += vec3( 1.0 ) * bub * 0.55;
  } else if ( sMode == 3 ) {
    // crunchy: a lattice of bead bumps with a few neon beads showing
    vec2 cp = suv * 70.0;
    vec2 cc = floor( cp ); vec2 cf = fract( cp );
    vec2 ch = sHash22( cc );
    float cr = 0.34 + 0.12 * ch.x;
    vec2 cd = cf - ( 0.5 + 0.12 * ( ch - 0.5 ) );
    float cdd = length( cd );
    float fwc = max( fwidth( cp.x ), fwidth( cp.y ) );
    float fadeC = 1.0 - smoothstep( 0.35, 0.8, fwc );
    float bead = ( 1.0 - smoothstep( cr * 0.85, cr, cdd ) ) * fadeC;
    vec2 pd = sScreenDir( cd / 70.0 );
    vec2 dir = pd / ( length( pd ) + 1e-6 );
    normal = normalize( normal + vec3( dir.x, -dir.y, 0.0 ) * bead * ( cdd / cr ) * 0.9 );
    vec3 bcol = 0.55 + 0.45 * cos( 6.2831 * ( ch.y + vec3( 0.0, 0.33, 0.67 ) ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, bcol, bead * step( 0.55, ch.x ) * 0.55 );
    diffuseColor.rgb *= 0.78 + 0.22 * bead;
  } else if ( sMode == 4 ) {
    // cloud: fluffy and fibrous
    float f1 = sFbm( suv * 14.0 );
    float f2 = sFbm( suv * 40.0 + 3.0 );
    float fibr = sNoise( vec2( atan( suv.y, suv.x ) * 18.0, length( suv ) * 6.0 ) );
    normal = normalize( normal + 0.28 * vec3( f1 - 0.5, f2 - 0.5, 0.0 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), 0.2 + 0.22 * ( f1 - 0.3 ) );
    diffuseColor.rgb *= 0.88 + 0.22 * f2 + 0.12 * fibr;
    sNdv = saturate( dot( normal, sV ) );
    sEmit += vec3( 1.0 ) * pow( 1.0 - sNdv, 2.0 ) * 0.3 * ( 0.6 + 0.8 * f2 );
  } else if ( sMode == 5 ) {
    // holo: view-angle rainbow foil over the chosen color
    float hue = sNdv * 1.5 + suv.x * 0.35 - suv.y * 0.25 + normal.y * 0.5 + uTime * 0.04;
    vec3 rb = 0.5 + 0.5 * cos( 6.2831 * ( vec3( 0.0, 0.33, 0.67 ) + hue ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, rb * 0.85, 0.55 );
    sEmit += rb * ( 0.1 + 0.7 * pow( 1.0 - sNdv, 2.0 ) );
    vec2 fh = sHash22( floor( suv * 150.0 ) );
    sEmit += rb * step( 0.93, fh.x ) * ( 0.5 + 0.5 * sin( uTime * 3.0 + fh.y * 30.0 ) ) * 0.5;
  } else if ( sMode == 6 ) {
    // galaxy: dark base, domain-warped nebula in the chosen color + blue + magenta, parallax stars
    vec2 gu = suv * 2.4 + sV.xy * 0.18;
    vec2 w = vec2( sFbm( gu * 1.5 + uTime * 0.02 ), sFbm( gu * 1.5 + 5.2 - uTime * 0.015 ) );
    float n1 = sFbm( gu * 1.2 + 2.0 * w );
    float n2 = sFbm( gu * 2.6 - 1.5 * w + 9.0 );
    vec3 deep = vec3( 0.012, 0.008, 0.045 );
    vec3 neb = mix( deep, uTint * 1.1, smoothstep( 0.35, 0.78, n1 ) );
    neb = mix( neb, vec3( 0.08, 0.3, 1.0 ), smoothstep( 0.5, 0.85, n2 ) * 0.8 );
    neb = mix( neb, vec3( 0.95, 0.15, 0.75 ), smoothstep( 0.6, 0.9, n1 * n2 * 1.7 ) * 0.7 );
    diffuseColor.rgb = deep * 1.2;
    sEmit += neb * 0.85;
    sEmit += sGlitter( 90.0, 0.16, normal, sV, sL ) * 1.1;
  }

  // ── fake subsurface: lighter, glowier where the slime thins or turns away from the eye ──
  sNdv = saturate( dot( normal, sV ) );
  float sRim = pow( 1.0 - sNdv, 2.2 );
  float sTh = vSThin * uThinK;
  vec3 sGlow = mix( diffuseColor.rgb, uThinColor, 0.7 );
  diffuseColor.rgb = mix( diffuseColor.rgb, sGlow, saturate( sTh * 0.8 + sRim * 0.35 * uThinK ) );
  sEmit += sGlow * ( sRim * 0.30 + sTh * 0.20 ) * uThinK;

  // ── studio: ring-light catchlight + pink / cyan LED rim ──
  vec3 sR = reflect( -sV, normal );
  vec3 sA = normalize( vec3( 0.0, 0.45, 1.0 ) );
  float sAng = acos( clamp( dot( sR, sA ), -1.0, 1.0 ) );
  float sRd = ( sAng - 0.42 ) / 0.06;
  float sRing = exp( -sRd * sRd );
  sEmit += vec3( 1.0, 0.97, 0.93 ) * sRing * uRing * ( 0.45 + 0.55 * sRim * 2.0 ) * 2.6;
  vec3 sLed = mix( vec3( 1.0, 0.18, 0.53 ), vec3( 0.0, 0.83, 1.0 ), 0.5 + 0.5 * clamp( normal.x * 1.6, -1.0, 1.0 ) );
  sEmit += sLed * pow( 1.0 - sNdv, 3.0 ) * uLed * 0.7;

  // ── glitter add-in ──
  if ( uGlitter > 0.001 ) sEmit += sGlitter( uGlitterScale, uGlitter * 0.5, normal, sV, sL );

  totalEmissiveRadiance += sEmit;
}
`;

export function makeSlimeMaterial(color: THREE.ColorRepresentation): SlimeMaterial {
  const c = new THREE.Color(color);
  const material = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    sheen: 0.5,
    sheenRoughness: 0.35,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.6),
    iridescence: 0.28,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 380],
    ior: 1.45,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
  });
  const glitter = { value: 0 };
  const time = { value: 0 };
  const scale = { value: 84 };
  const mode = { value: 0 };
  const ring = { value: 0.7 };
  const led = { value: 0.5 };
  const thinK = { value: 1 };
  const whiten = { value: 0 };
  const thinColor = { value: new THREE.Color() };
  const tint = { value: new THREE.Color() };
  const setColor = (col: THREE.ColorRepresentation) => {
    material.color.set(col);
    material.sheenColor.set(col).lerp(new THREE.Color('#ffffff'), 0.6);
    tint.value.copy(material.color);
    // the "light shining through" tint: lighter and a touch more saturated
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl);
    thinColor.value.setHSL(hsl.h, Math.min(1, hsl.s * 1.05 + 0.05), Math.min(0.9, hsl.l * 0.45 + 0.52));
  };
  setColor(c);

  const setLook = (look: SlimeLook) => {
    mode.value = look.mode;
    thinK.value = look.thinK;
    whiten.value = look.whiten;
    material.roughness = look.roughness;
    // clearcoat / sheen / iridescence stay > 0 so the shader variant never changes (no recompile hitch on a type switch)
    material.clearcoat = Math.max(0.001, look.clearcoat);
    material.clearcoatRoughness = look.clearcoatRoughness;
    material.sheen = Math.max(0.001, look.sheen);
    material.sheenRoughness = look.sheenRoughness;
    material.iridescence = Math.max(0.001, look.iridescence);
    material.iridescenceIOR = look.iridescenceIOR;
    material.iridescenceThicknessRange = look.iridescenceThickness;
    material.ior = look.ior;
    material.envMapIntensity = look.env;
  };

  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uGlitter = glitter;
    sh.uniforms.uGlitterScale = scale;
    sh.uniforms.uThinColor = thinColor;
    sh.uniforms.uTint = tint;
    sh.uniforms.uMode = mode;
    sh.uniforms.uRing = ring;
    sh.uniforms.uLed = led;
    sh.uniforms.uThinK = thinK;
    sh.uniforms.uWhiten = whiten;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aThin;\nvarying float vSThin;\nvarying vec2 vSUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSThin = aThin;\nvSUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <emissivemap_fragment>', GLSL_BODY);
  };
  material.customProgramCacheKey = () => 'slime-v2';
  return { material, glitter, time, ring, led, setColor, setLook };
}
