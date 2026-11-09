/**
 * Reads the Opus packets out of a WebM file, the container YouTube Music streams in. It walks the
 * EBML elements over a file handle and holds one Cluster in memory at a time (about 160 KB of a
 * real song). Only the shape a real stream has is taken: one track, `A_OPUS` with an `OpusHead`,
 * known-size Clusters, unlaced SimpleBlocks and Blocks, and a `DiscardPadding` only on the last
 * block. Anything else is refused, never guessed.
 */
import type { FileHandle } from 'node:fs/promises';

/** Why a file cannot be kept as it is. The message names the reason, never a path. */
export class OpusRefused extends Error {
  override name = 'OpusRefused';
}

const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Cluster: 0x1f43b675,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  DiscardPadding: 0x75a2,
} as const;

/** An element's header: its id, where its data starts, and its size (`null` when unknown). */
interface Header {
  readonly id: number;
  readonly dataAt: number;
  readonly size: number | null;
}

/** Reads one variable-length integer. With `marker`, the length bits stay in (an element id). */
function vint(
  bytes: Uint8Array,
  at: number,
  marker: boolean,
): { value: number; length: number; unknown: boolean } | null {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (length > 8 || at + length > bytes.length) return null;
  let value = marker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = bytes[at + i]!;
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !marker && allOnes };
}

/** The headers of the elements laid end to end in `bytes`, each one's data inside `bytes`. */
function* children(bytes: Uint8Array): Generator<Header> {
  let at = 0;
  while (at < bytes.length) {
    const header = headerAt(bytes, at, 0);
    if (header === null || header.size === null) {
      throw new OpusRefused('an element inside a block has no size');
    }
    if (header.dataAt + header.size > bytes.length) throw new OpusRefused('an element runs short');
    yield header;
    at = header.dataAt + header.size;
  }
}

/** The element header at `at` in `bytes`, its `dataAt` offset by `base`. */
function headerAt(bytes: Uint8Array, at: number, base: number): Header | null {
  const id = vint(bytes, at, true);
  if (id === null || id.length > 4) return null;
  const size = vint(bytes, at + id.length, false);
  if (size === null) return null;
  return {
    id: id.value,
    dataAt: base + at + id.length + size.length,
    size: size.unknown ? null : size.value,
  };
}

function uint(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return value;
}

function int(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const unsigned = uint(bytes);
  return bytes[0]! & 0x80 ? unsigned - 2 ** (8 * bytes.length) : unsigned;
}

/** One packet as stored, and the nanoseconds the container says to drop from its end. */
export interface WebmPacket {
  readonly data: Buffer;
  readonly discardPaddingNs: number;
}

export interface WebmOpus {
  /** The `OpusHead` from `CodecPrivate`, byte for byte. */
  readonly head: Buffer;
  /** Every packet in order. The handle must stay open while they are read. */
  readonly packets: AsyncGenerator<WebmPacket>;
}

/** The size of the file, and a reader of exact byte ranges in it. */
class Source {
  private constructor(
    private readonly file: FileHandle,
    readonly size: number,
  ) {}

  static async open(file: FileHandle): Promise<Source> {
    return new Source(file, (await file.stat()).size);
  }

  async read(at: number, length: number): Promise<Buffer> {
    if (at + length > this.size) throw new OpusRefused('the file is shorter than its elements');
    const buffer = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
      const { bytesRead } = await this.file.read(buffer, done, length - done, at + done);
      if (bytesRead === 0) throw new OpusRefused('the file is shorter than its elements');
      done += bytesRead;
    }
    return buffer;
  }

  /** The header of the element at `at`; at most 12 bytes are read. */
  async header(at: number): Promise<Header> {
    const bytes = await this.read(at, Math.min(12, this.size - at));
    const header = headerAt(bytes, 0, at);
    if (header === null) throw new OpusRefused('an element header is not valid');
    return header;
  }
}

interface Track {
  readonly number: number;
  readonly head: Buffer;
}

function readTracks(bytes: Uint8Array): Track {
  const entries = [...children(bytes)].filter((child) => child.id === ID.TrackEntry);
  if (entries.length !== 1) throw new OpusRefused(`the file has ${entries.length} tracks, not one`);
  const entry = entries[0]!;
  const fields = bytes.subarray(entry.dataAt, entry.dataAt + entry.size!);
  let number: number | null = null;
  let codec: string | null = null;
  let head: Buffer | null = null;
  for (const field of children(fields)) {
    const data = fields.subarray(field.dataAt, field.dataAt + field.size!);
    if (field.id === ID.TrackNumber) number = uint(data);
    else if (field.id === ID.CodecID) codec = Buffer.from(data).toString('latin1');
    else if (field.id === ID.CodecPrivate) head = Buffer.from(data);
  }
  if (codec !== 'A_OPUS') throw new OpusRefused(`the codec is ${codec ?? 'not named'}, not Opus`);
  if (number === null) throw new OpusRefused('the track has no number');
  if (head === null || head.length < 19 || head.toString('latin1', 0, 8) !== 'OpusHead') {
    throw new OpusRefused('the track carries no OpusHead');
  }
  return { number, head };
}

