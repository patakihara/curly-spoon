/**
 * Playing one Audiobookshelf item by direct play, through the real routes. Audiobookshelf answers
 * from its recordings: the play session, the file call (its real status and headers, with the
 * committed tone as its body) and the session's close.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { replayFetch, standInsBeside } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { buildApp } from './app.js';
import { openDatabase } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const absRecording = (call: string) =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(join(adapters, 'audiobookshelf', 'recordings', `${call}.json`), 'utf8'),
    ),
  );
const itemPlay = absRecording('item-play');
const itemFile = absRecording('item-file');
const sessionClose = absRecording('session-close');
const itemId = itemPlay.request.path.split('/')[3] as string;
const recordedTrack = (
  (itemPlay.response.body as { json: { audioTracks: Record<string, unknown>[] } }).json
    .audioTracks as { mimeType: string; duration: number; startOffset: number; ino: string }[]
)[0];
const tone = readFileSync(join(adapters, 'audiobookshelf', 'recordings', 'item-file.m4a'));

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
  range: string | null;
}

/** Two linked people, kara and otto, each with an app's bearer token; otto can be left unlinked. */
async function server(options: { ottoLinked?: boolean } = {}) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const replay = replayFetch([itemPlay, itemFile, sessionClose], {
    readBytes: standInsBeside(adapters),
  });
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    sent.push({
      method: init?.method ?? 'GET',
      path: new URL(url).pathname,
      authorization: headers.get('authorization') ?? '',
      range: headers.get('range'),
    });
    return replay(url, init);
  };
  const bearer: Record<string, string> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    if (name === 'kara' || options.ottoLinked !== false) {
      saveLink(db, KEY, {
        userId: user.id,
        service: 'abs',
        upstreamUserId: `abs-${name}`,
        token: `abs-token-${name}`,
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
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: KEY,
      config: { absUrl: PLACEHOLDER_ORIGIN, jellyfinUrl: undefined },
      fetch,
    },
  });
  apps.push(app);
  const as = (name: string) => ({ authorization: `Bearer ${bearer[name] ?? ''}` });
  const plan = async (name = 'kara') => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as(name),
      payload: { ref: { source: 'abs', id: itemId } },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PlaybackPlan>();
  };
  return { app, sent, as, plan };
}

describe('[M1.play/b] direct play of an Audiobookshelf item', () => {
  it("[M1.play/b] the plan's track URL answers a range request with 206", async () => {
    const { app, as, plan } = await server();
    const { tracks } = await plan();
    expect(tracks).toHaveLength(1);
    for (const track of tracks) {
      const res = await app.inject({
        method: 'GET',
        url: track.url,
        headers: { ...as('kara'), range: 'bytes=0-99' },
      });
      expect(res.statusCode).toBe(206);
      expect(res.headers['content-type']).toBe('audio/mp4');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-range']).toBe(`bytes 0-99/${tone.byteLength}`);
      expect(res.rawPayload).toEqual(tone.subarray(0, 100));
    }
  });
});

describe('playing one Audiobookshelf item by direct play', () => {
  it("the plan's one track carries the recording's mime, duration and offset", async () => {
    const { plan } = await server();
    expect(await plan()).toEqual({
      tracks: [
        {
          url: `/api/stream/abs/${itemId}/${recordedTrack?.ino}`,
          mime: recordedTrack?.mimeType,
          duration: recordedTrack?.duration,
          offset: recordedTrack?.startOffset,
        },
      ],
      startAt: 0,
    });
  });

  it('closes the Audiobookshelf session it opened to read the tracks', async () => {
    const { sent, plan } = await server();
    await plan();
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `POST ${itemPlay.request.path}`,
      `POST ${sessionClose.request.path}`,
    ]);
  });

  it('streams the whole file, 200, to a request without a range', async () => {
    const { app, as, plan } = await server();
    const [track] = (await plan()).tracks;
    const res = await app.inject({ method: 'GET', url: track?.url ?? '', headers: as('kara') });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload).toEqual(tone);
  });

  it('answers 416 to a range past the end of the file', async () => {
    const { app, as, plan } = await server();
    const [track] = (await plan()).tracks;
    const res = await app.inject({
      method: 'GET',
      url: track?.url ?? '',
      headers: { ...as('kara'), range: `bytes=${tone.byteLength}-` },
    });
    expect(res.statusCode).toBe(416);
  });

  it('refuses to plan or stream without a session', async () => {
    const { app } = await server();
    const planned = await app.inject({
      method: 'POST',
      url: '/api/play',
      payload: { ref: { source: 'abs', id: itemId } },
    });
    expect(planned.statusCode).toBe(401);
    const streamed = await app.inject({
      method: 'GET',
      url: itemFile.request.path.replace('/api/items/', '/api/stream/abs/').replace('/file/', '/'),
    });
    expect(streamed.statusCode).toBe(401);
  });

  it('asks Audiobookshelf with the caller’s own token on every call, never another’s', async () => {
    const { app, sent, as, plan } = await server();
    for (const name of ['kara', 'otto']) {
      const [track] = (await plan(name)).tracks;
      await app.inject({
        method: 'GET',
        url: track?.url ?? '',
        headers: { ...as(name), range: 'bytes=0-9' },
      });
    }
    const tokens = sent.map(
      (s) => `${s.path.includes('/file/') ? 'file' : 'call'} ${s.authorization}`,
    );
    expect(tokens).toEqual([
      'call Bearer abs-token-kara',
      'call Bearer abs-token-kara',
      'file Bearer abs-token-kara',
      'call Bearer abs-token-otto',
      'call Bearer abs-token-otto',
      'file Bearer abs-token-otto',
    ]);
    expect(sent.filter((s) => s.path.includes('/file/')).map((s) => s.range)).toEqual([
      'bytes=0-9',
      'bytes=0-9',
    ]);
  });

  it('refuses someone with no Audiobookshelf link, asking nothing upstream', async () => {
    const { app, sent, as } = await server({ ottoLinked: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as('otto'),
      payload: { ref: { source: 'abs', id: itemId } },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'not_linked' });
    expect(sent).toEqual([]);
  });

  it('refuses a ref or a file path that could change the upstream path', async () => {
    const { app, as } = await server();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as('kara'),
      payload: { ref: { source: 'abs', id: '../users' } },
    });
    expect(bad.statusCode).toBe(400);
    const badFile = await app.inject({
      method: 'GET',
      url: `/api/stream/abs/${itemId}/1%2F..`,
      headers: as('kara'),
    });
    expect(badFile.statusCode).toBe(400);
  });
});
