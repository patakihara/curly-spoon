/**
 * The index's tables. A row is written only when its content changed, so `version` and
 * `updated_at` say which rows a run really touched.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../store/connection.js';
import type { IndexKind, IndexRow, IndexSource, IndexTree } from './rows.js';

export interface IndexCounts {
  /** Upstream answers read for a whole item: an ABS item, a Jellyfin album's tracks. */
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
}

export function emptyCounts(): IndexCounts {
  return { fetched: 0, inserted: 0, updated: 0, unchanged: 0, removed: 0 };
}

/** A stored row, as later readers see it. */
export interface StoredRow extends IndexRow {
  version: number;
  createdAt: number;
  updatedAt: number;
}

interface RawRow {
  source: IndexSource;
  upstream_id: string;
  kind: IndexKind;
  parent_id: string | null;
  library_id: string | null;
  title: string;
  creators: string;
  series: string;
  genres: string;
  position: number | null;
  disc: number | null;
  duration: number | null;
  year: number | null;
  published_at: number | null;
  upstream_version: string | null;
  version: number;
  created_at: number;
  updated_at: number;
}

/** Every field that makes a row what it is, in a fixed order, ids sorted by scheme. */
export function contentHash(row: IndexRow): string {
  const ids = Object.entries(row.ids).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const content = [
    row.source,
    row.id,
    row.kind,
    row.parentId,
    row.libraryId,
    row.title,
    row.creators.map((c) => [c.id ?? null, c.name, c.role]),
    row.series.map((s) => [s.id, s.name, s.sequence]),
    row.genres,
    row.position,
    row.disc,
    row.duration,
    row.year,
    row.publishedAt,
    row.upstreamVersion,
    ids,
  ];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function upsertRow(db: Db, row: IndexRow, now: number, counts: IndexCounts): void {
  const hash = contentHash(row);
  const existing = db
    .prepare('SELECT content_hash FROM index_items WHERE source = ? AND upstream_id = ?')
    .get(row.source, row.id) as { content_hash: string } | undefined;
  if (existing?.content_hash === hash) {
    counts.unchanged += 1;
    return;
  }
  const values = {
    source: row.source,
    upstream_id: row.id,
    kind: row.kind,
    parent_id: row.parentId,
    library_id: row.libraryId,
    title: row.title,
    creators: JSON.stringify(row.creators),
    series: JSON.stringify(row.series),
    genres: JSON.stringify(row.genres),
    position: row.position,
    disc: row.disc,
    duration: row.duration,
    year: row.year,
    published_at: row.publishedAt,
    upstream_version: row.upstreamVersion,
    content_hash: hash,
    now,
  };
  if (existing === undefined) {
    db.prepare(
      `INSERT INTO index_items (source, upstream_id, kind, parent_id, library_id, title, creators,
         series, genres, position, disc, duration, year, published_at, upstream_version,
         content_hash, version, created_at, updated_at)
       VALUES (@source, @upstream_id, @kind, @parent_id, @library_id, @title, @creators, @series,
         @genres, @position, @disc, @duration, @year, @published_at, @upstream_version,
         @content_hash, 1, @now, @now)`,
    ).run(values);
    counts.inserted += 1;
  } else {
    // An UPDATE, never a REPLACE: replacing would delete the row and cascade to its children.
    db.prepare(
      `UPDATE index_items SET kind = @kind, parent_id = @parent_id, library_id = @library_id,
         title = @title, creators = @creators, series = @series, genres = @genres,
         position = @position, disc = @disc, duration = @duration, year = @year,
         published_at = @published_at, upstream_version = @upstream_version,
         content_hash = @content_hash, version = version + 1, updated_at = @now
       WHERE source = @source AND upstream_id = @upstream_id`,
    ).run(values);
    db.prepare('DELETE FROM index_ids WHERE source = ? AND upstream_id = ?').run(
      row.source,
      row.id,
    );
    counts.updated += 1;
  }
  const addId = db.prepare(
    'INSERT INTO index_ids (source, upstream_id, scheme, value) VALUES (?, ?, ?, ?)',
  );
  for (const [scheme, value] of Object.entries(row.ids))
    addId.run(row.source, row.id, scheme, value);
}

/**
 * Writes a top-level item and its children as one upstream answer gives them: changed rows are
 * updated, new ones inserted, and children the answer no longer lists are removed.
 */
export function applyTree(db: Db, tree: IndexTree, now: number, counts: IndexCounts): void {
  db.transaction(() => {
    upsertRow(db, tree.top, now, counts);
    for (const child of tree.children) upsertRow(db, child, now, counts);
    const kept = new Set(tree.children.map((c) => c.id));
    const stored = db
      .prepare('SELECT upstream_id FROM index_items WHERE source = ? AND parent_id = ?')
      .all(tree.top.source, tree.top.id) as { upstream_id: string }[];
    const remove = db.prepare('DELETE FROM index_items WHERE source = ? AND upstream_id = ?');
    for (const { upstream_id: id } of stored) {
      if (!kept.has(id)) counts.removed += remove.run(tree.top.source, id).changes;
    }
  })();
}

/** Writes one row alone, leaving whatever sits under it as it is. */
export function applyRow(db: Db, row: IndexRow, now: number, counts: IndexCounts): void {
  db.transaction(() => upsertRow(db, row, now, counts))();
}

/**
 * Removes the top-level items of one source, and of one library when named, that a complete
 * pass did not see; their children go with them.
 */
export function removeUnseen(
  db: Db,
  source: IndexSource,
  libraryId: string | null,
  seen: ReadonlySet<string>,
  counts: IndexCounts,
): void {
  db.transaction(() => {
    const stored = db
      .prepare(
        `SELECT upstream_id FROM index_items
         WHERE source = ? AND parent_id IS NULL AND library_id IS ?`,
      )
      .all(source, libraryId) as { upstream_id: string }[];
    const remove = db.prepare('DELETE FROM index_items WHERE source = ? AND upstream_id = ?');
    for (const { upstream_id: id } of stored) {
      if (!seen.has(id)) {
        const children = db
          .prepare('SELECT COUNT(*) AS n FROM index_items WHERE source = ? AND parent_id = ?')
          .get(source, id) as { n: number };
        counts.removed += remove.run(source, id).changes + children.n;
      }
    }
  })();
}

export interface SyncState {
  upstreamVersion: string | null;
  checkedAt: number;
}

export function readSync(db: Db, source: IndexSource, id: string): SyncState | undefined {
  const row = db
    .prepare(
      'SELECT upstream_version, checked_at FROM index_sync WHERE source = ? AND upstream_id = ?',
    )
    .get(source, id) as { upstream_version: string | null; checked_at: number } | undefined;
  return row && { upstreamVersion: row.upstream_version, checkedAt: row.checked_at };
}

export function writeSync(
  db: Db,
  source: IndexSource,
  id: string,
  upstreamVersion: string | null,
  now: number,
): void {
  db.prepare(
    `INSERT INTO index_sync (source, upstream_id, upstream_version, checked_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (source, upstream_id)
       DO UPDATE SET upstream_version = excluded.upstream_version, checked_at = excluded.checked_at`,
  ).run(source, id, upstreamVersion, now);
}

export function recordRun(
  db: Db,
  run: {
    source: IndexSource;
    startedAt: number;
    finishedAt: number;
    complete: boolean;
    error: string | null;
    counts: IndexCounts;
  },
): void {
  db.prepare(
    `INSERT INTO index_runs (source, started_at, finished_at, complete, error, fetched, inserted,
       updated, unchanged, removed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.source,
    run.startedAt,
    run.finishedAt,
    run.complete ? 1 : 0,
    run.error,
    run.counts.fetched,
    run.counts.inserted,
    run.counts.updated,
    run.counts.unchanged,
    run.counts.removed,
  );
}

function fromRaw(raw: RawRow, ids: Record<string, string>): StoredRow {
  return {
    source: raw.source,
    id: raw.upstream_id,
    kind: raw.kind,
    parentId: raw.parent_id,
    libraryId: raw.library_id,
    title: raw.title,
    creators: JSON.parse(raw.creators) as IndexRow['creators'],
    series: JSON.parse(raw.series) as IndexRow['series'],
    genres: JSON.parse(raw.genres) as string[],
    position: raw.position,
    disc: raw.disc,
    duration: raw.duration,
    year: raw.year,
    publishedAt: raw.published_at,
    upstreamVersion: raw.upstream_version,
    ids,
    version: raw.version,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/** Every indexed row, with its external ids, in a stable order. */
export function listIndexed(db: Db, filter: { source?: IndexSource } = {}): StoredRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM index_items WHERE (@source IS NULL OR source = @source)
       ORDER BY source, kind, upstream_id`,
    )
    .all({ source: filter.source ?? null }) as RawRow[];
  const ids = db.prepare('SELECT source, upstream_id, scheme, value FROM index_ids').all() as {
    source: string;
    upstream_id: string;
    scheme: string;
    value: string;
  }[];
  const byRow = new Map<string, Record<string, string>>();
  for (const id of ids) {
    const key = `${id.source}:${id.upstream_id}`;
    byRow.set(key, { ...byRow.get(key), [id.scheme]: id.value });
  }
  return rows.map((raw) => fromRaw(raw, byRow.get(`${raw.source}:${raw.upstream_id}`) ?? {}));
}
