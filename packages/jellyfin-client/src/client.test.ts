import { describe, expect, it } from 'vitest';
import { JellyfinClient, secondsToTicks } from './client.js';
import type { JellyfinError } from './errors.js';
import type { FetchLike } from './http.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Jellyfin's real `PlaystateController` returns `NoContent()` on every successful
 * playback report — 204, empty body — verified against `Jellyfin.Api/Controllers/
 * PlaystateController.cs`. */
function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** A router-shaped fake so each test only states the routes it cares about. */
function router(
  routes: Record<string, (req: { url: URL; init?: RequestInit }) => Response>,
): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`no fake route for ${key}`);
    return handler({ url, init });
  };
}

const device = { client: 'Auralis', device: 'Test', deviceId: 'device-1', version: '0.1.0' };

function makeClient(fetchFn: FetchLike, token = 'tok'): JellyfinClient {
  return new JellyfinClient({
    baseUrl: 'http://jellyfin.local',
    fetch: fetchFn,
    device,
    token,
    retryBaseDelayMs: 1,
  });
}

const artistItem = {
  Id: 'artist-1',
  Name: 'Boards of Canada',
  Type: 'MusicArtist',
  Overview: 'Scottish electronic duo',
  ImageTags: { Primary: 'tag-artist' },
  ChildCount: 3,
};

const albumItem = {
  Id: 'album-1',
  Name: 'Music Has the Right to Children',
  Type: 'MusicAlbum',
  ProductionYear: 1998,
  AlbumArtists: [{ Id: 'artist-1', Name: 'Boards of Canada' }],
  ImageTags: { Primary: 'tag-album' },
  ChildCount: 17,
};

const trackItem = {
  Id: 'track-1',
  Name: 'Roygbiv',
  Type: 'Audio',
  Album: 'Music Has the Right to Children',
  AlbumId: 'album-1',
  Artists: ['Boards of Canada'],
  IndexNumber: 7,
  RunTimeTicks: 20_000_000,
};

describe('JellyfinClient.login', () => {
  it('normalises a successful login into a token and user profile, sending the pre-auth header', async () => {
    const fetchFn = router({
      'POST /Users/AuthenticateByName': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(
          'MediaBrowser Client="Auralis", Device="Test", DeviceId="device-1", Version="0.1.0"',
        );
        expect(JSON.parse(init?.body as string)).toEqual({
          Username: 'kara',
          Pw: 'hunter2',
        });
        return json({
          User: { Id: 'user-1', Name: 'kara', ServerId: 'server-1' },
          AccessToken: 'fresh-token',
          ServerId: 'server-1',
        });
      },
    });
    const client = new JellyfinClient({
      baseUrl: 'http://jellyfin.local',
      fetch: fetchFn,
      device,
    });

    const result = await client.login('kara', 'hunter2');

    expect(result).toEqual({
      token: 'fresh-token',
      serverId: 'server-1',
      user: { id: 'user-1', name: 'kara', serverId: 'server-1' },
    });
  });

  it('surfaces an auth JellyfinError on bad credentials', async () => {
    const fetchFn = router({
      'POST /Users/AuthenticateByName': () => new Response('nope', { status: 401 }),
    });
    const client = new JellyfinClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const err = await client.login('kara', 'wrong').catch((e: unknown) => e);
    expect((err as JellyfinError).code).toBe('auth');
  });
});

