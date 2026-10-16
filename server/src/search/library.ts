/**
 * Search over the library index: the household's whole index, read with no upstream call, and no
 * one's own access asked: a result their accounts can't play still shows.
 *
 * Every row holding each word of the query as a word prefix is ranked, and the kinds filter
 * applied, before anything is cut, so neither the limit nor a filter loses a better match. A row's
 * tier compares the query's words with its title's words, punctuation aside: the same words (0);
 * the title's words starting with the query's, its last word as a prefix (1); every word of the
 * query starting a word of the title (2); or matched through people, series or words spread
 * across them (3). The artists, authors and series that matching rows name become results of
 * their own when their name holds every word, tiered on their name the same way; narrators and
 * hosts have no id upstream, so they don't. Within a tier, albums, books, shows, people and series
 * come before tracks and episodes; then the closer match: in the tiers a title or name decides,
 * the fewer words, and through people or series, bm25; then the title's words, the kind and the
 * ref: one order over every row, so a kinds filter only hides rows.
 *
 * Tiers are read in order, each only while the limit wants more: titles starting with the query
 * off the title index, then titles holding its words, then the rest, the only tier that asks the
 * full-text index for bm25. A common word or a two-letter prefix fills the limit from the first.
 * Suggestions read each tier one row per kind and title, grouped in the database, so a title
 * repeated thousands of times is one row to them.
 */
import { Buffer } from 'node:buffer';
import {
  type MediaRef,
  mediaRefKey,
  type SearchKind,
  type SearchResult,
  type Suggestion,
} from '@auralis/schema';
import type { Creator, IndexKind, IndexSource } from '../libraryIndex/rows.js';
import { artUrl } from '../routes/art.js';
import type { Db } from '../store/connection.js';
import { statement } from '../store/statements.js';
import { searchTokens } from '../text/fold.js';
import type { NameKind, SearchName } from './items.js';
import { RESULT_LIMIT, type Ranked, type SearchSource } from './sources.js';

/** Who an item's result names: a book's authors, a show's or episode's host, an album's or track's artists. */
const CREATOR_ROLE: Record<IndexKind, Creator['role']> = {
  book: 'author',
  show: 'host',
  episode: 'host',
  album: 'album-artist',
  track: 'artist',
};

const ITEM_KINDS = Object.keys(CREATOR_ROLE) as IndexKind[];

/** Kinds that rank after the others of their tier: an album beats its title track. */
const LATER_KINDS: readonly IndexKind[] = ['track', 'episode'];

const NAME_KINDS: readonly NameKind[] = ['artist', 'author', 'series'];

/**
 * The query's words; joined as search rows hold a title; the first text past every title starting
 * with it; and as a full-text expression.
 */
interface Query {
  words: string[];
  joined: string;
  past: string;
  match: string;
}

function queryOf(q: string): Query | null {
  const words = searchTokens(q);
  if (words.length === 0) return null;
  // Each word quoted, so nothing typed is read as full-text syntax; a word holds no quote.
  const match = words.map((w) => `"${w}"*`).join(' ');
  const joined = words.join(' ');
  // The last code point, which no word holds, sorts after every text starting with `joined`.
  return { words, joined, past: `${joined}\u{10FFFF}`, match };
}

/** One ranked row, before an item's own fields are read. */
interface Candidate {
  kind: SearchKind;
  ref: MediaRef;
  /** The words of its title or name, space-joined. */
  words: string;
  tier: number;
  score: number;
  /** A person's or series' name as shown; null for an item, whose title is read after ranking. */
  name: string | null;
}

/** A search row's columns as a candidate's, and the asked kinds (all when null). */
const COLUMNS = 's.kind, s.source, s.upstream_id, s.title AS words';
const OF_KINDS = '(@kinds IS NULL OR s.kind IN (SELECT value FROM json_each(@kinds)))';
const WORD_COUNT = "length(s.title) - length(replace(s.title, ' ', '')) + 1";
const STARTS = 's.title >= @joined AND s.title < @past';
/** The order within a tier, then the limit. */
const IN_ORDER = `ORDER BY tier, kind IN (${LATER_KINDS.map((k) => `'${k}'`).join(', ')}), score,
  words, kind, source, upstream_id LIMIT @limit`;

/**
 * Each tier: its candidates' score and tier, and the rows it holds. No row is in two, and a kind
 * and title are in one only.
 */
