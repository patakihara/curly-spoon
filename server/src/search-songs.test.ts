/**
 * Search's song rows through the real routes: YouTube Music answers from its recordings, the extractor
 * is a stand-in that only counts its runs, and what the household holds is written to the index as the
 * index job does.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { SearchResults } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { type YtSong, YtMusicClient } from './adapters/ytmusic/client.js';
import { buildApp } from './app.js';
import { type IndexRow } from './libraryIndex/rows.js';
import { applyRow, emptyCounts } from './libraryIndex/store.js';
import { SongCatalogue, songRows, type SongSource } from './music/catalogue.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type PlayerAnswer, playerAnswerSchema } from './adapters/ytmusic/schemas.js';
import { type DirectResolve } from './music/direct.js';
import { type SpawnLike } from './music/extractor.js';
import { MOST_AHEAD_PER_MINUTE, Music } from './music/index.js';
import { parsePlayer, PlayerRefused, StreamUrl } from './music/schemas.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { rememberTracks, streamedTrack } from './store/streamedTracks.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const recording = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, 'ytmusic', 'recordings', `${call}.json`), 'utf8')),
  );
const T0 = Date.UTC(2026, 10, 7, 8);
const log = { warn: () => undefined, error: () => undefined };
const clip = readFileSync(join(ADAPTERS, 'googlevideo', 'recordings', 'opus-clip.webm'));
const SIZE = clip.byteLength;
const CHUNK = Math.ceil(SIZE / 8);
const playerOk = recordingSchema.parse(
  JSON.parse(readFileSync(join(ADAPTERS, 'ytmusic', 'recordings', 'player-visionos.json'), 'utf8')),
);

/** YouTube's player as recorded, answering for any id, its formats the clip's size; every ask counted. */
function directPlayer(fails = false) {
  const asked = vi.fn((id: string) => id);
  const direct: DirectResolve = async (id) => {
    asked(id);
    if (fails) throw new PlayerRefused('notPlayable');
    const raw = structuredClone((playerOk.response.body as { json: PlayerAnswer }).json);
    raw.videoDetails = { ...raw.videoDetails, videoId: id };
    raw.streamingData = {
      ...raw.streamingData,
      adaptiveFormats: (raw.streamingData?.adaptiveFormats ?? []).map((row) => ({
        ...(row as object),
        contentLength: String(SIZE),
      })),
    };
    return parsePlayer(playerAnswerSchema.parse(raw), id);
  };
  return { direct, asked };
}

/** The stream host: closed ranges of the clip; `hold` leaves an answer waiting until it is stopped. */
function streamHost(hold = false) {
  const asked: string[] = [];
  const stopped: string[] = [];
  const fetch: FetchLike = async (_url, init) => {
    const range = new Headers(init?.headers).get('range') ?? '';
    asked.push(range);
    if (hold) {
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => {
          stopped.push(range);
          reject(new Error('aborted'));
        }),
      );
    }
    const [first = 0, last = 0] = range.replace('bytes=', '').split('-').map(Number);
    const end = Math.min(last, SIZE - 1);
    return new Response(clip.subarray(first, end + 1), {
      status: 206,
      headers: { 'content-type': 'audio/webm', 'content-range': `bytes ${first}-${end}/${SIZE}` },
    });
  };
  return { fetch, asked, stopped };
}

const recorded = (): YtMusicClient =>
  new YtMusicClient({
    baseUrl: 'http://upstream.invalid',
    fetch: replayFetch([recording('search-songs')]),
    now: () => T0,
  });

