/**
 * Opens the SQLite store and brings it up to the latest schema. Pass `:memory:`
 * for tests — every route/DB test in this package uses an isolated in-memory
 * database rather than touching disk.
 */

import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  // WAL isn't meaningful (and better-sqlite3 rejects it) for an in-memory database.
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}
