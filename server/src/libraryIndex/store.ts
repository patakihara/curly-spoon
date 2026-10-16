/**
 * The index's tables. A row is written only when its content changed, so `version` and
 * `updated_at` say which rows a run really touched.
 */
import { createHash } from 'node:crypto';
import { searchText, writeSearchItem } from '../search/items.js';
import type { Db } from '../store/connection.js';
import { statement } from '../store/statements.js';
import type {
  IndexKind,
  IndexRow,
  IndexSource,
  IndexTree,
  ShowEpisodeOrder,
  ShowOrdering,
} from './rows.js';

export interface IndexCounts {
  /** Upstream answers read for a whole item: an ABS item, a Jellyfin album's tracks. */
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Shows' feeds that could not be read; each show kept the order the index held, else unknown. */
  feedsFailed: number;
}

export function emptyCounts(): IndexCounts {
  return { fetched: 0, inserted: 0, updated: 0, unchanged: 0, removed: 0, feedsFailed: 0 };
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
  episode_order: ShowEpisodeOrder | null;
  has_art: 0 | 1;
  version: number;
  created_at: number;
  updated_at: number;
}

/**
 * Every field that makes a row what it is, in a fixed order, ids sorted by scheme. A show's
 * episode order comes last, and only on a show, so rows hashed before it existed keep their hash.
 */
function contentHash(row: IndexRow): string {
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
    ...(row.episodeOrder === null ? [] : [row.episodeOrder]),
    row.hasArt,
  ];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function upsertRow(db: Db, row: IndexRow, now: number, counts: IndexCounts): void {
  const hash = contentHash(row);
  const existing = statement(
    db,
    'SELECT content_hash FROM index_items WHERE source = ? AND upstream_id = ?',
  ).get(row.source, row.id) as { content_hash: string } | undefined;
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
    episode_order: row.episodeOrder,
    has_art: row.hasArt ? 1 : 0,
    content_hash: hash,
    now,
  };
  if (existing === undefined) {
    statement(
      db,
      `INSERT INTO index_items (source, upstream_id, kind, parent_id, library_id, title, creators,
         series, genres, position, disc, duration, year, published_at, upstream_version,
         episode_order, has_art, content_hash, version, created_at, updated_at)
       VALUES (@source, @upstream_id, @kind, @parent_id, @library_id, @title, @creators, @series,
         @genres, @position, @disc, @duration, @year, @published_at, @upstream_version,
         @episode_order, @has_art, @content_hash, 1, @now, @now)`,
    ).run(values);
    counts.inserted += 1;
  } else {
    // An UPDATE, never a REPLACE: replacing would delete the row and cascade to its children.
    statement(
      db,
      `UPDATE index_items SET kind = @kind, parent_id = @parent_id, library_id = @library_id,
         title = @title, creators = @creators, series = @series, genres = @genres,
         position = @position, disc = @disc, duration = @duration, year = @year,
         published_at = @published_at, upstream_version = @upstream_version,
         episode_order = @episode_order, has_art = @has_art, content_hash = @content_hash, version = version + 1, updated_at = @now
       WHERE source = @source AND upstream_id = @upstream_id`,
    ).run(values);
    statement(db, 'DELETE FROM index_ids WHERE source = ? AND upstream_id = ?').run(
      row.source,
      row.id,
    );
    counts.updated += 1;
  }
  const addId = statement(
    db,
    'INSERT INTO index_ids (source, upstream_id, scheme, value) VALUES (?, ?, ?, ?)',
  );
  for (const [scheme, value] of Object.entries(row.ids))
    addId.run(row.source, row.id, scheme, value);
  writeSearchItem(db, row, searchText(row));
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
    const stored = statement(
      db,
      'SELECT upstream_id FROM index_items WHERE source = ? AND parent_id = ?',
    ).all(tree.top.source, tree.top.id) as { upstream_id: string }[];
    const remove = statement(db, 'DELETE FROM index_items WHERE source = ? AND upstream_id = ?');
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
 * The top-level items of one source, and of one library when named, that a complete pass did not
 * see. A pass pages by offset, so an item can go unseen when another is deleted mid-pass: these
 * are candidates, to be confirmed gone upstream before `removeItem`.
 */
export function unseenItems(
  db: Db,
  source: IndexSource,
  libraryId: string | null,
  seen: ReadonlySet<string>,
): string[] {
  const stored = db
    .prepare(
      `SELECT upstream_id FROM index_items
       WHERE source = ? AND parent_id IS NULL AND library_id IS ?`,
    )
    .all(source, libraryId) as { upstream_id: string }[];
  return stored.map((row) => row.upstream_id).filter((id) => !seen.has(id));
}

/**
 * The top-level items of one source that sit in none of `libraryIds`: in a library the upstream no
 * longer has, or in none at all.
 */
export function itemsOutside(
  db: Db,
  source: IndexSource,
  libraryIds: ReadonlySet<string>,
): string[] {
  const stored = db
    .prepare(
      'SELECT upstream_id, library_id FROM index_items WHERE source = ? AND parent_id IS NULL',
    )
    .all(source) as { upstream_id: string; library_id: string | null }[];
  return stored
    .filter((row) => row.library_id === null || !libraryIds.has(row.library_id))
    .map((row) => row.upstream_id);
}

