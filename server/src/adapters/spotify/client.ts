/**
 * The Spotify reader: a public playlist's name, cover and every entry in its order, and one
 * track's title, artists, album, length and ISRC, read signed out, with no account
 * (`new SpotifyClient({ embedUrl, spclientUrl, fetch, clock?, cache?, log? })`).
 *
 * The embed page hands out an anonymous session token (expiring in about 16 to 36 min, live). It
 * is held in this object's private field only: never logged, stored, put in an error, or in
 * `JSON.stringify` of the client. It is fetched again, from the embed page of the playlist read
 * last, when under a minute is left. The Web API answers that token `429 QUOTA_EXCEEDED` (live),
 * so the order and the tracks come from `spclient`.
 *
 * One call runs at a time, starting at least 1 s after the last one ended. A 429 waits for its
 * `Retry-After` (else 60 s) and asks again; a third 429 in a row throws `spotify_unavailable`. One
 * client serves the whole server, so its queue is the whole server's. A track kept in the cache
 * (30 days) asks nothing.
 */
import type { Clock } from '../musicbrainz/client.js';
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import {
  type EmbedPage,
  embedPageSchema,
  type PlaylistPage,
  playlistPageSchema,
  type SpotifyTrack,
  trackMetadataSchema,
} from './schemas.js';

export const SPOTIFY_EMBED_URL = 'https://open.spotify.com';
export const SPOTIFY_SPCLIENT_URL = 'https://spclient.wg.spotify.com';

/** The least time from one call's end to the next one's start. */
export const SPOTIFY_GAP_MS = 1_000;
/** The wait after a 429 that names no `Retry-After`. */
export const SPOTIFY_BUSY_WAIT_MS = 60_000;
/** How many 429s in a row stop the reading. */
export const SPOTIFY_BUSY_LIMIT = 3;
/** A token with less than this left is fetched again first. */
export const SPOTIFY_TOKEN_MARGIN_MS = 60_000;
/** How many entries one page of a playlist's order asks for. */
export const SPOTIFY_PAGE = 100;
/** How long a track's metadata is kept. */
export const SPOTIFY_TRACK_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

const SPOTIFY_LIMIT_MS = 15_000;
/** The embed page was 84 to 154 KB (live). */
const EMBED_MAX_BYTES = 2 * 1024 * 1024;
const JSON_MAX_BYTES = 2 * 1024 * 1024;

export type SpotifyErrorCode = 'playlist_not_found' | 'spotify_unavailable';

/** A reading that cannot go on: the playlist is not there, or Spotify keeps refusing. */
export class SpotifyError extends Error {
  override readonly name = 'SpotifyError';
  constructor(
    readonly code: SpotifyErrorCode,
    readonly status: 404 | 503,
  ) {
    super(code);
  }
}

/** One entry of a playlist, at its place. Only a track is read further. */
export type SpotifyEntry =
  | { position: number; kind: 'track'; id: string; uri: string }
  | { position: number; kind: 'notASong'; uri: string };

export interface SpotifyPlaylist {
  id: string;
  name: string;
  cover: string | null;
  /** How many entries Spotify says the playlist holds. */
  length: number;
  entries: SpotifyEntry[];
}

/** Tracks read before, kept for `SPOTIFY_TRACK_CACHE_MS`. */
export interface SpotifyTrackCache {
  get(id: string): SpotifyTrack | undefined;
  put(id: string, track: SpotifyTrack): void;
}

