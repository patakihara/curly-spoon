/**
 * The index job: mirrors the Audiobookshelf and Jellyfin libraries into the index tables.
 *
 * Each library is paged, oldest added first. A listed item's change marker (ABS `updatedAt`,
 * Jellyfin `Etag`) is compared with the one stored when its full answer was last read; only a
 * new or changed item, or one not read for `refreshAfterMs`, is read again. The daily re-read is
 * needed: ABS edits an episode without moving its show's `updatedAt` (recorded), so the marker
 * alone would miss it. Rows are written only where their content changed.
 *
 * Top-level items a pass did not see are removed only after a complete pass, from the first page
 * to the last; a window of pages (`pages`) never removes anything.
 */
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import type { JellyfinClient } from '../adapters/jellyfin/client.js';
import type { Db } from '../store/connection.js';
import { absTree, albumRow, trackRows, type IndexSource } from './rows.js';
import {
  applyRow,
  applyTree,
  emptyCounts,
  type IndexCounts,
  readSync,
  recordRun,
  removeUnseen,
  writeSync,
} from './store.js';

export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface IndexJobOptions {
  db: Db;
  abs?: Pick<AbsClient, 'getLibraries' | 'getLibraryItems' | 'getItemSummary'>;
  jellyfin?: Pick<JellyfinClient, 'getAlbums' | 'getAlbumTracks'>;
  now?: () => number;
  pageSize?: number;
  /** A window of pages to read, from `first`, instead of every page. */
  pages?: { first: number; count: number };
  /** How long a full answer stays trusted while its change marker stands still. */
  refreshAfterMs?: number;
}

export interface SourceRun {
  complete: boolean;
  error: string | null;
  counts: IndexCounts;
}

export type IndexRun = Partial<Record<IndexSource, SourceRun>>;

interface Paging {
  size: number;
  first: number;
  count: number;
}

function stale(
  db: Db,
  source: IndexSource,
  id: string,
  version: string | null,
  now: number,
  refreshAfterMs: number,
): boolean {
  const sync = readSync(db, source, id);
  return (
    sync === undefined || sync.upstreamVersion !== version || now - sync.checkedAt >= refreshAfterMs
  );
}

async function indexAbs(
  db: Db,
  abs: NonNullable<IndexJobOptions['abs']>,
  paging: Paging,
  now: number,
  refreshAfterMs: number,
  counts: IndexCounts,
): Promise<boolean> {
  let complete = true;
  for (const library of await abs.getLibraries()) {
    const seen = new Set<string>();
    let reachedEnd = false;
    for (let page = paging.first; page < paging.first + paging.count; page += 1) {
      const listed = await abs.getLibraryItems(library.id, {
        limit: paging.size,
        page,
        sort: 'addedAt',
      });
      for (const item of listed.results) {
        seen.add(item.id);
        if (!stale(db, 'abs', item.id, String(item.updatedAt), now, refreshAfterMs)) continue;
        const summary = await abs.getItemSummary(item.id);
        counts.fetched += 1;
        applyTree(db, absTree(summary), now, counts);
        writeSync(db, 'abs', item.id, String(item.updatedAt), now);
      }
      if (listed.results.length === 0 || (page + 1) * paging.size >= listed.total) {
        reachedEnd = true;
        break;
      }
    }
    if (paging.first === 0 && reachedEnd) removeUnseen(db, 'abs', library.id, seen, counts);
    else complete = false;
  }
  return complete;
}

async function indexJellyfin(
  db: Db,
  jellyfin: NonNullable<IndexJobOptions['jellyfin']>,
  paging: Paging,
  now: number,
  refreshAfterMs: number,
  counts: IndexCounts,
): Promise<boolean> {
  const seen = new Set<string>();
  let reachedEnd = false;
  for (let page = paging.first; page < paging.first + paging.count; page += 1) {
    const listed = await jellyfin.getAlbums({ limit: paging.size, startIndex: page * paging.size });
    for (const album of listed.Items) {
      seen.add(album.Id);
      const row = albumRow(album);
      if (stale(db, 'jellyfin', album.Id, row.upstreamVersion, now, refreshAfterMs)) {
        const tracks = await jellyfin.getAlbumTracks(album.Id);
        counts.fetched += 1;
        applyTree(db, { top: row, children: trackRows(album.Id, tracks) }, now, counts);
        writeSync(db, 'jellyfin', album.Id, row.upstreamVersion, now);
      } else {
        applyRow(db, row, now, counts);
      }
    }
    if (listed.Items.length === 0 || (page + 1) * paging.size >= listed.TotalRecordCount) {
      reachedEnd = true;
      break;
    }
  }
  const complete = paging.first === 0 && reachedEnd;
  if (complete) removeUnseen(db, 'jellyfin', null, seen, counts);
  return complete;
}

/**
 * One run over every configured upstream. A failing upstream is recorded in `index_runs` and
 * leaves the other to run; what it indexed before failing stays.
 */
export async function runIndex(options: IndexJobOptions): Promise<IndexRun> {
  const { db } = options;
  const now = options.now ?? Date.now;
  const size = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const paging: Paging = {
    size,
    first: options.pages?.first ?? 0,
    count: options.pages?.count ?? Number.POSITIVE_INFINITY,
  };
  const refreshAfterMs = options.refreshAfterMs ?? DEFAULT_REFRESH_AFTER_MS;
  const result: IndexRun = {};

  const sources: [IndexSource, ((counts: IndexCounts) => Promise<boolean>) | undefined][] = [
    [
      'abs',
      options.abs &&
        ((counts) => indexAbs(db, options.abs!, paging, now(), refreshAfterMs, counts)),
    ],
    [
      'jellyfin',
      options.jellyfin &&
        ((counts) => indexJellyfin(db, options.jellyfin!, paging, now(), refreshAfterMs, counts)),
    ],
  ];
  for (const [source, index] of sources) {
    if (!index) continue;
    const startedAt = now();
    const counts = emptyCounts();
    let complete = false;
    let error: string | null = null;
    try {
      complete = await index(counts);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    recordRun(db, { source, startedAt, finishedAt: now(), complete, error, counts });
    result[source] = { complete, error, counts };
  }
  return result;
}
