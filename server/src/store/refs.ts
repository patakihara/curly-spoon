/**
 * Moving everything Auralis holds of one item onto another, as when an album's lossless track
 * replaces a kept song: queues, history, autoplay, radio, lists, played marks, held progress,
 * library claims, requests' results, radio seeds and the spoken queues a digest put aside. One call
 * is one transaction.
 *
 * Each place a reference lives is named below, and every other column that could hold one is named
 * with why it is left alone: the library index's own tables, which the index job rewrites from
 * Jellyfin, and what follows them. A test walks the schema and fails on any column of a reference
 * that is in neither list, so a table added later is never missed.
 *
 * Where a row's key holds the reference (a person's claim or mark on an item), a row already on the
 * new item wins and the old one goes: one person holds one claim, one mark, one place per item.
 */
import type { MediaRef } from '@auralis/schema';
import type { Db } from './connection.js';

/** A column pair holding a reference: its source (null where the table is Jellyfin's alone) and id. */
export interface RefColumns {
  table: string;
  source: string | null;
  id: string;
  /** The pair is in the row's key, so moving it can meet a row already there. */
  keyed?: boolean;
}

/** Every column pair Auralis keeps a reference in. */
export const REF_COLUMNS: readonly RefColumns[] = [
  { table: 'queue_items', source: 'source', id: 'upstream_id' },
  { table: 'playing_from', source: 'source', id: 'upstream_id' },
  { table: 'play_history', source: 'source', id: 'upstream_id' },
  { table: 'autoplay_picks', source: 'after_source', id: 'after_upstream_id' },
  { table: 'autoplay_picks', source: 'source', id: 'upstream_id' },
  { table: 'radio_tracks', source: 'source', id: 'upstream_id' },
  { table: 'listening_sessions', source: 'radio_seed_source', id: 'radio_seed_id' },
  { table: 'list_items', source: 'source', id: 'upstream_id' },
  { table: 'played_marks', source: 'source', id: 'upstream_id', keyed: true },
  { table: 'held_progress', source: 'source', id: 'item_id', keyed: true },
  { table: 'library_claims', source: 'source', id: 'item_id', keyed: true },
  { table: 'requests', source: 'result_source', id: 'result_id' },
  { table: 'streamed_seeds', source: null, id: 'jellyfin_id', keyed: true },
];

/** Columns holding references inside JSON: a `{source, id}` anywhere in the value. */
export const REF_JSON: readonly { table: string; columns: readonly string[] }[] = [
  { table: 'saved_queues', columns: ['queue', 'autoplay'] },
];

/** Columns that look like a reference's and are left alone, each with why. */
export const NOT_REFS: Readonly<Record<string, string>> = {
  'index_items.source': 'the index itself, rewritten from Jellyfin by the index job',
  'index_ids.source': 'the index’s ids, rewritten with their item',
  'index_sync.source': 'the index’s sync state, rewritten with their item',
  'search_items.source': 'Search’s copy of the index, rewritten with its item',
  'lyrics.source': 'resolved for one indexed item and version, and dropped with it',
  'index_runs.source': 'which upstream an index run read, not an item',
  'extractor_versions.source': 'where an extractor version came from, not an item',
  'users.role_source': 'where a person’s role came from, not an item',
};

/** One item becoming another. */
export interface RefMove {
  from: MediaRef;
  to: MediaRef;
}

/** Each `{source, id}` in a JSON value naming `from`, made `to`; null when nothing changed. */
function movedJson(text: string, moves: readonly RefMove[]): string | null {
  let changed = false;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== 'object') return value;
    const object = Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, walk(inner)]),
    ) as Record<string, unknown>;
    const move = moves.find(({ from }) => object.source === from.source && object.id === from.id);
    if (move === undefined) return object;
    changed = true;
    return { ...object, source: move.to.source, id: move.to.id };
  };
  const moved = JSON.stringify(walk(JSON.parse(text)));
  return changed ? moved : null;
}

/** Moves every reference to each `from` onto its `to`, in one transaction. */
export function moveRefs(db: Db, moves: readonly RefMove[]): void {
  db.transaction(() => {
    for (const { from, to } of moves) {
      for (const { table, source, id, keyed } of REF_COLUMNS) {
        if (source === null && from.source !== 'jellyfin') continue;
        const match =
          source === null ? `${id} = @fromId` : `${source} = @fromSource AND ${id} = @fromId`;
        const set = source === null ? `${id} = @toId` : `${source} = @toSource, ${id} = @toId`;
        const values = {
          fromSource: from.source,
          fromId: from.id,
          toSource: to.source,
          toId: to.id,
        };
        const params = Object.fromEntries(
          Object.entries(values).filter(([name]) => match.includes(name) || set.includes(name)),
        );
        db.prepare(`UPDATE${keyed ? ' OR IGNORE' : ''} ${table} SET ${set} WHERE ${match}`).run(
          params,
        );
        if (keyed) db.prepare(`DELETE FROM ${table} WHERE ${match}`).run(params);
      }
    }
    for (const { table, columns } of REF_JSON) {
      for (const column of columns) {
        const rows = db
          .prepare(`SELECT rowid, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`)
          .all() as { rowid: number; value: string }[];
        for (const { rowid, value } of rows) {
          const moved = movedJson(value, moves);
          if (moved !== null) {
            db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`).run(moved, rowid);
          }
        }
      }
    }
  })();
}
