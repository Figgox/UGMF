import { NextResponse, type NextRequest } from "next/server";
import { getEventProvider } from "@/lib/providers";
import { parseFilters, resolveDateRange } from "@/lib/filters";
import { MODE_TIERS } from "@/lib/obscurity";

/** GET /api/events — upcoming shows, filtered by date, distance and tier. */
export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const limitRaw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 40;

  try {
    const page = await getEventProvider().searchEvents({
      origin: filters.origin,
      radiusKm: filters.origin ? filters.radiusKm : undefined,
      dateRange: resolveDateRange(filters),
      tier: filters.tier,
      tiers: filters.tier ? undefined : (MODE_TIERS[filters.mode] ?? undefined),
      genres: filters.genres,
      maxListeners: filters.maxListeners,
      cursor: filters.cursor,
      limit,
    });

    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Event search failed" },
      { status: 502 },
    );
  }
}
