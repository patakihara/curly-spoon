import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { runRecord, SHOW_NOTES_DROPPED } from './record-cli.js';

const BASE = 'http://upstream.invalid:13378';

/** A fake Audiobookshelf whose play answer is `play`; it keeps every method and path asked. */
function fakeAbs(play: unknown) {
  const asked: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    asked.push(`${method} ${pathname}`);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (pathname === '/status') return json({ serverVersion: '2.36.1' });
    if (pathname === '/api/libraries') {
      return json({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] });
    }
    if (pathname === '/api/libraries/lib1/items') {
      return json({ total: 1, results: [{ id: 'li1', mediaType: 'book', updatedAt: 1 }] });
    }
    if (pathname === '/api/items/li1') return json({ id: 'li1', mediaType: 'book', media: {} });
    if (pathname === '/api/items/li1/play') return json(play);
    if (pathname.startsWith('/api/session/')) return new Response('OK', { status: 200 });
    if (pathname === '/api/items/li1/file/1') {
      ranges.push(new Headers(init?.headers).get('range'));
      return new Response('Zq', {
        status: 206,
        headers: {
          'content-type': 'audio/mp4',
          'accept-ranges': 'bytes',
          'content-range': 'bytes 0-1/158919642',
        },
      });
    }
    return new Response('not found', { status: 404 });
  };
  const ranges: (string | null)[] = [];
  return { fetch, asked, ranges };
}

function io(fetch: FetchLike) {
  const err: string[] = [];
  const out: string[] = [];
  return {
    io: {
      argv: ['--abs', BASE, '--only', 'abs', '--dry-run'],
      stdin: 'ABS_API_KEY=test-abs-key-0000\n',
      fetch,
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
    },
    err,
    out,
  };
}

const directPlay = {
  id: 'play_8',
  playMethod: 0,
  audioTracks: [{ contentUrl: '/api/items/li1/file/1', mimeType: 'audio/mp4' }],
};

describe('record mode against Audiobookshelf', () => {
  it('closes the playback session even when the play answer fails its schema', async () => {
    const abs = fakeAbs({ id: 'play_7', playMethod: 'not a number' });
    const { io: recordIo } = io(abs.fetch);
    await expect(runRecord(recordIo)).rejects.toThrow(/POST \/api\/items\/li1\/play/);
    expect(abs.asked).toContain('POST /api/session/play_7/close');
  });

  it('closes the session it recorded, exactly once, when everything parses', async () => {
    const abs = fakeAbs(directPlay);
    const { io: recordIo, err } = io(abs.fetch);
    const code = await runRecord(recordIo);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(abs.asked.filter((a) => a.endsWith('/close'))).toEqual([
      'POST /api/session/play_8/close',
    ]);
  });

  it("records the first track's file as two bytes' headers, before the session closes", async () => {
    const abs = fakeAbs(directPlay);
    const { io: recordIo, out } = io(abs.fetch);
    expect(await runRecord(recordIo)).toBe(0);
    expect(abs.ranges).toEqual(['bytes=0-1']);
    const [file, close] = ['GET /api/items/li1/file/1', 'POST /api/session/play_8/close'];
    expect(abs.asked.indexOf(file)).toBeLessThan(abs.asked.indexOf(close));

    const written = out.find((l) => l.endsWith('item-file.json'))?.replace(/^wrote /, '') ?? '';
    const recording = JSON.parse(readFileSync(written, 'utf8')) as {
      response: { status: number; body: unknown };
    };
    expect(recording.response.status).toBe(206);
    expect(recording.response.body).toEqual({
      bytes: 'item-file.m4a',
      synthesized: expect.stringContaining('tone.sh') as unknown,
    });
  });

  it('refuses to record a file when the play answer is not direct play', async () => {
    const abs = fakeAbs({
      ...directPlay,
      audioTracks: [{ contentUrl: '/hls/play_8/output.m3u8' }],
    });
    const { io: recordIo } = io(abs.fetch);
    await expect(runRecord(recordIo)).rejects.toThrow(/direct-play/);
    expect(abs.asked).toContain('POST /api/session/play_8/close');
  });

  it('closes nothing when the play answer carries no session id', async () => {
    const abs = fakeAbs({ error: 'no id here' });
    const { io: recordIo } = io(abs.fetch);
    await expect(runRecord(recordIo)).rejects.toThrow();
    expect(abs.asked.filter((a) => a.endsWith('/close'))).toEqual([]);
  });
});

