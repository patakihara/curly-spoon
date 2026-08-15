import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import {
  FAKE_JELLYFIN_BAD_CREDENTIALS,
  FAKE_JELLYFIN_BASE_URL,
  FAKE_JELLYFIN_CREDENTIALS,
} from '../testSupport/fakes/fakeJellyfin.js';
import { FAKE_NON_ADMIN_CREDENTIALS } from '../testSupport/fakes/fakeAbs.js';
import { setProviderConfig } from '../db/providerConfigRepo.js';
import {
  createFakeSlskdUpstream,
  FAKE_SLSKD_API_KEY,
  FAKE_SLSKD_BASE_URL,
} from '../testSupport/fakes/fakeSlskd.js';
import type { MusicCandidate } from '../requests/types.js';

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
    // 3, not 2: `artist-lumen` (wave 13e-2's `GET /music/recommended` fixture addition,
    // see that artist's own comment in `fakeJellyfin.ts`) is a third fixture artist.
    expect(total).toBe(3);
    expect(items).toHaveLength(3);
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
    expect(total).toBe(3); // see the previous test's comment on `artist-lumen`.
    expect(items).toHaveLength(3);
  });

  // The empty-ids short-circuit is implemented once per route (artists/albums/tracks each
  // parse their own query schema), not shared through one code path — pin albums and
  // tracks too, so a future edit can't silently drop it from one of the three.
  it('ids=,,, on /jellyfin/albums also returns an empty page rather than the unfiltered listing', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/albums?ids=,,,',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 0, startIndex: 0 });
  });

  it('ids=,,, on /jellyfin/tracks also returns an empty page rather than the unfiltered listing', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/tracks?ids=,,,',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 0, startIndex: 0 });
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

describe('playlists', () => {
  it('every playlist route requires authentication', async () => {
    const { app } = buildTestApp();
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/jellyfin/playlists' }),
      app.inject({ method: 'GET', url: '/api/v1/jellyfin/playlists/pl-1/items' }),
      app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/playlists',
        payload: { name: 'Roadtrip' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/playlists/pl-1/items',
        payload: { itemIds: ['track-driftwave-1'] },
      }),
      app.inject({
        method: 'DELETE',
        url: '/api/v1/jellyfin/playlists/pl-1/items?playlistItemIds=entry-1',
      }),
    ]);
    for (const response of responses) expect(response.statusCode).toBe(401);
  });

  it('creates a playlist seeded out of natural id order, and both the listing and the items route reflect it', async () => {
    const { app, cookie } = await jellyfinConnectedApp();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playlists',
      payload: { name: 'Roadtrip', itemIds: ['track-driftwave-2', 'track-driftwave-1'] },
      cookies: { auralis_session: cookie },
    });
    expect(createResponse.statusCode).toBe(201);
    const { id: playlistId } = createResponse.json();
    expect(typeof playlistId).toBe('string');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/playlists',
      cookies: { auralis_session: cookie },
    });
    const listed = listResponse.json().items.find((p: { id: string }) => p.id === playlistId);
    expect(listed).toMatchObject({ name: 'Roadtrip', trackCount: 2 });

    const itemsResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
      cookies: { auralis_session: cookie },
    });
    expect(itemsResponse.statusCode).toBe(200);
    const items = itemsResponse.json().items;
    // Seeded second-then-first: playlist order is preserved, not re-sorted to the tracks'
    // own natural/alphabetical order — the exact bug this wave's spec called out.
    expect(items.map((i: { track: { id: string } }) => i.track.id)).toEqual([
      'track-driftwave-2',
      'track-driftwave-1',
    ]);
    expect(items[0].playlistItemId).not.toBe(items[1].playlistItemId);
  });

  it('appends items to an existing playlist via addToPlaylist', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playlists',
      payload: { name: 'Empty' },
      cookies: { auralis_session: cookie },
    });
    const { id: playlistId } = created.json();

    const addResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
      payload: { itemIds: ['track-hollow-1'] },
      cookies: { auralis_session: cookie },
    });
    expect(addResponse.statusCode).toBe(204);

    const itemsResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
      cookies: { auralis_session: cookie },
    });
    expect(itemsResponse.json().items.map((i: { track: { id: string } }) => i.track.id)).toEqual([
      'track-hollow-1',
    ]);
  });

  it('removes one occurrence of a duplicated track by its playlistItemId, leaving the other in place', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playlists',
      payload: { name: 'Repeats', itemIds: ['track-driftwave-1', 'track-driftwave-1'] },
      cookies: { auralis_session: cookie },
    });
    const { id: playlistId } = created.json();

    const before = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
      cookies: { auralis_session: cookie },
    });
    const entries = before.json().items as Array<{ playlistItemId: string }>;
    expect(entries).toHaveLength(2);
    const [firstEntry, secondEntry] = entries;
    expect(firstEntry?.playlistItemId).not.toBe(secondEntry?.playlistItemId);

    const removeResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items?playlistItemIds=${firstEntry?.playlistItemId}`,
      cookies: { auralis_session: cookie },
    });
    expect(removeResponse.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
      cookies: { auralis_session: cookie },
    });
    const remaining = after.json().items as Array<{ playlistItemId: string }>;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.playlistItemId).toBe(secondEntry?.playlistItemId);
  });

  it('404s on an unknown playlist id', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jellyfin/playlists/does-not-exist/items',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('409s with jellyfin_not_configured when no Jellyfin server has ever been connected', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playlists',
      payload: { name: 'Roadtrip' },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });

  it('rejects an empty playlistItemIds on removal rather than silently no-op-ing', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/jellyfin/playlists/pl-1/items?playlistItemIds=',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
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
  it('checks login, browse, search, lyrics, both media-proxy responses, the three playback reports and playlists', async () => {
    const { app, cookie } = await jellyfinConnectedApp();

    // A real playlist id/entry id to exercise the items/add/remove routes with — created
    // sequentially, ahead of the parallel sweep below, so those routes hit their normal
    // 200/204 path rather than a 404 that would trivially pass the "no token" check without
    // actually exercising the response bodies that matter.
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playlists',
      payload: { name: 'Sweep', itemIds: ['track-driftwave-1'] },
      cookies: { auralis_session: cookie },
    });
    const { id: playlistId } = created.json();
    const items = await app.inject({
      method: 'GET',
      url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
      cookies: { auralis_session: cookie },
    });
    const entryId = items.json().items[0].playlistItemId as string;

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
      app.inject({
        method: 'GET',
        url: '/api/v1/jellyfin/playlists',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/jellyfin/playlists/${playlistId}/items`,
        payload: { itemIds: ['track-driftwave-2'] },
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'DELETE',
        url: `/api/v1/jellyfin/playlists/${playlistId}/items?playlistItemIds=${entryId}`,
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

  it("a music request's Jellyfin rescan (getLibraries + refreshItem, driven through pollDownloads) never leaks the token into GET /music-requests", async () => {
    // Not reachable through any route sweep above — `musicRequestService.ts`'s rescan
    // path runs inside `pollDownloads()`, which (mirroring the book pipeline's own
    // `pollDownloads`) is not itself exposed as a route. Driving it directly through the
    // `app.musicRequests` decorator, then reading the result back over HTTP, is what
    // actually exercises the real `JellyfinClient` against the real fake upstream end to
    // end — the `client.test.ts` unit tests already prove the client itself never embeds
    // the token in an error message; this proves the same holds once a real request row
    // carries that outcome out through the BFF.
    const slskd = createFakeSlskdUpstream();
    const { app, sessionSecret } = buildTestApp({ providerFetch: slskd.fetch });
    const cookie = await loginTestUser(app);
    const jellyfinLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    expect(jellyfinLogin.statusCode).toBe(200);
    setProviderConfig(
      app.db,
      {
        id: 'slskd',
        kind: 'music',
        enabled: true,
        baseUrl: FAKE_SLSKD_BASE_URL,
        options: {},
        secret: FAKE_SLSKD_API_KEY,
      },
      sessionSecret,
    );
    const candidate: MusicCandidate = {
      guid: JSON.stringify({ username: 'peer-a', filename: 'Artist/Album/Track.mp3', size: 4000 }),
      providerId: 'slskd',
      sourceName: 'peer-a',
      title: 'Track',
      artist: 'Artist',
      album: 'Album',
      sizeBytes: 4000,
      bitrateKbps: 320,
      format: 'mp3',
    };

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate },
      cookies: { auralis_session: cookie },
    });
    const requestId = created.json().request.id as string;
    const grabbed = await app.inject({
      method: 'POST',
      url: `/api/v1/music-requests/${requestId}/grab`,
      cookies: { auralis_session: cookie },
    });
    expect(grabbed.json().request.status).toBe('downloading');
    const { username, id } = JSON.parse(grabbed.json().request.downloadHandle as string) as {
      username: string;
      id: string;
    };
    // Moves the fake transfer to slskd's real completed-and-succeeded state string — see
    // `slskd.ts`'s `mapTransferState`, which this fake's field names mirror exactly.
    slskd.setTransferState(username, id, { state: 'Completed, Succeeded' });

    // Drives the rescan directly — `pollDownloads` (like the book pipeline's own) is not
    // itself routed; see this test's own comment above.
    await app.musicRequests.pollDownloads();

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests',
      cookies: { auralis_session: cookie },
    });
    const request = listed.json().requests.find((r: { id: string }) => r.id === requestId) as {
      status: string;
      statusDetail: string | null;
    };
    // Confirms the rescan actually ran and succeeded — not a false-positive sweep over a
    // request that never reached Jellyfin at all, or one whose refresh 404'd against the
    // wrong library id (which `statusDetail` would report instead of `null`) — mirrors
    // this file's "no route leaks the token" sweep's own point of checking a real
    // 200/204 path, not a trivially-passing failure.
    expect(request.status).toBe('importRequested');
    expect(request.statusDetail).toBeNull();

    expect(listed.body).not.toMatch(/fake-jellyfin-token-/);
    for (const value of Object.values(listed.headers)) {
      expect(String(value)).not.toMatch(/fake-jellyfin-token-/);
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

    // Same check for the newest not-configured code path added by this wave: creating a
    // playlist against an account that was never connected.
    const playlistResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playlists',
      payload: { name: 'Roadtrip' },
      cookies: { auralis_session: cookie },
    });
    expect(playlistResponse.statusCode).toBe(409);
    expect(playlistResponse.body).not.toMatch(/not-the-fake-upstream/);
  });
});

