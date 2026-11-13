/**
 * How an album's file gets from the torrent into staging: a clone, `copyFile` with
 * `COPYFILE_FICLONE_FORCE`, which on btrfs makes a file sharing the torrent's disk blocks until one
 * side is written (proved live inside the container, from Downloads to `.auralis-albums`). Tagging
 * the clone writes only the blocks it changes, and the torrent's own file, still seeding, is never
 * touched. A filesystem that cannot clone refuses (`EOPNOTSUPP`, `EXDEV`): the import fails, and
 * never falls back to a plain copy, which would double the album on disk.
 */
import { constants, copyFile } from 'node:fs/promises';
import { AlbumRefused } from './refused.js';

/** Makes `to` (which must not be there) a file of `from`'s bytes. */
export type Clone = (from: string, to: string) => Promise<void>;

/** The errors a filesystem answers a clone it cannot make with. */
const CANNOT_CLONE = new Set(['EOPNOTSUPP', 'ENOTSUP', 'EXDEV', 'ENOSYS', 'EINVAL']);

/** The real clone, through `copy` (only a test passes its own). */
export function reflinkClone(copy: typeof copyFile = copyFile): Clone {
  return (from, to) => copy(from, to, constants.COPYFILE_FICLONE_FORCE | constants.COPYFILE_EXCL);
}

/** Clones with `clone`, a refusal to clone as `AlbumRefused('cloneRefused')`. */
export async function cloned(clone: Clone, from: string, to: string): Promise<void> {
  try {
    await clone(from, to);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== undefined && CANNOT_CLONE.has(code)) throw new AlbumRefused('cloneRefused');
    throw error;
  }
}
