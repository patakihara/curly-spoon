/**
 * A track's lyrics, from the cache when it holds a fresh answer, else resolved: Jellyfin's file
 * when the index says it has one, then LRCLIB unless Jellyfin's lines are synced, chosen by
 * `chooseLyrics`. Only an answer every source that should be asked did give is cached; with
 * LRCLIB switched off (null), only Jellyfin's synced lines are. A failing Jellyfin, or LRCLIB
 * failing when Jellyfin has no lines, fails the call and caches nothing; LRCLIB failing when
 * Jellyfin has plain lines answers those, uncached. Two calls for one track at once share one
 * resolution, so the route and the job never ask LRCLIB twice for it.
 */
import type { JellyfinLyrics } from '../adapters/jellyfin/schemas.js';
import type { LrclibClient } from '../adapters/lrclib/client.js';
import type { LrclibRecord } from '../adapters/lrclib/schemas.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import {
  cachedLyrics,
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

export interface LyricsOptions {
  db: Db;
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

  /** An indexed Jellyfin track's lyrics. */
  forTrack(track: StoredRow, jellyfin: JellyfinLyricsReader): Promise<LyricsAnswer> {
    const cached = cachedLyrics(this.opts.db, track.source, track.id);
    if (cached && isFresh(cached, track.version, this.freshness())) {
      return Promise.resolve({ status: cached.status, source: cached.source, lines: cached.lines });
    }
    const key = `${track.source}:${track.id}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const resolving = this.resolve(track, jellyfin).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, resolving);
    return resolving;
  }

  /** Up to `limit` indexed Jellyfin tracks with no fresh answer cached, in random order. */
  staleTracks(limit: number): StoredRow[] {
    return staleTrackIds(this.opts.db, limit, this.freshness()).flatMap((id) => {
      const row = indexedRow(this.opts.db, 'jellyfin', id);
      return row ? [row] : [];
    });
  }

  private async resolve(track: StoredRow, jellyfin: JellyfinLyricsReader): Promise<LyricsAnswer> {
    const fromJf = track.hasLyrics
      ? fromJellyfin(await jellyfin.getLyrics(track.id))
      : NOTHING_FOUND;
    if (fromJf.status === 'synced') return this.keep(track, chooseLyrics(fromJf, null), null);
    if (this.opts.lrclib === null) return chooseLyrics(fromJf, null);
    let record: LrclibRecord | null;
    try {
      record = await this.askLrclib(this.opts.lrclib, track);
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
  ): Promise<LrclibRecord | null> {
    const album =
      track.parentId === null ? undefined : indexedRow(this.opts.db, track.source, track.parentId);
    const query = album ? lyricsQuery(track, album) : null;
    return query === null ? null : lrclib.get(query);
  }

  private keep(track: StoredRow, answer: LyricsAnswer, lrclibId: number | null): LyricsAnswer {
    writeLyrics(this.opts.db, track, answer, lrclibId, this.opts.now());
    return answer;
  }
}
