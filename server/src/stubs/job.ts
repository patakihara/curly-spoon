/**
 * The hourly stubbing pass, ported from the old podcast-stubs reconciler (stub_reconcile.py): for
 * each show in Audiobookshelf whose feed is not one of Auralis's own YouTube channel feeds, read
 * the feed and, oldest episode first,
 *
 * - write a stub for an enclosure with no file (format.ts `writeStub`);
 * - adopt a whole file that carries no stub attributes (`adoptFile`);
 * - skip a `[TEASER]` or `(TEASER)` item, and remove one still a stub;
 * - on a Patreon feed, skip the items that repeat an episode ABS already holds (`premiumDuplicates`);
 *
 * then ask ABS to scan each show whose folder changed, never the library. An episode's file is
 * found under ABS's own name or the old stubgen's (filename.ts), so nothing is ever stubbed beside
 * a file already there. The pause marker is set before the first write and cleared at the end, so
 * ABS's probes of the new stubs never hydrate them. One show's failure leaves the rest running.
 * Nothing logged holds an enclosure's or feed's query: a Patreon feed's token sits there.
 */
import { existsSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import type { HeldEpisode, PodcastShow } from '../adapters/audiobookshelf/provision.js';
import type { Feed, FeedEpisode } from '../adapters/feed/client.js';
import { episodeFilenames } from './filename.js';
import { adoptFile, isKnown, isStub, type RangeGet, writeStub } from './format.js';

/** Titles never stubbed (the household's call: Patreon shows post a short teaser of each episode). */
export const TEASER = /[[(]\s*teaser\s*[\])]/i;

/** ABS's watcher waits for 10 s of quiet; a pause every 20 stubs lets each batch through. */
export const WATCHER_FLUSH_EVERY = 20;
export const WATCHER_FLUSH_MS = 15_000;

/** What the job asks of Audiobookshelf, through the provisioning key. */
export interface JobAbs {
  podcastShows(): Promise<PodcastShow[]>;
  showEpisodes(itemId: string): Promise<HeldEpisode[]>;
  scanItem(itemId: string): Promise<void>;
}

export interface JobOptions {
  readonly abs: JobAbs;
  /** Reads a show's feed through the guard (`readNamedFeed` over `feedFetch`). */
  readonly readFeed: (url: string) => Promise<Feed>;
  readonly rangeGet: RangeGet;
  /** The folder ABS names its media by (`/data`), and where this process sees it (`/media`). */
  readonly absRoot: string;
  readonly mediaRoot: string;
  /** Auralis's own channel feeds start with this (`PUBLIC_ORIGIN` + `/feeds/youtube/`). */
  readonly channelFeedPrefix: string;
  /** The pause marker's path (`/control/pause-hydration`). */
  readonly pauseMarker: string;
  readonly log: (line: string) => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface JobResult {
  written: number;
  adopted: number;
  removed: number;
  skippedTeaser: number;
  skippedDuplicate: number;
  skippedNoName: number;
  failed: number;
  /** The shows scanned, by item id. */
  scanned: string[];
}

/** A URL as a log line may carry it: host and file name, never a query or a path's middle. */
export function urlForLog(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return `${host}/…/${posix.basename(pathname)}`;
  } catch {
    return '(an address that does not parse)';
  }
}

/** Feed items by date, oldest first; undated ones last, in reversed feed order. */
export function oldestFirst(episodes: readonly FeedEpisode[]): FeedEpisode[] {
  const reversed = [...episodes].reverse();
  return reversed
    .map((episode, at) => ({ episode, at }))
    .sort((a, b) => {
      const x = a.episode.publishedAt;
      const y = b.episode.publishedAt;
      if (x === null || y === null) return x === y ? a.at - b.at : x === null ? 1 : -1;
      return x - y || a.at - b.at;
    })
    .map(({ episode }) => episode);
}

// The Patreon duplicate rule (stub_reconcile.py `premium_duplicates`, host-owner call
// 2026-11-07): a Patreon feed reposts public episodes as "[AD-FREE]", "[SUBSCRIBER-ONLY]",
// "[Patreon Early Access]" and so on, and a second copy splits progress.
const PREMIUM_MARKER =
  /(\s*([[(]\s*(ad[- ]?free|subscriber[- ]?only|patreon[- ]?only|premium([- ]?only)?|unlocked|(patreon )?early access)\s*[\])]|-\s*(ad[- ]?free|unlocked premium episode)))+\s*$/i;
const DUP_DURATION_S = 120;
const SAME_DURATION_S = 2;
const DUP_WORD_OVERLAP = 0.5;
/** A public preview this much shorter than the premium episode repeats nothing. */
const PREVIEW_RATIO = 0.6;
const DAY_MS = 24 * 3600 * 1000;

export function normTitle(title: string | null): string {
  return (title ?? '')
    .normalize('NFKC')
    .replace(PREMIUM_MARKER, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The UTC calendar day of a date, as Python's `parsedate_to_datetime(...).date()` reads it. */
function dayOf(ms: number | null): number | null {
  return ms === null ? null : Math.floor(ms / DAY_MS);
}

function stem(filename: string | null): string {
  if (filename === null) return '';
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/**
 * The candidates (feed items with no file yet) that repeat an episode ABS holds, or each other.
 * A repeat has the same title or file name once the premium markers go; or a date a day apart at
 * most and a duration 2 s apart, or 2 minutes apart with half its title words shared; never one
 * under 60% of the candidate's length. Among candidates of one day and duration, only the largest
 * enclosure stays.
 */
export function premiumDuplicates(
  candidates: readonly FeedEpisode[],
  held: readonly HeldEpisode[],
): Set<FeedEpisode> {
  const have = held.map((e) => {
    const at = e.pubDate === null ? NaN : Date.parse(e.pubDate);
    return {
      title: normTitle(e.title),
      file: normTitle(stem(e.filename)),
      day: dayOf(Number.isNaN(at) ? null : at),
      duration: e.duration,
    };
  });
  const repeats = (norm: string, day: number | null, duration: number | null): boolean => {
    const words = new Set(norm.split(' ').filter(Boolean));
    for (const h of have) {
      if (duration && h.duration && h.duration < duration * PREVIEW_RATIO) continue;
      if (norm === h.title || norm === h.file) return true;
      if (!(day !== null && duration && h.day !== null && h.duration)) continue;
      if (Math.abs(day - h.day) > 1) continue;
      const apart = Math.abs(duration - h.duration);
      if (apart <= SAME_DURATION_S) return true;
      if (apart <= DUP_DURATION_S) {
        const other = new Set([...h.title.split(' '), ...h.file.split(' ')].filter(Boolean));
        const shared = [...words].filter((w) => other.has(w)).length;
        if (
          words.size &&
          other.size &&
          shared / Math.min(words.size, other.size) >= DUP_WORD_OVERLAP
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const skip = new Set<FeedEpisode>();
  const groups = new Map<string, FeedEpisode[]>();
  for (const episode of candidates) {
    const day = dayOf(episode.publishedAt);
    if (repeats(normTitle(episode.title), day, episode.duration)) skip.add(episode);
    else if (day !== null && episode.duration) {
      const key = `${day}/${episode.duration}`;
      groups.set(key, [...(groups.get(key) ?? []), episode]);
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (b.enclosureLength ?? 0) - (a.enclosureLength ?? 0));
    for (const episode of group.slice(1)) skip.add(episode);
  }
  return skip;
}

function isPatreon(feedUrl: string): boolean {
  try {
    const { hostname } = new URL(feedUrl);
    return hostname === 'patreon.com' || hostname === 'www.patreon.com';
  } catch {
    return false;
  }
}

/** Runs one pass over every show (or the one named), and says what it did. */
export async function runStubJob(
  options: JobOptions,
  { onlyItem }: { onlyItem?: string } = {},
): Promise<JobResult> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms)));
  const result: JobResult = {
    written: 0,
    adopted: 0,
    removed: 0,
    skippedTeaser: 0,
    skippedDuplicate: 0,
    skippedNoName: 0,
    failed: 0,
    scanned: [],
  };
  let paused = false;
  const pause = () => {
    mkdirSync(dirname(options.pauseMarker), { recursive: true });
    writeFileSync(options.pauseMarker, `stubs job paused hydration, ${new Date().toISOString()}\n`);
    if (!paused) options.log('stubs job: hydration paused');
    paused = true;
  };
  const local = (absPath: string): string | null => {
    const root = options.absRoot.replace(/\/+$/, '');
    if (absPath !== root && !absPath.startsWith(`${root}/`)) return null;
    return join(options.mediaRoot, absPath.slice(root.length));
  };

  try {
    const shows = (await options.abs.podcastShows()).filter(
      (show) => onlyItem === undefined || show.id === onlyItem,
    );
    for (const show of shows) {
      const name = show.title ?? show.id;
      if (show.feedUrl === null) {
        options.log(`stubs job: ${name}: no feed, skipped`);
        continue;
      }
      if (show.feedUrl.startsWith(options.channelFeedPrefix)) continue;
      const folder = local(show.path);
      if (folder === null || !existsSync(folder)) {
        options.log(`stubs job: ${name}: its folder is not under the media root, skipped`);
        continue;
      }
      try {
        const changed = await stubShow(show, folder, options, result, pause, sleep);
        if (changed) {
          // Item scans skip files ABS's watcher still holds; it waits 10 s of quiet first.
          await sleep(WATCHER_FLUSH_MS);
          pause();
          await options.abs.scanItem(show.id);
          result.scanned.push(show.id);
        }
      } catch (error) {
        result.failed += 1;
        options.log(`stubs job: ${name}: failed, the rest carry on: ${describe(error)}`);
      }
    }
  } finally {
    if (paused) {
      rmSync(options.pauseMarker, { force: true });
      options.log('stubs job: hydration resumed');
    }
  }
  options.log(
    `stubs job: ${result.written} stubbed, ${result.adopted} adopted, ${result.removed} teasers removed, ` +
      `${result.skippedDuplicate} duplicates skipped, ${result.failed} shows failed`,
  );
  return result;
}

/** An error as a log line may carry it: its message with every URL cut to host and file. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/[^\s"'<>]+/g, (url) => urlForLog(url));
}

async function stubShow(
  show: PodcastShow,
  folder: string,
  options: JobOptions,
  result: JobResult,
  pause: () => void,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  const feed = await options.readFeed(show.feedUrl!);
  const name = show.title ?? show.id;

  // A run killed mid-write leaves a hidden partial behind.
  for (const entry of readdirSync(folder)) {
    if (entry.startsWith('.') && entry.endsWith('.stub-partial')) {
      rmSync(join(folder, entry), { force: true });
    }
  }

  const onDisk = (episode: FeedEpisode): string | null => {
    for (const file of episodeFilenames(episode.title, episode.enclosureUrl!)) {
      if (existsSync(join(folder, file))) return join(folder, file);
    }
    return null;
  };

  let duplicates = new Set<FeedEpisode>();
  if (isPatreon(show.feedUrl!)) {
    const candidates = feed.episodes.filter(
      (e) => e.enclosureUrl !== null && !TEASER.test(e.title ?? '') && onDisk(e) === null,
    );
    if (candidates.length > 0) {
      duplicates = premiumDuplicates(candidates, await options.abs.showEpisodes(show.id));
    }
  }

  let written = 0;
  let changed = false;
  for (const episode of oldestFirst(feed.episodes)) {
    if (episode.enclosureUrl === null) continue;
    if (duplicates.has(episode)) {
      result.skippedDuplicate += 1;
      continue;
    }
    const existing = onDisk(episode);
    if (TEASER.test(episode.title ?? '')) {
      result.skippedTeaser += 1;
      if (existing !== null && isStub(existing)) {
        pause();
        rmSync(existing);
        result.removed += 1;
        changed = true;
        options.log(`stubs job: ${name}: removed a teaser stub`);
      }
      continue;
    }
    if (existing !== null) {
      if (!isKnown(existing)) {
        pause();
        if (adoptFile(existing, episode.enclosureUrl)) {
          result.adopted += 1;
          changed = true;
        }
      }
      continue;
    }
    const [file] = episodeFilenames(episode.title, episode.enclosureUrl);
    if (file === undefined) {
      result.skippedNoName += 1;
      options.log(`stubs job: ${name}: an item whose title leaves no file name, skipped`);
      continue;
    }
    pause();
    try {
      await writeStub({
        path: join(folder, file),
        url: episode.enclosureUrl,
        declaredLength: episode.enclosureLength,
        rangeGet: options.rangeGet,
      });
      result.written += 1;
      written += 1;
      changed = true;
      if (written % WATCHER_FLUSH_EVERY === 0) await sleep(WATCHER_FLUSH_MS);
    } catch (error) {
      options.log(
        `stubs job: ${name}: stubbing ${urlForLog(episode.enclosureUrl)} failed: ${describe(error)}`,
      );
    }
  }
  return changed;
}
