/**
 * Playing Jellyfin music through the real routes. Jellyfin answers from its recordings, made as
 * the service identity with its own token: one album, its tracks, its first track, that track's
 * static stream with real status and headers over a committed FLAC tone, and a play's start,
 * progress and stop reports.
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
const jfRecording = (call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, 'jellyfin', 'recordings', `${call}.json`), 'utf8')),
  );
const album = jfRecording('jf-album');
const albumTracks = jfRecording('jf-album-tracks');
const track = jfRecording('jf-track');
const stream = jfRecording('jf-stream');
const playing = jfRecording('jf-playing');
const progress = jfRecording('jf-progress');
const stopped = jfRecording('jf-stopped');
const flacTone = readFileSync(join(adapters, 'jellyfin', 'recordings', 'jf-stream.flac'));

const albumId = album.request.path.split('/')[2] as string;
const trackId = track.request.path.split('/')[2] as string;
interface RecordedTrack {
  Id: string;
  RunTimeTicks: number;
  IndexNumber: number;
  ParentIndexNumber?: number | null;
}
const recordedTracks = (albumTracks.response.body as { json: { Items: RecordedTrack[] } }).json
  .Items;
const trackUrl = (id: string) => `/api/media/jellyfin:${id}/tracks/0`;

/** An item's media streams, as the codec check reads them. */
interface AudioJson {
  Container: string;
  MediaStreams: { Type: string; Codec?: string }[];
}
const audioStreamOf = (json: AudioJson) => json.MediaStreams.find((s) => s.Type === 'Audio')!;

/** A recording with its JSON answer changed by `edit`: the only change, named by each test. */
function edited<T>(r: Recording, edit: (json: T) => void): Recording {
  const copy = structuredClone(r);
  edit((copy.response.body as { json: T }).json);
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
  json: unknown;
}

/** Two people, kara and otto, each with an app's bearer token; otto can be left unlinked. */
async function server(
  options: { ottoLinked?: boolean; recordings?: Recording[]; reports?: Recording[] } = {},
) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const replay = replayFetch(
    [
      ...(options.recordings ?? [album, albumTracks, track, stream]),
      ...(options.reports ?? [playing, progress, stopped]),
    ],
    { readBytes: standInsBeside(adapters) },
  );
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    sent.push({
      method: init?.method ?? 'GET',
      path: new URL(url).pathname,
      authorization: headers.get('authorization') ?? '',
      range: headers.get('range'),
      json: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    return replay(url, init);
  };
  const bearer: Record<string, string> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    if (name === 'kara' || options.ottoLinked !== false) {
      saveLink(db, KEY, {
        userId: user.id,
        service: 'jellyfin',
        upstreamUserId: `jf-${name}`,
        token: `jf-token-${name}`,
        state: 'linked',
      });
    }
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: { key: KEY, config: { absUrl: undefined, jellyfinUrl: PLACEHOLDER_ORIGIN }, fetch },
  });
  apps.push(app);
  const as = (name: string) => ({ authorization: `Bearer ${bearer[name] ?? ''}` });
  const play = (id: string, name = 'kara') =>
    app.inject({
      method: 'POST',
      url: '/api/play',
      headers: as(name),
      payload: { ref: { source: 'jellyfin', id } },
    });
  const plan = async (id: string) => {
    const res = await play(id);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PlaybackPlan>();
  };
  return { app, sent, as, play, plan };
}

