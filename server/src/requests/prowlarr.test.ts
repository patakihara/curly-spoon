import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AudibleClient } from '../adapters/audible/client.js';
import type { FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import type { Clock } from '../adapters/musicbrainz/client.js';
import { ProwlarrClient } from '../adapters/prowlarr/client.js';
import { openDatabase } from '../store/connection.js';
import type { StoredRequest } from '../store/requests.js';
import { ProwlarrCache } from './albums/prowlarrCache.js';
import { bookSearch } from './books/search.js';
import { PROWLARR_GAP_MS, SharedProwlarr } from './prowlarr.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const BASE = 'http://upstream.invalid';

/** A clock that moves only when it is waited on, or told to. */
function fakeClock(): Clock & { advance(ms: number): void } {
  let now = 1_000_000;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

const jekyll: StoredRequest = {
  target: { title: 'a title', creator: 'a client', ids: { asin: 'B09J9BJ8DF' } },
} as unknown as StoredRequest;

describe('[M3.albums] one Prowlarr for the whole server', () => {
  it('[M3.albums] a book search and an album search, asked at once, run one at a time, the gap apart', async () => {
    const clock = fakeClock();
    const replay = replayFetch([
      recorded('audible', 'product-jekyll'),
      recorded('prowlarr', 'indexers'),
      recorded('prowlarr', 'search-jekyll'),
      recorded('prowlarr', 'music-slip'),
    ]);
    const searches: [number, number][] = [];
    // Each search takes 30 s, as live: one that overlapped another would start before it ended.
    const fetch: FetchLike = async (url, init) => {
      if (new URL(url).pathname !== '/api/v1/search') return replay(url, init);
      const began = clock.now();
      clock.advance(30_000);
      searches.push([began, clock.now()]);
      return replay(url, init);
    };
    const prowlarr = new SharedProwlarr(
      new ProwlarrClient({ baseUrl: BASE, apiKey: '<token>', fetch }),
      clock,
    );
    const books = bookSearch({
      audible: new AudibleClient({ baseUrl: BASE, fetch }),
      prowlarr,
      fetch: async () => {
        throw new Error('no page is read here');
      },
    });
    const albums = new ProwlarrCache({ db: openDatabase(':memory:'), prowlarr, clock });

    const [book, album] = await Promise.all([
      books(jekyll),
      albums.search('Nine Inch Nails The Slip'),
    ]);

    expect(book.kind).not.toBe('none');
    expect(album.length).toBeGreaterThan(0);
    expect(searches).toHaveLength(2);
    const [[, firstEnded], [secondBegan]] = searches as [[number, number], [number, number]];
    expect(secondBegan - firstEnded).toBeGreaterThanOrEqual(PROWLARR_GAP_MS);
  });
});
