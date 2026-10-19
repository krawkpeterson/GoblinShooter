import { PolygonGrid, distToSegment, polyBounds } from "../shared/geometry.ts";
import {
  WORLD_DATA_VERSION,
  type Area, type Vec2, type WorldData, type WorldProgress, type WorldSize, type WorldStats,
} from "../shared/types.ts";
import { direct } from "./ai/director.ts";
import { seeded } from "./ai/heuristicDirector.ts";
import { elevationGrid } from "./geo/elevation.ts";
import { fetchOsm, polyArea, type OsmFeatures } from "./geo/osm.ts";
import { LocalProjection } from "./geo/projection.ts";
import { currentWeather } from "./geo/weather.ts";
import { geocodeZip } from "./geo/zip.ts";

const RESOLUTION: Record<WorldSize, number> = { 600: 257, 1000: 321, 1600: 385 };

export async function buildWorld(
  zip: string,
  size: WorldSize,
  emit: (p: WorldProgress) => void,
): Promise<WorldData> {
  const log = (message: string) => emit({ type: "log", message });
  const stage = (stage: string, label: string, progress: number, detail?: string) =>
    emit({ type: "stage", stage, label, progress, detail });

  stage("geocode", "Locking satellite on target", 0.05, zip);
  const place = await geocodeZip(zip);
  log(`Target acquired: ${place.name}, ${place.stateAbbr} @ ${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`);
  const proj = new LocalProjection(place.lat, place.lon);
  const resolution = RESOLUTION[size];

  stage("survey", "Pulling elevation, OpenStreetMap and live weather", 0.15, `${size}m × ${size}m`);
  const [terrain, osm, weather] = await Promise.all([
    elevationGrid(proj, size, resolution, log).then((t) => {
      stage("terrain", "Elevation model decoded", 0.4, `${t.resolution}² samples · ${Math.round(t.maxElevation - t.minElevation)}m relief`);
      return t;
    }).catch((err) => {
      log(`Elevation pipeline exploded (${(err as Error).message}); using flat pad`);
      return {
        resolution,
        heights: Array.from({ length: resolution * resolution }, () => 0),
        minElevation: 0,
        maxElevation: 1,
        metersPerSample: size / (resolution - 1),
        source: "flat fallback",
      };
    }),
    fetchOsm(proj, size, log)
      .then((o) => {
        stage("osm", "Street-level survey complete", 0.6, `${o.buildings.length} buildings · ${o.roads.length} roads`);
        return o;
      })
      .catch((err): OsmFeatures => {
        log(`OpenStreetMap unavailable (${(err as Error).message}); terrain-only battlefield`);
        return { buildings: [], roads: [], areas: [], trees: [], source: "none" };
      }),
    currentWeather(place.lat, place.lon).then((w) => {
      log(`Live weather: ${w.description}, ${Math.round(w.temperatureC)}°C, wind ${Math.round(w.windKph)} km/h`);
      return w;
    }),
  ]);

  stage("scatter", "Planting vegetation and clearing kill zones", 0.7);
  const half = size / 2;
  const buildingGrid = new PolygonGrid(osm.buildings.map((b) => ({ poly: b.footprint })), 24);
  const waterGrid = new PolygonGrid(osm.areas.filter((a) => a.kind === "water").map((a) => ({ poly: a.polygon })), 48);
  const blocked = (x: number, z: number) => !!buildingGrid.hit(x, z) || !!waterGrid.hit(x, z);
  const nearRoad = (x: number, z: number, pad: number) =>
    osm.roads.some((r) => {
      for (let i = 1; i < r.points.length; i++) {
        const [ax, az] = r.points[i - 1], [bx, bz] = r.points[i];
        if (distToSegment(x, z, ax, az, bx, bz).dist < r.width / 2 + pad) return true;
      }
      return false;
    });

  const trees = scatterTrees(osm.areas, osm.trees, zip, half, blocked);
  log(`${osm.trees.length} surveyed trees + ${trees.length - osm.trees.length} inferred from land cover`);

  const relief = terrain.maxElevation - terrain.minElevation;
  const roadKm = osm.roads
    .filter((r) => !r.name?.startsWith("~water"))
    .reduce((acc, r) => {
      let d = 0;
      for (let i = 1; i < r.points.length; i++)
        d += Math.hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][1] - r.points[i - 1][1]);
      return acc + d;
    }, 0) / 1000;
  const stats: WorldStats = {
    buildings: osm.buildings.length,
    roadKm,
    trees: trees.length,
    waterAreas: osm.areas.filter((a) => a.kind === "water").length,
    reliefMeters: relief,
  };

  const totalArea = size * size;
  const share = (kind: Area["kind"]) =>
    Math.min(1, osm.areas.filter((a) => a.kind === kind).reduce((s, a) => s + polyArea(a.polygon), 0) / totalArea);

  const rand = seeded(`${zip}:spawns`);
  const spawnCandidates: Vec2[] = [];
  for (let tries = 0; spawnCandidates.length < 24 && tries < 4000; tries++) {
    const angle = rand() * Math.PI * 2;
    const r = half * (0.45 + rand() * 0.45);
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    if (blocked(x, z)) continue;
    if (spawnCandidates.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < size * 0.12)) continue;
    spawnCandidates.push([Math.round(x), Math.round(z)]);
  }
  const heroCandidates: Vec2[] = [];
  for (let r = 0; heroCandidates.length < 1 && r < half * 0.5; r += 4) {
    for (let a = 0; a < 16 && heroCandidates.length < 1; a++) {
      const x = Math.cos((a / 16) * Math.PI * 2) * r, z = Math.sin((a / 16) * Math.PI * 2) * r;
      if (!blocked(x, z) && (osm.roads.length === 0 || nearRoad(x, z, 1))) heroCandidates.push([Math.round(x), Math.round(z)]);
    }
  }
  if (!heroCandidates.length) heroCandidates.push([0, 0]);
  if (spawnCandidates.length < 6) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      spawnCandidates.push([Math.round(Math.cos(ang) * half * 0.62), Math.round(Math.sin(ang) * half * 0.62)]);
    }
  }

  stage("director", "AI director composing the battle", 0.8);
  const director = await direct(
    {
      place, stats, weather, sizeMeters: size,
      forestShare: share("forest"),
      waterShare: share("water"),
      seaLevelVisible: terrain.minElevation < 1.5 && terrain.heights.filter((h) => h + terrain.minElevation < 1).length > terrain.heights.length * 0.05,
      spawnCandidates,
      heroCandidates,
    },
    log,
  );

  stage("assemble", "Assembling battlefield", 0.95, director.codename);
  return {
    version: WORLD_DATA_VERSION,
    place,
    sizeMeters: size,
    terrain,
    buildings: osm.buildings,
    roads: osm.roads,
    areas: osm.areas,
    trees,
    weather,
    director,
    stats,
    generatedAt: new Date().toISOString(),
  };
}

function scatterTrees(areas: Area[], surveyed: Vec2[], zip: string, half: number, blocked: (x: number, z: number) => boolean): Vec2[] {
  const rand = seeded(`${zip}:trees`);
  const out: Vec2[] = [...surveyed];
  const DENSITY: Partial<Record<Area["kind"], number>> = { forest: 1 / 90, park: 1 / 700, residential: 1 / 1400, grass: 1 / 2500 };
  for (const a of areas) {
    const density = DENSITY[a.kind];
    if (!density) continue;
    const b = polyBounds(a.polygon);
    const minX = Math.max(b.minX, -half), maxX = Math.min(b.maxX, half);
    const minZ = Math.max(b.minZ, -half), maxZ = Math.min(b.maxZ, half);
    if (minX >= maxX || minZ >= maxZ) continue;
    const grid = new PolygonGrid([{ poly: a.polygon }], 64);
    const n = Math.min(900, Math.round((maxX - minX) * (maxZ - minZ) * density));
    for (let i = 0; i < n && out.length < 4000; i++) {
      const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
      if (grid.hit(x, z) && !blocked(x, z)) out.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    }
  }
  return out;
}
