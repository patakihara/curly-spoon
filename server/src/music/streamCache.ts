/**
 * A streamed song's bytes, proxied through a capped disk cache. Whatever a client's range, the
 * upstream is only ever asked closed ranges of one aligned chunk, because an open-ended range is
 * paced to about twice the audio's rate (checked live). A chunk's bytes go on to every client
 * reading it as they arrive, while the whole chunk is gathered for the disk. It counts only once
 * held in full: its bit is set once all its bytes are on disk, so a crash, a short answer or every
 * client leaving costs only that chunk. A track fully held needs no resolve and no fetch, and plays
 * with streaming down.
 *
 * Only stream hosts are asked, and a redirect is followed only to another. An answer that is not
 * audio is refused. A refused URL is resolved once more and tried again, so one that expires
 * mid-song does not end it. When the last client waiting on a chunk leaves, its upstream read stops.
 *
 * Held bytes plus bytes being written never pass the cap: room is made before a write, by evicting
 * the least recently used tracks that are neither pinned nor being played, and with no room the
 * chunk is served without being kept, as it is when the disk is full.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { constants, open as openFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import {
  type FileHeaders,
  fileHeadersSchema,
  openStream,
  RangeNotSatisfiable,
} from '../adapters/stream.js';
import type { Db } from '../store/connection.js';
import { isStreamHost, type StreamUrl, YT_ID } from './schemas.js';

/** About a minute of audio, far below the 30 MiB closed range that stalled (checked live). */
export const CHUNK_BYTES = 1024 * 1024;

/** How long one chunk's answer may take once asked. 1 MiB took about 350 ms (checked live). */
const CHUNK_TIMEOUT_MS = 30_000;

const MOST_REDIRECTS = 2;

/** One plain `bytes=first-last` range, either end optional but not both; the route's own form. */
const BYTES_RANGE = /^bytes=(?:(\d{1,15})-(\d{0,15})|-(\d{1,15}))$/;

export type StreamFailureReason =
  /** The stream host refused the URL, and the one resolved after it. */
  | 'refused'
  /** The answer was not an audio type. */
  | 'notAudio'
  /** The network failed, or the answer stalled. */
  | 'unavailable'
  /** Asked to reach, or redirected to, anything but a stream host. */
  | 'offHost'
  /** The answer was not the range asked. */
  | 'badAnswer'
  /** The track's format or size is not what is held; it starts afresh once nobody is playing it. */
  | 'changed'
  /** The id is not an id. */
  | 'badId'
  /** The client left. */
  | 'gone';

/** Names a reason, never a URL: this is what reaches a log. */
export class StreamFailure extends Error {
  constructor(readonly reason: StreamFailureReason) {
    super(`the stream failed: ${reason}`);
    this.name = 'StreamFailure';
  }
}

/** A range that cannot be served; the size, when the track is known, for the 416's answer. */
export class RangeRefused extends Error {
  constructor(readonly size: number | undefined) {
    super('the range cannot be served');
    this.name = 'RangeRefused';
  }
}

/** The extractor's part in this, as the cache needs it. */
export interface StreamSource {
  id: string;
  url: StreamUrl;
  itag: number;
  mime: string;
  size: number | null;
  duration: number;
}

export interface StreamResolver {
  resolve(id: string, options?: { replacing?: StreamUrl }): Promise<StreamSource>;
}

export interface StreamCacheOptions {
  dir: string;
  db: Db;
  capBytes: number;
  fetch: FetchLike;
  resolver: StreamResolver;
  now: () => number;
  chunkBytes?: number;
  chunkTimeoutMs?: number;
  /** Told of what is logged: reasons alone. */
  onLog?: (what: string) => void;
  /** Puts a chunk in its place on disk; the real one unless a test stands in. */
  writeChunk?: (path: string, chunk: Uint8Array, offset: number) => Promise<void>;
}

export interface StreamAnswer {
  status: 200 | 206;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array>;
}

export interface HeldFile {
  path: string;
  mime: string;
  size: number;
}

interface Row {
  id: string;
  itag: number;
  size: number;
  mime: string;
  duration: number;
  chunks: Buffer;
  bytes: number;
  last_used: number;
  pinned: number;
}

/**
 * One chunk's upstream read, shared by every client reading the chunk. `bytes[0, got)` never
 * change once there; `received` is set when all `length` are, and `kept` once the chunk's keeping
 * is over. Its last byte is held back until then, so a client that has a whole chunk finds it held.
 */
