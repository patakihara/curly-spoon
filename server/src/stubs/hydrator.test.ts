/**
 * Hydration on open, on real temp files with an injected event source: each "open" is a descriptor
 * on a fixture stub, handed over as fanotify would, and the answer is noted with the file as it
 * stood at that moment. The privileged half, a real child's open held by a real mark, runs in CI
 * (hydrator.privileged.test.ts).
 *
 * The enclosure is the recorded MP3 (audiobookshelf/recordings/multi-file.mp3).
 */
import {
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  enclosureFetch,
  type EnclosureFetch,
  type PinnedRequest,
} from '../adapters/http/publicFetch.js';
import { DEFAULT_PREFIX, XATTR } from './format.js';
import { Hydrator, InodeLocks } from './hydrator.js';
import { FAN_ALLOW, getxattr, setxattr } from './libc.js';

const enclosure = readFileSync(
  new URL('../adapters/audiobookshelf/recordings/multi-file.mp3', import.meta.url),
);
const URL_ = 'https://cdn.example/show/episode-1.mp3?token=secret';
const PREFIX = 4096;
const NOW = Date.UTC(2026, 10, 20, 12);
const OWN_PID = 4242;
const READER_PID = 7;

let dir: string;
let marker: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-hydrator-'));
  marker = join(dir, 'pause-hydration');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A stub as the job writes it: the enclosure's prefix, a hole out to its length, the tags. */
function fixtureStub(name = 'episode.mp3', { prefixLen = true } = {}): string {
  const path = join(dir, name);
  writeFileSync(path, enclosure.subarray(0, PREFIX));
  truncateSync(path, enclosure.length);
  setxattr(path, XATTR.url, URL_);
  setxattr(path, XATTR.length, String(enclosure.length));
  if (prefixLen) setxattr(path, XATTR.prefixLen, String(PREFIX));
  return path;
}

interface Answer {
  fd: number;
  answer: number;
  /** The file's bytes when the open was answered. */
  bytes: Buffer;
  url: string | null;
  at: number;
}

/** A hydrator over injected opens, noting each answer and the file as it stood then. */
function harness(
  fetchEnclosure: EnclosureFetch,
  extra: { mode?: string; timeoutMs?: number } = {},
) {
  const answers: Answer[] = [];
  const paths = new Map<number, string>();
  const logs: string[] = [];
  const started = Date.now();
  const hydrator = new Hydrator({
    ownPid: OWN_PID,
    respond: (fd, answer) => {
      const path = paths.get(fd)!;
      answers.push({
        fd,
        answer,
        bytes: readFileSync(path),
        url: getxattr(path, XATTR.url),
        at: Date.now() - started,
      });
    },
    fetchEnclosure,
    mode: extra.mode,
    pauseMarker: marker,
    now: () => NOW,
    log: (line) => logs.push(line),
    ...(extra.timeoutMs !== undefined ? { timeoutMs: extra.timeoutMs } : {}),
  });
  /** One open of `path` by `pid`, as fanotify hands it over. */
  const open = (path: string, pid = READER_PID) => {
    const fd = openSync(path, 'r+');
    paths.set(fd, path);
    hydrator.handle({ mask: 0x10000, fd, pid });
    return fd;
  };
  return { hydrator, answers, open, logs };
}

/** An enclosure server answering the recording whole, noting each read. */
function recorded(): EnclosureFetch & { calls: string[] } {
  const calls: string[] = [];
  const fetch = (async (url: string) => {
    calls.push(url);
    return new Response(enclosure, {
      status: 200,
      headers: { 'content-length': String(enclosure.length) },
    });
  }) as EnclosureFetch & { calls: string[] };
  fetch.calls = calls;
  return fetch;
}

