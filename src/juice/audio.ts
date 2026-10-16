// Procedural Web Audio synth — every sound is generated from code (no files,
// no network). Only the juice layer should call this.
//
// v2 sound direction: "less Animal Crossing, more Roblox". UI and game sounds are
// punchy, modern and synthy (crisp clicks, collect zaps, level-up stingers, a real
// car horn, a gritty engine). The ASMR core (crunch, squelch, slime clicks, pour,
// gloop) stays realistic. Music is beat-driven: a step sequencer with a track per
// place (lobby, town synth-pop, studio lo-fi, style runway).
import { tuning } from '../tuning';
import { tuneFor, type Hit, type ParsedTune } from './emoteMusic';   // v3 emote

type Opts = { pitch?: number; vol?: number; pan?: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export type MusicTrack = 'lobby' | 'town' | 'studio' | 'style' | 'locker'; // v3 locker: 'locker' = the Locker lobby track

// ── v3 rides: each ride has its own engine voice ──
interface EngineVoice {
  osc: OscillatorType;
  sub: OscillatorType;
  base: number; // × tuning.audio.engineBaseHz
  top: number; // × tuning.audio.engineTopHz
  lp: number;
  lfo: number; // Hz at rest (it speeds up with the ride)
  lfoDepth: number;
  rumble: number;
  rumbleLp: number;
  whine: number;
  vol: number;
}
const ENGINE_VOICES: Record<string, EngineVoice> = {
  sports: { osc: 'sawtooth', sub: 'square', base: 1, top: 1, lp: 420, lfo: 18, lfoDepth: 0.22, rumble: 0.25, rumbleLp: 260, whine: 1, vol: 1 },
  pickup: { osc: 'sawtooth', sub: 'square', base: 0.72, top: 0.8, lp: 380, lfo: 13, lfoDepth: 0.3, rumble: 0.45, rumbleLp: 320, whine: 0.2, vol: 1.05 },
  // a cute putt-putt: a high triangle chopped by a slow, deep tremolo
  golfcart: { osc: 'triangle', sub: 'sine', base: 1.6, top: 1.2, lp: 950, lfo: 9, lfoDepth: 0.68, rumble: 0.04, rumbleLp: 500, whine: 1.6, vol: 0.85 },
  // an airy hum with a hiss of air under the board
  hoverboard: { osc: 'sine', sub: 'triangle', base: 1.9, top: 1.7, lp: 1500, lfo: 5, lfoDepth: 0.1, rumble: 0.38, rumbleLp: 2200, whine: 0.8, vol: 0.75 },
  // a heavy diesel idle
  icecream: { osc: 'sawtooth', sub: 'square', base: 0.55, top: 0.62, lp: 300, lfo: 8, lfoDepth: 0.35, rumble: 0.5, rumbleLp: 240, whine: 0, vol: 1 },
  // an outboard motor burble
  boat: { osc: 'sawtooth', sub: 'sawtooth', base: 0.9, top: 0.95, lp: 520, lfo: 26, lfoDepth: 0.42, rumble: 0.55, rumbleLp: 750, whine: 0.1, vol: 1 },
};

/** 1 s of 8-bit 8 kHz silence as a WAV blob URL (made in code: no asset file). */
function silentWavUrl(): string {
  const n = 8000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true); // sample rate
  v.setUint32(28, 8000, true); // byte rate
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128); // 8-bit silence is the midpoint
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  lastPlay = new Map<string, number>();
  unlocked = false;

  // continuous voices
  private engine: { osc: OscillatorNode; sub: OscillatorNode; whine: OscillatorNode; whineG: GainNode; rumble: AudioBufferSourceNode; rumbleG: GainNode; lp: BiquadFilterNode; g: GainNode; lfo: OscillatorNode; v: EngineVoice } | null = null;
  private pour: { src: AudioBufferSourceNode; lp: BiquadFilterNode; g: GainNode; lfo: OscillatorNode; bubbleTimer: number } | null = null;

  // music sequencer
  private musicOn = false;
  private track: MusicTrack = 'town';
  private seqTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;

  /** Create + resume the AudioContext. Must be called from a user gesture on iOS. */
  unlock(): void {
    this.iosPlayback();
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state !== 'running') void ctx.resume();
    if (!this.unlocked || ctx.state !== 'running') {
      // iOS: play a silent buffer inside the gesture.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      this.unlocked = true;
    }
    // start any music that was requested before audio was unlocked
    if (this.wantMusic && !this.musicOn) {
      const tryStart = () => {
        if (ctx.state === 'running') this.setMusic(true);
        else setTimeout(tryStart, 100);
      };
      tryStart();
    }
  }

  /**
   * iPhone/iPad: the ring/silent switch MUTES Web Audio unless the page's audio
   * session is "playback" (the designer got no sound on an iPhone). Safari 17+
   * exposes navigator.audioSession; older iOS switches the session when an
   * <audio> element starts playing inside a gesture, so we loop a silent one.
   * The volume buttons and the in-game Audio settings still control loudness.
   */
  private silentEl: HTMLAudioElement | null = null;
  private iosPlayback(): void {
    try {
      const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (s && s.type !== 'playback') s.type = 'playback';
    } catch {
      /* not supported */
    }
    // the <audio> trick only on iPhone/iPad (elsewhere a looping element can show a "playing" media notification)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return;
    if (!this.silentEl) {
      const a = new Audio(silentWavUrl());
      a.loop = true;
      a.setAttribute('playsinline', '');
      this.silentEl = a;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) a.pause();
      });
    }
    if (this.silentEl.paused) void this.silentEl.play().catch(() => undefined);
  }

  private build(): void {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);

    // small generated room reverb (tighter than v1 — modern, less "fairy dust")
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(0.8, 3.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.1;
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
    this.music.gain.value = a.music * 0.55;
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

  /** Output node for a one-shot: gain → pan → bus (+ reverb send). */
  private out(vol: number, pan: number, reverb = 1, bus: GainNode = this.sfx): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(bus);
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

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, a: number, d: number, peak: number, detune = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
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

  /** Filtered saw/square "synth" voice with a closing lowpass — the modern game stab. */
  private synth(dest: AudioNode, type: OscillatorType, f: number, t: number, dur: number, peak: number, cutoff = 2400, detune = 8): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.25), t + dur);
    lp.connect(dest);
    for (const dt of [-detune, detune]) this.tone(lp, type, f, f, t, 0.004, dur, peak * 0.6, dt);
  }

  private kick(dest: AudioNode, t: number, peak = 0.9): void {
    this.tone(dest, 'sine', 150, 42, t, 0.002, 0.22, peak);
    this.noiseBurst(dest, t, 0.0008, 0.012, peak * 0.25, 'highpass', 3000, 3000, 0.7);
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

  // UI — crisp, short, modern
  private s_tap(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.55 * v, pan, 0.1);
    this.noiseBurst(o, t, 0.0005, 0.008, 0.5, 'highpass', 4200 * p, 4200 * p, 0.8);
    this.tone(o, 'sine', 1150 * p, 880 * p, t, 0.001, 0.03, 0.45);
  }
  private s_tab(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.1);
    this.noiseBurst(o, t, 0.0005, 0.01, 0.4, 'bandpass', 3000 * p, 3000 * p, 2);
    this.tone(o, 'triangle', 620 * p, 760 * p, t, 0.002, 0.05, 0.5);
  }
  private s_back(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.1);
    this.noiseBurst(o, t, 0.0005, 0.01, 0.35, 'bandpass', 2400 * p, 2400 * p, 2);
    this.tone(o, 'triangle', 640 * p, 400 * p, t, 0.002, 0.07, 0.5);
  }
  private s_whoosh(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.14, 0.22, 0.6, 'bandpass', 250 * p, 2600 * p, 1.1);
    this.tone(o, 'sine', 110 * p, 55 * p, t + 0.12, 0.02, 0.25, 0.35);
  }
  private s_pop(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.2);
    this.tone(o, 'sine', 950 * p, 260 * p, t, 0.002, 0.07, 0.9);
    this.noiseBurst(o, t, 0.001, 0.02, 0.25, 'bandpass', 2400 * p, 2400 * p, 3);
  }
  private s_blocked(t: number, p: number, v: number, pan: number) {
    // game-y "nope": two low filtered square blips
    const o = this.out(0.35 * v, pan, 0.1);
    this.synth(o, 'square', 196 * p, t, 0.07, 0.5, 900, 0);
    this.synth(o, 'square', 156 * p, t + 0.08, 0.1, 0.5, 900, 0);
  }
  private s_swish(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.0 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.05, 0.16, 0.45, 'bandpass', 900 * p, 3600 * p, 1.3);
  }
  private s_rotate(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.1 * v, pan, 0.15);
    this.noiseBurst(o, t, 0.0008, 0.02, 0.4, 'bandpass', 2400 * p, 2400 * p, 5);
    this.noiseBurst(o, t + 0.05, 0.0008, 0.02, 0.35, 'bandpass', 2900 * p, 2900 * p, 5);
  }

  // Game feedback — synthy, Roblox-ish
  private s_chime(t: number, p: number, v: number, pan: number) {
    // clean digital "ding"
    const o = this.out(0.5 * v, pan, 0.35);
    this.tone(o, 'sine', 1319 * p, 1319 * p, t, 0.002, 0.5, 0.55);
    this.tone(o, 'sine', 2637 * p, 2637 * p, t, 0.002, 0.18, 0.18);
    this.tone(o, 'triangle', 1976 * p, 1976 * p, t + 0.06, 0.002, 0.4, 0.3);
  }
  private s_switch(t: number, p: number, v: number, pan: number) {
    this.s_whoosh(t, p, v * 0.6, pan);
    const o = this.out(0.45 * v, pan, 0.3);
    this.synth(o, 'sawtooth', midi(76) * p, t + 0.12, 0.18, 0.5, 3200);
    this.synth(o, 'sawtooth', midi(83) * p, t + 0.2, 0.3, 0.5, 3200);
  }
  private s_sparkle(t: number, p: number, v: number, pan: number) {
    // digital shimmer (less "fairy")
    const o = this.out(0.35 * v, pan, 0.4);
    this.noiseBurst(o, t, 0.01, 0.25, 0.25, 'bandpass', 7500 * p, 9500 * p, 6);
    this.tone(o, 'square', 2637 * p, 2637 * p, t, 0.002, 0.06, 0.08);
    this.tone(o, 'square', 3520 * p, 3520 * p, t + 0.05, 0.002, 0.06, 0.07);
  }
  private s_hello(t: number, p: number, v: number, pan: number) {
    // NPC "yo!" — quick rising two-note square blip
    const o = this.out(0.4 * v, pan, 0.15);
    this.synth(o, 'square', midi(72) * p, t, 0.07, 0.5, 2500, 4);
    this.synth(o, 'square', midi(79) * p, t + 0.08, 0.12, 0.5, 2500, 4);
  }
  private s_happy(t: number, p: number, v: number, pan: number) {
    // success stinger: kick + synth chord stab + rising arp
    const o = this.out(0.5 * v, pan, 0.25);
    this.kick(o, t, 0.6);
    for (const n of [60, 64, 67, 71]) this.synth(o, 'sawtooth', midi(n + 12) * p, t, 0.42, 0.28, 4200, 10);
    [72, 76, 79, 84].forEach((n, i) => this.synth(o, 'square', midi(n + 12) * p, t + 0.06 + i * 0.06, 0.12, 0.25, 3500, 0));
  }
  private s_levelup(t: number, p: number, v: number, pan: number) {
    // bigger "unlocked!" fanfare
    const o = this.out(0.55 * v, pan, 0.3);
    this.s_whoosh(t, p, v * 0.5, pan);
    [67, 71, 74, 79, 83, 86].forEach((n, i) => this.synth(o, 'square', midi(n) * p, t + i * 0.055, 0.12, 0.3, 4200, 0));
    this.kick(o, t + 0.33, 0.8);
    for (const n of [67, 71, 74, 78]) this.synth(o, 'sawtooth', midi(n + 12) * p, t + 0.33, 0.7, 0.26, 5000, 12);
    this.tone(o, 'sine', midi(43) * p, midi(43) * p, t + 0.33, 0.01, 0.6, 0.5);
  }
  private s_collect(t: number, p: number, v: number, pan: number) {
    // gem/charm pickup: bright fast arp + zap
    const o = this.out(0.38 * v, pan, 0.25);
    [76, 80, 83, 88].forEach((n, i) => this.synth(o, 'square', midi(n) * p, t + i * 0.045, 0.09, 0.4, 5000, 3));
    this.tone(o, 'sine', 900 * p, 2400 * p, t, 0.003, 0.18, 0.3);
    this.noiseBurst(o, t + 0.12, 0.01, 0.2, 0.15, 'highpass', 6000, 9000, 1);
  }
  private s_confetti(t: number, p: number, v: number, pan: number) {
    // party popper: pff + pop + shimmer
    const o = this.out(0.7 * v, pan, 0.25);
    this.noiseBurst(o, t, 0.002, 0.12, 0.6, 'bandpass', 1800 * p, 600 * p, 0.9);
    this.tone(o, 'sine', 700 * p, 180 * p, t, 0.001, 0.08, 0.6);
    this.s_sparkle(t + 0.05, p, v * 0.8, pan);
  }
  private s_save(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 0.2);
    this.kick(o, t, 0.4);
    this.synth(o, 'triangle', midi(72) * p, t, 0.1, 0.55, 3000, 0);
    this.synth(o, 'triangle', midi(79) * p, t + 0.09, 0.22, 0.55, 3000, 0);
  }
  private s_harden(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.4 * v, pan, 0.3);
    this.tone(o, 'sine', 1760 * p, 1760 * p, t, 0.002, 0.35, 0.4);
    this.tone(o, 'sine', 2640 * p, 2640 * p, t + 0.07, 0.002, 0.3, 0.25);
  }
  private s_frost(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.4 * v, pan, 0.4);
    this.noiseBurst(o, t, 0.2, 0.55, 0.5, 'bandpass', 5000 * p, 7500 * p, 1.5);
  }
  private s_step(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.3 * v, pan, 0.05);
    this.noiseBurst(o, t, 0.002, 0.04, 0.5, 'lowpass', 900 * p, 400 * p, 1);
    this.tone(o, 'sine', 90 * p, 60 * p, t, 0.002, 0.05, 0.4);
  }

  // Water: a deep plunk, a splashy wash that falls away, a spray of fizz and a few droplet ticks
  private s_splash(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.95 * v, pan, 0.35);
    this.tone(o, 'sine', 430 * p, 85 * p, t, 0.003, 0.24, 0.9);
    this.tone(o, 'sine', 980 * p, 320 * p, t + 0.01, 0.002, 0.09, 0.35);
    this.noiseBurst(o, t, 0.004, 0.34, 0.75, 'bandpass', 2800 * p, 650 * p, 0.9);
    this.noiseBurst(o, t + 0.02, 0.01, 0.2, 0.35, 'highpass', 4600 * p, 3000 * p, 0.8);
    for (let i = 0; i < 4; i++) this.tone(o, 'sine', (1300 + Math.random() * 1700) * p, (600 + Math.random() * 500) * p, t + 0.12 + i * 0.05 + Math.random() * 0.04, 0.001, 0.035, 0.2);
  }
  private s_wade(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.2);
    this.noiseBurst(o, t, 0.003, 0.13, 0.6, 'bandpass', 1900 * p, 800 * p, 1.2);
    this.tone(o, 'sine', 390 * p, 150 * p, t, 0.002, 0.07, 0.45);
  }
  private s_stroke(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 0.25);
    this.noiseBurst(o, t, 0.04, 0.24, 0.5, 'bandpass', 700 * p, 2400 * p, 1.1);
    this.tone(o, 'sine', 310 * p, 150 * p, t + 0.05, 0.005, 0.1, 0.3);
  }

  // v3 rides: each ride's own horn (the ice-cream truck plays a little original jingle)
  private s_hornPickup(t: number, p: number, v: number, pan: number) {
    const ctx = this.ctx!;
    const o = this.out(0.34 * v, pan, 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;
    bp.connect(o);
    this.tone(bp, 'sawtooth', 196 * p, 190 * p, t, 0.008, 0.42, 0.55);
    this.tone(bp, 'sawtooth', 247 * p, 240 * p, t, 0.008, 0.42, 0.45);
  }
  private s_hornCart(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.3 * v, pan, 0.15);
    this.tone(o, 'square', 880 * p, 880 * p, t, 0.004, 0.09, 0.28);
    this.tone(o, 'square', 1175 * p, 1175 * p, t + 0.13, 0.004, 0.12, 0.28);
  }
  private s_hornHover(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.4 * v, pan, 0.25);
    this.tone(o, 'sine', 320 * p, 980 * p, t, 0.01, 0.2, 0.6);
    this.tone(o, 'triangle', 640 * p, 1960 * p, t, 0.01, 0.18, 0.18);
    this.noiseBurst(o, t, 0.02, 0.2, 0.25, 'bandpass', 900 * p, 3200 * p, 1.2);
  }
  private s_hornBoat(t: number, p: number, v: number, pan: number) {
    const ctx = this.ctx!;
    const o = this.out(0.4 * v, pan, 0.5);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.9;
    bp.connect(o);
    this.tone(bp, 'sawtooth', 123 * p, 117 * p, t, 0.03, 0.7, 0.6);
    this.tone(bp, 'square', 185 * p, 176 * p, t, 0.03, 0.7, 0.3);
  }
  private s_jingle(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.35);
    // C-E-G-C ... a music-box tune of our own
    const tune = [72, 76, 79, 84, 83, 79, 76, -1, 81, 77, 74, 77, 79, 76, 72];
    tune.forEach((n, i) => {
      if (n < 0) return;
      const f = midi(n) * p, tt = t + i * 0.15;
      this.tone(o, 'triangle', f, f, tt, 0.004, 0.22, 0.55);
      this.tone(o, 'sine', f * 2, f * 2, tt, 0.002, 0.14, 0.18);
    });
  }

  // Car
  private s_horn(t: number, p: number, v: number, pan: number) {
    // real-ish two-tone car horn
    const ctx = this.ctx!;
    const o = this.out(0.32 * v, pan, 0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.8;
    bp.connect(o);
    for (const [off, dur] of [[0, 0.16], [0.21, 0.28]] as const) {
      this.tone(bp, 'sawtooth', 415 * p, 415 * p, t + off, 0.006, dur, 0.5);
      this.tone(bp, 'sawtooth', 523 * p, 523 * p, t + off, 0.006, dur, 0.45);
    }
  }
  private s_bump(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.15);
    this.tone(o, 'sine', 110 * p, 45 * p, t, 0.002, 0.18, 0.9);
    this.noiseBurst(o, t, 0.001, 0.09, 0.45, 'lowpass', 1400 * p, 300 * p, 1);
  }
  private s_boost(t: number, p: number, v: number, pan: number) {
    // turbo whoosh: rising filtered noise + saw sweep
    const o = this.out(0.6 * v, pan, 0.2);
    this.noiseBurst(o, t, 0.05, 0.6, 0.5, 'bandpass', 400 * p, 3000 * p, 2);
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120 * p, t);
    osc.frequency.exponentialRampToValueAtTime(480 * p, t + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    this.env(g, t, 0.05, 0.25, 0.55);
    osc.connect(lp);
    lp.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + 0.7);
  }
  private s_skid(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.1 * v, pan, 0.1);
    this.noiseBurst(o, t, 0.02, 0.35, 0.5, 'bandpass', 2200 * p, 1600 * p, 6);
  }

  // Build
  private s_snap(t: number, p: number, v: number, pan: number) {
    // chunky "place" thunk-click
    const o = this.out(0.85 * v, pan, 0.15);
    this.noiseBurst(o, t, 0.0008, 0.03, 0.6, 'bandpass', 1700 * p, 1100 * p, 3);
    this.tone(o, 'sine', 180 * p, 90 * p, t, 0.001, 0.09, 0.7);
    this.tone(o, 'square', 2200 * p, 2200 * p, t, 0.0005, 0.008, 0.12);
  }
  // ── v3 locker: equip + reveal stings ──
  /** equip: a bright "shing" sweep + a two-note rise (pitch up = rarer) */
  private s_equip(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.6 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.012, 0.2, 0.4, 'bandpass', 1500 * p, 6500 * p, 1.4);
    this.tone(o, 'sine', 660 * p, 1320 * p, t, 0.003, 0.16, 0.5);
    this.synth(o, 'square', midi(79) * p, t + 0.07, 0.12, 0.4, 5000, 3);
    this.synth(o, 'square', midi(86) * p, t + 0.13, 0.22, 0.4, 5000, 3);
    this.kick(o, t, 0.35);
  }
  /** reveal: rising swell → chord hit with a sparkle tail (epic / legendary unlock card) */
  private s_reveal(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.55 * v, pan, 0.4);
    this.noiseBurst(o, t, 0.34, 0.14, 0.5, 'bandpass', 300 * p, 5200 * p, 1.2);
    [72, 76, 79, 84, 88, 91].forEach((n, i) => this.synth(o, 'square', midi(n) * p, t + 0.34 + i * 0.05, 0.14, 0.28, 5200, 3));
    this.kick(o, t + 0.38, 0.9);
    for (const n of [60, 64, 67, 72]) this.synth(o, 'sawtooth', midi(n + 12) * p, t + 0.38, 0.9, 0.26, 5200, 12);
    this.tone(o, 'sine', midi(36) * p, midi(36) * p, t + 0.38, 0.01, 0.8, 0.5);
    this.noiseBurst(o, t + 0.38, 0.002, 0.9, 0.3, 'highpass', 6500, 6500, 0.7);
    this.s_sparkle(t + 0.55, p, v * 0.9, pan);
  }
  private s_puff(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.6 * v, pan, 0.2);
    this.noiseBurst(o, t, 0.01, 0.26, 0.6, 'lowpass', 2400 * p, 250 * p, 1);
    this.tone(o, 'sine', 300 * p, 120 * p, t, 0.002, 0.1, 0.3);
  }

  // ── v3 build (W5): material sounds for world pieces ──
  /** wood: a hollow thunk with a woody tok on top */
  private s_thunk(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.95 * v, pan, 0.12);
    this.tone(o, 'sine', 150 * p, 62 * p, t, 0.001, 0.16, 0.95);
    this.tone(o, 'triangle', 430 * p, 260 * p, t, 0.001, 0.05, 0.5);
    this.noiseBurst(o, t, 0.0006, 0.045, 0.6, 'bandpass', 720 * p, 520 * p, 2.2);
  }
  /** brick: a heavy dull clunk, a gritty stone scrape on the end */
  private s_clunk(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.0 * v, pan, 0.1);
    this.tone(o, 'sine', 100 * p, 44 * p, t, 0.001, 0.22, 1.0);
    this.noiseBurst(o, t, 0.0006, 0.06, 0.7, 'lowpass', 1500 * p, 500 * p, 1.2);
    this.noiseBurst(o, t + 0.02, 0.002, 0.07, 0.35, 'bandpass', 2600 * p, 1800 * p, 3);
    this.tone(o, 'square', 190 * p, 120 * p, t, 0.001, 0.03, 0.18);
  }
  /** metal: a ringing clang, inharmonic partials fading out */
  private s_clang(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.3);
    this.tone(o, 'sine', 120 * p, 70 * p, t, 0.001, 0.12, 0.7);
    this.noiseBurst(o, t, 0.0005, 0.02, 0.6, 'highpass', 3600 * p, 3000 * p, 1);
    for (const [f, g, d] of [[518, 0.5, 0.42], [1377, 0.34, 0.32], [2214, 0.22, 0.22], [3351, 0.14, 0.14]] as const) {
      this.tone(o, 'sine', f * p, f * p * 0.995, t, 0.0008, d, g);
    }
  }
  /** a wall opening cut / filled: a quick crunchy chop */
  private s_chop(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.1);
    this.noiseBurst(o, t, 0.0006, 0.05, 0.7, 'bandpass', 1800 * p, 900 * p, 2);
    this.tone(o, 'triangle', 330 * p, 200 * p, t, 0.001, 0.06, 0.5);
  }

  // ── ASMR core (realistic — unchanged character) ──
  private s_squelch(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.75 * v, pan, 0.25);
    const d = rand(0.18, 0.3);
    this.noiseBurst(o, t, 0.02, d, 0.55, 'bandpass', 420 * p, 1300 * p, 2.6);
    this.noiseBurst(o, t + 0.03, 0.03, d * 0.8, 0.3, 'lowpass', 900 * p, 300 * p, 4);
    this.tone(o, 'sine', 120 * p, 80 * p, t, 0.01, d, 0.22);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.wetClick(o, t + rand(0.02, d), p * rand(0.8, 1.3), 0.25);
  }
  private wetClick(o: AudioNode, t: number, p: number, peak: number) {
    this.tone(o, 'sine', 2200 * p, 1100 * p, t, 0.0008, 0.012, peak);
    this.noiseBurst(o, t, 0.0005, 0.012, peak * 0.9, 'bandpass', 2600 * p, 1800 * p, 6);
  }
  private s_slimeClick(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.2);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.wetClick(o, t + i * rand(0.015, 0.04), p * rand(0.75, 1.35), 0.55);
    this.tone(o, 'sine', 320 * p, 180 * p, t, 0.002, 0.04, 0.2);
  }
  private s_slimeStretch(t: number, p: number, v: number, pan: number) {
    const o = this.out(1.0 * v, pan, 0.2);
    this.noiseBurst(o, t, 0.04, 0.22, 0.3, 'bandpass', 700 * p, 1500 * p, 3.5);
    for (let i = 0; i < 3; i++) this.wetClick(o, t + rand(0.01, 0.2), p * rand(0.7, 1.1), 0.2);
  }
  private s_poke(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.2);
    this.tone(o, 'sine', 300 * p, 140 * p, t, 0.002, 0.09, 0.6);
    this.wetClick(o, t + 0.01, p, 0.5);
  }
  private s_crunch(t: number, p: number, v: number, pan: number) {
    // crisp wax crack: a fast cluster of tiny bright impulses + snap
    const o = this.out(0.9 * v, pan, 0.15);
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
    const o = this.out(1.1 * v, pan, 0.2);
    this.noiseBurst(o, t, 0.0005, 0.02, 0.5, 'bandpass', 4200 * p, 3000 * p, 4);
    this.tone(o, 'sine', 3600 * p, 3300 * p, t, 0.0005, 0.03, 0.12);
  }
  private s_flakeLand(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.3 * v, pan, 0.15);
    this.tone(o, 'triangle', 1900 * p, 1600 * p, t, 0.0005, 0.03, 0.4);
    this.noiseBurst(o, t, 0.0005, 0.015, 0.3, 'highpass', 3000 * p, 3000 * p, 1);
  }
  private s_gloop(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.3);
    this.tone(o, 'sine', 210 * p, 70 * p, t, 0.01, 0.38, 0.8);
    this.noiseBurst(o, t, 0.02, 0.3, 0.35, 'lowpass', 900 * p, 200 * p, 6);
    for (let i = 0; i < 5; i++) this.bubble(o, t + 0.1 + i * rand(0.05, 0.12), p * rand(0.8, 1.4), 0.35);
  }
  private bubble(o: AudioNode, t: number, p: number, peak: number) {
    this.tone(o, 'sine', 220 * p, 520 * p, t, 0.004, 0.05, peak);
  }
  private s_drip(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.3);
    this.tone(o, 'sine', 500 * p, 1300 * p, t, 0.002, 0.06, 0.5);
  }

  // ── v3 movement (W4): boing, party honk, glider fwump, landing thud, POI sting, bus fanfare, mantle hup, wind ──
  /** Launch pad: a big springy BOI-oi-oing. */
  private s_boing(t: number, p: number, v: number, pan: number) {
    const ctx = this.ctx!;
    const o = this.out(0.95 * v, pan, 0.3);
    this.tone(o, 'sine', 150 * p, 62 * p, t, 0.003, 0.14, 0.95); // the thump of the pad
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = osc.frequency;
    f.setValueAtTime(180 * p, t);
    f.exponentialRampToValueAtTime(780 * p, t + 0.08);
    f.exponentialRampToValueAtTime(300 * p, t + 0.2);
    f.exponentialRampToValueAtTime(940 * p, t + 0.33);
    f.exponentialRampToValueAtTime(380 * p, t + 0.52);
    f.exponentialRampToValueAtTime(520 * p, t + 0.7);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(140, t);
    lg.gain.exponentialRampToValueAtTime(8, t + 0.75);
    lfo.connect(lg);
    lg.connect(osc.detune);
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.55, 0.7);
    osc.connect(g);
    g.connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.85);
    lfo.stop(t + 0.85);
    this.noiseBurst(o, t + 0.04, 0.05, 0.4, 0.4, 'bandpass', 400 * p, 3200 * p, 1.2); // the whoosh up
    this.s_sparkle(t + 0.12, p * 1.1, v * 0.7, pan);
  }
  /** The party bus's silly horn: a short toot, then a long wobbly HOOONK. */
  private s_honk(t: number, p: number, v: number, pan: number) {
    const ctx = this.ctx!;
    const o = this.out(0.5 * v, pan, 0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950;
    bp.Q.value = 0.9;
    bp.connect(o);
    this.tone(bp, 'sawtooth', 247 * p, 247 * p, t, 0.008, 0.12, 0.55);
    this.tone(bp, 'sawtooth', 311 * p, 311 * p, t, 0.008, 0.12, 0.45);
    this.tone(bp, 'square', 124 * p, 124 * p, t, 0.008, 0.12, 0.3);
    const t2 = t + 0.2;
    this.tone(bp, 'sawtooth', 247 * p, 196 * p, t2, 0.01, 0.5, 0.6, 6);
    this.tone(bp, 'sawtooth', 311 * p, 247 * p, t2, 0.01, 0.5, 0.5, -6);
    this.tone(bp, 'square', 124 * p, 98 * p, t2, 0.01, 0.5, 0.32);
  }
  /** The glider pops open: cloth FWUMP + a flutter. */
  private s_deploy(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.8 * v, pan, 0.25);
    this.tone(o, 'sine', 110 * p, 48 * p, t, 0.004, 0.18, 0.85);
    this.noiseBurst(o, t, 0.01, 0.22, 0.7, 'lowpass', 400 * p, 2600 * p, 0.8);
    this.noiseBurst(o, t + 0.08, 0.01, 0.35, 0.35, 'bandpass', 1500 * p, 700 * p, 2.2);
    for (let i = 0; i < 4; i++) this.noiseBurst(o, t + 0.14 + i * 0.07, 0.004, 0.06, 0.25 - i * 0.05, 'bandpass', 1900 * p, 1100 * p, 3);
  }
  /** Landing: a soft thud and a puff of dust. */
  private s_thud(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.9 * v, pan, 0.15);
    this.tone(o, 'sine', 125 * p, 42 * p, t, 0.002, 0.22, 0.95);
    this.noiseBurst(o, t, 0.002, 0.2, 0.55, 'lowpass', 1100 * p, 220 * p, 0.8);
    this.noiseBurst(o, t + 0.03, 0.02, 0.3, 0.3, 'bandpass', 1800 * p, 600 * p, 1.4);
  }
  /** POI title card: whoosh in, then a bold two-note hit. */
  private s_sting(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.5 * v, pan, 0.3);
    this.noiseBurst(o, t, 0.12, 0.18, 0.45, 'bandpass', 300 * p, 3200 * p, 1.1);
    this.kick(o, t + 0.12, 0.7);
    this.synth(o, 'sawtooth', midi(67) * p, t + 0.1, 0.09, 0.4, 3800, 8);
    for (const n of [74, 79, 83]) this.synth(o, 'sawtooth', midi(n) * p, t + 0.19, 0.5, 0.32, 4600, 10);
    this.tone(o, 'sine', midi(43) * p, midi(43) * p, t + 0.19, 0.01, 0.45, 0.5);
  }
  /** Party-bus arrival: a bright rising arpeggio with a cymbal wash. */
  private s_fanfare(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.45 * v, pan, 0.35);
    [60, 64, 67, 72, 76, 79].forEach((n, i) => this.synth(o, 'square', midi(n + 12) * p, t + i * 0.07, 0.14, 0.32, 5200, 3));
    this.kick(o, t + 0.45, 0.8);
    for (const n of [67, 72, 76, 79]) this.synth(o, 'sawtooth', midi(n + 12) * p, t + 0.45, 0.8, 0.26, 5200, 12);
    this.noiseBurst(o, t + 0.45, 0.01, 0.7, 0.3, 'highpass', 7000, 5000, 0.7);
  }
  /** Zipline: the pulley ratchets onto the cable, then a metallic zing and a rush. */
  private s_zip(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.7 * v, pan, 0.2);
    for (let i = 0; i < 9; i++) this.noiseBurst(o, t + i * 0.042 * (1 - i * 0.04), 0.0005, 0.012, 0.5, 'bandpass', (2600 + i * 260) * p, (2600 + i * 260) * p, 6);
    this.tone(o, 'sine', 640 * p, 1700 * p, t + 0.3, 0.01, 0.28, 0.16);
    this.noiseBurst(o, t + 0.28, 0.06, 0.55, 0.45, 'bandpass', 500 * p, 3200 * p, 1.1);
  }
  /** Mantle: a quick "hup!" and a scuff. */
  private s_hup(t: number, p: number, v: number, pan: number) {
    const o = this.out(0.55 * v, pan, 0.1);
    this.tone(o, 'sine', 230 * p, 420 * p, t, 0.004, 0.09, 0.6);
    this.noiseBurst(o, t, 0.004, 0.1, 0.4, 'bandpass', 1500 * p, 900 * p, 1.5);
    this.noiseBurst(o, t + 0.22, 0.002, 0.06, 0.3, 'lowpass', 700 * p, 300 * p, 1);
  }

  // wind while skydiving / gliding (a bandpassed noise loop that follows the speed)
  private wind: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode } | null = null;
  windStart(): void {
    if (!this.ctx || this.wind) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    src.start(0, Math.random() * 1.5);
    g.gain.setTargetAtTime(0.18, ctx.currentTime, 0.15);
    this.wind = { src, bp, g };    this.loopSeen.wind = performance.now();
    this.armLoopDog();
  }
  windSet(speed01: number, dive: number): void {
    if (!this.ctx) return;
    if (!this.wind) this.windStart();
    const w = this.wind;
    if (!w) return;
    this.loopSeen.wind = performance.now();
    const t = this.ctx.currentTime;
    w.bp.frequency.setTargetAtTime(380 + speed01 * 1500 + dive * 600, t, 0.12);
    w.g.gain.setTargetAtTime(0.1 + speed01 * 0.42 + dive * 0.1, t, 0.12);
  }
  windStop(): void {
    if (!this.ctx || !this.wind) return;
    const w = this.wind;
    this.wind = null;
    w.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    setTimeout(() => w.src.stop(), 700);
  }

  /**
   * Looping noise voices (slide scrape, glide/zip wind) are refreshed every frame
   * while they're live. If the refreshes stop (a missed stop event: hopping into a
   * ride mid-slide, a scene change, a slide that launches into a glide) the voice
   * fades itself out instead of hissing forever.
   */
  private loopSeen = { slide: 0, wind: 0 };
  private loopDog: number | null = null;
  private armLoopDog(): void {
    if (this.loopDog !== null) return;
    this.loopDog = window.setInterval(() => {
      const now = performance.now();
      if (this.slideV && now - this.loopSeen.slide > 300) this.slideStop();
      if (this.wind && now - this.loopSeen.wind > 300) this.windStop();
      if (!this.slideV && !this.wind && this.loopDog !== null) {
        clearInterval(this.loopDog);
        this.loopDog = null;
      }
    }, 120);
  }

  // the slide: a scrape that follows the speed (a soft hiss on snow, a rougher rumble on the ground)
  private slideV: { src: AudioBufferSourceNode; bp: BiquadFilterNode; lp: BiquadFilterNode; g: GainNode } | null = null;
  slideStart(): void {
    if (!this.ctx || this.slideV) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(this.sfx);
    src.start(0, Math.random() * 1.5);
    g.gain.setTargetAtTime(0.12, ctx.currentTime, 0.05);
    this.slideV = { src, bp, lp, g };    this.loopSeen.slide = performance.now();
    this.armLoopDog();
  }
  slideSet(speed01: number, snow: boolean): void {
    if (!this.ctx) return;
    if (!this.slideV) this.slideStart();
    const v = this.slideV;
    if (!v) return;
    this.loopSeen.slide = performance.now();
    const t = this.ctx.currentTime;
    v.bp.frequency.setTargetAtTime((snow ? 1700 : 650) + speed01 * (snow ? 1800 : 900), t, 0.08);
    v.bp.Q.setTargetAtTime(snow ? 0.55 : 1.1, t, 0.1);
    v.g.gain.setTargetAtTime((snow ? 0.12 : 0.18) + speed01 * 0.38, t, 0.08);
  }
  slideStop(): void {
    if (!this.ctx || !this.slideV) return;
    const v = this.slideV;
    this.slideV = null;
    v.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.09);
    setTimeout(() => v.src.stop(), 600);
  }

  // ── continuous voices ─────────────────────────────────────────────────────
  engineStart(kind?: string): void {
    if (!this.ctx || this.engine) return;
    const V = ENGINE_VOICES[kind ?? 'sports'] ?? ENGINE_VOICES.sports;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = V.osc;
    const sub = ctx.createOscillator();
    sub.type = V.sub;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = V.lp;
    lp.Q.value = 3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = V.lfo;
    const am = ctx.createGain();
    am.gain.value = 0.8;
    const lfoG = ctx.createGain();
    lfoG.gain.value = V.lfoDepth;
    lfo.connect(lfoG);
    lfoG.connect(am.gain);
    // gritty rumble (filtered noise) + turbo whine that only appears at speed
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = V.rumbleLp;
    const rumbleG = ctx.createGain();
    rumbleG.gain.value = V.rumble;
    rumble.connect(rlp);
    rlp.connect(rumbleG);
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    const whineG = ctx.createGain();
    whineG.gain.value = 0;
    whine.connect(whineG);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(am);
    am.connect(g);
    rumbleG.connect(g);
    whineG.connect(g);
    g.connect(this.sfx);
    osc.frequency.value = tuning.audio.engineBaseHz * V.base;
    sub.frequency.value = (tuning.audio.engineBaseHz * V.base) / 2;
    for (const n of [osc, sub, lfo, whine]) n.start();
    rumble.start();
    g.gain.setTargetAtTime(tuning.audio.engineVolume * 0.6 * V.vol, ctx.currentTime, 0.2);
    this.engine = { osc, sub, whine, whineG, rumble, rumbleG, lp, g, lfo, v: V };
  }

  engineSet(speed01: number, throttle: number): void {
    if (!this.ctx || !this.engine) return;
    const a = tuning.audio;
    const t = this.ctx.currentTime;
    const e = this.engine;
    const V = e.v;
    const f = a.engineBaseHz * V.base + (a.engineTopHz * V.top - a.engineBaseHz * V.base) * speed01;
    e.osc.frequency.setTargetAtTime(f, t, 0.08);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.08);
    e.whine.frequency.setTargetAtTime(f * 7, t, 0.1);
    e.whineG.gain.setTargetAtTime(Math.max(0, speed01 - 0.45) * 0.05 * V.whine, t, 0.15);
    e.lfo.frequency.setTargetAtTime(V.lfo * 0.7 + speed01 * V.lfo * 1.4, t, 0.1);
    e.lp.frequency.setTargetAtTime(V.lp * 0.75 + speed01 * V.lp * 2 + throttle * V.lp * 0.8, t, 0.1);
    e.rumbleG.gain.setTargetAtTime(V.rumble * 0.8 + throttle * V.rumble, t, 0.1);
    e.g.gain.setTargetAtTime(a.engineVolume * V.vol * (0.5 + 0.5 * Math.max(speed01, throttle * 0.6)), t, 0.1);
  }

  engineStop(): void {
    if (!this.ctx || !this.engine) return;
    const e = this.engine;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      for (const n of [e.osc, e.sub, e.lfo, e.whine]) n.stop();
      e.rumble.stop();
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
    const o = this.out(1, 0, 0.4);
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

  // ── v3 emote (W5): the little tune that plays while she dances ───────────────────────────────
  // Its own step sequencer (data: emoteMusic.ts), so the town music keeps its place underneath (it ducks, then comes back).
  // juice.ts maps emoteStarted -> emoteStart(id) and emoteStopped -> emoteStop().
  private em: { id: string; tune: ParsedTune; step: number; next: number; t0: number; bus: GainNode; level: number; timer: number; ended: boolean } | null = null;
  private emDucked = false;

  /** The id of the emote tune that is playing (tests / debug), or null. */
  get emoteTune(): string | null {
    return this.em ? this.em.id : null;
  }

  emoteStart(id: string): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.emoteStop();
    const tune = tuneFor(id);
    const a = tuning.audio, e = tuning.emote3;
    if (!tune || a.music <= 0) return;
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    const level = a.music * 0.55 * 1.5 * e.musicVol * tune.gain;
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(level, now + 0.06);
    bus.connect(this.master);
    const rv = ctx.createGain();
    rv.gain.value = tune.reverb * 2;
    bus.connect(rv);
    rv.connect(this.reverbSend);
    // the town music drops under her tune
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(a.music * 0.55 * e.duck, now, 0.12);
    this.emDucked = true;
    const t0 = now + 0.06;
    this.em = { id, tune, step: 0, next: t0, t0, bus, level, timer: window.setInterval(() => this.emoteSchedule(), 25), ended: false };
    this.emoteSchedule();
  }

  /** Fade the tune out (about a quarter of a second) and let the town music back up. */
  emoteStop(): void {
    const ctx = this.ctx, m = this.em;
    this.em = null;
    if (m) {
      if (m.timer) clearInterval(m.timer);
      if (ctx) {
        const now = ctx.currentTime;
        m.bus.gain.cancelScheduledValues(now);
        m.bus.gain.setValueAtTime(m.level, now);
        m.bus.gain.linearRampToValueAtTime(0, now + 0.28);
        window.setTimeout(() => m.bus.disconnect(), 800);
      }
    }
    if (ctx && this.emDucked) {
      this.emDucked = false;
      const now = ctx.currentTime;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setTargetAtTime(tuning.audio.music * 0.55, now, 0.3);
    }
  }

  private emoteSchedule(): void {
    const ctx = this.ctx, m = this.em;
    if (!ctx || !m) return;
    const T = m.tune;
    const sd = 60 / T.bpm / 4;
    while (!m.ended && m.next < ctx.currentTime + 0.12) {
      if (!T.loop && m.step >= T.total) {
        // a one-shot sting played through: let its tail ring, then give the town music back (even if nobody says stop)
        m.ended = true;
        window.setTimeout(() => {
          if (this.em === m) this.emoteStop();
        }, 1800);
        break;
      }
      if (m.next - m.t0 > tuning.emote3.maxLoopSeconds) {
        this.emoteStop();
        return;
      }
      const t = m.next + (m.step % 2 === 1 ? sd * T.swing : 0);
      for (const h of T.hits[m.step % T.total]) this.emoteHit(h, t, sd, m.bus);
      m.next += sd;
      m.step++;
    }
    if (m.ended && m.timer) {
      clearInterval(m.timer);
      m.timer = 0;
    }
  }

  /** A sustained note: attack, hold, release (the pad and the chip leads); an optional lowpass. */
  private evoice(dest: AudioNode, type: OscillatorType, f: number, t: number, dur: number, peak: number, atk = 0.005, rel = 0.05, cutoff = 0, detune = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    const a = Math.min(atk, dur * 0.9);
    const pk = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    if (a > 0.1) g.gain.linearRampToValueAtTime(pk, t + a);
    else g.gain.exponentialRampToValueAtTime(pk, t + a);
    g.gain.setValueAtTime(pk, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    if (cutoff > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      lp.Q.value = 0.7;
      o.connect(lp);
      lp.connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + rel + 0.05);
  }

  private emoteHit(h: Hit, t: number, sd: number, dest: GainNode): void {
    const ctx = this.ctx!;
    const v = h.vol, ac = h.accent ? 1.35 : 1;
    const o = (vol: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = vol;
      g.connect(dest);
      return g;
    };
    const dur = Math.max(0.03, h.len * sd * 0.92);
    const n = h.notes;
    const f = n.length ? midi(n[0]) : 0;
    switch (h.inst) {
      // ── drums ──
      case 'kick': this.kick(o(0.55 * v * ac), t, 0.9); break;
      case 'softkick': this.tone(o(0.5 * v), 'sine', 120, 48, t, 0.004, 0.3, 0.8); break;
      case 'snare': {
        const g = o(0.35 * v * ac);
        this.noiseBurst(g, t, 0.001, 0.12, 0.7, 'bandpass', 2200, 1500, 0.8);
        this.tone(g, 'triangle', 220, 160, t, 0.001, 0.08, 0.35);
        break;
      }
      case 'clap': {
        const g = o(0.3 * v * ac);
        for (const d of [0, 0.012, 0.024]) this.noiseBurst(g, t + d, 0.001, 0.05, 0.6, 'bandpass', 1600, 1300, 1.5);
        break;
      }
      case 'hat': this.noiseBurst(o(0.12 * v * ac), t, 0.0005, 0.03, 0.7, 'highpass', 8000, 8000, 0.7); break;
      case 'ohat': this.noiseBurst(o(0.1 * v * ac), t, 0.002, 0.16, 0.6, 'highpass', 7000, 6000, 0.7); break;
      case 'rim': {
        const g = o(0.25 * v * ac);
        this.tone(g, 'square', 1800, 1500, t, 0.001, 0.03, 0.35);
        this.noiseBurst(g, t, 0.0008, 0.02, 0.3, 'bandpass', 3000, 3000, 1);
        break;
      }
      case 'shaker': this.noiseBurst(o(0.16 * v * ac), t, 0.012, 0.05, 0.5, 'bandpass', 6500, 6500, 1.2); break;
      case 'wood': {
        const g = o(0.3 * v * ac);
        this.tone(g, 'triangle', 980, 820, t, 0.001, 0.05, 0.8);
        this.tone(g, 'sine', 1960, 1800, t, 0.001, 0.025, 0.25);
        break;
      }
      case 'cow': {
        const g = o(0.18 * v * ac);
        this.tone(g, 'square', 587, 587, t, 0.002, 0.14, 0.5);
        this.tone(g, 'square', 845, 845, t, 0.002, 0.14, 0.5);
        break;
      }
      case 'boing': {
        const g = o(0.3 * v);
        this.tone(g, 'sine', 260, 900, t, 0.01, 0.36, 0.8);
        this.tone(g, 'triangle', 520, 1800, t, 0.01, 0.3, 0.25);
        break;
      }
      case 'crash': this.noiseBurst(o(0.2 * v), t, 0.002, 0.7, 0.6, 'highpass', 6000, 3500, 0.5); break;
      // ── basses ──
      case 'slap': {
        const g = o(0.38 * v);
        this.tone(g, 'triangle', f, f, t, 0.004, dur * 1.1, 0.85);
        this.synth(g, 'sawtooth', f, t, dur, 0.3, 900, 4);
        this.tone(g, 'square', f * 2, f * 2, t, 0.001, 0.04, 0.22);
        break;
      }
      case 'tribass': this.tone(o(0.42 * v), 'triangle', f, f, t, 0.006, dur, 0.9); break;
      case 'sub': for (const nn of n) this.evoice(o((0.4 * v) / Math.sqrt(n.length)), 'sine', midi(nn), t, dur, 0.9, 0.06, 0.4); break;
      // ── leads ──
      case 'chip': {
        const g = o(0.075 * v);
        this.evoice(g, 'square', f, t, dur, 0.5, 0.002, 0.03);
        this.evoice(g, 'square', f * 2, t, dur, 0.16, 0.002, 0.03);
        break;
      }
      case 'chip2': {
        const g = o(0.07 * v);
        this.evoice(g, 'square', f, t, dur, 0.5, 0.002, 0.05);
        this.evoice(g, 'triangle', f / 2, t, dur, 0.35, 0.002, 0.05);
        break;
      }
      case 'flute': {
        const g = o(0.14 * v);
        this.evoice(g, 'sine', f, t, dur, 0.7, 0.04, 0.14);
        this.evoice(g, 'triangle', f * 2, t, dur, 0.06, 0.05, 0.14);
        break;
      }
      case 'brass': {
        const g = o((0.085 * v) / Math.sqrt(n.length));
        for (const nn of n) this.synth(g, 'sawtooth', midi(nn), t, dur, 0.5, 3000, 9);
        break;
      }
      case 'stab': {
        const g = o(0.1 * v);
        for (const nn of n) this.synth(g, 'sawtooth', midi(nn), t, dur, 0.45, 2600, 10);
        break;
      }
      case 'pad': {
        const g = o(0.07 * v);
        for (const nn of n) {
          this.evoice(g, 'sawtooth', midi(nn), t, dur, 0.25, 0.9, 1.3, 1100, -8);
          this.evoice(g, 'sawtooth', midi(nn), t, dur, 0.25, 0.9, 1.3, 1100, 8);
        }
        break;
      }
      // ── plucked and struck ──
      case 'pluck': {
        const g = o(0.2 * v);
        for (const nn of n) {
          const ff = midi(nn);
          this.tone(g, 'triangle', ff, ff, t, 0.002, 0.34, 0.9);
          this.tone(g, 'square', ff * 2, ff * 2, t, 0.001, 0.05, 0.12);
        }
        break;
      }
      case 'pizz': {
        const g = o(0.26 * v);
        this.tone(g, 'triangle', f, f * 0.985, t, 0.002, 0.09, 0.9);
        this.tone(g, 'sine', f * 2, f * 2, t, 0.001, 0.05, 0.25);
        break;
      }
      case 'bell': {
        const g = o(0.12 * v);
        this.tone(g, 'sine', f, f, t, 0.002, 1.4, 0.8);
        this.tone(g, 'sine', f * 2.76, f * 2.76, t, 0.002, 0.5, 0.3);
        this.tone(g, 'sine', f * 5.4, f * 5.4, t, 0.002, 0.2, 0.1);
        break;
      }
      case 'marimba': {
        const g = o(0.2 * v);
        this.tone(g, 'sine', f, f, t, 0.002, 0.38, 0.9);
        this.tone(g, 'sine', f * 4, f * 4, t, 0.001, 0.06, 0.35);
        break;
      }
      case 'musicbox': {
        const g = o(0.16 * v);
        this.tone(g, 'sine', f, f, t, 0.002, 0.9, 0.8);
        this.tone(g, 'sine', f * 3, f * 3, t, 0.001, 0.35, 0.25);
        this.tone(g, 'triangle', f * 2, f * 2, t, 0.001, 0.5, 0.15);
        break;
      }
    }
  }

  // ── music: step-sequenced beats, one track per place ──────────────────────
  setTrack(track: MusicTrack): void {
    this.track = track;
  }

  /** desired music state, remembered until the AudioContext exists (first tap on iOS) */
  private wantMusic = false;

  setMusic(on: boolean): void {
    this.wantMusic = on;
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (!on) {
      if (this.seqTimer !== null) clearInterval(this.seqTimer);
      this.seqTimer = null;
      return;
    }
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    // lookahead scheduler: every 25 ms schedule anything due in the next 120 ms
    this.seqTimer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const T = TRACKS[this.track];
    const stepDur = 60 / T.bpm / 4; // 16th notes
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      // swing on odd 16ths
      const swing = this.step % 2 === 1 ? stepDur * T.swing : 0;
      this.playStep(T, this.step, this.nextStepTime + swing, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % (16 * T.chords.length);
    }
  }

  private playStep(T: TrackDef, step: number, t: number, sd: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16) % T.chords.length;
    const chord = T.chords[bar];
    const m = this.music;
    const out = (vol: number) => {
      const g = this.ctx!.createGain();
      g.gain.value = vol;
      g.connect(m);
      return g;
    };
    if (T.kick[s] === 'x') this.kick(out(0.55), t, 0.9);
    if (T.snare[s] === 'x') {
      const o = out(0.35);
      this.noiseBurst(o, t, 0.001, T.lofi ? 0.16 : 0.12, 0.7, 'bandpass', T.lofi ? 1400 : 2200, T.lofi ? 900 : 1500, 0.8);
      this.tone(o, 'triangle', 220, 160, t, 0.001, 0.08, 0.35);
    }
    if (T.clap?.[s] === 'x') {
      const o = out(0.3);
      for (const d of [0, 0.012, 0.024]) this.noiseBurst(o, t + d, 0.001, 0.05, 0.6, 'bandpass', 1600, 1300, 1.5);
    }
    if (T.hat[s] === 'x') this.noiseBurst(out(T.lofi ? 0.08 : 0.12), t, 0.0005, 0.03, 0.7, 'highpass', 8000, 8000, 0.7);
    if (T.openHat?.[s] === 'x') this.noiseBurst(out(0.1), t, 0.002, 0.16, 0.6, 'highpass', 7000, 6000, 0.7);
    // bass
    const b = T.bass[s];
    if (b !== '.') {
      const o = out(0.42);
      const f = midi(chord[0] - 24 + (b === 'o' ? 12 : 0));
      this.tone(o, T.lofi ? 'sine' : 'triangle', f, f, t, 0.005, sd * (T.bassLen ?? 1.8), 0.85);
      if (!T.lofi) this.synth(o, 'sawtooth', f, t, sd * 1.4, 0.25, 600, 4);
    }
    // chords
    if (T.stab[s] === 'x') {
      const o = out(T.lofi ? 0.13 : 0.1);
      for (const n of chord) {
        const f = midi(n);
        if (T.lofi) {
          // soft electric-piano-ish: sine + a little 2nd harmonic, gentle tremolo feel
          this.tone(o, 'sine', f, f, t, 0.008, sd * 6, 0.5);
          this.tone(o, 'sine', f * 2, f * 2, t, 0.004, sd * 2, 0.08);
        } else {
          this.synth(o, 'sawtooth', f, t, sd * (T.stabLen ?? 2.5), 0.45, 2600, 10);
        }
      }
    }
    // lead / arp
    if (T.arp && T.arp[s] !== '.') {
      const idx = parseInt(T.arp[s], 10);
      if (!Number.isNaN(idx)) {
        const n = chord[idx % chord.length] + 12;
        this.synth(out(0.07), T.lofi ? 'triangle' : 'square', midi(n), t, sd * 1.6, 0.5, 3200, 0);
      }
    }
    // ── v3 locker: optional lead melody (MIDI note per 16th, null = rest) ──
    const lead = T.lead?.[bar]?.[s];
    if (lead != null) {
      const o = out(0.085);
      this.synth(o, 'square', midi(lead), t, sd * 2.4, 0.5, 4200, 6);
      this.tone(o, 'sine', midi(lead - 12), midi(lead - 12), t, 0.004, sd * 1.6, 0.18);
    }
    // lo-fi vinyl crackle
    if (T.lofi && Math.random() < 0.35) this.noiseBurst(out(0.02), t + Math.random() * sd, 0.0005, 0.004, 0.8, 'highpass', 3000, 3000, 0.5);
  }
}

