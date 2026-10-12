import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations, runMigrations, type Migration } from './migrations.js';

const appliedIds = (db: Database.Database) =>
  (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: number }[]).map(
    (row) => row.id,
  );

describe('runMigrations', () => {
  it('applies every migration once and records each one', () => {
    const db = new Database(':memory:');

    runMigrations(db);
    runMigrations(db);

    expect(appliedIds(db)).toEqual(migrations.map((m) => m.id));
    db.close();
  });

  it('applies a later migration to a database that already has rows, keeping them', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, username, role, created_at, updated_at)
       VALUES ('user-1', 'kara', 'member', ?, ?)`,
    ).run(now, now);

    const later: Migration = {
      id: migrations.length + 1,
      name: 'probe',
      up: (d) => d.exec("ALTER TABLE users ADD COLUMN probe TEXT NOT NULL DEFAULT 'x'"),
    };
    runMigrations(db, [...migrations, later]);

    expect(db.prepare('SELECT username, probe FROM users').all()).toEqual([
      { username: 'kara', probe: 'x' },
    ]);
    expect(appliedIds(db)).toEqual([...migrations.map((m) => m.id), later.id]);
    db.close();
  });
});

describe('the episode order migration', () => {
  it('has every indexed show read again on the next run, and nothing else', () => {
    const db = new Database(':memory:');
    runMigrations(
      db,
      migrations.filter((m) => m.id < 6),
    );
    const add = db.prepare(
      `INSERT INTO index_items (source, upstream_id, kind, title, creators, series, genres,
         content_hash, version, created_at, updated_at)
       VALUES ('abs', ?, ?, 't', '[]', '[]', '[]', 'h', 1, 1, 1)`,
    );
    const sync = db.prepare(
      `INSERT INTO index_sync (source, upstream_id, upstream_version, checked_at)
       VALUES ('abs', ?, '1', 1)`,
    );
    for (const [id, kind] of [
      ['show-1', 'show'],
      ['book-1', 'book'],
    ]) {
      add.run(id, kind);
      sync.run(id);
    }

    runMigrations(
      db,
      migrations.filter((m) => m.id <= 6),
    );

    expect(db.prepare('SELECT upstream_id FROM index_sync').all()).toEqual([
      { upstream_id: 'book-1' },
    ]);
    expect(db.prepare('SELECT episode_order FROM index_items').all()).toEqual([
      { episode_order: null },
      { episode_order: null },
    ]);
    db.close();
  });
});

describe('the Jellyfin library migration', () => {
  it('has every indexed Jellyfin album read again on the next run, so its tracks gain their library, and nothing else', () => {
    const db = new Database(':memory:');
    runMigrations(
      db,
      migrations.filter((m) => m.id < 8),
    );
    const add = db.prepare(
      `INSERT INTO index_items (source, upstream_id, kind, title, creators, series, genres,
         content_hash, version, created_at, updated_at)
       VALUES (?, ?, ?, 't', '[]', '[]', '[]', 'h', 1, 1, 1)`,
    );
    const sync = db.prepare(
      `INSERT INTO index_sync (source, upstream_id, upstream_version, checked_at)
       VALUES (?, ?, '1', 1)`,
    );
    for (const [source, id, kind] of [
      ['jellyfin', 'album-1', 'album'],
      ['abs', 'book-1', 'book'],
    ]) {
      add.run(source, id, kind);
      sync.run(source, id);
    }

    runMigrations(
      db,
      migrations.filter((m) => m.id <= 8),
    );

    expect(db.prepare('SELECT source, upstream_id FROM index_sync').all()).toEqual([
      { source: 'abs', upstream_id: 'book-1' },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM index_items').get()).toEqual({ n: 2 });
    db.close();
  });
});

describe('the art migration', () => {
  it('has every indexed item read again on the next run, so it learns whether it has art, and keeps every row', () => {
    const db = new Database(':memory:');
    runMigrations(
      db,
      migrations.filter((m) => m.id < 9),
    );
    const add = db.prepare(
      `INSERT INTO index_items (source, upstream_id, kind, title, creators, series, genres,
         content_hash, version, created_at, updated_at)
       VALUES (?, ?, ?, 't', '[]', '[]', '[]', 'h', 1, 1, 1)`,
    );
    const sync = db.prepare(
      `INSERT INTO index_sync (source, upstream_id, upstream_version, checked_at)
       VALUES (?, ?, '1', 1)`,
    );
    for (const [source, id, kind] of [
      ['jellyfin', 'album-1', 'album'],
      ['abs', 'book-1', 'book'],
    ]) {
      add.run(source, id, kind);
      sync.run(source, id);
    }

    runMigrations(db);

    expect(db.prepare('SELECT COUNT(*) AS n FROM index_sync').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT upstream_id, has_art FROM index_items').all()).toEqual([
      { upstream_id: 'album-1', has_art: 0 },
      { upstream_id: 'book-1', has_art: 0 },
    ]);
    db.close();
  });
});
