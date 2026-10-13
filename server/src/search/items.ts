/**
 * Each indexed row's searchable text, written once on write: the words of its title, of every
 * creator's name and of every series name, as the full-text index splits them, and its kind, so
 * ranking reads one table. The full-text index `search_fts` follows `search_items` by triggers, and
 * a row goes with its index row by cascade, so only writes happen here.
 *
 * Each row records the version of the text it was written with. When the fold or the words
 * change, `SEARCH_TEXT_VERSION` goes up, and the next open rewrites every older row
 * (`refreshSearchItems`): no migration carries the fold.
 */
import type { IndexKind } from '../libraryIndex/rows.js';
import type { Db } from '../store/connection.js';
import { searchTokens } from '../text/fold.js';

/** The version of `searchText`: raise it whenever what it writes for some item changes. */
export const SEARCH_TEXT_VERSION = 1;

export interface SearchText {
  kind: IndexKind;
  /** The title's words, space-joined. */
  title: string;
  /** Every creator name's words, once each name, space-joined. */
  people: string;
  /** Every series name's words, once each name, space-joined. */
  series: string;
}

const words = (text: string) => searchTokens(text).join(' ');
const joined = (names: readonly string[]) =>
  [...new Set(names.map(words).filter((name) => name !== ''))].join(' ');

export function searchText(item: {
  kind: IndexKind;
  title: string;
  creators: readonly { name: string }[];
  series: readonly { name: string }[];
}): SearchText {
  return {
    kind: item.kind,
    title: words(item.title),
    people: joined(item.creators.map((c) => c.name)),
    series: joined(item.series.map((s) => s.name)),
  };
}

/**
 * Writes an indexed row's search text, keeping its search row's id, so the full-text index
 * follows; writes nothing when the row already holds this text at this version.
 */
export function writeSearchItem(
  db: Db,
  key: { source: string; id: string },
  text: SearchText,
): void {
  db.prepare(
    `INSERT INTO search_items (source, upstream_id, kind, title, people, series, text_version)
     VALUES (@source, @id, @kind, @title, @people, @series, @version)
     ON CONFLICT (source, upstream_id) DO UPDATE SET
       kind = excluded.kind, title = excluded.title, people = excluded.people,
       series = excluded.series, text_version = excluded.text_version
     WHERE kind <> excluded.kind OR title <> excluded.title OR people <> excluded.people
       OR series <> excluded.series OR text_version <> excluded.text_version`,
  ).run({ source: key.source, id: key.id, version: SEARCH_TEXT_VERSION, ...text });
}

/**
 * Writes the search row of every indexed row that has none, or one an older version wrote: a
 * library indexed before search existed, or after the fold changed.
 */
export function refreshSearchItems(db: Db): void {
  const rows = db
    .prepare(
      `SELECT i.source, i.upstream_id, i.kind, i.title, i.creators, i.series
       FROM index_items i
       LEFT JOIN search_items s ON s.source = i.source AND s.upstream_id = i.upstream_id
       WHERE s.id IS NULL OR s.text_version <> ?`,
    )
    .all(SEARCH_TEXT_VERSION) as {
    source: string;
    upstream_id: string;
    kind: IndexKind;
    title: string;
    creators: string;
    series: string;
  }[];
  if (rows.length === 0) return;
  db.transaction(() => {
    for (const row of rows) {
      writeSearchItem(
        db,
        { source: row.source, id: row.upstream_id },
        searchText({
          kind: row.kind,
          title: row.title,
          creators: JSON.parse(row.creators) as { name: string }[],
          series: JSON.parse(row.series) as { name: string }[],
        }),
      );
    }
  })();
}
