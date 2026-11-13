/**
 * How long a FLAC or MP3 plays, read from its headers alone. FLAC: `STREAMINFO`'s sample count over
 * its rate, exact. MP3: a `Xing`, `Info` or `VBRI` frame's frame count times the samples a frame,
 * as ffmpeg counts it; with none, a constant bit rate over the bytes between the ID3 tags.
 */
import { type FileHandle, open } from 'node:fs/promises';
import { readFlac } from '../flac/blocks.js';
import { id3v2Length } from '../id3/frames.js';
import { TagsRefused } from '../tags.js';

export interface MpegFrame {
  /** 1, 2 or 2.5. */
  readonly version: 1 | 2 | 2.5;
  readonly layer: 1 | 2 | 3;
  /** Bits a second. */
  readonly bitRate: number;
  readonly sampleRate: number;
  readonly mono: boolean;
  /** The frame's bytes, header included. */
  readonly length: number;
  readonly samples: number;
}

const BIT_RATES: Record<string, readonly number[]> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = {
  1: [44_100, 48_000, 32_000],
  2: [22_050, 24_000, 16_000],
  2.5: [11_025, 12_000, 8_000],
};

/** The MPEG audio frame header at `at`, or null when there is none. */
export function mpegFrame(bytes: Buffer, at: number): MpegFrame | null {
  if (at + 4 > bytes.length) return null;
  const header = bytes.readUInt32BE(at);
  if (header >>> 21 !== 0x7ff) return null;
  const versionBits = (header >> 19) & 3;
  const layerBits = (header >> 17) & 3;
  const rateIndex = (header >> 12) & 0xf;
  const sampleIndex = (header >> 10) & 3;
  if (versionBits === 1 || layerBits === 0 || rateIndex === 0 || rateIndex === 15) return null;
  if (sampleIndex === 3) return null;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = (4 - layerBits) as 1 | 2 | 3;
  const bitRate = BIT_RATES[`${version === 1 ? 1 : 2}-${layer}`]![rateIndex]! * 1000;
  const sampleRate = SAMPLE_RATES[version][sampleIndex]!;
  const padding = (header >> 9) & 1;
  const mono = ((header >> 6) & 3) === 3;
  const samples = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152;
  const length =
    layer === 1
      ? (Math.floor((12 * bitRate) / sampleRate) + padding) * 4
      : Math.floor(((samples / 8) * bitRate) / sampleRate) + padding;
  return { version, layer, bitRate, sampleRate, mono, length, samples };
}

/** How far after the ID3 tag the first frame is looked for. */
const SEARCH = 64 * 1024;

/**
 * The first MPEG frame at or after `from`, within 64 KiB: one whose next frame also starts where
 * its length says, so stray sync bits in junk are not taken for it.
 */
export async function firstMpegFrame(
  file: FileHandle,
  from: number,
): Promise<{ at: number; frame: MpegFrame; bytes: Buffer } | null> {
  const bytes = Buffer.alloc(SEARCH + 2 * 4096);
  const { bytesRead } = await file.read(bytes, 0, bytes.length, from);
  const head = bytes.subarray(0, bytesRead);
  for (let at = 0; at < Math.min(SEARCH, head.length); at++) {
    const frame = mpegFrame(head, at);
    if (!frame) continue;
    const next = at + frame.length;
    const following = mpegFrame(head, next);
    const endsFile = next === head.length;
    if (endsFile || (following && following.sampleRate === frame.sampleRate)) {
      return { at: from + at, frame, bytes: head.subarray(at) };
    }
  }
  return null;
}

/** The frames a `Xing`/`Info` or `VBRI` header counts, or null. */
function vbrFrames(frame: MpegFrame, bytes: Buffer): number | null {
  const side = frame.version === 1 ? (frame.mono ? 17 : 32) : frame.mono ? 9 : 17;
  const xing = 4 + side;
  const tag = bytes.toString('latin1', xing, xing + 4);
  if ((tag === 'Xing' || tag === 'Info') && bytes.length >= xing + 12) {
    return (bytes.readUInt32BE(xing + 4) & 1) !== 0 ? bytes.readUInt32BE(xing + 8) : null;
  }
  if (bytes.toString('latin1', 36, 40) === 'VBRI' && bytes.length >= 36 + 18) {
    return bytes.readUInt32BE(36 + 14);
  }
  return null;
}

async function mp3DurationMs(file: FileHandle): Promise<number | null> {
  const { size } = await file.stat();
  const head = Buffer.alloc(10);
  await file.read(head, 0, 10, 0);
  const first = await firstMpegFrame(file, id3v2Length(head));
  if (!first) return null;
  const { frame } = first;
  const frames = vbrFrames(frame, first.bytes);
  if (frames !== null) return (frames * frame.samples * 1000) / frame.sampleRate;
  const tail = Buffer.alloc(3);
  await file.read(tail, 0, 3, size - 128);
  const end = tail.toString('latin1') === 'TAG' ? size - 128 : size;
  return ((end - first.at) * 8 * 1000) / frame.bitRate;
}

/** The milliseconds `path` plays, or null when its headers do not say. */
export async function audioDurationMs(path: string): Promise<number | null> {
  const file = await open(path, 'r');
  try {
    try {
      const { streamInfo } = await readFlac(file);
      if (streamInfo.totalSamples === 0 || streamInfo.sampleRate === 0) return null;
      return (streamInfo.totalSamples * 1000) / streamInfo.sampleRate;
    } catch (error) {
      if (!(error instanceof TagsRefused)) throw error;
    }
    return await mp3DurationMs(file);
  } finally {
    await file.close();
  }
}