describe('JellyfinClient.getArtists', () => {
  it('queries /Items scoped to MusicArtist and normalises the page', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('includeItemTypes')).toBe('MusicArtist');
        expect(url.searchParams.get('recursive')).toBe('true');
        return json({ Items: [artistItem], TotalRecordCount: 1, StartIndex: 0 });
      },
    });
    const client = makeClient(fetchFn);

    const page = await client.getArtists();

    expect(page.total).toBe(1);
    expect(page.startIndex).toBe(0);
    expect(page.items).toEqual([
      {
        id: 'artist-1',
        name: 'Boards of Canada',
        overview: 'Scottish electronic duo',
        imageTag: 'tag-artist',
        albumCount: 3,
        favorite: false,
        playCount: 0,
        lastPlayedAt: null,
        musicBrainzArtistId: null,
      },
    ]);
  });

  it('passes pagination and sort options through as query params', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('startIndex')).toBe('20');
        expect(url.searchParams.get('limit')).toBe('10');
        expect(url.searchParams.get('sortBy')).toBe('SortName');
        expect(url.searchParams.get('sortOrder')).toBe('Descending');
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 20 });
      },
    });
    const client = makeClient(fetchFn);

    await client.getArtists({
      startIndex: 20,
      limit: 10,
      sortBy: 'SortName',
      sortOrder: 'Descending',
    });
  });

  it('sends filters=IsFavorite when favoritesOnly is set, and omits it otherwise', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('filters')).toBe('IsFavorite');
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      },
    });
    const client = makeClient(fetchFn);

    await client.getArtists({ favoritesOnly: true });

    const fetchFnNoFilter = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.has('filters')).toBe(false);
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      },
    });
    await makeClient(fetchFnNoFilter).getArtists();
  });

  it('joins multiple ids with a comma for the ids filter, and omits it when empty', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('ids')).toBe('artist-1,artist-2');
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      },
    });
    await makeClient(fetchFn).getArtists({ ids: ['artist-1', 'artist-2'] });

    const fetchFnNoIds = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.has('ids')).toBe(false);
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      },
    });
    await makeClient(fetchFnNoIds).getArtists({ ids: [] });
  });
});

describe('JellyfinClient.getAlbums', () => {
  it('queries /Items scoped to MusicAlbum, filtering by albumArtistIds when given an artist', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('includeItemTypes')).toBe('MusicAlbum');
        expect(url.searchParams.get('albumArtistIds')).toBe('artist-1');
        return json({ Items: [albumItem], TotalRecordCount: 1, StartIndex: 0 });
      },
    });
    const client = makeClient(fetchFn);

    const page = await client.getAlbums({ artistId: 'artist-1' });

    expect(page.items[0]?.artistName).toBe('Boards of Canada');
  });

  it('omits albumArtistIds when no artist is given', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.has('albumArtistIds')).toBe(false);
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      },
    });
    const client = makeClient(fetchFn);

    await client.getAlbums();
  });
});

describe('JellyfinClient.getTracks', () => {
  it('queries /Items scoped to Audio, filtering by albumIds when given an album', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('includeItemTypes')).toBe('Audio');
        expect(url.searchParams.get('albumIds')).toBe('album-1');
        return json({ Items: [trackItem], TotalRecordCount: 1, StartIndex: 0 });
      },
    });
    const client = makeClient(fetchFn);

    const page = await client.getTracks({ albumId: 'album-1' });

    expect(page.items[0]?.durationSeconds).toBe(2);
  });
});

describe('JellyfinClient.getPlaylists', () => {
  it('queries /Items scoped to Playlist', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('includeItemTypes')).toBe('Playlist');
        return json({
          Items: [{ Id: 'pl-1', Name: 'Roadtrip', ChildCount: 12, ImageTags: { Primary: 't' } }],
          TotalRecordCount: 1,
          StartIndex: 0,
        });
      },
    });
    const client = makeClient(fetchFn);

    const page = await client.getPlaylists();

    expect(page.items[0]).toEqual({
      id: 'pl-1',
      name: 'Roadtrip',
      imageTag: 't',
      trackCount: 12,
    });
  });
});

