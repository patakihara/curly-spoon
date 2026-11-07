import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordingSchema } from '../adapters/http/recording.js';
import {
  AUDIO_SELECTOR,
  classifyFailure,
  Extractor,
  ExtractorFailure,
  extractorArgs,
  type SpawnLike,
} from './extractor.js';
import { InfoRefused, isStreamHost, parseInfo, pickFormat } from './schemas.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');

function recorded(call: string): { rc: number; stdout: Record<string, unknown>; stderr: string } {
  const file = join(adapters, 'ytdlp', 'recordings', `${call}.json`);
  const recording = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const body = recording.response.body as {
    json: { stdout: Record<string, unknown>; stderr: string };
  };
  return { rc: recording.response.status, ...body.json };
}

const KNOWN = 'lYBUbBu4W08';
const plain = recorded('info-plain');
const withRuntime = recorded('info-node');
const formatsOf = (info: { stdout: Record<string, unknown> }) =>
  info.stdout.formats as Record<string, unknown>[];
/** A clock an hour before the recorded URLs expire. */
const EXPIRE = Number(/expire=(\d+)/.exec(JSON.stringify(plain.stdout))?.[1]) * 1000;
const NOW = EXPIRE - 3_600_000;

type Answer = { rc: number; stdout?: unknown; stderr?: string } | 'hold';

