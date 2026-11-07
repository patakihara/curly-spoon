/**
 * Playing a song from outside the library through the real routes, on recordings: the extractor's
 * answer and the stream host's headers as recorded, over a synthesized Opus clip. Nothing here needs
 * an upstream account, and nothing reaches the network.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan, type Queue } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { type Canary } from './music/canary.js';
import { type SpawnLike } from './music/extractor.js';
import { Music, type MusicDeps } from './music/index.js';
import { assembleServer } from './server.js';
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
const botWall = (recorded('ytdlp', 'error-botwall').response.body as { json: { stderr: string } })
  .json.stderr;
const goneTrack = (
  recorded('ytdlp', 'error-unavailable').response.body as { json: { stderr: string } }
).json.stderr;

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

describe("[M3.ytmusic/a] a song's plan", () => {
  it('[M3.ytmusic/a] says what plays, from its row, with one track through this server', async () => {
    const { play } = await server();
    const res = await play();
    expect(res.statusCode).toBe(200);
    const plan = res.json<PlaybackPlan>();
    expect(plan.meta).toEqual({
      title: `The song ${ID}`,
      sub: 'An Artist, Another',
      art: `/api/media/ytmusic:${ID}/art`,
      variant: 'music',
    });
    expect(plan.tracks).toEqual([
      {
        url: `/api/media/ytmusic:${ID}/tracks/0`,
        mime: 'audio/webm',
        duration: info.duration,
        offset: 0,
      },
    ]);
    expect(plan.chapters).toEqual([]);
    expect(plan.startAt).toBe(0);
    expect(plan.progressTarget.playId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('[M3.ytmusic/a] never holds a stream host', async () => {
    const { play } = await server();
    expect((await play()).body).not.toMatch(/googlevideo/);
  });

  it('[M3.ytmusic/a] a member with no linked account can play, and no upstream is asked', async () => {
    const { play, upstreamCalls } = await server();
    expect((await play()).statusCode).toBe(200);
    expect(upstreamCalls).toEqual([]);
  });

  it('[M3.ytmusic/a] an id search and radio never named answers 404, with nothing run', async () => {
    const { play, track, child } = await server({ tracks: [song(OTHER)] });
    expect((await play(ID)).statusCode).toBe(404);
    expect((await track(ID)).statusCode).toBe(404);
    expect(child.runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic/a] a track over three hours is refused, with nothing run', async () => {
    const { play, child } = await server({ tracks: [song(ID, { duration: 3 * 3600 + 1 })] });
    expect((await play()).statusCode).toBe(422);
    expect(child.runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic/a] the extractor naming more than three hours is refused too', async () => {
    const { play } = await server({
      say: (id) => ({ rc: 0, stdout: { ...answerFor(id), duration: 3 * 3600 + 1 } }),
    });
    expect((await play()).statusCode).toBe(404);
  });

  it('[M3.ytmusic/a] claims nothing: a song is not a library item', async () => {
    const { play, db } = await server();
    await play();
    expect(db.prepare('SELECT COUNT(*) AS n FROM library_claims').get()).toEqual({ n: 0 });
  });

  it('[M3.ytmusic/a] a report and a close go nowhere upstream', async () => {
    const { app, play, kara, upstreamCalls } = await server();
    const { playId } = (await play()).json<PlaybackPlan>().progressTarget;
    const report = await app.inject({
      method: 'POST',
      url: '/api/progress',
      headers: kara,
      payload: { playId, seq: 1, position: 5, listened: 5, paused: false },
    });
    expect(report.statusCode).toBe(200);
    const close = await app.inject({
      method: 'POST',
      url: `/api/play/${playId}/close`,
      headers: kara,
    });
    expect(close.statusCode).toBe(200);
    expect(upstreamCalls).toEqual([]);
  });
});

describe("[M3.ytmusic/a] a song's track", () => {
  it('[M3.ytmusic/a] the route gives the stream the server proxies, in closed chunks', async () => {
    const { track, host } = await server();
    const res = await track(ID, 'bytes=0-');
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-${SIZE - 1}/${SIZE}`);
    expect(res.rawPayload.equals(clip)).toBe(true);
    expect(host.asked.every((range) => /^bytes=\d+-\d+$/.test(range))).toBe(true);
  });

  it('[M3.ytmusic/a] only track 0 exists', async () => {
    const { app, kara } = await server();
    const res = await app.inject({
      method: 'GET',
      url: `/api/media/ytmusic:${ID}/tracks/1`,
      headers: kara,
    });
    expect(res.statusCode).toBe(404);
  });

  it('[M3.ytmusic/a] a range past the end answers 416 with the size', async () => {
    const { track } = await server();
    await track();
    const res = await track(ID, `bytes=${SIZE + 10}-`);
    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
  });

  it('[M3.ytmusic/c] a track held whole plans and plays with the extractor failing, and streaming down', async () => {
    let broken = false;
    const { play, track, child, host, music } = await server({
      say: (id) => (broken ? { rc: 1, stderr: 'ERROR: broken' } : { rc: 0, stdout: answerFor(id) }),
    });
    await track();
    broken = true;
    child.runs.mockClear();
    const asks = host.asked.length;
    music!.state.canaryFailed('extractorError');
    expect((await play()).statusCode).toBe(200);
    const again = await track();
    expect(again.rawPayload.equals(clip)).toBe(true);
    expect(child.runs).not.toHaveBeenCalled();
    expect(host.asked.length).toBe(asks);
  });
});

describe("[M3.ytmusic/a] a song's art", () => {
  it('[M3.ytmusic/a] comes from the address its row holds, never one a client names', async () => {
    const { app, kara } = await server();
    const res = await app.inject({
      method: 'GET',
      url: `/api/media/ytmusic:${ID}/art`,
      headers: kara,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });

  it('[M3.ytmusic/a] a song with none says so in its plan, and answers 404', async () => {
    const { app, kara, play } = await server({ tracks: [song(ID, { artUrl: null })] });
    expect((await play()).json<PlaybackPlan>().meta.art).toBeNull();
    const res = await app.inject({
      method: 'GET',
      url: `/api/media/ytmusic:${ID}/art`,
      headers: kara,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('[M3.ytmusic/a] a song in a queue', () => {
  const add = (app: FastifyInstance, kara: object, id: string) =>
    app.inject({
      method: 'POST',
      url: '/api/queues/music/items',
      headers: kara as Record<string, string>,
      payload: { ref: { source: 'ytmusic', id }, how: 'next' },
    });

  it('[M3.ytmusic/a] its row is labelled from the table, with no upstream call', async () => {
    const { app, kara, play, upstreamCalls } = await server();
    await play();
    const queued = await add(app, kara, OTHER);
    expect(queued.statusCode).toBe(200);
    const queue = (
      await app.inject({ method: 'GET', url: '/api/queues/music', headers: kara })
    ).json<Queue>();
    const rows = JSON.stringify(queue);
    expect(rows).toContain(`The song ${OTHER}`);
    expect(rows).toContain('An Artist, Another');
    expect(upstreamCalls).toEqual([]);
  });

  it('[M3.ytmusic/a] one search and radio never named cannot be queued', async () => {
    const { app, kara, play } = await server({ tracks: [song(ID)] });
    await play();
    expect((await add(app, kara, OTHER)).statusCode).toBe(404);
  });

  it('[M3.ytmusic/a] plays next: its first two chunks are fetched ahead, once', async () => {
    const { app, kara, play, host, child } = await server();
    await play();
    await add(app, kara, OTHER);
    const plan = (await play()).json<PlaybackPlan>();
    expect(plan.next).toEqual({ source: 'ytmusic', id: OTHER });
    await vi.waitFor(() => expect(child.runs).toHaveBeenCalledWith(OTHER));
    await vi.waitFor(() => expect(host.asked).toHaveLength(2));
    expect(host.asked).toEqual([`bytes=0-${CHUNK - 1}`, `bytes=${CHUNK}-${2 * CHUNK - 1}`]);
    await play();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(host.asked).toHaveLength(2);
  });

  it('[M3.ytmusic/a] a preload failing is only logged', async () => {
    const { app, kara, play, warned } = await server({
      say: (id) => (id === OTHER ? { rc: 1, stderr: goneTrack } : { rc: 0, stdout: answerFor(id) }),
    });
    await play();
    await add(app, kara, OTHER);
    expect((await play()).statusCode).toBe(200);
    await vi.waitFor(() => expect(warned).toContain('a song could not be preloaded'));
  });
});

describe('[M3.ytmusic/a] streaming unavailable', () => {
  const clockAt = (start: number) => {
    const at = { now: start };
    return { at, now: () => at.now };
  };

  it('[M3.ytmusic/a] resolving failing answers 503 streaming_unavailable', async () => {
    const { play } = await server({ say: failing(botWall) });
    const res = await play();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'streaming_unavailable' });
  });

  it('[M3.ytmusic/a] three plays failing flip it, so a fourth runs nothing', async () => {
    const { play, child, music } = await server({ say: failing(botWall) });
    for (const id of [ID, OTHER, THIRD]) await play(id);
    expect(music!.state.available).toBe(false);
    child.runs.mockClear();
    expect((await play()).statusCode).toBe(503);
    expect(child.runs).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic/a] two failures, or three spread over more than five minutes, do not', async () => {
    const clock = clockAt(NOW);
    const { play, music } = await server({ say: failing(botWall), now: clock.now });
    await play(ID);
    await play(OTHER);
    expect(music!.state.available).toBe(true);
    clock.at.now += 5 * 60_000;
    await play(THIRD);
    expect(music!.state.available).toBe(true);
  });

  it("[M3.ytmusic/a] a track's own failure answers 404, and never flips it", async () => {
    const { play, music } = await server({ say: failing(goneTrack) });
    for (const id of [ID, OTHER, THIRD, ID]) expect((await play(id)).statusCode).toBe(404);
    expect(music!.state.available).toBe(true);
  });

  it('[M3.ytmusic/a] a success clears it', async () => {
    const { music } = await server();
    music!.state.playFailed('blocked');
    music!.state.playFailed('blocked');
    music!.state.succeeded();
    music!.state.playFailed('blocked');
    expect(music!.state.available).toBe(true);
  });

  it('[M3.ytmusic/a] a canary failing makes it so with its reason, and one passing clears it', async () => {
    let pass = false;
    const { music } = await server({
      canary: async () =>
        pass
          ? { passed: true, tier: 'plain', ms: 1, bytes: 1, codec: 'A_OPUS' }
          : { passed: false, reason: 'blocked', ms: 1 },
    });
    await music!.runNow();
    expect(music!.job()).toMatchObject({ state: 'unavailable', reason: 'blocked' });
    pass = true;
    // While unavailable each tick checks again, whether or not it is due: nothing else could clear it.
    await music!.tick().catch(() => undefined);
    expect(music!.job().state).toBe('ok');
  });

  it('[M3.ytmusic/a] a canary with no network says nothing', async () => {
    const { music } = await server({
      canary: async () => ({ passed: false, reason: 'unavailable', ms: 1 }),
    });
    await music!.runNow();
    expect(music!.job()).toMatchObject({ state: 'ok', reason: null });
  });
});

describe('[M3.ytmusic/a] admin sees the extractor job', () => {
  it('[M3.ytmusic/a] its state, its version and what the canary said', async () => {
    const { app, ada, music } = await server({
      canary: async () => ({ passed: true, tier: 'plain', ms: 2200, bytes: 9, codec: 'A_OPUS' }),
    });
    await music!.runNow();
    const res = await app.inject({ method: 'GET', url: '/api/admin/jobs', headers: ada });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      jobs: [
        {
          name: 'extractor',
          state: 'ok',
          current: '2026.10.26',
          versions: [{ version: '2026.10.26', source: 'image', state: 'promoted', canaryMs: 2200 }],
        },
      ],
    });
  });

  it('[M3.ytmusic/d] run now starts one, and a member may not', async () => {
    const canary = vi.fn<Canary>(async () => ({
      passed: true,
      tier: 'plain',
      ms: 1,
      bytes: 1,
      codec: 'A_OPUS',
    }));
    const { app, ada, kara } = await server({ canary });
    const url = '/api/admin/jobs/extractor/run';
    expect((await app.inject({ method: 'POST', url, headers: kara })).statusCode).toBe(403);
    expect(canary).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'POST', url, headers: ada })).statusCode).toBe(200);
    await vi.waitFor(() => expect(canary).toHaveBeenCalled());
  });

  it('[M3.ytmusic/d] with no extractor named, there is no job', async () => {
    const { app, ada } = await server({ music: false });
    const res = await app.inject({ method: 'GET', url: '/api/admin/jobs', headers: ada });
    expect(res.json()).toEqual({ jobs: [] });
  });
});

describe('[M3.ytmusic/a] the server as it starts', () => {
  const started = async (extra: Record<string, string>) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'auralis-start-'));
    dirs.push(dataDir);
    const calls: string[] = [];
    const server = await assembleServer(
      loadConfig({
        DATA_DIR: dataDir,
        SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
        ...extra,
      }),
      {
        fetch: async (url) => {
          calls.push(url);
          throw new Error('no network');
        },
        logger: false,
      },
    );
    return { server, calls };
  };

  it('[M3.ytmusic/a] with an extractor named and no network: starts, and /api/health asks no upstream', async () => {
    const { server, calls } = await started({ EXTRACTOR_PATH: '/opt/yt-dlp/2026.10.26/yt-dlp' });
    const res = await server.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await new Promise((settled) => setTimeout(settled, 20));
    expect(calls).toEqual([]);
    await server.close();
  });

  it('[M3.ytmusic/a] with no extractor named: a song is not linked, and the rest runs as ever', async () => {
    const { server } = await started({});
    const res = await server.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await server.close();
  });
});
