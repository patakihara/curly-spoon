/**
 * Playing Audiobookshelf items through the real routes. Audiobookshelf answers from its
 * recordings: a single-file book and a four-file book played directly (their play sessions and
 * closes, details, and file calls with real status and headers over committed tones), and the
 * four-file book transcoded (its play session, playlist, a segment before and after it is cut,
 * and its close).
 */
import { readFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { type AddressInfo } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HLS_MIME, type PlaybackPlan } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch, standInsBeside } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { buildApp } from './app.js';
import { type PlaybackOptions } from './routes/play.js';
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
const multi = ['multi-play', 'multi-detail', 'multi-close', 1, 2, 3, 4].map((call) =>
  absRecording(typeof call === 'number' ? `multi-file-${call}` : call),
);
const hls = ['hls-play', 'hls-playlist', 'hls-segment', 'hls-close'].map(absRecording);
const hlsPending = absRecording('hls-segment-pending');
const jsonOf = <T>(r: Recording) => (r.response.body as { json: T }).json;
interface RecordedSession {
  id: string;
  currentTime: number;
  chapters: { title: string; start: number; end: number }[];
  audioTracks: { contentUrl: string; mimeType: string; duration: number; startOffset: number }[];
}
const multiSession = jsonOf<RecordedSession>(multi[0]!);
const multiId = multi[0]!.request.path.split('/')[3] as string;
const hlsSession = jsonOf<RecordedSession>(hls[0]!);
const recordedPlaylist = (hls[1]!.response.body as { text: string }).text;
const segmentTone = readFileSync(
  join(adapters, 'audiobookshelf', 'recordings', 'hls-segment.mp2t'),
);
const mp3Tone = readFileSync(join(adapters, 'audiobookshelf', 'recordings', 'multi-file.mp3'));
const itemId = itemPlay.request.path.split('/')[3] as string;
const recordedTrack = (
  (itemPlay.response.body as { json: { audioTracks: Record<string, unknown>[] } }).json
    .audioTracks as { mimeType: string; duration: number; startOffset: number; ino: string }[]
)[0];
const tone = readFileSync(join(adapters, 'audiobookshelf', 'recordings', 'item-file.m4a'));
const trackUrl = (n: number | string, ref = `abs:${itemId}`) => `/api/media/${ref}/tracks/${n}`;

/**
 * The recorded play session with its one track's `contentUrl` pointed somewhere that is neither a
 * file nor a transcode: the only change to the recording, to make planning fail after the
 * session is open.
 */
