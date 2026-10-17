/**
 * A track's lyrics, from the cache when it holds a fresh answer, else resolved: Jellyfin's file
 * when the index says it has one, then LRCLIB unless Jellyfin's lines are synced, chosen by
 * `chooseLyrics`. Only an answer every source that should be asked did give is cached; with
 * LRCLIB switched off (null), only Jellyfin's synced lines are. A failing Jellyfin, or LRCLIB
 * failing when Jellyfin has no lines, fails the call and caches nothing; LRCLIB failing when
 * Jellyfin has plain lines answers those, uncached. Two calls for one track at one index version
 * at once share one resolution, so the route and the job never ask LRCLIB twice for it; a call at
 * a newer version never joins an older one. A cached answer that no longer reads is forgotten,
 * logged, and resolved again.
 */
import type { JellyfinLyrics } from '../adapters/jellyfin/schemas.js';
import type { LrclibClient } from '../adapters/lrclib/client.js';
import type { LrclibRecord } from '../adapters/lrclib/schemas.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import { ZodError } from 'zod';
import {
  type CachedLyrics,
  cachedLyrics,
  forgetLyrics,
  type Freshness,
  isFresh,
  LYRICS_RECHECK_MS,
  staleTrackIds,
  writeLyrics,
} from '../store/lyrics.js';
import { chooseLyrics, type Found, type LyricsAnswer, NOTHING_FOUND } from './choose.js';
import { fromJellyfin } from './jellyfin.js';
import { fromLrclib } from './lrclib.js';
import { lyricsQuery } from './query.js';

/** The one Jellyfin call lyrics need: the person's own client on the route, the key's in the job. */
export interface JellyfinLyricsReader {
  getLyrics(itemId: string): Promise<JellyfinLyrics | null>;
}

/** Where an unreadable cached answer is reported. */
export interface LyricsLog {
  warn: (details: Record<string, unknown>, message: string) => void;
}

/** How one caller asks: the route with a short LRCLIB limit, the job hearing of each lookup. */
export interface ForTrackOptions {
  /** LRCLIB's limit for this call; the client's own when not given. */
  lrclibTimeoutMs?: number;
  /** Told after each LRCLIB lookup this call makes, whether LRCLIB answered or failed. */
  onLrclib?: (answered: boolean) => void;
}

export interface LyricsOptions {
  db: Db;
  log: LyricsLog;
  /** Null when LRCLIB is switched off. */
  lrclib: Pick<LrclibClient, 'get'> | null;
  now: () => number;
  /** How long plain lyrics or none stay fresh; `LYRICS_RECHECK_MS` when not given. */
  recheckMs?: number;
}

export class Lyrics {
  private readonly inFlight = new Map<string, Promise<LyricsAnswer>>();

  constructor(private readonly opts: LyricsOptions) {}

  private freshness(): Freshness {
    return { now: this.opts.now(), recheckMs: this.opts.recheckMs ?? LYRICS_RECHECK_MS };
  }

  /** An indexed Jellyfin track's lyrics. Never throws: a failure rejects. */
  async forTrack(
    track: StoredRow,
    jellyfin: JellyfinLyricsReader,
    how: ForTrackOptions = {},
  ): Promise<LyricsAnswer> {
    const cached = this.cached(track);
    if (cached && isFresh(cached, track.version, this.freshness())) {
      return { status: cached.status, source: cached.source, lines: cached.lines };
    }
    const key = `${track.source}:${track.id}:${track.version}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const resolving = this.resolve(track, jellyfin, how).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, resolving);
    return resolving;
  }

  /** The cached answer; one that no longer reads is forgotten, logged, and taken as none. */
  private cached(track: StoredRow): CachedLyrics | undefined {
    try {
      return cachedLyrics(this.opts.db, track.source, track.id);
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof SyntaxError)) throw error;
      forgetLyrics(this.opts.db, track.source, track.id);
      this.opts.log.warn(
        { source: track.source, track: track.id, err: error },
        'unreadable lyrics forgotten',
      );
      return undefined;
    }
  }

  /** Up to `limit` indexed Jellyfin tracks with no fresh answer cached, in random order. */
  staleTracks(limit: number): StoredRow[] {
    return staleTrackIds(this.opts.db, limit, this.freshness()).flatMap((id) => {
      const row = indexedRow(this.opts.db, 'jellyfin', id);
      return row ? [row] : [];
    });
  }

  private async resolve(
    track: StoredRow,
    jellyfin: JellyfinLyricsReader,
    how: ForTrackOptions,
  ): Promise<LyricsAnswer> {
    const fromJf = track.hasLyrics
      ? fromJellyfin(await jellyfin.getLyrics(track.id))
      : NOTHING_FOUND;
    if (fromJf.status === 'synced') return this.keep(track, chooseLyrics(fromJf, null), null);
    if (this.opts.lrclib === null) return chooseLyrics(fromJf, null);
    let record: LrclibRecord | null;
    try {
      record = await this.askLrclib(this.opts.lrclib, track, how);
    } catch (error) {
      if (fromJf.status === 'plain') return chooseLyrics(fromJf, null);
      throw error;
    }
    const fromLr: Found = fromLrclib(record);
    return this.keep(track, chooseLyrics(fromJf, fromLr), record?.id ?? null);
  }

  /** LRCLIB's record for the track; null, unasked, when the track has no length or no artist. */
  private async askLrclib(
    lrclib: Pick<LrclibClient, 'get'>,
    track: StoredRow,
    how: ForTrackOptions,
  ): Promise<LrclibRecord | null> {
    const album =
      track.parentId === null ? undefined : indexedRow(this.opts.db, track.source, track.parentId);
    const query = album ? lyricsQuery(track, album) : null;
    if (query === null) return null;
    const call = how.lrclibTimeoutMs === undefined ? {} : { timeoutMs: how.lrclibTimeoutMs };
    try {
      const record = await lrclib.get(query, call);
      how.onLrclib?.(true);
      return record;
    } catch (error) {
      how.onLrclib?.(false);
      throw error;
    }
  }

  private keep(track: StoredRow, answer: LyricsAnswer, lrclibId: number | null): LyricsAnswer {
    writeLyrics(this.opts.db, track, answer, lrclibId, this.opts.now());
    return answer;
  }
}
