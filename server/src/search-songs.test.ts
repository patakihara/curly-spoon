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
import { SongCatalogue, type SongSource } from './music/catalogue.js';
import { type SpawnLike } from './music/extractor.js';
import { Music } from './music/index.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { streamedTrack } from './store/streamedTracks.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const recording = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, 'ytmusic', 'recordings', `${call}.json`), 'utf8')),
  );
const T0 = Date.UTC(2026, 10, 7, 8);
const log = { warn: () => undefined, error: () => undefined };

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

async function server(options: { client?: SongSource; music?: false; now?: () => number } = {}) {
  const db = openDatabase(':memory:');
  const dataDir = mkdtempSync(join(tmpdir(), 'auralis-search-songs-'));
  dirs.push(dataDir);
  const runs = vi.fn();
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
          log,
          now: options.now ?? (() => T0),
          dataDir,
          capBytes: 1024,
          imagePath: '/opt/yt-dlp/2026.10.26/yt-dlp',
          streamFetch: () => Promise.reject(new Error('no stream host')),
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
  return { app, db, music, headers, ask, search, runs };
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

  it('[M3.ytmusic/a] the top row alone is resolved ahead, once for a repeat search', async () => {
    const { ask, runs, search } = await server();
    const { songs } = await ask();
    await vi.waitFor(() => expect(runs).toHaveBeenCalled());
    await ask();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(search).toHaveBeenCalledTimes(1);
    expect(new Set(runs.mock.calls.map(([id]) => id as string))).toEqual(
      new Set([songs[0]!.ref.id]),
    );
    // Both tiers of one failing resolve, and no more for the repeat.
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('[M3.ytmusic/a] the resolve ahead failing says nothing of streaming', async () => {
    const { ask, music, runs } = await server();
    await ask();
    await vi.waitFor(() => expect(runs).toHaveBeenCalledTimes(2));
    await new Promise((settled) => setTimeout(settled, 20));
    expect(music!.state.available).toBe(true);
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
