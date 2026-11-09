/**
 * A song kept into the library, through the real routes: it plays, queues, shows and comes up on
 * radio as the Jellyfin track its keep named, for as long as the index holds that track. Jellyfin
 * answers from its recordings (one album, its tracks, its first track, that track's stream); the
 * extractor is a stand-in that only counts its runs, and the stream host serves the committed clip.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan, type QueueView, type SearchResults } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { replayFetch, standInsBeside } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { type YtSong } from './adapters/ytmusic/client.js';
import { buildApp } from './app.js';
import { type IndexRow } from './libraryIndex/rows.js';
import { applyRow, emptyCounts } from './libraryIndex/store.js';
import { SongCatalogue, songRows } from './music/catalogue.js';
import { type SpawnLike } from './music/extractor.js';
import { Music } from './music/index.js';
import { keptTrack } from './requests/songs/kept.js';
import { artOf } from './routes/art.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createRequest, saveRequest } from './store/requests.js';
import { createSession } from './store/sessions.js';
import { rememberTracks } from './store/streamedTracks.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recorded = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const album = recorded('jellyfin', 'jf-album');
const albumTracks = recorded('jellyfin', 'jf-album-tracks');
const track = recorded('jellyfin', 'jf-track');
const stream = recorded('jellyfin', 'jf-stream');
const reports = ['jf-playing', 'jf-progress', 'jf-stopped'].map((c) => recorded('jellyfin', c));
const ALBUM_ID = album.request.path.split('/')[2]!;
const TRACK_ID = track.request.path.split('/')[2]!;
const recordedTrack = (track.response.body as { json: { Name: string; Artists: string[] } }).json;

const info = (
  recorded('ytdlp', 'info-plain').response.body as {
    json: { stdout: { duration: number; formats: Record<string, unknown>[] } };
  }
).json.stdout;
const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const SIZE = clip.byteLength;

const KEPT = 'kkkkkkkkkkk';
const OTHER = 'ooooooooooo';
const NOW = 1_800_000_000_000;
const KEY = Buffer.alloc(32, 7);

/** A song as YouTube Music names it: never by the name the household's track has. */
const ytSong = (id: string): YtSong => ({
  id,
  title: `The song ${id}`,
  artists: ['Someone Else'],
  album: 'Elsewhere',
  duration: info.duration,
  artUrl: 'https://art.googleusercontent.invalid/a=w544-h544',
  type: 'ATV',
});

