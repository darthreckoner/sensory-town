# One-shot build prompt — Sensory Town

You are building the first complete playable version of Sensory Town.
Read this whole prompt before writing code. Everything you need is here.

**Hard deadline:** playable on two iPads, installed and working offline, by **3:00 p.m. Central, Fri Oct 16, 2026**. Every step in the build order below must end in a playable state, so if time runs short there is still a working app.

## Vision
A cozy, touch-first 3D toy town for two kids (ages 9 and 11) on iPad. They dress up a character, drive around a small village, snap together houses, and visit a sensory workshop where they make and squish squishies, stretch slime, and coat squishies in wax to crack. All six requested activities (dress up, driving, squishies, ASMR, wax cracking, house/village building) live in one shared world, not six separate mini-games. No scores, no timers, no failing — just making things and playing with them. Each kid has their own save, and they can also build together in a shared town.

## Pillars — every decision must serve these
1. **Make it yours** — outfits, houses, village layout and workshop creations are customizable and persist.
2. **Satisfying touch** — every press, drag, squeeze and crack gets immediate visual and audio feedback. This is the ASMR pillar.
3. **Free play, no pressure** — no scores, timers, lives or fail states. Instant reset on anything.

## Anti-goals — do not drift into these
- A flat 2D, Toca Boca-style look. The kids dislike it. This is a real 3D world with a stylish, soft, slightly glossy look.
- Six disconnected mini-games. Everything is reached from one town.
- Scores, timers, fail states, ads, in-app purchases, accounts or any network dependency.
- Tiny touch targets or controls that need precision. Users are 9 and 11 on an iPad.

## Core loop
- **Every 10 seconds:** a tactile action with feedback — squeeze, pour, crack, snap a wall, swap an outfit piece, steer.
- **Every minute:** finish a small creation (a coated squishy, a room, an outfit) or drive somewhere in town.
- **Every session:** pick a profile → dress up → drive around → build in the town → make something in the workshop → display it at home. Saved automatically.

## Mechanics (intent first, then rules)

### Profiles & shared town
- The player should feel: "my stuff is mine, and our town is ours."
- Rules:
  - Launch screen: profile picker showing each kid's character. Create/rename profiles (default 2, max set in tuning). Switch profile anytime from the menu.
  - A profile owns: name, character + outfit, car color, workshop creations, and the houses it builds.
  - One **shared town** that every profile on the device builds in. Each house stores its owner profile and shows an owner name tag. Either kid can visit any house; only the owner can delete or edit their house (keep it simple, no permission UI beyond that).
  - **Export/import town:** "Share Town" writes a single JSON file (whole shared town + all profiles) via the iOS share sheet (Web Share API with a File, falling back to a download). "Import Town" reads that file via a file picker and replaces this device's town after a confirm dialog. This is how the two iPads swap towns over AirDrop. No live sync.
- Feedback / juice: picked character waves and poses; soft chime on switch; owner tag floats above each house.
- Tuning knobs: maxProfiles, plotsPerTown.

### Dress-up
- The player should feel: stylish and in control of their look (think SuperStylist).
- Rules: 3D character built from simple stylized meshes. Categories: hair, top, bottom, shoes, accessory. At least 5 options per category, each recolorable from a palette. Rotate the character by dragging; pinch or buttons to zoom. Outfit saves to the profile and is shown on the character in town.
- Feedback / juice: sparkle burst + small pose on every change; soft fabric/click sound.
- Tuning knobs: palette colors, rotateSpeed, zoomMin/zoomMax.

### Driving
- The player should feel: free to cruise around their own town (think Pick Me Up 3D, minus any timer).
- Rules: one car, color picked per profile. Small map: roads connecting the home/build area, the workshop building and a few landmarks. iPad: big on-screen steering (left thumb joystick or left/right buttons) plus gas and brake (right thumb). PC: WASD/arrow keys. Optional pickup/drop-off jobs: a waving character with a marker; drive there, they hop in, drive to the destination marker, they hop out with a happy sound. No timer, no penalty, no payment. Driving into the workshop door opens the workshop; driving to the build area enters build mode (also reachable from the menu).
- Feedback / juice: engine hum that rises with speed, horn button, soft bounce on collisions (no damage), arrival chime and confetti on drop-off.
- Tuning knobs: topSpeed, acceleration, brakeForce, turnRate, cameraFollowDistance, cameraHeight, controlSize.

