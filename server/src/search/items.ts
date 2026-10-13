/**
 * Each indexed row's searchable text, written once on write: the words of its title, of every
 * creator's name and of every series name, as the full-text index splits them, its kind, and the
 * people and series it names that are results of their own, so ranking reads one table. The
 * full-text index `search_fts` follows `search_items` by triggers, and a row goes with its index
 * row by cascade, so only writes happen here.
 *
 * Each row records the version of the text it was written with. When the fold or the words
 * change, `SEARCH_TEXT_VERSION` goes up, and the next open rewrites every older row
 * (`refreshSearchItems`): no migration carries the fold.
 */
import type { SearchKind } from '@auralis/schema';
import type { Creator, IndexKind, IndexSource, SeriesEntry } from '../libraryIndex/rows.js';
import type { Db } from '../store/connection.js';
import { statement } from '../store/statements.js';
import { searchTokens } from '../text/fold.js';

/** The version of `searchText`: raise it whenever what it writes for some item changes. */
export const SEARCH_TEXT_VERSION = 1;

/** The people and series that are results of their own. */
export type NameKind = Extract<SearchKind, 'artist' | 'author' | 'series'>;

/** A person or series a row names, with an id upstream, so a result of its own. */
export interface SearchName {
  kind: NameKind;
  id: string;
  /** As shown. */
  name: string;
  /** Its words, space-joined. */
  words: string;
}

export interface SearchText {
  kind: IndexKind;
  /** The title's words, space-joined. */
  title: string;
  /** Every creator name's words, once each name, space-joined. */
  people: string;
  /** Every series name's words, once each name, space-joined. */
  series: string;
  /**
   * The artists, authors and series it names, once each, as JSON. Narrators and hosts have no id
   * upstream, so they are not results.
   */
  names: string;
}

const words = (text: string) => searchTokens(text).join(' ');
const joined = (names: readonly string[]) =>
  [...new Set(names.map(words).filter((name) => name !== ''))].join(' ');

/** The kind a creator is a result as, or null: Jellyfin's artists, Audiobookshelf's authors. */
function nameKind(source: IndexSource, role: Creator['role']): NameKind | null {
  if (source === 'jellyfin' && (role === 'artist' || role === 'album-artist')) return 'artist';
  return source === 'abs' && role === 'author' ? 'author' : null;
}

function namesOf(
  source: IndexSource,
  creators: readonly Creator[],
  series: readonly SeriesEntry[],
): SearchName[] {
  const named = new Map<string, SearchName>();
  const add = (kind: NameKind, id: string, name: string) => {
    if (!named.has(`${kind}:${id}`))
      named.set(`${kind}:${id}`, { kind, id, name, words: words(name) });
  };
  for (const c of creators) {
    const kind = nameKind(source, c.role);
    if (kind !== null && c.id !== undefined) add(kind, c.id, c.name);
  }
  if (source === 'abs') for (const s of series) add('series', s.id, s.name);
  return [...named.values()];
}

export function searchText(item: {
  source: IndexSource;
  kind: IndexKind;
  title: string;
  creators: readonly Creator[];
  series: readonly SeriesEntry[];
}): SearchText {
  return {
    kind: item.kind,
    title: words(item.title),
    people: joined(item.creators.map((c) => c.name)),
    series: joined(item.series.map((s) => s.name)),
    names: JSON.stringify(namesOf(item.source, item.creators, item.series)),
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
  statement(
    db,
    `INSERT INTO search_items (source, upstream_id, kind, title, people, series, names,
       text_version)
     VALUES (@source, @id, @kind, @title, @people, @series, @names, @version)
     ON CONFLICT (source, upstream_id) DO UPDATE SET
       kind = excluded.kind, title = excluded.title, people = excluded.people,
       series = excluded.series, names = excluded.names, text_version = excluded.text_version
     WHERE kind <> excluded.kind OR title <> excluded.title OR people <> excluded.people
       OR series <> excluded.series OR names <> excluded.names
       OR text_version <> excluded.text_version`,
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
    source: IndexSource;
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
          source: row.source,
          kind: row.kind,
          title: row.title,
          creators: JSON.parse(row.creators) as Creator[],
          series: JSON.parse(row.series) as SeriesEntry[],
        }),
      );
    }
  })();
}
