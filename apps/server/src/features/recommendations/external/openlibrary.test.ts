import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import { createOpenLibraryProvider } from './openlibrary.js';
import type { RecommendationSeed } from './types.js';

/** Typed the same way the provider sees it, so `.mock.calls[n]` is a real tuple. */
function fakeFetch(impl: FetchLike): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(impl) as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SEED: RecommendationSeed = { label: 'Mara Voss', identifiers: {} };

function realisticResponse() {
  return {
    numFound: 2,
    start: 0,
    docs: [
      {
        key: '/works/OL1111111W',
        title: 'Moonless Tide',
        author_name: ['Mara Voss'],
      },
      {
        key: '/works/OL2222222W',
        title: 'The Glass Orchard',
        author_name: ['Mara Voss', 'Some Illustrator'],
      },
    ],
  };
}

describe('createOpenLibraryProvider', () => {
  it('declares its identity', () => {
    const provider = createOpenLibraryProvider({ fetch: fakeFetch(async () => jsonResponse({})) });
    expect(provider.providerName).toBe('openlibrary');
    expect(provider.medium).toBe('book');
  });

  it('returns candidates namespaced by work key, with the author folded into `authors`', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createOpenLibraryProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toEqual([
      {
        providerName: 'openlibrary',
        providerId: '/works/OL1111111W',
        medium: 'book',
        title: 'Moonless Tide',
        authors: ['Mara Voss'],
        genres: [],
        // Deliberately no `isbn`/`asin` here — see the provider's own header comment
        // on why an Open Library ISBN is never threaded into `identifiers`.
        identifiers: {},
        reason: 'Because you love Mara Voss',
      },
      {
        providerName: 'openlibrary',
        providerId: '/works/OL2222222W',
        medium: 'book',
        title: 'The Glass Orchard',
        authors: ['Mara Voss', 'Some Illustrator'],
        genres: [],
        identifiers: {},
        reason: 'Because you love Mara Voss',
      },
    ]);
  });

  it('sends the author name and no more, URL-encoded, matching the endpoint verified live 2026-08-18', async () => {
    // Verified with a real `curl` against `https://openlibrary.org/search.json?author=…` —
    // unlike ListenBrainz's five mandatory parameters, this endpoint has none: `author`
    // alone returns 200 with real results. Asserted as an exact set anyway (not a subset),
    // on this project's own standing rule that a fixture validates the response and says
    // nothing about the request — the same trap that shipped a dead ListenBrainz provider.
    const fetch = fakeFetch(async () => jsonResponse({ docs: [] }));
    const provider = createOpenLibraryProvider({
      fetch,
      baseUrl: 'https://openlibrary.test',
    });

    await provider.recommend([SEED]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const requested = new URL((fetch.mock.calls[0] as [string])[0]);
    expect(requested.origin + requested.pathname).toBe('https://openlibrary.test/search.json');
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      author: 'Mara Voss',
      fields: 'key,title,author_name',
      limit: '20',
    });
  });

  it('skips a blank-label seed and issues no request for it', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createOpenLibraryProvider({ fetch });

    const candidates = await provider.recommend([{ label: '   ', identifiers: {} }]);

    expect(candidates).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades to no candidates, without throwing, on a network failure', async () => {
    const fetch = fakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const warn = vi.fn();
    const provider = createOpenLibraryProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, on a non-OK response', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ error: 'rate limited' }, 429));
    const warn = vi.fn();
    const provider = createOpenLibraryProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, on an unparseable body', async () => {
    const fetch = fakeFetch(
      async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const warn = vi.fn();
    const provider = createOpenLibraryProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, when the body is valid JSON but violates the schema', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ docs: 'not-an-array' }));
    const warn = vi.fn();
    const provider = createOpenLibraryProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // The exact trap `packages/abs-client` was burned by: a schema that only accepts
  // `undefined` silently rejects a server's literal `null`.
  it('tolerates explicit null fields in a doc, degrading that one doc rather than the whole response', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        docs: [
          { key: null, title: null, author_name: null },
          { key: '/works/OL3333333W', title: 'Real Book', author_name: ['Mara Voss'] },
        ],
      }),
    );
    const provider = createOpenLibraryProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.providerId).toBe('/works/OL3333333W');
  });

  it('drops a doc missing a key or a title — nothing to namespace an id or a card with', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        docs: [
          { key: '/works/OL4444444W', title: undefined, author_name: ['Mara Voss'] },
          { key: undefined, title: 'No Key Here', author_name: ['Mara Voss'] },
          { key: '/works/OL5555555W', title: 'Keeper', author_name: ['Mara Voss'] },
        ],
      }),
    );
    const provider = createOpenLibraryProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toEqual([
      expect.objectContaining({ providerId: '/works/OL5555555W', title: 'Keeper' }),
    ]);
  });

  it('respects the limit parameter', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createOpenLibraryProvider({ fetch });

    const candidates = await provider.recommend([SEED], 1);

    expect(candidates).toHaveLength(1);
  });

  it('caps the number of seeds actually queried, so an unbounded seed list cannot fan out unbounded requests', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ docs: [] }));
    const provider = createOpenLibraryProvider({ fetch });
    const manySeeds: RecommendationSeed[] = Array.from({ length: 10 }, (_, i) => ({
      label: `Author ${i}`,
      identifiers: {},
    }));

    await provider.recommend(manySeeds);

    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('dedupes a work returned for more than one seed', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        docs: [{ key: '/works/OL9999999W', title: 'Shared Work', author_name: ['Two Authors'] }],
      }),
    );
    const provider = createOpenLibraryProvider({ fetch });

    const candidates = await provider.recommend([
      SEED,
      { label: 'Another Author', identifiers: {} },
    ]);

    expect(candidates).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
