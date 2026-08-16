import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import { createListenBrainzProvider } from './listenbrainz.js';
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

const RADIOHEAD_MBID = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const SEED: RecommendationSeed = {
  label: 'Radiohead',
  identifiers: { musicBrainzArtistId: RADIOHEAD_MBID },
};

function realisticResponse() {
  return {
    [RADIOHEAD_MBID]: [
      {
        recording_mbid: '401c1a5d-56e7-434d-b07e-a14d4e7eb83c',
        similar_artist_mbid: 'cb67438a-7f50-4f2b-a6f1-2bb2729fd538',
        similar_artist_name: 'Boo Hoo Boys',
        total_listen_count: 232361,
      },
      {
        recording_mbid: '502d2b6e-67f8-545e-c18f-b25e5f233822',
        similar_artist_mbid: RADIOHEAD_MBID,
        similar_artist_name: 'Radiohead',
        total_listen_count: 999999,
      },
    ],
  };
}

describe('createListenBrainzProvider', () => {
  it('declares its identity', () => {
    const provider = createListenBrainzProvider({ fetch: fakeFetch(async () => jsonResponse({})) });
    expect(provider.providerName).toBe('listenbrainz');
    expect(provider.medium).toBe('music');
  });

  it('returns candidates with musicBrainzArtistId populated, and excludes the seed artist itself', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createListenBrainzProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toEqual([
      {
        providerName: 'listenbrainz',
        providerId: 'cb67438a-7f50-4f2b-a6f1-2bb2729fd538',
        medium: 'music',
        title: 'Boo Hoo Boys',
        authors: [],
        genres: [],
        identifiers: { musicBrainzArtistId: 'cb67438a-7f50-4f2b-a6f1-2bb2729fd538' },
        reason: 'Similar to Radiohead',
      },
    ]);
  });

  it('requests the documented lb-radio endpoint with mode=easy, URL-encoding the MBID', async () => {
    const fetch = fakeFetch(async () => jsonResponse({}));
    const provider = createListenBrainzProvider({
      fetch,
      baseUrl: 'https://api.listenbrainz.test',
    });

    await provider.recommend([SEED]);

    expect(fetch).toHaveBeenCalledWith(
      `https://api.listenbrainz.test/1/lb-radio/artist/${encodeURIComponent(RADIOHEAD_MBID)}?mode=easy`,
    );
  });

  it('skips seeds with no musicBrainzArtistId and issues no request for them', async () => {
    const fetch = fakeFetch(async () => jsonResponse(realisticResponse()));
    const provider = createListenBrainzProvider({ fetch });

    const candidates = await provider.recommend([
      { label: 'a book, wrong medium', identifiers: { asin: 'B002ABC' } },
      { label: '', identifiers: {} },
    ]);

    expect(candidates).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades to no candidates, without throwing, on a network failure', async () => {
    const fetch = fakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const warn = vi.fn();
    const provider = createListenBrainzProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, on a non-OK response', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ error: 'rate limited' }, 429));
    const warn = vi.fn();
    const provider = createListenBrainzProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to no candidates, without throwing, on an unparseable body', async () => {
    const fetch = fakeFetch(
      async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const warn = vi.fn();
    const provider = createListenBrainzProvider({ fetch, logger: { warn } });

    await expect(provider.recommend([SEED])).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // The exact trap `packages/abs-client` was burned by: a schema that only accepts
  // `undefined` silently rejects a server's literal `null`. Every field on the entry schema
  // must tolerate this.
  it('tolerates explicit null fields in an entry, degrading that one entry rather than the whole response', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        [RADIOHEAD_MBID]: [
          {
            recording_mbid: null,
            similar_artist_mbid: null,
            similar_artist_name: null,
            total_listen_count: null,
          },
          {
            recording_mbid: '502d2b6e-67f8-545e-c18f-b25e5f233822',
            similar_artist_mbid: 'cb67438a-7f50-4f2b-a6f1-2bb2729fd538',
            similar_artist_name: 'Boo Hoo Boys',
            total_listen_count: null,
          },
        ],
      }),
    );
    const provider = createListenBrainzProvider({ fetch });

    const candidates = await provider.recommend([SEED]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.providerId).toBe('cb67438a-7f50-4f2b-a6f1-2bb2729fd538');
  });

  it('dedupes an artist recommended from more than one seed', async () => {
    const otherMbid = 'b1234567-71a5-4011-9441-d0b5e4122abc';
    const fetch = fakeFetch(async (url) => {
      const artistMbid = url.includes(encodeURIComponent(RADIOHEAD_MBID))
        ? RADIOHEAD_MBID
        : otherMbid;
      return jsonResponse({
        [artistMbid]: [
          {
            recording_mbid: 'shared-recording',
            similar_artist_mbid: 'cb67438a-7f50-4f2b-a6f1-2bb2729fd538',
            similar_artist_name: 'Boo Hoo Boys',
            total_listen_count: 1,
          },
        ],
      });
    });
    const provider = createListenBrainzProvider({ fetch });

    const candidates = await provider.recommend([
      SEED,
      { label: 'Other Artist', identifiers: { musicBrainzArtistId: otherMbid } },
    ]);

    expect(candidates).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('respects the limit parameter', async () => {
    const fetch = fakeFetch(async () =>
      jsonResponse({
        [RADIOHEAD_MBID]: [
          {
            similar_artist_mbid: 'artist-1',
            similar_artist_name: 'Artist One',
          },
          {
            similar_artist_mbid: 'artist-2',
            similar_artist_name: 'Artist Two',
          },
        ],
      }),
    );
    const provider = createListenBrainzProvider({ fetch });

    const candidates = await provider.recommend([SEED], 1);

    expect(candidates).toHaveLength(1);
  });

  it('caps the number of seeds actually queried, so an unbounded seed list cannot fan out unbounded requests', async () => {
    const fetch = fakeFetch(async () => jsonResponse({}));
    const provider = createListenBrainzProvider({ fetch });
    const manySeeds: RecommendationSeed[] = Array.from({ length: 10 }, (_, i) => ({
      label: `Artist ${i}`,
      identifiers: { musicBrainzArtistId: `mbid-${i}` },
    }));

    await provider.recommend(manySeeds);

    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