### House & village building
- The player should feel: "building is easy and it looks good."
- Rules: top-down/orbit camera over the shared town grid. Tap an empty plot to start a house. Palette of pieces: floor tile, wall, wall with window, wall with door, roof (2 styles), plus furniture (bed, sofa, table, lamp, plant, shelf). Drag a piece from the palette; it shows a ghost preview and snaps to the grid; release to place. Tap a placed piece to rotate, recolor or delete. Undo button. Workshop creations from the owner's profile can be placed on shelves/tables as decorations. Village-level: place houses on plots plus decorations (trees, fences, lamps, flowers).
- Feedback / juice: snap click + squash-and-stretch bounce on placement; puff of dust on delete; ghost turns red where placement isn't allowed.
- Tuning knobs: gridSize, snapTolerance, plotsPerTown, piece catalog.

### Workshop (close-up view)
The workshop is its own close-up scene with a fixed, near camera. Detail goes here; the town stays simple. Three stations, switched by big tabs: **Squishy**, **Slime**, **Wax**. Every creation can be saved to the profile's shelf and reset instantly.

#### Squishy station
- The player should feel: the squish is real (think Fidget Toys).
- Rules: pick a shape (at least 5: bun, cat face, star, peach, cube) and color. Press and drag deforms the mesh around the finger (raycast to the surface, displace vertices inward with falloff); multi-touch supported. On release it slowly rises back to shape.
- Feedback / juice: deformation tracks the finger exactly; slow-rise recovery; squelch on press, soft pop on full recovery.
- Tuning knobs: softness, falloffRadius, recoverySpeed, maxDent.

#### Slime station
- The player should feel: gooey and stretchy (think Glitter Slime).
- Rules: blob of slime on a tray. Drag to stretch (it follows the finger and thins), release to snap back and settle; tap to poke; fold by dragging across itself. Pick a color and mix in glitter/sprinkle add-ins.
- Feedback / juice: wet squish and pop/click sounds (the ASMR "slime clicks"); glitter catches the light.
- Tuning knobs: stretchLimit, snapBackSpeed, viscosity, glitterDensity.

#### Wax cracking station
- The player should feel: the crunch-and-peel satisfaction from Coverstar's wax-cracking videos.
- Rules (this exact sequence):
  1. Choose a squishy (same shapes as the squishy station).
  2. Coat it: **dip** (drag the squishy down into a pot of melted wax and lift it out) **or pour** (tilt a pitcher over the squishy by dragging; wax flows and drips down it). Either can be repeated.
  3. Layer colors: each dip/pour adds a new colored layer over the previous one.
  4. Harden: the shell visibly sets over a few seconds (glossy to matte), with an optional "cool" button to speed it up.
  5. Squeeze to crack: cracks start exactly where the finger presses and spread outward with continued pressure. The shell breaks into flakes that peel and fall away, revealing the colored layers in cross-section and then the soft squishy, which bulges through the openings.
  6. Instant reset: "Crack again" (re-coat with the same layers) or "New coating."
- Suggested implementation: the shell is a separate mesh slightly larger than the squishy. When it hardens, pre-fracture the shell into Voronoi-style pieces. Pressing accumulates "stress" on pieces near the touch point; a crack-line overlay (shader or decal) spreads from the press point; pieces over the stress threshold detach and fall with simple physics. Under the open areas, the squishy uses the same deformation as the squishy station.
- Feedback / juice: crisp crunch per crack and per falling flake (randomized pitch); pour has a thick liquid sound; dip has a gloopy plunge; visible layered edge on broken pieces.
- Tuning knobs: waxColors, maxLayers, hardenTime, crackSpreadRate, stressThreshold, shellThickness, flakeSize, flakeGravity.

### ASMR sound layer
- The player should feel: calm, crisp, satisfying audio everywhere.
- Rules: all sounds are triggered by the event-driven juice layer (see Architecture). Every event sound gets slight random pitch/volume variation so repeats don't feel robotic. Settings has master, effects and music volume (soft ambient music, off by default in the workshop).
- Generate sounds procedurally with the Web Audio API or bundle small original/CC0 files. No copyrighted audio.
- Tuning knobs: per-category volume, pitchVariation, volumeVariation.

