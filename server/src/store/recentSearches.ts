/**
 * A person's recent searches, kept on the server so every device of theirs shares them: one row
 * per search words, as search compares them (case, accents and punctuation aside), in the form
 * last typed, the newest `RECENT_KEPT` only.
 */
import { searchTokens } from '../text/fold.js';
import type { Db } from './connection.js';

/** How many recent searches a person keeps. */
export const RECENT_KEPT = 20;

interface RecentSearch {
  /** As last typed, trimmed. */
  query: string;
  /** Its search words, space-joined. */
  words: string;
  /** Milliseconds since the epoch. */
  searchedAt: number;
}

/**
 * Records a search: a new row, or the same words moved to the top in their new form. A search
 * with no word in it, only punctuation or spaces, searched for nothing and is not kept.
 */
export function recordSearch(db: Db, userId: string, query: string, at: number): void {
  const typed = query.trim();
  const words = searchTokens(typed).join(' ');
  if (words === '') return;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO recent_searches (user_id, words, query, searched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, words)
         DO UPDATE SET query = excluded.query, searched_at = excluded.searched_at`,
    ).run(userId, words, typed, at);
    db.prepare(
      `DELETE FROM recent_searches WHERE user_id = @user AND words NOT IN (
         SELECT words FROM recent_searches WHERE user_id = @user
         ORDER BY searched_at DESC, words LIMIT @kept)`,
    ).run({ user: userId, kept: RECENT_KEPT });
  })();
}

/**
 * A person's recent searches whose words start with the words of `typed`, as a title's do for
 * search, newest first: every one when `typed` holds no word.
 */
export function recentSearches(
  db: Db,
  userId: string,
  typed: string,
  limit: number,
): RecentSearch[] {
  const rows = db
    .prepare(
      `SELECT query, words, searched_at FROM recent_searches
       WHERE user_id = @user AND substr(words, 1, length(@prefix)) = @prefix
       ORDER BY searched_at DESC, words LIMIT @limit`,
    )
    .all({ user: userId, prefix: searchTokens(typed).join(' '), limit }) as {
    query: string;
    words: string;
    searched_at: number;
  }[];
  return rows.map((r) => ({ query: r.query, words: r.words, searchedAt: r.searched_at }));
}
