/**
 * Where each Spotify import stands (`list_imports`), one per person and playlist, keyed by its
 * list. An import waiting or reading Spotify's order is `reading`, one finding songs `matching`;
 * both are queued, oldest started first, and the job takes them one at a time. `done` counts the
 * playlist's places handled and `handled` keeps each one's Spotify URI, so a restart goes on with
 * the tracks not yet handled, wherever Spotify's order now has them. The report (`unmatched`,
 * JSON parsed with zod on read) keeps each entry left off, and each that named a song already on
 * the list (`duplicate`, counted, never listed as unmatched).
 */
import {
  type ListImport,
  ListImportState,
  ListImportStop,
  type ListUnmatched,
  UnmatchedReason,
} from '@auralis/schema';
import { z } from 'zod';
import type { Db } from '../../store/connection.js';

/** One entry of the report: left off for a reason, or a song already on the list. */
const ReportEntry = z.object({
  position: z.number().int().nonnegative(),
  reason: z.union([UnmatchedReason, z.literal('duplicate')]),
  uri: z.string(),
  title: z.string().nullable(),
  artists: z.array(z.string()),
  album: z.string().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  /** For `noMatch`: the row that got furthest, never added. */
  near: z.unknown().nullable(),
});
export type ReportEntry = z.infer<typeof ReportEntry>;

const Row = z.object({
  list_id: z.string(),
  user_id: z.string(),
  source: z.literal('spotify'),
  playlist_id: z.string(),
  state: ListImportState,
  stopped: ListImportStop.nullable(),
  done: z.number().int(),
  total: z.number().int(),
  unmatched: z.string().transform((text) => z.array(ReportEntry).parse(JSON.parse(text))),
  handled: z.string().transform((text) => z.array(z.string()).parse(JSON.parse(text))),
  imported_at: z.number().int(),
});

export interface StoredImport {
  listId: string;
  userId: string;
  playlistId: string;
  state: ListImportState;
  stopped: ListImportStop | null;
  done: number;
  total: number;
  report: ReportEntry[];
  /** The Spotify URI of each place handled, in the order handled. */
  handled: string[];
  importedAt: number;
}

const stored = (raw: unknown): StoredImport => {
  const row = Row.parse(raw);
  return {
    listId: row.list_id,
    userId: row.user_id,
    playlistId: row.playlist_id,
    state: row.state,
    stopped: row.stopped,
    done: row.done,
    total: row.total,
    report: row.unmatched,
    handled: row.handled,
    importedAt: row.imported_at,
  };
};

/** Whether an import is queued or under way. */
export const running = (i: StoredImport): boolean =>
  i.state === 'reading' || i.state === 'matching';

/** The import of this list; null when it was never imported. */
export function importOf(db: Db, listId: string): StoredImport | null {
  const raw = db.prepare('SELECT * FROM list_imports WHERE list_id = ?').get(listId);
  return raw === undefined ? null : stored(raw);
}

/** This person's import of this playlist; null when they never imported it. */
export function importFor(db: Db, userId: string, playlistId: string): StoredImport | null {
  const raw = db
    .prepare('SELECT * FROM list_imports WHERE user_id = ? AND playlist_id = ?')
    .get(userId, playlistId);
  return raw === undefined ? null : stored(raw);
}

/** The import to run next: the oldest started of those queued or under way. */
export function nextImport(db: Db): StoredImport | null {
  const raw = db
    .prepare(
      `SELECT * FROM list_imports WHERE state IN ('reading', 'matching')
       ORDER BY imported_at, rowid LIMIT 1`,
    )
    .get();
  return raw === undefined ? null : stored(raw);
}

/** A new import of a list just made, queued. */
export function queueImport(
  db: Db,
  i: { listId: string; userId: string; playlistId: string },
  now: number,
): void {
  db.prepare(
    `INSERT INTO list_imports
       (list_id, user_id, source, playlist_id, state, stopped, done, total, unmatched, imported_at)
     VALUES (?, ?, 'spotify', ?, 'reading', NULL, 0, 0, '[]', ?)`,
  ).run(i.listId, i.userId, i.playlistId, now);
}

