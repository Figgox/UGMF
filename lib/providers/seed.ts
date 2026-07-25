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
import { queryArtists, queryEvents } from "@/lib/providers/query";

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

/**
 * All events resolved against `now`. Cheap enough to redo per call.
 * Unsorted — queryArtists/queryEvents (lib/providers/query.ts) each sort by
 * `startsAt` themselves, since not every caller's source data arrives
 * chronological (Ticketmaster's own results, notably, don't).
 */
function allEvents(now: Date): HydratedEvent[] {
  return seedEvents
    .map((record) => hydrate(record, now))
    .filter((e): e is HydratedEvent => e !== null);
}

// ------------------------------------------------------------------ music ---

export class SeedMusicProvider implements MusicProvider {
  readonly name = "seed";

  async searchArtists(query: ArtistQuery): Promise<Page<ArtistSummary>> {
    const now = new Date();
    return queryArtists(artists, allEvents(now), query, now);
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

// ----------------------------------------------------------------- events ---

export class SeedEventProvider implements EventProvider {
  readonly name = "seed";

  async searchEvents(query: EventQuery): Promise<Page<HydratedEvent>> {
    const now = new Date();
    return queryEvents(allEvents(now), query, now);
  }

  async getEventsForArtist(
    artistId: string,
    dateRange?: { from: Date; to: Date } | null,
  ): Promise<HydratedEvent[]> {
    const page = await this.searchEvents({ artistId, dateRange, limit: 50 });
    return page.items;
  }
}
