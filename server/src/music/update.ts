/**
 * The extractor's daily update. A release recreates the container, so a strict day's timer might
 * never fire: the job ticks hourly, by the table acts once 20 hours have passed, and leaves its first
 * tick after a start alone, so a start makes no upstream call. Each run checks the version in use,
 * then looks for a newer release. A download is verified against the checksum file published with it
 * before anything of it runs, is capped, unpacks and answers `--version` under the same limits as any
 * child, and only a canary pass puts it in use. A failing one is deleted and the last passing version
 * stays. When the version in use fails and there is no new release, nightly is tried: fixes reach it
 * first. A network failure, or a bot wall on a candidate, says nothing of the binary and changes
 * nothing; a bot wall on the version in use stops the run, since no update can help.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs';
import { chmod, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type Release, releaseSchema, sumOf } from '../adapters/github/schemas.js';
import { type FetchLike } from '../adapters/http/fetch.js';
import { readCapped } from '../adapters/http/publicFetch.js';
import type { Canary, CanaryResult } from './canary.js';
import { runChild, type SpawnLike } from './extractor.js';
import { BINARY, type ExtractorVersions, type VersionSource } from './versions.js';

export const UPDATE_EVERY_MS = 60 * 60_000;
export const UPDATE_DUE_AFTER_MS = 20 * 60 * 60_000;

/** The archive is 41 MB; past this the download stops. */
const MOST_ARCHIVE_BYTES = 120 * 1024 * 1024;
const MOST_TEXT_BYTES = 4 * 1024 * 1024;
const MOST_REDIRECTS = 3;
const ASKED_MS = 120_000;
const USER_AGENT = 'auralis-extractor-update';
const CHILD_PATH = '/usr/local/bin:/usr/bin:/bin';
const SUMS = 'SHA2-256SUMS';

const STABLE = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const NIGHTLY = 'https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest';

/** Where an archive may come from: GitHub, and the host it redirects a download to. */
const isDownloadHost = (url: URL) =>
  url.protocol === 'https:' &&
  (url.hostname === 'github.com' || /\.githubusercontent\.com$/.test(url.hostname));

/** The published archive for this machine, and the binary's name inside it. */
export function archiveFor(arch: string): { archive: string; binary: string } | null {
  if (arch === 'x64') return { archive: 'yt-dlp_musllinux.zip', binary: 'yt-dlp_musllinux' };
  if (arch === 'arm64') {
    return { archive: 'yt-dlp_musllinux_aarch64.zip', binary: 'yt-dlp_musllinux_aarch64' };
  }
  return null;
}

export type UpdateOutcome =
  'notDue' | 'unavailable' | 'blocked' | 'current' | 'promoted' | 'failed' | 'noCandidate';

export interface ExtractorUpdateOptions {
  versions: ExtractorVersions;
  /** Reaches only the public internet, and follows no redirect itself. */
  fetch: FetchLike;
  canary: Canary;
  now: () => number;
  /** The extractor's only home, where each child runs. */
  home: string;
  arch?: string;
  spawn?: SpawnLike;
  kill?: (pid: number) => void;
  timeoutMs?: number;
  /** Told of each canary result on the version in use. */
  onCanary?: (result: CanaryResult) => void;
  log: { warn: (details: Record<string, unknown>, message: string) => void };
}

/** Something between here and GitHub failed, which says nothing of the version. */
class NoResult extends Error {}

/** The download itself is at fault: the version is failed, without running anything further. */
class BadDownload extends Error {}

export class ExtractorUpdate {
  private ticked = false;

  constructor(private readonly opts: ExtractorUpdateOptions) {}

  /** One hourly tick: the first after a start does nothing, and the rest run only when due. */
  async tick(): Promise<UpdateOutcome> {
    if (!this.ticked) {
      this.ticked = true;
      return 'notDue';
    }
    const last = this.opts.versions.lastCanaryAt();
    if (last !== null && this.opts.now() - last < UPDATE_DUE_AFTER_MS) return 'notDue';
    return this.run();
  }

