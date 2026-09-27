import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('the database files on disk', () => {
  const modeOf = (path: string) => statSync(path).mode & 0o777;

  it('are readable only by the server, the WAL and shared-memory files included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auralis-db-'));
    try {
      const path = join(dir, 'auralis.sqlite');
      const db = openDatabase(path);
      upsertUser(db, { username: 'kara', role: 'member' });

      for (const file of [path, `${path}-wal`, `${path}-shm`]) {
        expect(existsSync(file), file).toBe(true);
        expect(modeOf(file), file).toBe(0o600);
      }
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('narrows a database that already exists world-readable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auralis-db-'));
    try {
      const path = join(dir, 'auralis.sqlite');
      openDatabase(path).close();
      chmodSync(path, 0o644);
      writeFileSync(`${path}-wal`, '', { mode: 0o644 });
      chmodSync(`${path}-wal`, 0o644);

      const db = openDatabase(path);

      expect(modeOf(path)).toBe(0o600);
      expect(modeOf(`${path}-wal`)).toBe(0o600);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
