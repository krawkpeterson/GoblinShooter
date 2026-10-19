/**
 * World coordinates are local meters centered on the zip code centroid.
 * +x = east, +z = south (three.js convention, so north is -z). y is up.
 */
export type Vec2 = [x: number, z: number];

export interface Place {
  zip: string;
  name: string;
  state: string;
  stateAbbr: string;
  lat: number;
  lon: number;
}

export interface TerrainGrid {
  /** Samples per side. heights.length === resolution * resolution, row-major from north-west. */
  resolution: number;
  /** Heights in meters relative to minElevation. */
  heights: number[];
  minElevation: number;
  maxElevation: number;
  metersPerSample: number;
  source: string;
}

export interface Building {
  footprint: Vec2[];
  height: number;
  kind: string;
  name?: string;
  /** Meters above local ground; OSM min_height / building:min_level. */
  minHeight?: number;
}

export type RoadKind = "motorway" | "primary" | "secondary" | "residential" | "service" | "path";

export interface Road {
  points: Vec2[];
  width: number;
  kind: RoadKind;
  name?: string;
}

export interface Area {
  polygon: Vec2[];
  kind: "water" | "park" | "forest" | "grass" | "sand" | "industrial" | "commercial" | "residential";
}

export interface Weather {
  temperatureC: number;
  code: number;
  description: string;
  cloudCover: number;
  windKph: number;
  isDay: boolean;
}

export interface DirectorPalette {
  sky: string;
  horizon: string;
  fog: string;
  sun: string;
  ground: string;
  rock: string;
  grass: string;
  accent: string;
}

export interface Director {
  source: "openai" | "heuristic";
  codename: string;
  briefing: string;
  biome: string;
  palette: DirectorPalette;
  fogDensity: number;
  /** 0..24 hour used to place the sun. */
  timeOfDay: number;
  heroSpawn: Vec2;
  spawnZones: Vec2[];
  waves: number;
  goblinsPerWave: number;
  taunts: string[];
}

export interface WorldStats {
  buildings: number;
  roadKm: number;
  trees: number;
  waterAreas: number;
  reliefMeters: number;
}

export interface WorldData {
  version: number;
  place: Place;
  sizeMeters: number;
  terrain: TerrainGrid;
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  trees: Vec2[];
  weather: Weather;
  director: Director;
  stats: WorldStats;
  generatedAt: string;
  cached?: boolean;
}

export type WorldProgress =
  | { type: "stage"; stage: string; label: string; progress: number; detail?: string }
  | { type: "log"; message: string }
  | { type: "done"; world: WorldData }
  | { type: "error"; message: string };

export interface ScoreSubmission {
  playerName: string;
  zip: string;
  score: number;
  kills: number;
  headshots: number;
  wave: number;
  accuracy: number;
  durationSec: number;
  weaponMostUsed: "m1911" | "anaconda";
}

export interface LeaderboardEntry extends ScoreSubmission {
  id: string;
  placeName: string;
  createdAt: string;
}

export const WORLD_SIZES = [600, 1000, 1600] as const;
export type WorldSize = (typeof WORLD_SIZES)[number];
export const WORLD_DATA_VERSION = 9;
