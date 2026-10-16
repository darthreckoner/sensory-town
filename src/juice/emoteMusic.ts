// ── v3 emote (W5): the tunes that play while she dances ─────────────────────────────────────────
// Data only (no Web Audio here): audio.ts has the voices and a tiny step sequencer of its own, so the town's
// music keeps its place underneath. Every tune is an ORIGINAL little loop written for this game, at 120 bpm so
// that one beat is exactly one beat of the character's emote animation (art/character.ts: beat = t * 2).
//
// Notation (one string per bar, `|` and spaces are ignored in drum strings):
//   drum lines    16 (or `steps`) chars:  x = hit, X = accent, . = rest
//   note lines    `steps` tokens:         c4  f#3  eb5  (note + octave, middle C = c4) · `.` rest · `-` hold the last note
//   chord lines   (`chords` set) the bar string is a drum-style rhythm; every hit plays that bar's chord
//                 (`root` = play only its lowest note, shifted by that many semitones; `arp` = walk through chord tones)
// Lines whose bar list is shorter than the tune cycle: [a] repeats every bar, [a, b] alternates.
export type Inst =
  // drums (x / X / .)
  | 'kick' | 'softkick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'rim' | 'shaker' | 'wood' | 'cow' | 'boing' | 'crash'
  // voices (notes or chords)
  | 'slap' | 'tribass' | 'sub' | 'chip' | 'chip2' | 'pluck' | 'pizz' | 'bell' | 'marimba' | 'musicbox' | 'brass' | 'stab' | 'pad' | 'flute';

export interface Line {
  inst: Inst;
  vol?: number;
  /** note length in steps (default: the voice's own) */
  len?: number;
  bars: string[];
  chords?: string[];
  root?: number;
  arp?: number[];
}
export interface Tune {
  bpm: number;
  swing?: number;
  /** 16th-note steps per bar (16 for 4/4, 12 for a waltz or a 6/8 lilt) */
  steps: number;
  loop: boolean;
  /** how much reverb the tune sits in */
  reverb?: number;
  /** level trim (1 = the standard emote level; a pad or a music box is louder than it looks) */
  gain?: number;
  lines: Line[];
}

export interface Hit {
  inst: Inst;
  vol: number;
  len: number;
  /** MIDI notes (empty for drums) */
  notes: number[];
  accent: boolean;
}
export interface ParsedTune {
  bpm: number;
  swing: number;
  steps: number;
  loop: boolean;
  reverb: number;
  gain: number;
  /** number of steps in one pass of the tune */
  total: number;
  hits: Hit[][];
}

