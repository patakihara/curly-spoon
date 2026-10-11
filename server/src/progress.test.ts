/**
 * Reporting progress through the real routes, each play to its own server. Audiobookshelf answers
 * from the recordings of one listen to the four-file book: its direct-play session, a sync after
 * 15 s of listening, and a close that reported 5 s more. Jellyfin answers from the recordings of
 * one listen to a track: its start, progress at 15 s and stop at 20 s. Replay matches a call by
 * method and path, so each test reads the bodies the server sent to see what it reported.
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

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const [played, synced, closed] = ['progress-play', 'progress-sync', 'progress-close'].map((c) =>
  recording('audiobookshelf', c),
) as [Recording, Recording, Recording];
const session = (played.response.body as { json: { id: string; duration: number } }).json;
const bookId = played.request.path.split('/')[3] as string;
const [jfTrack, jfPlaying, jfProgress, jfStopped] = [
  'jf-track',
  'jf-playing',
  'jf-progress',
  'jf-stopped',
].map((c) => recording('jellyfin', c)) as [Recording, Recording, Recording, Recording];
const trackId = jfTrack.request.path.split('/')[2] as string;
const trackLength = (jfTrack.response.body as { json: { RunTimeTicks: number } }).json.RunTimeTicks;
/** The JSON a recording sent upstream. */
const sentJson = (r: Recording) => (r.request.body as { json: Record<string, unknown> }).json;

const JELLYFIN_ORIGIN = 'http://jellyfin.upstream.invalid';
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

/**
 * kara and otto, each linked to Audiobookshelf and Jellyfin with tokens of their own; a clock to
 * move. Reports and closes carry the next number in order unless a test gives one.
 */
async function server(options: { playback?: PlaybackOptions; recordings?: Recording[] } = {}) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const replay = replayFetch(
    options.recordings ?? [played, synced, closed, jfTrack, jfPlaying, jfProgress, jfStopped],
  );
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
    for (const service of ['abs', 'jellyfin'] as const) {
      saveLink(db, KEY, {
        userId: user.id,
        service,
        upstreamUserId: `${service}-${name}`,
        token: `${service}-token-${name}`,
        state: 'linked',
      });
    }
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
    upstreams: {
      key: KEY,
      config: { absUrl: PLACEHOLDER_ORIGIN, jellyfinUrl: JELLYFIN_ORIGIN },
      fetch,
    },
    now: () => clock.now,
    ...(options.playback ? { playback: options.playback } : {}),
  });
  apps.push(app);
  const as = (name: string) => ({ authorization: `Bearer ${bearer[name] ?? ''}` });
  const plan = async (name = 'kara', ref: object = { source: 'abs', id: bookId }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as(name),
      payload: { ref },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PlaybackPlan>();
  };
  const planTrack = (name = 'kara') => plan(name, { source: 'jellyfin', id: trackId });
  let seq = 0;
  const report = (payload: object, name = 'kara') =>
    app.inject({
      method: 'POST',
      url: '/api/progress',
      headers: as(name),
      payload: { seq: seq++, ...payload },
    });
  const close = (playId: string, payload?: object, name = 'kara') =>
    app.inject({
      method: 'POST',
      url: `/api/play/${playId}/close`,
      headers: as(name),
      ...(payload === undefined ? {} : { payload: { seq: seq++, ...payload } }),
    });
  /** Moves the clock on by `seconds`. */
  const pass = (seconds: number) => (clock.now += seconds * 1000);
  return { app, sent, as, plan, planTrack, report, close, pass };
}

