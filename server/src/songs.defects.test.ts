/**
 * What breaks a song's play through the real routes: failing tests from a fresh test of the play
 * route. The stand-ins are the same as in streamedSongs.test.ts.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { buildApp } from './app.js';
import { type Canary } from './music/canary.js';
import { type SpawnLike } from './music/extractor.js';
import { Music, type MusicDeps } from './music/index.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { rememberTracks, type StreamedTrack } from './store/streamedTracks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recorded = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const SIZE = clip.byteLength;
const CHUNK = Math.ceil(SIZE / 8);

interface Info {
  id: string;
  duration: number;
  formats: Record<string, unknown>[];
}
const info = (recorded('ytdlp', 'info-plain').response.body as { json: { stdout: Info } }).json
  .stdout;

const ID = info.id;
const OTHER = 'aaaaaaaaaaa';
const THIRD = 'bbbbbbbbbbb';

const answerFor = (id: string): Info => ({
  ...info,
  id,
  formats: info.formats.map((row) => (row.format_id === '251' ? { ...row, filesize: SIZE } : row)),
});

const song = (id: string, over: Partial<StreamedTrack> = {}): StreamedTrack => ({
  id,
  title: `The song ${id}`,
  artists: ['An Artist', 'Another'],
  album: 'An Album',
  duration: info.duration,
  artUrl: 'https://art.googleusercontent.invalid/a=w544-h544',
  ...over,
});

type Answer = { rc: number; stdout?: object; stderr?: string };

/** The extractor, answering each id as `say` does; every run counted. */
function extractor(say: (id: string) => Answer = (id) => ({ rc: 0, stdout: answerFor(id) })) {
  const runs = vi.fn();
  const spawn: SpawnLike = (_file, args) => {
    const id = args.at(-1)!;
    runs(id);
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    const a = say(id);
    setImmediate(() => {
      if (a.stdout !== undefined) stdout.write(JSON.stringify(a.stdout));
      stderr.write(a.stderr ?? '');
      stdout.end();
      stderr.end();
      child.emit('close', a.rc);
    });
    return child;
  };
  return { spawn, runs };
}

/** The stream host: closed ranges of the clip, as recorded. */
function streamHost() {
  const asked: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const range = new Headers(init?.headers).get('range') ?? '';
    asked.push(range);
    if (url.includes('art.')) {
      return new Response(Buffer.from('an image'), { headers: { 'content-type': 'image/jpeg' } });
    }
    const [first = 0, last = 0] = range.replace('bytes=', '').split('-').map(Number);
    const end = Math.min(last, SIZE - 1);
    return new Response(clip.subarray(first, end + 1), {
      status: 206,
      headers: { 'content-type': 'audio/webm', 'content-range': `bytes ${first}-${end}/${SIZE}` },
    });
  };
  return { fetch, asked };
}

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = 1_800_000_000_000;

