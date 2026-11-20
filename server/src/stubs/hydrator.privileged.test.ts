/**
 * Hydration under a real fanotify mark, in the image, as root with CAP_SYS_ADMIN: a child's open of
 * a fixture stub returns only once the file holds the recorded enclosure's bytes, and a stalled
 * hydration holds up no other open.
 *
 * Runs only in CI's privileged job (node:test, as the image carries no vitest), with a tmpfs at
 * STUBS_TEST_ROOT and the recording mounted at STUBS_TEST_ENCLOSURE. A local server serves the
 * recording; it is a loopback address, so the guarded fetch is stood in for by a plain one (the
 * guard has its own tests).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { closeSync, readFileSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { XATTR } from './format.js';
import { Hydrator } from './hydrator.js';
import {
  FAN_CLASS_CONTENT,
  FAN_CLOEXEC,
  FAN_MARK_ADD,
  FAN_MARK_FILESYSTEM,
  FAN_NONBLOCK,
  FAN_ACCESS_PERM,
  fanotifyInit,
  fanotifyMark,
  fanotifyRespond,
  getxattr,
  O_CLOEXEC,
  O_LARGEFILE,
  O_RDWR,
  pollReadable,
  readFanotifyEvents,
  setxattr,
} from './libc.js';

const root = process.env.STUBS_TEST_ROOT;
const enclosurePath = process.env.STUBS_TEST_ENCLOSURE;
const PREFIX = 4096;

/** Serves the recording whole, once `gate` resolves. */
async function enclosureServer(bytes: Buffer, gate: Promise<void> = Promise.resolve()) {
  const server = createServer((_req, res) => {
    void gate.then(() => {
      res.writeHead(200, { 'content-length': String(bytes.length) });
      res.end(bytes);
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/episode.mp3`;
  return { server, url };
}

/** Arms a mark on the root and hands every open to a hydrator, as main.ts does. */
function armed() {
  const group = fanotifyInit(
    FAN_CLOEXEC | FAN_NONBLOCK | FAN_CLASS_CONTENT,
    O_RDWR | O_LARGEFILE | O_CLOEXEC,
  );
  fanotifyMark(group, FAN_MARK_ADD | FAN_MARK_FILESYSTEM, FAN_ACCESS_PERM, root!);
  const hydrator = new Hydrator({
    ownPid: process.pid,
    respond: (fd, answer) => fanotifyRespond(group, fd, answer),
    fetchEnclosure: (url, init) => fetch(url, init?.signal ? { signal: init.signal } : {}),
    pauseMarker: join(root!, 'no-such-marker'),
    log: () => {},
  });
  let stopped = false;
  const reading = (async () => {
    while (!stopped) {
      if (!(await pollReadable(group, 200)) || stopped) continue;
      for (const event of readFanotifyEvents(group)) hydrator.handle(event);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await reading;
      await hydrator.settled();
      closeSync(group);
    },
  };
}

function fixtureStub(name: string, bytes: Buffer, url: string): string {
  const path = join(root!, name);
  writeFileSync(path, bytes.subarray(0, PREFIX));
  truncateSync(path, bytes.length);
  setxattr(path, XATTR.url, url);
  setxattr(path, XATTR.length, String(bytes.length));
  setxattr(path, XATTR.prefixLen, String(PREFIX));
  return path;
}

/** Runs a child and gives its stdout and exit code. */
function run(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise<{ code: number | null; out: Buffer }>((resolve) =>
    child.on('exit', (code) => resolve({ code, out: Buffer.concat(chunks) })),
  );
}

test(
  '[M3.stubs/c] a child’s open of a stub returns once the recorded enclosure fills it',
  { skip: !root || !enclosurePath },
  async () => {
    const bytes = readFileSync(enclosurePath!);
    const { server, url } = await enclosureServer(bytes);
    const stub = fixtureStub('episode.mp3', bytes, url);
    const hydration = armed();
    try {
      const { code, out } = await run('cat', [stub]);
      assert.equal(code, 0);
      assert.ok(out.equals(bytes), 'the reader sees the whole episode, not the prefix and a hole');
      assert.equal(getxattr(stub, XATTR.url), null);
      assert.equal(getxattr(stub, XATTR.origUrl), url);
      assert.equal(getxattr(stub, XATTR.origLength), String(bytes.length));
      assert.ok(statSync(stub).blocks * 512 >= bytes.length);
    } finally {
      await hydration.stop();
      server.close();
    }
  },
);

test(
  '[M3.stubs/c] 500 unrelated opens during a stalled hydration are all answered',
  { skip: !root || !enclosurePath },
  async () => {
    const bytes = readFileSync(enclosurePath!);
    let release: () => void = () => {};
    const gate = new Promise<void>((done) => (release = done));
    const { server, url } = await enclosureServer(bytes, gate);
    const stub = fixtureStub('stalled.mp3', bytes, url);
    const plain = join(root!, 'plain.txt');
    writeFileSync(plain, 'not a stub');
    const hydration = armed();
    try {
      const stalled = run('cat', [stub]);
      const others = await run('sh', [
        '-c',
        `i=0; while [ $i -lt 500 ]; do cat ${plain} > /dev/null || exit 1; i=$((i+1)); done; echo $i`,
      ]);
      assert.equal(others.code, 0);
      assert.equal(others.out.toString().trim(), '500');
      assert.equal(getxattr(stub, XATTR.url), url, 'the stalled stub is still waiting');

      release();
      const { code, out } = await stalled;
      assert.equal(code, 0);
      assert.ok(out.equals(bytes));
    } finally {
      release();
      await hydration.stop();
      server.close();
    }
  },
);
