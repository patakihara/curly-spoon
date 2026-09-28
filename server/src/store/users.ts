/**
 * Everyone who can sign in, each with a role. A sign-on user is keyed by (issuer, subject); a
 * setup-only admin has neither until they first sign on under the same username.
 */

import { randomUUID } from 'node:crypto';
import { Role } from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** `setup` roles are never taken away by the directory; `directory` roles follow it. */
export const RoleSource = z.enum(['setup', 'directory']);
export type RoleSource = z.infer<typeof RoleSource>;

export interface User {
  id: string;
  username: string;
  role: Role;
  roleSource: RoleSource;
  createdAt: number;
  updatedAt: number;
}

const UserRow = z
  .object({
    id: z.string(),
    username: z.string(),
    role: Role,
    role_source: RoleSource,
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): User => ({
    id: row.id,
    username: row.username,
    role: row.role,
    roleSource: row.role_source,
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

/** Setup's grant: creates the user, or sets the role of the one with this username. */
export function upsertUser(db: Db, params: { username: string; role: Role }): User {
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, username, role, role_source, created_at, updated_at)
     VALUES (?, ?, ?, 'setup', ?, ?)
     ON CONFLICT (username) DO UPDATE SET role = excluded.role, role_source = 'setup',
       updated_at = excluded.updated_at`,
  ).run(randomUUID(), params.username, params.role, now, now);
  const user = getUserByUsername(db, params.username);
  if (!user) throw new Error('invariant: the user row just written is missing');
  return user;
}

/** The username belongs to a user already tied to another sign-on subject. */
export class UsernameTaken extends Error {
  constructor(username: string) {
    super(`${username} is another sign-on subject's username`);
    this.name = 'UsernameTaken';
  }
}

export interface SignOnIdentity {
  issuer: string;
  sub: string;
  /** The directory login id, from `preferred_username`. */
  username: string;
  /** In the directory's admin group. */
  directoryAdmin: boolean;
}

/** A setup admin keeps admin; everyone else's role follows the directory. */
function directoryRole(user: User | null, directoryAdmin: boolean) {
  if (user !== null && user.roleSource === 'setup' && user.role === 'admin') {
    return { role: 'admin' as const, source: 'setup' as const };
  }
  return { role: directoryAdmin ? ('admin' as const) : ('member' as const), source: 'directory' };
}

/**
 * The user this sign-on identity is: by (issuer, subject), else the setup user with this username
 * and no subject yet (a setup admin only for a member of the directory's admin group), else a new
 * member. The username follows the directory's login id.
 */
export function signInUser(db: Db, who: SignOnIdentity, now: number = Date.now()): User {
  return db.transaction(() => {
    const bySub = db
      .prepare('SELECT * FROM users WHERE oidc_issuer = ? AND oidc_sub = ?')
      .get(who.issuer, who.sub);
    const byName = db.prepare('SELECT * FROM users WHERE username = ?').get(who.username);
    const nameOwner = byName === undefined ? null : UserRow.parse(byName);
    const nameOwnerSub = (byName as { oidc_sub: string | null } | undefined)?.oidc_sub ?? null;

    let user = bySub === undefined ? null : UserRow.parse(bySub);
    // A setup admin row with no subject yet is only handed to someone the directory also calls
    // an admin; anyone else whose login id happens to match it is refused.
    const adoptable =
      nameOwner !== null &&
      nameOwnerSub === null &&
      (nameOwner.role !== 'admin' || who.directoryAdmin);
    if (user === null && adoptable) user = nameOwner;
    if (nameOwner !== null && nameOwner.id !== user?.id) throw new UsernameTaken(who.username);

    const { role, source } = directoryRole(user, who.directoryAdmin);
    const id = user?.id ?? randomUUID();
    db.prepare(
      `INSERT INTO users (id, username, role, role_source, oidc_issuer, oidc_sub, created_at,
         updated_at) VALUES (@id, @username, @role, @source, @issuer, @sub, @now, @now)
       ON CONFLICT (id) DO UPDATE SET username = excluded.username, role = excluded.role,
         role_source = excluded.role_source, oidc_issuer = excluded.oidc_issuer,
         oidc_sub = excluded.oidc_sub, updated_at = excluded.updated_at`,
    ).run({ id, username: who.username, role, source, issuer: who.issuer, sub: who.sub, now });
    const signedIn = getUserById(db, id);
    if (!signedIn) throw new Error('invariant: the user row just written is missing');
    return signedIn;
  })();
}
