/**
 * A track's lyrics through the real route, on an index filled from the recordings: Rumours from
 * M1.index's, and the three albums recorded for M2.lrclib, all in the one Music library that
 * `jf-user-views` records (album recordings carry no library id, so it is supplied here). The
 * person's Jellyfin answers their views and the recorded lyrics files; LRCLIB answers its
 * recorded records. Replay matches a call by method, path and query, so each person's answers
 * are told apart by the token their call carries.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Lyrics as LyricsBody } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { indexItemSchema, indexQueryResultSchema } from './adapters/jellyfin/schemas.js';
import { LRCLIB_USER_AGENT, LrclibClient } from './adapters/lrclib/client.js';
import { buildApp } from './app.js';
import { albumRow, trackRows } from './libraryIndex/rows.js';
import { applyTree, emptyCounts, indexedRow } from './libraryIndex/store.js';
import { parseLrc } from './lyrics/lrc.js';
import { Lyrics } from './lyrics/service.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { cachedLyrics } from './store/lyrics.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = new URL('./adapters/', import.meta.url);
const KEY = Buffer.alloc(32, 7);
const UPSTREAM = 'http://upstream.invalid';
const T0 = Date.UTC(2026, 9, 17);

const SECOND_HAND_NEWS = 'e8f41d8c866537d45dcb8bdd002516ca';
const GET_LUCKY = '484fcbfff6efe11cfeb2028d3a7babc7';
const YEAR_OF_THE_RAT = '60a0e3527912ae3ae2079fdf5560597e';

function recording(upstream: 'jellyfin' | 'lrclib', call: string): Recording {
  const file = fileURLToPath(new URL(`${upstream}/recordings/${call}.json`, ADAPTERS));
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
function json<T>(r: Recording): T {
  const body = r.response.body;
  if (body === null || !('json' in body)) throw new Error(r.call);
  return body.json as T;
}

const userViews = recording('jellyfin', 'jf-user-views');
const MUSIC = json<{ Items: { Id: string }[] }>(userViews).Items[0]!.Id;
/** otto's `GET /UserViews`: the recorded one, without the Music library. The only change. */
const ottoViews = structuredClone(userViews);
Object.assign(json<object>(ottoViews), { Items: [], TotalRecordCount: 0 });

type ListedTrack = { Id: string; Genres?: string[] };

/** An album and its tracks, as recorded, in the Music library; `edit` changes the tracks. */
function indexAlbum(
  db: Db,
  album: unknown,
  tracksCall: string,
  now: number,
  edit: (tracks: ListedTrack[]) => void = () => undefined,
) {
  const parsed = indexItemSchema.parse(album);
  const listed = structuredClone(json<{ Items: ListedTrack[] }>(recording('jellyfin', tracksCall)));
  edit(listed.Items);
  const tracks = listed.Items.map((t) => indexItemSchema.parse(t));
  applyTree(
    db,
    { top: albumRow(parsed, MUSIC), children: trackRows(parsed.Id, MUSIC, tracks) },
    now,
    emptyCounts(),
  );
}
const lyricsAlbum = (n: number) =>
  indexQueryResultSchema.parse(json(recording('jellyfin', `lyrics-album-${n}`))).Items[0];
const RUMOURS = recording('jellyfin', 'index-album-tracks-2').request.query.ParentId!;

function indexRecorded(db: Db) {
  const albums = indexQueryResultSchema.parse(json(recording('jellyfin', 'jf-library-albums-1')));
  indexAlbum(
    db,
    albums.Items.find((a) => a.Id === RUMOURS),
    'index-album-tracks-2',
    T0,
  );
  for (const n of [1, 2, 3]) indexAlbum(db, lyricsAlbum(n), `lyrics-album-${n}-tracks`, T0);
}

const jellyfinLyrics = ['jf-lyrics-synced', 'jf-lyrics-plain', 'jf-lyrics-none'].map((c) =>
  recording('jellyfin', c),
);
const lrclibRecordings = ['lrclib-get-synced', 'lrclib-get-missing', 'lrclib-get-instrumental'];
const recordedLrc = json<{ id: number; syncedLyrics: string }>(
  recording('lrclib', 'lrclib-get-synced'),
);
const recordedJellyfin = json<{ Lyrics: { Text: string; Start: number }[] }>(
  recording('jellyfin', 'jf-lyrics-synced'),
);

