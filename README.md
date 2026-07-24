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

## Self-hosting with Docker

The app is stateless and the whole dataset is baked into the image, so there is
nothing to mount and no database to run. Health is at `/api/health`, which also
reports which data source is live.

There are two ways in, and the difference matters on a NAS.

### Option A — paste one file, no source needed

`docker-compose.nas.yml` is self-contained: it pulls a prebuilt image and has no
`build:` line, so nothing else has to exist on the NAS. This is the one to use
if your NAS is short on RAM or you would rather not keep a checkout on it.

```bash
docker compose -f docker-compose.nas.yml up -d
```

It needs the image to have been published once. Run **Publish container image**
from the repo's Actions tab (it builds for x86 and ARM and pushes to GHCR), then
either make the package public — github.com/users/Figgox/packages → `ugmf` →
Package settings — or `docker login ghcr.io` on the NAS.

### Option B — build on the NAS from source

`docker-compose.yml` has `build: .`, so it needs the full repo checked out
beside it and enough memory to run `next build`.

```bash
git clone https://github.com/Figgox/UGMF.git && cd UGMF
docker compose up -d --build
```

Either way, open `http://<your-nas-ip>:3000`.

`next.config.ts` sets `output: "standalone"`, so the image ships a server
bundled with only the `node_modules` it actually uses — no toolchain, no dev
dependencies. It runs as an unprivileged user and is roughly 200 MB.

### What it costs to run

This is the number that matters day to day, and it is separate from what
building costs — with Option A the NAS never builds at all.

| | Default heap | `--max-old-space-size=128` |
| --- | --- | --- |
| Just started | 102 MB | 101 MB |
| After 500 requests | 199 MB | 169 MB |
| After 4000 requests | 276 MB | 175 MB |
| After 25 s idle | 276 MB | 175 MB |

It plateaus rather than climbing — flat from about 2500 requests on, with no
failed requests in either run. V8 simply grows its heap to suit the machine it
is on, which is why capping it holds the container near 175 MB. Node also sizes
that default from total system RAM, so a small NAS will settle lower than these
figures on its own.

Both compose files set `mem_limit: 512m`, comfortably clear of the plateau, and
carry a commented-out `NODE_OPTIONS` line if you want the tighter footprint.

`docker stats` will report somewhat more than this, because cgroup accounting
attributes page cache to the container.

### Things that actually bite on a NAS

- **Set `TZ`.** It is `Etc/UTC` in `docker-compose.yml`; change it to your zone.
  The container clock decides where the "Tonight" cutoff falls and how show
  times are printed. It matters more once the Ticketmaster provider is live,
  because real event times are absolute instants that get rendered in the
  container's timezone.
- **Architecture only matters for Option B.** The published image covers x86 and
  ARM and Docker picks the right one, so Option A cannot get this wrong.
  Building on the NAS itself is also always correct. What breaks is building on
  an x86 laptop for an ARM NAS — for that use
  `docker buildx build --platform linux/arm64 -t ugmf:latest .`
- **Building peaks at about 1 GB of real memory**, measured rather than
  estimated (see below). That is genuine resident usage, not headroom — so a
  2 GB NAS already running other containers is where Option B starts getting
  tight. Use Option A, or build elsewhere and move the image across with
  `docker save ugmf:latest | gzip > ugmf.tar.gz` and `docker load < ugmf.tar.gz`.

<details>
<summary>What the build actually costs</summary>

Peak concurrent RSS across the whole process tree, sampled every 50 ms on
x86_64 / Node 22:

| Stage | Peak tree RSS | Largest single process |
| --- | --- | --- |
| `npm ci` (deps stage) | 983 MB | 887 MB (npm itself) |
| `next build` (builder stage), 4 cores | 994 MB | 553 MB |
| `next build`, 2 cores | 1035 MB | 504 MB |
| `next build`, 1 core | 826 MB | 483 MB |

The two stages run separately, so the figures do not add — the image build
peaks around 1 GB, not 2 GB.

Almost none of that is JavaScript heap you could tune away. Capping the heap
from its 8.2 GB default down to 256 MB moved total RSS by under 1%
(994 MB → 999 MB); the build only breaks below that, failing at 192 MB with a
V8 out-of-memory. The bulk is native memory — Turbopack is Rust — plus the
baseline of eight Node processes. Fewer cores does not help much either, as the
table shows.

Numbers are for this catalogue (52 artists, 52 prerendered pages). A much
larger dataset would raise the static-generation cost. Cross-building arm64
under QEMU in CI behaves differently again.

</details>
- **Port 3000** is usually free on Synology and QNAP (DSM itself uses 5000/5001).
  If it is taken, change the left-hand side of the port mapping, e.g.
  `"8080:3000"`.

Synology Container Manager and QNAP Container Station both read this
`docker-compose.yml` directly — create a project pointing at the repo folder
rather than using the CLI, if you prefer the GUI.

To update: `docker compose -f docker-compose.nas.yml pull && docker compose -f
docker-compose.nas.yml up -d` for Option A, or `git pull && docker compose up -d
--build` for Option B.

Adding real API keys later means uncommenting them in whichever compose file you
used and recreating the container — no rebuild needed, since they are read at
runtime.

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
GET /api/health
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