function unplayableSession(): Recording {
  const copy = structuredClone(itemPlay);
  const json = (copy.response.body as { json: { audioTracks: { contentUrl: string }[] } }).json;
  for (const track of json.audioTracks) {
    track.contentUrl = `/elsewhere/${itemId}`;
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
  options: {
    ottoLinked?: boolean;
    play?: Recording;
    fileFails?: boolean;
    /** Which recorded book Audiobookshelf holds: one file, four files, or four transcoded. */
    book?: 'single' | 'multi' | 'hls';
    /** Each transcode after the first gets the next of these ids instead of the recorded one. */
    laterSessionIds?: string[];
    /** The recorded playlist with each segment URI carrying this query, as some ABS versions write it. */
    playlistQuery?: string;
    /** ABS never cuts the first segment: it answers 404 every time. */
    segmentNeverCut?: boolean;
    playback?: PlaybackOptions;
    now?: () => number;
  } = {},
) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const recordings = {
    single: [options.play ?? itemPlay, itemDetail, itemFile, sessionClose],
    multi,
    hls,
  }[options.book ?? 'single'];
  const playlist = structuredClone(hls[1]!);
  if (options.playlistQuery !== undefined) {
    const text = (playlist.response.body as { text: string }).text;
    playlist.response.body = {
      text: text.replace(/^(output-\d+\.ts)$/gm, `$1${options.playlistQuery}`),
    };
  }
  const replay = replayFetch(
    recordings.map((r) => (r.call === 'hls-playlist' ? playlist : r)),
    { readBytes: standInsBeside(adapters) },
  );
  const laterIds = [...(options.laterSessionIds ?? [])];
  let transcodes = 0;
  /** A later transcode's answer: the recorded one under its next id. */
  const renamed = async (response: Response): Promise<Response> => {
    transcodes += 1;
    const id = transcodes > 1 ? laterIds.shift() : undefined;
    if (id === undefined) return response;
    const text = (await response.text()).replaceAll(hlsSession.id, id);
    return new Response(text, { status: response.status, headers: response.headers });
  };
  // Each segment is asked for once too early, as ABS answers a segment it has not cut yet.
  const early = replayFetch([hlsPending]);
  const askedSegments = new Set<string>();
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
    if (path === hlsPending.request.path && (options.segmentNeverCut || !askedSegments.has(path))) {
      askedSegments.add(path);
      return early(url, init);
    }
    const later = (options.laterSessionIds ?? []).find((id) => path.includes(id));
    if (later !== undefined) {
      return replay(url.replaceAll(later, hlsSession.id), init);
    }
    if (options.book === 'hls' && path === hls[0]!.request.path) {
      return renamed(await replay(url, init));
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
    ...(options.playback ? { playback: options.playback } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  apps.push(app);
  const as = (name: string) => ({ authorization: `Bearer ${bearer[name] ?? ''}` });
  const planned = options.book === undefined || options.book === 'single' ? itemId : multiId;
  const plan = async (name = 'kara') => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as(name),
      payload: { ref: { source: 'abs', id: planned } },
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
  it("plans the recording's one track by the item's ref and the track's index, its chapters, and where to start", async () => {
    const { plan } = await server();
    const session = jsonOf<RecordedSession>(itemPlay);
    expect(await plan()).toEqual({
      tracks: [
        {
          url: trackUrl(0),
          mime: recordedTrack?.mimeType,
          duration: recordedTrack?.duration,
          offset: recordedTrack?.startOffset,
        },
      ],
      chapters: session.chapters.map(({ title, start, end }) => ({ title, start, end })),
      startAt: session.currentTime,
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
    const { app, sent, as } = await server({ play: unplayableSession() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as('kara'),
      payload: { ref: { source: 'abs', id: itemId } },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'unplayable' });
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

describe('[M1.play/b] direct play of a multi-file Audiobookshelf book', () => {
  it("[M1.play/b] every one of the plan's track URLs answers a range request with 206", async () => {
    const { app, as, plan } = await server({ book: 'multi' });
    const { tracks } = await plan();
    expect(tracks.map((t) => t.url)).toEqual(
      [0, 1, 2, 3].map((n) => trackUrl(n, `abs:${multiId}`)),
    );
    for (const track of tracks) {
      const res = await app.inject({
        method: 'GET',
        url: track.url,
        headers: { ...as('kara'), range: 'bytes=100-199' },
      });
      expect(res.statusCode, track.url).toBe(206);
      expect(res.headers['content-type']).toBe('audio/mpeg');
      expect(res.headers['content-range']).toBe(`bytes 100-199/${mp3Tone.byteLength}`);
      expect(res.rawPayload).toEqual(mp3Tone.subarray(100, 200));
    }
  });

  it('plans one track per file, in order, each at the offset where the one before it ends', async () => {
    const { plan } = await server({ book: 'multi' });
    const { tracks, progressTarget } = await plan();
    expect(tracks).toEqual(
      multiSession.audioTracks.map((t, n) => ({
        url: trackUrl(n, `abs:${multiId}`),
        mime: t.mimeType,
        duration: t.duration,
        offset: t.startOffset,
      })),
    );
    for (const [n, track] of tracks.entries()) {
      if (n === 0) continue;
      const before = tracks[n - 1]!;
      expect(track.offset).toBeCloseTo(before.offset + before.duration, 3);
    }
    expect(progressTarget).toBeUndefined();
  });
});

describe('[M1.play/e] chapters across files', () => {
  it('[M1.play/e] chapters spanning files sit at their absolute positions in the plan', async () => {
    const { plan } = await server({ book: 'multi' });
    const { tracks, chapters } = await plan();
    expect(chapters.map((c) => c.title)).toEqual(multiSession.chapters.map((c) => c.title));
    // The recorded book has a chapter per file: each starts where its file starts in the whole
    // book, not at 0 within its file, and ends where the next file starts.
    for (const [n, chapter] of chapters.entries()) {
      const track = tracks[n]!;
      expect(chapter.start, chapter.title).toBeCloseTo(track.offset, 3);
      expect(chapter.end, chapter.title).toBeCloseTo(track.offset + track.duration, 3);
    }
    expect(chapters[2]!.start).toBeGreaterThan(tracks[0]!.duration + tracks[1]!.duration - 0.001);
    const total = tracks.reduce((sum, t) => sum + t.duration, 0);
    expect(chapters.at(-1)!.end).toBeCloseTo(total, 3);
  });

  it('[M1.play/e] a position in the plan falls in the file whose offset span holds it', async () => {
    const { plan } = await server({ book: 'multi' });
    const { tracks, chapters } = await plan();
    const fileAt = (position: number) =>
      tracks.findLastIndex((t) => t.offset <= position && position < t.offset + t.duration);
    expect(chapters.map((c) => fileAt((c.start + c.end) / 2))).toEqual([0, 1, 2, 3]);
  });
});

describe('[M1.play/a] the HLS path, for a book Audiobookshelf transcodes', () => {
  const hlsUrl = (file: string) => `/api/media/abs:${multiId}/hls/${hlsSession.id}/${file}`;

  it('[M1.play/a] plans one HLS track the server proxies, and a segment it names returns audio', async () => {
    const { app, as, plan, sent } = await server({ book: 'hls' });
    const planned = await plan();
    expect(planned.tracks).toEqual([
      {
        url: hlsUrl('output.m3u8'),
        mime: HLS_MIME,
        duration: hlsSession.audioTracks[0]!.duration,
        offset: 0,
      },
    ]);

    const playlist = await app.inject({
      method: 'GET',
      url: planned.tracks[0]!.url,
      headers: as('kara'),
    });
    expect(playlist.statusCode).toBe(200);
    expect(playlist.headers['content-type']).toBe(HLS_MIME);
    const segments = playlist.body.split('\n').filter((l) => l !== '' && !l.startsWith('#'));
    expect(segments.length).toBeGreaterThan(20);

    const first = new URL(segments[0]!, `http://auralis.invalid${planned.tracks[0]!.url}`);
    expect(first.pathname).toBe(hlsUrl('output-0.ts'));
    const segment = await app.inject({ method: 'GET', url: first.pathname, headers: as('kara') });
    expect(segment.statusCode).toBe(200);
    expect(segment.headers['content-type']).toBe('audio/mp2t');
    expect(segment.rawPayload).toEqual(segmentTone);
    // Asked once before it was cut (404) and again once it was.
    expect(sent.filter((s) => s.path.endsWith('/output-0.ts'))).toHaveLength(2);
  });

  it('keeps the transcode open for playing, names it as the progress target, and closes it on request', async () => {
    const { app, as, plan, sent } = await server({ book: 'hls' });
    const planned = await plan();
    expect(planned.progressTarget).toEqual({ playId: hlsSession.id });
    expect(planned.chapters.map((c) => c.start)).toEqual(hlsSession.chapters.map((c) => c.start));
    expect(sent.map((s) => s.method)).toEqual(['POST']);

    const closed = await app.inject({
      method: 'POST',
      url: `/api/play/${hlsSession.id}/close`,
      headers: as('kara'),
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toEqual({ ok: true });
    expect(sent.at(-1)).toMatchObject({
      method: 'POST',
      path: `/api/session/${hlsSession.id}/close`,
      authorization: 'Bearer abs-token-kara',
    });
  });

  it('passes the playlist on as recorded: segment names only, relative to it', async () => {
    const { app, as, plan } = await server({ book: 'hls' });
    await plan();
    const res = await app.inject({
      method: 'GET',
      url: hlsUrl('output.m3u8'),
      headers: as('kara'),
    });
    expect(res.body).toBe(recordedPlaylist);
  });

  it('cuts a query off every segment name, so an upstream token never reaches the client', async () => {
    const { app, as, plan } = await server({ book: 'hls', playlistQuery: '?token=abs-token-kara' });
    await plan();
    const res = await app.inject({
      method: 'GET',
      url: hlsUrl('output.m3u8'),
      headers: as('kara'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('token');
    const uris = res.body.split('\n').filter((l) => l !== '' && !l.startsWith('#'));
    expect(uris.length).toBeGreaterThan(20);
    for (const uri of uris) expect(uri).toMatch(/^output-\d+\.ts$/);
  });

  it('asks Audiobookshelf with the caller’s own token for the playlist and its segments', async () => {
    const { app, as, sent, plan } = await server({ book: 'hls' });
    await plan('otto');
    await app.inject({ method: 'GET', url: hlsUrl('output.m3u8'), headers: as('otto') });
    await app.inject({ method: 'GET', url: hlsUrl('output-0.ts'), headers: as('otto') });
    expect(sent.map((s) => s.authorization)).toEqual(
      Array<string>(4).fill('Bearer abs-token-otto'),
    );
  });

  it("refuses someone else's transcode, its playlist, segments and close, with 404, asking nothing", async () => {
    const { app, as, sent, plan } = await server({ book: 'hls' });
    await plan('kara');
    const asked = sent.length;
    for (const url of [hlsUrl('output.m3u8'), hlsUrl('output-0.ts')]) {
      const res = await app.inject({ method: 'GET', url, headers: as('otto') });
      expect(res.statusCode, url).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
    const close = await app.inject({
      method: 'POST',
      url: `/api/play/${hlsSession.id}/close`,
      headers: as('otto'),
    });
    expect(close.statusCode).toBe(404);
    expect(sent).toHaveLength(asked);
    // Still kara's: her playlist answers.
    const hers = await app.inject({
      method: 'GET',
      url: hlsUrl('output.m3u8'),
      headers: as('kara'),
    });
    expect(hers.statusCode).toBe(200);
  });

  it('refuses a transcode under another ref, and one no plan opened, with 404', async () => {
    const { app, as, sent, plan } = await server({ book: 'hls' });
    await plan();
    const asked = sent.length;
    for (const url of [
      `/api/media/abs:${itemId}/hls/${hlsSession.id}/output.m3u8`,
      `/api/media/abs:${multiId}/hls/never-planned/output.m3u8`,
    ]) {
      const res = await app.inject({ method: 'GET', url, headers: as('kara') });
      expect(res.statusCode, url).toBe(404);
    }
    expect(sent).toHaveLength(asked);
  });

  it('after its close, the transcode is gone: its playlist answers 404', async () => {
    const { app, as, plan } = await server({ book: 'hls' });
    await plan();
    await app.inject({
      method: 'POST',
      url: `/api/play/${hlsSession.id}/close`,
      headers: as('kara'),
    });
    const res = await app.inject({
      method: 'GET',
      url: hlsUrl('output.m3u8'),
      headers: as('kara'),
    });
    expect(res.statusCode).toBe(404);
  });

  it('closes a transcode nothing has asked for within the idle time, and not one still playing', async () => {
    let now = 1_000_000;
    const idleMs = 10 * 60_000;
    const { app, as, sent, plan } = await server({
      book: 'hls',
      laterSessionIds: ['second-play'],
      playback: { idleMs },
      now: () => now,
    });
    await plan('kara');
    await plan('otto');
    const ottos = `/api/media/abs:${multiId}/hls/second-play/output.m3u8`;
    const closes = () => sent.filter((s) => s.path.endsWith('/close')).map((s) => s.authorization);

    now += idleMs - 1;
    await app.inject({ method: 'GET', url: ottos, headers: as('otto') });
    expect(closes()).toEqual([]);

    // Any playback request sweeps, as a timer does every minute: kara's has gone idle.
    now += 2;
    expect((await app.inject({ method: 'GET', url: ottos, headers: as('otto') })).statusCode).toBe(
      200,
    );
    expect(closes()).toEqual(['Bearer abs-token-kara']);

    now += idleMs + 1;
    const late = await app.inject({ method: 'GET', url: ottos, headers: as('otto') });
    expect(late.statusCode).toBe(404);
    expect(closes()).toEqual(['Bearer abs-token-kara', 'Bearer abs-token-otto']);
  });

  it('closes the idle transcode of a person who played, as the one who opened it', async () => {
    let now = 0;
    const idleMs = 60_000;
    const { app, as, sent, plan } = await server({
      book: 'hls',
      playback: { idleMs },
      now: () => now,
    });
    await plan('kara');
    now += idleMs + 1;
    const res = await app.inject({
      method: 'GET',
      url: hlsUrl('output.m3u8'),
      headers: as('kara'),
    });
    expect(res.statusCode).toBe(404);
    expect(sent.at(-1)).toMatchObject({
      method: 'POST',
      path: `/api/session/${hlsSession.id}/close`,
      authorization: 'Bearer abs-token-kara',
    });
  });

  it("closes a device's open transcode when that device plans something new, and only that one", async () => {
    const { app, as, sent, plan } = await server({
      book: 'hls',
      laterSessionIds: ['second-play', 'third-play'],
    });
    await plan('kara');
    await plan('otto');
    const second = await plan('kara');
    expect(second.progressTarget).toEqual({ playId: 'third-play' });
    expect(sent.filter((s) => s.path.endsWith('/close'))).toEqual([
      expect.objectContaining({
        path: `/api/session/${hlsSession.id}/close`,
        authorization: 'Bearer abs-token-kara',
      }),
    ]);
    const old = await app.inject({
      method: 'GET',
      url: hlsUrl('output.m3u8'),
      headers: as('kara'),
    });
    expect(old.statusCode).toBe(404);
    const otto = await app.inject({
      method: 'GET',
      url: `/api/media/abs:${multiId}/hls/second-play/output.m3u8`,
      headers: as('otto'),
    });
    expect(otto.statusCode).toBe(200);
  });

  it('stops asking for a segment that is not cut yet once the client has gone', async () => {
    const { app, as, sent, plan } = await server({
      book: 'hls',
      segmentNeverCut: true,
      playback: { segmentWait: { tries: 10_000, everyMs: 10 } },
    });
    await plan();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const asks = () => sent.filter((s) => s.path.endsWith('/output-0.ts')).length;
    const request = httpGet({
      host: '127.0.0.1',
      port,
      path: hlsUrl('output-0.ts'),
      headers: as('kara'),
    });
    request.on('error', () => undefined);
    while (asks() < 3) await pause(5);
    request.destroy();
    await pause(100);
    const settled = asks();
    await pause(200);
    expect(asks()).toBe(settled);
    expect(settled).toBeLessThan(40);
  });

  it('refuses a transcode file, session or ref that could change the upstream path, asking nothing', async () => {
    const { app, as, sent } = await server({ book: 'hls' });
    const base = `/api/media/abs:${multiId}/hls`;
    for (const url of [
      `${base}/${hlsSession.id}/output.m3u8x`,
      `${base}/${hlsSession.id}/..%2Foutput.m3u8`,
      `${base}/${hlsSession.id}/output-0.ts%3Ftoken%3Dx`,
      `${base}/${hlsSession.id}/cover.jpg`,
      `${base}/..%2F${hlsSession.id}/output.m3u8`,
      `/api/media/${multiId}/hls/${hlsSession.id}/output.m3u8`,
    ]) {
      const res = await app.inject({ method: 'GET', url, headers: as('kara') });
      expect(res.statusCode, url).toBe(400);
    }
    const close = await app.inject({
      method: 'POST',
      url: '/api/play/..%2Fusers/close',
      headers: as('kara'),
    });
    expect(close.statusCode).toBe(400);
    expect(sent).toEqual([]);
  });

  it('refuses the transcode and its close without a session or a link', async () => {
    const { app, sent, as } = await server({ book: 'hls', ottoLinked: false });
    expect((await app.inject({ method: 'GET', url: hlsUrl('output.m3u8') })).statusCode).toBe(401);
    const unlinked = await app.inject({
      method: 'GET',
      url: hlsUrl('output-0.ts'),
      headers: as('otto'),
    });
    expect(unlinked.statusCode).toBe(409);
    const close = await app.inject({ method: 'POST', url: `/api/play/${hlsSession.id}/close` });
    expect(close.statusCode).toBe(401);
    expect(sent).toEqual([]);
  });
});
