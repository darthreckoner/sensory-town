# ART DIRECTION v2 — "Tween-cool", not toddler-cute

**Why v2:** the designer's verdict on v1 was "fun for a 5-year-old, a hard sell for 9–11 — preschool cozy charm." He was right. v1 read as a baby toy because:
- candy pastels everywhere,
- big-head chibi characters,
- kawaii faces on everything,
- bubbly rounded UI with emoji soup,
- "Ta-da!" copy.

v2 keeps every mechanic and pillar and changes the **tone**.

**Audience test for every asset:** *would an 11-year-old screenshot this and send it to a friend, or would they be embarrassed it's "for babies"?*

## What 9–11s actually like (borrow exactly this)
- **Roblox *Dress to Impress* / SuperStylist** — teen-proportioned avatars, trendy real-world fashion, a runway with spotlights.
- **Roblox *Bloxburg*** — modern suburban houses with clean interiors: white walls, wood floors, black window frames, plants. Trendy room decor: LED strips, neon signs, gaming setups, bean bags, vanity mirrors.
- **TikTok / Coverstar ASMR videos** — a dark studio, one hero object under a ring light, glossy close-ups, colored LED rim glow. A phone on a tripod "recording".
- **Pick Me Up 3D / modern mobile games** — clean stylized realism: real-world proportions, crisp readable shapes, saturated (not pastel) color, strong light/shadow.

## Mood words
Stylish · glossy · "aesthetic" · golden hour · creator vibe · neon accents · confident.

## Palette

**World neutrals (most of the screen):**

| Name | Hex |
|---|---|
| Ink | `#0f0e17` |
| Charcoal | `#1d1b26` |
| Slate | `#2e2b3a` |
| Fog | `#8a8799` |
| Cloud | `#eeedf3` |
| White | `#ffffff` |

**Accents (small doses, they pop against neutrals):**

| Name | Hex |
|---|---|
| Hot pink | `#ff2e88` |
| Electric violet | `#7c4dff` |
| Cyan | `#00d4ff` |
| Lime | `#b6ff3b` |
| Sunset orange | `#ff8a3d` |
| Gold | `#ffc93c` |

**Town naturals:**

| Element | Hex |
|---|---|
| Grass | `#5d9e48` / `#6db25a` (vary) |
| Trees | `#2f7a45` / `#3f8f4a` / `#8fbf4a` (autumn accents ok) |
| Asphalt | `#3a3d47` |
| Road lines | white `#f4f4f4`; center line yellow `#ffcc33` |
| Sidewalk | `#cfccd4` |
| Curb | `#b7b3bd` |

**Architecture:**

| Element | Hex |
|---|---|
| Walls | white `#f3f2ee`, warm grey `#b9b4ac`, sage `#9fb59a`, navy `#2c3e5c`, terracotta `#c2603f` |
| Wood | `#b07a4f` |
| Trim / window frames | black `#23222a` |
| Glass | `#9fd8ff` (glossy, reflective) |
| Roofs | charcoal `#3a3a44`, slate `#5a6070`, terracotta `#b5523b` |

**Fashion / color pickers:** `tuning.art.palette` is a 24-swatch *fashion* palette — black, white, grey, denim, khaki, sage, cream, navy, plus neons and a few pastels. Pastels are fine as a *choice*; they must not be the whole world.

## Shapes and materials
- Real-world proportions. Bevels are small (`roundedBox` radius 0.02–0.05, not 0.1+).
- No blob-everything, no lollipop trees, no candy domes.
- Materials are believable stylized PBR:
  - Paint and plastic: roughness 0.35–0.55, clearcoat only on cars, glossy toys and wax.
  - Fabric: sheen.
  - Metal: metalness 0.8.
  - Glass: low roughness plus env reflections.
  - Wood: roughness 0.6.
- Glossy is for the ASMR objects (wax, slime, squishies, car paint), not for houses and trees.

## Lighting
- **Town — golden hour.**
  - Low warm sun (elevation ≈ 25°, color `#ffcf9e`), long soft shadows.
  - Cool sky fill (`#9ec5ff` hemisphere). Sky gradient: deep blue `#3d6fd1` at the top to warm peach `#ffc7a1` at the horizon.
  - Light warm fog.
- **Workshop — creator studio.**
  - Dark room (`#14121c`), a softbox key from the top front, and a **ring light whose reflection shows in glossy objects**.
  - Colored LED rim lights (hot pink + cyan) and an LED strip glow along the back wall.
  - The hero object is the brightest thing on screen.
- **Dress-up — runway / photo studio.** Dark backdrop, spotlights, a glossy floor reflection feel, and a light ring on the floor.

## Characters
- **Stylized teen proportions.** Head ≈ 1/6 of height, about 1.75 units tall. A slim stylized body with real arms and hands and longer legs (Roblox Rthro-lite / Sims-lite, never chibi).
- **Face.** Natural stylized eyes (medium, not anime-huge) with lashes or brows, a nose hint and soft lips. No blush circles. Expressions: smile, smirk, wink in poses.
- **Fashion — on-trend 2025–26:**
  - Tops: oversized hoodie, crop top, graphic tee, varsity jacket, puffer, sweater vest, tracksuit top.
  - Bottoms: baggy jeans, cargo pants, pleated skirt, bike shorts, joggers.
  - Shoes: chunky sneakers, high-tops, platform boots, slides with socks.
  - Hair: long waves, high pony, curtain bangs, braids, space buns, buzz / fade, fluffy curls, middle-part.
  - Accessories: headphones, sunglasses, bucket hat, claw clip, beanie, chain necklace, shoulder bag, tumbler cup.

## UI
- **Dark frosted glass** panels and white text.
  - Panels: `rgba(18,16,28,0.72)` + `backdrop-filter: blur`.
  - Corner radius 18px. Buttons are pill-shaped but not puffy; one accent gradient (hot pink → violet) for primary actions.
- **Font.** System SF Pro (not rounded), weight 700–800. Labels are short and confident.
- **Copy tone.** Cool, not baby: "Let's ride", "Save", "Crack it", "Clean crack!", "New look", "Studio".
- **Icons.** Keep emoji where they read as stickers or icons, but fewer of them, and never as the only design element.
- Touch targets are still ≥ 56 px. Kid-proof, just not kiddie.

## CSS tokens (`src/ui/style.css` → `:root`)
`--glass` · `--glass-strong` · `--glass-line` · `--text` · `--text-dim` · `--accent` (hot pink) · `--accent-2` (violet) · `--accent-3` (cyan) · `--lime` · `--gold` · `--grad` (primary gradient) · `--radius` · `--font`

Use the tokens; never hardcode pastel colors in module CSS.

## Anti-goals (added)
- Preschool / kawaii-baby look:
  - candy pastels everywhere,
  - chibi big-head characters,
  - faces on objects by default,
  - bubbly toddler UI,
  - baby-talk copy.
- Squishies may still have faces, but only as an **opt-in toggle** (default plain, like the Coverstar videos).
