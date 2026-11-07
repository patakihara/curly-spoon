/**
 * What a fresh test of M3.ytmusic's parts A to D found by trying to break them. Each test states the
 * behaviour wanted and fails until the product code gives it.
 */
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, truncateSync } from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FsPromises from 'node:fs/promises';
import { type FetchLike } from '../adapters/http/fetch.js';
import { publicFetch, type PinnedRequest } from '../adapters/http/publicFetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { YtMusicClient } from '../adapters/ytmusic/client.js';
import { openDatabase } from '../store/connection.js';
import { audioFormatSchema, StreamUrl } from './schemas.js';
import { StreamCache, type StreamCacheOptions, StreamFailure } from './streamCache.js';

const disk = vi.hoisted(() => ({ shortWrites: false }));

vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof FsPromises>();
  return {
    ...real,
    open: async (...args: Parameters<typeof real.open>) => {
      const file = await real.open(...args);
      if (!disk.shortWrites) return file;
      /** What write(2) may do on a nearly full disk: take part of the bytes, and say so. */
      const write = (chunk: Uint8Array, from: number, length: number, at: number) =>
        file.write(chunk, from, Math.ceil(length / 2), at);
      return new Proxy(file, {
        get: (target, name) => {
          if (name === 'write') return write;
          const value = Reflect.get(target, name) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

const ID = 'lYBUbBu4W08';
const OTHER = 'aaaaaaaaaaa';
const URL_251 =
  'https://rr1.googlevideo.com/videoplayback?itag=251&mime=audio/webm&expire=4000000000';
const CHUNK = 16;
const SIZE = CHUNK * 5 + 3;
const FILE = Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 251));

/** A stream host holding `file`, answering closed ranges as the recordings do. */
function streamHost(start: Buffer = FILE, refuse = 0) {
  const state = { file: start, refuse, asks: 0 };
  const fetch: FetchLike = async (_url, init) => {
    state.asks += 1;
    if (state.refuse > 0) {
      state.refuse -= 1;
      return new Response(null, { status: 403 });
    }
    const range = new Headers(init?.headers).get('range') ?? '';
    const [first = 0, last = 0] = range.replace('bytes=', '').split('-').map(Number);
    if (first >= state.file.length) {
      return new Response(null, {
        status: 416,
        headers: { 'content-range': `bytes */${state.file.length}` },
      });
    }
    const end = Math.min(last, state.file.length - 1);
    return new Response(state.file.subarray(first, end + 1), {
      status: 206,
      headers: {
        'content-type': 'audio/webm',
        'content-range': `bytes ${first}-${end}/${state.file.length}`,
      },
    });
  };
  return { fetch, state };
}

function cacheOf(options: Partial<StreamCacheOptions> & { sizeNamed?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stream-defects-'));
  const resolves: unknown[] = [];
  const cache = new StreamCache({
    dir,
    db: openDatabase(':memory:'),
    capBytes: 1024 * 1024,
    chunkBytes: CHUNK,
    now: () => 1000,
    fetch: streamHost().fetch,
    resolver: {
      resolve: async (id, asked) => {
        resolves.push(asked);
        return {
          id,
          url: new StreamUrl(URL_251),
          itag: 251,
          mime: 'audio/webm',
          size: options.sizeNamed === false ? null : SIZE,
          duration: 10,
        };
      },
    },
    ...options,
  });
  cache.prepare();
  return { cache, dir, resolves };
}

async function readAll(answer: { body: ReadableStream<Uint8Array> }): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  const reader = answer.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(parts);
    parts.push(value);
  }
}

beforeEach(() => {
  disk.shortWrites = false;
});

describe('[M3.ytmusic/a] the plan has the stream go through publicFetch', () => {
  it("[M3.ytmusic/a] publicFetch passes the stream's Range on, so a chunk is asked as a closed range", async () => {
    const heard: (string | undefined)[] = [];
    const request = ((_url: URL, options: { headers?: Record<string, string> }, answer) => {
      const range = options.headers?.range ?? options.headers?.Range;
      heard.push(range);
      const [first = 0, last = SIZE - 1] = (range ?? 'bytes=0-')
        .replace('bytes=', '')
        .split('-')
        .map((n) => (n === '' ? SIZE - 1 : Number(n)));
      const body = Object.assign(Readable.from([FILE.subarray(first, last + 1)]), {
        statusCode: range === undefined ? 200 : 206,
        headers: {
          'content-type': 'audio/webm',
          ...(range === undefined ? {} : { 'content-range': `bytes ${first}-${last}/${SIZE}` }),
        },
      });
      const asked = Object.assign(new EventEmitter(), { end: () => answer(body) });
      return asked;
    }) as unknown as PinnedRequest;
    const { cache } = cacheOf({
      fetch: publicFetch({ lookup: async () => ['142.250.74.14'], request }),
    });
    const answer = await cache.open(ID, 'bytes=0-');
    expect((await readAll(answer)).equals(FILE)).toBe(true);
    expect(heard[0]).toBe(`bytes=0-${CHUNK - 1}`);
  });
});

describe('[M3.ytmusic/a] rule 8, a row that contradicts itself', () => {
  const row = (url: string, format_id = '251') => ({
    format_id,
    vcodec: 'none',
    acodec: 'opus',
    protocol: 'https',
    url,
  });

  it('[M3.ytmusic/a] a manifest on the stream host is refused, whatever its row says', () => {
    const manifest =
      'https://manifest.googlevideo.com/api/manifest/hls_playlist/file/index.m3u8?mime=audio/webm&expire=4000000000';
    expect(audioFormatSchema.safeParse(row(manifest)).success).toBe(false);
  });

  it('[M3.ytmusic/a] a row naming 251 whose URL asks for the muxed 18 is refused', () => {
    const muxed = URL_251.replace('itag=251', 'itag=18');
    expect(audioFormatSchema.safeParse(row(muxed)).success).toBe(false);
  });
});

describe('[M3.ytmusic/c] a chunk counts only once all of it is on disk', () => {
  it('[M3.ytmusic/c] a write that takes only part of a chunk keeps no bit, and the next read fetches it', async () => {
    const host = streamHost();
    const { cache } = cacheOf({ fetch: host.fetch });
    disk.shortWrites = true;
    await readAll(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    disk.shortWrites = false;
    expect(cache.heldBytes()).toBe(0);
    const again = await readAll(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    expect(again.equals(FILE.subarray(0, CHUNK))).toBe(true);
  });

  it('[M3.ytmusic/c] `whole` does not give a file shorter than the track', async () => {
    const { cache, dir } = cacheOf();
    await readAll(await cache.open(ID, undefined));
    expect(cache.whole(ID)).not.toBeNull();
    truncateSync(join(dir, `${ID}.251`), CHUNK);
    expect(cache.whole(ID)).toBeNull();
  });

  it('[M3.ytmusic/c] a write landing after its track was evicted leaves no file the table does not count', async () => {
    let release = () => {};
    const held = new Promise<void>((go) => {
      release = go;
    });
    const writes: Promise<void>[] = [];
    const writeChunk = async (path: string, chunk: Uint8Array, offset: number) => {
      const work = (async () => {
        if (path.includes(ID)) await held;
        const file = await openFile(path, 'a+');
        await file.write(chunk, 0, chunk.byteLength, offset);
        await file.close();
      })();
      writes.push(work);
      await work;
    };
    const { cache, dir } = cacheOf({ capBytes: CHUNK, writeChunk });
    const client = new AbortController();
    const leaving = cache.open(ID, `bytes=0-${CHUNK - 1}`, client.signal).catch(() => null);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    client.abort();
    await leaving;
    await readAll(await cache.open(OTHER, `bytes=0-${CHUNK - 1}`));
    release();
    await Promise.all(writes);
    await vi.waitFor(() => expect(existsSync(join(dir, `${ID}.251`))).toBe(false));
    expect(readdirSync(dir).filter((name) => name.startsWith(ID))).toEqual([]);
  });
});

describe('[M3.ytmusic/a] a client leaving before the track has resolved', () => {
  it('[M3.ytmusic/a] is let go at once, not held behind the extractor queue', async () => {
    const client = new AbortController();
    const { cache } = cacheOf({ resolver: { resolve: () => new Promise(() => undefined) } });
    const opening = cache.open(ID, undefined, client.signal);
    client.abort();
    const outcome = await Promise.race([
      opening.then(
        () => 'answered',
        (error: unknown) => (error instanceof StreamFailure ? error.reason : 'other'),
      ),
      new Promise((done) => setTimeout(() => done('still waiting'), 100)),
    ]);
    expect(outcome).toBe('gone');
  });
});

describe('[M3.ytmusic/a] a URL or a file that changed', () => {
  it('[M3.ytmusic/a] a format naming no size, refused at its first two bytes, resolves once more', async () => {
    const host = streamHost(FILE, 1);
    const { cache, resolves } = cacheOf({ fetch: host.fetch, sizeNamed: false });
    const answer = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    expect((await readAll(answer)).equals(FILE.subarray(0, CHUNK))).toBe(true);
    expect(resolves.some((asked) => asked !== undefined)).toBe(true);
  });

  it('[M3.ytmusic/a] a file gone shorter, answered 416, starts afresh once nobody plays it', async () => {
    const host = streamHost();
    const { cache } = cacheOf({ fetch: host.fetch, sizeNamed: false });
    await readAll(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    host.state.file = FILE.subarray(0, CHUNK * 2);
    await expect(cache.open(ID, `bytes=${CHUNK * 3}-`)).rejects.toMatchObject({
      reason: 'changed',
    });
    const fresh = await cache.open(ID, 'bytes=0-0');
    expect(fresh.headers['content-range']).toBe(`bytes 0-0/${CHUNK * 2}`);
  });
});

describe('[M3.ytmusic/a] InnerTube', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const recording = (call: string) =>
    recordingSchema.parse(
      JSON.parse(
        readFileSync(join(here, '..', 'adapters', 'ytmusic', 'recordings', `${call}.json`), 'utf8'),
      ),
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one field of a recording
  type Json = any;
  function edited(r: Recording, edit: (json: Json) => void): Recording {
    const copy = structuredClone(r);
    edit((copy.response.body as { json: Json }).json);
    return copy;
  }
  const client = (r: Recording, onBad?: (what: string) => void) =>
    new YtMusicClient({
      baseUrl: 'http://upstream.invalid',
      fetch: replayFetch([r]),
      now: () => Date.UTC(2026, 10, 7, 12),
      ...(onBad === undefined ? {} : { onBad }),
    });
  const sections = (json: Json): Json[] =>
    json.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer
      .contents;

  it('[M3.ytmusic/a] an artist whose name begins with & keeps it', async () => {
    const renamed = edited(recording('search-songs'), (json) => {
      const shelf = sections(json).find((s) => s.musicShelfRenderer).musicShelfRenderer;
      const byline =
        shelf.contents[0].musicResponsiveListItemRenderer.flexColumns[1]
          .musicResponsiveListItemFlexColumnRenderer.text;
      byline.runs[0].text = '&TEAM';
    });
    const [first] = await client(renamed).search('q');
    expect(first?.artists).toEqual(['&TEAM']);
  });

  it('[M3.ytmusic/a] a shelf renamed upstream is told of, not taken for a search that found nothing', async () => {
    const bad: string[] = [];
    const renamed = edited(recording('search-songs'), (json) => {
      for (const section of sections(json)) {
        if (section.musicShelfRenderer === undefined) continue;
        section.musicShelfRendererV2 = section.musicShelfRenderer;
        delete section.musicShelfRenderer;
      }
    });
    expect(await client(renamed, (what) => bad.push(what)).search('q')).toEqual([]);
    expect(bad.length).toBeGreaterThan(0);
  });

  it('[M3.ytmusic/a] a radio panel renamed upstream is told of, not taken for no radio', async () => {
    const bad: string[] = [];
    const renamed = edited(recording('next-radio'), (json) => {
      const tab =
        json.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer
          .watchNextTabbedResultsRenderer.tabs[0].tabRenderer;
      tab.content.musicQueueRendererV2 = tab.content.musicQueueRenderer;
      delete tab.content.musicQueueRenderer;
    });
    expect(await client(renamed, (what) => bad.push(what)).radio(ID)).toEqual([]);
    expect(bad.length).toBeGreaterThan(0);
  });
});

describe('[M3.ytmusic/e] a streamed song in the tables its queue and history live in', () => {
  it.each([
    'listening_sessions',
    'queue_items',
    'playing_from',
    'play_history',
    'autoplay_picks',
    'radio_tracks',
  ])('[M3.ytmusic/e] %s takes a ytmusic ref', (table) => {
    const db = openDatabase(':memory:');
    const { sql } = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as { sql: string };
    expect(sql).not.toMatch(/IN \('abs', 'jellyfin'\)/);
  });
});
