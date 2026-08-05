/**
 * Pins the one property that matters for a migration touching a table other migrations
 * already shipped: it must apply cleanly to a database that already has rows in it, not
 * just to a fresh one. `openDatabase(':memory:')` alone can't test this — it always starts
 * from nothing and runs every migration in order, which is exactly the "only works on an
 * empty schema" blind spot this file exists to close (see migration 4's own comment in
 * `migrations.ts` for why `ALTER TABLE ... DEFAULT` is what makes that safe).
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations, runMigrations } from './migrations.js';

describe('migration 4 (request-media-type) against a pre-existing database', () => {
  it('backfills existing rows to media_type "book" and lets new music rows in', () => {
    const db = new Database(':memory:');

    // Bring the schema up to just before migration 4, the same way a real installation
    // upgrading from before this wave would already be sitting — via the migrations
    // themselves, not a hand-copied CREATE TABLE that could drift from what they actually
    // produce.
    for (const migration of migrations.filter((m) => m.id <= 3)) {
      migration.up(db);
    }

    // A real book request, written the way pre-migration-4 code wrote it: no media_type,
    // no candidate_json column to target even if it wanted to.
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, username, upstream, upstream_user_id, created_at, updated_at)
       VALUES ('user-1', 'kara', 'audiobookshelf', 'abs-user-1', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO requests
         (id, user_id, title, status, progress, created_at, updated_at)
       VALUES ('req-pre-existing', 'user-1', 'Dune', 'completed', 1, ?, ?)`,
    ).run(now, now);

    // The migration this wave adds. `runMigrations` only applies what `_migrations` has
    // not yet recorded — migrations 1-3 above weren't run through it, so it re-applies
    // them too (harmless: every one of them is `CREATE TABLE`/`CREATE INDEX IF NOT
    // EXISTS`) before reaching migration 4, which is the one this test is actually about.
    runMigrations(db);

    const preExisting = db
      .prepare('SELECT media_type, candidate_json FROM requests WHERE id = ?')
      .get('req-pre-existing') as { media_type: string; candidate_json: string | null };
    expect(preExisting.media_type).toBe('book');
    expect(preExisting.candidate_json).toBeNull();

    // A new music row, written the way post-migration-4 code writes one, proves the added
    // columns are actually usable afterwards, not just present.
    db.prepare(
      `INSERT INTO requests
         (id, user_id, title, status, progress, media_type, candidate_json, created_at, updated_at)
       VALUES ('req-new-music', 'user-1', 'Echo', 'pending', 0, 'music', '{"guid":"g"}', ?, ?)`,
    ).run(now, now);
    const newMusic = db
      .prepare('SELECT media_type, candidate_json FROM requests WHERE id = ?')
      .get('req-new-music') as { media_type: string; candidate_json: string | null };
    expect(newMusic.media_type).toBe('music');
    expect(newMusic.candidate_json).toBe('{"guid":"g"}');

    // Re-running migrations again (the normal boot-time path) must not fail or double-apply
    // — `_migrations` should now record every id exactly once.
    expect(() => runMigrations(db)).not.toThrow();
    const appliedIds = (
      db.prepare('SELECT id FROM _migrations ORDER BY id').all() as Array<{ id: number }>
    ).map((row) => row.id);
    expect(appliedIds).toEqual([1, 2, 3, 4]);

    db.close();
  });
});
