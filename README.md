# Sensory Town

A cozy, touch-first **3D toy town** for iPad (and desktop browsers): dress up, drive around, build houses in a shared town, and visit the sensory workshop to squish squishies, stretch slime and crack wax-coated squishies. No scores, no timers, no fail states. Everything works **offline** once installed.

Built with Vite + TypeScript + Three.js. All models, textures and sounds are generated in code — no downloads, no network.

---

## Run it locally

```bash
npm install
npm run dev
```

Open the printed URL (e.g. `http://localhost:5173`). The dev server also listens on your LAN (`http://<your-pc-ip>:5173`) so you can try it on an iPad on the same Wi-Fi — but a LAN dev server **can't be installed with offline support** (that needs HTTPS, see below).

Handy test URLs: `?scene=wax`, `?scene=squishy`, `?scene=slime`, `?scene=town`, `?scene=build`, `?scene=dressup` jump straight to an activity.

## Build

```bash
npm run build      # type-checks, then writes the static site to dist/
npm run preview    # serves dist/ locally to sanity-check the production build
```

`npm run build` produces a fully static `dist/` folder: HTML, JS, icons, the web-app manifest and a service worker that precaches every file.

## Deploy (HTTPS is required for installing to the Home Screen)

### Option A — GitHub Pages (set up in this repo)

The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`.

1. Push the repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab).
4. The site appears at `https://<your-user>.github.io/<repo-name>/`.

The workflow sets `BASE=/<repo-name>/` so all paths work under the project sub-folder.

### Option B — Netlify or Cloudflare Pages

Build command `npm run build`, publish directory `dist`, and set the environment variable `BASE=/` (root-hosted). Or drag-and-drop a locally built `dist/` (built with `BASE=/ npm run build`) onto Netlify Drop.

## Install on the iPad (one-time, needs Wi-Fi)

1. On each iPad open **Safari** (must be Safari) and go to the HTTPS URL.
2. Wait a few seconds on the first screen so the game can save itself for offline use.
3. Tap the **Share** button → **Add to Home Screen** → **Add**.
4. Launch **Sensory Town** from the Home Screen icon (it opens full-screen, landscape).
5. **Offline check:** turn on **Airplane Mode**, close the app (swipe it away), open it again from the Home Screen. It should load and play normally.

Saves live on the iPad (IndexedDB) and survive restarts. The game asks the browser to keep its storage persistent.

### Sound on iPad
- The game's sound starts after the first tap (the "Who is playing?" screen).
- **The iPad's silent / ring switch (or Control Center silent mode) can mute web-app sound.** If there's no sound, turn silent mode off and turn the volume up.
- Volumes are in the 🏠 menu → **Sound**. Music in the workshop is off by default (toggle there).

## Two iPads: sharing a town

There is no live sync (the game is offline-only). To swap towns:

1. On iPad A: 🏠 menu → **Share Town** → AirDrop it to iPad B (or save to Files).
2. On iPad B: save the file to Files, then 🏠 menu → **Get Town** → pick the file → confirm.

The file contains the whole shared town **and** every player profile (outfits, cars, creations). Importing replaces the town on that iPad.

## How to play (for grown-ups)

- **Who is playing?** — tap your character. ✏️ renames, ➕ adds a player.
- **Dress Up** — pick a category on the left, an item and a color on the right. Drag to spin, pinch to zoom. **Let's go!** drives off.
- **Drive** — left thumb joystick to steer, right pedals for go/brake, 📯 horn. On PC: WASD / arrow keys, Space brakes, H honks. Drive onto the glowing 🧪 pad to enter the workshop or the 🔨 pad to build. Waving people want a ride — pick them up and drop them off (no timer, just confetti).
- **Build** — tap an empty plot to start a house; drag pieces from the palette, tap a piece to rotate/recolor/delete; ↶ undo. Only the owner can change their house. Your workshop creations are under ⭐ and can sit on tables and shelves.
- **Workshop** — 🧸 Squishy (press and drag to squish), 🫧 Slime (stretch, poke, fold, add glitter), 🕯️ Wax (pick → dip/pour layers → crack). 💾 keeps a creation for your shelf and houses.

## Debug

| Key | What |
|---|---|
| `` ` `` | Toggle the debug overlay (fps, scene, key tuning values) — iPad: **three-finger tap** |
| F1 | Reset the current station |
| F2 | Fill the town with test houses |
| F3 | Wax harden time = 0 |

All tunable numbers live in `src/tuning.ts`.

## Code map

- `src/core/` — scene manager, typed event bus, save store (IndexedDB, versioned schema), share/import, debug.
- `src/juice/` — the juice layer: procedural Web Audio synth + particle effects, driven only by events.
- `src/art/` — shared look: materials, lights, squishy shapes with faces, character, car, creation models.
- `src/world/` — town layout data, town environment, house/decoration meshes.
- `src/scenes/` — Picker, Dress Up, Drive (town), Build, Workshop.
- `src/workshop/` — Squishy, Slime and Wax stations (wax: `wax/coating.ts`, `wax/fracture.ts`).
- `src/ui/` — kid-sized UI kit + global menu.
