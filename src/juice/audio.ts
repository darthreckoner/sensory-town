// Procedural Web Audio synth — every sound is generated from code (no files,
// no network). Only the juice layer should call this.
import { tuning } from '../tuning';

type Opts = { pitch?: number; vol?: number; pan?: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private lastPlay = new Map<string, number>();
  unlocked = false;

  // continuous voices
  private engine: { osc: OscillatorNode; sub: OscillatorNode; lp: BiquadFilterNode; g: GainNode; am: GainNode; lfo: OscillatorNode } | null = null;
  private pour: { src: AudioBufferSourceNode; lp: BiquadFilterNode; g: GainNode; lfo: OscillatorNode; bubbleTimer: number } | null = null;
  private musicTimer: number | null = null;
  private musicOn = false;

  /** Create + resume the AudioContext. Must be called from a user gesture on iOS. */
  unlock(): void {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state !== 'running') void ctx.resume();
    if (!this.unlocked) {
      // iOS: play a silent buffer inside the gesture.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      this.unlocked = true;
    }
  }

  private build(): void {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);

    // small generated room reverb for softness
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(1.1, 3.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.16;
    this.reverbSend.connect(conv);
    conv.connect(this.master);

    // 2s of white noise reused by every noise-based sound
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const a = tuning.audio;
    this.master.gain.value = a.master;
    this.sfx.gain.value = a.sfx;
    this.music.gain.value = a.music * 0.5;
  }

  // ── building blocks ────────────────────────────────────────────────────────
  private ok(name: string): boolean {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const now = performance.now();
    const last = this.lastPlay.get(name) ?? 0;
    if (now - last < tuning.audio.minRepeatMs) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private vary(o: Opts = {}): { p: number; v: number; pan: number } {
    const pv = tuning.audio.pitchVariation;
    const vv = tuning.audio.volumeVariation;
    return {
      p: (o.pitch ?? 1) * (1 + rand(-pv, pv)),
      v: (o.vol ?? 1) * (1 + rand(-vv, vv)),
      pan: o.pan ?? rand(-0.15, 0.15),
    };
  }

  /** Output node for a one-shot: gain → pan → sfx (+ reverb send). */
  private out(vol: number, pan: number, reverb = 1): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.sfx);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      p.connect(s);
      s.connect(this.reverbSend);
    }
    return g;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, a: number, d: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d * 0.8);
    const g = ctx.createGain();
    this.env(g, t, a, peak, d);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  private noiseBurst(
    dest: AudioNode, t: number, a: number, d: number, peak: number,
    filter: BiquadFilterType, f0: number, f1: number, q = 1,
  ): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + a + d);
    const g = ctx.createGain();
    this.env(g, t, a, peak, d);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + d + 0.05);
  }

  // ── one-shot sounds ───────────────────────────────────────────────────────
  play(name: SoundName, o: Opts = {}): void {
    if (!this.ok(name)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const { p, v, pan } = this.vary(o);
    const fn = (this as any)['s_' + name] as ((t: number, p: number, v: number, pan: number) => void) | undefined;
    fn?.call(this, t, p, v, pan);
  }

  private s_tap(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.3);
    this.tone(o, 'triangle', 780 * p, 620 * p, t, 0.002, 0.06, 0.6);
    this.tone(o, 'sine', 1560 * p, 1500 * p, t, 0.001, 0.025, 0.15);
  }
  private s_tab(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.4);
    this.tone(o, 'sine', 660 * p, 660 * p, t, 0.003, 0.09, 0.5);
    this.tone(o, 'sine', 990 * p, 990 * p, t + 0.05, 0.003, 0.12, 0.4);
  }
  private s_back(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 0.4);
    this.tone(o, 'sine', 880 * p, 520 * p, t, 0.003, 0.12, 0.5);
  }
  private s_whoosh(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.6);
    this.noiseBurst(o, t, 0.12, 0.25, 0.5, 'bandpass', 300 * p, 1400 * p, 0.9);
  }
  private s_pop(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.5);
    this.tone(o, 'sine', 950 * p, 260 * p, t, 0.002, 0.07, 0.9);
    this.noiseBurst(o, t, 0.001, 0.02, 0.25, 'bandpass', 2400 * p, 2400 * p, 3);
  }
  private s_squelch(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.75 * v, pan, 0.4);
    const d = rand(0.18, 0.3);
    this.noiseBurst(o, t, 0.02, d, 0.55, 'bandpass', 420 * p, 1300 * p, 2.6);
    this.noiseBurst(o, t + 0.03, 0.03, d * 0.8, 0.3, 'lowpass', 900 * p, 300 * p, 4);
    this.tone(o, 'sine', 140 * p, 90 * p, t, 0.01, d, 0.35);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.wetClick(o, t + rand(0.02, d), p * rand(0.8, 1.3), 0.25);
  }
  private wetClick(o: AudioNode, t: number, p: number, peak: number) {
    this.tone(o, 'sine', 2200 * p, 1100 * p, t, 0.0008, 0.012, peak);
    this.noiseBurst(o, t, 0.0005, 0.012, peak * 0.9, 'bandpass', 2600 * p, 1800 * p, 6);
  }
  private s_slimeClick(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.35);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.wetClick(o, t + i * rand(0.015, 0.04), p * rand(0.75, 1.35), 0.55);
    this.tone(o, 'sine', 320 * p, 180 * p, t, 0.002, 0.04, 0.2);
  }
  private s_slimeStretch(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.0 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.04, 0.22, 0.3, 'bandpass', 700 * p, 1500 * p, 3.5);
    for (let i = 0; i < 3; i++) this.wetClick(o, t + rand(0.01, 0.2), p * rand(0.7, 1.1), 0.2);
  }
  private s_poke(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.4);
    this.tone(o, 'sine', 300 * p, 140 * p, t, 0.002, 0.09, 0.6);
    this.wetClick(o, t + 0.01, p, 0.5);
  }
  private s_crunch(t: number, p: number, v: number, pan: number) {
    // Crisp wax crack: a fast cluster of tiny bright impulses + snap.
    const o = this.out(0.9 * v, pan, 0.25);
    this.tone(o, 'triangle', 2600 * p, 1400 * p, t, 0.0005, 0.012, 0.5);
    const n = 7 + Math.floor(Math.random() * 9);
    const span = rand(0.05, 0.13);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.pow(Math.random(), 1.6) * span;
      const f = rand(2500, 7000) * p;
      this.noiseBurst(o, tt, 0.0004, rand(0.004, 0.016), rand(0.25, 0.8), 'highpass', f, f, 0.7);
    }
    this.noiseBurst(o, t, 0.001, 0.05, 0.25, 'bandpass', 1400 * p, 900 * p, 1.5);
  }
  private s_flake(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.1 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.0005, 0.02, 0.5, 'bandpass', 4200 * p, 3000 * p, 4);
    this.tone(o, 'sine', 3600 * p, 3300 * p, t, 0.0005, 0.03, 0.12);
  }
  private s_flakeLand(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.3 * v, pan, 0.2);
    this.tone(o, 'triangle', 1900 * p, 1600 * p, t, 0.0005, 0.03, 0.4);
    this.noiseBurst(o, t, 0.0005, 0.015, 0.3, 'highpass', 3000 * p, 3000 * p, 1);
  }
  private s_gloop(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.6);
    this.tone(o, 'sine', 210 * p, 70 * p, t, 0.01, 0.38, 0.8);
    this.noiseBurst(o, t, 0.02, 0.3, 0.35, 'lowpass', 900 * p, 200 * p, 6);
    for (let i = 0; i < 5; i++) this.bubble(o, t + 0.1 + i * rand(0.05, 0.12), p * rand(0.8, 1.4), 0.35);
  }
  private bubble(o: AudioNode, t: number, p: number, peak: number) {
    this.tone(o, 'sine', 220 * p, 520 * p, t, 0.004, 0.05, peak);
  }
  private s_drip(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.5);
    this.tone(o, 'sine', 500 * p, 1300 * p, t, 0.002, 0.06, 0.5);
  }
  private s_snap(t: number, p: number, v: number, pan: number) {
    // Toy-brick snap: woody tock + click.
    const o = this.out(0.85 * v, pan, 0.35);
    this.noiseBurst(o, t, 0.0008, 0.035, 0.7, 'bandpass', 1900 * p, 1300 * p, 4);
    this.tone(o, 'triangle', 420 * p, 300 * p, t, 0.001, 0.07, 0.6);
    this.tone(o, 'sine', 2600 * p, 2600 * p, t, 0.0005, 0.01, 0.3);
  }
  private s_blocked(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.35 * v, pan, 0.3);
    this.tone(o, 'sine', 300 * p, 260 * p, t, 0.004, 0.09, 0.5);
  }
  private s_puff(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.6 * v, pan, 0.5);
    this.noiseBurst(o, t, 0.01, 0.28, 0.6, 'lowpass', 2400 * p, 250 * p, 1);
    this.tone(o, 'sine', 400 * p, 160 * p, t, 0.002, 0.1, 0.3);
  }
  private s_rotate(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.1 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.0008, 0.02, 0.4, 'bandpass', 2400 * p, 2400 * p, 5);
    this.noiseBurst(o, t + 0.05, 0.0008, 0.02, 0.35, 'bandpass', 2900 * p, 2900 * p, 5);
  }
  private s_chime(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 1.2);
    const notes = [1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => this.bell(o, t + i * 0.07, f * p, 0.5));
  }
  private s_switch(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 1.2);
    [784, 1175, 1568].forEach((f, i) => this.bell(o, t + i * 0.06, f * p, 0.45));
  }
  private bell(o: AudioNode, t: number, f: number, peak: number) {
    this.tone(o, 'sine', f, f, t, 0.003, 1.1, peak);
    this.tone(o, 'sine', f * 2.76, f * 2.76, t, 0.002, 0.35, peak * 0.22);
    this.tone(o, 'sine', f * 5.4, f * 5.4, t, 0.001, 0.12, peak * 0.08);
  }
  private s_sparkle(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.3 * v, pan, 1.2);
    const scale = [2093, 2349, 2637, 3136, 3520, 4186];
    for (let i = 0; i < 5; i++) {
      const f = scale[Math.floor(Math.random() * scale.length)] * p;
      this.tone(o, 'sine', f, f, t + i * rand(0.02, 0.05), 0.002, 0.18, 0.35);
    }
  }
  private s_swish(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.0 * v, pan, 0.5);
    this.noiseBurst(o, t, 0.06, 0.18, 0.45, 'bandpass', 900 * p, 3200 * p, 1.3);
  }
  private s_horn(t: number, p: number, v: number, pan: number) {
    const ctx = this.ctx!;
    const o = this.out(0.35 * v, pan, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.connect(o);
    for (const [off, dur] of [[0, 0.12], [0.17, 0.2]] as const) {
      this.tone(lp, 'square', 466 * p, 466 * p, t + off, 0.005, dur, 0.35);
      this.tone(lp, 'square', 587 * p, 587 * p, t + off, 0.005, dur, 0.3);
    }
  }
  private s_bump(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.5);
    this.tone(o, 'sine', 120 * p, 55 * p, t, 0.003, 0.16, 0.9);
    // toy "boing"
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260 * p, t);
    osc.frequency.linearRampToValueAtTime(420 * p, t + 0.08);
    osc.frequency.linearRampToValueAtTime(300 * p, t + 0.22);
    const vib = ctx.createOscillator();
    vib.frequency.value = 28;
    const vg = ctx.createGain();
    vg.gain.value = 30;
    vib.connect(vg);
    vg.connect(osc.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.3, 0.25);
    osc.connect(g);
    g.connect(o);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 0.3);
    vib.stop(t + 0.3);
  }
  private s_hello(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.4 * v, pan, 0.8);
    this.tone(o, 'triangle', 660 * p, 660 * p, t, 0.004, 0.1, 0.5);
    this.tone(o, 'triangle', 880 * p, 990 * p, t + 0.11, 0.004, 0.16, 0.5);
  }
  private s_happy(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 1);
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this.tone(o, 'triangle', f * p, f * p, t + i * 0.07, 0.004, 0.22, 0.4);
      this.bell(o, t + i * 0.07, f * 2 * p, 0.1);
    });
  }
  private s_confetti(t: number, p: number, v: number, pan: number) {
    this.s_pop(t, p * 1.2, v, pan);
    this.s_sparkle(t + 0.04, p, v, pan);
  }
  private s_frost(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.35 * v, pan, 0.8);
    this.noiseBurst(o, t, 0.25, 0.6, 0.45, 'bandpass', 5000 * p, 7000 * p, 1.5);
    this.s_sparkle(t + 0.2, p * 1.2, v * 0.6, pan);
  }
  private s_harden(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.4 * v, pan, 1);
    this.bell(o, t, 1760 * p, 0.35);
    this.bell(o, t + 0.09, 2637 * p, 0.25);
  }
  private s_save(t: number, p: number, v: number, pan: number) {
    this.s_happy(t, p * 1.1, v * 0.9, pan);
  }

  // ── continuous voices ─────────────────────────────────────────────────────
  engineStart(): void {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 2;
    const am = ctx.createGain();
    am.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.25;
    lfo.connect(lfoG);
    lfoG.connect(am.gain);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(am);
    am.connect(g);
    g.connect(this.sfx);
    osc.frequency.value = tuning.audio.engineBaseHz;
    sub.frequency.value = tuning.audio.engineBaseHz / 2;
    osc.start();
    sub.start();
    lfo.start();
    g.gain.setTargetAtTime(tuning.audio.engineVolume * 0.6, ctx.currentTime, 0.2);
    this.engine = { osc, sub, lp, g, am, lfo };
  }

  engineSet(speed01: number, throttle: number): void {
    if (!this.ctx || !this.engine) return;
    const a = tuning.audio;
    const t = this.ctx.currentTime;
    const f = a.engineBaseHz + (a.engineTopHz - a.engineBaseHz) * speed01;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.sub.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engine.lfo.frequency.setTargetAtTime(10 + speed01 * 22, t, 0.1);
    this.engine.lp.frequency.setTargetAtTime(300 + speed01 * 700 + throttle * 250, t, 0.1);
    this.engine.g.gain.setTargetAtTime(a.engineVolume * (0.55 + 0.45 * Math.max(speed01, throttle * 0.6)), t, 0.1);
  }

  engineStop(): void {
    if (!this.ctx || !this.engine) return;
    const e = this.engine;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      e.osc.stop();
      e.sub.stop();
      e.lfo.stop();
    }, 600);
  }

  pourStart(): void {
    if (!this.ctx || this.pour) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 160;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(lp);
    lp.connect(g);
    const o = this.out(1, 0, 0.6);
    g.connect(o);
    src.start();
    lfo.start();
    g.gain.setTargetAtTime(tuning.audio.pourVolume, ctx.currentTime, 0.06);
    const bubbleTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (Math.random() < 0.6) this.bubble(o, t, rand(0.7, 1.6), 0.25);
    }, 90);
    this.pour = { src, lp, g, lfo, bubbleTimer };
  }

  pourSet(rate: number): void {
    if (!this.ctx || !this.pour) return;
    const t = this.ctx.currentTime;
    this.pour.g.gain.setTargetAtTime(tuning.audio.pourVolume * (0.3 + 0.7 * rate), t, 0.08);
  }

  pourStop(): void {
    if (!this.ctx || !this.pour) return;
    const pr = this.pour;
    this.pour = null;
    clearInterval(pr.bubbleTimer);
    pr.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => {
      pr.src.stop();
      pr.lfo.stop();
    }, 700);
  }

  // ── ambient music: soft generative pentatonic pad + plucks ────────────────
  setMusic(on: boolean): void {
    if (!this.ctx) return;
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (!on) {
      if (this.musicTimer !== null) clearInterval(this.musicTimer);
      this.musicTimer = null;
      return;
    }
    const chords = [
      [261.6, 329.6, 392.0, 493.9],
      [220.0, 261.6, 329.6, 392.0],
      [174.6, 220.0, 261.6, 329.6],
      [196.0, 246.9, 293.7, 392.0],
    ];
    const penta = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
    let step = 0;
    const bar = 4.0;
    const playBar = () => {
      if (!this.ctx || !this.musicOn) return;
      const t = this.ctx.currentTime + 0.05;
      const ch = chords[Math.floor(step / 2) % chords.length];
      for (const f of ch) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f / 2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + bar + 1);
        o.connect(g);
        g.connect(this.music);
        o.start(t);
        o.stop(t + bar + 1.1);
      }
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.6) {
          const f = penta[Math.floor(Math.random() * penta.length)];
          const tt = t + i * (bar / 3) + rand(0, 0.3);
          const o = this.ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.06, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4);
          o.connect(g);
          g.connect(this.music);
          o.start(tt);
          o.stop(tt + 1.5);
        }
      }
      step++;
    };
    playBar();
    this.musicTimer = window.setInterval(playBar, bar * 1000);
  }
}

export type SoundName =
  | 'tap' | 'tab' | 'back' | 'whoosh' | 'pop' | 'squelch' | 'slimeClick' | 'slimeStretch' | 'poke'
  | 'crunch' | 'flake' | 'flakeLand' | 'gloop' | 'drip' | 'snap' | 'blocked' | 'puff' | 'rotate'
  | 'chime' | 'switch' | 'sparkle' | 'swish' | 'horn' | 'bump' | 'hello' | 'happy' | 'confetti'
  | 'frost' | 'harden' | 'save';

export const audio = new AudioEngine();
