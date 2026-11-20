/**
 * Hydration on open, ported from the old podcast-stubs daemon (fanotify_daemon.py): every open on
 * the media filesystem waits for an answer, and a stub's open is answered only once its enclosure's
 * audio fills the file.
 *
 * The decision, per open, allowing at the first match:
 *
 * 1. the opener is this process (its own opens would wait on itself) → allow;
 * 2. `STUBS_MODE=passive`, or a pause marker younger than 2 hours → allow;
 * 3. no `user.absstub.url` on the event's file descriptor → allow (hydrated, or never a stub);
 * 4. otherwise → hydrate through that descriptor, then allow.
 *
 * Steps 1 to 3 are answered at once, on the reader's own turn, so no open ever queues behind a
 * download. Hydrations run in a pool of 8. Every error allows, and so does the 300 s deadline: an
 * open never fails and never hangs because of this process. Decisions and writes go through the
 * descriptor the kernel handed over, never a path, which would name the opener's mount namespace.
 *
 * Nothing here may open a file on the marked filesystem synchronously: the main thread would wait
 * for an answer only it can give.
 */
import {
  closeSync,
  fstatSync,
  fstat as fstatCallback,
  ftruncate as ftruncateCallback,
  readlinkSync,
  statSync,
  write as writeCallback,
} from 'node:fs';
import { promisify } from 'node:util';
import type { EnclosureFetch } from '../adapters/http/publicFetch.js';
import { DEFAULT_PREFIX, XATTR } from './format.js';
import {
  FAN_ALLOW,
  type FanotifyEvent,
  fgetxattr,
  fremovexattr,
  fsetxattr,
  punchHole,
} from './libc.js';

const fstat = promisify(fstatCallback);
const ftruncate = promisify(ftruncateCallback);
const write = promisify(writeCallback);

/** An open waits at most this long for its hydration; past it, it is allowed as a stub. */
export const HYDRATE_TIMEOUT_MS = 300_000;
/** A pause marker older than this was left by a run that died; hydration resumes. */
export const PAUSE_MARKER_MAX_AGE_MS = 2 * 3600 * 1000;
export const HYDRATE_WORKERS = 8;
/** A stub this full on disk finished downloading before its attributes were flipped. */
const ALLOCATED_AS_WHOLE = 0.98;

/**
 * One lock per inode, shared by hydration and dehydration, so the two never touch the same file at
 * once and two opens of one stub (a probe and a player) share one download.
 */
export class InodeLocks {
  readonly #tails = new Map<string, Promise<unknown>>();

  /** Runs `work` once every earlier holder of `key` is done. */
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.#tails.get(key) ?? Promise.resolve();
    const result = before.then(work, work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return result;
  }
}

/** The lock key of a file: its device and inode, the same from any mount namespace. */
export const inodeKey = (st: { dev: number | bigint; ino: number | bigint }) =>
  `${st.dev}:${st.ino}`;

/** At most `size` tasks at once; the rest wait in order. */
class Pool {
  #running = 0;
  readonly #waiting: (() => void)[] = [];
  constructor(readonly size: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#running >= this.size) {
      await new Promise<void>((start) => this.#waiting.push(start));
    } else this.#running++;
    try {
      return await task();
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#running--;
    }
  }
}

/** Host and file name only: a premium feed's enclosure carries the subscriber's token. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/.../${parsed.pathname.split('/').at(-1) ?? ''}`;
  } catch {
    return '<unparsed url>';
  }
}

export interface HydratorOptions {
  /** This process: its own opens are allowed at once. */
  readonly ownPid: number;
  /** Answers a permission event on the fanotify group. */
  readonly respond: (fd: number, answer: number) => void;
  readonly fetchEnclosure: EnclosureFetch;
  /** `STUBS_MODE`; `passive` allows every open. */
  readonly mode?: string | undefined;
  /** The pause marker's path, `/control/pause-hydration` in the sidecar. */
  readonly pauseMarker: string;
  readonly locks?: InodeLocks;
  readonly workers?: number;
  readonly timeoutMs?: number;
  /** Epoch milliseconds. */
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

