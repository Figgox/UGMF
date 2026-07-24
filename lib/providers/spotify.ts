import type { Artist, ArtistSummary, City, Page, Track } from "@/types";
import type { ArtistQuery, MusicProvider } from "@/lib/providers/types";

/**
 * Spotify Web API adapter — scaffolded, not yet wired.
 *
 * Activated by setting SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (see
 * lib/providers/index.ts). Until the method bodies below are filled in, that
 * selection is deliberately refused rather than silently returning nothing.
 *
 * ---------------------------------------------------------------------------
 * What the real implementation needs to do
 * ---------------------------------------------------------------------------
 *
 * Auth — client credentials flow (no user login, no refresh token):
 *   POST https://accounts.spotify.com/api/token
 *   Headers: Authorization: Basic base64(client_id:client_secret)
 *            Content-Type: application/x-www-form-urlencoded
 *   Body:    grant_type=client_credentials
 *   -> { access_token, token_type: "Bearer", expires_in: 3600 }
 *   Cache the token in module scope until ~60s before expiry.
 *
 * Endpoints:
 *   GET /v1/search?type=artist&q=...&limit=50   -> artist search
 *   GET /v1/artists?ids=a,b,c   (up to 50)      -> batch hydrate
 *   GET /v1/artists/{id}/top-tracks?market=XX   -> Track[]
 *
 * Field mapping (Spotify -> UGMF):
 *   id                  -> sourceIds.spotify
 *   name                -> name
 *   genres              -> genres
 *   followers.total     -> followers
 *   popularity          -> popularity
 *   images[0].url       -> imageUrl   (host already allowed in next.config.ts)
 *   external_urls.spotify -> links.spotify
 *   tracks[].preview_url  -> Track.previewUrl (frequently null)
 *
 * IMPORTANT — monthly listeners:
 *   There is no monthly-listener field anywhere in the Web API. Leave
 *   `Artist.monthlyListeners` undefined; lib/obscurity.ts already falls back to
 *   followers, then popularity, and the UI labels the number accordingly. Do
 *   not synthesise a monthly-listener figure here.
 *
 * IMPORTANT — location:
 *   Spotify has no artist-location field either. Home city has to come from
 *   elsewhere: MusicBrainz `begin-area` (free, no key) is the usual answer, or
 *   infer it from where the artist plays most via the event provider. Until
 *   that is resolved, `localsOnly` queries cannot be answered from Spotify
 *   alone — hence the composite provider note in index.ts.
 *
 * Rate limits are per-app and burst-sensitive; batch through /v1/artists and
 * cache aggressively (Next's `fetch` cache with a revalidate window is enough).
 */

export class SpotifyMusicProvider implements MusicProvider {
  readonly name = "spotify";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    void this.clientId;
    void this.clientSecret;
  }

  private notImplemented(method: string): never {
    throw new Error(
      `SpotifyMusicProvider.${method} is not implemented yet. ` +
        `Unset SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET to fall back to seed data.`,
    );
  }

  async searchArtists(_query: ArtistQuery): Promise<Page<ArtistSummary>> {
    this.notImplemented("searchArtists");
  }

  async getArtistBySlug(_slug: string): Promise<Artist | null> {
    this.notImplemented("getArtistBySlug");
  }

  async getTopTracks(_artistId: string, _market?: string): Promise<Track[]> {
    this.notImplemented("getTopTracks");
  }

  async listGenres(): Promise<string[]> {
    this.notImplemented("listGenres");
  }

  async listCities(): Promise<City[]> {
    this.notImplemented("listCities");
  }

  async listAllSlugs(): Promise<string[]> {
    // Real providers have no finite slug list to pre-render; render on demand.
    return [];
  }
}
