import artistsRaw from "@/lib/data/artists.json";
import venuesRaw from "@/lib/data/venues.json";
import eventsRaw from "@/lib/data/events.json";
import citiesRaw from "@/lib/data/cities.json";

import type {
  Artist,
  ArtistSummary,
  City,
  HydratedEvent,
  LiveEvent,
  Page,
  Track,
  Venue,
} from "@/types";
import type {
  ArtistQuery,
  EventProvider,
  EventQuery,
  MusicProvider,
} from "@/lib/providers/types";
import { distanceKm } from "@/lib/geo";
import { effectiveListeners, tierAtMost, tierOf, undergroundScore } from "@/lib/obscurity";
import { decodeCursor, paginate } from "@/lib/providers/pagination";

/**
 * Seed-data provider — the default until API keys exist.
 *
 * Everything here is in-memory and synchronous under the hood; the async
 * signatures exist because the real providers will be doing network calls.
 */

const artists = artistsRaw as unknown as Artist[];
const venues = venuesRaw as unknown as Venue[];
const cities = citiesRaw as unknown as City[];

interface SeedEventRecord extends Omit<LiveEvent, "startsAt"> {
  dayOffset: number;
  startLocalTime: string;
}

const seedEvents = eventsRaw as unknown as SeedEventRecord[];

const artistById = new Map(artists.map((a) => [a.id, a]));
const artistBySlug = new Map(artists.map((a) => [a.slug, a]));
const venueById = new Map(venues.map((v) => [v.id, v]));

/**
 * Seed events store a day offset rather than a timestamp, so the demo dataset
 * is always "the next two months" no matter when it is opened.
 */
function resolveStartsAt(record: SeedEventRecord, now: Date): string {
  const [hours = "20", minutes = "00"] = record.startLocalTime.split(":");
  const date = new Date(now);
  date.setDate(date.getDate() + record.dayOffset);
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toISOString();
}

function hydrate(record: SeedEventRecord, now: Date): HydratedEvent | null {
  const venue = venueById.get(record.venueId);
  const headliner = artistById.get(record.headlinerId);
  if (!venue || !headliner) return null;

  return {
    id: record.id,
    headlinerId: record.headlinerId,
    supportIds: record.supportIds,
    startsAt: resolveStartsAt(record, now),
    ticketUrl: record.ticketUrl,
    priceRange: record.priceRange,
    ageRestriction: record.ageRestriction,
    venue,
    headliner,
    support: record.supportIds
      .map((id) => artistById.get(id))
      .filter((a): a is Artist => Boolean(a)),
  };
}

/** All events resolved against `now`, ascending. Cheap enough to redo per call. */
function allEvents(now: Date): HydratedEvent[] {
  return seedEvents
    .map((record) => hydrate(record, now))
    .filter((e): e is HydratedEvent => e !== null)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function inDateRange(
  event: HydratedEvent,
  range: { from: Date; to: Date } | null | undefined,
  now: Date,
): boolean {
  const starts = new Date(event.startsAt).getTime();
  if (starts < now.getTime()) return false; // never surface shows that already started
  if (!range) return true;
  return starts >= range.from.getTime() && starts <= range.to.getTime();
}

function matchesGenres(artist: Artist, genres: readonly string[] | undefined): boolean {
  if (!genres?.length) return true;
  const owned = artist.genres.map((g) => g.toLowerCase());
  return genres.some((g) => owned.includes(g.toLowerCase()));
}

// ------------------------------------------------------------------ music ---

export class SeedMusicProvider implements MusicProvider {
  readonly name = "seed";

  async searchArtists(query: ArtistQuery): Promise<Page<ArtistSummary>> {
    const now = new Date();
    const limit = query.limit ?? 24;
    const events = allEvents(now);

    // Next upcoming show per artist (headline or support), within the window.
    const nextByArtist = new Map<string, HydratedEvent>();
    for (const event of events) {
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

  async getArtistBySlug(slug: string): Promise<Artist | null> {
    return artistBySlug.get(slug) ?? null;
  }

  async getArtistById(id: string): Promise<Artist | null> {
    return artistById.get(id) ?? null;
  }

  async getTopTracks(artistId: string): Promise<Track[]> {
    return artistById.get(artistId)?.topTracks ?? [];
  }

  /**
   * Most-used genres first. Alphabetical ordering buries the tags that
   * actually describe the catalogue ("post-punk", "techno") behind incidental
   * secondary ones, and the filter bar only shows the first handful.
   */
  async listGenres(): Promise<string[]> {
    const counts = new Map<string, number>();
    for (const artist of artists) {
      for (const genre of artist.genres) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName))
      .map(([genre]) => genre);
  }

  async listCities(): Promise<City[]> {
    return cities;
  }

  async listAllSlugs(): Promise<string[]> {
    return artists.map((a) => a.slug);
  }
}

function sortSummaries(items: ArtistSummary[], sort: string): void {
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
    case "obscurity":
    default:
      items.sort((a, b) => b.undergroundScore - a.undergroundScore || byDistance(a, b));
  }
}

// ----------------------------------------------------------------- events ---

export class SeedEventProvider implements EventProvider {
  readonly name = "seed";

  async searchEvents(query: EventQuery): Promise<Page<HydratedEvent>> {
    const now = new Date();
    const limit = query.limit ?? 40;

    const matches = allEvents(now)
      .filter((event) => {
        if (!inDateRange(event, query.dateRange, now)) return false;
        if (query.artistId) {
          const onBill =
            event.headlinerId === query.artistId ||
            event.supportIds.includes(query.artistId);
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
        distanceKm: query.origin
          ? distanceKm(query.origin, event.venue.location)
          : undefined,
      }))
      .filter((event) => {
        if (!query.origin || query.radiusKm === undefined) return true;
        return (event.distanceKm ?? Number.POSITIVE_INFINITY) <= query.radiusKm;
      });

    return paginate(matches, decodeCursor(query.cursor), limit);
  }

  async getEventsForArtist(
    artistId: string,
    dateRange?: { from: Date; to: Date } | null,
  ): Promise<HydratedEvent[]> {
    const page = await this.searchEvents({ artistId, dateRange, limit: 50 });
    return page.items;
  }
}
