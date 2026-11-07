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
        -- current item ends, and the queue style, which migration 15 moves to user_settings.
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
  {
    id: 15,
    name: 'user_settings',
    up: (db) => {
      db.exec(`
        -- Each person's settings (store/settings.ts), one row per person, none until they change
        -- one: a person with no row has the defaults. The autoplay switches are per queue. The
        -- queue style is always written, so it has no default here.
        CREATE TABLE user_settings (
          user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          theme           TEXT NOT NULL DEFAULT 'system'
                            CHECK (theme IN ('system', 'light', 'dark')),
          queue_style     TEXT NOT NULL CHECK (queue_style IN ('youtube', 'spotify')),
          autoplay_music  INTEGER NOT NULL DEFAULT 1 CHECK (autoplay_music IN (0, 1)),
          autoplay_spoken INTEGER NOT NULL DEFAULT 1 CHECK (autoplay_spoken IN (0, 1)),
          first_run_done  INTEGER NOT NULL DEFAULT 0 CHECK (first_run_done IN (0, 1)),
          updated_at      INTEGER NOT NULL
        );

        -- The queue style was each device's own: each person keeps the one of the session they
        -- changed last, and the sessions read it from here from now on.
        INSERT INTO user_settings (user_id, queue_style, updated_at)
          SELECT user_id, queue_style, updated_at FROM (
            SELECT user_id, queue_style, updated_at, row_number() OVER (
              PARTITION BY user_id ORDER BY updated_at DESC, device_id
            ) AS newest
            FROM listening_sessions
          ) WHERE newest = 1;
        ALTER TABLE listening_sessions DROP COLUMN queue_style;
      `);
    },
  },
  {
    id: 16,
    name: 'requests',
    up: (db) => {
      db.exec(`
        -- Requests (store/requests.ts): what is being got onto the household's servers, where
        -- it stands, and what its medium's steps keep. The release, candidates and download
        -- handle stay on the server; a client sees a candidate's id. step_key is the idempotency
        -- key of a step under way; version counts saves, so a save after a wait can tell that
        -- the row moved on.
        CREATE TABLE requests (
          id            TEXT PRIMARY KEY,
          medium        TEXT NOT NULL CHECK (medium IN ('book', 'album', 'song', 'podcast')),
          target        TEXT NOT NULL,
          status        TEXT NOT NULL CHECK (status IN ('requested', 'searching', 'needsChoice',
                          'queued', 'downloading', 'importing', 'inLibrary', 'failed')),
          failed_step   TEXT CHECK (failed_step IN ('requested', 'searching', 'needsChoice',
                          'queued', 'downloading', 'importing')),
          reason        TEXT CHECK (reason IN ('noRelease', 'searchFailed', 'downloadFailed',
                          'importFailed', 'notIndexed', 'cancelledUpstream')),
          progress      REAL CHECK (progress BETWEEN 0 AND 1),
          release       TEXT,
          candidates    TEXT NOT NULL DEFAULT '[]',
          handle        TEXT,
          step_key      TEXT,
          version       INTEGER NOT NULL DEFAULT 0,
          result_source TEXT CHECK (result_source IN ('abs', 'jellyfin')),
          result_id     TEXT,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          CHECK ((failed_step IS NOT NULL) = (status = 'failed')),
          CHECK ((reason IS NOT NULL) = (status = 'failed')),
          CHECK ((progress IS NOT NULL) = (status = 'downloading')),
          CHECK ((result_source IS NULL) = (result_id IS NULL)),
          CHECK (status <> 'inLibrary' OR result_id IS NOT NULL)
        );
        CREATE INDEX idx_requests_working ON requests(status)
          WHERE status NOT IN ('inLibrary', 'failed');

        -- Every catalogue id a live request holds, one row each: a second person's request
        -- sharing any of them joins it. A request in the library lets go of its ids, which then
        -- only find it there, as nothing joins what has arrived.
        CREATE TABLE request_keys (
          medium     TEXT NOT NULL,
          key        TEXT NOT NULL,
          request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
          PRIMARY KEY (medium, key)
        );
        CREATE INDEX idx_request_keys_request ON request_keys(request_id);
        CREATE TABLE arrived_keys (
          medium     TEXT NOT NULL,
          key        TEXT NOT NULL,
          request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
          PRIMARY KEY (medium, key, request_id)
        );
        CREATE INDEX idx_arrived_keys_request ON arrived_keys(request_id);
        CREATE TRIGGER requests_in_library AFTER UPDATE OF status ON requests
          WHEN NEW.status = 'inLibrary'
          BEGIN
            INSERT OR IGNORE INTO arrived_keys (medium, key, request_id)
              SELECT medium, key, request_id FROM request_keys WHERE request_id = NEW.id;
            DELETE FROM request_keys WHERE request_id = NEW.id;
          END;

        -- Everyone on a request: who made it and who joined it. A request nobody is on any
        -- longer goes with its last person.
        CREATE TABLE request_people (
          request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at  INTEGER NOT NULL,
          PRIMARY KEY (request_id, user_id)
        );
        CREATE INDEX idx_request_people_user ON request_people(user_id);
        CREATE TRIGGER request_people_last_left AFTER DELETE ON request_people
          WHEN NOT EXISTS (SELECT 1 FROM request_people WHERE request_id = OLD.request_id)
          BEGIN DELETE FROM requests WHERE id = OLD.request_id; END;
      `);
    },
  },
  {
    id: 17,
    name: 'library_claims',
    up: (db) => {
      db.exec(`
        -- The record of who added what behind each person's own library (store/claims.ts). It
        -- names an item, not a device or a request, so it outlives both.
        CREATE TABLE library_claims (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source     TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          item_id    TEXT NOT NULL,
          reason     TEXT NOT NULL CHECK (reason IN ('requested', 'added', 'subscribed', 'played')),
          created_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, source, item_id)
        );

        -- Whether a person's library shows everything the household has, not just their own.
        ALTER TABLE user_settings
          ADD COLUMN show_everyone INTEGER NOT NULL DEFAULT 0 CHECK (show_everyone IN (0, 1));
      `);
    },
  },
  {
    id: 18,
    name: 'held_progress',
    up: (db) => {
      db.exec(`
        -- Where a person is on a household play, which no upstream account hears of
        -- (store/heldProgress.ts). item_id is the book's or the episode's own id.
        CREATE TABLE held_progress (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source     TEXT NOT NULL CHECK (source IN ('abs', 'jellyfin')),
          item_id    TEXT NOT NULL,
          position   REAL NOT NULL CHECK (position >= 0),
          duration   REAL NOT NULL CHECK (duration >= 0),
          finished   INTEGER NOT NULL CHECK (finished IN (0, 1)),
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, source, item_id)
        );
      `);
    },
  },
  {
    id: 19,
    name: 'held_bookmarks',
    up: (db) => {
      db.exec(`
        -- A person's bookmark on a book their own Audiobookshelf account does not reach, kept
        -- here until it does (store/heldBookmarks.ts). time is seconds from the item's start.
        CREATE TABLE held_bookmarks (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_id    TEXT NOT NULL,
          time       REAL NOT NULL CHECK (time >= 0),
          title      TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, item_id, time)
        );
      `);
    },
  },
  {
    id: 20,
    name: 'request_stall',
    up: (db) => {
      // A CHECK cannot be altered, so the table is built again. Dropping it empties what refers to
      // it (foreign keys stay on in a migration's transaction), so those rows are carried across,
      // and the trigger naming it comes off until it is back.
      db.exec(`
        CREATE TEMP TABLE keep_request_keys AS SELECT * FROM request_keys;
        CREATE TEMP TABLE keep_arrived_keys AS SELECT * FROM arrived_keys;
        CREATE TEMP TABLE keep_request_people AS SELECT * FROM request_people;
        DROP TRIGGER request_people_last_left;

        -- progress_at is when a download's bytes were last seen to move, which times a stall.
        CREATE TABLE requests_rebuilt (
          id            TEXT PRIMARY KEY,
          medium        TEXT NOT NULL CHECK (medium IN ('book', 'album', 'song', 'podcast')),
          target        TEXT NOT NULL,
          status        TEXT NOT NULL CHECK (status IN ('requested', 'searching', 'needsChoice',
                          'queued', 'downloading', 'importing', 'inLibrary', 'failed')),
          failed_step   TEXT CHECK (failed_step IN ('requested', 'searching', 'needsChoice',
                          'queued', 'downloading', 'importing')),
          reason        TEXT CHECK (reason IN ('noRelease', 'searchFailed', 'downloadFailed',
                          'downloadStalled', 'importFailed', 'notIndexed', 'cancelledUpstream')),
          progress      REAL CHECK (progress BETWEEN 0 AND 1),
          release       TEXT,
          candidates    TEXT NOT NULL DEFAULT '[]',
          handle        TEXT,
          step_key      TEXT,
          version       INTEGER NOT NULL DEFAULT 0,
          result_source TEXT CHECK (result_source IN ('abs', 'jellyfin')),
          result_id     TEXT,
          progress_at   INTEGER,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          CHECK ((failed_step IS NOT NULL) = (status = 'failed')),
          CHECK ((reason IS NOT NULL) = (status = 'failed')),
          CHECK ((progress IS NOT NULL) = (status = 'downloading')),
          CHECK ((result_source IS NULL) = (result_id IS NULL)),
          CHECK (status <> 'inLibrary' OR result_id IS NOT NULL)
        );
        INSERT INTO requests_rebuilt (id, medium, target, status, failed_step, reason, progress,
            release, candidates, handle, step_key, version, result_source, result_id, created_at,
            updated_at)
          SELECT id, medium, target, status, failed_step, reason, progress, release, candidates,
            handle, step_key, version, result_source, result_id, created_at, updated_at
          FROM requests;
        DROP TABLE requests;
        ALTER TABLE requests_rebuilt RENAME TO requests;
        CREATE INDEX idx_requests_working ON requests(status)
          WHERE status NOT IN ('inLibrary', 'failed');
        CREATE TRIGGER requests_in_library AFTER UPDATE OF status ON requests
          WHEN NEW.status = 'inLibrary'
          BEGIN
            INSERT OR IGNORE INTO arrived_keys (medium, key, request_id)
              SELECT medium, key, request_id FROM request_keys WHERE request_id = NEW.id;
            DELETE FROM request_keys WHERE request_id = NEW.id;
          END;

        DELETE FROM request_keys;
        DELETE FROM arrived_keys;
        DELETE FROM request_people;
        INSERT INTO request_keys SELECT * FROM keep_request_keys;
        INSERT INTO arrived_keys SELECT * FROM keep_arrived_keys;
        INSERT INTO request_people SELECT * FROM keep_request_people;
        DROP TABLE keep_request_keys;
        DROP TABLE keep_arrived_keys;
        DROP TABLE keep_request_people;
        CREATE TRIGGER request_people_last_left AFTER DELETE ON request_people
          WHEN NOT EXISTS (SELECT 1 FROM request_people WHERE request_id = OLD.request_id)
          BEGIN DELETE FROM requests WHERE id = OLD.request_id; END;
      `);
    },
  },
  {
    id: 21,
    name: 'request_held_since',
    up: (db) => {
      // held_since is when an upstream a request's step needs stopped answering, which times a hold.
      db.exec('ALTER TABLE requests ADD COLUMN held_since INTEGER;');
    },
  },
  {
    id: 22,
    name: 'request_auto_starts',
    up: (db) => {
      // auto_starts counts the releases the job started by itself after a stall, which it caps.
      db.exec('ALTER TABLE requests ADD COLUMN auto_starts INTEGER NOT NULL DEFAULT 0;');
    },
  },
  {
    id: 23,
    name: 'stream_cache',
    up: (db) => {
      // A streamed track's held bytes, in fixed chunks of one sparse file. A chunk's bit is set only
      // once all of it is on disk. bytes counts the set chunks. pinned is kept out of eviction.
      db.exec(`
        CREATE TABLE stream_cache (
          id        TEXT PRIMARY KEY,
          itag      INTEGER NOT NULL,
          size      INTEGER NOT NULL CHECK (size > 0),
          mime      TEXT NOT NULL CHECK (mime LIKE 'audio/%'),
          duration  REAL NOT NULL,
          chunks    BLOB NOT NULL,
          bytes     INTEGER NOT NULL DEFAULT 0,
          last_used INTEGER NOT NULL,
          pinned    INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX stream_cache_last_used ON stream_cache (last_used);
      `);
    },
  },
  {
    id: 24,
    name: 'queues_take_a_streamed_song',
    up: (db) => {
      // A streamed song sits in a queue, its history and autoplay like any other, so these tables'
      // checks learn its source. SQLite changes a check only by rebuilding the table. A migration
      // runs in a transaction, where foreign keys cannot be turned off, and dropping
      // listening_sessions cascades into whatever still points at it, so each table is rebuilt
      // beside the old one, every child (saved_queues too, whose check needs no change) is dropped
      // first, and listening_sessions last, by when no row points at it.
      const children = [
        'queue_items',
        'playing_from',
        'play_history',
        'autoplay_picks',
        'radio_tracks',
        'saved_queues',
      ];
      const tables = ['listening_sessions', ...children];
      const definition = db.prepare<[string, string], { sql: string }>(
        'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
      );
      const indexes = db
        .prepare<[], { sql: string }>(
          `SELECT sql FROM sqlite_master
           WHERE type = 'index' AND sql IS NOT NULL
             AND tbl_name IN (${tables.map((t) => `'${t}'`).join(', ')})`,
        )
        .all();
      for (const table of tables) {
        const { sql } = definition.get('table', table)!;
        db.exec(
          sql
            .replace(`CREATE TABLE ${table} `, `CREATE TABLE ${table}_new `)
            .replaceAll('REFERENCES listening_sessions(', 'REFERENCES listening_sessions_new(')
            .replaceAll("IN ('abs', 'jellyfin')", "IN ('abs', 'jellyfin', 'ytmusic')"),
        );
        db.exec(`INSERT INTO ${table}_new SELECT * FROM ${table}`);
      }
      for (const table of [...children, 'listening_sessions']) db.exec(`DROP TABLE ${table}`);
      for (const table of tables) db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
      for (const index of indexes) db.exec(index.sql);
    },
  },
  {
    id: 25,
    name: 'extractor_versions',
    up: (db) => {
      // What the extractor's daily canary said of each version. One is promoted (in use), the last
      // passing one before it kept, and one that failed stays named with its reason. The image's own
      // version has its row once a canary has run on it.
      db.exec(`
        CREATE TABLE extractor_versions (
          version     TEXT PRIMARY KEY,
          source      TEXT NOT NULL CHECK (source IN ('image', 'release', 'nightly')),
          state       TEXT NOT NULL CHECK (state IN ('promoted', 'kept', 'failed')),
          promoted_at INTEGER,
          canary_at   INTEGER,
          canary_ms   INTEGER,
          tier        TEXT CHECK (tier IN ('plain', 'node')),
          reason      TEXT
        );
      `);
    },
  },
  {
    id: 26,
    name: 'streamed_tracks',
    up: (db) => {
      // The songs search and radio have named: the only ones a client may play. artists is JSON.
      db.exec(`
        CREATE TABLE streamed_tracks (
          id       TEXT PRIMARY KEY,
          title    TEXT NOT NULL,
          artists  TEXT NOT NULL,
          album    TEXT,
          duration REAL NOT NULL,
          art_url  TEXT,
          seen_at  INTEGER NOT NULL
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
