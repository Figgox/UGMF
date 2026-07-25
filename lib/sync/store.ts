// No `import "server-only"` here: unlike lib/providers/cache.ts (which
// guards the app-facing side of this data and is the thing that actually
// needs the accidental-client-import protection), this module also has to
// load under plain Node via `tsx scripts/sync.ts` — outside Next's bundler,
// "server-only" throws unconditionally rather than doing nothing, so it's
// incompatible with that second entry point.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Artist, HydratedEvent } from "@/types";
import { tierOf, undergroundScore, TIER_LABELS } from "@/lib/obscurity";
import { inDateRange } from "@/lib/providers/query";

/**
 * The on-disk cache that `CachedMusicProvider`/`CachedEventProvider`
 * (lib/providers/cache.ts) read on every request, instead of calling Spotify
 * or Ticketmaster live. Written only by the background sync
 * (lib/sync/collect.ts + lib/sync/scheduler.ts).
 *
 * Artists and events are deliberately separate files, not one combined blob
 * — they're two different features (Discover vs. Live) that fail, refresh
 * and get debugged independently, so their storage should read that way too.
 *
 * Lives outside `lib/data/` on purpose — that directory holds the bundled
 * demo dataset, built into the image at compile time via `resolveJsonModule`
 * imports. This is real runtime state that needs to survive container
 * restarts, so it's a plain file read with `fs`, under a directory meant to
 * be a mounted volume (see docker-compose.yml).
 */

export interface ArtistData {
  syncedAt: string;
  artists: Artist[];
  genres: string[];
}

export interface EventData {
  syncedAt: string;
  events: HydratedEvent[];
}

/**
 * `RATE_LIMITED` means Spotify itself said to back off — expected, and
 * self-resolving once its cooldown passes. `SYNC_FAILED` is anything else
 * (network error, bad credentials, Ticketmaster down, ...) and more likely
 * worth a look.
 */
export type SyncErrorCode = "RATE_LIMITED" | "SYNC_FAILED" | null;

export interface SyncStatus {
  lastSyncedAt: string | null;
  lastError: string | null;
  lastErrorCode: SyncErrorCode;
  running: boolean;
}

export const DEFAULT_SYNC_STATUS: SyncStatus = {
  lastSyncedAt: null,
  lastError: null,
  lastErrorCode: null,
  running: false,
};

const CACHE_DIR = process.env.SYNC_CACHE_DIR || ".data";
export const ARTISTS_JSON_PATH = join(process.cwd(), CACHE_DIR, "artists.json");
export const EVENTS_JSON_PATH = join(process.cwd(), CACHE_DIR, "events.json");
export const ARTISTS_TXT_PATH = join(process.cwd(), CACHE_DIR, "artists.txt");
export const EVENTS_TXT_PATH = join(process.cwd(), CACHE_DIR, "events.txt");
export const STATUS_PATH = join(process.cwd(), CACHE_DIR, "status.json");

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null; // missing file or corrupt JSON — treated the same by every caller
  }
}

/**
 * Writes via a temp file + rename so a crash or a concurrent read mid-write
 * never sees a half-written file — a failed sync should never corrupt or
 * blank out the last known-good data. Pretty-printed: this is meant to be
 * opened and skimmed by a person, not just parsed by the app, and the size
 * difference is irrelevant at the scale (dozens to low hundreds of records)
 * this app ever holds.
 */
