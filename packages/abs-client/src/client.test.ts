import { describe, expect, it, vi } from 'vitest';
import { AbsClient } from './client.js';
import { type AbsError } from './errors.js';
import type { FetchLike } from './http.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A router-shaped fake so each test only states the routes it cares about. */
function router(routes: Record<string, (req: { url: URL; init?: RequestInit }) => Response>): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`no fake route for ${key}`);
    return handler({ url, init });
  };
}

const minifiedBookItem = {
  id: 'item-1',
  libraryId: 'lib-1',
  mediaType: 'book',
  addedAt: 1000,
  media: {
    metadata: { title: 'Dune', authorName: 'Frank Herbert', narratorName: 'Simon Vance' },
    coverPath: '/covers/item-1.jpg',
    duration: 76000,
    numTracks: 20,
  },
};

const expandedBookItem = {
  ...minifiedBookItem,
  media: {
    ...minifiedBookItem.media,
    tracks: [{ index: 0, startOffset: 0, duration: 3800, contentUrl: '/audio/1' }],
    chapters: [{ id: 1, start: 0, end: 3800, title: 'Part One' }],
  },
};

function makeClient(fetchFn: FetchLike, token = 'tok'): AbsClient {
  return new AbsClient({ baseUrl: 'http://abs.local', fetch: fetchFn, token, retryBaseDelayMs: 1 });
}

describe('AbsClient.probe', () => {
  it('reports reachability and version from an unauthenticated status check', async () => {
    const fetchFn = router({
      'GET /status': () => json({ isInit: true, version: '2.10.0' }),
    });
    const client = makeClient(fetchFn, undefined);
    const result = await client.probe();
    expect(result).toEqual({ reachable: true, isInit: true, serverVersion: '2.10.0' });
  });

  it('surfaces a network AbsError when the server cannot be reached', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('ENOTFOUND');
    };
    const client = new AbsClient({ baseUrl: 'http://nowhere.invalid', fetch: fetchFn, maxRetries: 0 });
    const err = await client.probe().catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('network');
  });
});

describe('AbsClient.login', () => {
  it('normalises a successful login into a token and user profile', async () => {
    const fetchFn = router({
      'POST /login': () =>
        json({
          user: { id: 'user-1', username: 'kara', token: 'fresh-token', mediaProgress: [], bookmarks: [] },
          userDefaultLibraryId: 'lib-1',
        }),
    });
    const client = makeClient(fetchFn, undefined);

    const result = await client.login('kara', 'hunter2');
    expect(result.token).toBe('fresh-token');
    expect(result.user.username).toBe('kara');
    expect(result.defaultLibraryId).toBe('lib-1');
  });

  it('maps wrong credentials (401) to an auth AbsError', async () => {
    const fetchFn = router({ 'POST /login': () => new Response('bad creds', { status: 401 }) });
    const client = makeClient(fetchFn, undefined);

    const err = await client.login('kara', 'wrong').catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('auth');
  });

  it('never retries a failed login', async () => {
    const fetchFn = vi.fn(async () => new Response('down', { status: 503 })) as unknown as FetchLike;
    const client = new AbsClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });
    await client.login('kara', 'hunter2').catch(() => undefined);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('AbsClient.getLibraries', () => {
  it('normalises the libraries list', async () => {
    const fetchFn = router({
      'GET /api/libraries': () =>
        json({ libraries: [{ id: 'lib-1', name: 'Audiobooks', mediaType: 'book' }] }),
    });
    const client = makeClient(fetchFn);
    const libs = await client.getLibraries();
    expect(libs).toEqual([{ id: 'lib-1', name: 'Audiobooks', mediaType: 'book', icon: null }]);
  });

  it('maps a missing/expired token (401) to an auth AbsError', async () => {
    const fetchFn = router({ 'GET /api/libraries': () => new Response('nope', { status: 401 }) });
    const client = makeClient(fetchFn, 'expired');
    const err = await client.getLibraries().catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('auth');
  });

  it('maps a malformed payload to a schema_mismatch AbsError', async () => {
    const fetchFn = router({ 'GET /api/libraries': () => json({ oops: true }) });
    const client = makeClient(fetchFn);
    const err = await client.getLibraries().catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('schema_mismatch');
  });
});

describe('AbsClient.getLibraryItems', () => {
  it('paginates and normalises minified items, passing query params through', async () => {
    let seenQuery: URLSearchParams | undefined;
    const fetchFn = router({
      'GET /api/libraries/lib-1/items': ({ url }) => {
        seenQuery = url.searchParams;
        return json({ results: [minifiedBookItem], total: 1, limit: 20, page: 0 });
      },
    });
    const client = makeClient(fetchFn);

    const page = await client.getLibraryItems('lib-1', { limit: 20, page: 0, sort: 'addedAt', desc: true });

    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.media.kind).toBe('book');
    expect(seenQuery?.get('limit')).toBe('20');
    expect(seenQuery?.get('sort')).toBe('addedAt');
    expect(seenQuery?.get('desc')).toBe('1');
  });

  it('normalises expanded items with tracks and chapters populated', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/items': () =>
        json({ results: [expandedBookItem], total: 1 }),
    });
    const client = makeClient(fetchFn);

    const page = await client.getLibraryItems('lib-1', { minified: false });
    const media = page.items[0]?.media;
    if (media?.kind !== 'book') throw new Error('expected book');
    expect(media.tracks).toHaveLength(1);
    expect(media.chapters).toHaveLength(1);
  });

  it('retries once on a 502 and then succeeds', async () => {
    let calls = 0;
    const fetchFn: FetchLike = async () => {
      calls += 1;
      if (calls === 1) return new Response('bad gateway', { status: 502 });
      return json({ results: [], total: 0 });
    };
    const client = makeClient(fetchFn);
    const page = await client.getLibraryItems('lib-1');
    expect(page.total).toBe(0);
    expect(calls).toBe(2);
  });
});