function ownedTrack(db: Db, id: string, title: string, artists: string[]) {
  const row: IndexRow = {
    source: 'jellyfin',
    id,
    kind: 'track',
    parentId: null,
    libraryId: 'music',
    title,
    creators: artists.map((name) => ({ name, role: 'artist' as const })),
    series: [],
    genres: [],
    position: null,
    disc: null,
    duration: 60,
    year: null,
    publishedAt: null,
    upstreamVersion: null,
    ids: {},
    episodeOrder: null,
    hasArt: false,
    hasLyrics: false,
  };
  applyRow(db, row, T0, emptyCounts());
}

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function server(
  options: {
    client?: SongSource;
    music?: false;
    now?: () => number;
    direct?: DirectResolve;
    streamFetch?: FetchLike;
    warmHost?: (url: StreamUrl) => void;
  } = {},
) {
  const db = openDatabase(':memory:');
  const dataDir = mkdtempSync(join(tmpdir(), 'auralis-search-songs-'));
  dirs.push(dataDir);
  const runs = vi.fn();
  const warned: string[] = [];
  const spawn: SpawnLike = (_file, args) => {
    runs(args.at(-1));
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    setImmediate(() => {
      stderr.write('ERROR: [youtube] x: Video unavailable');
      stdout.end();
      stderr.end();
      child.emit('close', 1);
    });
    return child;
  };
  const client = options.client ?? recorded();
  const search = vi.fn((q: string) => client.search(q));
  const music =
    options.music === false
      ? null
      : new Music({
          db,
          log: { warn: (_d, message) => warned.push(message), error: () => undefined },
          now: options.now ?? (() => T0),
          dataDir,
          capBytes: options.streamFetch === undefined ? 1024 : SIZE * 10,
          imagePath: '/opt/yt-dlp/2026.10.26/yt-dlp',
          streamFetch: options.streamFetch ?? (() => Promise.reject(new Error('no stream host'))),
          chunkBytes: CHUNK,
          ...(options.direct === undefined ? {} : { direct: options.direct }),
          ...(options.warmHost === undefined ? {} : { warmHost: options.warmHost }),
          canary: async () => ({ passed: false, reason: 'unavailable', ms: 1 }),
          spawn,
          client: { search, radio: (id) => client.radio(id) },
          searchLimitMs: 100,
        });
  music?.prepare();
  const app = await buildApp({ webDistDir: null, db, music, now: () => T0, logger: false });
  apps.push(app);
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  const device = createDevice(db, { userId: user.id, kind: 'web' });
  const { token } = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
  const headers = { authorization: `Bearer ${token}` };
  const ask = async (q = 'a song', kinds = '') => {
    const url = `/api/search?q=${encodeURIComponent(q)}${kinds}`;
    const answer = await app.inject({ method: 'GET', url, headers });
    expect(answer.statusCode, answer.body).toBe(200);
    return SearchResults.parse(answer.json());
  };
  return { app, db, music, headers, ask, search, runs, warned };
}

const songsOnRecord = () => recorded().search('a song');

