/** Local identities mirroring an upstream account — created/refreshed on every successful login. */

import { randomUUID } from 'node:crypto';
import type { Db } from './connection.js';
import { DEFAULT_UPSTREAM } from './settingsRepo.js';

export interface User {
  id: string;
  username: string;
  upstream: string;
  upstreamUserId: string;
  createdAt: number;
  updatedAt: number;
}

interface UserRow {
  id: string;
  username: string;
  upstream: string;
  upstream_user_id: string;
  created_at: number;
  updated_at: number;
}

function fromRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    upstream: row.upstream,
    upstreamUserId: row.upstream_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getUserById(db: Db, id: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? fromRow(row) : null;
}

/** Insert on first login for a given upstream account, otherwise refresh the username. */
export function upsertUser(
  db: Db,
  params: { username: string; upstreamUserId: string; upstream?: string },
): User {
  const upstream = params.upstream ?? DEFAULT_UPSTREAM;
  const existing = db
    .prepare('SELECT id FROM users WHERE upstream = ? AND upstream_user_id = ?')
    .get(upstream, params.upstreamUserId) as { id: string } | undefined;

  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(
      params.username,
      now,
      existing.id,
    );
    const user = getUserById(db, existing.id);
    if (!user) throw new Error('invariant: user row disappeared mid-transaction');
    return user;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, upstream, upstream_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, params.username, upstream, params.upstreamUserId, now, now);
  const user = getUserById(db, id);
  if (!user) throw new Error('invariant: user row disappeared mid-transaction');
  return user;
}
