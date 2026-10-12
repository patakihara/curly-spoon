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
  {
    id: 6,
    name: 'episode_order',
    up: (db) => {
      db.exec(`
        -- A show's episode order, from its feed's itunes:type: oldest first when serial, newest
        -- first when episodic; unknown, played newest first, until a read of its feed succeeds.
        -- Null on every row but a show.
        ALTER TABLE index_items ADD COLUMN episode_order TEXT
          CHECK (episode_order IN ('serial', 'episodic', 'unknown'));

        -- Feeds the index could not read, per run.
        ALTER TABLE index_runs ADD COLUMN feeds_failed INTEGER NOT NULL DEFAULT 0;

        -- Every show is read again on the next run, so its order and its episodes' dates come
        -- from its feed.
        DELETE FROM index_sync WHERE (source, upstream_id) IN
          (SELECT source, upstream_id FROM index_items WHERE kind = 'show');
      `);
    },
  },
  {
    id: 7,
    name: 'listening_sessions',
    up: (db) => {
      db.exec(`
        -- What plays on one device, made on its first use and gone with the device. ('sessions'
        -- are sign-in sessions.) The queue the controls drive, the queue to land on once the
        -- current item ends, and the queue style, set here until settings are kept per user.
        -- rev goes up on every write; a write from an older rev is refused.
        CREATE TABLE listening_sessions (
          device_id            TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
          user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          active               TEXT NOT NULL CHECK (active IN ('music', 'spoken')),
          switch_after_current TEXT CHECK (switch_after_current IN ('music', 'spoken')),
          queue_style          TEXT NOT NULL DEFAULT 'youtube'
            CHECK (queue_style IN ('youtube', 'spotify')),
          rev                  INTEGER NOT NULL CHECK (rev >= 0),
          updated_at           INTEGER NOT NULL,
          -- The track music's radio run was asked for; its tracks are in radio_tracks.
          radio_seed_source    TEXT CHECK (radio_seed_source IN ('abs', 'jellyfin')),
          radio_seed_id        TEXT,
          -- When autoplay's picks were last worked out (ms); NULL until they first are.
          autoplay_at          INTEGER,
          CHECK ((radio_seed_source IS NULL) = (radio_seed_id IS NULL))
        );
        CREATE INDEX idx_listening_sessions_user_id ON listening_sessions(user_id);

        -- Each queue's entries: its current item (at most one, kept while the queue is paused),
        -- your queue, and what is left of Spotify style's playing-from. chapter says which
        -- entry of a book this is. The current item carries the device's last position in it,
        -- in ms, and when that was taken; an item of your queue keeps the one it had when it
        -- was last current. walk marks the entries of a walk Back started, which Forward
        -- plays first, in queue order (across the two queues, lowest first); replay_of is the
        -- play (play_history seq) an entry plays again, which ending it does not record twice;
        -- after, on a current item, is the play that played immediately before it.
        CREATE TABLE queue_items (
          device_id   TEXT NOT NULL REFERENCES listening_sessions(device_id) ON DELETE CASCADE,
          queue       TEXT NOT NULL CHECK (queue IN ('music', 'spoken')),
          segment     TEXT NOT NULL CHECK (segment IN ('current', 'user', 'context')),
          ord         INTEGER NOT NULL CHECK (ord >= 0),
          item_id     TEXT NOT NULL,
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id TEXT NOT NULL,
          chapter     INTEGER CHECK (chapter >= 0),
          position_ms INTEGER CHECK (position_ms >= 0),
          position_at INTEGER,
          walk        INTEGER,
          replay_of   INTEGER CHECK (replay_of >= 0),
          after       INTEGER CHECK (after >= 0),
          PRIMARY KEY (device_id, queue, segment, ord),
          UNIQUE (device_id, item_id),
          CHECK (segment <> 'current' OR ord = 0),
          CHECK ((position_ms IS NULL) = (position_at IS NULL)),
          CHECK (segment = 'user' OR walk IS NULL),
          CHECK (segment = 'current' OR after IS NULL),
          CHECK (segment <> 'context' OR (position_ms IS NULL AND replay_of IS NULL))
        );

        -- The album, playlist, show or book a queue plays from, kept on the session once its
        -- list runs out: autoplay continues from it.
        CREATE TABLE playing_from (
          device_id   TEXT NOT NULL REFERENCES listening_sessions(device_id) ON DELETE CASCADE,
          queue       TEXT NOT NULL CHECK (queue IN ('music', 'spoken')),
          kind        TEXT NOT NULL CHECK (kind IN ('album', 'playlist', 'show', 'book')),
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id TEXT NOT NULL,
          PRIMARY KEY (device_id, queue)
        );

        -- What each device played, for Back; append-only, and only the newest plays are kept.
        -- after is the play each one followed, so Back retraces the order things played.
        CREATE TABLE play_history (
          device_id   TEXT NOT NULL REFERENCES listening_sessions(device_id) ON DELETE CASCADE,
          seq         INTEGER NOT NULL CHECK (seq >= 0),
          queue       TEXT NOT NULL CHECK (queue IN ('music', 'spoken')),
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id TEXT NOT NULL,
          chapter     INTEGER CHECK (chapter >= 0),
          played_at   INTEGER NOT NULL,
          after       INTEGER CHECK (after >= 0),
          PRIMARY KEY (device_id, seq)
        );

        -- Autoplay's pick for each queue, worked out ahead from the item it follows (after_*),
        -- so a step never waits on an upstream: what plays once that item ends with nothing
        -- queued after it. No source when nothing is left.
        CREATE TABLE autoplay_picks (
          device_id         TEXT NOT NULL
            REFERENCES listening_sessions(device_id) ON DELETE CASCADE,
          queue             TEXT NOT NULL CHECK (queue IN ('music', 'spoken')),
          after_source      TEXT NOT NULL CHECK (after_source IN ('abs', 'jellyfin')),
          after_upstream_id TEXT NOT NULL,
          after_chapter     INTEGER CHECK (after_chapter >= 0),
          source            TEXT CHECK (source IN ('abs', 'jellyfin')),
          upstream_id       TEXT,
          chapter           INTEGER CHECK (chapter >= 0),
          PRIMARY KEY (device_id, queue),
          CHECK ((source IS NULL) = (upstream_id IS NULL)),
          CHECK (source IS NOT NULL OR chapter IS NULL)
        );

        -- Music's radio run: the tracks Instant Mix answered for the session's radio seed, in
        -- its order, kept until every one has played.
        CREATE TABLE radio_tracks (
          device_id   TEXT NOT NULL REFERENCES listening_sessions(device_id) ON DELETE CASCADE,
          ord         INTEGER NOT NULL CHECK (ord >= 0),
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id TEXT NOT NULL,
          PRIMARY KEY (device_id, ord)
        );
      `);
    },
  },
  {
    id: 8,
    name: 'jellyfin_library',
    up: (db) => {
      db.exec(`
        -- Jellyfin albums are paged per music library, and each album and track keeps its
        -- library's id, as Audiobookshelf items do: a person's lists hold only the libraries they
        -- may see. Every album, with its tracks, is read again on the next run to fill it in.
        DELETE FROM index_sync WHERE source = 'jellyfin';
        CREATE INDEX idx_index_items_kind_library ON index_items(kind, library_id);
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
