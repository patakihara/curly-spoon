/**
 * The canary: whether an extractor binary still gets a known track, as a real play would. It finds
 * the track by search, resolves it through both tiers with that binary, asks a closed range of about
 * twenty seconds' bytes, and reads their container: exactly one track, audio, Opus, with at least ten
 * seconds of it in whole packets. An MP4 answer passes on its file type alone, having no such walk.
 * Reasons stay apart, because only some say an update could help; `unavailable` means the network
 * failed, and so is no result at all. Given the direct resolve, it checks that too, the same way and
 * apart, as `direct`: the extractor's result alone decides a version, and `direct` says whether the
 * one HTTP call still answers plays ahead of it.
 */
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { fileHeadersSchema, openStream, type FileHeaders } from '../adapters/stream.js';
import type { DirectResolve } from './direct.js';
import { Extractor, ExtractorFailure, type SpawnLike, type Tier } from './extractor.js';
import { InfoRefused, pickFormat, PlayerRefused, type StreamUrl } from './schemas.js';

export type CanaryReason =
  /** A bot wall. No update can help. */
  | 'blocked'
  | 'noAudio'
  | 'extractorError'
  /** The stream host refused the URL, or its bytes are not one audio track. */
  | 'streamRefused'
  /** Search no longer parses to the known track. */
  | 'searchShape'
  /** The network failed. No result. */
  | 'unavailable';

/** What one way of resolving gave: bytes of one audio track, or why not. */
export type CanaryCheck =
  | { passed: true; ms: number; bytes: number; codec: string }
  | { passed: false; reason: CanaryReason; ms: number };

export type CanaryResult = (
  | { passed: true; tier: Tier; ms: number; bytes: number; codec: string }
  | { passed: false; reason: CanaryReason; ms: number }
) & {
  /** The direct resolve's own result, when it was asked. */
  direct?: CanaryCheck;
};

export type Canary = (path: string) => Promise<CanaryResult>;

export interface CanaryOptions {
  search: (query: string) => Promise<{ id: string }[]>;
  fetch: FetchLike;
  home: string;
  now: () => number;
  id: string;
  query: string;
  spawn?: SpawnLike;
  kill?: (pid: number) => void;
  timeoutMs?: number;
  /** YouTube's player, checked apart from the extractor. */
  direct?: DirectResolve;
}

/** Twenty seconds' bytes at the rate of a file of this size and length, within reason. */
const CANARY_MS = 60_000;
const FEWEST_BYTES = 64 * 1024;
const MOST_BYTES = 4 * 1024 * 1024;

export function canaryBytes(size: number | null, duration: number): number {
  const wanted = size === null ? MOST_BYTES / 8 : Math.ceil((size / duration) * 20);
  const within = Math.min(Math.max(wanted, FEWEST_BYTES), MOST_BYTES);
  return size === null ? within : Math.min(within, size);
}

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const AUDIO_TRACK = 2;
const CLUSTER = 0x1f43b675;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
/** What a passing canary must have read, of the twenty seconds it asks. */
const LEAST_SECONDS = 10;

interface Element {
  id: number;
  start: number;
  end: number;
}

/** The EBML elements directly in `bytes[from, to)`. An element running past the bytes is cut there. */
function* elements(bytes: Uint8Array, from: number, to: number): Generator<Element> {
  let at = from;
  while (at < to) {
    const first = bytes[at] ?? 0;
    const idLength = Math.clz32(first) - 23;
    if (idLength < 1 || idLength > 4 || at + idLength >= to) return;
    let id = 0;
    for (let i = 0; i < idLength; i += 1) id = id * 256 + (bytes[at + i] ?? 0);
    at += idLength;
    const head = bytes[at] ?? 0;
    const sizeLength = Math.clz32(head) - 23;
    if (sizeLength < 1 || sizeLength > 8 || at + sizeLength > to) return;
    let size = head & (0xff >> sizeLength);
    let unknown = size === 0xff >> sizeLength;
    for (let i = 1; i < sizeLength; i += 1) {
      const byte = bytes[at + i] ?? 0;
      unknown &&= byte === 0xff;
      size = size * 256 + byte;
    }
    at += sizeLength;
    const end = unknown ? to : Math.min(at + size, to);
    yield { id, start: at, end };
    at = end;
  }
}