describe("[M1.progress/a] progress to each item's own server", () => {
  it("[M1.progress/a] one update for a book reaches Audiobookshelf's session sync, and one for a track reaches Jellyfin's progress, each as the person, with wall-clock listening time", async () => {
    const { sent, plan, planTrack, report, close, pass } = await server();
    const book = (await plan()).progressTarget.playId;
    pass(20);
    // 15 s of listening, then a seek far past where that listening would have reached.
    const toAbs = await report({ playId: book, position: 120, listened: 15, paused: false });
    expect(toAbs.statusCode, toAbs.body).toBe(200);
    expect(toAbs.json()).toEqual({ ok: true });
    expect(sent.at(-1)).toEqual({
      method: 'POST',
      path: synced.request.path,
      authorization: 'Bearer abs-token-kara',
      json: { currentTime: 120, timeListened: 15, duration: session.duration },
    });
    expect((await close(book)).statusCode).toBe(200);

    // Jellyfin takes no listening time: it times the play itself, from its start to its stop,
    // leaving out the time it is told the track was paused.
    const track = (await planTrack()).progressTarget.playId;
    pass(15);
    const toJellyfin = await report({ playId: track, position: 15, listened: 15, paused: false });
    expect(toJellyfin.statusCode, toJellyfin.body).toBe(200);
    const progress = sent.at(-1)!;
    expect(progress).toMatchObject({
      method: 'POST',
      path: jfProgress.request.path,
      authorization: expect.stringContaining('Token="jellyfin-token-kara"') as unknown,
    });
    expect(progress.json).toEqual({ ...sentJson(jfProgress), PlaySessionId: track });
  });
});

describe('reporting progress to Jellyfin', () => {
  it("tells Jellyfin the track started when it is planned, at its start, as the person's own play", async () => {
    const { sent, planTrack } = await server();
    const { playId } = (await planTrack()).progressTarget;
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `GET ${jfTrack.request.path}`,
      `POST ${jfPlaying.request.path}`,
    ]);
    expect(sent.at(-1)?.json).toEqual({ ...sentJson(jfPlaying), PlaySessionId: playId });
    expect(sent.at(-1)?.authorization).toContain('Token="jellyfin-token-kara"');
  });

  it('says whether the track is paused, so Jellyfin leaves the pause out of its own timing', async () => {
    const { sent, planTrack, report, pass } = await server();
    const { playId } = (await planTrack()).progressTarget;
    pass(30);
    await report({ playId, position: 15, listened: 15, paused: true });
    expect(sent.at(-1)?.json).toMatchObject({ PositionTicks: 15 * 1e7, IsPaused: true });
  });

  it('tells Jellyfin the track stopped when the play closes, where the last report left it', async () => {
    const { sent, planTrack, close, pass } = await server();
    const { playId } = (await planTrack()).progressTarget;
    pass(20);
    expect((await close(playId, { position: 20, listened: 5, paused: true })).statusCode).toBe(200);
    expect(sent.at(-1)).toMatchObject({ method: 'POST', path: jfStopped.request.path });
    expect(sent.at(-1)?.json).toEqual({ ...sentJson(jfStopped), PlaySessionId: playId });
    expect(sent.at(-1)?.authorization).toContain('Token="jellyfin-token-kara"');
  });

  it('tells Jellyfin the track stopped when the play goes idle, at the last reported position', async () => {
    const { sent, planTrack, report, pass } = await server({ playback: { directIdleMs: 60_000 } });
    const { playId } = (await planTrack()).progressTarget;
    pass(20);
    await report({ playId, position: 20, listened: 20, paused: true });
    pass(61);
    const gone = await report({ playId, position: 20, listened: 0, paused: true });
    expect(gone.statusCode).toBe(404);
    expect(sent.at(-1)).toMatchObject({ path: jfStopped.request.path });
    expect(sent.at(-1)?.json).toMatchObject({ PositionTicks: 20 * 1e7, PlaySessionId: playId });
  });

  it('tells Jellyfin the track stopped at its start when the play goes idle never reported on', async () => {
    const { sent, planTrack, pass, report } = await server({ playback: { directIdleMs: 60_000 } });
    const { playId } = (await planTrack()).progressTarget;
    pass(61);
    await report({ playId, position: 1, listened: 1, paused: false });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `GET ${jfTrack.request.path}`,
      `POST ${jfPlaying.request.path}`,
      `POST ${jfStopped.request.path}`,
    ]);
    expect(sent.at(-1)?.json).toMatchObject({ PositionTicks: 0 });
  });

  it("keeps a reported position within the track's length", async () => {
    const { sent, planTrack, report, pass } = await server();
    const { playId } = (await planTrack()).progressTarget;
    pass(1);
    await report({ playId, position: 99_999, listened: 1, paused: false });
    expect(sent.at(-1)?.json).toMatchObject({ PositionTicks: trackLength });
  });

  it("refuses an update for someone else's track with 404, asking Jellyfin nothing", async () => {
    const { sent, planTrack, report } = await server();
    const { playId } = (await planTrack('kara')).progressTarget;
    const asked = sent.length;
    const theirs = await report({ playId, position: 5, listened: 5, paused: false }, 'otto');
    expect(theirs.statusCode).toBe(404);
    expect(sent).toHaveLength(asked);
  });

  it('refuses the plan with 502 when Jellyfin does not take the start', async () => {
    const { app, as } = await server({ recordings: [jfTrack] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as('kara'),
      payload: { ref: { source: 'jellyfin', id: trackId } },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'upstream_failed' });
  });
});

