import type { Artist, HydratedEvent, LatLng, Page, Venue } from "@/types";
import type { EventProvider, EventQuery, MusicProvider } from "@/lib/providers/types";
import { decodeCursor, paginate } from "@/lib/providers/pagination";
import { distanceKm } from "@/lib/geo";
import { effectiveListeners, tierAtMost, tierOf } from "@/lib/obscurity";
import { slugify } from "@/lib/providers/slug";

/**
 * Ticketmaster Discovery API adapter — a single `apikey` query param, no
 * token exchange.
 *
 * Discovery has no concept of "tier" or "monthly listeners", so headliner
 * fame filters (`tier`, `tiers`, `maxListeners`) can only be applied after
 * the headliner is hydrated into a full `Artist` — which means this provider
 * calls into the configured MusicProvider. That dependency is passed in as a
 * function (see lib/providers/index.ts) rather than imported directly, to
 * avoid a circular import between the two provider modules.
 *
 * Attraction -> Artist hydration prefers the real thing: if the attraction
 * carries a Spotify link, `getArtistById` fetches the full profile from
 * whichever MusicProvider is configured. Without a usable link (or when
 * that lookup comes back empty — e.g. Spotify isn't wired up), a minimal
 * stub Artist is built from the attraction itself. That stub has no
 * MusicProvider-recognised slug, so its profile page will 404 — a real
 * edge case, not swallowed silently; see the note above `stubArtist`.
 *
 * Coverage gap, not a bug: Discovery is thin on exactly the DIY 80-capacity
 * bills UGMF cares about most, and never returns venue capacity at all
 * (`Venue.capacity` stays undefined, which the UI already handles).
 */

const API_BASE = "https://app.ticketmaster.com/discovery/v2";

// Discovery's own ceiling (confirmed by hand: size=200 works, size=201 400s).
const MAX_EVENT_PAGE = 200;

// Each event hydrates its headliner and support acts via the music provider.
// Hydrating all MAX_EVENT_PAGE events at once — as this used to — fans out
// into hundreds of concurrent Spotify calls, which is exactly the kind of
// burst that got this app rate-limited by Spotify for ~23 hours from
// ordinary use. mapWithConcurrency (below) bounds that fan-out independently
// of how many events one page pulls back.
const EVENT_HYDRATION_CONCURRENCY = 5;

interface TmImage {
  url: string;
  width?: number;
}

interface TmVenue {
  id?: string;
  name?: string;
  city?: { name?: string };
  address?: { line1?: string };
  location?: { latitude?: string; longitude?: string };
}

interface TmAttraction {
  id: string;
  name: string;
  images?: TmImage[];
  classifications?: Array<{ genre?: { name?: string } }>;
  externalLinks?: { spotify?: Array<{ url?: string }> };
}

interface TmEvent {
  id: string;
  url?: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
  };
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  ageRestrictions?: { legalAgeEnforced?: boolean };
  _embedded?: { venues?: TmVenue[]; attractions?: TmAttraction[] };
}

interface TmEventSearchResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalElements?: number };
}

interface TmAttractionSearchResponse {
  _embedded?: { attractions?: TmAttraction[] };
}

function toTmDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function bestImage(images: TmImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  return images.reduce((best, img) => ((img.width ?? 0) > (best.width ?? 0) ? img : best)).url;
}

