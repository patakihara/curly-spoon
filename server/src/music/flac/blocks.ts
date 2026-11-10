/**
 * A FLAC file's metadata blocks (the FLAC format, "Metadata"): `fLaC`, then blocks of a 4-byte header
 * (last-block flag, type, 24-bit length) and a body, then the audio frames. An ID3v2 tag some
 * rippers put before `fLaC` is stepped over. Reading checks every block lies inside the file and a
 * frame's sync code follows the last one, so a file that is not FLAC, or is cut short, is refused
 * before anything is written to it.
 */
import type { FileHandle } from 'node:fs/promises';
import { id3v2Length } from '../id3/frames.js';
import { TagsRefused } from '../tags.js';
import {
  type Picture,
  readPictureBlock,
  readVorbisCommentBody,
  type VorbisComments,
} from '../vorbis.js';

export const BLOCK = { STREAMINFO: 0, PADDING: 1, VORBIS_COMMENT: 4, PICTURE: 6 } as const;

/** The longest block body a header can name. */
export const MAX_BLOCK = 0xffffff;
const MAX_BLOCKS = 1024;

export interface FlacBlock {
  readonly type: number;
  readonly body: Buffer;
}

export interface StreamInfo {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  /** 0 when the encoder did not know it. */
  readonly totalSamples: number;
}

export interface FlacFile {
  /** Where `fLaC` stands: after an ID3v2 tag, if there is one, else 0. */
  readonly start: number;
  readonly blocks: readonly FlacBlock[];
  /** Where the first audio frame starts. */
  readonly audioStart: number;
  readonly streamInfo: StreamInfo;
}

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  const { bytesRead } = await file.read(bytes, 0, length, position);
  return bytes.subarray(0, bytesRead);
}

export function readStreamInfo(body: Buffer): StreamInfo {
  const packed = body.readBigUInt64BE(10);
  return {
    sampleRate: Number(packed >> 44n),
    channels: Number((packed >> 41n) & 0x7n) + 1,
    bitsPerSample: Number((packed >> 36n) & 0x1fn) + 1,
    totalSamples: Number(packed & 0xfffffffffn),
  };
}

export async function readFlac(file: FileHandle): Promise<FlacFile> {
  const { size } = await file.stat();
  const start = id3v2Length(await readAt(file, 0, 10));
  if ((await readAt(file, start, 4)).toString('latin1') !== 'fLaC') {
    throw new TagsRefused('the file is not FLAC');
  }
  const blocks: FlacBlock[] = [];
  let at = start + 4;
  let last = false;
  while (!last) {
    if (blocks.length >= MAX_BLOCKS) throw new TagsRefused('the FLAC has too many blocks');
    const header = await readAt(file, at, 4);
    if (header.length < 4) throw new TagsRefused('a FLAC metadata block runs past the file');
    last = (header[0]! & 0x80) !== 0;
    const type = header[0]! & 0x7f;
    const length = header.readUIntBE(1, 3);
    if (type === 127) throw new TagsRefused('a FLAC metadata block is not valid');
    if (at + 4 + length > size) throw new TagsRefused('a FLAC metadata block runs past the file');
    blocks.push({ type, body: await readAt(file, at + 4, length) });
    at += 4 + length;
  }
  const info = blocks[0];
  if (info?.type !== BLOCK.STREAMINFO || info.body.length !== 34) {
    throw new TagsRefused('the FLAC does not start with its STREAMINFO');
  }
  const sync = await readAt(file, at, 2);
  if (sync.length < 2 || sync[0] !== 0xff || (sync[1]! & 0xfe) !== 0xf8) {
    throw new TagsRefused('no FLAC frame follows the metadata');
  }
  return { start, blocks, audioStart: at, streamInfo: readStreamInfo(info.body) };
}

/** The file's first comment block, or null when it has none. */
export function flacComments(flac: FlacFile): VorbisComments | null {
  const block = flac.blocks.find((b) => b.type === BLOCK.VORBIS_COMMENT);
  if (!block) return null;
  try {
    return readVorbisCommentBody(block.body);
  } catch {
    throw new TagsRefused('the FLAC’s comment block is not valid');
  }
}

export function flacPictures(flac: FlacFile): Picture[] {
  return flac.blocks.filter((b) => b.type === BLOCK.PICTURE).map((b) => readPictureBlock(b.body));
}

/** One block as stored: its header, then its body. */
export function blockBytes(type: number, body: Buffer, last: boolean): Buffer {
  if (body.length > MAX_BLOCK) throw new TagsRefused('a FLAC metadata block is too long');
  const header = Buffer.alloc(4);
  header[0] = (last ? 0x80 : 0) | type;
  header.writeUIntBE(body.length, 1, 3);
  return Buffer.concat([header, body]);
}