describe('[M3.stubs/c] an open of a stub', () => {
  it('[M3.stubs/c] is answered only once the enclosure’s audio fills the file, and the tags are flipped', async () => {
    const stub = fixtureStub();
    const fetch = recorded();
    const { hydrator, answers, open, logs } = harness(fetch);
    const fd = open(stub);
    expect(answers).toEqual([]);
    await hydrator.settled();

    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ fd, answer: FAN_ALLOW, url: null });
    expect(answers[0]!.bytes.equals(enclosure)).toBe(true);
    expect(fetch.calls).toEqual([URL_]);
    expect(getxattr(stub, XATTR.origUrl)).toBe(URL_);
    expect(getxattr(stub, XATTR.origLength)).toBe(String(enclosure.length));
    expect(getxattr(stub, XATTR.origPrefix)).toBe(String(PREFIX));
    expect(getxattr(stub, XATTR.hydratedAt)).toBe(String(Math.floor(NOW / 1000)));
    expect(getxattr(stub, XATTR.length)).toBeNull();
    expect(getxattr(stub, XATTR.prefixLen)).toBe(String(PREFIX));
    expect(logs.join('\n')).not.toContain('token=secret');
  });

  it('[M3.stubs/c] a dehydrated adopted file, with no prefix length, keeps 128 KB as its prefix', async () => {
    const stub = fixtureStub('adopted.mp3', { prefixLen: false });
    const { hydrator, open } = harness(recorded());
    open(stub);
    await hydrator.settled();
    expect(readFileSync(stub).equals(enclosure)).toBe(true);
    expect(getxattr(stub, XATTR.origPrefix)).toBe(String(DEFAULT_PREFIX));
  });

  it('[M3.stubs/c] two opens of one stub at once share one download', async () => {
    const stub = fixtureStub();
    const fetch = recorded();
    const { hydrator, answers, open } = harness(fetch);
    open(stub);
    open(stub);
    await hydrator.settled();
    expect(fetch.calls).toHaveLength(1);
    expect(answers.map((a) => a.bytes.equals(enclosure))).toEqual([true, true]);
  });

  it('[M3.stubs/c] a stub whole on disk but still tagged has its tags finished, with no download', async () => {
    const stub = fixtureStub();
    writeFileSync(stub, enclosure);
    const fetch = recorded();
    const { hydrator, open } = harness(fetch);
    open(stub);
    await hydrator.settled();
    expect(fetch.calls).toEqual([]);
    expect(getxattr(stub, XATTR.url)).toBeNull();
    expect(getxattr(stub, XATTR.origUrl)).toBe(URL_);
  });
});

describe('[M3.stubs/c] an open allowed at once, unhydrated', () => {
  it('[M3.stubs/c] this process’s own open of a stub', () => {
    const stub = fixtureStub();
    const fetch = recorded();
    const { answers, open } = harness(fetch);
    open(stub, OWN_PID);
    expect(answers).toHaveLength(1);
    expect(answers[0]!.url).toBe(URL_);
    expect(fetch.calls).toEqual([]);
  });

  it('[M3.stubs/c] any open while STUBS_MODE is passive', () => {
    const stub = fixtureStub();
    const fetch = recorded();
    const { answers, open } = harness(fetch, { mode: ' Passive ' });
    open(stub);
    expect(answers).toHaveLength(1);
    expect(fetch.calls).toEqual([]);
  });

  it('[M3.stubs/c] any open while a fresh pause marker stands', () => {
    const stub = fixtureStub();
    writeFileSync(marker, '');
    const fresh = (NOW - 60 * 60 * 1000) / 1000;
    utimesSync(marker, fresh, fresh);
    const fetch = recorded();
    const { answers, open } = harness(fetch);
    open(stub);
    expect(answers).toHaveLength(1);
    expect(getxattr(stub, XATTR.url)).toBe(URL_);
    expect(fetch.calls).toEqual([]);
  });

  it('[M3.stubs/c] a file with no stub tag', () => {
    const plain = join(dir, 'plain.mp3');
    writeFileSync(plain, enclosure);
    const fetch = recorded();
    const { answers, open } = harness(fetch);
    open(plain);
    expect(answers).toHaveLength(1);
    expect(fetch.calls).toEqual([]);
  });
});

describe('[M3.stubs/c] a pause marker left by a run that died', () => {
  it('[M3.stubs/c] older than 2 hours, is ignored and the stub hydrates', async () => {
    const stub = fixtureStub();
    writeFileSync(marker, '');
    const stale = (NOW - 2 * 3600 * 1000 - 1000) / 1000;
    utimesSync(marker, stale, stale);
    const { hydrator, answers, open } = harness(recorded());
    open(stub);
    await hydrator.settled();
    expect(answers[0]!.bytes.equals(enclosure)).toBe(true);
  });
});

