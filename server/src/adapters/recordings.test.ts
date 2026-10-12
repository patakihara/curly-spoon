import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AbsClient } from './audiobookshelf/client.js';
import { AdapterError, type FetchLike } from './http/fetch.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { replayFetch, standInsBeside } from './http/replay.js';
import { JellyfinClient, TICKS_PER_SECOND } from './jellyfin/client.js';
import { ART_WIDTH } from '../routes/items.js';
import { ABS_PROGRESS_CALLS, JELLYFIN_PROGRESS_CALLS, TEST_BOOKMARK } from './record-progress.js';

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

/** M1.music's recordings: one album played as the service identity, with its own token. */
const JELLYFIN_PLAY_CALLS = ['jf-album', 'jf-album-tracks', 'jf-track', 'jf-stream'] as const;
const jfPlay = Object.fromEntries(
  JELLYFIN_PLAY_CALLS.map((call) => [call, recording('jellyfin', call)]),
) as Record<(typeof JELLYFIN_PLAY_CALLS)[number], Recording>;

describe("Jellyfin's play calls on one album, recorded for M1.music", () => {
  const person = () =>
    new JellyfinClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch(Object.values(jfPlay), { readBytes: standInsBeside(adapters) }),
    });

  it("asks as a person's own Auralis device, never as the server or with a user id", () => {
    for (const r of Object.values(jfPlay)) {
      expect(r.request.headers.authorization, r.call).toContain('DeviceId="auralis-recorder"');
      expect(r.request.headers.authorization, r.call).toContain('Token="<token>"');
      expect(Object.keys(r.request.query), r.call).not.toContain('userId');
    }
  });

  it('parses the album, its tracks and its first track through the client', async () => {
    const albumId = jfPlay['jf-album'].request.path.split('/')[2] ?? '';
    const client = person();
    expect((await client.getPlayable(albumId)).Type).toBe('MusicAlbum');
    const tracks = await client.getAlbumPlayables(albumId);
    expect(tracks.length).toBeGreaterThan(1);
    expect(tracks.every((t) => t.Type === 'Audio' && t.Container === 'flac')).toBe(true);
    const track = await client.getPlayable(tracks[0]!.Id);
    expect(track).toMatchObject({ Id: tracks[0]!.Id, Type: 'Audio', Container: 'flac' });
  });

  it("records the first track's static stream as a two-byte range, with a synthesized FLAC body", async () => {
    const stream = jfPlay['jf-stream'];
    const trackId = jfPlay['jf-track'].request.path.split('/')[2];
    expect(stream.request.path).toBe(`/Audio/${trackId}/stream`);
    expect(stream.request.query).toEqual({ static: 'true' });
    expect(stream.request.headers.range).toBe('bytes=0-1');
    expect(stream.response.status).toBe(206);
    expect(stream.response.headers['content-type']).toBe('audio/flac');
    expect(stream.response.body).toMatchObject({ bytes: 'jf-stream.flac' });
    const opened = await person().openAudio(trackId ?? '', 'bytes=0-3');
    expect(opened.status).toBe(206);
    const bytes = new Uint8Array(await new Response(opened.body).arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe('fLaC');
  });
});

/** Replays `recordings`, keeping each request's JSON body, which replay itself never compares. */
function capturingReplay(recordings: Recording[]) {
  const replay = replayFetch(recordings);
  const sent: { call: string; json: unknown }[] = [];
  const fetch: FetchLike = (url, init) => {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ call: `${init?.method ?? 'GET'} ${new URL(url).pathname}`, json: body });
    return replay(url, init);
  };
  return { fetch, sent };
}

/** M1.progress's recordings: a book played, synced and closed, and bookmarked, as `auralis`. */
const absProgress = Object.fromEntries(
  ABS_PROGRESS_CALLS.map((call) => [call, recording('audiobookshelf', call)]),
) as Record<(typeof ABS_PROGRESS_CALLS)[number], Recording>;

