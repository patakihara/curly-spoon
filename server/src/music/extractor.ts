/**
 * Runs the extractor (yt-dlp), a process per call, to turn a video id into an audio-only stream. No
 * client's text reaches its command line but an id that passed `YT_ID`, and that after `--`. Each
 * child gets a clean environment, no config, no cache and a time limit, and a kill takes its children
 * with it. Tried twice, in order: the default clients with no JS runtime (2 s, 56 MiB, checked
 * live), then node as the runtime (6 s, 260 MiB). At most two plain runs and one node run at once,
 * and one per id. A failure names a reason and nothing of the extractor's output, which can hold a
 * stream's URL. The URL itself stays in memory only, until ten minutes before it expires.
 */
import { type ChildProcess, spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import {
  type AudioFormat,
  InfoRefused,
  parseInfo,
  pickFormat,
  type StreamUrl,
  YT_ID,
} from './schemas.js';

export type ExtractorReason =
  /** The site asks for a sign-in. No update can help. */
  | 'blocked'
  /** This track is gone, or private. Says nothing of the extractor's health. */
  | 'gone'
  /** This track is live now, and a live stream never plays. */
  | 'live'
  /** This track is not out yet. */
  | 'premiere'
  /** This track names no length, which a song always has. */
  | 'noLength'
  /** This track is barred in this country. */
  | 'regionBlocked'
  /** This track needs a membership or a subscription, and no account is used. */
  | 'membersOnly'
  /** It answered, with no audio-only format. */
  | 'noAudio'
  /** The network failed, so nothing is known. */
  | 'unavailable'
  /** Anything else, a time limit among them. */
  | 'extractorError'
  /** The id is not an id; nothing ran. */
  | 'badId';

export class ExtractorFailure extends Error {
  constructor(readonly reason: ExtractorReason) {
    super(`the extractor failed: ${reason}`);
    this.name = 'ExtractorFailure';
  }
}

export type Tier = 'plain' | 'node';

/** Asks for a format with no video, so the extractor itself cannot pick a muxed one. */
export const AUDIO_SELECTOR = 'bestaudio[vcodec=none]';

/** The whole command line, for an id that has passed `YT_ID`. */
export function extractorArgs(id: string, tier: Tier): string[] {
  return [
    '--no-config',
    '--no-cache-dir',
    '--no-playlist',
    '--dump-json',
    '--format',
    AUDIO_SELECTOR,
    ...(tier === 'node' ? ['--js-runtimes', 'node'] : []),
    '--',
    id,
  ];
}

const KILL_AFTER_MS = 30_000;
/** An answer is a few hundred KB; past this the child is killed rather than read. */
const MOST_OUTPUT_BYTES = 32 * 1024 * 1024;
/** How long a killed child may take to close its pipes before it is given up on. */
const GIVE_UP_AFTER_KILL_MS = 2_000;
const CHILD_PATH = '/usr/local/bin:/usr/bin:/bin';
const URL_KEPT_UNTIL_BEFORE_EXPIRY_MS = 10 * 60_000;
const MOST_URLS_HELD = 256;

const BOT_WALL = /sign in to confirm|not a bot/i;
const GONE =
  /video (?:is )?unavailable|private video|not available|has been removed|account .*terminated|your age/i;
const NO_FORMAT = /requested format is not available|no video formats found/i;
const REGION =
  /not made this video available in your country|not available in your (?:country|location)/i;
const MEMBERS = /members-only|join this channel|only available to (?:[\w ]+ )?(?:members|premium)/i;
const PREMIERE = /live event will begin|premieres in/i;
/** The site answered, whatever it said, so the network is not at fault. */
const HTTP_ANSWER = /HTTP Error \d{3}/i;
const NETWORK =
  /timed out|connection (?:reset|refused|aborted)|network is unreachable|name resolution|name or service|getaddrinfo|unable to download/i;

/** What a failed run's error lines say of why, warnings aside. The text itself goes no further. */
export function classifyFailure(stderr: string): ExtractorReason {
  const errors = stderr
    .split('\n')
    .filter((line) => line.startsWith('ERROR:'))
    .join('\n');
  if (BOT_WALL.test(errors) && !/your age/i.test(errors)) return 'blocked';
  if (NO_FORMAT.test(errors)) return 'noAudio';
  if (REGION.test(errors)) return 'regionBlocked';
  if (MEMBERS.test(errors)) return 'membersOnly';
  if (PREMIERE.test(errors)) return 'premiere';
  if (GONE.test(errors)) return 'gone';
  if (HTTP_ANSWER.test(errors)) return 'extractorError';
  if (NETWORK.test(errors)) return 'unavailable';
  return 'extractorError';
}

export interface RunResult {
  rc: number | null;
  stdout: string;
  stderr: string;
  /** Killed for its time limit, or for answering too much. */
  killed: boolean;
}

export type SpawnLike = (file: string, args: string[], options: SpawnOptions) => ChildProcess;

/** Kills a process group: a child started `detached` leads its own, with its children in it. */
export const killGroup = (pid: number): void => {
  process.kill(-pid, 'SIGKILL');
};

export interface RunOptions {
  spawn?: SpawnLike;
  kill?: (pid: number) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

/** One run of a child, to its end or its kill. Never rejects: a child that cannot start has no rc. */
export function runChild(file: string, args: string[], options: RunOptions): Promise<RunResult> {
  const { env, cwd } = options;
  const kill = options.kill ?? killGroup;
  const maxOutput = options.maxOutputBytes ?? MOST_OUTPUT_BYTES;
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let total = 0;
    let killed = false;
    let done = false;
    let giveUp: NodeJS.Timeout | undefined;

    const finish = (rc: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(giveUp);
      resolve({
        rc,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        killed,
      });
    };

    let child: ChildProcess;
    try {
      child = (options.spawn ?? nodeSpawn)(file, args, {
        env,
        cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      finish(null);
      return;
    }

    const stop = () => {
      if (killed || done) return;
      killed = true;
      try {
        if (child.pid !== undefined) kill(child.pid);
      } catch {
        // It has already gone.
      }
      giveUp = setTimeout(() => finish(null), GIVE_UP_AFTER_KILL_MS);
    };
    const timer = setTimeout(stop, options.timeoutMs ?? KILL_AFTER_MS);

    const collect = (into: Buffer[]) => (data: Buffer) => {
      total += data.byteLength;
      if (total > maxOutput) stop();
      else into.push(data);
    };
    child.stdout?.on('data', collect(stdout));
    child.stderr?.on('data', collect(stderr));
    child.on('error', () => finish(null));
    child.on('close', (rc) => finish(rc));
  });
}

/** Runs at most `limit` at once, in the order asked. */
class Gate {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((go) => this.waiting.push(go));
    } else {
      this.running += 1;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next !== undefined) next();
      else this.running -= 1;
    }
  }
}

