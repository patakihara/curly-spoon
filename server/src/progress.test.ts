/**
 * Reporting progress through the real routes. Audiobookshelf answers from the recordings of one
 * listen to the four-file book: its direct-play session, a sync after 15 s of listening, and a
 * close that reported 5 s more. Replay matches a call by method and path, so each test reads the
 * bodies the server sent to see what it reported.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { buildApp } from './app.js';
import { type PlaybackOptions } from './routes/play.js';
import { openDatabase } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const recordings = join(dirname(fileURLToPath(import.meta.url)), 'adapters', 'audiobookshelf');
const absRecording = (call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(recordings, 'recordings', `${call}.json`), 'utf8')),
  );
const [played, synced, closed] = ['progress-play', 'progress-sync', 'progress-close'].map(
  absRecording,
) as [Recording, Recording, Recording];
const session = (played.response.body as { json: { id: string; duration: number } }).json;
const bookId = played.request.path.split('/')[3] as string;

const KEY = Buffer.alloc(32, 7);

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

interface Sent {
  method: string;
  path: string;
  authorization: string;
  json: unknown;
}

/** kara and otto, each linked to Audiobookshelf with a bearer token of their own; a clock to move. */
async function server(options: { playback?: PlaybackOptions } = {}) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const replay = replayFetch([played, synced, closed]);
  const fetch: FetchLike = async (url, init) => {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({
      method: init?.method ?? 'GET',
      path: new URL(url).pathname,
      authorization: new Headers(init?.headers).get('authorization') ?? '',
      json: body,
    });
    return replay(url, init);
  };
  const bearer: Record<string, string> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    saveLink(db, KEY, {
      userId: user.id,
      service: 'abs',
      upstreamUserId: `abs-${name}`,
      token: `abs-token-${name}`,
      state: 'linked',
    });
    const device = createDevice(db, { userId: user.id, kind: 'android' });
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
  const clock = { now: 1_000_000 };
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: { key: KEY, config: { absUrl: PLACEHOLDER_ORIGIN, jellyfinUrl: undefined }, fetch },
    now: () => clock.now,
    ...(options.playback ? { playback: options.playback } : {}),
  });
  apps.push(app);
  const as = (name: string) => ({ authorization: `Bearer ${bearer[name] ?? ''}` });
  const plan = async (name = 'kara') => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as(name),
      payload: { ref: { source: 'abs', id: bookId } },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PlaybackPlan>();
  };
  const report = (payload: object, name = 'kara') =>
    app.inject({ method: 'POST', url: '/api/progress', headers: as(name), payload });
  const close = (playId: string, payload?: object, name = 'kara') =>
    app.inject({
      method: 'POST',
      url: `/api/play/${playId}/close`,
      headers: as(name),
      ...(payload === undefined ? {} : { payload }),
    });
  /** Moves the clock on by `seconds`. */
  const pass = (seconds: number) => (clock.now += seconds * 1000);
  return { app, sent, as, plan, report, close, pass };
}

describe('[M1.progress/a] progress for an Audiobookshelf book', () => {
  it("[M1.progress/a] one update reaches the book's session sync, with the wall-clock time listened, not the distance moved", async () => {
    const { sent, plan, report, pass } = await server();
    const { progressTarget } = await plan();
    expect(progressTarget).toEqual({ playId: session.id });

    pass(20);
    // 15 s of listening, then a seek far past where that listening would have reached.
    const res = await report({ playId: session.id, position: 120, listened: 15, paused: false });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sent.at(-1)).toEqual({
      method: 'POST',
      path: synced.request.path,
      authorization: 'Bearer abs-token-kara',
      json: { currentTime: 120, timeListened: 15, duration: session.duration },
    });
  });
});