/** Removes one item; its children, external ids and sync state go with it. */
export function removeItem(db: Db, source: IndexSource, id: string, counts: IndexCounts): void {
  db.transaction(() => {
    const children = statement(
      db,
      'SELECT COUNT(*) AS n FROM index_items WHERE source = ? AND parent_id = ?',
    ).get(source, id) as { n: number };
    const removed = statement(
      db,
      'DELETE FROM index_items WHERE source = ? AND upstream_id = ?',
    ).run(source, id).changes;
    counts.removed += removed === 0 ? 0 : removed + children.n;
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
       updated, unchanged, removed, feeds_failed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    run.counts.feedsFailed,
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
    episodeOrder: raw.episode_order,
    hasArt: raw.has_art === 1,
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

/** What the index holds of a show's ordering, for a re-read whose feed can't be read. */
export function storedOrdering(db: Db, showId: string): ShowOrdering | undefined {
  const show = db
    .prepare(
      `SELECT episode_order FROM index_items
       WHERE source = 'abs' AND upstream_id = ? AND kind = 'show'`,
    )
    .get(showId) as { episode_order: ShowEpisodeOrder | null } | undefined;
  if (show?.episode_order == null) return undefined;
  const episodes = db
    .prepare(
      `SELECT upstream_id, published_at FROM index_items
       WHERE source = 'abs' AND parent_id = ? AND published_at IS NOT NULL`,
    )
    .all(showId) as { upstream_id: string; published_at: number }[];
  return {
    order: show.episode_order,
    publishedAt: new Map(episodes.map((e) => [e.upstream_id, e.published_at])),
  };
}

function ids(db: Db, rows: RawRow[]): StoredRow[] {
  const read = db.prepare(
    'SELECT scheme, value FROM index_ids WHERE source = ? AND upstream_id = ?',
  );
  return rows.map((raw) => {
    const found = read.all(raw.source, raw.upstream_id) as { scheme: string; value: string }[];
    return fromRaw(raw, Object.fromEntries(found.map((i) => [i.scheme, i.value])));
  });
}

/** One indexed row by its source and upstream id, or undefined when the index does not hold it. */
export function indexedRow(db: Db, source: IndexSource, id: string): StoredRow | undefined {
  const raw = db
    .prepare('SELECT * FROM index_items WHERE source = ? AND upstream_id = ?')
    .all(source, id) as RawRow[];
  return ids(db, raw)[0];
}

/** Every indexed book, show or album: the top-level items of one kind, with their libraries. */
export function topLevelOfKind(db: Db, kind: 'book' | 'show' | 'album'): StoredRow[] {
  const rows = db
    .prepare('SELECT * FROM index_items WHERE kind = ? AND parent_id IS NULL')
    .all(kind) as RawRow[];
  return ids(db, rows);
}

/** An album's indexed tracks by disc and position; unnumbered ones last. */
export function albumTracks(db: Db, albumId: string): StoredRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM index_items
       WHERE source = 'jellyfin' AND parent_id = ? AND kind = 'track'
       ORDER BY disc IS NULL, disc, position IS NULL, position, upstream_id`,
    )
    .all(albumId) as RawRow[];
  return ids(db, rows);
}

/**
 * A show's episodes in its order: oldest first when serial, newest first when episodic or when the
 * order is unknown (no feed read has succeeded yet; Apple's default). Episodes of one date, and
 * undated ones, which come last, follow season and episode number in the same direction, with
 * unnumbered ones after the numbered. An episode with no season is in the show's season when the
 * show has only one; otherwise it follows those that have one.
 */
export function episodesInOrder(db: Db, showId: string): StoredRow[] {
  const show = db
    .prepare(`SELECT episode_order FROM index_items WHERE source = 'abs' AND upstream_id = ?`)
    .get(showId) as { episode_order: ShowEpisodeOrder | null } | undefined;
  const direction = show?.episode_order === 'serial' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `WITH only_season AS (
         SELECT CASE WHEN COUNT(DISTINCT disc) = 1 THEN MIN(disc) END AS disc
         FROM index_items WHERE source = 'abs' AND parent_id = @show AND kind = 'episode'
       )
       SELECT index_items.* FROM index_items, only_season
       WHERE source = 'abs' AND parent_id = @show AND kind = 'episode'
       ORDER BY published_at IS NULL, published_at ${direction},
         COALESCE(index_items.disc, only_season.disc) IS NULL,
         COALESCE(index_items.disc, only_season.disc) ${direction},
         position IS NULL, position ${direction}, upstream_id`,
    )
    .all({ show: showId }) as RawRow[];
  return ids(db, rows);
}

/** A sequence as a number where it is one (`2`, `2.5`); others sort after, as text. */
function sequenceKey(sequence: string | null): [number, string] {
  const trimmed = sequence?.trim() ?? '';
  return /^\d+(\.\d+)?$/.test(trimmed)
    ? [Number(trimmed), '']
    : [Number.POSITIVE_INFINITY, trimmed];
}

/** The indexed books of one series, in series order; books with no sequence come last. */
export function booksInSeries(db: Db, seriesId: string): StoredRow[] {
  const rows = db
    .prepare(
      `SELECT index_items.*, entry.value ->> '$.sequence' AS sequence
       FROM index_items, json_each(index_items.series) AS entry
       WHERE kind = 'book' AND entry.value ->> '$.id' = ?`,
    )
    .all(seriesId) as (RawRow & { sequence: string | null })[];
  const keyed = rows.map((row) => ({ row, key: sequenceKey(row.sequence) }));
  keyed.sort(
    (a, b) =>
      a.key[0] - b.key[0] ||
      a.key[1].localeCompare(b.key[1]) ||
      a.row.upstream_id.localeCompare(b.row.upstream_id),
  );
  return ids(
    db,
    keyed.map(({ row: { sequence: _sequence, ...row } }) => row),
  );
}
