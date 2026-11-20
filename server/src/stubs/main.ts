/**
 * The stubs sidecar's entry: the image's second command, run as root with CAP_SYS_ADMIN and no
 * port (`node --import tsx src/stubs/main.ts`). For now it arms fanotify on the media root and
 * allows every open, logging `armed` once it holds the mark: the proof that the binding runs in the
 * image. Hydration, the job and dehydration arrive in later parts of M3.stubs.
 *
 * Every open is allowed: an error answering one never fails a reader. SIGTERM closes the group,
 * which allows anything still waiting, and exits 0.
 */
import { closeSync } from 'node:fs';
import {
  FAN_ALLOW,
  FAN_CLASS_CONTENT,
  FAN_CLOEXEC,
  FAN_MARK_ADD,
  FAN_MARK_FILESYSTEM,
  FAN_NONBLOCK,
  FAN_OPEN_PERM,
  FAN_UNLIMITED_MARKS,
  FAN_UNLIMITED_QUEUE,
  fanotifyInit,
  fanotifyMark,
  fanotifyRespond,
  O_CLOEXEC,
  O_LARGEFILE,
  O_RDONLY,
  readFanotifyEvents,
} from './libc.js';

const root = process.env.STUBS_ROOT ?? '/media';
/** How long the reader sleeps when nothing waits; part C replaces the poll with a blocking reader. */
const IDLE_MS = 5;

const group = fanotifyInit(
  FAN_CLOEXEC | FAN_NONBLOCK | FAN_CLASS_CONTENT | FAN_UNLIMITED_QUEUE | FAN_UNLIMITED_MARKS,
  O_RDONLY | O_LARGEFILE | O_CLOEXEC,
);
fanotifyMark(group, FAN_MARK_ADD | FAN_MARK_FILESYSTEM, FAN_OPEN_PERM, root);
process.stdout.write(`stubs: armed on ${root}\n`);

let stopped = false;
let answered = 0;
const buffer = Buffer.alloc(64 * 1024);

function drain(): void {
  if (stopped) return;
  const events = readFanotifyEvents(group, buffer);
  for (const event of events) {
    try {
      fanotifyRespond(group, event.fd, FAN_ALLOW);
      answered += 1;
    } finally {
      closeSync(event.fd);
    }
  }
  setTimeout(drain, events.length > 0 ? 0 : IDLE_MS);
}
drain();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopped = true;
    closeSync(group);
    process.stdout.write(`stubs: stopped after ${answered} opens\n`);
    process.exit(0);
  });
}
