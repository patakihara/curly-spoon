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
  {
    id: 9,
    name: 'index_has_art',
    up: (db) => {
      db.exec(`
        -- Whether the upstream has art for a book, show or album: only those get an art link.
        -- Every item is read again on the next run to fill it in.
        ALTER TABLE index_items ADD COLUMN has_art INTEGER NOT NULL DEFAULT 0;
        DELETE FROM index_sync;
      `);
    },
  },
  {
    id: 10,
    name: 'search_index',
    up: (db) => {
      const fts5 = db.prepare("SELECT 1 FROM pragma_module_list WHERE name = 'fts5'").get();
      if (fts5 === undefined) throw new Error('search needs SQLite built with FTS5');
      db.exec(`
        -- Each indexed row's searchable text: the words of its title, people and series, its
        -- kind, and the artists, authors and series it names (JSON), written by the index's own
        -- code (search/items.ts), which also fills in rows missing or written by an older fold
        -- when the database opens. Its own id is the full-text row id: index_items' rowid can
        -- change on VACUUM. It goes with its index row.
        CREATE TABLE search_items (
          id           INTEGER PRIMARY KEY,
          source       TEXT NOT NULL,
          upstream_id  TEXT NOT NULL,
          kind         TEXT NOT NULL,
          title        TEXT NOT NULL,
          people       TEXT NOT NULL,
          series       TEXT NOT NULL,
          names        TEXT NOT NULL,
          text_version INTEGER NOT NULL,
          UNIQUE (source, upstream_id),
          FOREIGN KEY (source, upstream_id)
            REFERENCES index_items(source, upstream_id) ON DELETE CASCADE
        );
        -- Titles starting with a query's words, the first tiers of a search, read off this index;
        -- with kind and ref, suggestions group a title's rows by kind in its order.
        CREATE INDEX idx_search_items_title ON search_items(title, kind, source, upstream_id);

        -- Words of the folded text, and their two- and three-letter prefixes. The text is folded
        -- already, so the tokenizer only splits it into words.
        CREATE VIRTUAL TABLE search_fts USING fts5(
          title, people, series,
          content = 'search_items', content_rowid = 'id',
          tokenize = 'unicode61 remove_diacritics 0', prefix = '2 3'
        );
        CREATE TRIGGER search_items_insert AFTER INSERT ON search_items BEGIN
          INSERT INTO search_fts (rowid, title, people, series)
            VALUES (new.id, new.title, new.people, new.series);
        END;
        CREATE TRIGGER search_items_delete AFTER DELETE ON search_items BEGIN
          INSERT INTO search_fts (search_fts, rowid, title, people, series)
            VALUES ('delete', old.id, old.title, old.people, old.series);
        END;
        -- Only when the words change: a row rewritten at a new version with the same words
        -- keeps its full-text entry.
        CREATE TRIGGER search_items_update AFTER UPDATE ON search_items
        WHEN old.title <> new.title OR old.people <> new.people OR old.series <> new.series
        BEGIN
          INSERT INTO search_fts (search_fts, rowid, title, people, series)
            VALUES ('delete', old.id, old.title, old.people, old.series);
          INSERT INTO search_fts (rowid, title, people, series)
            VALUES (new.id, new.title, new.people, new.series);
        END;
      `);
    },
  },
  {
    id: 11,
    name: 'recent_searches',
    up: (db) => {
      db.exec(`
        -- Each person's recent searches, shared by their devices: one per search words, in the
        -- form last typed. Only the newest are kept (store/recentSearches.ts).
        CREATE TABLE recent_searches (
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          words       TEXT NOT NULL,
          query       TEXT NOT NULL,
          searched_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, words)
        );
      `);
    },
  },
  {
    id: 12,
    name: 'index_has_lyrics',
    up: (db) => {
      db.exec(`
        -- Whether Jellyfin holds lyrics for a track, so lyrics are asked of it only then. Every
        -- item is read again on the next run to fill it in.
        ALTER TABLE index_items ADD COLUMN has_lyrics INTEGER NOT NULL DEFAULT 0;
        DELETE FROM index_sync;
      `);
    },
  },
  {
    id: 13,
    name: 'lyrics',
    up: (db) => {
      db.exec(`
        -- Each track's lyrics as last resolved, shared by the household like the index
        -- (store/lyrics.ts). origin is null exactly when status is none; lines is JSON
        -- [{start: seconds | null, text}], [] for instrumental and none. item_version is the
        -- track's index version the answer was resolved for.
        CREATE TABLE lyrics (
          source       TEXT NOT NULL,
          upstream_id  TEXT NOT NULL,
          status       TEXT NOT NULL CHECK (status IN ('synced', 'plain', 'instrumental', 'none')),
          origin       TEXT CHECK (origin IN ('jellyfin', 'lrclib')),
          lines        TEXT NOT NULL,
          lrclib_id    INTEGER,
          item_version INTEGER NOT NULL,
          resolved_at  INTEGER NOT NULL,
          PRIMARY KEY (source, upstream_id),
          FOREIGN KEY (source, upstream_id)
            REFERENCES index_items (source, upstream_id) ON DELETE CASCADE,
          CHECK ((origin IS NULL) = (status = 'none'))
        );
      `);
    },
  },
  {
    id: 14,
    name: 'lists',
    up: (db) => {
      db.exec(`
        -- Each person's lists that aren't queues (store/lists.ts): listening lists, podcast
        -- playlists and digests. all_shows marks The Digest, the one digest over every
        -- subscription, one per person; play_order is a digest's, oldest or newest first.
        CREATE TABLE lists (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL CHECK (kind IN ('listening', 'playlist', 'digest')),
          name       TEXT NOT NULL,
          all_shows  INTEGER NOT NULL DEFAULT 0 CHECK (all_shows IN (0, 1)),
          play_order TEXT CHECK (play_order IN ('oldest', 'newest')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          CHECK ((play_order IS NOT NULL) = (kind = 'digest')),
          CHECK (all_shows = 0 OR kind = 'digest')
        );
        CREATE INDEX idx_lists_user_id ON lists(user_id);
        CREATE UNIQUE INDEX idx_lists_the_digest ON lists(user_id) WHERE all_shows = 1;

        -- A list's entries in order, or a custom digest's shows. No key into the index: an entry
        -- the index no longer holds is left out on read, so a re-index never loses it.
        CREATE TABLE list_items (
          list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
          ord         INTEGER NOT NULL CHECK (ord >= 0),
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id TEXT NOT NULL,
          PRIMARY KEY (list_id, ord)
        );

        -- Episodes Auralis marked played for a person (a digest's, as it moves on), and when:
        -- one newer than the upstream's own progress hides the episode from lists. Until the
        -- upstream has taken the mark (confirmed), it hides the episode whatever the upstream says.
        -- sent_at is when it was last sent there, and failures how many sends it refused.
        CREATE TABLE played_marks (
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source      TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          upstream_id TEXT NOT NULL,
          marked_at   INTEGER NOT NULL,
          confirmed   INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
          sent_at     INTEGER,
          failures    INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
          PRIMARY KEY (user_id, source, upstream_id)
        );

        -- The spoken queues a device put aside on entering a digest's queue: owner is '' for
        -- your own queue, or the digest's id for a digest's. queue is a SessionQueue and
        -- autoplay the queue's autoplay pick or null, both JSON, read back through zod.
        CREATE TABLE saved_queues (
          device_id TEXT NOT NULL REFERENCES listening_sessions(device_id) ON DELETE CASCADE,
          owner     TEXT NOT NULL,
          queue     TEXT NOT NULL,
          autoplay  TEXT,
          saved_at  INTEGER NOT NULL,
          PRIMARY KEY (device_id, owner)
        );

        -- The digest whose queue the spoken queue is now, or null for your own.
        ALTER TABLE listening_sessions ADD COLUMN spoken_digest TEXT
          REFERENCES lists(id) ON DELETE SET NULL;

        -- The digest a play was played in, or null. It outlives the digest: a digest's plays
        -- never move your place in a show, even once the digest is gone.
        ALTER TABLE play_history ADD COLUMN list_id TEXT;

        -- The digest whose rule put a queue entry there, or null: only those entries play as
        -- the digest's. Cleared when the digest is deleted.
        ALTER TABLE queue_items ADD COLUMN list_id TEXT;
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
