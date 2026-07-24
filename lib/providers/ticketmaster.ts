import type { HydratedEvent, Page } from "@/types";
import type { EventProvider, EventQuery } from "@/lib/providers/types";

/**
 * Ticketmaster Discovery API adapter — scaffolded, not yet wired.
 *
 * Activated by setting TICKETMASTER_API_KEY (see lib/providers/index.ts).
 *
 * ---------------------------------------------------------------------------
 * What the real implementation needs to do
 * ---------------------------------------------------------------------------
 *
 * Auth — a single query parameter, no token exchange:
 *   GET https://app.ticketmaster.com/discovery/v2/events.json?apikey=KEY
 *
 * Query mapping (UGMF EventQuery -> Discovery params):
 *   origin            -> latlong=LAT,LNG
 *   radiusKm          -> radius=N&unit=km   (max 19999; Discovery rounds)
 *   dateRange.from    -> startDateTime=YYYY-MM-DDTHH:mm:ssZ   (must be UTC, no ms)
 *   dateRange.to      -> endDateTime=...
 *   (always)          -> classificationName=Music
 *   cursor            -> page=N&size=N      (page is 0-indexed; size max 200)
 *   sort              -> date,asc
 *
 * Response mapping (_embedded.events[] -> HydratedEvent):
 *   id                            -> id
 *   dates.start.dateTime          -> startsAt  (ISO UTC; when absent the event
 *                                   is date-only — `dates.start.localDate` plus
 *                                   `timeTBA`, so default the time and flag it)
 *   url                           -> ticketUrl
 *   priceRanges[0]                -> priceRange {min, max, currency}
 *   ageRestrictions.legalAgeEnforced -> ageRestriction
 *   _embedded.venues[0]           -> venue {name, city.name, address.line1,
 *                                   location.latitude/longitude}
 *   _embedded.attractions[]       -> headliner + support. Attractions carry
 *                                   `externalLinks.spotify[0].url`, which is
 *                                   the bridge to the Spotify provider — parse
 *                                   the artist id out of that URL.
 *
 * IMPORTANT — venue capacity:
 *   Discovery does not return capacity. Leave `Venue.capacity` undefined; the
 *   UI already omits the "N cap" line when it is missing.
 *
 * IMPORTANT — coverage:
 *   Ticketmaster is thin on exactly the shows UGMF cares most about — DIY
 *   bills at 80-capacity rooms often are not ticketed through it at all. When
 *   this lands, consider running it alongside a second event source rather
 *   than replacing the seed provider outright.
 *
 * Rate limit: 5000 requests/day, 5 requests/second on the default key.
 */

export class TicketmasterEventProvider implements EventProvider {
  readonly name = "ticketmaster";

  constructor(private readonly apiKey: string) {
    void this.apiKey;
  }

  private notImplemented(method: string): never {
    throw new Error(
      `TicketmasterEventProvider.${method} is not implemented yet. ` +
        `Unset TICKETMASTER_API_KEY to fall back to seed data.`,
    );
  }

  async searchEvents(_query: EventQuery): Promise<Page<HydratedEvent>> {
    this.notImplemented("searchEvents");
  }

  async getEventsForArtist(_artistId: string): Promise<HydratedEvent[]> {
    this.notImplemented("getEventsForArtist");
  }
}