/** The packets of one Cluster, in order. */
function* clusterPackets(bytes: Uint8Array, track: number): Generator<WebmPacket> {
  for (const child of children(bytes)) {
    const data = bytes.subarray(child.dataAt, child.dataAt + child.size!);
    if (child.id === ID.SimpleBlock) {
      yield { data: blockPayload(data, track), discardPaddingNs: 0 };
    } else if (child.id === ID.BlockGroup) {
      let payload: Buffer | null = null;
      let discardPaddingNs = 0;
      for (const field of children(data)) {
        const fieldData = data.subarray(field.dataAt, field.dataAt + field.size!);
        if (field.id === ID.Block) payload = blockPayload(fieldData, track);
        else if (field.id === ID.DiscardPadding) discardPaddingNs = int(fieldData);
      }
      if (payload === null) throw new OpusRefused('a block group holds no block');
      if (discardPaddingNs < 0) throw new OpusRefused('a block asks to pad, not to discard');
      yield { data: payload, discardPaddingNs };
    }
  }
}

/** A block's frame: after its track number, a 16-bit time and a flags byte. */
function blockPayload(block: Uint8Array, track: number): Buffer {
  const number = vint(block, 0, false);
  if (number === null || block.length < number.length + 3) {
    throw new OpusRefused('a block is not valid');
  }
  if (number.value !== track) throw new OpusRefused('a block belongs to another track');
  const flags = block[number.length + 2]!;
  if ((flags & 0x06) !== 0) throw new OpusRefused('a block is laced');
  const payload = Buffer.from(block.subarray(number.length + 3));
  if (payload.length === 0) throw new OpusRefused('a block is empty');
  return payload;
}

/** Opens the WebM: reads up to its first Cluster now, and its packets as they are asked for. */
export async function readWebmOpus(file: FileHandle): Promise<WebmOpus> {
  const source = await Source.open(file);
  const ebml = await source.header(0);
  if (ebml.id !== ID.EBML || ebml.size === null) throw new OpusRefused('the file is not EBML');
  const ebmlBytes = await source.read(ebml.dataAt, ebml.size);
  const docType = [...children(ebmlBytes)].find((child) => child.id === ID.DocType);
  const kind = docType
    ? ebmlBytes.toString('latin1', docType.dataAt, docType.dataAt + docType.size!)
    : null;
  if (kind !== 'webm' && kind !== 'matroska') throw new OpusRefused('the file is not WebM');

  const segment = await source.header(ebml.dataAt + ebml.size);
  if (segment.id !== ID.Segment) throw new OpusRefused('the file has no segment');
  const end = segment.size === null ? source.size : segment.dataAt + segment.size;
  if (end > source.size) throw new OpusRefused('the file is shorter than its segment');

  let at = segment.dataAt;
  let track: Track | null = null;
  while (at < end) {
    const header = await source.header(at);
    if (header.id === ID.Cluster) break;
    if (header.size === null) throw new OpusRefused('an element before the audio has no size');
    if (header.id === ID.Tracks) {
      if (track !== null) throw new OpusRefused('the file lists its tracks twice');
      track = readTracks(await source.read(header.dataAt, header.size));
    }
    at = header.dataAt + header.size;
  }
  if (track === null) throw new OpusRefused('the file lists no track before its audio');
  const { number, head } = track;

  async function* packets(): AsyncGenerator<WebmPacket> {
    let next = at;
    let held: WebmPacket | null = null;
    while (next < end) {
      const header = await source.header(next);
      if (header.size === null) throw new OpusRefused('a cluster has no size');
      if (header.dataAt + header.size > end)
        throw new OpusRefused('the file is shorter than its elements');
      if (header.id === ID.Tracks) throw new OpusRefused('the file lists its tracks twice');
      if (header.id === ID.Cluster) {
        for (const packet of clusterPackets(
          await source.read(header.dataAt, header.size),
          number,
        )) {
          if (held !== null) {
            if (held.discardPaddingNs > 0) {
              throw new OpusRefused('a block before the last discards samples');
            }
            yield held;
          }
          held = packet;
        }
      }
      next = header.dataAt + header.size;
    }
    if (held === null) throw new OpusRefused('the file holds no audio');
    yield held;
  }

  return { head, packets: packets() };
}