describe('AbsClient.getLibraryHome (personalized shelves)', () => {
  it('normalises shelves such as Continue Listening and Recently Added', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/personalized': () =>
        json([
          { id: 'shelf-1', label: 'Continue Listening', type: 'book', entities: [minifiedBookItem] },
          { id: 'shelf-2', label: 'Recently Added', type: 'book', entities: [expandedBookItem] },
        ]),
    });
    const client = makeClient(fetchFn);

    const shelves = await client.getLibraryHome('lib-1');
    expect(shelves).toHaveLength(2);
    expect(shelves[0]?.label).toBe('Continue Listening');
    expect(shelves[0]?.items[0]?.id).toBe('item-1');
  });
});

describe('AbsClient.getLibrarySeries', () => {
  it('normalises series with expanded book membership', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/series': () =>
        json({
          results: [{ id: 'series-1', name: 'Dune', books: [minifiedBookItem] }],
          total: 1,
        }),
    });
    const client = makeClient(fetchFn);
    const { series } = await client.getLibrarySeries('lib-1');
    expect(series[0]?.name).toBe('Dune');
    expect(series[0]?.books).toHaveLength(1);
  });
});

describe('AbsClient.getLibraryCollections / getLibraryPlaylists / getLibraryAuthors / getLibraryFilterData', () => {
  it('normalises collections', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/collections': () =>
        json({ collections: [{ id: 'col-1', name: 'Favourites', books: [minifiedBookItem] }] }),
    });
    const client = makeClient(fetchFn);
    const collections = await client.getLibraryCollections('lib-1');
    expect(collections).toEqual([
      { id: 'col-1', name: 'Favourites', description: null, items: expect.any(Array) },
    ]);
    expect(collections[0]?.items).toHaveLength(1);
  });

  it('normalises playlists', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/playlists': () =>
        json({ playlists: [{ id: 'pl-1', name: 'Road Trip' }] }),
    });
    const client = makeClient(fetchFn);
    const playlists = await client.getLibraryPlaylists('lib-1');
    expect(playlists).toEqual([{ id: 'pl-1', name: 'Road Trip', description: null }]);
  });

  it('normalises authors', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/authors': () =>
        json({ authors: [{ id: 'auth-1', name: 'Frank Herbert', numBooks: 6 }] }),
    });
    const client = makeClient(fetchFn);
    const authors = await client.getLibraryAuthors('lib-1');
    expect(authors[0]).toMatchObject({ id: 'auth-1', name: 'Frank Herbert', numBooks: 6 });
  });

  it('normalises filter data', async () => {
    const fetchFn = router({
      'GET /api/libraries/lib-1/filterdata': () =>
        json({ genres: ['Sci-Fi'], authors: [{ id: 'auth-1', name: 'Frank Herbert' }] }),
    });
    const client = makeClient(fetchFn);
    const filterData = await client.getLibraryFilterData('lib-1');
    expect(filterData.genres).toEqual(['Sci-Fi']);
    expect(filterData.authors).toEqual([{ id: 'auth-1', name: 'Frank Herbert' }]);
    expect(filterData.tags).toEqual([]);
  });
});