describe('[M3.stubs/c] a hydration that fails still allows the open, and the file stays a stub', () => {
  /** The stub as it was: its tags, its prefix, the rest a hole. */
  function expectStillAStub(stub: string) {
    expect(getxattr(stub, XATTR.url)).toBe(URL_);
    expect(getxattr(stub, XATTR.hydratedAt)).toBeNull();
    const bytes = readFileSync(stub);
    expect(bytes.subarray(0, PREFIX).equals(enclosure.subarray(0, PREFIX))).toBe(true);
    expect(bytes.subarray(PREFIX).every((b) => b === 0)).toBe(true);
    expect(statSync(stub).size).toBe(enclosure.length);
  }

  it('[M3.stubs/c] an enclosure that throws', async () => {
    const stub = fixtureStub();
    const { hydrator, answers, open } = harness(async () => {
      throw new Error('connection reset');
    });
    open(stub);
    await hydrator.settled();
    expect(answers).toHaveLength(1);
    expect(answers[0]!.answer).toBe(FAN_ALLOW);
    expectStillAStub(stub);
  });

  it('[M3.stubs/c] an enclosure answering 404', async () => {
    const stub = fixtureStub();
    const { hydrator, answers, open } = harness(async () => new Response('gone', { status: 404 }));
    open(stub);
    await hydrator.settled();
    expect(answers).toHaveLength(1);
    expectStillAStub(stub);
  });

  it('[M3.stubs/c] a body shorter than its Content-Length, what it wrote freed again', async () => {
    const stub = fixtureStub();
    const { hydrator, answers, open } = harness(
      async () =>
        new Response(enclosure.subarray(0, enclosure.length - 5000), {
          status: 200,
          headers: { 'content-length': String(enclosure.length) },
        }),
    );
    open(stub);
    await hydrator.settled();
    expect(answers).toHaveLength(1);
    expectStillAStub(stub);
  });

  it('[M3.stubs/c] an enclosure that never answers, allowed at the deadline', async () => {
    const stub = fixtureStub();
    let aborted = false;
    const { hydrator, answers, open } = harness(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(init.signal?.reason);
          }),
        ),
      { timeoutMs: 100 },
    );
    open(stub);
    await hydrator.settled();
    expect(answers).toHaveLength(1);
    expect(answers[0]!.at).toBeGreaterThanOrEqual(90);
    expect(aborted).toBe(true);
    expectStillAStub(stub);
  });

  it('[M3.stubs/c] an enclosure redirecting to a private address is refused, never connected, and allowed', async () => {
    const stub = fixtureStub();
    setxattr(stub, XATTR.url, 'http://10.0.0.5/episode.mp3');
    const connected: string[] = [];
    const request = ((url: URL) => {
      connected.push(url.href);
      throw new Error('never reached');
    }) as unknown as PinnedRequest;
    const { hydrator, answers, open, logs } = harness(
      enclosureFetch({
        lookup: async () => ['10.0.0.5'],
        requests: { 'http:': request, 'https:': request },
      }),
    );
    open(stub);
    await hydrator.settled();
    expect(connected).toEqual([]);
    expect(answers).toHaveLength(1);
    expect(getxattr(stub, XATTR.url)).toBe('http://10.0.0.5/episode.mp3');
    expect(logs.join('\n')).toContain('a private address');
  });
});

describe('[M3.stubs/c] a stalled hydration holds nothing else up', () => {
  it('[M3.stubs/c] 500 unrelated opens during it are all answered at once', async () => {
    const stub = fixtureStub();
    const plain = join(dir, 'plain.mp3');
    writeFileSync(plain, 'not a stub');
    let release: () => void = () => {};
    const stalled = new Promise<void>((done) => (release = done));
    const { hydrator, answers, open } = harness(async () => {
      await stalled;
      return new Response(enclosure, {
        status: 200,
        headers: { 'content-length': String(enclosure.length) },
      });
    });
    const stubFd = open(stub);
    const others: number[] = [];
    for (let i = 0; i < 500; i++) others.push(open(plain));
    expect(answers.map((a) => a.fd)).toEqual(others);

    release();
    await hydrator.settled();
    expect(answers.at(-1)).toMatchObject({ fd: stubFd });
    expect(answers.at(-1)!.bytes.equals(enclosure)).toBe(true);
  });

  it('[M3.stubs/c] more stubs than workers wait their turn, and every one is filled', async () => {
    const stubs = Array.from({ length: 12 }, (_, i) => fixtureStub(`episode-${i}.mp3`));
    const { hydrator, answers, open } = harness(recorded());
    for (const stub of stubs) open(stub);
    await hydrator.settled();
    expect(answers).toHaveLength(12);
    expect(answers.every((a) => a.bytes.equals(enclosure))).toBe(true);
  });
});

describe('[M3.stubs] one lock per inode', () => {
  it('[M3.stubs] holders of one key run one after another, and of another key alongside', async () => {
    const locks = new InodeLocks();
    const order: string[] = [];
    const step = (name: string, ms: number) => async () => {
      order.push(`${name} start`);
      await new Promise((done) => setTimeout(done, ms));
      order.push(`${name} end`);
    };
    await Promise.all([
      locks.run('1:1', step('a', 30)),
      locks.run('1:1', step('b', 1)),
      locks.run('1:2', step('c', 1)),
    ]);
    expect(order).toEqual(['a start', 'c start', 'c end', 'a end', 'b start', 'b end']);
  });

  it('[M3.stubs] a holder that throws does not hold the next one back', async () => {
    const locks = new InodeLocks();
    await expect(locks.run('1:1', async () => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(locks.run('1:1', async () => 'next')).resolves.toBe('next');
  });
});
