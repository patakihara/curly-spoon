import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { runMigrations } from './migrations.js';
import { createSession, validateSession } from './sessions.js';
import { upsertUser } from './users.js';

describe('openDatabase', () => {
  it('creates every table on a fresh in-memory database', () => {
    const db = openDatabase(':memory:');
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining(['_migrations', 'sessions', 'setup_code', 'users']),
    );
  });

  it('is idempotent: reopening an already-migrated database does not error or duplicate rows', () => {
    const db = openDatabase(':memory:');
    const count = () =>
      (db.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number }).n;
    const before = count();

    expect(() => runMigrations(db)).not.toThrow();

    expect(count()).toBe(before);
  });

  it("enforces foreign keys, so deleting a user deletes that user's sessions", () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', role: 'member' });
    const session = createSession(db, user.id);

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    expect(validateSession(db, session.token)).toBeNull();
  });
});
