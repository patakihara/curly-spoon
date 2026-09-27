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
