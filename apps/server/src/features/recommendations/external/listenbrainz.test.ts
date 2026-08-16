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

  it('sends every query parameter ListenBrainz requires, URL-encoding the MBID', async () => {
    // This test exists because the first draft of the provider sent `mode=easy` alone, and the
    // live endpoint answers that with `400 Argument max_similar_artists must be specified.`
    // The provider folds a non-OK response into no candidates — correctly — so the bug was
    // invisible: fully wired, fully green, and permanently returning nothing against the real
    // API. Nothing here can call ListenBrainz, so the request itself has to be the assertion.
    // Verified against the live endpoint 2026-08-16: all five are mandatory and none defaults.
    const fetch = fakeFetch(async () => jsonResponse({}));
    const provider = createListenBrainzProvider({
      fetch,
      baseUrl: 'https://api.listenbrainz.test',
    });

    await provider.recommend([SEED]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const requested = new URL((fetch.mock.calls[0] as [string])[0]);
    expect(requested.origin + requested.pathname).toBe(
      `https://api.listenbrainz.test/1/lb-radio/artist/${encodeURIComponent(RADIOHEAD_MBID)}`,
    );
    // Asserted as an exact set, not a subset: a missing parameter is the failure this pins,
    // and `toMatchObject`-style partial matching would pass with any of them dropped.
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      mode: 'easy',
      max_similar_artists: '10',
      max_recordings_per_artist: '5',
      pop_begin: '0',
      pop_end: '100',
    });
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

  // Distinct from the previous test: this body parses as JSON but violates the schema (the
  // per-artist value is not an array). This is source-derived shape (see this provider's
  // file header) never observed against a live response, so real drift — ListenBrainz
  // changing this endpoint's shape — is exactly the failure class this branch has to catch,
  // and it must degrade the same way a transport failure does rather than throwing.
  it('degrades to no candidates, without throwing, when the body is valid JSON but violates the schema', async () => {
    const fetch = fakeFetch(async () => jsonResponse({ [RADIOHEAD_MBID]: 'not-an-array' }));
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
