/**
 * The extractor's daily update, on GitHub's recorded release answers, with a fake clock, a stand-in
 * archive and a child that only says what a test tells it. Nothing here runs a real extractor.
 */
import { type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from '../adapters/http/fetch.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { openDatabase, type Db } from '../store/connection.js';
import type { CanaryResult } from './canary.js';
import type { SpawnLike } from './extractor.js';
import { ExtractorUpdate, UPDATE_DUE_AFTER_MS, UPDATE_EVERY_MS, archiveFor } from './update.js';
import { ExtractorVersions } from './versions.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string) =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(join(here, '..', 'adapters', 'github', 'recordings', `${call}.json`), 'utf8'),
    ),
  );
interface Json {
  tag_name: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}
const onGithub = (call: string): Json =>
  JSON.parse(
    JSON.stringify((recorded(call).response.body as { json: Json }).json).replaceAll(
      'http://upstream.invalid',
      'https://github.com',
    ),
  ) as Json;

const STABLE = onGithub('latest-release');
const NIGHTLY = onGithub('latest-nightly');
const IMAGE_VERSION = '2026.01.01';
const ARCHIVE = Buffer.from('the stand-in archive');
const PASS: CanaryResult = {
  passed: true,
  tier: 'plain',
  ms: 2200,
  bytes: 300_000,
  codec: 'A_OPUS',
};
const FAIL: CanaryResult = { passed: false, reason: 'extractorError', ms: 900 };
const OFFLINE: CanaryResult = { passed: false, reason: 'unavailable', ms: 10 };
const HOUR = UPDATE_EVERY_MS;

let dir: string;
let db: Db;
let clock: number;
const warnings: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-update-'));
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 7);
  warnings.length = 0;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const sumsFor = (bytes: Buffer) =>
  `${createHash('sha256').update(bytes).digest('hex')}  yt-dlp_musllinux.zip\n`;

/** GitHub as recorded, with the stand-in archive and its true checksum unless a test says not. */
function github(
  script: { stable?: Json; nightly?: Json; sums?: string; archive?: Buffer; down?: boolean } = {},
) {
  const asked: string[] = [];
  const fetch: FetchLike = async (url) => {
    asked.push(url);
    if (script.down === true) throw new Error('no network');
    if (url.endsWith('/yt-dlp/releases/latest')) return Response.json(script.stable ?? STABLE);
    if (url.endsWith('/yt-dlp-nightly-builds/releases/latest')) {
      return Response.json(script.nightly ?? NIGHTLY);
    }
    if (url.endsWith('/SHA2-256SUMS')) {
      return new Response(script.sums ?? sumsFor(script.archive ?? ARCHIVE));
    }
    if (url.endsWith('.zip')) return new Response(script.archive ?? ARCHIVE);
    return new Response(null, { status: 404 });
  };
  return { fetch, asked };
}

