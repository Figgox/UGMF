import { describe, expect, it } from "vitest";
import {
  effectiveListeners,
  listenerSource,
  tierAtMost,
  tierOf,
  undergroundScore,
  formatListeners,
} from "@/lib/obscurity";

/** Minimal shape the scoring functions actually read. */
const artist = (over: {
  monthlyListeners?: number;
  followers?: number;
  popularity?: number;
}) => ({
  monthlyListeners: over.monthlyListeners,
  followers: over.followers as number,
  popularity: over.popularity,
});

describe("effectiveListeners", () => {
  it("prefers monthly listeners when present", () => {
    expect(
      effectiveListeners(artist({ monthlyListeners: 1200, followers: 900, popularity: 40 })),
    ).toBe(1200);
  });

  it("falls back to followers when Spotify omits monthly listeners", () => {
    expect(effectiveListeners(artist({ followers: 2500, popularity: 30 }))).toBe(10_000);
  });

  it("falls back to popularity when there are no followers either", () => {
    const value = effectiveListeners({
      monthlyListeners: undefined,
      followers: undefined as unknown as number,
      popularity: 50,
    });
    expect(value).toBeGreaterThan(1000);
    expect(value).toBeLessThan(200_000);
  });

  it("returns null when nothing is measurable", () => {
    expect(
      effectiveListeners({
        monthlyListeners: undefined,
        followers: undefined as unknown as number,
        popularity: undefined,
      }),
    ).toBeNull();
  });

  it("treats zero as a real measurement, not a missing one", () => {
    expect(effectiveListeners(artist({ monthlyListeners: 0, followers: 500 }))).toBe(0);
  });
});

describe("listenerSource", () => {
  it("labels each fallback path", () => {
    expect(listenerSource(artist({ monthlyListeners: 10, followers: 5 }))).toBe("monthly");
    expect(listenerSource(artist({ followers: 5 }))).toBe("followers");
    expect(
      listenerSource({
        monthlyListeners: undefined,
        followers: undefined as unknown as number,
        popularity: 12,
      }),
    ).toBe("popularity");
    expect(
      listenerSource({
        monthlyListeners: undefined,
        followers: undefined as unknown as number,
        popularity: undefined,
      }),
    ).toBe("unknown");
  });
});

describe("tierOf", () => {
  it("places artists in the documented buckets", () => {
    expect(tierOf(artist({ monthlyListeners: 120 }))).toBe("deep-underground");
    expect(tierOf(artist({ monthlyListeners: 4_999 }))).toBe("deep-underground");
    expect(tierOf(artist({ monthlyListeners: 5_000 }))).toBe("underground");
    expect(tierOf(artist({ monthlyListeners: 49_999 }))).toBe("underground");
    expect(tierOf(artist({ monthlyListeners: 50_000 }))).toBe("rising");
    expect(tierOf(artist({ monthlyListeners: 249_999 }))).toBe("rising");
    expect(tierOf(artist({ monthlyListeners: 250_000 }))).toBe("established");
    expect(tierOf(artist({ monthlyListeners: 999_999 }))).toBe("established");
    expect(tierOf(artist({ monthlyListeners: 1_000_000 }))).toBe("mainstream");
    expect(tierOf(artist({ monthlyListeners: 40_000_000 }))).toBe("mainstream");
  });

  it("tiers a Spotify-shaped artist off followers", () => {
    // 1k followers -> ~4k effective listeners -> still deep underground.
    expect(tierOf(artist({ followers: 1_000, popularity: 20 }))).toBe("deep-underground");
    expect(tierOf(artist({ followers: 20_000, popularity: 45 }))).toBe("rising");
  });

  it("assumes the long tail rather than fame when nothing is known", () => {
    expect(
      tierOf({
        monthlyListeners: undefined,
        followers: undefined as unknown as number,
        popularity: undefined,
      }),
    ).toBe("underground");
  });
});

describe("undergroundScore", () => {
  it("scores more obscure artists higher", () => {
    const tiny = undergroundScore(artist({ monthlyListeners: 200 }));
    const mid = undergroundScore(artist({ monthlyListeners: 30_000 }));
    const huge = undergroundScore(artist({ monthlyListeners: 5_000_000 }));

    expect(tiny).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(huge);
  });

  it("stays inside 0-100 at both extremes", () => {
    expect(undergroundScore(artist({ monthlyListeners: 0 }))).toBe(100);
    expect(undergroundScore(artist({ monthlyListeners: 900_000_000 }))).toBe(0);
  });

  it("scores an unmeasurable artist as unknown, not famous", () => {
    expect(
      undergroundScore({
        monthlyListeners: undefined,
        followers: undefined as unknown as number,
        popularity: undefined,
      }),
    ).toBe(50);
  });
});

describe("tierAtMost", () => {
  it("compares tiers by fame, not alphabetically", () => {
    expect(tierAtMost("deep-underground", "underground")).toBe(true);
    expect(tierAtMost("rising", "underground")).toBe(false);
    expect(tierAtMost("underground", "underground")).toBe(true);
  });
});

describe("formatListeners", () => {
  it("compacts large numbers and marks unknowns", () => {
    expect(formatListeners(1_200_000)).toBe("1.2M");
    expect(formatListeners(4_800)).toBe("4.8K");
    expect(formatListeners(null)).toBe("—");
  });
});
