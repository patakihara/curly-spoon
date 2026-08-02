/**
 * Glue between a successful upstream login and Auralis' own session state —
 * kept separate from the route handler so it's testable without HTTP.
 */

import type { LoginResult } from '@auralis/abs-client';
import type { Db } from '../db/connection.js';
import { createSession, deleteSession, rotateSession, validateSession } from '../db/sessionsRepo.js';
import { setUpstreamToken } from '../db/secretsRepo.js';
import { upsertUser } from '../db/usersRepo.js';

export interface NewSession {
  token: string;
  expiresAt: number;
  userId: string;
  username: string;
}

/** Persist the local user + encrypted upstream token, and mint a fresh Auralis session. */
export function completeLogin(db: Db, sessionSecret: string, loginResult: LoginResult): NewSession {
  const user = upsertUser(db, {
    username: loginResult.user.username,
    upstreamUserId: loginResult.user.id,
  });
  setUpstreamToken(db, user.id, loginResult.token, sessionSecret);
  const session = createSession(db, user.id);
  return { token: session.token, expiresAt: session.expiresAt, userId: user.id, username: user.username };
}

export interface ResolvedSession {
  userId: string;
  /** Set when the session was past the rotation threshold — the caller should re-issue the cookie. */
  rotated?: { token: string; expiresAt: number };
}

/** `null` for a missing or expired cookie value. */
export function resolveSession(db: Db, token: string): ResolvedSession | null {
  const validated = validateSession(db, token);
  if (!validated) return null;

  if (validated.shouldRotate) {
    const rotated = rotateSession(db, token);
    if (rotated) return { userId: validated.userId, rotated };
  }

  return { userId: validated.userId };
}

export function endSession(db: Db, token: string): void {
  deleteSession(db, token);
}
