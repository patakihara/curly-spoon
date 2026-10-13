/**
 * Search over the library index: the household's whole index, read with no upstream call, and no
 * one's own access asked: a result their accounts can't play still shows.
 *
 * Candidates come from the full-text index, every word of the query a word prefix, best bm25
 * first, up to 500; rows whose whole title is the query join them, so the limit never cuts an
 * exact match. Each candidate is ranked in tiers on its folded title: the whole title is the
 * query (0), the title starts with it (1), every word of the query starts a word of the title
 * (2), or it matched through people, series or words spread across them (3). The artists,
 * authors and series that candidates name become results of their own when their name holds every
 * word, ranked on their name the same way; narrators and hosts have no id upstream, so they
 * don't. Within a tier, albums, books, shows, people and series come before tracks and episodes,
 * then bm25, then the title as the library sorts it, then the ref.
 */
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
import { searchFold, searchTokens } from '../text/fold.js';
import { RESULT_LIMIT, type Ranked, type SearchSource } from './sources.js';

/** How many full-text hits are read, best first, before ranking. */
const CANDIDATES = 500;

/** Who an item's result names: a book's authors, a show's or episode's host, an album's or track's artists. */
const CREATOR_ROLE: Record<IndexKind, Creator['role']> = {
  book: 'author',
  show: 'host',
  episode: 'host',
  album: 'album-artist',
  track: 'artist',
};

/** Kinds that rank after the others of their tier: an album beats its title track. */
const LATER_KINDS: readonly SearchKind[] = ['track', 'episode'];

/** The people and series that are results of their own. */
type NameKind = Extract<SearchKind, 'artist' | 'author' | 'series'>;

const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

interface Hit {
  source: IndexSource;
  upstream_id: string;
  kind: IndexKind;
  title: string;
  creators: string;
  series: string;
  duration: number | null;
  year: number | null;
  published_at: number | null;
  has_art: 0 | 1;
  parent_id: string | null;
  parent_title: string | null;
  parent_has_art: 0 | 1 | null;
  folded: string;
  score: number;
}

/** The best hits for the match expression, and every hit whose whole folded title is `folded`. */
const HITS = `
  WITH hits AS (
    SELECT id, MIN(score) AS score FROM (
      SELECT * FROM (
        SELECT rowid AS id, rank AS score FROM search_fts
        WHERE search_fts MATCH @match ORDER BY rank LIMIT @limit
      )
      UNION ALL
      SELECT rowid AS id, rank AS score FROM search_fts
      WHERE search_fts MATCH @match
        AND rowid IN (SELECT id FROM search_items WHERE title = @folded)
    ) GROUP BY id
  )
  SELECT i.source, i.upstream_id, i.kind, i.title, i.creators, i.series, i.duration, i.year,
    i.published_at, i.has_art, i.parent_id, p.title AS parent_title,
    p.has_art AS parent_has_art, s.title AS folded, hits.score
  FROM hits
  JOIN search_items s ON s.id = hits.id
  JOIN index_items i ON i.source = s.source AND i.upstream_id = s.upstream_id
  LEFT JOIN index_items p ON p.source = i.source AND p.upstream_id = i.parent_id`;

/** The query's words, folded; and the whole query, folded. */
interface Words {
  folded: string;
  tokens: string[];
}

const startsAWord = (tokens: readonly string[], words: readonly string[]) =>
  tokens.every((t) => words.some((w) => w.startsWith(t)));

/** A folded name's tier for the query, as a title's: 0 to 2, or 3 when its words don't all match. */
function tierOf(name: string, query: Words): number {
  if (name === query.folded) return 0;
  if (name.startsWith(query.folded)) return 1;
  return startsAWord(query.tokens, searchTokens(name)) ? 2 : 3;
}

const owned = { kind: 'owned' } as const;

function itemResult(hit: Hit, creators: Creator[]): SearchResult {
  const ref: MediaRef = { source: hit.source, id: hit.upstream_id };
  const parentRef: MediaRef | null =
    hit.parent_id === null ? null : { source: hit.source, id: hit.parent_id };
  const art =
    parentRef === null
      ? hit.has_art === 1
        ? artUrl(ref)
        : null
      : hit.parent_has_art === 1
        ? artUrl(parentRef)
        : null;
  const role = CREATOR_ROLE[hit.kind];
  return {
    ref,
    kind: hit.kind,
    title: hit.title,
    creators: [...new Set(creators.filter((c) => c.role === role).map((c) => c.name))],
    parent:
      parentRef === null || hit.parent_title === null
        ? null
        : { ref: parentRef, title: hit.parent_title },
    art,
    duration: hit.duration,
    year: hit.year,
    publishedAt: hit.published_at,
    availability: owned,
  };
}