  /** One run, due or not: the canary on what is in use, then any newer version. */
  async run(): Promise<UpdateOutcome> {
    const { versions, canary, now, log } = this.opts;
    const current = versions.now();
    const result = await canary(current.path);
    this.opts.onCanary?.(result);
    if (!result.passed && result.reason === 'unavailable') {
      log.warn({ reason: result.reason }, 'the extractor canary could not reach the network');
      return 'unavailable';
    }
    versions.recordCurrent(result, now());
    if (!result.passed)
      log.warn({ reason: result.reason }, 'the extractor in use failed its canary');
    if (!result.passed && result.reason === 'blocked') return 'blocked';
    try {
      const outcome = await this.tryRelease(STABLE, 'release', result.passed);
      if (result.passed || outcome === 'promoted') return outcome;
      const nightly = await this.tryRelease(NIGHTLY, 'nightly', false);
      return nightly === 'noCandidate' ? outcome : nightly;
    } catch (error) {
      if (!(error instanceof NoResult)) throw error;
      log.warn(
        { reason: error.message },
        'the extractor update could not finish, so nothing moved',
      );
      return 'unavailable';
    }
  }

  private async tryRelease(
    url: string,
    source: VersionSource,
    currentPassed: boolean,
  ): Promise<UpdateOutcome> {
    const { versions, canary, now, log } = this.opts;
    const release = await this.latest(url);
    const version = release.tag_name;
    if (version <= versions.now().version) return 'current';
    const before = versions.row(version);
    if (before?.state === 'failed') {
      const recently = now() - (before.canary_at ?? 0) < UPDATE_DUE_AFTER_MS;
      if (currentPassed || recently) return 'current';
    }
    const asset = archiveFor(this.opts.arch ?? process.arch);
    if (asset === null) return 'noCandidate';

    const incoming = versions.incoming(version);
    rmSync(incoming, { recursive: true, force: true });
    mkdirSync(incoming, { recursive: true });
    try {
      await this.unpack(release, asset, incoming);
      const inPlace = versions.folder(version);
      rmSync(inPlace, { recursive: true, force: true });
      await rename(incoming, inPlace);
      const binary = join(inPlace, BINARY);
      const result = await canary(binary);
      if (result.passed) {
        versions.promote(version, source, result, now());
        return 'promoted';
      }
      rmSync(inPlace, { recursive: true, force: true });
      if (result.reason === 'unavailable' || result.reason === 'blocked') {
        throw new NoResult(`the candidate's canary said ${result.reason}`);
      }
      versions.fail(version, source, result, now());
      log.warn({ version, reason: result.reason }, 'a new extractor failed its canary');
      return 'failed';
    } catch (error) {
      if (error instanceof BadDownload) {
        versions.fail(version, source, { passed: false, reason: 'extractorError', ms: 0 }, now());
        log.warn({ version, reason: error.message }, 'a new extractor was refused');
        return 'failed';
      }
      throw error;
    } finally {
      rmSync(incoming, { recursive: true, force: true });
    }
  }

  private async latest(url: string): Promise<Release> {
    const text = await this.text(url, { accept: 'application/vnd.github+json' });
    const parsed = releaseSchema.safeParse(safeJson(text));
    if (!parsed.success) throw new NoResult('a release answer was not understood');
    return parsed.data;
  }

