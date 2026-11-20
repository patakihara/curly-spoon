/**
 * The stub format, ported unchanged from mediaserver's old podcast-stubs (stubgen.py,
 * stub_reconcile.py, fanotify_daemon.py), so every file they left is valid here with nothing
 * rewritten.
 *
 * - A **stub** is a real prefix of the enclosure followed by a hole out to its true length. It
 *   carries `url`, `length` and `prefix_len`.
 * - A **hydrated** file holds the whole episode. It carries `orig_url`, `orig_length`,
 *   `orig_prefix` and `hydrated_at` (seconds); `url` and `length` are gone. An adopted file (one
 *   Audiobookshelf downloaded itself) looks the same, with `hydrated_at` its mtime.
 * - `keep` (any value) exempts a file from dehydration for good.
 *
 * Writing an attribute never moves a file's mtime or atime: Audiobookshelf's watcher would take it
 * for a change, rescan, and the stub would hydrate and dehydrate for ever.
 */
import { open } from 'node:fs/promises';
import {
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getxattr, punchHole, removexattr, setTimesNs, setxattr } from './libc.js';

/** The attribute names, exactly as the old daemon wrote them. */
export const XATTR = {
  url: 'user.absstub.url',
  length: 'user.absstub.length',
  prefixLen: 'user.absstub.prefix_len',
  origUrl: 'user.absstub.orig_url',
  origLength: 'user.absstub.orig_length',
  origPrefix: 'user.absstub.orig_prefix',
  hydratedAt: 'user.absstub.hydrated_at',
  keep: 'user.absstub.keep',
} as const;

/** The first ranged read; it doubles until an Xing or Info header shows, up to MAX_PREFIX. */
export const DEFAULT_PREFIX = 128 * 1024;
export const MAX_PREFIX = 2 * 1024 * 1024;
/** A hydrated file returns to a stub once it has been whole this long. */
export const DEHYDRATE_AFTER_MS = 7 * 24 * 3600 * 1000;
/** An unfinished listen pins its file hydrated only while it was updated this recently. */
export const PROGRESS_PIN_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const PARTIAL_SUFFIX = '.stub-partial';
const RETRY_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 5;

/** What the stub attributes on a path say it is. */
export type StubState =
  | { kind: 'stub'; url: string; length: number | null; prefixLen: number | null }
  | {
      kind: 'hydrated';
      origUrl: string | null;
      origLength: number | null;
      origPrefix: number | null;
      hydratedAt: number | null;
      keep: boolean;
    }
  | { kind: 'plain' };

