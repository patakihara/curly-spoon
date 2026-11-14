/**
 * Cloning part of one file into another: the `FICLONERANGE` ioctl, which on btrfs makes the
 * target's range share the source's disk blocks. Node has no ioctl, so a one-line `python3` makes
 * the call (the image carries it for this alone). Every refusal (no python3, a filesystem that
 * cannot clone, an offset not on a 4 KiB boundary) answers false, and the caller copies instead.
 */
import { execFile } from 'node:child_process';

export interface CloneRange {
  /** Where the range starts in the source; a multiple of 4 KiB. */
  readonly sourceOffset: number;
  /** How many bytes; a multiple of 4 KiB unless the range ends at the source's end. */
  readonly length: number;
  /** Where the range lands in the target; a multiple of 4 KiB. */
  readonly targetOffset: number;
}

/** Clones `range` of `source` into `target`: true when done, false when refused. */
export type RangeClone = (source: string, target: string, range: CloneRange) => Promise<boolean>;

/** `_IOW(0x94, 13, struct file_clone_range)`: src_fd s64, src_offset, src_length, dest_offset u64. */
const SCRIPT = [
  'import fcntl, os, struct, sys',
  's = os.open(sys.argv[1], os.O_RDONLY)',
  'd = os.open(sys.argv[2], os.O_WRONLY)',
  'fcntl.ioctl(d, 0x4020940D, struct.pack("=qQQQ", s, *map(int, sys.argv[3:6])))',
].join('\n');

/** The real range clone, through `python` (only a test names another). */
export function pythonCloneRange(python = 'python3'): RangeClone {
  return (source, target, range) =>
    new Promise((resolve) => {
      execFile(
        python,
        [
          '-I',
          '-c',
          SCRIPT,
          source,
          target,
          String(range.sourceOffset),
          String(range.length),
          String(range.targetOffset),
        ],
        { timeout: 60_000 },
        (error) => resolve(error === null),
      );
    });
}
