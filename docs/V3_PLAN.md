# V3 plan: Fortnite-style island, no combat

The designer's direction (Oct 16, 10:40): "Make every aspect of this game as if it was Fortnite for a 10 year old girl, so no shooting/fighting. Just silly fun." The asks:
- A Fortnite-like world, with Fortnite-like driving and several car options.
- Fortnite-like characters with many options and tons of styles, outfits and accessories.
- Build with wood, brick and metal in a nicer style, and place decor inside builds.
- Freedom to drive, walk and build anywhere.
- The ASMR crafts stay, in their own building or a tab.
- Charm upgrades stay.

Read DESIGN.md (v3) first.

## Deeper, not bigger (be-ambitious framing for this round)
- **The field:** open-world sandbox game design for kids, through a Fortnite Creative / LEGO Fortnite lens.
- **What a top pro does:**
  - Copies the *verbs and numbers*, not the assets.
  - Ships one honest vertical slice of every system rather than a deep version of one.
  - Measures "feel" with timings: time-to-first-build, camera response, landing feedback latency.
- **Raw material:** Fortnite's own mechanics, as they work in the game:
  - **Build grid:** tiles about 2.7× character height wide and about 2× tall; 4 pieces (wall, floor, ramp, cone); 3 materials (wood fast/light, brick, metal slow/heavy); build-in animation; 3×3 wall edit; drag-place.
  - **Locker slots:** outfit+style, back bling, glider, contrail, emote wheel, wrap.
  - **Movement verbs:** sprint, mantle, slide, swim, glide, launch pad.
  - **Bus drop:** then skydive, then the glider auto-deploys.
  - **POI title cards.**
- **Methods:**
  - A shared save contract (src/core/model.ts v3) defined before anyone codes.
  - File ownership per workstream.
  - Event-bus juice only.
  - World invariant sweeps (src/core/worldcheck.ts) extended to builds and vehicles.
- **External check:** what shows it's right, besides me:
  - The sweeps: feet and camera clean on built pieces too.
  - The repro suite.
  - The draw-call budget.
  - The real-iPad fps readout and the kids' session (docs/KIDS_PLAYTEST.md).
  - **Pass:** she plays 15+ minutes unprompted, builds something, changes skin, finds charms, never says "creepy" or "babyish".

## Scale contract
- Character is about 1.75 m tall.
- **Build tile:** 4.8 m square. **Storey:** 3.6 m.
  - These are `tuning.build3.tile` and `tuning.build3.storey`, owned by the build workstream.
- A ramp rises one storey over one tile, so cars can drive up it.

## Workstreams and ownership (Sonnet agents; the Director integrates and verifies)
Shared files (DriveScene.ts, foot.ts, events.ts, juice.ts, audio.ts, tuning.ts):
- Re-read right before every edit, and keep edits narrow.
- Add new code in clearly labelled blocks: `// ── v3 <workstream> ──`.
- Never reformat or move other people's code.

