import "server-only";

import type { EventProvider, MusicProvider } from "@/lib/providers/types";
import { SeedMusicProvider, SeedEventProvider } from "@/lib/providers/seed";
import { SpotifyMusicProvider } from "@/lib/providers/spotify";
import { TicketmasterEventProvider } from "@/lib/providers/ticketmaster";

/**
 * Provider selection. Server-only, so credentials never reach the browser.
 *
 * The two providers switch over independently — wiring Ticketmaster does not
 * require Spotify to be ready, and Ticketmaster falls back to a stub artist
 * when Spotify isn't configured (see ticketmaster.ts). Spotify itself sources
 * artist location from MusicBrainz rather than from Ticketmaster, since an
 * artist has exactly one home city regardless of which show they're playing.
 */

let musicProvider: MusicProvider | null = null;
let eventProvider: EventProvider | null = null;

export function getMusicProvider(): MusicProvider {
  if (musicProvider) return musicProvider;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  musicProvider =
    clientId && clientSecret
      ? new SpotifyMusicProvider(clientId, clientSecret)
      : new SeedMusicProvider();

  return musicProvider;
}

export function getEventProvider(): EventProvider {
  if (eventProvider) return eventProvider;

  const apiKey = process.env.TICKETMASTER_API_KEY;

  // Passed as a function rather than imported directly, so this module can
  // hand Ticketmaster a way to hydrate artists without the two provider
  // files importing each other.
  eventProvider = apiKey
    ? new TicketmasterEventProvider(apiKey, getMusicProvider)
    : new SeedEventProvider();

  return eventProvider;
}

/** Surfaced in the footer so it is obvious which data you are looking at. */
export function providerStatus() {
  return {
    music: getMusicProvider().name,
    events: getEventProvider().name,
  };
}
