/**
 * The two ways a tag writer changes a file. In place: the new metadata over the old, in one write,
 * nothing after it touched. Rewritten: new metadata, then the file's own bytes from where its
 * audio starts, unchanged, into a file beside it that then takes its name, so a failure on the way
 * leaves the old file whole.
 *
 * A rewrite keeps the audio on the disk blocks it shares with the torrent it was cloned from: the
 * writer pads its head (`rewritePadding`) so the audio starts at the same offset modulo 4 KiB as
 * before, the bytes up to the source's first 4 KiB boundary are written, and the rest is cloned
 * (cloneRange.ts). Where the filesystem cannot clone, the rest is copied.
 */
import { open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pythonCloneRange, type RangeClone } from './cloneRange.js';

/** How a writer changed the file. */
export type TagWrite = 'inPlace' | 'rewritten';

/** The room a rewrite leaves for later tags, at least. */
export const REWRITE_PADDING = 8192;

/** The block a clone shares: btrfs's sector. */
export const BLOCK_SIZE = 4096;

/**
 * The padding a rewritten head of `length` bytes before its padding takes, so the audio, which
 * started at `from`, starts at the same offset modulo 4 KiB: at least `REWRITE_PADDING`.
 */
export function rewritePadding(length: number, from: number): number {
  const short = (from - length - REWRITE_PADDING) % BLOCK_SIZE;
  return REWRITE_PADDING + ((short + BLOCK_SIZE) % BLOCK_SIZE);
}

export async function writeInPlace(path: string, position: number, bytes: Buffer): Promise<void> {
  const file = await open(path, 'r+');
  try {
    await file.write(bytes, 0, bytes.length, position);
    await file.sync();
  } finally {
    await file.close();
  }
}

/**
 * Writes `head`, then `path`'s bytes from `from` on, as `path`, keeping its mode. The aligned part
 * of those bytes is cloned with `clone` when `head` leaves it aligned.
 */
export async function rewrite(
  path: string,
  head: Buffer,
  from: number,
  clone: RangeClone = pythonCloneRange(),
): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.auralis-tagging`);
  const source = await open(path, 'r');
  try {
    const { mode, size } = await source.stat();
    const boundary = Math.ceil(from / BLOCK_SIZE) * BLOCK_SIZE;
    const aligned = head.length % BLOCK_SIZE === from % BLOCK_SIZE && boundary < size;
    const target = await open(temporary, 'w');
    try {
      await target.chmod(mode & 0o7777);
      await target.write(head);
      const copy = async (start: number, end?: number) => {
        const range = end === undefined ? { start } : { start, end: end - 1 };
        for await (const chunk of source.createReadStream({ ...range, autoClose: false })) {
          await target.write(chunk as Buffer);
        }
      };
      if (!aligned) await copy(from);
      else {
        if (boundary > from) await copy(from, boundary);
        const targetOffset = head.length + boundary - from;
        const range = { sourceOffset: boundary, length: size - boundary, targetOffset };
        await target.datasync();
        if (!(await clone(path, temporary, range))) {
          await target.truncate(targetOffset);
          await copy(boundary);
        }
      }
      await target.sync();
    } finally {
      await target.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await source.close();
  }
}
