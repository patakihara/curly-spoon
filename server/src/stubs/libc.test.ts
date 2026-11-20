/**
 * The libc binding on a real temp file: extended attributes set, read back and removed, through a
 * path and through an open file, and a punched hole that keeps the file's size and frees its blocks.
 * fanotify needs CAP_SYS_ADMIN, so it is proven in CI's privileged job (libc.privileged.test.ts).
 */
import {
  closeSync,
  constants,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fgetxattr,
  fremovexattr,
  fsetxattr,
  getxattr,
  LibcError,
  pollReadable,
  punchHole,
  removexattr,
  setxattr,
} from './libc.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-libc-'));
  file = join(dir, 'episode.mp3');
  writeFileSync(file, 'audio');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('[M3.stubs] extended attributes', () => {
  it('[M3.stubs] a path’s attribute reads back as set, and as null once removed', () => {
    expect(getxattr(file, 'user.absstub.url')).toBeNull();
    setxattr(file, 'user.absstub.url', 'https://example.org/ep 1.mp3?ä');
    expect(getxattr(file, 'user.absstub.url')).toBe('https://example.org/ep 1.mp3?ä');
    removexattr(file, 'user.absstub.url');
    expect(getxattr(file, 'user.absstub.url')).toBeNull();
  });

  it('[M3.stubs] an open file’s attribute reads back as set, and as null once removed', () => {
    const fd = openSync(file, 'r+');
    try {
      fsetxattr(fd, 'user.absstub.length', '123456789');
      expect(fgetxattr(fd, 'user.absstub.length')).toBe('123456789');
      expect(getxattr(file, 'user.absstub.length')).toBe('123456789');
      fremovexattr(fd, 'user.absstub.length');
      expect(fgetxattr(fd, 'user.absstub.length')).toBeNull();
    } finally {
      closeSync(fd);
    }
  });

  it('[M3.stubs] an empty value is a value, not a missing attribute', () => {
    setxattr(file, 'user.absstub.keep', '');
    expect(getxattr(file, 'user.absstub.keep')).toBe('');
  });

  it('[M3.stubs] removing an attribute the file lacks is no error', () => {
    expect(() => removexattr(file, 'user.absstub.url')).not.toThrow();
  });

  it('[M3.stubs] a missing file throws with its errno', () => {
    const missing = join(dir, 'gone.mp3');
    expect(() => getxattr(missing, 'user.absstub.url')).toThrow(LibcError);
    const thrown = (() => {
      try {
        setxattr(missing, 'user.absstub.url', 'x');
      } catch (error) {
        return error;
      }
    })();
    expect(thrown).toMatchObject({ call: 'setxattr', errno: 2 });
  });
});

describe('[M3.stubs] punching a hole', () => {
  it('[M3.stubs] keeps the size and the prefix, frees the blocks, and the rest reads as zeros', () => {
    const size = 4 * 1024 * 1024;
    const prefix = 128 * 1024;
    const bytes = Buffer.alloc(size);
    for (let i = 0; i < size; i++) bytes[i] = (i % 251) + 1;
    writeFileSync(file, bytes);
    const before = statSync(file);

    const fd = openSync(file, 'r+');
    try {
      punchHole(fd, prefix, size - prefix);
    } finally {
      closeSync(fd);
    }

    const after = statSync(file);
    expect(after.size).toBe(size);
    expect(after.blocks * 512).toBeLessThan(prefix + 64 * 1024);
    expect(after.blocks).toBeLessThan(before.blocks);
    const read = readFileSync(file);
    expect(read.subarray(0, prefix).equals(bytes.subarray(0, prefix))).toBe(true);
    expect(read.subarray(prefix).every((b) => b === 0)).toBe(true);
  });
});

describe('[M3.stubs] waiting for something to read', () => {
  it('[M3.stubs] answers false after the timeout when nothing comes, and true once it does', async () => {
    const fifo = join(dir, 'events');
    execFileSync('mkfifo', [fifo]);
    // Read-write, so the open never waits for a writer.
    const fd = openSync(fifo, constants.O_RDWR | constants.O_NONBLOCK);
    try {
      const started = Date.now();
      expect(await pollReadable(fd, 50)).toBe(false);
      expect(Date.now() - started).toBeGreaterThanOrEqual(40);

      const waiting = pollReadable(fd, 5000);
      writeSync(fd, 'x');
      expect(await waiting).toBe(true);
    } finally {
      closeSync(fd);
    }
  });
});
