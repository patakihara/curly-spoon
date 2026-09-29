/**
 * Playing one Audiobookshelf item by direct play, through the real routes. Audiobookshelf answers
 * from its recordings: the play session and its close, the item's detail, and the file call (its
 * real status and headers, with the committed tone as its body).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
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
const itemDetail = absRecording('item-detail');
const itemFile = absRecording('item-file');
const sessionClose = absRecording('session-close');
const itemId = itemPlay.request.path.split('/')[3] as string;
const recordedTrack = (
  (itemPlay.response.body as { json: { audioTracks: Record<string, unknown>[] } }).json
    .audioTracks as { mimeType: string; duration: number; startOffset: number; ino: string }[]
)[0];
const tone = readFileSync(join(adapters, 'audiobookshelf', 'recordings', 'item-file.m4a'));
const trackUrl = (n: number | string, ref = `abs:${itemId}`) => `/api/media/${ref}/tracks/${n}`;

/**
 * The recorded play session with its one track's `contentUrl` pointed at HLS, as a transcoded
 * session would name it: the only change to the recording, to make planning fail after the
 * session is open.
 */
function hlsSession(): Recording {
  const copy = structuredClone(itemPlay);
  const json = (copy.response.body as { json: { audioTracks: { contentUrl: string }[] } }).json;
  for (const track of json.audioTracks) {
    track.contentUrl = `/hls/${itemId}/output.m3u8`;
  }
  return copy;
}

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
async function server(
  options: { ottoLinked?: boolean; play?: Recording; fileFails?: boolean } = {},
) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const replay = replayFetch([options.play ?? itemPlay, itemDetail, itemFile, sessionClose], {
    readBytes: standInsBeside(adapters),
  });
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    const path = new URL(url).pathname;
    sent.push({
      method: init?.method ?? 'GET',
      path,
      authorization: headers.get('authorization') ?? '',
      range: headers.get('range'),
    });
    if (options.fileFails === true && path.includes('/file/')) {
      throw new TypeError(`fetch failed: ${url} with ${headers.get('authorization')}`);
    }
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
      expect(res.headers['content-length']).toBe('100');
      expect(res.rawPayload).toEqual(tone.subarray(0, 100));
    }
  });
});

describe('playing one Audiobookshelf item by direct play', () => {
  it("plans the recording's one track by the item's ref and the track's index, with nothing M0 does not fill", async () => {
    const { plan } = await server();
    expect(await plan()).toEqual({
      tracks: [
        {
          url: trackUrl(0),
          mime: recordedTrack?.mimeType,
          duration: recordedTrack?.duration,
          offset: recordedTrack?.startOffset,
        },
      ],
      chapters: [],
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

  it('still closes the session when planning fails after it opened', async () => {
    const { app, sent, as } = await server({ play: hlsSession() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as('kara'),
      payload: { ref: { source: 'abs', id: itemId } },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'not_direct_play' });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `POST ${itemPlay.request.path}`,
      `POST ${sessionClose.request.path}`,
    ]);
  });

  it("maps a track's ref and index to the item's file upstream", async () => {
    const { app, sent, as } = await server();
    await app.inject({ method: 'GET', url: trackUrl(0), headers: as('kara') });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `GET ${itemDetail.request.path}`,
      `GET ${itemFile.request.path}`,
    ]);
  });

  it('streams the whole file, 200, to a request without a range', async () => {
    const { app, as } = await server();
    const res = await app.inject({ method: 'GET', url: trackUrl(0), headers: as('kara') });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-length']).toBe(String(tone.byteLength));
    expect(res.rawPayload).toEqual(tone);
  });

  it('answers HEAD with the headers GET would send, and no body', async () => {
    const { app, as } = await server();
    const headers = { ...as('kara'), range: 'bytes=0-99' };
    const get = await app.inject({ method: 'GET', url: trackUrl(0), headers });
    const head = await app.inject({ method: 'HEAD', url: trackUrl(0), headers });
    expect(head.statusCode).toBe(206);
    for (const name of ['content-type', 'accept-ranges', 'content-range', 'content-length']) {
      expect(head.headers[name], name).toBe(get.headers[name]);
    }
    expect(head.rawPayload.byteLength).toBe(0);
  });

  it('answers 416 to a range past the end of the file', async () => {
    const { app, as } = await server();
    const res = await app.inject({
      method: 'GET',
      url: trackUrl(0),
      headers: { ...as('kara'), range: `bytes=${tone.byteLength}-` },
    });
    expect(res.statusCode).toBe(416);
    expect(res.json()).toEqual({ error: 'range_not_satisfiable' });
  });

  it('answers 404 to a track the item does not have, asking for no file', async () => {
    const { app, sent, as } = await server();
    const res = await app.inject({ method: 'GET', url: trackUrl(1), headers: as('kara') });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(sent.some((s) => s.path.includes('/file/'))).toBe(false);
  });

  it('refuses to plan or stream without a session', async () => {
    const { app, sent } = await server();
    const planned = await app.inject({
      method: 'POST',
      url: '/api/play',
      payload: { ref: { source: 'abs', id: itemId } },
    });
    expect(planned.statusCode).toBe(401);
    for (const method of ['GET', 'HEAD'] as const) {
      const streamed = await app.inject({ method, url: trackUrl(0) });
      expect(streamed.statusCode).toBe(401);
    }
    expect(sent).toEqual([]);
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
    expect(sent.map((s) => s.authorization)).toEqual([
      ...Array<string>(4).fill('Bearer abs-token-kara'),
      ...Array<string>(4).fill('Bearer abs-token-otto'),
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
    const streamed = await app.inject({ method: 'GET', url: trackUrl(0), headers: as('otto') });
    expect(streamed.statusCode).toBe(409);
    expect(sent).toEqual([]);
  });

  it('refuses a ref or a track index that could change the upstream path, asking nothing', async () => {
    const { app, sent, as } = await server();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as('kara'),
      payload: { ref: { source: 'abs', id: '../users' } },
    });
    expect(bad.statusCode).toBe(400);
    for (const url of [
      trackUrl('1%2F..'),
      trackUrl('-1'),
      trackUrl('0x1'),
      trackUrl(0, encodeURIComponent('abs:../users')),
      trackUrl(0, itemId),
      trackUrl(0, `jellyfin:${itemId}`),
      trackUrl(0, encodeURIComponent('http://elsewhere.invalid/x')),
    ]) {
      const res = await app.inject({ method: 'GET', url, headers: as('kara') });
      expect(res.statusCode, url).toBe(400);
    }
    expect(sent).toEqual([]);
  });

  it('refuses a range that is not one plain bytes range, asking nothing', async () => {
    const { app, sent, as } = await server();
    for (const range of ['bytes=0-1,5-9', 'bytes=-', 'items=0-1', 'bytes=abc', 'bytes=0-1\u0000']) {
      const res = await app.inject({
        method: 'GET',
        url: trackUrl(0),
        headers: { ...as('kara'), range },
      });
      expect(res.statusCode, range).toBe(400);
      expect(res.json()).toEqual({ error: 'bad_range' });
    }
    expect(sent).toEqual([]);
  });

  it('answers an upstream failure without naming the upstream or its token', async () => {
    const { app, as } = await server({ fileFails: true });
    const res = await app.inject({ method: 'GET', url: trackUrl(0), headers: as('kara') });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'upstream_failed' });
    expect(res.body).not.toContain('upstream.invalid');
    expect(res.body).not.toContain('abs-token');
  });
});