describe('JellyfinClient.getLibraries', () => {
  it('GETs /Library/MediaFolders with the auth header and normalises each folder', async () => {
    const fetchFn = router({
      'GET /Library/MediaFolders': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        return json({
          Items: [
            { Id: 'lib-music', Name: 'Music', CollectionType: 'music' },
            { Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies' },
          ],
          TotalRecordCount: 2,
          StartIndex: 0,
        });
      },
    });
    const client = makeClient(fetchFn);

    const libraries = await client.getLibraries();

    expect(libraries).toEqual([
      { id: 'lib-music', name: 'Music', collectionType: 'music' },
      { id: 'lib-movies', name: 'Movies', collectionType: 'movies' },
    ]);
  });

  it('defaults a missing CollectionType to null rather than dropping the folder', async () => {
    const fetchFn = router({
      'GET /Library/MediaFolders': () =>
        json({ Items: [{ Id: 'lib-1', Name: 'Odds and ends' }], TotalRecordCount: 1 }),
    });
    const client = makeClient(fetchFn);

    const libraries = await client.getLibraries();

    expect(libraries[0]?.collectionType).toBeNull();
  });

  it('surfaces an upstream 403 as a typed forbidden JellyfinError — the expected outcome for a non-admin account', async () => {
    const fetchFn = router({
      'GET /Library/MediaFolders': () => new Response(null, { status: 403 }),
    });
    const client = makeClient(fetchFn);

    const err = await client.getLibraries().catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('forbidden');
  });
});

