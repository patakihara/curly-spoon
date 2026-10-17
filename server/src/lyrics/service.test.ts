import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { indexItemSchema, indexQueryResultSchema } from '../adapters/jellyfin/schemas.js';
import { LRCLIB_USER_AGENT, LrclibClient } from '../adapters/lrclib/client.js';
import { albumRow, trackRows } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, indexedRow } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { cachedLyrics, LYRICS_RECHECK_MS } from '../store/lyrics.js';
import { Lyrics } from './service.js';

const ADAPTERS = new URL('../adapters/', import.meta.url);
const T0 = Date.UTC(2026, 9, 17);
const UPSTREAM = 'http://upstream.invalid';

const SECOND_HAND_NEWS = 'e8f41d8c866537d45dcb8bdd002516ca';
const IN_PIECES = 'eb4b9844fa0fbdfb9b39de71b0ce200f';
const GET_LUCKY = '484fcbfff6efe11cfeb2028d3a7babc7';
const YEAR_OF_THE_RAT = '60a0e3527912ae3ae2079fdf5560597e';
const WAKE = '541003a096929c913a036ab427d4563e';

function recording(upstream: 'jellyfin' | 'lrclib', call: string): Recording {
  const file = fileURLToPath(new URL(`${upstream}/recordings/${call}.json`, ADAPTERS));
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
function json(r: Recording): unknown {
  const body = r.response.body;
  if (body === null || !('json' in body)) throw new Error(r.call);
  return body.json;
}

type ListedTrack = { Id: string; HasLyrics?: boolean; Name?: string };

/** An album and its tracks, as recorded, in the one music library; `edit` changes the tracks. */
function indexAlbum(
  db: Db,
  album: unknown,
  tracksCall: string,
  now: number,
  edit: (tracks: ListedTrack[]) => void = () => undefined,
) {
  const parsed = indexItemSchema.parse(album);
  const listed = structuredClone(json(recording('jellyfin', tracksCall))) as {
    Items: ListedTrack[];
  };
  edit(listed.Items);
  const tracks = listed.Items.map((t) => indexItemSchema.parse(t));
  applyTree(
    db,
    { top: albumRow(parsed, 'music'), children: trackRows(parsed.Id, 'music', tracks) },
    now,
    emptyCounts(),
  );
}

const lyricsAlbum = (n: number) =>
  indexQueryResultSchema.parse(json(recording('jellyfin', `lyrics-album-${n}`))).Items[0];

/** Rumours (from M1.index's recordings) and the three albums recorded for M2.lrclib. */
function indexRecorded(db: Db) {
  const tracks = recording('jellyfin', 'index-album-tracks-2');
  const albums = indexQueryResultSchema.parse(json(recording('jellyfin', 'jf-library-albums-1')));
  const rumours = albums.Items.find((a) => a.Id === tracks.request.query.ParentId);
  indexAlbum(db, rumours, 'index-album-tracks-2', T0);
  for (const n of [1, 2, 3]) indexAlbum(db, lyricsAlbum(n), `lyrics-album-${n}-tracks`, T0);
}

/** `fetch`, counting its calls. */
function counted(fetch: FetchLike) {
  const calls: string[] = [];
  const wrapped: FetchLike = (input, init) => {
    calls.push(new URL(input).searchParams.get('track_name') ?? new URL(input).pathname);
    return fetch(input, init);
  };
  return { fetch: wrapped, calls };
}

const jellyfinFetch = () =>
  counted(
    replayFetch(
      ['jf-lyrics-synced', 'jf-lyrics-plain', 'jf-lyrics-none'].map((c) =>
        recording('jellyfin', c),
      ),
    ),
  );
const lrclibFetch = () =>
  counted(
    replayFetch(
      ['lrclib-get-synced', 'lrclib-get-missing', 'lrclib-get-instrumental'].map((c) =>
        recording('lrclib', c),
      ),
    ),
  );
const rejecting: FetchLike = () => Promise.reject(new TypeError('fetch failed'));

let db: Db;
let now: number;
beforeEach(() => {
  db = openDatabase(':memory:');
  now = T0;
  warnings = [];
  indexRecorded(db);
});
afterEach(() => db.close());

let warnings: { details: Record<string, unknown>; message: string }[];
const log = {
  warn: (details: Record<string, unknown>, message: string) => warnings.push({ details, message }),
};

function setUp(lrclib: FetchLike | null = lrclibFetch().fetch, jellyfin = jellyfinFetch().fetch) {
  const lyrics = new Lyrics({
    db,
    log,
    lrclib:
      lrclib === null
        ? null
        : new LrclibClient({ baseUrl: UPSTREAM, fetch: lrclib, userAgent: LRCLIB_USER_AGENT }),
    now: () => now,
  });
  const jf = new JellyfinClient({ baseUrl: UPSTREAM, token: '<token>', fetch: jellyfin });
  return { lyrics, jf };
}

const track = (id: string) => indexedRow(db, 'jellyfin', id)!;

describe("a track's lyrics", () => {
  it("answers Jellyfin's recorded synced lines without asking LRCLIB, and caches them", async () => {
    const lr = lrclibFetch();
    const { lyrics, jf } = setUp(lr.fetch);
    const answer = await lyrics.forTrack(track(SECOND_HAND_NEWS), jf);
    expect(answer.status).toBe('synced');
    expect(answer.source).toBe('jellyfin');
    expect(answer.lines[0]).toEqual({ start: 5.89, text: "I know there's nothing to say" });
    expect(lr.calls).toEqual([]);
    expect(cachedLyrics(db, 'jellyfin', SECOND_HAND_NEWS)).toMatchObject({
      ...answer,
      lrclibId: null,
      itemVersion: 1,
    });
  });

  it("asks LRCLIB, not Jellyfin, for a track Jellyfin has no lyrics for, and caches LRCLIB's synced lines", async () => {
    const jfFetch = jellyfinFetch();
    const { lyrics, jf } = setUp(undefined, jfFetch.fetch);
    const answer = await lyrics.forTrack(track(GET_LUCKY), jf);
    expect(answer).toMatchObject({ status: 'synced', source: 'lrclib' });
    expect(answer.lines[0]).toEqual({ start: 32.19, text: 'Like the legend of the phoenix, huh' });
    expect(jfFetch.calls).toEqual([]);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toMatchObject({ ...answer, lrclibId: 8988585 });
  });

  it('answers a second request from the cache, asking no one', async () => {
    const { lyrics, jf } = setUp();
    const first = await lyrics.forTrack(track(GET_LUCKY), jf);
    const again = setUp(rejecting, rejecting);
    expect(await again.lyrics.forTrack(track(GET_LUCKY), again.jf)).toEqual(first);
  });

  it('caches none for a track no one has lyrics for, asks no one again within 30 days, and asks again after', async () => {
    const lr = lrclibFetch();
    const { lyrics, jf } = setUp(lr.fetch);
    expect(await lyrics.forTrack(track(YEAR_OF_THE_RAT), jf)).toEqual({
      status: 'none',
      source: null,
      lines: [],
    });
    now = T0 + LYRICS_RECHECK_MS - 1;
    await lyrics.forTrack(track(YEAR_OF_THE_RAT), jf);
    expect(lr.calls).toEqual(['Year Of The Rat']);
    now = T0 + LYRICS_RECHECK_MS;
    await lyrics.forTrack(track(YEAR_OF_THE_RAT), jf);
    expect(lr.calls).toEqual(['Year Of The Rat', 'Year Of The Rat']);
    expect(cachedLyrics(db, 'jellyfin', YEAR_OF_THE_RAT)?.resolvedAt).toBe(now);
  });

  it('resolves again once the track moves to a new index version', async () => {
    const lr = lrclibFetch();
    const { lyrics, jf } = setUp(lr.fetch);
    await lyrics.forTrack(track(GET_LUCKY), jf);
    // The only change: Jellyfin now files the track under a genre.
    indexAlbum(db, lyricsAlbum(1), 'lyrics-album-1-tracks', T0 + 1, (tracks) => {
      (tracks.find((t) => t.Id === GET_LUCKY) as { Genres?: string[] }).Genres = ['Disco'];
    });
    expect(track(GET_LUCKY).version).toBe(2);
    await lyrics.forTrack(track(GET_LUCKY), jf);
    expect(lr.calls).toEqual(['Get Lucky', 'Get Lucky']);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)?.itemVersion).toBe(2);
  });

  it('fails, caching nothing, when LRCLIB fails and Jellyfin has no lines', async () => {
    const { lyrics, jf } = setUp(rejecting);
    await expect(lyrics.forTrack(track(GET_LUCKY), jf)).rejects.toBeInstanceOf(AdapterError);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toBeUndefined();
  });

  it("answers Jellyfin's recorded plain lines, uncached, when LRCLIB fails", async () => {
    const { lyrics, jf } = setUp(rejecting);
    const answer = await lyrics.forTrack(track(IN_PIECES), jf);
    expect(answer).toMatchObject({ status: 'plain', source: 'jellyfin' });
    expect(answer.lines[0]).toEqual({ start: null, text: 'Telling me to go' });
    expect(cachedLyrics(db, 'jellyfin', IN_PIECES)).toBeUndefined();
  });

  it('fails, caching nothing and asking LRCLIB nothing, when Jellyfin fails', async () => {
    const lr = lrclibFetch();
    const { lyrics, jf } = setUp(lr.fetch, rejecting);
    await expect(lyrics.forTrack(track(IN_PIECES), jf)).rejects.toBeInstanceOf(AdapterError);
    expect(lr.calls).toEqual([]);
    expect(cachedLyrics(db, 'jellyfin', IN_PIECES)).toBeUndefined();
  });

  it('asks LRCLIB once for two requests for one track at the same time', async () => {
    const lr = lrclibFetch();
    const { lyrics, jf } = setUp(lr.fetch);
    const [a, b] = await Promise.all([
      lyrics.forTrack(track(GET_LUCKY), jf),
      lyrics.forTrack(track(GET_LUCKY), jf),
    ]);
    expect(a).toEqual(b);
    expect(lr.calls).toEqual(['Get Lucky']);
  });

  it("takes LRCLIB's recorded instrumental over Jellyfin's plain lines, and caches it", async () => {
    indexAlbum(db, lyricsAlbum(3), 'lyrics-album-3-tracks', T0, (tracks) => {
      tracks.find((t) => t.Id === WAKE)!.HasLyrics = true;
    });
    const { lyrics, jf } = setUp();
    // No recording pairs the two: Wake's Jellyfin answer is In Pieces' recorded plain file.
    const plainFile = { getLyrics: () => jf.getLyrics(IN_PIECES) };
    expect(await lyrics.forTrack(track(WAKE), plainFile)).toEqual({
      status: 'instrumental',
      source: 'lrclib',
      lines: [],
    });
    expect(cachedLyrics(db, 'jellyfin', WAKE)).toMatchObject({
      status: 'instrumental',
      lrclibId: 1065286,
    });
  });

  it("with LRCLIB off, caches Jellyfin's synced lines only, and answers the rest uncached", async () => {
    const { lyrics, jf } = setUp(null);
    expect((await lyrics.forTrack(track(SECOND_HAND_NEWS), jf)).status).toBe('synced');
    expect((await lyrics.forTrack(track(IN_PIECES), jf)).status).toBe('plain');
    expect(await lyrics.forTrack(track(GET_LUCKY), jf)).toEqual({
      status: 'none',
      source: null,
      lines: [],
    });
    expect(cachedLyrics(db, 'jellyfin', SECOND_HAND_NEWS)).toBeDefined();
    expect(cachedLyrics(db, 'jellyfin', IN_PIECES)).toBeUndefined();
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toBeUndefined();
  });

  it('lists the indexed tracks with no fresh answer, up to the limit', async () => {
    const { lyrics, jf } = setUp();
    const all = lyrics.staleTracks(1000);
    expect(all).toHaveLength(11 + 13 + 14 + 16);
    expect(all.every((t) => t.kind === 'track')).toBe(true);
    await lyrics.forTrack(track(GET_LUCKY), jf);
    const stale = lyrics.staleTracks(1000).map((t) => t.id);
    expect(stale).toHaveLength(all.length - 1);
    expect(stale).not.toContain(GET_LUCKY);
    expect(lyrics.staleTracks(5)).toHaveLength(5);
  });

  it('takes a cached answer it cannot read as none cached: forgets it, says so once, and resolves again', async () => {
    const lr = lrclibFetch();
    const { lyrics, jf } = setUp(lr.fetch);
    await lyrics.forTrack(track(GET_LUCKY), jf);
    db.prepare(`UPDATE lyrics SET lines = '[{"start":null,"text":1}]'`).run();
    const answer = await lyrics.forTrack(track(GET_LUCKY), jf);
    expect(answer).toMatchObject({ status: 'synced', source: 'lrclib' });
    expect(lr.calls).toEqual(['Get Lucky', 'Get Lucky']);
    expect(warnings).toEqual([
      {
        details: expect.objectContaining({ track: GET_LUCKY }),
        message: 'unreadable lyrics forgotten',
      },
    ]);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toMatchObject(answer);
    await lyrics.forTrack(track(GET_LUCKY), jf);
    expect(lr.calls).toHaveLength(2);
    expect(warnings).toHaveLength(1);
  });

  it('answers a failure as a rejected promise, never by throwing', async () => {
    const { lyrics, jf } = setUp();
    const getLucky = track(GET_LUCKY);
    db.close();
    let answer: Promise<unknown> | undefined;
    expect(() => (answer = lyrics.forTrack(getLucky, jf))).not.toThrow();
    await expect(answer).rejects.toThrow();
    db = openDatabase(':memory:');
  });

  it('resolves afresh for a newer version of a track while an older one is still resolving', async () => {
    const lr = lrclibFetch();
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const slowFirst: FetchLike = async (input, init) => {
      if (first) {
        first = false;
        await held;
      }
      return lr.fetch(input, init);
    };
    const { lyrics, jf } = setUp(slowFirst);
    const older = lyrics.forTrack(track(GET_LUCKY), jf);
    indexAlbum(db, lyricsAlbum(1), 'lyrics-album-1-tracks', T0 + 1, (tracks) => {
      (tracks.find((t) => t.Id === GET_LUCKY) as { Genres?: string[] }).Genres = ['Disco'];
    });
    await lyrics.forTrack(track(GET_LUCKY), jf);
    expect(lr.calls).toEqual(['Get Lucky']);
    release();
    await older;
    expect(lr.calls).toEqual(['Get Lucky', 'Get Lucky']);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)?.itemVersion).toBe(2);
  });
});