interface TrackDef {
  bpm: number;
  swing: number;          // fraction of a 16th the odd steps are delayed
  lofi?: boolean;
  chords: number[][];     // one chord (MIDI notes) per bar
  kick: string;           // 16 chars: x = hit, . = rest
  snare: string;
  clap?: string;
  hat: string;
  openHat?: string;
  bass: string;           // x = root, o = octave up, . = rest
  bassLen?: number;
  stab: string;
  stabLen?: number;
  arp?: string;           // digit = chord tone index
  lead?: (number | null)[][]; // v3 locker: per bar, 16 steps of MIDI notes (null = rest)
}

// Am  F  C  G (vi–IV–I–V) — the modern pop loop
const POP = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]];
// Dm9 G13 Cmaj9 Am9 — lo-fi jazz loop
const LOFI = [[50, 53, 57, 60, 64], [55, 59, 64, 65, 69], [48, 52, 55, 59, 62], [45, 48, 52, 55, 59]];

// ── v3 locker: "Lobby Lights" — an original upbeat lobby track for the Locker (C – G – Am – F, 124 bpm) ──
// Cmaj7 · Gmaj7 · Am7 · Fmaj7. Four-on-the-floor kick, offbeat open hats, syncopated funk bass, bright
// off-beat stabs and a catchy pentatonic hook (call → response) on top.
const LOCKER_CHORDS = [[60, 64, 67, 71], [67, 71, 74, 78], [57, 60, 64, 67], [65, 69, 72, 76]];
const LOCKER_LEAD: (number | null)[][] = [
  [76, null, 79, null, 76, null, 74, null, 72, null, 76, null, 79, null, 81, null],
  [79, null, null, 74, null, 79, null, 83, null, 81, null, 79, null, 74, null, null],
  [76, null, 81, null, 79, null, 76, null, 72, null, 76, null, 79, null, 76, null],
  [77, null, 81, null, 84, null, 81, null, 79, null, 77, null, 76, null, 74, 76],
];

