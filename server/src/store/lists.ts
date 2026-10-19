/**
 * Each person's lists that aren't queues: listening lists of books and shows, podcast playlists of
 * episodes, and digests over shows. The Digest, over every subscription, is made once per person
 * and stays: it cannot be renamed, given shows or deleted, only turned to play newest first. Also
 * the episodes Auralis marked played for a person, newest mark kept, and whether Audiobookshelf
 * took it. Only the store's rules live
 * here; which entries a list may hold, and what its digest rule picks, are the lists code's.
 */
import { randomUUID } from 'node:crypto';
import { DigestOrder, ListKind, type MediaRef, MediaSource } from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** The name The Digest is made with. */
export const THE_DIGEST_NAME = 'The Digest';

export interface StoredList {
  id: string;
  userId: string;
  kind: ListKind;
  name: string;
  /** True for The Digest alone. */
  theDigest: boolean;
  /** A digest's play order; null on every other list. */
  order: DigestOrder | null;
  /** A list's entries in order, or a custom digest's shows; The Digest's are always empty. */
  items: MediaRef[];
  createdAt: number;
  updatedAt: number;
}

/** A change The Digest refuses: a new name, chosen shows, or deletion. */
export class FixedList extends Error {
  constructor(readonly listId: string) {
    super(`list ${listId} is The Digest, which keeps its name and shows`);
    this.name = 'FixedList';
  }
}

const ListRow = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: ListKind,
  name: z.string(),
  all_shows: z.union([z.literal(0), z.literal(1)]),
  play_order: DigestOrder.nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});
type ListRow = z.infer<typeof ListRow>;

const ItemRow = z
  .object({ source: MediaSource, upstream_id: z.string() })
  .transform((row): MediaRef => ({ source: row.source, id: row.upstream_id }));

const readItems = (db: Db, listId: string): MediaRef[] =>
  z
    .array(ItemRow)
    .parse(db.prepare('SELECT * FROM list_items WHERE list_id = ? ORDER BY ord').all(listId));

