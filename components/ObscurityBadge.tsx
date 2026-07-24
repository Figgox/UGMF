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
  size = "sm",
}: {
  tier: Tier;
  score?: number;
  size?: "sm" | "lg";
}) {
  const dims =
    size === "lg" ? "text-xs px-2.5 py-1 gap-2" : "text-[10px] px-2 py-[3px] gap-1.5";

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
export function ObscurityMeter({ score, tier }: { score: number; tier: Tier }) {
  const colour: Record<Tier, string> = {
    "deep-underground": "var(--color-tier-deep)",
    underground: "var(--color-tier-under)",
    rising: "var(--color-tier-rising)",
    established: "var(--color-tier-established)",
    mainstream: "var(--color-tier-mainstream)",
  };

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
