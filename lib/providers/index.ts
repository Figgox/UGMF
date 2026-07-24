import "server-only";

import type { EventProvider, MusicProvider } from "@/lib/providers/types";
import { SeedMusicProvider, SeedEventProvider } from "@/lib/providers/seed";
import { SpotifyMusicProvider } from "@/lib/providers/spotify";
import { TicketmasterEventProvider } from "@/lib/providers/ticketmaster";

/**
 * Provider selection. Server-only, so credentials never reach the browser.
 *
 * The two providers switch over independently — wiring Ticketmaster does not
 * require Spotify to be ready. When Spotify does land it will need a home-city
 * source alongside it (MusicBrainz is the cheap option; see spotify.ts), which
 * is the point at which this factory likely grows into a composite provider
 * that merges the two rather than picking one.
 */

let musicProvider: MusicProvider | null = null;
let eventProvider: EventProvider | null = null;

/**
 * Both adapters are scaffolded but not written yet, so selecting one is
 * currently a misconfiguration. Say so once, at selection, rather than leaving
 * someone to work it out from a stack trace on every request.
 */
function warnUnimplemented(provider: string, unset: string) {
  console.warn(
    `[ugmf] ${provider} credentials are set, but that adapter is not implemented yet. ` +
      `Requests will fail until it is written. Unset ${unset} to use the bundled dataset.`,
  );
}

export function getMusicProvider(): MusicProvider {
  if (musicProvider) return musicProvider;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (clientId && clientSecret) {
    warnUnimplemented("Spotify", "SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET");
    musicProvider = new SpotifyMusicProvider(clientId, clientSecret);
  } else {
    musicProvider = new SeedMusicProvider();
  }

  return musicProvider;
}

export function getEventProvider(): EventProvider {
  if (eventProvider) return eventProvider;

  const apiKey = process.env.TICKETMASTER_API_KEY;

  if (apiKey) {
    warnUnimplemented("Ticketmaster", "TICKETMASTER_API_KEY");
    eventProvider = new TicketmasterEventProvider(apiKey);
  } else {
    eventProvider = new SeedEventProvider();
  }

  return eventProvider;
}

/** Surfaced in the footer so it is obvious which data you are looking at. */
export function providerStatus() {
  return {
    music: getMusicProvider().name,
    events: getEventProvider().name,
  };
}