function readInt(path: string, name: string): number | null {
  const value = getxattr(path, name);
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Reads a file's stub attributes, writing nothing. */
export function readStubState(path: string): StubState {
  const url = getxattr(path, XATTR.url);
  if (url !== null) {
    return {
      kind: 'stub',
      url,
      length: readInt(path, XATTR.length),
      prefixLen: readInt(path, XATTR.prefixLen),
    };
  }
  const origUrl = getxattr(path, XATTR.origUrl);
  const hydratedAt = readInt(path, XATTR.hydratedAt);
  if (origUrl === null && hydratedAt === null) return { kind: 'plain' };
  return {
    kind: 'hydrated',
    origUrl,
    origLength: readInt(path, XATTR.origLength),
    origPrefix: readInt(path, XATTR.origPrefix),
    hydratedAt,
    keep: getxattr(path, XATTR.keep) !== null,
  };
}

/** A stub is any file with `url`: opening it hydrates it. */
export function isStub(path: string): boolean {
  return getxattr(path, XATTR.url) !== null;
}

/** A file the stubs already know: a stub, a hydrated stub, or an adopted download. */
export function isKnown(path: string): boolean {
  return getxattr(path, XATTR.url) !== null || getxattr(path, XATTR.origUrl) !== null;
}

/** One ranged read's answer: `bytes=0-<end>` asked; a server ignoring Range answers 200. */
export interface RangeAnswer {
  readonly status: number;
  readonly contentRange: string | null;
  readonly body: Uint8Array;
}

/** Reads `bytes=0-<end>` of an enclosure; the caller guards every hop and caps the body. */
export type RangeGet = (url: string, end: number) => Promise<RangeAnswer>;

export interface WriteStubOptions {
  /** The episode's final path; the folder is made if missing. */
  readonly path: string;
  readonly url: string;
  /** The feed's `enclosure length`, used only when the answer gives no total. */
  readonly declaredLength: number | null;
  readonly rangeGet: RangeGet;
  /** Waits between retries of a 429 or 503 (2 s, doubling); injected so tests do not wait. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface StubWritten {
  readonly path: string;
  readonly length: number;
  readonly prefixLen: number;
}

function hasXingOrInfo(body: Uint8Array): boolean {
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  return bytes.includes('Xing') || bytes.includes('Info');
}

function totalFrom(contentRange: string | null): number | null {
  const total = contentRange?.split('/').at(-1);
  if (total === undefined || total === '*' || !/^\d+$/.test(total.trim())) return null;
  return Number(total);
}

async function rangeWithRetry(options: WriteStubOptions, prefixSize: number): Promise<RangeAnswer> {
  const sleep = options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  let delay = 2000;
  for (let attempt = 1; ; attempt++) {
    const answer = await options.rangeGet(options.url, prefixSize - 1);
    if (answer.status === 200 || answer.status === 206) return answer;
    if (!RETRY_STATUSES.has(answer.status) || attempt >= MAX_ATTEMPTS) {
      throw new Error(`ranged read answered ${answer.status}`);
    }
    await sleep(delay);
    delay *= 2;
  }
}

/** The hidden, non-audio name a stub is written under, so ABS's watcher never takes it up. */
export function partialPath(path: string): string {
  return join(dirname(path), `.${basename(path)}${PARTIAL_SUFFIX}`);
}

/**
 * Writes a stub: a prefix grown from 128 KB until it holds an Xing or Info header (at most 2 MB),
 * then a hole out to the true length from `Content-Range`. It is written under a hidden partial
 * name, tagged, then renamed into place, so the final name only ever holds a fully tagged stub; on
 * any error the partial is removed and the error thrown.
 */
export async function writeStub(options: WriteStubOptions): Promise<StubWritten> {
  let prefixSize = DEFAULT_PREFIX;
  let answer: RangeAnswer;
  for (;;) {
    answer = await rangeWithRetry(options, prefixSize);
    if (hasXingOrInfo(answer.body) || prefixSize >= MAX_PREFIX) break;
    prefixSize *= 2;
  }
  const body = answer.body;
  const length = totalFrom(answer.contentRange) ?? options.declaredLength ?? body.byteLength;

  mkdirSync(dirname(options.path), { recursive: true });
  const partial = partialPath(options.path);
  try {
    // Opened off the main thread: in the sidecar, this process answers its own opens.
    const file = await open(partial, 'w');
    try {
      for (let at = 0; at < body.byteLength;) {
        at += (await file.write(body, at, body.byteLength - at)).bytesWritten;
      }
      if (length > body.byteLength) await file.truncate(length);
    } finally {
      await file.close();
    }
    setxattr(partial, XATTR.url, options.url);
    setxattr(partial, XATTR.length, String(length));
    setxattr(partial, XATTR.prefixLen, String(body.byteLength));
    // rename keeps the inode, so the attributes, and is no open: the hydrator never sees it.
    renameSync(partial, options.path);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  return { path: options.path, length, prefixLen: body.byteLength };
}

function restoreTimes(path: string, before: { atimeNs: bigint; mtimeNs: bigint }): void {
  setTimesNs(path, before.atimeNs, before.mtimeNs);
}

/**
 * Brings a whole file Audiobookshelf downloaded itself into the dehydration cycle without reading
 * it: `orig_*` from its size, `hydrated_at` from its mtime, its times kept. A file already a stub,
 * hydrated or adopted is left exactly as it is; the answer says whether anything was written.
 */
export function adoptFile(path: string, enclosureUrl: string): boolean {
  if (isKnown(path)) return false;
  const st = statSync(path, { bigint: true });
  setxattr(path, XATTR.origUrl, enclosureUrl);
  setxattr(path, XATTR.origLength, String(st.size));
  setxattr(path, XATTR.origPrefix, String(DEFAULT_PREFIX));
  setxattr(path, XATTR.hydratedAt, String(st.mtimeNs / 1_000_000_000n));
  restoreTimes(path, st);
  return true;
}

/** One person's progress on the episode a file holds, as Audiobookshelf reports it. */
export interface ProgressRow {
  readonly isFinished: boolean;
  /** Seconds listened. */
  readonly currentTime: number;
  /** Epoch milliseconds; null when unknown, which pins (fail safe). */
  readonly updatedAt: number | null;
}

/** Whether anyone is part-way through the episode, updated within the last 7 days. */
export function progressPins(rows: readonly ProgressRow[], now: number): boolean {
  return rows.some(
    (row) =>
      !row.isFinished &&
      row.currentTime > 0 &&
      (row.updatedAt === null || now - row.updatedAt <= PROGRESS_PIN_MAX_AGE_MS),
  );
}

/**
 * Whether any process this one can see holds the file open, by `/proc/<pid>/fd`. Any doubt
 * answers yes. Only processes in this process's pid namespace are seen.
 */
export function hasOpenFd(path: string): boolean {
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return true;
  }
  let pids: string[];
  try {
    pids = readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return true;
  }
  for (const pid of pids) {
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (readlinkSync(`/proc/${pid}/fd/${fd}`) === real) return true;
      } catch {
        // The fd closed while we looked.
      }
    }
  }
  return false;
}

