/**
 * The stubs sidecar's entry: the image's second command, run as root with CAP_SYS_ADMIN and no
 * port (`node --import tsx src/stubs/main.ts`). The image sets `UV_THREADPOOL_SIZE=8`: the reader
 * holds one libuv thread while it waits for events, and the job's file work needs the rest. It arms fanotify on the media root, logging
 * `armed` once it holds the mark (`FAN_ACCESS_PERM`, as the old daemon ran), and hands every read to
 * the hydrator (hydrator.ts): a stub's read waits until its enclosure fills it, every other read
 * is allowed at once; an open that never reads raises nothing. The job and dehydration
 * arrive in later parts of M3.stubs.
 *
 * The reader waits for events off the main thread (`pollReadable`), so the main thread is always
 * free to answer, including this process's own opens. Event descriptors are read-write: hydration
 * writes through them. SIGTERM closes the group, which allows anything still waiting, and exits 0.
 *
 * Switches: `STUBS_ROOT` (default `/media`), `STUBS_MODE=passive` (allow every open, hydrate
 * nothing), `STUBS_CONTROL` (default `/control`, where the job's pause marker lives).
 */
import { closeSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { join } from 'node:path';
import { enclosureFetch } from '../adapters/http/publicFetch.js';
import { Hydrator } from './hydrator.js';
import {
  FAN_CLASS_CONTENT,
  FAN_CLOEXEC,
  FAN_MARK_ADD,
  FAN_MARK_FILESYSTEM,
  FAN_NONBLOCK,
  FAN_ACCESS_PERM,
  FAN_UNLIMITED_MARKS,
  FAN_UNLIMITED_QUEUE,
  fanotifyInit,
  fanotifyMark,
  fanotifyRespond,
  O_CLOEXEC,
  O_LARGEFILE,
  O_RDWR,
  pollReadable,
  readFanotifyEvents,
} from './libc.js';

const root = process.env.STUBS_ROOT ?? '/media';
const control = process.env.STUBS_CONTROL ?? '/control';
/** How long one wait for events lasts before the reader looks at `stopped` again. */
const WAIT_MS = 1000;

const group = fanotifyInit(
  FAN_CLOEXEC | FAN_NONBLOCK | FAN_CLASS_CONTENT | FAN_UNLIMITED_QUEUE | FAN_UNLIMITED_MARKS,
  O_RDWR | O_LARGEFILE | O_CLOEXEC,
);
fanotifyMark(group, FAN_MARK_ADD | FAN_MARK_FILESYSTEM, FAN_ACCESS_PERM, root);
process.stdout.write(`stubs: armed on ${root}\n`);

let stopped = false;
let answered = 0;
const hydrator = new Hydrator({
  ownPid: process.pid,
  respond: (fd, answer) => {
    fanotifyRespond(group, fd, answer);
    answered += 1;
  },
  fetchEnclosure: enclosureFetch({
    lookup: async (host) => (await lookup(host, { all: true })).map(({ address }) => address),
  }),
  mode: process.env.STUBS_MODE,
  pauseMarker: join(control, 'pause-hydration'),
  log: (line) => process.stdout.write(`${line}\n`),
});

async function read(): Promise<void> {
  const buffer = Buffer.alloc(64 * 1024);
  while (!stopped) {
    try {
      if (!(await pollReadable(group, WAIT_MS)) || stopped) continue;
      for (const event of readFanotifyEvents(group, buffer)) hydrator.handle(event);
    } catch (error) {
      if (stopped) return;
      process.stdout.write(`stubs: reading events failed: ${String(error)}\n`);
      await new Promise((done) => setTimeout(done, 100));
    }
  }
}
void read();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopped = true;
    closeSync(group);
    process.stdout.write(`stubs: stopped after ${answered} opens\n`);
    process.exit(0);
  });
}
