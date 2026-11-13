/**
 * Moving one item's references onto another, on the real schema: every column of a reference is
 * named, every named one is moved, and a person's keyed row already on the new item wins.
 */
import { describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { moveRefs, NOT_REFS, REF_COLUMNS, REF_JSON } from './refs.js';

const OLD = { source: 'jellyfin', id: 'old-track' } as const;
const NEW = { source: 'jellyfin', id: 'new-track' } as const;

interface Column {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
}

const tables = (db: Db) =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map(({ name }) => name);
const columnsOf = (db: Db, table: string) =>
  db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Column[];

/** A column that names an item's source, or an item by a source it takes as given. */
const looksLikeRef = (name: string) =>
  name === 'source' || name.endsWith('_source') || /(^|_)jellyfin_id$/.test(name);

let rows = 0;
/** One row in `table`, the given values set and every other required column filled anew. */
function seed(db: Db, table: string, values: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  rows += 1;
  for (const column of columnsOf(db, table)) {
    if (column.name in values) row[column.name] = values[column.name];
    else if (column.notnull === 1 && column.dflt_value === null) {
      row[column.name] = /INT|REAL/i.test(column.type) ? rows : `x-${column.name}-${rows}`;
    }
  }
  const names = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((n) => `@${n}`).join(', ')})`,
  ).run(row);
}

/** The schema without its checks and keys between tables, so one row of anything can be made. */
function looseDb(): Db {
  const db = openDatabase(':memory:');
  db.pragma('foreign_keys = OFF');
  db.pragma('ignore_check_constraints = ON');
  return db;
}

describe('[M3.albums/c] every reference to a replaced track is moved', () => {
  it('[M3.albums/c] the schema walk finds no column of a reference the move leaves out', () => {
    const db = openDatabase(':memory:');
    const covered = new Set([
      ...REF_COLUMNS.flatMap(({ table, source, id }) => [
        `${table}.${source ?? id}`,
        `${table}.${id}`,
      ]),
      ...Object.keys(NOT_REFS),
    ]);
    const found = tables(db).flatMap((table) =>
      columnsOf(db, table)
        .filter(({ name }) => looksLikeRef(name))
        .map(({ name }) => `${table}.${name}`),
    );
    expect(found.filter((column) => !covered.has(column))).toEqual([]);
    for (const { table, source, id } of REF_COLUMNS) {
      const names = columnsOf(db, table).map(({ name }) => name);
      expect(names, table).toEqual(expect.arrayContaining(source === null ? [id] : [source, id]));
    }
    for (const { table, columns } of REF_JSON) {
      expect(columnsOf(db, table).map(({ name }) => name)).toEqual(
        expect.arrayContaining([...columns]),
      );
    }
    for (const column of Object.keys(NOT_REFS)) {
      const [table, name] = column.split('.');
      expect(
        columnsOf(db, table!).map((c) => c.name),
        column,
      ).toContain(name);
    }
    db.close();
  });

  it('[M3.albums/c] each named column moves to the new track, and nothing else changes', () => {
    const db = looseDb();
    for (const table of new Set(REF_COLUMNS.map((columns) => columns.table))) {
      const pairs = REF_COLUMNS.filter((columns) => columns.table === table);
      const values = (named: (source: string | null) => [string, string]) =>
        Object.fromEntries(
          pairs.flatMap(({ source, id }) => {
            const [value, upstream] = named(source);
            return [...(source === null ? [] : [[source, value]]), [id, upstream]];
          }),
        );
      seed(
        db,
        table,
        values(() => [OLD.source, OLD.id]),
      );
      seed(
        db,
        table,
        values((source) => (source === null ? ['', 'other'] : ['abs', OLD.id])),
      );
    }
    const queue = {
      current: { itemId: 'a', ref: OLD },
      position: null,
      user: [{ itemId: 'b', ref: { source: 'abs', id: OLD.id } }],
      context: { from: { kind: 'album', ref: { source: 'jellyfin', id: 'album' } }, items: [] },
    };
    seed(db, 'saved_queues', {
      device_id: 'd',
      owner: '',
      queue: JSON.stringify(queue),
      autoplay: JSON.stringify({ after: OLD, pick: null }),
    });

    moveRefs(db, [{ from: OLD, to: NEW }]);

    for (const { table, source, id } of REF_COLUMNS) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      const pairs = rows.map((row) => [source === null ? 'jellyfin' : row[source], row[id]]);
      expect(pairs, `${table}.${id}`).toEqual(
        expect.arrayContaining([
          ['jellyfin', NEW.id],
          source === null ? ['jellyfin', 'other'] : ['abs', OLD.id],
        ]),
      );
      expect(pairs, `${table}.${id}`).not.toContainEqual(['jellyfin', OLD.id]);
    }
    const saved = db.prepare('SELECT queue, autoplay FROM saved_queues').get() as {
      queue: string;
      autoplay: string;
    };
    expect(JSON.parse(saved.queue)).toEqual({
      ...queue,
      current: { itemId: 'a', ref: NEW },
    });
    expect(JSON.parse(saved.autoplay)).toEqual({ after: NEW, pick: null });
    db.close();
  });

  it('[M3.albums/c] a person’s claim, mark or place already on the new track wins over the old', () => {
    const db = looseDb();
    seed(db, 'library_claims', { user_id: 'u', ...OLD, item_id: OLD.id, reason: 'played' });
    seed(db, 'library_claims', { user_id: 'u', ...NEW, item_id: NEW.id, reason: 'added' });
    seed(db, 'library_claims', { user_id: 'v', ...OLD, item_id: OLD.id, reason: 'played' });
    const strip = (rows: unknown[]) =>
      rows.map((row) => {
        const { user_id, item_id, reason } = row as Record<string, unknown>;
        return { user_id, item_id, reason };
      });

    moveRefs(db, [{ from: OLD, to: NEW }]);

    expect(strip(db.prepare('SELECT * FROM library_claims ORDER BY user_id').all())).toEqual([
      { user_id: 'u', item_id: NEW.id, reason: 'added' },
      { user_id: 'v', item_id: NEW.id, reason: 'played' },
    ]);
    db.close();
  });
});
