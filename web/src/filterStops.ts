// The filter logic, on its own so it can be tested without React or a map.

import type { Feature, Point } from "geojson";
import { BUSY_THRESHOLD } from "./config";
import type { Filters, StopProperties } from "./types";

export type StopFeature = Feature<Point, StopProperties>;

// A stop passes if it is in the chosen county (when one is chosen) and has
// every facility that is switched on. "unknown" never passes a facility test.
export function stopPasses(p: StopProperties, filters: Filters, county: string | null): boolean {
  if (county && p.county !== county) return false;
  if (filters.shelter && p.shelter !== "yes") return false;
  if (filters.seating && p.bench !== "yes") return false;
  if (filters.rtpi && p.rtpi !== "yes") return false;
  if (filters.wheelchair && p.wheelchair !== "yes") return false;
  if (filters.busy && (p.departures_weekday ?? 0) < BUSY_THRESHOLD) return false;
  return true;
}

export function filterStops(stops: StopFeature[], filters: Filters, county: string | null): StopFeature[] {
  return stops.filter((f) => stopPasses(f.properties, filters, county));
}

// Straight-line distance between two points in metres (haversine formula).
export function distanceMetres(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface NearbyStop {
  feature: StopFeature;
  metres: number;
}

// Other stops within `radius` metres of a point, nearest first.
export function nearbyStops(
  stops: StopFeature[],
  lng: number,
  lat: number,
  excludeId: string,
  radius = 400,
  limit = 6,
): NearbyStop[] {
  const out: NearbyStop[] = [];
  // Quick reject: 0.01 degrees is roughly 1 km, far more than the radius.
  for (const f of stops) {
    const [flng, flat] = f.geometry.coordinates;
    if (Math.abs(flat - lat) > 0.01 || Math.abs(flng - lng) > 0.02) continue;
    if (f.properties.id === excludeId) continue;
    const metres = distanceMetres(lng, lat, flng, flat);
    if (metres <= radius) out.push({ feature: f, metres: Math.round(metres) });
  }
  out.sort((a, b) => a.metres - b.metres);
  return out.slice(0, limit);
}
