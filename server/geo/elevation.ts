import type { TerrainGrid } from "../../shared/types.ts";
import { fetchJson, fetchWithTimeout } from "./http.ts";
import type { LocalProjection } from "./projection.ts";

/**
 * Elevation from AWS Open Data "Terrarium" tiles (SRTM / NED / ETOPO blend; ~3-10m
 * resolution in the US). Decoded as height = R*256 + G + B/256 - 32768.
 * Falls back to Open-Meteo's Copernicus 90m DEM if tiles are unreachable.
 */
const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const phi = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n,
  };
}

export type PngDecoder = (buf: ArrayBuffer) => Promise<{ width: number; height: number; data: ArrayLike<number> }>;

let decodePng: PngDecoder = async (buf) => {
  const bmp = await createImageBitmap(new Blob([buf], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  return { width: bmp.width, height: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
};

/** Node has no canvas; the server swaps in a pure-JS decoder at startup. */
export function setPngDecoder(d: PngDecoder) {
  decodePng = d;
}

async function loadTile(z: number, x: number, y: number): Promise<Float32Array> {
  const res = await fetchWithTimeout(TILE_URL(z, x, y), { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`terrarium tile ${z}/${x}/${y}: ${res.status}`);
  const png = await decodePng(await res.arrayBuffer());
  const out = new Float32Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768;
  }
  return out;
}

export async function terrariumGrid(
  proj: LocalProjection,
  sizeMeters: number,
  resolution: number,
  onLog: (msg: string) => void,
): Promise<TerrainGrid> {
  const zoom = sizeMeters <= 600 ? 16 : sizeMeters <= 1000 ? 15 : 14;
  const half = sizeMeters / 2;
  const bb = proj.bbox(half);
  const tl = lonLatToTile(bb.west, bb.north, zoom);
  const br = lonLatToTile(bb.east, bb.south, zoom);
  const tx0 = Math.floor(tl.x), tx1 = Math.floor(br.x);
  const ty0 = Math.floor(tl.y), ty1 = Math.floor(br.y);

  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      jobs.push(loadTile(zoom, tx, ty).then((t) => void tiles.set(`${tx},${ty}`, t)));
    }
  }
  await Promise.all(jobs);
  onLog(`Decoded ${tiles.size} Terrarium elevation tiles at zoom ${zoom}`);

  const sampleTilePx = (px: number, py: number): number => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const tile = tiles.get(`${tx},${ty}`);
    if (!tile) return NaN;
    const lx = Math.min(255, Math.max(0, Math.floor(px - tx * 256)));
    const ly = Math.min(255, Math.max(0, Math.floor(py - ty * 256)));
    return tile[ly * 256 + lx];
  };
  const bilinear = (fx: number, fy: number): number => {
    const px = fx * 256 - 0.5, py = fy * 256 - 0.5;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const ax = px - x0, ay = py - y0;
    const a = sampleTilePx(x0, y0), b = sampleTilePx(x0 + 1, y0);
    const c = sampleTilePx(x0, y0 + 1), d = sampleTilePx(x0 + 1, y0 + 1);
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
  };

  const raw = new Float64Array(resolution * resolution);
  const step = sizeMeters / (resolution - 1);
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const { lat, lon } = proj.toLatLon(-half + i * step, -half + j * step);
      const t = lonLatToTile(lon, lat, zoom);
      raw[j * resolution + i] = bilinear(t.x, t.y);
    }
  }
  fillHoles(raw, resolution);
  smoothHeights(raw, resolution);
  return normalize(raw, resolution, step, `AWS Terrarium z${zoom}`);
}

export async function openMeteoGrid(
  proj: LocalProjection,
  sizeMeters: number,
  resolution: number,
  onLog: (msg: string) => void,
): Promise<TerrainGrid> {
  const coarse = 25;
  const half = sizeMeters / 2;
  const cstep = sizeMeters / (coarse - 1);
  const pts: { lat: number; lon: number }[] = [];
  for (let j = 0; j < coarse; j++)
    for (let i = 0; i < coarse; i++) pts.push(proj.toLatLon(-half + i * cstep, -half + j * cstep));

  const values: number[] = [];
  for (let k = 0; k < pts.length; k += 100) {
    const chunk = pts.slice(k, k + 100);
    const url =
      "https://api.open-meteo.com/v1/elevation?latitude=" +
      chunk.map((p) => p.lat.toFixed(6)).join(",") +
      "&longitude=" +
      chunk.map((p) => p.lon.toFixed(6)).join(",");
    const data = await fetchJson<{ elevation: number[] }>(url);
    values.push(...data.elevation);
  }
  onLog(`Sampled ${values.length} Copernicus DEM points via Open-Meteo`);

  const raw = new Float64Array(resolution * resolution);
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const u = (i / (resolution - 1)) * (coarse - 1);
      const v = (j / (resolution - 1)) * (coarse - 1);
      const i0 = Math.min(coarse - 2, Math.floor(u)), j0 = Math.min(coarse - 2, Math.floor(v));
      const au = u - i0, av = v - j0;
      const g = (ii: number, jj: number) => values[jj * coarse + ii];
      raw[j * resolution + i] =
        (g(i0, j0) * (1 - au) + g(i0 + 1, j0) * au) * (1 - av) +
        (g(i0, j0 + 1) * (1 - au) + g(i0 + 1, j0 + 1) * au) * av;
    }
  }
  return normalize(raw, resolution, sizeMeters / (resolution - 1), "Open-Meteo Copernicus GLO-90");
}

function smoothHeights(raw: Float64Array, n: number) {
  const next = new Float64Array(raw);
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      next[k] = (raw[k] * 4 + raw[k - 1] + raw[k + 1] + raw[k - n] + raw[k + n]) / 8;
    }
  }
  raw.set(next);
}

function fillHoles(raw: Float64Array, n: number) {
  for (let pass = 0; pass < 4; pass++) {
    let missing = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (Number.isFinite(raw[k])) continue;
        missing++;
        let s = 0, c = 0;
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const v = raw[jj * n + ii];
          if (!Number.isFinite(v)) continue;
          s += v;
          c++;
        }
        if (c) raw[k] = s / c;
      }
    }
    if (!missing) break;
  }
}

function normalize(raw: Float64Array, resolution: number, step: number, source: string): TerrainGrid {
  let min = Infinity, max = -Infinity;
  for (const v of raw) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) throw new Error("Elevation data was empty");
  const heights = Array.from(raw, (v) => Math.round(((Number.isFinite(v) ? v : min) - min) * 100) / 100);
  return { resolution, heights, minElevation: min, maxElevation: max, metersPerSample: step, source };
}

export async function elevationGrid(
  proj: LocalProjection,
  sizeMeters: number,
  resolution: number,
  onLog: (msg: string) => void,
): Promise<TerrainGrid> {
  try {
    return await terrariumGrid(proj, sizeMeters, resolution, onLog);
  } catch (err) {
    onLog(`Terrarium tiles failed (${(err as Error).message}); falling back to Open-Meteo`);
    return openMeteoGrid(proj, sizeMeters, resolution, onLog);
  }
}