describe("Audiobookshelf's progress and bookmark calls, recorded for M1.progress", () => {
  const book = itemId(absProgress['progress-play']);
  const sessionId = String(json(absProgress['progress-play'].response.body).id);
  const client = (recordings: Recording[]) => {
    const replay = capturingReplay(recordings);
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: '<token>', ...replay });
    return { abs, sent: replay.sent };
  };

  it('plays, syncs and closes one session, as the test user with its own key', () => {
    expect(absProgress['progress-sync'].request.path).toBe(`/api/session/${sessionId}/sync`);
    expect(absProgress['progress-close'].request.path).toBe(`/api/session/${sessionId}/close`);
    for (const r of Object.values(absProgress)) {
      expect(r.request.headers.authorization, r.call).toBe('Bearer <token>');
    }
    const me = json(absProgress.me.response.body);
    expect(me.username).toBe('auralis');
    expect(json(absProgress['progress-play'].response.body).userId).toBe(me.id);
  });

  it('reports wall-clock listening time apart from the position: 15 s synced, then 5 s at close', () => {
    const duration = json(absProgress['progress-play'].response.body).duration;
    expect(json(absProgress['progress-sync'].request.body)).toEqual({
      currentTime: 15,
      timeListened: 15,
      duration,
    });
    expect(json(absProgress['progress-close'].request.body)).toEqual({
      currentTime: 20,
      timeListened: 5,
      duration,
    });
    for (const call of ['progress-sync', 'progress-close'] as const) {
      expect(absProgress[call].response).toMatchObject({ status: 200, body: { text: 'OK' } });
    }
  });

  it("parses through the client, which sends the recorded bodies, and the close's report lands", async () => {
    const { abs, sent } = client(
      Object.values(absProgress).filter((r) => !r.call.includes('delete')),
    );
    const session = await abs.play(book, { deviceId: 'auralis-recorder', clientVersion: '0.0.0' });
    expect(session.duration).toBeGreaterThan(20);
    await abs.syncSession(session.id, {
      currentTime: 15,
      timeListened: 15,
      duration: session.duration!,
    });
    await abs.closeSession(session.id, {
      currentTime: 20,
      timeListened: 5,
      duration: session.duration!,
    });
    const progress = await abs.findMyProgress(book);
    expect(progress).toMatchObject({ libraryItemId: book, currentTime: 20, isFinished: false });
    for (const call of ['progress-sync', 'progress-close'] as const) {
      const r = absProgress[call];
      const mine = sent.find((s) => s.call === `POST ${r.request.path}`);
      expect(mine?.json, call).toEqual(json(r.request.body));
    }
  });

  it('makes a bookmark at whole seconds, lists it on GET /api/me, and deletes it', async () => {
    const { abs, sent } = client([
      absProgress['bookmark-create'],
      absProgress.me,
      absProgress['bookmark-delete'],
    ]);
    const made = await abs.createBookmark(book, TEST_BOOKMARK);
    expect(made).toMatchObject({ libraryItemId: book, ...TEST_BOOKMARK });
    expect(sent[0]?.json).toEqual(json(absProgress['bookmark-create'].request.body));
    const me = await abs.getMe();
    expect(me.bookmarks).toContainEqual(expect.objectContaining({ libraryItemId: book, time: 30 }));
    expect(me.mediaProgress).toContainEqual(expect.objectContaining({ libraryItemId: book }));
    await expect(abs.deleteBookmark(book, TEST_BOOKMARK.time)).resolves.toBeUndefined();
    expect(absProgress['bookmark-delete'].request.path).toBe(
      `/api/me/item/${book}/bookmark/${TEST_BOOKMARK.time}`,
    );
  });

  it('answers a bare 404 for a bookmark that is not there', async () => {
    const { abs } = client([absProgress['bookmark-delete-missing']]);
    const error = await abs.deleteBookmark(book, TEST_BOOKMARK.time).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).status).toBe(404);
    expect(absProgress['bookmark-delete-missing'].response.body).toEqual({ text: 'Not Found' });
  });

  it("never keeps the user's own token from GET /api/me", () => {
    expect(json(absProgress.me.response.body).token).toBe('<token>');
  });
});

