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