describe('reporting progress to Audiobookshelf', () => {
  it('keeps a direct play’s session open: planning asks for nothing but the session', async () => {
    const { sent, plan } = await server();
    await plan();
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([`POST ${played.request.path}`]);
  });

  it('counts no more listening than the time since the last report, so a repeat adds nothing', async () => {
    const { sent, plan, report, pass } = await server();
    await plan();
    pass(10);
    await report({ playId: session.id, position: 10, listened: 600, paused: false });
    await report({ playId: session.id, position: 10, listened: 600, paused: false });
    const listened = sent
      .filter((s) => s.path === synced.request.path)
      .map((s) => (s.json as { timeListened: number }).timeListened);
    // Each report may run up to 2 s ahead of the server's clock, never further.
    expect(listened).toEqual([12, 2]);
  });

  it("keeps a reported position within the book's length", async () => {
    const { sent, plan, report, pass } = await server();
    await plan();
    pass(1);
    await report({ playId: session.id, position: 99_999, listened: 1, paused: true });
    expect(sent.at(-1)?.json).toMatchObject({ currentTime: session.duration });
  });

  it('refuses an update for a play no plan opened, or one already closed, with 404, asking nothing', async () => {
    const { sent, plan, report, close } = await server();
    await plan();
    const unknown = await report({
      playId: 'never-planned',
      position: 1,
      listened: 1,
      paused: false,
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'not_found' });

    expect((await close(session.id)).statusCode).toBe(200);
    const asked = sent.length;
    const late = await report({ playId: session.id, position: 1, listened: 1, paused: false });
    expect(late.statusCode).toBe(404);
    expect(late.json()).toEqual({ error: 'not_found' });
    expect(sent).toHaveLength(asked);
  });

  it("refuses an update or a close for someone else's play with 404, asking nothing, and leaves it theirs", async () => {
    const { sent, plan, report, close, pass } = await server();
    await plan('kara');
    const asked = sent.length;
    const theirs = await report(
      { playId: session.id, position: 5, listened: 5, paused: false },
      'otto',
    );
    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toEqual({ error: 'not_found' });
    expect((await close(session.id, undefined, 'otto')).statusCode).toBe(404);
    expect(sent).toHaveLength(asked);

    pass(5);
    const hers = await report({ playId: session.id, position: 5, listened: 5, paused: false });
    expect(hers.statusCode).toBe(200);
  });

  it('refuses a malformed update with 400, asking nothing', async () => {
    const { sent, plan, report } = await server();
    await plan();
    const asked = sent.length;
    for (const payload of [
      { playId: session.id, position: -1, listened: 1, paused: false },
      { playId: session.id, position: 1, listened: -1, paused: false },
      { playId: session.id, position: 1, listened: 1 },
      { playId: '../users', position: 1, listened: 1, paused: false },
      { position: 1, listened: 1, paused: false },
    ]) {
      const res = await report(payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(sent).toHaveLength(asked);
  });

  it('refuses an update without a session', async () => {
    const { app, sent } = await server();
    const res = await app.inject({
      method: 'POST',
      url: '/api/progress',
      payload: { playId: session.id, position: 1, listened: 1, paused: false },
    });
    expect(res.statusCode).toBe(401);
    expect(sent).toEqual([]);
  });
});

describe('closing an Audiobookshelf play', () => {
  it('closes the session with the last report in the same call, as its owner', async () => {
    const { sent, plan, close, pass } = await server();
    await plan();
    pass(5);
    const res = await close(session.id, { position: 20, listened: 5, paused: true });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sent.at(-1)).toEqual({
      method: 'POST',
      path: closed.request.path,
      authorization: 'Bearer abs-token-kara',
      json: { currentTime: 20, timeListened: 5, duration: session.duration },
    });
  });

  it('closes it with no report when none is given', async () => {
    const { sent, plan, close } = await server();
    await plan();
    expect((await close(session.id)).statusCode).toBe(200);
    expect(sent.at(-1)).toMatchObject({ path: closed.request.path, json: undefined });
  });

  it('holds a direct play for its own idle time, then closes it at the last reported position, adding no listening', async () => {
    const idleMs = 60 * 60_000;
    const { sent, plan, report, pass } = await server({
      playback: { idleMs: 10 * 60_000, directIdleMs: idleMs },
    });
    await plan();
    pass(15);
    await report({ playId: session.id, position: 15, listened: 15, paused: true });

    // Past a transcode's idle time, the direct play is still held.
    pass(30 * 60);
    const held = await report({ playId: session.id, position: 15, listened: 0, paused: true });
    expect(held.statusCode).toBe(200);

    pass(idleMs / 1000 + 1);
    const gone = await report({ playId: session.id, position: 15, listened: 0, paused: true });
    expect(gone.statusCode).toBe(404);
    expect(sent.at(-1)).toEqual({
      method: 'POST',
      path: closed.request.path,
      authorization: 'Bearer abs-token-kara',
      json: { currentTime: 15, timeListened: 0, duration: session.duration },
    });
  });

  it('closes a play gone idle that was never reported on with no report, so planning alone writes no progress', async () => {
    const { sent, plan, report, pass } = await server({ playback: { directIdleMs: 60_000 } });
    await plan();
    pass(61);
    const gone = await report({ playId: session.id, position: 1, listened: 1, paused: false });
    expect(gone.statusCode).toBe(404);
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `POST ${played.request.path}`,
      `POST ${closed.request.path}`,
    ]);
    expect(sent.at(-1)?.json).toBeUndefined();
  });
});
