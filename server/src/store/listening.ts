/**
 * Listening sessions: one per device, made on its first use and deleted with the device. A
 * session is read and written whole, as a value the queue engine works on. Every write names the
 * revision it was made from; one made from an older revision is refused with `StaleRevision`, so
 * two tabs on one device cannot overwrite each other.
 */

import {
  type HistoryEntry,
  type ListeningSession,
  type MediaRef,
  MediaSource,
  PlayingFromKind,
  QueueContext,
  QueueItem,
  QueuePosition,
  QueueStyle,
  QueueType,
} from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

/** Plays kept per device; older ones are forgotten. */
export const HISTORY_KEPT = 500;

/**
 * A queue entry as the session keeps it. `walk` marks the entries of a walk Back started, which
 * Forward plays first, in queue order; across the two queues, the lowest goes first. `replayOf`
 * is the play (its `seq`) the entry plays again: it is already in history, so ending it records
 * nothing. `after`, on a current item that is no replay, is the play that played immediately
 * before it, where Back returns. `position` is where the device was in an entry of your queue
 * when it was last current.
 */
export interface SessionItem extends QueueItem {
  walk?: number;
  replayOf?: number;
  after?: number;
  position?: QueuePosition;
}

/** A queue entry before it has an id: an item, and which chapter when it is a book's. */
export type QueueEntry = Omit<QueueItem, 'itemId'>;

/**
 * Autoplay's pick for one queue, worked out ahead from the item it follows (`after`): what plays
 * once that item ends with nothing queued after it. `next` is null when nothing is left.
 */
export interface AutoplayPick {
  after: QueueEntry;
  next: QueueEntry | null;
}

/** Music's radio run: what Instant Mix answered for `seed`, kept until every track has played. */
export interface RadioRun {
  seed: MediaRef;
  tracks: MediaRef[];
}

/**
 * A play as the session keeps it: `after` is the play it followed, absent for one that followed
 * none. Back walks plays in the order this gives, not in `seq` order. `list` is the digest it was
 * played in, absent for a play of your own queue.
 */