const TIER_PARTS = [
  // 0 and 1: titles starting with the query's words, off the title index.
  {
    columns: `${WORD_COUNT} AS score, CASE WHEN s.title = @joined THEN 0 ELSE 1 END AS tier`,
    rows: `FROM search_items s WHERE ${STARTS} AND ${OF_KINDS}`,
  },
  // 2: titles holding every word, not at their start.
  {
    columns: `${WORD_COUNT} AS score, 2 AS tier`,
    rows: `FROM search_fts f JOIN search_items s ON s.id = f.rowid
     WHERE search_fts MATCH @inTitle AND NOT (${STARTS}) AND ${OF_KINDS}`,
  },
  // 3: through people, series, or words spread across them; bm25 read for these rows alone.
  {
    columns: 'f.rank AS score, 3 AS tier',
    rows: `FROM search_fts f JOIN search_items s ON s.id = f.rowid
     WHERE search_fts MATCH @match
       AND f.rowid NOT IN (SELECT rowid FROM search_fts WHERE search_fts MATCH @inTitle)
       AND ${OF_KINDS}`,
  },
] as const;

/** Each tier's rows in order, the first `@limit`. */
const TIERS = TIER_PARTS.map(
  ({ columns, rows }) => `SELECT ${COLUMNS}, ${columns} ${rows} ${IN_ORDER}`,
);

/**
 * Grouped rows' first: the least source, then id (sources are lower-case names, so a space sorts
 * the pair). SQLite reads a grouped query's other columns from the row holding its lone min().
 */
const FIRST = "min(s.source || ' ' || s.upstream_id)";

/**
 * The same, one row for each kind and title, the first in order: suggestions offer a text once,
 * and a few titles repeated thousands of times would otherwise be read in full to find the next.
 * In the title tiers every row of a title has one score, so the first row stands for them; through
 * people or series, bm25 differs between them: the first row of each score, then the least score.
 */
const DISTINCT_TIERS = [
  ...TIER_PARTS.slice(0, 2).map(
    ({ columns, rows }) =>
      `SELECT ${COLUMNS}, ${columns}, ${FIRST} ${rows} GROUP BY s.title, s.kind ${IN_ORDER}`,
  ),
  `SELECT kind, source, upstream_id, words, min(score) AS score, tier FROM (
     SELECT ${COLUMNS}, ${TIER_PARTS[2].columns}, ${FIRST} ${TIER_PARTS[2].rows}
     GROUP BY s.title, s.kind, f.rank)
   GROUP BY words, kind ${IN_ORDER}`,
];

/** The people and series named by every row whose people or series hold every word, once each. */
const NAMING = `
  SELECT DISTINCT s.source, s.names
  FROM search_fts f JOIN search_items s ON s.id = f.rowid
  WHERE search_fts MATCH @inNames AND s.names <> '[]'
  ORDER BY s.source, s.names`;

const DETAILS = `
  SELECT i.title, i.creators, i.duration, i.year, i.published_at, i.has_art, i.parent_id,
    p.title AS parent_title, p.has_art AS parent_has_art
  FROM index_items i
  LEFT JOIN index_items p ON p.source = i.source AND p.upstream_id = i.parent_id
  WHERE i.source = ? AND i.upstream_id = ?`;

interface Details {
  title: string;
  creators: string;
  duration: number | null;
  year: number | null;
  published_at: number | null;
  has_art: 0 | 1;
  parent_id: string | null;
  parent_title: string | null;
  parent_has_art: 0 | 1 | null;
}

/** How many words a title or name holds: the fewer, the closer a match in its tier. */
const wordCount = (words: string) => words.split(' ').length;

/** A name's tier for the query, as a title's; null when its words don't hold every word. */
function tierOf(words: string, query: Query): number | null {
  if (words === query.joined) return 0;
  if (words.startsWith(query.joined)) return 1;
  const own = words.split(' ');
  return query.words.every((w) => own.some((o) => o.startsWith(w))) ? 2 : null;
}

/** Strings as SQLite orders them: by UTF-8 bytes. */
const binary = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** The order `ITEMS` sorts by, over items and names alike. */
function compare(a: Candidate, b: Candidate): number {
  const later = (c: Candidate) => (LATER_KINDS.includes(c.kind as IndexKind) ? 1 : 0);
  return (
    a.tier - b.tier ||
    later(a) - later(b) ||
    a.score - b.score ||
    binary(a.words, b.words) ||
    binary(a.kind, b.kind) ||
    binary(a.ref.source, b.ref.source) ||
    binary(a.ref.id, b.ref.id)
  );
}

/** The people and series of `kinds` whose name holds every word, each once. */
function names(db: Db, query: Query, kinds: readonly NameKind[]): Candidate[] {
  const rows = statement(db, NAMING).all({
    inNames: `(people : (${query.match})) OR (series : (${query.match}))`,
  }) as { source: IndexSource; names: string }[];
  // Each name decided once: null when its words don't hold every word of the query.
  const found = new Map<string, Candidate | null>();
  for (const row of rows) {
    for (const { kind, id, name, words } of JSON.parse(row.names) as SearchName[]) {
      if (!kinds.includes(kind)) continue;
      const ref = { source: row.source, id };
      const key = `${kind}:${mediaRefKey(ref)}`;
      if (found.has(key)) continue;
      const tier = tierOf(words, query);
      found.set(
        key,
        tier === null ? null : { kind, ref, words, tier, score: wordCount(words), name },
      );
    }
  }
  return [...found.values()].filter((c) => c !== null);
}

