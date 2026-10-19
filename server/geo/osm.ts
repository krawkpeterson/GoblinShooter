import type { Area, Building, Road, RoadKind, Vec2 } from "../../shared/types.ts";
import { fetchWithTimeout } from "./http.ts";
import type { LocalProjection } from "./projection.ts";
import { fetchMapTiles } from "./tiles.ts";

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

interface OsmGeomPoint { lat: number; lon: number }
interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OsmGeomPoint[];
  members?: { type: string; role: string; geometry?: OsmGeomPoint[] }[];
}

export interface OsmFeatures {
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  trees: Vec2[];
  source: string;
}

async function queryOverpass(
  query: string,
  onLog: (m: string) => void,
  timeoutMs = 8000,
): Promise<{ elements: OsmElement[]; host: string }> {
  const browser = typeof window !== "undefined";
  const urls = browser ? OVERPASS_ENDPOINTS.slice(0, 2) : OVERPASS_ENDPOINTS;
  const budget = browser ? Math.min(timeoutMs, 8000) : timeoutMs;
  let lastErr: unknown;
  for (const url of urls) {
    const host = new URL(url).host;
    try {
      let res = await fetchWithTimeout(`${url}?data=${encodeURIComponent(query)}`, { method: "GET", timeoutMs: budget });
      if (!res.ok && !browser) {
        res = await fetchWithTimeout(url, {
          method: "POST",
          timeoutMs: budget,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        });
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      if (!Array.isArray(json.elements)) throw new Error("bad overpass payload");
      return { elements: json.elements, host };
    } catch (err) {
      lastErr = err;
      onLog(`Overpass mirror ${host} failed (${(err as Error).message}), trying next`);
    }
  }
  throw new Error(`All Overpass mirrors failed: ${String(lastErr)}`);
}

const roadKind = (hw: string): RoadKind | null => {
  if (/^(motorway|trunk)(_link)?$/.test(hw)) return "motorway";
  if (/^primary(_link)?$/.test(hw)) return "primary";
  if (/^(secondary|tertiary)(_link)?$/.test(hw)) return "secondary";
  if (/^(residential|unclassified|living_street|road)$/.test(hw)) return "residential";
  if (/^service$/.test(hw)) return "service";
  if (/^(footway|path|cycleway|pedestrian|track|steps|bridleway)$/.test(hw)) return "path";
  return null;
};

const ROAD_WIDTH: Record<RoadKind, number> = {
  motorway: 15, primary: 11, secondary: 9, residential: 7, service: 4.5, path: 2.2,
};

const hashId = (id: number) => {
  let h = id ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function buildingHeight(tags: Record<string, string>, id: number): number {
  const h = parseFloat(tags.height ?? tags["building:height"] ?? "");
  if (Number.isFinite(h) && h > 1) return Math.min(h, 400);
  const levels = parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return levels * 3.2 + 1.2;
  const r = hashId(id);
  switch (tags.building) {
    case "house": case "detached": case "semidetached_house": case "bungalow":
      return 4.6 + r * 2.8;
    case "garage": case "garages": case "shed": case "carport": case "roof":
      return 2.8 + r;
    case "apartments": case "residential":
      return 9 + r * 9;
    case "commercial": case "retail": case "office":
      return 7 + r * 12;
    case "industrial": case "warehouse":
      return 8 + r * 5;
    case "church": case "cathedral":
      return 14 + r * 10;
    default:
      return 4.2 + r * 4;
  }
}

function areaKind(tags: Record<string, string>): Area["kind"] | null {
  if (tags.natural === "water" || tags.waterway === "riverbank" || tags.landuse === "reservoir" || tags.leisure === "swimming_pool") return "water";
  if (tags.natural === "wood" || tags.landuse === "forest") return "forest";
  if (tags.natural === "beach" || tags.natural === "sand" || tags.leisure === "pitch" && tags.surface === "sand") return "sand";
  if (/^(park|garden|golf_course|playground|recreation_ground)$/.test(tags.leisure ?? "") || tags.landuse === "cemetery") return "park";
  if (/^(grass|meadow|village_green)$/.test(tags.landuse ?? "") || /^(grassland|scrub|heath)$/.test(tags.natural ?? "") || tags.leisure === "pitch") return "grass";
  if (tags.landuse === "industrial") return "industrial";
  if (/^(commercial|retail)$/.test(tags.landuse ?? "")) return "commercial";
  if (tags.landuse === "residential") return "residential";
  return null;
}

export async function fetchOsm(
  proj: LocalProjection,
  sizeMeters: number,
  onLog: (m: string) => void,
): Promise<OsmFeatures> {
  const half = sizeMeters / 2;
  const bb = proj.bbox(half * 1.05);
  const b = `${bb.south.toFixed(6)},${bb.west.toFixed(6)},${bb.north.toFixed(6)},${bb.east.toFixed(6)}`;
  const buildingsQuery = `[out:json][timeout:8];way["building"](${b});out geom qt;`;
  const restQuery = `[out:json][timeout:8];
(
  way["highway"](${b});
  way["natural"~"^(water|wood|beach|sand|grassland|scrub|heath)$"](${b});
  way["waterway"~"^(riverbank|river|stream|canal)$"](${b});
  way["landuse"~"^(forest|grass|meadow|village_green|reservoir|cemetery|industrial|commercial|retail|residential)$"](${b});
  way["leisure"~"^(park|garden|golf_course|pitch|playground|recreation_ground|swimming_pool)$"](${b});
  relation["natural"="water"](${b});
  relation["landuse"="forest"](${b});
  node["natural"="tree"](${b});
);
out geom qt;`;

  try {
    const tiled = await fetchMapTiles(proj, sizeMeters, onLog);
    if (tiled.buildings.length > 0 || tiled.roads.length > 0) return tiled;
    onLog("Vector tiles had no streets or buildings; trying Overpass");
  } catch (err) {
    onLog(`Vector tiles failed (${(err as Error).message}); trying Overpass`);
  }

  onLog("Surveying streets and buildings (Overpass + OSM map export in parallel)");
  const [overB, overR, mapEls] = await Promise.all([
    queryOverpass(buildingsQuery, onLog, 8000).catch((err): { elements: OsmElement[]; host: string } => {
      onLog(`Overpass buildings failed (${(err as Error).message})`);
      return { elements: [], host: "none" };
    }),
    queryOverpass(restQuery, onLog, 8000).catch((): { elements: OsmElement[]; host: string } => ({ elements: [], host: "none" })),
    queryOsmMap(bb, onLog).catch((err): OsmElement[] => {
      onLog(`OSM map export failed (${(err as Error).message})`);
      return [];
    }),
  ]);
  const elements = [...overB.elements, ...overR.elements, ...mapEls];
  const host = overB.host !== "none" ? overB.host : mapEls.length ? "api.openstreetmap.org" : "none";
  onLog(`OpenStreetMap returned ${elements.length.toLocaleString()} raw elements from ${host}`);

  const toPts = (g: OsmGeomPoint[]): Vec2[] =>
    g.map((p) => {
      const [x, z] = proj.toLocal(p.lat, p.lon);
      return [Math.round(x * 100) / 100, Math.round(z * 100) / 100] as Vec2;
    });
  const inside = (pts: Vec2[], margin = 0) =>
    pts.some(([x, z]) => Math.abs(x) <= half + margin && Math.abs(z) <= half + margin);

  const buildings: Building[] = [];
  const roads: Road[] = [];
  const areas: Area[] = [];
  const trees: Vec2[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "node" && el.lat != null && el.lon != null) {
      const p = proj.toLocal(el.lat, el.lon);
      if (Math.abs(p[0]) < half && Math.abs(p[1]) < half) trees.push(p);
      continue;
    }
    if (el.type === "relation") {
      const kind = areaKind(tags);
      if (!kind) continue;
      for (const m of el.members ?? []) {
        if (m.role !== "outer" || !m.geometry || m.geometry.length < 4) continue;
        const pts = toPts(m.geometry);
        if (inside(pts, 50)) areas.push({ polygon: pts, kind });
      }
      continue;
    }
    if (!el.geometry || el.geometry.length < 2) continue;
    const pts = toPts(el.geometry);
    if (!inside(pts, 20)) continue;

    if (tags.building && pts.length >= 3) {
      const ring = cleanRing(pts);
      if (!ring) continue;
      const minH = parseFloat(tags.min_height ?? tags["building:min_level"] ?? "");
      buildings.push({
        footprint: ring,
        height: Math.round(buildingHeight(tags, el.id) * 10) / 10,
        kind: tags.building || "yes",
        name: tags.name,
        minHeight: Number.isFinite(minH) && minH > 0 ? (tags["building:min_level"] && !tags.min_height ? minH * 3.2 : minH) : 0,
      });
      continue;
    }
    if (tags.highway) {
      const kind = roadKind(tags.highway);
      if (!kind || tags.tunnel === "yes" || tags.layer?.startsWith("-")) continue;
      const lanes = parseFloat(tags.lanes ?? "");
      const width = Number.isFinite(lanes) && kind !== "path" ? Math.max(ROAD_WIDTH[kind], lanes * 3.4) : ROAD_WIDTH[kind];
      roads.push({ points: pts, width, kind, name: tags.name });
      continue;
    }
    if (tags.waterway && /^(river|stream|canal)$/.test(tags.waterway)) {
      roads.push({ points: pts, width: tags.waterway === "stream" ? 3 : 14, kind: "path", name: `~water:${tags.name ?? ""}` });
      continue;
    }
    const kind = areaKind(tags);
    if (kind && pts.length >= 4) areas.push({ polygon: pts.slice(0, -1), kind });
  }

  buildings.sort((a, b) => polyArea(b.footprint) - polyArea(a.footprint));
  return {
    buildings: buildings.slice(0, 3500),
    roads: roads.slice(0, 2500),
    areas: areas.slice(0, 800),
    trees: trees.slice(0, 4000),
    source: `OpenStreetMap via ${host}`,
  };
}

async function queryOsmMap(
  bb: { south: number; west: number; north: number; east: number },
  onLog: (m: string) => void,
): Promise<OsmElement[]> {
  const raw =
    `https://api.openstreetmap.org/api/0.6/map?bbox=${bb.west.toFixed(6)},${bb.south.toFixed(6)},${bb.east.toFixed(6)},${bb.north.toFixed(6)}`;
  const urls = [
    raw,
    `https://corsproxy.io/?${encodeURIComponent(raw)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(raw)}`,
  ];
  let lastErr: unknown;
  for (const url of urls) {
    const host = (() => { try { return new URL(url).host; } catch { return "proxy"; } })();
    try {
      const res = await fetchWithTimeout(url, { timeoutMs: 14000 });
      if (!res.ok) throw new Error(`${res.status}`);
      const xml = await res.text();
      if (!xml.includes("<osm")) throw new Error("not OSM XML");
      const elements = parseOsmXml(xml);
      onLog(`OSM map export via ${host}: ${elements.length.toLocaleString()} elements`);
      return elements;
    } catch (err) {
      lastErr = err;
      onLog(`OSM map via ${host} failed (${(err as Error).message})`);
    }
  }
  throw new Error(`OSM map export unreachable: ${String(lastErr)}`);
}

function xmlAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:\w]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