/** `unzip` puts a binary where it was told, and that binary says the version in its folder's name. */
function children(script: { says?: (version: string) => string } = {}) {
  const ran: { file: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const spawn: SpawnLike = (file, args, options) => {
    ran.push({ file, args, env: options.env ?? {} });
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    setImmediate(() => {
      if (file === 'unzip') {
        const into = args[args.indexOf('-d') + 1]!;
        mkdirSync(into, { recursive: true });
        writeFileSync(join(into, 'yt-dlp_musllinux'), 'stand-in');
      } else {
        const version = String(options.cwd).split('/').at(-1)!;
        stdout.write(`${script.says?.(version) ?? version}\n`);
      }
      stdout.end();
      stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  return { spawn, ran };
}

const folderOf = (version: string) => join(dir, version);

function setUp(
  options: {
    net?: ReturnType<typeof github>;
    kids?: ReturnType<typeof children>;
    canary?: (path: string) => CanaryResult;
  } = {},
) {
  const versions = new ExtractorVersions({
    db,
    dir,
    imagePath: '/opt/yt-dlp/2026.01.01/yt-dlp',
    imageVersion: IMAGE_VERSION,
  });
  const net = options.net ?? github();
  const kids = options.kids ?? children();
  const canary = vi.fn(async (path: string) => (options.canary ?? (() => PASS))(path));
  const update = new ExtractorUpdate({
    versions,
    fetch: net.fetch,
    canary,
    now: () => clock,
    home: join(dir, 'home'),
    arch: 'x64',
    spawn: kids.spawn,
    log: { warn: (_details, message) => warnings.push(message) },
  });
  return { versions, update, canary, net, kids };
}

const stateOf = (versions: ExtractorVersions, version: string) => versions.row(version)?.state;

describe('[M3.ytmusic/d] when the update runs', () => {
  it('[M3.ytmusic/d] the first tick after a start makes no upstream call', async () => {
    const { update, canary, net } = setUp();
    expect(await update.tick()).toBe('notDue');
    expect(canary).not.toHaveBeenCalled();
    expect(net.asked).toEqual([]);
  });

  it('[M3.ytmusic/d] ticking hourly, it acts once in 20 hours', async () => {
    const { update, canary } = setUp();
    await update.tick();
    await update.tick();
    expect(canary).toHaveBeenCalled();
    const after = canary.mock.calls.length;
    for (let hour = 1; hour < 20; hour += 1) {
      clock += HOUR;
      await update.tick();
    }
    expect(canary.mock.calls.length).toBe(after);
    clock += HOUR;
    await update.tick();
    expect(canary.mock.calls.length).toBeGreaterThan(after);
  });

  it('[M3.ytmusic/d] acts after a restart that fell due, at its next tick, by the table', async () => {
    const first = setUp();
    await first.update.run();
    clock += UPDATE_DUE_AFTER_MS;
    const { update, canary } = setUp();
    await update.tick();
    expect(canary).not.toHaveBeenCalled();
    await update.tick();
    expect(canary).toHaveBeenCalled();
  });

  it('[M3.ytmusic/d] and not after a restart that did not', async () => {
    const first = setUp();
    await first.update.run();
    clock += UPDATE_DUE_AFTER_MS - 1;
    const { update, canary } = setUp();
    await update.tick();
    await update.tick();
    expect(canary).not.toHaveBeenCalled();
  });
});

describe('[M3.ytmusic/d] a new release', () => {
  it('[M3.ytmusic/d] passing its canary is promoted, its version recorded, and the old one kept', async () => {
    const { versions, update } = setUp();
    expect(await update.run()).toBe('promoted');
    expect(versions.now().version).toBe(STABLE.tag_name);
    expect(versions.path()).toBe(join(folderOf(STABLE.tag_name), 'yt-dlp'));
    expect(versions.row(STABLE.tag_name)).toMatchObject({
      source: 'release',
      state: 'promoted',
      canary_at: clock,
      canary_ms: PASS.ms,
      tier: 'plain',
      reason: null,
    });
    expect(stateOf(versions, IMAGE_VERSION)).toBe('kept');
    expect(existsSync(versions.path())).toBe(true);
  });

  it('[M3.ytmusic/d] the next one to pass deletes whatever was kept before', async () => {
    await setUp().update.run();
    const second = setUp({ net: github({ stable: { ...STABLE, tag_name: '2026.12.01' } }) });
    await second.update.run();
    expect(second.versions.now().version).toBe('2026.12.01');
    expect(stateOf(second.versions, STABLE.tag_name)).toBe('kept');
    expect(stateOf(second.versions, IMAGE_VERSION)).toBeUndefined();
    const third = setUp({ net: github({ stable: { ...STABLE, tag_name: '2027.01.01' } }) });
    await third.update.run();
    expect(existsSync(folderOf('2026.12.01'))).toBe(true);
    expect(existsSync(folderOf(STABLE.tag_name))).toBe(false);
  });

  it('[M3.ytmusic/d] failing its canary is deleted with its reason, and the last passing one stays in use', async () => {
    const { versions, update } = setUp({
      canary: (path) => (path.includes(STABLE.tag_name) ? FAIL : PASS),
    });
    expect(await update.run()).toBe('failed');
    expect(versions.now().version).toBe(IMAGE_VERSION);
    expect(versions.path()).toBe('/opt/yt-dlp/2026.01.01/yt-dlp');
    expect(versions.row(STABLE.tag_name)).toMatchObject({
      state: 'failed',
      reason: 'extractorError',
    });
    expect(existsSync(folderOf(STABLE.tag_name))).toBe(false);
  });

  it('[M3.ytmusic/d] a version that failed is not fetched again while the one in use passes', async () => {
    const first = setUp({ canary: (path) => (path.includes(STABLE.tag_name) ? FAIL : PASS) });
    await first.update.run();
    clock += UPDATE_DUE_AFTER_MS;
    const { update, net } = setUp();
    expect(await update.run()).toBe('current');
    expect(net.asked.filter((url) => url.endsWith('.zip'))).toEqual([]);
  });

  it('[M3.ytmusic/d] with the one in use failing too, it is fetched again only once 20 hours have passed', async () => {
    await setUp({ canary: () => FAIL, net: github({ nightly: STABLE }) }).update.run();
    clock += HOUR;
    const soon = setUp({ canary: () => FAIL, net: github({ nightly: STABLE }) });
    await soon.update.run();
    expect(soon.net.asked.filter((url) => url.endsWith('.zip'))).toEqual([]);
    clock += UPDATE_DUE_AFTER_MS;
    const later = setUp({ canary: () => FAIL, net: github({ nightly: STABLE }) });
    await later.update.run();
    expect(later.net.asked.filter((url) => url.endsWith('.zip')).length).toBeGreaterThan(0);
  });

  it('[M3.ytmusic/d] the same version as in use stops the run with nothing downloaded', async () => {
    const stable = { ...STABLE, tag_name: IMAGE_VERSION };
    const { update, net } = setUp({ net: github({ stable }) });
    expect(await update.run()).toBe('current');
    expect(net.asked).toHaveLength(1);
  });
});

describe('[M3.ytmusic/d] nothing runs before it is verified', () => {
  const wouldRun = (kids: ReturnType<typeof children>) =>
    kids.ran.filter((run) => run.file === 'unzip' || run.args[0] === '--version');

  it('[M3.ytmusic/d] a bad checksum never unpacks or runs, and is named failed', async () => {
    const kids = children();
    const net = github({ sums: `${'0'.repeat(64)}  yt-dlp_musllinux.zip\n` });
    const { versions, update, canary } = setUp({ net, kids });
    expect(await update.run()).toBe('failed');
    expect(wouldRun(kids)).toEqual([]);
    expect(canary).toHaveBeenCalledTimes(1);
    expect(versions.now().version).toBe(IMAGE_VERSION);
    expect(stateOf(versions, STABLE.tag_name)).toBe('failed');
  });

  it('[M3.ytmusic/d] a checksum file that does not name the archive never runs it', async () => {
    const kids = children();
    const { update } = setUp({ net: github({ sums: `${'0'.repeat(64)}  other\n` }), kids });
    expect(await update.run()).toBe('failed');
    expect(wouldRun(kids)).toEqual([]);
  });

  it('[M3.ytmusic/d] a size named over the cap stops before the download', async () => {
    const stable = {
      ...STABLE,
      assets: STABLE.assets.map((asset) =>
        asset.name.endsWith('.zip') ? { ...asset, size: 500 * 1024 * 1024 } : asset,
      ),
    };
    const { update, net } = setUp({ net: github({ stable }) });
    expect(await update.run()).toBe('failed');
    expect(net.asked.filter((url) => url.endsWith('.zip'))).toEqual([]);
  });

  it('[M3.ytmusic/d] an archive arriving over the cap stops the download, whatever size was named', async () => {
    const huge = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(32 * 1024 * 1024));
      },
    });
    const base = github();
    const fetch: FetchLike = async (url, init) =>
      url.endsWith('.zip') ? new Response(huge) : base.fetch(url, init);
    const kids = children();
    const { versions, update } = setUp({ net: { fetch, asked: [] }, kids });
    expect(await update.run()).toBe('failed');
    expect(wouldRun(kids)).toEqual([]);
    expect(versions.now().version).toBe(IMAGE_VERSION);
  });

  it('[M3.ytmusic/d] a binary saying another version is not canaried', async () => {
    const { versions, update, canary } = setUp({ kids: children({ says: () => '1999.01.01' }) });
    expect(await update.run()).toBe('failed');
    expect(canary).toHaveBeenCalledTimes(1);
    expect(versions.now().version).toBe(IMAGE_VERSION);
  });

  it('[M3.ytmusic/d] a redirect leading off GitHub is not followed', async () => {
    const base = github();
    const asked: string[] = [];
    const fetch: FetchLike = async (url, init) => {
      asked.push(url);
      return url.endsWith('.zip')
        ? new Response(null, { status: 302, headers: { location: 'https://example.org/a.zip' } })
        : base.fetch(url, init);
    };
    const { update } = setUp({ net: { fetch, asked } });
    expect(await update.run()).toBe('failed');
    expect(asked).not.toContain('https://example.org/a.zip');
  });

  it("[M3.ytmusic/d] the binary runs under the runner's clean environment, keys out", async () => {
    vi.stubEnv('SECRET_KEY', 'never-seen');
    const kids = children();
    const { update } = setUp({ kids });
    await update.run();
    vi.unstubAllEnvs();
    const version = kids.ran.find((run) => run.args[0] === '--version');
    expect(Object.keys(version!.env).sort()).toEqual(['HOME', 'PATH']);
  });
});

