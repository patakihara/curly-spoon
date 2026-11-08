/**
 * The direct resolve, on YouTube's player as recorded: the audio-only guard on its formats, the
 * visitor id it needs, the bot wall, and yt-dlp behind it for anything it cannot answer.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { Visitor, YtMusicClient } from '../adapters/ytmusic/client.js';
import { YtPlayer } from '../adapters/ytmusic/player.js';
import { playerAnswerSchema } from '../adapters/ytmusic/schemas.js';
import { canaryOf } from './canary.js';
import { directResolver, NoVisitor } from './direct.js';
import { Extractor, type SpawnLike } from './extractor.js';
import { InfoRefused, parsePlayer, pickFormat, PlayerRefused } from './schemas.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');
const recorded = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const ok = recorded('ytmusic', 'player-visionos');
const botwall = recorded('ytmusic', 'player-botwall');
const unplayable = recorded('ytmusic', 'player-unplayable');
const search = recorded('ytmusic', 'search-songs');
const plainInfo = (recorded('ytdlp', 'info-plain').response.body as { json: { stdout: object } })
  .json.stdout;
const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));

const ID = 'lYBUbBu4W08';
const VISITOR = 'CgtWaXNpdG9yMTIzKKCB';
const EXPIRE = Number(/expire=(\d+)/.exec(JSON.stringify(ok.response.body))?.[1]) * 1000;
const NOW = EXPIRE - 3_600_000;

/* eslint-disable @typescript-eslint/no-explicit-any -- each test reaches one field of a recording */
const json = (r: Recording): any => structuredClone((r.response.body as { json: unknown }).json);
const answer = (r: Recording) => playerAnswerSchema.parse(json(r));
const withVisitor = (r: Recording, id: string): Recording => {
  const copy = structuredClone(r);
  (copy.response.body as { json: any }).json.responseContext = { visitorData: id };
  return copy;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Answers each call with the next recording, by endpoint, and says what it was asked. */
function upstream(answers: Record<string, Recording[]>) {
  const asked: { endpoint: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const endpoint = new URL(url).pathname.split('/').at(-1) ?? '';
    asked.push({
      endpoint,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const next = answers[endpoint]?.shift();
    if (next === undefined) throw new Error(`nothing more to answer ${endpoint}`);
    return new Response(JSON.stringify((next.response.body as { json: unknown }).json), {
      status: next.response.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, asked };
}

const homes: string[] = [];
afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function spawnSpy() {
  const calls: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const spawn: SpawnLike = (_file, args, options) => {
    calls.push({ args, env: options.env ?? {} });
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    setImmediate(() => {
      stdout.end(JSON.stringify(plainInfo));
      stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  return { spawn, calls };
}

/** The server's whole direct path over `answers`: client, visitor, player, resolver, extractor. */
function resolving(answers: Record<string, Recording[]>, visitor = new Visitor()) {
  const { fetch, asked } = upstream(answers);
  const client = new YtMusicClient({
    baseUrl: 'https://music.invalid',
    fetch,
    now: () => NOW,
    visitor,
  });
  const player = new YtPlayer({ baseUrl: 'https://player.invalid', fetch });
  const spy = spawnSpy();
  const failed: string[] = [];
  const home = mkdtempSync(join(tmpdir(), 'auralis-direct-'));
  homes.push(home);
  const extractor = new Extractor({
    path: () => '/opt/yt-dlp',
    home,
    now: () => NOW,
    spawn: spy.spawn,
    direct: directResolver({
      player: (id, v) => player.player(id, v),
      visitor,
      findVisitor: async () => void (await client.search('the song and its artist')),
      now: () => NOW,
    }),
    onDirectFailed: (reason) => failed.push(reason),
  });
  return { extractor, asked, spawned: spy.calls, failed, visitor };
}

describe("[M3.ytmusic/a] the audio-only guard on the player's formats, on recordings", () => {
  it('[M3.ytmusic/a] the recorded answer gives exactly the five audio formats, and Opus 251 plays', () => {
    const info = parsePlayer(answer(ok), ID, NOW);
    expect(info.formats.map((f) => f.itag).sort((a, b) => a - b)).toEqual([
      139, 140, 249, 250, 251,
    ]);
    expect(info.duration).toBe(214);
    const picked = pickFormat(info.formats);
    expect(picked).toMatchObject({ itag: 251, mime: 'audio/webm', codec: 'opus' });
    expect(picked?.expiresAt).toBe(EXPIRE);
    expect(picked?.size).toBeGreaterThan(0);
  });

  it('[M3.ytmusic/a] a muxed row, a video row and a signatureCipher row never pass', () => {
    const raw = json(ok);
    const audio = raw.streamingData.adaptiveFormats.find((f: { itag: number }) => f.itag === 251);
    raw.streamingData.formats = [
      { ...audio, itag: 18, mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', width: 640 },
    ];
    raw.streamingData.adaptiveFormats = [
      { ...audio, url: undefined, signatureCipher: `s=x&url=${encodeURIComponent(audio.url)}` },
      { ...audio, qualityLabel: '144p' },
      { ...audio, height: 144 },
      ...raw.streamingData.adaptiveFormats,
    ];
    const formats = parsePlayer(playerAnswerSchema.parse(raw), ID, NOW).formats;
    expect(formats).toHaveLength(5);
    expect(formats.every((f) => f.mime.startsWith('audio/'))).toBe(true);
    expect(JSON.stringify(formats)).not.toMatch(/video|cipher/i);
  });

  it('[M3.ytmusic/a] an audio row whose URL asks for another format or host is dropped', () => {
    const raw = json(ok);
    raw.streamingData.adaptiveFormats = raw.streamingData.adaptiveFormats.map(
      (f: { url: string }) => ({ ...f, url: f.url.replace('itag=', 'itag=1') }),
    );
    expect(() => parsePlayer(playerAnswerSchema.parse(raw), ID, NOW)).toThrow(InfoRefused);
  });

  it("[M3.ytmusic/a] another track's answer, the bot wall and an unplayable id are refused", () => {
    expect(() => parsePlayer(answer(ok), 'aaaaaaaaaaa', NOW)).toThrow(PlayerRefused);
    expect(() => parsePlayer(answer(botwall), ID, NOW)).toThrow(
      expect.objectContaining({ reason: 'blocked' }),
    );
    expect(() => parsePlayer(answer(unplayable), 'aaaaaaaaaaa', NOW)).toThrow(
      expect.objectContaining({ reason: 'notPlayable' }),
    );
  });

  it('[M3.ytmusic/a] a track live now is refused as live', () => {
    const raw = json(ok);
    raw.videoDetails.isLive = true;
    raw.videoDetails.isLiveContent = true;
    expect(() => parsePlayer(playerAnswerSchema.parse(raw), ID, NOW)).toThrow(
      expect.objectContaining({ reason: 'live' }),
    );
  });

  it('[M3.ytmusic/a] with no expire in a URL, the answer’s expiresInSeconds says when it ends', () => {
    const raw = json(ok);
    raw.streamingData.adaptiveFormats = raw.streamingData.adaptiveFormats.map(
      (f: { url: string }) => ({ ...f, url: f.url.replace(/expire=\d+&/, '') }),
    );
    const picked = pickFormat(parsePlayer(playerAnswerSchema.parse(raw), ID, NOW).formats);
    expect(picked?.expiresAt).toBe(NOW + 21_540_000);
  });
});

describe('[M3.ytmusic/a] the direct resolve ahead of yt-dlp, on recordings', () => {
  it('[M3.ytmusic/a] with no visitor held, one search, then one player call, and nothing spawns', async () => {
    const run = resolving({ search: [withVisitor(search, VISITOR)], player: [ok] });
    const audio = await run.extractor.resolve(ID);
    expect(audio).toMatchObject({ tier: 'direct', itag: 251, mime: 'audio/webm' });
    expect(run.asked.map((a) => a.endpoint)).toEqual(['search', 'player']);
    expect(run.spawned).toHaveLength(0);
  });

  it('[M3.ytmusic/a] the player is asked as VISIONOS with the held visitor id; the child never gets it', async () => {
    const visitor = new Visitor();
    visitor.keep(VISITOR);
    const run = resolving(
      { player: [botwall, botwall], search: [withVisitor(search, VISITOR)] },
      visitor,
    );
    await run.extractor.resolve(ID);
    const [player] = run.asked;
    expect(player?.headers.get('x-goog-visitor-id')).toBe(VISITOR);
    expect(player?.headers.get('x-youtube-client-name')).toBe('101');
    expect(player?.body).toMatchObject({
      videoId: ID,
      context: { client: { clientName: 'VISIONOS' } },
      contentCheckOk: true,
      racyCheckOk: true,
    });
    expect(run.spawned).toHaveLength(1);
    expect(JSON.stringify(run.spawned[0]?.env)).not.toContain(VISITOR);
    expect(JSON.stringify(run.spawned[0]?.args)).not.toContain(VISITOR);
  });

  it('[M3.ytmusic/a] the bot wall drops the visitor id, fetches a fresh one once, tries once more, then runs yt-dlp once', async () => {
    const visitor = new Visitor();
    visitor.keep(VISITOR);
    const fresh = 'CgtGcmVzaFZpc2l0b3Iy';
    const run = resolving(
      { player: [botwall, botwall], search: [withVisitor(search, fresh)] },
      visitor,
    );
    const audio = await run.extractor.resolve(ID);
    expect(run.asked.map((a) => a.endpoint)).toEqual(['player', 'search', 'player']);
    expect(run.asked[2]?.headers.get('x-goog-visitor-id')).toBe(fresh);
    expect(run.spawned).toHaveLength(1);
    expect(audio.tier).toBe('plain');
    expect(run.failed).toEqual(['PlayerRefused']);
  });

  it('[M3.ytmusic/a] an unplayable answer goes straight to yt-dlp, which says why', async () => {
    const visitor = new Visitor();
    visitor.keep(VISITOR);
    const run = resolving({ player: [unplayable] }, visitor);
    const audio = await run.extractor.resolve(ID);
    expect(run.asked).toHaveLength(1);
    expect(run.spawned).toHaveLength(1);
    expect(audio.tier).toBe('plain');
  });

  it('[M3.ytmusic/a] a search that names no visitor id runs yt-dlp, asking the player nothing', async () => {
    const run = resolving({ search: [search] });
    await run.extractor.resolve(ID);
    expect(run.asked.map((a) => a.endpoint)).toEqual(['search']);
    expect(run.failed).toEqual([new NoVisitor().name]);
    expect(run.spawned).toHaveLength(1);
  });

  it('[M3.ytmusic/a] a fresh URL held makes no call at all, and two taps on one id share one call', async () => {
    const visitor = new Visitor();
    visitor.keep(VISITOR);
    const run = resolving({ player: [ok] }, visitor);
    const [a, b] = await Promise.all([run.extractor.resolve(ID), run.extractor.resolve(ID)]);
    expect(a).toBe(b);
    await run.extractor.resolve(ID);
    expect(run.asked).toHaveLength(1);
    expect(run.spawned).toHaveLength(0);
  });

  it('a direct resolve that has not answered in three seconds gives way to yt-dlp', async () => {
    const home = mkdtempSync(join(tmpdir(), 'auralis-direct-'));
    homes.push(home);
    const spy = spawnSpy();
    const failed: string[] = [];
    const extractor = new Extractor({
      path: () => '/opt/yt-dlp',
      home,
      now: () => NOW,
      spawn: spy.spawn,
      direct: () => new Promise(() => undefined),
      onDirectFailed: (reason) => failed.push(reason),
    });
    const started = Date.now();
    expect((await extractor.resolve(ID)).tier).toBe('plain');
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_900);
    expect(failed).toEqual(['timeout']);
  }, 10_000);
});

describe("[M3.ytmusic/d] the canary's direct result", () => {
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
  const canary = (direct: Parameters<typeof canaryOf>[0]['direct']) => {
    const home = mkdtempSync(join(tmpdir(), 'auralis-direct-'));
    homes.push(home);
    return canaryOf({
      search: async () => [{ id: ID }],
      fetch: stream,
      spawn: spawnSpy().spawn,
      home,
      now: () => NOW,
      id: ID,
      query: 'q',
      ...(direct === undefined ? {} : { direct }),
    });
  };

  it('[M3.ytmusic/d] names which passed: the extractor’s tier, and the direct call apart', async () => {
    const result = await canary(async (id) => parsePlayer(answer(ok), id, NOW))('/opt/yt-dlp');
    expect(result).toMatchObject({
      passed: true,
      tier: 'plain',
      direct: { passed: true, codec: 'A_OPUS' },
    });
  });

  it('[M3.ytmusic/d] a bot wall on the direct call is its own blocked, and the extractor still decides', async () => {
    const result = await canary(async (id) => parsePlayer(answer(botwall), id, NOW))('/opt/yt-dlp');
    expect(result).toMatchObject({ passed: true, direct: { passed: false, reason: 'blocked' } });
  });

  it('[M3.ytmusic/d] with no direct resolve given, it reports none', async () => {
    expect(await canary(undefined)('/opt/yt-dlp')).not.toHaveProperty('direct');
  });
});
