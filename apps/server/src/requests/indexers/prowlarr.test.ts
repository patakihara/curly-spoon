import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import { ProviderError, type ProviderFactoryDeps, type ResolvedProviderConfig } from '../types.js';
import { createProwlarrIndexer } from './prowlarr.js';

/** Type the mock the same way the provider sees it, so `.mock.calls[n]` is a real tuple. */
function fakeFetch(impl: FetchLike): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(impl) as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function config(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    id: 'prowlarr',
    kind: 'indexer',
    enabled: true,
    baseUrl: 'http://prowlarr.test:9696',
    options: {},
    secret: 'test-api-key',
    ...overrides,
  };
}

function makeProvider(fetchFn: FetchLike, overrides: Partial<ResolvedProviderConfig> = {}) {
  const deps: ProviderFactoryDeps = { config: config(overrides), fetch: fetchFn };
  return createProwlarrIndexer(deps);
}

async function expectKind(promise: Promise<unknown>, kind: string): Promise<void> {
  await expect(promise).rejects.toThrow();
  try {
    await promise;
    throw new Error('expected promise to reject');
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe(kind);
  }
}

const sampleReleases = [
  {
    guid: 'guid-1',
    title: 'The Great Book [M4B]',
    indexer: 'AudioBook Bay',
    size: 500_000_000,
    seeders: 12,
    leechers: 1,
    publishDate: '2026-01-01T00:00:00Z',
    downloadUrl: 'http://prowlarr.test:9696/download/1',
    magnetUrl: 'magnet:?xt=urn:btih:aaaa',
    protocol: 'torrent',
    categories: [{ id: 3030, name: 'Audio/Audiobook' }],
  },
  {
    guid: 'guid-2',
    title: 'Another Book [MP3]',
    indexer: 'MyAnonaMouse',
    size: 300_000_000,
    seeders: 40,
    leechers: 2,
    publishDate: '2026-02-01T00:00:00Z',
    downloadUrl: 'http://prowlarr.test:9696/download/2',
    magnetUrl: null,
    protocol: 'torrent',
    categories: [{ id: 7020, name: 'Books/EBook' }],
  },
  {
    guid: 'guid-3-usenet',
    title: 'Usenet Only Book',
    indexer: 'SomeUsenetIndexer',
    size: 200_000_000,
    seeders: 0,
    leechers: 0,
    publishDate: '2026-01-15T00:00:00Z',
    downloadUrl: 'http://prowlarr.test:9696/download/3',
    magnetUrl: null,
    protocol: 'usenet',
    categories: [],
  },
  {
    guid: 'guid-4-no-link',
    title: 'Nothing To Grab',
    indexer: 'AudioBook Bay',
    size: 100_000_000,
    seeders: 5,
    leechers: 0,
    publishDate: '2026-01-10T00:00:00Z',
    downloadUrl: null,
    magnetUrl: null,
    protocol: 'torrent',
    categories: [],
  },
];

