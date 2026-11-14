/**
 * Writes Auralis's tags into a FLAC's comment block. The file's own comments under other keys
 * (`GENRE`, `REPLAYGAIN_*`, `LYRICS`) and its vendor stay; the keys Auralis writes, and every old
 * MusicBrainz key, give way. Every other block (pictures, seek table, cue sheet) stays as it was.
 * When the new blocks fit where the old ones and their padding stood, they are written in place and
 * the file keeps its size; else the file is rewritten with 8 KiB of padding or a little more, so its
 * audio starts at the same offset modulo 4 KiB and keeps sharing the source's disk blocks
 * (audio/rewrite.ts). Either way the audio frames are never touched.
 */
import { open } from 'node:fs/promises';
import type { RangeClone } from '../audio/cloneRange.js';
import { rewrite, rewritePadding, type TagWrite, writeInPlace } from '../audio/rewrite.js';
import { replacedComment } from '../tags.js';
import { type VorbisComment, vorbisCommentBody } from '../vorbis.js';
import { BLOCK, blockBytes, MAX_BLOCK, flacComments, type FlacFile, readFlac } from './blocks.js';

const VENDOR = 'Auralis';

async function readPath(path: string): Promise<FlacFile> {
  const file = await open(path, 'r');
  try {
    return await readFlac(file);
  } finally {
    await file.close();
  }
}

/** The metadata blocks, padding last; `padding` null for none. */
function metadata(blocks: readonly { type: number; body: Buffer }[], padding: number | null) {
  const all =
    padding === null ? blocks : [...blocks, { type: BLOCK.PADDING, body: Buffer.alloc(padding) }];
  return Buffer.concat(all.map((b, i) => blockBytes(b.type, b.body, i === all.length - 1)));
}

/**
 * Tags the FLAC at `path` with `comments`. Throws `TagsRefused`, the file untouched, when it is not
 * FLAC or is cut short. A rewrite clones its audio with `clone` (only a test passes its own).
 */
export async function writeFlacTags(
  path: string,
  comments: readonly VorbisComment[],
  clone?: RangeClone,
): Promise<TagWrite> {
  const flac = await readPath(path);
  const old = flacComments(flac);
  const kept = (old?.comments ?? []).filter((c) => !replacedComment(c.key));
  const body = vorbisCommentBody(old?.vendor ?? VENDOR, [...comments, ...kept]);

  const blocks: { type: number; body: Buffer }[] = [];
  let placed = false;
  for (const block of flac.blocks) {
    if (block.type === BLOCK.PADDING) continue;
    if (block.type !== BLOCK.VORBIS_COMMENT) blocks.push(block);
    else if (!placed) {
      blocks.push({ type: BLOCK.VORBIS_COMMENT, body });
      placed = true;
    }
  }
  if (!placed) blocks.splice(1, 0, { type: BLOCK.VORBIS_COMMENT, body });

  const room = flac.audioStart - flac.start - 4;
  const needed = blocks.reduce((sum, b) => sum + 4 + b.body.length, 0);
  if (needed === room) {
    await writeInPlace(path, flac.start + 4, metadata(blocks, null));
    return 'inPlace';
  }
  if (needed + 4 <= room && room - needed - 4 <= MAX_BLOCK) {
    await writeInPlace(path, flac.start + 4, metadata(blocks, room - needed - 4));
    return 'inPlace';
  }
  const head = Buffer.concat([await readPrefix(path, flac.start), Buffer.from('fLaC', 'latin1')]);
  const padding = rewritePadding(head.length + needed + 4, flac.audioStart);
  await rewrite(path, Buffer.concat([head, metadata(blocks, padding)]), flac.audioStart, clone);
  return 'rewritten';
}

/** The bytes before `fLaC`: an ID3v2 tag a ripper left, kept as it is. */
async function readPrefix(path: string, length: number): Promise<Buffer> {
  if (length === 0) return Buffer.alloc(0);
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(length);
    await file.read(bytes, 0, length, 0);
    return bytes;
  } finally {
    await file.close();
  }
}
