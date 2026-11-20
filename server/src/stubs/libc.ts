/**
 * The libc calls the stubs sidecar needs and Node lacks: fanotify, extended attributes on a file
 * descriptor or a path, and punching a hole in a file. This is the one file that touches koffi, the
 * FFI whose prebuilt binaries cover glibc and musl (the image's `node:22-alpine`). The symbols come
 * from the libc Node itself links, so the same code runs on both.
 *
 * Every call throws a `LibcError` carrying the errno when libc answers -1, except a missing
 * attribute, which reads as `null`.
 */
import { readSync, writeSync } from 'node:fs';
import koffi from 'koffi';

/** fanotify_init flags (linux/fanotify.h). */
export const FAN_CLOEXEC = 0x01;
export const FAN_NONBLOCK = 0x02;
export const FAN_CLASS_CONTENT = 0x04;
export const FAN_UNLIMITED_QUEUE = 0x10;
export const FAN_UNLIMITED_MARKS = 0x20;

/** fanotify_mark flags and the one event mask the sidecar uses. */
export const FAN_MARK_ADD = 0x01;
export const FAN_MARK_REMOVE = 0x02;
export const FAN_MARK_FILESYSTEM = 0x100;
/** A read of a marked file waits for an answer; an open that never reads raises nothing. */
export const FAN_ACCESS_PERM = 0x20000;

/** A permission event's answers. */
export const FAN_ALLOW = 0x01;
export const FAN_DENY = 0x02;

/** open(2) flags for the event's file descriptor, as x86-64 and arm64 number them. */
export const O_RDONLY = 0;
export const O_RDWR = 2;
export const O_LARGEFILE = 0o100000;
export const O_CLOEXEC = 0o2000000;

/** fallocate(2) mode: free the range's blocks, keep the file's size. */
export const FALLOC_FL_KEEP_SIZE = 0x01;
export const FALLOC_FL_PUNCH_HOLE = 0x02;

const AT_FDCWD = -100;
const ENODATA = 61;
const FANOTIFY_METADATA_VERSION = 3;
const EVENT_METADATA_LEN = 24;
const ERANGE = 34;
const EINTR = 4;

/** A libc call answered -1. */
export class LibcError extends Error {
  constructor(
    readonly call: string,
    readonly errno: number,
  ) {
    super(`${call} failed: errno ${errno}`);
    this.name = 'LibcError';
  }
}

const libc = koffi.load(null);
const c = {
  fanotifyInit: libc.func('int fanotify_init(unsigned int flags, unsigned int event_f_flags)'),
  fanotifyMark: libc.func(
    'int fanotify_mark(int fd, unsigned int flags, uint64_t mask, int dirfd, const char *path)',
  ),
  fgetxattr: libc.func(
    'intptr_t fgetxattr(int fd, const char *name, _Out_ void *value, size_t size)',
  ),
  fsetxattr: libc.func(
    'int fsetxattr(int fd, const char *name, const void *value, size_t size, int flags)',
  ),
  fremovexattr: libc.func('int fremovexattr(int fd, const char *name)'),
  getxattr: libc.func(
    'intptr_t getxattr(const char *path, const char *name, _Out_ void *value, size_t size)',
  ),
  setxattr: libc.func(
    'int setxattr(const char *path, const char *name, const void *value, size_t size, int flags)',
  ),
  removexattr: libc.func('int removexattr(const char *path, const char *name)'),
  fallocate: libc.func('int fallocate(int fd, int mode, int64_t offset, int64_t len)'),
  utimensat: libc.func('int utimensat(int dirfd, const char *path, const void *times, int flags)'),
  poll: libc.func('int poll(_Inout_ void *fds, unsigned long nfds, int timeout)'),
};

function check(call: string, result: number | bigint): number {
  const n = Number(result);
  if (n < 0) throw new LibcError(call, koffi.errno());
  return n;
}

/** A new fanotify group's file descriptor. */
export function fanotifyInit(flags: number, eventFlags: number): number {
  return check('fanotify_init', c.fanotifyInit(flags, eventFlags) as number);
}

/** Adds or removes a mark: `mask` events on `path`, the whole filesystem with FAN_MARK_FILESYSTEM. */
export function fanotifyMark(fd: number, flags: number, mask: number, path: string): void {
  check('fanotify_mark', c.fanotifyMark(fd, flags, BigInt(mask), AT_FDCWD, path) as number);
}

/** One fanotify event: what happened, to which open file, by which process. */
export interface FanotifyEvent {
  readonly mask: number;
  /** The file, opened for the listener with the group's event flags; the listener closes it. */
  readonly fd: number;
  readonly pid: number;
}

/**
 * The events waiting on `fd`: none when a non-blocking group has none. A blocking group waits for
 * at least one.
 */
