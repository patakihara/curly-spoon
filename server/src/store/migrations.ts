/**
 * Versioned schema migrations, applied in order and recorded in `_migrations`, so reopening a
 * database only ever applies what is new.
 */

import type Database from 'better-sqlite3';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const migrations: readonly Migration[] = [
  {
    id: 1,
    name: 'security',
    up: (db) => {
      db.exec(`
        -- Everyone who can sign in. The username is the join key with the household sign-on.
        CREATE TABLE users (
          id         TEXT PRIMARY KEY,
          username   TEXT NOT NULL UNIQUE,
          role       TEXT NOT NULL CHECK (role IN ('admin', 'member')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Opaque session cookies. Only a hash of the value is stored, so reading this table
        -- cannot be turned into a valid cookie.
        CREATE TABLE sessions (
          id_hash    TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_sessions_user_id ON sessions(user_id);

        -- The hash of the one-time code that claims the admin role; at most one row.
        CREATE TABLE setup_code (
          only       INTEGER PRIMARY KEY CHECK (only = 1),
          code_hash  TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    },
  },
];

export function runMigrations(
  db: Database.Database,
  list: readonly Migration[] = migrations,
): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     );`,
  );

  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((row) => row.id),
  );
  const recordApplied = db.prepare(
    'INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of list) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      recordApplied.run(migration.id, migration.name, Date.now());
    })();
  }
}