describe('[M1.music/a] playing a Jellyfin track', () => {
  it('[M1.music/a] plans the track as one track the server proxies, and its URL answers a range request with 206', async () => {
    const { app, as, plan } = await server();
    const { tracks } = await plan(trackId);
    expect(tracks).toEqual([
      { url: trackUrl(trackId), mime: 'audio/flac', duration: 219.710726, offset: 0 },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: tracks[0]!.url,
      headers: { ...as('kara'), range: 'bytes=0-99' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-type']).toBe('audio/flac');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-range']).toBe(`bytes 0-99/${flacTone.byteLength}`);
    expect(res.headers['content-length']).toBe('100');
    expect(res.rawPayload).toEqual(flacTone.subarray(0, 100));
  });
});

describe('playing a Jellyfin track', () => {
  it('starts at the beginning, with no chapters, under a play of its own', async () => {
    const { plan } = await server();
    const first = await plan(trackId);
    expect(first).toEqual({
      tracks: [expect.objectContaining({ url: trackUrl(trackId) })],
      chapters: [],
      startAt: 0,
      progressTarget: { playId: expect.stringMatching(/^[\w-]{1,64}$/) as unknown },
    });
    const second = await plan(trackId);
    expect(second.progressTarget.playId).not.toBe(first.progressTarget.playId);
  });

  it('closes its play on request, once, and only for the person who planned it', async () => {
    const { app, as, plan } = await server();
    const { playId } = (await plan(trackId)).progressTarget;
    const close = (name: string) =>
      app.inject({ method: 'POST', url: `/api/play/${playId}/close`, headers: as(name) });
    expect((await close('otto')).statusCode).toBe(404);
    expect((await close('kara')).statusCode).toBe(200);
    expect((await close('kara')).statusCode).toBe(404);
  });

  it("looks the track up, then streams its own file untranscoded, with the person's own token", async () => {
    const { app, sent, as, plan } = await server();
    await plan(trackId);
    await app.inject({
      method: 'GET',
      url: trackUrl(trackId),
      headers: { ...as('kara'), range: 'bytes=0-1' },
    });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `GET /Items/${trackId}`,
      'POST /Sessions/Playing',
      `GET /Items/${trackId}`,
      `GET /Audio/${trackId}/stream`,
    ]);
    expect(sent[3]?.range).toBe('bytes=0-1');
    for (const s of sent) expect(s.authorization).toContain('Token="jf-token-kara"');
  });

  it('streams the whole file, 200, to a request without a range', async () => {
    const { app, as } = await server();
    const res = await app.inject({ method: 'GET', url: trackUrl(trackId), headers: as('kara') });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-length']).toBe(String(flacTone.byteLength));
    expect(res.rawPayload).toEqual(flacTone);
  });

  it('streams nothing for an item that is not a track, asking Jellyfin for no file', async () => {
    const { app, sent, as } = await server();
    const res = await app.inject({ method: 'GET', url: trackUrl(albumId), headers: as('kara') });
    expect(res.statusCode).toBe(404);
    expect(sent.map((s) => s.path)).toEqual([`/Items/${albumId}`]);
  });

  it('answers 404 for any track index but 0, asking Jellyfin nothing', async () => {
    const { app, sent, as } = await server();
    const res = await app.inject({
      method: 'GET',
      url: `/api/media/jellyfin:${trackId}/tracks/1`,
      headers: as('kara'),
    });
    expect(res.statusCode).toBe(404);
    expect(sent).toEqual([]);
  });

  it('refuses a Jellyfin id that is not one, asking Jellyfin nothing', async () => {
    const { app, sent, as, play } = await server();
    expect((await play('not-a-jellyfin-id')).statusCode).toBe(400);
    const res = await app.inject({
      method: 'GET',
      url: trackUrl('not-a-jellyfin-id'),
      headers: as('kara'),
    });
    expect(res.statusCode).toBe(400);
    expect(sent).toEqual([]);
  });

  it('refuses a track in a container the clients do not play with 422, since nothing is transcoded', async () => {
    const ape = edited<{ Container: string }>(track, (json) => {
      json.Container = 'ape';
    });
    const { play } = await server({ recordings: [ape] });
    const res = await play(trackId);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'unsupported_format' });
  });

  it('refuses ALAC in an m4a with 422: the container plays, the codec does not', async () => {
    const alac = edited<AudioJson>(track, (json) => {
      json.Container = 'm4a';
      audioStreamOf(json).Codec = 'alac';
    });
    const { play } = await server({ recordings: [alac] });
    const res = await play(trackId);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'unsupported_format' });
  });

  it('plans AAC in an m4a as audio/mp4', async () => {
    const aac = edited<AudioJson>(track, (json) => {
      json.Container = 'm4a';
      audioStreamOf(json).Codec = 'aac';
    });
    const { plan } = await server({ recordings: [aac] });
    const { tracks } = await plan(trackId);
    expect(tracks.map((t) => t.mime)).toEqual(['audio/mp4']);
  });

  it('refuses with 422 a track whose audio codec Jellyfin does not name', async () => {
    const unnamed = edited<AudioJson>(track, (json) => {
      json.MediaStreams = json.MediaStreams.filter((s) => s.Type !== 'Audio');
    });
    const { play } = await server({ recordings: [unnamed] });
    const res = await play(trackId);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'unsupported_format' });
  });

  it('answers 416 to a range past the end, naming the file size in Content-Range', async () => {
    const { app, as } = await server();
    const res = await app.inject({
      method: 'GET',
      url: trackUrl(trackId),
      headers: { ...as('kara'), range: `bytes=${flacTone.byteLength}-` },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${flacTone.byteLength}`);
    expect(res.json()).toEqual({ error: 'range_not_satisfiable' });
  });

  it('answers 409 to someone with no Jellyfin link, asking Jellyfin nothing', async () => {
    const { sent, play } = await server({ ottoLinked: false });
    const res = await play(trackId, 'otto');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'not_linked' });
    expect(sent).toEqual([]);
  });
});

describe('[M1.music/b] playing a Jellyfin album', () => {
  it('[M1.music/b] plans the album as one plan, its tracks in order, back to back', async () => {
    const { plan } = await server();
    const { tracks, chapters, startAt } = await plan(albumId);
    let offset = 0;
    const expected = recordedTracks.map((t) => {
      const duration = t.RunTimeTicks / 1e7;
      const planned = { url: trackUrl(t.Id), mime: 'audio/flac', duration, offset };
      offset += duration;
      return planned;
    });
    expect(tracks).toEqual(expected);
    expect(recordedTracks.map((t) => t.IndexNumber)).toEqual(recordedTracks.map((_, n) => n + 1));
    expect(chapters).toEqual([]);
    expect(startAt).toBe(0);
  });

  it('[M1.music/b] orders the tracks by disc, then track number, whatever order Jellyfin answers in', async () => {
    const shuffled = edited<{ Items: RecordedTrack[] }>(albumTracks, (json) => {
      json.Items.reverse();
      json.Items[0]!.ParentIndexNumber = 2;
    });
    const { plan } = await server({ recordings: [album, shuffled] });
    const { tracks } = await plan(albumId);
    const last = recordedTracks[recordedTracks.length - 1]!;
    const discOne = recordedTracks.slice(0, -1);
    expect(tracks.map((t) => t.url)).toEqual([...discOne, last].map((t) => trackUrl(t.Id)));
  });

  it("plays the album's first track through its URL in the plan", async () => {
    const { app, as, plan } = await server();
    const { tracks } = await plan(albumId);
    const res = await app.inject({
      method: 'GET',
      url: tracks[0]!.url,
      headers: { ...as('kara'), range: 'bytes=0-1' },
    });
    expect(res.statusCode).toBe(206);
  });

  it('refuses with 422 an album with any track in a format the clients do not play', async () => {
    const oneAlac = edited<{ Items: AudioJson[] }>(albumTracks, (json) => {
      json.Items[1]!.Container = 'm4a';
      audioStreamOf(json.Items[1]!).Codec = 'alac';
    });
    const { play } = await server({ recordings: [album, oneAlac] });
    const res = await play(albumId);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'unsupported_format' });
  });

  it('answers 404 to an album with no tracks', async () => {
    const empty = edited<{ Items: unknown[] }>(albumTracks, (json) => {
      json.Items = [];
    });
    const { play } = await server({ recordings: [album, empty] });
    const res = await play(albumId);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it("asks for the album and its tracks with the person's own token", async () => {
    const { sent, plan } = await server();
    await plan(albumId);
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `GET /Items/${albumId}`,
      'GET /Items',
      'POST /Sessions/Playing',
    ]);
    for (const s of sent) expect(s.authorization).toContain('Token="jf-token-kara"');
  });
});

describe("reporting an album's progress to Jellyfin", () => {
  const report = (
    app: FastifyInstance,
    headers: Record<string, string>,
    playId: string,
    seq: number,
    at: number,
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/progress',
      headers,
      payload: { playId, seq, position: at, listened: 0, paused: false },
    });
  const reported = (sent: Sent[]) =>
    sent
      .filter((s) => s.path.startsWith('/Sessions/Playing'))
      .map((s) => {
        const json = s.json as { ItemId: string; PositionTicks: number };
        return `${s.path} ${json.ItemId} ${json.PositionTicks / 1e7}`;
      });

  it('starts the first track, reports each position within the track it falls in, and moves on to the next track by stopping one and starting the other', async () => {
    const { app, sent, as, plan } = await server();
    const { tracks, progressTarget } = await plan(albumId);
    const [first, second] = recordedTracks as [RecordedTrack, RecordedTrack];
    const secondStart = tracks[1]!.offset;
    expect((await report(app, as('kara'), progressTarget.playId, 0, 10)).statusCode).toBe(200);
    expect(
      (await report(app, as('kara'), progressTarget.playId, 1, secondStart + 4)).statusCode,
    ).toBe(200);
    const close = await app.inject({
      method: 'POST',
      url: `/api/play/${progressTarget.playId}/close`,
      headers: as('kara'),
      payload: { seq: 2, position: secondStart + 6, listened: 0, paused: true },
    });
    expect(close.statusCode).toBe(200);
    expect(reported(sent)).toEqual([
      `/Sessions/Playing ${first.Id} 0`,
      `/Sessions/Playing/Progress ${first.Id} 10`,
      `/Sessions/Playing/Stopped ${first.Id} 10`,
      `/Sessions/Playing ${second.Id} 4`,
      `/Sessions/Playing/Stopped ${second.Id} 6`,
    ]);
  });

  it('moves on to the next track when Jellyfin does not take the stop of the one before', async () => {
    const { app, sent, as, plan } = await server({ reports: [playing] });
    const { tracks, progressTarget } = await plan(albumId);
    const [first, second] = recordedTracks as [RecordedTrack, RecordedTrack];
    const moved = await report(app, as('kara'), progressTarget.playId, 0, tracks[1]!.offset + 4);
    expect(moved.statusCode, moved.body).toBe(200);
    expect(reported(sent)).toEqual([
      `/Sessions/Playing ${first.Id} 0`,
      `/Sessions/Playing/Stopped ${first.Id} 0`,
      `/Sessions/Playing ${second.Id} 4`,
    ]);
  });
});