describe('reports in order', () => {
  it('drops a report older than one already taken, so a late one never moves the position back', async () => {
    const { sent, plan, report, pass } = await server();
    const { playId } = (await plan()).progressTarget;
    pass(20);
    expect(
      (await report({ playId, seq: 2, position: 40, listened: 10, paused: false })).statusCode,
    ).toBe(200);
    const asked = sent.length;
    const late = await report({ playId, seq: 1, position: 30, listened: 10, paused: false });
    expect(late.statusCode).toBe(200);
    expect(late.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(asked);
  });

  it('drops a repeated report, so it adds no listening time', async () => {
    const { sent, plan, report, pass } = await server();
    const { playId } = (await plan()).progressTarget;
    pass(10);
    await report({ playId, seq: 5, position: 10, listened: 10, paused: false });
    pass(10);
    await report({ playId, seq: 5, position: 10, listened: 10, paused: false });
    const listened = sent
      .filter((s) => s.path === synced.request.path)
      .map((s) => (s.json as { timeListened: number }).timeListened);
    expect(listened).toEqual([10]);
  });

  it('closes at the last position taken, adding no listening, when the closing report is older than it', async () => {
    const { sent, plan, report, close, pass } = await server();
    const { playId } = (await plan()).progressTarget;
    pass(20);
    await report({ playId, seq: 4, position: 40, listened: 20, paused: false });
    pass(5);
    expect(
      (await close(playId, { seq: 3, position: 30, listened: 5, paused: true })).statusCode,
    ).toBe(200);
    expect(sent.at(-1)).toMatchObject({
      path: closed.request.path,
      json: { currentTime: 40, timeListened: 0, duration: session.duration },
    });
  });

  it('takes a report the server could not pass on again, under the same number', async () => {
    const { sent, plan, report, pass } = await server({ recordings: [played, closed] });
    const { playId } = (await plan()).progressTarget;
    pass(10);
    const failed = await report({ playId, seq: 0, position: 10, listened: 10, paused: false });
    expect(failed.statusCode).toBe(502);
    const again = sent.length;
    await report({ playId, seq: 0, position: 10, listened: 10, paused: false });
    expect(sent).toHaveLength(again + 1);
  });
});

describe('reporting progress to Audiobookshelf', () => {
  it('keeps a direct play’s session open: planning asks for nothing but the session', async () => {
    const { sent, plan } = await server();
    await plan();
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([`POST ${played.request.path}`]);
  });

  it('counts no more listening than the time since the open, give or take 2 s, however many reports claim it', async () => {
    const { sent, plan, report, pass } = await server();
    await plan();
    pass(10);
    await report({ playId: session.id, position: 10, listened: 600, paused: false });
    await report({ playId: session.id, position: 10, listened: 600, paused: false });
    pass(10);
    await report({ playId: session.id, position: 20, listened: 600, paused: false });
    const listened = sent
      .filter((s) => s.path === synced.request.path)
      .map((s) => (s.json as { timeListened: number }).timeListened);
    // Reports may run up to 2 s ahead of the server's clock in all, never 2 s each.
    expect(listened).toEqual([12, 0, 10]);
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
      { playId: session.id, seq: -1, position: 1, listened: 1, paused: false },
      { playId: session.id, seq: 1.5, position: 1, listened: 1, paused: false },
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
      payload: { playId: session.id, seq: 0, position: 1, listened: 1, paused: false },
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
