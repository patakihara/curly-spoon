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
 * to the last, and only once the upstream confirms each is gone; a window of pages (`pages`) never
 * removes anything.
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
  removeItem,
  unseenItems,
  writeSync,
} from './store.js';

export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface IndexJobOptions {
  db: Db;
  abs?: Pick<AbsClient, 'getLibraries' | 'getLibraryItems' | 'getItemSummary' | 'findItemSummary'>;
  jellyfin?: Pick<JellyfinClient, 'getAlbums' | 'getAlbumTracks' | 'findAlbum'>;
  now?: () => number;
  /** In [0, 1): spreads each item's next re-read, so the daily re-reads don't all land at once. */
  random?: () => number;
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

/**
 * An item read now is next due between three quarters of `refreshAfterMs` and all of it, so a
 * library indexed in one run spreads its re-reads over the runs of the following quarter-day.
 */
const JITTER_SHARE = 0.25;

interface Pass {
  db: Db;
  size: number;
  first: number;
  count: number;
  now: number;
  refreshAfterMs: number;
  random: () => number;
  counts: IndexCounts;
}

function stale(pass: Pass, source: IndexSource, id: string, version: string | null): boolean {
  const sync = readSync(pass.db, source, id);
  return (
    sync === undefined ||
    sync.upstreamVersion !== version ||
    pass.now - sync.checkedAt >= pass.refreshAfterMs
  );
}

function markRead(pass: Pass, source: IndexSource, id: string, version: string | null): void {
  const jitter = Math.floor(pass.random() * pass.refreshAfterMs * JITTER_SHARE);
  writeSync(pass.db, source, id, version, pass.now - jitter);
}

/**
 * Removes the items a complete pass did not see, each only once its upstream confirms it is gone.
 * Offset paging skips an item whenever one before it is deleted mid-pass; a skipped item still
 * answers, so it stays.
 */
async function removeGone(
  pass: Pass,
  source: IndexSource,
  libraryId: string | null,
  seen: ReadonlySet<string>,
  isGone: (id: string) => Promise<boolean>,
): Promise<void> {
  for (const id of unseenItems(pass.db, source, libraryId, seen)) {
    if (await isGone(id)) removeItem(pass.db, source, id, pass.counts);
  }
}

async function indexAbs(pass: Pass, abs: NonNullable<IndexJobOptions['abs']>): Promise<boolean> {
  let complete = true;
  for (const library of await abs.getLibraries()) {
    const seen = new Set<string>();
    let reachedEnd = false;
    for (let page = pass.first; page < pass.first + pass.count; page += 1) {
      const listed = await abs.getLibraryItems(library.id, {
        limit: pass.size,
        page,
        sort: 'addedAt',
      });
      for (const item of listed.results) {
        seen.add(item.id);
        const version = String(item.updatedAt);
        if (!stale(pass, 'abs', item.id, version)) continue;
        const summary = await abs.getItemSummary(item.id);
        pass.counts.fetched += 1;
        applyTree(pass.db, absTree(summary), pass.now, pass.counts);
        markRead(pass, 'abs', item.id, version);
      }
      if (listed.results.length === 0 || (page + 1) * pass.size >= listed.total) {
        reachedEnd = true;
        break;
      }
    }
    if (pass.first === 0 && reachedEnd) {
      await removeGone(pass, 'abs', library.id, seen, async (id) => {
        return (await abs.findItemSummary(id)) === null;
      });
    } else {
      complete = false;
    }
  }
  return complete;
}

async function indexJellyfin(
  pass: Pass,
  jellyfin: NonNullable<IndexJobOptions['jellyfin']>,
): Promise<boolean> {
  const seen = new Set<string>();
  let reachedEnd = false;
  for (let page = pass.first; page < pass.first + pass.count; page += 1) {
    const listed = await jellyfin.getAlbums({ limit: pass.size, startIndex: page * pass.size });
    for (const album of listed.Items) {
      seen.add(album.Id);
      const row = albumRow(album);
      if (stale(pass, 'jellyfin', album.Id, row.upstreamVersion)) {
        const tracks = await jellyfin.getAlbumTracks(album.Id);
        pass.counts.fetched += 1;
        const tree = { top: row, children: trackRows(album.Id, tracks) };
        applyTree(pass.db, tree, pass.now, pass.counts);
        markRead(pass, 'jellyfin', album.Id, row.upstreamVersion);
      } else {
        applyRow(pass.db, row, pass.now, pass.counts);
      }
    }
    if (listed.Items.length === 0 || (page + 1) * pass.size >= listed.TotalRecordCount) {
      reachedEnd = true;
      break;
    }
  }
  const complete = pass.first === 0 && reachedEnd;
  if (complete) {
    await removeGone(pass, 'jellyfin', null, seen, async (id) => {
      return (await jellyfin.findAlbum(id)) === undefined;
    });
  }
  return complete;
}

/**
 * One run over every configured upstream. A failing upstream is recorded in `index_runs` and
 * leaves the other to run; what it indexed before failing stays.
 */
export async function runIndex(options: IndexJobOptions): Promise<IndexRun> {
  const now = options.now ?? Date.now;
  const result: IndexRun = {};
  const { abs, jellyfin } = options;
  const sources: [IndexSource, ((pass: Pass) => Promise<boolean>) | undefined][] = [
    ['abs', abs && ((pass) => indexAbs(pass, abs))],
    ['jellyfin', jellyfin && ((pass) => indexJellyfin(pass, jellyfin))],
  ];
  for (const [source, index] of sources) {
    if (!index) continue;
    const startedAt = now();
    const pass: Pass = {
      db: options.db,
      size: options.pageSize ?? DEFAULT_PAGE_SIZE,
      first: options.pages?.first ?? 0,
      count: options.pages?.count ?? Number.POSITIVE_INFINITY,
      now: startedAt,
      refreshAfterMs: options.refreshAfterMs ?? DEFAULT_REFRESH_AFTER_MS,
      random: options.random ?? Math.random,
      counts: emptyCounts(),
    };
    let complete = false;
    let error: string | null = null;
    try {
      complete = await index(pass);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const { counts } = pass;
    recordRun(options.db, { source, startedAt, finishedAt: now(), complete, error, counts });
    result[source] = { complete, error, counts };
  }
  return result;
}
