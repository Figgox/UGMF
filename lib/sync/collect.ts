// See lib/sync/store.ts for why this file deliberately has no
// `import "server-only"` — it has to load under plain Node via
// `tsx scripts/sync.ts`, not just inside Next.
import {
  GENRE_SEEDS,
  SEARCH_PAGE_SIZE,
  SpotifyMusicProvider,
  SpotifyRateLimitError,
} from "@/lib/providers/spotify";
import { TicketmasterEventProvider } from "@/lib/providers/ticketmaster";
import { SeedMusicProvider } from "@/lib/providers/seed";
import type { MusicProvider } from "@/lib/providers/types";
import type { Artist, HydratedEvent } from "@/types";
import type { ArtistData, EventData } from "@/lib/sync/store";

/**
 * Pulls a fresh dataset from the real Spotify/Ticketmaster adapters and
 * shapes it into the artists.json/events.json pair `lib/sync/store.ts`
 * persists. Runs on its own schedule (lib/sync/scheduler.ts), not per
 * request — see lib/providers/cache.ts for what actually serves the website.
 *
 * Because this doesn't have to answer a waiting browser, it can afford what
 * the live request path deliberately skips: full per-artist hydration
 * (MusicBrainz location + top tracks) for everyone it finds, not just
 * whoever opens a profile page.
 */

// The natural ceiling, not an arbitrary one: with every genre capped at
// SEARCH_PAGE_SIZE results, this is the most distinct candidates one sync
// could ever turn up, so a lower cap here would only ever mean "some
// genres never get tried" (which used to be true at a hardcoded 60 — six
// genres' worth was already enough to stop the loop before the other 14
// ever ran). The real cost of this many is time, not risk: each hydration
// paces a MusicBrainz + Nominatim round trip at ~1.1s minimum, so a full
// sync now takes on the order of minutes rather than under one — fine for
// a background job on a 12h+ interval, not fine for anything blocking a
// request.
const MAX_ARTISTS_PER_SYNC = GENRE_SEEDS.length * SEARCH_PAGE_SIZE;
const EVENT_WINDOW_DAYS = 60;

// The genre loop below stops as soon as it hits MAX_ARTISTS_PER_SYNC, which
// six genres' worth of results is already enough to do — so with a fixed
// GENRE_SEEDS order, the back half of the list would never get searched at
// all, forever. Rotating the starting point roughly once per default sync
// interval spreads discovery across the whole vocabulary over successive
// syncs instead of exhausting the same first few every time.
const ROTATION_PERIOD_MS = 12 * 60 * 60 * 1000;

export interface CollectResult {
  artists: ArtistData;
  events: EventData;
  /**
   * Whether Spotify rate-limited any part of this run — surfaced separately
   * from a hard failure, since collection degrades gracefully (skips what
   * it can't get) rather than aborting. lib/sync/scheduler.ts reports this
   * through /api/health so it's distinguishable from "actually broken".
   *
   * Scope note: this only reflects the direct artist search/hydration path
   * below. A rate limit hit while Ticketmaster is hydrating a headliner via
   * Spotify is already absorbed into a stub-artist fallback inside
   * ticketmaster.ts and won't set this flag.
   */
  rateLimited: boolean;
}