describe('[M3.ytmusic/d] what says nothing of the binary changes nothing', () => {
  it('[M3.ytmusic/d] GitHub being down leaves the version in use, with no version failed', async () => {
    const { versions, update } = setUp({ net: github({ down: true }) });
    expect(await update.run()).toBe('unavailable');
    expect(versions.now().version).toBe(IMAGE_VERSION);
    expect(versions.rows().filter((row) => row.state === 'failed')).toEqual([]);
  });

  it('[M3.ytmusic/d] a canary with no network writes no result, and is asked again next hour', async () => {
    const { versions, update } = setUp({ canary: () => OFFLINE });
    expect(await update.run()).toBe('unavailable');
    expect(versions.lastCanaryAt()).toBeNull();
  });

  it("[M3.ytmusic/d] a candidate's canary losing the network is no result: deleted, not failed", async () => {
    const { versions, update } = setUp({
      canary: (path) => (path.includes(STABLE.tag_name) ? OFFLINE : PASS),
    });
    expect(await update.run()).toBe('unavailable');
    expect(versions.row(STABLE.tag_name)).toBeUndefined();
    expect(existsSync(folderOf(STABLE.tag_name))).toBe(false);
    expect(versions.now().version).toBe(IMAGE_VERSION);
  });

  it('[M3.ytmusic/d] a bot wall on the version in use stops the run: no update can help', async () => {
    const { update, net } = setUp({ canary: () => ({ passed: false, reason: 'blocked', ms: 5 }) });
    expect(await update.run()).toBe('blocked');
    expect(net.asked).toEqual([]);
  });
});

