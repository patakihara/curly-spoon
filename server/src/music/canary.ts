/**
 * The canary: whether an extractor binary still gets a known track, as a real play would. It finds
 * the track by search, resolves it through both tiers with that binary, asks a closed range of about
 * twenty seconds' bytes, and reads their container: exactly one track, audio, Opus. An MP4 answer
 * passes on its file type alone, having no such walk. Reasons stay apart, because only some say an
 * update could help; `unavailable` means the network failed, and so is no result at all.
 */
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { fileHeadersSchema, openStream, type FileHeaders } from '../adapters/stream.js';
import { Extractor, ExtractorFailure, type SpawnLike, type Tier } from './extractor.js';

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

export type CanaryResult =
  | { passed: true; tier: Tier; ms: number; bytes: number; codec: string }
  | { passed: false; reason: CanaryReason; ms: number };

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

export function canaryOf(options: CanaryOptions): Canary {
  const { now } = options;
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
    const wanted = canaryBytes(audio.size, audio.duration);
    let bytes: Buffer;
    try {
      const file = await openStream<FileHeaders>(
        options.fetch,
        audio.url.reveal(),
        {},
        `bytes=0-${wanted - 1}`,
        fileHeadersSchema,
      );
      const read = await readWithin(file.body, Math.max(CANARY_MS - (now() - started), 1000));
      if (read === null) return failed('unavailable');
      bytes = read;
    } catch (error) {
      const network =
        !(error instanceof AdapterError) || error.kind === 'network' || error.kind === 'timeout';
      return failed(network ? 'unavailable' : 'streamRefused');
    }
    const codec = audio.mime === 'audio/mp4' && isMp4(bytes) ? 'mp4' : webmAudioCodec(bytes);
    if (codec === null) return failed('streamRefused');
    return {
      passed: true,
      tier: audio.tier,
      ms: now() - started,
      bytes: bytes.byteLength,
      codec,
    };
  };
}
