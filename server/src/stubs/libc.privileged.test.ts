/**
 * fanotify from Node, in the image, as root with CAP_SYS_ADMIN: a permission mark on a whole
 * filesystem holds a child process's open until the listener answers, the event's file descriptor
 * reads the file's extended attributes, and the answer lets the open go ahead.
 *
 * Needs the privilege, so it runs only in CI's privileged job, inside the built image with a tmpfs
 * at STUBS_TEST_ROOT (node:test, as the image carries no vitest):
 * `docker run --user root --cap-add SYS_ADMIN --tmpfs /media -e STUBS_TEST_ROOT=/media ...
 *  node --import tsx --test src/stubs/libc.privileged.test.ts`
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { closeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import {
  FAN_ALLOW,
  FAN_CLASS_CONTENT,
  FAN_CLOEXEC,
  FAN_MARK_ADD,
  FAN_MARK_FILESYSTEM,
  FAN_NONBLOCK,
  FAN_ACCESS_PERM,
  type FanotifyEvent,
  fanotifyInit,
  fanotifyMark,
  fanotifyRespond,
  fgetxattr,
  O_CLOEXEC,
  O_LARGEFILE,
  O_RDWR,
  readFanotifyEvents,
  setxattr,
} from './libc.js';

const root = process.env.STUBS_TEST_ROOT;

test(
  '[M3.stubs] a permission mark holds a child’s read until it is allowed, and an open that never reads passes untouched',
  { skip: !root },
  async () => {
    const file = join(root!, 'stub.mp3');
    writeFileSync(file, 'the prefix');
    setxattr(file, 'user.absstub.url', 'https://example.org/episode.mp3');

    const group = fanotifyInit(
      FAN_CLOEXEC | FAN_NONBLOCK | FAN_CLASS_CONTENT,
      O_RDWR | O_LARGEFILE | O_CLOEXEC,
    );
    try {
      fanotifyMark(group, FAN_MARK_ADD | FAN_MARK_FILESYSTEM, FAN_ACCESS_PERM, root!);

      // Nobody answers this group yet: an open that never reads must still return.
      const opener = spawn('sh', ['-c', `exec 3< '${file}'; exec 3<&-`], { stdio: 'inherit' });
      assert.equal(await new Promise((done) => opener.on('exit', done)), 0);
      assert.deepEqual(readFanotifyEvents(group), [], 'an open that never reads raises no event');

      const child = spawn('cat', [file], { stdio: ['ignore', 'pipe', 'inherit'] });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
      const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));

      let event: FanotifyEvent | undefined;
      for (let tries = 0; event === undefined && tries < 1000; tries++) {
        for (const each of readFanotifyEvents(group)) {
          if (each.pid === child.pid && event === undefined) event = each;
          else {
            fanotifyRespond(group, each.fd, FAN_ALLOW);
            closeSync(each.fd);
          }
        }
        if (event === undefined) await sleep(5);
      }
      assert.ok(event, 'the child’s read arrives as an event');
      assert.equal(event.mask & FAN_ACCESS_PERM, FAN_ACCESS_PERM);
      assert.equal(fgetxattr(event.fd, 'user.absstub.url'), 'https://example.org/episode.mp3');

      await sleep(300);
      assert.equal(child.exitCode, null, 'the read waits for the answer');

      fanotifyRespond(group, event.fd, FAN_ALLOW);
      closeSync(event.fd);
      assert.equal(await exited, 0);
      assert.equal(output, 'the prefix');
    } finally {
      closeSync(group);
    }
  },
);
