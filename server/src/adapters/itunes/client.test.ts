import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { ITUNES_SEARCHES } from '../record-podcasts.js';
import { ITUNES_CACHE_MS, ITUNES_GAP_MS, ItunesClient } from './client.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'recordings');
const all: Recording[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const byCall = (call: keyof typeof ITUNES_SEARCHES) => all.find((r) => r.call === call)!;

type Row = Record<string, unknown>;
const rowsOf = (r: Recording): Row[] => {
  const body = r.response.body as { text: string };
  return (JSON.parse(body.text) as { results: Row[] }).results;
};

/** The recording with its rows changed, the rest of the answer as recorded. */
function withRows(r: Recording, change: (rows: Row[]) => Row[]): Recording {
  const rows = change(rowsOf(r));
  const text = JSON.stringify({ resultCount: rows.length, results: rows });
  return { ...r, response: { ...r.response, body: { text } } };
}

function fakeClock() {
  const clock = { at: 1_000_000 };
  return {
    clock,
    now: () => clock.at,
    sleep: async (ms: number) => void (clock.at += ms),
  };
}

/** A replay that notes when each call started on the clock. */
function counted(recordings: Recording[], now: () => number) {
  const started: number[] = [];
  const replay = replayFetch(recordings);
  const fetch: FetchLike = async (url, init) => {
    started.push(now());
    return replay(url, init);
  };
  return { fetch, started };
}

const client = (fetch: FetchLike, clock = fakeClock()) =>
  new ItunesClient({ baseUrl: 'http://upstream.invalid', fetch, clock });

describe("[M3.podcasts] iTunes' podcast search, on recorded answers", () => {
  it('[M3.podcasts] a show found by name parses to its title, host, feed, episode count, art and iTunes id', async () => {
    const { fetch } = counted(all, () => 0);
    const shows = await client(fetch).searchShows(
      ITUNES_SEARCHES['search-maintenance-phase'].words,
    );
    const row = rowsOf(byCall('search-maintenance-phase'))[0]!;
    expect(shows).toEqual([
      {
        itunesId: String(row.collectionId),
        title: 'Maintenance Phase',
        host: row.artistName,
        feedUrl: row.feedUrl,
        episodes: row.trackCount,
        art: row.artworkUrl600,
      },
    ]);
    expect(shows[0]!.itunesId).toMatch(/^\d+$/);
    expect(shows[0]!.art).toMatch(/^https:\/\/is1-ssl\.mzstatic\.com\//);
  });

  it('[M3.podcasts] a row without a feed address is left out, as it cannot be subscribed to', async () => {
    const recorded = rowsOf(byCall('search-history'));
    const withoutFeed = recorded.filter((row) => row.feedUrl === undefined);
    expect(withoutFeed.length).toBeGreaterThan(0);
    const { fetch } = counted(all, () => 0);
    const shows = await client(fetch).searchShows('history');
    expect(shows).toHaveLength(recorded.length - withoutFeed.length);
    expect(shows.map((s) => s.itunesId)).not.toEqual(
      expect.arrayContaining(withoutFeed.map((row) => String(row.collectionId))),
    );
    expect(shows.every((s) => s.feedUrl.startsWith('https://'))).toBe(true);
  });

  it('[M3.podcasts] a row whose feed address is private or not https is left out, with no lookup', async () => {
    const refused = [
      'https://192.168.1.20/feed.xml',
      'https://10.0.0.5:8443/rss',
      'https://[::1]/rss',
      'https://nas/feed.xml',
      'https://feeds.local/rss',
      'http://feeds.npr.org/510289/podcast.xml',
      'https://user:pass@feeds.example.com/podcast.xml',
    ];
    const recording = withRows(byCall('search-history'), (rows) => {
      const withFeed = rows.filter((row) => row.feedUrl !== undefined);
      return withFeed.map((row, i) => (i < refused.length ? { ...row, feedUrl: refused[i] } : row));
    });
    const kept = rowsOf(recording).slice(refused.length);
    const asked: string[] = [];
    const replay = replayFetch([recording]);
    const shows = await client(async (url, init) => {
      asked.push(new URL(url).hostname);
      return replay(url, init);
    }).searchShows('history');
    expect(shows.map((s) => s.feedUrl)).toEqual(kept.map((row) => row.feedUrl));
    expect(asked).toEqual(['upstream.invalid']);
  });

  it('[M3.podcasts] words nothing matches give no shows', async () => {
    const { fetch } = counted(all, () => 0);
    const shows = await client(fetch).searchShows(ITUNES_SEARCHES['search-none'].words);
    expect(shows).toEqual([]);
  });

  it('[M3.podcasts] asks at most one call a second, however many searches arrive at once', async () => {
    const time = fakeClock();
    const { fetch, started } = counted(all, time.now);
    const itunes = client(fetch, time);
    await Promise.all(Object.values(ITUNES_SEARCHES).map(({ words }) => itunes.searchShows(words)));
    expect(started).toHaveLength(3);
    for (let i = 1; i < started.length; i += 1) {
      expect(started[i]! - started[i - 1]!).toBeGreaterThanOrEqual(ITUNES_GAP_MS);
    }
  });

  it('[M3.podcasts] the same words ask nothing again for a day, whatever their case or spacing', async () => {
    const time = fakeClock();
    const { fetch, started } = counted(all, time.now);
    const itunes = client(fetch, time);
    const first = await itunes.searchShows('maintenance phase');
    time.clock.at += ITUNES_CACHE_MS - 1;
    expect(await itunes.searchShows('  Maintenance   PHASE ')).toEqual(first);
    expect(started).toHaveLength(1);
    time.clock.at += 2;
    await itunes.searchShows('maintenance phase');
    expect(started).toHaveLength(2);
  });

  it('[M3.podcasts] a failure is an AdapterError, and the next search asks again', async () => {
    const time = fakeClock();
    const answers = [
      () => new Response('busy', { status: 503 }),
      () => Promise.reject(new Error('connection refused')),
    ];
    let asked = 0;
    const replay = replayFetch(all);
    const itunes = client(async (url, init) => {
      const answer = answers[asked];
      asked += 1;
      return answer ? answer() : replay(url, init);
    }, time);
    await expect(itunes.searchShows('maintenance phase')).rejects.toBeInstanceOf(AdapterError);
    await expect(itunes.searchShows('maintenance phase')).rejects.toBeInstanceOf(AdapterError);
    expect(await itunes.searchShows('maintenance phase')).toHaveLength(1);
    expect(asked).toBe(3);
  });

  it('[M3.podcasts] an answer that is not the search answer is an AdapterError', async () => {
    const itunes = client(
      async () =>
        new Response('<html>maintenance</html>', {
          status: 200,
          headers: { 'content-type': 'text/javascript; charset=utf-8' },
        }),
    );
    await expect(itunes.searchShows('history')).rejects.toBeInstanceOf(AdapterError);
  });

  it('[M3.podcasts] blank words ask nothing', async () => {
    let asked = 0;
    const itunes = client(async () => {
      asked += 1;
      return new Response('{}');
    });
    expect(await itunes.searchShows('   ')).toEqual([]);
    expect(asked).toBe(0);
  });
});
