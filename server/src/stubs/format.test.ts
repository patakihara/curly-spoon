/**
 * The stub format on real temp files: what the old podcast-stubs left on disk is read back and left
 * alone, a stub is written atomically from ranged answers, a download is adopted, and a hydrated
 * file returns to a stub after 7 days unplayed.
 *
 * The enclosure here is the recorded MP3 (audiobookshelf/recordings/multi-file.mp3) behind an ID3
 * tag padded past the first ranged read, so the prefix has to grow; part D brings the test feed's
 * own recorded ranged answers.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adoptFile,
  DEFAULT_PREFIX,
  DEHYDRATE_AFTER_MS,
  dehydrateIfDue,
  isStub,
  MAX_PREFIX,
  progressPins,
  type RangeAnswer,
  readStubState,
  writeStub,
  XATTR,
} from './format.js';
import { getxattr, setxattr } from './libc.js';

const DAY = 24 * 3600 * 1000;
const recordedMp3 = readFileSync(
  new URL('../adapters/audiobookshelf/recordings/multi-file.mp3', import.meta.url),
);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-stubs-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Every stub attribute a file carries, by name. */
function attrs(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.values(XATTR)) {
    const value = getxattr(path, name);
    if (value !== null) out[name] = value;
  }
  return out;
}

function snapshot(path: string) {
  const st = statSync(path, { bigint: true });
  return {
    attrs: attrs(path),
    size: st.size,
    blocks: st.blocks,
    mtimeNs: st.mtimeNs,
    ctimeNs: st.ctimeNs,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  };
}

/** An episode's bytes: never zero, so a punched hole shows. */
function episodeBytes(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) bytes[i] = (i % 251) + 1;
  return bytes;
}

function seed(name: string, bytes: Buffer, xattrs: Record<string, string>, mtime = 1_700_000_000) {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  for (const [key, value] of Object.entries(xattrs)) setxattr(path, key, value);
  utimesSync(path, mtime, mtime);
  return path;
}

/** A sparse stub as the old stubgen wrote it: the prefix, then a hole out to the true length. */
function seedStub(name: string, length: number, prefix: number) {
  const path = join(dir, name);
  writeFileSync(path, episodeBytes(prefix));
  truncateSync(path, length);
  setxattr(path, XATTR.url, 'https://cdn.example.org/show/ep-1.mp3');
  setxattr(path, XATTR.length, String(length));
  setxattr(path, XATTR.prefixLen, String(prefix));
  utimesSync(path, 1_700_000_000, 1_700_000_000);
  return path;
}

describe('[M3.stubs/b] the old podcast-stubs’ files are adopted unchanged', () => {
  it('[M3.stubs/b] a stub, a hydrated file, an adopted download and a kept file each read back as what they are, and adopting them writes nothing', () => {
    const size = 1024 * 1024;
    const stub = seedStub('Stub.mp3', 3 * size, DEFAULT_PREFIX);
    const hydrated = seed('Hydrated.mp3', episodeBytes(size), {
      [XATTR.prefixLen]: '131072',
      [XATTR.origUrl]: 'https://cdn.example.org/show/ep-2.mp3',
      [XATTR.origLength]: String(size),
      [XATTR.origPrefix]: '131072',
      [XATTR.hydratedAt]: '1700000500',
    });
    const adopted = seed('Adopted.mp3', episodeBytes(size), {
      [XATTR.origUrl]: 'https://cdn.example.org/show/ep-3.mp3',
      [XATTR.origLength]: String(size),
      [XATTR.origPrefix]: '131072',
      [XATTR.hydratedAt]: '1700000000',
    });
    const kept = seed('Kept.mp3', episodeBytes(size), {
      [XATTR.origUrl]: 'https://cdn.example.org/premium/ep-4.mp3?token=abc',
      [XATTR.origLength]: String(size),
      [XATTR.origPrefix]: '262144',
      [XATTR.hydratedAt]: '1600000000',
      [XATTR.keep]: '1',
    });
    const before = [stub, hydrated, adopted, kept].map(snapshot);

    expect(readStubState(stub)).toEqual({
      kind: 'stub',
      url: 'https://cdn.example.org/show/ep-1.mp3',
      length: 3 * size,
      prefixLen: DEFAULT_PREFIX,
    });
    expect(isStub(stub)).toBe(true);
    expect(readStubState(hydrated)).toEqual({
      kind: 'hydrated',
      origUrl: 'https://cdn.example.org/show/ep-2.mp3',
      origLength: size,
      origPrefix: 131072,
      hydratedAt: 1700000500,
      keep: false,
    });
    expect(readStubState(adopted)).toMatchObject({ kind: 'hydrated', hydratedAt: 1700000000 });
    expect(readStubState(kept)).toMatchObject({ kind: 'hydrated', keep: true, origPrefix: 262144 });
    for (const path of [hydrated, adopted, kept]) expect(isStub(path)).toBe(false);

    for (const path of [stub, hydrated, adopted, kept]) {
      expect(adoptFile(path, 'https://cdn.example.org/other.mp3')).toBe(false);
    }
    expect([stub, hydrated, adopted, kept].map(snapshot)).toEqual(before);
  });

  it('[M3.stubs/b] a download with no attributes is adopted: orig_* from its size, hydrated_at its mtime, its times kept to the nanosecond', () => {
    const path = seed('Downloaded.mp3', episodeBytes(300_000), {}, 1_700_000_123.456789);
    const before = statSync(path, { bigint: true });

    expect(readStubState(path)).toEqual({ kind: 'plain' });
    expect(adoptFile(path, 'https://cdn.example.org/show/ep-5.mp3')).toBe(true);

    expect(attrs(path)).toEqual({
      [XATTR.origUrl]: 'https://cdn.example.org/show/ep-5.mp3',
      [XATTR.origLength]: '300000',
      [XATTR.origPrefix]: '131072',
      [XATTR.hydratedAt]: '1700000123',
    });
    const after = statSync(path, { bigint: true });
    expect(after.mtimeNs).toBe(before.mtimeNs);
    expect(after.atimeNs).toBe(before.atimeNs);
    expect(adoptFile(path, 'https://cdn.example.org/show/ep-5.mp3')).toBe(false);
  });
});

