# KRAWK

**Your zip code. Their graveyard.** A browser FPS where you type any US zip code and fight goblins on the real ground: real elevation, real streets, real buildings and live weather, all pulled from public data when you hit deploy.

**Play:** https://krawkpeterson.github.io/GoblinShooter/

You get two guns, a .45 ACP double-stack 1911 and a .44 Magnum Colt Anaconda, and a drill sergeant who roasts you through boot camp.

## Quick start

Requires **Node 22.13+** (it uses the built-in `node:sqlite`).

```bash
git clone https://github.com/krawkpeterson/GoblinShooter.git
cd GoblinShooter
npm install
npm run dev
```

Open http://localhost:5173 for the landing page, or http://localhost:5173/play.html for the game.

`npm run dev` starts two processes:

| Process | Port | What it is |
| --- | --- | --- |
| `web` (Vite) | 5173 | Landing page and game, with hot reload. Proxies `/api` to the API. |
| `api` (Express via tsx) | 8787 | Builds worlds, caches them in the sharded SQLite database, and runs the killboard. |

## Two ways it runs

1. **Server mode (local dev, `npm run dev`).** The Express API builds worlds and streams progress over Server-Sent Events. It stores worlds and scores in 4 SQLite shards under `data/shards/` (gitignored) and can use OpenAI for the AI director.
2. **Browser mode (GitHub Pages).** This is what's live. Built with `VITE_KRAWK_STATIC=1`, so there is no server. The same world pipeline in `server/world.ts` runs in the browser, worlds are cached with the Cache API, and the killboard lives in `localStorage` (per device). The AI director always uses the built-in rules engine here.

To try browser mode locally:

```bash
VITE_KRAWK_STATIC=1 npm run build
npx vite preview
```

## Environment variables

Copy `.env.example` to `.env`. Every variable is optional.

| Variable | Default | Effect |
| --- | --- | --- |
| `OPENAI_API_KEY` | unset | Lets an LLM write the battle (biome, palette, waves, codename, trash talk). Without it, a heuristic director does the same job. **Server mode only. Never put it in a `VITE_*` variable or it ships to the browser.** |
| `OPENAI_MODEL` | see `server/ai/director.ts` | Model used by the director. |
| `KRAWK_API_PORT` / `PORT` | `8787` | API port. |
| `KRAWK_SHARDS` | `4` | Number of SQLite shards. |
| `VITE_KRAWK_STATIC` | unset | `1` builds the serverless browser-mode version. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and Vite together. |
| `npm run typecheck` | `tsc --noEmit`. Run it before every commit. |
| `npm run build` | Typecheck plus a production build into `dist/`. |
| `npm start` | Production API (also serves `dist/`). |

## Deploying

Every push to `main` triggers `.github/workflows/pages.yml`, which builds with `VITE_KRAWK_STATIC=1` and publishes to GitHub Pages. Watch it with `gh run watch`.

## Data sources

Terrain: [AWS Terrarium elevation tiles](https://registry.opendata.aws/terrain-tiles/) · Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), via Overpass · Weather: [Open-Meteo](https://open-meteo.com/) · Geocoding: [Zippopotam.us](https://zippopotam.us/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture, conventions and recipes. If you use Cursor or another AI agent, [AGENTS.md](AGENTS.md) contains the rules it reads automatically.