interface Flight {
  bytes: Buffer;
  length: number;
  got: number;
  received: boolean;
  kept: boolean;
  failure: Error | null;
  /** Readers waiting for more bytes, or for the failure. */
  wakers: Set<() => void>;
  /** Settles once the upstream answer's headers are checked: the chunk can start. */
  started: Promise<void>;
  stop: AbortController;
  waiters: number;
}

/** A chunk as one reader has it: held on disk, or a share of its upstream read. */
interface ChunkReader {
  length: number;
  /** The chunk's bytes from `from` on that are here, waiting for at least one. */
  read(from: number): Promise<Buffer>;
  /** This reader is done with the chunk; the last to leave an unfinished read stops it. */
  release(): void;
}

const hasBit = (bits: Buffer, n: number) => ((bits[n >> 3] ?? 0) & (1 << (n & 7))) !== 0;

const withBit = (bits: Buffer, n: number, on: boolean) => {
  const out = Buffer.from(bits);
  const mask = 1 << (n & 7);
  out[n >> 3] = on ? (out[n >> 3] ?? 0) | mask : (out[n >> 3] ?? 0) & ~mask;
  return out;
};

async function writeAndSync(path: string, chunk: Uint8Array, offset: number): Promise<void> {
  const file = await openFile(path, constants.O_WRONLY | constants.O_CREAT, 0o600);
  try {
    const { bytesWritten } = await file.write(chunk, 0, chunk.byteLength, offset);
    if (bytesWritten !== chunk.byteLength) throw new Error('a short write');
    await file.datasync();
  } finally {
    await file.close();
  }
}

export class StreamCache {
  private readonly chunkBytes: number;
  private readonly flights = new Map<string, Flight>();
  private readonly uses = new Map<string, number>();
  private readonly changed = new Set<string>();
  /** Bytes between room being made for them and their bit being set. */
  private writing = 0;
  /** How many times each track's file has gone, so a write begun before cannot count after. */
  private readonly forgotten = new Map<string, number>();

  constructor(private readonly opts: StreamCacheOptions) {
    this.chunkBytes = opts.chunkBytes ?? CHUNK_BYTES;
  }

  /** At start: the folder exists, a file with no row goes, and so does a row with no file. */
  prepare(): void {
    const { db, dir } = this.opts;
    mkdirSync(dir, { recursive: true });
    const rows = db.prepare('SELECT id, itag FROM stream_cache').all() as Pick<
      Row,
      'id' | 'itag'
    >[];
    const known = new Set(rows.map((row) => `${row.id}.${row.itag}`));
    const files = readdirSync(dir);
    for (const file of files) {
      if (!known.has(file)) rmSync(join(dir, file), { force: true, recursive: true });
    }
    const present = new Set(files);
    for (const row of rows) {
      if (!present.has(`${row.id}.${row.itag}`)) this.forget(row.id, row.itag);
    }
  }

  /**
   * A client's range of a track. Waits for the range's first chunk to start, its upstream answer's
   * headers checked (or the chunk read from disk), so a track that cannot start is thrown here and
   * never a broken answer. After that a failure errors the body: a stall, a short answer or a
   * network error partway through any chunk, the first one too.
   */
  async open(id: string, range: string | undefined, signal?: AbortSignal): Promise<StreamAnswer> {
    if (!YT_ID.test(id)) throw new StreamFailure('badId');
    if (range !== undefined && !BYTES_RANGE.test(range)) throw new RangeRefused(undefined);

    this.acquire(id);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.release(id);
    };
    const client = new AbortController();
    const leave = () => {
      client.abort();
      finish();
    };
    if (signal?.aborted === true) client.abort();
    else signal?.addEventListener('abort', leave, { once: true });

    let pos: number;
    let last: number;
    let row: Row;
    let current: ChunkReader | null;
    try {
      row = await untilGone(this.rowFor(id), client.signal);
      [pos, last] = spanOf(range, row.size);
      this.opts.db
        .prepare('UPDATE stream_cache SET last_used = ? WHERE id = ?')
        .run(this.opts.now(), id);
      current = await this.chunk(id, Math.floor(pos / this.chunkBytes), client.signal);
    } catch (error) {
      finish();
      throw error;
    }

