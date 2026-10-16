# SCORECARD — Sensory Town (Director's honest grades)

Scale: 1 = broken/absent, 4 = present but flat, 6 = decent, 7 = good — a kid would choose to come back, 8 = delightful, 10 = best-in-class mobile toy.
Ship bar: **every row ≥ 7**. Below 7 = ticket + iterate.

## Expectations set before writing code

| Area | What a 7 looks like | What an 8+ looks like | Target |
|---|---|---|---|
| **Pillar 1 — Make it yours** | Outfit, car color, houses, creations all customizable and they persist across restarts and profile switches. | Choices visibly show up everywhere (outfit in car, creations on shelves, name tags), enough variety that two kids' stuff looks different at a glance. | 8 |
| **Pillar 2 — Satisfying touch (ASMR)** | Every press/drag gets sound + visual within one frame; squishy dents track the finger; wax cracks start where you press. | Layered crunch, flakes peel with cross-section, squishy bulges through holes, slime clicks; you want to do it "just one more time". | 8 |
| **Pillar 3 — Free play, no pressure** | No scores/timers/fail states anywhere; reset is one tap. | Every station has instant reset + undo; jobs are optional and only celebrate. | 9 |
| **Art / style** | Real 3D, soft glossy pastel look, consistent palette, nothing reads as flat 2D or programmer-art. | Toy-like charm: faces on squishies, gloss/clearcoat, soft shadows, coherent town that feels cozy. | 8 |
| **Playability** | A 9-year-old can get from profile → dress-up → drive → workshop → build without help; big targets; no dead ends; 60 fps-ish; no crashes. | Flow feels seamless, controls feel good on first touch, transitions are smooth, PC also works. | 8 |

