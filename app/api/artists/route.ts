import { NextResponse, type NextRequest } from "next/server";
import { getMusicProvider } from "@/lib/providers";
import { parseFilters, resolveDateRange } from "@/lib/filters";
import { MODE_TIERS } from "@/lib/obscurity";

/**
 * GET /api/artists
 *
 * Same filter vocabulary as the discover page — `lib/filters.ts` parses both,
 * so a URL that works in the address bar works here too.
 */
export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const limitRaw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 24;

  try {
    const page = await getMusicProvider().searchArtists({
      tiers: MODE_TIERS[filters.mode] ?? undefined,
      genres: filters.genres,
      origin: filters.origin,
      radiusKm: filters.radiusKm,
      maxListeners: filters.maxListeners,
      onlyWithShows: filters.onlyWithShows,
      dateRange: resolveDateRange(filters),
      sort: filters.sort,
      cursor: filters.cursor,
      limit,
      q: request.nextUrl.searchParams.get("q") ?? undefined,
    });

    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Artist search failed" },
      { status: 502 },
    );
  }
}
