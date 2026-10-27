import { describe, expect, it } from "vitest";
import { normaliseProperties } from "../types";

describe("normaliseProperties", () => {
  it("turns a JSON string of routes back into an array", () => {
    const p = normaliseProperties({ id: "X", routes: '["800","IW08"]' });
    expect(p.routes).toEqual(["800", "IW08"]);
  });

  it("leaves a real array alone", () => {
    const p = normaliseProperties({ id: "X", routes: ["1"] });
    expect(p.routes).toEqual(["1"]);
  });

  it("falls back to an empty list for bad or missing routes", () => {
    expect(normaliseProperties({ id: "X", routes: "not json" }).routes).toEqual([]);
    expect(normaliseProperties({ id: "X" }).routes).toEqual([]);
  });
});
