import { describe, expect, it } from "vitest";
import { distanceMetres, filterStops, nearbyStops, stopPasses, type StopFeature } from "../filterStops";
import { NO_FILTERS, type StopProperties } from "../types";

// A helper to build a stop with sensible defaults, overriding what a test cares about.
function stop(overrides: Partial<StopProperties> & { lng?: number; lat?: number } = {}): StopFeature {
  const { lng = -6.26, lat = 53.35, ...props } = overrides;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      id: "TEST1",
      name: "Test stop",
      name_ga: null,
      street: null,
      county: "Dublin City",
      lea: null,
      urban: true,
      surveyed: true,
      rating: "B",
      routes: [],
      departures_weekday: 10,
      modified: null,
      shelter: "no",
      bench: "no",
      rtpi: "no",
      wheelchair: "no",
      footpath: "no",
      kerb: "no",
      step: "no",
      bin: "no",
      bike_stand: "no",
      ...props,
    },
  };
}

describe("stopPasses", () => {
  it("passes everything when no filters are on", () => {
    expect(stopPasses(stop().properties, NO_FILTERS, null)).toBe(true);
  });

  it("requires a shelter when the shelter filter is on", () => {
    const f = { ...NO_FILTERS, shelter: true };
    expect(stopPasses(stop({ shelter: "yes" }).properties, f, null)).toBe(true);
    expect(stopPasses(stop({ shelter: "no" }).properties, f, null)).toBe(false);
  });

  it("never counts unknown as a yes", () => {
    const f = { ...NO_FILTERS, shelter: true };
    expect(stopPasses(stop({ shelter: "unknown", surveyed: false }).properties, f, null)).toBe(false);
  });

  it("combines filters with AND", () => {
    const f = { ...NO_FILTERS, shelter: true, seating: true };
    expect(stopPasses(stop({ shelter: "yes", bench: "no" }).properties, f, null)).toBe(false);
    expect(stopPasses(stop({ shelter: "yes", bench: "yes" }).properties, f, null)).toBe(true);
  });

  it("treats missing departures as not busy", () => {
    const f = { ...NO_FILTERS, busy: true };
    expect(stopPasses(stop({ departures_weekday: null }).properties, f, null)).toBe(false);
    expect(stopPasses(stop({ departures_weekday: 50 }).properties, f, null)).toBe(true);
  });

  it("restricts to a county when one is chosen", () => {
    expect(stopPasses(stop({ county: "Galway" }).properties, NO_FILTERS, "Dublin City")).toBe(false);
    expect(stopPasses(stop({ county: "Galway" }).properties, NO_FILTERS, "Galway")).toBe(true);
  });
});

describe("filterStops", () => {
  it("keeps only matching stops", () => {
    const stops = [stop({ id: "A", shelter: "yes" }), stop({ id: "B", shelter: "no" })];
    const out = filterStops(stops, { ...NO_FILTERS, shelter: true }, null);
    expect(out.map((s) => s.properties.id)).toEqual(["A"]);
  });
});

describe("distanceMetres", () => {
  it("is zero for the same point", () => {
    expect(distanceMetres(-6.26, 53.35, -6.26, 53.35)).toBe(0);
  });

  it("is about 111 km per degree of latitude", () => {
    const d = distanceMetres(-6.26, 53.0, -6.26, 54.0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("nearbyStops", () => {
  it("returns other stops within the radius, nearest first, excluding itself", () => {
    const here = stop({ id: "HERE" });
    const near = stop({ id: "NEAR", lat: 53.351 }); // about 110 m north
    const far = stop({ id: "FAR", lat: 53.36 }); // about 1.1 km north
    const mid = stop({ id: "MID", lat: 53.352 }); // about 220 m north
    const out = nearbyStops([here, far, mid, near], -6.26, 53.35, "HERE");
    expect(out.map((n) => n.feature.properties.id)).toEqual(["NEAR", "MID"]);
    expect(out[0].metres).toBeGreaterThan(100);
    expect(out[0].metres).toBeLessThan(120);
  });
});
