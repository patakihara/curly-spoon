/** What breaks the canary: failing tests from a fresh test of it. The stand-ins are as in canary.test.ts. */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from '../adapters/http/fetch.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { type Canary, canaryOf, type CanaryResult } from './canary.js';
import { classifyFailure, type SpawnLike } from './extractor.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');
const recorded = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const info = (recorded('ytdlp', 'info-plain').response.body as { json: { stdout: object } }).json
  .stdout as { id: string };
const ID = info.id;

type Answer = { rc: number; stdout?: object; stderr?: string };

function spawnWith(answer: (args: string[]) => Answer) {
  const spawn: SpawnLike = (_file, args) => {
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    const a = answer(args);
    setImmediate(() => {
      if (a.stdout !== undefined) stdout.write(JSON.stringify(a.stdout));
      stderr.write(a.stderr ?? '');
      stdout.end();
      stderr.end();
      child.emit('close', a.rc);
    });
    return child;
  };
  return spawn;
}

const stream: FetchLike = async (_url, init) => {
  const [first = 0, last = 0] = (new Headers(init?.headers).get('range') ?? '')
    .replace('bytes=', '')
    .split('-')
    .map(Number);
  const end = Math.min(last, clip.length - 1);
  return new Response(clip.subarray(first, end + 1), {
    status: 206,
    headers: {
      'content-type': 'audio/webm',
      'content-range': `bytes ${first}-${end}/${clip.length}`,
    },
  });
};

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'auralis-canary-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const NOW = 1_800_000_000_000;

function canary(
  options: {
    search?: () => Promise<{ id: string }[]>;
    answer?: (args: string[]) => Answer;
    fetch?: FetchLike;
  } = {},
): Canary {
  return canaryOf({
    search: options.search ?? (async () => [{ id: ID }]),
    fetch: options.fetch ?? stream,
    spawn: spawnWith(options.answer ?? (() => ({ rc: 0, stdout: info }))),
    home,
    now: () => NOW,
    id: ID,
    query: 'the known song',
  });
}

afterEach(() => vi.useRealTimers());

describe('the canary', () => {
  it('a stream whose bytes stop coming ends within its minute, as no result', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hung: FetchLike = async () =>
      new Response(new ReadableStream({ start: () => undefined }), {
        status: 206,
        headers: { 'content-type': 'audio/webm', 'content-range': 'bytes 0-9/10' },
      });
    let result: CanaryResult | undefined;
    void canary({ fetch: hung })(`${home}/yt-dlp`).then((r) => (result = r));
    await vi.waitFor(() => new Promise<void>((go) => setImmediate(go)));
    await new Promise<void>((go) => setImmediate(go));
    await vi.advanceTimersByTimeAsync(61_000);
    await new Promise<void>((go) => setImmediate(go));
    expect(result).toMatchObject({ passed: false, reason: 'unavailable' });
  });

  it('a stream host that never answers is no result: the network says nothing of the binary', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const silent: FetchLike = (_url, init) =>
      new Promise((_done, failed) => {
        init?.signal?.addEventListener('abort', () => failed(new Error('aborted')));
      });
    let result: CanaryResult | undefined;
    void canary({ fetch: silent })(`${home}/yt-dlp`).then((r) => (result = r));
    await new Promise<void>((go) => setImmediate(go));
    await new Promise<void>((go) => setImmediate(go));
    await vi.advanceTimersByTimeAsync(16_000);
    await vi.waitFor(() => expect(result).toBeDefined(), { interval: 1 }).catch(() => undefined);
    expect(result).toMatchObject({ passed: false, reason: 'unavailable' });
  });

  // yt-dlp's wording, from memory of its source. The site answered, so this is no network failure,
  // and calling it one means the job never looks for the update that would fix it.
  it('an API page answered with an HTTP error is the extractor at fault, not the network', () => {
    expect(
      classifyFailure(
        'ERROR: [youtube] x: Unable to download API page: HTTP Error 400: Bad Request',
      ),
    ).toBe('extractorError');
  });
});
