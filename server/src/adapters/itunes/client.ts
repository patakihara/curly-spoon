/**
 * The iTunes podcast search (`new ItunesClient({ baseUrl, fetch, clock? })`): no key, no account.
 * `searchShows(words)` asks `GET /search?media=podcast&entity=podcast&term=&limit=25` and answers
 * the shows that can be subscribed to. Every call waits its turn in one queue, at least 1 s after
 * the one before; one client serves the whole server, so the gap is the whole server's. An answer
 * is kept a day by its words (Apple sends `cache-control: max-age=86400`, checked live), so the
 * same words ask nothing again that day. A failure is an `AdapterError`, kept for no time; Search
 * turns it into no rows.
 *
 * A row is dropped when it has no `feedUrl`, or when its feed's address alone is refused
 * (`refusedFeedUrl`: http or https to a public host, no credentials), as a request for it would
 * be. No name is looked up per row. Art is kept only from
 * Apple's image hosts.
 */
import { type FetchLike, requestJson } from '../http/fetch.js';
import { refusedFeedUrl } from '../http/publicFetch.js';
import { type ItunesRow, searchAnswerSchema } from './schemas.js';

export const ITUNES_URL = 'https://itunes.apple.com';
/** The least time from one call's start to the next one's. */
export const ITUNES_GAP_MS = 1_000;
/** How long one search's answer is kept, as Apple's `max-age` says. */
export const ITUNES_CACHE_MS = 86_400_000;
/** How many rows a search asks for. */
export const ITUNES_SEARCH_LIMIT = 25;
/** How many searches are kept at once; the oldest goes first. */
export const ITUNES_CACHE_ENTRIES = 500;
/** One call's limit. */
const ITUNES_LIMIT_MS = 10_000;
/** A 25-row answer is about 50 KB. */
const ITUNES_MAX_BYTES = 1024 * 1024;

/** The time and a wait, so a test can run the queue on a fake clock. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A show a person can subscribe to, as Search shows it. */
export interface ItunesShow {
  /** iTunes' collection id, digits. */
  itunesId: string;
  title: string;
  /** Who makes it, as iTunes names them; null when it names no one. */
  host: string | null;
  feedUrl: string;
  /** How many episodes iTunes counts; null when it does not say. */
  episodes: number | null;
  /** The 600 px cover on Apple's image hosts, or null. */
  art: string | null;
}

export interface ItunesClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  clock?: Clock;
  timeoutMs?: number;
}

/** Apple's image hosts, `is1-ssl.mzstatic.com` to `is5-ssl.mzstatic.com`. */
export function isItunesArtHost(host: string): boolean {
  return /^is[1-5]-ssl\.mzstatic\.com$/i.test(host);
}

function artOf(address: string | undefined): string | null {
  if (address === undefined) return null;
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && isItunesArtHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function feedOf(address: string | undefined): string | null {
  if (address === undefined) return null;
  try {
    const url = new URL(address);
    return refusedFeedUrl(url) === null ? url.toString() : null;
  } catch {
    return null;
  }
}

function showOf(row: ItunesRow): ItunesShow | null {
  const feedUrl = feedOf(row.feedUrl);
  if (feedUrl === null) return null;
  return {
    itunesId: String(row.collectionId),
    title: row.collectionName,
    host: row.artistName?.trim() || null,
    feedUrl,
    episodes: row.trackCount ?? null,
    art: artOf(row.artworkUrl600),
  };
}

/** The words as a cache key: case and runs of spaces do not count. */
const keyOf = (words: string) => words.trim().replace(/\s+/g, ' ').toLowerCase();

export class ItunesClient {
  private readonly clock: Clock;
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;
  private readonly cache = new Map<string, { at: number; shows: Promise<ItunesShow[]> }>();

  constructor(private readonly opts: ItunesClientOptions) {
    this.clock = opts.clock ?? realClock;
  }

  /** The shows whose names match the words, in iTunes' order; none for blank words. */
  searchShows(words: string): Promise<ItunesShow[]> {
    const key = keyOf(words);
    if (key === '') return Promise.resolve([]);
    const kept = this.cache.get(key);
    if (kept !== undefined && this.clock.now() - kept.at < ITUNES_CACHE_MS) return kept.shows;
    this.cache.delete(key);
    const shows = this.ask(key);
    this.cache.set(key, { at: this.clock.now(), shows });
    while (this.cache.size > ITUNES_CACHE_ENTRIES) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    shows.catch(() => {
      if (this.cache.get(key)?.shows === shows) this.cache.delete(key);
    });
    return shows;
  }

  private async ask(term: string): Promise<ItunesShow[]> {
    await this.turn();
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL('search', base);
    url.searchParams.set('media', 'podcast');
    url.searchParams.set('entity', 'podcast');
    url.searchParams.set('term', term);
    url.searchParams.set('limit', String(ITUNES_SEARCH_LIMIT));
    const rows = await requestJson(
      this.opts.fetch,
      url.toString(),
      { maxBytes: ITUNES_MAX_BYTES, timeoutMs: this.opts.timeoutMs ?? ITUNES_LIMIT_MS },
      searchAnswerSchema,
    );
    return rows.flatMap((row) => {
      const show = showOf(row);
      return show === null ? [] : [show];
    });
  }

  /** Waits until this call may start, and keeps the next one 1 s behind it. */
  private turn(): Promise<void> {
    const turn = this.tail.then(async () => {
      const wait = this.nextAt - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      this.nextAt = this.clock.now() + ITUNES_GAP_MS;
    });
    this.tail = turn;
    return turn;
  }
}
