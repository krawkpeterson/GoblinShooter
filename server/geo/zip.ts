import type { Place } from "../../shared/types.ts";
import { fetchJson } from "./http.ts";

interface ZippopotamResponse {
  "post code": string;
  places: {
    "place name": string;
    longitude: string;
    latitude: string;
    state: string;
    "state abbreviation": string;
  }[];
}

interface NominatimHit {
  lat: string;
  lon: string;
  address?: {
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string;
  };
}

interface PhotonHit {
  features?: {
    geometry?: { coordinates?: [number, number] };
    properties?: {
      postcode?: string;
      city?: string;
      name?: string;
      county?: string;
      state?: string;
      countrycode?: string;
    };
  }[];
}

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

const STATE_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATES).map(([abbr, name]) => [name.toLowerCase(), abbr]),
);

/** Last-resort centroids for zips Zippopotam sometimes ghosts. */
const KNOWN: Record<string, Place> = {
  "95993": { zip: "95993", name: "Yuba City", state: "California", stateAbbr: "CA", lat: 39.1237, lon: -121.6611 },
};

export function normalizeZip(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

export async function geocodeZip(raw: string): Promise<Place> {
  const zip = normalizeZip(raw);
  if (!zip) throw new Error("Zip code must be 5 digits");

  const attempts: unknown[] = [];
  for (const lookup of [fromZippopotam, fromNominatim, fromPhoton]) {
    try {
      const place = await lookup(zip);
      if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) return place;
    } catch (err) {
      attempts.push(err);
    }
  }
  if (KNOWN[zip]) return { ...KNOWN[zip] };

  if (attempts.length && attempts.every(isNotFound)) {
    throw new Error(`Zip ${zip} doesn't exist. Not even the goblins live there.`);
  }
  throw new Error(`Couldn't lock ${zip}. The geocoders flinched — try again.`);
}

async function fromZippopotam(zip: string): Promise<Place | null> {
  const data = await fetchJson<ZippopotamResponse>(`https://api.zippopotam.us/us/${zip}`, { timeoutMs: 8000 });
  const p = data.places?.[0];
  if (!p) return null;
  return {
    zip,
    name: p["place name"],
    state: p.state,
    stateAbbr: p["state abbreviation"],
    lat: Number(p.latitude),
    lon: Number(p.longitude),
  };
}

async function fromNominatim(zip: string): Promise<Place | null> {
  const hits = await fetchJson<NominatimHit[]>(
    `https://nominatim.openstreetmap.org/search?postalcode=${zip}&countrycodes=us&addressdetails=1&format=jsonv2&limit=5`,
    { timeoutMs: 10000 },
  );
  const hit = hits.find((h) => (h.address?.postcode ?? "").replace(/\D/g, "").startsWith(zip)) ?? hits[0];
  if (!hit) return null;
  const a = hit.address ?? {};
  const name = a.city || a.town || a.village || a.hamlet || a.county || "Unknown";
  const stateAbbr = stateAbbrFrom(a.state, a["ISO3166-2-lvl4"]);
  return {
    zip,
    name,
    state: STATES[stateAbbr] ?? a.state ?? "United States",
    stateAbbr,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
  };
}

async function fromPhoton(zip: string): Promise<Place | null> {
  const data = await fetchJson<PhotonHit>(
    `https://photon.komoot.io/api/?q=${zip}&limit=8`,
    { timeoutMs: 10000 },
  );
  const feat = (data.features ?? []).find((f) => {
    const p = f.properties ?? {};
    const code = (p.countrycode ?? "").toUpperCase();
    const pc = (p.postcode ?? "").replace(/\D/g, "");
    return (code === "US" || code === "USA" || !code) && (!pc || pc.startsWith(zip));
  });
  if (!feat?.geometry?.coordinates) return null;
  const [lon, lat] = feat.geometry.coordinates;
  const p = feat.properties ?? {};
  const stateAbbr = stateAbbrFrom(p.state);
  return {
    zip,
    name: p.city || p.name || p.county || "Unknown",
    state: STATES[stateAbbr] ?? p.state ?? "United States",
    stateAbbr: stateAbbr || "US",
    lat,
    lon,
  };
}

function stateAbbrFrom(state?: string, iso?: string) {
  if (iso?.includes("-")) return iso.split("-")[1]!.toUpperCase();
  if (!state) return "";
  const up = state.toUpperCase();
  if (up.length === 2 && STATES[up]) return up;
  return STATE_ABBR[state.toLowerCase()] ?? "";
}

function isNotFound(err: unknown) {
  const s = String(err);
  return s.includes("404") || s.includes("doesn't exist");
}
