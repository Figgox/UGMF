import "server-only";
import { stat } from "node:fs/promises";
import type { Artist, ArtistSummary, City, HydratedEvent, Page, Track } from "@/types";
import type {
  ArtistQuery,
  EventProvider,
  EventQuery,
  MusicProvider,
} from "@/lib/providers/types";
import {
  readArtistData,
  readEventData,
  ARTISTS_JSON_PATH,
  EVENTS_JSON_PATH,
  type ArtistData,
  type EventData,
} from "@/lib/sync/store";
import { queryArtists, queryEvents } from "@/lib/providers/query";
import { SeedMusicProvider, SeedEventProvider } from "@/lib/providers/seed";

/**
 * What the website actually reads on every request when real API keys are
 * configured — never Spotify/Ticketmaster directly (see lib/sync/collect.ts
 * for the thing that does call them, on its own schedule). Reads the
 * synced-to-disk artists.json/events.json and serves them through the same
 * filter/sort/paginate logic the seed provider uses (lib/providers/query.ts).
 *
 * The two files are loaded and cached independently — a sync can succeed for
 * Ticketmaster while Spotify fails (e.g. rate-limited) or vice versa, and
 * each provider should use whatever real data it actually has rather than
 * both falling back to seed because the other one came back empty. Before
 * the first sync has ever completed, both fall back to the bundled seed
 * data rather than serving an empty site.
 */

async function statMtime(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- events ---

let cachedEvents: EventData | null = null;
let cachedEventsMtime = -1;

/** Re-reads events.json only when its mtime has moved since the last load. */
async function loadEvents(): Promise<EventData | null> {
  const mtimeMs = await statMtime(EVENTS_JSON_PATH);
  if (mtimeMs === null) {
    cachedEvents = null;
    cachedEventsMtime = -1;
    return null; // no event sync has completed yet
  }
  if (cachedEvents && mtimeMs === cachedEventsMtime) return cachedEvents;

  const data = await readEventData();
  if (!data) {
    cachedEvents = null;
    cachedEventsMtime = -1;
    return null;
  }
  cachedEvents = data;
  cachedEventsMtime = mtimeMs;
  return cachedEvents;
}

// ------------------------------------------------------------------ artists ---

interface ArtistIndex {
  data: ArtistData;
  events: HydratedEvent[];
  artistById: Map<string, Artist>;
  artistBySlug: Map<string, Artist>;
}

let cachedArtistIndex: ArtistIndex | null = null;
let cachedArtistIndexKey = "";

/**
 * Re-built only when artists.json or events.json has actually changed. The
 * index also covers artists reached only through an event (support acts,
 * headliners never turned up by a direct genre search) so a profile page
 * still resolves them, and carries the events array along so callers that
 * need both (searchArtists, for `nextEvent`) don't have to load it twice.
 */
async function loadArtistIndex(): Promise<ArtistIndex | null> {
  const artistsMtime = await statMtime(ARTISTS_JSON_PATH);
  if (artistsMtime === null) {
    cachedArtistIndex = null;
    return null; // no artist sync has completed yet
  }

  const eventData = await loadEvents();
  const key = `${artistsMtime}:${eventData?.syncedAt ?? ""}`;
  if (cachedArtistIndex && key === cachedArtistIndexKey) return cachedArtistIndex;

  const data = await readArtistData();
  if (!data) {
    cachedArtistIndex = null;
    return null;
  }

  const events = eventData?.events ?? [];
  const artistById = new Map<string, Artist>();
  const artistBySlug = new Map<string, Artist>();
  const index = (a: Artist) => {
    artistById.set(a.id, a);
    artistBySlug.set(a.slug, a);
  };
  data.artists.forEach(index);
  for (const event of events) {
    index(event.headliner);
    event.support.forEach(index);
  }

  cachedArtistIndex = { data, events, artistById, artistBySlug };
  cachedArtistIndexKey = key;
  return cachedArtistIndex;
}

// ------------------------------------------------------------------ music ---

export class CachedMusicProvider implements MusicProvider {
  readonly name = "spotify (cached)";
  private readonly fallback = new SeedMusicProvider();

  async searchArtists(query: ArtistQuery): Promise<Page<ArtistSummary>> {
    const loaded = await loadArtistIndex();
    if (!loaded || loaded.data.artists.length === 0) return this.fallback.searchArtists(query);
    return queryArtists(loaded.data.artists, loaded.events, query, new Date());
  }

  async getArtistBySlug(slug: string): Promise<Artist | null> {
    const loaded = await loadArtistIndex();
    const found = loaded?.artistBySlug.get(slug);
    return found ?? this.fallback.getArtistBySlug(slug);
  }

  async getArtistById(id: string): Promise<Artist | null> {
    const loaded = await loadArtistIndex();
    const found = loaded?.artistById.get(id);
    return found ?? this.fallback.getArtistById(id);
  }

  async getTopTracks(artistId: string): Promise<Track[]> {
    const loaded = await loadArtistIndex();
    const found = loaded?.artistById.get(artistId);
    return found ? found.topTracks : this.fallback.getTopTracks(artistId);
  }

  async listGenres(): Promise<string[]> {
    const loaded = await loadArtistIndex();
    if (!loaded || loaded.data.genres.length === 0) return this.fallback.listGenres();
    return loaded.data.genres;
  }

  async listCities(): Promise<City[]> {
    // A static picker list, not synced data — same one every provider uses.
    return this.fallback.listCities();
  }

  async listAllSlugs(): Promise<string[]> {
    // artists.json doesn't exist yet at build time (sync is a runtime-only
    // background job), so there's nothing stable to pre-render here either.
    return [];
  }
}

// ----------------------------------------------------------------- events ---

export class CachedEventProvider implements EventProvider {
  readonly name = "ticketmaster (cached)";
  private readonly fallback = new SeedEventProvider();

  async searchEvents(query: EventQuery): Promise<Page<HydratedEvent>> {
    const loaded = await loadEvents();
    if (!loaded || loaded.events.length === 0) return this.fallback.searchEvents(query);
    return queryEvents(loaded.events, query, new Date());
  }

  async getEventsForArtist(
    artistId: string,
    dateRange?: { from: Date; to: Date } | null,
  ): Promise<HydratedEvent[]> {
    const loaded = await loadEvents();
    if (!loaded || loaded.events.length === 0) {
      return this.fallback.getEventsForArtist(artistId, dateRange);
    }
    const page = queryEvents(loaded.events, { artistId, dateRange, limit: 50 }, new Date());
    return page.items;
  }
}
