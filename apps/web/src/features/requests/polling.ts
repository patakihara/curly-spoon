/**
 * Whether the request list should keep polling `GET /requests`.
 *
 * `completed` and `rejected` are terminal — nothing moves a request out of them
 * again. `failed` is deliberately *not* treated as terminal-for-polling-purposes
 * in the "stop forever" sense, but it also isn't included below: nothing
 * progresses a failed request on its own, only a user-initiated retry does, so
 * polling one contributes nothing and would just drain a phone's battery. Every
 * status below can change without the user doing anything (a search running, a
 * torrent downloading, an import completing) — that's what's worth polling for.
 */
import type { BookRequest, RequestStatus } from '../../api/types.js';

const PROGRESSING_STATUSES: ReadonlySet<RequestStatus> = new Set([
  'pending',
  'approved',
  'searching',
  'downloading',
  'importing',
]);

export function shouldPollRequests(requests: readonly BookRequest[]): boolean {
  return requests.some((request) => PROGRESSING_STATUSES.has(request.status));
}

/** Polling cadence while `shouldPollRequests` is true. */
export const REQUEST_POLL_INTERVAL_MS = 5_000;
