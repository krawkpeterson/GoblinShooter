import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { Area, Building, Road, RoadKind, Vec2 } from "../../shared/types.ts";
import { fetchWithTimeout } from "./http.ts";
import type { LocalProjection } from "./projection.ts";

const TILEJSON = "https://tiles.openfreemap.org/planet";
const FALLBACK_TEMPLATE = "https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf";
const ZOOM = 14;

interface TileJson {
  tiles?: string[];
  maxzoom?: number;
}

let cachedTemplate: string | null = null;

async function tileTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  try {
    const res = await fetchWithTimeout(TILEJSON, { timeoutMs: 8000 });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = (await res.json()) as TileJson;
    const url = json.tiles?.[0];
    if (!url) throw new Error("no tiles url");
    cachedTemplate = url;
  } catch {
    cachedTemplate = FALLBACK_TEMPLATE;
  }
  return cachedTemplate;
}

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function lat2tile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

async function inflate(buf: ArrayBuffer): Promise<Uint8Array> {
  const u = new Uint8Array(buf);
  if (u.length < 2 || u[0] !== 0x1f || u[1] !== 0x8b) return u;
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([u]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function lonLatRings(geom: { type: string; coordinates?: unknown }): number[][][] {
  const coords = geom.coordinates;
  if (!coords) return [];
  if (geom.type === "Polygon") return coords as number[][][];
  if (geom.type === "MultiPolygon") return (coords as number[][][][]).flat();
  if (geom.type === "LineString") return [coords as number[][]];
  if (geom.type === "MultiLineString") return coords as number[][][];
  return [];
}

function toLocalRing(proj: LocalProjection, ring: number[][]): Vec2[] {
  return ring.map(([lon, lat]) => {
    const [x, z] = proj.toLocal(lat, lon);
    return [Math.round(x * 100) / 100, Math.round(z * 100) / 100] as Vec2;
  });
}

function omtRoadKind(cls: string): RoadKind | null {
  if (cls === "motorway" || cls === "trunk") return "motorway";
  if (cls === "primary") return "primary";
  if (cls === "secondary" || cls === "tertiary") return "secondary";
  if (cls === "minor" || cls === "unclassified") return "residential";
  if (cls === "service") return "service";
  if (cls === "path" || cls === "track" || cls === "pedestrian" || cls === "footway" || cls === "cycleway") return "path";
  return null;
}

const ROAD_WIDTH: Record<RoadKind, number> = {
  motorway: 15, primary: 11, secondary: 9, residential: 7, service: 4.5, path: 2.2,
};

function omtAreaKind(layer: string, cls: string, subclass: string): Area["kind"] | null {
  if (layer === "water" || cls === "water" || cls === "lake" || cls === "ocean" || cls === "river") return "water";
  if (layer === "park" || cls === "park" || cls === "cemetery" || subclass === "park") return "park";
  if (cls === "wood" || cls === "forest") return "forest";
  if (cls === "sand" || subclass === "sand") return "sand";
  if (cls === "grass" || cls === "farmland" || cls === "grassland" || cls === "scrub" || cls === "meadow") return "grass";
  if (cls === "industrial") return "industrial";
  if (cls === "commercial" || cls === "retail") return "commercial";
  if (cls === "residential") return "residential";
  return null;
}

function hashId(id: number): number {
  let h = id ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function polyArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

function cleanRing(pts: Vec2[]): Vec2[] | null {
  const ring = pts.slice();
  if (ring.length >= 2) {
    const a = ring[0], b = ring[ring.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2) ring.pop();
  }
  const out: Vec2[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.04) out.push(p);
  }
  if (out.length < 3) return null;
  if (polyArea(out) < 3) return null;
  return out;
}

export async function fetchMapTiles(
  proj: LocalProjection,
  sizeMeters: number,
  onLog: (m: string) => void,
): Promise<{ buildings: Building[]; roads: Road[]; areas: Area[]; trees: Vec2[]; source: string }> {
  const half = sizeMeters / 2;
  const bb = proj.bbox(half * 1.08);
  const z = ZOOM;
  const n = 2 ** z;
  const x0 = Math.max(0, lon2tile(bb.west, z));
  const x1 = Math.min(n - 1, lon2tile(bb.east, z));
  const y0 = Math.max(0, lat2tile(bb.north, z));
  const y1 = Math.min(n - 1, lat2tile(bb.south, z));
  const coords: [number, number][] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) coords.push([x, y]);
  }
  if (coords.length === 0 || coords.length > 16) {
    throw new Error(`tile window ${coords.length}`);
  }

  const template = await tileTemplate();
  onLog(`Fetching ${coords.length} OpenMapTiles vector tile${coords.length === 1 ? "" : "s"} @ z${z}`);

  const buffers = await Promise.all(coords.map(async ([x, y]) => {
    const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    const res = await fetchWithTimeout(url, { timeoutMs: 12000 });
    if (!res.ok) throw new Error(`${res.status} ${new URL(url).pathname}`);
    return { x, y, buf: await inflate(await res.arrayBuffer()) };
  }));

  const buildings: Building[] = [];
  const roads: Road[] = [];
  const areas: Area[] = [];
  const inside = (pts: Vec2[], margin = 20) =>
    pts.some(([x, z]) => Math.abs(x) <= half + margin && Math.abs(z) <= half + margin);

  for (const { x, y, buf } of buffers) {
    if (buf.byteLength < 2) continue;
    const tile = new VectorTile(new PbfReader(buf));
    const layers = tile.layers;

    const buildingLayer = layers.building;
    if (buildingLayer) {
      for (let i = 0; i < buildingLayer.length; i++) {
        const feat = buildingLayer.feature(i);
        const gj = feat.toGeoJSON(x, y, z);
        if (!gj.geometry) continue;
        for (const ring of lonLatRings(gj.geometry)) {
          const pts = toLocalRing(proj, ring);
          if (!inside(pts)) continue;
          const cleaned = cleanRing(pts);
          if (!cleaned) continue;
          const props = feat.properties;
          const rh = Number(props.render_height);
          const mh = Number(props.render_min_height);
          const h = Number.isFinite(rh) && rh > 1 ? Math.min(rh, 400) : 4.2 + hashId(feat.id ?? i) * 4;
          buildings.push({
            footprint: cleaned,
            height: Math.round(h * 10) / 10,
            kind: "yes",
            minHeight: Number.isFinite(mh) && mh > 0 ? mh : 0,
          });
        }
      }
    }

    const roadLayer = layers.transportation;
    if (roadLayer) {
      for (let i = 0; i < roadLayer.length; i++) {
        const feat = roadLayer.feature(i);
        const cls = String(feat.properties.class ?? "");
        const kind = omtRoadKind(cls);
        if (!kind) continue;
        const gj = feat.toGeoJSON(x, y, z);
        if (!gj.geometry) continue;
        for (const line of lonLatRings(gj.geometry)) {
          const pts = toLocalRing(proj, line);
          if (pts.length < 2 || !inside(pts, 40)) continue;
          roads.push({ points: pts, width: ROAD_WIDTH[kind], kind });
        }
      }
    }

    for (const name of ["landuse", "landcover", "park", "water"] as const) {
      const layer = layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const feat = layer.feature(i);
        const kind = omtAreaKind(name, String(feat.properties.class ?? ""), String(feat.properties.subclass ?? ""));
        if (!kind) continue;
        const gj = feat.toGeoJSON(x, y, z);
        if (!gj.geometry) continue;
        for (const ring of lonLatRings(gj.geometry)) {
          const pts = toLocalRing(proj, ring);
          if (pts.length < 4 || !inside(pts, 50)) continue;
          areas.push({ polygon: pts, kind });
        }
      }
    }
  }

  buildings.sort((a, b) => polyArea(b.footprint) - polyArea(a.footprint));
  onLog(`Vector tiles: ${buildings.length} buildings · ${roads.length} roads · ${areas.length} areas`);
  return {
    buildings: buildings.slice(0, 3500),
    roads: roads.slice(0, 2500),
    areas: areas.slice(0, 800),
    trees: [],
    source: "OpenStreetMap via OpenFreeMap",
  };
}