export interface DehydrateCheck {
  /** Epoch milliseconds. */
  readonly now: number;
  /** Every person's progress on the episode this file holds. */
  readonly progress: readonly ProgressRow[];
  readonly hasOpenFd?: (path: string) => boolean;
}

export type DehydrateOutcome =
  | 'dehydrated'
  | 'not-hydrated'
  | 'too-recent'
  | 'kept'
  | 'open'
  | 'in-progress'
  | 'missing-orig'
  | 'smaller-than-prefix';

/**
 * Returns a hydrated file to a stub once it has been whole 7 days, unless it is kept, open, or
 * someone listened part-way within 7 days: the blocks after `orig_prefix` are freed (the size and
 * the prefix stay), `url` and `length` come back, `hydrated_at` goes, and the times are restored.
 * The caller holds the file's inode lock, shared with hydration (`InodeLocks` in hydrator.ts).
 */
export async function dehydrateIfDue(
  path: string,
  check: DehydrateCheck,
): Promise<DehydrateOutcome> {
  const isOpen = check.hasOpenFd ?? hasOpenFd;
  const hydratedAtRaw = getxattr(path, XATTR.hydratedAt);
  const hydratedAt = hydratedAtRaw === null ? NaN : Number(hydratedAtRaw);
  if (!Number.isFinite(hydratedAt)) return 'not-hydrated';
  if (check.now - hydratedAt * 1000 < DEHYDRATE_AFTER_MS) return 'too-recent';
  if (getxattr(path, XATTR.keep) !== null) return 'kept';
  if (isOpen(path)) return 'open';
  if (progressPins(check.progress, check.now)) return 'in-progress';

  const origUrl = getxattr(path, XATTR.origUrl);
  const origLength = readInt(path, XATTR.origLength);
  const origPrefix = readInt(path, XATTR.origPrefix);
  if (origUrl === null || origLength === null || origPrefix === null) return 'missing-orig';

  const st = statSync(path, { bigint: true });
  const size = Number(st.size);
  if (size < origPrefix) return 'smaller-than-prefix';
  // A player may have opened it since the first look; looking again narrows that window.
  if (isOpen(path)) return 'open';

  // Opened off the main thread: in the sidecar, this process answers its own opens.
  const file = await open(path, 'r+');
  try {
    if (size > origPrefix) punchHole(file.fd, origPrefix, size - origPrefix);
  } finally {
    await file.close();
  }
  setxattr(path, XATTR.url, origUrl);
  setxattr(path, XATTR.length, String(origLength));
  removexattr(path, XATTR.hydratedAt);
  restoreTimes(path, st);
  return 'dehydrated';
}