/**
 * The import queued again: a stopped one goes on from where it stopped, its songs and report
 * kept; a finished one starts over, the list's songs cleared (a re-import).
 */
export function requeueImport(db: Db, listId: string, now: number): void {
  db.transaction(() => {
    if (importOf(db, listId)?.state === 'stopped') {
      db.prepare(
        `UPDATE list_imports SET state = 'reading', stopped = NULL, imported_at = ?
         WHERE list_id = ?`,
      ).run(now, listId);
      return;
    }
    db.prepare('DELETE FROM list_items WHERE list_id = ?').run(listId);
    db.prepare(
      `UPDATE list_imports SET state = 'reading', stopped = NULL, done = 0, total = 0,
         unmatched = '[]', handled = '[]', imported_at = ? WHERE list_id = ?`,
    ).run(now, listId);
  })();
}

/** The import's state and total, as Spotify's order was read. */
export function setState(
  db: Db,
  listId: string,
  change: { state: ListImportState; stopped?: ListImportStop; total?: number },
): void {
  db.prepare(
    `UPDATE list_imports SET state = ?, stopped = ?, total = COALESCE(?, total)
     WHERE list_id = ?`,
  ).run(change.state, change.stopped ?? null, change.total ?? null, listId);
}

/**
 * One more place handled, in one transaction: its song added to the end of the list unless the
 * list holds it already (then a `duplicate`), or its entry reported.
 */
export function handled(
  db: Db,
  listId: string,
  place: { song: string; entry: Omit<ReportEntry, 'reason'> } | { report: ReportEntry },
  now: number,
): void {
  db.transaction(() => {
    const current = importOf(db, listId);
    if (current === null) return;
    let report: ReportEntry | null = 'report' in place ? place.report : null;
    if ('song' in place) {
      const held = db
        .prepare(
          `SELECT 1 FROM list_items WHERE list_id = ? AND source = 'ytmusic' AND upstream_id = ?`,
        )
        .get(listId, place.song);
      if (held === undefined) {
        const { n } = z
          .object({ n: z.number().int() })
          .parse(
            db
              .prepare('SELECT COALESCE(MAX(ord) + 1, 0) AS n FROM list_items WHERE list_id = ?')
              .get(listId),
          );
        db.prepare(
          `INSERT INTO list_items (list_id, ord, source, upstream_id) VALUES (?, ?, 'ytmusic', ?)`,
        ).run(listId, n, place.song);
        db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(now, listId);
      } else report = { ...place.entry, reason: 'duplicate' };
    }
    const uri = 'report' in place ? place.report.uri : place.entry.uri;
    db.prepare(
      'UPDATE list_imports SET done = done + 1, unmatched = ?, handled = ? WHERE list_id = ?',
    ).run(
      JSON.stringify(report === null ? current.report : [...current.report, report]),
      JSON.stringify([...current.handled, uri]),
      listId,
    );
  })();
}

/**
 * The entries of Spotify's order, as freshly read, that this import has not handled: each URI
 * handled is matched once against the order, so a playlist changed since goes on by track, never
 * by place.
 */
export function unhandled<E extends { uri: string }>(i: StoredImport, entries: readonly E[]): E[] {
  const left = new Map<string, number>();
  for (const uri of i.handled) left.set(uri, (left.get(uri) ?? 0) + 1);
  return entries.filter((e) => {
    const n = left.get(e.uri) ?? 0;
    if (n > 0) left.set(e.uri, n - 1);
    return n === 0;
  });
}

/** The import as a list's detail shows it. */
export function shownImport(i: StoredImport): ListImport {
  const unmatched = i.report.flatMap((e): ListUnmatched[] =>
    e.reason === 'duplicate'
      ? []
      : [
          {
            position: e.position,
            reason: e.reason,
            title: e.title,
            artists: e.artists,
            album: e.album,
            duration: e.durationMs === null ? null : e.durationMs / 1000,
          },
        ],
  );
  return {
    source: 'spotify',
    state: i.state,
    done: i.done,
    total: i.total,
    unmatched,
    duplicates: i.report.length - unmatched.length,
    stopped: i.stopped,
    importedAt: i.importedAt,
  };
}
