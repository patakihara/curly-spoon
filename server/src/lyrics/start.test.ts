import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { indexItemSchema, indexQueryResultSchema } from '../adapters/jellyfin/schemas.js';
import { LRCLIB_USER_AGENT } from '../adapters/lrclib/client.js';
import type { LyricsConfig } from '../config.js';
import type { Job } from '../jobs/schedule.js';
import { albumRow, trackRows } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, indexedRow, recordRun } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { cachedLyrics } from '../store/lyrics.js';
import { lyricsService, startLyricsJob } from './start.js';

const GET_LUCKY = '484fcbfff6efe11cfeb2028d3a7babc7';
const LRCLIB = 'http://lrclib.upstream.invalid';

let db: Db;
let keyFile: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  keyFile = join(mkdtempSync(join(tmpdir(), 'auralis-lyrics-keys-')), 'jellyfin');
  writeFileSync(keyFile, 'test-key\n');
});
afterEach(() => db.close());

const log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
const jellyfin = () => ({ url: 'http://jellyfin.upstream.invalid', keyFile });
const nothing: FetchLike = async () => {
  throw new Error('no network in this test');
};

function start(lyrics: LyricsConfig, withJellyfin = true, fetch: FetchLike = nothing) {
  const jobs: Job[] = [];
  const config = { jellyfin: withJellyfin ? jellyfin() : null, lyrics };
  const stop = startLyricsJob(config, {
    db,
    fetch,
    lyrics: lyricsService(config, { db, fetch, log }),
    log,
    schedule: (job) => (jobs.push(job), () => undefined),
    sleep: async () => undefined,
  });
  return { jobs, stop };
}

function recording(upstream: 'jellyfin' | 'lrclib', call: string): Recording {
  const file = fileURLToPath(
    new URL(`../adapters/${upstream}/recordings/${call}.json`, import.meta.url),
  );
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
const json = (r: Recording) => (r.response.body as { json: unknown }).json;

/** Random Access Memories with only Get Lucky, as recorded; then a whole index pass. */
function indexGetLucky() {
  const album = indexQueryResultSchema.parse(json(recording('jellyfin', 'lyrics-album-1')))
    .Items[0]!;
  const tracks = (
    json(recording('jellyfin', 'lyrics-album-1-tracks')) as { Items: { Id: string }[] }
  ).Items.filter((t) => t.Id === GET_LUCKY).map((t) => indexItemSchema.parse(t));
  applyTree(
    db,
    {
      top: albumRow(indexItemSchema.parse(album), 'music'),
      children: trackRows(album.Id, 'music', tracks),
    },
    Date.now(),
    emptyCounts(),
  );
  const at = Date.now();
  recordRun(db, {
    source: 'jellyfin',
    startedAt: at,
    finishedAt: at,
    complete: true,
    error: null,
    counts: emptyCounts(),
  });
}

describe('starting the lyrics backfill with the server', () => {
  it('schedules nothing when LYRICS_EVERY_MINUTES is 0, with no Jellyfin, or with LRCLIB off', () => {
    expect(start({ everyMinutes: 0, lrclibUrl: LRCLIB }).jobs).toEqual([]);
    expect(start({ everyMinutes: 60, lrclibUrl: LRCLIB }, false).jobs).toEqual([]);
    expect(start({ everyMinutes: 60, lrclibUrl: null }).jobs).toEqual([]);
  });

  it('schedules the backfill at its interval, asking LRCLIB at its URL as Auralis by name', async () => {
    indexGetLucky();
    const asked: { url: URL; agent: string | null }[] = [];
    const replay = replayFetch([recording('lrclib', 'lrclib-get-synced')]);
    const fetch: FetchLike = (url, init) => {
      asked.push({ url: new URL(url), agent: new Headers(init?.headers).get('user-agent') });
      return replay(url, init);
    };
    const { jobs } = start({ everyMinutes: 45, lrclibUrl: LRCLIB }, true, fetch);
    expect(jobs.map((j) => [j.name, j.everyMs])).toEqual([['lyrics', 45 * 60_000]]);

    await jobs[0]!.run();

    expect(asked.map((a) => [a.url.origin, a.url.pathname, a.agent])).toEqual([
      [LRCLIB, '/api/get', LRCLIB_USER_AGENT],
    ]);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)?.status).toBe('synced');
  });

  it('builds a lyrics service that asks no LRCLIB when its URL is empty', async () => {
    indexGetLucky();
    const lyrics = lyricsService(
      { lyrics: { everyMinutes: 60, lrclibUrl: null } },
      { db, fetch: nothing, log },
    );
    const answer = await lyrics.forTrack(indexedRow(db, 'jellyfin', GET_LUCKY)!, {
      getLyrics: () => Promise.reject(new Error('Jellyfin was asked')),
    });
    expect(answer).toEqual({ status: 'none', source: null, lines: [] });
  });

  it('says once, not every run, that it is waiting on a whole Jellyfin index pass', async () => {
    const said: string[] = [];
    const config = { jellyfin: jellyfin(), lyrics: { everyMinutes: 60, lrclibUrl: LRCLIB } };
    const jobs: Job[] = [];
    startLyricsJob(config, {
      db,
      fetch: nothing,
      lyrics: lyricsService(config, { db, fetch: nothing, log }),
      log: { ...log, info: (_details, message) => said.push(message) },
      schedule: (job) => (jobs.push(job), () => undefined),
      sleep: async () => undefined,
    });

    await jobs[0]!.run();
    await jobs[0]!.run();

    expect(said).toEqual(['lyrics waiting on a whole Jellyfin index pass']);
  });

  it('ends a run before its next track once stopped', async () => {
    indexGetLucky();
    const asked: string[] = [];
    const { jobs, stop } = start({ everyMinutes: 60, lrclibUrl: LRCLIB }, true, (url) => {
      asked.push(url);
      return Promise.reject(new Error('asked after stopping'));
    });
    stop();
    await jobs[0]!.run();
    expect(asked).toEqual([]);
  });
});
