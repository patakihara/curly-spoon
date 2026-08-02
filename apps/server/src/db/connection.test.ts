import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { runMigrations } from './migrations.js';

describe('openDatabase', () => {
  it('creates every table on a fresh in-memory database', () => {
    const db = openDatabase(':memory:');
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining(['settings', 'users', 'secrets', 'sessions', '_migrations']),
    );
  });

  it('is idempotent — reopening an already-migrated database does not error or duplicate rows', () => {
    const db = openDatabase(':memory:');
    const before = db.prepare('SELECT COUNT(*) as n FROM _migrations').get() as { n: number };

    // Simulate a second boot against the same (in this test, still-open) database file
    // by re-running migrations directly; a real restart re-opens the same on-disk file.
    expect(() => runMigrations(db)).not.toThrow();

    const after = db.prepare('SELECT COUNT(*) as n FROM _migrations').get() as { n: number };
    expect(after.n).toBe(before.n);
  });
});
