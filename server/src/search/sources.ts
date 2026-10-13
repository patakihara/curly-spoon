/**
 * Where search results come from, and how their lists merge into one. A source ranks its own
 * results in tiers (0, the whole title; 1, the title's start; 2, words of the title; 3, people
 * or series) and orders them within each tier as it sees fit. Today the library index is the one
 * source (`library.ts`).
 */
import type { SearchKind, SearchResult } from '@auralis/schema';

/** The most results a search answers. */
export const RESULT_LIMIT = 100;

/** What was searched for: the text as typed, and the kinds to keep, all when absent. */
export interface SourceQuery {
  q: string;
  kinds?: readonly SearchKind[];
}

/**
 * One result as its source ranked it: its tier, and the source's own score within the tier, lower
 * being closer (for the library, the words of the title or name, or bm25 through people or
 * series).
 */
export interface Ranked {
  result: SearchResult;
  tier: number;
  score: number;
}

export interface SearchSource {
  /** Results for `query`, in the source's order; tiers never go down along the list. */
  search(query: SourceQuery, signal: AbortSignal): Promise<Ranked[]>;
}

/**
 * The sources' lists as one: by tier, and within a tier in the order of the lists, each list's
 * results in its own order; at most `RESULT_LIMIT`.
 */
export function rank(lists: readonly (readonly Ranked[])[]): SearchResult[] {
  return lists
    .flat()
    .sort((a, b) => a.tier - b.tier)
    .slice(0, RESULT_LIMIT)
    .map((r) => r.result);
}
