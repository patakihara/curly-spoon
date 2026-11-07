/** The canary, on recordings: search, both tiers, the stream's bytes, and what each failure is called. */
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
import { type Canary, canaryBytes, canaryOf, type CanaryResult, webmAudioCodec } from './canary.js';
import type { SpawnLike } from './extractor.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');
const recorded = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const info = (recorded('ytdlp', 'info-plain').response.body as { json: { stdout: object } }).json
  .stdout as { id: string };
const blocked = (recorded('ytdlp', 'error-botwall').response.body as { json: { stderr: string } })
  .json.stderr;
const refused = recorded('googlevideo', 'range-403').response;
const notAudio = recorded('googlevideo', 'range-video').response;
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
const failure = (result: CanaryResult) => (result.passed ? 'passed' : result.reason);

describe('[M3.ytmusic/d] the canary', () => {
  it('[M3.ytmusic/d] passes on the known track, naming the tier and the codec', async () => {
    const result = await canary()('/some/yt-dlp');
    expect(result).toMatchObject({ passed: true, tier: 'plain', codec: 'A_OPUS' });
  });

  it('[M3.ytmusic/d] resolves with the binary it was given, trying node when plain fails', async () => {
    const files: string[] = [];
    const spawn: SpawnLike = (file, args, options) => {
      files.push(file);
      return spawnWith((a) =>
        a.includes('--js-runtimes') ? { rc: 0, stdout: info } : { rc: 1, stderr: 'ERROR: broken' },
      )(file, args, options);
    };
    const result = await canaryOf({
      search: async () => [{ id: ID }],
      fetch: stream,
      spawn,
      home,
      now: () => NOW,
      id: ID,
      query: 'q',
    })('/candidate/yt-dlp');
    expect(result).toMatchObject({ passed: true, tier: 'node' });
    expect(new Set(files)).toEqual(new Set(['/candidate/yt-dlp']));
  });

  it('[M3.ytmusic/d] search not holding the known track is searchShape', async () => {
    expect(failure(await canary({ search: async () => [{ id: 'aaaaaaaaaaa' }] })('p'))).toBe(
      'searchShape',
    );
  });

  it('[M3.ytmusic/d] search throwing is no result', async () => {
    const down = async () => {
      throw new Error('no network');
    };
    expect(failure(await canary({ search: down })('p'))).toBe('unavailable');
  });

  it('[M3.ytmusic/d] the recorded bot wall is blocked', async () => {
    const answer = () => ({ rc: 1, stderr: blocked });
    expect(failure(await canary({ answer })('p'))).toBe('blocked');
  });

  it('[M3.ytmusic/d] the recorded 403 is streamRefused', async () => {
    const fetch: FetchLike = async () =>
      new Response('refused', { status: refused.status, headers: refused.headers });
    expect(failure(await canary({ fetch })('p'))).toBe('streamRefused');
  });

  it('[M3.ytmusic/d] the recorded video header is streamRefused', async () => {
    const fetch: FetchLike = async () =>
      new Response(clip, { status: notAudio.status, headers: notAudio.headers });
    expect(failure(await canary({ fetch })('p'))).toBe('streamRefused');
  });

  it('[M3.ytmusic/d] a network failure on the stream is no result', async () => {
    const fetch: FetchLike = async () => {
      throw new Error('no network');
    };
    expect(failure(await canary({ fetch })('p'))).toBe('unavailable');
  });

  it('[M3.ytmusic/d] bytes that are not audio are streamRefused, whatever the header said', async () => {
    const fetch: FetchLike = async () =>
      new Response(Buffer.from('<html>not a stream</html>'), {
        status: 206,
        headers: { 'content-type': 'audio/webm', 'content-range': 'bytes 0-24/25' },
      });
    expect(failure(await canary({ fetch })('p'))).toBe('streamRefused');
  });

  it('[M3.ytmusic/d] asks about twenty seconds of a file, within limits', () => {
    expect(canaryBytes(3_445_462, 214)).toBe(Math.ceil((3_445_462 / 214) * 20));
    expect(canaryBytes(1000, 214)).toBe(1000);
    expect(canaryBytes(10_000_000_000, 100)).toBe(4 * 1024 * 1024);
  });
});

describe("[M3.ytmusic/d] reading a WebM's tracks", () => {
  /** An element: its id's bytes, then a size in one byte, then its body. */
  const el = (id: number[], body: Buffer) => Buffer.from([...id, 0x80 | body.length, ...body]);
  const track = (type: number, codec: string) =>
    el([0xae], Buffer.concat([el([0x83], Buffer.from([type])), el([0x86], Buffer.from(codec))]));
  const file = (...tracks: Buffer[]) => {
    const inner = el([0x16, 0x54, 0xae, 0x6b], Buffer.concat(tracks));
    return Buffer.concat([
      el([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0)),
      // An unknown size, as a live stream's segment may have.
      Buffer.from([0x18, 0x53, 0x80, 0x67, 0xff]),
      inner,
    ]);
  };

  it('[M3.ytmusic/d] the synthesized Opus clip is one audio track of Opus', () => {
    expect(webmAudioCodec(clip)).toBe('A_OPUS');
  });

  it('[M3.ytmusic/d] one audio track of Opus is read through a segment of unknown size', () => {
    expect(webmAudioCodec(file(track(2, 'A_OPUS')))).toBe('A_OPUS');
  });

  it('[M3.ytmusic/d] a video track is refused', () => {
    expect(webmAudioCodec(file(track(1, 'A_OPUS')))).toBeNull();
    expect(webmAudioCodec(file(track(2, 'V_VP9')))).toBeNull();
  });

  it('[M3.ytmusic/d] a second track, the muxed case, is refused', () => {
    expect(webmAudioCodec(file(track(2, 'A_OPUS'), track(1, 'V_VP9')))).toBeNull();
  });

  it('[M3.ytmusic/d] anything else is refused', () => {
    expect(webmAudioCodec(Buffer.from('<html>'))).toBeNull();
    expect(webmAudioCodec(Buffer.alloc(0))).toBeNull();
  });
});

afterEach(() => vi.useRealTimers());

describe('[M3.ytmusic/d] a stream that stalls', () => {
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
});
