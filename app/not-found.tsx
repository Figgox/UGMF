import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="display text-5xl">Off the map</p>
      <p className="max-w-sm text-sm text-[var(--color-fog)]">
        That page does not exist. The artist may have changed their name, which
        down here happens about twice a year.
      </p>
      <Link
        href="/"
        className="rounded-full border border-[var(--color-line-bright)] px-4 py-2 text-sm hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
      >
        Back to discover
      </Link>
    </div>
  );
}