const stored = (db: Db, row: ListRow): StoredList => ({
  id: row.id,
  userId: row.user_id,
  kind: row.kind,
  name: row.name,
  theDigest: row.all_shows === 1,
  order: row.play_order,
  items: readItems(db, row.id),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function readRow(db: Db, userId: string, id: string): ListRow | null {
  const raw = db.prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?').get(id, userId);
  return raw === undefined ? null : ListRow.parse(raw);
}

function writeItems(db: Db, listId: string, items: readonly MediaRef[]): void {
  db.prepare('DELETE FROM list_items WHERE list_id = ?').run(listId);
  const insert = db.prepare(
    'INSERT INTO list_items (list_id, ord, source, upstream_id) VALUES (?, ?, ?, ?)',
  );
  items.forEach((ref, ord) => insert.run(listId, ord, ref.source, ref.id));
}

/** This person's The Digest, made oldest first on the first ask. */
export function ensureTheDigest(db: Db, userId: string, now: number = Date.now()): StoredList {
  db.prepare(
    `INSERT INTO lists (id, user_id, kind, name, all_shows, play_order, created_at, updated_at)
     VALUES (?, ?, 'digest', ?, 1, 'oldest', ?, ?)
     ON CONFLICT (user_id) WHERE all_shows = 1 DO NOTHING`,
  ).run(randomUUID(), userId, THE_DIGEST_NAME, now, now);
  const raw = db.prepare('SELECT * FROM lists WHERE user_id = ? AND all_shows = 1').get(userId);
  return stored(db, ListRow.parse(raw));
}

/** A new list of this person's, never The Digest; a digest plays oldest first unless told. */
export function createList(
  db: Db,
  userId: string,
  list: { kind: ListKind; name: string; order?: DigestOrder; items?: readonly MediaRef[] },
  now: number = Date.now(),
): StoredList {
  const id = randomUUID();
  const order = list.kind === 'digest' ? (list.order ?? 'oldest') : null;
  return db.transaction(() => {
    db.prepare(
      `INSERT INTO lists (id, user_id, kind, name, all_shows, play_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    ).run(id, userId, list.kind, list.name, order, now, now);
    writeItems(db, id, list.items ?? []);
    return stored(db, readRow(db, userId, id)!);
  })();
}

/** This person's lists: The Digest first, then the rest, oldest first; made at one moment, in the order made. */
export function listLists(db: Db, userId: string): StoredList[] {
  const rows = z
    .array(ListRow)
    .parse(
      db
        .prepare('SELECT * FROM lists WHERE user_id = ? ORDER BY all_shows DESC, created_at, rowid')
        .all(userId),
    );
  return rows.map((row) => stored(db, row));
}

/** One of this person's lists; null when there is none of theirs by that id. */
export function getList(db: Db, userId: string, id: string): StoredList | null {
  const row = readRow(db, userId, id);
  return row === null ? null : stored(db, row);
}

/**
 * Renames a list, or changes a digest's order. Throws `FixedList` on renaming The Digest; null
 * when the list is not this person's.
 */
export function updateList(
  db: Db,
  userId: string,
  id: string,
  change: { name?: string; order?: DigestOrder },
  now: number = Date.now(),
): StoredList | null {
  return db.transaction(() => {
    const row = readRow(db, userId, id);
    if (row === null) return null;
    if (row.all_shows === 1 && change.name !== undefined) throw new FixedList(id);
    db.prepare('UPDATE lists SET name = ?, play_order = ?, updated_at = ? WHERE id = ?').run(
      change.name ?? row.name,
      change.order ?? row.play_order,
      now,
      id,
    );
    return stored(db, readRow(db, userId, id)!);
  })();
}

/**
 * Sets a list's entries, or a custom digest's shows, whole and in order. Throws `FixedList` on
 * The Digest; null when the list is not this person's.
 */
export function setListItems(
  db: Db,
  userId: string,
  id: string,
  items: readonly MediaRef[],
  now: number = Date.now(),
): StoredList | null {
  return db.transaction(() => {
    const row = readRow(db, userId, id);
    if (row === null) return null;
    if (row.all_shows === 1) throw new FixedList(id);
    writeItems(db, id, items);
    db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(now, id);
    return stored(db, readRow(db, userId, id)!);
  })();
}

/** Adds one entry to the end of a list, as `setListItems` does. */
export function addListItem(
  db: Db,
  userId: string,
  id: string,
  ref: MediaRef,
  now: number = Date.now(),
): StoredList | null {
  return db.transaction(() => {
    const list = getList(db, userId, id);
    return list === null ? null : setListItems(db, userId, id, [...list.items, ref], now);
  })();
}

/**
 * Deletes one of this person's lists; false when there is none of theirs by that id. Throws
 * `FixedList` on The Digest. A digest's queue goes with it: a device playing it keeps the queue
 * playing as its own, dropping the own queue it saved, and every device drops the digest's saved
 * queue. Each session it changes moves on a revision, so a write from before is refused.
 */
export function deleteList(db: Db, userId: string, id: string, now: number = Date.now()): boolean {
  return db.transaction(() => {
    const row = readRow(db, userId, id);
    if (row === null) return false;
    if (row.all_shows === 1) throw new FixedList(id);
    const devices = z
      .array(z.object({ device_id: z.string() }))
      .parse(
        db
          .prepare(
            `SELECT device_id FROM listening_sessions WHERE user_id = @user AND (
               spoken_digest = @list OR device_id IN
                 (SELECT device_id FROM saved_queues WHERE owner = @list))`,
          )
          .all({ user: userId, list: id }),
      )
      .map((r) => r.device_id);
    const dropOwn = db.prepare(
      `DELETE FROM saved_queues WHERE owner = '' AND device_id = ?
         AND device_id IN (SELECT device_id FROM listening_sessions WHERE spoken_digest = ?)`,
    );
    const dropDigest = db.prepare('DELETE FROM saved_queues WHERE device_id = ? AND owner = ?');
    const ownEntries = db.prepare(
      'UPDATE queue_items SET list_id = NULL WHERE device_id = ? AND list_id = ?',
    );
    const moveOn = db.prepare(
      `UPDATE listening_sessions
       SET spoken_digest = CASE WHEN spoken_digest = ? THEN NULL ELSE spoken_digest END,
         rev = rev + 1, updated_at = ?
       WHERE device_id = ?`,
    );
    for (const device of devices) {
      dropOwn.run(device, id);
      dropDigest.run(device, id);
      ownEntries.run(device, id);
      moveOn.run(id, now, device);
    }
    db.prepare('DELETE FROM lists WHERE id = ?').run(id);
    return true;
  })();
}

/** An episode Auralis marked played: when, and whether the upstream has taken the mark. */
export interface PlayedMark {
  at: number;
  confirmed: boolean;
}

/**
 * Marks an episode played for this person at `at`, keeping the newer of two marks. A newer mark
 * waits to be confirmed afresh.
 */
export function markPlayed(db: Db, userId: string, ref: MediaRef, at: number): void {
  db.prepare(
    `INSERT INTO played_marks (user_id, source, upstream_id, marked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, source, upstream_id)
       DO UPDATE SET marked_at = excluded.marked_at, confirmed = 0
       WHERE excluded.marked_at > marked_at`,
  ).run(userId, ref.source, ref.id, at);
}

/** Notes that the upstream took the mark made at `at`; a newer mark since is left waiting. */
export function confirmMark(db: Db, userId: string, ref: MediaRef, at: number): void {
  db.prepare(
    `UPDATE played_marks SET confirmed = 1
     WHERE user_id = ? AND source = ? AND upstream_id = ? AND marked_at = ?`,
  ).run(userId, ref.source, ref.id, at);
}

/** Each episode this person had marked played, by `source:id`: its newest mark. */
export function playedMarks(db: Db, userId: string): Map<string, PlayedMark> {
  const rows = z
    .array(
      z.object({
        source: MediaSource,
        upstream_id: z.string(),
        marked_at: z.number().int(),
        confirmed: z.union([z.literal(0), z.literal(1)]),
      }),
    )
    .parse(db.prepare('SELECT * FROM played_marks WHERE user_id = ?').all(userId));
  return new Map(
    rows.map((r) => [
      `${r.source}:${r.upstream_id}`,
      { at: r.marked_at, confirmed: r.confirmed === 1 },
    ]),
  );
}
