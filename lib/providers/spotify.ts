import type { Artist, ArtistSummary, City, LatLng, Page, Track } from "@/types";
import type { ArtistQuery, MusicProvider } from "@/lib/providers/types";
import { decodeCursor, paginate } from "@/lib/providers/pagination";
import { resolveArtistLocation } from "@/lib/providers/musicbrainz";
import { effectiveListeners, tierOf, undergroundScore } from "@/lib/obscurity";
import { distanceKm } from "@/lib/geo";
import { slugify } from "@/lib/providers/slug";
import citiesRaw from "@/lib/data/cities.json";

/**
 * Spotify Web API adapter — client-credentials flow (no user login).
 *
 * Two real gaps in the upstream API, both handled below rather than glossed
 * over:
 *
 * - No monthly-listener field. `Artist.monthlyListeners` stays undefined;
 *   lib/obscurity.ts already falls back to followers, then popularity.
 * - No artist-location field. Resolved separately via MusicBrainz + Nominatim
 *   (lib/providers/musicbrainz.ts) — free and keyless, but rate-limited to
 *   ~1 req/sec, so it is only paid for when a query actually needs distance
 *   (an `origin` or `localsOnly`) or when hydrating a single artist profile.
 *   Search results with no geo filter get a "location unknown" sentinel
 *   instead of triggering dozens of lookups per request.
 *
 * Not implemented: cross-referencing an artist against upcoming shows
 * (`onlyWithShows`, `ArtistSummary.nextEvent`). That needs the configured
 * EventProvider, which is exactly the "provider factory becomes a composite"
 * step the README flags as a follow-up, not something to bolt on here.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const MAX_INLINE_RETRY_WAIT_SEC = 5;

// Spotify's genre-seed endpoint was retired; there is no longer a public
// "list every genre" call. This is a fixed vocabulary for the filter bar and
// for sampling a default "browse" result when a search has no q or genres.
const GENRE_SEEDS = [
  "shoegaze",
  "post-punk",
  "black metal",
  "dream pop",
  "noise rock",
  "math rock",
  "emo",
  "hardcore",
  "dub techno",
  "slowcore",
  "screamo",
  "riot grrrl",
  "synth-punk",
  "drone",
  "doom metal",
  "jungle",
  "breakcore",
  "ambient",
  "folk punk",
  "techno",
];

// Artists whose home city couldn't be resolved are pinned here — far enough
// from any real search origin that they always fail a radius check, rather
// than risk a wrong-but-plausible coordinate (e.g. 0,0) silently matching one.
const UNKNOWN_LOCATION: LatLng = { lat: 90, lng: 0 };

const MAX_SEARCH_CANDIDATES = 60;

// Spotify's own docs say /search accepts limit up to 50, but newer
// (Development Mode) apps get a 400 "Invalid limit" above 10 in practice —
// confirmed by hand against the live API. Using the documented max here
// would make every search fail, so this stays conservative.
const SEARCH_PAGE_SIZE = 10;

interface SpotifyArtistRaw {
  id: string;
  name: string;
  genres?: string[];
  followers?: { total?: number };
  popularity?: number;
  images?: { url: string }[];
  external_urls?: { spotify?: string };
}

interface SpotifyTrackRaw {
  id: string;
  name: string;
  duration_ms: number;
  album?: { name?: string };
  preview_url?: string | null;
  external_urls?: { spotify?: string };
}

/** `id` rides along in the slug (after `--`) so a profile page loads with one direct GET, not a re-search. */
function toSlug(name: string, id: string): string {
  return `${slugify(name)}--${id}`;
}

function idFromSlug(slug: string): string | null {
  const marker = slug.lastIndexOf("--");
  if (marker === -1) return null;
  const id = slug.slice(marker + 2);
  return id || null;
}

