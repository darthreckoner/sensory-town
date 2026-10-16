# v2 PLAN — older-kid tone, bigger world, deeper building, ASMR polish

## Designer feedback on v1 (the reason for v2)
1. "Fun for a 5-year-old, hard sell for 9–11 — preschool cozy charm." → **Re-skin everything** per `docs/ART_DIRECTION.md` (READ IT FIRST).
2. "Exploration and building are extremely minimal." → **Bigger world** with districts, destinations, stunts and collectible **charms**. **Bloxburg-depth building.**
3. "The ASMR aspects are the high points. More polish, but a decent base." → Keep the mechanics, polish them, add variety.

The pillars still hold:
- No money, timers, failing or scores. A charm count is a collection counter, not a score.
- Nothing that exists today gets locked; charms only unlock **bonus** cosmetics.

## Shared contracts (Director-owned unless noted)
- **Rewards / charms:** `src/core/unlocks.ts`.
  - `REWARDS` maps an id to `{ at, icon, label }`.
  - Functions: `isUnlocked(id)`, `rewardFor(id)`, `lockedToast(id)`, `collectCharm(charmId)`, `charmCount()`, `nextReward()`.
  - A locked item shows a 🔒 badge with "💎 N" and calls `lockedToast(id)` on tap. Items not in `REWARDS` are always available.
  - Reward ids each module must implement:
    - Wax: `wax.glitter`, `wax.chrome`, `wax.glow`.
    - Slime: `slime.holo`, `slime.galaxy`.
    - Squishy: `squishy.dragon`.
    - Car: `car.neon`, `car.chrome`, `car.trail`.
    - Outfit: `outfit.ledkicks`, `outfit.wings`, `outfit.crown`.
    - Build: `build.neonsign`, `build.pool`.
- **Save v2** (`src/core/model.ts`):
  - `Profile.charms: string[]`.
  - `Profile.carStyle?: { finish?, neon?, trail?, rims? }`.
  - `Creation.face?`, `Creation.finish?`, `Creation.slimeType?`.
  - Migration is done in `save.ts`. Any further save-shape change: tell the Director.
- **New events:** `charmCollected {pos,count}`, `rewardUnlocked {id,icon,label}` (juice shows a toast + fanfare), `carJump {pos,strength}`, `carLand {pos,strength}`.
- **UI tokens:** `src/ui/style.css :root` gets the v2 tokens from `ART_DIRECTION.md`. Existing class names (`.btn`, `.panel`, `.item`, `.tab`, `.swatch`, anchors) are restyled globally by the Director. Use classes and tokens; don't hardcode v1 pastels.
- **Lighting helpers:** `src/art/env.ts` gains:
  - `goldenHour(scene, opts)` for the town and build scenes.
  - `studioLights(scene)` for the workshop and dress-up (dark studio with a ring-light reflection env).

## Ownership
| Module | Owner | Files |
|---|---|---|
| Foundation re-skin (CSS, palette, materials, env, picker, menu), workshop studio room, squishy, wax, rewards | Director (Opus) | `src/ui/*`, `src/art/{materials,env,shapes,creationMesh}.ts`, `src/core/*`, `src/scenes/{Picker,Workshop}Scene.ts`, `src/workshop/{Squishy,Wax}Station.ts`, `src/workshop/wax/*`, `src/workshop/squishyBody.ts` |
| Character v2 + Style (dress-up) studio | Sonnet — dress-up coder | `src/art/character.ts`, `src/scenes/DressUpScene.ts` |
| World v2 (map, districts, terrain, car v2, charms, stunts, jobs) | Sonnet — drive coder | `src/world/townLayout.ts`, `src/world/townEnv.ts`, `src/drive/*`, `src/art/car.ts`, `src/scenes/DriveScene.ts` |
| Building v2 | Sonnet — build coder | `src/world/houseMesh.ts`, `src/build/*`, `src/scenes/BuildScene.ts` |
| Slime v2 | Sonnet — slime coder | `src/workshop/SlimeStation.ts`, `src/workshop/slime/*` |

## Cross-module contract: the map (drive coder writes, build coder reads)
`townLayout.ts` keeps its export names:
- `ROADS`, `onRoad()`, `PLOTS`, `plotAt()`, `WORKSHOP` (now "the Studio"), `BUILD_YARD`, `LANDMARKS`, `JOB_SPOTS`, `SPAWN`, `BOUNDS`, `GROUND`, `isReserved()`, `seeded()`.

It adds:
- `CHARMS: { id, x, z, y? }[]`.
- `DISTRICTS: { id, name, icon, x, z, radius }[]` (the minimap and Build use these).
- `RESIDENTIAL: { center:{x,z}, radius }` — the Build town view frames this.

`PLOTS` becomes **12 plots of 12×12 cells** (`tuning.build.plotCells = 12`, owned by the build coder; positions derive from it). Build must not assume plot positions; read `PLOTS`.

Existing saves keep their plot indices: pieces at 0..7 still fit in 12×12.
