/**
 * Opens the SQLite store and brings it up to the latest schema. Tests pass `:memory:`. On disk
 * the database holds session and setup-code hashes, so only the server's user may read it.
 */

import { chmodSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  const db = new Database(path);
  const onDisk = path !== ':memory:';
  // Before WAL: SQLite gives the -wal and -shm files it creates the main file's mode.
  if (onDisk) chmodSync(path, 0o600);
  db.pragma('foreign_keys = ON');
  // WAL means nothing for an in-memory database, and better-sqlite3 rejects it there.
  if (onDisk) db.pragma('journal_mode = WAL');
  runMigrations(db);
  if (onDisk) {
    for (const file of [`${path}-wal`, `${path}-shm`]) {
      if (existsSync(file)) chmodSync(file, 0o600);
    }
  }
  return db;
}
