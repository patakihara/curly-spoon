/** Opens the SQLite store and brings it up to the latest schema. Tests pass `:memory:`. */

import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  // WAL means nothing for an in-memory database, and better-sqlite3 rejects it there.
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}
