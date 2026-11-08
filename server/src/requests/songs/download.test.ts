/**
 * A kept song's download through the real stream cache, on the recorded stream host's answer over
 * the synthesized Opus clip: what the cache holds is read from its disk, and only what it lacks is
 * fetched, in closed ranges. Stand-in streams stand for what the cache cannot be made to do on
 * cue: hang, refuse a song, or be unavailable.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../../adapters/http/replay.js';
import { StreamingUnavailable, TrackRefused } from '../../music/index.js';
import { parseInfo, pickFormat } from '../../music/schemas.js';
import {
  type StreamAnswer,
  StreamCache,
  StreamFailure,
  type StreamSource,
} from '../../music/streamCache.js';
import { openDatabase, type Db } from '../../store/connection.js';
import type { StoredRequest } from '../../store/requests.js';
import { type Release, StepUnavailable } from '../steps.js';
import { songDownload, type SongStream, stagedPath } from './download.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');
const recording = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );

const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const SIZE = clip.byteLength;
/** The clip spans 8 of these, and the last is short. */
const CHUNK = Math.ceil(SIZE / 8);
const ID = 'lYBUbBu4W08';

const info = (recording('ytdlp', 'info-plain').response.body as { json: { stdout: object } }).json
  .stdout as { formats: Record<string, unknown>[] };
const parsed = parseInfo({
  ...info,
  formats: info.formats.map((row) => (row.format_id === '251' ? { ...row, filesize: SIZE } : row)),
});
const opus = pickFormat(parsed.formats)!;
const source: StreamSource = {
  id: ID,
  url: opus.url,
  itag: opus.itag,
  mime: opus.mime,
  size: SIZE,
  duration: parsed.duration,
};

const release: Release = {
  id: ID,
  title: 'An Album',
  source: 'YouTube Music',
  size: null,
  details: { youtubeMusicId: ID, match: { source: 'YouTube Music', album: 'An Album' } },
};
const request = {} as StoredRequest;

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-keep-'));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The stream host as recorded, each range it is asked counted. */
function streamHost() {
  const replay = replayFetch([recording('googlevideo', 'range-chunk')], {
    readBytes: standInsBeside(adapters),
  });
  const ranges: string[] = [];
  const fetch: FetchLike = (url, init) => {
    ranges.push(new Headers(init?.headers).get('range') ?? '');
    return replay(url, init);
  };
  return { fetch, ranges };
}

/** The real cache over the recorded host, and every range a staging read asked of it. */
function cached() {
  const host = streamHost();
  const cache = new StreamCache({
    dir: join(dir, 'cache'),
    db,
    capBytes: SIZE * 10,
    fetch: host.fetch,
    resolver: { resolve: () => Promise.resolve(source) },
    now: () => 1,
    chunkBytes: CHUNK,
  });
  cache.prepare();
  const asked: (string | undefined)[] = [];
  const stream: SongStream = {
    open: (id, range, signal) => {
      asked.push(range);
      return cache.open(id, range, signal);
    },
  };
  return { cache, host, stream, asked };
}

const drain = async (answer: StreamAnswer) =>
  Buffer.from(await new Response(answer.body).arrayBuffer());

/** The steps, staging into `dir/staging`, with each wake counted. */
function steps(stream: SongStream) {
  let wakes = 0;
  const stagingDir = join(dir, 'staging');
  const logged: string[] = [];
  const download = songDownload({
    stream,
    stagingDir,
    wake: () => {
      wakes += 1;
    },
    log: { error: (_details, message) => logged.push(message) },
  });
  return {
    download,
    staged: stagedPath(stagingDir, ID),
    /** Settles once the read has woken the job `n` times in all. */
    woken: (n = 1) => vi.waitFor(() => expect(wakes).toBeGreaterThanOrEqual(n)),
    wakes: () => wakes,
    logged,
  };
}

/** A stream that sends its first bytes, then nothing until it is aborted. */
function hanging() {
  const signals: AbortSignal[] = [];
  const stream: SongStream = {
    open: (_id, range, signal) => {
      signals.push(signal);
      const from = Number(/^bytes=(\d+)-$/.exec(range ?? '')?.[1] ?? 0);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(clip.subarray(from, from + 100));
          signal.addEventListener('abort', () => controller.error(new StreamFailure('gone')));
        },
      });
      return Promise.resolve({
        status: 206,
        headers: { 'content-range': `bytes ${from}-${SIZE - 1}/${SIZE}` },
        body,
      });
    },
  };
  return { stream, signals };
}

