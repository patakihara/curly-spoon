/**
 * Writes Auralis's tags into an MP3's ID3v2 tag, as ID3v2.4. The file's own frames under other ids
 * (`TCON`, `APIC`, `COMM`, `USLT`, other `TXXX`) stay; the frames Auralis writes, and every old
 * MusicBrainz frame, give way. When the new tag fits where the old one stood, it is written there,
 * padded to the old one's length, and the file keeps its size; else (or with no tag) the file is
 * rewritten with 8 KiB of padding. The audio frames and an ID3v1 tag at the end are never touched.
 */
import { type FileHandle, open } from 'node:fs/promises';
import { firstMpegFrame } from '../audio/duration.js';
import { REWRITE_PADDING, rewrite, type TagWrite, writeInPlace } from '../audio/rewrite.js';
import { type TrackTags, TagsRefused } from '../tags.js';
import { id3Frames, id3v24Tag, id3v2Length, readId3Tag, replacedFrame } from './frames.js';

async function readOld(file: FileHandle) {
  const head = Buffer.alloc(10);
  await file.read(head, 0, 10, 0);
  const length = id3v2Length(head);
  if (length === 0) return null;
  const bytes = Buffer.alloc(length);
  const { bytesRead } = await file.read(bytes, 0, length, 0);
  return readId3Tag(bytes.subarray(0, bytesRead));
}

/**
 * Tags the MP3 at `path` with `tags`. Throws `TagsRefused`, the file untouched, when no MPEG audio
 * follows its tag or its tag cannot be carried over (unsynchronised, cut short).
 */
export async function writeId3Tags(path: string, tags: TrackTags): Promise<TagWrite> {
  const file = await open(path, 'r');
  let old;
  try {
    old = await readOld(file);
    if (!(await firstMpegFrame(file, old?.length ?? 0))) {
      throw new TagsRefused('no MPEG audio follows the tag');
    }
  } finally {
    await file.close();
  }

  const frames = [...id3Frames(tags), ...(old?.frames ?? []).filter((f) => !replacedFrame(f))];
  const bare = id3v24Tag(frames, 0);
  if (old && bare.length <= old.length) {
    await writeInPlace(path, 0, id3v24Tag(frames, old.length - bare.length));
    return 'inPlace';
  }
  await rewrite(path, id3v24Tag(frames, REWRITE_PADDING), old?.length ?? 0);
  return 'rewritten';
}
