# DESIGN — Sensory Town (working title)

## Vision (one paragraph)
A cozy, touch-first 3D toy town for two kids (ages 9 and 11) on iPad. They dress up a character, drive around a small village, snap together houses, and visit a sensory workshop where they make and squish squishies, stretch slime, and coat squishies in wax to crack. All six of their requested activities (dress up, driving, squishies, ASMR, wax cracking, house/village building) live in one shared world instead of six separate mini-games. No scores, no timers, no failing — just making things and playing with them.

## Player fantasy
"This is my town and my stuff." The kid is a stylish resident who designs their look, builds their own houses, and makes custom sensory toys they can show off. They feel clever when something they made looks good and feels great to play with.

## Pillars (max 3 — every feature serves one)
1. **Make it yours** — outfits, houses, village layout and workshop creations are all customizable, and creations persist.
2. **Satisfying touch** — every press, drag, squeeze and crack has immediate visual and audio feedback (the ASMR pillar).
3. **Free play, no pressure** — no scores, timers, lives or fail states; instant reset on anything.

## Core loop
- **Every 10 seconds:** a tactile action with feedback — squeeze, pour, crack, snap a wall, swap an outfit piece, steer.
- **Every minute:** finish a small creation (a coated squishy, a room, an outfit) or drive to another spot in town.
- **Every session:** dress up → drive around → build/expand the village → make something in the workshop → display it at home. Saved locally for next time.

## Mechanics

### Dress-up
- Player should feel: stylish and in control of their look.
- Serves pillar: 1
- Rules: 3D character; swap hair, tops, bottoms, shoes, accessories; change colors. Outfit saves and shows in the world.
- Juice (success / failure / near-miss): sparkle/pose on change; soft click sound. No failure state.
- Tuning knobs: item counts per category, color palette, camera zoom/rotate speed.

### Driving
- Player should feel: free to cruise around their own town.
- Serves pillar: 3 (with 1 via car color)
- Rules: one drivable car on a small map connecting home, build area and workshop. Optional pickup-and-drop-off jobs (no timer, no penalty). iPad: on-screen steer/gas/brake. PC: WASD/arrow keys.
- Juice: engine hum, horn, gentle bump on collisions (no damage), arrival chime.
- Tuning knobs: top speed, acceleration, turn rate, camera follow distance, on-screen control size.

### House & village building
- Player should feel: "building is easy and it looks good."
- Serves pillar: 1
- Rules: drag rooms/walls/roofs that snap together on a grid; place houses on village plots; decorate with furniture; display workshop creations inside. Undo and delete always available.
- Juice: snap click + small bounce on placement; ghost preview before dropping.
- Tuning knobs: grid size, snap tolerance, piece catalog, number of village plots.

### Squishies & slime (workshop)
- Player should feel: the squish is real.
- Serves pillar: 2
- Rules: close-up workshop view, separate from the town camera. Pick a squishy shape and color; press and drag to deform it, release to slowly reform. Slime station: stretch, poke, fold, add glitter/color.
- Juice: deformation follows the finger exactly; slow-rise recovery; squelch and pop sounds.
- Tuning knobs: softness, recovery speed, stretch limit, sound volume/variation.

### Wax cracking (workshop)
- Player should feel: the crunch-and-peel satisfaction from Coverstar.
- Serves pillar: 2
- Rules: choose a squishy → dip it in wax OR pour wax over it → layer multiple colors → shell hardens → squeeze to crack and peel the shell away. Instant reset to crack again or recoat.
- Juice: cracks spread from exactly where the finger presses; little crunch sounds; soft squishy bulges through the shell; shell flakes fall away.
- Tuning knobs: wax colors, layer count, harden time, crack spread rate, shell thickness, flake size.

### ASMR layer
- Player should feel: calm, crisp, satisfying audio everywhere.
- Serves pillar: 2
- Rules: event-driven sound layer across all activities (squish, crunch, pour, snap, click). Master and per-category volume.
- Juice: slight pitch/variation per event so repeats don't feel robotic.
- Tuning knobs: volumes, variation range.

## References (what exactly to borrow)
- **SuperStylist** — outfit styling as the dress-up feel.
- **Pick Me Up 3D** — casual driving with pickup/drop-off jobs.
- **Fidget Toys** — tactile, repeatable press-and-play satisfaction.
- **Glitter Slime** — slime stretching and glitter customization.
- **Coverstar** — wax dipping/pouring and cracking.

## Anti-goals (must NOT become)
- Toca Boca style — flat 2D look (the kids specifically dislike it).
- Six disconnected mini-games with no shared world.
- Scores, timers, fail states, ads, or in-app purchases.

## Scope
- **Platform / stack:** 3D web app (WebGL) installed to the iPad Home Screen from Safari as a PWA. Must work fully offline. Touch is primary; the same app runs in a PC browser with mouse + WASD/arrow keys. Local saves on device.
- **Deadline:** playable on the kids' iPads before **3:00 p.m. Central, Fri Oct 16, 2026**.
- **First playable includes:** all six activities, one small neighborhood (home, build area, workshop, roads), one car, basic dress-up catalog, workshop with squishy, slime and wax stations, two kid profiles plus a shared town, local saves, town export/import.
- **Done means:** installs to Home Screen, launches and plays in airplane mode on the actual iPads, squeeze gestures and sound tested on device.
- **Explicitly deferred:** App Store release (needs Apple Developer membership and a Mac; review ~48 hrs), bigger map, more cars, shops/economy, live real-time sync between two iPads.

### Profiles & shared town
- Player should feel: "my stuff is mine, and our town is ours."
- Serves pillar: 1
- Rules: each kid has their own profile (name, character/outfit, car color, own house(s), workshop creations). A shared town both profiles can build in, with houses tagged by owner. Profile picker on launch; switch profiles anytime. Both kids can build together in the shared town on one iPad (pass-the-iPad). Across two iPads: export the shared town as a file and import it on the other iPad (via AirDrop/Files). Live sync between two iPads is deferred because the app has to work offline with no server.
- Juice: profile picker shows each kid's character posing; owner name tag above each house.
- Tuning knobs: max profiles, plot count per profile vs. shared.
