import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AbsClient } from './audiobookshelf/client.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { replayFetch, standInsBeside } from './http/replay.js';
import { JellyfinClient } from './jellyfin/client.js';

const adapters = dirname(fileURLToPath(import.meta.url));

function recording(upstream: string, call: string): Recording {
  const file = join(adapters, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

const ABS_CALLS = {
  'library-list': { method: 'GET', path: /^\/api\/libraries$/, status: 200 },
  'item-detail': { method: 'GET', path: /^\/api\/items\/[^/]+$/, status: 200 },
  'item-play': { method: 'POST', path: /^\/api\/items\/[^/]+\/play$/, status: 200 },
  'item-file': { method: 'GET', path: /^\/api\/items\/[^/]+\/file\/\d+$/, status: 206 },
  'session-close': { method: 'POST', path: /^\/api\/session\/[^/]+\/close$/, status: 200 },
} as const;

const abs = Object.fromEntries(
  Object.keys(ABS_CALLS).map((call) => [call, recording('audiobookshelf', call)]),
) as Record<keyof typeof ABS_CALLS, Recording>;

function json(body: Recording['request']['body']): Record<string, unknown> {
  if (body === null || !('json' in body)) throw new Error('expected a JSON body');
  return body.json as Record<string, unknown>;
}

const itemId = (r: Recording) => (r.request.path.split('/')[3] ?? '') as string;

const absClient = () =>
  new AbsClient({
    baseUrl: 'http://upstream.invalid',
    token: '<token>',
    fetch: replayFetch(Object.values(abs), { readBytes: standInsBeside(adapters) }),
  });

describe("[M0.record/b] Audiobookshelf's recordings from mediaserver", () => {
  it("[M0.record/b] recordings from mediaserver exist for Audiobookshelf's library list, item detail and play", () => {
    for (const [call, { method, path, status }] of Object.entries(ABS_CALLS)) {
      const r = abs[call as keyof typeof ABS_CALLS];
      expect(r.upstream, call).toBe('audiobookshelf');
      expect(r.call, call).toBe(call);
      expect(r.upstreamVersion, call).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.request.method, call).toBe(method);
      expect(r.request.path, call).toMatch(path);
      expect(r.response.status, call).toBe(status);
    }
  });

  it('[M0.record/b] each recorded Audiobookshelf call parses through the client', async () => {
    const client = absClient();
    const libraries = await client.getLibraries();
    expect(libraries.map((l) => l.mediaType)).toContain('book');

    const item = await client.getItem(itemId(abs['item-detail']));
    expect(item.mediaType).toBe('book');

    const deviceInfo = json(abs['item-play'].request.body).deviceInfo as {
      deviceId: string;
      clientVersion: string;
    };
    const session = await client.play(itemId(abs['item-play']), deviceInfo);
    expect(session.audioTracks.length).toBeGreaterThan(0);

    await expect(client.closeSession(session.id)).resolves.toBeUndefined();
  });

  it('[M0.record/b] the recorded play call offered the types the clients play, and got direct play', () => {
    const request = json(abs['item-play'].request.body);
    expect(request.forceDirectPlay).toBe(false);
    expect(request.forceTranscode).toBe(false);
    expect(request.supportedMimeTypes).toEqual(expect.arrayContaining([expect.any(String)]));

    const session = json(abs['item-play'].response.body);
    expect(session.playMethod).toBe(0);
    const tracks = session.audioTracks as { contentUrl: string; metadata: unknown }[];
    for (const track of tracks) {
      expect(track.contentUrl).toMatch(/^\/api\/items\/[^/]+\/file\/\d+$/);
      expect(track.metadata).not.toBeNull();
    }
  });

  it('[M0.record/b] the recorded play session is the one the recording closed', () => {
    const sessionId = json(abs['item-play'].response.body).id as string;
    expect(abs['session-close'].request.path).toBe(`/api/session/${sessionId}/close`);
  });

  it('[M0.record/b] the recorded item is a book, never from the Podcasts library', () => {
    const libraries = json(abs['library-list'].response.body).libraries as {
      id: string;
      mediaType: string;
    }[];
    const item = json(abs['item-detail'].response.body) as { libraryId: string };
    const library = libraries.find((l) => l.id === item.libraryId);
    expect(library?.mediaType).toBe('book');
  });
});

describe("Audiobookshelf's file call, recorded with a synthesized body", () => {
  const file = abs['item-file'];
  const standIn = () => {
    const body = file.response.body;
    if (body === null || !('bytes' in body)) throw new Error('expected a stand-in body');
    return body;
  };

  it("is the play answer's first track, asked for as a two-byte range", () => {
    const tracks = json(abs['item-play'].response.body).audioTracks as { contentUrl: string }[];
    expect(file.request.path).toBe(tracks[0]?.contentUrl);
    expect(file.request.headers.range).toBe('bytes=0-1');
  });

  it("keeps the real answer's range headers and audio type, the type the play answer names", () => {
    const tracks = json(abs['item-play'].response.body).audioTracks as { mimeType: string }[];
    expect(file.response.headers['content-type']).toBe(tracks[0]?.mimeType);
    expect(file.response.headers['accept-ranges']).toBe('bytes');
    expect(file.response.headers['content-range']).toMatch(/^bytes 0-1\/\d+$/);
  });

  it('says its body is synthesized, and names a committed MP4 file far smaller than the real one', () => {
    const body = standIn();
    expect(body.synthesized).toMatch(/synthesized|tone/i);
    const bytes = readFileSync(join(adapters, 'audiobookshelf', 'recordings', body.bytes));
    expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
    expect(bytes.byteLength).toBeLessThan(200_000);
    const realSize = Number(file.response.headers['content-range']?.split('/')[1]);
    expect(realSize).toBeGreaterThan(bytes.byteLength * 100);
  });

  it('replays through the client as a 206 of the stand-in, with the range recomputed', async () => {
    const parts = { itemId: itemId(file), ino: file.request.path.split('/')[5] ?? '' };
    const opened = await absClient().openFile(parts, 'bytes=0-99');
    expect(opened.status).toBe(206);
    expect(opened.headers['content-type']).toBe('audio/mp4');
    expect(opened.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
    expect((await new Response(opened.body).arrayBuffer()).byteLength).toBe(100);
  });
});

/** M1.play's recordings: one small multi-file book, played directly and then transcoded. */
const PLAY_CALLS = [
  'multi-detail',
  'multi-play',
  'multi-file-1',
  'multi-file-2',
  'multi-file-3',
  'multi-file-4',
  'multi-close',
  'hls-play',
  'hls-playlist',
  'hls-segment-pending',
  'hls-segment',
  'hls-close',
] as const;
const play = Object.fromEntries(
  PLAY_CALLS.map((call) => [call, recording('audiobookshelf', call)]),
) as Record<(typeof PLAY_CALLS)[number], Recording>;

describe("Audiobookshelf's play calls on a multi-file book, recorded for M1.play", () => {
  const tracksOf = (r: Recording) =>
    json(r.response.body).audioTracks as { contentUrl: string; mimeType: string }[];

  it('plays the book directly, one track per file, when every file is a type the clients play', () => {
    expect(json(play['multi-play'].request.body).forceTranscode).toBe(false);
    expect(json(play['multi-play'].response.body).playMethod).toBe(0);
    const tracks = tracksOf(play['multi-play']);
    expect(tracks.length).toBeGreaterThan(1);
    expect(tracks.map((t) => t.contentUrl)).toEqual(
      [1, 2, 3, 4].map((n) => play[`multi-file-${n}` as 'multi-file-1'].request.path),
    );
  });

  it('records each file as a two-byte range, with the real headers and a synthesized MP3 body', () => {
    for (const n of [1, 2, 3, 4]) {
      const file = play[`multi-file-${n}` as 'multi-file-1'];
      expect(file.request.headers.range).toBe('bytes=0-1');
      expect(file.response.status).toBe(206);
      expect(file.response.headers['content-type']).toBe('audio/mpeg');
      expect(file.response.body).toMatchObject({ bytes: 'multi-file.mp3' });
    }
    const mp3 = readFileSync(join(adapters, 'audiobookshelf', 'recordings', 'multi-file.mp3'));
    expect(mp3[0]).toBe(0xff);
    expect(mp3.byteLength).toBeLessThan(50_000);
  });

  it('transcodes the same book to one HLS track when asked to, and serves its playlist', () => {
    expect(json(play['hls-play'].request.body).forceTranscode).toBe(true);
    const session = json(play['hls-play'].response.body);
    expect(session.playMethod).toBe(2);
    const [track, ...rest] = tracksOf(play['hls-play']);
    expect(rest).toEqual([]);
    expect(track?.contentUrl).toBe(`/hls/${String(session.id)}/output.m3u8`);
    expect(track?.mimeType).toBe('application/vnd.apple.mpegurl');
    expect(play['hls-playlist'].request.path).toBe(track?.contentUrl);
    expect(play['hls-playlist'].response.headers['content-type']).toBe(
      'application/vnd.apple.mpegurl',
    );
  });

  it('answers 404 for a segment not cut yet, then the segment as MPEG-TS', () => {
    const path = play['hls-segment'].request.path;
    expect(play['hls-segment-pending'].request.path).toBe(path);
    expect(play['hls-segment-pending'].response.status).toBe(404);
    expect(play['hls-segment'].response.status).toBe(200);
    expect(play['hls-segment'].response.headers['content-type']).toBe('video/mp2t');
    const ts = readFileSync(join(adapters, 'audiobookshelf', 'recordings', 'hls-segment.mp2t'));
    expect(ts[0]).toBe(0x47);
  });

  it('closes both sessions it opened', () => {
    for (const [played, closed] of [
      ['multi-play', 'multi-close'],
      ['hls-play', 'hls-close'],
    ] as const) {
      const id = String(json(play[played].response.body).id);
      expect(play[closed].request.path).toBe(`/api/session/${id}/close`);
      expect(play[closed].response.status).toBe(200);
    }
  });

  it('is a book, never from the Podcasts library', () => {
    const libraries = json(abs['library-list'].response.body).libraries as {
      id: string;
      mediaType: string;
    }[];
    const item = json(play['multi-detail'].response.body) as { libraryId: string };
    expect(libraries.find((l) => l.id === item.libraryId)?.mediaType).toBe('book');
  });
});

const JELLYFIN_CALLS = {
  'library-list': { method: 'GET', path: /^\/Library\/MediaFolders$/ },
  'item-detail': { method: 'GET', path: /^\/Items\/[^/]+$/ },
} as const;

const jellyfin = Object.fromEntries(
  Object.keys(JELLYFIN_CALLS).map((call) => [call, recording('jellyfin', call)]),
) as Record<keyof typeof JELLYFIN_CALLS, Recording>;

describe("[M0.record/b] Jellyfin's recordings from mediaserver", () => {
  it("[M0.record/b] recordings from mediaserver exist for Jellyfin's library list and item detail", () => {
    for (const [call, { method, path }] of Object.entries(JELLYFIN_CALLS)) {
      const r = jellyfin[call as keyof typeof JELLYFIN_CALLS];
      expect(r.upstream, call).toBe('jellyfin');
      expect(r.call, call).toBe(call);
      expect(r.upstreamVersion, call).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.request.method, call).toBe(method);
      expect(r.request.path, call).toMatch(path);
      expect(r.response.status, call).toBe(200);
    }
  });

  it('[M0.record/b] each recorded Jellyfin call parses through the client', async () => {
    const client = new JellyfinClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch(Object.values(jellyfin)),
    });
    const libraries = await client.getLibraries();
    expect(libraries.map((l) => l.CollectionType)).toContain('music');

    const detail = jellyfin['item-detail'].request;
    const albumId = detail.path.split('/')[2] ?? '';
    const album = await client.getItem(albumId, detail.query.userId);
    expect(album.Id).toBe(albumId);
    expect(album.Type).toBe('MusicAlbum');
  });
});