export interface SessionPlay extends HistoryEntry {
  after?: number;
  list?: string;
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
 * A spoken queue put aside on entering a digest's queue, with its autoplay pick: `owner` is null
 * for your own queue, or the digest's id for a digest's. Playing its current item, or its next
 * once that ended, brings it back.
 */
export interface SavedQueue {
  owner: string | null;
  queue: SessionQueue;
  autoplay: AutoplayPick | null;
  savedAt: number;
}

/**
 * Everything a session holds that the engine changes. History is oldest first, by `seq`, and
 * append-only: Back walks it in the order things played and never takes a play out.
 */
export interface SessionValue {
  active: QueueType;
  switchAfterCurrent: QueueType | null;
  queueStyle: QueueStyle;
  queues: Record<QueueType, SessionQueue>;
  history: SessionPlay[];
  /** Each queue's autoplay pick, or null when none has been worked out for it. */
  autoplay: Record<QueueType, AutoplayPick | null>;
  radio: RadioRun | null;
  /** When autoplay was last worked out for the session (ms), or null when it never was. */
  autoplayAt: number | null;
  /** The digest whose queue the spoken queue is now, or null when it is your own. */
  spokenDigest: string | null;
  /** The spoken queues put aside, at most one per owner, oldest first. */
  saved: SavedQueue[];
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

/** A spoken digest or saved queue owner that is not one of this person's digests. */
export class NotYourDigest extends Error {
  constructor(
    readonly deviceId: string,
    readonly listId: string,
  ) {
    super(`listening session ${deviceId}: ${listId} is not one of its person's digests`);
    this.name = 'NotYourDigest';
  }
}

/** Two saved queues of one owner (null: your own queue). */
export class DuplicateSavedQueue extends Error {
  constructor(
    readonly deviceId: string,
    readonly owner: string | null,
  ) {
    super(`listening session ${deviceId}: two saved queues of ${owner ?? 'its own'}`);
    this.name = 'DuplicateSavedQueue';
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
  radio_seed_source: MediaSource.nullable(),
  radio_seed_id: z.string().nullable(),
  autoplay_at: z.number().nullable(),
  spoken_digest: z.string().nullable(),
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
    after: z.number().int().nonnegative().nullable(),
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
    after: row.after,
  }));

const HistoryRow = z
  .object({
    seq: z.number().int().nonnegative(),
    queue: QueueType,
    source: MediaSource,
    upstream_id: z.string(),
    chapter: z.number().int().nonnegative().nullable(),
    played_at: z.number().int(),
    after: z.number().int().nonnegative().nullable(),
    list_id: z.string().nullable(),
  })
  .transform((row): SessionPlay => ({
    seq: row.seq,
    queue: row.queue,
    ref: { source: row.source, id: row.upstream_id },
    ...chapterOf(row.chapter),
    playedAt: row.played_at,
    ...(row.after === null ? {} : { after: row.after }),
    ...(row.list_id === null ? {} : { list: row.list_id }),
  }));

const entryOf = (source: MediaSource, id: string, chapter: number | null): QueueEntry => ({
  ref: { source, id },
  ...chapterOf(chapter),
});

const PickRow = z
  .object({
    queue: QueueType,
    after_source: MediaSource,
    after_upstream_id: z.string(),
    after_chapter: z.number().int().nonnegative().nullable(),
    source: MediaSource.nullable(),
    upstream_id: z.string().nullable(),
    chapter: z.number().int().nonnegative().nullable(),
  })
  .transform((row) => ({
    queue: row.queue,
    pick: {
      after: entryOf(row.after_source, row.after_upstream_id, row.after_chapter),
      next:
        row.source === null || row.upstream_id === null
          ? null
          : entryOf(row.source, row.upstream_id, row.chapter),
    } satisfies AutoplayPick,
  }));

/** A saved queue's JSON, as `writeSaved` writes it; the store's own, so a misread throws. */
const SavedItem = QueueItem.extend({
  walk: z.number().int().optional(),
  replayOf: z.number().int().nonnegative().optional(),
  after: z.number().int().nonnegative().optional(),
  position: QueuePosition.optional(),
});
const SavedQueueJson = z.object({
  current: SavedItem.nullable(),
  position: QueuePosition.nullable(),
  user: z.array(SavedItem),
  context: QueueContext.nullable(),
});
const SavedEntry = QueueItem.omit({ itemId: true });
const SavedPickJson = z.object({ after: SavedEntry, next: SavedEntry.nullable() });
const json = (text: string): unknown => JSON.parse(text);

const SavedRow = z
  .object({
    owner: z.string(),
    queue: z.string().transform(json).pipe(SavedQueueJson),
    autoplay: z.string().transform(json).pipe(SavedPickJson).nullable(),
    saved_at: z.number().int(),
  })
  .transform((row): SavedQueue => ({
    owner: row.owner === '' ? null : row.owner,
    queue: row.queue,
    autoplay: row.autoplay,
    savedAt: row.saved_at,
  }));

const RadioTrackRow = z
  .object({ source: MediaSource, upstream_id: z.string() })
  .transform((row): MediaRef => ({ source: row.source, id: row.upstream_id }));

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
  for (const { queue, segment, position, item, walk, replayOf, after } of rows) {
    const q = queues[queue];
    const marks = {
      ...(walk === null ? {} : { walk }),
      ...(replayOf === null ? {} : { replayOf }),
      ...(after === null ? {} : { after }),
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

function readHistory(db: Db, deviceId: string): SessionPlay[] {
  return z
    .array(HistoryRow)
    .parse(db.prepare('SELECT * FROM play_history WHERE device_id = ? ORDER BY seq').all(deviceId));
}

function readAutoplay(db: Db, deviceId: string): Record<QueueType, AutoplayPick | null> {
  const autoplay: Record<QueueType, AutoplayPick | null> = { music: null, spoken: null };
  const rows = z
    .array(PickRow)
    .parse(db.prepare('SELECT * FROM autoplay_picks WHERE device_id = ?').all(deviceId));
  for (const { queue, pick } of rows) autoplay[queue] = pick;
  return autoplay;
}

function readSaved(db: Db, deviceId: string): SavedQueue[] {
  return z
    .array(SavedRow)
    .parse(
      db
        .prepare('SELECT * FROM saved_queues WHERE device_id = ? ORDER BY saved_at, owner')
        .all(deviceId),
    );
}

function readRadio(db: Db, row: SessionRow): RadioRun | null {
  if (row.radio_seed_source === null || row.radio_seed_id === null) return null;
  const tracks = z
    .array(RadioTrackRow)
    .parse(
      db.prepare('SELECT * FROM radio_tracks WHERE device_id = ? ORDER BY ord').all(row.device_id),
    );
  return { seed: { source: row.radio_seed_source, id: row.radio_seed_id }, tracks };
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
    autoplay: readAutoplay(db, row.device_id),
    radio: readRadio(db, row),
    autoplayAt: row.autoplay_at,
    spokenDigest: row.spoken_digest,
    saved: readSaved(db, row.device_id),
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
 * is not this user's or has no session yet. History keeps its newest `HISTORY_KEPT` plays. A
 * spoken digest or saved queue owner that is not this user's digest is refused with
 * `NotYourDigest`, two saved queues of one owner with `DuplicateSavedQueue`.
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
    checkDigests(db, userId, deviceId, value);
    const changed = db
      .prepare(
        `UPDATE listening_sessions
         SET active = ?, switch_after_current = ?, queue_style = ?, rev = rev + 1,
           updated_at = ?, radio_seed_source = ?, radio_seed_id = ?, autoplay_at = ?,
           spoken_digest = ?
         WHERE device_id = ? AND user_id = ? AND rev = ?`,
      )
      .run(
        value.active,
        value.switchAfterCurrent,
        value.queueStyle,
        now,
        value.radio?.seed.source ?? null,
        value.radio?.seed.id ?? null,
        value.autoplayAt,
        value.spokenDigest,
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
    writeAutoplay(db, deviceId, value.autoplay, value.radio);
    writeSaved(db, deviceId, value.saved);
    const row = readRow(db, userId, deviceId);
    if (row === null) throw new Error('invariant: the session just written is missing');
    return stored(db, row);
  })();
}

/**
 * Keeps autoplay's picks, music's radio run and when autoplay ran, worked out from revision
 * `rev`, without moving the revision: they are no change to what is queued. Nothing is written,
 * and false answered, when the session has moved past `rev` (the change that moved it works the
 * picks out again) or the device is not this user's.
 */
export function saveAutoplay(
  db: Db,
  userId: string,
  deviceId: string,
  rev: number,
  value: Pick<SessionValue, 'autoplay' | 'radio' | 'autoplayAt'>,
): boolean {
  return db.transaction(() => {
    const changed = db
      .prepare(
        `UPDATE listening_sessions SET radio_seed_source = ?, radio_seed_id = ?, autoplay_at = ?
         WHERE device_id = ? AND user_id = ? AND rev = ?`,
      )
      .run(
        value.radio?.seed.source ?? null,
        value.radio?.seed.id ?? null,
        value.autoplayAt,
        deviceId,
        userId,
        rev,
      ).changes;
    if (changed === 0) return false;
    writeAutoplay(db, deviceId, value.autoplay, value.radio);
    return true;
  })();
}

/**
 * Keeps where this device is in `queue`'s current item, when that item is still `itemId`, without
 * moving the revision. False when it is not, or the device is not this user's.
 */
export function savePosition(
  db: Db,
  userId: string,
  deviceId: string,
  queue: QueueType,
  itemId: string,
  position: QueuePosition,
): boolean {
  return (
    db
      .prepare(
        `UPDATE queue_items SET position_ms = ?, position_at = ?
         WHERE device_id = ? AND queue = ? AND segment = 'current' AND item_id = ?
           AND EXISTS (SELECT 1 FROM listening_sessions
             WHERE device_id = queue_items.device_id AND user_id = ?)`,
      )
      .run(position.ms, position.takenAt, deviceId, queue, itemId, userId).changes > 0
  );
}

function writeQueues(db: Db, deviceId: string, queues: Record<QueueType, SessionQueue>): void {
  db.prepare('DELETE FROM queue_items WHERE device_id = ?').run(deviceId);
  db.prepare('DELETE FROM playing_from WHERE device_id = ?').run(deviceId);
  const insert = db.prepare(
    `INSERT INTO queue_items (device_id, queue, segment, ord, item_id, source, upstream_id,
       chapter, position_ms, position_at, walk, replay_of, after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        segment === 'current' ? (item.after ?? null) : null,
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

function writeAutoplay(
  db: Db,
  deviceId: string,
  autoplay: Record<QueueType, AutoplayPick | null>,
  radio: RadioRun | null,
): void {
  db.prepare('DELETE FROM autoplay_picks WHERE device_id = ?').run(deviceId);
  db.prepare('DELETE FROM radio_tracks WHERE device_id = ?').run(deviceId);
  const insertPick = db.prepare(
    `INSERT INTO autoplay_picks (device_id, queue, after_source, after_upstream_id, after_chapter,
       source, upstream_id, chapter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const queue of QueueType.options) {
    const pick = autoplay[queue];
    if (pick === null) continue;
    insertPick.run(
      deviceId,
      queue,
      pick.after.ref.source,
      pick.after.ref.id,
      pick.after.chapter ?? null,
      pick.next?.ref.source ?? null,
      pick.next?.ref.id ?? null,
      pick.next?.chapter ?? null,
    );
  }
  const insertTrack = db.prepare(
    'INSERT INTO radio_tracks (device_id, ord, source, upstream_id) VALUES (?, ?, ?, ?)',
  );
  radio?.tracks.forEach((track, ord) => insertTrack.run(deviceId, ord, track.source, track.id));
}

/** Every digest a session names, as its spoken queue's or a saved queue's, is its person's own. */
function checkDigests(db: Db, userId: string, deviceId: string, value: SessionValue): void {
  const digests = new Set(
    z
      .array(z.object({ id: z.string() }))
      .parse(db.prepare("SELECT id FROM lists WHERE user_id = ? AND kind = 'digest'").all(userId))
      .map((r) => r.id),
  );
  const named = [value.spokenDigest, ...value.saved.map((q) => q.owner)];
  for (const id of named) {
    if (id !== null && !digests.has(id)) throw new NotYourDigest(deviceId, id);
  }
}

/** One entry as `writeQueues` keeps it in `segment`: the marks only that segment has. */
function kept(item: SessionItem, segment: 'current' | 'user' | 'context'): SessionItem {
  return {
    itemId: item.itemId,
    ref: item.ref,
    ...chapterOf(item.chapter ?? null),
    ...(segment === 'user' && item.walk !== undefined ? { walk: item.walk } : {}),
    ...(segment !== 'context' && item.replayOf !== undefined ? { replayOf: item.replayOf } : {}),
    ...(segment === 'current' && item.after !== undefined ? { after: item.after } : {}),
    ...(segment === 'user' && item.position !== undefined ? { position: item.position } : {}),
  };
}

/** A saved queue as a live one is kept, refused on what `writeQueues` refuses. */
function keptQueue(deviceId: string, q: SessionQueue): SessionQueue {
  if (q.current === null && q.position !== null) throw new PositionWithoutItem(deviceId, 'spoken');
  return {
    current: q.current === null ? null : kept(q.current, 'current'),
    position: q.position,
    user: q.user.map((item) => kept(item, 'user')),
    context:
      q.context === null
        ? null
        : { from: q.context.from, items: q.context.items.map((item) => kept(item, 'context')) },
  };
}

function writeSaved(db: Db, deviceId: string, saved: readonly SavedQueue[]): void {
  db.prepare('DELETE FROM saved_queues WHERE device_id = ?').run(deviceId);
  const insert = db.prepare(
    'INSERT INTO saved_queues (device_id, owner, queue, autoplay, saved_at) VALUES (?, ?, ?, ?, ?)',
  );
  const owners = new Set<string | null>();
  for (const { owner, queue, autoplay, savedAt } of saved) {
    if (owners.has(owner)) throw new DuplicateSavedQueue(deviceId, owner);
    owners.add(owner);
    insert.run(
      deviceId,
      owner ?? '',
      JSON.stringify(keptQueue(deviceId, queue)),
      autoplay === null ? null : JSON.stringify(autoplay),
      savedAt,
    );
  }
}

/** A play as stored: an absent chapter and an undefined one are the same play. */
const samePlay = (a: SessionPlay, b: SessionPlay) =>
  a.seq === b.seq &&
  a.queue === b.queue &&
  a.ref.source === b.ref.source &&
  a.ref.id === b.ref.id &&
  (a.chapter ?? null) === (b.chapter ?? null) &&
  a.playedAt === b.playedAt &&
  (a.after ?? null) === (b.after ?? null) &&
  (a.list ?? null) === (b.list ?? null);

/**
 * History is append-only, and callers number the plays they append (the store does not). A save
 * names every stored play unchanged and adds new ones numbered past the newest stored, in order;
 * the only plays it may leave out are the oldest, as many as its new plays push past
 * `HISTORY_KEPT`. Anything else is refused with `HistoryRewritten`, whole.
 */
function writeHistory(db: Db, deviceId: string, history: readonly SessionPlay[]): void {
  const before = readHistory(db, deviceId);
  const had = new Map(before.map((h) => [h.seq, h]));
  let newest = before.at(-1)?.seq ?? -1;
  const added: SessionPlay[] = [];
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
    `INSERT INTO play_history (device_id, seq, queue, source, upstream_id, chapter, played_at,
       after, list_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const h of added.slice(-HISTORY_KEPT)) {
    insert.run(
      deviceId,
      h.seq,
      h.queue,
      h.ref.source,
      h.ref.id,
      h.chapter ?? null,
      h.playedAt,
      h.after ?? null,
      h.list ?? null,
    );
  }
  db.prepare(
    `DELETE FROM play_history WHERE device_id = ? AND seq NOT IN
       (SELECT seq FROM play_history WHERE device_id = ? ORDER BY seq DESC LIMIT ?)`,
  ).run(deviceId, deviceId, HISTORY_KEPT);
}
