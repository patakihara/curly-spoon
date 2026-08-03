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
  {
    id: 2,
    name: 'requests',
    up: (db) => {
      db.exec(`
        -- Configuration for one request provider — an indexer (Prowlarr, AudiobookBay)
        -- or a download client (qBittorrent, Transmission).
        --
        -- Deliberately NOT the \`secrets\` table: that one is keyed by user_id, because an
        -- Audiobookshelf token belongs to the person who signed in. A Prowlarr API key or a
        -- qBittorrent password belongs to the *installation* — it is the same credential
        -- whoever is looking — so it is server-scoped and named instead.
        CREATE TABLE IF NOT EXISTS provider_configs (
          id         TEXT PRIMARY KEY,
          kind       TEXT NOT NULL,
          enabled    INTEGER NOT NULL DEFAULT 0,
          base_url   TEXT,
          -- Non-secret provider options as JSON (categories, save path, seed ratio...).
          options    TEXT NOT NULL DEFAULT '{}',
          -- AES-256-GCM (db/crypto.ts) over the provider's secret bundle. NULL when the
          -- provider needs none.
          ciphertext TEXT,
          updated_at INTEGER NOT NULL
        );

        -- One book someone asked for, from the ask to the file landing in the library.
        -- \`release_json\` freezes the chosen release at grab time: the indexer may stop
        -- returning it, but the request still has to be able to explain what it grabbed.
        CREATE TABLE IF NOT EXISTS requests (
          id              TEXT PRIMARY KEY,
          user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title           TEXT NOT NULL,
          author          TEXT,
          status          TEXT NOT NULL,
          -- Human-readable "why" for the current status; the failure message when failed.
          status_detail   TEXT,
          release_json    TEXT,
          indexer_id      TEXT,
          client_id       TEXT,
          download_handle TEXT,
          progress        REAL NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL,
          updated_at      INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);

        -- Installation-wide preferences that are not tied to any one upstream or provider
        -- (approval policy, the library path Audiobookshelf watches). A key/value table
        -- rather than columns, so later phases add keys instead of migrations.
        CREATE TABLE IF NOT EXISTS app_settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
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