describe('[M3.ytmusic/d] the version in use failing', () => {
  it('[M3.ytmusic/d] with no new release, nightly is tried, and promoted when it passes', async () => {
    const stable = { ...STABLE, tag_name: IMAGE_VERSION };
    const { versions, update } = setUp({
      net: github({ stable }),
      canary: (path) => (path.includes(NIGHTLY.tag_name) ? PASS : FAIL),
    });
    expect(await update.run()).toBe('promoted');
    expect(versions.now().version).toBe(NIGHTLY.tag_name);
    expect(versions.row(NIGHTLY.tag_name)?.source).toBe('nightly');
  });

  it('[M3.ytmusic/d] the next stable that passes replaces a nightly', async () => {
    const stable = { ...STABLE, tag_name: IMAGE_VERSION };
    const first = setUp({
      net: github({ stable }),
      canary: (path) => (path.includes(NIGHTLY.tag_name) ? PASS : FAIL),
    });
    await first.update.run();
    clock += UPDATE_DUE_AFTER_MS;
    const newer = { ...STABLE, tag_name: '2026.12.01' };
    const { versions, update } = setUp({ net: github({ stable: newer }) });
    expect(await update.run()).toBe('promoted');
    expect(versions.row('2026.12.01')?.source).toBe('release');
  });

  it('[M3.ytmusic/d] while it passes, nightly is left alone', async () => {
    const stable = { ...STABLE, tag_name: IMAGE_VERSION };
    const { update, net } = setUp({ net: github({ stable }) });
    await update.run();
    expect(net.asked.some((url) => url.includes('nightly'))).toBe(false);
  });

  it('[M3.ytmusic/d] with everything failing, what was in use stays in use and its failure stays named', async () => {
    const { versions, update } = setUp({ canary: () => FAIL });
    await update.run();
    expect(versions.now().version).toBe(IMAGE_VERSION);
    expect(versions.row(IMAGE_VERSION)?.reason).toBe('extractorError');
  });
});

