/**
 * Generates the bundled seed dataset (`lib/data/*.json`).
 *
 * Deterministic: same seed in, same dataset out, so regenerating produces a
 * readable diff rather than 60 shuffled artists.
 *
 * Event dates are stored as `dayOffset` + local start time rather than
 * absolute timestamps, and resolved against "now" at load. The demo dataset
 * therefore never rots into a list of shows that happened last spring.
 *
 * Run with: npm run seed
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { City, Venue } from "../types";

// ---------------------------------------------------------------- random ---

/** Mulberry32 — small, fast, seedable. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(0x5347_4d46);

const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const chance = (p: number) => rng() < p;

function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  return out;
}

/** Log-uniform draw — most artists land in the long tail, a few are huge. */
function logUniform(min: number, max: number): number {
  const value = Math.pow(10, Math.log10(min) + rng() * (Math.log10(max) - Math.log10(min)));
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(value)) - 2));
  return Math.round(value / magnitude) * magnitude;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ----------------------------------------------------------------- cities ---

const cities: City[] = [
  { id: "berlin", name: "Berlin", region: "Berlin", country: "DE", location: { lat: 52.52, lng: 13.405 } },
  { id: "london", name: "London", region: "England", country: "GB", location: { lat: 51.5074, lng: -0.1278 } },
  { id: "new-york", name: "New York", region: "NY", country: "US", location: { lat: 40.7128, lng: -74.006 } },
  { id: "los-angeles", name: "Los Angeles", region: "CA", country: "US", location: { lat: 34.0522, lng: -118.2437 } },
  { id: "stockholm", name: "Stockholm", region: "Stockholm", country: "SE", location: { lat: 59.3293, lng: 18.0686 } },
  { id: "melbourne", name: "Melbourne", region: "VIC", country: "AU", location: { lat: -37.8136, lng: 144.9631 } },
];

/** Nudge a point a few km off the city centre so distance filters have teeth. */
function jitter(base: { lat: number; lng: number }, maxKm: number) {
  const dLat = ((rng() - 0.5) * 2 * maxKm) / 111;
  const dLng =
    ((rng() - 0.5) * 2 * maxKm) / (111 * Math.cos((base.lat * Math.PI) / 180));
  return {
    lat: Number((base.lat + dLat).toFixed(4)),
    lng: Number((base.lng + dLng).toFixed(4)),
  };
}

// ----------------------------------------------------------------- venues ---

const VENUE_NAMES: Record<string, string[]> = {
  berlin: ["Loophole", "Schokoladen", "Urban Spree", "Zukunft am Ostkreuz", "Trude Ruth & Goldammer"],
  london: ["The Windmill", "Corsica Studios", "Shacklewell Arms", "New River Studios", "The Victoria"],
  "new-york": ["Sunny's", "Union Pool", "Trans-Pecos", "Saint Vitus", "The Sultan Room"],
  "los-angeles": ["Zebulon", "Non Plus Ultra", "The Smell", "Gold Diggers", "Permanent Records Roadhouse"],
  stockholm: ["Under Bron", "Hus 7", "Slaktkyrkan", "Landet", "Kraken"],
  melbourne: ["The Tote", "Bar Open", "The Curtin", "Gasometer Hotel", "Miscellania"],
};

const STREETS = ["Kreuzweg", "Mare St", "Meserole St", "Sunset Blvd", "Hornsgatan", "Johnston St", "Bakergatan", "Rivington St"];

const venues: Venue[] = [];
for (const city of cities) {
  for (const name of VENUE_NAMES[city.id]!) {
    venues.push({
      id: slugify(`${city.id}-${name}`),
      name,
      city: city.name,
      address: `${int(2, 240)} ${pick(STREETS)}, ${city.name}`,
      location: jitter(city.location, 12),
      // Small rooms — these are the venues UGMF exists to surface. Left
      // undefined sometimes on purpose: Ticketmaster usually will not give us
      // capacity either, and the UI has to read fine without it.
      capacity: chance(0.75)
        ? pick([50, 60, 80, 100, 120, 150, 180, 200, 250, 300, 400])
        : undefined,
    });
  }
}

