import Link from "next/link";
import { Suspense } from "react";
import { getMusicProvider } from "@/lib/providers";
import { parseFilters, resolveDateRange, serialiseFilters, MODES } from "@/lib/filters";
import { MODE_TIERS, TIER_BLURBS } from "@/lib/obscurity";
import { ArtistCard } from "@/components/ArtistCard";
import { FilterBar } from "@/components/FilterBar";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { LocationPicker } from "@/components/LocationPicker";
import type { Tier } from "@/types";

const PAGE_SIZE = 24;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const provider = getMusicProvider();

  const pageParam = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.min(20, pageParam) : 1;

  // Date maths happens here, server-side, so the browser never has to agree
  // with us about what "tonight" means.
  const dateRange = resolveDateRange(filters);
  const tiers = MODE_TIERS[filters.mode] ?? undefined;

  const [result, genres, cities] = await Promise.all([
    provider.searchArtists({
      tiers: tiers ?? undefined,
      genres: filters.genres,
      origin: filters.origin,
      radiusKm: filters.radiusKm,
      maxListeners: filters.maxListeners,
      onlyWithShows: filters.onlyWithShows,
      dateRange,
      localsOnly: filters.mode === "local-legends",
      sort: filters.sort,
      limit: PAGE_SIZE * page,
    }),
    provider.listGenres(),
    provider.listCities(),
  ]);

  const activeCity = cities.find((c) => c.id === filters.cityId);
  const locationLabel = activeCity
    ? activeCity.name
    : filters.origin
      ? "Your location"
      : null;

  const modeMeta = MODES.find((m) => m.value === filters.mode);
  const hasMore = result.items.length < result.total;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl leading-none sm:text-5xl">
            Find who nobody
            <br />
            has found yet
          </h1>
          <p className="mt-3 max-w-lg text-sm text-[var(--color-fog)]">
            Every other music app ranks by popularity. UGMF ranks by its
            opposite — the quieter the artist, the higher they sit.
          </p>
        </div>

        <Suspense fallback={null}>
          <LocationPicker cities={cities} activeLabel={locationLabel} />
        </Suspense>
      </div>

      <Suspense fallback={<div className="h-16" />}>
        <ModeSwitcher active={filters.mode} />
      </Suspense>

      <Suspense fallback={<div className="h-48" />}>
        <FilterBar filters={filters} genres={genres} />
      </Suspense>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[var(--color-fog)]">
          <span className="font-mono text-[var(--color-chalk)]">{result.total}</span>{" "}
          {result.total === 1 ? "artist" : "artists"}
          {locationLabel && ` near ${locationLabel}`}
          {filters.mode === "local-legends" && " who are from there"}
        </p>
        {tiers?.length === 1 && tiers[0] && (
          <p className="label">{TIER_BLURBS[tiers[0] as Tier]}</p>
        )}
      </div>

      {result.items.length === 0 ? (
        <EmptyState filters={filters} locationLabel={locationLabel} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {result.items.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <Link
                href={`/?${new URLSearchParams({
                  ...Object.fromEntries(new URLSearchParams(serialiseFilters(filters))),
                  page: String(page + 1),
                }).toString()}`}
                scroll={false}
                className="rounded-full border border-[var(--color-line-bright)] px-5 py-2 text-sm text-[var(--color-chalk)] hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
              >
                Show more ({result.total - result.items.length} left)
              </Link>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-[var(--color-fog)]">
        {modeMeta?.label}: {modeMeta?.tagline} Tiers are drawn from monthly
        listeners where a provider reports them, and from follower counts where
        it does not.
      </p>
    </div>
  );
}

function EmptyState({
  filters,
  locationLabel,
}: {
  filters: ReturnType<typeof parseFilters>;
  locationLabel: string | null;
}) {
  // Say what to loosen, in the order most likely to help.
  const suggestions: { label: string; href: string }[] = [];

  if (filters.maxListeners !== null) {
    suggestions.push({
      label: "Remove the listener ceiling",
      href: `/?${serialiseFilters({ ...filters, maxListeners: null })}`,
    });
  }
  if (filters.origin && filters.radiusKm < 500) {
    suggestions.push({
      label: `Widen the radius to ${Math.min(500, filters.radiusKm * 4)} km`,
      href: `/?${serialiseFilters({ ...filters, radiusKm: Math.min(500, filters.radiusKm * 4) })}`,
    });
  }
  if (filters.genres.length) {
    suggestions.push({
      label: "Clear the genre filter",
      href: `/?${serialiseFilters({ ...filters, genres: [] })}`,
    });
  }
  if (filters.onlyWithShows) {
    suggestions.push({
      label: "Include artists with no announced shows",
      href: `/?${serialiseFilters({ ...filters, onlyWithShows: false })}`,
    });
  }
  if (filters.mode !== "open") {
    suggestions.push({
      label: "Switch to the open feed",
      href: `/?${serialiseFilters({ ...filters, mode: "open" })}`,
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line-bright)] p-8 text-center">
      <p className="display text-2xl">Nothing down here</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-fog)]">
        No artists match those filters{locationLabel && ` near ${locationLabel}`}.
        The underground is small by definition — try loosening one thing.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {suggestions.slice(0, 3).map((suggestion) => (
          <Link
            key={suggestion.label}
            href={suggestion.href}
            className="rounded-full border border-[var(--color-line-bright)] px-4 py-1.5 text-sm text-[var(--color-chalk)] hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
          >
            {suggestion.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
