# Third-party assets

Everything the game draws is procedural (code), except the motion clips below. We keep our own characters and wardrobe
(168 parts) and drive them with real animation clips.

## Motion clips: `public/anims/moves.glb`

| | |
|---|---|
| Source | Universal Animation Library (UAL1) — https://quaternius.itch.io/universal-animation-library |
| Source | Universal Animation Library 2 (UAL2) — https://quaternius.itch.io/universal-animation-library-2 |
| Author | Quaternius (@Quaternius) |
| Licence | **CC0 1.0 Universal** (public domain dedication, https://creativecommons.org/publicdomain/zero/1.0/); the itch.io pages say "Free to use in personal, educational and commercial projects (CC0)". No attribution is required; the credit here is a courtesy. |
| Retrieved | 2026-10-16 (free "Standard" tier of both packs; page captures in `vs_assets_raw/LICENSES/`) |
| Files used | `UAL1_Standard.glb`, `UAL2_Standard.glb` (no root motion; the `_RM` variants were not used) |
| Rig | UE-style 65 joints (`root, pelvis, spine_01..03, neck_01, Head, clavicle, upperarm, lowerarm, hand, fingers, thigh, calf, foot, ball`), 30 fps |

### What ships

`scripts/build-anims.mjs` extracts only the **non-combat** clips (no Pistol / Sword / Punch / Spell / Melee / Shield /
Zombie / Death / Hit / Knockback), drops the mesh, textures, fingers, leaf bones, scale tracks and root translation,
resamples the keys, and meshopt-compresses the result: **29 clips, about 265 KB**.

- UAL1 (18): `Idle_Loop, Idle_Talking_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop, Jump_Start, Jump_Loop, Jump_Land, Roll, Swim_Fwd_Loop, Swim_Idle_Loop, Driving_Loop, Sitting_Enter, Sitting_Idle_Loop, Sitting_Exit, Dance_Loop, Interact, Push_Loop`
- UAL2 (11): `ClimbUp_1m, Slide_Start, Slide_Loop, Slide_Exit, NinjaJump_Start, NinjaJump_Idle_Loop, NinjaJump_Land, Yes, Idle_No_Loop, Idle_FoldArms_Loop, Idle_TalkingPhone_Loop`

The service worker precaches the file (`glb` is in the PWA `globPatterns`).

### How it is used

`src/art/mocap.ts` retargets the clips onto the procedural `Character` skeleton at runtime (rest-pose-relative world
deltas, cached per clip; fingers and horizontal pelvis motion ignored) and plays them with a small blend tree. The
switch is `tuning.character.mocap` (off = the fully procedural motion that shipped before).

### Rebuilding

The raw packs live **outside the repository** (`C:\Dev\vs_assets_raw` on the build machine) and are never committed.
To rebuild: put the two GLBs back under that folder (or set `UAL_DIR`), then `node scripts/build-anims.mjs`.

## Reference only (not shipped, not in the repo)

Universal Base Characters (free tier), https://quaternius.itch.io/universal-base-characters, CC0, retrieved 2026-10-16.
Only used for a side-by-side comparison render in the dev body lab (`Superhero_Female_FullBody.gltf` next to our body);
nothing from it is bundled.