/** M1.progress's Jellyfin recordings: one track started, reported and stopped, as `auralis`. */
const jfProgress = Object.fromEntries(
  JELLYFIN_PROGRESS_CALLS.map((call) => [call, recording('jellyfin', call)]),
) as Record<(typeof JELLYFIN_PROGRESS_CALLS)[number], Recording>;

describe("Jellyfin's playback reports, recorded for M1.progress", () => {
  const body = (call: keyof typeof jfProgress) => json(jfProgress[call].request.body);
  const track = String(body('jf-playing').ItemId);
  const playSessionId = String(body('jf-playing').PlaySessionId);

  it("reports as a person's own Auralis device, with the person's token", () => {
    for (const r of Object.values(jfProgress)) {
      expect(r.request.headers.authorization, r.call).toContain('DeviceId="auralis-recorder"');
      expect(r.request.headers.authorization, r.call).toContain('Token="<token>"');
    }
  });

  it('starts at 0, reports 15 s and stops at 20 s, in ticks, under one play session, each a bare 204', () => {
    expect(body('jf-playing')).toMatchObject({ PositionTicks: 0, IsPaused: false });
    expect(body('jf-progress')).toMatchObject({
      ItemId: track,
      PositionTicks: 15 * TICKS_PER_SECOND,
      IsPaused: false,
      PlayMethod: 'DirectPlay',
      PlaySessionId: playSessionId,
    });
    expect(body('jf-stopped')).toEqual({
      ItemId: track,
      PositionTicks: 20 * TICKS_PER_SECOND,
      PlaySessionId: playSessionId,
    });
    for (const call of ['jf-playing', 'jf-progress', 'jf-stopped'] as const) {
      expect(jfProgress[call].response, call).toMatchObject({ status: 204, body: null });
    }
  });

  it('parses through the client, which sends the recorded bodies', async () => {
    const { fetch, sent } = capturingReplay(Object.values(jfProgress));
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: '<token>', fetch });
    const at = (position: number) => ({ itemId: track, position, paused: false, playSessionId });
    await jf.reportStart(at(0));
    await jf.reportProgress(at(15));
    await jf.reportStopped(at(20));
    expect(sent.map((s) => s.json)).toEqual([
      body('jf-playing'),
      body('jf-progress'),
      body('jf-stopped'),
    ]);
    const data = await jf.getUserData(track);
    expect(data.ItemId).toBe(track);
  });

  it('counts a music track played at its start and keeps no resume point for it', () => {
    expect(json(jfProgress['jf-userdata'].response.body)).toMatchObject({
      PlaybackPositionTicks: 0,
      PlayCount: 1,
      Played: true,
    });
  });
});

/** M1.sessions' recordings: what autoplay reads, as `auralis`. */
const sessions = {
  books: [
    recording('audiobookshelf', 'series-book-1'),
    recording('audiobookshelf', 'series-book-2'),
  ],
  feeds: [recording('feed', 'show-1-feed'), recording('feed', 'show-2-feed')],
  me: recording('audiobookshelf', 'me-finished'),
  mix: recording('jellyfin', 'jf-instant-mix'),
  shows: [recording('audiobookshelf', 'index-show-1'), recording('audiobookshelf', 'index-show-2')],
  album: recording('jellyfin', 'index-album-tracks-1'),
};

function feedText(r: Recording): string {
  const b = r.response.body;
  if (b === null || !('text' in b)) throw new Error(`${r.call}: expected a text body`);
  return b.text;
}

