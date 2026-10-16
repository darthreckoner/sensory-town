# DESIGN — Sensory Town v3 ("Fortnite-style, for a 10-year-old girl")

## Vision (one paragraph)
A bright, open island you drop onto from a party bus. You glide down, then walk, sprint, swim, drive or build anywhere. Pick a ride from a garage of vehicles, raise a house out of wood, brick or metal in seconds, then fill it with your own furniture. Collect charms hidden all over the island to unlock new outfits, back blings, gliders, emotes and rides. Dance with your friends' characters in the plaza, then duck into the Studio for the ASMR crafts (squishies, slime, wax cracking). It plays like Fortnite (the movement, the vehicles, the build-anything freedom, the locker) with every bit of combat removed: no weapons, no damage, no storm, no elimination. It's just silly fun.

## Audience
- One 10-year-old girl and her 9/11-year-old sibling, on iPad.
- They know Fortnite and Roblox. They want it to feel like the real thing: cool, fast, free, stylish. It must never feel babyish and never creepy.

## Player fantasy
"I can go anywhere, build anything and look amazing doing it." The kid is the star of their own island: their look, their ride, their builds.

## Pillars (every feature serves one)
1. **Make it yours.** Locker cosmetics, rides and wraps, free builds and decor all persist and show in the world.
2. **Satisfying touch.** Every build snap, boost, glide landing, emote, squeeze and crack answers instantly with a punchy sound and visual.
3. **Free play, truly free.** Walk, drive, swim, glide or build anywhere. No invisible walls; the sea is the only edge. No scores, timers, fail states or combat.

## Core loop
- **Every 10 seconds:** a verb with juice: sprint-jump, mantle, drift, boost, slap down a wall or ramp, place a sofa, emote, squish.
- **Every minute:** reach somewhere new (a POI title card pops), grab a charm, finish a little build, swap a skin.
- **Every session:** bus drop → glide in → explore, collect charms, unlock gear → build or decorate a hangout → Studio crafts → show off in the Locker.

## Mechanics

### Movement (Fortnite-style, on foot)
- **Feel:** athletic and free.
- **Rules:**
  - Over-the-shoulder third-person camera; drag to look.
  - Walk and sprint, jump, mantle up ledges, swim, and glide from heights or launch pads.
  - A party bus drops you in at the start of each session (skippable).
- **Juice:** dust puffs, landing thuds, glider whoosh, splash, and a camera FOV kick on sprint and launch.

### Rides
- **Feel:** "I can take anything anywhere."
- **Rules:**
  - Six rides with distinct handling: sports car, pickup, golf cart, hoverboard, ice-cream truck and boat.
  - Rides are parked all over the island; get into any of them.
  - The 🚗 button calls your favourite ride.
  - Wraps come from the Locker.
  - Drive off-road anywhere, and on your own ramps.
- **Juice:** engine voices per ride, boost, drift sparks, airtime, horns (the ice-cream truck plays a jingle).

### Building (Fortnite-style pieces, a nicer finish)
- **Feel:** "I raise a house in ten seconds and it looks good."
- **Rules:**
  - Build mode anywhere: wall, floor, ramp and roof, in wood, brick or metal.
  - Pieces snap to a world grid in front of you, and build in with an animation.
  - Drag to place several pieces at once.
  - Edit walls to cut windows, doors and arches.
  - Decor mode places furniture and decor inside your builds or anywhere outside.
  - Builds are walkable, drivable and saved.
- **Juice:** wood thunk, brick clunk, metal clang; dust and a little bounce as each piece rises.

### Locker (cosmetics)
- **Feel:** "I look amazing, and it's MY look."
- **Rules:**
  - Original skins with style variants, plus piece-by-piece custom styling (hair, top, bottom, shoes, accessories, all recolourable).
  - Back blings, gliders, contrails, an emote wheel, and ride wraps.
  - Rarity frames: common, uncommon, rare, epic, legendary.
- **Juice:** item previews spin, and the character emotes on equip.

### Charms and upgrades
- **Feel:** treasure hunting pays off.
- **Rules:**
  - Charms are hidden across every POI.
  - Charm milestones unlock Locker items, rides and build extras, each with a reveal.
- **Juice:** collect chime, rising "level-up" sting, and a big unlock reveal card.

### Studio (ASMR)
- The existing squishy, slime and wax stations, unchanged in feel.
- Reached by walking into the Studio building or from the ☰ menu tab.

### ASMR / audio layer
- Event-driven: gameplay emits events and the juice layer sounds them.
- Punchy, Roblox/Fortnite-energy SFX with per-event variation.
- Upbeat lobby-style music per place.

### Profiles and shared island
- Each kid has their own profile: Locker, charms, creations and favourite ride.
- One shared island: builds and decor carry an owner tag.
- Export/import the island between iPads (offline, no server).

## References (what exactly to borrow)
- **Fortnite (Battle Royale / Creative / LEGO Fortnite):**
  - The movement verbs and over-shoulder camera.
  - The bus drop and glider.
  - The four build pieces in three materials, the 3×3 wall edit, drag-building.
  - The locker slots and rarity colours.
  - Emotes, parked vehicles, POI title cards, bright saturated stylized-real art.
- **Roblox Dubai RP:** furniture and decor placement inside builds, flashy cars and driving. 
- **Coverstar, Glitter Slime, Fidget Toys:** the Studio ASMR (unchanged).

## Anti-goals (must NOT become)
- **Any combat:** no weapons, damage, health bars, storm, elimination or "victory royale". The harvest/pickaxe idea is out too.
- **A copy of Fortnite:** no Fortnite names, logos, characters, skins, emotes, maps or sounds. Everything is original, in the Fortnite *style*. The site is public.
- **Creepy or uncanny characters:** stylized, expressive, alive (blinks, looks, emotes). Never semi-real and dead-eyed.
- **Preschool or babyish:** no candy pastels everywhere, no baby-talk copy, no faces on everything.
- **Invisible walls, locked areas, pressure systems:** no timers, scores, lives, ads or purchases.

## Scope
- **Platform:** offline PWA on iPad (Safari, Add to Home Screen); also runs in a desktop browser. Touch first; keyboard and mouse on PC.
- **Done means:**
  - Every mechanic above is playable.
  - World sweeps are clean and repros pass.
  - Deployed to GitHub Pages.
  - Real-iPad fps and the kids' session (docs/KIDS_PLAYTEST.md) are the external check.
- **Deferred:** online multiplayer and live sync between iPads (offline, no server), App Store release.
