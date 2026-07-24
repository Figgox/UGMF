import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-ink)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="display text-2xl leading-none text-[var(--color-acid)]">
            UGMF
          </span>
          <span className="label hidden sm:inline">Underground Music Finder</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-full px-3 py-1.5 text-[var(--color-fog)] hover:bg-[var(--color-surface)] hover:text-[var(--color-chalk)]"
          >
            Discover
          </Link>
          <Link
            href="/events"
            className="rounded-full px-3 py-1.5 text-[var(--color-fog)] hover:bg-[var(--color-surface)] hover:text-[var(--color-chalk)]"
          >
            Live
          </Link>
        </nav>
      </div>
    </header>
  );
}
