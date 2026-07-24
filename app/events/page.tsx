import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getEventProvider, getMusicProvider } from "@/lib/providers";
import { parseFilters, resolveDateRange, serialiseFilters } from "@/lib/filters";
import { MODE_TIERS } from "@/lib/obscurity";
import { FilterBar } from "@/components/FilterBar";
import { LocationPicker } from "@/components/LocationPicker";
import { EventRow } from "@/components/EventRow";
import { formatEventDate, relativeDay } from "@/lib/format";
import type { HydratedEvent } from "@/types";

export const metadata: Metadata = {
  title: "Live",
  description:
    "Upcoming shows near you, filtered by date, distance and how well known the headliner is.",
};

export const revalidate = 600;

const PAGE_SIZE = 40;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const pageParam = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.min(20, pageParam) : 1;

  const dateRange = resolveDateRange(filters);

  // Modes carry over from the discover page, so arriving here from Crate
  // Digger keeps you looking at small-room bills.
  const modeTiers = MODE_TIERS[filters.mode] ?? undefined;

  const [result, genres, cities] = await Promise.all([
    getEventProvider().searchEvents({
      origin: filters.origin,
      radiusKm: filters.origin ? filters.radiusKm : undefined,
      dateRange,
      tier: filters.tier,
      tiers: filters.tier ? undefined : modeTiers,
      genres: filters.genres,
      maxListeners: filters.maxListeners,
      limit: PAGE_SIZE * page,
    }),
    getMusicProvider().listGenres(),
    getMusicProvider().listCities(),
  ]);

  const activeCity = cities.find((c) => c.id === filters.cityId);
  const locationLabel = activeCity
    ? activeCity.name
    : filters.origin
      ? "Your location"
      : null;

  const groups = groupByDay(result.items);
  const hasMore = result.items.length < result.total;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl leading-none sm:text-5xl">Small rooms,
            <br />
            soon
          </h1>
          <p className="mt-3 max-w-lg text-sm text-[var(--color-fog)]">
            Shows sorted by when they start, not by who sells the most tickets.
          </p>
        </div>

        <Suspense fallback={null}>
          <LocationPicker cities={cities} activeLabel={locationLabel} />
        </Suspense>
      </div>

      <Suspense fallback={<div className="h-48" />}>
        <FilterBar filters={filters} genres={genres} variant="events" />
      </Suspense>

      <p className="text-sm text-[var(--color-fog)]">
        <span className="font-mono text-[var(--color-chalk)]">{result.total}</span>{" "}
        {result.total === 1 ? "show" : "shows"}
        {locationLabel && ` within ${filters.radiusKm} km of ${locationLabel}`}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-line-bright)] p-8 text-center">
          <p className="display text-2xl">Quiet week</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-fog)]">
            No shows match those filters. Try a wider date range or a bigger
            radius.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href={`/events?${serialiseFilters({ ...filters, datePreset: "any", tier: null })}`}
              className="rounded-full border border-[var(--color-line-bright)] px-4 py-1.5 text-sm hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
            >
              Show every upcoming date
            </Link>
            {filters.origin && (
              <Link
                href={`/events?${serialiseFilters({ ...filters, radiusKm: Math.min(500, filters.radiusKm * 4) })}`}
                className="rounded-full border border-[var(--color-line-bright)] px-4 py-1.5 text-sm hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
              >
                Widen to {Math.min(500, filters.radiusKm * 4)} km
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-2 flex items-baseline gap-3 border-b border-[var(--color-line-bright)] pb-1">
                <h2 className="display text-lg">{group.label}</h2>
                <span className="label">{group.relative}</span>
              </div>
              {group.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </section>
          ))}

          {hasMore && (
            <div className="flex justify-center">
              <Link
                href={`/events?${new URLSearchParams({
                  ...Object.fromEntries(new URLSearchParams(serialiseFilters(filters))),
                  page: String(page + 1),
                }).toString()}`}
                scroll={false}
                className="rounded-full border border-[var(--color-line-bright)] px-5 py-2 text-sm hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
              >
                Show more ({result.total - result.items.length} left)
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DayGroup {
  key: string;
  label: string;
  relative: string;
  events: HydratedEvent[];
}

/** Server-side only — see lib/format.ts on why dates never format in the browser. */
function groupByDay(events: HydratedEvent[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const event of events) {
    const when = formatEventDate(event.startsAt);
    const existing = groups.get(when.dayKey);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(when.dayKey, {
        key: when.dayKey,
        label: when.full,
        relative: relativeDay(event.startsAt),
        events: [event],
      });
    }
  }

  return [...groups.values()];
}
