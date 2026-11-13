/**
 * The two ways a tag writer changes a file. In place: the new metadata over the old, in one write,
 * nothing after it touched. Rewritten: new metadata, then the file's own bytes from where its
 * audio starts, copied unchanged, into a file beside it that then takes its name, so a failure on
 * the way leaves the old file whole.
 */
import { open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** How a writer changed the file. */
export type TagWrite = 'inPlace' | 'rewritten';

/** The room a rewrite leaves for later tags. */
export const REWRITE_PADDING = 8192;

export async function writeInPlace(path: string, position: number, bytes: Buffer): Promise<void> {
  const file = await open(path, 'r+');
  try {
    await file.write(bytes, 0, bytes.length, position);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Writes `head`, then `path`'s bytes from `from` on, as `path`, keeping its mode. */
export async function rewrite(path: string, head: Buffer, from: number): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.auralis-tagging`);
  const source = await open(path, 'r');
  try {
    const { mode } = await source.stat();
    const target = await open(temporary, 'w');
    try {
      await target.chmod(mode & 0o7777);
      await target.write(head);
      for await (const chunk of source.createReadStream({ start: from, autoClose: false })) {
        await target.write(chunk as Buffer);
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
