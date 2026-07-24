import { describe, expect, it } from "vitest";
import { SeedEventProvider, SeedMusicProvider } from "@/lib/providers/seed";
import { distanceKm } from "@/lib/geo";
import { tierOf } from "@/lib/obscurity";

const music = new SeedMusicProvider();
const events = new SeedEventProvider();

const BERLIN = { lat: 52.52, lng: 13.405 };

describe("SeedMusicProvider.searchArtists", () => {
  it("returns the whole catalogue when nothing is filtered", async () => {
    const page = await music.searchArtists({ limit: 500 });
    expect(page.items.length).toBeGreaterThan(20);
    expect(page.total).toBe(page.items.length);
    expect(page.nextCursor).toBeNull();
  });

  it("honours the tier restriction that Crate Digger mode applies", async () => {
    const page = await music.searchArtists({
      tiers: ["deep-underground", "underground"],
      limit: 500,
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const artist of page.items) {
      expect(["deep-underground", "underground"]).toContain(artist.tier);
    }
  });

  it("applies the raw listener ceiling", async () => {
    const page = await music.searchArtists({ maxListeners: 5_000, limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const artist of page.items) {
      expect(artist.monthlyListeners ?? 0).toBeLessThanOrEqual(5_000);
    }
  });

  it("filters by genre", async () => {
    const page = await music.searchArtists({ genres: ["shoegaze"], limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const artist of page.items) {
      expect(artist.genres).toContain("shoegaze");
    }
  });

  it("drops everything outside the radius", async () => {
    const page = await music.searchArtists({ origin: BERLIN, radiusKm: 40, limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const artist of page.items) {
      expect(artist.distanceKm).toBeLessThanOrEqual(40);
    }

    const wider = await music.searchArtists({ origin: BERLIN, radiusKm: 2000, limit: 500 });
    expect(wider.total).toBeGreaterThan(page.total);
  });

  it("measures where an artist is from when localsOnly is set", async () => {
    const page = await music.searchArtists({
      origin: BERLIN,
      radiusKm: 40,
      localsOnly: true,
      limit: 500,
    });
    for (const artist of page.items) {
      expect(distanceKm(BERLIN, artist.location)).toBeLessThanOrEqual(40);
    }
  });

  it("only returns artists with a show when asked", async () => {
    const page = await music.searchArtists({ onlyWithShows: true, limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const artist of page.items) {
      expect(artist.nextEvent).toBeDefined();
      expect(new Date(artist.nextEvent!.startsAt).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("sorts most obscure first by default", async () => {
    const page = await music.searchArtists({ limit: 500 });
    const scores = page.items.map((a) => a.undergroundScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("sorts by distance when asked", async () => {
    const page = await music.searchArtists({
      origin: BERLIN,
      radiusKm: 20_000,
      sort: "distance",
      limit: 500,
    });
    const distances = page.items.map((a) => a.distanceKm ?? Infinity);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("paginates with a cursor that picks up where the last page stopped", async () => {
    const first = await music.searchArtists({ limit: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).toBe("10");

    const second = await music.searchArtists({ limit: 10, cursor: first.nextCursor });
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    const overlap = second.items.filter((a) => first.items.some((b) => b.id === a.id));
    expect(overlap).toHaveLength(0);
  });
});

describe("SeedMusicProvider lookups", () => {
  it("finds an artist by slug and returns their tracks", async () => {
    const [slug] = await music.listAllSlugs();
    const artist = await music.getArtistBySlug(slug!);
    expect(artist).not.toBeNull();

    const tracks = await music.getTopTracks(artist!.id);
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0]!.durationMs).toBeGreaterThan(0);
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    expect(await music.getArtistBySlug("no-such-band")).toBeNull();
  });
});

describe("SeedEventProvider.searchEvents", () => {
  it("never returns a show that has already started", async () => {
    const page = await events.searchEvents({ limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const event of page.items) {
      expect(new Date(event.startsAt).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    }
  });

  it("returns shows in chronological order", async () => {
    const page = await events.searchEvents({ limit: 500 });
    const times = page.items.map((e) => new Date(e.startsAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("keeps every show inside an explicit date range", async () => {
    const from = new Date();
    const to = new Date(Date.now() + 7 * 86_400_000);
    const page = await events.searchEvents({ dateRange: { from, to }, limit: 500 });

    for (const event of page.items) {
      const at = new Date(event.startsAt).getTime();
      expect(at).toBeGreaterThanOrEqual(from.getTime());
      expect(at).toBeLessThanOrEqual(to.getTime());
    }

    const all = await events.searchEvents({ limit: 500 });
    expect(page.total).toBeLessThan(all.total);
  });

  it("treats the headliner tier as a ceiling, not an exact match", async () => {
    const deep = await events.searchEvents({ tier: "deep-underground", limit: 500 });
    expect(deep.items.length).toBeGreaterThan(0);
    for (const event of deep.items) {
      expect(tierOf(event.headliner)).toBe("deep-underground");
    }

    // Asking for "underground" must still include the smaller bills below it.
    const under = await events.searchEvents({ tier: "underground", limit: 500 });
    expect(under.total).toBeGreaterThan(deep.total);
    for (const event of under.items) {
      expect(["deep-underground", "underground"]).toContain(tierOf(event.headliner));
    }
  });

  it("filters by radius and reports the distance it used", async () => {
    const page = await events.searchEvents({ origin: BERLIN, radiusKm: 30, limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const event of page.items) {
      expect(event.distanceKm).toBeLessThanOrEqual(30);
      expect(event.venue.city).toBe("Berlin");
    }
  });

  it("hydrates the bill with real artist and venue records", async () => {
    const page = await events.searchEvents({ limit: 5 });
    for (const event of page.items) {
      expect(event.headliner.name).toBeTruthy();
      expect(event.venue.name).toBeTruthy();
      expect(event.support.length).toBe(event.supportIds.length);
    }
  });

  it("returns only that artist's shows via getEventsForArtist", async () => {
    const all = await events.searchEvents({ limit: 500 });
    const target = all.items[0]!.headlinerId;

    const forArtist = await events.getEventsForArtist(target);
    expect(forArtist.length).toBeGreaterThan(0);
    for (const event of forArtist) {
      expect(
        event.headlinerId === target || event.supportIds.includes(target),
      ).toBe(true);
    }
  });
});
