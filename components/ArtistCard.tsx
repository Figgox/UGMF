import Link from "next/link";
import type { ArtistSummary } from "@/types";
import { ArtistArtwork } from "@/components/ArtistArtwork";
import { ObscurityBadge } from "@/components/ObscurityBadge";
import { audienceStat, relativeDay, titleCase } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { listenerSource } from "@/lib/obscurity";

export function ArtistCard({ artist }: { artist: ArtistSummary }) {
  const audience = audienceStat(artist);
  const hasSignal = listenerSource(artist) !== "unknown";

  return (
    <Link
      href={`/artists/${artist.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-line-bright)]"
    >
      <div className="relative aspect-square overflow-hidden">
        <ArtistArtwork
          id={artist.id}
          name={artist.name}
          imageUrl={artist.imageUrl}
          rounded={false}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[var(--color-surface)] to-transparent" />
        <div className="absolute left-3 top-3">
          <ObscurityBadge tier={artist.tier} score={artist.undergroundScore} hasSignal={hasSignal} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 pt-2">
        <div>
          <h3 className="display text-xl leading-tight text-[var(--color-chalk)] group-hover:text-[var(--color-acid)]">
            {artist.name}
          </h3>
          <p className="label mt-1">
            {artist.homeCity}
            {artist.distanceKm !== undefined && (
              <> · {formatDistance(artist.distanceKm)}</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {artist.genres.slice(0, 3).map((genre) => (
            <span
              key={genre}
              className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-fog)]"
            >
              {titleCase(genre)}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-baseline gap-1.5">
          <span className="font-mono text-sm text-[var(--color-chalk)]">
            {audience.value}
          </span>
          <span className="label">{audience.label}</span>
        </div>

        {artist.nextEvent ? (
          <p className="border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-fog)]">
            <span className="text-[var(--color-acid)]">
              {relativeDay(artist.nextEvent.startsAt)}
            </span>{" "}
            · {artist.nextEvent.venueName}, {artist.nextEvent.city}
          </p>
        ) : (
          <p className="border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-fog)]">
            No shows announced
          </p>
        )}
      </div>
    </Link>
  );
}
