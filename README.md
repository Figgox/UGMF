# UGMF — Underground Music Finder

Find hidden and underground musicians near you, and the small shows they are
playing.

Every other music app ranks by popularity. UGMF ranks by its inverse: the fewer
people who have heard an artist, the higher they sit. Pair that with live dates
and you get the thing that is actually hard to find — the band playing to forty
people three neighbourhoods over.

```bash
npm install
npm run dev      # http://localhost:3000
```

No API keys needed. The app ships with a bundled dataset and runs immediately.

## What it does

**Discovery modes** — four ways into the catalogue, switchable in one tap:

| Mode | Shows |
| --- | --- |
| Crate Digger | Under 50k monthly listeners. The deep end. |
| Rising | 50k–250k, sorted by momentum — about to stop being a secret. |
| Local Legends | Artists actually *from* your city, any size. |
| Open Feed | Everything nearby, closest first. |

Switching modes never discards a filter you set — genre, radius and date stay
put and stay visible.

**Filters** — genre, distance from you, date (tonight / this weekend / next 7 /
next 30), a hard listener ceiling, and whether the artist has shows announced.
All of it lives in the URL, so any view you are looking at is a link you can
send someone.

**Artist profiles** — a quick summary strip (monthly listeners, followers,
genre, underground score), top songs with previews where they exist, bio, and
upcoming shows.

**Live** — upcoming shows grouped by day, filtered by date, distance and how
big the headliner is.

## The obscurity model

`lib/obscurity.ts` is the core of the app. It turns whatever audience signal a
provider gives us into a 0–100 score (100 = most obscure) and a tier:

| Tier | Monthly listeners |
| --- | --- |
| Deep Underground | < 5k |
| Underground | 5k – 50k |
| Rising | 50k – 250k |
| Established | 250k – 1M |
| Mainstream | > 1M |

Scoring is log-scaled, because the gap between 200 and 2,000 listeners matters
enormously for discovery and the gap between 4M and 6M does not.

## Data sources

Nothing in `app/` or `components/` touches a data source directly. Everything
goes through the provider interfaces in `lib/providers/types.ts`, selected
server-side in `lib/providers/index.ts`:

| | Default | Set these to switch |
| --- | --- | --- |
| Artists | bundled dataset | `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` |
| Events | bundled dataset | `TICKETMASTER_API_KEY` |

The two switch independently. The footer always says which is live.

**The Spotify and Ticketmaster adapters are scaffolded, not written.**
`lib/providers/spotify.ts` and `lib/providers/ticketmaster.ts` carry the full
auth flow, endpoints and field mapping as comments — filling them in is
completing a known shape, not fresh research. Until then, setting those
credentials makes requests fail loudly rather than silently returning nothing.

### Two things worth knowing before wiring Spotify

- **Spotify does not expose monthly listeners.** The Web API returns
  `followers.total` and `popularity` (0–100); the monthly-listener figure on
  artist pages is not in any public endpoint. `Artist.monthlyListeners` is
  therefore optional everywhere, the obscurity model falls back to followers and
  then popularity, and the UI labels the number by where it actually came from
  rather than presenting a follower count as listeners.
- **Spotify has no artist-location field either.** Home city has to come from
  somewhere else — MusicBrainz `begin-area` is the usual free answer — which is
  the point at which the provider factory likely becomes a composite rather than
  a switch.

Ticketmaster has its own gap: it does not return venue capacity, and it is thin
on exactly the 80-capacity DIY bills UGMF cares most about. Both are noted in
the adapter files.

## The bundled dataset

52 artists across Berlin, London, New York, Los Angeles, Stockholm and
Melbourne, weighted toward the long tail; 30 venues; ~138 shows over the next
two months.

Event dates are stored as day offsets and resolved against "now" at load, so the
dataset never rots into a list of shows that happened last spring. Artwork is
generated deterministically from the artist id — no placeholder boxes, no
network requests.

```bash
npm run seed     # regenerate lib/data/*.json (deterministic)
```

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run test       # vitest — obscurity, geo, filters, seed provider
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## API

The same filter vocabulary as the URL bar.

```
GET /api/artists?mode=crate-digger&genres=shoegaze&lat=52.52&lng=13.405&radius=25&when=next-7
GET /api/artists/[slug]
GET /api/events?when=weekend&lat=52.52&lng=13.405&radius=50&tier=underground
```

## Layout

```
app/                    routes — discover, artist profile, live, API
components/             UI; filter controls are client, everything else server
lib/obscurity.ts        scoring and tiers
lib/geo.ts              haversine distance
lib/filters.ts          URL <-> filter state, date presets
lib/providers/          the seam between the app and its data
lib/data/               bundled dataset
scripts/generate-seed.ts
```

Dates are formatted in server components only, so the server and the browser
never disagree about the reader's timezone during hydration.
