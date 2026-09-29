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
        -- Everyone who can sign in, by the household sign-on's login name.
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
  {
    id: 2,
    name: 'sso',
    up: (db) => {
      db.exec(`
        -- The sign-on subject keys a user; setup-only users have none. A setup admin keeps the
        -- role; a directory admin loses it on leaving the directory's admin group.
        ALTER TABLE users ADD COLUMN oidc_issuer TEXT;
        ALTER TABLE users ADD COLUMN oidc_sub TEXT;
        ALTER TABLE users ADD COLUMN role_source TEXT NOT NULL DEFAULT 'setup'
          CHECK (role_source IN ('setup', 'directory'));
        CREATE UNIQUE INDEX idx_users_oidc ON users(oidc_issuer, oidc_sub);

        -- Each browser or app install a user signs in from.
        CREATE TABLE devices (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind         TEXT NOT NULL CHECK (kind IN ('web', 'android')),
          name         TEXT NOT NULL,
          created_at   INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        );
        CREATE INDEX idx_devices_user_id ON devices(user_id);

        -- Every session now belongs to a device; nothing is deployed, so old rows go.
        DROP TABLE sessions;
        CREATE TABLE sessions (
          id_hash    TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL CHECK (kind IN ('cookie', 'bearer')),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX idx_sessions_device_id ON sessions(device_id);

        -- One sign-in in flight: only the state's hash, for ten minutes. A web sign-in also keeps
        -- the hash of the binding cookie that ties it to the browser that started it.
        CREATE TABLE login_requests (
          state_hash    TEXT PRIMARY KEY,
          binding_hash  TEXT,
          nonce         TEXT NOT NULL,
          verifier      TEXT NOT NULL,
          client        TEXT NOT NULL CHECK (client IN ('web', 'android')),
          return_to     TEXT NOT NULL,
          app_challenge TEXT,
          device_id     TEXT,
          expires_at    INTEGER NOT NULL
        );

        -- The one-time code the app swaps for its bearer token, bound to its PKCE challenge.
        CREATE TABLE app_codes (
          code_hash     TEXT PRIMARY KEY,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          app_challenge TEXT NOT NULL,
          expires_at    INTEGER NOT NULL
        );

        -- Each person's own account on each upstream. The unique pair means two Auralis users
        -- can never hold one upstream account.
        CREATE TABLE upstream_links (
          user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          service          TEXT NOT NULL CHECK (service IN ('abs', 'jellyfin')),
          upstream_user_id TEXT,
          token_ciphertext TEXT,
          upstream_key_id  TEXT,
          state            TEXT NOT NULL CHECK (state IN ('linked', 'unlinked', 'stale', 'error')),
          detail           TEXT,
          updated_at       INTEGER NOT NULL,
          PRIMARY KEY (user_id, service),
          UNIQUE (service, upstream_user_id)
        );
      `);
    },
  },
  {
    id: 3,
    name: 'abs_created',
    up: (db) => {
      db.exec(`
        -- Whether Auralis created this upstream account itself (a missing Audiobookshelf account,
        -- made at the person's first sign-in), rather than finding it.
        ALTER TABLE upstream_links ADD COLUMN created_by_auralis INTEGER NOT NULL DEFAULT 0
          CHECK (created_by_auralis IN (0, 1));
      `);
    },
  },
  {
    id: 4,
    name: 'app_state',
    up: (db) => {
      db.exec(`
        -- The app's own state for its sign-in, handed back to it with the one-time code.
        ALTER TABLE login_requests ADD COLUMN app_state TEXT;
      `);
    },
  },
  {
    id: 5,
    name: 'library_index',
    up: (db) => {
      db.exec(`
        -- The household's Audiobookshelf and Jellyfin libraries, mirrored by the index job. Files
        -- are stored once for everyone, so nothing here belongs to one person. A row is keyed like
        -- a MediaRef; an episode or track points at its show or album and goes with it.
        CREATE TABLE index_items (
          source           TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id      TEXT NOT NULL,
          kind             TEXT NOT NULL
            CHECK (kind IN ('book', 'show', 'episode', 'album', 'track')),
          parent_id        TEXT,
          library_id       TEXT,
          title            TEXT NOT NULL,
          creators         TEXT NOT NULL,
          series           TEXT NOT NULL,
          genres           TEXT NOT NULL,
          position         INTEGER,
          disc             INTEGER,
          duration         REAL,
          year             INTEGER,
          published_at     INTEGER,
          upstream_version TEXT,
          -- A hash of everything above: a row is written only when it changes, and then its
          -- version goes up by one and updated_at moves.
          content_hash     TEXT NOT NULL,
          version          INTEGER NOT NULL,
          created_at       INTEGER NOT NULL,
          updated_at       INTEGER NOT NULL,
          PRIMARY KEY (source, upstream_id),
          FOREIGN KEY (source, parent_id)
            REFERENCES index_items(source, upstream_id) ON DELETE CASCADE
        );
        CREATE INDEX idx_index_items_parent ON index_items(source, parent_id);
        CREATE INDEX idx_index_items_kind_title ON index_items(kind, title);

        -- External ids by scheme (asin, feed_url, musicbrainz_album, ...), for matching.
        CREATE TABLE index_ids (
          source      TEXT NOT NULL,
          upstream_id TEXT NOT NULL,
          scheme      TEXT NOT NULL,
          value       TEXT NOT NULL,
          PRIMARY KEY (source, upstream_id, scheme),
          FOREIGN KEY (source, upstream_id)
            REFERENCES index_items(source, upstream_id) ON DELETE CASCADE
        );
        CREATE INDEX idx_index_ids_value ON index_ids(scheme, value);

        -- When each top-level item's full answer was last read, and the change marker it had.
        CREATE TABLE index_sync (
          source           TEXT NOT NULL,
          upstream_id      TEXT NOT NULL,
          upstream_version TEXT,
          checked_at       INTEGER NOT NULL,
          PRIMARY KEY (source, upstream_id),
          FOREIGN KEY (source, upstream_id)
            REFERENCES index_items(source, upstream_id) ON DELETE CASCADE
        );

        -- One row per run of the job and source, for the admin jobs page.
        CREATE TABLE index_runs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          started_at  INTEGER NOT NULL,
          finished_at INTEGER NOT NULL,
          complete    INTEGER NOT NULL CHECK (complete IN (0, 1)),
          error       TEXT,
          fetched     INTEGER NOT NULL,
          inserted    INTEGER NOT NULL,
          updated     INTEGER NOT NULL,
          unchanged   INTEGER NOT NULL,
          removed     INTEGER NOT NULL
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
