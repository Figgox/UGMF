import type { DiscoveryMode, SortKey, Tier } from "@/types";
import { TIER_ORDER } from "@/lib/obscurity";

/**
 * One place that knows how filter state is spelled in a URL.
 *
 * Both the client filter bar and the API routes go through here, so a link a
 * user copies out of the address bar reloads into exactly the view they saw.
 */

export type DatePreset = "any" | "tonight" | "weekend" | "next-7" | "next-30" | "custom";

export const DATE_PRESETS: ReadonlyArray<{ value: DatePreset; label: string }> = [
  { value: "any", label: "Any date" },
  { value: "tonight", label: "Tonight" },
  { value: "weekend", label: "This weekend" },
  { value: "next-7", label: "Next 7 days" },
  { value: "next-30", label: "Next 30 days" },
];

export const MODES: ReadonlyArray<{
  value: DiscoveryMode;
  label: string;
  tagline: string;
}> = [
  {
    value: "crate-digger",
    label: "Crate Digger",
    tagline: "Under 50k listeners. The deep end.",
  },
  { value: "rising", label: "Rising", tagline: "About to stop being a secret." },
  { value: "local-legends", label: "Local Legends", tagline: "Artists from your city." },
  { value: "open", label: "Open Feed", tagline: "Everything nearby." },
];

export interface DiscoverFilters {
  mode: DiscoveryMode;
  genres: string[];
  origin: { lat: number; lng: number } | null;
  cityId: string | null;
  radiusKm: number;
  /** Hard ceiling on monthly listeners; null = no ceiling. */
  maxListeners: number | null;
  datePreset: DatePreset;
  from: string | null;
  to: string | null;
  onlyWithShows: boolean;
  sort: SortKey;
  /** Events view only: restrict by headliner tier. */
  tier: Tier | null;
  cursor: string | null;
}

export const DEFAULT_RADIUS_KM = 50;

export const DEFAULTS: DiscoverFilters = {
  mode: "crate-digger",
  genres: [],
  origin: null,
  cityId: null,
  radiusKm: DEFAULT_RADIUS_KM,
  maxListeners: null,
  datePreset: "any",
  from: null,
  to: null,
  onlyWithShows: false,
  sort: "obscurity",
  tier: null,
  cursor: null,
};

const MODE_VALUES = MODES.map((m) => m.value);
const SORT_VALUES: SortKey[] = ["obscurity", "soonest", "distance", "momentum"];
const PRESET_VALUES = new Set<DatePreset>([
  "any",
  "tonight",
  "weekend",
  "next-7",
  "next-30",
  "custom",
]);

/** Anything that behaves like URLSearchParams or Next's searchParams object. */
export type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const value = source[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function num(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseFilters(source: ParamSource): DiscoverFilters {
  const modeRaw = read(source, "mode");
  const mode = MODE_VALUES.includes(modeRaw as DiscoveryMode)
    ? (modeRaw as DiscoveryMode)
    : DEFAULTS.mode;

  const genresRaw = read(source, "genres");
  const genres = genresRaw
    ? genresRaw
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const lat = num(read(source, "lat"));
  const lng = num(read(source, "lng"));
  const origin =
    lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;

  const radiusRaw = num(read(source, "radius"));
  const radiusKm =
    radiusRaw !== null && radiusRaw > 0
      ? Math.min(2000, radiusRaw)
      : DEFAULTS.radiusKm;

  const maxRaw = num(read(source, "maxListeners"));
  const maxListeners = maxRaw !== null && maxRaw > 0 ? maxRaw : null;

  const presetRaw = read(source, "when") as DatePreset | null;
  const from = read(source, "from");
  const to = read(source, "to");
  let datePreset: DatePreset = DEFAULTS.datePreset;
  if (presetRaw && PRESET_VALUES.has(presetRaw)) datePreset = presetRaw;
  else if (from || to) datePreset = "custom";

  const sortRaw = read(source, "sort") as SortKey | null;
  const sort = sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : defaultSortFor(mode);

  const tierRaw = read(source, "tier") as Tier | null;
  const tier = tierRaw && TIER_ORDER.includes(tierRaw) ? tierRaw : null;

  return {
    mode,
    genres,
    origin,
    cityId: read(source, "city"),
    radiusKm,
    maxListeners,
    datePreset,
    from: datePreset === "custom" ? from : null,
    to: datePreset === "custom" ? to : null,
    onlyWithShows: read(source, "shows") === "1",
    sort,
    tier,
    cursor: read(source, "cursor"),
  };
}

export function defaultSortFor(mode: DiscoveryMode): SortKey {
  switch (mode) {
    case "rising":
      return "momentum";
    case "local-legends":
      return "distance";
    case "open":
      return "distance";
    default:
      return "obscurity";
  }
}

/** Inverse of `parseFilters`. Omits anything left at its default. */
export function serialiseFilters(filters: Partial<DiscoverFilters>): string {
  const params = new URLSearchParams();
  const f = { ...DEFAULTS, ...filters };

  if (f.mode !== DEFAULTS.mode) params.set("mode", f.mode);
  if (f.genres.length) params.set("genres", f.genres.join(","));
  if (f.origin) {
    params.set("lat", f.origin.lat.toFixed(4));
    params.set("lng", f.origin.lng.toFixed(4));
  }
  if (f.cityId) params.set("city", f.cityId);
  if (f.radiusKm !== DEFAULTS.radiusKm) params.set("radius", String(f.radiusKm));
  if (f.maxListeners !== null) params.set("maxListeners", String(f.maxListeners));
  if (f.datePreset !== "any" && f.datePreset !== "custom") {
    params.set("when", f.datePreset);
  }
  if (f.datePreset === "custom") {
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
  }
  if (f.onlyWithShows) params.set("shows", "1");
  if (f.sort !== defaultSortFor(f.mode)) params.set("sort", f.sort);
  if (f.tier) params.set("tier", f.tier);
  if (f.cursor) params.set("cursor", f.cursor);

  return params.toString();
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Turn a preset into concrete instants.
 *
 * Gig nights do not respect midnight, so "tonight" runs from now until 4am
 * tomorrow and the weekend closes at 4am Monday. Resolved server-side only, so
 * the client never has to agree with the server about what time it is.
 */
export function resolveDateRange(
  filters: Pick<DiscoverFilters, "datePreset" | "from" | "to">,
  now: Date = new Date(),
): DateRange | null {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const addDays = (d: Date, days: number) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
  };
  const at = (d: Date, hours: number) => {
    const next = startOfDay(d);
    next.setHours(hours);
    return next;
  };

  switch (filters.datePreset) {
    case "tonight":
      return { from: now, to: at(addDays(now, 1), 4) };

    case "weekend": {
      // Friday 17:00 through Monday 04:00. Mid-weekend, "this weekend" means
      // the one you are standing in, not the next one.
      const day = now.getDay(); // 0 Sun .. 6 Sat
      let fridayOffset = (5 - day + 7) % 7;
      if (day === 0 || day === 6) fridayOffset = day === 6 ? -1 : -2;
      const friday = addDays(now, fridayOffset);
      const from = at(friday, 17);
      return {
        from: from < now ? now : from,
        to: at(addDays(friday, 3), 4),
      };
    }

    case "next-7":
      return { from: now, to: at(addDays(now, 8), 4) };

    case "next-30":
      return { from: now, to: at(addDays(now, 31), 4) };

    case "custom": {
      const from = filters.from ? new Date(filters.from) : now;
      const to = filters.to ? at(addDays(new Date(filters.to), 1), 4) : addDays(now, 365);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
      return { from, to };
    }

    case "any":
    default:
      return null;
  }
}
