/**
 * Versioned schema migrations, applied in order and tracked in `_migrations` so
 * re-opening an existing database only ever applies what's new.
 */

import type Database from 'better-sqlite3';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'init',
    up: (db) => {
      db.exec(`
        -- The Audiobookshelf (and future Jellyfin) connection config. One row per upstream.
        CREATE TABLE IF NOT EXISTS settings (
          upstream   TEXT PRIMARY KEY,
          base_url   TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- A local identity mirroring an upstream account. Auralis holds no password of
        -- its own — signing in re-authenticates against the upstream every time.
        CREATE TABLE IF NOT EXISTS users (
          id               TEXT PRIMARY KEY,
          username         TEXT NOT NULL,
          upstream         TEXT NOT NULL,
          upstream_user_id TEXT NOT NULL,
          created_at       INTEGER NOT NULL,
          updated_at       INTEGER NOT NULL,
          UNIQUE (upstream, upstream_user_id)
        );

        -- The upstream API token, AES-256-GCM-encrypted (db/crypto.ts). One per user.
        CREATE TABLE IF NOT EXISTS secrets (
          user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          upstream   TEXT NOT NULL,
          ciphertext TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Auralis' own opaque session cookies. Only a hash of the cookie value is
        -- stored, so a database read alone can't be turned into a valid session.
        CREATE TABLE IF NOT EXISTS sessions (
          id_hash    TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     );`,
  );

  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as Array<{ id: number }>).map((row) => row.id),
  );
  const recordApplied = db.prepare(
    'INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    migration.up(db);
    recordApplied.run(migration.id, migration.name, Date.now());
  }
}