## Platform requirements (iPad web app)
- Installable PWA: web app manifest (name, icons 180/192/512, `display: standalone`, landscape orientation) and `apple-touch-icon`, `apple-mobile-web-app-capable` meta.
- **Fully offline:** a service worker precaches every asset (JS, models, textures, sounds, fonts). No runtime network requests of any kind, no CDN fonts or scripts.
- **Must be served over HTTPS for install:** produce a static `dist/` and deploy it to a static HTTPS host (GitHub Pages, Netlify or Cloudflare Pages). Document the deploy steps in README.md. A LAN dev server is fine for testing but cannot be installed with offline support.
- Saves: IndexedDB, autosave on every change, and call `navigator.storage.persist()`.
- Touch: Pointer Events with multi-touch. Disable pinch-zoom of the page, double-tap zoom, text selection, long-press callouts and overscroll bounce (`touch-action: none`, viewport `user-scalable=no`, `-webkit-user-select: none`, `-webkit-touch-callout: none`). Respect safe-area insets. Every touch target ≥ 56 px.
- Audio on iOS: unlock the AudioContext on the first tap (the profile picker tap). Note in README that the iPad's silent mode can mute web audio.
- Performance: steady 60 fps on a recent iPad. Low-poly stylized models built from code (no large downloads), device pixel ratio capped by a tuning value, shadows cheap or baked.
- PC: the same build runs in desktop Chrome/Edge. Mouse drag replaces touch; WASD/arrow keys drive; on-screen driving controls hide when no touch is detected.

## Architecture (required)
- All tunable numbers live in `src/tuning.ts`. Never hardcode them.
- Gameplay emits events on a typed event bus (e.g. `onPiecePlaced`, `onPieceDeleted`, `onOutfitChanged`, `onSquishPress`, `onSquishRecover`, `onSlimeStretch`, `onWaxPour`, `onWaxDip`, `onWaxHardened`, `onShellCrack`, `onFlakeDetach`, `onPassengerPickup`, `onPassengerDropoff`, `onCarCollide`, `onProfileSwitch`). A separate juice layer reacts with visuals and sounds. Game logic never calls effects or audio directly.
- Each activity is its own scene module behind a simple scene manager (Town/Drive, Build, Workshop, DressUp, ProfilePicker). Shared data model for profiles, town and creations, with a versioned save schema so later builds can migrate saves.
- Debug: on PC, `` ` `` toggles an overlay (fps, current scene, key tuning values); `F1` resets the current station; `F2` fills the town with test houses; `F3` sets hardenTime to 0. On iPad, a three-finger tap toggles the same overlay.
- Stack: Vite + TypeScript + Three.js. `vite-plugin-pwa` (or a hand-written service worker) for offline precaching. No backend.

## Build order (each step ends playable)
1. App shell: scene manager, profile picker, IndexedDB saves, event bus, juice/audio layer, tuning file, PWA manifest + service worker.
2. Workshop: wax cracking first (the kids' top request), then squishy, then slime.
3. Shared town + building with owner tags.
4. Driving between town, build area and workshop, plus pickup/drop-off jobs.
5. Dress-up, with the outfit shown in town.
6. Export/import town, display of creations in houses, polish pass on juice.
7. Deploy to HTTPS, then install from Safari and test in airplane mode.

## Skip in this build
- App Store/native wrapper, accounts, cloud saves, live multiplayer or real-time sync between iPads.
- Shops, money, scores, unlocks, timers, achievements.
- Big open map, multiple cars, NPC traffic.
- Day/night cycle and weather.

## Before coding
Restate in 3 lines what the player should feel in this build. Then list any decision you're unsure about, make your best call, and record it in STATE.md under "Assumptions".

## Done when
- A kid can pick their profile, dress up, drive to the workshop, crack a wax-coated squishy, drive to the build area, build a house in the shared town and place a creation inside — with no scores or fail states anywhere.
- The second profile sees its own outfit and creations and the same shared town with both kids' houses.
- Export a town on one device and import it on another.
- Installed to the iPad Home Screen from the HTTPS URL, it launches and plays fully in airplane mode, with saves surviving app restarts.
- Touch, multi-touch squeeze and sound work on iPad; mouse + keyboard work on PC.
- Every tuning knob is exposed in `src/tuning.ts`.
- README.md covers run, build, deploy and install-on-iPad steps.
- STATE.md is updated: what exists, assumptions, known issues, next steps.
