/**
 * Requests and who is on each (migration 16). A request is made by one person and joined by
 * anyone else who asks for the same thing (the same medium and any one catalogue id) while it is
 * live; one in the library no longer takes joiners, so asking again makes a new one. Every JSON
 * column is parsed on read, and every change is parsed before it is written.
 */
import { randomUUID } from 'node:crypto';
import {
  MediaRef,
  REQUEST_ID_KEYS,
  RequestFailure,
  RequestMedium,
  type RequestIds,
  type RequestRef,
  RequestStatus,
  RequestTarget,
} from '@auralis/schema';
import { z } from 'zod';
import type { JobLog } from '../jobs/schedule.js';
import { onRoute, type RequestState, type WorkingStatus } from '../requests/machine.js';
import { DownloadHandle, Release } from '../requests/steps.js';
import type { Db } from './connection.js';

/** A request as stored: its target, where it stands, and what its medium's steps keep. */
export interface StoredRequest {
  id: string;
  medium: RequestMedium;
  target: RequestTarget;
  state: RequestState;
  release: Release | null;
  candidates: Release[];
  handle: DownloadHandle | null;
  /** The idempotency key of the step under way, saved before the step is called. */
  stepKey: string | null;
  result: MediaRef | null;
  /** When a download's bytes were last seen to move, which times a stall. */
  progressAt: number | null;
  /** When the upstream its step needs stopped answering, which times a hold; null while it answers. */
  heldSince: number | null;
  /** How many releases the job has started by itself after a stall; a person's choices don't count. */
  autoStarts: number;
  /** Counts saves: a save after a wait names the version it read, and loses to a newer one. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

const json = <T extends z.ZodTypeAny>(schema: T) =>
  z.string().transform((text, ctx): z.infer<T> => {
    const parsed = schema.safeParse(parseJson(text));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    return parsed.data as z.infer<T>;
  });

/** The value a column holds, or undefined for text that is not JSON, which no schema here takes. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const Working = RequestStatus.exclude(['inLibrary', 'failed']);

const RequestRow = z
  .object({
    id: z.string(),
    medium: RequestMedium,
    target: json(RequestTarget),
    status: RequestStatus,
    failed_step: Working.nullable(),
    reason: RequestFailure.nullable(),
    progress: z.number().nullable(),
    release: json(Release).nullable(),
    candidates: json(z.array(Release)),
    handle: json(DownloadHandle).nullable(),
    step_key: z.string().nullable(),
    version: z.number().int(),
    result_source: MediaRef.shape.source.nullable(),
    result_id: z.string().nullable(),
    progress_at: z.number().int().nullable(),
    held_since: z.number().int().nullable(),
    auto_starts: z.number().int(),
    created_at: z.number().int(),
    updated_at: z.number().int(),
  })
  .refine((row) => onRoute(row.medium, stateOf(row)), 'a status off its medium’s route')
  .transform((row): StoredRequest => ({
    id: row.id,
    medium: row.medium,
    target: row.target,
    state: stateOf(row),
    release: row.release,
    candidates: row.candidates,
    handle: row.handle,
    stepKey: row.step_key,
    version: row.version,
    result:
      row.result_source === null || row.result_id === null
        ? null
        : MediaRef.parse({ source: row.result_source, id: row.result_id }),
    progressAt: row.progress_at,
    heldSince: row.held_since,
    autoStarts: row.auto_starts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

function stateOf(row: {
  status: RequestStatus;
  failed_step: WorkingStatus | null;
  reason: RequestFailure | null;
  progress: number | null;
}): RequestState {
  if (row.status === 'failed') {
    if (row.failed_step === null || row.reason === null) throw new Error('invariant: failure');
    return { status: 'failed', failedStep: row.failed_step, reason: row.reason };
  }
  if (row.status === 'downloading') return { status: 'downloading', progress: row.progress ?? 0 };
  return { status: row.status };
}

/** Each catalogue id in the one form the join compares; the rest are one form by their schema. */
const NORMAL: Partial<Record<keyof RequestIds, (value: string) => string>> = {
  mbid: (value) => value.toLowerCase(),
  feedUrl: (value) => new URL(value).href,
};

/** The keys a request holds while it is live: every catalogue id of its medium the target has. */
function catalogueKeys(ref: RequestRef): string[] {
  const names: readonly (keyof RequestIds)[] = REQUEST_ID_KEYS[ref.medium];
  const keys = names.flatMap((name) => {
    const value = ref.target.ids[name];
    return value === undefined ? [] : [`${name}:${NORMAL[name]?.(value) ?? value}`];
  });
  if (keys.length === 0)
    throw new Error(`invariant: a ${ref.medium} request names no catalogue id`);
  return keys;
}

const COLUMNS = `r.id, r.medium, r.target, r.status, r.failed_step, r.reason, r.progress, r.release,
  r.candidates, r.handle, r.step_key, r.version, r.result_source, r.result_id, r.progress_at,
  r.held_since, r.auto_starts,
  r.created_at, r.updated_at`;

/**
 * The rows that can be read. One that cannot is left out and logged, so it never hides the others;
 * the log names where it failed, never what it held, as a release can hold a download's address.
 */
function readableRows(rows: unknown[], log?: JobLog): StoredRequest[] {
  return rows.flatMap((row) => {
    try {
      return [RequestRow.parse(row)];
    } catch (err) {
      log?.error(
        {
          request: (row as { id: string }).id,
          fields: err instanceof z.ZodError ? err.issues.map((i) => i.path.join('.')) : [],
        },
        'request row unreadable',
      );
      return [];
    }
  });
}

const isReadable = (row: unknown) => RequestRow.safeParse(row).success;

/** One request by its id, or null. */
export function getRequest(db: Db, id: string): StoredRequest | null {
  const row: unknown = db.prepare(`SELECT ${COLUMNS} FROM requests r WHERE r.id = ?`).get(id);
  return row === undefined ? null : RequestRow.parse(row);
}

/**
 * Makes a request for a person, or joins them to the live one sharing any catalogue id of the same
 * medium, the oldest if two do; it takes on any ids it did not have. Answers the request and
 * whether it was joined. A live row sharing an id that cannot be read never blocks this: it is
 * logged and deleted, as nothing can ever move it again, and everyone on it moves to the request
 * answered, so they all still get the item. Any download it had is left to its client.
 */
export function createRequest(
  db: Db,
  userId: string,
  ref: RequestRef,
  now: number,
  log?: JobLog,
): { request: StoredRequest; joined: boolean } {
  return db.transaction(() => {
    const keys = catalogueKeys(ref);
    const matches = db
      .prepare(
        `SELECT DISTINCT ${COLUMNS} FROM request_keys k JOIN requests r ON r.id = k.request_id
         WHERE k.medium = ? AND k.key IN (${keys.map(() => '?').join(', ')})
         ORDER BY r.created_at, r.id`,
      )
      .all(ref.medium, ...keys) as { id: string }[];
    const live = readableRows(matches, log)[0];
    const id = live?.id ?? randomUUID();
    if (live === undefined) {
      db.prepare(
        `INSERT INTO requests (id, medium, target, status, created_at, updated_at)
         VALUES (?, ?, ?, 'requested', ?, ?)`,
      ).run(id, ref.medium, JSON.stringify(ref.target), now, now);
    }
    for (const { id: other } of matches.filter((match) => !isReadable(match))) {
      db.prepare(
        `INSERT INTO request_people (request_id, user_id, joined_at)
         SELECT ?, user_id, joined_at FROM request_people WHERE request_id = ?
         ON CONFLICT DO NOTHING`,
      ).run(id, other);
      deleteRequest(db, other);
    }
    const addKey = db.prepare(
      'INSERT INTO request_keys (medium, key, request_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    );
    for (const key of keys) addKey.run(ref.medium, key, id);
    joinRequest(db, id, userId, now);
    const request = getRequest(db, id);
    if (request === null) throw new Error('invariant: the request just written is missing');
    return { request, joined: live !== undefined };
  })();
}

/** Puts a person on a request; one already on it stays as they were. */
export function joinRequest(db: Db, id: string, userId: string, now: number): void {
  db.prepare(
    `INSERT INTO request_people (request_id, user_id, joined_at) VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING`,
  ).run(id, userId, now);
}

/** Takes one person off a request. Taking the last one deletes it too. */
export function leaveRequest(db: Db, id: string, userId: string): void {
  db.prepare('DELETE FROM request_people WHERE request_id = ? AND user_id = ?').run(id, userId);
}

/** The ids of everyone on a request: who made it and who joined it. */
export function peopleOn(db: Db, id: string): string[] {
  return (
    db
      .prepare(
        'SELECT user_id FROM request_people WHERE request_id = ? ORDER BY joined_at, user_id',
      )
      .all(id) as { user_id: string }[]
  ).map((row) => row.user_id);
}

/** A person's requests, made or joined, oldest first. */
export function requestsOf(db: Db, userId: string, log?: JobLog): StoredRequest[] {
  return readableRows(
    db
      .prepare(
        `SELECT ${COLUMNS} FROM requests r JOIN request_people p ON p.request_id = r.id
         WHERE p.user_id = ? ORDER BY r.created_at, r.id`,
      )
      .all(userId) as unknown[],
    log,
  );
}

/** The requests a person's Requests page lists: not a podcast's, which is instant, nor one landed. */
export const requestsListed = (db: Db, userId: string, log?: JobLog): StoredRequest[] =>
  requestsOf(db, userId, log).filter(
    ({ medium, state }) => medium !== 'podcast' && state.status !== 'inLibrary',
  );

/** One of a person's requests, or null when it is not theirs, or is not there to read. */
export function requestOf(db: Db, id: string, userId: string, log?: JobLog): StoredRequest | null {
  const row: unknown = db
    .prepare(
      `SELECT ${COLUMNS} FROM requests r JOIN request_people p ON p.request_id = r.id
       WHERE r.id = ? AND p.user_id = ?`,
    )
    .get(id, userId);
  return row === undefined ? null : (readableRows([row], log)[0] ?? null);
}

/**
 * The requests for the same thing that have reached the library, by any catalogue id anyone on them
 * brought, newest first. These hold no live keys, so a request for the same thing does not join them.
 */
export function arrivedRequests(db: Db, ref: RequestRef, log?: JobLog): StoredRequest[] {
  const keys = catalogueKeys(ref);
  return readableRows(
    db
      .prepare(
        `SELECT DISTINCT ${COLUMNS} FROM arrived_keys k JOIN requests r ON r.id = k.request_id
         WHERE k.medium = ? AND k.key IN (${keys.map(() => '?').join(', ')})
         ORDER BY r.updated_at DESC, r.id`,
      )
      .all(ref.medium, ...keys) as unknown[],
    log,
  );
}

/** The live request for the same thing, the oldest if two share an id; failed ones are live too. */
export function liveRequest(db: Db, ref: RequestRef, log?: JobLog): StoredRequest | undefined {
  const keys = catalogueKeys(ref);
  return readableRows(
    db
      .prepare(
        `SELECT DISTINCT ${COLUMNS} FROM request_keys k JOIN requests r ON r.id = k.request_id
         WHERE k.medium = ? AND k.key IN (${keys.map(() => '?').join(', ')})
         ORDER BY r.created_at, r.id`,
      )
      .all(ref.medium, ...keys) as unknown[],
    log,
  )[0];
}

/** Puts a person on what has arrived; any catalogue id they brought finds it from now on. */
export function joinArrivedRequest(
  db: Db,
  id: string,
  userId: string,
  ref: RequestRef,
  now: number,
): void {
  db.transaction(() => {
    const addKey = db.prepare(
      'INSERT OR IGNORE INTO arrived_keys (medium, key, request_id) VALUES (?, ?, ?)',
    );
    for (const key of catalogueKeys(ref)) addKey.run(ref.medium, key, id);
    joinRequest(db, id, userId, now);
  })();
}

/** Every request the advance job moves: neither in the library nor failed, oldest first. */
export function workingRequests(db: Db, log?: JobLog): StoredRequest[] {
  return readableRows(
    db
      .prepare(
        `SELECT ${COLUMNS} FROM requests r WHERE r.status NOT IN ('inLibrary', 'failed')
         ORDER BY r.created_at, r.id`,
      )
      .all() as unknown[],
    log,
  );
}

/** A change to a request: where it now stands, and any of what its steps keep. */
export interface RequestChange {
  state: RequestState;
  release?: Release | null;
  candidates?: Release[];
  handle?: DownloadHandle | null;
  stepKey?: string | null;
  result?: MediaRef | null;
  progressAt?: number | null;
  autoStarts?: number;
}

/**
 * Saves a change to a request; what the change leaves out stays as it was. Answers whether it saved:
 * not when the row is gone, nor when `ifVersion` names a version the row has moved past, so a save
 * after a wait never overwrites newer state. Refuses, before writing, a change the row could not
 * then be read back from, such as a status off its medium's route. Any save ends a hold.
 */
export function saveRequest(
  db: Db,
  id: string,
  change: RequestChange,
  now: number,
  ifVersion?: number,
): boolean {
  const { state } = change;
  const failed = state.status === 'failed' ? state : null;
  const set: Record<string, unknown> = {
    status: state.status,
    failed_step: failed?.failedStep ?? null,
    reason: failed?.reason ?? null,
    progress: state.status === 'downloading' ? state.progress : null,
    updated_at: now,
    held_since: null,
  };
  if (change.release !== undefined) set.release = change.release && JSON.stringify(change.release);
  if (change.candidates !== undefined) set.candidates = JSON.stringify(change.candidates);
  if (change.handle !== undefined) set.handle = change.handle && JSON.stringify(change.handle);
  if (change.stepKey !== undefined) set.step_key = change.stepKey;
  if (change.progressAt !== undefined) set.progress_at = change.progressAt;
  if (change.autoStarts !== undefined) set.auto_starts = change.autoStarts;
  if (change.result !== undefined) {
    set.result_source = change.result?.source ?? null;
    set.result_id = change.result?.id ?? null;
  }
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as
    Record<string, unknown> | undefined;
  if (row === undefined) return false;
  if (ifVersion !== undefined && row.version !== ifVersion) return false;
  RequestRow.parse({ ...row, ...set });
  const columns = Object.keys(set);
  db.prepare(
    `UPDATE requests SET ${columns.map((c) => `${c} = @${c}`).join(', ')}, version = version + 1
     WHERE id = @id`,
  ).run({ ...set, id });
  return true;
}

/** Deletes a request, as a cancel does, and everyone's place on it. */
export function deleteRequest(db: Db, id: string): void {
  db.prepare('DELETE FROM requests WHERE id = ?').run(id);
}

/**
 * Notes that the upstream a request's step needs has stopped answering, unless that is already
 * noted. It is no save: nothing about the request changed, so no later save loses to it.
 */
export function markHeld(db: Db, id: string, now: number): void {
  db.prepare('UPDATE requests SET held_since = ? WHERE id = ? AND held_since IS NULL').run(now, id);
}

/** Notes that the upstream answered again. No save either, for the same reason. */
export function clearHeld(db: Db, id: string): void {
  db.prepare('UPDATE requests SET held_since = NULL WHERE id = ? AND held_since IS NOT NULL').run(
    id,
  );
}
