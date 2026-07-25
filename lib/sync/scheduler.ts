// See lib/sync/store.ts for why nothing under lib/sync/ imports
// "server-only" — it's Node/instrumentation-only code by construction
// (never reachable from a client component), and the guard actively breaks
// `tsx scripts/sync.ts`, which shares this module graph.
import { collectData } from "@/lib/sync/collect";
import {
  mergeArtistsWithPrevious,
  mergeEventsWithPrevious,
  pruneExpiredEvents,
  writeArtistData,
  writeEventData,
  readStatus,
  writeStatus,
  type SyncStatus,
} from "@/lib/sync/store";
import { SpotifyRateLimitError } from "@/lib/providers/spotify";

/**
 * Starts the background refresh loop. Called once from `instrumentation.ts`
 * when the server boots — not per request, and not from anywhere in the
 * request path, so a slow or rate-limited sync never blocks a page load.
 *
 * Does nothing when neither provider is configured; the seed dataset needs
 * no refreshing.
 */

const DEFAULT_INTERVAL_HOURS = 12;
// However short someone sets SYNC_INTERVAL_HOURS, never go below this — a
// single testing session already got this app rate-limited by Spotify for
// ~23 hours, so nothing here should be able to accidentally hammer it.
const MIN_INTERVAL_HOURS = 1;
// Give the server a moment to finish booting before the first sync fires.
const INITIAL_DELAY_MS = 15_000;

let started = false;
// Guards against overlap within this process only; see store.ts for why the
// status callers actually read is a file, not this module's own state.
let runningInThisProcess = false;

export function getSyncStatus(): Promise<SyncStatus> {
  return readStatus();
}

function intervalHours(): number {
  const raw = Number(process.env.SYNC_INTERVAL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_HOURS;
  return Math.max(MIN_INTERVAL_HOURS, raw);
}

async function runSync(): Promise<void> {
  if (runningInThisProcess) return; // previous run overran the interval; skip rather than overlap
  runningInThisProcess = true;

  const previous = await readStatus();
  await writeStatus({ ...previous, running: true }).catch(() => {});

  try {
    const { artists, events, rateLimited } = await collectData();
    const mergedArtists = await mergeArtistsWithPrevious(artists);
    const mergedEvents = pruneExpiredEvents(await mergeEventsWithPrevious(events));
    await writeArtistData(mergedArtists);
    await writeEventData(mergedEvents);
    await writeStatus({
      lastSyncedAt: mergedArtists.syncedAt,
      lastError: rateLimited
        ? "Spotify rate-limited part of this sync — some artists may be missing or stale."
        : null,
      lastErrorCode: rateLimited ? "RATE_LIMITED" : null,
      running: false,
    });
    console.log(
      `[ugmf sync] wrote ${mergedArtists.artists.length} artists, ${mergedEvents.events.length} events at ${mergedArtists.syncedAt}` +
        (rateLimited ? " (rate-limited)" : ""),
    );
  } catch (error) {
    console.warn("[ugmf sync] failed:", error);
    await writeStatus({
      lastSyncedAt: previous.lastSyncedAt, // keep the last successful sync visible, if any
      lastError: error instanceof Error ? error.message : String(error),
      lastErrorCode: error instanceof SpotifyRateLimitError ? "RATE_LIMITED" : "SYNC_FAILED",
      running: false,
    }).catch(() => {});
  } finally {
    runningInThisProcess = false;
  }
}

export function startSyncScheduler(): void {
  if (started) return;
  started = true;

  const hasSpotify = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  const hasTicketmaster = Boolean(process.env.TICKETMASTER_API_KEY);
  if (!hasSpotify && !hasTicketmaster) return;

  const intervalMs = intervalHours() * 60 * 60 * 1000;

  setTimeout(() => {
    void runSync();
    setInterval(() => void runSync(), intervalMs);
  }, INITIAL_DELAY_MS);
}