### Per-activity floor (all must be ≥ 7)
Wax cracking (the kids' #1), Squishy, Slime, Dress-up, Driving + jobs, House/village building, Profiles + share town.

## Grade log
(Filled in after each playable slice — see below.)

### Slice 1 — first complete playable (all modules integrated)  · graded 2026-10-15 late evening
Tested in desktop Chromium via scripted touch/keyboard input + screenshots (hidden pane, so no live fps; frame cost measured per scene). Not yet tested: real iPad touch, real audio by ear, iPad GPU.

| Area | Grade | Why (honest) |
|---|---|---|
| Pillar 1 — Make it yours | **7** | Deep outfit catalog (8 hair, 6 tops, 5 bottoms, 5 shoes, 9 extras, skin), car color, houses with owner tags, creations on the workshop shelf and inside houses, per-profile data verified (Moon gets blue car + own look). Flat: creations inside houses are tiny; nothing marks "my house" on the minimap. |
| Pillar 2 — Satisfying touch | **7** | Wax crack is a real 8.5 (cracks from the exact press point, peeling flakes show layer stripes, squishy bulges). Slime strand is gooey. All 32 sounds verified producing signal; quiet ones rebalanced. Flat: squishy dent reads only as a darker patch, no jiggle; nothing heard by ear yet. |
| Pillar 3 — Free play | **9** | No scores/timers/fails anywhere. Reset/undo in every activity; jobs are optional and only celebrate. |
| Art / style | **8** | Cohesive soft-glossy pastel 3D in every scene; the town is genuinely charming (candy-dome workshop, windmill, lollipop trees); chibi characters with glossy eyes. Flat: default house walls are washed-out, plain slime at rest looks like a flat pool. |
| Playability | **7** | Full loop verified: picker → dress-up → drive → workshop pad → back → build pad → house → drag furniture → place creation. Big targets, touch pedals + joystick. Fixed: return-from-workshop camera inside the building. Risk: town is ~540k tris / 333 calls (adaptive resolution added as a safety net). |

| Activity | Grade | Notes |
|---|---|---|
| Wax cracking | 8.5 | Coverstar-like dip line + pour drips, wet→matte, layered cross-section on flakes. |
| Squishy | **6.5** ✗ | Dents track the finger and slowly rise, but they're hard to read and there's no body jiggle → needs work. |
| Slime | 7 | Stretch strand thins nicely; add-ins fun. Rest pose flat. |
| Dress-up | 8 | Cute, fast, sparkles + pose + camera glide to the changed part; Surprise + undo. |
| Driving + jobs | 8 | Arcade feel, pads, minimap, full pickup → ride → drop-off loop works. |
| Building | 7 | Starter house, painting, furniture, roof toggle, undo; looks good. Pale defaults. |
| Profiles + share | 7 | Rename/add, per-profile saves, import verified (replace + persist). Real AirDrop untested. |

**Iteration 1 tickets:** (1) Squishy → jiggle spring, deeper finger-sized dents, squeeze squash; (2) saturated default house colors; (3) slime rest dome; (4) perf trims (scenery −25%, squishy mesh 30→26, adaptive DPR); (5) "my house" on minimap + bigger creations in houses.

### Slice 2 — after Iteration 1  · graded 2026-10-16 ~03:00 (deployed: https://darthreckoner.github.io/sensory-town/)
Changes: squishy jelly-jiggle spring + volume bulge ring (dents now read as real craters with a raised rim), saturated house defaults, slime starts glittery with a taller dome, 🏠 "my house" markers on the minimap, bigger creations in houses, slime add-ins on shelf previews, portrait-iPad layout pass (workshop camera fit, icon-only tabs, buttons lifted off the step bar), adaptive resolution for slower iPads, scenery −25%, squishy mesh 9.6k→7.3k verts, return-from-workshop/build spawns on open road, louder flake/stretch/swish sounds, iOS audio unlock on every gesture type. Live HTTPS deploy verified: service worker active, full precache (index, JS, CSS, icons, manifest).

| Area | Slice 1 | Slice 2 | Why |
|---|---|---|---|
| Pillar 1 — Make it yours | 7 | **7.5** | Home markers + readable creations in houses close the "where's my stuff" gap. Still no character standing at home. |
| Pillar 2 — Satisfying touch | 7 | **8** | Squishy now has visible craters + jelly wobble; wax 8.5; two-finger glitter slime stretch; every action verified to emit its event + sound. |
| Pillar 3 — Free play | 9 | **9** | Unchanged — nothing to lose anywhere. |
| Art / style | 8 | **8** | Richer house colors; slime reads as a glossy mound. |
| Playability | 7 | **7.5** | Portrait works, slow-device safety net, spawn camera fixed, offline deploy verified. Held back from 8 only by what I can't test here: real iPad touch, GPU fps, and audio by ear. |

| Activity | Slice 1 | Slice 2 |
|---|---|---|
| Wax cracking | 8.5 | 8.5 |
| Squishy | 6.5 | **7.5** |
| Slime | 7 | **7.5** |
| Dress-up | 8 | 8 |
| Driving + jobs | 8 | 8 |
| Building | 7 | **7.5** |
| Profiles + share | 7 | 7 |

**Result: every row ≥ 7. Ship bar met.** Remaining risk is device-only (see STATE.md → Known issues).

---

## v2 RUBRIC — locked 2026-10-16 before any v2 playtest (games-user-research protocol)
Why a new rubric: v1 graded polish, not audience fit; the designer correctly called it preschool. Every anchor below is observable behavior or evidence, judged from a **cold run** (fresh IndexedDB, real clicks/touch at 1180×820 and 820×1180, no console shortcuts, no granted charms).

| Row | 5 = | 7 = (ship bar) | 9 = |
|---|---|---|---|
| **Audience fit 9–11** (new) | Side-by-side with Roblox Dress to Impress / Bloxburg / Coverstar stills, ≥1 area still reads "made for little kids" (pastel world, chibi, baby copy, cutesy sounds). | No area reads preschool next to the references; UI copy, characters, town and sounds all pass the "would an 11-year-old screenshot it for a friend" test. | Screens are indistinguishable in tone from the references; something reads as genuinely *cool* (stunt jump, chrome wax, neon studio). |
| **Pillar 1 — Make it yours** | Choices exist but don't show up elsewhere. | Outfit, car style, home, and creations each visibly appear in ≥2 other places (town, car, house, shelf); two profiles look clearly different at a glance. | Saved looks, home interiors and creations feel like a personal collection worth showing off; charms unlock things kids want. |
| **Pillar 2 — Satisfying touch** | Some interactions lack sound or visual. | Juice audit: 100% of taps/drags emit their feedback event + sound + visual; wax/squishy/slime each have one "do it again" moment. | Each activity has ≥2 distinct satisfying moments; variety (types/finishes/shapes) keeps repeats fresh. |
| **Pillar 3 — Free play** | Any fail state, timer or lost progress. | No fail/timer/score anywhere; charms gate only bonus items; reset/undo everywhere. | Same + every locked item tells you exactly how to get it. |
| **Exploration** (new, from note 2/3) | Small map, nothing to find, car only. | ≥5 distinct districts reachable; walk + drive; ≥30 charms placed so some need walking/ramps; a first-time player finds ≥3 charms in 10 min. | Players chase charms and stunts voluntarily; secrets reward curiosity. |
| **Building depth** (new, from note 2/4) | Can't find how to build a home, or only a few pieces. | A first-time player finds "build your home" unaided in ≤60 s from arriving in town, places a starter home, then adds ≥5 furniture items without help; 2 floors + finishes work. | Rooms look Bloxburg-good; players redecorate for fun. |
| **Art / style** | Inconsistent or placeholder art. | Cohesive v2 look in every scene, nothing flat-2D or placeholder, nothing pastel-candy by default. | Screens are beautiful at golden hour / in the studio. |
| **Playability** | Dead ends, console errors, confusing nav. | **Zero console errors** across the six-task walkthrough; every activity reachable in ≤3 taps from town (or a door); no dead ends; landscape + portrait usable; frame cost within budget (town ≤ ~400k tris/≤300 calls, adaptive DPR fallback). | Seamless flow; controls feel good on first touch. |
| **Sound** (new, from note 5) | Any cutesy/music-box sound left in a core moment. | UI and game sounds modern/punchy; ASMR sounds realistic; beat-based music per place; mix balanced (no clipping, nothing inaudible). | Sound alone tells you which place you're in. |

**Six cold-walkthrough tasks (cognitive walkthrough, each step asks: will a 9-year-old know what to do / see the control / understand the feedback?):** T1 pick player → T2 change an outfit → T3 walk or drive to the Studio → T4 crack a wax squishy → T5 build a home → T6 place a creation inside it.
**Recorded per task:** taps-to-complete, time-to-first-fun, dead ends, console errors, events fired.
**Grading rule:** every 7+ must survive a written counter-argument ("why an 11-year-old would still call it babyish/boring"); if the counter-argument wins, the grade drops.
**Designer's 5 notes** (each needs screenshot evidence to count as fixed): (1) preschool tone, (2) exploration/building minimal, (3) walk around + into buildings, (4) can't find home building, (5) sounds: less Animal Crossing, more Roblox.
**External check (the real one):** 15-min silent session with the kids on the iPads — pass = find + start a home unaided, crack wax ≥3× voluntarily, nobody says "babyish", they ask to keep playing.

### v2 cold-run grades — 2026-10-16 (rubric above, locked before play)
**Method:**
- Fresh IndexedDB, 1180×820 and 820×1180.
- Real taps on the UI; driving and walking used a key-input bot (DOM events through the game's own input).
- Event telemetry on every action, render cost per scene.

**Totals:** 12 scene visits, 5,000+ events logged, **0 console errors**, juice audit **70/70 events mapped**, tsc + build clean.

**Six tasks (cognitive walkthrough):**

| Task | Result | Taps / time | Notes |
|---|---|---|---|
| T1 pick player | ✅ | 1 tap | Switch chime, wave. Characters too small on the stage. |
| T2 change outfit | ✅ | 3 taps | Camera glides to the part, sparkles. **Black renders near-white** (fabric sheen under spotlights). |
| T3 reach the Studio | ✅ | ~50 m drive | **"Arrived" chime re-fires every frame during the fade** (~15× stacked). Studio pad approach awkward. |
| T4 crack wax | ✅ | Pick→Coat→dip→pour→Crack→Cool→squeeze | Ring-light gloss on wax, drips, cracks from the press point, gradual flakes. **Button reflow put "✨ New" where "Cool" was → one tap wiped the coat.** Pot/jug/plate are still v1 pastel. |
| T5 build a home | ✅ | ~20 s of play from town | Guide pill → FOR SALE mat (walked in) → "Choose your starter home" → Two-story template (183 pieces, 2 floors) → +5 items. **Car rolling slowly over a neighbor's mat auto-claimed a 2nd lot**; starter sheet has no "Not now". A gateway banner blocks the chase camera. Wall items need walls (red ghost explains it). |
| T6 creation in house | ✅ | Studio Save → Build → ⭐ Mine → drag | Mine tab half off-screen at 1180 px. |

**Also verified:**
- **Exploration:** 6 districts. Walking + driving. Charm hh1 on foot. Kicker jumps ×7. Charm sk4 on a ramp; the 2nd charm unlocked Glitter wax with the level-up fanfare. Portrait town HUD + touch controls OK. Slime v2 types and the stretch work.
- **Bug (fixed during the run):** wax shell drawn over the Slime station after a cross-station Studio entry.

**Render cost (peak, desktop measure):**

| Scene | Draw calls | Triangles | Status |
|---|---|---|---|
| town | 516 | 273k | **over the ≤300-call bar** |
| build edit | 450 | 254k | **over the ≤300-call bar** |
| picker | 225 | — | |
| style | 151 | — | |
| studio | 120 | — | |

The main cost is characters (58 meshes each) and per-piece house objects.

**Designer's 5 notes:**
1. **Preschool tone:** fixed. Neon picker, runway Style studio, downtown at golden hour, creator studio, teen characters. *Leftovers:* pastel wax props.
2. **Exploration/building minimal:** fixed. 6 districts, 40 charms, ramps, 65 piece types, 2 floors, finishes, templates.
3. **Walk + enter buildings:** fixed. 🚶 out, doors to Studio/Style/office/your own home.
4. **Can't find home building:** fixed. Guide pill + FOR SALE signs + starter picker. *Side effect:* accidental claims.
5. **Sounds less Animal Crossing:** fixed in code (re-voiced, beat music per place, all verified to play). **Not heard by ear.**

**Grades (each 7+ had to survive a counter-argument):**

| Row | Grade | Counter-argument tested | Survives? |
|---|---|---|---|
| Audience fit 9–11 | **7** | "The wax pot/jug/plate are still candy pastel; faces are plain." | Partly — props must change. Held at 7. |
| P1 Make it yours | **7.5** | "I picked black and got grey — I can't make the look I want." | Partly — 8 → 7.5. |
| P2 Satisfying touch | **8** | "Crack edges are stair-stepped." | Mostly survives. |
| P3 Free play | **7.5** | "One tap erased my wax; driving claimed a lot I didn't want." | Wins vs 9 → 7.5. |
| Exploration | **8** | "Pads are fiddly; the gateway banner blocks the view." | Mostly survives. |
| Building depth | **7.5** | "Templates are packed, so placing things fails a lot." | Partly. |
| Art / style | **7.5** | "Leftover pastel props; plain faces." | Partly. |
| Playability | **6** ✗ | Zero errors and every task completes, **but** draw calls are ~1.7× budget on iPad plus four sev-2/3 bugs (wax New-button, black colour, auto-claim, chime spam). | — |
| Sound | **7** | "No one has listened to it." | Held at 7 pending the kid session. |

| Activity | Grade |
|---|---|
| Wax | 8 (8.5 once the button bug + props are fixed) |
| Squishy | 7.5 |
| Slime | 8 |
| Style | 7 (black-colour bug) |
| Driving / exploration | 8 |
| Building | 7.5 |
| Profiles + share | 7 |

**Verdict:** NOT shipped yet — Playability 6. Round-2 tickets, ranked severity × reach:
1. Draw calls: merge each character's static meshes, merge house pieces in edit mode, drop shadows on small props.
2. Wax: stable button positions, no destructive tap without confirm.
3. Black/dark fabric fidelity.
4. FOR SALE: car shows a "Build here?" prompt instead of auto-claim, plus a "Not now" on the starter sheet.
5. Arrive-chime re-fire guard during transitions.
6. Pastel wax props → studio props (black pot, glass/steel jug, dark dish).
7. Gateway banner vs camera.
8. Picker characters bigger.
9. Mine tab visible without scrolling.
10. Wax layer thickness a touch up so the stripes read.

**The real external check (not done — needs the kids):** 15-minute silent session on the iPads.
- **Pass:** they find + start a home unaided, crack wax 3+ times voluntarily, nobody says "babyish", they ask to keep playing.
- **Watch for:** where they hesitate (pads vs doors), whether they read the 💎 counter, whether the music gets switched off.

### Round 2 — re-graded 2026-10-16 (same locked rubric; repro-first fixes)
**Repro suite** (`src/core/selftest.ts`). Each bug was reproduced failing before its fix; all now pass in the browser.

| Repro | Before | After |
|---|---|---|
| waxReflow | tap at old Cool spot hit "New" → coat wiped | hits Cool, coat kept; New is hold-to-confirm, bottom-left |
| carClaim | car auto-claimed a lot | lot not claimed; "🏠 Build here?" prompt shown |
| blackFabric | torso luma 0.42 | **0.17** |
| gateway | camera blocked 4/160 frames | **0/160** |
| drawCallsTown | 382 | **130** |
| drawCallsBuild | 379 | **106** |
| arriveOnce | — | passes: fires 1× in real time (v2 "chime ×15" **withdrawn** — a frame-stepping artifact of my test) |
| mineTab | — | passes: fully on screen (v2 finding **withdrawn**) |

**Full cold walkthrough, second profile (Moon), fresh save — 6/6 tasks, 0 console errors:**
1. Pick player.
2. Wolf cut + navy (camera glide, sparkles).
3. Drove the new Studio driveway.
4. Pink dip + cyan pour → Cool → crack → Save; buttons stayed in fixed slots.
5. FOR SALE mat by car → "Build here?" → claim → starter sheet (with "Not now") → Modern box → furniture: 3/5 first-try, the 2 misses were cells my own earlier drops filled.
6. ⭐ Mine → wax creation placed in the house.

Profiles stay separate (Star 0 creations, Moon 1); the shared town shows Moon's house.

**Peak draw calls over the whole run:**

| Scene | v2 | Round 2 |
|---|---|---|
| town | 516 | **223** |
| build | 450 | **215** (includes the template build-up transient) |
| style | 151 | **42** |
| picker | 225 | **33** |
| studio | 120 | 122 |

**Other fixes (Director):** studio-styled wax props (charcoal pot, copper band, steel jug, dark dish with neon rim), bigger picker characters, thicker wax layers, station visibility on Studio entry, picker disposes skinned characters.

| Row | v2 | Round 2 | Counter-argument tested → verdict |
|---|---|---|---|
| Audience fit 9–11 | 7 | **7.5** | "Faces are plain" — true, minor; the props were fixed. |
| P1 Make it yours | 7.5 | **8** | "Cool car paints are locked" — base has the full palette + gloss/matte; first reward comes at 2 charms. Holds. |
| P2 Satisfying touch | 8 | **8** | Unchanged; hold-to-confirm removes the one frustration. |
| P3 Free play | 7.5 | **8.5** | "Charms are a soft paywall" — no money, base content never locked, found by exploring. Holds. |
| Exploration | 8 | **8** | Studio driveway fixed. |
| Building depth | 7.5 | **8** | "Wall items need walls" — the red ghost explains it. Holds. |
| Art / style | 7.5 | **7.5** | "Plain faces, a few boxy buildings" — fair; held at 7.5. |
| Playability | 6 | **7.5** | Repros pass, 0 errors, both profiles, calls ≤ 223. Held below 8: not yet on a real iPad, and the car prompt needs the car stopped on the mat. |
| Sound | 7 | **7** | Still not heard by ear. |

| Activity | Round 2 |
|---|---|
| Wax | 8.5 |
| Squishy | 7.5 |
| Slime | 8 |
| Style | 8 |
| Driving / exploration | 8 |
| Building | 8 |
| Profiles + share | 7 |

**Verdict: every row ≥ 7 → ship round 2.**

Remaining external checks (kids + iPad): see docs/KIDS_PLAYTEST.md.

---

## v3 — "Fortnite for a 10-year-old girl, no combat" · graded 2026-10-16 ~12:45 CDT

Rubric: locked in docs/V3_PLAN.md before any v3 code. Grades are integers, honest, and capped at 7 where the only proof would be a real iPad or a real kid.

**How this was graded (be-ambitious protocol).** Every row rests on something other than an agent's report:
- **Production build:** a fresh `vite build`, served by `vite preview`, with the service worker cleared.
- **Self-tests:** 13/13 pass on that build, including the new swimOut, callCar, ridesParked (all 6 rides), callBoat and emoteWheel.
- **Console:** 0 errors.
- **Feet sweep, whole island:** 15 bad out of 5,704 spots (0.26%). All are under 1 m, on small props and road edges. Round 3 was 8 bad on a map 8× smaller.
- **Camera sweeps** (two agents, whole island):
  - movement agent: 26 non-foliage obstructions in 6,204 views (0.42%);
  - world agent: 20 in 11,548;
  - foliage clips about 5% of views.
- **Draw calls:**
  - town test spot: 169–180 calls;
  - busiest downtown view, world only: 132;
  - stress test (408 build pieces + 40 decor + 20 rides): worst 228, budget 250.
- **Screens checked by the Director in real WebGL** at 1280×613 (the aspect of 1920×920) and at iPad landscape 1180×820: lobby (2 and 6 players), Locker and reveal card, Style face close-up, party bus → jump → skydive → glider → landing, swimming, building plus the Townhouse starter, ice-cream truck and hoverboard, emote wheel, Studio, menu, Summit and Meadow.

| Row | Grade | Evidence | Counter-argument → verdict |
|---|---|---|---|
| Fortnite feel: movement + camera | **7** | Over-shoulder drag-look cam, sprint, jump, mantle, knee-slide, swim, glider, launch pads, 4 ziplines, party-bus drop: all exercised in a browser. | "You never *felt* it with a thumb." True: touch feel is unproven, so capped at 7. |
| Rides | **8** | 6 rides with measured, distinct handling (top speed 10.5–25, braking 5.7–16.8 m), the boat on water only, call-your-ride, off-road, driving on player builds, launch pads; ≤ 5 calls each. | "Engine voices unheard." True, but handling is measured; held at 8. |
| Building | **8** | Wall/floor/ramp/roof × wood/brick/metal anywhere, drag-build, 3×3 edit, 44 decor items, 3 starters, walk/drive on builds, saved; LOD keeps 400 pieces in budget. | "Edit and decor weren't hand-tested by the Director." Agent tests plus builds() = [] hold; kept at 8. |
| Locker + style depth | **8** | 26 skins × 3 styles + 9 suits, 168 parts, face options (5 eyes, 8 colours, 5 brows, freckles, makeup, 8 stickers), 16 back blings, 12 gliders, 6 contrails, 11 emotes, rarity cards, reveal card. | "Locker emote previews are silent." Being wired; not a blocker. 8. |
| World + look | **8** | Island with sea on every side, 10 POIs with title cards (4 new), bright stylized look, no invisible walls, 64 charms. | "Meadow flowers read as gems up close." Fixed before ship. "Minimap not eyeballed." Minor. 8. |
| Charms + upgrades | **8** | 64 charms over every POI (rooftops, glide-only spots); about 90 rewards on a ladder; Fortnite-style reveal with EQUIP. | "Too many rewards could dilute them." The ladder scales by charm count; holds. |
| Studio ASMR | **8** | Unchanged mechanics (round 2 graded wax 8.5, slime 8, squishy 7.5); reachable from the Studio building and the ☰ card; re-skinned UI checked. | Holds. |
| Audience fit (10 y/o girl) | **8** | Zero combat anywhere. The "creepy" fix is verified in close-ups: big warm eyes, no nostrils, smile, 5-finger chunky hands. Silly-fun beats: dance tunes, unicorn onesie, ice-cream truck jingle, party bus. | "Creepy is the designer's call, not mine." Fair; the kids' session decides. 8. |
| Stability | **7** | Prod 13/13, 0 errors, feet 0.26%, camera 0.42% non-foliage. | Today's integration still turned up bugs (empty emote wheel, a duplicate getter, gem flowers) all fixed, so more may be lurking. Held at 7. |
| Performance | **7** | 169–228 calls in every measured view, adaptive DPR, LOD for builds and decor, district culling. | No real-iPad fps yet. Capped at 7 by rule. |

**Verdict: every row ≥ 7 → ship v3.**

**Known issues**
- On short landscape *touch* screens (phone-sized), the 😀 emote button can touch the JUMP button. iPad landscape and desktop are fine.
- Foliage occasionally sits between the camera and the player.
- Engine, emote and SFX audio are checked by measurement only, not by ear.

**External checks still pending** (the real verdict): the iPad fps readout and the kids' 15-minute session (docs/KIDS_PLAYTEST.md).

### v3 external check: designer on a real iPhone (deployed v3, ~13:10 CDT)
- "I drove around the island and never saw dips below 60 fps. It was solid the entire time." This is the first real-device frame-rate evidence. **Performance 7 → 8** (it was capped only for lack of a device reading; the iPad check is still pending).
- "The HUD overlaps due to small screen and makes it fairly difficult to navigate the game world and menus." This is a **playability failure on phones**, and it confirms the known issue I listed (short-landscape touch overlap) was worse than I graded it.
  - The `hudLayout` fix already in the tree covers the in-world column.
  - A full phone pass on the HUD, menus, Locker, lobby and Studio is underway, plus a "turn sideways" card for the island in phone portrait.
  - **Stability / playability stays at 7 until it's re-verified at phone sizes.**
