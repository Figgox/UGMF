import { describe, expect, it } from "vitest";
import { distanceKm, formatDistance, kmToMiles, milesToKm, withinRadius } from "@/lib/geo";

const BERLIN = { lat: 52.52, lng: 13.405 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const NEW_YORK = { lat: 40.7128, lng: -74.006 };

describe("distanceKm", () => {
  it("matches known city pairs", () => {
    // Great-circle Berlin–London is ~932 km, Berlin–New York ~6385 km.
    expect(distanceKm(BERLIN, LONDON)).toBeCloseTo(932, -1);
    expect(distanceKm(BERLIN, NEW_YORK)).toBeCloseTo(6385, -2);
  });

  it("is zero for the same point and symmetric between two", () => {
    expect(distanceKm(BERLIN, BERLIN)).toBe(0);
    expect(distanceKm(BERLIN, LONDON)).toBeCloseTo(distanceKm(LONDON, BERLIN), 9);
  });

  it("handles antimeridian-crossing pairs without blowing up", () => {
    const west = { lat: 0, lng: -179.5 };
    const east = { lat: 0, lng: 179.5 };
    expect(distanceKm(west, east)).toBeLessThan(120);
  });
});

describe("unit conversion", () => {
  it("round-trips", () => {
    expect(milesToKm(kmToMiles(42))).toBeCloseTo(42, 9);
  });

  it("converts a known value", () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 9);
  });
});

describe("formatDistance", () => {
  it("gets more precise as distances shrink", () => {
    expect(formatDistance(0.4)).toBe("0.4 km");
    expect(formatDistance(3.26)).toBe("3.3 km");
    expect(formatDistance(48.6)).toBe("49 km");
  });

  it("converts when asked for miles", () => {
    expect(formatDistance(16.09344, "mi")).toBe("10 mi");
  });
});

describe("withinRadius", () => {
  it("includes the boundary", () => {
    const d = distanceKm(BERLIN, LONDON);
    expect(withinRadius(BERLIN, LONDON, d)).toBe(true);
    expect(withinRadius(BERLIN, LONDON, d - 1)).toBe(false);
  });
});