// ---------------------------------------------------------------- artists ---

interface GenreSpec {
  genre: string;
  extras: string[];
  names: string[];
  trackWords: string[];
  descriptor: string[];
}

const GENRES: GenreSpec[] = [
  {
    genre: "post-punk",
    extras: ["coldwave", "art punk"],
    names: ["Concrete Pastoral", "Tender Machinery", "The Long Corridor", "Bad Weather Club", "Lithium Gardens", "Sensible Footwear"],
    trackWords: ["Grey Arcade", "Function Room", "Nothing Doing", "Second Language", "Wet Concrete", "Municipal", "Dry Season", "Housing Estate"],
    descriptor: ["taut, bass-forward", "wiry and deadpan", "grim and danceable"],
  },
  {
    genre: "shoegaze",
    extras: ["dream pop", "noise pop"],
    names: ["Velour Static", "Halfway Ghost", "Slow Bloom", "Cassette Sunday", "Fathom Blue", "Peach Static"],
    trackWords: ["Softer Now", "Blue Hour", "Melt Into", "Tape Bleed", "Wash", "Nineteen", "Sleeping Through", "Faint Praise"],
    descriptor: ["reverb-drowned", "gauzy and enormous", "all pedals, no ego"],
  },
  {
    genre: "ambient",
    extras: ["drone", "modular"],
    names: ["Nils Kvarnström", "Room Tone", "Aurelia Fen", "Pale Instrument", "Winter Frequency"],
    trackWords: ["Standing Water", "Field, Empty", "Slow Tide", "Kelp", "Two Rooms", "Thaw", "Distance Study", "Fog Signal"],
    descriptor: ["long-form and patient", "tape-saturated", "built from a single modular patch"],
  },
  {
    genre: "jungle",
    extras: ["breakbeat", "footwork"],
    names: ["DJ Mould", "Sub Rosa Sound", "Breakwater", "Nite Bus", "Cutty Ranks Appreciation Society"],
    trackWords: ["Amen Corner", "Pirate Signal", "Dubplate", "Night Bus VIP", "Steppers", "Ratio", "Low End Theory", "Tempo Test"],
    descriptor: ["chopped-to-bits", "rolling and hypnotic", "pure basement energy"],
  },
  {
    genre: "noise rock",
    extras: ["math rock", "sludge"],
    names: ["Household Fire", "Angular Momentum", "Wet Cement", "The Rendering", "Split Shift"],
    trackWords: ["Load Bearing", "Compressor", "Bad Geometry", "Kiln", "Dry Heave", "Structural", "Off Cut", "Torsion"],
    descriptor: ["abrasive and precise", "loud in a thoughtful way", "riffs like falling scaffolding"],
  },
  {
    genre: "techno",
    extras: ["electro", "industrial"],
    names: ["Verkstad", "Null Object", "Hard Light", "Anna Bäck", "Terminal Function"],
    trackWords: ["Cold Start", "Loop 4", "Iron Filing", "Third Shift", "Substation", "Kick Study", "Night Freight", "Rebar"],
    descriptor: ["stripped-back and functional", "raw hardware jams", "16 hours of a single machine"],
  },
  {
    genre: "folk",
    extras: ["freak folk", "americana"],
    names: ["Marisol Grove", "The Quiet Trades", "Hollow Bone", "Elin Sandberg", "Old Growth"],
    trackWords: ["Winter Wheat", "Ferry Song", "Little Hours", "Bramble", "Ash and Ash", "Homing", "Salt Marsh", "Long Way Round"],
    descriptor: ["fingerpicked and unhurried", "recorded in one room", "close-mic'd and bare"],
  },
  {
    genre: "hip-hop",
    extras: ["experimental", "jazz rap"],
    names: ["Sable Tongue", "Off Peak", "K. Mensah", "Loose Cannon Choir", "Basement Cartography"],
    trackWords: ["Nightshift", "Rent Week", "Cheap Seats", "Overground", "Bus Route", "No Cosign", "Small Rooms", "Local Press"],
    descriptor: ["dusty, sample-heavy", "conversational and dense", "live band, no laptop"],
  },
  {
    genre: "synth-pop",
    extras: ["minimal wave", "italo"],
    names: ["Teleplasm", "Neon Ordinary", "Pale Fire Radio", "Astrid Vole", "Second City Sound"],
    trackWords: ["Arcade Light", "Automatic", "Blue Screen", "Slow Dial", "Radio Silence", "Boy Racer", "Two Way Mirror", "Static Bloom"],
    descriptor: ["hooks buried under tape hiss", "cheap synths, expensive melodies", "cold and catchy"],
  },
  {
    genre: "hardcore",
    extras: ["screamo", "powerviolence"],
    names: ["Deadweight Youth", "Civil Defence", "Rot Grid", "Mouthful of Nails", "Total Refusal"],
    trackWords: ["Short Fuse", "Nothing Kept", "Fire Drill", "Blunt Instrument", "No Exit Sign", "Curfew", "Dead Air", "Held Under"],
    descriptor: ["ninety seconds a song", "furious and unfashionable", "PA-destroying"],
  },
];

