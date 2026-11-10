/**
 * Moves a WebM's Opus packets into an Ogg Opus file (RFC 7845) without decoding them: the packets
 * and the `OpusHead` are copied byte for byte, so the audio is the stream's own. Jellyfin indexes
 * `.opus` as audio and `.webm` as video (checked live), hence the move. The tags go in an
 * `OpusTags` packet of Vorbis comments, a cover as `METADATA_BLOCK_PICTURE`, which Jellyfin's
 * ffprobe reads (checked live). Each page's granule is the samples up to its last packet, counted
 * from each packet's TOC byte, and the last one is cut by the WebM's `DiscardPadding`.
 */
import type { FileHandle } from 'node:fs/promises';
import { OpusRefused, readWebmOpus } from './ebml.js';
import {
  type Picture,
  pictureBlock,
  readPictureBlock,
  readVorbisCommentBody,
  type VorbisComment,
  vorbisCommentBody,
} from '../vorbis.js';
import { oggCrc, oggPackets, OggWriter } from './ogg.js';

export { OpusRefused } from './ebml.js';

const VENDOR = 'Auralis';
const SAMPLE_RATE = 48_000;
/** About a second of audio a page, as ffmpeg writes them. */
const PAGE_SAMPLES = SAMPLE_RATE;

/** The samples at 48 kHz one Opus packet decodes to, from its TOC byte (RFC 6716, 3.1). */
export function packetSamples(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) throw new OpusRefused('an Opus packet is empty');
  const config = toc >> 3;
  const frame =
    config < 12
      ? [480, 960, 1920, 2880][config % 4]!
      : config < 16
        ? [480, 960][config % 2]!
        : [120, 240, 480, 960][config % 4]!;
  const code = toc & 0x03;
  let frames: number;
  if (code === 0) frames = 1;
  else if (code < 3) frames = 2;
  else {
    const count = packet[1];
    if (count === undefined) throw new OpusRefused('an Opus packet is cut short');
    frames = count & 0x3f;
  }
  const samples = frames * frame;
  if (samples === 0 || samples > 5760) throw new OpusRefused('an Opus packet is not valid');
  return samples;
}

/** The `OpusTags` packet. */
export function opusTagsPacket(comments: readonly VorbisComment[], picture?: Picture): Buffer {
  const all = [...comments];
  if (picture) {
    all.push({ key: 'METADATA_BLOCK_PICTURE', value: pictureBlock(picture).toString('base64') });
  }
  return Buffer.concat([Buffer.from('OpusTags', 'latin1'), vorbisCommentBody(VENDOR, all)]);
}

export interface OpusTags {
  readonly vendor: string;
  /** Every comment but the picture, in order, the key as written. */
  readonly comments: readonly VorbisComment[];
  readonly picture: Picture | null;
}

export function readOpusTagsPacket(packet: Buffer): OpusTags {
  if (packet.toString('latin1', 0, 8) !== 'OpusTags') throw new OpusRefused('no OpusTags');
  const { vendor, comments: all } = readVorbisCommentBody(packet.subarray(8));
  const comments: VorbisComment[] = [];
  let picture: Picture | null = null;
  for (const comment of all) {
    if (comment.key.toUpperCase() === 'METADATA_BLOCK_PICTURE') {
      picture = readPictureBlock(Buffer.from(comment.value, 'base64'));
    } else comments.push(comment);
  }
  return { vendor, comments, picture };
}

/** The container of a file, by its first bytes. */
async function containerOf(file: FileHandle): Promise<'webm' | 'ogg'> {
  const magic = Buffer.alloc(4);
  await file.read(magic, 0, 4, 0);
  if (magic.toString('latin1') === 'OggS') return 'ogg';
  if (magic.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  throw new OpusRefused('the file is neither WebM nor Ogg');
}

/**
 * Writes the WebM in `from` to `to` as Ogg Opus, from `to`'s start. Refuses (`OpusRefused`) a file
 * it cannot copy exactly: laced blocks, an unknown-size Cluster, more than one track, a codec
 * other than Opus, or a file shorter than its elements.
 */
export async function remux(
  from: FileHandle,
  to: FileHandle,
  comments: readonly VorbisComment[],
  picture?: Picture,
): Promise<void> {
  const { head, packets } = await readWebmOpus(from);
  const tags = opusTagsPacket(comments, picture);
  const writer = new OggWriter(to, oggCrc(Buffer.concat([head, tags])));
  await writer.packet(head, 0n);
  await writer.flush();
  await writer.packet(tags, 0n);
  await writer.flush();

  let granule = 0n;
  let sincePage = 0;
  let held: { data: Buffer; samples: number } | null = null;
  let discard = 0;
  for await (const packet of packets) {
    if (held !== null) {
      await writer.packet(held.data, granule);
      if (sincePage >= PAGE_SAMPLES) {
        await writer.flush();
        sincePage = 0;
      }
    }
    const samples = packetSamples(packet.data);
    granule += BigInt(samples);
    sincePage += samples;
    discard = Math.round((packet.discardPaddingNs * SAMPLE_RATE) / 1e9);
    held = { data: packet.data, samples };
  }
  if (held === null) throw new OpusRefused('the file holds no audio');
  if (discard > held.samples) throw new OpusRefused('the last block discards more than it holds');
  await writer.packet(held.data, granule - BigInt(discard), true);
}

/** Each audio packet of a WebM or Ogg Opus file, in order, as stored. */
export async function* opusPackets(file: FileHandle): AsyncGenerator<Buffer> {
  if ((await containerOf(file)) === 'webm') {
    for await (const packet of (await readWebmOpus(file)).packets) yield packet.data;
    return;
  }
  let index = 0;
  for await (const packet of oggPackets(file)) {
    if (index++ >= 2) yield packet.data;
  }
}

export interface OggOpus {
  readonly head: Buffer;
  readonly tags: OpusTags;
  /** The granule of the last page: the samples a player plays, pre-skip included. */
  readonly lastGranule: bigint;
  readonly packets: number;
}

/** Reads an Ogg Opus file whole, its CRCs checked: its head, tags, packet count, last granule. */
export async function readOggOpus(file: FileHandle): Promise<OggOpus> {
  let head: Buffer | null = null;
  let tags: OpusTags | null = null;
  let lastGranule = -1n;
  let packets = 0;
  for await (const packet of oggPackets(file)) {
    if (head === null) {
      if (packet.data.toString('latin1', 0, 8) !== 'OpusHead') throw new OpusRefused('no OpusHead');
      head = packet.data;
    } else if (tags === null) tags = readOpusTagsPacket(packet.data);
    else packets += 1;
    if (packet.granule >= 0n) lastGranule = packet.granule;
  }
  if (head === null || tags === null) throw new OpusRefused('the file is not Ogg Opus');
  return { head, tags, lastGranule, packets };
}
