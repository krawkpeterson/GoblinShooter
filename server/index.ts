import express from "express";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { WORLD_DATA_VERSION, WORLD_SIZES, type ScoreSubmission, type WorldProgress, type WorldSize } from "../shared/types.ts";
import { ShardCluster } from "./db/cluster.ts";
import { Repo } from "./db/repo.ts";
import { setPngDecoder } from "./geo/elevation.ts";
import { geocodeZip, normalizeZip } from "./geo/zip.ts";
import { buildWorld } from "./world.ts";

const ROOT = resolve(import.meta.dirname, "..");
if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

setPngDecoder(async (buf) => PNG.sync.read(Buffer.from(buf)));

const PORT = Number(process.env.PORT ?? process.env.KRAWK_API_PORT ?? 8787);
const SHARDS = Number(process.env.KRAWK_SHARDS ?? 4);
const isProd = process.env.NODE_ENV === "production";

const cluster = new ShardCluster(join(ROOT, "data", "shards"), SHARDS);
const repo = new Repo(cluster);
const inflight = new Map<string, Promise<unknown>>();

const app = express();
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, shards: repo.stats(), ai: process.env.OPENAI_API_KEY ? "openai" : "heuristic" });
});

const zipCache = new Map<string, Awaited<ReturnType<typeof geocodeZip>>>();
app.get("/api/zip/:zip", async (req, res) => {
  const zip = normalizeZip(req.params.zip);
  if (!zip) {
    res.status(400).json({ error: "Zip code must be 5 digits" });
    return;
  }
  try {
    const place = zipCache.get(zip) ?? (await geocodeZip(zip));
    zipCache.set(zip, place);
    res.json(place);
  } catch (err) {
    const message = (err as Error).message;
    const missing = message.includes("doesn't exist");
    res.status(missing ? 404 : 502).json({ error: message });
  }
});

app.get("/api/world/:zip/stream", async (req, res) => {
  const zip = req.params.zip;
  const size = Number(req.query.size ?? 1000) as WorldSize;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (p: WorldProgress) => res.write(`data: ${JSON.stringify(p)}\n\n`);

  if (!/^\d{5}$/.test(zip) || !WORLD_SIZES.includes(size)) {
    send({ type: "error", message: "Give me a real 5-digit zip and a valid map size." });
    return res.end();
  }

  try {
    const cached = req.query.fresh ? null : repo.getWorld(zip, size, WORLD_DATA_VERSION);
    if (cached) {
      send({ type: "stage", stage: "cache", label: "Battlefield found in sharded archive", progress: 0.9, detail: cached.director.codename });
      send({ type: "log", message: `Cache hit on ${zip} · served from shard storage` });
      send({ type: "done", world: { ...cached, cached: true } });
      return res.end();
    }
    const key = `${zip}:${size}`;
    let job = inflight.get(key) as Promise<Awaited<ReturnType<typeof buildWorld>>> | undefined;
    if (!job) {
      job = buildWorld(zip, size, send);
      inflight.set(key, job);
      job.finally(() => inflight.delete(key)).catch(() => {});
    } else {
      send({ type: "log", message: "Another soldier is already generating this zip; piggybacking..." });
    }
    const world = await job;
    repo.putWorld(world);
    send({ type: "done", world });
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
  }
  res.end();
});

app.post("/api/players", (req, res) => {
  const { id, name, tutorialShame } = req.body ?? {};
  if (typeof id !== "string" || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "id and name required" });
  res.json(repo.upsertPlayer(id, name.trim().slice(0, 24), Number(tutorialShame) || 0));
});

app.post("/api/scores", (req, res) => {
  const b = req.body as Partial<ScoreSubmission> & { playerId?: string; placeName?: string };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const s: ScoreSubmission = {
    playerName: String(b.playerName ?? "Anonymous").trim().slice(0, 24) || "Anonymous",
    zip: String(b.zip ?? ""),
    score: Math.round(num(b.score)),
    kills: Math.round(num(b.kills)),
    headshots: Math.round(num(b.headshots)),
    wave: Math.round(num(b.wave)),
    accuracy: Math.min(1, Math.max(0, num(b.accuracy))),
    durationSec: num(b.durationSec),
    weaponMostUsed: b.weaponMostUsed === "anaconda" ? "anaconda" : "m1911",
  };
  if (!/^\d{5}$/.test(s.zip) || [s.score, s.kills, s.headshots, s.wave, s.accuracy, s.durationSec].some(Number.isNaN))
    return res.status(400).json({ error: "invalid score" });
  if (s.score > 10_000_000 || s.headshots > s.kills) return res.status(400).json({ error: "nice try, goblin" });
  const entry = repo.insertScore(s, String(b.placeName ?? "").slice(0, 60));
  if (typeof b.playerId === "string") repo.recordPlayerRun(b.playerId, s);
  const board = repo.leaderboardForZip(s.zip, 10);
  res.json({ entry, rank: board.findIndex((e) => e.id === entry.id) + 1 || null, board });
});

app.get("/api/leaderboard", (req, res) => {
  const zip = typeof req.query.zip === "string" ? req.query.zip : null;
  res.json(zip ? repo.leaderboardForZip(zip) : repo.globalLeaderboard());
});

if (!isProd) {
  // Lets the in-game photo mode write marketing screenshots straight into the landing page assets.
  app.post("/api/dev/screenshot", (req, res) => {
    const { name, dataUrl } = req.body ?? {};
    if (typeof name !== "string" || !/^[a-z0-9-]+$/.test(name) || typeof dataUrl !== "string") return res.status(400).end();
    const dir = join(ROOT, "public", "shots");
    mkdirSync(dir, { recursive: true });
    const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
    writeFileSync(join(dir, `${name}.${ext}`), Buffer.from(dataUrl.split(",")[1], "base64"));
    res.json({ ok: true, path: `/shots/${name}.${ext}` });
  });
}

if (isProd && existsSync(join(ROOT, "dist"))) {
  app.use(express.static(join(ROOT, "dist"), { extensions: ["html"] }));
}

const server = app.listen(PORT, () => {
  console.log(`KRAWK API on :${PORT} · ${SHARDS} shards · AI director: ${process.env.OPENAI_API_KEY ? "OpenAI" : "rules"}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    cluster.close();
    process.exit(0);
  });
}
