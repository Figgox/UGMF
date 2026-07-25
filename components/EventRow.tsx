import Link from "next/link";
import type { HydratedEvent } from "@/types";
import { ObscurityBadge } from "@/components/ObscurityBadge";
import { ArtistArtwork } from "@/components/ArtistArtwork";
import { formatEventDate, formatPrice } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { listenerSource, tierOf, undergroundScore } from "@/lib/obscurity";

/** Server component — dates are formatted here and never re-rendered client-side. */
export function EventRow({ event }: { event: HydratedEvent }) {
  const when = formatEventDate(event.startsAt);
  const price = formatPrice(event.priceRange);
  const tier = tierOf(event.headliner);
  const hasSignal = listenerSource(event.headliner) !== "unknown";

  return (
    <article className="flex gap-4 border-b border-[var(--color-line)] py-4 last:border-b-0">
      <div className="w-12 shrink-0 text-center sm:w-14">
        <div className="label !text-[var(--color-acid)]">{when.day}</div>
        <div className="display text-lg leading-tight">{when.date.split(" ")[0]}</div>
        <div className="label">{when.date.split(" ")[1]}</div>
      </div>

      <Link
        href={`/artists/${event.headliner.slug}`}
        className="hidden h-16 w-16 shrink-0 overflow-hidden rounded-lg sm:block"
        aria-hidden
        tabIndex={-1}
      >
        <ArtistArtwork
          id={event.headliner.id}
          name={event.headliner.name}
          imageUrl={event.headliner.imageUrl}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/artists/${event.headliner.slug}`}
            className="display text-lg leading-tight hover:text-[var(--color-acid)]"
          >
            {event.headliner.name}
          </Link>
          <ObscurityBadge tier={tier} score={undergroundScore(event.headliner)} hasSignal={hasSignal} />
        </div>

        {event.support.length > 0 && (
          <p className="mt-0.5 text-sm text-[var(--color-fog)]">
            with{" "}
            {event.support.map((artist, i) => (
              <span key={artist.id}>
                {i > 0 && ", "}
                <Link
                  href={`/artists/${artist.slug}`}
                  className="hover:text-[var(--color-chalk)] hover:underline"
                >
                  {artist.name}
                </Link>
              </span>
            ))}
          </p>
        )}

        <p className="mt-1.5 text-sm text-[var(--color-chalk)]">
          {event.venue.name}
          <span className="text-[var(--color-fog)]">
            {" "}
            · {event.venue.city}
            {event.distanceKm !== undefined && ` · ${formatDistance(event.distanceKm)}`}
          </span>
        </p>

        <p className="label mt-1 flex flex-wrap gap-x-3">
          <span>{when.time}</span>
          {event.venue.capacity && <span>{event.venue.capacity} cap</span>}
          {price && <span>{price}</span>}
          {event.ageRestriction && <span>{event.ageRestriction}</span>}
        </p>
      </div>

      {event.ticketUrl && (
        <a
          href={event.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden h-fit shrink-0 rounded-full border border-[var(--color-line-bright)] px-3 py-1.5 text-xs text-[var(--color-chalk)] hover:border-[var(--color-acid)] hover:text-[var(--color-acid)] sm:block"
        >
          Tickets
        </a>
      )}
    </article>
  );
}
