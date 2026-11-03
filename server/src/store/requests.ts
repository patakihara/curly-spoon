/**
 * Requests and who is on each (migration 16). A request is made by one person and joined by
 * anyone else who asks for the same thing (the same medium and catalogue id) while it is live;
 * one in the library no longer takes joiners, so asking again makes a new one. Every JSON column
 * is parsed on read.
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
import type { RequestState, WorkingStatus } from '../requests/machine.js';
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
  result: MediaRef | null;
  createdAt: number;
  updatedAt: number;
}

const json = <T extends z.ZodTypeAny>(schema: T) =>
  z.string().transform((text, ctx): z.infer<T> => {
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    return parsed.data as z.infer<T>;
  });

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
    result_source: MediaRef.shape.source.nullable(),
    result_id: z.string().nullable(),
    created_at: z.number().int(),
    updated_at: z.number().int(),
  })
  .transform((row): StoredRequest => ({
    id: row.id,
    medium: row.medium,
    target: row.target,
    state: stateOf(row),
    release: row.release,
    candidates: row.candidates,
    handle: row.handle,
    result:
      row.result_source === null || row.result_id === null
        ? null
        : MediaRef.parse({ source: row.result_source, id: row.result_id }),
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

/** The key one live request per medium holds: its medium's first catalogue id the target has. */
function catalogueKey(ref: RequestRef): string {
  const keys: readonly (keyof RequestIds)[] = REQUEST_ID_KEYS[ref.medium];
  for (const key of keys) {
    const value = ref.target.ids[key];
    if (value !== undefined) return `${key}:${value}`;
  }
  throw new Error(`invariant: a ${ref.medium} request names no catalogue id`);
}

const COLUMNS = `r.id, r.medium, r.target, r.status, r.failed_step, r.reason, r.progress, r.release,
  r.candidates, r.handle, r.result_source, r.result_id, r.created_at, r.updated_at`;

const parseRows = (rows: unknown[]): StoredRequest[] => rows.map((row) => RequestRow.parse(row));

/** One request by its id, or null. */
export function getRequest(db: Db, id: string): StoredRequest | null {
  const row: unknown = db.prepare(`SELECT ${COLUMNS} FROM requests r WHERE r.id = ?`).get(id);
  return row === undefined ? null : RequestRow.parse(row);
}

/**
 * Makes a request for a person, or joins them to the live one for the same medium and catalogue
 * id. Answers the request and whether it was joined.
 */
export function createRequest(
  db: Db,
  userId: string,
  ref: RequestRef,
  now: number,
): { request: StoredRequest; joined: boolean } {
  return db.transaction(() => {
    const key = catalogueKey(ref);
    const live = db
      .prepare(
        `SELECT id FROM requests WHERE medium = ? AND catalogue_key = ? AND status <> 'inLibrary'`,
      )
      .get(ref.medium, key) as { id: string } | undefined;
    const id = live?.id ?? randomUUID();
    if (live === undefined) {
      db.prepare(
        `INSERT INTO requests (id, medium, catalogue_key, target, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'requested', ?, ?)`,
      ).run(id, ref.medium, key, JSON.stringify(ref.target), now, now);
    }
    db.prepare(
      `INSERT INTO request_people (request_id, user_id, joined_at) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
    ).run(id, userId, now);
    const request = getRequest(db, id);
    if (request === null) throw new Error('invariant: the request just written is missing');
    return { request, joined: live !== undefined };
  })();
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
export function requestsOf(db: Db, userId: string): StoredRequest[] {
  return parseRows(
    db
      .prepare(
        `SELECT ${COLUMNS} FROM requests r JOIN request_people p ON p.request_id = r.id
         WHERE p.user_id = ? ORDER BY r.created_at, r.id`,
      )
      .all(userId),
  );
}

/** Every request the advance job moves: neither in the library nor failed, oldest first. */
export function workingRequests(db: Db): StoredRequest[] {
  return parseRows(
    db
      .prepare(
        `SELECT ${COLUMNS} FROM requests r WHERE r.status NOT IN ('inLibrary', 'failed')
         ORDER BY r.created_at, r.id`,
      )
      .all(),
  );
}

/** A change to a request: where it now stands, and any of what its steps keep. */
export interface RequestChange {
  state: RequestState;
  release?: Release | null;
  candidates?: Release[];
  handle?: DownloadHandle | null;
  result?: MediaRef | null;
}

/** Saves a change to a request; what the change leaves out stays as it was. */
export function saveRequest(db: Db, id: string, change: RequestChange, now: number): void {
  const { state } = change;
  const failed = state.status === 'failed' ? state : null;
  const set: Record<string, unknown> = {
    status: state.status,
    failed_step: failed?.failedStep ?? null,
    reason: failed?.reason ?? null,
    progress: state.status === 'downloading' ? state.progress : null,
    updated_at: now,
  };
  if (change.release !== undefined) set.release = change.release && JSON.stringify(change.release);
  if (change.candidates !== undefined) set.candidates = JSON.stringify(change.candidates);
  if (change.handle !== undefined) set.handle = change.handle && JSON.stringify(change.handle);
  if (change.result !== undefined) {
    set.result_source = change.result?.source ?? null;
    set.result_id = change.result?.id ?? null;
  }
  const columns = Object.keys(set);
  db.prepare(
    `UPDATE requests SET ${columns.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`,
  ).run({ ...set, id });
}

/** Deletes a request, as a cancel does, and everyone's place on it. */
export function deleteRequest(db: Db, id: string): void {
  db.prepare('DELETE FROM requests WHERE id = ?').run(id);
}