async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, path);
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp-${process.pid}`;
  await writeFile(tmpPath, text, "utf-8");
  await rename(tmpPath, path);
}

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// ------------------------------------------------------------------ artists ---

export function readArtistData(): Promise<ArtistData | null> {
  return readJson<ArtistData>(ARTISTS_JSON_PATH);
}

/** Also regenerates artists.txt alongside the JSON — one call site, so the two can never drift apart. */
export async function writeArtistData(data: ArtistData): Promise<void> {
  await writeJson(ARTISTS_JSON_PATH, data);
  await writeText(ARTISTS_TXT_PATH, formatArtistList(data));
}

/**
 * A plain-text companion to artists.json, for a human to actually skim —
 * every artist with tier, obscurity score and home city/coordinates, most
 * obscure first (same ordering the "Crate Digger" default sort uses).
 * Regenerated on every write, never hand-edited.
 */
function formatArtistList(data: ArtistData): string {
  const rows = data.artists
    .map((artist) => ({ artist, score: undergroundScore(artist), tier: tierOf(artist) }))
    .sort((a, b) => b.score - a.score);

  const header = [
    `UGMF artist snapshot — ${data.artists.length} artists — synced ${data.syncedAt}`,
    "",
    "score  tier               name                                     city                          location",
    "-".repeat(115),
  ];

  const lines = rows.map(({ artist, score, tier }) => {
    const loc = `${artist.location.lat.toFixed(2)}, ${artist.location.lng.toFixed(2)}`;
    return [
      String(score).padStart(3),
      "  ",
      TIER_LABELS[tier].padEnd(17),
      "  ",
      truncate(artist.name, 40).padEnd(41),
      truncate(artist.homeCity || "—", 29).padEnd(30),
      loc,
    ].join("");
  });

  return [...header, ...lines, ""].join("\n");
}

/**
 * The library only ever grows: every artist a sync has ever found stays,
 * keyed by id, with a fresh copy overwriting the old one on a repeat find
 * (so a since-updated profile — followers, top tracks, whatever — doesn't
 * stay frozen at whatever it was the first time). A sync that finds nothing
 * this round (rate-limited, a transient error) just contributes nothing,
 * rather than wiping out everyone found so far — used by both the scheduled
 * sync and `npm run sync`.
 *
 * Genres aren't really "discovered" data the same way — it's `spotify.ts`'s
 * fixed vocabulary list, not something to accumulate — so that field just
 * prefers whichever of the two is non-empty.
 */
export async function mergeArtistsWithPrevious(data: ArtistData): Promise<ArtistData> {
  const previous = await readArtistData();
  if (!previous) return data;

  const byId = new Map(previous.artists.map((a) => [a.id, a]));
  for (const artist of data.artists) byId.set(artist.id, artist);

  return {
    syncedAt: data.syncedAt,
    artists: [...byId.values()],
    genres: data.genres.length > 0 ? data.genres : previous.genres,
  };
}

// ------------------------------------------------------------------- events ---

export function readEventData(): Promise<EventData | null> {
  return readJson<EventData>(EVENTS_JSON_PATH);
}

/** Also regenerates events.txt alongside the JSON — one call site, so the two can never drift apart. */
export async function writeEventData(data: EventData): Promise<void> {
  await writeJson(EVENTS_JSON_PATH, data);
  await writeText(EVENTS_TXT_PATH, formatEventList(data));
}

/**
 * A plain-text companion to events.json — every synced show, soonest first,
 * with headliner, venue and city. Regenerated on every write, never
 * hand-edited.
 */
function formatEventList(data: EventData): string {
  const rows = [...data.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const header = [
    `UGMF event snapshot — ${data.events.length} events — synced ${data.syncedAt}`,
    "",
    "starts (UTC)      headliner                                venue                                city",
    "-".repeat(120),
  ];

  const lines = rows.map((event) => {
    const starts = event.startsAt.slice(0, 16).replace("T", " ");
    return [
      starts.padEnd(18),
      truncate(event.headliner.name, 38).padEnd(40),
      truncate(event.venue.name, 34).padEnd(36),
      event.venue.city,
    ].join("");
  });

  return [...header, ...lines, ""].join("\n");
}

/**
 * See `mergeArtistsWithPrevious` — same accumulate-by-id reasoning, applied
 * to events. Unlike artists, this list doesn't just grow forever: it's
 * always paired with `pruneExpiredEvents` right after, which drops whatever
 * has since started — so the accumulation here is really "every upcoming
 * show any recent sync has found," not an ever-growing historical archive.
 */
export async function mergeEventsWithPrevious(data: EventData): Promise<EventData> {
  const previous = await readEventData();
  if (!previous) return data;

  const byId = new Map(previous.events.map((e) => [e.id, e]));
  for (const event of data.events) byId.set(event.id, event);

  return { syncedAt: data.syncedAt, events: [...byId.values()] };
}

/**
 * Drops shows that have already started, using the exact same "already
 * started" rule the live site filters by (`inDateRange`, imported from
 * lib/providers/query.ts) — so a show pruned here is precisely a show that
 * would never have rendered anyway. Called after every sync, scheduled or
 * manual, right after `mergeEventsWithPrevious` — without this, an
 * ever-accumulating merge would keep every show that's ever passed, forever.
 */
export function pruneExpiredEvents(data: EventData, now: Date = new Date()): EventData {
  const events = data.events.filter((event) => inDateRange(event, null, now));
  if (events.length === data.events.length) return data;
  return { ...data, events };
}

// -------------------------------------------------------------------- status ---

/**
 * A separate file rather than an in-memory object in lib/sync/scheduler.ts,
 * because it needs to be visible outside whichever module instance runs the
 * scheduler: Next.js can load instrumentation.ts's background job and an API
 * route handler as distinct module graphs, so a plain module-scope variable
 * written by one is invisible to the other. A file on disk isn't.
 */
export async function readStatus(): Promise<SyncStatus> {
  return (await readJson<SyncStatus>(STATUS_PATH)) ?? DEFAULT_SYNC_STATUS;
}

export function writeStatus(status: SyncStatus): Promise<void> {
  return writeJson(STATUS_PATH, status);
}
