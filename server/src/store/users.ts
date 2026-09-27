/** Everyone who can sign in, keyed by username, each with a role. */

import { randomUUID } from 'node:crypto';
import { Role } from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

export interface User {
  id: string;
  username: string;
  role: Role;
  createdAt: number;
  updatedAt: number;
}

const UserRow = z
  .object({
    id: z.string(),
    username: z.string(),
    role: Role,
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): User => ({
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

export function getUserById(db: Db, id: string): User | null {
  const raw = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return raw === undefined ? null : UserRow.parse(raw);
}

export function getUserByUsername(db: Db, username: string): User | null {
  const raw = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  return raw === undefined ? null : UserRow.parse(raw);
}

export function listUsers(db: Db): User[] {
  return z.array(UserRow).parse(db.prepare('SELECT * FROM users ORDER BY username').all());
}

/** "Configured" is exactly this: there is no separate flag to drift from it. */
export function hasAdmin(db: Db): boolean {
  return db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get() !== undefined;
}

/** Creates the user, or sets the role of the one with this username. */
export function upsertUser(db: Db, params: { username: string; role: Role }): User {
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, username, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (username) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
  ).run(randomUUID(), params.username, params.role, now, now);
  const user = getUserByUsername(db, params.username);
  if (!user) throw new Error('invariant: the user row just written is missing');
  return user;
}