/** A spawn that answers from a script and says what it was asked. */
function fakeSpawn(answer: (args: string[]) => Answer) {
  const calls: { file: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const held: (() => void)[] = [];
  let live = 0;
  let most = 0;
  const spawn: SpawnLike = (file, args, options) => {
    calls.push({ file, args, env: options.env ?? {} });
    live += 1;
    most = Math.max(most, live);
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    const reply = (a: Exclude<Answer, 'hold'>) =>
      setImmediate(() => {
        if (a.stdout !== undefined) stdout.write(JSON.stringify(a.stdout));
        stderr.write(a.stderr ?? '');
        stdout.end();
        stderr.end();
        live -= 1;
        child.emit('close', a.rc);
      });
    const a = answer(args);
    if (a === 'hold') held.push(() => reply({ rc: 0, stdout: plain.stdout }));
    else reply(a);
    return child;
  };
  return { spawn, calls, held, most: () => most };
}

const homes: string[] = [];
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-extractor-'));
  homes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function extractor(spawn: SpawnLike, now = () => NOW) {
  return new Extractor({ path: () => '/opt/yt-dlp', home: home(), now, spawn });
}

const tick = () => new Promise((go) => setImmediate(go));

describe('[M3.ytmusic/a] the audio-only guard, rule 8, on what the extractor recorded', () => {
  it('[M3.ytmusic/a] keeps exactly the five audio-only formats of a recorded answer', () => {
    const info = parseInfo(plain.stdout);
    expect(info.formats.map((format) => format.itag)).toEqual([139, 249, 250, 140, 251]);
    expect(info.id).toBe(KNOWN);
    expect(formatsOf(plain).map((row) => row.format_id)).toContain('160');
  });

  it('[M3.ytmusic/a] refuses the recorded muxed format, 18, and every video-only one', () => {
    const rows = formatsOf(withRuntime);
    expect(rows.find((row) => row.format_id === '18')?.vcodec).not.toBe('none');
    const itags = parseInfo(withRuntime.stdout).formats.map((format) => format.itag);
    expect(itags).toEqual([139, 249, 250, 140, 251]);
  });

  it('[M3.ytmusic/a] throws noAudio on an answer holding only formats with a video stream', () => {
    const video = formatsOf(withRuntime).filter((row) =>
      ['18', '160'].includes(`${row.format_id}`),
    );
    expect(video).toHaveLength(2);
    const answer = { ...withRuntime.stdout, formats: video };
    expect(() => parseInfo(answer)).toThrow(InfoRefused);
    expect(() => parseInfo(answer)).toThrow(/noAudio/);
  });

  it('[M3.ytmusic/a] refuses a row claiming no video whose URL says video, m3u8, or another host', () => {
    const [opus] = formatsOf(plain).filter((row) => row.format_id === '251');
    const url = opus!.url as string;
    for (const row of [
      { ...opus, url: url.replace('audio%2Fwebm', 'video%2Fwebm') },
      { ...opus, protocol: 'm3u8_native' },
      { ...opus, url: url.replace('googlevideo.com', 'googlevideo.com.example.net') },
      { ...opus, url: url.replace('https:', 'http:') },
      { ...opus, url: url.replace(/expire=\d+&/, '') },
      { ...opus, acodec: 'none' },
    ]) {
      expect(() => parseInfo({ ...plain.stdout, formats: [row] })).toThrow(/noAudio/);
    }
  });

  it('[M3.ytmusic/a] picks 251, then 250, then 140, and has no field for video', () => {
    const { formats } = parseInfo(plain.stdout);
    expect(pickFormat(formats)?.itag).toBe(251);
    expect(pickFormat(formats.filter((f) => f.itag !== 251))?.itag).toBe(250);
    expect(pickFormat(formats.filter((f) => f.itag !== 251 && f.itag !== 250))?.itag).toBe(140);
    expect(Object.keys(formats[0]!).sort()).toEqual(
      ['abr', 'codec', 'expiresAt', 'itag', 'mime', 'size', 'url'].sort(),
    );
    expect(formats[0]!.mime).toMatch(/^audio\//);
  });

  it('[M3.ytmusic/a] the extractor itself is told to choose no format with video', () => {
    expect(AUDIO_SELECTOR).toBe('bestaudio[vcodec=none]');
    const args = extractorArgs(KNOWN, 'plain');
    expect(args[args.indexOf('--format') + 1]).toBe(AUDIO_SELECTOR);
  });

  it('[M3.ytmusic/a] only https on a stream host, on its usual port, with no name in it, passes', () => {
    const ok = 'https://rr1---sn-x.googlevideo.com/videoplayback';
    expect(isStreamHost(new URL(ok))).toBe(true);
    for (const bad of [
      'http://rr1---sn-x.googlevideo.com/',
      'https://googlevideo.com/',
      'https://rr1.googlevideo.com.example.net/',
      'https://example.net/.googlevideo.com',
      'https://rr1.googlevideo.com:8443/',
      'https://u:p@rr1.googlevideo.com/',
      'https://rr1.googlevideo.com@example.net/',
    ]) {
      expect(isStreamHost(new URL(bad)), bad).toBe(false);
    }
  });
});

describe('[M3.ytmusic/a] a stream URL never leaves', () => {
  it('[M3.ytmusic/a] prints as a placeholder when serialized, logged or inspected', async () => {
    const { spawn } = fakeSpawn(() => ({ rc: 0, stdout: plain.stdout }));
    const audio = await extractor(spawn).resolve(KNOWN);
    expect(audio.url.reveal()).toContain('googlevideo.com');
    for (const text of [
      JSON.stringify(audio),
      inspect(audio, { depth: 5 }),
      `${audio.url}`,
      String(audio.url),
    ]) {
      expect(text).not.toContain('googlevideo');
      expect(text).not.toContain('sig=');
    }
  });

  it("[M3.ytmusic/a] a failure carries the reason alone, none of the extractor's text", async () => {
    const leak = 'ERROR: https://rr1---sn-x.googlevideo.com/videoplayback?ip=85.76.1.2 refused';
    const { spawn } = fakeSpawn(() => ({ rc: 1, stderr: leak }));
    const failed = await extractor(spawn)
      .resolve(KNOWN)
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(ExtractorFailure);
    expect(inspect(failed, { depth: 5 })).not.toContain('googlevideo');
    expect(inspect(failed, { depth: 5 })).not.toContain('85.76.1.2');
  });
});

describe('[M3.ytmusic/a] no client text reaches the command line as a flag', () => {
  it.each([
    '--exec=reboot',
    '--exec',
    '-o/etc/passwd',
    '../../../et',
    'abc def ghij',
    'abcdefghij',
    'abcdefghijkl',
    'abcdefghij\n',
    'https://x.y/',
    '',
  ])('[M3.ytmusic/a] %j is refused and nothing runs', async (id) => {
    const { spawn, calls } = fakeSpawn(() => ({ rc: 0, stdout: plain.stdout }));
    await expect(extractor(spawn).resolve(id)).rejects.toMatchObject({ reason: 'badId' });
    expect(calls).toHaveLength(0);
  });

  it('[M3.ytmusic/a] an id that begins with a dash goes after `--`, last, and is not a flag', async () => {
    const id = '-abcdefghij';
    const { spawn, calls } = fakeSpawn(() => ({
      rc: 0,
      stdout: { ...plain.stdout, id },
    }));
    await extractor(spawn).resolve(id);
    const { args } = calls[0]!;
    expect(args.slice(-2)).toEqual(['--', id]);
    expect(args.indexOf('--')).toBe(args.length - 2);
  });

  it('[M3.ytmusic/a] pins no client and skips no page, in either tier', () => {
    for (const tier of ['plain', 'node'] as const) {
      const line = extractorArgs(KNOWN, tier).join(' ');
      expect(line).not.toMatch(/player_client|player_skip|extractor-args/);
      expect(line).toContain('--no-config');
      expect(line).toContain('--no-cache-dir');
    }
    expect(extractorArgs(KNOWN, 'plain').join(' ')).not.toContain('--js-runtimes');
    expect(extractorArgs(KNOWN, 'node').join(' ')).toContain('--js-runtimes node');
  });
});

describe('[M3.ytmusic/a] the two tiers', () => {
  const isNode = (args: string[]) => args.includes('--js-runtimes');

  it('[M3.ytmusic/a] the first passing answers, with no second run', async () => {
    const { spawn, calls } = fakeSpawn(() => ({ rc: 0, stdout: plain.stdout }));
    const audio = await extractor(spawn).resolve(KNOWN);
    expect(calls).toHaveLength(1);
    expect(audio).toMatchObject({ id: KNOWN, itag: 251, mime: 'audio/webm', tier: 'plain' });
    expect(audio.size).toBe(3445462);
    expect(audio.duration).toBe(plain.stdout.duration);
    expect(audio.expiresAt).toBe(EXPIRE);
  });

  it('[M3.ytmusic/a] a first failing runs the second, once, with node as its runtime', async () => {
    const wall = recorded('error-botwall');
    const { spawn, calls } = fakeSpawn((args) =>
      isNode(args) ? { rc: 0, stdout: withRuntime.stdout } : { rc: 1, stderr: wall.stderr },
    );
    const audio = await extractor(spawn).resolve(KNOWN);
    expect(calls.map((call) => isNode(call.args))).toEqual([false, true]);
    expect(audio.tier).toBe('node');
    expect(audio.itag).toBe(251);
  });

  it('[M3.ytmusic/a] a first with no audio-only format runs the second too', async () => {
    const video = formatsOf(withRuntime).filter((row) => row.format_id === '18');
    const { spawn, calls } = fakeSpawn((args) =>
      isNode(args)
        ? { rc: 0, stdout: withRuntime.stdout }
        : { rc: 0, stdout: { ...plain.stdout, formats: video } },
    );
    await expect(extractor(spawn).resolve(KNOWN)).resolves.toMatchObject({ tier: 'node' });
    expect(calls).toHaveLength(2);
  });

  it('[M3.ytmusic/a] only muxed formats in both throws noAudio, and hands over no stream', async () => {
    const video = formatsOf(withRuntime).filter((row) => row.format_id === '18');
    const { spawn, calls } = fakeSpawn(() => ({
      rc: 0,
      stdout: { ...withRuntime.stdout, formats: video },
    }));
    await expect(extractor(spawn).resolve(KNOWN)).rejects.toMatchObject({ reason: 'noAudio' });
    expect(calls).toHaveLength(2);
  });

  it('[M3.ytmusic/a] a recorded bot wall in both is `blocked`', async () => {
    const wall = recorded('error-botwall');
    expect(wall.rc).toBe(1);
    const { spawn } = fakeSpawn(() => ({ rc: wall.rc, stderr: wall.stderr }));
    await expect(extractor(spawn).resolve(KNOWN)).rejects.toMatchObject({ reason: 'blocked' });
  });

  it('[M3.ytmusic/a] a recorded missing video is `gone`, per track, whatever its warnings say', async () => {
    const missing = recorded('error-unavailable');
    expect(classifyFailure(missing.stderr)).toBe('gone');
    expect(classifyFailure(`WARNING: Sign in to confirm\n${missing.stderr}`)).toBe('gone');
    expect(classifyFailure('ERROR: Requested format is not available')).toBe('noAudio');
    expect(classifyFailure('ERROR: Unable to download API page: timed out')).toBe('unavailable');
    expect(classifyFailure('ERROR: something new')).toBe('extractorError');
  });

  it('[M3.ytmusic/a] an answer for another id is not believed', async () => {
    const { spawn } = fakeSpawn(() => ({ rc: 0, stdout: { ...plain.stdout, id: 'bbbbbbbbbbb' } }));
    await expect(extractor(spawn).resolve(KNOWN)).rejects.toMatchObject({
      reason: 'extractorError',
    });
  });
});

describe('[M3.ytmusic/a] how many run at once', () => {
  const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'];

  it('[M3.ytmusic/a] everyone asking for one id shares one run', async () => {
    const { spawn, calls, held } = fakeSpawn(() => 'hold');
    const e = extractor(spawn);
    const asked = [e.resolve(KNOWN), e.resolve(KNOWN), e.resolve(KNOWN)];
    await tick();
    expect(calls).toHaveLength(1);
    held[0]!();
    const answers = await Promise.all(asked);
    expect(answers[1]).toBe(answers[0]);
    expect(answers[2]).toBe(answers[0]);
  });

  it('[M3.ytmusic/a] two plain runs start at once, and a third waits for one to end', async () => {
    const { spawn, calls, held } = fakeSpawn(() => 'hold');
    const e = extractor(spawn);
    for (const id of ids) void e.resolve(id).catch(() => undefined);
    await tick();
    expect(calls).toHaveLength(2);
    held[0]!();
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
  });

  it('[M3.ytmusic/a] at most one node run at once', async () => {
    let plainLive = 0;
    let plainMost = 0;
    let nodeLive = 0;
    let nodeMost = 0;
    const spawn: SpawnLike = (_file, args) => {
      const node = args.includes('--js-runtimes');
      if (node) {
        nodeLive += 1;
        nodeMost = Math.max(nodeMost, nodeLive);
      } else {
        plainLive += 1;
        plainMost = Math.max(plainMost, plainLive);
      }
      const child = new EventEmitter() as ChildProcess & EventEmitter;
      Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), pid: 1 });
      setTimeout(() => {
        if (node) nodeLive -= 1;
        else plainLive -= 1;
        child.emit('close', 1);
      }, 5);
      return child;
    };
    const e = extractor(spawn);
    await Promise.all(ids.map((id) => e.resolve(id).catch(() => undefined)));
    expect(plainMost).toBe(2);
    expect(nodeMost).toBe(1);
  });
});

