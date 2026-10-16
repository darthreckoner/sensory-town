// The juice layer: listens to gameplay events and answers with sound +
// visuals. Gameplay never calls audio/fx directly — add mappings here.
import { bus } from '../core/events';
import { scenes } from '../core/scene';
import { popScale } from '../core/tween';
import { tuning } from '../tuning';
import { audio } from './audio';
import { fx } from './fx';
import { store } from '../core/store';
import { toast } from '../ui/ui';

export function initJuice(): void {
  scenes.frameHooks.push((dt) => fx.update(dt));
  scenes.sceneHooks.push((s) => {
    fx.attach(s.scene, s.camera, s.fxScale);
    const inWorkshop = s.name === 'workshop';
    // a beat per place: lobby (picker), town + build, lo-fi studio, runway style
    audio.setTrack(s.name === 'picker' ? 'lobby' : s.name === 'workshop' ? 'studio' : s.name === 'dressup' ? 'locker' : 'town'); // v3 locker: the Locker has its own lobby track
    audio.setMusic(tuning.audio.music > 0 && (!inWorkshop || store.data.settings.musicInWorkshop));
  });

  // ── UI ──
  bus.on('uiTap', ({ kind }) => audio.play(kind === 'tab' ? 'tab' : kind === 'back' ? 'back' : 'tap'));
  bus.on('uiOpen', () => audio.play('swish', { pitch: 1.2, vol: 0.6 }));
  bus.on('uiClose', () => audio.play('swish', { pitch: 0.9, vol: 0.5 }));
  bus.on('sceneChange', ({ from }) => {
    if (from) audio.play('whoosh');
  });
  bus.on('profileSwitch', () => audio.play('switch'));
  bus.on('profileCreated', () => audio.play('happy'));
  bus.on('creationSaved', ({ pos }) => {
    audio.play('save');
    if (pos) fx.burst('sparkle', pos, { count: 30, color: ['#ffffff', '#ffc93c', '#ff2e88', '#00d4ff'] });
  });
  bus.on('townExported', () => audio.play('chime'));
  bus.on('townImported', () => audio.play('happy'));
  bus.on('reset', ({ pos }) => {
    audio.play('pop', { pitch: 0.8 });
    if (pos) fx.burst('puff', pos, { count: 10 });
  });

  bus.on('optionPicked', ({ pos }) => {
    audio.play('pop', { pitch: 1.2 });
    if (pos) fx.burst('sparkle', pos, { count: 12, size: 0.8 });
  });

  // ── Dress-up ──
  bus.on('outfitChanged', ({ pos, object }) => {
    audio.play('swish');
    audio.play('sparkle', { vol: 0.7 });
    if (pos) fx.burst('sparkle', pos, { count: tuning.dressup.sparkleCount, color: ['#ffffff', '#ff2e88', '#7c4dff', '#00d4ff'] });
    if (object) popScale(object, 0.4, 0.12);
  });
  bus.on('colorPicked', () => audio.play('pop', { pitch: 1.4, vol: 0.6 }));
  bus.on('photoFlash', ({ pos }) => {
    audio.play('snap', { pitch: 1.6, vol: 0.8 });
    audio.play('sparkle', { vol: 0.6, pitch: 1.2 });
    if (pos) fx.burst('sparkle', pos, { count: 18, color: ['#ffffff', '#ff2e88', '#00d4ff'], size: 1.1 });
  });
  // ── v3 locker: equipping + the unlock reveal ──
  const RARITY_FX: Record<string, { pitch: number; count: number; colors: string[] }> = {
    common: { pitch: 1, count: 14, colors: ['#ffffff', '#b7bcc9'] },
    uncommon: { pitch: 1.06, count: 20, colors: ['#ffffff', '#5fd447', '#aef59a'] },
    rare: { pitch: 1.12, count: 26, colors: ['#ffffff', '#36a8ff', '#9bd6ff'] },
    epic: { pitch: 1.2, count: 34, colors: ['#ffffff', '#b65cff', '#dcaeff', '#ff2e88'] },
    legendary: { pitch: 1.3, count: 46, colors: ['#ffffff', '#ffb02e', '#ffe08a', '#ff8a1f'] },
  };
  bus.on('lockerEquipped', ({ pos, object, rarity }) => {
    const r = RARITY_FX[rarity] ?? RARITY_FX.common;
    audio.play('equip', { pitch: r.pitch });
    if (pos) fx.burst('sparkle', pos, { count: r.count, color: r.colors, size: 1.1 });
    if (object) popScale(object, 0.45, 0.14);
  });
  bus.on('revealShown', ({ rarity }) => {
    if (rarity === 'epic' || rarity === 'legendary') audio.play('reveal', { pitch: rarity === 'legendary' ? 1.08 : 1 });
    else audio.play('levelup');
  });
  bus.on('characterSpin', ({ speed }) => audio.play('swish', { pitch: 0.85 + Math.min(0.5, speed * 0.05), vol: Math.min(0.55, 0.14 + speed * 0.03) }));

  // ── Building ──
  bus.on('piecePlaced', ({ pos, object }) => {
    audio.play('snap');
    if (object) popScale(object, tuning.build.placeBounceSeconds, 0.28);
    fx.burst('puff', pos, { count: 5, size: 0.5, speed: 0.6 });
  });
  bus.on('pieceDeleted', ({ pos }) => {
    audio.play('puff');
    fx.burst('puff', pos, { count: 14, speed: 1.2 });
  });
  bus.on('pieceRotated', ({ object }) => {
    audio.play('rotate');
    if (object) popScale(object, 0.25, 0.15);
  });
  bus.on('pieceRecolored', ({ pos, object }) => {
    audio.play('pop', { pitch: 1.3 });
    fx.burst('sparkle', pos, { count: 10 });
    if (object) popScale(object, 0.3, 0.15);
  });
  bus.on('pieceSelected', () => audio.play('tap', { pitch: 1.2 }));
  bus.on('placementBlocked', () => audio.play('blocked'));
  bus.on('ghostMoved', () => audio.play('tap', { pitch: 1.7, vol: 0.3 })); // little tick as the ghost snaps to a new cell
  bus.on('plotClaimed', ({ pos }) => {
    audio.play('chime');
    fx.burst('confetti', pos, { count: 40 });
  });
  bus.on('houseDeleted', ({ pos }) => {
    audio.play('puff', { pitch: 0.7 });
    fx.burst('puff', pos, { count: 30, speed: 2 });
  });
  bus.on('undo', () => audio.play('back'));

  // ── v3 build (W5): world building ──
  const buildSound = (mat: string): 'thunk' | 'clunk' | 'clang' => (mat === 'brick' ? 'clunk' : mat === 'metal' ? 'clang' : 'thunk');
  const dust = (mat: string) => (mat === 'brick' ? ['#d9b79a', '#c9a07e'] : mat === 'metal' ? ['#dfe6f2', '#c5cfdf'] : ['#e8d4b4', '#d6bd94']);
  bus.on('buildPlaced', ({ pos, mat }) => {
    audio.play(buildSound(mat), { pitch: 0.94 + Math.random() * 0.12 });
    fx.burst('puff', { x: pos.x, y: pos.y - 0.4, z: pos.z }, { count: 5, size: 0.55, speed: 0.7, color: dust(mat) });
  });
  bus.on('buildSettled', ({ pos, mat }) => {
    fx.burst('puff', { x: pos.x, y: pos.y - 0.2, z: pos.z }, { count: 8, size: 0.8, speed: 1.1, color: dust(mat), spread: 1.2 });
  });
  bus.on('buildDeleted', ({ pos, mat }) => {
    audio.play('puff', { pitch: 0.9 });
    fx.burst('puff', pos, { count: 12, size: 0.8, speed: 1.3, color: dust(mat), spread: 1.2 });
  });
  bus.on('buildEdited', ({ pos, mat }) => {
    audio.play('chop', { pitch: mat === 'metal' ? 1.3 : mat === 'brick' ? 0.8 : 1 });
    fx.burst('puff', pos, { count: 6, size: 0.5, speed: 0.9, color: dust(mat) });
  });
  bus.on('buildBlocked', () => audio.play('blocked'));
  bus.on('decorPlaced', ({ pos }) => {
    audio.play('snap', { pitch: 1.15 });
    fx.burst('sparkle', pos, { count: 6, size: 0.5 });
  });
  bus.on('decorDeleted', ({ pos }) => {
    audio.play('puff');
    fx.burst('puff', pos, { count: 8, size: 0.6, speed: 1 });
  });
  bus.on('buildMode', ({ on }) => audio.play(on ? 'swish' : 'back', { vol: 0.6 }));

  // ── Squishy ──
  bus.on('squishPress', ({ strength }) => audio.play('squelch', { vol: 0.6 + 0.4 * strength }));
  bus.on('squishDrag', ({ speed }) => {
    if (speed > 0.5 && Math.random() < 0.35) audio.play('slimeClick', { vol: Math.min(1, speed * 0.3), pitch: 0.8 });
  });
  bus.on('squishRelease', ({ depth }) => audio.play('squelch', { pitch: 1.3, vol: 0.3 + depth }));
  bus.on('squishRecover', ({ pos }) => {
    audio.play('pop', { vol: 0.5, pitch: 1.1 });
    fx.burst('sparkle', pos, { count: 4, size: 0.6, speed: 0.4 });
  });

  // ── Slime ──
  // Slime sounds vary per type (`kind`): butter is thick and low, clear is bright, crunchy pops beads,
  // cloud is light and drizzly. Strand clicks rise in pitch as the strand thins.
  bus.on('slimeGrab', ({ kind }) => {
    if (kind === 'butter') audio.play('poke', { pitch: 0.65, vol: 0.55 });
    else if (kind === 'crunchy') audio.play('slimeClick', { pitch: 0.85, vol: 0.6 });
    else if (kind === 'cloud') audio.play('flake', { pitch: 0.8, vol: 0.45 });
    else audio.play('slimeClick', { pitch: kind === 'clear' ? 1.2 : 1 });
  });
  bus.on('slimeStretch', ({ amount, speed, kind, big }) => {
    const pitch = 0.85 + 0.45 * amount;
    const vol = 0.4 + Math.min(0.5, speed * 0.15);
    if (kind === 'butter') {
      audio.play('slimeClick', { pitch: pitch * 0.62, vol: vol * 0.8 });
      if (Math.random() < 0.15) audio.play('squelch', { pitch: 0.6, vol: 0.4 });
    } else if (kind === 'cloud') {
      audio.play('flake', { pitch: pitch * 1.1, vol: vol * 0.55 });
      if (Math.random() < 0.25) audio.play('swish', { pitch: 1.5 + Math.random() * 0.5, vol: 0.18 });
    } else if (kind === 'crunchy') {
      audio.play('flake', { pitch: pitch * 0.9, vol: vol * 0.7 });
      audio.play('slimeClick', { pitch: pitch * 0.8, vol: vol * 0.5 });
    } else if (kind === 'clear') {
      audio.play('slimeClick', { pitch: pitch * 1.25, vol });
    } else {
      audio.play('slimeClick', { pitch: kind === 'galaxy' ? pitch * 0.85 : pitch, vol });
    }
    if (big) {
      audio.play('pop', { pitch: 0.9 + Math.random() * 0.5, vol: 0.5 });
      if (kind === 'holo') audio.play('sparkle', { vol: 0.3 });
      else if (kind === 'galaxy') audio.play('chime', { pitch: 1.5, vol: 0.2 });
    } else if (speed > 2.2 && Math.random() < 0.25) audio.play('slimeStretch', { pitch });
  });
  bus.on('slimeRelease', ({ amount, kind }) => {
    audio.play('slimeStretch', { pitch: kind === 'butter' ? 0.6 : 0.8 });
    if (amount > 0.6) audio.play('pop', { pitch: 0.7, vol: 0.6 });
  });
  bus.on('slimePoke', ({ kind }) => audio.play('poke', { pitch: kind === 'butter' ? 0.7 : kind === 'clear' ? 1.2 : 1 }));
  bus.on('slimeFold', ({ kind }) => {
    audio.play('squelch', { pitch: kind === 'butter' ? 0.65 : 0.8 });
    audio.play('slimeStretch', { pitch: 0.7, vol: 0.5 });
  });
  bus.on('slimeAddin', ({ pos }) => {
    audio.play('sparkle');
    if (pos) fx.burst('sparkle', pos, { count: 18 });
  });
  bus.on('slimeCrunch', ({ strength }) => {
    audio.play('crunch', { vol: 0.3 + 0.3 * strength, pitch: 1.1 + Math.random() * 0.4 });
    audio.play('flake', { pitch: 0.9 + Math.random() * 0.5, vol: 0.5 });
  });
  bus.on('slimeSnap', ({ pos, color }) => {
    audio.play('snap');
    audio.play('slimeStretch', { pitch: 1.2 });
    audio.play('pop', { pitch: 0.6, vol: 0.7 });
    fx.burst('drop', pos, { count: 10, color, speed: 0.9, floorY: 0.1 });
  });
  bus.on('slimeBubble', () => audio.play('pop', { pitch: 1.9, vol: 0.18 }));
  bus.on('slimeBubblePop', ({ pos, size, color }) => {
    audio.play('pop', { pitch: 1.4 + (0.12 - size) * 6, vol: 0.55 });
    audio.play('flake', { pitch: 1.2, vol: 0.35 });
    fx.burst('drop', pos, { count: 5, color, speed: 0.5, size: 0.5, floorY: 0.1 });
  });
  bus.on('slimeType', ({ pos }) => {
    audio.play('pop', { pitch: 1.2 });
    if (pos) fx.burst('sparkle', pos, { count: 12, size: 0.8 });
  });

  // ── Wax ──
  bus.on('waxPourStart', () => audio.pourStart());
  bus.on('waxPourFlow', ({ rate }) => audio.pourSet(rate));
  bus.on('waxPourStop', () => audio.pourStop());
  bus.on('waxDip', ({ pos, color }) => {
    audio.play('gloop');
    fx.burst('drop', pos, { count: 14, color, speed: 0.8, floorY: pos.y - 0.2 });
  });
  bus.on('waxLift', () => audio.play('drip'));
  bus.on('waxLayerAdded', ({ pos }) => {
    audio.play('chime', { pitch: 1.4, vol: 0.4 });
    fx.burst('sparkle', pos, { count: 8, size: 0.7 });
  });
  bus.on('waxHardenStart', () => {});
  bus.on('waxCool', ({ pos }) => {
    audio.play('frost');
    fx.burst('frost', pos, { count: 40, spread: 1.2, speed: 0.6 });
  });
  bus.on('waxHardened', ({ pos }) => {
    audio.play('harden');
    fx.burst('sparkle', pos, { count: 14, spread: 1.0, speed: 0.3 });
  });
  bus.on('shellCrack', ({ intensity }) => audio.play('crunch', { vol: 0.6 + 0.4 * intensity }));
  bus.on('flakeDetach', ({ size }) => audio.play('flake', { pitch: 1.3 - Math.min(0.5, size * 0.3) }));
  bus.on('flakeLand', ({ size }) => audio.play('flakeLand', { pitch: 1.2 - Math.min(0.4, size * 0.2), vol: 0.7 }));
  bus.on('shellCleared', ({ pos }) => {
    audio.play('happy');
    fx.burst('confetti', pos, { count: 50 });
  });

  // ── Driving ──
  bus.on('driveStart', ({ kind }) => audio.engineStart(kind));
  bus.on('driveStop', () => audio.engineStop());
  bus.on('carUpdate', ({ speed01, throttle }) => audio.engineSet(speed01, throttle));
  bus.on('carCollide', ({ pos, speed }) => {
    audio.play('bump', { vol: Math.min(1, 0.4 + speed * 0.08) });
    fx.burst('puff', pos, { count: 8, speed: 0.8 });
  });
  // ── v3 rides: a horn per ride, and the hop in / out ──
  const HORNS = { sports: 'horn', pickup: 'hornPickup', golfcart: 'hornCart', hoverboard: 'hornHover', icecream: 'jingle', boat: 'hornBoat' } as const;
  bus.on('horn', ({ kind }) => audio.play(HORNS[kind ?? 'sports']));
  bus.on('rideEnter', ({ pos }) => {
    audio.play('swish', { pitch: 1.15, vol: 0.5 });
    audio.play('pop', { pitch: 0.9, vol: 0.5 });
    fx.burst('sparkle', pos, { count: 8, color: ['#ffffff', '#00d4ff', '#ffc93c'], speed: 0.8 });
  });
  bus.on('rideExit', ({ pos }) => {
    audio.play('swish', { pitch: 0.85, vol: 0.45 });
    fx.burst('puff', pos, { count: 5, speed: 0.6, size: 0.7 });
  });
  bus.on('passengerWave', () => audio.play('hello'));
  bus.on('passengerPickup', ({ pos }) => {
    audio.play('hello');
    fx.burst('sparkle', pos, { count: 20 });
  });
  bus.on('passengerDropoff', ({ pos }) => {
    audio.play('happy');
    audio.play('confetti');
    fx.burst('confetti', pos, { count: 70 });
  });
  bus.on('charmCollected', ({ pos }) => {
    audio.play('collect');
    fx.burst('sparkle', pos, { count: 40, color: ['#ffffff', '#00d4ff', '#ff2e88', '#ffc93c'] });
  });
  // v3 locker: the big reveal card (ui/reveal.ts) owns the unlock moment: it plays the sting (revealShown) and shows the card.
  bus.on('rewardUnlocked', () => {});
  bus.on('carJump', () => audio.play('swish', { pitch: 0.7 }));
  bus.on('carLand', ({ pos, strength }) => {
    audio.play('bump', { vol: Math.min(1, 0.4 + strength * 0.3), pitch: 0.8 });
    fx.burst('puff', pos, { count: 10, speed: 1 + strength });
  });
  bus.on('carBoost', () => audio.play('boost'));
  bus.on('carSkid', ({ strength }) => audio.play('skid', { vol: Math.min(1, 0.35 + strength * 0.5) }));
  bus.on('footstep', ({ run }) => audio.play('step', { vol: run ? 0.8 : 0.55, pitch: 0.92 + Math.random() * 0.16 }));
  // ── Water + calling the car (v2 r3) ──
  const WATER = ['#bfeaff', '#ffffff', '#7fd8ff', '#e8fbff'];
  bus.on('waterSplash', ({ pos, strength, kind }) => {
    const s = Math.max(0.2, Math.min(1.6, strength));
    if (kind === 'enter') {
      audio.play('splash', { vol: Math.min(1, 0.5 + s * 0.4), pitch: 1.15 - s * 0.18 });
      fx.burst('drop', pos, { count: Math.round(14 + s * 18), color: WATER, speed: 1.5 + s * 0.7, size: 1.3, floorY: pos.y - 0.12 });
      fx.burst('puff', pos, { count: 6, color: '#eefcff', speed: 0.6, size: 0.8 });
    } else if (kind === 'kick') {
      audio.play('splash', { vol: 0.5, pitch: 1.3 });
      fx.burst('drop', pos, { count: 12, color: WATER, speed: 1.3, size: 1.1, floorY: pos.y - 0.12 });
    } else if (kind === 'stroke') {
      audio.play('stroke', { vol: 0.5 });
      fx.burst('drop', pos, { count: 3, color: WATER, speed: 0.6, size: 0.7, floorY: pos.y - 0.1 });
    } else {
      audio.play('wade', { vol: 0.45 + s * 0.3 });
      fx.burst('drop', pos, { count: 4, color: WATER, speed: 0.7, size: 0.7, floorY: pos.y - 0.1 });
    }
  });
  bus.on('carVanish', ({ pos }) => {
    audio.play('whoosh', { vol: 0.6, pitch: 1.4 });
    fx.burst('puff', pos, { count: 16, speed: 1.4, size: 1.4 });
    fx.burst('sparkle', pos, { count: 14, color: ['#ffffff', '#00d4ff', '#ff2e88'], speed: 1.2 });
  });
  bus.on('carAppear', ({ pos }) => {
    audio.play('whoosh', { vol: 0.6, pitch: 0.8 });
    window.setTimeout(() => audio.play('horn', { vol: 0.55, pitch: 1.5 }), 260);
    fx.burst('puff', pos, { count: 16, speed: 1.4, size: 1.4 });
    fx.burst('sparkle', pos, { count: 18, color: ['#ffffff', '#ffc93c', '#b6ff3b'], speed: 1.3 });
  });
  bus.on('arriveWorkshop', () => audio.play('chime'));
  bus.on('arriveBuild', () => audio.play('chime'));

  // ── v3 movement (W4): sprint dust, mantle, glide, launch pads, party bus, POI cards ──
  const DUST = ['#e8dcc4', '#f4ead6', '#d8cdb4'];
  // a sprinting step kicks up dust at the feet
  bus.on('footstep', ({ pos, run }) => {
    if (run) fx.burst('puff', { x: pos.x, y: pos.y + 0.12, z: pos.z }, { count: 2, color: DUST, size: 0.26, speed: 0.4 });
  });
  bus.on('mantle', ({ pos }) => {
    audio.play('hup');
    fx.burst('puff', { x: pos.x, y: pos.y - 0.6, z: pos.z }, { count: 5, color: DUST, size: 0.6, speed: 0.7 });
  });
  bus.on('gliderDeploy', ({ pos }) => {
    audio.play('deploy');
    fx.burst('sparkle', pos, { count: 16, color: ['#ffffff', '#00d4ff', '#ff2e88'], size: 0.8, speed: 1 });
  });
  bus.on('glideLand', ({ pos, strength }) => {
    audio.play('thud', { vol: Math.min(1, 0.6 + strength * 0.3) });
    fx.burst('puff', { x: pos.x, y: pos.y + 0.15, z: pos.z }, { count: Math.round(8 + strength * 6), color: DUST, size: 0.9 + strength * 0.3, speed: 1.1 + strength * 0.5, spread: 0.3 });
  });
  bus.on('airStart', () => audio.windStart());
  bus.on('airUpdate', ({ speed01, dive }) => audio.windSet(speed01, dive));
  bus.on('airStop', () => audio.windStop());
  bus.on('launchPad', ({ pos }) => {
    audio.play('boing');
    fx.burst('sparkle', pos, { count: 34, color: ['#ffffff', '#00d4ff', '#ff2e88', '#ffc93c'], size: 1.1, speed: 1.6, up: 1.8 });
    fx.burst('puff', { x: pos.x, y: pos.y - 0.2, z: pos.z }, { count: 10, color: DUST, size: 0.6, speed: 1.1, spread: 0.6 });
  });
  bus.on('busStart', () => audio.play('fanfare'));
  bus.on('busHonk', () => audio.play('honk'));
  bus.on('busJump', ({ pos }) => {
    audio.play('whoosh', { vol: 0.9, pitch: 0.8 });
    audio.play('pop', { pitch: 1.5, vol: 0.7 });
    fx.burst('confetti', pos, { count: 30, size: 0.4, speed: 0.9 });
  });
  bus.on('poiEntered', () => audio.play('sting'));
}
