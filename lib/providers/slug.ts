// Combining diacritical marks (U+0300-U+036F), split out by NFKD normalization below.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Shared by the Spotify and Ticketmaster adapters, which both invent slugs for artists a real provider doesn't have one for. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "") // strip accents split out by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