function xmlTags(body: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const re = /<tag k="([^"]*)" v="([^"]*)"\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    tags[m[1]] = m[2]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }
  return tags;
}

function parseOsmXml(xml: string): OsmElement[] {
  const nodes = new Map<number, OsmGeomPoint>();
  const elements: OsmElement[] = [];
  const nodeRe = /<node\s([^>]+)(?:\/>|>([\s\S]*?)<\/node>)/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(xml))) {
    const a = xmlAttrs(m[1]);
    const id = Number(a.id);
    const lat = Number(a.lat), lon = Number(a.lon);
    if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    nodes.set(id, { lat, lon });
    const tags = m[2] ? xmlTags(m[2]) : {};
    if (tags.natural === "tree") elements.push({ type: "node", id, lat, lon, tags });
  }
  const wayRe = /<way\s([^>]+)>([\s\S]*?)<\/way>/g;
  while ((m = wayRe.exec(xml))) {
    const a = xmlAttrs(m[1]);
    const body = m[2];
    const geometry: OsmGeomPoint[] = [];
    const nd = /<nd ref="(\d+)"\s*\/>/g;
    let n: RegExpExecArray | null;
    while ((n = nd.exec(body))) {
      const p = nodes.get(Number(n[1]));
      if (p) geometry.push(p);
    }
    elements.push({ type: "way", id: Number(a.id), tags: xmlTags(body), geometry });
  }
  return elements;
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

export function polyArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}
