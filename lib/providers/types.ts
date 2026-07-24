import type {
  Artist,
  ArtistSummary,
  City,
  HydratedEvent,
  LatLng,
  Page,
  SortKey,
  Tier,
  Track,
} from "@/types";

/**
 * The seam between UGMF and wherever its data comes from.
 *
 * v1 ships a seed-backed implementation. Spotify and Ticketmaster adapters
 * implement these same interfaces later; nothing in `app/` or `components/`
 * imports a data source directly, so that swap stays a server-side concern.
 */

export interface ArtistQuery {
  /** Restrict to these tiers. Empty/undefined means all tiers. */
  tiers?: readonly Tier[];
  genres?: readonly string[];
  origin?: LatLng | null;
  radiusKm?: number;
  /** Hard ceiling on monthly listeners (or the best available proxy). */
  maxListeners?: number | null;
  /** Only artists with an upcoming show inside `dateRange`. */
  onlyWithShows?: boolean;
  /** Bounds the "next show" lookup, and filters when `onlyWithShows` is set. */
  dateRange?: { from: Date; to: Date } | null;
  /** Match artists whose home city is inside the radius, not just touring there. */
  localsOnly?: boolean;
  sort?: SortKey;
  cursor?: string | null;
  limit?: number;
  q?: string;
}

export interface EventQuery {
  origin?: LatLng | null;
  radiusKm?: number;
  dateRange?: { from: Date; to: Date } | null;
  /** Fame ceiling for the headliner — this tier and everything below it. */
  tier?: Tier | null;
  tiers?: readonly Tier[];
  genres?: readonly string[];
  maxListeners?: number | null;
  artistId?: string;
  cursor?: string | null;
  limit?: number;
}

export interface MusicProvider {
  readonly name: string;
  searchArtists(query: ArtistQuery): Promise<Page<ArtistSummary>>;
  getArtistBySlug(slug: string): Promise<Artist | null>;
  getTopTracks(artistId: string, market?: string): Promise<Track[]>;
  /** Every genre present in the catalogue, for the filter bar. */
  listGenres(): Promise<string[]>;
  listCities(): Promise<City[]>;
  /** Slugs to pre-render. Real providers can return [] and render on demand. */
  listAllSlugs(): Promise<string[]>;
}

export interface EventProvider {
  readonly name: string;
  searchEvents(query: EventQuery): Promise<Page<HydratedEvent>>;
  getEventsForArtist(artistId: string, dateRange?: { from: Date; to: Date } | null): Promise<HydratedEvent[]>;
}
