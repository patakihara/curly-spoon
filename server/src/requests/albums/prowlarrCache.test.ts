import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../../adapters/http/replay.js';
import type { Clock } from '../../adapters/musicbrainz/client.js';
import { ProwlarrClient, type ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import { openDatabase } from '../../store/connection.js';
import { StepUnavailable } from '../steps.js';
import { PROWLARR_GAP_MS, SharedProwlarr } from '../prowlarr.js';
import { PROWLARR_CACHE_MS, ProwlarrCache } from './prowlarrCache.js';

const recordings = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../adapters/prowlarr/recordings',
);
const recording = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(recordings, `${call}.json`), 'utf8')));

const SLIP = 'Nine Inch Nails The Slip';
const GHOSTS = 'Nine Inch Nails Ghosts I-IV';

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

const replayed = () =>
  new ProwlarrClient({
    baseUrl: 'http://upstream.invalid',
    apiKey: '<token>',
    fetch: replayFetch([recording('indexers'), recording('music-slip'), recording('music-ghosts')]),
  });

const row = (title: string): ProwlarrRelease => ({
  title,
  source: 'indexer-a',
  size: 1,
  seeders: 1,
  files: 1,
  infoUrl: null,
  details: { link: '/1/download?link=a' },
});

/** A Prowlarr that answers each search after `takes` ms of the fake clock, noting when each began. */
function timedProwlarr(clock: ReturnType<typeof fakeClock>, takes: number) {
  const began: number[] = [];
  return {
    began,
    musicIndexers: vi.fn(async () => [1, 2]),
    resolve: vi.fn(async (): Promise<never> => {
      throw new Error('no link is asked here');
    }),
    search: vi.fn(async (query: string) => {
      began.push(clock.now());
      clock.advance(takes);
      return [row(query)];
    }),
  };
}