export interface SpotifyClientOptions {
  embedUrl: string;
  spclientUrl: string;
  fetch: FetchLike;
  clock?: Clock;
  cache?: SpotifyTrackCache;
  /** One line per wait; never names the token. */
  log?: (line: string) => void;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A base62 Spotify id as the 32 hex digits `spclient`'s metadata takes. */
export function spotifyGid(id: string): string {
  let n = 0n;
  for (const c of id) {
    const digit = BASE62.indexOf(c);
    if (digit < 0) throw new Error('not a base62 id');
    n = n * 62n + BigInt(digit);
  }
  return n.toString(16).padStart(32, '0');
}

function entryOf(uri: string, position: number): SpotifyEntry {
  const track = /^spotify:track:([0-9A-Za-z]{22})$/.exec(uri);
  return track?.[1]
    ? { position, kind: 'track', id: track[1], uri }
    : { position, kind: 'notASong', uri };
}

function base(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

export class SpotifyClient {
  private readonly clock: Clock;
  #session: { token: string; expiresAt: number; playlistId: string } | null = null;
  #tail: Promise<void> = Promise.resolve();
  #lastEnded = Number.NEGATIVE_INFINITY;
  #busyInARow = 0;
  #retryAfter: string | null = null;

  constructor(private readonly opts: SpotifyClientOptions) {
    this.clock = opts.clock ?? realClock;
  }

  /** The playlist's name and cover from its embed page, which also renews the session. */
  async playlistHeader(id: string): Promise<{ name: string; cover: string | null }> {
    const page = await this.embed(id);
    return { name: page.name, cover: page.cover };
  }

  /** The playlist's name, cover and every entry in its order, a page of 100 at a time. */
  async playlist(id: string): Promise<SpotifyPlaylist> {
    const header = await this.playlistHeader(id);
    const entries: SpotifyEntry[] = [];
    let length = 0;
    for (let from = 0; ;) {
      const page = await this.orderPage(id, from);
      length = page.length;
      page.contents.items.forEach((item, n) =>
        entries.push(entryOf(item.uri, page.contents.pos + n)),
      );
      from = page.contents.pos + page.contents.items.length;
      if (page.contents.items.length === 0 || from >= length) break;
    }
    return { id, ...header, length, entries };
  }

  /** One page of the playlist's order, from `from`. */
  async orderPage(id: string, from: number, length = SPOTIFY_PAGE): Promise<PlaylistPage> {
    const url = new URL(`playlist/v2/playlist/${id}`, base(this.opts.spclientUrl));
    url.searchParams.set('from', String(from));
    url.searchParams.set('length', String(length));
    return this.signedIn(url.toString(), playlistPageSchema);
  }

  /** The track's metadata, or null when Spotify has none (404). A kept track asks nothing. */
  async track(id: string): Promise<SpotifyTrack | null> {
    const kept = this.opts.cache?.get(id);
    if (kept) return kept;
    const url = new URL(`metadata/4/track/${spotifyGid(id)}`, base(this.opts.spclientUrl));
    url.searchParams.set('market', 'from_token');
    try {
      const track = await this.signedIn(url.toString(), trackMetadataSchema);
      this.opts.cache?.put(id, track);
      return track;
    } catch (error) {
      if (error instanceof SpotifyError && error.code === 'playlist_not_found') return null;
      throw error;
    }
  }

  private async embed(id: string): Promise<EmbedPage> {
    const url = new URL(`embed/playlist/${id}`, base(this.opts.embedUrl)).toString();
    const page = await this.ask(url, {}, embedPageSchema, EMBED_MAX_BYTES);
    if (page === null) throw new SpotifyError('playlist_not_found', 404);
    this.#session = { token: page.token, expiresAt: page.expiresAt, playlistId: id };
    return page;
  }

  /** A `spclient` call with the session's token, renewed first when it is nearly out. */
  private async signedIn<T>(url: string, schema: Parameters<typeof requestJson<T>>[3]): Promise<T> {
    const session = this.#session;
    if (session === null) throw new Error('read a playlist before its tracks');
    if (session.expiresAt - this.clock.now() < SPOTIFY_TOKEN_MARGIN_MS) {
      await this.embed(session.playlistId);
    }
    const token = this.#session?.token ?? '';
    return this.ask(url, { authorization: `Bearer ${token}` }, schema, JSON_MAX_BYTES);
  }

  /** One call in the queue: a 404 is `playlist_not_found`, a 429 waits, three stop. */
  private ask<T>(
    url: string,
    headers: Record<string, string>,
    schema: Parameters<typeof requestJson<T>>[3],
    maxBytes: number,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      for (;;) {
        const wait = this.#lastEnded + SPOTIFY_GAP_MS - this.clock.now();
        if (wait > 0) await this.clock.sleep(wait);
        try {
          const answer = await requestJson(
            this.observed,
            url,
            { headers, maxBytes, timeoutMs: SPOTIFY_LIMIT_MS },
            schema,
          );
          this.#busyInARow = 0;
          return answer;
        } catch (error) {
          if (!(error instanceof AdapterError) || error.kind !== 'status') throw error;
          if (error.status === 404) throw new SpotifyError('playlist_not_found', 404);
          if (error.status !== 429) throw error;
          this.#busyInARow += 1;
          if (this.#busyInARow >= SPOTIFY_BUSY_LIMIT) {
            this.#busyInARow = 0;
            throw new SpotifyError('spotify_unavailable', 503);
          }
          const seconds = Number(this.#retryAfter);
          const pause =
            this.#retryAfter !== null && Number.isFinite(seconds) && seconds >= 0
              ? seconds * 1000
              : SPOTIFY_BUSY_WAIT_MS;
          this.opts.log?.(`Spotify is busy (429); asking again in ${Math.ceil(pause / 1000)} s`);
          await this.clock.sleep(pause);
        } finally {
          this.#lastEnded = this.clock.now();
        }
      }
    };
    const turn = this.#tail.then(run, run);
    this.#tail = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  /** The transport, noting a 429's `Retry-After`, which `requestJson` does not pass on. */
  private readonly observed: FetchLike = async (input, init) => {
    const response = await this.opts.fetch(input, init);
    this.#retryAfter = response.status === 429 ? response.headers.get('retry-after') : null;
    return response;
  };
}
