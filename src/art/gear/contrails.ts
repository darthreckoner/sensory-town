// ── v3 locker ── 6 original contrails: a tiny GPU-point particle trail the movement agent drives.
//
//   const trail = makeContrail(locker.contrail!);       // 'sparkles' | 'hearts' | 'rainbow' | 'stars' | 'bubbles' | 'confetti'
//   scene.add(trail.object);                            // particles live in WORLD space, so add it to the scene root
//   each frame:  trail.update(dt, gliderOrBackWorldPos, /* emitting */ gliding, /* optional */ velocity);
//   when done:   scene.remove(trail.object); trail.dispose();
//
// One THREE.Points (1 draw call, ≤ 160 particles), no per-frame allocation.
import * as THREE from 'three';

export const CONTRAIL_IDS = ['sparkles', 'hearts', 'rainbow', 'stars', 'bubbles', 'confetti'] as const;
export type ContrailId = (typeof CONTRAIL_IDS)[number];

export interface Contrail {
  readonly id: string;
  /** Add to the scene root (world space). */
  readonly object: THREE.Points;
  /** Call every frame. `emitter` = world position to emit from; `velocity` (optional, units/s) makes the trail drag behind. */
  update(dt: number, emitter: THREE.Vector3, emitting?: boolean, velocity?: THREE.Vector3): void;
  /** Kill every particle (e.g. on landing). */
  clear(): void;
  dispose(): void;
}

type Sprite = 'spark' | 'heart' | 'star' | 'bubble' | 'confetti' | 'dot';
interface Cfg {
  sprite: Sprite;
  additive: boolean;
  rate: number; // particles per second
  life: [number, number];
  size: [number, number]; // world units
  colors: string[] | 'rainbow';
  spread: number; // initial random speed (units/s)
  rise: number; // constant upward acceleration (negative = fall)
  sway: number; // sideways wobble amplitude (units/s)
  spin: number; // rad/s
  grow: number; // size multiplier at end of life
  inherit: number; // fraction of the emitter velocity the particles keep
}

const CFG: Record<ContrailId, Cfg> = {
  sparkles: { sprite: 'spark', additive: true, rate: 80, life: [0.5, 0.95], size: [0.14, 0.3], colors: ['#ffffff', '#fff3a0', '#ffd0f0', '#bff4ff'], spread: 0.45, rise: 0.25, sway: 0.2, spin: 2, grow: 0.2, inherit: 0.05 },
  hearts: { sprite: 'heart', additive: false, rate: 15, life: [1.0, 1.6], size: [0.28, 0.44], colors: ['#ff4fa3', '#ff3b6e', '#ff9fd0', '#ffffff', '#ff7ab8'], spread: 0.35, rise: 0.7, sway: 0.5, spin: 0.7, grow: 1.1, inherit: 0.1 },
  rainbow: { sprite: 'dot', additive: false, rate: 140, life: [0.7, 0.9], size: [0.2, 0.26], colors: 'rainbow', spread: 0.04, rise: 0, sway: 0, spin: 0, grow: 0.65, inherit: 0.0 },
  stars: { sprite: 'star', additive: false, rate: 20, life: [1.0, 1.5], size: [0.26, 0.4], colors: ['#ffe53b', '#ffd23f', '#fff6a8', '#ffb02e'], spread: 0.55, rise: 0.15, sway: 0.25, spin: 3, grow: 0.5, inherit: 0.06 },
  bubbles: { sprite: 'bubble', additive: false, rate: 13, life: [1.5, 2.3], size: [0.25, 0.55], colors: ['#bff4ff', '#ffd0f0', '#d8ccff', '#ffffff', '#c6ffe8'], spread: 0.3, rise: 0.6, sway: 0.45, spin: 0, grow: 1.25, inherit: 0.08 },
  confetti: { sprite: 'confetti', additive: false, rate: 70, life: [1.0, 1.7], size: [0.1, 0.17], colors: ['#ff3b3b', '#ffe53b', '#4cd964', '#35d6ff', '#b65cff', '#ff4fa3', '#ff8a1f'], spread: 0.7, rise: -1.4, sway: 0.7, spin: 9, grow: 1, inherit: 0.1 },
};