describe("Audiobookshelf's, the feeds' and Jellyfin's answers, recorded for M1.sessions", () => {
  it('two books of one series parse through the client, in series order', async () => {
    const client = new AbsClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch(sessions.books),
    });
    const books = await Promise.all(sessions.books.map((r) => client.getItemSummary(itemId(r))));
    const series = books.map((b) => (b.mediaType === 'book' ? b.media.metadata.series : []));
    expect(series[0]?.[0]?.id).toBeDefined();
    expect(series[1]?.[0]?.id).toBe(series[0]?.[0]?.id);
    expect(series.map((s) => s[0]?.sequence)).toEqual(['1', '2']);
  });

  it("each recorded show's feed names its order: the first serial, the second episodic", () => {
    const types = sessions.feeds.map(
      (r) => /<itunes:type>(\w+)<\/itunes:type>/.exec(feedText(r))?.[1],
    );
    expect(types).toEqual(['serial', 'episodic']);
  });

  it("each feed keeps every item, each with a date and an enclosure the show's episodes carry", () => {
    for (const [n, feed] of sessions.feeds.entries()) {
      const items = [...feedText(feed).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
        (m) => m[1] ?? '',
      );
      const show = json(sessions.shows[n]!.response.body) as {
        media: { episodes: { enclosure: { url: string } | null }[] };
      };
      expect(items.length, feed.call).toBe(show.media.episodes.length);
      const enclosures = new Set(show.media.episodes.map((e) => e.enclosure?.url));
      for (const item of items) {
        expect(Number.isNaN(Date.parse(/<pubDate>([^<]*)</.exec(item)?.[1] ?? ''))).toBe(false);
        const url = /<enclosure\b[^>]*\burl="([^"]*)"/.exec(item)?.[1]?.replace(/&amp;/g, '&');
        expect(enclosures.has(url), url).toBe(true);
      }
    }
  });

  it("the test user's finished episode parses through the client: the serial show's oldest", async () => {
    const client = new AbsClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch([sessions.me]),
    });
    const me = await client.getMe();
    const [finished] = me.mediaProgress.filter((p) => p.isFinished);
    expect(finished?.libraryItemId).toBe(itemId(sessions.shows[0]!));
    const show = json(sessions.shows[0]!.response.body) as {
      media: { episodes: { id: string; enclosure: { url: string } | null }[] };
    };
    const episode = show.media.episodes.find((e) => e.id === finished?.episodeId);
    const items = [...feedText(sessions.feeds[0]!).matchAll(/<item>([\s\S]*?)<\/item>/g)];
    const oldest = items
      .map((m) => m[1] ?? '')
      .sort(
        (a, b) =>
          Date.parse(/<pubDate>([^<]*)</.exec(a)?.[1] ?? '') -
          Date.parse(/<pubDate>([^<]*)</.exec(b)?.[1] ?? ''),
      )[0];
    expect(oldest).toContain((episode?.enclosure?.url ?? '?').replace(/&/g, '&amp;'));
  });

  it("Instant Mix for the recorded album's last track parses through the client", async () => {
    const tracks = (json(sessions.album.response.body) as { Items: { Id: string }[] }).Items;
    const last = tracks.at(-1)?.Id ?? '';
    expect(sessions.mix.request.path).toBe(`/Items/${last}/InstantMix`);
    const jf = new JellyfinClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch([sessions.mix]),
    });
    const mix = await jf.getInstantMix(last, 20);
    expect(mix.length).toBe(20);
    expect(mix.every((t) => t.Type === 'Audio' && Boolean(t.AlbumId))).toBe(true);
  });
});

/** M1.shell's recordings: the lists' pages, the views and the art. */
const shell = {
  booksPage: recording('audiobookshelf', 'shell-books-page'),
  books: [recording('audiobookshelf', 'shell-book-1'), recording('audiobookshelf', 'shell-book-2')],
  cover: recording('audiobookshelf', 'shell-cover'),
  coverMedium: recording('audiobookshelf', 'shell-cover-medium'),
  fourFiles: recording('audiobookshelf', 'multi-detail'),
  folders: recording('jellyfin', 'library-list'),
  albums: recording('jellyfin', 'jf-library-albums-1'),
  views: recording('jellyfin', 'jf-user-views'),
  image: recording('jellyfin', 'jf-primary-image'),
  imageMedium: recording('jellyfin', 'jf-primary-image-medium'),
  album: recording('jellyfin', 'jf-album'),
  track: recording('jellyfin', 'jf-track'),
};