const child = (bytes: Uint8Array, parent: Element, id: number) =>
  [...elements(bytes, parent.start, parent.end)].find((element) => element.id === id);

/** The one audio track's codec in a WebM head, or null unless that is exactly what it holds. */
export function webmAudioCodec(bytes: Uint8Array): string | null {
  const top = [...elements(bytes, 0, bytes.length)];
  const segment = top.find((element) => element.id === SEGMENT);
  if (top[0]?.id !== EBML || segment === undefined) return null;
  const tracks = child(bytes, segment, TRACKS);
  if (tracks === undefined) return null;
  const entries = [...elements(bytes, tracks.start, tracks.end)].filter(
    (element) => element.id === TRACK_ENTRY,
  );
  if (entries.length !== 1) return null;
  const type = child(bytes, entries[0]!, TRACK_TYPE);
  const codec = child(bytes, entries[0]!, CODEC_ID);
  if (type === undefined || codec === undefined || bytes[type.start] !== AUDIO_TRACK) return null;
  const name = Buffer.from(bytes.subarray(codec.start, codec.end)).toString('latin1');
  return name === 'A_OPUS' ? name : null;
}

/** One frame's length by an Opus packet's configuration, in tenths of a millisecond (RFC 6716, 3.1). */
const opusFrameTenths = (config: number) => {
  if (config < 12) return [100, 200, 400, 600][config % 4] ?? 0;
  if (config < 16) return [100, 200][config % 2] ?? 0;
  return [25, 50, 100, 200][config % 4] ?? 0;
};

/** How long a block's one Opus packet plays, in tenths of a millisecond. A laced block counts none. */
function blockTenths(bytes: Uint8Array, block: Element): number {
  const trackLength = Math.clz32(bytes[block.start] ?? 0) - 23;
  const at = block.start + trackLength + 3;
  if (trackLength < 1 || trackLength > 8 || at >= block.end) return 0;
  if (((bytes[at - 1] ?? 0) >> 1) & 3) return 0;
  const toc = bytes[at] ?? 0;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (bytes[at + 1] ?? 0) & 0x3f : 2;
  return frames * opusFrameTenths(toc >> 3);
}

function tenthsIn(bytes: Uint8Array, from: number, to: number): number {
  let tenths = 0;
  for (const element of elements(bytes, from, to)) {
    if (element.id === SIMPLE_BLOCK || element.id === BLOCK) {
      tenths += blockTenths(bytes, element);
    } else if (element.id === SEGMENT || element.id === CLUSTER || element.id === BLOCK_GROUP) {
      tenths += tenthsIn(bytes, element.start, element.end);
    }
  }
  return tenths;
}

/** How long the Opus packets in a WebM's bytes play, by what each one says it holds. */
export const webmAudioSeconds = (bytes: Uint8Array): number =>
  tenthsIn(bytes, 0, bytes.length) / 10_000;

/** Whether an MP4 head says so: a file type box at the very start. */
const isMp4 = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(4, 8)).toString('latin1') === 'ftyp';

/** A body's bytes, or null when they are not all here in `ms`. Reading stops either way. */
async function readWithin(body: ReadableStream<Uint8Array>, ms: number): Promise<Buffer | null> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((go) => {
    timer = setTimeout(() => go('late'), ms);
  });
  try {
    for (;;) {
      const read = await Promise.race([reader.read(), late]);
      if (read === 'late') {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      if (read.done) return Buffer.concat(parts);
      parts.push(read.value);
    }
  } finally {
    clearTimeout(timer);
  }
}

interface Resolved {
  url: StreamUrl;
  mime: string;
  size: number | null;
  duration: number;
}