export class SpotifyMusicProvider implements MusicProvider {
  readonly name = "spotify";

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(`Spotify token request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async api<T>(path: string, params?: Record<string, string>, retriesLeft = 2): Promise<T> {
    const token = await this.getAccessToken();
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      // A short Retry-After is normal burst throttling — worth one wait. A
      // long one means the app itself is rate-limited (seen in practice:
      // Retry-After over 80,000s, i.e. ~23 hours, after a heavy testing
      // burst). Sleeping through that would hang the request rather than
      // fail, so surface it as an error instead of honoring it inline.
      if (retryAfter > MAX_INLINE_RETRY_WAIT_SEC || retriesLeft <= 0) {
        throw new Error(
          `Spotify rate limit hit on ${path}: retry after ${retryAfter}s (not waiting inline)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.api<T>(path, params, retriesLeft - 1);
    }

    if (!response.ok) {
      throw new Error(`Spotify API error on ${path}: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async searchRawArtists(query: string, limit = SEARCH_PAGE_SIZE): Promise<SpotifyArtistRaw[]> {
    const data = await this.api<{ artists: { items: SpotifyArtistRaw[] } }>("/search", {
      q: query,
      type: "artist",
      limit: String(Math.min(SEARCH_PAGE_SIZE, limit)),
    });
    return data.artists.items;
  }

  private async fetchTopTracks(artistId: string, market: string): Promise<Track[]> {
    const data = await this.api<{ tracks: SpotifyTrackRaw[] }>(
      `/artists/${artistId}/top-tracks`,
      { market },
    );
    return data.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      durationMs: t.duration_ms,
      album: t.album?.name,
      previewUrl: t.preview_url ?? undefined,
      externalUrl: t.external_urls?.spotify,
    }));
  }

  private toArtist(
    raw: SpotifyArtistRaw,
    location: LatLng,
    homeCity: string,
    topTracks: Track[],
  ): Artist {
    return {
      id: raw.id,
      slug: toSlug(raw.name, raw.id),
      name: raw.name,
      bio: "",
      genres: raw.genres ?? [],
      homeCity,
      location,
      followers: raw.followers?.total ?? 0,
      popularity: raw.popularity,
      topTracks,
      imageUrl: raw.images?.[0]?.url,
      links: { spotify: raw.external_urls?.spotify },
      sourceIds: { spotify: raw.id },
    };
  }

  private async hydrateFullArtist(raw: SpotifyArtistRaw): Promise<Artist> {
    const [resolved, topTracks] = await Promise.all([
      resolveArtistLocation(raw.name),
      this.fetchTopTracks(raw.id, "US").catch(() => []),
    ]);
    return this.toArtist(
      raw,
      resolved?.location ?? UNKNOWN_LOCATION,
      resolved?.homeCity ?? "",
      topTracks,
    );
  }

  async searchArtists(query: ArtistQuery): Promise<Page<ArtistSummary>> {
    const limit = query.limit ?? 24;
    const needsLocation = Boolean(query.origin || query.localsOnly);

    const searchTerms = query.q
      ? [query.q]
        // Spotify's `genre:"..."` field filter returns almost nothing under
        // this app's access tier (1-5 total matches, hand-verified against
        // the live API, vs. dozens for the same term as a plain keyword) —
        // genre classification data appears to be gated the same way
        // followers/popularity are. Plain keyword search is the workaround.
      : query.genres?.length
        ? query.genres.slice(0, 3)
        : GENRE_SEEDS.slice(0, 5);

    const raw = new Map<string, SpotifyArtistRaw>();
    for (const term of searchTerms) {
      if (raw.size >= MAX_SEARCH_CANDIDATES) break;
      const results = await this.searchRawArtists(term);
      for (const artist of results) {
        if (raw.size >= MAX_SEARCH_CANDIDATES) break;
        raw.set(artist.id, artist);
      }
    }

    const candidates = [...raw.values()];

    const summaries: ArtistSummary[] = [];
    for (const artist of candidates) {
      // Genre tags come back empty under this app's access tier (see the
      // keyword-search note above), so a candidate with none isn't
      // "wrong genre" — it's "unknown". The keyword search that produced it
      // already did the relevant narrowing; only reject when we actually
      // have genre data that disagrees.
      if (query.genres?.length && artist.genres?.length) {
        const owned = artist.genres.map((g) => g.toLowerCase());
        const matches = query.genres.some((g) => owned.includes(g.toLowerCase()));
        if (!matches) continue;
      }

      const listenerish = { followers: artist.followers?.total ?? 0, popularity: artist.popularity };
      const tier = tierOf(listenerish);
      if (query.tiers?.length && !query.tiers.includes(tier)) continue;

      const listeners = effectiveListeners(listenerish);
      if (
        query.maxListeners !== null &&
        query.maxListeners !== undefined &&
        listeners !== null &&
        listeners > query.maxListeners
      ) {
        continue;
      }

      let location = UNKNOWN_LOCATION;
      let homeCity = "";
      let distance: number | undefined;

      if (needsLocation) {
        const resolved = await resolveArtistLocation(artist.name);
        if (!resolved) continue; // can't place them — exclude rather than guess
        location = resolved.location;
        homeCity = resolved.homeCity;

        if (query.origin) {
          distance = distanceKm(query.origin, location);
          const radius = query.radiusKm ?? Number.POSITIVE_INFINITY;
          if (distance > radius) continue;
        }
      }

      summaries.push({
        ...this.toArtist(artist, location, homeCity, []),
        tier,
        undergroundScore: undergroundScore(listenerish),
        distanceKm: distance,
        // Requires cross-referencing the EventProvider; not done here (see file header).
        nextEvent: undefined,
      });
    }

    sortSummaries(summaries, query.sort ?? "obscurity");
    return paginate(summaries, decodeCursor(query.cursor), limit);
  }

  /** Full profile: one artist, so paying for MusicBrainz location + top tracks is fine. */
  async getArtistBySlug(slug: string): Promise<Artist | null> {
    const id = idFromSlug(slug);
    if (!id) return null;
    try {
      const raw = await this.api<SpotifyArtistRaw>(`/artists/${id}`);
      return await this.hydrateFullArtist(raw);
    } catch {
      return null;
    }
  }

  /**
   * Deliberately lightweight: this is how EventProvider adapters hydrate
   * every headliner/support on a bill, potentially dozens per request. Full
   * hydration (MusicBrainz location + top tracks) would multiply out across
   * an event page and — location especially, at ~1 req/sec — make it
   * unusably slow. The event's own venue location covers "how far is this
   * show"; an artist's home city and tracks only matter on their own profile,
   * which goes through `getArtistBySlug` instead.
   */
  async getArtistById(id: string): Promise<Artist | null> {
    try {
      const raw = await this.api<SpotifyArtistRaw>(`/artists/${id}`);
      return this.toArtist(raw, UNKNOWN_LOCATION, "", []);
    } catch {
      return null;
    }
  }

  async getTopTracks(artistId: string, market = "US"): Promise<Track[]> {
    return this.fetchTopTracks(artistId, market);
  }

  async listGenres(): Promise<string[]> {
    return GENRE_SEEDS;
  }

  async listCities(): Promise<City[]> {
    // Not Spotify data — a static picker list, same one the seed provider uses.
    return citiesRaw as unknown as City[];
  }

  async listAllSlugs(): Promise<string[]> {
    // Real providers have no finite slug list to pre-render; render on demand.
    return [];
  }
}

function sortSummaries(items: ArtistSummary[], sort: string): void {
  const byDistance = (a: ArtistSummary, b: ArtistSummary) =>
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);

  switch (sort) {
    case "distance":
      items.sort((a, b) => byDistance(a, b) || b.undergroundScore - a.undergroundScore);
      break;
    case "soonest":
      // No show data on this provider; fall back to obscurity rather than
      // pretending every artist is equally "soon".
      items.sort((a, b) => b.undergroundScore - a.undergroundScore);
      break;
    case "momentum":
      // No provider gives us listener growth; same fallback as the seed
      // provider uses when momentum is absent.
      items.sort((a, b) => a.undergroundScore - b.undergroundScore);
      break;
    case "obscurity":
    default:
      items.sort((a, b) => b.undergroundScore - a.undergroundScore || byDistance(a, b));
  }
}