/** An enclosure whose Xing header sits past the first 128 KB: an ID3 tag padded out, then the MP3. */
function enclosureWithLateXing(): Buffer {
  const id3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200 * 1024 - 3)]);
  const xing = Buffer.concat([Buffer.alloc(32), Buffer.from('Xing'), Buffer.alloc(116)]);
  const body = Buffer.concat([id3, xing, recordedMp3]);
  return Buffer.concat([body, episodeBytes(3 * 1024 * 1024 - body.length)]);
}

/** Answers `bytes=0-<end>` from `bytes` as a server honouring Range would, logging each end. */
function rangeServer(bytes: Buffer, ends: number[], total: string = String(bytes.length)) {
  return async (_url: string, end: number): Promise<RangeAnswer> => {
    ends.push(end);
    const last = Math.min(end, bytes.length - 1);
    return {
      status: 206,
      contentRange: `bytes 0-${last}/${total}`,
      body: bytes.subarray(0, last + 1),
    };
  };
}

describe('[M3.stubs/b] writing a stub', () => {
  it('[M3.stubs/b] grows the prefix until the Xing header, then leaves a hole out to the Content-Range total, tagged', async () => {
    const enclosure = enclosureWithLateXing();
    const ends: number[] = [];
    const path = join(dir, 'Show', 'Episode One.mp3');

    const written = await writeStub({
      path,
      url: 'https://cdn.example.org/show/ep-1.mp3',
      declaredLength: 999,
      rangeGet: rangeServer(enclosure, ends),
    });

    expect(ends).toEqual([DEFAULT_PREFIX - 1, 2 * DEFAULT_PREFIX - 1]);
    expect(written).toEqual({ path, length: enclosure.length, prefixLen: 2 * DEFAULT_PREFIX });
    const st = statSync(path);
    expect(st.size).toBe(enclosure.length);
    expect(st.blocks * 512).toBeLessThan(2 * DEFAULT_PREFIX + 64 * 1024);
    const bytes = readFileSync(path);
    expect(
      bytes.subarray(0, 2 * DEFAULT_PREFIX).equals(enclosure.subarray(0, 2 * DEFAULT_PREFIX)),
    ).toBe(true);
    expect(bytes.subarray(2 * DEFAULT_PREFIX).every((b) => b === 0)).toBe(true);
    expect(attrs(path)).toEqual({
      [XATTR.url]: 'https://cdn.example.org/show/ep-1.mp3',
      [XATTR.length]: String(enclosure.length),
      [XATTR.prefixLen]: String(2 * DEFAULT_PREFIX),
    });
    expect(readdirSync(join(dir, 'Show'))).toEqual(['Episode One.mp3']);
  });

  it('[M3.stubs/b] stops at 2 MB when no Xing or Info header shows, and takes the feed’s length when the total is unknown', async () => {
    const enclosure = Buffer.concat([Buffer.from('ID3'), episodeBytes(4 * 1024 * 1024)]);
    const noHeader = Buffer.from(
      enclosure.toString('latin1').replace(/Xing|Info/g, 'xxxx'),
      'latin1',
    );
    const ends: number[] = [];

    const written = await writeStub({
      path: join(dir, 'Long.mp3'),
      url: 'https://cdn.example.org/long.mp3',
      declaredLength: 9_000_000,
      rangeGet: rangeServer(noHeader, ends, '*'),
    });

    expect(ends.map((end) => end + 1)).toEqual([
      DEFAULT_PREFIX,
      2 * DEFAULT_PREFIX,
      4 * DEFAULT_PREFIX,
      8 * DEFAULT_PREFIX,
      MAX_PREFIX,
    ]);
    expect(written).toMatchObject({ length: 9_000_000, prefixLen: MAX_PREFIX });
    expect(statSync(join(dir, 'Long.mp3')).size).toBe(9_000_000);
  });

  it('[M3.stubs/b] the final name never appears before the stub is whole: a read that throws leaves nothing behind', async () => {
    const enclosure = enclosureWithLateXing();
    let calls = 0;
    const path = join(dir, 'Broken.mp3');

    await expect(
      writeStub({
        path,
        url: 'https://cdn.example.org/broken.mp3',
        declaredLength: null,
        rangeGet: async (url, end) => {
          calls += 1;
          expect(readdirSync(dir)).toEqual([]);
          if (calls === 2) throw new Error('connection reset');
          return rangeServer(enclosure, [])(url, end);
        },
      }),
    ).rejects.toThrow('connection reset');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('[M3.stubs/b] a failure after the partial is written removes the partial', async () => {
    const path = join(dir, 'Taken.mp3');
    mkdirSync(path);
    await expect(
      writeStub({
        path,
        url: 'https://cdn.example.org/taken.mp3',
        declaredLength: null,
        rangeGet: rangeServer(enclosureWithLateXing(), []),
      }),
    ).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(['Taken.mp3']);
    expect(statSync(path).isDirectory()).toBe(true);
  });

  it('[M3.stubs/b] a 429 or 503 is retried after 2 s, then 4 s; any other refusal throws at once', async () => {
    const enclosure = enclosureWithLateXing();
    const statuses = [503, 429];
    const waits: number[] = [];
    const serve = rangeServer(enclosure, []);
    await writeStub({
      path: join(dir, 'Busy.mp3'),
      url: 'https://cdn.example.org/busy.mp3',
      declaredLength: null,
      rangeGet: async (url, end) => {
        const status = statuses.shift();
        return status ? { status, contentRange: null, body: new Uint8Array() } : serve(url, end);
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([2000, 4000]);
    expect(isStub(join(dir, 'Busy.mp3'))).toBe(true);

    await expect(
      writeStub({
        path: join(dir, 'Gone.mp3'),
        url: 'https://cdn.example.org/gone.mp3',
        declaredLength: null,
        rangeGet: async () => ({ status: 404, contentRange: null, body: new Uint8Array() }),
        sleep: async () => {
          throw new Error('no wait for a 404');
        },
      }),
    ).rejects.toThrow('404');
    expect(existsSync(join(dir, 'Gone.mp3'))).toBe(false);
  });
});

describe('[M3.stubs/b] a hydrated file returns to a stub after 7 days unplayed', () => {
  const size = 2 * 1024 * 1024;
  const hydratedAt = 1_700_000_000;
  const due = hydratedAt * 1000 + DEHYDRATE_AFTER_MS + 1000;

  function seedHydrated(extra: Record<string, string> = {}) {
    return seed(
      'Played.mp3',
      episodeBytes(size),
      {
        [XATTR.prefixLen]: '131072',
        [XATTR.origUrl]: 'https://cdn.example.org/show/ep-6.mp3',
        [XATTR.origLength]: String(size),
        [XATTR.origPrefix]: '131072',
        [XATTR.hydratedAt]: String(hydratedAt),
        ...extra,
      },
      1_699_999_000.123456,
    );
  }

  it('[M3.stubs/b] 7 days and 1 s after hydration, with no open file and no recent unfinished listen: size and prefix kept, blocks freed, attributes flipped, times kept', async () => {
    const path = seedHydrated();
    const bytes = readFileSync(path);
    const before = statSync(path, { bigint: true });

    expect(await dehydrateIfDue(path, { now: due, progress: [] })).toBe('dehydrated');

    const after = statSync(path, { bigint: true });
    expect(after.size).toBe(before.size);
    expect(Number(after.blocks) * 512).toBeLessThan(DEFAULT_PREFIX + 64 * 1024);
    expect(after.mtimeNs).toBe(before.mtimeNs);
    expect(after.atimeNs).toBe(before.atimeNs);
    const read = readFileSync(path);
    expect(read.subarray(0, DEFAULT_PREFIX).equals(bytes.subarray(0, DEFAULT_PREFIX))).toBe(true);
    expect(read.subarray(DEFAULT_PREFIX).every((b) => b === 0)).toBe(true);
    expect(attrs(path)).toEqual({
      [XATTR.url]: 'https://cdn.example.org/show/ep-6.mp3',
      [XATTR.length]: String(size),
      [XATTR.prefixLen]: '131072',
      [XATTR.origUrl]: 'https://cdn.example.org/show/ep-6.mp3',
      [XATTR.origLength]: String(size),
      [XATTR.origPrefix]: '131072',
    });
    expect(isStub(path)).toBe(true);
  });

  it('[M3.stubs/b] 6 days after hydration it stays whole', async () => {
    const path = seedHydrated();
    const before = snapshot(path);
    expect(await dehydrateIfDue(path, { now: hydratedAt * 1000 + 6 * DAY, progress: [] })).toBe(
      'too-recent',
    );
    expect(snapshot(path)).toEqual(before);
  });

  it('[M3.stubs/b] a kept file stays whole', async () => {
    const path = seedHydrated({ [XATTR.keep]: '' });
    const before = snapshot(path);
    expect(await dehydrateIfDue(path, { now: due, progress: [] })).toBe('kept');
    expect(snapshot(path)).toEqual(before);
  });

  it('[M3.stubs/b] a file some process holds open stays whole', async () => {
    const path = seedHydrated();
    const before = snapshot(path);
    const fd = openSync(path, 'r');
    try {
      expect(await dehydrateIfDue(path, { now: due, progress: [] })).toBe('open');
    } finally {
      closeSync(fd);
    }
    expect(snapshot(path)).toEqual(before);
  });

  it('[M3.stubs/b] an unfinished listen updated within 7 days pins it; one older than 7 days does not', async () => {
    const path = seedHydrated();
    const before = snapshot(path);
    const recent = { isFinished: false, currentTime: 75, updatedAt: due - 6 * DAY };
    expect(await dehydrateIfDue(path, { now: due, progress: [recent] })).toBe('in-progress');
    expect(snapshot(path)).toEqual(before);

    const stale = { isFinished: false, currentTime: 75, updatedAt: due - 8 * DAY };
    expect(await dehydrateIfDue(path, { now: due, progress: [stale] })).toBe('dehydrated');
  });

  it('[M3.stubs/b] only a part-way listen pins: finished, not started, or of unknown age', async () => {
    const now = 1_800_000_000_000;
    expect(progressPins([{ isFinished: true, currentTime: 10, updatedAt: now }], now)).toBe(false);
    expect(progressPins([{ isFinished: false, currentTime: 0, updatedAt: now }], now)).toBe(false);
    expect(progressPins([{ isFinished: false, currentTime: 10, updatedAt: null }], now)).toBe(true);
    expect(
      progressPins([{ isFinished: false, currentTime: 10, updatedAt: now - 7 * DAY }], now),
    ).toBe(true);
  });

  it('[M3.stubs/b] a stub or a file without orig_* is never punched', async () => {
    const stub = seedStub('Stub.mp3', size, DEFAULT_PREFIX);
    expect(await dehydrateIfDue(stub, { now: due, progress: [] })).toBe('not-hydrated');
    const partial = seed('Partial.mp3', episodeBytes(size), {
      [XATTR.hydratedAt]: String(hydratedAt),
    });
    const before = snapshot(partial);
    expect(await dehydrateIfDue(partial, { now: due, progress: [] })).toBe('missing-orig');
    expect(snapshot(partial)).toEqual(before);
  });
});
