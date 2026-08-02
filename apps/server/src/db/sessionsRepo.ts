/**
 * Auralis' own httpOnly session cookies. The cookie value itself is never stored —
 * only its SHA-256 hash — so reading the `sessions` table can't be turned directly
 * into a valid cookie.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './connection.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ROTATE_WHEN_REMAINING_MS = SESSION_TTL_MS / 2;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

export function createSession(
  db: Db,
  userId: string,
  ttlMs: number = SESSION_TTL_MS,
): CreatedSession {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + ttlMs;
  db.prepare(
    'INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(hashToken(token), userId, now, expiresAt);
  return { token, expiresAt };
}

export interface ValidatedSession {
  userId: string;
  expiresAt: number;
  /** Past the halfway point of its TTL — the caller should issue a fresh session. */
  shouldRotate: boolean;
}

interface SessionRow {
  user_id: string;
  expires_at: number;
}

/** `null` for a missing, expired, or already-deleted session. An expired row is cleaned up here. */
export function validateSession(db: Db, token: string): ValidatedSession | null {
  const idHash = hashToken(token);
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id_hash = ?')
    .get(idHash) as SessionRow | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
    return null;
  }

  return {
    userId: row.user_id,
    expiresAt: row.expires_at,
    shouldRotate: row.expires_at - now < ROTATE_WHEN_REMAINING_MS,
  };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(token));
}

/** Atomically replace `oldToken` with a freshly-issued one for the same user. `null` if it wasn't valid. */
export function rotateSession(
  db: Db,
  oldToken: string,
  ttlMs: number = SESSION_TTL_MS,
): CreatedSession | null {
  const validated = validateSession(db, oldToken);
  if (!validated) return null;
  deleteSession(db, oldToken);
  return createSession(db, validated.userId, ttlMs);
}