const ALBUM_WORDS = ["EP", "Demos", "Vol. 1", "Sessions", "LP", "Singles", "Tape"];

const BIO_TEMPLATES = [
  (n: string, g: string, d: string, c: string, y: number) =>
    `${n} have been making ${d} ${g} out of ${c} since ${y}. Self-released everything so far; you will not find them on a festival poster.`,
  (n: string, g: string, d: string, c: string, y: number) =>
    `Formed in ${c} in ${y}, ${n} play ${d} ${g} to rooms that hold about a hundred people. That is on purpose.`,
  (n: string, g: string, d: string, c: string, y: number) =>
    `A ${c} project running since ${y}. ${d.charAt(0).toUpperCase() + d.slice(1)} ${g}, recorded at home and mixed loud.`,
  (n: string, g: string, d: string, c: string, y: number) =>
    `${n} started as a bedroom experiment in ${y} and turned into one of ${c}'s more reliable live acts. ${d.charAt(0).toUpperCase() + d.slice(1)} ${g}.`,
];

interface SeedArtist {
  id: string;
  slug: string;
  name: string;
  bio: string;
  genres: string[];
  homeCity: string;
  location: { lat: number; lng: number };
  monthlyListeners: number;
  followers: number;
  popularity: number;
  momentum: number;
  formedYear: number;
  topTracks: {
    id: string;
    name: string;
    durationMs: number;
    album?: string;
  }[];
  links: Record<string, string>;
  sourceIds: Record<string, string>;
}

const artists: SeedArtist[] = [];
const usedNames = new Set<string>();

for (const spec of GENRES) {
  for (const name of spec.names) {
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    const city = pick(cities);
    // Weighted toward the bottom of the scale — UGMF is a long-tail app, so
    // the dataset should look like a long tail.
    const roll = rng();
    const listeners =
      roll < 0.4
        ? logUniform(120, 5_000)
        : roll < 0.7
          ? logUniform(5_000, 50_000)
          : roll < 0.87
            ? logUniform(50_000, 250_000)
            : roll < 0.96
              ? logUniform(250_000, 1_000_000)
              : logUniform(1_000_000, 6_000_000);

    const formedYear = int(2009, 2023);
    const descriptor = pick(spec.descriptor);
    const bio = pick(BIO_TEMPLATES)(name, spec.genre, descriptor, city.name, formedYear);

    const trackNames = sample(spec.trackWords, int(4, 6));
    const album = `${pick(spec.trackWords)} ${pick(ALBUM_WORDS)}`;

    const slug = slugify(name);
    artists.push({
      id: `art_${slug}`,
      slug,
      name,
      bio,
      genres: [spec.genre, ...sample(spec.extras, chance(0.6) ? 1 : 0)],
      homeCity: city.name,
      location: jitter(city.location, 10),
      monthlyListeners: listeners,
      // Followers track listeners loosely — the ratio varies a lot per artist.
      followers: Math.round(listeners * (0.12 + rng() * 0.35)),
      popularity: Math.min(
        100,
        Math.max(1, Math.round((Math.log10(listeners) / Math.log10(50_000_000)) * 100)),
      ),
      momentum: Number((rng() * 60 - 8).toFixed(1)),
      formedYear,
      topTracks: trackNames.map((track, i) => ({
        id: `trk_${slug}_${i + 1}`,
        name: track,
        durationMs: int(95, 380) * 1000,
        album: chance(0.8) ? album : undefined,
      })),
      links: {
        bandcamp: `https://${slug}.bandcamp.com`,
        ...(chance(0.7) ? { instagram: `https://instagram.com/${slug.replace(/-/g, "")}` } : {}),
        ...(chance(0.4) ? { website: `https://${slug}.net` } : {}),
      },
      sourceIds: {},
    });
  }
}

