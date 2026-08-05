import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import {
  FAKE_JELLYFIN_BAD_CREDENTIALS,
  FAKE_JELLYFIN_BASE_URL,
  FAKE_JELLYFIN_CREDENTIALS,
} from '../testSupport/fakes/fakeJellyfin.js';
import { FAKE_NON_ADMIN_CREDENTIALS } from '../testSupport/fakes/fakeAbs.js';

/** Signs in the Auralis session (ABS fake), leaving Jellyfin itself unconfigured. */
async function authedApp(): Promise<{ app: FastifyInstance; cookie: string }> {
  const { app } = buildTestApp();
  const cookie = await loginTestUser(app);
  return { app, cookie };
}

/** `authedApp`, plus a completed `POST /jellyfin/login` against the fake — the shape
 * most browsing/search/media tests start from. */
async function jellyfinConnectedApp(): Promise<{ app: FastifyInstance; cookie: string }> {
  const { app, cookie } = await authedApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/jellyfin/login',
    payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_CREDENTIALS },
    cookies: { auralis_session: cookie },
  });
  if (response.statusCode !== 200) {
    throw new Error(`jellyfin login failed in test setup: ${response.statusCode} ${response.body}`);
  }
  return { app, cookie };
}

describe('GET /api/v1/jellyfin/config', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/jellyfin/config' });
    expect(response.statusCode).toBe(401);
  });

  it('reports unconfigured, no credentials before any login', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/config',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: false, baseUrl: null, hasCredentials: false });
  });

  it('reports configured and hasCredentials after a successful login', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/config',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: true,
      baseUrl: FAKE_JELLYFIN_BASE_URL,
      hasCredentials: true,
    });
  });
});

describe('POST /api/v1/jellyfin/login', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_CREDENTIALS },
    });
    expect(response.statusCode).toBe(401);
  });

  it('configures and authenticates in one call, never echoing the access token', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ configured: true, baseUrl: FAKE_JELLYFIN_BASE_URL });
    expect(body.user.name).toBe(FAKE_JELLYFIN_CREDENTIALS.username);
    // The whole point of storing the token server-side: it must never appear in a
    // response body at all, not even this one.
    expect(response.body).not.toMatch(/fake-jellyfin-token-/);
  });

  it('rejects bad credentials with 401 and persists nothing', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_BAD_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(401);

    const config = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/config',
      cookies: { auralis_session: cookie },
    });
    expect(config.json()).toEqual({ configured: false, baseUrl: null, hasCredentials: false });
  });

  it('a bad baseUrl on a later attempt does not overwrite a previously-working one', async () => {
    const { app, cookie } = await jellyfinConnectedApp();

    const badAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: 'http://not-a-real-jellyfin.invalid', ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    expect(badAttempt.statusCode).toBeGreaterThanOrEqual(400);

    const config = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/config',
      cookies: { auralis_session: cookie },
    });
    expect(config.json().baseUrl).toBe(FAKE_JELLYFIN_BASE_URL);
  });

  it('reuses the stored baseUrl when omitted after a first successful login', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().baseUrl).toBe(FAKE_JELLYFIN_BASE_URL);
  });

  it('409s when baseUrl is omitted and nothing has been configured yet', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });
});

