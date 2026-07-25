import type { LatLng } from "@/types";

/**
 * Best-effort artist home-location lookup, used only by the Spotify adapter —
 * Spotify's Web API has no location field at all (see spotify.ts).
 *
 * Two free, keyless services chained together, because neither alone gives a
 * name -> coordinate mapping for an artist:
 *   1. MusicBrainz  — artist name -> area name (e.g. "Portland, Oregon").
 *   2. Nominatim    — area name -> coordinates.
 *
 * Both mandate a descriptive User-Agent and a max of ~1 request/second for
 * anonymous use. Calls are serialised through one queue (shared across both
 * services, to stay well inside that budget) and results are cached forever
 * in module scope — an artist's hometown doesn't change mid-process.
 */

const USER_AGENT = "UGMF/1.0 (self-hosted; https://github.com/Figgox/UGMF)";
const MIN_INTERVAL_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/** Waits until at least MIN_INTERVAL_MS has passed since the previous call, then runs fn. */
async function pace<T>(fn: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
  return fn();
}

/**
 * Runs `fn` (which may internally call `pace` more than once) after every
 * previously queued lookup has finished, so concurrent requests for
 * different artists don't interleave their MusicBrainz/Nominatim calls and
 * blow the rate limit between them.
 */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  // Keep the queue alive even if this call fails, so later ones still run.
  queue = run.catch(() => undefined);
  return run;
}

export interface ResolvedLocation {
  location: LatLng;
  homeCity: string;
}

const locationCache = new Map<string, ResolvedLocation | null>();

interface MusicBrainzArtist {
  score?: number;
  area?: { name?: string };
  "begin-area"?: { name?: string };
}

async function lookupAreaName(artistName: string): Promise<string | null> {
  const url = new URL("https://musicbrainz.org/ws/2/artist/");
  url.searchParams.set("query", `artist:"${artistName}"`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) return null;

  const data = (await response.json()) as { artists?: MusicBrainzArtist[] };
  const best = data.artists?.[0];
  return best?.["begin-area"]?.name ?? best?.area?.name ?? null;
}

async function geocode(areaName: string): Promise<LatLng | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", areaName);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) return null;

  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  const best = results[0];
  if (!best) return null;
  return { lat: Number(best.lat), lng: Number(best.lon) };
}

/**
 * Resolves an artist's home coordinates and display city, or `null` when
 * nothing was found — callers decide the fallback (see spotify.ts, which
 * treats `null` as "unlocatable" and excludes the artist from distance-based
 * results rather than guessing).
 */
export async function resolveArtistLocation(artistName: string): Promise<ResolvedLocation | null> {
  const cached = locationCache.get(artistName);
  if (cached !== undefined) return cached;

  const result = await enqueue(async () => {
    const areaName = await pace(() => lookupAreaName(artistName));
    if (!areaName) return null;
    const location = await pace(() => geocode(areaName));
    if (!location) return null;
    return { location, homeCity: areaName };
  }).catch(() => null);

  locationCache.set(artistName, result);
  return result;
}
