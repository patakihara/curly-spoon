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

        -- The upstream API token, AES-256-GCM-encrypted (db/crypto.ts). One per user at the
        -- time this migration was written; migration 5 below recreates this table with a
        -- composite (user_id, upstream) primary key, so a user can hold one token per
        -- upstream. Left as originally written here — this is what ran on every existing
        -- installation before migration 5 fixed it, and migration 5's own comment explains
        -- why and how.
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
  {
    id: 3,
    name: 'jellyfin-secrets',
    up: (db) => {
      db.exec(`
        -- Per-user Jellyfin access token, encrypted at rest (db/crypto.ts) — see
        -- db/jellyfinSecretsRepo.ts's file comment for why this is a new, additive table
        -- rather than a row in \`secrets\`: Jellyfin authenticates per account, same as
        -- Audiobookshelf, so the credential belongs to whoever signed in (not the
        -- installation, which is why it isn't in \`provider_configs\` either — that table's
        -- \`kind\` column is typed to the request-pipeline's two provider roles and
        -- represents a genuinely different kind of thing). \`secrets\` itself is left
        -- untouched: its schema only ever supported one credential per user
        -- (\`PRIMARY KEY (user_id)\`), and it is the read path every Audiobookshelf-backed
        -- request goes through — widening it is a real schema migration with an
        -- untestable (always-empty, in this harness) data-copy step, for no benefit over
        -- a second table scoped to exactly what's new here.
        CREATE TABLE IF NOT EXISTS jellyfin_secrets (
          user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          ciphertext TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 4,
    name: 'request-media-type',
    up: (db) => {
      db.exec(`
        -- Distinguishes a music request from a book request in the shared \`requests\`
        -- table. A sibling table was the other option and was rejected: every existing
        -- column (status, status_detail, indexer_id, client_id, download_handle, progress,
        -- the timestamps) means the same thing for both media types and would otherwise be
        -- duplicated verbatim in a second repo/table for zero benefit — unlike migration 3's
        -- \`jellyfin_secrets\`, which really is a different row shape under a different
        -- uniqueness constraint. \`DEFAULT 'book'\` on a NOT NULL column is what makes this
        -- safe on a database that already has rows: SQLite backfills the default into every
        -- existing row as part of the ALTER, so every request written before this migration
        -- stays exactly what it already was.
        ALTER TABLE requests ADD COLUMN media_type TEXT NOT NULL DEFAULT 'book';

        -- The music pipeline's frozen choice, parallel to \`release_json\` for books (see
        -- migration 2's comment on that column). Deliberately a second column rather than
        -- reusing \`release_json\`: a \`MusicCandidate\` (requests/types.ts) is a materially
        -- different shape from a \`Release\` — no seeders, no magnet URI, a peer username
        -- instead of an indexer id — and storing one under the other's name/type would be
        -- exactly the kind of type lie this codebase's house rules (no \`any\` to dodge a
        -- type error) exist to prevent. NULL for every book row, and for a music row before
        -- a candidate has been chosen.
        ALTER TABLE requests ADD COLUMN candidate_json TEXT;

        CREATE INDEX IF NOT EXISTS idx_requests_media_type ON requests(media_type);
      `);
    },
  },
  {
    id: 5,
    name: 'secrets-composite-key',
    up: (db) => {
      // `secrets` was `PRIMARY KEY (user_id)` alone, even though `setUpstreamToken` already
      // took an `upstream` parameter — a promise the schema couldn't keep: storing a second
      // upstream's token for the same user silently clobbered the first via
      // `ON CONFLICT(user_id)`. The key becomes `(user_id, upstream)` so one user can hold a
      // token per upstream, matching the parameter that was already there.
      //
      // SQLite can't ALTER a PRIMARY KEY in place, so this is the standard
      // create-new/copy/drop/rename dance, wrapped in a transaction so a failure partway
      // leaves the original `secrets` table intact rather than half-migrated. Every existing
      // row carries a real `upstream` value already (`NOT NULL` since migration 1), so the
      // copy is a straight `INSERT ... SELECT` — no backfill needed, unlike migration 4's
      // `ALTER ... DEFAULT`.
      db.transaction(() => {
        db.exec(`
          CREATE TABLE secrets_new (
            user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            upstream   TEXT NOT NULL,
            ciphertext TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, upstream)
          );

          INSERT INTO secrets_new (user_id, upstream, ciphertext, updated_at)
            SELECT user_id, upstream, ciphertext, updated_at FROM secrets;

          DROP TABLE secrets;

          ALTER TABLE secrets_new RENAME TO secrets;
        `);
      })();
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