const TRACKS: Record<MusicTrack, TrackDef> = {
  locker: {
    bpm: 124, swing: 0.05, chords: LOCKER_CHORDS,
    kick: 'x...x...x...x...', snare: '................', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', openHat: '..x...x...x...x.',
    bass: 'x..xo..x..x.o.x.', bassLen: 1.1, stab: 'x..x..x.x..x..x.', stabLen: 1.2,
    arp: '0.1.2.1.0.2.3.2.', lead: LOCKER_LEAD,
  },
  lobby: {
    bpm: 96, swing: 0.12, chords: POP,
    kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    bass: 'x.....x...o.....', stab: '..x.....x.....x.', stabLen: 2,
    arp: '0..1..2..3..2..1',
  },
  town: {
    bpm: 104, swing: 0.08, chords: POP,
    kick: 'x...x...x...x...', snare: '................', clap: '....x.......x...', hat: '..x...x...x...x.', openHat: '......x.......x.',
    bass: 'x.x.o.x.x.x.o.x.', bassLen: 1.2, stab: '..x...x...x...x.', stabLen: 1.4,
    arp: '0.1.2.3.2.1.0.2.',
  },
  studio: {
    bpm: 78, swing: 0.32, lofi: true, chords: LOFI,
    kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.',
    bass: 'x.........x..o..', bassLen: 3, stab: 'x.......x.......',
  },
  style: {
    bpm: 118, swing: 0, chords: POP,
    kick: 'x...x...x...x...', snare: '................', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', openHat: '..x...x...x...x.',
    bass: '..o...o...o...o.', bassLen: 1, stab: 'x.......x.......', stabLen: 3,
    arp: '0.2.1.3.0.2.1.3.',
  },
};

export type SoundName =
  // v3 rides
  | 'hornPickup' | 'hornCart' | 'hornHover' | 'hornBoat' | 'jingle'
  | 'tap' | 'tab' | 'back' | 'whoosh' | 'pop' | 'squelch' | 'slimeClick' | 'slimeStretch' | 'poke'
  | 'crunch' | 'flake' | 'flakeLand' | 'gloop' | 'drip' | 'snap' | 'blocked' | 'puff' | 'rotate'
  | 'chime' | 'switch' | 'sparkle' | 'swish' | 'horn' | 'bump' | 'hello' | 'happy' | 'confetti'
  | 'frost' | 'harden' | 'save'
  // v2
  | 'collect' | 'levelup' | 'step' | 'boost' | 'skid'
  // v2 r3: water
  | 'splash' | 'wade' | 'stroke'
  // v3 build
  | 'thunk' | 'clunk' | 'clang' | 'chop'
  // v3 locker
  | 'equip' | 'reveal'
  // v3 movement
  | 'boing' | 'honk' | 'deploy' | 'thud' | 'sting' | 'fanfare' | 'hup' | 'zip';

export const audio = new AudioEngine();
