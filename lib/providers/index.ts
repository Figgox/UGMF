import "server-only";

import type { EventProvider, MusicProvider } from "@/lib/providers/types";
import { SeedMusicProvider, SeedEventProvider } from "@/lib/providers/seed";
import { CachedMusicProvider, CachedEventProvider } from "@/lib/providers/cache";
import { readArtistData, readEventData, type SyncErrorCode } from "@/lib/sync/store";
import { getSyncStatus } from "@/lib/sync/scheduler";

/**
 * Provider selection. Server-only, so credentials never reach the browser.
 *
 * This is what the website reads on every request — it never talks to
 * Spotify or Ticketmaster directly. When real keys are configured, requests
 * are served from a disk cache that a background job (lib/sync/scheduler.ts,
 * started from instrumentation.ts) refreshes on its own schedule using the
 * real adapters (lib/providers/spotify.ts, lib/providers/ticketmaster.ts).
 * `CachedMusicProvider`/`CachedEventProvider` fall back to the bundled seed
 * data on their own until the first sync completes.
 *
 * The two providers switch over independently — wiring Ticketmaster does not
 * require Spotify to be ready.
 */

let musicProvider: MusicProvider | null = null;
let eventProvider: EventProvider | null = null;

export function getMusicProvider(): MusicProvider {
  if (musicProvider) return musicProvider;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  musicProvider = clientId && clientSecret ? new CachedMusicProvider() : new SeedMusicProvider();

  return musicProvider;
}

export function getEventProvider(): EventProvider {
  if (eventProvider) return eventProvider;

  const apiKey = process.env.TICKETMASTER_API_KEY;

  eventProvider = apiKey ? new CachedEventProvider() : new SeedEventProvider();

  return eventProvider;
}

/** Surfaced in the footer so it is obvious which data you are looking at. */
export function providerStatus() {
  return {
    music: getMusicProvider().name,
    events: getEventProvider().name,
  };
}

export interface DataStatus {
  music: string;
  events: string;
  /**
   * True when a real key is configured for that resource but no synced data
   * exists yet, so `CachedMusicProvider`/`CachedEventProvider` are quietly
   * serving seed data underneath. `providerStatus()` alone can't say this —
   * it just reports the provider's name, not whether it actually had
   * anything real to serve on this request.
   */
  placeholderArtists: boolean;
  placeholderEvents: boolean;
  syncErrorCode: SyncErrorCode;
}

export async function dataStatus(): Promise<DataStatus> {
  const musicConfigured = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  const eventsConfigured = Boolean(process.env.TICKETMASTER_API_KEY);

  const artistData = musicConfigured ? await readArtistData() : null;
  const eventData = eventsConfigured ? await readEventData() : null;
  const sync = await getSyncStatus();

  return {
    music: getMusicProvider().name,
    events: getEventProvider().name,
    placeholderArtists: musicConfigured && (!artistData || artistData.artists.length === 0),
    placeholderEvents: eventsConfigured && (!eventData || eventData.events.length === 0),
    syncErrorCode: sync.lastErrorCode,
  };
}