| WS | Agent | Owns | Delivers |
|---|---|---|---|
| W1 Characters | character agent | src/art/character*.ts | Fortnite-style restyle (≈6 heads, expressive stylized face, 5-finger chunky hands, blinks + eye look). Tons of styles: ≥ 120 parts total across hair/tops/bottoms/shoes/accessories incl. full-body suits. 8+ original emotes `playEmote(id)` / `stopEmote()`. Mount APIs: `setBackBling(obj \| null)`, `setSwim(amount)`, a hand grip anchor for the glider. |
| W2 Locker + UI | locker agent (new) | src/scenes/DressUpScene.ts (becomes the Locker), src/ui/*, src/core/unlocks.ts, src/art/gear/* (new) | Locker UI with Fortnite-style slots and rarity frames. ≥ 24 original skins × 2–3 styles (presets built from W1 parts). 12 back blings, 8 gliders (`makeGlider(id)`), 6 contrails, emote wheel picker, ride wraps. Charm reward ladder over all of it. App-wide UI re-skin (bold italic, blue/purple, rarity colours). Lobby music. |
| W3 Rides | drive agent | src/drive/* vehicle and physics files, controls.ts, hud.ts, the car parts of DriveScene | Swim + call ride (in progress), then 6 rides with distinct handling and original chunky models. Parked spawns at POIs (spawn list from W6), enter any, wraps. |
| W4 Movement | movement agent (new) | new src/drive/{footcam,glide,launchpads,busdrop,poi}.ts, the foot-camera region of DriveScene | Over-shoulder camera + drag-look, sprint, mantle, glide (Locker glider + contrail), launch pads, party-bus intro drop, POI title cards. |
| W5 Building | build agent | src/build/*, src/world/buildSpace.ts (new), src/world/houseMesh.ts, src/scenes/BuildScene.ts | In-world build mode (wall/floor/ramp/roof × wood/brick/metal, nicer finish), grid snap in front of the player, drag-build, build-in anim, 3×3 edit, delete, decor mode (reuse the furniture generators), physics surfaces + colliders, save to `town.builds` / `town.decor`. Retire FOR SALE mats and Build scene from the main flow. Existing houses still render. |
| W6 World | world agent (new) | heightfield rawHeight/island section, townLayout.ts, terrain.ts (incl. water), sky.ts, src/art/env.ts, palette.ts, district builders (downtown/homehills/park/beach/lookout/skate/scenery/vegetation) | Island with sea on all sides, bright Fortnite-like look (sky, clouds, saturated painterly ground, stylized water), 3+ new original POIs, off-road friendly terrain, no invisible walls, charms spread over all POIs, `RIDE_SPAWNS` + `LAUNCH_PADS` + `POIS` lists in townLayout. |

## Contracts between workstreams
- **Save (done, Director):**
  - `Profile.locker: Locker`.
  - `Town.builds: BuildPiece[]` and `Town.decor: WorldDecor[]`.
  - `VehicleKind`.
  - SAVE_VERSION 3, migration in save.ts.
- **Build physics (W5 provides; W3 and W4 call it):** `src/world/buildSpace.ts`.
  - `surfaceBelow(x, z, yRef): number` returns the top of the highest built floor/ramp/roof at or below `yRef + stepUp`, or `-Infinity`.
  - `buildColliders` are 3D boxes with `y0`/`y1`, so walls only block bodies whose height overlaps them.
  - Foot and car vertical: `max(groundHeight(x, z, foot), surfaceBelow(x, z, y))`.
- **Gear (W2 builds; W1 and W4 attach):** in `src/art/gear/`.
  - `makeBackBling(id): THREE.Group`: origin at the upper-back mount, +Z points away from the back.
  - `makeGlider(id): THREE.Group`: origin at the hands' grip point, canopy above.
  - `makeContrail(id)`.
- **Emotes (W1):** `character.playEmote(id)` and `stopEmote()`. The bus event `emoteStarted { id }` is mapped in juice to a short original music loop.
- **Layout (W6 provides; W3 and W4 use it):** in townLayout:
  - `POIS: {id, name, x, z, r}[]`
  - `RIDE_SPAWNS: {kind: VehicleKind, x, z, heading}[]`
  - `LAUNCH_PADS: {x, z}[]`
  - `BUS_PATH: {ax, az, bx, bz, y}`

## Rubric v3 (locked; honest 1–10; target every row ≥ 7)
| Row | 7 means |
|---|---|
| Fortnite feel: movement + camera | Over-shoulder cam, sprint/jump/mantle/swim/glide all work and feel snappy; the bus drop is fun |
| Rides | 6 rides, each with its own handling and sound; call your ride; off-road + on-builds |
| Building | 4 pieces × 3 nicer materials anywhere; drag-build; edit; decor inside; walk/drive on it; saved |
| Locker + style depth | ≥ 24 skins with styles, ≥ 120 parts, back blings, gliders, emotes, rarity UI that feels like a locker |
| World + look | An island with POIs and title cards; bright stylized art; no invisible walls |
| Charms + upgrades | Charms everywhere unlock real gear with a reveal |
| Studio ASMR | Unchanged quality, reachable by building or tab |
| Audience fit (10 y/o girl) | Cool, silly, zero combat, not babyish, characters not creepy |
| Stability | Sweeps clean (feet/camera incl. builds), repros pass, 0 console errors |
| Performance | Town ≤ 250 draw calls with builds; adaptive DPR; capped at 7 until a real iPad check |

## Checkpoints (Central time)
- **12:15:** each workstream's core playable; tsc clean.
- **13:45:** feature complete.
- **14:15:** freeze. Director integration: sweeps, repros, screenshot pass at 1920×920, fixes.
- **14:45:** grade and deploy.
- **15:00:** deadline.
