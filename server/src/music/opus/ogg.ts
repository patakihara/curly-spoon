/**
 * The Ogg container (RFC 3533): a page writer and a page reader over file handles. A packet goes
 * into 255-byte lacing segments, at most 255 segments a page, and a packet too long for one page
 * spans pages, each one after the first marked as continued. A page's granule is that of the last
 * packet to end on it, though another packet starts after it and carries on to the next page; a
 * page on which no packet ends has none (-1). Every page carries its CRC, and the reader refuses a
 * page whose CRC does not check.
 */
import type { FileHandle } from 'node:fs/promises';
import { OpusRefused } from './ebml.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32: polynomial 0x04C11DB7, no reflection, starting at 0, no final xor. */
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc;
}

const CONTINUED = 0x01;
const FIRST = 0x02;
const LAST = 0x04;
const MOST_SEGMENTS = 255;
/** The granule of a page on which no packet ends. */
export const NO_GRANULE = -1n;

/** Writes one logical stream's pages, in order, from the start of `file`. */
export class OggWriter {
  private segments: number[] = [];
  private data: Buffer[] = [];
  /** The granule of the last packet to end on the page being filled; none while none has. */
  private granule = NO_GRANULE;
  /** The page being filled starts with the rest of a packet begun on the page before. */
  private continued = false;
  private sequence = 0;
  private position = 0;

  constructor(
    private readonly file: FileHandle,
    private readonly serial: number,
  ) {}

  /**
   * Adds one packet, ending at `granule`. With `last`, the packet closes the stream: its page is
   * written at once and marked as the last.
   */
  async packet(data: Uint8Array, granule: bigint, last = false): Promise<void> {
    if (this.segments.length === MOST_SEGMENTS) await this.flushPage(false, false);
    let at = 0;
    for (;;) {
      const room = MOST_SEGMENTS - this.segments.length;
      const take = Math.min(data.length - at, room * 255);
      const whole = Math.floor(take / 255);
      for (let i = 0; i < whole; i++) this.segments.push(255);
      const ends = data.length - at === take && this.segments.length < MOST_SEGMENTS;
      if (ends) this.segments.push(take - whole * 255);
      this.data.push(Buffer.from(data.subarray(at, at + take)));
      at += take;
      if (ends) {
        this.granule = granule;
        break;
      }
      await this.flushPage(false, true);
    }
    if (last) await this.flushPage(true, false);
  }

  /** Ends the page being filled, so the next packet starts a page. */
  async flush(): Promise<void> {
    if (this.segments.length > 0) await this.flushPage(false, false);
  }

  private async flushPage(last: boolean, carriesOn: boolean): Promise<void> {
    const body = Buffer.concat(this.data);
    const header = Buffer.alloc(27 + this.segments.length);
    header.write('OggS', 0, 'latin1');
    header[4] = 0;
    header[5] =
      (this.continued ? CONTINUED : 0) | (this.sequence === 0 ? FIRST : 0) | (last ? LAST : 0);
    header.writeBigInt64LE(this.granule, 6);
    header.writeUInt32LE(this.serial >>> 0, 14);
    header.writeUInt32LE(this.sequence, 18);
    header[26] = this.segments.length;
    Buffer.from(this.segments).copy(header, 27);
    const page = Buffer.concat([header, body]);
    page.writeUInt32LE(oggCrc(page), 22);
    await writeAll(this.file, page, this.position);
    this.position += page.length;
    this.sequence += 1;
    this.segments = [];
    this.data = [];
    this.granule = NO_GRANULE;
    this.continued = carriesOn;
  }
}

async function writeAll(file: FileHandle, bytes: Buffer, at: number): Promise<void> {
  let done = 0;
  while (done < bytes.length) {
    const { bytesWritten } = await file.write(bytes, done, bytes.length - done, at + done);
    done += bytesWritten;
  }
}

export interface OggPage {
  readonly first: boolean;
  readonly last: boolean;
  readonly continued: boolean;
  readonly granule: bigint;
  readonly serial: number;
  readonly sequence: number;
  /** The lacing values, at most 255. */
  readonly segments: readonly number[];
  readonly data: Buffer;
}

async function readExactly(file: FileHandle, at: number, length: number): Promise<Buffer | null> {
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await file.read(buffer, done, length - done, at + done);
    if (bytesRead === 0) return done === 0 ? null : buffer.subarray(0, done);
    done += bytesRead;
  }
  return buffer;
}

/** Every page of the file, each one's CRC checked. */
export async function* oggPages(file: FileHandle): AsyncGenerator<OggPage> {
  let at = 0;
  for (;;) {
    const header = await readExactly(file, at, 27);
    if (header === null) return;
    if (header.length < 27 || header.toString('latin1', 0, 4) !== 'OggS' || header[4] !== 0) {
      throw new OpusRefused('an Ogg page is not valid');
    }
    const count = header[26]!;
    const table = await readExactly(file, at + 27, count);
    if (count > 0 && (table === null || table.length < count)) {
      throw new OpusRefused('an Ogg page runs short');
    }
    const segments = [...(table ?? [])];
    const length = segments.reduce((sum, value) => sum + value, 0);
    const data = (await readExactly(file, at + 27 + count, length)) ?? Buffer.alloc(0);
    if (data.length < length) throw new OpusRefused('an Ogg page runs short');
    const page = Buffer.concat([header, table ?? Buffer.alloc(0), data]);
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    if (oggCrc(page) !== crc) throw new OpusRefused('an Ogg page fails its CRC');
    const flags = header[5]!;
    yield {
      first: (flags & FIRST) !== 0,
      last: (flags & LAST) !== 0,
      continued: (flags & CONTINUED) !== 0,
      granule: header.readBigInt64LE(6),
      serial: header.readUInt32LE(14),
      sequence: header.readUInt32LE(18),
      segments,
      data,
    };
    at += page.length;
  }
}

export interface OggPacket {
  readonly data: Buffer;
  /** The granule of the page this packet ends on, when it is the last to end there. */
  readonly granule: bigint;
}

/** Every packet of the file's one logical stream, put back together across pages. */
export async function* oggPackets(file: FileHandle): AsyncGenerator<OggPacket> {
  let parts: Buffer[] = [];
  let serial: number | null = null;
  for await (const page of oggPages(file)) {
    if (serial === null) serial = page.serial;
    else if (page.serial !== serial) throw new OpusRefused('the file holds more than one stream');
    if (page.continued !== parts.length > 0) throw new OpusRefused('an Ogg page breaks a packet');
    const ended: Buffer[] = [];
    let at = 0;
    let size = 0;
    for (const value of page.segments) {
      size += value;
      if (value < 255) {
        parts.push(page.data.subarray(at, at + size));
        ended.push(Buffer.concat(parts));
        parts = [];
        at += size;
        size = 0;
      }
    }
    if (size > 0) parts.push(page.data.subarray(at, at + size));
    for (let i = 0; i < ended.length; i++) {
      yield { data: ended[i]!, granule: i === ended.length - 1 ? page.granule : NO_GRANULE };
    }
  }
  if (parts.length > 0) throw new OpusRefused('the last Ogg packet never ends');
}
