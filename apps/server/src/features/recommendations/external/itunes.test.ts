import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import { createItunesProvider } from './itunes.js';
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

const SEED: RecommendationSeed = { label: 'Science', identifiers: {} };

/** Shaped after the real live response captured 2026-08-19 against
 * `https://itunes.apple.com/search?media=podcast&term=science`. */
function realisticResponse() {
  return {
    resultCount: 2,
    results: [
      {
        wrapperType: 'track',
        kind: 'podcast',
        collectionId: 120329020,
        trackId: 120329020,
        collectionName: 'Science Magazine Podcast',
        trackName: 'Science Magazine Podcast',
        artistName: 'Science Magazine',
        feedUrl: 'https://feeds.megaphone.fm/AAAS8717073854',
        primaryGenreName: 'Science',
        genres: ['Science', 'Podcasts', 'News', 'News Commentary'],
      },
      {
        wrapperType: 'track',
        kind: 'podcast',
        collectionId: 284012446,
        trackId: 284012446,
        collectionName: 'Discovery',
        trackName: 'Discovery',
        artistName: 'BBC World Service',
        feedUrl: 'https://podcasts.files.bbci.co.uk/p002w557.rss',
        primaryGenreName: 'Science',
        genres: ['Science', 'Podcasts'],
      },
    ],
  };
}

describe('createItunesProvider', () => {
  it('declares its identity', () => {
    const provider = createItunesProvider({ fetch: fakeFetch(async () => jsonResponse({})) });
    expect(provider.providerName).toBe('itunes');
    expect(provider.medium).toBe('podcast');
  });

  it('returns candidates namespaced by collectionId, with the artist folded into `authors` and never carrying an identifier', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toEqual([
      {
        providerName: 'itunes',
        providerId: '120329020',
        medium: 'podcast',
        title: 'Science Magazine Podcast',
        authors: ['Science Magazine'],
        genres: ['Science', 'Podcasts', 'News', 'News Commentary'],
        // Deliberately no `feedUrl` here — see the provider's own header comment on why an
        // iTunes feed URL is never threaded into `identifiers`.
        identifiers: {},
        reason: 'Because you listen to Science podcasts',
      },
      {
        providerName: 'itunes',
        providerId: '284012446',
        medium: 'podcast',
        title: 'Discovery',
        authors: ['BBC World Service'],
        genres: ['Science', 'Podcasts'],
        identifiers: {},
        reason: 'Because you listen to Science podcasts',
      },
    ]);
  });

  it('sends the genre term as `term` with `media=podcast`, and no other parameter, matching the endpoint verified live 2026-08-19', async () => {
    // Verified with real `curl` calls against `https://itunes.apple.com/search`. `genreId`
    // alone (no `term`) returned `resultCount: 0` live, so it is deliberately never sent —
    // `term=<genre name>` is the only thing shown to actually return results. Asserted as an
    // exact set anyway (not a subset), on this project's own standing rule that a fixture
    // validates the response and says nothing about the request.
    const fetch = fakeFetch(async () => jsonResponse({ results: [] }));
    const provider = createItunesProvider({
      fetch,
      baseUrl: 'https://itunes.test',
    });

    await provider.recommend([SEED]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const requested = new URL((fetch.mock.calls[0] as [string])[0]);
    expect(requested.origin + requested.pathname).toBe('https://itunes.test/search');
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      media: 'podcast',
      term: 'Science',
      limit: '20',
    });
  });

  it('skips a blank-label seed and issues no request for it', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([{ label: '   ', identifiers: {} }]);

    expect(candidates).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades to no candidates, without throwing, on a network failure', async () => {
    const fetch = fakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const warn = vi.fn();
    const provider = createItunesProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, on a non-OK response', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ error: 'rate limited' }, 429));
    const warn = vi.fn();
    const provider = createItunesProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, on an unparseable body', async () => {
    const fetch = fakeFetch(
      async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const warn = vi.fn();
    const provider = createItunesProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, when the body is valid JSON but violates the schema', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ results: 'not-an-array' }));
    const warn = vi.fn();
    const provider = createItunesProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // The exact trap `packages/abs-client` was burned by: a schema that only accepts
  // `undefined` silently rejects a server's literal `null`.
  it('tolerates explicit null fields in a result, degrading that one result rather than the whole response', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        results: [
          {
            collectionId: null,
            trackId: null,
            collectionName: null,
            trackName: null,
            artistName: null,
            genres: null,
            primaryGenreName: null,
          },
          {
            collectionId: 555,
            collectionName: 'Real Show',
            artistName: 'Real Host',
            genres: ['Comedy'],
          },
        ],
      }),
    );
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.providerId).toBe('555');
  });

  it('drops a result missing both collectionId and trackId, or missing a title — nothing to namespace an id or a card with', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        results: [
          { collectionId: 111, collectionName: undefined, trackName: undefined },
          { collectionId: undefined, trackId: undefined, collectionName: 'No Id Here' },
          { collectionId: 222, collectionName: 'Keeper' },
        ],
      }),
    );
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toEqual([expect.objectContaining({ providerId: '222', title: 'Keeper' })]);
  });

  it('falls back to trackId, and to primaryGenreName, when collectionId/genres are absent', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        results: [
          {
            trackId: 999,
            trackName: 'Fallback Show',
            artistName: 'Some Host',
            genres: [],
            primaryGenreName: 'Comedy',
          },
        ],
      }),
    );
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toEqual([
      expect.objectContaining({ providerId: '999', title: 'Fallback Show', genres: ['Comedy'] }),
    ]);
  });

  it('respects the limit parameter', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([SEED], 1);

    expect(candidates).toHaveLength(1);
  });

  it('caps the number of seeds actually queried, so an unbounded seed list cannot fan out unbounded requests', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ results: [] }));
    const provider = createItunesProvider({ fetch });
    const manySeeds: RecommendationSeed[] = Array.from({ length: 10 }, (_, i) => ({
      label: `Genre ${i}`,
      identifiers: {},
    }));

    await provider.recommend(manySeeds);

    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('dedupes a show returned for more than one seed', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        results: [{ collectionId: 777, collectionName: 'Shared Show', artistName: 'Host' }],
      }),
    );
    const provider = createItunesProvider({ fetch });

    const candidates = await provider.recommend([SEED, { label: 'Comedy', identifiers: {} }]);

    expect(candidates).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