describe('AbsClient.searchLibrary', () => {
  it('normalises book/podcast/series/author matches and forwards q/limit', async () => {
    let seenQuery: URLSearchParams | undefined;
    const fetchFn = router({
      'GET /api/libraries/lib-1/search': ({ url }) => {
        seenQuery = url.searchParams;
        return json({ book: [{ libraryItem: minifiedBookItem }] });
      },
    });
    const client = makeClient(fetchFn);

    const results = await client.searchLibrary('lib-1', 'dune', 5);
    expect(results.books).toHaveLength(1);
    expect(seenQuery?.get('q')).toBe('dune');
    expect(seenQuery?.get('limit')).toBe('5');
  });
});

describe('AbsClient.getItem', () => {
  it('fetches and normalises a minified item by default', async () => {
    const fetchFn = router({
      'GET /api/items/item-1': () => json(minifiedBookItem),
    });
    const client = makeClient(fetchFn);
    const item = await client.getItem('item-1');
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.tracks).toBeUndefined();
  });

  it('requests expanded=1&include=progress and normalises tracks/chapters', async () => {
    let seenQuery: URLSearchParams | undefined;
    const fetchFn = router({
      'GET /api/items/item-1': ({ url }) => {
        seenQuery = url.searchParams;
        return json(expandedBookItem);
      },
    });
    const client = makeClient(fetchFn);

    const item = await client.getItem('item-1', { expanded: true, includeProgress: true });
    expect(seenQuery?.get('expanded')).toBe('1');
    expect(seenQuery?.get('include')).toBe('progress');
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.tracks).toHaveLength(1);
  });

  it('maps item-not-found (404) to a not_found AbsError', async () => {
    const fetchFn = router({ 'GET /api/items/ghost': () => new Response('gone', { status: 404 }) });
    const client = makeClient(fetchFn);
    const err = await client.getItem('ghost').catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('not_found');
  });
});

describe('AbsClient.fetchCover / fetchAudioTrack (raw proxy passthrough)', () => {
  it('fetches cover bytes as a raw Response, forwarding size params', async () => {
    let seenQuery: URLSearchParams | undefined;
    const fetchFn = router({
      'GET /api/items/item-1/cover': ({ url }) => {
        seenQuery = url.searchParams;
        return new Response('binarydata', { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      },
    });
    const client = makeClient(fetchFn);

    const response = await client.fetchCover('item-1', { width: 300 });
    expect(response.status).toBe(200);
    expect(seenQuery?.get('width')).toBe('300');
  });

  it('forwards a Range header and returns the 206 response untouched', async () => {
    const fetchFn = router({
      'GET /api/items/item-1/file/file-1': ({ init }) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Range).toBe('bytes=100-199');
        return new Response('partial', {
          status: 206,
          headers: { 'Content-Range': 'bytes 100-199/1000', 'Accept-Ranges': 'bytes' },
        });
      },
    });
    const client = makeClient(fetchFn);

    const response = await client.fetchAudioTrack('item-1', 'file-1', 'bytes=100-199');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 100-199/1000');
  });
});