describe('createProwlarrIndexer.search', () => {
  it('returns normalised releases from a realistic Prowlarr array', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(sampleReleases));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'The Great Book' });

    const first = results.find((r) => r.guid === 'guid-1');
    expect(first).toBeDefined();
    expect(first).toMatchObject({
      indexerId: 'prowlarr',
      sourceName: 'AudioBook Bay',
      title: 'The Great Book [M4B]',
      sizeBytes: 500_000_000,
      seeders: 12,
      leechers: 1,
      downloadUrl: 'http://prowlarr.test:9696/download/1',
      magnetUri: 'magnet:?xt=urn:btih:aaaa',
      categories: ['Audio/Audiobook'],
      format: 'm4b',
    });
    expect(first?.publishedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('sends the API key in the X-Api-Key header, never in the URL', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn);

    await provider.search({ term: 'anything' });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect((url as string).toLowerCase()).not.toContain('apikey');
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('test-api-key');
  });

  it('combines term and author into the query, URL-encoded', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn);

    await provider.search({ term: 'Dune', author: 'Frank Herbert' });

    const [url] = fetchFn.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('query')).toBe('Dune Frank Herbert');
  });

  it('sends the default categories when none are configured', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn);

    await provider.search({ term: 'anything' });

    const [url] = fetchFn.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.searchParams.getAll('categories')).toEqual(['3030', '7020']);
  });

  it('sends configured categories when provided', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn, { options: { categories: [1000, 2000] } });

    await provider.search({ term: 'anything' });

    const [url] = fetchFn.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.searchParams.getAll('categories')).toEqual(['1000', '2000']);
  });

  it('drops usenet results, which no download client here can fulfil', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(sampleReleases));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'anything' });

    expect(results.find((r) => r.guid === 'guid-3-usenet')).toBeUndefined();
  });

  it('drops results that have neither a download URL nor a magnet', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(sampleReleases));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'anything' });

    expect(results.find((r) => r.guid === 'guid-4-no-link')).toBeUndefined();
  });

  it('turns an unparseable publishDate into null, not NaN', async () => {
    const fetchFn = fakeFetch(async () =>
      jsonResponse([
        {
          guid: 'guid-bad-date',
          title: 'Bad Date Book',
          indexer: 'AudioBook Bay',
          size: 100,
          seeders: 1,
          leechers: 0,
          publishDate: 'not-a-date',
          downloadUrl: 'http://prowlarr.test:9696/download/x',
          protocol: 'torrent',
          categories: [],
        },
      ]),
    );
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'anything' });

    expect(results[0]?.publishedAt).toBeNull();
  });

  it('sorts by seeders descending and honours limit', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(sampleReleases));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'anything', limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]?.guid).toBe('guid-2'); // 40 seeders, the highest among linkable results
  });

  it('returns [] for an empty response rather than throwing', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn);

    await expect(provider.search({ term: 'anything' })).resolves.toEqual([]);
  });

  it('maps HTTP 401 to unauthorized', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 401 }));
    const provider = makeProvider(fetchFn);
    await expectKind(provider.search({ term: 'anything' }), 'unauthorized');
  });

  it('maps HTTP 404 to not_found', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 404 }));
    const provider = makeProvider(fetchFn);
    await expectKind(provider.search({ term: 'anything' }), 'not_found');
  });

  it('maps HTTP 500 to rejected', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 500 }));
    const provider = makeProvider(fetchFn);
    await expectKind(provider.search({ term: 'anything' }), 'rejected');
  });

  it('maps a rejected fetch to unreachable', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = makeProvider(fetchFn);
    await expectKind(provider.search({ term: 'anything' }), 'unreachable');
  });

  it('maps malformed JSON to bad_response', async () => {
    const fetchFn = fakeFetch(
      async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const provider = makeProvider(fetchFn);
    await expectKind(provider.search({ term: 'anything' }), 'bad_response');
  });

  it('throws unauthorized without calling fetch when the API key is missing', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn, { secret: null });

    await expectKind(provider.search({ term: 'anything' }), 'unauthorized');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws unauthorized without calling fetch when the base URL is missing', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn, { baseUrl: null });

    await expectKind(provider.search({ term: 'anything' }), 'unauthorized');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('forwards the AbortSignal to fetch', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse([]));
    const provider = makeProvider(fetchFn);
    const controller = new AbortController();

    await provider.search({ term: 'anything' }, controller.signal);

    const [, init] = fetchFn.mock.calls[0]!;
    expect(init?.signal).toBe(controller.signal);
  });
});

describe('createProwlarrIndexer.testConnection', () => {
  it('resolves on HTTP 200', async () => {
    const fetchFn = fakeFetch(async () => new Response(null, { status: 200 }));
    const provider = makeProvider(fetchFn);

    await expect(provider.testConnection()).resolves.toBeUndefined();
    const [url] = fetchFn.mock.calls[0]!;
    expect(url as string).toContain('/api/v1/system/status');
  });

  it('throws unauthorized on HTTP 401', async () => {
    const fetchFn = fakeFetch(async () => new Response(null, { status: 401 }));
    const provider = makeProvider(fetchFn);

    await expectKind(provider.testConnection(), 'unauthorized');
  });
});
