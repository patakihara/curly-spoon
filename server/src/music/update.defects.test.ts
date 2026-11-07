/**
 * What breaks the extractor's daily update: failing tests from a fresh test of the job. The stand-ins
 * are the same as in update.test.ts.
 */
import { type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
import { ExtractorUpdate } from './update.js';
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

const within = <T>(work: Promise<T>, ms = 3000): Promise<T | 'hung'> =>
  Promise.race([work, new Promise<'hung'>((go) => setTimeout(() => go('hung'), ms))]);

describe('a full disk', () => {
  it('filling while the archive downloads ends the run with nothing moved, and fails no version', async () => {
    const { versions, update } = setUp({ net: github({ archive: Buffer.alloc(1024 * 1024, 1) }) });
    versions.prepare();
    mkdirSync(join(dir, '.incoming'), { recursive: true });
    // The kernel's own always-full file, so the write is a real ENOSPC.
    symlinkSync('/dev/full', join(dir, '.incoming', `${STABLE.tag_name}.zip`));
    const outcome = await within(update.run());
    expect(outcome).toBe('unavailable');
    expect(stateOf(versions, STABLE.tag_name)).toBeUndefined();
    expect(versions.now().version).toBe(IMAGE_VERSION);
  });

  it('filling while it unpacks does not fail the release for good', async () => {
    const spawn: SpawnLike = (file, _args, options) => {
      const child = new EventEmitter() as ChildProcess & EventEmitter;
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      Object.assign(child, { stdout, stderr, pid: 4242 });
      setImmediate(() => {
        stderr.write('unzip: write error: No space left on device\n');
        stdout.end();
        stderr.end();
        child.emit('close', file === 'unzip' ? 1 : 0);
      });
      void options;
      return child;
    };
    const { versions, update } = setUp({ kids: { spawn, ran: [] } });
    const outcome = await update.run();
    expect(outcome).toBe('unavailable');
    expect(stateOf(versions, STABLE.tag_name)).toBeUndefined();
  });
});

describe('the last passing version', () => {
  it('is what plays again when a newer image fails its canary and nothing newer passes', async () => {
    // A release brought a newer image; the version the update promoted still passes, on disk.
    const held = '2025.12.01';
    db.prepare(
      `INSERT INTO extractor_versions (version, source, state, promoted_at, canary_at, canary_ms, tier)
       VALUES (?, 'release', 'promoted', ?, ?, 100, 'plain')`,
    ).run(held, clock, clock);
    mkdirSync(folderOf(held), { recursive: true });
    writeFileSync(join(folderOf(held), 'yt-dlp'), 'stand-in');
    const { versions, update } = setUp({
      net: github({
        stable: { ...STABLE, tag_name: IMAGE_VERSION },
        nightly: { ...NIGHTLY, tag_name: IMAGE_VERSION },
      }),
      canary: (path) => (path.startsWith(dir) ? PASS : FAIL),
    });
    expect(versions.now().version).toBe(IMAGE_VERSION);
    await update.run();
    expect(versions.now().version).toBe(held);
  });

  it('anything older goes when a release is promoted over a newer image', async () => {
    const held = '2025.12.01';
    db.prepare(
      `INSERT INTO extractor_versions (version, source, state, promoted_at, canary_at, canary_ms, tier)
       VALUES (?, 'release', 'promoted', ?, ?, 100, 'plain')`,
    ).run(held, clock, clock);
    mkdirSync(folderOf(held), { recursive: true });
    writeFileSync(join(folderOf(held), 'yt-dlp'), 'stand-in');
    const { versions, update } = setUp();
    expect(versions.now().version).toBe(IMAGE_VERSION);
    expect(await update.run()).toBe('promoted');
    expect(stateOf(versions, IMAGE_VERSION)).toBe('kept');
    expect(existsSync(folderOf(held))).toBe(false);
    expect(versions.row(held)).toBeUndefined();
  });
});
