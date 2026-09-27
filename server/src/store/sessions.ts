/**
 * The server's own sessions: browser cookies and app bearer tokens, each on one device. The value
 * is never stored, only its SHA-256 hash, so reading the `sessions` table cannot be turned into a
 * valid credential.
 */

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './connection.js';
import { touchDevice } from './devices.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** An app's bearer token slides: each use pushes its expiry this far out. */
export const BEARER_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ROTATE_WHEN_REMAINING_MS = SESSION_TTL_MS / 2;
/** A bearer's expiry is only rewritten once it has slid this much, to spare a write per call. */
const SLIDE_STEP_MS = 60 * 60 * 1000;

export const SessionKind = z.enum(['cookie', 'bearer']);
export type SessionKind = z.infer<typeof SessionKind>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

export interface NewSession {
  userId: string;
  deviceId: string;
  kind?: SessionKind;
  ttlMs?: number;
  now?: number;
}

export function createSession(db: Db, params: NewSession): CreatedSession {
  const kind = params.kind ?? 'cookie';
  const token = randomBytes(32).toString('base64url');
  const now = params.now ?? Date.now();
  const expiresAt = now + (params.ttlMs ?? (kind === 'bearer' ? BEARER_TTL_MS : SESSION_TTL_MS));
  db.prepare(
    `INSERT INTO sessions (id_hash, user_id, device_id, kind, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(hashToken(token), params.userId, params.deviceId, kind, now, expiresAt);
  return { token, expiresAt };
}

export interface ValidatedSession {
  userId: string;
  deviceId: string;
  expiresAt: number;
  /** A cookie past half its lifetime: the caller should issue a fresh one. */
  shouldRotate: boolean;
}

const SessionRow = z.object({ user_id: z.string(), device_id: z.string(), expires_at: z.number() });

/**
 * `null` for a missing, expired or deleted session, or one of the other kind: a cookie's value
 * sent as a bearer token is refused. An expired row is removed here; a bearer's expiry slides,
 * and the device is marked seen.
 */
export function validateSession(
  db: Db,
  token: string,
  kind: SessionKind = 'cookie',
  now: number = Date.now(),
): ValidatedSession | null {
  const idHash = hashToken(token);
  const raw = db
    .prepare('SELECT user_id, device_id, expires_at FROM sessions WHERE id_hash = ? AND kind = ?')
    .get(idHash, kind);
  if (raw === undefined) return null;
  const row = SessionRow.parse(raw);

  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
    return null;
  }

  let expiresAt = row.expires_at;
  if (kind === 'bearer' && now + BEARER_TTL_MS - expiresAt >= SLIDE_STEP_MS) {
    expiresAt = now + BEARER_TTL_MS;
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').run(expiresAt, idHash);
  }
  touchDevice(db, row.device_id, now);

  return {
    userId: row.user_id,
    deviceId: row.device_id,
    expiresAt,
    shouldRotate: kind === 'cookie' && expiresAt - now < ROTATE_WHEN_REMAINING_MS,
  };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(token));
}

/** Replaces a cookie with a fresh one on the same device, atomically. `null` if it was not valid. */
export function rotateSession(
  db: Db,
  oldToken: string,
  now: number = Date.now(),
): CreatedSession | null {
  return db.transaction(() => {
    const validated = validateSession(db, oldToken, 'cookie', now);
    if (!validated) return null;
    deleteSession(db, oldToken);
    return createSession(db, { userId: validated.userId, deviceId: validated.deviceId, now });
  })();
}

/** Deletes every session, sign-in in flight and app code expired by `now`; says how many. */
export function sweepExpiredSessions(db: Db, now: number = Date.now()): number {
  return ['sessions', 'login_requests', 'app_codes'].reduce(
    (sum, table) => sum + db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now).changes,
    0,
  );
}

const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Sweeps now and then hourly, so a session, sign-in or app code nobody presents again does not
 * sit in the store past its expiry. The timer never keeps the process alive. Returns the function
 * that stops it.
 */
export function startSessionSweep(db: Db, options: { now?: () => number } = {}): () => void {
  const now = options.now ?? Date.now;
  sweepExpiredSessions(db, now());
  const timer = setInterval(() => sweepExpiredSessions(db, now()), SWEEP_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