describe('AbsClient.playItem / playEpisode', () => {
  it('normalises a book playback session', async () => {
    const fetchFn = router({
      'POST /api/items/item-1/play': () =>
        json({
          id: 'sess-1',
          libraryItemId: 'item-1',
          mediaType: 'book',
          duration: 3800,
          audioTracks: [{ index: 0, startOffset: 0, duration: 3800, contentUrl: '/audio/1' }],
        }),
    });
    const client = makeClient(fetchFn);
    const session = await client.playItem('item-1');
    expect(session.id).toBe('sess-1');
    expect(session.audioTracks).toHaveLength(1);
  });

  it('normalises a podcast episode playback session', async () => {
    const fetchFn = router({
      'POST /api/items/item-2/play/ep-1': () =>
        json({
          id: 'sess-2',
          libraryItemId: 'item-2',
          episodeId: 'ep-1',
          mediaType: 'podcast',
          duration: 1800,
          audioTracks: [{ index: 0, startOffset: 0, duration: 1800 }],
        }),
    });
    const client = makeClient(fetchFn);
    const session = await client.playEpisode('item-2', 'ep-1');
    expect(session.episodeId).toBe('ep-1');
  });

  it('never retries a failed play request even on a 5xx', async () => {
    const fetchFn = vi.fn(async () => new Response('down', { status: 503 })) as unknown as FetchLike;
    const client = new AbsClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });
    await client.playItem('item-1').catch(() => undefined);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('AbsClient.syncSession / closeSession', () => {
  it('posts sync data and never retries even on failure', async () => {
    const fetchFn = vi.fn(async () => new Response('down', { status: 503 })) as unknown as FetchLike;
    const client = new AbsClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });
    await client
      .syncSession('sess-1', { currentTime: 100, timeListened: 30, duration: 3800 })
      .catch(() => undefined);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('closes a session successfully', async () => {
    const fetchFn = router({ 'POST /api/session/sess-1/close': () => new Response(null, { status: 200 }) });
    const client = makeClient(fetchFn);
    await expect(client.closeSession('sess-1')).resolves.toBeUndefined();
  });
});

describe('AbsClient.getProgress / updateProgress', () => {
  it('normalises existing progress for a book', async () => {
    const fetchFn = router({
      'GET /api/me/progress/item-1': () =>
        json({
          id: 'prog-1',
          libraryItemId: 'item-1',
          duration: 3800,
          progress: 0.5,
          currentTime: 1900,
          isFinished: false,
        }),
    });
    const client = makeClient(fetchFn);
    const progress = await client.getProgress('item-1');
    expect(progress?.progress).toBe(0.5);
  });

  it('normalises progress for a specific podcast episode', async () => {
    const fetchFn = router({
      'GET /api/me/progress/item-2/ep-1': () =>
        json({
          id: 'prog-2',
          libraryItemId: 'item-2',
          episodeId: 'ep-1',
          duration: 1800,
          progress: 1,
          currentTime: 1800,
          isFinished: true,
        }),
    });
    const client = makeClient(fetchFn);
    const progress = await client.getProgress('item-2', 'ep-1');
    expect(progress?.isFinished).toBe(true);
  });

  it('returns null (not an error) when there is no progress yet', async () => {
    const fetchFn = router({
      'GET /api/me/progress/item-3': () => new Response('none', { status: 404 }),
    });
    const client = makeClient(fetchFn);
    const progress = await client.getProgress('item-3');
    expect(progress).toBeNull();
  });

  it('patches progress and never retries', async () => {
    const fetchFn = vi.fn(async () => new Response('down', { status: 503 })) as unknown as FetchLike;
    const client = new AbsClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });
    await client.updateProgress('item-1', undefined, { currentTime: 100 }).catch(() => undefined);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('AbsClient.getMe / getItemsInProgress', () => {
  it('normalises the current user profile including bookmarks', async () => {
    const fetchFn = router({
      'GET /api/me': () =>
        json({
          id: 'user-1',
          username: 'kara',
          permissions: { download: true },
          mediaProgress: [],
          bookmarks: [{ libraryItemId: 'item-1', title: 'Great bit', time: 120, createdAt: 1 }],
        }),
    });
    const client = makeClient(fetchFn);
    const me = await client.getMe();
    expect(me.username).toBe('kara');
    expect(me.bookmarks).toHaveLength(1);
  });

  it('normalises items in progress', async () => {
    const fetchFn = router({
      'GET /api/me/items-in-progress': () => json({ libraryItems: [minifiedBookItem] }),
    });
    const client = makeClient(fetchFn);
    const items = await client.getItemsInProgress();
    expect(items).toHaveLength(1);
  });
});

describe('AbsClient.bookmarks', () => {
  it('adds, updates and deletes a bookmark', async () => {
    const fetchFn = router({
      'POST /api/me/item/item-1/bookmark': () =>
        json({ libraryItemId: 'item-1', title: 'Great bit', time: 120, createdAt: 1 }),
      'PATCH /api/me/item/item-1/bookmark': () =>
        json({ libraryItemId: 'item-1', title: 'Renamed', time: 120, createdAt: 1 }),
      'DELETE /api/me/item/item-1/bookmark/120': () => new Response(null, { status: 200 }),
    });
    const client = makeClient(fetchFn);

    const created = await client.addBookmark('item-1', 120, 'Great bit');
    expect(created.title).toBe('Great bit');

    const updated = await client.updateBookmark('item-1', 120, 'Renamed');
    expect(updated.title).toBe('Renamed');

    await expect(client.deleteBookmark('item-1', 120)).resolves.toBeUndefined();
  });
});

describe('AbsClient.withToken', () => {
  it('returns a new client that sends the new token, leaving the original untouched', async () => {
    const seenTokens: (string | null)[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      seenTokens.push(headers?.Authorization ?? null);
      return json({ libraries: [] });
    };
    const original = new AbsClient({ baseUrl: 'http://abs.local', fetch: fetchFn, token: 'old' });
    const rebound = original.withToken('new');

    await original.getLibraries();
    await rebound.getLibraries();

    expect(seenTokens).toEqual(['Bearer old', 'Bearer new']);
  });
});
