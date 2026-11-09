/**
 * Keeping a song by playing it, through the real routes on a fake clock: `POST /play`, its
 * progress reports and its close. The extractor is a stand-in answering the recorded info, the
 * stream host serves the committed clip, and the song steps are stand-ins that only hold the
 * request, so what is watched is which keeps are asked.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { standInSteps } from './adapters/http/standIn.js';
import { buildApp } from './app.js';
import { type SpawnLike } from './music/extractor.js';
import { Music } from './music/index.js';
import { stepsRegistry } from './requests/steps.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { deleteRequest, peopleOn, requestsOf } from './store/requests.js';
import { createSession } from './store/sessions.js';
import { rememberTracks } from './store/streamedTracks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const info = (
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, 'ytdlp', 'recordings', 'info-plain.json'), 'utf8')),
  ).response.body as { json: { stdout: { formats: Record<string, unknown>[] } } }
).json.stdout;
const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const SIZE = clip.byteLength;

const ID = 'kkkkkkkkkkk';
/** The song's length in seconds, as its row has it: 90% is 180 s, 60% is 120 s. */
const LENGTH = 200;
const T0 = 1_800_000_000_000;

function extractor(): SpawnLike {
  return (_file, args) => {
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    const answer = {
      ...info,
      id: args.at(-1),
      duration: LENGTH,
      formats: info.formats.map((r) => (r.format_id === '251' ? { ...r, filesize: SIZE } : r)),
    };
    setImmediate(() => {
      stdout.end(JSON.stringify(answer));
      stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
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

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function server(options: { songs?: boolean; maxLive?: number } = {}) {
  let clock = T0;
  const db: Db = openDatabase(':memory:');
  const dataDir = mkdtempSync(join(tmpdir(), 'auralis-autokeep-'));
  dirs.push(dataDir);
  const music = new Music({
    db,
    log: { warn: () => undefined, error: () => undefined },
    now: () => clock,
    dataDir,
    capBytes: SIZE * 10,
    imagePath: '/opt/yt-dlp/2026.10.26/yt-dlp',
    streamFetch: streamHost,
    canary: async () => ({ passed: true, tier: 'plain', ms: 1, bytes: 1, codec: 'A_OPUS' }),
    spawn: extractor(),
    chunkBytes: Math.ceil(SIZE / 8),
    arch: 'x64',
  });
  music.prepare();
  rememberTracks(
    db,
    [
      {
        id: ID,
        title: 'A Song',
        artists: ['An Artist'],
        album: null,
        duration: LENGTH,
        artUrl: null,
      },
    ],
    T0,
  );
  const people: Record<string, { id: string; headers: Record<string, string> }> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    const { token } = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
    people[name] = { id: user.id, headers: { authorization: `Bearer ${token}` } };
  }
  const logged: string[] = [];
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: Buffer.alloc(32, 7),
      config: { absUrl: undefined, jellyfinUrl: undefined },
      fetch: () => Promise.reject(new Error('no upstream')),
    },
    music,
    playback: { autoplayWaitMs: 0 },
    now: () => clock,
    logger: { stream: { write: (line: string) => void logged.push(line) } },
    requests: {
      steps: stepsRegistry(options.songs === false ? [] : [standInSteps('song')]),
      everyMs: 3_600_000,
      notIndexedAfterMs: 3_600_000,
      stepTimeoutMs: 1_000,
      stallAfterMs: 3_600_000,
      holdAfterMs: 3_600_000,
      ...(options.maxLive === undefined ? {} : { maxLive: options.maxLive }),
    },
  });
  apps.push(app);

  /** One person's play of the song, its reports each a number of seconds later on the clock. */
  const play = async (who: 'kara' | 'otto' = 'kara') => {
    const { headers } = people[who]!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers,
      payload: { ref: { source: 'ytmusic', id: ID } },
    });
    expect(res.statusCode, res.body).toBe(200);
    const { playId } = res.json<PlaybackPlan>().progressTarget;
    let seq = 0;
    return {
      report: async (after: number, position: number, listened = after) => {
        clock += after * 1000;
        seq += 1;
        return app.inject({
          method: 'POST',
          url: '/api/progress',
          headers,
          payload: { playId, seq, position, listened, paused: false },
        });
      },
      close: async (after: number, position: number, listened = after) => {
        clock += after * 1000;
        seq += 1;
        return app.inject({
          method: 'POST',
          url: `/api/play/${playId}/close`,
          headers,
          payload: { playId, seq, position, listened, paused: true },
        });
      },
    };
  };
  const keepsOf = (who: 'kara' | 'otto') =>
    requestsOf(db, people[who]!.id).filter((r) => r.medium === 'song');
  /** Lets whatever a report set going finish. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { db, people, play, keepsOf, settle, logged };
}

describe('[M3.keep/b] a song played through is kept by itself, once', () => {
  it('[M3.keep/b] reports reaching 90% of the song with 60% listened make one keep for that person', async () => {
    const { play, keepsOf, settle } = await server();
    const one = await play();
    expect((await one.report(100, 100)).statusCode).toBe(200);
    await settle();
    expect(keepsOf('kara')).toEqual([]);
    expect((await one.report(80, 180)).statusCode).toBe(200);
    await vi.waitFor(() => expect(keepsOf('kara')).toHaveLength(1));
    expect(keepsOf('kara')[0]?.target).toEqual({
      title: 'A Song',
      creator: 'An Artist',
      ids: { youtubeMusicId: ID },
    });
    expect(keepsOf('otto')).toEqual([]);
  });

  it('[M3.keep/b] a close that reaches it keeps it too', async () => {
    const { play, keepsOf } = await server();
    const one = await play();
    await one.report(100, 100);
    expect((await one.close(90, 190)).statusCode).toBe(200);
    await vi.waitFor(() => expect(keepsOf('kara')).toHaveLength(1));
  });

  it('[M3.keep/b] more reports, the close and a second play ask nothing more, even once it is cancelled', async () => {
    const { db, play, keepsOf, settle } = await server();
    const one = await play();
    await one.report(190, 190);
    await vi.waitFor(() => expect(keepsOf('kara')).toHaveLength(1));
    deleteRequest(db, keepsOf('kara')[0]!.id);

    await one.report(5, 195);
    await one.close(5, 200);
    const two = await play();
    await two.report(200, 200);
    await two.close(1, 200);
    await settle();
    expect(keepsOf('kara')).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM auto_keeps').get()).toEqual({ n: 1 });
  });

  it('[M3.keep/b] a seek to 95% with 5 s listened keeps nothing', async () => {
    const { play, keepsOf, settle } = await server();
    const one = await play();
    await one.report(5, 190);
    await one.report(5, 195);
    await settle();
    expect(keepsOf('kara')).toEqual([]);
  });

  it('[M3.keep/b] listening the server’s clock did not see counts for nothing', async () => {
    const { play, keepsOf, settle } = await server();
    const one = await play();
    await one.report(5, 190, 190);
    await settle();
    expect(keepsOf('kara')).toEqual([]);
  });

  it('[M3.keep/b] a close at 30% keeps nothing', async () => {
    const { play, keepsOf, settle } = await server();
    const one = await play();
    await one.report(30, 30);
    await one.close(30, 60);
    await settle();
    expect(keepsOf('kara')).toEqual([]);
  });

  it('[M3.keep/b] another person’s play past 90% joins the keep under way', async () => {
    const { play, keepsOf } = await server();
    const kara = await play('kara');
    await kara.report(190, 190);
    await vi.waitFor(() => expect(keepsOf('kara')).toHaveLength(1));
    const otto = await play('otto');
    await otto.report(190, 190);
    await vi.waitFor(() => expect(keepsOf('otto')).toHaveLength(1));
    const id = keepsOf('kara')[0]!.id;
    expect(keepsOf('otto')[0]?.id).toBe(id);
  });

  it('[M3.keep/b] a refusal is logged, and the report still answers', async () => {
    const { play, keepsOf, logged } = await server({ maxLive: 0 });
    const one = await play();
    expect((await one.report(190, 190)).statusCode).toBe(200);
    await vi.waitFor(() =>
      expect(logged.some((line) => line.includes('a song played through was not kept'))).toBe(true),
    );
    expect(keepsOf('kara')).toEqual([]);
  });

  it('[M3.keep/b] while songs cannot be kept, a play through asks nothing and notes nothing', async () => {
    const { db, play, settle } = await server({ songs: false });
    const one = await play();
    expect((await one.report(190, 190)).statusCode).toBe(200);
    await settle();
    expect(db.prepare('SELECT COUNT(*) AS n FROM requests').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM auto_keeps').get()).toEqual({ n: 0 });
  });
});

describe('[M3.keep/b] who is on an auto-keep', () => {
  it('[M3.keep/b] only the person who played it', async () => {
    const { db, people, play, keepsOf } = await server();
    const one = await play();
    await one.report(190, 190);
    await vi.waitFor(() => expect(keepsOf('kara')).toHaveLength(1));
    expect(peopleOn(db, keepsOf('kara')[0]!.id)).toEqual([people.kara!.id]);
  });
});
