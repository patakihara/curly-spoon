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
 * come before tracks and episodes, then bm25, then the title's words, the kind and the ref: one
 * order over every row, so a kinds filter only hides rows.
 */
import { Buffer } from 'node:buffer';
import {
  type MediaRef,
  mediaRefKey,
  type SearchKind,
  type SearchResult,
  type Suggestion,
} from '@auralis/schema';
import type { Creator, IndexKind, IndexSource, SeriesEntry } from '../libraryIndex/rows.js';
import { artUrl } from '../routes/art.js';
import type { Db } from '../store/connection.js';
import { searchTokens } from '../text/fold.js';
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

/** The people and series that are results of their own. */
type NameKind = Extract<SearchKind, 'artist' | 'author' | 'series'>;
const NAME_KINDS: readonly NameKind[] = ['artist', 'author', 'series'];

/** The query's words; joined as search rows hold a title; and as a full-text expression. */
interface Query {
  words: string[];
  joined: string;
  match: string;
}

function queryOf(q: string): Query | null {
  const words = searchTokens(q);
  if (words.length === 0) return null;
  // Each word quoted, so nothing typed is read as full-text syntax; a word holds no quote.
  const match = words.map((w) => `"${w}"*`).join(' ');
  return { words, joined: words.join(' '), match };
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

/**
 * The first `@limit` matching rows of the asked kinds (all kinds when null), in order. The tier is
 * worked out here, on every match, before the limit.
 */
const ITEMS = `
  WITH hits AS (SELECT rowid AS id, rank AS score FROM search_fts WHERE search_fts MATCH @match)
  SELECT s.kind, s.source, s.upstream_id, s.title AS words, hits.score,
    CASE WHEN s.title = @joined THEN 0
         WHEN substr(s.title, 1, length(@joined)) = @joined THEN 1
         WHEN hits.id IN (SELECT rowid FROM search_fts WHERE search_fts MATCH @inTitle) THEN 2
         ELSE 3 END AS tier
  FROM hits JOIN search_items s ON s.id = hits.id
  WHERE @kinds IS NULL OR s.kind IN (SELECT value FROM json_each(@kinds))
  ORDER BY tier, s.kind IN (${LATER_KINDS.map((k) => `'${k}'`).join(', ')}), hits.score, s.title,
    s.kind, s.source, s.upstream_id
  LIMIT @limit`;

/** The creators and series of every row whose people or series hold every word, once each. */
const NAMING = `
  SELECT s.source, i.creators, i.series, MIN(hits.score) AS score
  FROM (SELECT rowid AS id, rank AS score FROM search_fts WHERE search_fts MATCH @inNames) hits
  JOIN search_items s ON s.id = hits.id
  JOIN index_items i ON i.source = s.source AND i.upstream_id = s.upstream_id
  GROUP BY s.source, i.creators, i.series
  ORDER BY s.source, i.creators, i.series`;

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

/** The artists, authors and series a row names that have an id upstream. */
function namedBy(source: IndexSource, creators: Creator[], series: SeriesEntry[]) {
  const named: { kind: NameKind; ref: MediaRef; name: string }[] = [];
  for (const c of creators) {
    if (c.id === undefined) continue;
    const kind =
      source === 'jellyfin' && (c.role === 'artist' || c.role === 'album-artist')
        ? 'artist'
        : source === 'abs' && c.role === 'author'
          ? 'author'
          : null;
    if (kind !== null) named.push({ kind, ref: { source, id: c.id }, name: c.name });
  }
  if (source === 'abs') {
    for (const s of series) named.push({ kind: 'series', ref: { source, id: s.id }, name: s.name });
  }
  return named;
}

/** The people and series of `kinds` whose name holds every word, each once. */
function names(db: Db, query: Query, kinds: readonly NameKind[]): Candidate[] {
  const rows = db
    .prepare(NAMING)
    .all({ inNames: `(people : (${query.match})) OR (series : (${query.match}))` }) as {
    source: IndexSource;
    creators: string;
    series: string;
    score: number;
  }[];
  const found = new Map<string, Candidate>();
  for (const row of rows) {
    const named = namedBy(
      row.source,
      JSON.parse(row.creators) as Creator[],
      JSON.parse(row.series) as SeriesEntry[],
    );
    for (const { kind, ref, name } of named) {
      if (!kinds.includes(kind)) continue;
      const key = `${kind}:${mediaRefKey(ref)}`;
      const seen = found.get(key);
      if (seen !== undefined) {
        seen.score = Math.min(seen.score, row.score);
        continue;
      }
      const words = searchTokens(name).join(' ');
      const tier = tierOf(words, query);
      if (tier !== null) found.set(key, { kind, ref, words, tier, score: row.score, name });
    }
  }
  return [...found.values()];
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
 * The matching items and names of `kinds` (all when absent), in order. `read(limit)` gives the
 * first `limit` items (-1: all) and the names among them, and whether no item was left unread.
 */
function ranking(db: Db, query: Query, kinds: readonly SearchKind[] | undefined) {
  const wanted = <K extends SearchKind>(all: readonly K[]) =>
    kinds === undefined ? all : all.filter((k) => kinds.includes(k));
  const itemKinds = wanted(ITEM_KINDS);
  const nameKinds = wanted(NAME_KINDS);
  const named = nameKinds.length === 0 ? [] : names(db, query, nameKinds);
  return (limit: number): { list: Candidate[]; complete: boolean } => {
    const rows =
      itemKinds.length === 0
        ? []
        : (db.prepare(ITEMS).all({
            match: query.match,
            joined: query.joined,
            inTitle: `title : (${query.match})`,
            kinds: kinds === undefined ? null : JSON.stringify(itemKinds),
            limit,
          }) as ItemRow[]);
    const items = rows.map((row): Candidate => ({
      kind: row.kind,
      ref: { source: row.source, id: row.upstream_id },
      words: row.words,
      tier: row.tier,
      score: row.score,
      name: null,
    }));
    const list = [...items, ...named].sort(compare);
    const complete = limit < 0 || items.length < limit;
    // A name after the last item read may come after items not read yet.
    return { list: complete ? list : list.slice(0, list.indexOf(items.at(-1)!) + 1), complete };
  };
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
  const details = db.prepare(DETAILS);
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
      const { list } = ranking(db, query, kinds)(RESULT_LIMIT);
      return Promise.resolve(resultsOf(db, list.slice(0, RESULT_LIMIT)));
    },
  };
}

/**
 * How many items are read first for each suggestion wanted, so the same text repeated rarely
 * leaves too few; when it does, every item is read.
 */
const READ_PER_SUGGESTION = 64;

/**
 * Up to `limit` suggestions for `q` from the index, ranked as results: titles of every kind, and
 * the names of artists, authors and series. One text is suggested once per kind.
 */
export function suggestFromIndex(db: Db, q: string, limit: number): Suggestion[] {
  const query = queryOf(q);
  if (query === null || limit <= 0) return [];
  const read = ranking(db, query, undefined);
  for (const reading of [limit * READ_PER_SUGGESTION, -1]) {
    const { list, complete } = read(reading);
    const chosen: Candidate[] = [];
    const seen = new Set<string>();
    for (const c of list) {
      const key = `${c.kind}:${c.words}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(c);
      if (chosen.length === limit) break;
    }
    if (chosen.length === limit || complete) {
      return resultsOf(db, chosen).map(({ result }) => ({
        kind: result.kind,
        text: result.title,
        ref: result.ref,
      }));
    }
  }
  throw new Error('unreachable: reading every item is complete');
}
