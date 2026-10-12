/**
 * Listening sessions: one per device, made on its first use and deleted with the device. A
 * session is read and written whole, as a value the queue engine works on. Every write names the
 * revision it was made from; one made from an older revision is refused with `StaleRevision`, so
 * two tabs on one device cannot overwrite each other.
 */

import {
  type HistoryEntry,
  type ListeningSession,
  MediaSource,
  PlayingFromKind,
  type QueueContext,
  type QueueItem,
  type QueuePosition,
  QueueStyle,
  QueueType,
} from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** Plays kept per device; older ones are forgotten. */
export const HISTORY_KEPT = 500;

/**
 * A queue entry as the session keeps it. `walk` orders the entries of a walk Back started:
 * Forward plays them first, lowest first, wherever they sit. `replayOf` is the play (its `seq`)
 * the entry plays again: it is already in history, so ending it records nothing. `position` is
 * where the device was in an entry of your queue when it was last current.
 */
export interface SessionItem extends QueueItem {
  walk?: number;
  replayOf?: number;
  position?: QueuePosition;
}

/**
 * One queue: its current item and the device's last position in it, your queue, and Spotify
 * style's playing-from, which outlives its items.
 */
export interface SessionQueue {
  current: SessionItem | null;
  position: QueuePosition | null;
  user: SessionItem[];
  context: QueueContext | null;
}

/**
 * Everything a session holds that the engine changes. History is oldest first, by `seq`, and
 * append-only: Back walks it from the current item's place and never takes a play out.
 */
export interface SessionValue {
  active: QueueType;
  switchAfterCurrent: QueueType | null;
  queueStyle: QueueStyle;
  queues: Record<QueueType, SessionQueue>;
  history: HistoryEntry[];
}

export interface StoredSession extends SessionValue {
  userId: string;
  deviceId: string;
  rev: number;
  updatedAt: number;
}

/** A session as the session list shows it, before the route says which device is asking. */
export type SessionSummary = Omit<ListeningSession, 'thisDevice'>;

/** A write made from a revision that is no longer the session's. */
export class StaleRevision extends Error {
  constructor(
    readonly deviceId: string,
    readonly expected: number,
  ) {
    super(`listening session ${deviceId} has moved past revision ${expected}`);
    this.name = 'StaleRevision';
  }
}

/**
 * A save that would change, renumber or drop a stored play, or add one older than the newest
 * stored. Only new plays pushing the oldest past `HISTORY_KEPT` take a play out.
 */
export class HistoryRewritten extends Error {
  constructor(
    readonly deviceId: string,
    readonly seq: number,
  ) {
    super(`listening session ${deviceId}: play ${seq} would rewrite its history`);
    this.name = 'HistoryRewritten';
  }
}

/** A queue position saved with no current item to be a position in. */
export class PositionWithoutItem extends Error {
  constructor(
    readonly deviceId: string,
    readonly queue: QueueType,
  ) {
    super(`listening session ${deviceId}: a ${queue} position with no current item`);
    this.name = 'PositionWithoutItem';
  }
}

const SessionRow = z.object({
  device_id: z.string(),
  user_id: z.string(),
  device_name: z.string(),
  active: QueueType,
  switch_after_current: QueueType.nullable(),
  queue_style: QueueStyle,
  rev: z.number().int().nonnegative(),
  updated_at: z.number(),
});
type SessionRow = z.infer<typeof SessionRow>;

const chapterOf = (chapter: number | null) => (chapter === null ? {} : { chapter });

const ItemRow = z
  .object({
    queue: QueueType,
    segment: z.enum(['current', 'user', 'context']),
    item_id: z.string(),
    source: MediaSource,
    upstream_id: z.string(),
    chapter: z.number().int().nonnegative().nullable(),
    position_ms: z.number().int().nonnegative().nullable(),
    position_at: z.number().int().nullable(),
    walk: z.number().int().nullable(),
    replay_of: z.number().int().nonnegative().nullable(),
  })
  .transform((row) => ({
    queue: row.queue,
    segment: row.segment,
    position:
      row.position_ms === null || row.position_at === null
        ? null
        : { ms: row.position_ms, takenAt: row.position_at },
    item: {
      itemId: row.item_id,
      ref: { source: row.source, id: row.upstream_id },
      ...chapterOf(row.chapter),
    } satisfies QueueItem,
    walk: row.walk,
    replayOf: row.replay_of,
  }));

const HistoryRow = z
  .object({
    seq: z.number().int().nonnegative(),
    queue: QueueType,
    source: MediaSource,
    upstream_id: z.string(),
    chapter: z.number().int().nonnegative().nullable(),
    played_at: z.number().int(),
  })
  .transform((row): HistoryEntry => ({
    seq: row.seq,
    queue: row.queue,
    ref: { source: row.source, id: row.upstream_id },
    ...chapterOf(row.chapter),
    playedAt: row.played_at,
  }));

