/**
 * A streamed song's bytes, proxied through a capped disk cache. Whatever a client's range, the
 * upstream is only ever asked closed ranges of one aligned chunk, because an open-ended range is
 * paced to about twice the audio's rate (checked live). Each chunk is held in full before it counts:
 * its bit is set once all its bytes are on disk, so a crash or a short answer costs only that chunk.
 * A track fully held needs no resolve and no fetch, and plays with streaming down.
 *
 * Only stream hosts are asked, and a redirect is followed only to another. An answer that is not
 * audio is refused. A refused URL is resolved once more and tried again, so one that expires
 * mid-song does not end it. When the last client waiting on a chunk leaves, its upstream read stops.
 *
 * Held bytes plus bytes being written never pass the cap: room is made before a write, by evicting
 * the least recently used tracks that are neither pinned nor being played, and with no room the
 * chunk is served without being kept, as it is when the disk is full.
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { constants, open as openFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { fileHeadersSchema, openStream, RangeNotSatisfiable } from '../adapters/stream.js';
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

interface Flight {
  done: Promise<Buffer>;
  stop: AbortController;
  waiters: number;
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
    await file.write(chunk, 0, chunk.byteLength, offset);
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
   * A client's range of a track. Waits for the range's first chunk, so a track that cannot start is
   * thrown here and never a broken answer; after that a failure errors the body.
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
    let pending: Buffer | null;
    try {
      row = await this.rowFor(id);
      [pos, last] = spanOf(range, row.size);
      this.opts.db
        .prepare('UPDATE stream_cache SET last_used = ? WHERE id = ?')
        .run(this.opts.now(), id);
      pending = await this.chunk(id, Math.floor(pos / this.chunkBytes), client.signal);
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
            const chunk = pending ?? (await this.chunk(id, n, client.signal));
            pending = null;
            const base = n * this.chunkBytes;
            const end = Math.min(chunk.byteLength, last + 1 - base);
            controller.enqueue(chunk.subarray(pos - base, end));
            pos = base + end;
            if (pos > last) {
              finish();
              controller.close();
            }
          } catch (error) {
            finish();
            controller.error(error);
          }
        },
        cancel: leave,
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
    return { path: this.path(row), mime: row.mime, size: row.size };
  }

  /** Bytes on disk by the table's count. */
  heldBytes(): number {
    const { total } = this.opts.db
      .prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM stream_cache')
      .get() as { total: number };
    return total;
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
    const stop = new AbortController();
    const { total } = await this.ask(source.url, 0, 1, stop.signal);
    return total;
  }

  /** One chunk's bytes: from disk when held, else from the one fetch everyone waiting shares. */
  private async chunk(id: string, n: number, signal: AbortSignal): Promise<Buffer> {
    const row = this.row(id);
    if (row === undefined) throw new StreamFailure('changed');
    if (hasBit(row.chunks, n)) {
      const held = await this.readHeld(row, n);
      if (held !== null) return held;
    }
    return this.join(id, n, signal);
  }

  /** Joins this chunk's fetch. When the last one waiting leaves, the fetch stops. */
  private join(id: string, n: number, signal: AbortSignal): Promise<Buffer> {
    if (signal.aborted) return Promise.reject(new StreamFailure('gone'));
    const key = `${id}:${n}`;
    let flight = this.flights.get(key);
    if (flight === undefined) {
      const stop = new AbortController();
      const started: Flight = {
        stop,
        waiters: 0,
        done: this.fetchChunk(id, n, stop.signal).finally(() => {
          if (this.flights.get(key) === started) this.flights.delete(key);
        }),
      };
      flight = started;
      this.flights.set(key, started);
    }
    const shared = flight;
    shared.waiters += 1;
    return new Promise((resolve, reject) => {
      const leave = () => {
        shared.waiters -= 1;
        if (shared.waiters === 0) {
          if (this.flights.get(key) === shared) this.flights.delete(key);
          shared.stop.abort();
        }
        reject(new StreamFailure('gone'));
      };
      signal.addEventListener('abort', leave, { once: true });
      shared.done.then(
        (chunk) => {
          signal.removeEventListener('abort', leave);
          shared.waiters -= 1;
          resolve(chunk);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', leave);
          shared.waiters -= 1;
          reject(error instanceof Error ? error : new StreamFailure('unavailable'));
        },
      );
    });
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

  private async fetchChunk(id: string, n: number, stop: AbortSignal): Promise<Buffer> {
    const row = this.row(id);
    if (row === undefined) throw new StreamFailure('changed');
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
        const { bytes, total } = await this.ask(source.url, start, last, stop);
        if (total !== row.size) {
          this.changed.add(id);
          throw new StreamFailure('changed');
        }
        await this.keep(row, n, bytes);
        return bytes;
      } catch (error) {
        if (retried || !(error instanceof StreamFailure) || error.reason !== 'refused') throw error;
        source = await this.opts.resolver.resolve(id, { replacing: source.url });
      }
    }
  }

  /** A closed range of the stream, all of it or a failure, within the chunk's time limit. */
  private async ask(
    url: StreamUrl,
    first: number,
    last: number,
    stop: AbortSignal,
  ): Promise<{ bytes: Buffer; total: number }> {
    const limit = AbortSignal.any([
      stop,
      AbortSignal.timeout(this.opts.chunkTimeoutMs ?? CHUNK_TIMEOUT_MS),
    ]);
    const expected = last - first + 1;
    let file: Awaited<ReturnType<typeof openStream>>;
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
    try {
      const parts: Uint8Array[] = [];
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
        parts.push(value);
      }
      if (got !== expected) throw new StreamFailure('badAnswer');
      return { bytes: Buffer.concat(parts, got), total: Number(range[3]) };
    } catch (error) {
      if (error instanceof StreamFailure) throw error;
      throw new StreamFailure(stop.aborted ? 'gone' : 'unavailable');
    } finally {
      limit.removeEventListener('abort', cancel);
    }
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
    try {
      await (this.opts.writeChunk ?? writeAndSync)(
        this.path(row),
        bytes,
        this.spanOfChunk(row.size, n).start,
      );
      const now = this.row(row.id);
      if (now !== undefined && !hasBit(now.chunks, n)) {
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
