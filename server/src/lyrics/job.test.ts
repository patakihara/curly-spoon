/**
 * The lyrics backfill on the recordings: the index holds the recorded albums with only the tracks
 * whose lyrics were recorded (the recorded track lists with the others left out, the only
 * change). Jellyfin and LRCLIB answer their recorded answers; LRCLIB's lookups are counted by
 * track, and the job's waits are taken from an injected `sleep`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { indexItemSchema, indexQueryResultSchema } from '../adapters/jellyfin/schemas.js';
import { LRCLIB_USER_AGENT, LrclibClient } from '../adapters/lrclib/client.js';
import { albumRow, trackRows } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, indexedRow, recordRun } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { cachedLyrics } from '../store/lyrics.js';
import { LRCLIB_GAP_MS, LYRICS_STOP_AFTER, runLyrics } from './job.js';
import { Lyrics } from './service.js';

const ADAPTERS = new URL('../adapters/', import.meta.url);
const T0 = Date.UTC(2026, 9, 17);
const UPSTREAM = 'http://upstream.invalid';

const SECOND_HAND_NEWS = 'e8f41d8c866537d45dcb8bdd002516ca';
const GET_LUCKY = '484fcbfff6efe11cfeb2028d3a7babc7';
const YEAR_OF_THE_RAT = '60a0e3527912ae3ae2079fdf5560597e';
const WAKE = '541003a096929c913a036ab427d4563e';
const RECORDED = [SECOND_HAND_NEWS, GET_LUCKY, YEAR_OF_THE_RAT, WAKE];
/** The three tracks Jellyfin has no synced lyrics for, which LRCLIB is asked about. */
const ASKED_OF_LRCLIB = ['Get Lucky', 'Year Of The Rat', 'Wake'];

