// The shape of one stop's properties, as written by scripts/clean_stops.py.
// Both the map and the panel import this so they agree on the field names.

export type YesNoUnknown = "yes" | "no" | "unknown";

export interface StopProperties {
  id: string;
  name: string | null;
  name_ga: string | null;
  street: string | null;
  county: string | null;
  lea: string | null;
  urban: boolean;
  surveyed: boolean;
  rating: string | null; // NTA accessibility rating: A+, A, B, C
  routes: string[];
  departures_weekday: number | null;
  coord_gap_m: number | null;
  modified: string | null;
  shelter: YesNoUnknown;
  bench: YesNoUnknown;
  rtpi: YesNoUnknown; // real-time passenger information display
  wheelchair: YesNoUnknown;
  footpath: YesNoUnknown;
  kerb: YesNoUnknown;
  step: YesNoUnknown;
  bin: YesNoUnknown;
  bike_stand: YesNoUnknown;
}

// A stop the user has picked, with its position so the map can show a pin.
export interface SelectedStop {
  props: StopProperties;
  lng: number;
  lat: number;
}

// MapLibre turns array properties into JSON strings when it hands a clicked
// feature back to us. This puts them back into real arrays.
export function normaliseProperties(raw: Record<string, unknown>): StopProperties {
  const p = { ...raw } as Record<string, unknown>;
  if (typeof p.routes === "string") {
    try {
      p.routes = JSON.parse(p.routes);
    } catch {
      p.routes = [];
    }
  }
  if (!Array.isArray(p.routes)) p.routes = [];
  return p as unknown as StopProperties;
}

// One row of counties.json, written by scripts/clean_stops.py.
export interface CountyStats {
  county: string;
  stops: number;
  surveyed: number;
  bbox: [number, number, number, number]; // west, south, east, north
  shelter: { yes: number; no: number };
  bench: { yes: number; no: number };
  rtpi: { yes: number; no: number };
  wheelchair: { yes: number; no: number };
  busy_no_shelter: { id: string; name: string | null; departures: number; lng: number; lat: number }[];
}

// Which filters are switched on. All true conditions must hold.
export interface Filters {
  noShelter: boolean;
  noSeating: boolean;
  noRtpi: boolean;
  notAccessible: boolean;
  notSurveyed: boolean;
  busy: boolean;
}

export const NO_FILTERS: Filters = {
  noShelter: false,
  noSeating: false,
  noRtpi: false,
  notAccessible: false,
  notSurveyed: false,
  busy: false,
};
