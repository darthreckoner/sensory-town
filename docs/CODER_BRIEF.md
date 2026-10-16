# Coder brief — Sensory Town (read fully before coding)

You are a coder on Sensory Town, a cozy touch-first **3D** toy town for two kids (9 and 11) on **iPad** (installed PWA, Safari/WebKit) — also playable on desktop Chrome with mouse + keyboard. The Game Director (Claude Opus) owns the vision and reviews your work for feel. Full spec: `BUILD_PROMPT.md` (read the section for your module).

## Pillars (every decision serves these)
1. **Make it yours** — customization that persists and shows up everywhere.
2. **Satisfying touch** — EVERY press/drag/tap gets immediate visual + audio feedback (ASMR pillar).
3. **Free play, no pressure** — no scores, timers, fail states, lives, money. Instant reset/undo.

## Anti-goals
- Flat 2D / Toca-Boca look. This is real 3D: soft, rounded, slightly glossy pastel toys.
- Tiny touch targets (min 56 px; prefer 72–84 px). Reading-heavy UI (use emoji icons + 1-word labels).
- Any network request, CDN, external font, image or model file. Everything is built in code.

## Stack + layout
Vite 8 + TypeScript (strict) + Three.js r186. No other runtime deps. Key files:
- `src/tuning.ts` — **every tunable number lives here**, in your module's section. Read `tuning.x.y` at use time (the debug overlay mutates values live). Add knobs only inside your own section.
- `src/core/events.ts` — typed event bus `bus.emit('name', payload)`. Gameplay emits semantic events; `src/juice/juice.ts` maps them to sounds (`src/juice/audio.ts`) and particles (`src/juice/fx.ts`). **Gameplay code never imports audio.ts or fx.ts.** If you need a new event: add it to `GameEvents` and add its mapping in `juice.ts` (both shared files — re-read right before a small, surgical Edit; never rewrite them).
  - Available sounds (`audio.play(name)`): tap tab back whoosh pop squelch slimeClick slimeStretch poke crunch flake flakeLand gloop drip snap blocked puff rotate chime switch sparkle swish horn bump hello happy confetti frost harden save. Continuous: `audio.engineStart/engineSet/engineStop`, `audio.pourStart/pourSet/pourStop`.
  - FX (`fx.burst(kind, pos, opts)`): 'sparkle' | 'confetti' | 'puff' | 'drop' | 'frost'. Positions are world space; size scales by the scene's `fxScale`.
  - Squash-and-stretch: pass `object` in events like `piecePlaced` / `outfitChanged` — juice calls `popScale(object)`.
- `src/core/scene.ts` — `GameScene` base class: `init()` (once), `enter(params)`, `exit()`, `update(dt,t)`, `resize(w,h)`, `resetStation()` (F1), `debugInfo()`. Each scene has `this.scene`, `this.camera`, `this.ui` (DOM overlay div). Use `this.listen(target, type, fn)` for listeners (auto-removed on exit) and `this.onExit(fn)` for other cleanup (e.g. `bus.on` unsubscribers). Navigate with `scenes.go('town' | 'build' | 'workshop' | 'dressup' | 'picker', params)`. Canvas: `scenes.canvas`. Set `pixelRatioCap`, `fxScale` as needed.
- `src/core/store.ts` — `store.profile` (active Profile), `store.data` (SaveData), `store.update(fn)` (mutate + autosave), `store.profileById(id)`, `store.creationById(id)`, `store.houseOnPlot(i)`. Data types in `src/core/model.ts` (Outfit, Creation, Profile, House, PlacedPiece, Decoration, Town). `uid('prefix_')` for ids. Do not change the saved data shape without telling the Director.
- `src/core/tween.ts` — `tweens.add(dur, (k, raw) => ..., { ease, key, done })`, `ease.*`, `popScale(obj)`.
- `src/art/materials.ts` — **use these for the shared look**: `toyMat(color, finish)` (finish: 'gloss' default | 'satin' | 'matte' | 'fabric' | 'metal' | 'glass' | 'emissive'; cached, don't mutate), `toyMatUnique()` (mutable), `roundedBox(w,h,d,r)`, `mesh(geo, mat, castShadow, receiveShadow)`, `blobShadow(radius)`.
- `src/art/env.ts` — `addLights(scene, {shadowSize, shadows, sunPos})` (hemi + sun + PMREM studio env for gloss), `skyBackground(scene)`, `gradientTexture(top, bottom, mid?)`.
- `src/art/character.ts` — `new Character(outfit, {seated?})` with `.group`, `.setOutfit()`, `.wave()`, `.pose()`, `.hop()`, `.update(dt,t)`, `.headTop()`; `OUTFIT_CATALOG`.
- `src/art/creationMesh.ts` — `buildCreationMesh(creation, size)` small display model of a workshop creation (resting on y=0).
- `src/world/townLayout.ts` — the town map as data (ROADS, PLOTS, WORKSHOP, BUILD_YARD, LANDMARKS, JOB_SPOTS, SPAWN, BOUNDS, `isReserved()`, `plotAt()`, `seeded()`).
- `src/ui/ui.ts` — `el(tag, cls, parent, html)`, `button(parent, {icon,label,cls,tap}, onTap)`, `bindTap(el, fn)`, `swatches(parent, colors, current, onPick)`, `tabs(parent, list, current, onPick)`, `sheet(build)`, `confirmDialog(text, yes, no, icon)`, `toast(text)`, `nameTag(parent, text)`. Buttons emit `uiTap` for you.
- `src/ui/style.css` — classes: `.btn` (+ `round big pink mint blue butter lilac peach ghost selected`), `.panel`, `.row`, `.col`, anchors `.tl .tr .bl .br .tc .bc .lc .rc` (safe-area aware), `.tabs/.tab`, `.swatches/.swatch`, `.items/.item` (84px tiles with `.ico` emoji), `.label`, `.title`, `.nametag`, `.passthrough` (wrapper that lets canvas touches through except `.btn`/`.interactive` children). Add new CSS for your module at the END of style.css in a clearly commented block (re-read before editing; other coders append too).
- The global 🏠 menu button sits top-left (72px circle at 16px inset) — keep your top-left corner clear.

## Input rules
- Pointer Events only (`pointerdown/move/up/cancel`) with `pointerId` tracking → multi-touch works. Use `setPointerCapture` on the canvas for drags. Never rely on `click`/`touchstart`/hover.
- PC: mouse drag = finger; keyboard where relevant. Mouse wheel = zoom where relevant.
- On-screen controls that only make sense for touch (e.g. driving pedals) hide when no touch was ever seen (`matchMedia('(pointer: coarse)')` or first `pointerType === 'touch'`).

## Look
Soft pastel candy palette (`tuning.art.palette`), rounded everything (no sharp boxes — use `roundedBox`), glossy clearcoat toys, soft shadows (`castShadow` on objects, `receiveShadow` on ground), chunky proportions, cute faces where it fits. Keep draw calls reasonable for iPad: merge or instance repeated small meshes (trees, flowers, tiles). Target 60 fps on a recent iPad.

## Rules of engagement
- Only edit the files your task assigns you, plus: your own section in `tuning.ts`, surgical additions to `events.ts` / `juice.ts`, and an appended block in `style.css`.
- Verify with `npx tsc --noEmit` (must be clean). **Do NOT start dev servers, run `vite`, or use any browser/preview tools** — the Director playtests in the browser and will send feedback.
- Keep code readable and commented at the level of the existing files. No placeholder art left behind in your module.
- Finish with a short report: files changed, public API (anything other modules call), new events/tuning knobs, known issues / what you'd improve next.
