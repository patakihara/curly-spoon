/**
 * Per-user upstream credentials, encrypted at rest (db/crypto.ts). One row per
 * `(user_id, upstream)` pair (migration 5) — a user can hold a separate token for each
 * upstream they've signed into, rather than one token total. Nothing in this file's return
 * types ever includes the ciphertext or plaintext together — callers get either "store
 * this" or "here is the decrypted token", never both at once.
 */

import type { Db } from './connection.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { DEFAULT_UPSTREAM } from './settingsRepo.js';

interface SecretRow {
  ciphertext: string;
}

export function setUpstreamToken(
  db: Db,
  userId: string,
  token: string,
  sessionSecret: string,
  upstream: string = DEFAULT_UPSTREAM,
): void {
  const ciphertext = encryptSecret(token, sessionSecret);
  db.prepare(
    `INSERT INTO secrets (user_id, upstream, ciphertext, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, upstream) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       updated_at = excluded.updated_at`,
  ).run(userId, upstream, ciphertext, Date.now());
}

/**
 * `null` when this user has no stored credential for `upstream` (never signed into it, or
 * it was deleted).
 */
export function getUpstreamToken(
  db: Db,
  userId: string,
  sessionSecret: string,
  upstream: string = DEFAULT_UPSTREAM,
): string | null {
  const row = db
    .prepare('SELECT ciphertext FROM secrets WHERE user_id = ? AND upstream = ?')
    .get(userId, upstream) as SecretRow | undefined;
  if (!row) return null;
  return decryptSecret(row.ciphertext, sessionSecret);
}

export function deleteUpstreamToken(
  db: Db,
  userId: string,
  upstream: string = DEFAULT_UPSTREAM,
): void {
  db.prepare('DELETE FROM secrets WHERE user_id = ? AND upstream = ?').run(userId, upstream);
}