describe("[M3.ytmusic/a] a URL's life in memory", () => {
  it('[M3.ytmusic/a] is used again until ten minutes before it expires, then resolved afresh', async () => {
    let now = NOW;
    const { spawn, calls } = fakeSpawn(() => ({ rc: 0, stdout: plain.stdout }));
    const e = extractor(spawn, () => now);
    const first = await e.resolve(KNOWN);
    expect(await e.resolve(KNOWN)).toBe(first);
    expect(calls).toHaveLength(1);
    now = EXPIRE - 10 * 60_000 - 1;
    expect(await e.resolve(KNOWN)).toBe(first);
    now = EXPIRE - 10 * 60_000;
    await e.resolve(KNOWN);
    expect(calls).toHaveLength(2);
  });

  it('[M3.ytmusic/a] a refused URL is replaced once, however many plays report it', async () => {
    const { spawn, calls } = fakeSpawn(() => ({ rc: 0, stdout: plain.stdout }));
    const e = extractor(spawn);
    const refused = await e.resolve(KNOWN);
    const [a, b] = await Promise.all([
      e.resolve(KNOWN, { replacing: refused.url }),
      e.resolve(KNOWN, { replacing: refused.url }),
    ]);
    expect(calls).toHaveLength(2);
    expect(a).toBe(b);
    expect(await e.resolve(KNOWN, { replacing: refused.url })).toBe(a);
    expect(calls).toHaveLength(2);
  });
});