const SESSION_SELECT = `
  SELECT listening_sessions.*, devices.name AS device_name
  FROM listening_sessions JOIN devices ON devices.id = listening_sessions.device_id`;

const PlayingFromRow = z
  .object({ queue: QueueType, kind: PlayingFromKind, source: MediaSource, upstream_id: z.string() })
  .transform((row) => ({
    queue: row.queue,
    from: { kind: row.kind, ref: { source: row.source, id: row.upstream_id } },
  }));

/** An entry as a client sees it, without what only the session keeps. */
const plain = (item: SessionItem | null): QueueItem | null =>
  item === null ? null : { itemId: item.itemId, ref: item.ref, ...chapterOf(item.chapter ?? null) };

const emptyQueue = (): SessionQueue => ({ current: null, position: null, user: [], context: null });

function readRow(db: Db, userId: string, deviceId: string): SessionRow | null {
  const raw = db
    .prepare(`${SESSION_SELECT} WHERE listening_sessions.device_id = ? AND devices.user_id = ?`)
    .get(deviceId, userId);
  return raw === undefined ? null : SessionRow.parse(raw);
}

function readQueues(db: Db, deviceId: string): Record<QueueType, SessionQueue> {
  const queues = { music: emptyQueue(), spoken: emptyQueue() };
  const rows = z
    .array(ItemRow)
    .parse(
      db
        .prepare('SELECT * FROM queue_items WHERE device_id = ? ORDER BY queue, segment, ord')
        .all(deviceId),
    );
  const froms = z
    .array(PlayingFromRow)
    .parse(db.prepare('SELECT * FROM playing_from WHERE device_id = ?').all(deviceId));
  for (const { queue, from } of froms) queues[queue].context = { from, items: [] };
  for (const { queue, segment, position, item, walk, replayOf } of rows) {
    const q = queues[queue];
    const marks = {
      ...(walk === null ? {} : { walk }),
      ...(replayOf === null ? {} : { replayOf }),
    };
    if (segment === 'current') {
      q.current = { ...item, ...marks };
      q.position = position;
    } else if (segment === 'user') {
      q.user.push({ ...item, ...marks, ...(position === null ? {} : { position }) });
    } else q.context?.items.push(item);
  }
  return queues;
}

function readHistory(db: Db, deviceId: string): HistoryEntry[] {
  return z
    .array(HistoryRow)
    .parse(db.prepare('SELECT * FROM play_history WHERE device_id = ? ORDER BY seq').all(deviceId));
}

function stored(db: Db, row: SessionRow): StoredSession {
  return {
    userId: row.user_id,
    deviceId: row.device_id,
    active: row.active,
    switchAfterCurrent: row.switch_after_current,
    queueStyle: row.queue_style,
    queues: readQueues(db, row.device_id),
    history: readHistory(db, row.device_id),
    rev: row.rev,
    updatedAt: row.updated_at,
  };
}

/**
 * This device's session, made empty on its first use: music active, YouTube Music style. Null
 * when the device is not this user's.
 */
export function openSession(
  db: Db,
  userId: string,
  deviceId: string,
  now: number = Date.now(),
): StoredSession | null {
  db.prepare(
    `INSERT INTO listening_sessions (device_id, user_id, active, rev, updated_at)
     SELECT id, user_id, 'music', 0, ? FROM devices WHERE id = ? AND user_id = ?
     ON CONFLICT (device_id) DO NOTHING`,
  ).run(now, deviceId, userId);
  const row = readRow(db, userId, deviceId);
  return row === null ? null : stored(db, row);
}