describe('GET /api/v1/music/recommended', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/music/recommended' });
    expect(response.statusCode).toBe(401);
  });

  it('409s with jellyfin_not_configured when no Jellyfin server has ever been connected', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music/recommended',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('jellyfin_not_configured');
  });

  it('returns no shelves for a user with no listening history (cold start)', async () => {
    const { app, cookie } = await jellyfinConnectedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music/recommended',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shelves: [] });
  });

  it('returns shelves with real albums and non-empty reasons, and excludes an album the user already plays heavily', async () => {
    const { app, cookie } = await jellyfinConnectedApp();

    // Seed listening history through the real playback-report path (not a fixture
    // default — see fakeJellyfin.ts's `PlayState` comment). Both of Driftwave's tracks
    // get multiple stop reports: `buildMusicProgressSignals` maps *any* nonzero play
    // count to `isFinished: true` (see adaptMusic.ts's own doc comment on why magnitude
    // isn't weighted), so playing one track five times and the other once are meant to
    // produce the same base weight for the album either way — asserted below by the
    // album still being excluded, not by a higher score.
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/jellyfin/playback/stopped',
        cookies: { auralis_session: cookie },
        payload: { itemId: 'track-driftwave-1', positionSeconds: 200 },
      });
    }
    await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/stopped',
      cookies: { auralis_session: cookie },
      payload: { itemId: 'track-driftwave-2', positionSeconds: 190 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.length).toBeGreaterThan(0);

    for (const shelf of shelves) {
      expect(shelf.type).toBe('recommended');
      expect(shelf.items.length).toBeGreaterThanOrEqual(2);
      expect(typeof shelf.reason).toBe('string');
      expect(shelf.reason.length).toBeGreaterThan(0);
      for (const item of shelf.items) {
        expect(typeof item.name).toBe('string');
      }
    }

    // The wiring this test exists to catch, same as the books route's own version of
    // this assertion: a route that built shelves but forgot to exclude known items
    // would still return 200 with plausible-looking carousels.
    const allAlbumIds = shelves.flatMap((s: { items: { id: string }[] }) =>
      s.items.map((i) => i.id),
    );
    expect(allAlbumIds).not.toContain('album-driftwave');

    // The Synthwave genre shelf should surface the two other same-genre albums this
    // fixture exists to provide (see `artist-lumen`'s comment in fakeJellyfin.ts) —
    // Nightglass (same artist as the played album) and Lumenfall (a different artist,
    // proving this is genre-driven, not just "everything by this artist").
    expect(allAlbumIds).toEqual(expect.arrayContaining(['album-nightglass', 'album-lumenfall']));
  });
});