describe('[M3.ytmusic/a] the child itself, a real process', () => {
  const script = (dir: string, body: string) => {
    const file = join(dir, 'fake-extractor');
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  };
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it("[M3.ytmusic/a] holds no key of the server's in its environment, and starts in its home", async () => {
    vi.stubEnv('SECRET_KEY', 'never-seen');
    vi.stubEnv('ABS_API_KEY_FILE', '/run/secrets/never-seen');
    vi.stubEnv('JELLYFIN_API_KEY', 'never-seen');
    const dir = home();
    const path = script(dir, 'env > "$HOME/env"; pwd > "$HOME/cwd"; exit 1');
    const e = new Extractor({ path: () => path, home: dir, now: () => NOW });
    await e.resolve(KNOWN).catch(() => undefined);
    vi.unstubAllEnvs();
    const env = readFileSync(join(dir, 'env'), 'utf8');
    expect(env).not.toMatch(/KEY|never-seen|SECRET/);
    const names = env
      .trim()
      .split('\n')
      .map((line) => line.split('=')[0])
      .filter((name) => !['PWD', 'OLDPWD', 'SHLVL', '_'].includes(name!));
    expect(names.sort()).toEqual(['HOME', 'PATH']);
    expect(readFileSync(join(dir, 'cwd'), 'utf8').trim()).toBe(dir);
  });

  it('[M3.ytmusic/a] is killed at its time limit, with the children it started', async () => {
    const dir = home();
    const path = script(dir, 'sleep 300 &\necho $! > "$HOME/child"\necho $$ > "$HOME/self"\nwait');
    const e = new Extractor({ path: () => path, home: dir, now: () => NOW, timeoutMs: 300 });
    await expect(e.resolve(KNOWN)).rejects.toMatchObject({ reason: 'extractorError' });
    const child = Number(readFileSync(join(dir, 'child'), 'utf8'));
    const self = Number(readFileSync(join(dir, 'self'), 'utf8'));
    expect(child).toBeGreaterThan(0);
    await vi.waitFor(() => {
      expect(alive(child)).toBe(false);
      expect(alive(self)).toBe(false);
    });
  });

  it('[M3.ytmusic/a] the limit defaults to 30 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const killed: number[] = [];
      const { spawn } = fakeSpawn(() => 'hold');
      const e = new Extractor({
        path: () => '/x',
        home: home(),
        now: () => NOW,
        spawn,
        kill: (pid) => killed.push(pid),
      });
      void e.resolve(KNOWN).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(killed).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(killed).toEqual([4242]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('[M3.ytmusic/a] a binary that is not there fails without throwing out of the process', async () => {
    const e = new Extractor({ path: () => '/no/such/binary', home: home(), now: () => NOW });
    await expect(e.resolve(KNOWN)).rejects.toMatchObject({ reason: 'extractorError' });
  });
});