describe('[M3.ytmusic/a] song rows in Search', () => {
  it('[M3.ytmusic/a] lists what YouTube Music finds, each playing straight away', async () => {
    const { ask } = await server();
    const [first] = await songsOnRecord();
    const { songs, streaming } = await ask();
    expect(streaming).toBe('ok');
    expect(songs.length).toBeGreaterThan(1);
    expect(songs[0]).toMatchObject({
      ref: { source: 'ytmusic', id: first!.id },
      title: first!.title,
      artists: first!.artists,
      duration: first!.duration,
      availability: { kind: 'streamable' },
    });
    expect(songs.every(({ availability }) => availability.kind === 'streamable')).toBe(true);
  });

  it('[M3.ytmusic/a] a row plays: it is what POST /play may name, without any request', async () => {
    const { ask, db } = await server();
    const { songs } = await ask();
    for (const song of songs) expect(streamedTrack(db, song.ref.id)).toBeDefined();
  });

  it('[M3.ytmusic/a] art comes by id through this server, never as the upstream address', async () => {
    const { ask } = await server();
    const { songs } = await ask();
    const art = songs.find((song) => song.art !== null)!.art!;
    expect(art).toMatch(/^\/api\/media\/ytmusic:[\w-]{11}\/art/);
    expect(JSON.stringify(songs)).not.toContain('googleusercontent');
  });

  it('[M3.ytmusic/a] an owned song is left out, however its title is dressed', async () => {
    const { ask, db } = await server();
    const [first] = await songsOnRecord();
    ownedTrack(db, 'owned-1', `${first!.title.toUpperCase()} (Remastered 2011)`, first!.artists);
    const { songs } = await ask();
    expect(songs.map(({ ref }) => ref.id)).not.toContain(first!.id);
    expect(songs.length).toBeGreaterThan(0);
  });

  it('[M3.ytmusic/a] the same words by someone else stay', async () => {
    const { ask, db } = await server();
    const [first] = await songsOnRecord();
    ownedTrack(db, 'owned-1', first!.title, ['Nobody Alike']);
    const { songs } = await ask();
    expect(songs.map(({ ref }) => ref.id)).toContain(first!.id);
  });

  it('[M3.ytmusic/a] one song with two rows upstream is listed once', async () => {
    const song: YtSong = {
      id: 'aaaaaaaaaaa',
      title: 'A Song',
      artists: ['Someone'],
      album: null,
      duration: 200,
      artUrl: null,
      type: 'ATV',
    };
    const client: SongSource = {
      search: async () => [song, { ...song, id: 'bbbbbbbbbbb', type: 'OMV' }],
      radio: async () => [],
    };
    const { ask } = await server({ client });
    expect((await ask()).songs.map(({ ref }) => ref.id)).toEqual(['aaaaaaaaaaa']);
  });

  it('[M3.ytmusic/a] a row too long to play is not listed', async () => {
    const song: YtSong = {
      id: 'aaaaaaaaaaa',
      title: 'A Mix',
      artists: ['Someone'],
      album: null,
      duration: 3 * 3600 + 1,
      artUrl: null,
      type: 'ATV',
    };
    const { ask } = await server({
      client: { search: async () => [song], radio: async () => [] },
    });
    expect((await ask()).songs).toEqual([]);
  });

  it('[M3.ytmusic/a] the source down still answers the library, with no rows', async () => {
    const client: SongSource = {
      search: () => Promise.reject(new Error('down')),
      radio: () => Promise.reject(new Error('down')),
    };
    const { ask, db } = await server({ client });
    ownedTrack(db, 'owned-1', 'A Song', ['Someone']);
    const answer = await ask('a song');
    expect(answer.songs).toEqual([]);
    expect(answer.streaming).toBe('ok');
    expect(answer.results.map(({ ref }) => ref.id)).toContain('owned-1');
  });

  it('[M3.ytmusic/a] a source that never answers costs only the limit', async () => {
    const client: SongSource = {
      search: () => new Promise(() => undefined),
      radio: () => new Promise(() => undefined),
    };
    const { ask } = await server({ client });
    expect((await ask()).songs).toEqual([]);
  });

  it('[M3.ytmusic/a] a suggestion asks nothing of it', async () => {
    const { app, headers, search } = await server();
    const answer = await app.inject({
      method: 'GET',
      url: '/api/search/suggest?q=a%20song',
      headers,
    });
    expect(answer.statusCode).toBe(200);
    expect(search).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic/a] a kinds filter without tracks skips it; one with tracks asks', async () => {
    const { ask, search } = await server();
    expect((await ask('a song', '&kinds=book')).songs).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect((await ask('a song', '&kinds=track')).songs.length).toBeGreaterThan(0);
  });

  it('[M3.ytmusic/a] while streaming is unavailable it says so plainly: no rows, nothing asked', async () => {
    const { ask, music, search, runs } = await server();
    music!.state.canaryFailed('blocked');
    const answer = await ask();
    expect(answer.streaming).toBe('unavailable');
    expect(answer.songs).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(runs).not.toHaveBeenCalled();
    music!.state.succeeded();
    const back = await ask();
    expect(back.streaming).toBe('ok');
    expect(back.songs.length).toBeGreaterThan(0);
  });

  it('[M3.ytmusic] the top two rows are resolved ahead through the direct call alone, once in five minutes', async () => {
    const { direct, asked } = directPlayer();
    const { ask, runs } = await server({ direct, streamFetch: streamHost().fetch });
    const { songs } = await ask();
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
    await ask();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(asked.mock.calls.map(([id]) => id)).toEqual([songs[0]!.ref.id, songs[1]!.ref.id]);
    expect(runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic] the search answers without waiting on its resolve ahead', async () => {
    const asked = vi.fn();
    const { ask } = await server({
      direct: (id) => {
        asked(id);
        return new Promise(() => undefined);
      },
    });
    expect((await ask()).songs.length).toBeGreaterThan(1);
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it('[M3.ytmusic] a direct failure ahead spawns nothing, and says nothing of streaming', async () => {
    const { direct, asked } = directPlayer(true);
    const { ask, music, runs, warned } = await server({ direct });
    await ask();
    await vi.waitFor(() => expect(warned).toContain('a song could not be resolved ahead'));
    await new Promise((settled) => setTimeout(settled, 20));
    expect(asked).toHaveBeenCalledTimes(2);
    expect(runs).not.toHaveBeenCalled();
    expect(music!.state.available).toBe(true);
  });

  it('[M3.ytmusic] with no direct call, nothing is resolved ahead and nothing spawns', async () => {
    const { ask, runs } = await server();
    await ask();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic] while streaming is unavailable nothing is resolved ahead', async () => {
    const { direct, asked } = directPlayer();
    const host = streamHost();
    const { ask, music } = await server({ direct, streamFetch: host.fetch });
    music!.state.canaryFailed('blocked');
    await ask();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(asked).not.toHaveBeenCalled();
    expect(host.asked).toEqual([]);
  });

  it('[M3.ytmusic] the top row alone has its first chunk fetched, and a tap on it asks the player and the host nothing more', async () => {
    const { direct, asked } = directPlayer();
    const host = streamHost();
    const { app, ask, headers, runs } = await server({ direct, streamFetch: host.fetch });
    const { songs } = await ask();
    await vi.waitFor(() => expect(host.asked).toEqual([`bytes=0-${CHUNK - 1}`]));
    await new Promise((settled) => setTimeout(settled, 20));
    expect(host.asked).toHaveLength(1);
    const ref = songs[0]!.ref;
    const played = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers,
      payload: { ref },
    });
    expect(played.statusCode, played.body).toBe(200);
    const track = await app.inject({
      method: 'GET',
      url: `/api/media/ytmusic:${ref.id}/tracks/0`,
      headers: { ...headers, range: `bytes=0-${CHUNK - 1}` },
    });
    expect(track.statusCode).toBe(206);
    expect(track.rawPayload.equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(asked).toHaveBeenCalledTimes(2);
    expect(host.asked).toHaveLength(1);
    expect(runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic] each row resolved ahead has its stream host looked up as it resolves', async () => {
    const recorded = directPlayer().direct;
    // Each song served from a host of its own, named after it.
    const direct: DirectResolve = async (id) => {
      const info = await recorded(id);
      const own = (url: StreamUrl) => new StreamUrl(url.reveal().replace('://', `://${id}.`));
      return { ...info, formats: info.formats.map((row) => ({ ...row, url: own(row.url) })) };
    };
    const warmed = new Set<string>();
    const { ask } = await server({
      direct,
      warmHost: (url) => warmed.add(new URL(url.reveal()).hostname.split('.')[0]!),
    });
    const { songs } = await ask();
    await vi.waitFor(() => expect(warmed.size).toBe(2));
    const ids = [songs[0]!.ref.id, songs[1]!.ref.id].map((id) => id.toLowerCase());
    expect([...warmed].sort()).toEqual(ids.sort());
  });

  it('[M3.ytmusic] a tapped song has its stream host looked up as soon as it resolves, before its first fetch', async () => {
    const { direct } = directPlayer();
    const host = streamHost();
    const order: string[] = [];
    const { app, ask, headers } = await server({
      direct,
      streamFetch: (url, init) => {
        order.push('fetch');
        return host.fetch(url, init);
      },
      warmHost: () => order.push('warm'),
    });
    const { songs } = await ask();
    await new Promise((settled) => setTimeout(settled, 20));
    order.length = 0;
    const ref = songs[3]!.ref;
    const played = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers,
      payload: { ref },
    });
    expect(played.statusCode, played.body).toBe(200);
    expect(order).toEqual(['warm']);
  });

  it('[M3.ytmusic] a URL refused to the chunk fetched ahead is resolved again through the direct call, never a process', async () => {
    const player = directPlayer();
    const asked = vi.fn();
    // The first two rows resolve; the re-resolve after the refusal fails, which yt-dlp would answer.
    const direct: DirectResolve = (id) => {
      asked(id);
      return asked.mock.calls.length <= 2
        ? player.direct(id)
        : Promise.reject(new PlayerRefused('notPlayable'));
    };
    const streamFetch: FetchLike = async () => new Response('', { status: 403 });
    const { ask, runs, warned } = await server({ direct, streamFetch });
    const { songs } = await ask();
    await vi.waitFor(() => expect(warned).toContain('a song could not be fetched ahead'));
    await new Promise((settled) => setTimeout(settled, 20));
    expect(asked.mock.calls.map(([id]) => id as string)).toEqual([
      songs[0]!.ref.id,
      songs[1]!.ref.id,
      songs[0]!.ref.id,
    ]);
    expect(runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic] a row that would not play is never resolved ahead', async () => {
    const { direct, asked } = directPlayer();
    const { ask, db, music } = await server({
      direct,
      client: { search: async () => [], radio: async () => [] },
    });
    await ask();
    const [first] = await songsOnRecord();
    const row = songRows(db, 'someone', [first!])[0]!;
    rememberTracks(db, [{ ...first!, id: 'ccccccccccc', duration: 3 * 3600 + 1 }], T0);
    music!.resolveAhead('a-device', [
      { ...row, availability: { kind: 'external', requestable: false } },
      { ...row, ref: { source: 'ytmusic', id: 'zzzzzzzzzzz' } },
    ]);
    music!.resolveAhead('a-device', [{ ...row, ref: { source: 'ytmusic', id: 'ccccccccccc' } }]);
    await new Promise((settled) => setTimeout(settled, 20));
    expect(asked).not.toHaveBeenCalled();
  });

  it("[M3.ytmusic] a new search's top row stops the last one's chunk fetch", async () => {
    const [first, second, third] = await songsOnRecord();
    const client: SongSource = {
      search: async (q) => (q === 'other' ? [third!, second!] : [first!, second!]),
      radio: async () => [],
    };
    const host = streamHost(true);
    const { ask } = await server({
      client,
      direct: directPlayer().direct,
      streamFetch: host.fetch,
    });
    await ask('a song');
    await vi.waitFor(() => expect(host.asked).toHaveLength(1));
    await ask('other');
    await vi.waitFor(() => expect(host.stopped).toHaveLength(1));
    await vi.waitFor(() => expect(host.asked).toHaveLength(2));
  });

  it("[M3.ytmusic] an older search's resolve ahead, slower than the newer one's, fetches nothing", async () => {
    const [first, , third] = await songsOnRecord();
    const client: SongSource = {
      search: async (q) => (q === 'other' ? [third!] : [first!]),
      radio: async () => [],
    };
    const player = directPlayer();
    const direct: DirectResolve = async (id) => {
      if (id === first!.id) await new Promise((settled) => setTimeout(settled, 60));
      return player.direct(id);
    };
    const host = streamHost(true);
    const { ask } = await server({ client, direct, streamFetch: host.fetch });
    await ask('a song');
    await ask('other');
    await vi.waitFor(() => expect(player.asked).toHaveBeenCalledWith(first!.id));
    await new Promise((settled) => setTimeout(settled, 40));
    expect(host.asked).toHaveLength(1);
    expect(host.stopped).toEqual([]);
  });

  it('[M3.ytmusic] searches never ask more than the minute’s share of resolves ahead', async () => {
    const songOf = (n: number): YtSong => ({
      id: `song${String(n).padStart(7, '0')}`,
      title: `Song ${n}`,
      artists: [`Artist ${n}`],
      album: null,
      duration: 200,
      artUrl: null,
      type: 'ATV',
    });
    const client: SongSource = {
      search: async (q) => [songOf(Number(q) * 2), songOf(Number(q) * 2 + 1)],
      radio: async () => [],
    };
    const { direct, asked } = directPlayer();
    const { ask } = await server({ client, direct, streamFetch: streamHost().fetch });
    for (let n = 0; n < MOST_AHEAD_PER_MINUTE; n += 1) await ask(String(n));
    await new Promise((settled) => setTimeout(settled, 20));
    expect(asked).toHaveBeenCalledTimes(MOST_AHEAD_PER_MINUTE);
  });

  it('[M3.ytmusic/a] with no music configured, no rows and streaming ok', async () => {
    const { ask } = await server({ music: false });
    const answer = await ask();
    expect(answer.songs).toEqual([]);
    expect(answer.streaming).toBe('ok');
  });
});

