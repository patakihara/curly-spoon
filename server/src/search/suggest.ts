/**
 * Suggestions as you type. Under two letters, only your own recent searches: the newest with
 * nothing typed, else those starting with it. From two letters, up to three of your recent
 * searches starting with it, then the household's index (`library.ts`), so many in all.
 */
import type { Suggestion } from '@auralis/schema';
import type { Db } from '../store/connection.js';
import { recentSearches } from '../store/recentSearches.js';
import { searchFold } from '../text/fold.js';
import { suggestFromIndex } from './library.js';

/** How many suggestions are offered. */
export const SUGGESTION_LIMIT = 8;
/** How many recent searches come first once the index is asked too. */
const RECENT_FIRST = 3;
/** How much of a query, folded, it takes to ask the index. */
const INDEX_FROM = 2;

export function suggest(db: Db, userId: string, q: string): Suggestion[] {
  const folded = searchFold(q);
  const fromIndex = [...folded].length >= INDEX_FROM;
  const recent = recentSearches(
    db,
    userId,
    folded,
    fromIndex ? RECENT_FIRST : SUGGESTION_LIMIT,
  ).map((r): Suggestion => ({ kind: 'recent', text: r.query, ref: null }));
  if (!fromIndex) return recent;
  return [...recent, ...suggestFromIndex(db, q, SUGGESTION_LIMIT - recent.length)];
}