const DRUMS = new Set<Inst>(['kick', 'softkick', 'snare', 'clap', 'hat', 'ohat', 'rim', 'shaker', 'wood', 'cow', 'boing', 'crash']);
const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function noteNum(tok: string): number {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(tok);
  if (!m) throw new Error(`emote tune: bad note "${tok}"`);
  return 12 * (parseInt(m[3], 10) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const chordNotes = (c: string): number[] => c.split('+').map(noteNum).sort((a, b) => a - b);

export function parseTune(name: string, T: Tune): ParsedTune {
  const S = T.steps;
  const bars = Math.max(...T.lines.map((l) => Math.max(l.bars.length, l.chords?.length ?? 1)));
  const hits: Hit[][] = Array.from({ length: bars * S }, () => []);
  const fail = (l: Line, b: number, why: string): never => {
    throw new Error(`emote tune "${name}" · ${l.inst} · bar ${b + 1}: ${why}`);
  };
  for (const l of T.lines) {
    const vol = l.vol ?? 1;
    for (let b = 0; b < bars; b++) {
      const pat = l.bars[b % l.bars.length];
      const at = (s: number) => hits[b * S + s];
      if (DRUMS.has(l.inst) || l.chords) {
        const ch = pat.replace(/[\s|]/g, '');
        if (ch.length !== S) fail(l, b, `rhythm has ${ch.length} steps, wanted ${S}`);
        const chord = l.chords ? chordNotes(l.chords[b % l.chords.length]) : [];
        let k = 0;
        for (let s = 0; s < S; s++) {
          const c = ch[s];
          if (c !== 'x' && c !== 'X') continue;
          let notes: number[] = [];
          if (l.chords) notes = l.root !== undefined ? [chord[0] + l.root] : l.arp ? [chord[l.arp[k % l.arp.length] % chord.length]] : chord;
          k++;
          at(s).push({ inst: l.inst, vol, len: l.len ?? 1, notes, accent: c === 'X' });
        }
      } else {
        const toks = pat.replace(/\|/g, ' ').trim().split(/\s+/);
        if (toks.length !== S) fail(l, b, `${toks.length} tokens, wanted ${S}`);
        let last: Hit | null = null;
        for (let s = 0; s < S; s++) {
          const t = toks[s];
          if (t === '.') last = null;
          else if (t === '-') {
            if (last) last.len += 1;
          } else {
            last = { inst: l.inst, vol, len: l.len ?? 1, notes: [noteNum(t)], accent: false };
            at(s).push(last);
          }
        }
      }
    }
  }
  return { bpm: T.bpm, swing: T.swing ?? 0, steps: S, loop: T.loop, reverb: T.reverb ?? 0.15, gain: T.gain ?? 1, total: bars * S, hits };
}

// ── the tunes ────────────────────────────────────────────────────────────────────────────────────
const TUNES: Record<string, Tune> = {
  // Hello Wave: "hel-lo-o!" in marimba, with a sparkle on top (a one-shot sting)
  wave: {
    bpm: 120, steps: 16, loop: false, reverb: 0.3,
    lines: [
      { inst: 'marimba', vol: 1, bars: ['g5 . . c6 . . e6 . | g6 . . . . . . .'] },
      { inst: 'bell', vol: 0.5, bars: ['. . . . . . . . | . . c7 . . . . .'] },
      { inst: 'softkick', vol: 0.8, bars: ['x...............'] },
    ],
  },
  // Cheer Jump: two big hops. A pop fanfare and a confetti crash (sting)
  cheer: {
    bpm: 120, steps: 16, loop: false, reverb: 0.2,
    lines: [
      { inst: 'kick', bars: ['x...x...x.......'] },
      { inst: 'clap', bars: ['X.......X.......'] },
      { inst: 'brass', vol: 0.9, len: 2, chords: ['c4+e4+g4+c5'], bars: ['x.......x.......'] },
      { inst: 'chip', vol: 0.8, bars: ['. . . . c5 e5 g5 c6 | . . e6 . g6 . . .'] },
      { inst: 'crash', vol: 0.8, bars: ['..........x.....'] },
    ],
  },
  // Ta-da!: a low swell while she bows, then THE chord when her arms go wide (sting)
  tada: {
    bpm: 120, steps: 16, loop: false, reverb: 0.4,
    lines: [
      { inst: 'sub', vol: 0.9, len: 5, chords: ['g3+b3+d4', 'c3+e3+g3'], root: -12, bars: ['x...............', '.....x..........'] },
      { inst: 'pad', vol: 0.55, len: 5, chords: ['g3+b3+d4+f4', 'c4+e4+g4+c5'], bars: ['x...............', '.....x..........'] },
      { inst: 'brass', vol: 0.95, len: 7, chords: ['c4+e4+g4+c5'], bars: ['................', '.....x..........'] },
      { inst: 'bell', vol: 0.7, bars: ['. . . . . . . . . . . . . . . .', '. . . . . . c6 e6 | g6 c7 e7 . g7 . . .'] },
      { inst: 'crash', bars: ['................', '.....x..........'] },
    ],
  },
  // Heart Hands: a music-box lullaby, soft pulse underneath
  heart: {
    bpm: 120, steps: 16, loop: true, reverb: 0.45, gain: 0.6,
    lines: [
      { inst: 'musicbox', vol: 0.9, chords: ['g4+b4+d5', 'e4+g4+b4', 'c4+e4+g4', 'd4+f#4+a4'], arp: [0, 1, 2, 1], bars: ['x.x.x.x.x.x.x.x.'] },
      { inst: 'bell', vol: 0.8, bars: [
        'b5 . . . . . a5 . | g5 . . . . . . .',
        'g5 . . . b5 . . . | e6 . . . d6 . . .',
        'c6 . . . . . b5 . | a5 . . . g5 . . .',
        'a5 . . . f#5 . . . | a5 . . . . . . .',
      ] },
      { inst: 'sub', vol: 0.8, len: 4, chords: ['g3+b3+d4', 'e3+g3+b3', 'c3+e3+g3', 'd3+f#3+a3'], root: -12, bars: ['x.......x.......'] },
      { inst: 'softkick', vol: 0.8, bars: ['x...............'] },
    ],
  },
  // Twirl Time: a carousel waltz. One bar of 3/4 is exactly one turn (1.5 s)
  twirl: {
    bpm: 120, steps: 12, loop: true, reverb: 0.3, gain: 1.35,
    lines: [
      { inst: 'tribass', vol: 0.85, len: 3, chords: ['c3+e3+g3', 'f3+a3+c4', 'g3+b3+d4', 'c3+e3+g3'], root: -12, bars: ['x...........'] },
      { inst: 'pluck', vol: 0.55, len: 2, chords: ['c4+e4+g4', 'f4+a4+c5', 'g4+b4+d5', 'c4+e4+g4'], bars: ['....x...x...'] },
      { inst: 'musicbox', vol: 0.9, bars: [
        'e5 . . g5 . . c6 . . g5 . .',
        'a5 . . c6 . . f5 . . a5 . .',
        'b5 . . d6 . . g5 . . b5 . .',
        'c6 . . e6 . . c6 . . . . .',
      ] },
      { inst: 'shaker', vol: 0.5, bars: ['x...x...x...'] },
    ],
  },
  // Bounce Party: funky four-on-the-floor, a slap bass, off-beat stabs and a brassy hook
  bounce: {
    bpm: 120, swing: 0.06, steps: 16, loop: true, reverb: 0.12,
    lines: [
      { inst: 'kick', bars: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', 'x...x...x...x.xx'] },
      { inst: 'clap', bars: ['....X.......X...'] },
      { inst: 'hat', vol: 0.8, bars: ['x.x.x.x.x.x.x.x.'] },
      { inst: 'ohat', bars: ['..x...x...x...x.'] },
      { inst: 'shaker', vol: 0.5, bars: ['xxxxxxxxxxxxxxxx'] },
      { inst: 'slap', vol: 1, len: 1, bars: [
        'e2 . . e3 . e2 . g2 | . . a2 . b2 . e3 .',
        'a2 . . a3 . a2 . c3 | . . d3 . e3 . a3 .',
        'e2 . . e3 . e2 . g2 | . . a2 . b2 . e3 .',
        'b2 . . b3 . b2 . d3 | . . e3 . f#3 . b3 .',
      ] },
      { inst: 'stab', vol: 0.8, len: 1, chords: ['e3+g3+b3+d4', 'a3+c#4+e4+g4', 'e3+g3+b3+d4', 'b3+d#4+f#4+a4'], bars: ['..x...x...x..x..'] },
      { inst: 'brass', vol: 0.75, len: 1.5, bars: [
        'e5 . . g5 . e5 . . | d5 . b4 . . . . .',
        'a4 . . c#5 . e5 . . | d5 . c#5 . . . . .',
        'g5 . e5 . d5 . b4 . | d5 . e5 . . . . .',
        'f#5 . d#5 . b4 . . . | a4 . b4 . . . . .',
      ] },
    ],
  },
  // Side Shuffle: a swung, walking-bass shuffle with finger snaps and cheeky brass
  shuffle: {
    bpm: 120, swing: 0.33, steps: 16, loop: true, reverb: 0.15,
    lines: [
      { inst: 'kick', bars: ['x.......x.......'] },
      { inst: 'rim', bars: ['....X.......X...'] },
      { inst: 'hat', vol: 0.8, bars: ['x.x.x.x.x.x.x.x.'] },
      { inst: 'tribass', vol: 1, len: 3, bars: [
        'c2 . . . e2 . . . | g2 . . . a2 . . .',
        'f2 . . . a2 . . . | c3 . . . d3 . . .',
        'c2 . . . e2 . . . | g2 . . . a2 . . .',
        'g2 . . . b2 . . . | d3 . . . f3 . . .',
      ] },
      { inst: 'brass', vol: 0.65, len: 1, chords: ['c4+e4+g4+bb4', 'f4+a4+c5+eb5', 'c4+e4+g4+bb4', 'g3+b3+d4+f4'], bars: ['..x.....x.x.....'] },
      { inst: 'marimba', vol: 0.9, len: 1, bars: [
        'g5 . . e5 . g5 . . | a5 . g5 . e5 . c5 .',
        'a5 . . f5 . a5 . . | c6 . a5 . f5 . . .',
        'g5 . . e5 . g5 . . | a5 . g5 . e5 . c5 .',
        'd6 . b5 . g5 . . . | f5 . g5 . b5 . . .',
      ] },
    ],
  },
  // Robo Bop: eight-bit. Square-wave arpeggios, a triangle bass, a talky little hook
  robot: {
    bpm: 120, steps: 16, loop: true, reverb: 0.06,
    lines: [
      { inst: 'kick', bars: ['x...x...x...x...'] },
      { inst: 'snare', vol: 0.9, bars: ['....X.......X...', '....X.......X...', '....X.......X...', '....X.....x.xxx.'] },
      { inst: 'hat', vol: 0.8, bars: ['x.x.x.x.x.x.x.x.'] },
      { inst: 'tribass', vol: 0.9, len: 1.5, bars: [
        'a2 . a2 . a3 . a2 . | a2 . a2 . a3 . a2 .',
        'd2 . d2 . d3 . d2 . | d2 . d2 . d3 . d2 .',
        'f2 . f2 . f3 . f2 . | f2 . f2 . f3 . f2 .',
        'e2 . e2 . e3 . e2 . | e2 . e2 . e3 . e2 .',
      ] },
      { inst: 'chip', vol: 0.55, len: 1, bars: [
        'a4 c5 e5 a5 e5 c5 e5 c5 | a4 c5 e5 a5 e5 c5 e5 c5',
        'd5 f5 a5 d6 a5 f5 a5 f5 | d5 f5 a5 d6 a5 f5 a5 f5',
        'f4 a4 c5 f5 c5 a4 c5 a4 | f4 a4 c5 f5 c5 a4 c5 a4',
        'e4 g#4 b4 e5 b4 g#4 b4 g#4 | e4 g#4 b4 e5 b4 g#4 b4 g#4',
      ] },
      { inst: 'chip2', vol: 0.8, len: 1.4, bars: [
        'e6 . . e6 . d6 . . | c6 . . a5 . . . .',
        'd6 . . f6 . e6 . . | d6 . . a5 . . . .',
        'c6 . . a5 . c6 . . | f6 . . e6 . . . .',
        'b5 . . g#5 . b5 . . | e6 . . . . . . .',
      ] },
    ],
  },
  // Glow Stick Sway: a dreamy pad, a deep slow pulse and bells that twinkle (two bars per chord)
  sway: {
    bpm: 120, steps: 16, loop: true, reverb: 0.55, gain: 0.4,
    lines: [
      { inst: 'pad', vol: 1, len: 30, chords: ['d3+f#3+a3+c#4+e4', 'd3+f#3+a3+c#4+e4', 'f#3+a3+c#4+e4+g#4', 'f#3+a3+c#4+e4+g#4', 'g3+b3+d4+f#4+a4', 'g3+b3+d4+f#4+a4', 'a3+e4+g4+b4+d5', 'a3+e4+g4+b4+d5'], bars: ['x...............', '................'] },
      { inst: 'sub', vol: 0.9, len: 30, chords: ['d3+a3', 'd3+a3', 'f#3+c#4', 'f#3+c#4', 'g3+d4', 'g3+d4', 'a3+e4', 'a3+e4'], root: -24, bars: ['x...............', '................'] },
      { inst: 'bell', vol: 0.7, bars: [
        '. . . d6 . . . . | a5 . . . . f#5 . .',
        '. . e6 . . . . . | . . d6 . . . a5 .',
        '. . . a5 . . . . | c#6 . . . . e6 . .',
        '. . g#5 . . . . . | . . e6 . . . . c#6',
        '. . . b5 . . . . | d6 . . . . f#5 . .',
        '. . a5 . . . . . | . . d6 . . . b5 .',
        '. . . e6 . . . . | a5 . . . . b5 . .',
        '. . d6 . . . . . | . . a5 . . . e6 .',
      ] },
      { inst: 'softkick', vol: 0.55, bars: ['x...............', '........x.......'] },
      { inst: 'shaker', vol: 0.35, bars: ['x.x.x.x.x.x.x.x.'] },
    ],
  },
  // Giggle Fit: bouncy pizzicato "hee-hee-hee"s, wood blocks, one cheeky boing
  giggle: {
    bpm: 120, steps: 16, loop: true, reverb: 0.1, gain: 1.35,
    lines: [
      { inst: 'kick', vol: 0.8, bars: ['x.......x.......'] },
      { inst: 'wood', bars: ['..x...x...x...x.'] },
      { inst: 'hat', vol: 0.55, bars: ['x.x.x.x.x.x.x.x.'] },
      { inst: 'boing', vol: 0.8, bars: ['................', '................', '................', '.......x........'] },
      { inst: 'pizz', vol: 0.9, len: 2, bars: [
        'd3 . . . a2 . . . | d3 . . . a2 . . .',
        'd3 . . . a2 . . . | d3 . . . a2 . . .',
        'a2 . . . e3 . . . | a2 . . . e3 . . .',
        'd3 . . . a2 . . . | d3 . . . d3 . . .',
      ] },
      { inst: 'pizz', vol: 0.75, len: 1, bars: [
        'a5 . a5 . a5 . f#5 . | a5 . a5 . a5 . d6 .',
        'd6 d6 . d6 . a5 . . | f#5 . a5 . d6 . . .',
        'e6 . e6 . c#6 . e6 . | a5 . . a5 . c#6 . e6',
        'd6 . a5 . f#5 . d5 . | . . . . d5 d5 d5 .',
      ] },
    ],
  },
  // Sit & Swing: a lazy 6/8 lilt. Plucked chords, a whistled tune, a shaker
  swing: {
    bpm: 120, steps: 12, loop: true, reverb: 0.3,
    lines: [
      { inst: 'pluck', vol: 0.8, len: 2, chords: ['c4+e4+g4', 'a3+c4+e4', 'f3+a3+c4', 'g3+b3+d4+f4'], arp: [0, 1, 2, 1, 2, 1], bars: ['x.x.x.x.x.x.'] },
      { inst: 'tribass', vol: 0.9, len: 4, chords: ['c3+e3+g3', 'a2+c3+e3', 'f2+a2+c3', 'g2+b2+d3'], root: -12, bars: ['x.....x.....'] },
      { inst: 'flute', vol: 0.8, len: 3, bars: [
        'g5 . . . e5 . . . g5 . a5 .',
        'a5 . . . e5 . . . c5 . . .',
        'a5 . . . c6 . . . a5 . g5 .',
        'g5 . . . f5 . d5 . b4 . . .',
      ] },
      { inst: 'shaker', vol: 0.45, bars: ['x.x.x.x.x.x.'] },
      { inst: 'softkick', vol: 0.7, bars: ['x.....x.....'] },
    ],
  },
  // Party Dance: a bright disco-pop groove (the Dance_Loop clip is exactly two beats long: it lands on every kick)
  party: {
    bpm: 120, swing: 0.04, steps: 16, loop: true, reverb: 0.18,
    lines: [
      { inst: 'kick', bars: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', 'x...x...x...x.xx'] },
      { inst: 'clap', bars: ['....X.......X...', '....X.......X...', '....X.......X...', '....X.....x.X.x.'] },
      { inst: 'hat', vol: 0.7, bars: ['x.x.x.x.x.x.x.x.'] },
      { inst: 'ohat', bars: ['..x...x...x...x.'] },
      { inst: 'tribass', vol: 0.95, len: 1, bars: [
        'a2 . a3 . a2 . a3 . | a2 . a3 . c3 . e3 .',
        'f2 . f3 . f2 . f3 . | f2 . f3 . a2 . c3 .',
        'c3 . c4 . c3 . c4 . | c3 . c4 . e3 . g3 .',
        'g2 . g3 . g2 . g3 . | g2 . g3 . b2 . d3 .',
      ] },
      { inst: 'stab', vol: 0.7, len: 1, chords: ['a3+c4+e4', 'f3+a3+c4', 'c4+e4+g4', 'g3+b3+d4'], bars: ['..x...x...x..x..'] },
      { inst: 'pluck', vol: 0.8, len: 1, bars: [
        'e5 . . g5 . a5 . . | g5 . e5 . . . . .',
        'c5 . . f5 . a5 . . | g5 . f5 . . . . .',
        'e5 . . g5 . c6 . . | b5 . g5 . . . . .',
        'd5 . . g5 . b5 . . | a5 . g5 . d5 . . .',
      ] },
      { inst: 'bell', vol: 0.55, len: 2, bars: ['a5 . . . . . . . | . . . . e6 . . .', 'f5 . . . . . . . | . . . . c6 . . .', 'g5 . . . . . . . | . . . . e6 . . .', 'g5 . . . . . . . | . . . . d6 . . .'] },
    ],
  },
};

const cache = new Map<string, ParsedTune>();
/** The parsed tune for an emote id, or null when there is none (an emote the Locker adds later just plays without music). */
export function tuneFor(id: string): ParsedTune | null {
  let p = cache.get(id);
  if (!p) {
    const T = TUNES[id];
    if (!T) return null;
    p = parseTune(id, T);
    cache.set(id, p);
  }
  return p;
}
export const EMOTE_TUNE_IDS = Object.keys(TUNES);
/** Parse every tune (throws with the tune / bar on a typo). Used by the self-test. */
export function checkTunes(): string[] {
  const bad: string[] = [];
  for (const id of EMOTE_TUNE_IDS) {
    try {
      const p = parseTune(id, TUNES[id]);
      if (!p.hits.some((h) => h.length)) bad.push(`${id}: empty`);
    } catch (e) {
      bad.push(String((e as Error).message));
    }
  }
  return bad;
}
