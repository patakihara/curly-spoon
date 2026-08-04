import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client.js';
import { ApiError } from './errors.js';
import type { Release } from './types.js';

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
});
