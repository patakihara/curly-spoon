/**
 * The MusicBrainz client: a release search, a recording search and a release lookup, from
 * `/ws/2` as JSON (`new MusicBrainzClient({ baseUrl, fetch, userAgent, clock? })`). MusicBrainz
 * takes no key; it asks each client to name itself in the User-Agent, and to make about one call a
 * second. It answers 503 when a client goes over (twice in 16 calls at about one a second, checked
 * live). So every call waits its turn in one queue, starting at least 1.1 s after the one before;
 * a 503 waits 2 s and is tried twice more, and a third 503 is `StepUnavailable`. One client serves
 * the whole server, so its queue is the whole server's.
 *
 * Search terms go in quoted Lucene phrases, with brackets left to the caller to drop: MusicBrainz
 * matches "I'm" only as written, not folded to "im" (checked live).
 */
import { type ZodType, type ZodTypeDef } from 'zod';
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import { stepFailure } from '../http/unavailable.js';
import { StepUnavailable } from '../../requests/steps.js';
import {
  type RecordingSearch,
  recordingSearchSchema,
  type Release,
  releaseSchema,
  type ReleaseSearch,
  releaseSearchSchema,
} from './schemas.js';

export const MUSICBRAINZ_URL = 'https://musicbrainz.org';

/** What Auralis names itself to MusicBrainz: the app, its version and its homepage, no person. */
export const MUSICBRAINZ_USER_AGENT = 'Auralis/0.0.0 ( https://github.com/patakihara/curly-spoon )';

/** The least time from one call's start to the next one's. */
export const MUSICBRAINZ_GAP_MS = 1_100;
/** The wait after a 503 before asking again. */
export const MUSICBRAINZ_BUSY_WAIT_MS = 2_000;
/** How many times one call is asked in all before MusicBrainz counts as unavailable. */
export const MUSICBRAINZ_TRIES = 3;
/** How many rows a search asks for. */
export const MUSICBRAINZ_SEARCH_LIMIT = 25;
/** What a lookup includes: the tracks with their recordings, every artist credit, the group. */
export const RELEASE_INCLUDES = 'recordings+artist-credits+release-groups+media';

/** One call's limit; a search took up to 2.1 s and a lookup 3.5 s (checked live). */
const MUSICBRAINZ_LIMIT_MS = 10_000;
/** An answer larger than this is refused rather than read; a 25-row search is about 60 KB. */
const MUSICBRAINZ_MAX_BYTES = 2 * 1024 * 1024;
const BUSY = 503;

/** The time and a wait, so a test can run the queue on a fake clock. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface MusicBrainzClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  userAgent: string;
  clock?: Clock;
  timeoutMs?: number;
}

export interface ReleaseQuery {
  /** The release's title, brackets dropped. */
  release: string;
  /** One artist of the release. */
  artist: string;
}

export interface RecordingQuery {
  /** The recording's title, brackets dropped. */
  title: string;
  /** One artist of the recording. */
  artist: string;
  /** The range its length must fall in, in milliseconds. */
  fromMs: number;
  toMs: number;
}

/** A quoted Lucene phrase. */
function phrase(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

export function releaseQuery({ release, artist }: ReleaseQuery): string {
  return `release:${phrase(release)} AND artist:${phrase(artist)}`;
}

export function recordingQuery({ title, artist, fromMs, toMs }: RecordingQuery): string {
  const from = Math.max(0, Math.round(fromMs));
  const to = Math.round(toMs);
  return `recording:${phrase(title)} AND artist:${phrase(artist)} AND dur:[${from} TO ${to}]`;
}

export class MusicBrainzClient {
  private readonly clock: Clock;
  /** The end of the queue: the turn of the call asked last. */
  private tail: Promise<void> = Promise.resolve();
  /** The earliest the next call may start. */
  private nextAt = 0;

  constructor(private readonly opts: MusicBrainzClientOptions) {
    this.clock = opts.clock ?? realClock;
  }

  /** Releases whose title and artist match, best score first. */
  searchReleases(query: ReleaseQuery): Promise<ReleaseSearch> {
    return this.get('ws/2/release', releaseSearchSchema, {
      query: releaseQuery(query),
      limit: String(MUSICBRAINZ_SEARCH_LIMIT),
    });
  }

  /** Recordings whose title, artist and length match, each with the releases it is on. */
  searchRecordings(query: RecordingQuery): Promise<RecordingSearch> {
    return this.get('ws/2/recording', recordingSearchSchema, {
      query: recordingQuery(query),
      limit: String(MUSICBRAINZ_SEARCH_LIMIT),
    });
  }

  /** One release with its tracks, their recordings, its credits and its group; null when gone. */
  async release(id: string): Promise<Release | null> {
    try {
      return await this.get(`ws/2/release/${encodeURIComponent(id)}`, releaseSchema, {
        inc: RELEASE_INCLUDES,
      });
    } catch (error) {
      if (error instanceof AdapterError && (error.status === 400 || error.status === 404)) {
        return null;
      }
      throw error;
    }
  }

  /** Waits until this call may start, and keeps the next one 1.1 s behind it. */
  private turn(): Promise<void> {
    const turn = this.tail.then(async () => {
      const wait = this.nextAt - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      this.nextAt = this.clock.now() + MUSICBRAINZ_GAP_MS;
    });
    this.tail = turn;
    return turn;
  }

  private async get<T>(
    path: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
    query: Record<string, string>,
  ): Promise<T> {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    url.searchParams.set('fmt', 'json');
    for (let tries = 1; ; tries += 1) {
      await this.turn();
      try {
        return await requestJson(
          this.opts.fetch,
          url.toString(),
          {
            headers: { 'user-agent': this.opts.userAgent },
            maxBytes: MUSICBRAINZ_MAX_BYTES,
            timeoutMs: this.opts.timeoutMs ?? MUSICBRAINZ_LIMIT_MS,
          },
          schema,
        );
      } catch (error) {
        const busy = error instanceof AdapterError && error.status === BUSY;
        if (!busy) throw stepFailure('musicbrainz', error);
        if (tries >= MUSICBRAINZ_TRIES) {
          throw new StepUnavailable(`musicbrainz: busy ${MUSICBRAINZ_TRIES} times`);
        }
        await this.clock.sleep(MUSICBRAINZ_BUSY_WAIT_MS);
      }
    }
  }
}