describe('[M3.keep] a kept song is staged through the stream cache', () => {
  it('[M3.keep] a song held whole stages from the cache with no stream fetch, byte for byte', async () => {
    const { cache, host, stream } = cached();
    await drain(await cache.open(ID, undefined));
    const held = cache.whole(ID)!;
    host.ranges.length = 0;

    const { download, staged, woken } = steps(stream);
    const handle = await download.start(request, release, 'key');
    expect(handle).toEqual({ id: ID, size: SIZE });
    await woken();
    expect(await download.poll(handle)).toEqual({ kind: 'done' });
    expect(host.ranges).toEqual([]);
    expect(readFileSync(staged).equals(readFileSync(held.path))).toBe(true);
  });

  it('[M3.keep] a song held in part fetches only its missing chunks, each a closed range', async () => {
    const { cache, host, stream } = cached();
    await drain(await cache.open(ID, `bytes=0-${4 * CHUNK - 1}`));
    host.ranges.length = 0;

    const { download, staged, woken } = steps(stream);
    const handle = await download.start(request, release, 'key');
    await woken();
    expect(await download.poll(handle)).toEqual({ kind: 'done' });
    expect(host.ranges).toEqual(
      [4, 5, 6, 7].map((n) => `bytes=${n * CHUNK}-${Math.min((n + 1) * CHUNK, SIZE) - 1}`),
    );
    expect(readFileSync(staged).equals(clip)).toBe(true);
  });

  it('[M3.keep] a staging read lost to a restart goes on from the bytes staged, at the next poll', async () => {
    const { stream, asked } = cached();
    const { download, staged, woken } = steps(stream);
    const handle = await download.start(request, release, 'key');
    await woken();

    // The server stops with the song half staged; the new one has no read going.
    writeFileSync(staged, clip.subarray(0, Math.floor(2.5 * CHUNK)));
    asked.length = 0;
    const after = steps(stream);
    const polled = await after.download.poll(handle);
    expect(polled).toEqual({ kind: 'downloading', progress: Math.floor(2.5 * CHUNK) / SIZE });
    expect(asked).toEqual([`bytes=${Math.floor(2.5 * CHUNK)}-`]);
    await after.woken();
    expect(await after.download.poll(handle)).toEqual({ kind: 'done' });
    expect(readFileSync(staged).equals(clip)).toBe(true);
  });

  it('[M3.keep] a start repeated while its read goes on answers the same handle and opens nothing more', async () => {
    const { stream, signals } = hanging();
    const { download } = steps(stream);
    const first = await download.start(request, release, 'key');
    expect(await download.start(request, release, 'key')).toEqual(first);
    expect(signals).toHaveLength(1);
    await download.cancel({ handle: first });
  });

  it('[M3.keep] a poll while bytes come counts what is staged', async () => {
    const { stream } = hanging();
    const { download, staged } = steps(stream);
    const handle = await download.start(request, release, 'key');
    await vi.waitFor(() => expect(statSync(staged).size).toBe(100));
    expect(await download.poll(handle)).toEqual({ kind: 'downloading', progress: 100 / SIZE });
    await download.cancel({ handle });
  });

  it('[M3.keep] a cancel stops the read and deletes what was staged', async () => {
    const { stream, signals } = hanging();
    const { download, staged, wakes } = steps(stream);
    const handle = await download.start(request, release, 'key');
    await vi.waitFor(() => expect(statSync(staged).size).toBe(100));
    await download.cancel({ handle });
    expect(signals[0]!.aborted).toBe(true);
    expect(existsSync(staged)).toBe(false);
    expect(wakes()).toBe(0);
  });

  it('[M3.keep] a cancel by key, when no start answer was saved, deletes what that start staged', async () => {
    const { download, staged } = steps(hanging().stream);
    await download.start(request, release, 'key');
    await vi.waitFor(() => expect(statSync(staged).size).toBe(100));
    await download.cancel({ key: 'key', release });
    expect(existsSync(staged)).toBe(false);
  });

  it('[M3.keep] streaming unavailable holds the request, and a song refused fails it', async () => {
    const down: SongStream = { open: () => Promise.reject(new StreamingUnavailable()) };
    await expect(steps(down).download.start(request, release, 'key')).rejects.toBeInstanceOf(
      StepUnavailable,
    );
    const refused: SongStream = { open: () => Promise.reject(new TrackRefused()) };
    const failing = steps(refused).download.start(request, release, 'key');
    await expect(failing).rejects.toBeInstanceOf(TrackRefused);
  });

  it('[M3.keep] a stream that breaks partway holds the request, and the next poll goes on from there', async () => {
    let breaks = true;
    const { stream: real } = cached();
    const stream: SongStream = {
      open: async (id, range, signal) => {
        const answer = await real.open(id, range, signal);
        if (!breaks) return answer;
        breaks = false;
        const reader = answer.body.getReader();
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { value } = await reader.read();
            controller.enqueue(value!);
            await reader.cancel();
            controller.error(new StreamFailure('unavailable'));
          },
        });
        return { ...answer, body };
      },
    };
    const { download, staged, woken, logged } = steps(stream);
    const handle = await download.start(request, release, 'key');
    await woken();
    expect(logged).toEqual(['a kept song stopped staging']);
    await expect(download.poll(handle)).rejects.toBeInstanceOf(StepUnavailable);

    const resumed = await download.poll(handle);
    expect(resumed).toMatchObject({ kind: 'downloading' });
    await woken(2);
    expect(await download.poll(handle)).toEqual({ kind: 'done' });
    expect(readFileSync(staged).equals(clip)).toBe(true);
  });
});