function spotifyIdFromAttraction(attraction: TmAttraction): string | null {
  const url = attraction.externalLinks?.spotify?.[0]?.url;
  if (!url) return null;
  const match = /\/artist\/([a-zA-Z0-9]+)/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Built when an attraction has no Spotify link (or that provider can't be
 * reached) so the event can still render. `homeCity`/`location` fall back to
 * the venue's own — a guess, but a defensible one: it's where they're
 * playing, if not necessarily where they're from.
 */
function stubArtist(attraction: TmAttraction, fallbackLocation: LatLng, fallbackCity: string): Artist {
  const id = `tm-${attraction.id}`;
  // Discovery represents "no genre classified" as the literal string
  // "Undefined" rather than omitting the field.
  const rawGenre = attraction.classifications?.[0]?.genre?.name;
  const genre = rawGenre && rawGenre.toLowerCase() !== "undefined" ? rawGenre : undefined;
  return {
    id,
    slug: `${slugify(attraction.name)}--${id}`,
    name: attraction.name,
    bio: "",
    genres: genre ? [genre.toLowerCase()] : [],
    homeCity: fallbackCity,
    location: fallbackLocation,
    followers: 0,
    topTracks: [],
    imageUrl: bestImage(attraction.images),
    links: {},
    sourceIds: { ticketmaster: attraction.id, spotify: spotifyIdFromAttraction(attraction) ?? undefined },
  };
}

function mapVenue(raw: TmVenue | undefined): Venue | null {
  if (!raw?.id || !raw.name || !raw.location?.latitude || !raw.location.longitude) return null;
  return {
    id: raw.id,
    name: raw.name,
    city: raw.city?.name ?? "",
    address: raw.address?.line1 ?? "",
    location: { lat: Number(raw.location.latitude), lng: Number(raw.location.longitude) },
  };
}

function resolveStartsAt(event: TmEvent): string | null {
  const start = event.dates?.start;
  if (start?.dateTime) return start.dateTime;
  if (start?.localDate) {
    // Date-only event (no confirmed time): default to 20:00 local-as-UTC
    // rather than dropping it, matching the seed provider's default door time.
    return `${start.localDate}T${start.localTime ?? "20:00:00"}Z`;
  }
  return null;
}

/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once,
 * instead of firing every call simultaneously via `Promise.all`. See
 * EVENT_HYDRATION_CONCURRENCY above for why that bound exists.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export class TicketmasterEventProvider implements EventProvider {
  readonly name = "ticketmaster";

  constructor(
    private readonly apiKey: string,
    private readonly getMusicProvider: () => MusicProvider,
  ) {}

  private async api<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    url.searchParams.set("apikey", this.apiKey);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Ticketmaster API error on ${path}: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  private async hydrateAttraction(
    attraction: TmAttraction,
    fallbackLocation: LatLng,
    fallbackCity: string,
  ): Promise<Artist> {
    const spotifyId = spotifyIdFromAttraction(attraction);
    if (spotifyId) {
      const artist = await this.getMusicProvider()
        .getArtistById(spotifyId)
        .catch(() => null);
      if (artist) return artist;
    }
    return stubArtist(attraction, fallbackLocation, fallbackCity);
  }

  private async hydrateEvent(raw: TmEvent): Promise<HydratedEvent | null> {
    const venue = mapVenue(raw._embedded?.venues?.[0]);
    const startsAt = resolveStartsAt(raw);
    const attractions = raw._embedded?.attractions ?? [];
    if (!venue || !startsAt || attractions.length === 0) return null;

    const [headlinerRaw, ...supportRaw] = attractions;
    const headliner = await this.hydrateAttraction(headlinerRaw!, venue.location, venue.city);
    const support = await Promise.all(
      supportRaw.map((a) => this.hydrateAttraction(a, venue.location, venue.city)),
    );

    const price = raw.priceRanges?.[0];

    return {
      id: raw.id,
      headlinerId: headliner.id,
      supportIds: support.map((a) => a.id),
      startsAt,
      ticketUrl: raw.url,
      priceRange:
        price?.min !== undefined && price.max !== undefined && price.currency
          ? { min: price.min, max: price.max, currency: price.currency }
          : undefined,
      // Discovery only says whether a minimum age is enforced, never what it
      // is, so this can't carry the same specificity as seed data's "18+".
      ageRestriction: raw.ageRestrictions?.legalAgeEnforced ? "Age restriction enforced" : undefined,
      venue,
      headliner,
      support,
    };
  }

  async searchEvents(query: EventQuery): Promise<Page<HydratedEvent>> {
    const limit = query.limit ?? 40;

    const params: Record<string, string> = {
      classificationName: "Music",
      // Not "date,asc" — with no location filter, that reliably returns a
      // page dominated by whatever's happening globally in the next few
      // minutes, which is stale again almost as soon as it's synced
      // (confirmed by hand: an unfiltered date-ascending pull can age out
      // to zero usable events within half an hour). "random" instead
      // samples across the whole window, so a synced batch stays useful for
      // longer between syncs.
      sort: "random",
      size: String(MAX_EVENT_PAGE),
    };
    if (query.origin) {
      params.latlong = `${query.origin.lat},${query.origin.lng}`;
      if (query.radiusKm) {
        params.radius = String(Math.min(19999, Math.round(query.radiusKm)));
        params.unit = "km";
      }
    }
    if (query.dateRange) {
      params.startDateTime = toTmDateTime(query.dateRange.from);
      params.endDateTime = toTmDateTime(query.dateRange.to);
    }
    if (query.genres?.length) {
      // Discovery has no free-text genre filter that maps onto UGMF's genre
      // vocabulary; `keyword` is a best-effort text match, refined below
      // once the headliner is hydrated with real genre tags.
      params.keyword = query.genres.join(" ");
    }

    const data = await this.api<TmEventSearchResponse>("/events.json", params);
    const rawEvents = data._embedded?.events ?? [];

    const hydrated = (
      await mapWithConcurrency(rawEvents, EVENT_HYDRATION_CONCURRENCY, (e) => this.hydrateEvent(e))
    ).filter((e): e is HydratedEvent => e !== null);

    const filtered = hydrated
      .filter((event) => {
        if (query.artistId) {
          const onBill =
            event.headlinerId === query.artistId || event.supportIds.includes(query.artistId);
          if (!onBill) return false;
        }

        const tier = tierOf(event.headliner);
        if (query.tier && !tierAtMost(tier, query.tier)) return false;
        if (query.tiers?.length && !query.tiers.includes(tier)) return false;

        if (query.genres?.length) {
          const owned = event.headliner.genres.map((g) => g.toLowerCase());
          if (!query.genres.some((g) => owned.includes(g.toLowerCase()))) return false;
        }

        const listeners = effectiveListeners(event.headliner);
        if (
          query.maxListeners !== null &&
          query.maxListeners !== undefined &&
          listeners !== null &&
          listeners > query.maxListeners
        ) {
          return false;
        }

        return true;
      })
      .map((event) => ({
        ...event,
        distanceKm: query.origin ? distanceKm(query.origin, event.venue.location) : undefined,
      }));

    return paginate(filtered, decodeCursor(query.cursor), limit);
  }

  private async findAttractionId(name: string): Promise<string | null> {
    const data = await this.api<TmAttractionSearchResponse>("/attractions.json", {
      keyword: name,
      classificationName: "Music",
      size: "1",
    });
    return data._embedded?.attractions?.[0]?.id ?? null;
  }

  async getEventsForArtist(
    artistId: string,
    dateRange?: { from: Date; to: Date } | null,
  ): Promise<HydratedEvent[]> {
    const artist = await this.getMusicProvider()
      .getArtistById(artistId)
      .catch(() => null);
    if (!artist) return [];

    const attractionId = await this.findAttractionId(artist.name).catch(() => null);
    if (!attractionId) return [];

    const params: Record<string, string> = {
      attractionId,
      classificationName: "Music",
      sort: "date,asc",
      size: "50",
    };
    if (dateRange) {
      params.startDateTime = toTmDateTime(dateRange.from);
      params.endDateTime = toTmDateTime(dateRange.to);
    }

    const data = await this.api<TmEventSearchResponse>("/events.json", params);
    const rawEvents = data._embedded?.events ?? [];

    const hydrated = (
      await mapWithConcurrency(rawEvents, EVENT_HYDRATION_CONCURRENCY, (e) => this.hydrateEvent(e))
    ).filter((e): e is HydratedEvent => e !== null);

    return hydrated;
  }
}