/**
 * A fake Audiobookshelf holding one two-file book, `mb`: it direct-plays by default and transcodes
 * when asked, and answers 404 for the transcode's first segment twice before it is cut. It keeps
 * every method and path asked, and each file call's range.
 */
function fakePlayAbs(options: { hls?: unknown } = {}) {
  const asked: string[] = [];
  const ranges: Record<string, string | null> = {};
  let bodies: { forceTranscode?: boolean }[] = [];
  let segmentAsks = 0;
  const fetch: FetchLike = async (url, init) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    asked.push(`${method} ${pathname}`);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const track = (ino: string, offset: number) => ({
      contentUrl: `/api/items/mb/file/${ino}`,
      mimeType: 'audio/mpeg',
      duration: 10,
      startOffset: offset,
    });
    if (pathname === '/status') return json({ serverVersion: '2.37.0' });
    if (pathname === '/api/items/mb' && method === 'GET') {
      return json({
        id: 'mb',
        mediaType: 'book',
        media: { tracks: [track('1', 0), track('2', 10)] },
      });
    }
    if (pathname === '/api/items/mb/play') {
      const body = JSON.parse(String(init?.body)) as { forceTranscode?: boolean };
      bodies = [...bodies, body];
      if (body.forceTranscode === true) {
        return json(
          options.hls ?? {
            id: 'play_h',
            playMethod: 2,
            audioTracks: [{ contentUrl: '/hls/play_h/output.m3u8', duration: 20, startOffset: 0 }],
          },
        );
      }
      return json({ id: 'play_d', playMethod: 0, audioTracks: [track('1', 0), track('2', 10)] });
    }
    if (pathname.startsWith('/api/session/')) return new Response('OK', { status: 200 });
    if (pathname.startsWith('/api/items/mb/file/')) {
      ranges[pathname] = new Headers(init?.headers).get('range');
      return new Response('ID', {
        status: 206,
        headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-1/1000' },
      });
    }
    if (pathname === '/hls/play_h/output.m3u8') {
      return new Response('#EXTM3U\n#EXTINF:6,\noutput-0.ts\n#EXT-X-ENDLIST\n', {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    }
    if (pathname === '/hls/play_h/output-0.ts') {
      segmentAsks += 1;
      if (segmentAsks <= 2) return new Response('Not Found', { status: 404 });
      return new Response(new Uint8Array([0x47]), { headers: { 'content-type': 'video/mp2t' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch, asked, ranges, bodies: () => bodies };
}

function playIo(fetch: FetchLike) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      argv: ['--abs', BASE, '--only', 'play', '--play-item', 'mb', '--dry-run'],
      stdin: 'ABS_API_KEY=test-abs-key-0000\n',
      fetch,
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
      sleep: async () => undefined,
    },
    out,
    err,
  };
}

describe("record mode for M1.play's calls", () => {
  it('records the book direct-played, each of its files as two bytes, and its transcode', async () => {
    const abs = fakePlayAbs();
    const { io: recordIo, out, err } = playIo(abs.fetch);
    const code = await runRecord(recordIo);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(out.map((l) => l.split('/').pop())).toEqual([
      'multi-detail.json',
      'multi-play.json',
      'multi-file-1.json',
      'multi-file-2.json',
      'multi-close.json',
      'hls-play.json',
      'hls-playlist.json',
      'hls-segment-pending.json',
      'hls-segment.json',
      'hls-close.json',
    ]);
    expect(abs.ranges).toEqual({
      '/api/items/mb/file/1': 'bytes=0-1',
      '/api/items/mb/file/2': 'bytes=0-1',
    });
    expect(abs.bodies().map((b) => b.forceTranscode)).toEqual([false, true]);
    const written = (name: string) =>
      JSON.parse(
        readFileSync(out.find((l) => l.endsWith(name))!.replace(/^wrote /, ''), 'utf8'),
      ) as {
        response: { status: number; body: unknown };
      };
    expect(written('hls-segment-pending.json').response.status).toBe(404);
    expect(written('hls-segment.json').response.body).toEqual({
      bytes: 'hls-segment.mp2t',
      synthesized: expect.stringContaining('tone.sh') as unknown,
    });
  });

  it('closes each session it opened exactly once, the transcode as soon as it is recorded', async () => {
    const abs = fakePlayAbs();
    expect(await runRecord(playIo(abs.fetch).io)).toBe(0);
    expect(abs.asked.filter((a) => a.endsWith('/close'))).toEqual([
      'POST /api/session/play_d/close',
      'POST /api/session/play_h/close',
    ]);
    expect(abs.asked.at(-1)).toBe('POST /api/session/play_h/close');
  });

  it('still closes the transcode when its answer is not HLS', async () => {
    const abs = fakePlayAbs({
      hls: { id: 'play_h', playMethod: 0, audioTracks: [{ contentUrl: '/api/items/mb/file/1' }] },
    });
    await expect(runRecord(playIo(abs.fetch).io)).rejects.toThrow(/HLS/);
    expect(abs.asked.filter((a) => a.endsWith('/close'))).toEqual([
      'POST /api/session/play_d/close',
      'POST /api/session/play_h/close',
    ]);
  });

  it('needs the book to record, and never touches a library listing', async () => {
    const abs = fakePlayAbs();
    const { io: recordIo, err } = playIo(abs.fetch);
    recordIo.argv = ['--abs', BASE, '--only', 'play', '--dry-run'];
    expect(await runRecord(recordIo)).toBe(2);
    expect(err.join('\n')).toContain('--play-item');
    expect(await runRecord(playIo(abs.fetch).io)).toBe(0);
    expect(abs.asked.some((a) => a.includes('/api/libraries'))).toBe(false);
  });
});

/** A fake Jellyfin with one album and one administrator; it keeps every URL asked. */
function fakeJellyfin() {
  const asked: string[] = [];
  const fetch: FetchLike = async (url) => {
    const { pathname, search } = new URL(url);
    asked.push(`${pathname}${search}`);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (pathname === '/System/Info/Public') return json({ Version: '10.11.11' });
    if (pathname === '/Library/MediaFolders') {
      return json({ Items: [{ Id: 'm1', Name: 'Music', CollectionType: 'music' }] });
    }
    if (pathname === '/Users') {
      return json([
        { Id: 'u1', Policy: { IsAdministrator: false } },
        { Id: 'u2', Policy: { IsAdministrator: true } },
      ]);
    }
    if (pathname === '/Items') {
      return json({ Items: [{ Id: 'a1', Type: 'MusicAlbum' }], TotalRecordCount: 1 });
    }
    if (pathname.startsWith('/Items/')) {
      return json({ Id: pathname.slice('/Items/'.length), Type: 'MusicAlbum' });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch, asked };
}

function jellyfinIo(fetch: FetchLike) {
  const err: string[] = [];
  return {
    io: {
      argv: ['--jellyfin', 'http://upstream.invalid:8096', '--only', 'jellyfin', '--dry-run'],
      stdin: 'JELLYFIN_API_KEY=test-jellyfin-key-0000\n',
      fetch,
      out: () => undefined,
      err: (line: string) => err.push(line),
    },
    err,
  };
}

describe('record mode against Jellyfin', () => {
  it('records the first album as an administrator, since the API key has no user', async () => {
    const jf = fakeJellyfin();
    const { io: recordIo, err } = jellyfinIo(jf.fetch);
    expect(await runRecord(recordIo)).toBe(0);
    expect(err).toEqual([]);
    expect(jf.asked).toContain('/Items/a1?userId=u2');
  });

  it('records the album named with --jellyfin-item instead of the first one', async () => {
    const jf = fakeJellyfin();
    const { io: recordIo } = jellyfinIo(jf.fetch);
    recordIo.argv.push('--jellyfin-item', 'b7');
    expect(await runRecord(recordIo)).toBe(0);
    expect(jf.asked).toContain('/Items/b7?userId=u2');
    expect(jf.asked.some((a) => a.startsWith('/Items?'))).toBe(false);
  });
});

/** A fake of both upstreams holding one book, one show and one album, for the index calls. */
function fakeIndexUpstreams() {
  const asked: string[] = [];
  const book = {
    id: 'b1',
    libraryId: 'books',
    mediaType: 'book',
    updatedAt: 1,
    media: {
      metadata: { title: 'B', authors: [], narrators: [], series: [], genres: [] },
      audioFiles: [],
    },
  };
  const show = {
    id: 's1',
    libraryId: 'pods',
    mediaType: 'podcast',
    updatedAt: 1,
    media: {
      metadata: { title: 'S', genres: [] },
      episodes: [
        { id: 'e1', title: 'E', updatedAt: 1, description: '<p>Ads at https://ads.example</p>' },
      ],
    },
  };
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    asked.push(`${init?.method ?? 'GET'} ${pathname}${search}`);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const routes: Record<string, unknown> = {
      '/status': { serverVersion: '2.36.1' },
      '/api/libraries': {
        libraries: [
          { id: 'books', name: 'Books', mediaType: 'book' },
          { id: 'pods', name: 'Podcasts', mediaType: 'podcast' },
        ],
      },
      '/api/libraries/books/items': {
        total: 1,
        results: [{ id: 'b1', mediaType: 'book', updatedAt: 1 }],
      },
      '/api/libraries/pods/items': {
        total: 1,
        results: [{ id: 's1', mediaType: 'podcast', updatedAt: 1 }],
      },
      '/api/items/b1': book,
      '/api/items/s1': show,
      '/System/Info/Public': { Version: '10.11.11' },
      '/Items': search.includes('ParentId=')
        ? { Items: [{ Id: 't1', Type: 'Audio' }], TotalRecordCount: 1 }
        : { Items: [{ Id: 'a1', Type: 'MusicAlbum' }], TotalRecordCount: 1 },
    };
    return pathname in routes ? json(routes[pathname]) : new Response('no', { status: 404 });
  };
  return { fetch, asked };
}

describe("record mode for the index's calls", () => {
  const run = async () => {
    const up = fakeIndexUpstreams();
    const out: string[] = [];
    const err: string[] = [];
    const code = await runRecord({
      argv: ['--only', 'index', '--abs', BASE, '--jellyfin', BASE, '--dry-run'],
      stdin: 'ABS_API_KEY=test-abs-key-0000\nJELLYFIN_API_KEY=test-jellyfin-key-0000\n',
      fetch: up.fetch,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    const written = out.map((l) => l.replace(/^wrote /, ''));
    return { ...up, code, err, written };
  };

  it('only reads: every call is a GET, none scans, and the Podcasts library is paged', async () => {
    const { asked, code, err } = await run();
    expect(err).toEqual([]);
    expect(code).toBe(0);
    for (const call of asked) expect(call).toMatch(/^GET /);
    for (const call of asked) expect(call).not.toMatch(/scan/i);
    expect(asked).toContain('GET /api/libraries/pods/items?limit=2&page=4&minified=1&sort=addedAt');
    expect(asked.some((a) => a.includes('/file/') || a.endsWith('/play'))).toBe(false);
  });

  it('records a page of each library, each listed item, each listed album with its tracks, and the lookups that confirm an item is gone', async () => {
    const { written } = await run();
    expect(written.map((w) => w.split('/').slice(-3).join('/'))).toEqual([
      'audiobookshelf/recordings/index-books-page.json',
      'audiobookshelf/recordings/index-book-1.json',
      'audiobookshelf/recordings/index-shows-page.json',
      'audiobookshelf/recordings/index-show-1.json',
      'audiobookshelf/recordings/index-item-gone.json',
      'jellyfin/recordings/index-albums-page.json',
      'jellyfin/recordings/index-album-tracks-1.json',
      'jellyfin/recordings/index-album-lookup.json',
      'jellyfin/recordings/index-album-gone.json',
    ]);
  });

  it("replaces each episode's show notes and keeps the rest of the answer", async () => {
    const { written } = await run();
    const file = written.find((w) => w.endsWith('index-show-1.json')) ?? '';
    const recording = JSON.parse(readFileSync(file, 'utf8')) as {
      response: { body: { json: { media: { episodes: { id: string; description: string }[] } } } };
    };
    const [episode] = recording.response.body.json.media.episodes;
    expect(episode).toEqual({
      id: 'e1',
      title: 'E',
      updatedAt: 1,
      description: SHOW_NOTES_DROPPED,
    });
  });
});
