import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventProvider, getMusicProvider } from "@/lib/providers";
import { ArtistArtwork } from "@/components/ArtistArtwork";
import { ObscurityBadge, ObscurityMeter } from "@/components/ObscurityBadge";
import { TopTracks } from "@/components/TopTracks";
import { EventRow } from "@/components/EventRow";
import { TIER_BLURBS, formatListeners, listenerSource, tierOf, undergroundScore } from "@/lib/obscurity";
import { audienceStat, titleCase } from "@/lib/format";

/**
 * Shows resolve relative to "now", so the page is re-rendered on a short
 * window rather than frozen at build time.
 */
export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = await getMusicProvider().listAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getMusicProvider().getArtistBySlug(slug);
  if (!artist) return { title: "Artist not found" };

  const audience = audienceStat(artist);
  return {
    title: artist.name,
    description: `${artist.name} — ${artist.genres.join(", ")} from ${artist.homeCity}. ${audience.value} ${audience.label}.`,
  };
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const provider = getMusicProvider();
  const artist = await provider.getArtistBySlug(slug);
  if (!artist) notFound();

  const [tracks, events] = await Promise.all([
    provider.getTopTracks(artist.id),
    getEventProvider().getEventsForArtist(artist.id),
  ]);

  const tier = tierOf(artist);
  const score = undergroundScore(artist);
  const audience = audienceStat(artist);
  const hasSignal = listenerSource(artist) !== "unknown";

  const externalLinks = Object.entries(artist.links).filter(([, url]) => Boolean(url)) as [
    string,
    string,
  ][];

  return (
    <div className="flex flex-col gap-8">
      <Link href="/" className="label w-fit hover:text-[var(--color-chalk)]">
        ← Back to discover
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="h-36 w-36 shrink-0 overflow-hidden rounded-xl sm:h-44 sm:w-44">
          <ArtistArtwork id={artist.id} name={artist.name} imageUrl={artist.imageUrl} />
        </div>

        <div className="min-w-0">
          <ObscurityBadge tier={tier} score={score} hasSignal={hasSignal} size="lg" />
          <h1 className="display mt-2 text-4xl leading-none sm:text-6xl">
            {artist.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-fog)]">
            {artist.homeCity}
            {artist.formedYear && ` · since ${artist.formedYear}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {artist.genres.map((genre) => (
              <Link
                key={genre}
                href={`/?genres=${encodeURIComponent(genre)}&mode=open`}
                className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs text-[var(--color-fog)] hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
              >
                {titleCase(genre)}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Quick summary */}
      <section
        aria-label="Quick summary"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4"
      >
        <Stat value={audience.value} label={audience.label} />
        <Stat
          value={formatListeners(artist.followers)}
          label="followers"
          muted={audience.label === "followers"}
        />
        <Stat value={artist.genres[0] ? titleCase(artist.genres[0]) : "—"} label="genre" />
        <div className="bg-[var(--color-surface)] p-4">
          <ObscurityMeter score={score} tier={tier} hasSignal={hasSignal} />
        </div>
      </section>

      <p className="text-xs text-[var(--color-fog)]">{TIER_BLURBS[tier]}</p>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Top songs */}
        <section>
          <h2 className="display mb-3 text-xl">Top songs</h2>
          <TopTracks tracks={tracks} />
        </section>

        {/* Bio + links */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="display mb-3 text-xl">About</h2>
            <p className="text-sm leading-relaxed text-[var(--color-fog)]">{artist.bio}</p>
          </div>

          {externalLinks.length > 0 && (
            <div>
              <h2 className="display mb-3 text-xl">Listen elsewhere</h2>
              <div className="flex flex-wrap gap-2">
                {externalLinks.map(([name, url]) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[var(--color-line-bright)] px-3 py-1.5 text-xs text-[var(--color-chalk)] hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
                  >
                    {titleCase(name)} ↗
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Shows */}
      <section>
        <h2 className="display mb-1 text-xl">Upcoming shows</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-fog)]">
            Nothing announced. That is normal down here — most of these bills go
            up a fortnight in advance.
          </p>
        ) : (
          <div className="mt-3">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
  muted = false,
}: {
  value: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-4">
      <p
        className={`font-mono text-2xl ${muted ? "text-[var(--color-fog)]" : "text-[var(--color-chalk)]"}`}
      >
        {value}
      </p>
      <p className="label mt-1">{label}</p>
    </div>
  );
}
