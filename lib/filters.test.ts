import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  defaultSortFor,
  parseFilters,
  resolveDateRange,
  serialiseFilters,
} from "@/lib/filters";

const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe("parseFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parse("")).toEqual(DEFAULTS);
  });

  it("reads a full filter set", () => {
    const filters = parse(
      "mode=open&genres=shoegaze,techno&lat=52.52&lng=13.405&radius=25&maxListeners=5000&when=weekend&shows=1&sort=soonest",
    );

    expect(filters.mode).toBe("open");
    expect(filters.genres).toEqual(["shoegaze", "techno"]);
    expect(filters.origin).toEqual({ lat: 52.52, lng: 13.405 });
    expect(filters.radiusKm).toBe(25);
    expect(filters.maxListeners).toBe(5000);
    expect(filters.datePreset).toBe("weekend");
    expect(filters.onlyWithShows).toBe(true);
    expect(filters.sort).toBe("soonest");
  });

  it("also accepts Next's searchParams object", () => {
    expect(parseFilters({ mode: "rising", genres: ["folk"] }).mode).toBe("rising");
  });

  describe("malformed input", () => {
    it("ignores an unknown mode, sort and tier", () => {
      const filters = parse("mode=nonsense&sort=vibes&tier=legendary");
      expect(filters.mode).toBe(DEFAULTS.mode);
      expect(filters.sort).toBe(defaultSortFor(DEFAULTS.mode));
      expect(filters.tier).toBeNull();
    });

    it("drops a half-specified or out-of-range origin", () => {
      expect(parse("lat=52.52").origin).toBeNull();
      expect(parse("lat=abc&lng=13.4").origin).toBeNull();
      expect(parse("lat=999&lng=13.4").origin).toBeNull();
    });

    it("falls back to the default radius for junk and clamps absurd ones", () => {
      expect(parse("radius=-5").radiusKm).toBe(DEFAULTS.radiusKm);
      expect(parse("radius=NaN").radiusKm).toBe(DEFAULTS.radiusKm);
      expect(parse("radius=99999").radiusKm).toBe(2000);
    });

    it("treats a bare from/to as a custom range", () => {
      expect(parse("from=2026-01-01").datePreset).toBe("custom");
    });

    it("does not carry from/to into a preset range", () => {
      const filters = parse("when=tonight&from=2026-01-01&to=2026-02-01");
      expect(filters.datePreset).toBe("tonight");
      expect(filters.from).toBeNull();
      expect(filters.to).toBeNull();
    });
  });
});

describe("serialiseFilters", () => {
  it("omits everything left at its default", () => {
    expect(serialiseFilters(DEFAULTS)).toBe("");
  });

  it("round-trips a populated filter set", () => {
    const original = parse(
      "mode=open&genres=shoegaze,techno&lat=52.5200&lng=13.4050&radius=25&maxListeners=5000&when=weekend&shows=1&sort=soonest&tier=rising",
    );
    expect(parse(serialiseFilters(original))).toEqual(original);
  });

  it("round-trips a custom date range", () => {
    const original = parse("from=2026-03-01&to=2026-03-14");
    const round = parse(serialiseFilters(original));
    expect(round.datePreset).toBe("custom");
    expect(round.from).toBe("2026-03-01");
    expect(round.to).toBe("2026-03-14");
  });

  it("keeps a sort that is not the mode's default and drops one that is", () => {
    expect(serialiseFilters({ mode: "rising", sort: "momentum" })).not.toContain("sort");
    expect(serialiseFilters({ mode: "rising", sort: "distance" })).toContain("sort=distance");
  });
});

describe("resolveDateRange", () => {
  // Wednesday 15 July 2026, 21:00 local.
  const wednesday = new Date(2026, 6, 15, 21, 0, 0);

  it("returns null for 'any', so nothing is filtered out", () => {
    expect(resolveDateRange({ datePreset: "any", from: null, to: null }, wednesday)).toBeNull();
  });

  it("runs tonight until 4am, because gigs do not stop at midnight", () => {
    const range = resolveDateRange(
      { datePreset: "tonight", from: null, to: null },
      wednesday,
    )!;
    expect(range.from).toEqual(wednesday);
    expect(range.to).toEqual(new Date(2026, 6, 16, 4, 0, 0));
  });

  it("points 'this weekend' at the coming Friday from midweek", () => {
    const range = resolveDateRange(
      { datePreset: "weekend", from: null, to: null },
      wednesday,
    )!;
    expect(range.from).toEqual(new Date(2026, 6, 17, 17, 0, 0)); // Fri
    expect(range.to).toEqual(new Date(2026, 6, 20, 4, 0, 0)); // Mon 4am
  });

  it("means the weekend you are standing in, not the next one", () => {
    const saturday = new Date(2026, 6, 18, 14, 0, 0);
    const range = resolveDateRange(
      { datePreset: "weekend", from: null, to: null },
      saturday,
    )!;
    // Friday has already passed, so the window starts now and still closes Monday.
    expect(range.from).toEqual(saturday);
    expect(range.to).toEqual(new Date(2026, 6, 20, 4, 0, 0));

    const sunday = new Date(2026, 6, 19, 11, 0, 0);
    expect(
      resolveDateRange({ datePreset: "weekend", from: null, to: null }, sunday)!.to,
    ).toEqual(new Date(2026, 6, 20, 4, 0, 0));
  });

  it("covers the requested span for the rolling presets", () => {
    const seven = resolveDateRange({ datePreset: "next-7", from: null, to: null }, wednesday)!;
    expect(seven.from).toEqual(wednesday);
    expect(seven.to).toEqual(new Date(2026, 6, 23, 4, 0, 0));

    const thirty = resolveDateRange({ datePreset: "next-30", from: null, to: null }, wednesday)!;
    expect(thirty.to).toEqual(new Date(2026, 7, 15, 4, 0, 0));
  });

  it("includes the whole of the last day of a custom range", () => {
    const range = resolveDateRange(
      { datePreset: "custom", from: "2026-08-01", to: "2026-08-03" },
      wednesday,
    )!;
    expect(range.from).toEqual(new Date("2026-08-01"));
    // A show at 22:00 on the 3rd must fall inside the range.
    expect(range.to.getTime()).toBeGreaterThan(new Date(2026, 7, 3, 22, 0, 0).getTime());
  });

  it("returns null for an unparseable custom range", () => {
    expect(
      resolveDateRange({ datePreset: "custom", from: "not-a-date", to: null }, wednesday),
    ).toBeNull();
  });
});