/** A closed range of `audio`, read within `ms`: one audio track's bytes, or why not. */
async function played(
  fetch: FetchLike,
  audio: Resolved,
  ms: number,
): Promise<{ bytes: number; codec: string } | CanaryReason> {
  const wanted = canaryBytes(audio.size, audio.duration);
  let bytes: Buffer;
  try {
    const file = await openStream<FileHeaders>(
      fetch,
      audio.url.reveal(),
      {},
      `bytes=0-${wanted - 1}`,
      fileHeadersSchema,
    );
    const read = await readWithin(file.body, Math.max(ms, 1000));
    if (read === null) return 'unavailable';
    bytes = read;
  } catch (error) {
    const network =
      !(error instanceof AdapterError) || error.kind === 'network' || error.kind === 'timeout';
    return network ? 'unavailable' : 'streamRefused';
  }
  const codec = audio.mime === 'audio/mp4' && isMp4(bytes) ? 'mp4' : webmAudioCodec(bytes);
  if (codec === null) return 'streamRefused';
  if (codec !== 'mp4' && webmAudioSeconds(bytes) < LEAST_SECONDS) return 'streamRefused';
  return { bytes: bytes.byteLength, codec };
}

/** Why the direct resolve did not answer, in the canary's words. */
function directReason(error: unknown): CanaryReason {
  if (error instanceof PlayerRefused && error.reason === 'blocked') return 'blocked';
  if (error instanceof InfoRefused && error.reason === 'noAudio') return 'noAudio';
  if (error instanceof AdapterError && (error.kind === 'network' || error.kind === 'timeout')) {
    return 'unavailable';
  }
  return 'extractorError';
}

export function canaryOf(options: CanaryOptions): Canary {
  const { now } = options;

  const direct = async (resolve: DirectResolve): Promise<CanaryCheck> => {
    const started = now();
    const failed = (reason: CanaryReason): CanaryCheck => ({
      passed: false,
      reason,
      ms: now() - started,
    });
    let audio: Resolved;
    try {
      const info = await resolve(options.id);
      const picked = pickFormat(info.formats);
      if (picked === undefined) return failed('noAudio');
      audio = { ...picked, duration: info.duration };
    } catch (error) {
      return failed(directReason(error));
    }
    const read = await played(options.fetch, audio, CANARY_MS - (now() - started));
    if (typeof read === 'string') return failed(read);
    return { passed: true, ms: now() - started, ...read };
  };

  return async (path) => {
    const started = now();
    const failed = (reason: CanaryReason): CanaryResult => ({
      passed: false,
      reason,
      ms: now() - started,
    });
    try {
      const rows = await options.search(options.query);
      if (!rows.some((row) => row.id === options.id)) return failed('searchShape');
    } catch {
      return failed('unavailable');
    }
    const result = await extracted(path, started);
    if (options.direct === undefined) return result;
    return { ...result, direct: await direct(options.direct) };
  };

  /** The extractor's own result, its time counted from `started`. */
  async function extracted(path: string, started: number): Promise<CanaryResult> {
    const failed = (reason: CanaryReason): CanaryResult => ({
      passed: false,
      reason,
      ms: now() - started,
    });
    // Built with no direct resolve, so only the extractor's own tiers answer it.
    const extractor = new Extractor({
      path: () => path,
      home: options.home,
      now,
      ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
      ...(options.kill === undefined ? {} : { kill: options.kill }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    let audio;
    try {
      audio = await extractor.resolve(options.id);
    } catch (error) {
      if (!(error instanceof ExtractorFailure)) throw error;
      if (error.reason === 'blocked' || error.reason === 'noAudio') return failed(error.reason);
      return failed(error.reason === 'unavailable' ? 'unavailable' : 'extractorError');
    }
    const read = await played(options.fetch, audio, CANARY_MS - (now() - started));
    if (typeof read === 'string') return failed(read);
    return { passed: true, tier: audio.tier as Tier, ms: now() - started, ...read };
  }
}
