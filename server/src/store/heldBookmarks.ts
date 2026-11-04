/**
 * A person's bookmarks on books their own Audiobookshelf account does not reach (migration 19).
 * They stay here until that account reaches the book, when `routes/bookmarks.ts` moves them there.
 */
import { z } from 'zod';
import type { Db } from './connection.js';

export interface HeldBookmark {
  /** Seconds from the start of the item. */
  time: number;
  title: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
}

const HeldRow = z
  .object({ time: z.number(), title: z.string(), created_at: z.number() })
  .transform((row): HeldBookmark => ({
    time: row.time,
    title: row.title,
    createdAt: row.created_at,
  }));

/** Keeps a bookmark on the item; one already at that time takes the new title and date. */
export function keepBookmark(db: Db, userId: string, itemId: string, bookmark: HeldBookmark): void {
  db.prepare(
    `INSERT INTO held_bookmarks (user_id, item_id, time, title, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, item_id, time) DO UPDATE SET title = excluded.title,
       created_at = excluded.created_at`,
  ).run(userId, itemId, bookmark.time, bookmark.title, bookmark.createdAt);
}

/** What is held on the item, in the order it sits in it. */
export function heldBookmarks(db: Db, userId: string, itemId: string): HeldBookmark[] {
  const rows = db
    .prepare(
      `SELECT time, title, created_at FROM held_bookmarks
       WHERE user_id = ? AND item_id = ? ORDER BY time`,
    )
    .all(userId, itemId);
  return z.array(HeldRow).parse(rows);
}

/** Lets go of one bookmark; says whether it was there. */
export function dropHeldBookmark(db: Db, userId: string, itemId: string, time: number): boolean {
  const { changes } = db
    .prepare(`DELETE FROM held_bookmarks WHERE user_id = ? AND item_id = ? AND time = ?`)
    .run(userId, itemId, time);
  return changes > 0;
}