describe("Audiobookshelf's and Jellyfin's answers, recorded for M1.shell", () => {
  const abs = () =>
    new AbsClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch(
        [shell.booksPage, ...shell.books, shell.cover, shell.coverMedium, shell.fourFiles],
        {
          readBytes: standInsBeside(adapters),
        },
      ),
    });
  const jf = () =>
    new JellyfinClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch([shell.albums, shell.views, shell.image, shell.imageMedium], {
        readBytes: standInsBeside(adapters),
      }),
    });

  it('a books page of two, oldest added first, holds the four-file book, and each book parses', async () => {
    const library = shell.booksPage.request.path.split('/')[3] ?? '';
    const page = Number(shell.booksPage.request.query.page);
    const listed = await abs().getLibraryItems(library, { limit: 2, page, sort: 'addedAt' });
    expect(listed.results.map((r) => r.id)).toContain(itemId(shell.fourFiles));
    const books = await Promise.all(listed.results.map((r) => abs().getItemSummary(r.id)));
    expect(books.map((b) => [b.mediaType, b.libraryId])).toEqual([
      ['book', library],
      ['book', library],
    ]);
  });

  it("the four-file book's cover replays as WebP from its synthesized stand-in", async () => {
    expect(shell.cover.request.headers.authorization).toBe('Bearer <token>');
    const cover = await abs().openCover(itemId(shell.fourFiles));
    expect(cover.headers['content-type']).toBe('image/webp');
    const bytes = new Uint8Array(await new Response(cover.body).arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WEBP');
  });

  it("the four-file book's cover, asked for at the medium width, replays as WebP", async () => {
    const cover = await abs().openCover(itemId(shell.fourFiles), ART_WIDTH.medium);
    expect(cover.headers['content-type']).toBe('image/webp');
    await cover.body.cancel();
  });

  it("the four-file book's page reads its length and its chapters, in order, from its expanded answer", async () => {
    const detail = await abs().getBookDetail(itemId(shell.fourFiles));
    expect(detail.duration).toBeGreaterThan(0);
    expect(detail.chapters.length).toBe(4);
    expect(detail.chapters[0]).toMatchObject({ start: 0 });
    expect(detail.chapters.at(-1)?.end).toBeCloseTo(detail.duration, 3);
  });

  it("the test user's views name the music library by its media folder's id", async () => {
    expect(shell.views.request.headers.authorization).toContain('DeviceId="auralis-recorder"');
    const views = await jf().getUserViews();
    const music = (
      json(shell.folders.response.body) as { Items: { Id: string; CollectionType?: string }[] }
    ).Items.filter((f) => f.CollectionType === 'music').map((f) => f.Id);
    expect(views.filter((v) => v.CollectionType === 'music').map((v) => v.Id)).toEqual(music);
  });

  it("the music library's albums page, by its id, holds the album M1.music recorded", async () => {
    const parentId = shell.albums.request.query.ParentId ?? '';
    const startIndex = Number(shell.albums.request.query.StartIndex);
    const page = await jf().getAlbums({ limit: 2, startIndex, parentId });
    const albumId = shell.album.request.path.split('/')[2] ?? '';
    expect(page.Items.map((a) => a.Id)).toContain(albumId);
  });

  it('the recorded track belongs to the recorded album, as its first track', () => {
    const album = json(shell.album.response.body) as { Id: string };
    const track = json(shell.track.response.body) as { AlbumId: string; IndexNumber: number };
    expect(track).toMatchObject({ AlbumId: album.Id, IndexNumber: 1 });
  });

  it("the album's primary image replays as JPEG from its synthesized stand-in", async () => {
    const albumId = shell.album.request.path.split('/')[2] ?? '';
    const image = await jf().openImage(albumId);
    expect(image.headers['content-type']).toBe('image/jpeg');
    const bytes = new Uint8Array(await new Response(image.body).arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  });

  it("the album's primary image, asked for at the medium width, replays as JPEG", async () => {
    const albumId = shell.album.request.path.split('/')[2] ?? '';
    const image = await jf().openImage(albumId, ART_WIDTH.medium);
    expect(image.headers['content-type']).toBe('image/jpeg');
    await image.body.cancel();
  });
});