export function readFanotifyEvents(fd: number, buffer = Buffer.alloc(64 * 1024)): FanotifyEvent[] {
  let length: number;
  try {
    length = readSync(fd, buffer, 0, buffer.length, null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EAGAIN') return [];
    throw error;
  }
  const events: FanotifyEvent[] = [];
  for (let at = 0; at + EVENT_METADATA_LEN <= length;) {
    const eventLength = buffer.readUInt32LE(at);
    const version = buffer.readUInt8(at + 4);
    if (version !== FANOTIFY_METADATA_VERSION) {
      throw new Error(
        `fanotify metadata version ${version}, expected ${FANOTIFY_METADATA_VERSION}`,
      );
    }
    events.push({
      mask: Number(buffer.readBigUInt64LE(at + 8)),
      fd: buffer.readInt32LE(at + 16),
      pid: buffer.readInt32LE(at + 20),
    });
    at += eventLength;
  }
  return events;
}

/** Answers a permission event: FAN_ALLOW lets the open go ahead, FAN_DENY fails it. */
export function fanotifyRespond(groupFd: number, eventFd: number, response: number): void {
  const answer = Buffer.alloc(8);
  answer.writeInt32LE(eventFd, 0);
  answer.writeUInt32LE(response, 4);
  writeSync(groupFd, answer);
}

function readXattr(call: string, get: (value: Buffer | null, size: number) => number | bigint) {
  for (;;) {
    const size = Number(get(null, 0));
    if (size < 0) {
      const errno = koffi.errno();
      if (errno === ENODATA) return null;
      throw new LibcError(call, errno);
    }
    const value = Buffer.alloc(size);
    const read = Number(get(value, size));
    if (read >= 0) return value.subarray(0, read).toString('utf8');
    const errno = koffi.errno();
    if (errno === ENODATA) return null;
    // It grew between the two calls; ask again.
    if (errno !== ERANGE) throw new LibcError(call, errno);
  }
}

/** The attribute's value on an open file, or null when it has none. */
export function fgetxattr(fd: number, name: string): string | null {
  return readXattr('fgetxattr', (value, size) => c.fgetxattr(fd, name, value, size) as number);
}

/** Sets the attribute on an open file. */
export function fsetxattr(fd: number, name: string, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  check('fsetxattr', c.fsetxattr(fd, name, bytes, bytes.length, 0) as number);
}

/** Removes the attribute from an open file; one it does not have is no error. */
export function fremovexattr(fd: number, name: string): void {
  if (Number(c.fremovexattr(fd, name)) < 0 && koffi.errno() !== ENODATA) {
    throw new LibcError('fremovexattr', koffi.errno());
  }
}

/** The attribute's value on a path, or null when it has none. */
export function getxattr(path: string, name: string): string | null {
  return readXattr('getxattr', (value, size) => c.getxattr(path, name, value, size) as number);
}

/** Sets the attribute on a path. */
export function setxattr(path: string, name: string, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  check('setxattr', c.setxattr(path, name, bytes, bytes.length, 0) as number);
}

/** Removes the attribute from a path; one it does not have is no error. */
export function removexattr(path: string, name: string): void {
  if (Number(c.removexattr(path, name)) < 0 && koffi.errno() !== ENODATA) {
    throw new LibcError('removexattr', koffi.errno());
  }
}

/** Frees the blocks of `length` bytes from `offset`, keeping the file's size: the range reads as zeros. */
export function punchHole(fd: number, offset: number, length: number): void {
  check(
    'fallocate',
    c.fallocate(
      fd,
      FALLOC_FL_PUNCH_HOLE | FALLOC_FL_KEEP_SIZE,
      BigInt(offset),
      BigInt(length),
    ) as number,
  );
}

/**
 * Sets a path's access and modification times to the nanosecond, as `os.utime(ns=...)` did in the
 * old daemon: Node's own `utimes` goes through a double and loses the last digits.
 */
export function setTimesNs(path: string, atimeNs: bigint, mtimeNs: bigint): void {
  const times = Buffer.alloc(32);
  times.writeBigInt64LE(atimeNs / 1_000_000_000n, 0);
  times.writeBigInt64LE(atimeNs % 1_000_000_000n, 8);
  times.writeBigInt64LE(mtimeNs / 1_000_000_000n, 16);
  times.writeBigInt64LE(mtimeNs % 1_000_000_000n, 24);
  check('utimensat', c.utimensat(AT_FDCWD, path, times, 0) as number);
}

const POLLIN = 0x01;

/**
 * Waits, off the main thread, until `fd` has something to read or `timeoutMs` passes: true when it
 * is readable. The main thread stays free, so the sidecar's own opens (answered by this same
 * process) never wait on it.
 */
export function pollReadable(fd: number, timeoutMs: number): Promise<boolean> {
  const fds = Buffer.alloc(8);
  fds.writeInt32LE(fd, 0);
  fds.writeInt16LE(POLLIN, 4);
  return new Promise((resolve, reject) => {
    c.poll.async(fds, 1, timeoutMs, (error: unknown, result: number) => {
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else if (result < 0) {
        const errno = koffi.errno();
        // A signal woke it: nothing to read yet.
        if (errno === EINTR) resolve(false);
        else reject(new LibcError('poll', errno));
      } else resolve(result > 0 && (fds.readInt16LE(6) & POLLIN) !== 0);
    });
  });
}
