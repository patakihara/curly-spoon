/**
 * The record of who added what (migration 17): what puts an item in a person's own library. A
 * person holds one claim per item, the first; a later reason for the same item adds nothing.
 *
 * For a show, a claim is a subscription: a person follows a show they hold a claim on, whatever
 * its reason. Unfollowing deletes the claim and records the show in `show_unfollows` (migration
 * 36), so a play Audiobookshelf reports for them never claims it again; following it again, by
 * asking or by playing an episode, deletes that row. Neither touches anything upstream.
 */
import { MediaRef } from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** Why an item counts as a person's own. */
export const ClaimReason = z.enum(['requested', 'added', 'subscribed', 'played']);
export type ClaimReason = z.infer<typeof ClaimReason>;

/** Claims an item for a person; one they already claimed stays as it was. */
export function addClaim(
  db: Db,
  userId: string,
  ref: MediaRef,
  reason: ClaimReason,
  now: number,
): void {
  db.prepare(
    `INSERT INTO library_claims (user_id, source, item_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  ).run(userId, ref.source, ref.id, reason, now);
}

/**
 * Claims many items for a person at once, as played; those they already claimed stay as they were,
 * and a show they unfollowed stays out.
 */
export function addPlayedClaims(db: Db, userId: string, refs: readonly MediaRef[], now: number) {
  const claim = db.prepare(
    `INSERT INTO library_claims (user_id, source, item_id, reason, created_at)
     SELECT ?, ?, ?, 'played', ? WHERE NOT EXISTS
       (SELECT 1 FROM show_unfollows WHERE user_id = ? AND source = ? AND item_id = ?)
     ON CONFLICT DO NOTHING`,
  );
  db.transaction(() => {
    for (const ref of refs) claim.run(userId, ref.source, ref.id, now, userId, ref.source, ref.id);
  })();
}

/** Follows a show for a person: claims it as subscribed, unless claimed, and forgets an unfollow. */
export function followShow(db: Db, userId: string, show: MediaRef, now: number): void {
  db.transaction(() => {
    db.prepare('DELETE FROM show_unfollows WHERE user_id = ? AND source = ? AND item_id = ?').run(
      userId,
      show.source,
      show.id,
    );
    addClaim(db, userId, show, 'subscribed', now);
  })();
}

/** Unfollows a show for a person: their claim goes, and no reported play brings it back. */
export function unfollowShow(db: Db, userId: string, show: MediaRef, now: number): void {
  db.transaction(() => {
    db.prepare('DELETE FROM library_claims WHERE user_id = ? AND source = ? AND item_id = ?').run(
      userId,
      show.source,
      show.id,
    );
    db.prepare(
      `INSERT INTO show_unfollows (user_id, source, item_id, at) VALUES (?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET at = excluded.at`,
    ).run(userId, show.source, show.id, now);
  })();
}

/** Whether a person unfollowed a show and has not followed it again. */
export function unfollowed(db: Db, userId: string, show: MediaRef): boolean {
  return (
    db
      .prepare('SELECT 1 FROM show_unfollows WHERE user_id = ? AND source = ? AND item_id = ?')
      .get(userId, show.source, show.id) !== undefined
  );
}

const ClaimRow = z
  .object({ source: MediaRef.shape.source, item_id: z.string(), reason: ClaimReason })
  .transform((row) => ({ ref: { source: row.source, id: row.item_id }, reason: row.reason }));

/** A person's claims, oldest first. */
export function claimsOf(db: Db, userId: string): { ref: MediaRef; reason: ClaimReason }[] {
  return z.array(ClaimRow).parse(
    db
      .prepare(
        `SELECT source, item_id, reason FROM library_claims WHERE user_id = ?
         ORDER BY created_at, source, item_id`,
      )
      .all(userId),
  );
}
