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
  type QueueContext,
  type QueueItem,
  QueueStyle,
  QueueType,
} from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** Plays kept per device; older ones are forgotten. */
export const HISTORY_KEPT = 500;

/** One queue: its current item, your queue, and Spotify style's playing-from. */
export interface SessionQueue {
  current: QueueItem | null;
  user: QueueItem[];
  context: QueueContext | null;
}

/** Everything a session holds that the engine changes. History is oldest first, by `seq`. */
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
    from_source: MediaSource.nullable(),
    from_id: z.string().nullable(),
  })
  .transform((row) => ({
    queue: row.queue,
    segment: row.segment,
    from:
      row.from_source === null || row.from_id === null
        ? null
        : { source: row.from_source, id: row.from_id },
    item: {
      itemId: row.item_id,
      ref: { source: row.source, id: row.upstream_id },
      ...chapterOf(row.chapter),
    } satisfies QueueItem,
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

const emptyQueue = (): SessionQueue => ({ current: null, user: [], context: null });

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
  for (const { queue, segment, from, item } of rows) {
    const q = queues[queue];
    if (segment === 'current') q.current = item;
    else if (segment === 'user') q.user.push(item);
    else if (from !== null) {
      q.context ??= { from, items: [] };
      q.context.items.push(item);
    }
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
      currents: { music: queues.music.current, spoken: queues.spoken.current },
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
         SET active = ?, switch_after_current = ?, queue_style = ?, rev = rev + 1, updated_at = ?
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
  const insert = db.prepare(
    `INSERT INTO queue_items (device_id, queue, segment, ord, item_id, source, upstream_id,
       chapter, from_source, from_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const put = (
    queue: QueueType,
    segment: 'current' | 'user' | 'context',
    items: readonly QueueItem[],
    from: QueueContext['from'] | null = null,
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
        from?.source ?? null,
        from?.id ?? null,
      ),
    );
  for (const type of QueueType.options) {
    const q = queues[type];
    put(type, 'current', q.current === null ? [] : [q.current]);
    put(type, 'user', q.user);
    if (q.context !== null) put(type, 'context', q.context.items, q.context.from);
  }
}

/** Writes only what changed: plays added after the newest kept, and plays Back took off. */
function writeHistory(db: Db, deviceId: string, history: readonly HistoryEntry[]): void {
  const kept = new Set(history.map((h) => h.seq));
  const before = db.prepare('SELECT seq FROM play_history WHERE device_id = ?').all(deviceId) as {
    seq: number;
  }[];
  const had = new Set(before.map((r) => r.seq));
  const remove = db.prepare('DELETE FROM play_history WHERE device_id = ? AND seq = ?');
  for (const seq of had) if (!kept.has(seq)) remove.run(deviceId, seq);
  const insert = db.prepare(
    `INSERT INTO play_history (device_id, seq, queue, source, upstream_id, chapter, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const h of history.slice(-HISTORY_KEPT)) {
    if (had.has(h.seq)) continue;
    insert.run(deviceId, h.seq, h.queue, h.ref.source, h.ref.id, h.chapter ?? null, h.playedAt);
  }
  db.prepare(
    `DELETE FROM play_history WHERE device_id = ? AND seq NOT IN
       (SELECT seq FROM play_history WHERE device_id = ? ORDER BY seq DESC LIMIT ?)`,
  ).run(deviceId, deviceId, HISTORY_KEPT);
}