const CAP = 160;

// ── sprite textures (white shapes, tinted per particle) ──
const sprites = new Map<Sprite, THREE.CanvasTexture>();
function spriteTex(kind: Sprite): THREE.CanvasTexture {
  let t = sprites.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  g.fillStyle = '#ffffff';
  switch (kind) {
    case 'spark': {
      const gr = g.createRadialGradient(0, 0, 1, 0, 0, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(-32, -32, 64, 64);
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 29 : 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'heart': {
      g.scale(1.0, 1.0);
      g.beginPath();
      g.moveTo(0, 24);
      g.bezierCurveTo(-8, 18, -27, 6, -27, -8);
      g.bezierCurveTo(-27, -22, -10, -26, 0, -14);
      g.bezierCurveTo(10, -26, 27, -22, 27, -8);
      g.bezierCurveTo(27, 6, 8, 18, 0, 24);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.0)';
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(-30, 6, 60, 30);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(-12, -12, 6, 3.5, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'star': {
      g.lineJoin = 'round';
      g.lineWidth = 6;
      g.strokeStyle = '#ffffff';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 24 : 12;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'bubble': {
      const gr = g.createRadialGradient(0, 0, 14, 0, 0, 28);
      gr.addColorStop(0, 'rgba(255,255,255,0.08)');
      gr.addColorStop(0.8, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0.95)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, 28, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.ellipse(-10, -11, 8, 4.5, -0.7, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'confetti': {
      g.beginPath();
      g.roundRect(-26, -12, 52, 24, 5);
      g.fill();
      break;
    }
    case 'dot': {
      const gr = g.createRadialGradient(0, 0, 4, 0, 0, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.65, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(-32, -32, 64, 64);
      break;
    }
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  sprites.set(kind, t);
  return t;
}

const VERT = /* glsl */ `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
uniform float uScale; varying vec3 vC; varying float vA; varying float vR;
void main(){
  vC = aColor; vA = aAlpha; vR = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap; varying vec3 vC; varying float vA; varying float vR;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vR), s = sin(vR);
  vec4 t = texture2D(uMap, vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

class ParticleTrail implements Contrail {
  readonly object: THREE.Points;
  private readonly cfg: Cfg;
  private readonly pos = new Float32Array(CAP * 3);
  private readonly col = new Float32Array(CAP * 3);
  private readonly size = new Float32Array(CAP);
  private readonly alpha = new Float32Array(CAP);
  private readonly rot = new Float32Array(CAP);
  private readonly vel = new Float32Array(CAP * 3);
  private readonly age = new Float32Array(CAP).fill(1e9);
  private readonly life = new Float32Array(CAP).fill(1);
  private readonly base = new Float32Array(CAP);
  private readonly spin = new Float32Array(CAP);
  private readonly phase = new Float32Array(CAP);
  private readonly geo = new THREE.BufferGeometry();
  private readonly uniforms = { uMap: { value: null as THREE.Texture | null }, uScale: { value: 600 } };
  private next = 0;
  private acc = 0;
  private clock = 0;
  private last = new THREE.Vector3();
  private haveLast = false;
  private tmp = new THREE.Color();
  private palette: THREE.Color[];

  constructor(readonly id: string, cfg: Cfg) {
    this.cfg = cfg;
    this.palette = cfg.colors === 'rainbow' ? [] : cfg.colors.map((c) => new THREE.Color(c));
    this.uniforms.uMap.value = spriteTex(cfg.sprite);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.object = new THREE.Points(this.geo, mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 8;
    this.object.onBeforeRender = (renderer, _scene, camera) => {
      const rt = renderer.getRenderTarget();
      const h = rt ? rt.height : renderer.getDrawingBufferSize(_sz).y;
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
      this.uniforms.uScale.value = (h * 0.5) / Math.tan((fov * Math.PI) / 360);
    };
  }

  update(dt: number, emitter: THREE.Vector3, emitting = true, velocity?: THREE.Vector3): void {
    const c = this.cfg;
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    if (emitting) {
      this.acc += c.rate * dt;
      const n = Math.floor(this.acc);
      this.acc -= n;
      const from = this.haveLast ? this.last : emitter;
      for (let i = 0; i < n; i++) this.spawn(from, emitter, (i + 1) / n, velocity);
    }
    this.last.copy(emitter);
    this.haveLast = true;
    for (let i = 0; i < CAP; i++) {
      const a = (this.age[i] += dt);
      const L = this.life[i];
      if (a >= L) {
        this.size[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const k = a / L;
      const i3 = i * 3;
      this.vel[i3 + 1] += c.rise * dt;
      const sw = c.sway * Math.sin(this.clock * 3 + this.phase[i]);
      this.pos[i3] += (this.vel[i3] + sw) * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += (this.vel[i3 + 2] + sw * Math.cos(this.phase[i] * 2)) * dt;
      this.rot[i] += this.spin[i] * dt;
      const grow = 1 + (c.grow - 1) * k;
      const tw = c.sprite === 'spark' ? 0.75 + 0.25 * Math.sin(this.clock * 24 + this.phase[i] * 5) : 1;
      this.size[i] = this.base[i] * grow * tw * Math.min(1, k * 8 + 0.2);
      this.alpha[i] = k < 0.12 ? k / 0.12 : k > 0.55 ? Math.max(0, 1 - (k - 0.55) / 0.45) : 1;
    }
    const g = this.geo;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aRot as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawn(from: THREE.Vector3, to: THREE.Vector3, f: number, velocity?: THREE.Vector3): void {
    const c = this.cfg;
    const i = this.next;
    this.next = (this.next + 1) % CAP;
    const i3 = i * 3;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    const jitter = c.sprite === 'dot' ? 0.02 : 0.07;
    this.pos[i3] = from.x + (to.x - from.x) * f + r(-jitter, jitter);
    this.pos[i3 + 1] = from.y + (to.y - from.y) * f + r(-jitter, jitter);
    this.pos[i3 + 2] = from.z + (to.z - from.z) * f + r(-jitter, jitter);
    const inh = c.inherit;
    this.vel[i3] = r(-c.spread, c.spread) + (velocity ? velocity.x * inh : 0);
    this.vel[i3 + 1] = r(-c.spread, c.spread) * 0.8 + (velocity ? velocity.y * inh : 0);
    this.vel[i3 + 2] = r(-c.spread, c.spread) + (velocity ? velocity.z * inh : 0);
    this.life[i] = r(c.life[0], c.life[1]);
    this.age[i] = 0;
    this.base[i] = r(c.size[0], c.size[1]);
    this.spin[i] = r(-c.spin, c.spin);
    this.rot[i] = r(0, Math.PI * 2);
    this.phase[i] = r(0, Math.PI * 2);
    if (c.colors === 'rainbow') this.tmp.setHSL((this.clock * 0.9) % 1, 1, 0.55, THREE.SRGBColorSpace);
    else this.tmp.copy(this.palette[Math.floor(Math.random() * this.palette.length)]);
    this.col[i3] = this.tmp.r;
    this.col[i3 + 1] = this.tmp.g;
    this.col[i3 + 2] = this.tmp.b;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.age.fill(1e9);
    this.size.fill(0);
    this.alpha.fill(0);
    this.haveLast = false;
    this.acc = 0;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
const _sz = new THREE.Vector2();

/** Build a contrail by id (see CONTRAIL_IDS). Unknown ids return sparkles. */
export function makeContrail(id: string): Contrail {
  const cfg = CFG[id as ContrailId] ?? CFG.sparkles;
  return new ParticleTrail(id, cfg);
}
