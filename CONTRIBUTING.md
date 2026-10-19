# Contributing to KRAWK

## Workflow

1. `git pull` and then `npm install`.
2. Make a branch: `git checkout -b feat/short-name`.
3. Run `npm run dev` and play your change in the browser. Most bugs here are only visible in-game.
4. Run `npm run typecheck` (TypeScript is strict). If you touched the world pipeline or `src/play/net/`, also run `VITE_KRAWK_STATIC=1 npm run build`.
5. Make small commits in conventional style: `feat(goblins): ...`, `fix(tutorial): ...`, `chore(build): ...`. One idea per commit.
6. Open a PR into `main`. Merging to `main` deploys to GitHub Pages automatically.

## Layout

```
index.html            Landing page (marketing site)
play.html             Game entry
shared/               Types and math used by both the server and the client
  types.ts            WorldData, Director, scores, WORLD_DATA_VERSION
server/               World pipeline + API. Runs in Node AND in the browser (see below)
  world.ts            buildWorld(zip, size, emit): the full pipeline
  geo/                zip.ts (geocode), elevation.ts (Terrarium tiles), osm.ts (Overpass),
                      weather.ts (Open-Meteo), projection.ts (lat/lon -> local meters)
  ai/                 director.ts (OpenAI), heuristicDirector.ts (rules fallback)
  db/                 Consistent-hash ring over node:sqlite shards (Node only)
  index.ts            Express API (Node only)
src/landing/          Landing page scripts, CSS, 3D goblin lineup
src/play/
  main.ts             Boots menu -> loading -> game
  net/api.ts          Client API. Switches to net/local.ts when VITE_KRAWK_STATIC=1
  net/local.ts        Browser-mode backend (Cache API worlds, localStorage killboard)
  game/game.ts        Main loop, waves, scoring, wiring
  game/tutorial.ts    Boot camp: Sgt. Grimsby's 11 steps of abuse
  game/pickups.ts     Ammo and health drops
  enemies/            goblins.ts (stats + AI), goblinModel.ts (procedural rigs),
                      flowField.ts (Dijkstra pathing around buildings)
  weapons/            weapons.ts (1911 + Anaconda defs, firing, recoil), models.ts (meshes)
  player/player.ts    Movement and collision
  world/              terrain.ts, city.ts (buildings/roads/cars), sky.ts, collision.ts
  audio/audio.ts      Fully synthesized audio, including the BOPOOOOOOM gunshot
  fx/                 Particles, muzzle flash, impacts
  ui/                 menu, loading, HUD, overlays, tactical map
  styles/             CSS per screen
src/styles/tokens.css Design tokens (colors, fonts), shared by landing and game
public/               Static files (favicon, shots/ screenshots)
```

## Rules that will bite you

- **`server/world.ts` and everything it imports must stay browser-safe.** The Pages build bundles it into the client. No `node:*` imports, no `pngjs`, and no `process` unless you guard it with `typeof process === "undefined"`. Node-only code goes in `server/index.ts` or `server/db/`. For example, PNG decoding uses the browser by default, and `server/index.ts` injects pngjs with `setPngDecoder`.
- **Bump `WORLD_DATA_VERSION` in `shared/types.ts`** whenever you change the shape or contents of `WorldData`, such as building heights or new fields. Old cached worlds (in SQLite and the browser Cache API) are then ignored instead of crashing the client.
- **Use relative asset paths** (`shots/x.jpg`, `play.html`, not `/shots/x.jpg`). The site is served from `/GoblinShooter/`, and vite uses `base: "./"`.
- **Public APIs need to stay CORS-friendly.** Browser mode calls Zippopotam, AWS tiles, Overpass and Open-Meteo directly. If you add a data source, check it works with `fetch` from a browser page. Overpass mirrors are tried in order in `server/geo/osm.ts`, and only some of them send CORS headers.
- **Secrets never go in `VITE_*` variables.** Anything prefixed `VITE_` is baked into the public bundle.
- **The hero only carries the 1911 and the Anaconda.** It's a design pillar, not an oversight.

## Recipes

**Add a goblin type**
1. Add the name to `GoblinKind` in `src/play/enemies/goblinModel.ts`. Give it a look in `buildGoblin`.
2. Add stats to `GOBLINS` in `src/play/enemies/goblins.ts`: hp, speed, damage, scale, score, attack range, timings and voice pitch.
3. Add it to the wave mix in `startWave()` in `src/play/game/game.ts`, and optionally to the landing bestiary in `index.html` and `src/landing/lineup.ts`.

**Tune a gun**
Edit its entry in `WEAPONS` (`src/play/weapons/weapons.ts`): damage, fire rate, mag, reserve, spread, recoil. The sound lives in `src/play/audio/audio.ts` (`gunshot`). The mesh lives in `src/play/weapons/models.ts`.

**Change how the world looks**
Building heights and footprints come from `server/geo/osm.ts`, and meshes and colors from `src/play/world/city.ts`. Terrain is in `terrain.ts`, sky, sun and fog in `sky.ts`, and post-processing in `src/play/engine/renderer.ts`. Bump `WORLD_DATA_VERSION` if you changed anything in `server/`.

**Change the AI director**
Both directors must return the `Director` type in `shared/types.ts`. Keep `heuristicDirector.ts` working, because it is the only director on GitHub Pages.

**Add a tutorial step or a roast**
Edit `src/play/game/tutorial.ts`. Place targets with `openSpot()`, which guarantees line of sight past buildings and cars.

## Debugging

- In the game page console, `window.__krawk` exposes `game`, `world`, `request`, `audio` and `input`.
- `?zip=90210` pre-fills the menu, and `?tod=night` forces the lighting.
- If a map comes out terrain-only (no buildings), Overpass failed. Look for "Overpass mirror ... failed" in the loading log.