describe('[M3.ytmusic/d] which version a start picks', () => {
  const start = () =>
    new ExtractorVersions({
      db,
      dir,
      imagePath: '/opt/yt-dlp/2026.01.01/yt-dlp',
      imageVersion: IMAGE_VERSION,
    });

  it('[M3.ytmusic/d] the newest promoted still on disk', async () => {
    const { update } = setUp();
    await update.run();
    expect(start().now().version).toBe(STABLE.tag_name);
  });

  it('[M3.ytmusic/d] with its folder missing, the one kept, here the image', async () => {
    const { update } = setUp();
    await update.run();
    rmSync(folderOf(STABLE.tag_name), { recursive: true });
    expect(start().now()).toEqual({
      version: IMAGE_VERSION,
      path: '/opt/yt-dlp/2026.01.01/yt-dlp',
      source: 'image',
    });
  });

  it('[M3.ytmusic/d] with a kept folder present and the promoted one missing, the kept one', async () => {
    const stable = { ...STABLE, tag_name: '2026.12.01' };
    const { update } = setUp();
    await update.run();
    await setUp({ net: github({ stable }) }).update.run();
    rmSync(folderOf('2026.12.01'), { recursive: true });
    expect(start().now().version).toBe(STABLE.tag_name);
  });

  it('[M3.ytmusic/d] an image newer than what the update promoted', async () => {
    const { update } = setUp();
    await update.run();
    const newer = new ExtractorVersions({
      db,
      dir,
      imagePath: '/opt/yt-dlp/2027.01.01/yt-dlp',
      imageVersion: '2027.01.01',
    });
    expect(newer.now().version).toBe('2027.01.01');
  });

  it('[M3.ytmusic/d] with nothing yet, the image, and no network asked', () => {
    expect(start().now().source).toBe('image');
  });

  it('[M3.ytmusic/d] at start a half download and a folder no row counts go; the home stays', () => {
    mkdirSync(join(dir, '.incoming', '2026.10.26'), { recursive: true });
    mkdirSync(join(dir, '2020.01.01'), { recursive: true });
    mkdirSync(join(dir, 'home'), { recursive: true });
    start().prepare();
    expect(existsSync(join(dir, '.incoming'))).toBe(false);
    expect(existsSync(join(dir, '2020.01.01'))).toBe(false);
    expect(existsSync(join(dir, 'home'))).toBe(true);
  });
});

describe('[M3.ytmusic/d] the archive for this machine', () => {
  it('[M3.ytmusic/d] each platform the image is built for has one in the recorded release', () => {
    for (const arch of ['x64', 'arm64']) {
      const asset = archiveFor(arch)!;
      expect(STABLE.assets.map((a) => a.name)).toContain(asset.archive);
    }
  });

  it('[M3.ytmusic/d] any other has none, and the run downloads nothing', async () => {
    expect(archiveFor('riscv64')).toBeNull();
  });
});
