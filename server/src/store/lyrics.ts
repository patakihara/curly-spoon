/**
 * The lyrics cache: each track's lyrics as last resolved, shared by the household like the index
 * they belong to. A row goes with its track (foreign key). It is fresh while the track's index
 * version is the one it was resolved for, and, for plain lyrics or none, for `recheckMs` after:
 * LRCLIB may since have gained synced lines. `lines` is parsed when read: the store is a boundary.
 */
import { z } from 'zod';
import type { IndexSource } from '../libraryIndex/rows.js';
import type { LyricsAnswer, LyricsOrigin, LyricsStatus } from '../lyrics/choose.js';
import { lyricLineSchema } from '../lyrics/lrc.js';
import type { Db } from './connection.js';
import { statement } from './statements.js';

/** How long plain lyrics or none are kept before LRCLIB is asked again: 30 days. */
export const LYRICS_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedLyrics extends LyricsAnswer {
  /** LRCLIB's record id, when LRCLIB answered with a record. */
  lrclibId: number | null;
  /** The track's index version the answer was resolved for. */
  itemVersion: number;
  /** Milliseconds since the epoch. */
  resolvedAt: number;
}

const linesSchema = z.array(lyricLineSchema);

interface RawLyrics {
  status: LyricsStatus;
  origin: LyricsOrigin | null;
  lines: string;
  lrclib_id: number | null;
  item_version: number;
  resolved_at: number;
}

/** What the cache holds for a track, fresh or not; undefined when it holds nothing. */
export function cachedLyrics(db: Db, source: IndexSource, id: string): CachedLyrics | undefined {
  const raw = statement(
    db,
    `SELECT status, origin, lines, lrclib_id, item_version, resolved_at FROM lyrics
     WHERE source = ? AND upstream_id = ?`,
  ).get(source, id) as RawLyrics | undefined;
  if (raw === undefined) return undefined;
  return {
    status: raw.status,
    source: raw.origin,
    lines: linesSchema.parse(JSON.parse(raw.lines)),
    lrclibId: raw.lrclib_id,
    itemVersion: raw.item_version,
    resolvedAt: raw.resolved_at,
  };
}

export interface Freshness {
  now: number;
  recheckMs: number;
}

/** Forgets what the cache holds for a track. */
export function forgetLyrics(db: Db, source: IndexSource, id: string): void {
  statement(db, 'DELETE FROM lyrics WHERE source = ? AND upstream_id = ?').run(source, id);
}

/** Whether a cached answer still stands for the track at `version`. */
export function isFresh(cached: CachedLyrics, version: number, at: Freshness): boolean {
  if (cached.itemVersion !== version) return false;
  if (cached.status === 'synced' || cached.status === 'instrumental') return true;
  return at.now - cached.resolvedAt < at.recheckMs;
}

/**
 * Stores a track's answer, resolved for its index `version`, in place of any older one. Nothing is
 * written when the index no longer holds the track, or holds it at another version: an answer
 * resolved for an older version never overwrites one for the version now indexed.
 */
export function writeLyrics(
  db: Db,
  track: { source: IndexSource; id: string; version: number },
  answer: LyricsAnswer,
  lrclibId: number | null,
  now: number,
): void {
  statement(
    db,
    `INSERT INTO lyrics (source, upstream_id, status, origin, lines, lrclib_id, item_version,
       resolved_at)
     SELECT @source, @id, @status, @origin, @lines, @lrclib_id, @version, @now
     WHERE EXISTS (SELECT 1 FROM index_items
       WHERE source = @source AND upstream_id = @id AND version = @version)
     ON CONFLICT (source, upstream_id) DO UPDATE SET status = excluded.status,
       origin = excluded.origin, lines = excluded.lines, lrclib_id = excluded.lrclib_id,
       item_version = excluded.item_version, resolved_at = excluded.resolved_at`,
  ).run({
    source: track.source,
    id: track.id,
    status: answer.status,
    origin: answer.source,
    lines: JSON.stringify(answer.lines),
    lrclib_id: lrclibId,
    version: track.version,
    now,
  });
}

/** Up to `limit` Jellyfin tracks with no fresh answer cached, in random order. */
export function staleTrackIds(db: Db, limit: number, at: Freshness): string[] {
  const rows = statement(
    db,
    `SELECT i.upstream_id FROM index_items i
     LEFT JOIN lyrics l ON l.source = i.source AND l.upstream_id = i.upstream_id
     WHERE i.source = 'jellyfin' AND i.kind = 'track'
       AND (l.upstream_id IS NULL OR l.item_version != i.version
         OR (l.status IN ('plain', 'none') AND @now - l.resolved_at >= @recheck))
     ORDER BY random() LIMIT @limit`,
  ).all({ now: at.now, recheck: at.recheckMs, limit }) as { upstream_id: string }[];
  return rows.map((r) => r.upstream_id);
}

/**
 * Whether a whole Jellyfin index pass has run since migration 12 added `has_lyrics`: until then
 * every track reads as having no lyrics file, and asking LRCLIB for each would be wasted.
 */
export function jellyfinIndexedForLyrics(db: Db): boolean {
  const row = statement(
    db,
    `SELECT 1 FROM index_runs
     WHERE source = 'jellyfin' AND complete = 1
       AND started_at >= (SELECT applied_at FROM _migrations WHERE id = 12)
     LIMIT 1`,
  ).get();
  return row !== undefined;
}
