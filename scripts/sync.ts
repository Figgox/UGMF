/**
 * Runs one data sync immediately and exits — the same collect+write the
 * background scheduler (lib/sync/scheduler.ts) runs on a timer, without
 * waiting for the interval. Useful right after setting real API keys for
 * the first time, or to force a refresh on demand.
 *
 * Run with: npm run sync
 */

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // No .env.local (e.g. running inside a container where the keys already
  // came in via the environment) — nothing to load.
}

import { collectData } from "../lib/sync/collect";
import {
  mergeArtistsWithPrevious,
  mergeEventsWithPrevious,
  pruneExpiredEvents,
  writeArtistData,
  writeEventData,
} from "../lib/sync/store";

async function main() {
  const hasSpotify = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  const hasTicketmaster = Boolean(process.env.TICKETMASTER_API_KEY);

  if (!hasSpotify && !hasTicketmaster) {
    console.log("No SPOTIFY_CLIENT_ID/SECRET or TICKETMASTER_API_KEY set — nothing to sync.");
    return;
  }

  console.log("Syncing...");
  const { artists, events, rateLimited } = await collectData();
  const mergedArtists = await mergeArtistsWithPrevious(artists);
  const mergedEvents = pruneExpiredEvents(await mergeEventsWithPrevious(events));
  await writeArtistData(mergedArtists);
  await writeEventData(mergedEvents);
  console.log(
    `Wrote ${mergedArtists.artists.length} artists to .data/artists.json and ${mergedEvents.events.length} events to .data/events.json` +
      (rateLimited ? " (Spotify rate-limited part of this run — some data may be missing)" : ""),
  );
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exitCode = 1;
});
