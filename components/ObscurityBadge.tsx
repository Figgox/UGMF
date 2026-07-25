import type { Tier } from "@/types";
import { TIER_LABELS } from "@/lib/obscurity";

/**
 * The colour signal that carries the whole app: the more buried the artist,
 * the hotter the badge.
 */

const TIER_STYLE: Record<Tier, string> = {
  "deep-underground": "border-[var(--color-tier-deep)] text-[var(--color-tier-deep)]",
  underground: "border-[var(--color-tier-under)] text-[var(--color-tier-under)]",
  rising: "border-[var(--color-tier-rising)] text-[var(--color-tier-rising)]",
  established:
    "border-[var(--color-tier-established)] text-[var(--color-tier-established)]",
  mainstream:
    "border-[var(--color-tier-mainstream)] text-[var(--color-tier-mainstream)]",
};

export function ObscurityBadge({
  tier,
  score,
  hasSignal = true,
  size = "sm",
}: {
  tier: Tier;
  score?: number;
  /**
   * False when `effectiveListeners` had nothing to go on at all — no
   * followers, popularity or monthly listeners (e.g. a Ticketmaster-only
   * stub artist still waiting on a Spotify hydration). `tierOf` still has to
   * return *some* Tier for filtering/sorting to work, defaulting to
   * "underground" — but confidently labelling an unknown as underground is
   * actively misleading (a stub for a stadium act reads identically to a
   * genuine unknown), so the badge shows a neutral "pending" state instead
   * of pretending to know.
   */
  hasSignal?: boolean;
  size?: "sm" | "lg";
}) {
  const dims =
    size === "lg" ? "text-xs px-2.5 py-1 gap-2" : "text-[10px] px-2 py-[3px] gap-1.5";

  if (!hasSignal) {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-[var(--color-line)] bg-black/40 font-mono uppercase tracking-[0.12em] text-[var(--color-fog)] ${dims}`}
        title="No listener data yet — waiting on the provider"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
        Pending data
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border bg-black/40 font-mono uppercase tracking-[0.12em] ${dims} ${TIER_STYLE[tier]}`}
      title={
        score !== undefined ? `Underground score ${score}/100` : TIER_LABELS[tier]
      }
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {TIER_LABELS[tier]}
    </span>
  );
}

/** Thin bar version, for the profile stat strip. */
export function ObscurityMeter({
  score,
  tier,
  hasSignal = true,
}: {
  score: number;
  tier: Tier;
  /** See `ObscurityBadge` — same reasoning, applied to the bar. */
  hasSignal?: boolean;
}) {
  const colour: Record<Tier, string> = {
    "deep-underground": "var(--color-tier-deep)",
    underground: "var(--color-tier-under)",
    rising: "var(--color-tier-rising)",
    established: "var(--color-tier-established)",
    mainstream: "var(--color-tier-mainstream)",
  };

  if (!hasSignal) {
    return (
      <div className="w-full">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]" />
        <p className="label mt-1.5">No listener data yet</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]"
        role="img"
        aria-label={`Underground score ${score} out of 100`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, backgroundColor: colour[tier] }}
        />
      </div>
      <p className="label mt-1.5">{score}/100 underground</p>
    </div>
  );
}
