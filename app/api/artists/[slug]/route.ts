import { NextResponse } from "next/server";
import { getEventProvider, getMusicProvider } from "@/lib/providers";
import { tierOf, undergroundScore } from "@/lib/obscurity";

/** GET /api/artists/[slug] — full profile plus upcoming shows. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const artist = await getMusicProvider().getArtistBySlug(slug);
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    const events = await getEventProvider().getEventsForArtist(artist.id);

    return NextResponse.json({
      ...artist,
      tier: tierOf(artist),
      undergroundScore: undergroundScore(artist),
      upcomingEvents: events,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Artist lookup failed" },
      { status: 502 },
    );
  }
}