  /** Downloads and checks the archive, and only then unpacks it and lets it run. */
  private async unpack(
    release: Release,
    asset: { archive: string; binary: string },
    into: string,
  ): Promise<void> {
    const named = (name: string) => release.assets.find((a) => a.name === name);
    const archive = named(asset.archive);
    const sums = named(SUMS);
    if (archive === undefined || sums === undefined) throw new BadDownload('an asset is missing');
    if (archive.size > MOST_ARCHIVE_BYTES) throw new BadDownload('the archive is too large');
    for (const { browser_download_url: url } of [archive, sums]) {
      if (!isDownloadHost(new URL(url))) throw new BadDownload('a download is named elsewhere');
    }
    const sum = sumOf(await this.text(sums.browser_download_url, {}), asset.archive);
    if (sum === undefined) throw new BadDownload('the checksum file does not name the archive');
    const zip = join(dirname(into), `${release.tag_name}.zip`);
    try {
      const got = await this.download(archive.browser_download_url, zip);
      if (got !== sum) throw new BadDownload('the checksum does not match');
      await this.child('unzip', ['-q', zip, '-d', into], into);
    } finally {
      rmSync(zip, { force: true });
    }
    const binary = join(into, BINARY);
    try {
      renameSync(join(into, asset.binary), binary);
      await chmod(binary, 0o755);
    } catch {
      throw new BadDownload('the archive does not hold the binary');
    }
    const answer = await this.child(binary, ['--version'], into);
    if (answer.trim() !== release.tag_name) {
      throw new BadDownload('the binary does not say the release version');
    }
  }

  private async child(file: string, args: string[], cwd: string): Promise<string> {
    const { spawn, kill, timeoutMs, home } = this.opts;
    mkdirSync(home, { recursive: true });
    const result = await runChild(file, args, {
      env: { HOME: home, PATH: CHILD_PATH },
      cwd,
      ...(spawn === undefined ? {} : { spawn }),
      ...(kill === undefined ? {} : { kill }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
    if (result.killed || result.rc !== 0) throw new BadDownload(`${BINARY} would not run`);
    return result.stdout;
  }

  /** A GET, following a redirect only to GitHub's own download hosts. */
  private async ask(url: string, headers: Record<string, string>): Promise<Response> {
    let at = url;
    for (let hops = 0; hops <= MOST_REDIRECTS; hops += 1) {
      const signal = AbortSignal.timeout(ASKED_MS);
      let answer: Response;
      try {
        answer = await this.opts.fetch(at, {
          method: 'GET',
          headers: { 'user-agent': USER_AGENT, ...headers },
          redirect: 'manual',
          signal,
        });
      } catch {
        throw new NoResult('GitHub could not be reached');
      }
      if (answer.status < 300 || answer.status >= 400) {
        if (answer.ok) return answer;
        await answer.body?.cancel();
        throw new NoResult(`GitHub answered ${answer.status}`);
      }
      const location = answer.headers.get('location');
      await answer.body?.cancel();
      if (location === null || !URL.canParse(location, at)) break;
      const next = new URL(location, at);
      if (!isDownloadHost(next)) break;
      at = next.href;
    }
    throw new BadDownload('a download led somewhere else');
  }

  private async text(url: string, headers: Record<string, string>): Promise<string> {
    const answer = await this.ask(url, headers);
    const bytes = await readCapped(answer, MOST_TEXT_BYTES).catch(() => {
      throw new NoResult('GitHub stopped answering');
    });
    if (bytes === null) throw new BadDownload('an answer is too large');
    return Buffer.from(bytes).toString('utf8');
  }

  /** Streams the archive to `path`, within the cap; its SHA-256. */
  private async download(url: string, path: string): Promise<string> {
    const answer = await this.ask(url, {});
    if (answer.body === null) throw new BadDownload('the archive came empty');
    const hash = createHash('sha256');
    const out = createWriteStream(path, { mode: 0o600 });
    const closed = new Promise<void>((done, failed) => {
      out.once('close', done);
      out.once('error', failed);
    });
    const reader = answer.body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read().catch(() => {
          throw new NoResult('the download stopped');
        });
        if (done) break;
        total += value.byteLength;
        if (total > MOST_ARCHIVE_BYTES) {
          await reader.cancel();
          throw new BadDownload('the archive is too large');
        }
        hash.update(value);
        if (!out.write(value)) await new Promise<void>((go) => out.once('drain', () => go()));
      }
    } finally {
      out.end();
      await closed;
    }
    return hash.digest('hex');
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
