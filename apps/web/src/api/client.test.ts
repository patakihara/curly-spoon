import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client.js';
import { ApiError } from './errors.js';
import type { MusicCandidate, Release } from './types.js';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
}

describe('ApiClient', () => {
  it('builds the request against /api/v1 by default, with credentials included', async () => {
    const fetchFn = fakeFetch(
      () => new Response(JSON.stringify({ configured: false, baseUrl: null }), { status: 200 }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await client.getSetupState();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/setup');
    expect(init?.credentials).toBe('include');
  });

  it('parses a successful JSON response', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(JSON.stringify({ configured: true, baseUrl: 'http://fake.abs.local' }), {
          status: 200,
        }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    const result = await client.getSetupState();
    expect(result).toEqual({ configured: true, baseUrl: 'http://fake.abs.local' });
  });

  it('sends a JSON body and Content-Type for POST requests', async () => {
    const fetchFn = fakeFetch(
      () => new Response(JSON.stringify({ user: { id: 'u1', username: 'kara' } }), { status: 200 }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await client.login('kara', 'hunter2');

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ username: 'kara', password: 'hunter2' });
  });

  it('serialises query parameters, dropping undefined values', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(JSON.stringify({ items: [], total: 0, limit: null, page: null }), {
          status: 200,
        }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await client.getLibraryItems('lib-books', { limit: 20 });

    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/libraries/lib-books/items?limit=20');
  });

  it('throws a typed ApiError with the BFF error code on a non-2xx response', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'unauthenticated', message: 'Sign in required' } }),
          {
            status: 401,
          },
        ),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await expect(client.me()).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
      message: 'Sign in required',
    });
  });

  it('throws a network-origin ApiError when fetch itself rejects', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = new ApiClient({ fetch: fetchFn });

    const error = await client.getSetupState().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
  });

  it('builds cover and audio track URLs without making a request', () => {
    const fetchFn = fakeFetch(() => new Response('', { status: 200 }));
    const client = new ApiClient({ fetch: fetchFn });

    expect(client.coverUrl('item-dune')).toBe('/api/v1/media/item-dune/cover');
    expect(client.coverUrl('item-dune', { width: 400 })).toBe(
      '/api/v1/media/item-dune/cover?width=400',
    );
    expect(client.audioTrackUrl('item-dune', 'file-dune-1')).toBe(
      '/api/v1/media/item-dune/track/file-dune-1',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('resolves to undefined for an empty successful body (e.g. logout)', async () => {
    const fetchFn = fakeFetch(() => new Response('', { status: 200 }));
    const client = new ApiClient({ fetch: fetchFn });
    await expect(client.logout()).resolves.toBeUndefined();
  });

  describe('book requests (Phase 6)', () => {
    it('drops the status filter from the query string when omitted', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ requests: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getRequests();

      expect(fetchFn.mock.calls[0]![0]).toBe('/api/v1/requests');
    });

    it('sends the status filter when given one', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ requests: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getRequests('failed');

      expect(fetchFn.mock.calls[0]![0]).toBe('/api/v1/requests?status=failed');
    });

    it('POSTs a new request with the release attached', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ request: { id: 'req-1' } }), { status: 201 }),
      );
      const client = new ApiClient({ fetch: fetchFn });
      const release: Release = {
        guid: 'g1',
        indexerId: 'prowlarr',
        sourceName: 'AudiobookBay',
        title: 'Dune',
        sizeBytes: 1024,
        seeders: 5,
        leechers: 1,
        publishedAt: null,
        downloadUrl: null,
        magnetUri: 'magnet:?xt=urn:btih:g1',
        categories: [],
        format: 'm4b',
      };

      await client.createRequest({ title: 'Dune', release });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/requests');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({ title: 'Dune' });
    });

    it('POSTs the approve/reject/retry/grab actions to their own sub-paths, with no body', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ request: { id: 'req-1' } }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.approveRequest('req-1');
      await client.rejectRequest('req-1');
      await client.retryRequest('req-1');
      await client.grabRequest('req-1');

      const urls = fetchFn.mock.calls.map((call) => call[0]);
      expect(urls).toEqual([
        '/api/v1/requests/req-1/approve',
        '/api/v1/requests/req-1/reject',
        '/api/v1/requests/req-1/retry',
        '/api/v1/requests/req-1/grab',
      ]);
      for (const call of fetchFn.mock.calls) {
        expect(call[1]?.method).toBe('POST');
        expect(call[1]?.body).toBeUndefined();
      }
    });

    it('DELETEs a request by id', async () => {
      const fetchFn = fakeFetch(() => new Response(null, { status: 204 }));
      const client = new ApiClient({ fetch: fetchFn });

      await client.deleteRequest('req-1');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/requests/req-1');
      expect(init?.method).toBe('DELETE');
    });

    it('sends the search term, author and limit as query parameters', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ releases: [], errors: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.searchRequestReleases({ term: 'dune', author: 'herbert', limit: 10 });

      expect(fetchFn.mock.calls[0]![0]).toBe(
        '/api/v1/requests/search?term=dune&author=herbert&limit=10',
      );
    });
  });

  describe('music requests (Phase 9)', () => {
    it('drops the status filter from the query string when omitted', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ requests: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getMusicRequests();

      expect(fetchFn.mock.calls[0]![0]).toBe('/api/v1/music-requests');
    });

    it('sends the status filter when given one', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ requests: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getMusicRequests('downloading');

      expect(fetchFn.mock.calls[0]![0]).toBe('/api/v1/music-requests?status=downloading');
    });

    it('POSTs a new request with the candidate attached — candidate is never optional here', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ request: { id: 'mreq-1' } }), { status: 201 }),
      );
      const client = new ApiClient({ fetch: fetchFn });
      const candidate: MusicCandidate = {
        guid: 'g1',
        providerId: 'slskd',
        sourceName: 'somepeer',
        title: 'Track One',
        artist: 'Some Artist',
        album: 'Some Album',
        sizeBytes: 4_000_000,
        bitrateKbps: 320,
        format: 'mp3',
      };

      await client.createMusicRequest(candidate);

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/music-requests');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ candidate });
    });

    it('POSTs the approve/reject/retry/grab actions to their own sub-paths, with no body', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ request: { id: 'mreq-1' } }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.approveMusicRequest('mreq-1');
      await client.rejectMusicRequest('mreq-1');
      await client.retryMusicRequest('mreq-1');
      await client.grabMusicRequest('mreq-1');

      const urls = fetchFn.mock.calls.map((call) => call[0]);
      expect(urls).toEqual([
        '/api/v1/music-requests/mreq-1/approve',
        '/api/v1/music-requests/mreq-1/reject',
        '/api/v1/music-requests/mreq-1/retry',
        '/api/v1/music-requests/mreq-1/grab',
      ]);
      for (const call of fetchFn.mock.calls) {
        expect(call[1]?.method).toBe('POST');
        expect(call[1]?.body).toBeUndefined();
      }
    });

    it('DELETEs a request by id', async () => {
      const fetchFn = fakeFetch(() => new Response(null, { status: 204 }));
      const client = new ApiClient({ fetch: fetchFn });

      await client.deleteMusicRequest('mreq-1');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/music-requests/mreq-1');
      expect(init?.method).toBe('DELETE');
    });

    it('sends the search term and limit as query parameters', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ candidates: [], errors: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.searchMusicRequests({ term: 'dune', limit: 10 });

      expect(fetchFn.mock.calls[0]![0]).toBe('/api/v1/music-requests/search?term=dune&limit=10');
    });
  });

  describe('providers (Phase 6)', () => {
    it('sends a PUT with the given body to update a provider', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ provider: { id: 'prowlarr' } }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.updateProvider('prowlarr', { enabled: true, secret: { apiKey: 'k' } });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/providers/prowlarr');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toEqual({ enabled: true, secret: { apiKey: 'k' } });
    });

    it('POSTs to the test sub-path', async () => {
      const fetchFn = fakeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const client = new ApiClient({ fetch: fetchFn });

      await client.testProvider('prowlarr');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/providers/prowlarr/test');
      expect(init?.method).toBe('POST');
    });
  });

  describe('request settings (Phase 6)', () => {
    it('sends a PUT to update request settings', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({ approvalPolicy: 'manual', bookSavePath: '/x', bookCategory: 'books' }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.updateRequestSettings({ bookSavePath: '/downloads/books' });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/settings/requests');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toEqual({ bookSavePath: '/downloads/books' });
    });

    // Phase 9's music-request settings (save path, category) reuse this same PUT rather
    // than a new endpoint — see `MusicRequestSettingsSection.tsx`'s doc comment.
    it('sends only the music fields when that is all that is being updated', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              approvalPolicy: 'auto',
              bookSavePath: '',
              bookCategory: 'auralis-books',
              musicSavePath: 'downloads/music',
              musicCategory: 'auralis-music',
            }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.updateRequestSettings({ musicSavePath: 'downloads/music' });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/settings/requests');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toEqual({ musicSavePath: 'downloads/music' });
    });
  });

  describe('podcast discovery (Phase 8)', () => {
    it('sends the search term as a query parameter', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.searchPodcastDirectory('daily tech');

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/podcasts/search?term=daily+tech');
    });

    it('POSTs the rssFeed to preview a feed', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(JSON.stringify({ preview: { title: 'The Daily Tech Digest' } }), {
            status: 200,
          }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.previewPodcastFeed('https://feeds.fake.abs.local/daily-tech.xml');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/podcasts/feed');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        rssFeed: 'https://feeds.fake.abs.local/daily-tech.xml',
      });
      expect(result.preview.title).toBe('The Daily Tech Digest');
    });

    it('POSTs the subscribe body to create the library item', async () => {
      const body = {
        libraryId: 'lib-podcasts',
        folderId: 'folder-podcasts',
        folderPath: '/data/podcasts',
        rssFeed: 'https://feeds.fake.abs.local/daily-tech.xml',
        title: 'The Daily Tech Digest',
      };
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ item: { id: 'item-podcast-new-1' } }), { status: 201 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.subscribePodcast(body);

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/podcasts');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(body);
      expect(result.item.id).toBe('item-podcast-new-1');
    });
  });

  describe('podcast episode playback (Phase 8 wave C)', () => {
    it('POSTs to /items/:itemId/play/:episodeId to start an episode session', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              session: {
                id: 'sess-1',
                libraryItemId: 'item-dailytech',
                episodeId: 'ep-dailytech-1',
                mediaType: 'podcast',
                displayTitle: 'Pilot',
                duration: 300,
                currentTime: 0,
                audioTracks: [],
                chapters: [],
              },
            }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.playEpisode('item-dailytech', 'ep-dailytech-1');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/items/item-dailytech/play/ep-dailytech-1');
      expect(init?.method).toBe('POST');
      expect(result.session.episodeId).toBe('ep-dailytech-1');
    });

    it('GETs /me/progress for the signed-in user’s progress across every item and episode', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              progress: [
                {
                  id: 'p1',
                  libraryItemId: 'item-dailytech',
                  episodeId: 'ep-dailytech-1',
                  duration: 300,
                  currentTime: 10,
                  progress: 0.03,
                  isFinished: false,
                },
              ],
            }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.getMyProgress();

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/me/progress');
      expect(result.progress).toHaveLength(1);
      expect(result.progress[0]!.episodeId).toBe('ep-dailytech-1');
    });
  });

  describe('Jellyfin music (Phase 9 wave A)', () => {
    it('fetches config from /jellyfin/config', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({ configured: false, baseUrl: null, hasCredentials: false }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.getJellyfinConfig();

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/config');
      expect(result).toEqual({ configured: false, baseUrl: null, hasCredentials: false });
    });

    it('sends baseUrl/username/password to /jellyfin/login when connecting for the first time', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              configured: true,
              baseUrl: 'http://fake.jellyfin.local',
              user: { id: 'jellyfin-user-1', name: 'nova' },
            }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.jellyfinLogin({
        baseUrl: 'http://fake.jellyfin.local',
        username: 'nova',
        password: 'stardust1',
      });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/login');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        baseUrl: 'http://fake.jellyfin.local',
        username: 'nova',
        password: 'stardust1',
      });
      expect(result.user).toEqual({ id: 'jellyfin-user-1', name: 'nova' });
    });

    it('omits baseUrl from the login body when reconnecting with an already-configured server', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              configured: true,
              baseUrl: 'http://fake.jellyfin.local',
              user: { id: 'jellyfin-user-1', name: 'nova' },
            }),
            { status: 200 },
          ),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.jellyfinLogin({ username: 'nova', password: 'stardust1' });

      const [, init] = fetchFn.mock.calls[0]!;
      expect(JSON.parse(String(init?.body))).toEqual({ username: 'nova', password: 'stardust1' });
    });

    it('queries /jellyfin/artists with pagination params', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ items: [], total: 0, startIndex: 0 }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getJellyfinArtists({ startIndex: 40, limit: 20 });

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/artists?startIndex=40&limit=20');
    });

    it('queries /jellyfin/albums scoped to an artistId', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ items: [], total: 0, startIndex: 0 }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getJellyfinAlbums({ artistId: 'artist-nebula' });

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/albums?artistId=artist-nebula');
    });

    it('queries /jellyfin/tracks scoped to an albumId', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ items: [], total: 0, startIndex: 0 }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getJellyfinTracks({ albumId: 'album-driftwave' });

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/tracks?albumId=album-driftwave');
    });

    it('searches /jellyfin/search with the term and an optional limit', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(JSON.stringify({ artists: [], albums: [], tracks: [] }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.searchJellyfin('nebula', 10);

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/search?term=nebula&limit=10');
      expect(result).toEqual({ artists: [], albums: [], tracks: [] });
    });

    it('builds a same-origin artwork URL without making a request', () => {
      const client = new ApiClient({ fetch: fakeFetch(() => new Response('', { status: 200 })) });

      expect(client.jellyfinArtworkUrl('album-driftwave')).toBe(
        '/api/v1/jellyfin/items/album-driftwave/artwork',
      );
    });

    it('queries /jellyfin/artists?favoritesOnly=true, and translates id to the ids query param', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ items: [], total: 0, startIndex: 0 }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await client.getJellyfinArtists({ favoritesOnly: true, id: 'artist-nebula' });

      const [url] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/artists?favoritesOnly=true&ids=artist-nebula');
    });

    it('POSTs /jellyfin/items/:itemId/favorite to mark a favourite', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ favorite: true }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.markJellyfinFavorite('album-driftwave');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/items/album-driftwave/favorite');
      expect(init?.method).toBe('POST');
      expect(result).toEqual({ favorite: true });
    });

    it('DELETEs /jellyfin/items/:itemId/favorite to unmark a favourite', async () => {
      const fetchFn = fakeFetch(
        () => new Response(JSON.stringify({ favorite: false }), { status: 200 }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      const result = await client.unmarkJellyfinFavorite('album-driftwave');

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/items/album-driftwave/favorite');
      expect(init?.method).toBe('DELETE');
      expect(result).toEqual({ favorite: false });
    });
  });

  describe('Jellyfin playback progress reporting', () => {
    it('POSTs itemId/positionSeconds to /jellyfin/playback/start and resolves on a 204', async () => {
      const fetchFn = fakeFetch(() => new Response(null, { status: 204 }));
      const client = new ApiClient({ fetch: fetchFn });

      await expect(
        client.reportJellyfinPlaybackStart('track-driftwave-1', 0),
      ).resolves.toBeUndefined();

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/playback/start');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        itemId: 'track-driftwave-1',
        positionSeconds: 0,
      });
    });

    it('POSTs to /jellyfin/playback/progress, including isPaused when given', async () => {
      const fetchFn = fakeFetch(() => new Response(null, { status: 204 }));
      const client = new ApiClient({ fetch: fetchFn });

      await client.reportJellyfinPlaybackProgress('track-driftwave-1', 45.5, { isPaused: true });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/playback/progress');
      expect(JSON.parse(String(init?.body))).toEqual({
        itemId: 'track-driftwave-1',
        positionSeconds: 45.5,
        isPaused: true,
      });
    });

    it('POSTs itemId/positionSeconds to /jellyfin/playback/stopped', async () => {
      const fetchFn = fakeFetch(() => new Response(null, { status: 204 }));
      const client = new ApiClient({ fetch: fetchFn });

      await client.reportJellyfinPlaybackStopped('track-driftwave-1', 214);

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('/api/v1/jellyfin/playback/stopped');
      expect(JSON.parse(String(init?.body))).toEqual({
        itemId: 'track-driftwave-1',
        positionSeconds: 214,
      });
    });

    it('rejects with a typed ApiError on an upstream failure, not a raw fetch throw', async () => {
      const fetchFn = fakeFetch(
        () =>
          new Response(JSON.stringify({ error: { code: 'jellyfin_unreachable' } }), {
            status: 502,
          }),
      );
      const client = new ApiClient({ fetch: fetchFn });

      await expect(
        client.reportJellyfinPlaybackProgress('track-driftwave-1', 10),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });
});