describe('[M3.ytmusic/e] the song a Jellyfin track is', () => {
  const catalogue = (db: Db, client: SongSource) =>
    new SongCatalogue({ client, db, now: () => T0, log });

  it('[M3.ytmusic/e] is the top row whose title and artist match, then held in the table', async () => {
    const db = openDatabase(':memory:');
    const [first] = await songsOnRecord();
    ownedTrack(db, 'owned-1', first!.title, first!.artists);
    const search = vi.fn((q: string) => recorded().search(q));
    const songs = catalogue(db, { search, radio: async () => [] });
    expect(await songs.seedFor('owned-1')).toBe(first!.id);
    expect(await songs.seedFor('owned-1')).toBe(first!.id);
    expect(search).toHaveBeenCalledTimes(1);
    expect(await catalogue(db, { search, radio: async () => [] }).seedFor('owned-1')).toBe(
      first!.id,
    );
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('[M3.ytmusic/e] no row matching is no seed', async () => {
    const db = openDatabase(':memory:');
    ownedTrack(db, 'owned-1', 'Nothing Like Any Of These', ['Nobody Alike']);
    const songs = catalogue(db, { search: (q) => recorded().search(q), radio: async () => [] });
    expect(await songs.seedFor('owned-1')).toBeNull();
    expect(await songs.seedFor('not-indexed')).toBeNull();
  });
});

describe('[M3.ytmusic] one song under other names', () => {
  const song = (id: string, title: string, artists: string[]): YtSong => ({
    id,
    title,
    artists,
    album: null,
    duration: 200,
    artUrl: null,
    type: 'ATV',
  });
  const catalogue = (db: Db, radio: YtSong[]) =>
    new SongCatalogue({
      client: { search: async () => [], radio: async () => radio },
      db,
      now: () => T0,
      log,
    });

  it('[M3.ytmusic] a radio holding one song under two videos plays it once', async () => {
    const db = openDatabase(':memory:');
    const picks = await catalogue(db, [
      song('aaaaaaaaaaa', 'Take on Me', ['a-ha']),
      song('bbbbbbbbbbb', 'Take on Me', ['a-ha']),
      song('ccccccccccc', 'Forever Young', ['Alphaville']),
    ]).radio('zzzzzzzzzzz');
    expect(picks.map(({ id }) => id)).toEqual(['aaaaaaaaaaa', 'ccccccccccc']);
  });

  it('[M3.ytmusic] a radio does not follow a song with its other video', async () => {
    const db = openDatabase(':memory:');
    const seed = song('zzzzzzzzzzz', 'Take on Me', ['a-ha']);
    rememberTracks(db, [seed], T0);
    const picks = await catalogue(db, [
      song('aaaaaaaaaaa', 'Take on Me', ['a-ha']),
      song('ccccccccccc', 'Forever Young', ['Alphaville']),
    ]).radio(seed.id);
    expect(picks.map(({ id }) => id)).toEqual(['ccccccccccc']);
  });

  it('[M3.ytmusic] an artist whose name only holds the letters of an owned artist is another song', () => {
    const db = openDatabase(':memory:');
    ownedTrack(db, 'owned-1', 'Run', ['Air']);
    const rows = songRows(db, 'someone', [song('aaaaaaaaaaa', 'Run', ['Fair to Midland'])]);
    expect(rows.map(({ ref }) => ref.id)).toEqual(['aaaaaaaaaaa']);
  });
});

describe('[M3.ytmusic] which song a Jellyfin track is', () => {
  it('[M3.ytmusic] stays remembered for the newest tracks only, the oldest pruned', async () => {
    const db = openDatabase(':memory:');
    const search = vi.fn(async (q: string): Promise<YtSong[]> => {
      const title = q.split(' ')[0]!;
      return [
        {
          id: `${title}-video`,
          title,
          artists: ['An Artist'],
          album: null,
          duration: 200,
          artUrl: null,
          type: 'ATV',
        },
      ];
    });
    const songs = new SongCatalogue({
      client: { search, radio: async () => [] },
      db,
      now: () => T0,
      log,
      mostSeeds: 2,
    });
    for (const n of ['One', 'Two', 'Three']) {
      ownedTrack(db, `owned-${n}`, n, ['An Artist']);
      await songs.seedFor(`owned-${n}`);
    }
    const held = db.prepare('SELECT jellyfin_id FROM streamed_seeds ORDER BY rowid').all();
    expect(held).toEqual([{ jellyfin_id: 'owned-Two' }, { jellyfin_id: 'owned-Three' }]);
  });
});
