import { WORLD_DATA_VERSION, type LeaderboardEntry, type Place, type ScoreSubmission, type WorldData, type WorldProgress, type WorldSize } from "../../../shared/types.ts";

/**
 * Serverless backend for static hosting (GitHub Pages): the world pipeline runs in the
 * page against the same public APIs, worlds are cached with the Cache API and the
 * killboard lives in localStorage.
 */

const CACHE = "krawk-worlds-v" + WORLD_DATA_VERSION;
const SCORES_KEY = "krawk.localScores";
const cacheUrl = (zip: string, size: WorldSize) => `/__krawk/world/${zip}/${size}`;

async function cachedWorld(zip: string, size: WorldSize): Promise<WorldData | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(cacheUrl(zip, size));
    return hit ? ((await hit.json()) as WorldData) : null;
  } catch {
    return null;
  }
}

async function storeWorld(zip: string, size: WorldSize, world: WorldData) {
  try {
    await (await caches.open(CACHE)).put(cacheUrl(zip, size), new Response(JSON.stringify(world), { headers: { "Content-Type": "application/json" } }));
  } catch {
    /* private mode or quota: just rebuild next time */
  }
}

export function localStreamWorld(zip: string, size: WorldSize, onProgress: (p: WorldProgress) => void) {
  let cancelled = false;
  const emit = (p: WorldProgress) => {
    if (!cancelled) onProgress(p);
  };
  const promise = (async () => {
    const cached = await cachedWorld(zip, size);
    if (cached) {
      emit({ type: "stage", stage: "cache", label: "Battlefield found in local archive", progress: 0.9, detail: cached.director.codename });
      emit({ type: "log", message: `Cache hit on ${zip} · served from this browser` });
      emit({ type: "done", world: cached });
      return cached;
    }
    const { buildWorld } = await import("../../../server/world.ts");
    try {
      const world = await buildWorld(zip, size, emit);
      void storeWorld(zip, size, world);
      emit({ type: "done", world });
      return world;
    } catch (err) {
      const message = (err as Error).message;
      emit({ type: "error", message });
      throw new Error(message);
    }
  })();
  return { promise, cancel: () => (cancelled = true) };
}

export async function localLookupZip(zip: string): Promise<Place | null> {
  try {
    const { geocodeZip } = await import("../../../server/geo/zip.ts");
    return await geocodeZip(zip);
  } catch {
    return null;
  }
}

function readScores(): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SCORES_KEY) ?? "[]") as LeaderboardEntry[];
  } catch {
    return [];
  }
}

const byScore = (a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score;

export function localLeaderboard(zip?: string): LeaderboardEntry[] {
  return readScores().filter((e) => !zip || e.zip === zip).sort(byScore).slice(0, 25);
}

export function localSubmitScore(s: ScoreSubmission & { placeName: string }) {
  const entry: LeaderboardEntry = { ...s, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const all = [...readScores(), entry].sort(byScore).slice(0, 200);
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  const forZip = all.filter((e) => e.zip === s.zip);
  const idx = forZip.findIndex((e) => e.id === entry.id);
  return { entry, rank: idx >= 0 ? idx + 1 : null, board: forZip.slice(0, 10) };
}