/** A stream a play can use. `url` is the only way to it, and it prints as a placeholder. */
export interface ResolvedAudio {
  id: string;
  url: StreamUrl;
  itag: number;
  mime: string;
  /** Bytes, when the extractor named them. */
  size: number | null;
  /** Seconds. */
  duration: number;
  expiresAt: number;
  tier: Tier;
}

export interface ResolveOptions {
  /** This URL was refused: answer with another, resolving afresh unless one has arrived already. */
  replacing?: StreamUrl;
}

export interface ExtractorOptions {
  /** The binary now in use, read at each run: the daily update moves it. */
  path: () => string;
  /** The child's only home, inside the data folder. */
  home: string;
  now: () => number;
  spawn?: SpawnLike;
  kill?: (pid: number) => void;
  timeoutMs?: number;
}

export class Extractor {
  private readonly plain = new Gate(2);
  private readonly node = new Gate(1);
  private readonly running = new Map<string, Promise<ResolvedAudio>>();
  private readonly urls = new Map<string, ResolvedAudio>();

  constructor(private readonly opts: ExtractorOptions) {}

  /** A stream for `id`: the one in hand while it holds, else a run shared by everyone asking. */
  async resolve(id: string, options: ResolveOptions = {}): Promise<ResolvedAudio> {
    if (!YT_ID.test(id)) throw new ExtractorFailure('badId');
    const held = this.urls.get(id);
    if (held !== undefined) {
      const fresh = this.opts.now() < held.expiresAt - URL_KEPT_UNTIL_BEFORE_EXPIRY_MS;
      if (fresh && held.url !== options.replacing) return held;
      this.urls.delete(id);
    }
    const running = this.running.get(id);
    if (running !== undefined) return running;
    const run = this.extract(id).finally(() => this.running.delete(id));
    this.running.set(id, run);
    return run;
  }

  private async extract(id: string): Promise<ResolvedAudio> {
    let audio: ResolvedAudio;
    try {
      audio = await this.plain.run(() => this.attempt(id, 'plain'));
    } catch (error) {
      if (!(error instanceof ExtractorFailure)) throw error;
      audio = await this.node.run(() => this.attempt(id, 'node'));
    }
    this.hold(audio);
    return audio;
  }

  private async attempt(id: string, tier: Tier): Promise<ResolvedAudio> {
    const { home } = this.opts;
    try {
      mkdirSync(home, { recursive: true });
    } catch {
      throw new ExtractorFailure('extractorError');
    }
    const result = await runChild(this.opts.path(), extractorArgs(id, tier), {
      env: { HOME: home, PATH: CHILD_PATH },
      cwd: home,
      ...(this.opts.spawn === undefined ? {} : { spawn: this.opts.spawn }),
      ...(this.opts.kill === undefined ? {} : { kill: this.opts.kill }),
      ...(this.opts.timeoutMs === undefined ? {} : { timeoutMs: this.opts.timeoutMs }),
    });
    if (result.killed) throw new ExtractorFailure('extractorError');
    if (result.rc !== 0) throw new ExtractorFailure(classifyFailure(result.stderr));
    return audioOf(id, result.stdout, tier);
  }

  private hold(audio: ResolvedAudio): void {
    const now = this.opts.now();
    for (const [id, held] of this.urls) {
      if (held.expiresAt <= now) this.urls.delete(id);
    }
    if (this.urls.size >= MOST_URLS_HELD) {
      const oldest = this.urls.keys().next().value;
      if (oldest !== undefined) this.urls.delete(oldest);
    }
    this.urls.set(audio.id, audio);
  }
}

function audioOf(id: string, stdout: string, tier: Tier): ResolvedAudio {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new ExtractorFailure('extractorError');
  }
  let picked: AudioFormat | undefined;
  let duration: number;
  try {
    const info = parseInfo(raw);
    if (info.id !== id) throw new ExtractorFailure('extractorError');
    picked = pickFormat(info.formats);
    duration = info.duration;
  } catch (error) {
    if (error instanceof InfoRefused) throw new ExtractorFailure(error.reason);
    throw error;
  }
  if (picked === undefined) throw new ExtractorFailure('noAudio');
  return {
    id,
    url: picked.url,
    itag: picked.itag,
    mime: picked.mime,
    size: picked.size,
    duration,
    expiresAt: picked.expiresAt,
    tier,
  };
}
