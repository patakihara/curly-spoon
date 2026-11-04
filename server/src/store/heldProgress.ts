/**
 * Where a person is on a household play: one Auralis made through its own accounts because their
 * own does not reach the item (`upstream/reach.ts`). Nobody's Audiobookshelf or Jellyfin account
 * hears of it, so Auralis keeps it here (migration 18), one row per person and book or episode,
 * by the id its ref carries.
 */
import { type MediaRef } from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** Within this many seconds of its end, a book or episode counts as finished. */
const FINISHED_WITHIN_S = 30;

export interface HeldProgress {
  /** Seconds from the start of the whole item. */
  position: number;
  duration: number;
  finished: boolean;
  /** Milliseconds since the epoch. */
  updatedAt: number;
}

const HeldRow = z
  .object({
    item_id: z.string(),
    position: z.number(),
    duration: z.number(),
    finished: z.number(),
    updated_at: z.number(),
  })
  .transform((row): [string, HeldProgress] => [
    row.item_id,
    {
      position: row.position,
      duration: row.duration,
      finished: row.finished === 1,
      updatedAt: row.updated_at,
    },
  ]);

/**
 * Keeps where a person was in `ref` at `at`, replacing what was held unless that is newer: the most
 * recent listening wins, whichever device's play closes last.
 */
export function keepHeld(
  db: Db,
  userId: string,
  ref: MediaRef,
  place: { position: number; duration: number },
  at: number,
): void {
  const finished = place.position >= place.duration - FINISHED_WITHIN_S ? 1 : 0;
  db.prepare(
    `INSERT INTO held_progress (user_id, source, item_id, position, duration, finished, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, source, item_id) DO UPDATE SET position = excluded.position,
       duration = excluded.duration, finished = excluded.finished, updated_at = excluded.updated_at
     WHERE excluded.updated_at >= held_progress.updated_at`,
  ).run(userId, ref.source, ref.id, place.position, place.duration, finished, at);
}

/** What is held for a person on one source, by item id. */
export function heldProgressOf(
  db: Db,
  userId: string,
  source: MediaRef['source'],
): Map<string, HeldProgress> {
  const rows = db
    .prepare(
      `SELECT item_id, position, duration, finished, updated_at FROM held_progress
       WHERE user_id = ? AND source = ?`,
    )
    .all(userId, source);
  return new Map(z.array(HeldRow).parse(rows));
}

/** What is held for a person on `ref`, if anything. */
export function heldOf(db: Db, userId: string, ref: MediaRef): HeldProgress | undefined {
  return heldProgressOf(db, userId, ref.source).get(ref.id);
}

/** Lets go of what is held on `ref`, once the person's own account has it. */
export function dropHeld(db: Db, userId: string, ref: MediaRef): void {
  db.prepare(`DELETE FROM held_progress WHERE user_id = ? AND source = ? AND item_id = ?`).run(
    userId,
    ref.source,
    ref.id,
  );
}