describe('JellyfinClient.refreshItem', () => {
  it('POSTs /Items/:itemId/Refresh with the auth header and no body, resolving on 204', async () => {
    const fetchFn = router({
      'POST /Items/lib-music/Refresh': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        expect(init?.body).toBeUndefined();
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.refreshItem('lib-music')).resolves.toBeUndefined();
  });

  it('surfaces an upstream 5xx as a typed JellyfinError whose message never carries the token', async () => {
    const fetchFn = router({
      'POST /Items/lib-music/Refresh': () =>
        new Response('server exploded, ApiKey=tok-should-not-leak', { status: 500 }),
    });
    const client = makeClient(fetchFn, 'super-secret-token');

    const err = await client.refreshItem('lib-music').catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('upstream_error');
    expect((err as JellyfinError).message).not.toContain('super-secret-token');
  });

  it('surfaces an upstream 403 as a typed forbidden JellyfinError — the expected outcome for a non-admin account', async () => {
    const fetchFn = router({
      'POST /Items/lib-music/Refresh': () => new Response(null, { status: 403 }),
    });
    const client = makeClient(fetchFn);

    const err = await client.refreshItem('lib-music').catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('forbidden');
  });

  it('404s for an unknown item id', async () => {
    const fetchFn = router({
      'POST /Items/missing/Refresh': () => new Response(null, { status: 404 }),
    });
    const client = makeClient(fetchFn);

    const err = await client.refreshItem('missing').catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('not_found');
  });
});

describe('JellyfinClient.getPlaylistItems', () => {
  it('GETs /Playlists/:id/Items and normalises each row with its playlistItemId, in response order', async () => {
    const fetchFn = router({
      'GET /Playlists/pl-1/Items': ({ url }) => {
        expect(url.searchParams.get('fields')).toBe('Genres');
        return json({
          Items: [
            { ...trackItem, Id: 'track-2', Name: 'Second', PlaylistItemId: 'entry-b' },
            { ...trackItem, Id: 'track-1', Name: 'First', PlaylistItemId: 'entry-a' },
          ],
          TotalRecordCount: 2,
          StartIndex: 0,
        });
      },
    });
    const client = makeClient(fetchFn);

    const page = await client.getPlaylistItems('pl-1');

    expect(page.items.map((i) => [i.playlistItemId, i.track.id])).toEqual([
      ['entry-b', 'track-2'],
      ['entry-a', 'track-1'],
    ]);
  });

  it('falls back to the track id when PlaylistItemId is absent, rather than dropping the row', async () => {
    const fetchFn = router({
      'GET /Playlists/pl-1/Items': () =>
        json({ Items: [trackItem], TotalRecordCount: 1, StartIndex: 0 }),
    });
    const client = makeClient(fetchFn);

    const page = await client.getPlaylistItems('pl-1');

    expect(page.items[0]?.playlistItemId).toBe('track-1');
  });
});

describe('JellyfinClient.createPlaylist / addToPlaylist / removeFromPlaylist', () => {
  it('POSTs /Playlists with Name, seed Ids and MediaType Audio, returning the new id', async () => {
    const fetchFn = router({
      'POST /Playlists': ({ init }) => {
        expect(JSON.parse(init?.body as string)).toEqual({
          Name: 'Roadtrip',
          Ids: ['track-1'],
          MediaType: 'Audio',
        });
        return json({ Id: 'pl-new' });
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.createPlaylist('Roadtrip', ['track-1'])).resolves.toBe('pl-new');
  });

  it('POSTs /Playlists/:id/Items with a comma-delimited ids query, no body', async () => {
    const fetchFn = router({
      'POST /Playlists/pl-1/Items': ({ url, init }) => {
        expect(url.searchParams.get('ids')).toBe('track-1,track-2');
        expect(init?.body).toBeUndefined();
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.addToPlaylist('pl-1', ['track-1', 'track-2'])).resolves.toBeUndefined();
  });

  it('DELETEs /Playlists/:id/Items with entryIds — the playlist-entry ids, not track ids', async () => {
    const fetchFn = router({
      'DELETE /Playlists/pl-1/Items': ({ url }) => {
        expect(url.searchParams.get('entryIds')).toBe('entry-a,entry-b');
        expect(url.searchParams.has('ids')).toBe(false);
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await expect(
      client.removeFromPlaylist('pl-1', ['entry-a', 'entry-b']),
    ).resolves.toBeUndefined();
  });

  it('surfaces an upstream 5xx from createPlaylist as a typed JellyfinError whose message never carries the token', async () => {
    const fetchFn = router({
      'POST /Playlists': () =>
        new Response('server exploded, ApiKey=tok-should-not-leak', { status: 500 }),
    });
    const client = makeClient(fetchFn, 'super-secret-token');

    const err = await client.createPlaylist('Roadtrip').catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('upstream_error');
    expect((err as JellyfinError).message).not.toContain('super-secret-token');
  });
});

describe('JellyfinClient.search', () => {
  it('queries /Items with a searchTerm and splits results by item type', async () => {
    const fetchFn = router({
      'GET /Items': ({ url }) => {
        expect(url.searchParams.get('searchTerm')).toBe('boards');
        expect(url.searchParams.get('includeItemTypes')).toBe('MusicArtist,MusicAlbum,Audio');
        expect(url.searchParams.get('recursive')).toBe('true');
        return json({
          Items: [artistItem, albumItem, trackItem],
          TotalRecordCount: 3,
          StartIndex: 0,
        });
      },
    });
    const client = makeClient(fetchFn);

    const results = await client.search('boards');

    expect(results.artists).toHaveLength(1);
    expect(results.albums).toHaveLength(1);
    expect(results.tracks).toHaveLength(1);
    expect(results.artists[0]?.id).toBe('artist-1');
  });

  it('drops any item whose Type is neither MusicArtist, MusicAlbum nor Audio, rather than mis-bucketing it', async () => {
    const fetchFn = router({
      'GET /Items': () =>
        json({
          Items: [{ Id: 'movie-1', Name: 'Unrelated Movie', Type: 'Movie' }],
          TotalRecordCount: 1,
          StartIndex: 0,
        }),
    });
    const client = makeClient(fetchFn);

    const results = await client.search('anything');

    expect(results.artists).toEqual([]);
    expect(results.albums).toEqual([]);
    expect(results.tracks).toEqual([]);
  });
});

describe('JellyfinClient.getLyrics', () => {
  it('GETs /Audio/:itemId/Lyrics with the auth header and normalises a synced, multi-line response', async () => {
    const fetchFn = router({
      'GET /Audio/track-1/Lyrics': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        return json({
          Metadata: { Artist: 'Boards of Canada' },
          Lyrics: [
            { Text: 'First line', Start: 0 },
            { Text: 'Second line', Start: 32_500_000 }, // 3.25s
          ],
        });
      },
    });
    const client = makeClient(fetchFn);

    const lyrics = await client.getLyrics('track-1');

    expect(lyrics).toEqual({
      lines: [
        { text: 'First line', startSeconds: 0 },
        { text: 'Second line', startSeconds: 3.25 },
      ],
      synced: true,
    });
  });

  it('resolves to null — not an error — when Jellyfin has no lyrics for this track', async () => {
    const fetchFn = router({
      'GET /Audio/track-no-lyrics/Lyrics': () => new Response(null, { status: 404 }),
    });
    const client = makeClient(fetchFn);

    await expect(client.getLyrics('track-no-lyrics')).resolves.toBeNull();
  });

  it('surfaces a schema_mismatch JellyfinError for an unparseable response', async () => {
    const fetchFn = router({
      'GET /Audio/track-bad/Lyrics': () => json({ Metadata: {} /* missing required Lyrics */ }),
    });
    const client = makeClient(fetchFn);

    const err = await client.getLyrics('track-bad').catch((e: unknown) => e);
    expect((err as JellyfinError).code).toBe('schema_mismatch');
  });

  it('surfaces an upstream 5xx as a typed JellyfinError whose message never carries the token', async () => {
    const fetchFn = router({
      'GET /Audio/track-1/Lyrics': () =>
        new Response('server exploded, ApiKey=tok-should-not-leak', { status: 500 }),
    });
    const client = makeClient(fetchFn, 'super-secret-token');

    const err = await client.getLyrics('track-1').catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('upstream_error');
    expect((err as JellyfinError).message).not.toContain('super-secret-token');
  });
});

describe('JellyfinClient.markFavorite / unmarkFavorite', () => {
  it('POSTs /UserFavoriteItems/{itemId} with the MediaBrowser auth header, no explicit userId', async () => {
    const fetchFn = router({
      'POST /UserFavoriteItems/track-1': ({ url, init }) => {
        expect(url.searchParams.has('userId')).toBe(false);
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        return json({ IsFavorite: true });
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.markFavorite('track-1')).resolves.toBe(true);
  });

  it('DELETEs /UserFavoriteItems/{itemId} to unmark a favourite', async () => {
    const fetchFn = router({
      'DELETE /UserFavoriteItems/track-1': () => json({ IsFavorite: false }),
    });
    const client = makeClient(fetchFn);

    await expect(client.unmarkFavorite('track-1')).resolves.toBe(false);
  });

  it('normalises a response missing IsFavorite to a definite false rather than undefined', async () => {
    const fetchFn = router({
      'POST /UserFavoriteItems/track-1': () => json({}),
    });
    const client = makeClient(fetchFn);

    await expect(client.markFavorite('track-1')).resolves.toBe(false);
  });

  it('surfaces an upstream 5xx as a typed JellyfinError whose message never carries the token', async () => {
    const fetchFn = router({
      'POST /UserFavoriteItems/track-1': () =>
        new Response('server exploded, ApiKey=tok-should-not-leak', { status: 500 }),
    });
    const client = makeClient(fetchFn, 'super-secret-token');

    const err = await client.markFavorite('track-1').catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('upstream_error');
    expect((err as JellyfinError).message).not.toContain('super-secret-token');
  });

  it('surfaces an upstream 404 as a typed not_found JellyfinError', async () => {
    const fetchFn = router({
      'DELETE /UserFavoriteItems/missing': () => new Response(null, { status: 404 }),
    });
    const client = makeClient(fetchFn);

    const err = await client.unmarkFavorite('missing').catch((e: unknown) => e);
    expect((err as JellyfinError).code).toBe('not_found');
  });
});

describe('JellyfinClient.streamUrl / imageUrl', () => {
  it('builds a stream URL using the client’s own token', async () => {
    const client = makeClient(router({}), 'my-token');
    expect(client.streamUrl('track-1')).toBe(
      'http://jellyfin.local/Audio/track-1/stream?static=true&ApiKey=my-token',
    );
  });

  it('builds an image URL using the client’s own token', async () => {
    const client = makeClient(router({}), 'my-token');
    expect(client.imageUrl('album-1', { tag: 'tag-album' })).toBe(
      'http://jellyfin.local/Items/album-1/Images/Primary?tag=tag-album&ApiKey=my-token',
    );
  });

  it('throws a clear error rather than building an unusable unauthenticated URL', () => {
    const client = new JellyfinClient({
      baseUrl: 'http://jellyfin.local',
      fetch: router({}),
      device,
    });
    expect(() => client.streamUrl('track-1')).toThrow(/token/i);
  });
});

describe('JellyfinClient.withToken', () => {
  it('returns a new client bound to the token, leaving the original unauthenticated', async () => {
    const fetchFn = router({
      'GET /Items': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="new-token"');
        return json({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
      },
    });
    const original = new JellyfinClient({
      baseUrl: 'http://jellyfin.local',
      fetch: fetchFn,
      device,
    });
    const authed = original.withToken('new-token');

    expect(original.token).toBeUndefined();
    expect(authed.token).toBe('new-token');
    await authed.getArtists();
  });
});

describe('secondsToTicks', () => {
  it('converts whole seconds to .NET ticks (10,000,000 per second)', () => {
    expect(secondsToTicks(1)).toBe(10_000_000);
    expect(secondsToTicks(214)).toBe(2_140_000_000);
  });

  it('rounds a fractional-second position rather than truncating', () => {
    expect(secondsToTicks(125.5)).toBe(1_255_000_000);
    expect(secondsToTicks(0)).toBe(0);
  });
});

describe('JellyfinClient.reportPlaybackStart', () => {
  it('POSTs /Sessions/Playing with the token header and the converted position', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        expect(JSON.parse(init?.body as string)).toEqual({
          ItemId: 'track-1',
          PositionTicks: 0,
          IsPaused: false,
        });
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.reportPlaybackStart('track-1')).resolves.toBeUndefined();
  });

  it('accepts a starting position in seconds, converted to ticks', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing': ({ init }) => {
        expect(JSON.parse(init?.body as string)).toMatchObject({ PositionTicks: 45_000_000 });
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await client.reportPlaybackStart('track-1', 4.5);
  });
});

describe('JellyfinClient.reportPlaybackProgress', () => {
  it('POSTs /Sessions/Playing/Progress with the item id and converted position', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing/Progress': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        expect(JSON.parse(init?.body as string)).toEqual({
          ItemId: 'track-2',
          PositionTicks: 1_255_000_000,
          IsPaused: false,
        });
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.reportPlaybackProgress('track-2', 125.5)).resolves.toBeUndefined();
  });

  it('carries an explicit isPaused flag through to the request body', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing/Progress': ({ init }) => {
        expect(JSON.parse(init?.body as string)).toMatchObject({ IsPaused: true });
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await client.reportPlaybackProgress('track-2', 10, { isPaused: true });
  });
});

describe('JellyfinClient.reportPlaybackStopped', () => {
  it('POSTs /Sessions/Playing/Stopped with the item id and converted position', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing/Stopped': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="tok"');
        expect(JSON.parse(init?.body as string)).toEqual({
          ItemId: 'track-3',
          PositionTicks: 2_140_000_000,
        });
        return noContent();
      },
    });
    const client = makeClient(fetchFn);

    await expect(client.reportPlaybackStopped('track-3', 214)).resolves.toBeUndefined();
  });
});

describe('playback-report error handling', () => {
  it('surfaces an upstream 5xx as a typed JellyfinError whose message never carries the token', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing/Progress': () =>
        new Response('server exploded, ApiKey=tok-should-not-leak', { status: 500 }),
    });
    const client = makeClient(fetchFn, 'super-secret-token');

    const err = await client.reportPlaybackProgress('track-1', 1).catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('upstream_error');
    expect((err as JellyfinError).message).not.toContain('super-secret-token');
  });

  it('surfaces an upstream 401 as a typed auth JellyfinError', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing': () => new Response('nope', { status: 401 }),
    });
    const client = makeClient(fetchFn);

    const err = await client.reportPlaybackStart('track-1').catch((e: unknown) => e);
    expect((err as JellyfinError).code).toBe('auth');
  });

  it('resolves without throwing when Jellyfin returns 204 with an empty body', async () => {
    const fetchFn = router({
      'POST /Sessions/Playing/Stopped': () => noContent(),
    });
    const client = makeClient(fetchFn);

    await expect(client.reportPlaybackStopped('track-1', 1)).resolves.toBeUndefined();
  });
});
