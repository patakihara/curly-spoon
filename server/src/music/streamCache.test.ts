import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { open as openFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from '../adapters/http/fetch.js';
import { publicFetch, type PinnedRequest } from '../adapters/http/publicFetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../adapters/http/replay.js';
import { openDatabase, type Db } from '../store/connection.js';
import { Extractor, ExtractorFailure, type SpawnLike } from './extractor.js';
import { parseInfo, pickFormat, StreamUrl } from './schemas.js';
import {
  CHUNK_BYTES,
  RangeRefused,
  type StreamAnswer,
  StreamCache,
  type StreamCacheOptions,
  StreamFailure,
  type StreamResolver,
  type StreamSource,
} from './streamCache.js';

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

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');

function recording(upstream: string, call: string): Recording {
  const file = join(adapters, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const SIZE = clip.byteLength;
/** The clip spans 8 of these, and the last is short. */
const CHUNK = Math.ceil(SIZE / 8);
const ID = 'lYBUbBu4W08';
const OTHER = 'aaaaaaaaaaa';

const recordedInfo = (
  recording('ytdlp', 'info-plain').response.body as { json: { stdout: object } }
).json.stdout as { duration: number; formats: Record<string, unknown>[] };
/** The recorded answer, its Opus row naming the clip's size. */
const info = {
  ...recordedInfo,
  formats: recordedInfo.formats.map((row) =>
    row.format_id === '251' ? { ...row, filesize: SIZE } : row,
  ),
};
const parsed = parseInfo(info);
const opus = pickFormat(parsed.formats)!;
const EXPIRE = opus.expiresAt;
const NOW = EXPIRE - 3_600_000;

const source = (id = ID): StreamSource => ({
  id,
  url: opus.url,
  itag: opus.itag,
  mime: opus.mime,
  size: SIZE,
  duration: parsed.duration,
});

interface Ask {
  url: string;
  range: string;
  redirect: string | undefined;
}

/** The stream host as recorded: its status and headers, the clip's bytes, sliced by range. */
function streamHost(script: { refuse?: number; wrap?: FetchLike } = {}) {
  const replay = replayFetch([recording('googlevideo', 'range-chunk')], {
    readBytes: standInsBeside(adapters),
  });
  const asks: Ask[] = [];
  const refused = recording('googlevideo', 'range-403').response;
  let refuse = script.refuse ?? 0;
  const fetch: FetchLike = async (url, init) => {
    asks.push({
      url,
      range: new Headers(init?.headers).get('range') ?? '',
      redirect: init?.redirect,
    });
    if (refuse > 0) {
      refuse -= 1;
      return new Response('refused', { status: refused.status, headers: refused.headers });
    }
    return replay(url, init);
  };
  return { asks, fetch, setRefuse: (n: number) => (refuse = n) };
}

const stubResolver = (answer: (id: string) => StreamSource = source) => {
  const resolve = vi.fn<StreamResolver['resolve']>((id) => Promise.resolve(answer(id)));
  return { resolve };
};

let dir: string;
let db: Db;
const now = vi.fn(() => NOW);
/** Every cache a test made, so it ends only once their writes have. */
let caches: StreamCache[] = [];

beforeEach(() => {
  disk.shortWrites = false;
  dir = mkdtempSync(join(tmpdir(), 'auralis-streams-'));
  db = openDatabase(':memory:');
  let clock = NOW;
  now.mockImplementation(() => (clock += 1));
});

afterEach(async () => {
  await Promise.all(caches.map((cache) => cache.settled()));
  caches = [];
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function cacheWith(options: Partial<StreamCacheOptions> & Pick<StreamCacheOptions, 'fetch'>) {
  const cache = new StreamCache({
    dir,
    db,
    capBytes: SIZE * 10,
    resolver: stubResolver(),
    now,
    chunkBytes: CHUNK,
    ...options,
  });
  cache.prepare();
  caches.push(cache);
  return cache;
}

async function bytesOf(answer: StreamAnswer): Promise<Buffer> {
  return Buffer.from(await new Response(answer.body).arrayBuffer());
}

const closed = (ask: Ask) => /^bytes=\d+-\d+$/.exec(ask.range) !== null;
const spanOf = (ask: Ask) => {
  const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(ask.range)!;
  return Number(to) - Number(from) + 1;
};

describe('[M3.ytmusic/a] a stream the server proxies', () => {
  it("[M3.ytmusic/a] a client's `bytes=0-` gets the right bytes, each ask closed and at most a chunk", async () => {
    const host = streamHost();
    const answer = await cacheWith({ fetch: host.fetch }).open(ID, 'bytes=0-');
    expect(answer.status).toBe(206);
    expect(answer.headers).toEqual({
      'content-type': 'audio/webm',
      'content-length': String(SIZE),
      'content-range': `bytes 0-${SIZE - 1}/${SIZE}`,
      'accept-ranges': 'bytes',
    });
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
    expect(host.asks).toHaveLength(8);
    for (const ask of host.asks) {
      expect(closed(ask), ask.range).toBe(true);
      expect(spanOf(ask)).toBeLessThanOrEqual(CHUNK);
    }
  });

  it('[M3.ytmusic/a] no range answers 200 with the whole file, still asked in closed chunks', async () => {
    const host = streamHost();
    const answer = await cacheWith({ fetch: host.fetch }).open(ID, undefined);
    expect(answer.status).toBe(200);
    expect(answer.headers['content-range']).toBeUndefined();
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
    expect(host.asks.every(closed)).toBe(true);
  });

  it('[M3.ytmusic/a] the production chunk is 1 MiB, and upstream never hears a client range', async () => {
    expect(CHUNK_BYTES).toBe(1024 * 1024);
    const host = streamHost();
    const answer = await cacheWith({ fetch: host.fetch }).open(
      ID,
      `bytes=${CHUNK + 5}-${CHUNK + 9}`,
    );
    expect((await bytesOf(answer)).equals(clip.subarray(CHUNK + 5, CHUNK + 10))).toBe(true);
    expect(answer.headers['content-range']).toBe(`bytes ${CHUNK + 5}-${CHUNK + 9}/${SIZE}`);
    expect(host.asks.map((ask) => ask.range)).toEqual([`bytes=${CHUNK}-${2 * CHUNK - 1}`]);
  });

  it('[M3.ytmusic/a] reads only as fast as the client does', async () => {
    const host = streamHost();
    const answer = await cacheWith({ fetch: host.fetch }).open(ID, 'bytes=0-');
    const reader = answer.body.getReader();
    for (let got = 0; got < CHUNK;) got += (await reader.read()).value!.byteLength;
    await new Promise((go) => setTimeout(go, 10));
    expect(host.asks).toHaveLength(1);
    await reader.read();
    expect(host.asks).toHaveLength(2);
    await reader.cancel();
  });

  it('[M3.ytmusic/a] a chunk its reader left once all of it arrived is still kept, and settled waits for it', async () => {
    const host = streamHost();
    let write!: () => void;
    const gate = new Promise<void>((go) => (write = go));
    const written: number[] = [];
    const writeChunk = async (_path: string, _chunk: Uint8Array, offset: number) => {
      await gate;
      written.push(offset);
    };
    const cache = cacheWith({ fetch: host.fetch, writeChunk });
    const reader = (await cache.open(ID, 'bytes=0-')).body.getReader();
    for (let got = 0; got < CHUNK - 1;) got += (await reader.read()).value!.byteLength;
    await reader.cancel();
    let settled = false;
    const waiting = cache.settled().then(() => (settled = true));
    await new Promise((go) => setTimeout(go, 10));
    expect(settled).toBe(false);
    write();
    await waiting;
    expect(written).toEqual([0]);
  });

  it('[M3.ytmusic/a] a format naming no size takes it from the answer to its first two bytes', async () => {
    const host = streamHost();
    const resolver = stubResolver((id) => ({ ...source(id), size: null }));
    const answer = await cacheWith({ fetch: host.fetch, resolver }).open(ID, 'bytes=0-');
    expect(answer.headers['content-length']).toBe(String(SIZE));
    expect(host.asks[0]?.range).toBe('bytes=0-1');
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
  });
});

describe("[M3.ytmusic/a] a client's Range is checked", () => {
  it.each([
    'bytes=0-1,5-6',
    'bytes=a-b',
    'bytes=-',
    'bytes=0-1\r\nx: y',
    'items=0-1',
    ' bytes=0-1',
    'bytes=99999999999999999999-',
    '',
  ])('[M3.ytmusic/a] %j is refused with nothing resolved or asked', async (range) => {
    const host = streamHost();
    const resolver = stubResolver();
    const refused = cacheWith({ fetch: host.fetch, resolver }).open(ID, range);
    await expect(refused).rejects.toBeInstanceOf(RangeRefused);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(host.asks).toEqual([]);
  });

  it.each([[`bytes=${SIZE}-`], [`bytes=${SIZE + 10}-${SIZE + 20}`], ['bytes=5-2'], ['bytes=-0']])(
    '[M3.ytmusic/a] %s answers as past the end, with the size, asking upstream nothing',
    async (range) => {
      const host = streamHost();
      const failed = await cacheWith({ fetch: host.fetch })
        .open(ID, range)
        .catch((error: unknown) => error);
      expect(failed).toBeInstanceOf(RangeRefused);
      expect((failed as RangeRefused).size).toBe(SIZE);
      expect(host.asks).toEqual([]);
    },
  );

  it('[M3.ytmusic/a] the last bytes by suffix, and a range running past the end, are cut to the file', async () => {
    const cache = cacheWith({ fetch: streamHost().fetch });
    const tail = await cache.open(ID, 'bytes=-5');
    expect(tail.headers['content-range']).toBe(`bytes ${SIZE - 5}-${SIZE - 1}/${SIZE}`);
    expect((await bytesOf(tail)).equals(clip.subarray(SIZE - 5))).toBe(true);
    const over = await cache.open(ID, `bytes=${SIZE - 3}-${SIZE + 100}`);
    expect((await bytesOf(over)).equals(clip.subarray(SIZE - 3))).toBe(true);
  });

  it('[M3.ytmusic/a] an id that is not an id is refused before anything', async () => {
    const host = streamHost();
    const resolver = stubResolver();
    await expect(
      cacheWith({ fetch: host.fetch, resolver }).open('../../etc/x', 'bytes=0-'),
    ).rejects.toMatchObject({ reason: 'badId' });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);
  });
});

function fakeSpawn() {
  const spawn = vi.fn<SpawnLike>(() => {
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 1 });
    setImmediate(() => {
      stdout.end(JSON.stringify(info));
      stderr.end();
      child.emit('close', 0);
    });
    return child;
  });
  return spawn;
}

describe('[M3.ytmusic/c] replaying a track from the capped disk cache', () => {
  const realExtractor = (spawn: SpawnLike) =>
    new Extractor({ path: () => '/x', home: join(dir, '..', `${dir}-home`), now, spawn });

  afterEach(() => rmSync(`${dir}-home`, { recursive: true, force: true }));

  it('[M3.ytmusic/c] a second play of a held track makes no fetch and no spawn', async () => {
    const host = streamHost();
    const spawn = fakeSpawn();
    const cache = cacheWith({ fetch: host.fetch, resolver: realExtractor(spawn) });
    await bytesOf(await cache.open(ID, 'bytes=0-'));
    expect(spawn).toHaveBeenCalledTimes(1);
    const asked = host.asks.length;
    expect(asked).toBeGreaterThan(0);

    host.asks.length = 0;
    spawn.mockClear();
    const replay = await cache.open(ID, 'bytes=0-');
    expect((await bytesOf(replay)).equals(clip)).toBe(true);
    expect(replay.headers['content-range']).toBe(`bytes 0-${SIZE - 1}/${SIZE}`);
    expect(host.asks).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('[M3.ytmusic/c] a held track plays with the extractor throwing and the network down', async () => {
    const host = streamHost();
    const resolver = stubResolver();
    const fetch = vi.fn(host.fetch);
    const cache = cacheWith({ fetch, resolver });
    await bytesOf(await cache.open(ID, undefined));
    resolver.resolve.mockImplementation(() => Promise.reject(new ExtractorFailure('blocked')));
    fetch.mockImplementation(() => Promise.reject(new Error('down')));
    const replay = await cache.open(ID, 'bytes=10-');
    expect((await bytesOf(replay)).equals(clip.subarray(10))).toBe(true);
  });

  it('[M3.ytmusic/c] a seek across a gap fetches only the gap', async () => {
    const host = streamHost();
    const cache = cacheWith({ fetch: host.fetch });
    await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    await bytesOf(await cache.open(ID, `bytes=${3 * CHUNK}-${4 * CHUNK - 1}`));
    host.asks.length = 0;
    const span = await cache.open(ID, `bytes=0-${4 * CHUNK - 1}`);
    expect((await bytesOf(span)).equals(clip.subarray(0, 4 * CHUNK))).toBe(true);
    expect(host.asks.map((ask) => ask.range)).toEqual([
      `bytes=${CHUNK}-${2 * CHUNK - 1}`,
      `bytes=${2 * CHUNK}-${3 * CHUNK - 1}`,
    ]);
  });

  it('[M3.ytmusic/c] two clients on one missing chunk share one fetch', async () => {
    const host = streamHost();
    const cache = cacheWith({ fetch: host.fetch });
    const [a, b] = await Promise.all([
      cache.open(ID, `bytes=0-${CHUNK - 1}`),
      cache.open(ID, `bytes=0-${CHUNK - 1}`),
    ]);
    expect((await bytesOf(a)).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect((await bytesOf(b)).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(host.asks).toHaveLength(1);
  });

  it('[M3.ytmusic/c] `whole` gives a track held in full, and nothing before that', async () => {
    const cache = cacheWith({ fetch: streamHost().fetch });
    await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    expect(cache.whole(ID)).toBeNull();
    await bytesOf(await cache.open(ID, undefined));
    const file = cache.whole(ID);
    expect(file).toMatchObject({ mime: 'audio/webm', size: SIZE });
    expect(readFileSync(file!.path).equals(clip)).toBe(true);
    expect(cache.whole(OTHER)).toBeNull();
  });
});

describe('[M3.ytmusic/c] a partial chunk is never served as whole', () => {
  const shortBody: (cut: number) => FetchLike = (cut) => async (url, init) => {
    const whole = await streamHost().fetch(url, init);
    const bytes = new Uint8Array(await whole.arrayBuffer());
    return new Response(bytes.subarray(0, bytes.byteLength - cut), {
      status: whole.status,
      headers: whole.headers,
    });
  };

  it('[M3.ytmusic/c] a short answer fails, keeps no bit, and the next read fetches it', async () => {
    const host = streamHost();
    const fetch = vi.fn(shortBody(3));
    const cache = cacheWith({ fetch });
    // The answer's headers were right, so the body has begun: it is the body that fails.
    const answer = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    await expect(bytesOf(answer)).rejects.toMatchObject({ reason: 'badAnswer' });
    expect(cache.heldBytes()).toBe(0);
    fetch.mockImplementation(host.fetch);
    const again = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    expect((await bytesOf(again)).equals(clip.subarray(0, CHUNK))).toBe(true);
  });

  it('[M3.ytmusic/c] a body broken partway keeps no bit either', async () => {
    const host = streamHost();
    const fetch = vi.fn<FetchLike>(async (url, init) => {
      const whole = await host.fetch(url, init);
      const broken = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.error(new Error('reset'));
        },
      });
      return new Response(broken, { status: whole.status, headers: whole.headers });
    });
    const cache = cacheWith({ fetch });
    const answer = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    await expect(bytesOf(answer)).rejects.toMatchObject({ reason: 'unavailable' });
    expect(cache.heldBytes()).toBe(0);
  });

  it('[M3.ytmusic/c] an answer longer than asked is cut off and refused', async () => {
    const host = streamHost();
    const fetch: FetchLike = async (url, init) => {
      const whole = await host.fetch(url, init);
      return new Response(new Uint8Array(CHUNK + 1), { status: 206, headers: whole.headers });
    };
    const cache = cacheWith({ fetch });
    const answer = await cache.open(ID, 'bytes=0-');
    await expect(bytesOf(answer)).rejects.toMatchObject({ reason: 'badAnswer' });
    expect(cache.heldBytes()).toBe(0);
  });

  it('[M3.ytmusic/c] a 200 to a closed range, or another range, is refused', async () => {
    const whole: FetchLike = () =>
      Promise.resolve(
        new Response(clip, { status: 200, headers: { 'content-type': 'audio/webm' } }),
      );
    await expect(cacheWith({ fetch: whole }).open(ID, 'bytes=0-')).rejects.toMatchObject({
      reason: 'badAnswer',
    });
    const other: FetchLike = () =>
      Promise.resolve(
        new Response(clip.subarray(5, 5 + CHUNK), {
          status: 206,
          headers: {
            'content-type': 'audio/webm',
            'content-range': `bytes 5-${4 + CHUNK}/${SIZE}`,
          },
        }),
      );
    await expect(cacheWith({ fetch: other }).open(ID, 'bytes=0-')).rejects.toMatchObject({
      reason: 'badAnswer',
    });
  });

  it('[M3.ytmusic/c] a write that dies partway leaves its bit unset, and the next read fetches it', async () => {
    const host = streamHost();
    let failing = true;
    const cache = cacheWith({
      fetch: host.fetch,
      writeChunk: async (path, chunk, offset) => {
        if (failing) {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, chunk.subarray(0, 4));
          throw new Error('crash');
        }
        const { open } = await import('node:fs/promises');
        const file = await open(path, 'r+');
        await file.write(chunk, 0, chunk.byteLength, offset);
        await file.close();
      },
    });
    const first = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    expect((await bytesOf(first)).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(cache.heldBytes()).toBe(0);
    failing = false;
    host.asks.length = 0;
    const second = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    expect((await bytesOf(second)).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(host.asks).toHaveLength(1);
    expect(cache.heldBytes()).toBe(CHUNK);
  });

  it('[M3.ytmusic/c] a held file that comes up short is fetched again, never served short', async () => {
    const host = streamHost();
    const cache = cacheWith({ fetch: host.fetch });
    await bytesOf(await cache.open(ID, undefined));
    const file = cache.whole(ID)!.path;
    truncateSync(file, SIZE - 3);
    host.asks.length = 0;
    const replay = await cache.open(ID, 'bytes=0-');
    expect((await bytesOf(replay)).equals(clip)).toBe(true);
    expect(host.asks).toHaveLength(1);
    expect(cache.heldBytes()).toBe(SIZE);
  });

  it('[M3.ytmusic/c] a full disk keeps serving, uncached, and says so', async () => {
    const logs: string[] = [];
    const host = streamHost();
    const cache = cacheWith({
      fetch: host.fetch,
      onLog: (what) => logs.push(what),
      writeChunk: () => Promise.reject(Object.assign(new Error('no space'), { code: 'ENOSPC' })),
    });
    const answer = await cache.open(ID, 'bytes=0-');
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
    expect(cache.heldBytes()).toBe(0);
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('[M3.ytmusic/c] the cap', () => {
  const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'];

  it('[M3.ytmusic/c] evicts the least recently used track over the cap', async () => {
    const cache = cacheWith({ fetch: streamHost().fetch, capBytes: SIZE * 2 });
    await bytesOf(await cache.open(ids[0]!, undefined));
    await bytesOf(await cache.open(ids[1]!, undefined));
    await bytesOf(await cache.open(ids[0]!, 'bytes=0-0')); // the first is now the newer
    await bytesOf(await cache.open(ids[2]!, undefined));
    expect(cache.whole(ids[1]!)).toBeNull();
    expect(cache.whole(ids[0]!)).not.toBeNull();
    expect(cache.whole(ids[2]!)).not.toBeNull();
    expect(cache.heldBytes()).toBeLessThanOrEqual(SIZE * 2);
    expect(readdirSync(dir).sort()).toEqual([`${ids[0]}.251`, `${ids[2]}.251`]);
  });

  it('[M3.ytmusic/c] skips the pinned file, and a pin needs something held', async () => {
    const cache = cacheWith({ fetch: streamHost().fetch, capBytes: SIZE * 2 });
    expect(cache.pin(ids[0]!)).toBe(false);
    await bytesOf(await cache.open(ids[0]!, undefined));
    await bytesOf(await cache.open(ids[1]!, undefined));
    expect(cache.pin(ids[0]!)).toBe(true);
    await bytesOf(await cache.open(ids[2]!, undefined));
    expect(cache.whole(ids[0]!)).not.toBeNull();
    expect(cache.whole(ids[1]!)).toBeNull();
  });

  it('[M3.ytmusic/c] never evicts a track being read, whose rest still comes out right', async () => {
    const host = streamHost();
    const cache = cacheWith({ fetch: host.fetch, capBytes: SIZE * 2 });
    await bytesOf(await cache.open(ids[0]!, undefined));
    const reading = await cache.open(ids[0]!, 'bytes=0-');
    const reader = reading.body.getReader();
    const parts = [(await reader.read()).value!];
    await bytesOf(await cache.open(ids[1]!, undefined));
    await bytesOf(await cache.open(ids[2]!, undefined));
    expect(existsSync(join(dir, `${ids[0]}.251`))).toBe(true);
    expect(cache.whole(ids[0]!)).not.toBeNull();
    host.asks.length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    expect(Buffer.concat(parts).equals(clip)).toBe(true);
    expect(host.asks).toEqual([]);
    await bytesOf(await cache.open(ids[3]!, undefined));
    expect(cache.whole(ids[0]!)).toBeNull();
  });

  it('[M3.ytmusic/c] with everything in use, a chunk is served and not kept, and the cap holds', async () => {
    const logs: string[] = [];
    const cache = cacheWith({
      fetch: streamHost().fetch,
      capBytes: CHUNK * 2,
      onLog: (what) => logs.push(what),
    });
    const whole = await bytesOf(await cache.open(ids[0]!, undefined));
    expect(whole.equals(clip)).toBe(true);
    expect(cache.heldBytes()).toBeLessThanOrEqual(CHUNK * 2);
    expect(logs.join()).toContain('no room');
  });

  it('[M3.ytmusic/c] stays under the cap at every write, under concurrent writes', async () => {
    const cap = CHUNK * 5;
    let inWrite = 0;
    let peak = 0;
    const cache: StreamCache = cacheWith({
      fetch: streamHost().fetch,
      capBytes: cap,
      writeChunk: async (path, chunk, offset) => {
        inWrite += chunk.byteLength;
        peak = Math.max(peak, cache.heldBytes() + inWrite);
        await new Promise((go) => setImmediate(go));
        const { open, constants } = await import('node:fs/promises');
        const file = await open(path, constants.O_WRONLY | constants.O_CREAT);
        await file.write(chunk, 0, chunk.byteLength, offset);
        await file.close();
        inWrite -= chunk.byteLength;
      },
    });
    const answers = await Promise.all(
      [...ids, ...ids, 'eeeeeeeeeee', 'fffffffffff'].map((id) => cache.open(id, 'bytes=0-')),
    );
    const bodies = await Promise.all(answers.map(bytesOf));
    for (const body of bodies) expect(body.equals(clip)).toBe(true);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(cap);
    expect(cache.heldBytes()).toBeLessThanOrEqual(cap);
    const onDisk = readdirSync(dir).reduce((sum, file) => {
      const { blocks } = statSync(join(dir, file));
      return sum + blocks * 512;
    }, 0);
    expect(onDisk).toBeLessThanOrEqual(cap + 4096 * readdirSync(dir).length * 2);
  });

  it('[M3.ytmusic/c] at start, files with no row go, and rows with no file', async () => {
    const cache = cacheWith({ fetch: streamHost().fetch });
    await bytesOf(await cache.open(ids[0]!, undefined));
    await bytesOf(await cache.open(ids[1]!, undefined));
    writeFileSync(join(dir, 'orphan.251'), 'x');
    mkdirSync(join(dir, 'stray'));
    rmSync(join(dir, `${ids[1]}.251`));
    cache.prepare();
    expect(readdirSync(dir)).toEqual([`${ids[0]}.251`]);
    expect(cache.whole(ids[0]!)).not.toBeNull();
    expect(db.prepare('SELECT id FROM stream_cache').all()).toEqual([{ id: ids[0] }]);
  });
});

describe('[M3.ytmusic/a] a client leaving', () => {
  /** A stream host whose body gives a few bytes, then waits, and says when it is cancelled. */
  function stalledHost() {
    const asks: string[] = [];
    let cancelled = 0;
    const fetch: FetchLike = (_url, init) => {
      const range = new Headers(init?.headers).get('range') ?? '';
      asks.push(range);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4));
        },
        cancel() {
          cancelled += 1;
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'content-type': 'audio/webm',
            'content-range': `${range.replace('=', ' ')}/${SIZE}`,
          },
        }),
      );
    };
    return { fetch, asks, cancelled: () => cancelled };
  }

  it('[M3.ytmusic/a] a disconnect during a chunk stops the upstream read and keeps nothing', async () => {
    const host = stalledHost();
    const cache = cacheWith({ fetch: host.fetch });
    const gone = new AbortController();
    const reader = (await cache.open(ID, 'bytes=0-', gone.signal)).body.getReader();
    expect((await reader.read()).value).toHaveLength(4);
    const next = reader.read().catch((error: unknown) => error);
    gone.abort();
    expect(await next).toMatchObject({ reason: 'gone' });
    await vi.waitFor(() => expect(host.cancelled()).toBe(1));
    expect(cache.heldBytes()).toBe(0);
  });

  it('[M3.ytmusic/a] a cancelled body asks upstream for nothing more', async () => {
    const host = streamHost();
    const answer = await cacheWith({ fetch: host.fetch }).open(ID, 'bytes=0-');
    const reader = answer.body.getReader();
    await reader.read();
    const asked = host.asks.length;
    await reader.cancel();
    await new Promise((go) => setTimeout(go, 10));
    expect(host.asks).toHaveLength(asked);
  });

  it('[M3.ytmusic/a] a disconnect while the next chunk is coming stops that read too', async () => {
    const real = streamHost();
    const stalled = stalledHost();
    let calls = 0;
    const fetch: FetchLike = (url, init) => {
      calls += 1;
      return calls === 1 ? real.fetch(url, init) : stalled.fetch(url, init);
    };
    const gone = new AbortController();
    const answer = await cacheWith({ fetch }).open(ID, 'bytes=0-', gone.signal);
    const reader = answer.body.getReader();
    for (let got = 0; got < CHUNK;) got += (await reader.read()).value!.byteLength;
    expect((await reader.read()).value).toHaveLength(4);
    const next = reader.read().catch((error: unknown) => error);
    await vi.waitFor(() => expect(stalled.asks).toHaveLength(1));
    gone.abort();
    expect(await next).toMatchObject({ reason: 'gone' });
    await vi.waitFor(() => expect(stalled.cancelled()).toBe(1));
  });

  it('[M3.ytmusic/a] the read goes on while another client still waits for the chunk', async () => {
    const host = stalledHost();
    const cache = cacheWith({ fetch: host.fetch, chunkTimeoutMs: 200 });
    const gone = new AbortController();
    const leaving = bytesOf(await cache.open(ID, 'bytes=0-', gone.signal));
    const staying = bytesOf(await cache.open(ID, 'bytes=0-')).catch((error: unknown) => error);
    await vi.waitFor(() => expect(host.asks).toHaveLength(1));
    gone.abort();
    await expect(leaving).rejects.toMatchObject({ reason: 'gone' });
    await new Promise((go) => setTimeout(go, 20));
    expect(host.cancelled()).toBe(0);
    await staying;
  });

  it('[M3.ytmusic/a] an answer that stalls is given up on at its time limit, not waited on for ever', async () => {
    const host = stalledHost();
    const cache = cacheWith({ fetch: host.fetch, chunkTimeoutMs: 30 });
    const answer = await cache.open(ID, 'bytes=0-');
    await expect(bytesOf(answer)).rejects.toMatchObject({ reason: 'unavailable' });
    expect(host.cancelled()).toBe(1);
  });

  it('[M3.ytmusic/a] a track left mid-read may be evicted afterwards: nothing stays in use', async () => {
    const cache = cacheWith({ fetch: streamHost().fetch, capBytes: SIZE });
    const answer = await cache.open(ID, 'bytes=0-');
    await answer.body.cancel();
    await bytesOf(await cache.open(OTHER, undefined));
    expect(existsSync(join(dir, `${ID}.251`))).toBe(false);
  });
});

describe('[M3.ytmusic/a] an expired or refused URL', () => {
  it('[M3.ytmusic/a] a recorded 403 resolves once more and plays on', async () => {
    const host = streamHost({ refuse: 1 });
    const resolver = stubResolver();
    const answer = await cacheWith({ fetch: host.fetch, resolver }).open(ID, 'bytes=0-');
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
    const replacing = resolver.resolve.mock.calls.filter(([, options]) => options?.replacing);
    expect(replacing).toHaveLength(1);
    expect(replacing[0]?.[1]?.replacing).toBe(opus.url);
  });

  it('[M3.ytmusic/a] a URL refused mid-song resolves once and the song goes on unbroken', async () => {
    const host = streamHost();
    const resolver = stubResolver();
    const answer = await cacheWith({ fetch: host.fetch, resolver }).open(ID, 'bytes=0-');
    const reader = answer.body.getReader();
    const parts = [(await reader.read()).value!, (await reader.read()).value!];
    host.setRefuse(1);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    expect(Buffer.concat(parts).equals(clip)).toBe(true);
    expect(resolver.resolve.mock.calls.filter(([, o]) => o?.replacing)).toHaveLength(1);
  });

  it('[M3.ytmusic/a] two refusals in a row fail, with a reason and no URL', async () => {
    const host = streamHost({ refuse: 2 });
    const failed = await cacheWith({ fetch: host.fetch })
      .open(ID, 'bytes=0-')
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(StreamFailure);
    expect((failed as StreamFailure).reason).toBe('refused');
    expect(host.asks).toHaveLength(2);
    expect(String(failed)).not.toContain('googlevideo');
    expect(JSON.stringify(failed)).not.toContain('googlevideo');
    expect((failed as Error).cause).toBeUndefined();
  });

  it('[M3.ytmusic/a] a resolve that fails while replacing a URL fails the read with its own reason', async () => {
    const host = streamHost({ refuse: 1 });
    const resolver = stubResolver();
    resolver.resolve.mockImplementation((id, options) =>
      options?.replacing === undefined
        ? Promise.resolve(source(id))
        : Promise.reject(new ExtractorFailure('blocked')),
    );
    await expect(
      cacheWith({ fetch: host.fetch, resolver }).open(ID, 'bytes=0-'),
    ).rejects.toMatchObject({ reason: 'blocked' });
  });

  it('[M3.ytmusic/a] the real extractor is run once more for a refused URL, and no more', async () => {
    const host = streamHost({ refuse: 1 });
    const spawn = fakeSpawn();
    const resolver = new Extractor({ path: () => '/x', home: `${dir}-home`, now, spawn });
    const answer = await cacheWith({ fetch: host.fetch, resolver }).open(ID, 'bytes=0-');
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    rmSync(`${dir}-home`, { recursive: true, force: true });
  });

  it('[M3.ytmusic/a] a track whose format changed is not stitched from two files', async () => {
    const host = streamHost();
    const resolver = stubResolver();
    const cache = cacheWith({ fetch: host.fetch, resolver });
    await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    resolver.resolve.mockImplementation((id) => Promise.resolve({ ...source(id), itag: 250 }));
    const failed = await cache.open(ID, `bytes=${CHUNK}-`).catch((error: unknown) => error);
    expect(failed).toMatchObject({ reason: 'changed' });
    resolver.resolve.mockImplementation((id) => Promise.resolve(source(id)));
    expect(existsSync(join(dir, `${ID}.251`))).toBe(false);
    expect((await bytesOf(await cache.open(ID, undefined))).equals(clip)).toBe(true);
  });
});

describe('[M3.ytmusic/a] only stream hosts, and audio', () => {
  const at = (host: string) => new StreamUrl(`https://${host}/videoplayback?itag=251`);
  const resolverAt = (host: string) => stubResolver((id) => ({ ...source(id), url: at(host) }));

  it.each(['example.net', 'googlevideo.com.example.net', '192.168.1.20', 'googlevideo.com'])(
    '[M3.ytmusic/a] a URL on %s is never asked',
    async (host) => {
      const fetch = vi.fn<FetchLike>();
      await expect(
        cacheWith({ fetch, resolver: resolverAt(host) }).open(ID, 'bytes=0-'),
      ).rejects.toMatchObject({ reason: 'offHost' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  const redirecting =
    (location: string | null, then: FetchLike): FetchLike =>
    (url, init) =>
      url.includes('rr9---')
        ? then(url.replace('rr9---', 'rr0---'), init)
        : Promise.resolve(
            new Response(null, {
              status: 302,
              headers: location === null ? {} : { location },
            }),
          );

  it('[M3.ytmusic/a] a redirect to another stream host is followed, by hand, on the same range', async () => {
    const host = streamHost();
    const asked: string[] = [];
    const spy: FetchLike = (url, init) => {
      asked.push(new URL(url).hostname);
      expect(init?.redirect).toBe('manual');
      return redirecting(
        'https://rr9---sn-recorded.googlevideo.com/videoplayback?' +
          new URLSearchParams(new URL(opus.url.reveal()).search).toString(),
        host.fetch,
      )(url, init);
    };
    const answer = await cacheWith({ fetch: spy }).open(ID, `bytes=0-${CHUNK - 1}`);
    expect((await bytesOf(answer)).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(asked[1]).toBe('rr9---sn-recorded.googlevideo.com');
  });

  it.each([
    'https://example.net/videoplayback',
    'http://rr1---sn-x.googlevideo.com/videoplayback',
    'https://rr1.googlevideo.com@example.net/',
    'https://169.254.169.254/',
    'file:///etc/passwd',
  ])('[M3.ytmusic/a] a redirect to %s is refused, and not asked', async (location) => {
    const asked: string[] = [];
    const fetch: FetchLike = (url) => {
      asked.push(url);
      return Promise.resolve(new Response(null, { status: 302, headers: { location } }));
    };
    await expect(cacheWith({ fetch }).open(ID, 'bytes=0-')).rejects.toMatchObject({
      reason: 'offHost',
    });
    expect(asked).toEqual([opus.url.reveal()]);
  });

  it('[M3.ytmusic/a] redirects in a loop end in a refusal', async () => {
    const asked: string[] = [];
    const fetch: FetchLike = (url) => {
      asked.push(url);
      return Promise.resolve(new Response(null, { status: 302, headers: { location: url } }));
    };
    await expect(cacheWith({ fetch }).open(ID, 'bytes=0-')).rejects.toMatchObject({
      reason: 'offHost',
    });
    expect(asked).toHaveLength(3);
  });

  it("[M3.ytmusic/a] rule 8: the stream host's recorded video header is refused, and no byte is kept", async () => {
    const { status, headers } = recording('googlevideo', 'range-video').response;
    expect(headers['content-type']).toMatch(/^video\//);
    let cancelled = false;
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status, headers },
        ),
      );
    const cache = cacheWith({ fetch });
    await expect(cache.open(ID, 'bytes=0-')).rejects.toMatchObject({ reason: 'notAudio' });
    expect(cancelled).toBe(true);
    expect(cache.heldBytes()).toBe(0);
  });

  it('[M3.ytmusic/a] rule 8: a held row can only be an audio type', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO stream_cache (id, itag, size, mime, duration, chunks, last_used)
           VALUES ('x', 18, 1, 'video/mp4', 1, x'00', 0)`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it('[M3.ytmusic/a] a stream URL reaches no header, table, file name, log or failure', async () => {
    const logs: string[] = [];
    const host = streamHost({ refuse: 1 });
    const cache = cacheWith({ fetch: host.fetch, onLog: (what) => logs.push(what) });
    const answer = await cache.open(ID, undefined);
    await bytesOf(answer);
    const everything = JSON.stringify({
      headers: answer.headers,
      rows: db.prepare('SELECT id, itag, size, mime, duration FROM stream_cache').all(),
      files: readdirSync(dir),
      logs,
    });
    for (const text of ['googlevideo', 'videoplayback', 'sig=', 'expire']) {
      expect(everything).not.toContain(text);
    }
  });

  it('[M3.ytmusic/a] asks for the recorded URL with no client header passed on', async () => {
    const heard: Record<string, string>[] = [];
    const host = streamHost();
    const fetch: FetchLike = (url, init) => {
      heard.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return host.fetch(url, init);
    };
    await bytesOf(await cacheWith({ fetch }).open(ID, `bytes=0-${CHUNK - 1}`));
    expect(heard).toEqual([{ range: `bytes=0-${CHUNK - 1}` }]);
  });
});

/** A stream host whose file can change or refuse, answering closed ranges as the recordings do. */
function changingHost(refuse = 0) {
  const state = { file: clip, refuse };
  const fetch: FetchLike = async (_url, init) => {
    if (state.refuse > 0) {
      state.refuse -= 1;
      return new Response(null, { status: 403 });
    }
    const range = new Headers(init?.headers).get('range') ?? '';
    const [first = 0, last = 0] = range.replace('bytes=', '').split('-').map(Number);
    const total = state.file.length;
    if (first >= total) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
    }
    const end = Math.min(last, total - 1);
    return new Response(state.file.subarray(first, end + 1), {
      status: 206,
      headers: { 'content-type': 'audio/webm', 'content-range': `bytes ${first}-${end}/${total}` },
    });
  };
  return { fetch, state };
}

const unnamedSize = (id: string): StreamSource => ({ ...source(id), size: null });

describe('[M3.ytmusic/a] the stream goes through publicFetch', () => {
  it("[M3.ytmusic/a] publicFetch passes the stream's Range on, so a chunk is asked as a closed range", async () => {
    const heard: (string | undefined)[] = [];
    const request = ((
      _url: URL,
      options: { headers?: Record<string, string> },
      answer: (body: unknown) => void,
    ) => {
      const range = options.headers?.range;
      heard.push(range);
      const [first = 0, last = SIZE - 1] = (range ?? 'bytes=0-')
        .replace('bytes=', '')
        .split('-')
        .map((n) => (n === '' ? SIZE - 1 : Number(n)));
      const body = Object.assign(Readable.from([clip.subarray(first, last + 1)]), {
        statusCode: range === undefined ? 200 : 206,
        headers: {
          'content-type': 'audio/webm',
          ...(range === undefined ? {} : { 'content-range': `bytes ${first}-${last}/${SIZE}` }),
        },
      });
      return Object.assign(new EventEmitter(), { end: () => answer(body) });
    }) as unknown as PinnedRequest;
    const fetch = publicFetch({ lookup: async () => ['142.250.74.14'], request });
    const answer = await cacheWith({ fetch }).open(ID, 'bytes=0-');
    expect((await bytesOf(answer)).equals(clip)).toBe(true);
    expect(heard[0]).toBe(`bytes=0-${CHUNK - 1}`);
  });
});

describe('[M3.ytmusic/c] a chunk counts only once all of it is on disk', () => {
  it('[M3.ytmusic/c] a write that takes only part of a chunk keeps no bit, and the next read fetches it', async () => {
    const cache = cacheWith({ fetch: changingHost().fetch });
    disk.shortWrites = true;
    await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    disk.shortWrites = false;
    expect(cache.heldBytes()).toBe(0);
    const again = await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    expect(again.equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(cache.heldBytes()).toBe(CHUNK);
  });

  it('[M3.ytmusic/c] `whole` does not give a file shorter than the track', async () => {
    const cache = cacheWith({ fetch: changingHost().fetch });
    await bytesOf(await cache.open(ID, undefined));
    expect(cache.whole(ID)).not.toBeNull();
    truncateSync(join(dir, `${ID}.251`), CHUNK);
    expect(cache.whole(ID)).toBeNull();
  });

  /** A write of `ID`'s chunk held back until `release`, with everyone's writes told of. */
  function heldWrites() {
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
    return { writes, writeChunk, release };
  }

  it('[M3.ytmusic/c] a write landing after its track was evicted leaves no file the table does not count', async () => {
    const { writes, writeChunk, release } = heldWrites();
    const cache = cacheWith({ fetch: changingHost().fetch, capBytes: CHUNK, writeChunk });
    const client = new AbortController();
    const leaving = cache.open(ID, `bytes=0-${CHUNK - 1}`, client.signal).catch(() => null);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    client.abort();
    await leaving;
    await bytesOf(await cache.open(OTHER, `bytes=0-${CHUNK - 1}`));
    release();
    await Promise.all(writes);
    await vi.waitFor(() => expect(existsSync(join(dir, `${ID}.251`))).toBe(false));
    expect(readdirSync(dir).filter((name) => name.startsWith(ID))).toEqual([]);
  });

  it('[M3.ytmusic/c] a write begun before an eviction sets no bit on the row made after it', async () => {
    const { writes, writeChunk, release } = heldWrites();
    const cache = cacheWith({ fetch: changingHost().fetch, capBytes: CHUNK, writeChunk });
    const client = new AbortController();
    const leaving = cache.open(ID, `bytes=0-${CHUNK - 1}`, client.signal).catch(() => null);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    client.abort();
    await leaving;
    await bytesOf(await cache.open(OTHER, `bytes=0-${CHUNK - 1}`));
    const row = db.prepare('SELECT COUNT(*) AS n FROM stream_cache WHERE id = ?');
    expect(row.get(ID)).toEqual({ n: 0 });
    db.prepare(
      `INSERT INTO stream_cache (id, itag, size, mime, duration, chunks, last_used)
       VALUES (?, 251, ?, 'audio/webm', 10, ?, 0)`,
    ).run(ID, SIZE, Buffer.alloc(1));
    release();
    await Promise.all(writes);
    await new Promise((settled) => setTimeout(settled, 20));
    const { bytes } = db.prepare('SELECT bytes FROM stream_cache WHERE id = ?').get(ID) as {
      bytes: number;
    };
    expect(bytes).toBe(0);
  });
});

describe('[M3.ytmusic/a] a client leaving before the track has resolved', () => {
  it('[M3.ytmusic/a] is let go at once, not held behind the extractor queue', async () => {
    const client = new AbortController();
    const cache = cacheWith({
      fetch: changingHost().fetch,
      resolver: { resolve: () => new Promise(() => undefined) },
    });
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
    const resolver = stubResolver(unnamedSize);
    const cache = cacheWith({ fetch: changingHost(1).fetch, resolver });
    const answer = await cache.open(ID, `bytes=0-${CHUNK - 1}`);
    expect((await bytesOf(answer)).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(resolver.resolve.mock.calls.some(([, asked]) => asked !== undefined)).toBe(true);
  });

  it('[M3.ytmusic/a] a file gone shorter, answered 416, starts afresh once nobody plays it', async () => {
    const host = changingHost();
    const cache = cacheWith({ fetch: host.fetch, resolver: stubResolver(unnamedSize) });
    await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    host.state.file = clip.subarray(0, CHUNK * 2);
    await expect(cache.open(ID, `bytes=${CHUNK * 3}-`)).rejects.toMatchObject({
      reason: 'changed',
    });
    const fresh = await cache.open(ID, 'bytes=0-0');
    expect(fresh.headers['content-range']).toBe(`bytes 0-0/${CHUNK * 2}`);
    await fresh.body.cancel();
  });

  it('[M3.ytmusic/a] a chunk whose answer names another total is not kept, and the track starts afresh', async () => {
    const host = changingHost();
    const cache = cacheWith({ fetch: host.fetch });
    await bytesOf(await cache.open(ID, `bytes=0-${CHUNK - 1}`));
    host.state.file = Buffer.concat([clip, clip]);
    await expect(cache.open(ID, `bytes=${CHUNK}-${CHUNK * 2 - 1}`)).rejects.toMatchObject({
      reason: 'changed',
    });
    expect(cache.heldBytes()).toBe(0);
  });
});

describe('[M3.ytmusic] a chunk reaches the client as it arrives', () => {
  /**
   * The stream host as recorded, whose answer to each range gives its first `part` bytes at once
   * and holds the rest until `release`, `cut` (the rest short by 3 bytes) or `fail`.
   */
  function heldHost(part: number) {
    const real = streamHost();
    const asks: string[] = [];
    const cancelled = vi.fn();
    const gates: { release: () => void; cut: () => void; fail: () => void }[] = [];
    const fetch: FetchLike = async (url, init) => {
      const whole = await real.fetch(url, init);
      asks.push(new Headers(init?.headers).get('range') ?? '');
      const bytes = new Uint8Array(await whole.arrayBuffer());
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          c.enqueue(bytes.slice(0, part));
        },
        cancel: cancelled,
      });
      gates.push({
        release: () => {
          controller.enqueue(bytes.slice(part));
          controller.close();
        },
        cut: () => {
          controller.enqueue(bytes.slice(part, bytes.byteLength - 3));
          controller.close();
        },
        fail: () => controller.error(new Error('reset')),
      });
      return new Response(body, { status: whole.status, headers: whole.headers });
    };
    return { fetch, asks, cancelled, gates };
  }
  const PART = 4096;
  const firstChunk = `bytes=0-${CHUNK - 1}`;

  it('[M3.ytmusic] the client has the first bytes before the chunk is complete', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const answer = await cache.open(ID, firstChunk);
    const reader = answer.body.getReader();
    const { value } = await reader.read();
    expect(Buffer.from(value!).equals(clip.subarray(0, PART))).toBe(true);
    expect(cache.heldBytes()).toBe(0);
    host.gates[0]!.release();
    await reader.cancel();
  });

  it('[M3.ytmusic] the bit is set only once the last byte is written and synced', async () => {
    const host = heldHost(PART);
    let synced = () => undefined as void;
    const written = new Promise<void>((done) => (synced = done));
    let writes = 0;
    const cache = cacheWith({
      fetch: host.fetch,
      writeChunk: async (path, chunk, offset) => {
        writes += 1;
        await written;
        const file = await openFile(path, 'a+');
        await file.write(chunk, 0, chunk.byteLength, offset);
        await file.close();
      },
    });
    const reader = (await cache.open(ID, firstChunk)).body.getReader();
    const got: Uint8Array[] = [(await reader.read()).value!];
    await new Promise((go) => setTimeout(go, 10));
    expect(writes).toBe(0);
    host.gates[0]!.release();
    got.push((await reader.read()).value!);
    // All but the chunk's last byte is out before its write ends; the last waits for the keeping.
    expect(Buffer.concat(got).equals(clip.subarray(0, CHUNK - 1))).toBe(true);
    await vi.waitFor(() => expect(writes).toBe(1));
    expect(cache.heldBytes()).toBe(0);
    const last = reader.read();
    await new Promise((go) => setTimeout(go, 10));
    expect(cache.heldBytes()).toBe(0);
    synced();
    expect(Buffer.from((await last).value!).equals(clip.subarray(CHUNK - 1, CHUNK))).toBe(true);
    expect(cache.heldBytes()).toBe(CHUNK);
  });

  it('[M3.ytmusic] a short answer mid-chunk errors the body, keeps no bit, and the next read fetches it', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const answer = await cache.open(ID, firstChunk);
    const reading = bytesOf(answer);
    host.gates[0]!.cut();
    await expect(reading).rejects.toMatchObject({ reason: 'badAnswer' });
    expect(cache.heldBytes()).toBe(0);
    const again = bytesOf(await cache.open(ID, firstChunk));
    host.gates[1]!.release();
    expect((await again).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(host.asks).toEqual([firstChunk, firstChunk]);
  });

  it('[M3.ytmusic] an upstream error mid-chunk errors the body and keeps nothing', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const reading = bytesOf(await cache.open(ID, firstChunk));
    host.gates[0]!.fail();
    await expect(reading).rejects.toMatchObject({ reason: 'unavailable' });
    expect(cache.heldBytes()).toBe(0);
    expect(readdirSync(dir).map((f) => statSync(join(dir, f)).size)).toEqual(
      readdirSync(dir).map(() => 0),
    );
  });

  it('[M3.ytmusic] two clients joining one read partway both get every byte from their own start', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const first = await cache.open(ID, firstChunk);
    const reader = first.body.getReader();
    const head = (await reader.read()).value!;
    const fromStart = bytesOf(await cache.open(ID, firstChunk));
    const midway = bytesOf(await cache.open(ID, `bytes=${PART + 100}-${CHUNK + 9}`));
    host.gates[0]!.release();
    const rest: Uint8Array[] = [head];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest.push(value);
    }
    expect(Buffer.concat(rest).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect((await fromStart).equals(clip.subarray(0, CHUNK))).toBe(true);
    // The next chunk's first part holds all it asks of it, so it leaves that read early.
    expect((await midway).equals(clip.subarray(PART + 100, CHUNK + 10))).toBe(true);
    expect(host.asks).toEqual([firstChunk, `bytes=${CHUNK}-${2 * CHUNK - 1}`]);
    await vi.waitFor(() => expect(host.cancelled).toHaveBeenCalledOnce());
  });

  it('[M3.ytmusic] a range starting mid-chunk gets its bytes once they arrive', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const reading = bytesOf(await cache.open(ID, `bytes=${PART + 5}-${PART + 9}`));
    await new Promise((go) => setTimeout(go, 10));
    host.gates[0]!.release();
    expect((await reading).equals(clip.subarray(PART + 5, PART + 10))).toBe(true);
  });

  it('[M3.ytmusic] a client leaving mid-chunk stops the read only when it was the last', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const goneFirst = new AbortController();
    const goneSecond = new AbortController();
    const one = await cache.open(ID, firstChunk, goneFirst.signal);
    const two = await cache.open(ID, firstChunk, goneSecond.signal);
    const readOne = bytesOf(one).catch((error: unknown) => error);
    const readTwo = bytesOf(two).catch((error: unknown) => error);
    goneFirst.abort();
    expect(await readOne).toMatchObject({ reason: 'gone' });
    await new Promise((go) => setTimeout(go, 10));
    expect(host.cancelled).not.toHaveBeenCalled();
    goneSecond.abort();
    expect(await readTwo).toMatchObject({ reason: 'gone' });
    await vi.waitFor(() => expect(host.cancelled).toHaveBeenCalledOnce());
    expect(cache.heldBytes()).toBe(0);
  });

  it('[M3.ytmusic] a partial chunk a client left is never taken as whole by the next one', async () => {
    const host = heldHost(PART);
    const cache = cacheWith({ fetch: host.fetch });
    const gone = new AbortController();
    const left = bytesOf(await cache.open(ID, firstChunk, gone.signal)).catch((e: unknown) => e);
    gone.abort();
    await left;
    const next = bytesOf(await cache.open(ID, firstChunk));
    await vi.waitFor(() => expect(host.gates).toHaveLength(2));
    host.gates[1]!.release();
    expect((await next).equals(clip.subarray(0, CHUNK))).toBe(true);
    expect(host.asks).toEqual([firstChunk, firstChunk]);
  });
});
