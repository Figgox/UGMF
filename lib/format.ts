import type { Artist } from "@/types";
import { effectiveListeners, formatListeners, listenerSource } from "@/lib/obscurity";

/**
 * Presentation helpers.
 *
 * Dates are formatted in server components only. Client components never
 * re-format a timestamp, which keeps the server and the browser from
 * disagreeing about the reader's timezone during hydration.
 */

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const FULL = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatEventDate(iso: string) {
  const date = new Date(iso);
  return {
    day: DAY.format(date),
    date: DATE.format(date),
    time: TIME.format(date),
    full: FULL.format(date),
    dayKey: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
  };
}

/** "Tonight" / "Tomorrow" / "In 5 days". */
export function relativeDay(iso: string, now = new Date()): string {
  const target = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(target) - startOf(now)) / 86_400_000);

  if (days <= 0) return "Tonight";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.round(days / 7)} weeks`;
}

export function formatPrice(
  price: { min: number; max: number; currency: string } | undefined,
): string | null {
  if (!price) return null;
  if (price.min === 0 && price.max === 0) return "Free";
  const fmt = (value: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: price.currency,
      // narrowSymbol keeps USD as "$12" rather than the en-GB default "US$12".
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(value);
  return price.min === price.max ? fmt(price.min) : `${fmt(price.min)}–${fmt(price.max)}`;
}

/**
 * The headline audience number, labelled by where it actually came from.
 *
 * Spotify has no monthly-listener field, so once that provider is live this
 * says "followers" rather than quietly presenting a different number under the
 * same label.
 */
export function audienceStat(artist: Artist): { value: string; label: string } {
  const source = listenerSource(artist);
  const value = formatListeners(effectiveListeners(artist));

  switch (source) {
    case "monthly":
      return { value: formatListeners(artist.monthlyListeners ?? null), label: "monthly listeners" };
    case "followers":
      return { value: formatListeners(artist.followers), label: "followers" };
    case "popularity":
      return { value, label: "est. audience" };
    default:
      return { value: "—", label: "audience unknown" };
  }
}

export function titleCase(value: string): string {
  return value.replace(/(^|[\s-])(\w)/g, (_, sep, char) => sep + char.toUpperCase());
}