export type HydrateOutcome = 'hydrated' | 'already' | 'finished' | 'failed';

export class Hydrator {
  readonly #options: HydratorOptions;
  readonly #locks: InodeLocks;
  readonly #pool: Pool;
  readonly #inFlight = new Set<Promise<void>>();
  readonly #now: () => number;
  readonly #log: (line: string) => void;

  constructor(options: HydratorOptions) {
    this.#options = options;
    this.#locks = options.locks ?? new InodeLocks();
    this.#pool = new Pool(options.workers ?? HYDRATE_WORKERS);
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? ((line) => process.stderr.write(`${line}\n`));
  }

  /** The locks hydration holds, for dehydration to share. */
  get locks(): InodeLocks {
    return this.#locks;
  }

  /** Every hydration started so far has answered its open and closed its descriptor. */
  async settled(): Promise<void> {
    while (this.#inFlight.size > 0) await Promise.allSettled([...this.#inFlight]);
  }

  /** Whether opens are allowed without hydrating: the passive switch, or a fresh pause marker. */
  isPaused(): boolean {
    if (this.#options.mode?.trim().toLowerCase() === 'passive') return true;
    let age: number;
    try {
      age = this.#now() - statSync(this.#options.pauseMarker).mtimeMs;
    } catch {
      return false;
    }
    if (age > PAUSE_MARKER_MAX_AGE_MS) {
      this.#log(
        `stubs: pause marker is ${Math.round(age / 1000)} s old, left by a run that died; hydrating`,
      );
      return false;
    }
    return true;
  }

  /** Decides one open. Never throws, and never waits: a hydration runs on its own. */
  handle(event: FanotifyEvent): void {
    try {
      if (event.pid === this.#options.ownPid || this.isPaused()) return this.#allow(event.fd);
      const url = fgetxattr(event.fd, XATTR.url);
      if (url === null) return this.#allow(event.fd);
      this.#startHydration(event.fd, url);
    } catch (error) {
      this.#log(`stubs: deciding an open failed, allowing: ${String(error)}`);
      this.#allow(event.fd);
    }
  }

  #answer(fd: number): void {
    try {
      this.#options.respond(fd, FAN_ALLOW);
    } catch {
      // The opener is gone; nothing waits.
    }
  }

  #close(fd: number): void {
    try {
      closeSync(fd);
    } catch {
      // Already closed.
    }
  }

