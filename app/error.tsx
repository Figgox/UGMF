"use client";

import { useEffect } from "react";

/**
 * Providers fail loudly rather than returning empty results, so a data-source
 * problem lands here instead of rendering as "no artists found" — a silent
 * empty grid would be indistinguishable from a genuinely quiet radius.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="display text-4xl">Signal lost</p>
      <p className="max-w-md text-sm text-[var(--color-fog)]">
        Something went wrong fetching artists or shows.
      </p>
      <p className="max-w-md text-xs text-[var(--color-fog)]">
        If you have just set <code className="text-[var(--color-acid)]">SPOTIFY_CLIENT_ID</code>{" "}
        or <code className="text-[var(--color-acid)]">TICKETMASTER_API_KEY</code>: those
        adapters are scaffolded but not implemented yet. Unset them to fall back
        to the bundled dataset. The server log has the exact error.
      </p>

      <button
        onClick={reset}
        className="rounded-full border border-[var(--color-line-bright)] px-4 py-2 text-sm hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
      >
        Try again
      </button>

      {error.digest && (
        <p className="label">
          Digest {error.digest}
        </p>
      )}
    </div>
  );
}