/** An LRCLIB fetch that fails the test if it is ever called. */
const neverLrclib: FetchLike = () => {
  throw new Error('LRCLIB was asked');
};
const rejecting: FetchLike = () => Promise.reject(new TypeError('fetch failed'));

let apps: FastifyInstance[] = [];
let db: Db;
let bearer: Record<string, string>;
beforeEach(() => {
  db = openDatabase(':memory:');
  indexRecorded(db);
  bearer = {};
  for (const name of ['kara', 'otto', 'nora']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    if (name !== 'nora') {
      saveLink(db, KEY, {
        userId: user.id,
        service: 'jellyfin',
        upstreamUserId: `jellyfin-${name}`,
        token: `jellyfin-token-${name}`,
        state: 'linked',
      });
    }
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

/**
 * The app on the recordings. `jellyfinAsked` and `lrclibAsked` list each call's path, and
 * LRCLIB's by the track it names; `lrclib` and `jellyfinLyricsFetch` replace either side.
 */
async function server(options: { lrclib?: FetchLike; jellyfinLyricsFetch?: FetchLike } = {}) {
  const jellyfinAsked: string[] = [];
  const lrclibAsked: string[] = [];
  const kara = replayFetch([userViews, ...jellyfinLyrics]);
  const otto = replayFetch([ottoViews, ...jellyfinLyrics]);
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    jellyfinAsked.push(`${pathname}${search}`);
    if (options.jellyfinLyricsFetch && pathname.endsWith('/Lyrics')) {
      return options.jellyfinLyricsFetch(url, init);
    }
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    return (authorization.includes('otto') ? otto : kara)(url, init);
  };
  const lrclibFetch =
    options.lrclib ?? replayFetch(lrclibRecordings.map((c) => recording('lrclib', c)));
  const countedLrclib: FetchLike = (url, init) => {
    lrclibAsked.push(new URL(url).searchParams.get('track_name') ?? new URL(url).pathname);
    return lrclibFetch(url, init);
  };
  const lyrics = new Lyrics({
    db,
    log: { warn: () => undefined },
    lrclib: new LrclibClient({
      baseUrl: UPSTREAM,
      fetch: countedLrclib,
      userAgent: LRCLIB_USER_AGENT,
    }),
    now: () => T0,
  });
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: { key: KEY, config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM }, fetch },
    lyrics,
  });
  apps.push(app);
  const get = async (key: string, name: string | null = 'kara') => {
    const headers: Record<string, string> =
      name === null ? {} : { authorization: `Bearer ${bearer[name] ?? ''}` };
    const res = await app.inject({ method: 'GET', url: `/api/lyrics/${key}`, headers });
    return { status: res.statusCode, body: res.json<unknown>() };
  };
  const lyricsOf = async (id: string) => {
    const { status, body } = await get(`jellyfin:${id}`);
    expect(status).toBe(200);
    return LyricsBody.parse(body);
  };
  return { get, lyricsOf, jellyfinAsked, lrclibAsked };
}