async function server(
  options: {
    say?: (id: string) => Answer;
    host?: ReturnType<typeof streamHost>;
    canary?: Canary;
    jellyfinFetch?: FetchLike;
    music?: false;
    tracks?: StreamedTrack[];
    now?: () => number;
  } = {},
) {
  const db: Db = openDatabase(':memory:');
  const dataDir = mkdtempSync(join(tmpdir(), 'auralis-songs-'));
  dirs.push(dataDir);
  const host = options.host ?? streamHost();
  const child = extractor(options.say);
  const warned: string[] = [];
  const deps: MusicDeps = {
    db,
    log: { warn: (_d, message) => warned.push(message), error: () => undefined },
    now: options.now ?? (() => NOW),
    dataDir,
    capBytes: SIZE * 10,
    imagePath: '/opt/yt-dlp/2026.10.26/yt-dlp',
    streamFetch: host.fetch,
    canary:
      options.canary ??
      (async () => ({ passed: true, tier: 'plain', ms: 1, bytes: 1, codec: 'A_OPUS' })),
    spawn: child.spawn,
    chunkBytes: CHUNK,
    arch: 'x64',
  };
  const music = options.music === false ? null : new Music(deps);
  music?.prepare();
  rememberTracks(db, options.tracks ?? [song(ID), song(OTHER), song(THIRD)], NOW);
  const upstreamCalls: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    upstreamCalls.push(url);
    return (options.jellyfinFetch ?? (() => Promise.reject(new Error('no upstream'))))(url, init);
  };
  // No account on any upstream: a song needs none.
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  const admin = upsertUser(db, { username: 'ada', role: 'admin' });
  const token = (userId: string) =>
    createSession(db, {
      userId,
      deviceId: createDevice(db, { userId, kind: 'web' }).id,
      kind: 'bearer',
    }).token;
  const kara = { authorization: `Bearer ${token(user.id)}` };
  const ada = { authorization: `Bearer ${token(admin.id)}` };
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: Buffer.alloc(32, 7),
      config: { absUrl: undefined, jellyfinUrl: undefined },
      fetch,
    },
    music,
    playback: { autoplayWaitMs: 0 },
  });
  apps.push(app);
  const play = (id = ID) =>
    app.inject({
      method: 'POST',
      url: '/api/play',
      headers: kara,
      payload: { ref: { source: 'ytmusic', id } },
    });
  const track = (id = ID, range?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/media/ytmusic:${id}/tracks/0`,
      headers: { ...kara, ...(range === undefined ? {} : { range }) },
    });
  return { app, db, music, kara, ada, play, track, host, child, upstreamCalls, warned };
}

const failing = (stderr: string) => () => ({ rc: 1, stderr });

describe("a track's own failure says nothing of streaming", () => {
  const noDuration = (id: string) => {
    const { duration: _duration, ...rest } = answerFor(id);
    return rest;
  };

  it.each([
    [
      'a live stream, which has no duration',
      (id: string) => ({ ...noDuration(id), is_live: true }),
    ],
    ['a duration of 0', (id: string) => ({ ...answerFor(id), duration: 0 })],
  ])('%s refuses that song, and three of them leave streaming up', async (_name, answer) => {
    const { play, music } = await server({ say: (id) => ({ rc: 0, stdout: answer(id) }) });
    for (const id of [ID, OTHER, THIRD]) expect((await play(id)).statusCode).toBe(404);
    expect(music!.state.available).toBe(true);
  });

  it('a live stream that names a duration is refused too', async () => {
    const { play } = await server({
      say: (id) => ({ rc: 0, stdout: { ...answerFor(id), is_live: true } }),
    });
    expect((await play()).statusCode).toBe(404);
  });

  // yt-dlp's wording, from memory of its source: none of these is recorded, and each is one track's.
  it.each([
    'ERROR: [youtube] x: The uploader has not made this video available in your country',
    'ERROR: [youtube] x: Join this channel to get access to members-only content like this video',
    'ERROR: [youtube] x: This live event will begin in 3 hours.',
    'ERROR: [youtube] x: Premieres in 3 hours',
    'ERROR: [youtube] x: This video is only available to Music Premium members',
  ])('%s refuses that song, and three of them leave streaming up', async (stderr) => {
    const { play, music } = await server({ say: failing(stderr) });
    for (const id of [ID, OTHER, THIRD]) expect((await play(id)).statusCode).toBe(404);
    expect(music!.state.available).toBe(true);
  });
});

describe('over three hours or live, the track route refuses as the plan does', () => {
  it('a row over three hours is not streamed by asking for its track directly', async () => {
    const { track, host, child } = await server({
      tracks: [song(ID, { duration: 3 * 3600 + 1 })],
    });
    expect((await track()).statusCode).toBeGreaterThanOrEqual(400);
    expect(host.asked).toEqual([]);
    expect(child.runs).not.toHaveBeenCalled();
  });

  it('nor is one the extractor names as over three hours', async () => {
    const { track, host } = await server({
      say: (id) => ({ rc: 0, stdout: { ...answerFor(id), duration: 5 * 3600 } }),
    });
    expect((await track()).statusCode).toBeGreaterThanOrEqual(400);
    expect(host.asked).toEqual([]);
  });
});