/** Every session this user has, one per device, oldest device first. */
export function listSessions(db: Db, userId: string): SessionSummary[] {
  const rows = z
    .array(SessionRow)
    .parse(
      db
        .prepare(`${SESSION_SELECT} WHERE devices.user_id = ? ORDER BY devices.created_at`)
        .all(userId),
    );
  return rows.map((row) => {
    const queues = readQueues(db, row.device_id);
    return {
      deviceId: row.device_id,
      deviceName: row.device_name,
      active: row.active,
      switchAfterCurrent: row.switch_after_current,
      queueStyle: row.queue_style,
      currents: { music: plain(queues.music.current), spoken: plain(queues.spoken.current) },
      rev: row.rev,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Writes this device's session whole, made from revision `rev`, and answers it at the next
 * revision. Throws `StaleRevision` when the session has moved past `rev`; null when the device
 * is not this user's or has no session yet. History keeps its newest `HISTORY_KEPT` plays.
 */
export function saveSession(
  db: Db,
  userId: string,
  deviceId: string,
  rev: number,
  value: SessionValue,
  now: number = Date.now(),
): StoredSession | null {
  return db.transaction(() => {
    const changed = db
      .prepare(
        `UPDATE listening_sessions
         SET active = ?, switch_after_current = ?, queue_style = ?, rev = rev + 1,
           updated_at = ?
         WHERE device_id = ? AND user_id = ? AND rev = ?`,
      )
      .run(
        value.active,
        value.switchAfterCurrent,
        value.queueStyle,
        now,
        deviceId,
        userId,
        rev,
      ).changes;
    if (changed === 0) {
      if (readRow(db, userId, deviceId) === null) return null;
      throw new StaleRevision(deviceId, rev);
    }
    writeQueues(db, deviceId, value.queues);
    writeHistory(db, deviceId, value.history);
    const row = readRow(db, userId, deviceId);
    if (row === null) throw new Error('invariant: the session just written is missing');
    return stored(db, row);
  })();
}

function writeQueues(db: Db, deviceId: string, queues: Record<QueueType, SessionQueue>): void {
  db.prepare('DELETE FROM queue_items WHERE device_id = ?').run(deviceId);
  db.prepare('DELETE FROM playing_from WHERE device_id = ?').run(deviceId);
  const insert = db.prepare(
    `INSERT INTO queue_items (device_id, queue, segment, ord, item_id, source, upstream_id,
       chapter, position_ms, position_at, walk, replay_of)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFrom = db.prepare(
    `INSERT INTO playing_from (device_id, queue, kind, source, upstream_id) VALUES (?, ?, ?, ?, ?)`,
  );
  const put = (
    queue: QueueType,
    segment: 'current' | 'user' | 'context',
    items: readonly SessionItem[],
    position: (item: SessionItem) => QueuePosition | null,
  ) =>
    items.forEach((item, ord) =>
      insert.run(
        deviceId,
        queue,
        segment,
        ord,
        item.itemId,
        item.ref.source,
        item.ref.id,
        item.chapter ?? null,
        position(item)?.ms ?? null,
        position(item)?.takenAt ?? null,
        segment === 'user' ? (item.walk ?? null) : null,
        segment === 'context' ? null : (item.replayOf ?? null),
      ),
    );
  for (const type of QueueType.options) {
    const q = queues[type];
    if (q.current === null && q.position !== null) {
      throw new PositionWithoutItem(deviceId, type);
    }
    put(type, 'current', q.current === null ? [] : [q.current], () => q.position);
    put(type, 'user', q.user, (item) => item.position ?? null);
    if (q.context === null) continue;
    const { from, items }: QueueContext = q.context;
    insertFrom.run(deviceId, type, from.kind, from.ref.source, from.ref.id);
    put(type, 'context', items, () => null);
  }
}

/** A play as stored: an absent chapter and an undefined one are the same play. */
const samePlay = (a: HistoryEntry, b: HistoryEntry) =>
  a.seq === b.seq &&
  a.queue === b.queue &&
  a.ref.source === b.ref.source &&
  a.ref.id === b.ref.id &&
  (a.chapter ?? null) === (b.chapter ?? null) &&
  a.playedAt === b.playedAt;

/**
 * History is append-only, and callers number the plays they append (the store does not). A save
 * names every stored play unchanged and adds new ones numbered past the newest stored, in order;
 * the only plays it may leave out are the oldest, as many as its new plays push past
 * `HISTORY_KEPT`. Anything else is refused with `HistoryRewritten`, whole.
 */
function writeHistory(db: Db, deviceId: string, history: readonly HistoryEntry[]): void {
  const before = readHistory(db, deviceId);
  const had = new Map(before.map((h) => [h.seq, h]));
  let newest = before.at(-1)?.seq ?? -1;
  const added: HistoryEntry[] = [];
  for (const h of [...history].sort((a, b) => a.seq - b.seq)) {
    const stored = had.get(h.seq);
    if (stored !== undefined) {
      if (!samePlay(stored, h)) throw new HistoryRewritten(deviceId, h.seq);
    } else if (h.seq <= newest) {
      throw new HistoryRewritten(deviceId, h.seq);
    } else {
      added.push(h);
      newest = h.seq;
    }
  }
  const named = new Set(history.map((h) => h.seq));
  const dropped = before.filter((h) => !named.has(h.seq));
  const pushedOut = Math.max(0, before.length + added.length - HISTORY_KEPT);
  const firstKept = before.findIndex((h) => named.has(h.seq));
  if (dropped.length > pushedOut || (firstKept !== -1 && firstKept !== dropped.length)) {
    throw new HistoryRewritten(deviceId, dropped[0]!.seq);
  }
  const insert = db.prepare(
    `INSERT INTO play_history (device_id, seq, queue, source, upstream_id, chapter, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const h of added.slice(-HISTORY_KEPT)) {
    insert.run(deviceId, h.seq, h.queue, h.ref.source, h.ref.id, h.chapter ?? null, h.playedAt);
  }
  db.prepare(
    `DELETE FROM play_history WHERE device_id = ? AND seq NOT IN
       (SELECT seq FROM play_history WHERE device_id = ? ORDER BY seq DESC LIMIT ?)`,
  ).run(deviceId, deviceId, HISTORY_KEPT);
}