// ----------------------------------------------------------------- events ---

interface SeedEvent {
  id: string;
  headlinerId: string;
  supportIds: string[];
  venueId: string;
  /** Days from "today" at load time. */
  dayOffset: number;
  /** Local wall-clock start, "HH:MM". */
  startLocalTime: string;
  ticketUrl?: string;
  priceRange?: { min: number; max: number; currency: string };
  ageRestriction?: string;
}

const CURRENCY: Record<string, string> = {
  DE: "EUR",
  GB: "GBP",
  US: "USD",
  SE: "SEK",
  AU: "AUD",
};

const START_TIMES = ["19:00", "19:30", "20:00", "20:30", "21:00", "22:00", "23:00"];

const events: SeedEvent[] = [];
const artistsByCity = new Map<string, SeedArtist[]>();
for (const artist of artists) {
  const list = artistsByCity.get(artist.homeCity) ?? [];
  list.push(artist);
  artistsByCity.set(artist.homeCity, list);
}

let eventCounter = 0;
for (const venue of venues) {
  const city = cities.find((c) => c.name === venue.city)!;
  const locals = artistsByCity.get(city.name) ?? [];
  const showCount = int(3, 6);

  for (let i = 0; i < showCount; i++) {
    // Mostly local bills, sometimes a touring act — realistic variety, and
    // keeps a `localsOnly` query meaningfully different from the open feed.
    const pool = chance(0.7) && locals.length ? locals : artists;
    const bill = sample(pool, Math.min(pool.length, int(1, 3)));
    if (!bill.length) continue;
    const [headliner, ...support] = bill;

    const currency = CURRENCY[city.country] ?? "EUR";
    const min = pick([0, 5, 8, 10, 12, 15, 18, 22, 28]);

    eventCounter += 1;
    events.push({
      id: `evt_${String(eventCounter).padStart(4, "0")}`,
      headlinerId: headliner!.id,
      supportIds: support.map((a) => a.id),
      venueId: venue.id,
      dayOffset: int(0, 59),
      startLocalTime: pick(START_TIMES),
      ticketUrl: chance(0.85) ? `https://tickets.example.com/${venue.id}/${eventCounter}` : undefined,
      priceRange: chance(0.9)
        ? { min, max: min === 0 ? 0 : min + pick([0, 3, 5, 8]), currency }
        : undefined,
      ageRestriction: chance(0.4) ? pick(["18+", "21+", "All ages"]) : undefined,
    });
  }
}

events.sort((a, b) => a.dayOffset - b.dayOffset || a.startLocalTime.localeCompare(b.startLocalTime));

// ------------------------------------------------------------------ write ---

const dataDir = join(process.cwd(), "lib", "data");
mkdirSync(dataDir, { recursive: true });

const write = (file: string, value: unknown) => {
  writeFileSync(join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

write("cities.json", cities);
write("venues.json", venues);
write("artists.json", artists);
write("events.json", events);

const tally = artists.reduce<Record<string, number>>((acc, a) => {
  const bucket =
    a.monthlyListeners < 5_000
      ? "deep-underground"
      : a.monthlyListeners < 50_000
        ? "underground"
        : a.monthlyListeners < 250_000
          ? "rising"
          : a.monthlyListeners < 1_000_000
            ? "established"
            : "mainstream";
  acc[bucket] = (acc[bucket] ?? 0) + 1;
  return acc;
}, {});

console.log(
  `Wrote ${artists.length} artists, ${venues.length} venues, ${events.length} events across ${cities.length} cities.`,
);
console.table(tally);