async function collectArtists(
  music: SpotifyMusicProvider,
): Promise<{ artists: Artist[]; rateLimited: boolean }> {
  // slug -> id, deduped across every genre query before the expensive part
  // (full hydration) runs.
  const candidateSlugs = new Set<string>();
  let rateLimited = false;

  const rotation = Math.floor(Date.now() / ROTATION_PERIOD_MS) % GENRE_SEEDS.length;
  const genreOrder = [...GENRE_SEEDS.slice(rotation), ...GENRE_SEEDS.slice(0, rotation)];

  for (const genre of genreOrder) {
    if (candidateSlugs.size >= MAX_ARTISTS_PER_SYNC) break;
    try {
      const page = await music.searchArtists({ genres: [genre], limit: 10 });
      for (const summary of page.items) {
        if (candidateSlugs.size >= MAX_ARTISTS_PER_SYNC) break;
        candidateSlugs.add(summary.slug);
      }
    } catch (error) {
      console.warn(`[ugmf sync] artist search for genre "${genre}" failed:`, error);
      if (error instanceof SpotifyRateLimitError) {
        rateLimited = true;
        break; // every remaining query will hit the same wall — stop wasting cycles
      }
    }
  }

  const artists: Artist[] = [];
  if (!rateLimited) {
    for (const slug of candidateSlugs) {
      try {
        const full = await music.getArtistBySlug(slug);
        if (full) artists.push(full);
      } catch (error) {
        console.warn(`[ugmf sync] hydrating "${slug}" failed:`, error);
        if (error instanceof SpotifyRateLimitError) {
          rateLimited = true;
          break;
        }
      }
    }
  }

  return { artists, rateLimited };
}

export async function collectData(): Promise<CollectResult> {
  const spotifyId = process.env.SPOTIFY_CLIENT_ID;
  const spotifySecret = process.env.SPOTIFY_CLIENT_SECRET;
  const ticketmasterKey = process.env.TICKETMASTER_API_KEY;
  const syncedAt = new Date().toISOString();

  const spotify =
    spotifyId && spotifySecret ? new SpotifyMusicProvider(spotifyId, spotifySecret) : null;

  let artists: Artist[] = [];
  let rateLimited = false;
  if (spotify) {
    const result = await collectArtists(spotify);
    artists = result.artists;
    rateLimited = result.rateLimited;
  }
  const genres = spotify ? await spotify.listGenres().catch(() => []) : [];

  let events: HydratedEvent[] = [];
  if (ticketmasterKey) {
    // Reuses the Spotify instance above (so it shares its cached access
    // token) to hydrate headliners/support back into real artists — same
    // dependency-injection shape as the live provider wiring in
    // lib/providers/index.ts, just constructed locally instead of imported,
    // so the sync never reads from its own cache while writing to it.
    const musicForHydration: MusicProvider = spotify ?? new SeedMusicProvider();
    const ticketmaster = new TicketmasterEventProvider(ticketmasterKey, () => musicForHydration);
    try {
      const now = new Date();
      const to = new Date(now.getTime() + EVENT_WINDOW_DAYS * 86_400_000);
      // Matches ticketmaster.ts's MAX_EVENT_PAGE — this `limit` paginates the
      // already-hydrated results, so it needs to be at least that high or
      // successfully hydrated events beyond it get silently dropped here.
      const page = await ticketmaster.searchEvents({ dateRange: { from: now, to }, limit: 200 });
      events = page.items;
    } catch (error) {
      console.warn("[ugmf sync] event search failed:", error);
      if (error instanceof SpotifyRateLimitError) rateLimited = true;
    }
  }

  // Ticketmaster hydration already fully resolves each headliner/support act
  // into a real Artist (lib/providers/ticketmaster.ts) — otherwise that only
  // ever lives nested inside events.json. Folding them in here is a second,
  // independent discovery channel (whatever's actually touring) at no extra
  // Spotify cost, since the hydration already happened above. Genre-search
  // results win on a collision: they went through full profile hydration
  // (MusicBrainz location + top tracks), so they're the richer copy.
  const artistById = new Map(artists.map((a) => [a.id, a]));
  for (const event of events) {
    if (!artistById.has(event.headliner.id)) artistById.set(event.headliner.id, event.headliner);
    for (const support of event.support) {
      if (!artistById.has(support.id)) artistById.set(support.id, support);
    }
  }
  artists = [...artistById.values()];

  return {
    artists: { syncedAt, artists, genres },
    events: { syncedAt, events },
    rateLimited,
  };
}
