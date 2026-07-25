import type { Artist, ArtistSummary, HydratedEvent, Page, SortKey } from "@/types";
import type { ArtistQuery, EventQuery } from "@/lib/providers/types";
import { distanceKm } from "@/lib/geo";
import { effectiveListeners, tierAtMost, tierOf, undergroundScore } from "@/lib/obscurity";
import { decodeCursor, paginate } from "@/lib/providers/pagination";

/**
 * Filter/sort/paginate over an already-resolved in-memory catalogue —
 * shared by any provider that holds its data as plain arrays rather than
 * querying a remote API per request. `SeedMusicProvider`/`SeedEventProvider`
 * resolve the bundled demo dataset's day-offset events into this shape first;
 * `CachedMusicProvider`/`CachedEventProvider` (lib/providers/cache.ts) read it
 * straight from the synced-from-real-APIs snapshot.
 */

export function matchesGenres(artist: Pick<Artist, "genres">, genres: readonly string[] | undefined): boolean {
  if (!genres?.length) return true;
  const owned = artist.genres.map((g) => g.toLowerCase());
  return genres.some((g) => owned.includes(g.toLowerCase()));
}

export function inDateRange(
  event: Pick<HydratedEvent, "startsAt">,
  range: { from: Date; to: Date } | null | undefined,
  now: Date,
): boolean {
  const starts = new Date(event.startsAt).getTime();
  if (starts < now.getTime()) return false; // never surface shows that already started
  if (!range) return true;
  return starts >= range.from.getTime() && starts <= range.to.getTime();
}

/**
 * Shared with lib/providers/spotify.ts, whose search results never carry
 * `nextEvent`/`momentum` — the "soonest"/"momentum" branches below already
 * collapse to the same undergroundScore-based fallback that provider used
 * to hand-roll separately, so there's one sort implementation, not two.
 */
export function sortSummaries(items: ArtistSummary[], sort: SortKey | string): void {
  const byDistance = (a: ArtistSummary, b: ArtistSummary) =>
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);

  switch (sort) {
    case "distance":
      items.sort((a, b) => byDistance(a, b) || b.undergroundScore - a.undergroundScore);
      break;
    case "soonest":
      items.sort((a, b) => {
        const aNext = a.nextEvent?.startsAt ?? "9999";
        const bNext = b.nextEvent?.startsAt ?? "9999";
        return aNext.localeCompare(bNext) || b.undergroundScore - a.undergroundScore;
      });
      break;
    case "momentum":
      // No provider gives us listener growth, so fall back to "closest to
      // breaking out": least obscure first inside whatever tier is showing.
      items.sort((a, b) => {
        const aM = a.momentum ?? Number.NEGATIVE_INFINITY;
        const bM = b.momentum ?? Number.NEGATIVE_INFINITY;
        if (aM !== bM) return bM - aM;
        return a.undergroundScore - b.undergroundScore;
      });
      break;
    case "popularity":
      // The inverse of "obscurity" — least obscure (most mainstream) first.
      items.sort((a, b) => a.undergroundScore - b.undergroundScore || byDistance(a, b));
      break;
    case "obscurity":
    default:
      items.sort((a, b) => b.undergroundScore - a.undergroundScore || byDistance(a, b));
  }
}

export function queryArtists(
  artists: readonly Artist[],
  events: readonly HydratedEvent[],
  query: ArtistQuery,
  now: Date,
): Page<ArtistSummary> {
  const limit = query.limit ?? 24;

  // Next upcoming show per artist (headline or support), within the window.
  // Sorted first — same reasoning as queryEvents: not every source array
  // arrives chronological, and taking the first match per artist below only
  // means "soonest" if it does.
  const sortedEvents = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const nextByArtist = new Map<string, HydratedEvent>();
  for (const event of sortedEvents) {
    if (!inDateRange(event, query.dateRange, now)) continue;
    for (const id of [event.headlinerId, ...event.supportIds]) {
      if (!nextByArtist.has(id)) nextByArtist.set(id, event);
    }
  }

  const summaries: ArtistSummary[] = [];
  for (const artist of artists) {
    if (!matchesGenres(artist, query.genres)) continue;
    if (query.q && !artist.name.toLowerCase().includes(query.q.toLowerCase())) continue;

    const tier = tierOf(artist);
    if (query.tiers?.length && !query.tiers.includes(tier)) continue;

    const listeners = effectiveListeners(artist);
    if (
      query.maxListeners !== null &&
      query.maxListeners !== undefined &&
      listeners !== null &&
      listeners > query.maxListeners
    ) {
      continue;
    }

    const nextEvent = nextByArtist.get(artist.id);
    if (query.onlyWithShows && !nextEvent) continue;

    // Distance means two different things here. `localsOnly` asks where the
    // artist is *from*; otherwise an artist counts as nearby if either they
    // live in range or they are playing in range.
    let distance: number | undefined;
    if (query.origin) {
      const homeDistance = distanceKm(query.origin, artist.location);
      const gigDistance = nextEvent
        ? distanceKm(query.origin, nextEvent.venue.location)
        : Number.POSITIVE_INFINITY;
      distance = query.localsOnly ? homeDistance : Math.min(homeDistance, gigDistance);

      const radius = query.radiusKm ?? Number.POSITIVE_INFINITY;
      if (distance > radius) continue;
    }

    summaries.push({
      ...artist,
      tier,
      undergroundScore: undergroundScore(artist),
      distanceKm: distance === Number.POSITIVE_INFINITY ? undefined : distance,
      nextEvent: nextEvent
        ? {
            id: nextEvent.id,
            startsAt: nextEvent.startsAt,
            venueName: nextEvent.venue.name,
            city: nextEvent.venue.city,
          }
        : undefined,
    });
  }

  sortSummaries(summaries, query.sort ?? "obscurity");
  return paginate(summaries, decodeCursor(query.cursor), limit);
}

export function queryEvents(
  events: readonly HydratedEvent[],
  query: EventQuery,
  now: Date,
): Page<HydratedEvent> {
  const limit = query.limit ?? 40;

  const matches = events
    .filter((event) => {
      if (!inDateRange(event, query.dateRange, now)) return false;
      if (query.artistId) {
        const onBill =
          event.headlinerId === query.artistId || event.supportIds.includes(query.artistId);
        if (!onBill) return false;
      }

      const tier = tierOf(event.headliner);
      // `tier` is a fame ceiling, not an exact match — asking for
      // "Underground" should not hide the even smaller bills below it.
      if (query.tier && !tierAtMost(tier, query.tier)) return false;
      if (query.tiers?.length && !query.tiers.includes(tier)) return false;
      if (!matchesGenres(event.headliner, query.genres)) return false;

      const listeners = effectiveListeners(event.headliner);
      if (
        query.maxListeners !== null &&
        query.maxListeners !== undefined &&
        listeners !== null &&
        listeners > query.maxListeners
      ) {
        return false;
      }

      return true;
    })
    .map((event) => ({
      ...event,
      distanceKm: query.origin ? distanceKm(query.origin, event.venue.location) : undefined,
    }))
    .filter((event) => {
      if (!query.origin || query.radiusKm === undefined) return true;
      return (event.distanceKm ?? Number.POSITIVE_INFINITY) <= query.radiusKm;
    });

  // Soonest first — owned here rather than left to callers, since not every
  // source array arrives pre-sorted (Ticketmaster is queried with `sort:
  // random` upstream, deliberately, to get a spread across the sync window
  // rather than a batch clustered right at "now"; see ticketmaster.ts).
  matches.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return paginate(matches, decodeCursor(query.cursor), limit);
}