describe("[M2.lrclib] a track's lyrics, from the recordings", () => {
  it("[M2.lrclib/a] answers Jellyfin's recorded synced lyrics with each line's time in seconds and its text, in order", async () => {
    const s = await server();

    const answer = await s.lyricsOf(SECOND_HAND_NEWS);

    expect(answer).toEqual({
      ref: { source: 'jellyfin', id: SECOND_HAND_NEWS },
      status: 'synced',
      source: 'jellyfin',
      lines: recordedJellyfin.Lyrics.map((l) => ({
        start: Math.round(l.Start / 10_000) / 1000,
        text: l.Text,
      })),
    });
    expect(answer.lines[0]).toEqual({ start: 5.89, text: "I know there's nothing to say" });
    expect(answer.lines.length).toBeGreaterThan(1);
    expect(s.lrclibAsked).toEqual([]);
  });

  it("[M2.lrclib/b] gives a track Jellyfin has no lyrics for LRCLIB's recorded synced lyrics, and stores them in the cache", async () => {
    const s = await server();

    const answer = await s.lyricsOf(GET_LUCKY);

    const lines = parseLrc(recordedLrc.syncedLyrics);
    expect(lines.length).toBeGreaterThan(0);
    expect(answer).toEqual({
      ref: { source: 'jellyfin', id: GET_LUCKY },
      status: 'synced',
      source: 'lrclib',
      lines,
    });
    expect(s.lrclibAsked).toEqual(['Get Lucky']);
    expect(s.jellyfinAsked.filter((p) => p.endsWith('/Lyrics'))).toEqual([]);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toMatchObject({
      status: 'synced',
      source: 'lrclib',
      lines,
      lrclibId: recordedLrc.id,
      itemVersion: indexedRow(db, 'jellyfin', GET_LUCKY)!.version,
    });
  });

  it('[M2.lrclib/c] answers a second request for those lyrics from the cache, making no LRCLIB call', async () => {
    const first = await (await server()).lyricsOf(GET_LUCKY);
    const again = await server({ lrclib: neverLrclib });

    expect(await again.lyricsOf(GET_LUCKY)).toEqual(first);
    expect(again.lrclibAsked).toEqual([]);
    expect(again.jellyfinAsked).toEqual(['/UserViews?includeHidden=true']);
  });

  it('answers none for a track no one has lyrics for', async () => {
    const s = await server();
    expect(await s.lyricsOf(YEAR_OF_THE_RAT)).toEqual({
      ref: { source: 'jellyfin', id: YEAR_OF_THE_RAT },
      status: 'none',
      source: null,
      lines: [],
    });
  });

  it('caches lyrics for the track as the index now holds it', async () => {
    indexAlbum(db, lyricsAlbum(1), 'lyrics-album-1-tracks', T0 + 1, (tracks) => {
      tracks.find((t) => t.Id === GET_LUCKY)!.Genres = ['Disco'];
    });
    expect(indexedRow(db, 'jellyfin', GET_LUCKY)!.version).toBe(2);
    await (await server()).lyricsOf(GET_LUCKY);
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)?.itemVersion).toBe(2);
  });

  it('answers 502, writing nothing, when LRCLIB fails and Jellyfin has no lines', async () => {
    const s = await server({ lrclib: rejecting });
    expect(await s.get(`jellyfin:${GET_LUCKY}`)).toEqual({
      status: 502,
      body: { error: 'upstream_failed' },
    });
    expect(cachedLyrics(db, 'jellyfin', GET_LUCKY)).toBeUndefined();
  });

  it('answers 502, writing nothing, when Jellyfin fails to give its lyrics', async () => {
    const s = await server({ jellyfinLyricsFetch: rejecting });
    expect(await s.get(`jellyfin:${SECOND_HAND_NEWS}`)).toEqual({
      status: 502,
      body: { error: 'upstream_failed' },
    });
    expect(cachedLyrics(db, 'jellyfin', SECOND_HAND_NEWS)).toBeUndefined();
  });

  it('answers 404 for anything but an indexed Jellyfin track: a book, an album, an id not indexed', async () => {
    const s = await server();
    const notFound = { status: 404, body: { error: 'not_found' } };
    expect(await s.get('abs:4f4c1e0a-0000-0000-0000-000000000000')).toEqual(notFound);
    expect(await s.get(`jellyfin:${RUMOURS}`)).toEqual(notFound);
    expect(await s.get(`jellyfin:${'0'.repeat(32)}`)).toEqual(notFound);
    expect(s.lrclibAsked).toEqual([]);
  });

  it("answers 404 for a track in a library the person's Jellyfin does not show them, before reading the cache", async () => {
    await (await server()).lyricsOf(SECOND_HAND_NEWS);
    const s = await server({ lrclib: neverLrclib });
    expect(await s.get(`jellyfin:${SECOND_HAND_NEWS}`, 'otto')).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  it('answers 404 to a person with no linked Jellyfin, 400 to a malformed ref, 401 when signed out', async () => {
    const s = await server();
    expect(await s.get(`jellyfin:${SECOND_HAND_NEWS}`, 'nora')).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect((await s.get('jellyfin:not-hex')).status).toBe(400);
    expect((await s.get(`jellyfin:${SECOND_HAND_NEWS}`, null)).status).toBe(401);
    expect(s.jellyfinAsked).toEqual([]);
  });
});
