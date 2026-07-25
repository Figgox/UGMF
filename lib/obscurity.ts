import type { Artist, Tier } from "@/types";

/**
 * The heart of UGMF: how buried is this artist?
 *
 * Everything else ranks by popularity. We rank by its inverse, so a score of
 * 100 means "almost nobody has heard this" and 0 means "stadium act".
 */

/** Upper bound of each tier, in monthly listeners. */
const TIER_CEILINGS: ReadonlyArray<{ tier: Tier; max: number }> = [
  { tier: "deep-underground", max: 5_000 },
  { tier: "underground", max: 50_000 },
  { tier: "rising", max: 250_000 },
  { tier: "established", max: 1_000_000 },
  { tier: "mainstream", max: Number.POSITIVE_INFINITY },
];

export const TIER_ORDER: readonly Tier[] = TIER_CEILINGS.map((t) => t.tier);

export const TIER_LABELS: Record<Tier, string> = {
  "deep-underground": "Deep Underground",
  underground: "Underground",
  rising: "Rising",
  established: "Established",
  mainstream: "Mainstream",
};

export const TIER_BLURBS: Record<Tier, string> = {
  "deep-underground": "Under 5k monthly listeners. Basements and back rooms.",
  underground: "5k–50k. A real scene, still nobody's algorithm.",
  rising: "50k–250k. On the way up — catch them in a small room while you can.",
  established: "250k–1M. Well known, plays proper venues.",
  mainstream: "Over 1M. You already know them.",
};

/**
 * A listener count we can score, from whatever the provider actually gave us.
 *
 * Spotify's Web API has no monthly-listener field, so once that provider is
 * live this falls back — in order — to followers (monthly listeners run
 * roughly 4x an artist's follower count across the long tail) and finally to
 * the 0-100 popularity index mapped back onto a listener scale.
 *
 * Returns null when there is nothing to go on, so callers can say "unknown"
 * rather than render a number nobody measured.
 */
export function effectiveListeners(
  artist: Pick<Artist, "monthlyListeners" | "followers" | "popularity">,
): number | null {
  if (typeof artist.monthlyListeners === "number" && artist.monthlyListeners >= 0) {
    return artist.monthlyListeners;
  }
  // `followers` is a required field on Artist, so a provider with nothing to
  // report there (e.g. Spotify under a restricted access tier) has to put
  // *something* — 0 is the only type-safe placeholder. Treating an exact
  // zero as "no signal" rather than "definitely has zero followers" avoids
  // miscategorizing those artists as maximally obscure; a real Spotify
  // artist essentially never has literally 0 followers anyway.
  if (typeof artist.followers === "number" && artist.followers > 0) {
    return artist.followers * 4;
  }
  if (typeof artist.popularity === "number") {
    // Spotify popularity is roughly logarithmic in audience size: 0 -> ~100
    // listeners, 100 -> ~50M. Invert that curve to get a comparable number.
    const clamped = Math.min(100, Math.max(0, artist.popularity));
    return Math.round(100 * Math.pow(10, (clamped / 100) * 5.7));
  }
  return null;
}

/** Which signal `effectiveListeners` used — drives the UI's label. */
export function listenerSource(
  artist: Pick<Artist, "monthlyListeners" | "followers" | "popularity">,
): "monthly" | "followers" | "popularity" | "unknown" {
  if (typeof artist.monthlyListeners === "number" && artist.monthlyListeners >= 0) {
    return "monthly";
  }
  if (typeof artist.followers === "number" && artist.followers > 0) return "followers";
  if (typeof artist.popularity === "number") return "popularity";
  return "unknown";
}

/**
 * 0-100, where 100 is the most obscure.
 *
 * Log-scaled, because the difference between 200 and 2,000 listeners matters
 * enormously for discovery and the difference between 4M and 6M does not.
 * Artists with no usable signal score 50 — unknown, not "definitely famous".
 */
export function undergroundScore(
  artist: Pick<Artist, "monthlyListeners" | "followers" | "popularity">,
): number {
  const listeners = effectiveListeners(artist);
  if (listeners === null) return 50;

  const FLOOR = 100; // below this, it's all the same kind of obscure
  const CEILING = 10_000_000;
  const clamped = Math.min(CEILING, Math.max(FLOOR, listeners));
  const span = Math.log10(CEILING) - Math.log10(FLOOR);
  const position = (Math.log10(clamped) - Math.log10(FLOOR)) / span;

  return Math.round((1 - position) * 100);
}

export function tierOf(
  artist: Pick<Artist, "monthlyListeners" | "followers" | "popularity">,
): Tier {
  const listeners = effectiveListeners(artist);
  // No signal at all: assume the long tail. UGMF would rather show you an
  // unknown quantity than hide it behind a "mainstream" label.
  if (listeners === null) return "underground";

  for (const { tier, max } of TIER_CEILINGS) {
    if (listeners < max) return tier;
  }
  return "mainstream";
}

/**
 * True when `tier` is at most as famous as `ceiling`.
 *
 * TIER_ORDER runs most obscure -> most famous, so "no more famous than" is a
 * lower-or-equal index.
 */
export function tierAtMost(tier: Tier, ceiling: Tier): boolean {
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(ceiling);
}

/** Tiers each discovery mode admits. `null` means "no tier restriction". */
export const MODE_TIERS: Record<string, readonly Tier[] | null> = {
  "crate-digger": ["deep-underground", "underground"],
  rising: ["rising"],
  "top-artists": null,
  open: null,
};

const COMPACT = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatListeners(value: number | null): string {
  if (value === null) return "—";
  return COMPACT.format(value);
}
