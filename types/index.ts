/**
 * UGMF domain model.
 *
 * Field names deliberately mirror the upstream APIs we will swap in later
 * (Spotify `followers`/`popularity`, Ticketmaster `dates.start.dateTime` ->
 * `startsAt`) so the eventual adapters stay thin.
 */

export type Tier =
  | "deep-underground"
  | "underground"
  | "rising"
  | "established"
  | "mainstream";

export type DiscoveryMode = "crate-digger" | "rising" | "local-legends" | "open";

export type SortKey = "obscurity" | "soonest" | "distance" | "momentum";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Track {
  id: string;
  name: string;
  durationMs: number;
  album?: string;
  /** 30s clip. Spotify returns null for a growing share of tracks. */
  previewUrl?: string;
  externalUrl?: string;
}

export interface Artist {
  id: string;
  slug: string;
  name: string;
  bio: string;
  genres: string[];
  homeCity: string;
  location: LatLng;
  /**
   * Absent when data comes from Spotify — the Web API does not expose monthly
   * listeners. Consumers must handle `undefined`; see lib/obscurity.ts.
   */
  monthlyListeners?: number;
  followers: number;
  /** Spotify's 0-100 popularity index. */
  popularity?: number;
  /** 30-day listener change, %. No provider returns this; seed data only. */
  momentum?: number;
  formedYear?: number;
  topTracks: Track[];
  /** Real artwork URL when a provider supplies one; generated locally otherwise. */
  imageUrl?: string;
  links: {
    spotify?: string;
    bandcamp?: string;
    instagram?: string;
    website?: string;
  };
  sourceIds: {
    spotify?: string;
    ticketmaster?: string;
    musicbrainz?: string;
  };
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  address: string;
  location: LatLng;
  /** Ticketmaster rarely returns capacity, so treat this as a bonus signal. */
  capacity?: number;
}

export interface LiveEvent {
  id: string;
  headlinerId: string;
  supportIds: string[];
  venueId: string;
  /** ISO 8601. */
  startsAt: string;
  ticketUrl?: string;
  priceRange?: { min: number; max: number; currency: string };
  ageRestriction?: string;
}

/** An event with its artist and venue references resolved, ready to render. */
export interface HydratedEvent extends Omit<LiveEvent, "venueId"> {
  venue: Venue;
  headliner: Artist;
  support: Artist[];
  /** Kilometres from the search origin, when one was supplied. */
  distanceKm?: number;
}

export interface City {
  id: string;
  name: string;
  region: string;
  country: string;
  location: LatLng;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

/** An artist plus the view-model extras the UI needs. */
export interface ArtistSummary extends Artist {
  tier: Tier;
  undergroundScore: number;
  distanceKm?: number;
  nextEvent?: {
    id: string;
    startsAt: string;
    venueName: string;
    city: string;
  };
}
