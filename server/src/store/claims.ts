/**
 * The record of who added what (migration 17): what puts an item in a person's own library. A
 * person holds one claim per item, the first; a later reason for the same item adds nothing.
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
