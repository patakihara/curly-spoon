/**
 * A person's recent searches, kept on the server so every device of theirs shares them: one row
 * per folded text, in the form last typed, the newest `RECENT_KEPT` only.
 */
import { searchFold } from '../text/fold.js';
import type { Db } from './connection.js';

/** How many recent searches a person keeps. */
export const RECENT_KEPT = 20;

export interface RecentSearch {
  /** As last typed, trimmed. */
  query: string;
  folded: string;
  /** Milliseconds since the epoch. */
  searchedAt: number;
}

/** Records a search: a new row, or the same folded text moved to the top in its new form. */
export function recordSearch(db: Db, userId: string, query: string, at: number): void {
  const typed = query.trim();
  const folded = searchFold(typed);
  if (folded === '') return;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO recent_searches (user_id, folded, query, searched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, folded)
         DO UPDATE SET query = excluded.query, searched_at = excluded.searched_at`,
    ).run(userId, folded, typed, at);
    db.prepare(
      `DELETE FROM recent_searches WHERE user_id = @user AND folded NOT IN (
         SELECT folded FROM recent_searches WHERE user_id = @user
         ORDER BY searched_at DESC, folded LIMIT @kept)`,
    ).run({ user: userId, kept: RECENT_KEPT });
  })();
}

/** A person's recent searches whose folded text starts with `prefix` (folded), newest first. */
export function recentSearches(
  db: Db,
  userId: string,
  prefix: string,
  limit: number,
): RecentSearch[] {
  const rows = db
    .prepare(
      `SELECT query, folded, searched_at FROM recent_searches
       WHERE user_id = @user AND substr(folded, 1, length(@prefix)) = @prefix
       ORDER BY searched_at DESC, folded LIMIT @limit`,
    )
    .all({ user: userId, prefix, limit }) as {
    query: string;
    folded: string;
    searched_at: number;
  }[];
  return rows.map((r) => ({ query: r.query, folded: r.folded, searchedAt: r.searched_at }));
}