interface ItemRow {
  kind: IndexKind;
  source: IndexSource;
  upstream_id: string;
  words: string;
  score: number;
  tier: number;
}

/**
 * The matching items and names of `kinds` (all when absent), in order: the first `limit` items
 * `tiers` read, each a distinct kind and title or ref, and every matching name.
 */
function ranking(
  db: Db,
  query: Query,
  kinds: readonly SearchKind[] | undefined,
  tiers: readonly string[],
  limit: number,
): Candidate[] {
  const wanted = <K extends SearchKind>(all: readonly K[]) =>
    kinds === undefined ? all : all.filter((k) => kinds.includes(k));
  const itemKinds = wanted(ITEM_KINDS);
  const nameKinds = wanted(NAME_KINDS);
  const named = nameKinds.length === 0 ? [] : names(db, query, nameKinds);
  const params = {
    match: query.match,
    joined: query.joined,
    past: query.past,
    inTitle: `title : (${query.match})`,
    kinds: kinds === undefined ? null : JSON.stringify(itemKinds),
  };
  const rows: ItemRow[] = [];
  for (const tier of itemKinds.length === 0 ? [] : tiers) {
    const left = limit - rows.length;
    if (left === 0) break;
    rows.push(...(statement(db, tier).all({ ...params, limit: left }) as ItemRow[]));
  }
  const items = rows.map((row): Candidate => ({
    kind: row.kind,
    ref: { source: row.source, id: row.upstream_id },
    words: row.words,
    tier: row.tier,
    score: row.score,
    name: null,
  }));
  // A name past the last item read may rank after items not read, but the `limit` distinct items
  // read come first: a caller takes the first `limit` entries, so never such a name.
  return [...items, ...named].sort(compare);
}

const owned = { kind: 'owned' } as const;

function itemResult(kind: IndexKind, ref: MediaRef, item: Details): SearchResult {
  const parentRef: MediaRef | null =
    item.parent_id === null ? null : { source: ref.source, id: item.parent_id };
  const art =
    parentRef === null
      ? item.has_art === 1
        ? artUrl(ref)
        : null
      : item.parent_has_art === 1
        ? artUrl(parentRef)
        : null;
  const role = CREATOR_ROLE[kind];
  const creators = JSON.parse(item.creators) as Creator[];
  return {
    ref,
    kind,
    title: item.title,
    creators: [...new Set(creators.filter((c) => c.role === role).map((c) => c.name))],
    parent:
      parentRef === null || item.parent_title === null
        ? null
        : { ref: parentRef, title: item.parent_title },
    art,
    duration: item.duration,
    year: item.year,
    publishedAt: item.published_at,
    availability: owned,
  };
}

function nameResult(kind: SearchKind, ref: MediaRef, name: string): SearchResult {
  return {
    ref,
    kind,
    title: name,
    creators: [],
    parent: null,
    art: null,
    duration: null,
    year: null,
    publishedAt: null,
    availability: owned,
  };
}

/** The candidates' results, each item's fields read now that the ranking is done. */
function resultsOf(db: Db, chosen: readonly Candidate[]): Ranked[] {
  const details = statement(db, DETAILS);
  return chosen.map((c) => ({
    result:
      c.name === null
        ? itemResult(c.kind as IndexKind, c.ref, details.get(c.ref.source, c.ref.id) as Details)
        : nameResult(c.kind, c.ref, c.name),
    tier: c.tier,
    score: c.score,
  }));
}

/** The library index as a search source: the whole household's index, filtered to `kinds`. */
export function librarySource(db: Db): SearchSource {
  return {
    search: ({ q, kinds }) => {
      const query = queryOf(q);
      if (query === null) return Promise.resolve([]);
      const list = ranking(db, query, kinds, TIERS, RESULT_LIMIT);
      return Promise.resolve(resultsOf(db, list.slice(0, RESULT_LIMIT)));
    },
  };
}

/**
 * Up to `limit` suggestions for `q` from the index, ranked as results: titles of every kind, and
 * the names of artists, authors and series. One text is suggested once per kind.
 */
export function suggestFromIndex(db: Db, q: string, limit: number): Suggestion[] {
  const query = queryOf(q);
  if (query === null || limit <= 0) return [];
  // Items come once per kind and title; two people or series may still share a name.
  const chosen: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of ranking(db, query, undefined, DISTINCT_TIERS, limit)) {
    const key = `${c.kind}:${c.words}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(c);
    if (chosen.length === limit) break;
  }
  return resultsOf(db, chosen).map(({ result }) => ({
    kind: result.kind,
    text: result.title,
    ref: result.ref,
  }));
}