/** The extractor: every id answers the recorded info, its Opus the clip's size; each run counted. */
function extractor() {
  const runs = vi.fn();
  const spawn: SpawnLike = (_file, args) => {
    runs(args.at(-1));
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    const answer = {
      ...info,
      id: args.at(-1),
      formats: info.formats.map((r) => (r.format_id === '251' ? { ...r, filesize: SIZE } : r)),
    };
    setImmediate(() => {
      stdout.end(JSON.stringify(answer));
      stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  return { spawn, runs };
}

const streamHost: FetchLike = async (_url, init) => {
  const range = new Headers(init?.headers).get('range') ?? '';
  const [first = 0, last = 0] = range.replace('bytes=', '').split('-').map(Number);
  const end = Math.min(last, SIZE - 1);
  return new Response(clip.subarray(first, end + 1), {
    status: 206,
    headers: { 'content-type': 'audio/webm', 'content-range': `bytes ${first}-${end}/${SIZE}` },
  });
};

/** The recorded album and its first track, in the index as the index job writes them. */
function indexAlbum(db: Db) {
  const row = (over: Partial<IndexRow>): IndexRow => ({
    source: 'jellyfin',
    id: ALBUM_ID,
    kind: 'album',
    parentId: null,
    libraryId: 'music',
    title: 'The Rise and Fall of a Midwest Princess',
    creators: [{ name: 'Chappell Roan', role: 'album-artist' }],
    series: [],
    genres: [],
    position: null,
    disc: null,
    duration: null,
    year: 2023,
    publishedAt: null,
    upstreamVersion: null,
    ids: {},
    episodeOrder: null,
    hasArt: true,
    hasLyrics: false,
    ...over,
  });
  applyRow(db, row({}), NOW, emptyCounts());
  applyRow(
    db,
    row({
      id: TRACK_ID,
      kind: 'track',
      parentId: ALBUM_ID,
      title: recordedTrack.Name,
      creators: recordedTrack.Artists.map((name) => ({ name, role: 'artist' as const })),
      position: 1,
      duration: 219.7,
      hasArt: false,
    }),
    NOW,
    emptyCounts(),
  );
}

const songRequest = (id: string) => ({
  medium: 'song' as const,
  target: { title: `The song ${id}`, creator: 'Someone Else', ids: { youtubeMusicId: id } },
});

/** A keep of the song by `userId`, arrived as the recorded track. */
function arrived(db: Db, userId: string, id = KEPT) {
  const { request } = createRequest(db, userId, songRequest(id), NOW);
  saveRequest(
    db,
    request.id,
    { state: { status: 'inLibrary' }, result: { source: 'jellyfin', id: TRACK_ID } },
    NOW,
  );
}

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function server(options: { radio?: YtSong[] } = {}) {
  const db = openDatabase(':memory:');
  const dataDir = mkdtempSync(join(tmpdir(), 'auralis-kept-'));
  dirs.push(dataDir);
  const child = extractor();
  const music = new Music({
    db,
    log: { warn: () => undefined, error: () => undefined },
    now: () => NOW,
    dataDir,
    capBytes: SIZE * 10,
    imagePath: '/opt/yt-dlp/2026.10.26/yt-dlp',
    streamFetch: streamHost,
    canary: async () => ({ passed: true, tier: 'plain', ms: 1, bytes: 1, codec: 'A_OPUS' }),
    spawn: child.spawn,
    chunkBytes: Math.ceil(SIZE / 8),
    arch: 'x64',
    client: {
      search: async () => [ytSong(KEPT), ytSong(OTHER)],
      radio: async () => options.radio ?? [],
    },
  });
  music.prepare();
  rememberTracks(db, [ytSong(KEPT), ytSong(OTHER)], NOW);
  indexAlbum(db);
  const replay = replayFetch([album, albumTracks, track, stream, ...reports], {
    readBytes: standInsBeside(adapters),
  });
  const jellyfinAsked: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    if (!new URL(url).pathname.endsWith('/InstantMix')) jellyfinAsked.push(new URL(url).pathname);
    return replay(url, init);
  };
  const people: Record<string, { id: string; headers: Record<string, string> }> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    saveLink(db, KEY, {
      userId: user.id,
      service: 'jellyfin',
      upstreamUserId: `jf-${name}`,
      token: `jf-token-${name}`,
      state: 'linked',
    });
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    const token = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
    people[name] = { id: user.id, headers: { authorization: `Bearer ${token.token}` } };
  }
  const kara = people.kara!;
  const otto = people.otto!;
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: { key: KEY, config: { absUrl: undefined, jellyfinUrl: PLACEHOLDER_ORIGIN }, fetch },
    music,
    playback: { autoplayWaitMs: 0 },
  });
  apps.push(app);
  const play = async (id = KEPT) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: kara.headers,
      payload: { ref: { source: 'ytmusic', id } },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PlaybackPlan>();
  };
  return { app, db, music, kara, otto, play, child, jellyfinAsked };
}

const albumArt = `/api/media/jellyfin:${ALBUM_ID}/art`;

