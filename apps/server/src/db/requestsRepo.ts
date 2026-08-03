/**
 * One book someone asked for, from the ask to the file landing in the library.
 *
 * `release` freezes the release chosen at grab time (see migration 2's comment on
 * `release_json`): the indexer that offered it may stop listing it, or even disappear,
 * but the request has to keep being able to explain what it grabbed and from where.
 */

import type { Db } from './connection.js';
import type { RequestStatus } from '../requests/requestStatus.js';
import type { Release } from '../requests/types.js';

export interface BookRequest {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  status: RequestStatus;
  statusDetail: string | null;
  /** The release frozen at grab time. `null` when nothing has been chosen yet. */
  release: Release | null;
  indexerId: string | null;
  clientId: string | null;
  downloadHandle: string | null;
  /** 0..1. */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

interface RequestRow {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  status: string;
  status_detail: string | null;
  release_json: string | null;
  indexer_id: string | null;
  client_id: string | null;
  download_handle: string | null;
  progress: number;
  created_at: number;
  updated_at: number;
}

export interface CreateRequestInput {
  id: string;
  userId: string;
  title: string;
  author?: string | null;
  status: RequestStatus;
  release?: Release | null;
}

export interface ListRequestsFilter {
  status?: RequestStatus;
  userId?: string;
}

export type UpdateRequestPatch = Partial<
  Pick<
    BookRequest,
    'status' | 'statusDetail' | 'release' | 'indexerId' | 'clientId' | 'downloadHandle' | 'progress'
  >
>;

/**
 * A release that will not parse — or parses to something that is not an object — degrades
 * to `null` rather than throwing. An indexer can stop returning a release entirely, and the
 * database can be hand-edited; either way, a request row must stay readable enough to
 * explain the rest of itself (title, status, history) even when this one field is lost.
 * This is our own data, written only by `createRequest`/`updateRequest`, so a strict zod
 * re-parse here would turn a harmless future field addition into unreadable history — that
 * tradeoff belongs to `Release`'s own producers (the indexer clients), not to storage.
 */
function parseRelease(raw: string | null): Release | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Release;
  } catch {
    return null;
  }
}

function toRequest(row: RequestRow): BookRequest {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    author: row.author,
    status: row.status as RequestStatus,
    statusDetail: row.status_detail,
    release: parseRelease(row.release_json),
    indexerId: row.indexer_id,
    clientId: row.client_id,
    downloadHandle: row.download_handle,
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRequest(db: Db, input: CreateRequestInput): BookRequest {
  const now = Date.now();
  db.prepare(
    `INSERT INTO requests
       (id, user_id, title, author, status, status_detail, release_json, indexer_id,
        client_id, download_handle, progress, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, 0, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.title,
    input.author ?? null,
    input.status,
    input.release ? JSON.stringify(input.release) : null,
    now,
    now,
  );
  const created = getRequest(db, input.id);
  // Written in the same connection immediately above; this cannot be null in practice.
  if (!created) throw new Error(`request ${input.id} vanished immediately after write`);
  return created;
}

export function getRequest(db: Db, id: string): BookRequest | null {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  return row ? toRequest(row) : null;
}

/** Newest first by `created_at`, tie-broken by `id` so equal timestamps still sort stably. */
export function listRequests(db: Db, filter: ListRequestsFilter = {}): BookRequest[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status !== undefined) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.userId !== undefined) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM requests ${where} ORDER BY created_at DESC, id ASC`)
    .all(...params) as RequestRow[];
  return rows.map(toRequest);
}

const PATCH_COLUMNS: Record<keyof UpdateRequestPatch, string> = {
  status: 'status',
  statusDetail: 'status_detail',
  release: 'release_json',
  indexerId: 'indexer_id',
  clientId: 'client_id',
  downloadHandle: 'download_handle',
  progress: 'progress',
};

export function updateRequest(db: Db, id: string, patch: UpdateRequestPatch): BookRequest | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of Object.keys(patch) as (keyof UpdateRequestPatch)[]) {
    // A patch built by spread (`{ ...x, field: cond ? y : undefined }`) can carry a key
    // whose value is `undefined` without the caller meaning to touch it. better-sqlite3
    // binds `undefined` as `NULL` rather than rejecting it, so treating "key present" as
    // "write it" would silently erase the column — explicit `undefined` means "absent",
    // same as an omitted key.
    if (patch[key] === undefined) continue;
    const column = PATCH_COLUMNS[key];
    const value =
      key === 'release' ? (patch.release ? JSON.stringify(patch.release) : null) : patch[key];
    sets.push(`${column} = ?`);
    params.push(value);
  }
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);

  db.prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getRequest(db, id);
}

export function deleteRequest(db: Db, id: string): void {
  db.prepare('DELETE FROM requests WHERE id = ?').run(id);
}
