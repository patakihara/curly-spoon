/**
 * One thing someone asked for — a book or a piece of music — from the ask to the file
 * landing in the library. One table, one repo, shared by both: see migration 4's comment
 * in `db/migrations.ts` for why a `media_type` column won over a second table.
 *
 * `release` freezes the release chosen at grab time (see migration 2's comment on
 * `release_json`): the indexer that offered it may stop listing it, or even disappear,
 * but the request has to keep being able to explain what it grabbed and from where.
 * `candidate` is the music pipeline's equivalent, frozen the same way (migration 4).
 */

import type { Db } from './connection.js';
import type { RequestStatus } from '../requests/requestStatus.js';
import type { MusicCandidate, Release } from '../requests/types.js';

/** What a request row is for. Drives which of `release`/`candidate` is populated and
 * which route set (`routes/requests.ts` vs `routes/musicRequests.ts`) may act on it. */
export type MediaType = 'book' | 'music';

export interface MediaRequest {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  status: RequestStatus;
  statusDetail: string | null;
  mediaType: MediaType;
  /** The release frozen at grab time. `null` for a music row, or a book row nothing has
   * been chosen for yet. */
  release: Release | null;
  /** The candidate frozen at creation time (`music/slskd.ts`'s `add` needs the whole
   * object, not just its `guid`). `null` for a book row, or a music row predating this
   * column. */
  candidate: MusicCandidate | null;
  indexerId: string | null;
  clientId: string | null;
  downloadHandle: string | null;
  /** 0..1. */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

/** Kept as the name every existing book-pipeline import already uses
 * (`requestService.ts`, `routes/requests.ts`, their tests) — every request row is now a
 * `MediaRequest`, book or music, so `MediaRequest` is the honest name for new code, and
 * this alias is what keeps the rename from rippling anywhere it doesn't need to. */
export type BookRequest = MediaRequest;

interface RequestRow {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  status: string;
  status_detail: string | null;
  media_type: string;
  release_json: string | null;
  candidate_json: string | null;
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
  /** Defaults to `'book'` — every call site that predates the music pipeline stays
   * correct without being touched. */
  mediaType?: MediaType;
  release?: Release | null;
  candidate?: MusicCandidate | null;
}

export interface ListRequestsFilter {
  /**
   * Required, deliberately — not defaulted to "every media type". `GET /requests` (books)
   * and `pollDownloads` both need to see only their own kind, and a caller that forgets to
   * say which one is exactly the bug this field being optional would hide: a music request
   * reaching `downloading` would otherwise be picked up by the book poller, which cannot
   * find a `slskd` download client and fails it. Making this required turns that into a
   * compile error at every call site instead of a runtime misfire.
   */
  mediaType: MediaType;
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

/** Same lenient-degrade contract as `parseRelease` above, and the same reasoning: this is
 * our own data, written only by `createRequest`, so a strict re-parse would turn a
 * harmless future field addition into unreadable history. */
function parseCandidate(raw: string | null): MusicCandidate | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as MusicCandidate;
  } catch {
    return null;
  }
}

function toRequest(row: RequestRow): MediaRequest {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    author: row.author,
    status: row.status as RequestStatus,
    statusDetail: row.status_detail,
    mediaType: row.media_type as MediaType,
    release: parseRelease(row.release_json),
    candidate: parseCandidate(row.candidate_json),
    indexerId: row.indexer_id,
    clientId: row.client_id,
    downloadHandle: row.download_handle,
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRequest(db: Db, input: CreateRequestInput): MediaRequest {
  const now = Date.now();
  db.prepare(
    `INSERT INTO requests
       (id, user_id, title, author, status, status_detail, media_type, release_json,
        candidate_json, indexer_id, client_id, download_handle, progress, created_at,
        updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.title,
    input.author ?? null,
    input.status,
    input.mediaType ?? 'book',
    input.release ? JSON.stringify(input.release) : null,
    input.candidate ? JSON.stringify(input.candidate) : null,
    now,
    now,
  );
  const created = getRequest(db, input.id);
  // Written in the same connection immediately above; this cannot be null in practice.
  if (!created) throw new Error(`request ${input.id} vanished immediately after write`);
  return created;
}

export function getRequest(db: Db, id: string): MediaRequest | null {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  return row ? toRequest(row) : null;
}

/** Newest first by `created_at`, tie-broken by `id` so equal timestamps still sort stably. */
export function listRequests(db: Db, filter: ListRequestsFilter): MediaRequest[] {
  const conditions: string[] = ['media_type = ?'];
  const params: unknown[] = [filter.mediaType];
  if (filter.status !== undefined) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.userId !== undefined) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
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