describe('[M3.albums] how the album search asks Prowlarr', () => {
  it('[M3.albums] searches Audio on the music indexers alone, as recorded', async () => {
    const cache = new ProwlarrCache({
      db: openDatabase(':memory:'),
      prowlarr: new SharedProwlarr(replayed(), fakeClock()),
    });
    const rows = await cache.search(SLIP);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((one) => /flac/i.test(one.title))).toBe(true);
  });

  it('[M3.albums] a query asked within the day reads the kept answer and asks no site', async () => {
    const db = openDatabase(':memory:');
    const clock = fakeClock();
    const prowlarr = timedProwlarr(clock, 30_000);
    const first = await new ProwlarrCache({
      db,
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    }).search(SLIP);
    clock.advance(PROWLARR_CACHE_MS - 60_000);
    const again = await new ProwlarrCache({
      db,
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    }).search(SLIP);
    expect(again).toEqual(first);
    expect(prowlarr.search).toHaveBeenCalledTimes(1);
    clock.advance(120_000);
    await new ProwlarrCache({ db, prowlarr: new SharedProwlarr(prowlarr, clock), clock }).search(
      SLIP,
    );
    expect(prowlarr.search).toHaveBeenCalledTimes(2);
  });

  it('[M3.albums] two searches run one at a time, the second 10 s after the first ended', async () => {
    const clock = fakeClock();
    const prowlarr = timedProwlarr(clock, 30_000);
    const cache = new ProwlarrCache({
      db: openDatabase(':memory:'),
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    });
    await Promise.all([cache.search(SLIP), cache.search(GHOSTS)]);
    const [first, second] = prowlarr.began as [number, number];
    expect(second - first).toBeGreaterThanOrEqual(30_000 + PROWLARR_GAP_MS);
  });

  it('[M3.albums] a link is asked in the same queue as the searches, each the gap after the one before', async () => {
    const clock = fakeClock();
    const spans: [number, number][] = [];
    const takes = async <T>(ms: number, answer: T): Promise<T> => {
      const began = clock.now();
      clock.advance(ms);
      spans.push([began, clock.now()]);
      return answer;
    };
    const prowlarr = {
      musicIndexers: vi.fn(async () => [1, 2]),
      search: vi.fn(async (query: string) => takes(30_000, [row(query)])),
      resolve: vi.fn(async () =>
        takes(2_000, {
          kind: 'magnet' as const,
          magnet: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
          hash: 'a'.repeat(40),
        }),
      ),
    };
    const cache = new ProwlarrCache({
      db: openDatabase(':memory:'),
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    });
    await Promise.all([
      cache.search(SLIP),
      cache.askLink('/1/download?link=a'),
      cache.askLink('/1/download?link=b'),
      cache.search(GHOSTS),
    ]);
    expect(spans).toHaveLength(4);
    for (const [index, [began]] of spans.entries()) {
      if (index === 0) continue;
      const [, endedBefore] = spans[index - 1]!;
      expect(began - endedBefore).toBeGreaterThanOrEqual(PROWLARR_GAP_MS);
    }
  });

  it('[M3.albums] the same query waiting its turn reads what the one before it kept', async () => {
    const clock = fakeClock();
    const prowlarr = timedProwlarr(clock, 30_000);
    const cache = new ProwlarrCache({
      db: openDatabase(':memory:'),
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    });
    const [a, b] = await Promise.all([cache.search(SLIP), cache.search(SLIP)]);
    expect(b).toEqual(a);
    expect(prowlarr.search).toHaveBeenCalledTimes(1);
  });

  it('[M3.albums] a failed search still keeps the next one waiting the gap', async () => {
    const clock = fakeClock();
    const prowlarr = timedProwlarr(clock, 5_000);
    prowlarr.search.mockImplementationOnce(async () => {
      prowlarr.began.push(clock.now());
      throw new StepUnavailable('prowlarr: answered 503');
    });
    const cache = new ProwlarrCache({
      db: openDatabase(':memory:'),
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    });
    const [failed, found] = await Promise.allSettled([cache.search(SLIP), cache.search(GHOSTS)]);
    expect(failed.status).toBe('rejected');
    expect(found.status).toBe('fulfilled');
    const [first, second] = prowlarr.began as [number, number];
    expect(second - first).toBeGreaterThanOrEqual(PROWLARR_GAP_MS);
  });

  it('[M3.albums] Prowlarr answering 5xx holds the request, and nothing is kept', async () => {
    const db = openDatabase(':memory:');
    const indexers = recording('indexers');
    const busy = new ProwlarrClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: '<token>',
      fetch: async (url, init) =>
        url.includes('/api/v1/indexer')
          ? replayFetch([indexers])(url, init)
          : new Response('', { status: 503 }),
    });
    await expect(
      new ProwlarrCache({ db, prowlarr: new SharedProwlarr(busy, fakeClock()) }).search(SLIP),
    ).rejects.toBeInstanceOf(StepUnavailable);
    expect(db.prepare('SELECT COUNT(*) AS n FROM prowlarr_searches').get()).toEqual({ n: 0 });
  });

  it('[M3.albums] reads which indexers list music once a day', async () => {
    const clock = fakeClock();
    const prowlarr = timedProwlarr(clock, 1_000);
    const cache = new ProwlarrCache({
      db: openDatabase(':memory:'),
      prowlarr: new SharedProwlarr(prowlarr, clock),
      clock,
    });
    await cache.search(SLIP);
    await cache.search(GHOSTS);
    expect(prowlarr.musicIndexers).toHaveBeenCalledTimes(1);
    clock.advance(24 * 60 * 60 * 1000);
    await cache.search(SLIP);
    expect(prowlarr.musicIndexers).toHaveBeenCalledTimes(2);
  });

  it('[M3.albums] no kept row holds a key, an address or a tracker', async () => {
    const db = openDatabase(':memory:');
    const cache = new ProwlarrCache({
      db,
      prowlarr: new SharedProwlarr(replayed(), fakeClock()),
      clock: fakeClock(),
    });
    await cache.search(SLIP);
    await cache.search(GHOSTS);
    const kept = db.prepare<[], { rows: string }>('SELECT rows FROM prowlarr_searches').all();
    expect(kept).toHaveLength(2);
    for (const { rows } of kept) {
      expect(rows).not.toMatch(/apikey|<token>|https?:|udp:|&tr=|upstream\.invalid/i);
      for (const one of JSON.parse(rows) as ProwlarrRelease[]) {
        expect(one.infoUrl).toBeNull();
        const { link, magnet } = one.details;
        expect(link !== undefined || magnet !== undefined, one.title).toBe(true);
        if (magnet !== undefined) expect(magnet).toMatch(/^magnet:\?xt=urn:btih:[0-9a-f]{40}$/);
      }
    }
  });

  it('[M3.albums] a link is asked once a day: a torrent gives its files and web seed, a magnet its hash', async () => {
    const db = openDatabase(':memory:');
    const asked: string[] = [];
    const replay = replayFetch([recording('torrent-ghosts-ia'), recording('link-magnet-music')], {
      readBytes: standInsBeside(join(recordings, '../..')),
    });
    const prowlarr = new ProwlarrClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: '<token>',
      fetch: (url, init) => {
        asked.push(new URL(url).pathname);
        return replay(url, init);
      },
    });
    const cache = new ProwlarrCache({
      db,
      prowlarr: new SharedProwlarr(prowlarr, fakeClock()),
      clock: fakeClock(),
    });
    const torrent = '/4/download?link=link-723c0f17e972';
    const magnet = '/1/download?link=link-c10af1640615';
    expect(cache.keptLink(torrent)).toBeUndefined();
    const files = await cache.askLink(torrent);
    expect(files).toMatchObject({
      hash: '802668fa8d65fca85b7fa3335e5723a3543d4778',
      webSeed: true,
    });
    expect(files!.files!.filter((file) => /\.flac$/.test(file.path))).toHaveLength(36);
    expect(await cache.askLink(magnet)).toEqual({
      hash: '6941a469928aa388eff7d25ffc9cfdd100fa9a7c',
      files: null,
      webSeed: false,
    });
    expect(cache.keptLink(torrent)).toEqual(files);
    expect(asked).toHaveLength(2);
    const kept = db.prepare<[], { answer: string }>('SELECT answer FROM prowlarr_links').all();
    expect(JSON.stringify(kept)).not.toMatch(/apikey|<token>|https?:|upstream\.invalid/i);
  });

  it('[M3.albums] a link that gives nothing is kept as nothing, and not asked again', async () => {
    const db = openDatabase(':memory:');
    const prowlarr = {
      musicIndexers: vi.fn(async () => [1]),
      search: vi.fn(async () => []),
      resolve: vi.fn(async (): Promise<never> => {
        throw new StepUnavailable('prowlarr: GET /2/download: no answer in 30000 ms');
      }),
    };
    const cache = new ProwlarrCache({
      db,
      prowlarr: new SharedProwlarr(prowlarr, fakeClock()),
      clock: fakeClock(),
    });
    expect(await cache.askLink('/2/download?link=a')).toBeNull();
    expect(cache.keptLink('/2/download?link=a')).toBeNull();
  });
});