    const size = row.size;
    const body = new ReadableStream<Uint8Array>(
      {
        pull: async (controller) => {
          try {
            if (client.signal.aborted) throw new StreamFailure('gone');
            const n = Math.floor(pos / this.chunkBytes);
            const base = n * this.chunkBytes;
            current ??= await this.chunk(id, n, client.signal);
            const here = await current.read(pos - base);
            const end = Math.min(pos - base + here.byteLength, last + 1 - base);
            controller.enqueue(here.subarray(0, end - (pos - base)));
            pos = base + end;
            if (end >= current.length) {
              current.release();
              current = null;
            }
            if (pos > last) {
              current?.release();
              current = null;
              finish();
              controller.close();
            }
          } catch (error) {
            current?.release();
            current = null;
            finish();
            controller.error(error);
          }
        },
        cancel: () => {
          current?.release();
          current = null;
          leave();
        },
      },
      { highWaterMark: 0 },
    );

    const length = last - pos + 1;
    const headers: Record<string, string> = {
      'content-type': row.mime,
      'content-length': String(length),
      'accept-ranges': 'bytes',
    };
    if (range === undefined) return { status: 200, headers, body };
    headers['content-range'] = `bytes ${pos}-${last}/${size}`;
    return { status: 206, headers, body };
  }

  /** Keeps a track from eviction, or lets it go again. False when nothing is held for it. */
  pin(id: string, pinned = true): boolean {
    const result = this.opts.db
      .prepare('UPDATE stream_cache SET pinned = ? WHERE id = ?')
      .run(pinned ? 1 : 0, id);
    return result.changes > 0;
  }

  /** The file of a track held whole, with the original stream's bytes; else null. */
  whole(id: string): HeldFile | null {
    const row = this.row(id);
    if (row === undefined) return null;
    const count = Math.ceil(row.size / this.chunkBytes);
    for (let n = 0; n < count; n += 1) {
      if (!hasBit(row.chunks, n)) return null;
    }
    if (!this.fileHolds(row)) return null;
    return { path: this.path(row), mime: row.mime, size: row.size };
  }

  /** Bytes on disk by the table's count. */
  heldBytes(): number {
    const { total } = this.opts.db
      .prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM stream_cache')
      .get() as { total: number };
    return total;
  }

  /** The file on disk reaches the track's last byte. */
  private fileHolds(row: Row): boolean {
    try {
      return statSync(this.path(row)).size >= row.size;
    } catch {
      return false;
    }
  }

  private path(row: Pick<Row, 'id' | 'itag'>): string {
    return join(this.opts.dir, `${row.id}.${row.itag}`);
  }

  private row(id: string): Row | undefined {
    return this.opts.db.prepare('SELECT * FROM stream_cache WHERE id = ?').get(id) as
      Row | undefined;
  }

  private acquire(id: string): void {
    this.uses.set(id, (this.uses.get(id) ?? 0) + 1);
  }

  private release(id: string): void {
    const left = (this.uses.get(id) ?? 1) - 1;
    if (left > 0) {
      this.uses.set(id, left);
      return;
    }
    this.uses.delete(id);
    if (this.changed.delete(id)) {
      const row = this.row(id);
      if (row !== undefined) this.forget(row.id, row.itag);
    }
  }

  private forget(id: string, itag: number): void {
    this.forgotten.set(id, (this.forgotten.get(id) ?? 0) + 1);
    this.opts.db.prepare('DELETE FROM stream_cache WHERE id = ?').run(id);
    rmSync(this.path({ id, itag }), { force: true });
  }

  /** The track's row: for a track new here, its first resolve says what it is. */
  private async rowFor(id: string): Promise<Row> {
    const held = this.row(id);
    if (held !== undefined) return held;
    const source = await this.opts.resolver.resolve(id);
    const size = source.size ?? (await this.sizeOf(source));
    const count = Math.ceil(size / this.chunkBytes);
    this.opts.db
      .prepare(
        `INSERT OR IGNORE INTO stream_cache (id, itag, size, mime, duration, chunks, last_used)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        source.itag,
        size,
        source.mime,
        source.duration,
        Buffer.alloc(Math.ceil(count / 8)),
        this.opts.now(),
      );
    return this.row(id) as Row;
  }

  /** A format that names no size: the answer to its first two bytes does. */
  private async sizeOf(source: StreamSource): Promise<number> {
    const stop = new AbortController().signal;
    const totalOf = async (url: StreamUrl) => {
      const { body, total } = await this.ask(url, 0, 1, stop);
      await body(() => undefined);
      return total;
    };
    try {
      return await totalOf(source.url);
    } catch (error) {
      if (!(error instanceof StreamFailure) || error.reason !== 'refused') throw error;
      const again = await this.opts.resolver.resolve(source.id, { replacing: source.url });
      return totalOf(again.url);
    }
  }

  /**
   * One chunk, ready to read: from disk when held, else a share of the one fetch everyone reading
   * it shares, once its answer has started.
   */
  private async chunk(id: string, n: number, signal: AbortSignal): Promise<ChunkReader> {
    const row = this.row(id);
    if (row === undefined) throw new StreamFailure('changed');
    if (hasBit(row.chunks, n)) {
      const held = await this.readHeld(row, n);
      if (held !== null) {
        return {
          length: held.byteLength,
          read: (from) => Promise.resolve(held.subarray(from)),
          release: () => undefined,
        };
      }
    }
    return this.join(id, n, row, signal);
  }

  /**
   * Joins this chunk's fetch, starting it when none runs. When the last reader leaves before all
   * its bytes are here, the fetch stops and nothing is kept.
   */
  private async join(id: string, n: number, row: Row, signal: AbortSignal): Promise<ChunkReader> {
    if (signal.aborted) throw new StreamFailure('gone');
    const key = `${id}:${n}`;
    const flight = this.flights.get(key) ?? this.fly(key, id, n, row);
    flight.waiters += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener('abort', leave);
      flight.waiters -= 1;
      if (flight.waiters === 0 && !flight.received) {
        if (this.flights.get(key) === flight) this.flights.delete(key);
        flight.stop.abort();
      }
    };
    const leave = () => {
      release();
      for (const wake of flight.wakers) wake();
    };
    signal.addEventListener('abort', leave, { once: true });
    const shown = () => (flight.kept ? flight.got : Math.min(flight.got, flight.length - 1));
    const read = (from: number) =>
      new Promise<Buffer>((resolve, reject) => {
        const check = () => {
          if (signal.aborted) reject(new StreamFailure('gone'));
          else if (shown() > from) resolve(flight.bytes.subarray(from, shown()));
          else if (flight.failure !== null) reject(flight.failure);
          else return;
          flight.wakers.delete(check);
        };
        flight.wakers.add(check);
        check();
      });
    try {
      await untilGone(flight.started, signal);
    } catch (error) {
      release();
      throw error;
    }
    return { length: flight.length, read, release };
  }

  /** Starts a chunk's fetch: its bytes gathered as they come, then kept once all are here. */
  private fly(key: string, id: string, n: number, row: Row): Flight {
    const { length } = this.spanOfChunk(row.size, n);
    const stop = new AbortController();
    let opened!: (body: (onPart: (part: Uint8Array) => void) => Promise<void>) => void;
    let refused!: (error: Error) => void;
    const flight: Flight = {
      bytes: Buffer.alloc(length),
      length,
      got: 0,
      received: false,
      kept: false,
      failure: null,
      wakers: new Set(),
      started: new Promise((resolve, reject) => {
        opened = (body) => {
          resolve();
          void pump(body);
        };
        refused = reject;
      }),
      stop,
      waiters: 0,
    };
    flight.started.catch(() => undefined);
    const wake = () => {
      for (const check of [...flight.wakers]) check();
    };
    const fail = (error: unknown) => {
      flight.failure = error instanceof Error ? error : new StreamFailure('unavailable');
      if (this.flights.get(key) === flight) this.flights.delete(key);
      wake();
    };
    const pump = async (body: (onPart: (part: Uint8Array) => void) => Promise<void>) => {
      try {
        await body((part) => {
          flight.bytes.set(part, flight.got);
          flight.got += part.byteLength;
          wake();
        });
        flight.received = true;
        await this.keep(row, n, flight.bytes);
        flight.kept = true;
      } catch (error) {
        fail(error);
        return;
      } finally {
        wake();
      }
      if (this.flights.get(key) === flight) this.flights.delete(key);
    };
    this.flights.set(key, flight);
    this.openChunk(id, n, row, stop.signal).then(opened, (error: unknown) => {
      fail(error);
      refused(flight.failure!);
    });
    return flight;
  }

  /** Reads a held chunk. One that comes up short is not held after all, and null says so. */
  private async readHeld(row: Row, n: number): Promise<Buffer | null> {
    const { start, length } = this.spanOfChunk(row.size, n);
    const buffer = Buffer.allocUnsafe(length);
    try {
      const file = await openFile(this.path(row), constants.O_RDONLY);
      try {
        const { bytesRead } = await file.read(buffer, 0, length, start);
        if (bytesRead === length) return buffer;
      } finally {
        await file.close();
      }
    } catch {
      // Treated below as a chunk that is not there.
    }
    this.opts.onLog?.('a held chunk could not be read, so it is fetched again');
    const now = this.row(row.id);
    if (now !== undefined && hasBit(now.chunks, n)) {
      this.opts.db
        .prepare('UPDATE stream_cache SET chunks = ?, bytes = bytes - ? WHERE id = ?')
        .run(withBit(now.chunks, n, false), length, row.id);
    }
    return null;
  }

  private spanOfChunk(size: number, n: number): { start: number; length: number } {
    const start = n * this.chunkBytes;
    return { start, length: Math.min(this.chunkBytes, size - start) };
  }

  /**
   * A chunk's upstream answer, its headers checked: what reads its body. A refused URL is resolved
   * once more and asked again; a failure once the body has begun is the body's own.
   */
  private async openChunk(
    id: string,
    n: number,
    row: Row,
    stop: AbortSignal,
  ): Promise<(onPart: (part: Uint8Array) => void) => Promise<void>> {
    const { start, length } = this.spanOfChunk(row.size, n);
    const last = start + length - 1;
    let source = await this.opts.resolver.resolve(id);
    for (let retried = false; ; retried = true) {
      if (stop.aborted) throw new StreamFailure('gone');
      if (source.itag !== row.itag || (source.size !== null && source.size !== row.size)) {
        this.changed.add(id);
        throw new StreamFailure('changed');
      }
      try {
        const { body, total } = await this.ask(source.url, start, last, stop);
        if (total !== row.size) {
          await body(() => undefined).catch(() => undefined);
          this.changed.add(id);
          throw new StreamFailure('changed');
        }
        return body;
      } catch (error) {
        if (error instanceof StreamFailure && error.reason === 'changed') this.changed.add(id);
        if (retried || !(error instanceof StreamFailure) || error.reason !== 'refused') throw error;
        source = await this.opts.resolver.resolve(id, { replacing: source.url });
      }
    }
  }

  /**
   * A closed range of the stream, its answer's headers checked, and what reads its body: each part
   * to `onPart` as it comes, then all of it or a failure, within the chunk's time limit.
   */
  private async ask(
    url: StreamUrl,
    first: number,
    last: number,
    stop: AbortSignal,
  ): Promise<{
    body: (onPart: (part: Uint8Array) => void) => Promise<void>;
    total: number;
  }> {
    const limit = AbortSignal.any([
      stop,
      AbortSignal.timeout(this.opts.chunkTimeoutMs ?? CHUNK_TIMEOUT_MS),
    ]);
    const expected = last - first + 1;
    let file: Awaited<ReturnType<typeof openStream<FileHeaders>>>;
    try {
      file = await openStream(
        this.onStreamHostsOnly(limit),
        url.reveal(),
        {},
        `bytes=${first}-${last}`,
        fileHeadersSchema,
      );
    } catch (error) {
      throw failureOf(error);
    }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(file.headers['content-range'] ?? '');
    if (
      file.status !== 206 ||
      range === null ||
      Number(range[1]) !== first ||
      Number(range[2]) !== last
    ) {
      await file.body.cancel().catch(() => undefined);
      throw new StreamFailure('badAnswer');
    }

    const reader = file.body.getReader();
    const cancel = () => void reader.cancel().catch(() => undefined);
    limit.addEventListener('abort', cancel, { once: true });
    const body = async (onPart: (part: Uint8Array) => void) => {
      try {
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (limit.aborted) throw new StreamFailure(stop.aborted ? 'gone' : 'unavailable');
          if (done) break;
          got += value.byteLength;
          if (got > expected) {
            cancel();
            throw new StreamFailure('badAnswer');
          }
          onPart(value);
        }
        if (got !== expected) throw new StreamFailure('badAnswer');
      } catch (error) {
        if (error instanceof StreamFailure) throw error;
        throw new StreamFailure(stop.aborted ? 'gone' : 'unavailable');
      } finally {
        limit.removeEventListener('abort', cancel);
      }
    };
    return { body, total: Number(range[3]) };
  }

  /** The fetch every ask goes through: a stream host, and a redirect only to another. */
  private onStreamHostsOnly(limit: AbortSignal): FetchLike {
    return async (input, init) => {
      let url = input;
      const signal = init?.signal == null ? limit : AbortSignal.any([init.signal, limit]);
      for (let hops = 0; hops <= MOST_REDIRECTS; hops += 1) {
        if (!isStreamHost(new URL(url))) throw new StreamFailure('offHost');
        const response = await this.opts.fetch(url, { ...init, signal, redirect: 'manual' });
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (location === null || !URL.canParse(location, url)) break;
        url = new URL(location, url).href;
      }
      throw new StreamFailure('offHost');
    };
  }

  /** Writes a whole chunk and sets its bit, room allowing. A failure only costs the keeping. */
  private async keep(row: Row, n: number, bytes: Buffer): Promise<void> {
    if (!this.makeRoom(bytes.byteLength)) {
      this.opts.onLog?.('the stream cache has no room, so a chunk is served without being kept');
      return;
    }
    this.writing += bytes.byteLength;
    const generation = this.forgotten.get(row.id) ?? 0;
    try {
      await (this.opts.writeChunk ?? writeAndSync)(
        this.path(row),
        bytes,
        this.spanOfChunk(row.size, n).start,
      );
      const now = this.row(row.id);
      if ((this.forgotten.get(row.id) ?? 0) !== generation) {
        // The track was evicted meanwhile. Its bit stays unset, whatever row has come since.
        if (now?.itag !== row.itag) rmSync(this.path(row), { force: true });
      } else if (now !== undefined && !hasBit(now.chunks, n)) {
        this.opts.db
          .prepare(
            'UPDATE stream_cache SET chunks = ?, bytes = bytes + ?, last_used = ? WHERE id = ?',
          )
          .run(withBit(now.chunks, n, true), bytes.byteLength, this.opts.now(), row.id);
      }
    } catch {
      this.opts.onLog?.('a chunk could not be written, so it is served without being kept');
    } finally {
      this.writing -= bytes.byteLength;
    }
  }

  /** Evicts until `length` more fits under the cap. False when what is left is pinned or playing. */
  private makeRoom(length: number): boolean {
    const { capBytes, db } = this.opts;
    let used = this.heldBytes() + this.writing;
    if (used + length <= capBytes) return true;
    const oldestFirst = db
      .prepare(
        'SELECT id, itag, bytes FROM stream_cache WHERE pinned = 0 ORDER BY last_used, rowid',
      )
      .all() as Pick<Row, 'id' | 'itag' | 'bytes'>[];
    for (const row of oldestFirst) {
      if (this.uses.has(row.id)) continue;
      this.forget(row.id, row.itag);
      used -= row.bytes;
      if (used + length <= capBytes) return true;
    }
    return false;
  }
}

/** The work's answer, or `gone` as soon as the client leaves; the work itself carries on. */
function untilGone<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const leave = () => reject(new StreamFailure('gone'));
    if (signal.aborted) leave();
    else signal.addEventListener('abort', leave, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', leave));
  });
}

/** The first and last byte a checked range asks of a file of `size`, or a refusal naming the size. */
function spanOf(range: string | undefined, size: number): [number, number] {
  if (range === undefined) return [0, size - 1];
  const match = BYTES_RANGE.exec(range);
  if (match === null) throw new RangeRefused(size);
  const [, from, to, suffix] = match;
  if (suffix !== undefined) {
    const count = Number(suffix);
    if (count === 0) throw new RangeRefused(size);
    return [Math.max(0, size - count), size - 1];
  }
  const first = Number(from);
  const last = to === '' || to === undefined ? size - 1 : Math.min(Number(to), size - 1);
  if (first >= size || first > last) throw new RangeRefused(size);
  return [first, last];
}

/** An upstream failure as a reason, with its cause left behind: a cause can name the URL's host. */
function failureOf(error: unknown): StreamFailure {
  if (error instanceof StreamFailure) return error;
  if (error instanceof AdapterError && error.cause instanceof StreamFailure) return error.cause;
  if (error instanceof RangeNotSatisfiable) return new StreamFailure('changed');
  if (error instanceof AdapterError) {
    if (error.kind === 'parse') return new StreamFailure('notAudio');
    if (error.status === 401 || error.status === 403 || error.status === 410) {
      return new StreamFailure('refused');
    }
  }
  return new StreamFailure('unavailable');
}