  #allow(fd: number): void {
    this.#answer(fd);
    this.#close(fd);
  }

  #startHydration(fd: number, url: string): void {
    const controller = new AbortController();
    let answered = false;
    const answerOnce = () => {
      if (answered) return;
      answered = true;
      this.#answer(fd);
    };
    const timeoutMs = this.#options.timeoutMs ?? HYDRATE_TIMEOUT_MS;
    const timer = setTimeout(() => {
      this.#log(`stubs: hydration passed ${timeoutMs / 1000} s, allowing ${pathOf(fd)} as a stub`);
      controller.abort(new Error('hydration timed out'));
      answerOnce();
    }, timeoutMs);
    const task: Promise<void> = this.#pool
      .run(() => this.hydrate(fd, url, controller.signal))
      .then(() => undefined)
      .catch((error: unknown) => {
        this.#log(`stubs: hydrating ${pathOf(fd)} failed, allowing: ${String(error)}`);
      })
      .finally(() => {
        clearTimeout(timer);
        answerOnce();
        // Closed only once nothing writes through it: a reused number would take the writes.
        this.#close(fd);
        this.#inFlight.delete(task);
      });
    this.#inFlight.add(task);
  }

  /**
   * Fills a stub from its enclosure through `fd`, under the inode's lock. A short or failed
   * download leaves it a stub (what it wrote past the prefix freed again), to retry on the next
   * open. Exported for dehydration's tests and the prefetch, which go through the same lock.
   */
  async hydrate(fd: number, url: string, signal: AbortSignal): Promise<HydrateOutcome> {
    const st = await fstat(fd, { bigint: true });
    return this.#locks.run(inodeKey(st), async () => {
      signal.throwIfAborted();
      // Another open of the same inode may have hydrated it while this one waited.
      const current = fgetxattr(fd, XATTR.url);
      if (current === null) return 'already';
      const declared = intOrNull(fgetxattr(fd, XATTR.length));
      const now = await fstat(fd);
      if (declared !== null && now.blocks * 512 >= declared * ALLOCATED_AS_WHOLE) {
        this.#log(`stubs: ${pathOf(fd)} is whole but still tagged a stub; finishing its tags`);
        finishTags(fd, current, declared, this.#now());
        return 'finished';
      }

      this.#log(`stubs: hydrating ${pathOf(fd)} from ${redactUrl(current)}`);
      let total = 0;
      try {
        const response = await this.#options.fetchEnclosure(current, { signal });
        if (response.status !== 200 || response.body === null) {
          await response.body?.cancel();
          throw new Error(`the enclosure answered ${response.status}`);
        }
        const expectedHeader = response.headers.get('content-length');
        const expected =
          expectedHeader !== null && /^\d+$/.test(expectedHeader) ? Number(expectedHeader) : null;
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          signal.throwIfAborted();
          for (let at = 0; at < chunk.byteLength;) {
            const { bytesWritten } = await write(fd, chunk, at, chunk.byteLength - at, total + at);
            at += bytesWritten;
          }
          total += chunk.byteLength;
        }
        // A dropped connection ends the body early without an error.
        if (expected !== null && total !== expected) {
          throw new Error(`short download: ${total} of ${expected} bytes`);
        }
        await ftruncate(fd, total);
      } catch (error) {
        unwriteBeyondPrefix(fd);
        throw error;
      }
      if (declared !== null && total !== declared) {
        this.#log(`stubs: ${pathOf(fd)} declared ${declared} bytes, received ${total}; kept`);
      }
      finishTags(fd, current, total, this.#now());
      this.#log(`stubs: hydrated ${pathOf(fd)} (${total} bytes)`);
      return 'hydrated';
    });
  }
}

function intOrNull(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The stub's prefix length; a dehydrated adopted file has none, and 128 KB stands in, as before. */
function prefixOf(fd: number): number {
  return intOrNull(fgetxattr(fd, XATTR.prefixLen)) ?? DEFAULT_PREFIX;
}

/**
 * Frees what a failed download wrote past the prefix, so the next open's whole-file check cannot
 * take a partial file for a finished one.
 */
function unwriteBeyondPrefix(fd: number): void {
  try {
    const prefix = prefixOf(fd);
    const size = fstatSync(fd).size;
    if (size > prefix) punchHole(fd, prefix, size - prefix);
  } catch {
    // Best effort: the file stays tagged a stub either way.
  }
}

/**
 * Marks a stub hydrated: `orig_*` and `hydrated_at` first, `url` and `length` removed last, so a
 * crash between leaves a whole file still tagged a stub, which the next open finishes.
 */
function finishTags(fd: number, url: string, length: number, now: number): void {
  fsetxattr(fd, XATTR.origUrl, url);
  fsetxattr(fd, XATTR.origLength, String(length));
  fsetxattr(fd, XATTR.origPrefix, String(prefixOf(fd)));
  fsetxattr(fd, XATTR.hydratedAt, String(Math.floor(now / 1000)));
  fremovexattr(fd, XATTR.url);
  fremovexattr(fd, XATTR.length);
}

/** The file's path as this process sees it, for logs only. */
function pathOf(fd: number): string {
  try {
    return readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return `<fd ${fd}>`;
  }
}
