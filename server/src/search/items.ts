/**
 * Each indexed row's searchable text, folded once on write: its title, every creator's name and
 * every series name. The full-text index `search_fts` follows `search_items` by triggers, and a row
 * goes with its index row by cascade, so only writes happen here.
 */
import type { Db } from '../store/connection.js';
import { searchFold } from '../text/fold.js';

export interface SearchText {
  title: string;
  /** Every creator's folded name, once each, space-joined. */
  people: string;
  /** Every series' folded name, once each, space-joined. */
  series: string;
}

const joined = (names: readonly string[]) =>
  [...new Set(names.map(searchFold).filter((name) => name !== ''))].join(' ');

export function searchText(item: {
  title: string;
  creators: readonly { name: string }[];
  series: readonly { name: string }[];
}): SearchText {
  return {
    title: searchFold(item.title),
    people: joined(item.creators.map((c) => c.name)),
    series: joined(item.series.map((s) => s.name)),
  };
}

/** Writes an indexed row's search text, keeping its search row's id, so the full-text index follows. */
export function writeSearchItem(
  db: Db,
  key: { source: string; id: string },
  text: SearchText,
): void {
  db.prepare(
    `INSERT INTO search_items (source, upstream_id, title, people, series)
     VALUES (@source, @id, @title, @people, @series)
     ON CONFLICT (source, upstream_id) DO UPDATE SET
       title = excluded.title, people = excluded.people, series = excluded.series`,
  ).run({ source: key.source, id: key.id, ...text });
}
