/**
 * The LRCLIB client: one track's lyrics from LRCLIB's own matcher, `GET /api/get`, which forgives
 * a length a second or two off (checked live). LRCLIB is a public service with no key; it asks
 * each client to name itself, its version and its homepage in the User-Agent. It answers 404 for
 * a track it cannot find and, when busy, 503 with no `Retry-After` (checked live).
 * `new LrclibClient({ baseUrl, fetch, userAgent, timeoutMs? })`.
 */
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import { type LrclibRecord, lrclibRecordSchema } from './schemas.js';

/** What Auralis sends as its User-Agent to LRCLIB. */
export const LRCLIB_USER_AGENT = 'Auralis/0.0.0 (+https://github.com/patakihara/curly-spoon)';

/** A record larger than this is refused rather than read. */
export const LRCLIB_MAX_BYTES = 512 * 1024;

/** One track, as LRCLIB's matcher takes it. */
export interface LrclibQuery {
  artistName: string;
  trackName: string;
  albumName: string;
  /** Whole seconds. */
  duration: number;
}

export interface LrclibClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  userAgent: string;
  /** The whole call's limit; the transport's default when not given. */
  timeoutMs?: number;
}

export class LrclibClient {
  constructor(private readonly opts: LrclibClientOptions) {}

  /** The record LRCLIB matches to the track, or null when it finds none. */
  async get(query: LrclibQuery): Promise<LrclibRecord | null> {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL('api/get', base);
    url.searchParams.set('artist_name', query.artistName);
    url.searchParams.set('track_name', query.trackName);
    url.searchParams.set('album_name', query.albumName);
    url.searchParams.set('duration', String(query.duration));
    try {
      return await requestJson(
        this.opts.fetch,
        url.toString(),
        {
          headers: { 'user-agent': this.opts.userAgent },
          maxBytes: LRCLIB_MAX_BYTES,
          ...(this.opts.timeoutMs === undefined ? {} : { timeoutMs: this.opts.timeoutMs }),
        },
        lrclibRecordSchema,
      );
    } catch (error) {
      if (error instanceof AdapterError && error.kind === 'status' && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}
