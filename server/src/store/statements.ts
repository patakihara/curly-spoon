/**
 * Statements prepared once per database and kept: a write that runs per row reuses its
 * statements, since preparing one per row costs time and memory on a large library.
 */
import type { Statement } from 'better-sqlite3';
import type { Db } from './connection.js';

const prepared = new WeakMap<Db, Map<string, Statement>>();

/** `sql` prepared on `db`, the first time it is asked for; the same statement after. */
export function statement(db: Db, sql: string): Statement {
  let statements = prepared.get(db);
  if (statements === undefined) {
    statements = new Map();
    prepared.set(db, statements);
  }
  let found = statements.get(sql);
  if (found === undefined) {
    found = db.prepare(sql);
    statements.set(sql, found);
  }
  return found;
}