describe('[M3.keep] a kept song is its Jellyfin track', () => {
  it('[M3.keep] plays as the track, from Jellyfin, with nothing run to stream it', async () => {
    const { db, kara, play, child, jellyfinAsked } = await server();
    arrived(db, kara.id);
    const plan = await play();
    expect(plan.tracks).toEqual([
      expect.objectContaining({ url: `/api/media/jellyfin:${TRACK_ID}/tracks/0` }),
    ]);
    expect(plan.meta).toEqual({
      title: recordedTrack.Name,
      sub: recordedTrack.Artists.join(', '),
      art: albumArt,
      variant: 'music',
    });
    expect(jellyfinAsked).toContain(`/Items/${TRACK_ID}`);
    expect(child.runs).not.toHaveBeenCalled();
  });

  it('[M3.keep] its play claims the album, as any track’s does', async () => {
    const { db, kara, otto, play } = await server();
    arrived(db, otto.id);
    await play();
    const claims = db
      .prepare('SELECT item_id AS id FROM library_claims WHERE user_id = ?')
      .all(kara.id);
    expect(claims).toEqual([{ id: ALBUM_ID }]);
  });

  it('[M3.keep] a queue row from before the keep is labelled from the track’s row, and stays the song', async () => {
    const { app, db, kara, play } = await server();
    await play();
    arrived(db, kara.id);
    const queue = (
      await app.inject({ method: 'GET', url: '/api/queues/music', headers: kara.headers })
    ).json<QueueView>();
    expect(queue.current).toEqual(
      expect.objectContaining({
        ref: { source: 'ytmusic', id: KEPT },
        title: recordedTrack.Name,
        sub: recordedTrack.Artists.join(', '),
      }),
    );
    const again = await play();
    expect(again.tracks[0]?.url).toBe(`/api/media/jellyfin:${TRACK_ID}/tracks/0`);
    const after = (
      await app.inject({ method: 'GET', url: '/api/queues/music', headers: kara.headers })
    ).json<QueueView>();
    expect(after.current?.ref).toEqual({ source: 'ytmusic', id: KEPT });
    expect(after.user).toEqual(queue.user);
  });

  it('[M3.keep] its art is the track’s album’s', async () => {
    const { db, kara } = await server();
    expect(artOf(db, { source: 'ytmusic', id: KEPT })).toBe(`/api/media/ytmusic:${KEPT}/art`);
    arrived(db, kara.id);
    expect(artOf(db, { source: 'ytmusic', id: KEPT })).toBe(albumArt);
  });

  it('[M3.keep] Search lists it in the library, not as a song, though the names differ', async () => {
    const { app, db, kara } = await server();
    arrived(db, kara.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent(recordedTrack.Name)}`,
      headers: kara.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<SearchResults>();
    expect(body.songs.map((s) => s.ref.id)).toEqual([OTHER]);
    expect(body.results.map((r) => r.ref)).toContainEqual({ source: 'jellyfin', id: TRACK_ID });
  });

  it('[M3.keep] radio plays it from Jellyfin', async () => {
    const { db, kara } = await server();
    arrived(db, kara.id);
    const radio = new SongCatalogue({
      client: { search: async () => [], radio: async () => [ytSong(KEPT), ytSong(OTHER)] },
      db,
      now: () => NOW,
      log: { warn: () => undefined },
    });
    expect(await radio.radio('sssssssssss')).toEqual([
      { source: 'jellyfin', id: TRACK_ID },
      { source: 'ytmusic', id: OTHER },
    ]);
  });

  it('[M3.keep] gone from the index, it streams again and is a song row again', async () => {
    const { db, kara, play } = await server();
    arrived(db, kara.id);
    db.prepare("DELETE FROM index_items WHERE source = 'jellyfin' AND upstream_id = ?").run(
      TRACK_ID,
    );
    expect(keptTrack(db, KEPT)).toBeNull();
    expect((await play()).tracks[0]?.url).toBe(`/api/media/ytmusic:${KEPT}/tracks/0`);
    expect(songRows(db, kara.id, [ytSong(KEPT)]).map((s) => s.ref.id)).toEqual([KEPT]);
  });
});

describe('[M3.keep] a song being kept', () => {
  it('[M3.keep] shows requested, with its status, to the people on the keep', async () => {
    const { db, kara, otto } = await server();
    createRequest(db, kara.id, songRequest(KEPT), NOW);
    expect(songRows(db, kara.id, [ytSong(KEPT)])[0]?.availability).toEqual({
      kind: 'requested',
      status: 'requested',
    });
    expect(songRows(db, otto.id, [ytSong(KEPT)])[0]?.availability).toEqual({
      kind: 'streamable',
    });
  });

  it('[M3.keep] says how far it has downloaded', async () => {
    const { db, kara } = await server();
    const { request } = createRequest(db, kara.id, songRequest(KEPT), NOW);
    saveRequest(db, request.id, { state: { status: 'downloading', progress: 0.5 } }, NOW);
    expect(songRows(db, kara.id, [ytSong(KEPT)])[0]?.availability).toEqual({
      kind: 'requested',
      status: 'downloading',
      progress: 0.5,
    });
  });

  it('[M3.keep] still plays its stream', async () => {
    const { db, kara, play } = await server();
    createRequest(db, kara.id, songRequest(KEPT), NOW);
    expect((await play()).tracks[0]?.url).toBe(`/api/media/ytmusic:${KEPT}/tracks/0`);
  });
});