function recording(upstream: 'jellyfin' | 'lrclib', call: string): Recording {
  const file = fileURLToPath(new URL(`${upstream}/recordings/${call}.json`, ADAPTERS));
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
function json(r: Recording): unknown {
  const body = r.response.body;
  if (body === null || !('json' in body)) throw new Error(r.call);
  return body.json;
}

type ListedTrack = { Id: string; Genres?: string[] };

/** A recorded album with only `keep`'s tracks, as recorded; `edit` changes them. */
function indexAlbum(
  db: Db,
  album: unknown,
  tracksCall: string,
  keep: (id: string) => boolean,
  now = T0,
  edit: (tracks: ListedTrack[]) => void = () => undefined,
) {
  const parsed = indexItemSchema.parse(album);
  const listed = structuredClone(json(recording('jellyfin', tracksCall))) as {
    Items: ListedTrack[];
  };
  const kept = listed.Items.filter((t) => keep(t.Id));
  edit(kept);
  const tracks = kept.map((t) => indexItemSchema.parse(t));
  applyTree(
    db,
    { top: albumRow(parsed, 'music'), children: trackRows(parsed.Id, 'music', tracks) },
    now,
    emptyCounts(),
  );
}

const lyricsAlbum = (n: number) =>
  indexQueryResultSchema.parse(json(recording('jellyfin', `lyrics-album-${n}`))).Items[0];

/** Rumours and the three lyrics albums, each holding only the tracks `keep` lets through. */
function indexRecorded(
  db: Db,
  keep: (id: string) => boolean,
  now = T0,
  edit?: (tracks: ListedTrack[]) => void,
) {
  const tracks = recording('jellyfin', 'index-album-tracks-2');
  const albums = indexQueryResultSchema.parse(json(recording('jellyfin', 'jf-library-albums-1')));
  const rumours = albums.Items.find((a) => a.Id === tracks.request.query.ParentId);
  indexAlbum(db, rumours, 'index-album-tracks-2', keep, now, edit);
  for (const n of [1, 2, 3]) {
    indexAlbum(db, lyricsAlbum(n), `lyrics-album-${n}-tracks`, keep, now, edit);
  }
}

/** A whole Jellyfin index pass, as the index job records it once it has run. */
function indexPassRan(db: Db) {
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

const jellyfinRecorded = () =>
  replayFetch(
    ['jf-lyrics-synced', 'jf-lyrics-plain', 'jf-lyrics-none'].map((c) => recording('jellyfin', c)),
  );
const lrclibRecorded = () =>
  replayFetch(
    ['lrclib-get-synced', 'lrclib-get-missing', 'lrclib-get-instrumental'].map((c) =>
      recording('lrclib', c),
    ),
  );
const rejecting: FetchLike = () => Promise.reject(new TypeError('fetch failed'));

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

/** The job's pieces on `lrclib`; `sleep` records each wait and runs `onSleep`. */
function job(lrclib: FetchLike = lrclibRecorded(), onSleep: () => void = () => undefined) {
  const lrclibAsked: string[] = [];
  const jellyfinAsked: string[] = [];
  const sleeps: number[] = [];
  const warnings: string[] = [];
  const lyrics = new Lyrics({
    db,
    log: { warn: () => undefined },
    lrclib: new LrclibClient({
      baseUrl: UPSTREAM,
      userAgent: LRCLIB_USER_AGENT,
      fetch: (url, init) => {
        lrclibAsked.push(new URL(url).searchParams.get('track_name') ?? '');
        return lrclib(url, init);
      },
    }),
    now: () => T0,
  });
  const jfReplay = jellyfinRecorded();
  const jellyfin = new JellyfinClient({
    baseUrl: UPSTREAM,
    token: '<token>',
    fetch: (url, init) => {
      jellyfinAsked.push(new URL(url).pathname);
      return jfReplay(url, init);
    },
  });
  const run = (extra: { batch?: number; stopped?: () => boolean } = {}) =>
    runLyrics({
      db,
      lyrics,
      jellyfin,
      sleep: async (ms) => {
        sleeps.push(ms);
        onSleep();
      },
      log: { info: () => undefined, warn: (_details, message) => warnings.push(message) },
      ...extra,
    });
  return { lyrics, jellyfin, run, lrclibAsked, jellyfinAsked, sleeps, warnings };
}

const cachedIds = () => RECORDED.filter((id) => cachedLyrics(db, 'jellyfin', id) !== undefined);

describe('the lyrics backfill job', () => {
  it('resolves every track with no fresh answer, and skips the ones already cached', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    indexPassRan(db);
    const j = job();
    await j.lyrics.forTrack(indexedRow(db, 'jellyfin', SECOND_HAND_NEWS)!, j.jellyfin);
    j.jellyfinAsked.length = 0;

    const run = await j.run();

    expect(run).toMatchObject({ waiting: false, resolved: 3, failed: 0, lookups: 3, ended: null });
    expect(j.lrclibAsked.toSorted()).toEqual(ASKED_OF_LRCLIB.toSorted());
    expect(j.jellyfinAsked).toEqual([]);
    expect(cachedIds()).toEqual(RECORDED);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toMatchObject({
      status: 'synced',
      source: 'lrclib',
    });
    expect(cachedLyrics(db, 'jellyfin', WAKE)?.status).toBe('instrumental');
    expect(cachedLyrics(db, 'jellyfin', YEAR_OF_THE_RAT)?.status).toBe('none');
  });

  it('takes no more tracks in one run than its batch', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    indexPassRan(db);
    const run = await job().run({ batch: 2 });
    expect(run.resolved).toBe(2);
    expect(cachedIds()).toHaveLength(2);
  });

  it('waits a second after each LRCLIB lookup, and only then', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    indexPassRan(db);
    const j = job();
    await j.run();
    expect(LRCLIB_GAP_MS).toBe(1_000);
    expect(j.lrclibAsked).toHaveLength(3);
    expect(j.sleeps).toEqual([1_000, 1_000, 1_000]);
  });

  it(`ends the run after ${LYRICS_STOP_AFTER} LRCLIB failures in a row, saying so once`, async () => {
    indexRecorded(
      db,
      () => true,
      T0,
      (tracks) => {
        for (const t of tracks) Object.assign(t, { HasLyrics: false });
      },
    );
    indexPassRan(db);
    const j = job(rejecting);

    const run = await j.run();

    expect(run).toMatchObject({ resolved: 0, failed: 3, lookups: 3, ended: 'failures' });
    expect(j.lrclibAsked).toHaveLength(3);
    expect(j.warnings).toEqual(['lyrics run ended on failures']);
  });

  it('finds nothing to do on a second run', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    indexPassRan(db);
    const j = job();
    await j.run();
    const asked = [...j.lrclibAsked];

    const again = await j.run();

    expect(again).toMatchObject({ resolved: 0, failed: 0, lookups: 0 });
    expect(j.lrclibAsked).toEqual(asked);
  });

  it('asks no one until a whole Jellyfin index pass has read each track since the flag was added', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    const j = job();
    expect(await j.run()).toMatchObject({ waiting: true, resolved: 0 });
    expect([...j.lrclibAsked, ...j.jellyfinAsked]).toEqual([]);
    expect(cachedIds()).toEqual([]);
  });

  it('reads each track again before its turn, so a change to the index during the run still caches', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    indexPassRan(db);
    let bumped = false;
    const j = job(lrclibRecorded(), () => {
      if (bumped) return;
      bumped = true;
      indexRecorded(
        db,
        (id) => RECORDED.includes(id),
        T0 + 1,
        (tracks) => tracks.forEach((t) => (t.Genres = ['Changed'])),
      );
    });

    await j.run();

    expect(bumped).toBe(true);
    expect(cachedIds()).toEqual(RECORDED);
  });

  it('ends before its next track once the server is closing', async () => {
    indexRecorded(db, (id) => RECORDED.includes(id));
    indexPassRan(db);
    let closing = false;
    const j = job(lrclibRecorded(), () => (closing = true));

    const run = await j.run({ stopped: () => closing });

    expect(run.ended).toBe('stopped');
    expect(j.lrclibAsked).toHaveLength(1);
  });
});