function nameResult(kind: NameKind, ref: MediaRef, name: string): SearchResult {
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

/** The artists, authors and series a hit names that have an id upstream, as results. */
interface Named {
  kind: NameKind;
  ref: MediaRef;
  name: string;
}

function namedBy(hit: Hit, creators: Creator[], series: SeriesEntry[]): Named[] {
  const named: Named[] = [];
  for (const c of creators) {
    if (c.id === undefined) continue;
    const kind =
      hit.source === 'jellyfin' && (c.role === 'artist' || c.role === 'album-artist')
        ? 'artist'
        : hit.source === 'abs' && c.role === 'author'
          ? 'author'
          : null;
    if (kind !== null) named.push({ kind, ref: { source: hit.source, id: c.id }, name: c.name });
  }
  if (hit.source === 'abs') {
    for (const s of series) {
      named.push({ kind: 'series', ref: { source: hit.source, id: s.id }, name: s.name });
    }
  }
  return named;
}

function compare(a: Ranked, b: Ranked): number {
  const later = (r: Ranked) => (LATER_KINDS.includes(r.result.kind) ? 1 : 0);
  const ka = mediaRefKey(a.result.ref);
  const kb = mediaRefKey(b.result.ref);
  return (
    a.tier - b.tier ||
    later(a) - later(b) ||
    a.score - b.score ||
    byTitle.compare(a.result.title, b.result.title) ||
    (a.result.kind < b.result.kind ? -1 : a.result.kind > b.result.kind ? 1 : 0) ||
    (ka < kb ? -1 : ka > kb ? 1 : 0)
  );
}

/** Every result for `q` over the whole index, ranked; none when `q` holds no word. */
function ranked(db: Db, q: string): Ranked[] {
  const query: Words = { folded: searchFold(q), tokens: searchTokens(q) };
  if (query.tokens.length === 0) return [];
  // Each word quoted, so nothing typed is read as full-text syntax; a token holds no quote.
  const match = query.tokens.map((t) => `"${t}"*`).join(' ');
  const hits = db.prepare(HITS).all({ match, limit: CANDIDATES, folded: query.folded }) as Hit[];

  const results: Ranked[] = [];
  const names = new Map<string, Ranked>();
  for (const hit of hits) {
    const creators = JSON.parse(hit.creators) as Creator[];
    const series = JSON.parse(hit.series) as SeriesEntry[];
    results.push({
      result: itemResult(hit, creators),
      tier: tierOf(hit.folded, query),
      score: hit.score,
    });
    for (const { kind, ref, name } of namedBy(hit, creators, series)) {
      const key = `${kind}:${mediaRefKey(ref)}`;
      const seen = names.get(key);
      if (seen !== undefined) {
        seen.score = Math.min(seen.score, hit.score);
        continue;
      }
      const folded = searchFold(name);
      if (!startsAWord(query.tokens, searchTokens(folded))) continue;
      names.set(key, {
        result: nameResult(kind, ref, name),
        tier: tierOf(folded, query),
        score: hit.score,
      });
    }
  }
  return [...results, ...names.values()].sort(compare);
}

/** The library index as a search source: the whole household's index, filtered to `kinds`. */
export function librarySource(db: Db): SearchSource {
  return {
    search: ({ q, kinds }) => {
      const all = ranked(db, q);
      const kept = kinds === undefined ? all : all.filter((r) => kinds.includes(r.result.kind));
      return Promise.resolve(kept.slice(0, RESULT_LIMIT));
    },
  };
}

/**
 * Up to `limit` suggestions for `q` from the index, ranked as results: titles of every kind, and
 * the names of artists, authors and series. One text is suggested once per kind.
 */
export function suggestFromIndex(db: Db, q: string, limit: number): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();
  for (const { result } of ranked(db, q)) {
    if (suggestions.length >= limit) break;
    const key = `${result.kind}:${searchFold(result.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ kind: result.kind, text: result.title, ref: result.ref });
  }
  return suggestions;
}