describe('GET /api/v1/jellyfin/artists|albums|tracks', () => {
  it('artists requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/jellyfin/artists' });
    expect(response.statusCode).toBe(401);
  });

  it('409s with jellyfin_not_configured when no Jellyfin server has ever been connected', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });

  it('401s with jellyfin_unauthenticated when Jellyfin is configured but this user has no stored token', async () => {
    // A second, distinct Auralis account (a different ABS fixture user), signed in but
    // never through `POST /jellyfin/login` — the shared Jellyfin `settings` row already
    // exists (the first account connected it), so this must fail on *this user's*
    // missing token, not on the server being unconfigured.
    const { app } = await jellyfinConnectedApp();
    const otherUserLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: FAKE_NON_ADMIN_CREDENTIALS,
    });
    const setCookieHeader = otherUserLogin.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    const match = /auralis_session=([^;]+)/.exec(cookieHeader ?? '');
    if (!match?.[1]) throw new Error('second account login carried no session cookie');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: match[1] },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('jellyfin_unauthenticated');
  });

  it('returns normalised artists with the upstream total', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { items, total } = response.json();
    expect(total).toBe(2);
    expect(items).toHaveLength(2);
    expect(items.map((a: { name: string }) => a.name)).toContain('The Nebula Collective');
  });

  it('returns albums scoped to one artist via artistId', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const artists = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: cookie },
    });
    const nebula = artists
      .json()
      .items.find((a: { name: string }) => a.name === 'The Nebula Collective');

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/albums?artistId=${nebula.id}`,
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { items, total } = response.json();
    expect(total).toBe(2);
    expect(items.every((al: { artistId: string }) => al.artistId === nebula.id)).toBe(true);
  });

  it('returns tracks scoped to one album via albumId', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const albums = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/albums',
      cookies: { auralis_session: cookie },
    });
    const driftwave = albums.json().items.find((al: { name: string }) => al.name === 'Driftwave');

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/tracks?albumId=${driftwave.id}`,
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { items, total } = response.json();
    expect(total).toBe(2);
    expect(items.every((t: { albumId: string }) => t.albumId === driftwave.id)).toBe(true);
  });

  it('rejects a non-positive limit with 400 before ever calling upstream', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists?limit=0',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('ids=<id> scopes the listing to exactly that one item — the album/artist page favourite-toggle fetch', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const artists = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: cookie },
    });
    const nebula = artists
      .json()
      .items.find((a: { name: string }) => a.name === 'The Nebula Collective');

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/artists?ids=${nebula.id}`,
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { items, total } = response.json();
    expect(total).toBe(1);
    expect(items).toEqual([expect.objectContaining({ id: nebula.id })]);
  });

  it('ids=,,, — a supplied ids param that parses to zero actual ids — returns an empty page, not the unfiltered listing', async () => {
    // `jellyfinLibraryQuerySchema` splits `ids` on commas and drops empty segments, so
    // this parses to `[]`. The underlying Jellyfin client treats an empty `ids` array the
    // same as no filter at all (it only sends `ids` upstream when the array is non-empty),
    // so without a route-level short-circuit this would silently return every artist —
    // the wrong answer to "give me these zero items".
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists?ids=,,,',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 0, startIndex: 0 });
  });

  it('ids entirely absent is unaffected by the empty-ids short-circuit — still the full unfiltered listing', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { items, total } = response.json();
    expect(total).toBe(2);
    expect(items).toHaveLength(2);
  });

  it("favoritesOnly=true scopes artists to just this user's favourites", async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const artists = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists',
      cookies: { auralis_session: cookie },
    });
    const nebula = artists
      .json()
      .items.find((a: { name: string }) => a.name === 'The Nebula Collective');

    await app.inject({
      method: 'POST',
      url: `/api/v1/jellyfin/items/${nebula.id}/favorite`,
      cookies: { auralis_session: cookie },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/artists?favoritesOnly=true',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { items, total } = response.json();
    expect(total).toBe(1);
    expect(items).toEqual([expect.objectContaining({ id: nebula.id, favorite: true })]);
  });
});

describe('POST|DELETE /api/v1/jellyfin/items/:itemId/favorite', () => {
  it('POST requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
    });
    expect(response.statusCode).toBe(401);
  });

  it('DELETE requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
    });
    expect(response.statusCode).toBe(401);
  });

  it('marks an item as a favourite, and the listing reflects it back as favorite: true', async () => {
    const { app, cookie } = await jellyfinConnectedApp();

    const markResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
      cookies: { auralis_session: cookie },
    });
    expect(markResponse.statusCode).toBe(200);
    expect(markResponse.json()).toEqual({ favorite: true });

    const albums = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/albums',
      cookies: { auralis_session: cookie },
    });
    const driftwave = albums.json().items.find((al: { id: string }) => al.id === 'album-driftwave');
    expect(driftwave.favorite).toBe(true);
  });

  it('unmarks a favourite, and the listing reflects it back as favorite: false', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
      cookies: { auralis_session: cookie },
    });

    const unmarkResponse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
      cookies: { auralis_session: cookie },
    });
    expect(unmarkResponse.statusCode).toBe(200);
    expect(unmarkResponse.json()).toEqual({ favorite: false });

    const albums = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/albums',
      cookies: { auralis_session: cookie },
    });
    const driftwave = albums.json().items.find((al: { id: string }) => al.id === 'album-driftwave');
    expect(driftwave.favorite).toBe(false);
  });

  it('409s with jellyfin_not_configured when no Jellyfin server has ever been connected', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });
});

describe('GET /api/v1/jellyfin/search', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/jellyfin/search?term=drift' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a missing term with 400', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/search',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('matches by item name, bucketing results by kind', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    // "drift" only matches the album name ("Driftwave") — no artist or track name
    // contains it, so this also proves search doesn't pull in an album's own tracks.
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/search?term=drift',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { artists, albums, tracks } = response.json();
    expect(artists).toEqual([]);
    expect(albums.map((a: { name: string }) => a.name)).toEqual(['Driftwave']);
    expect(tracks).toEqual([]);
  });

  it('matches a track name directly', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/search?term=tidal',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const { tracks } = response.json();
    expect(tracks.map((t: { name: string }) => t.name)).toEqual(['Tidal Lines']);
  });

  it('returns an empty result (not an error) for a term with no matches', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/search?term=nonexistentxyz',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ artists: [], albums: [], tracks: [] });
  });
});

describe('GET /api/v1/jellyfin/tracks/:itemId/lyrics', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/lyrics',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns normalised, synced lyrics for a track that has them', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/lyrics',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lyrics: {
        synced: true,
        lines: [
          { text: 'Tidal lines on the shore', startSeconds: 0 },
          { text: 'Static coast forevermore', startSeconds: 3.25 },
        ],
      },
    });
  });

  it('returns unsynced lyrics (no startSeconds, synced: false) for a plain-text lyric file', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-2/lyrics',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lyrics: {
        synced: false,
        lines: [{ text: 'plain text, no timing at all', startSeconds: null }],
      },
    });
  });

  it('returns 200 with { lyrics: null } — not a 404 or 500 — for a track with no lyrics', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-hollow-1/lyrics',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lyrics: null });
  });

  it('409s with jellyfin_not_configured when no Jellyfin server has ever been connected', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/lyrics',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });
});

describe('POST /api/v1/jellyfin/playback/start|progress|stopped', () => {
  it('start requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/start',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 0 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('progress requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/progress',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 30 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stopped requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/stopped',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 30 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('start reports 204 with an empty body on success', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/start',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 0 },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('progress reports 204, accepting an optional isPaused flag', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/progress',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 45.5, isPaused: true },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('stopped reports 204 with an empty body on success', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/stopped',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 214 },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('rejects a missing itemId with 400 before ever calling upstream', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/progress',
      payload: { positionSeconds: 10 },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a negative positionSeconds with 400', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/start',
      payload: { itemId: 'track-driftwave-1', positionSeconds: -1 },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('409s with jellyfin_not_configured when no Jellyfin server has ever been connected — same as /jellyfin/tracks', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/progress',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 10 },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });
});

describe('GET /api/v1/jellyfin/tracks/:itemId/stream', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/stream',
    });
    expect(response.statusCode).toBe(401);
  });

  it('proxies the audio bytes without ever exposing the upstream token-bearing URL', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/stream',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/mpeg');
    expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
    // No response header may carry the upstream URL — that URL has ApiKey=<token> in it.
    for (const value of Object.values(response.headers)) {
      expect(String(value)).not.toMatch(/ApiKey=/);
    }
  });

  it('honours a Range header, returning 206 with Content-Range', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/stream',
      headers: { range: 'bytes=0-99' },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toMatch(/^bytes 0-99\//);
  });

  it('404s for an unknown item id', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/does-not-exist/stream',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/v1/jellyfin/items/:itemId/artwork', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/items/album-driftwave/artwork',
    });
    expect(response.statusCode).toBe(401);
  });

  it('proxies cover art bytes with a long-lived cache header', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/items/album-driftwave/artwork',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.rawPayload.length).toBeGreaterThan(0);
  });
});

describe('no route ever leaks the stored Jellyfin access token into a response body', () => {
  it('checks login, browse, search, lyrics, both media-proxy responses and the three playback reports', async () => {
    const { app, cookie } = await jellyfinConnectedApp();

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/artists',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/tracks/track-driftwave-1/lyrics',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/albums',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/tracks',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/search?term=drift',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/tracks/track-driftwave-1/stream',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/items/album-driftwave/artwork',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/playback/start',
        payload: { itemId: 'track-driftwave-1', positionSeconds: 0 },
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/playback/progress',
        payload: { itemId: 'track-driftwave-1', positionSeconds: 30 },
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/playback/stopped',
        payload: { itemId: 'track-driftwave-1', positionSeconds: 60 },
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/items/album-driftwave/favorite',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'DELETE',
        url: '/api/v1/jellyfin/items/album-driftwave/favorite',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/artists?favoritesOnly=true',
        cookies: { auralis_session: cookie },
      }),
    ]);

    for (const response of responses) {
      expect(response.body).not.toMatch(/fake-jellyfin-token-/);
      for (const value of Object.values(response.headers)) {
        expect(String(value)).not.toMatch(/fake-jellyfin-token-/);
      }
    }
  });

  it('an upstream failure produces a typed error whose message never echoes the upstream URL', async () => {
    // Jellyfin is configured and this user has a token, but the stored base URL itself is
    // wrong (points nowhere the fake upstream answers for) — the same "network failure"
    // path a real DNS/connection failure would take, and the shape `JellyfinError.network`
    // produces never includes the URL it was constructed from (see errors.ts).
    const { app, cookie } = await authedApp();
    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: 'http://not-the-fake-upstream.invalid', ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    // The login call itself fails against an unreachable host (the fake throws a
    // getaddrinfo-shaped error for any origin other than FAKE_JELLYFIN_BASE_URL), so
    // nothing gets persisted. Its own error body is the first place a leak could show up.
    expect(badLogin.statusCode).not.toBe(200);
    // JellyfinError never carries the full URL it was constructed from (see errors.ts) —
    // only `network()`'s underlying `cause.message` reaches the response, and that never
    // includes a scheme, so no full URL (which for the media-proxy routes would carry
    // ApiKey=<token>) is ever echoed back.
    expect(badLogin.body).not.toMatch(/http:\/\//);

    // Confirm playback/progress against the still-unconfigured server takes the
    // not-configured path rather than leaking anything about the attempted URL.
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/progress',
      payload: { itemId: 'track-driftwave-1', positionSeconds: 10 },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.body).not.toMatch(/not-the-fake-upstream/);

    // Same check for the lyrics route specifically — it's a GET, not a POST like the
    // playback reports above, and its own not-configured path is a separate code path
    // worth confirming doesn't leak the attempted URL either.
    const lyricsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks/track-driftwave-1/lyrics',
      cookies: { auralis_session: cookie },
    });
    expect(lyricsResponse.statusCode).toBe(409);
    expect(lyricsResponse.body).not.toMatch(/not-the-fake-upstream/);

    // Same check for the favourite-toggle route — a POST, and the newest not-configured
    // code path in this file, worth confirming independently rather than assuming it
    // shares the others' safety by construction.
    const favoriteResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/items/album-driftwave/favorite',
      cookies: { auralis_session: cookie },
    });
    expect(favoriteResponse.statusCode).toBe(409);
    expect(favoriteResponse.body).not.toMatch(/not-the-fake-upstream/);
  });
});
