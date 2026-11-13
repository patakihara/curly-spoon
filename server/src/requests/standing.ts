/**
 * Where a person stands with a request Search offers: a book or an album the library lacks.
 */
import type { MediaRef, RequestRef, RequestStatus } from '@auralis/schema';
import { indexedRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import { arrivedRequests, liveRequest, peopleOn } from '../store/requests.js';

/**
 * Where this person should see a request for this book or album stand, or null. A request shows only to those
 * on it, and one that reached the library only while the index still holds it. Anyone else sees a row
 * to ask from, and nothing of the request: asking joins it, and it shows from then on.
 */
export function requestStanding(
  db: Db,
  userId: string,
  ref: RequestRef,
  owned: boolean,
): { status: RequestStatus; progress: number | null; item: MediaRef | null } | null | 'owned' {
  const live = liveRequest(db, ref);
  const isMine = (id: string) => peopleOn(db, id).includes(userId);
  const mine = live !== undefined && isMine(live.id) ? live : undefined;
  if (mine !== undefined && mine.state.status !== 'failed') {
    const progress = mine.state.status === 'downloading' ? mine.state.progress : null;
    return { status: mine.state.status, progress, item: null };
  }
  const arrived = arrivedRequests(db, ref).find(
    ({ id, result }) =>
      result !== null && isMine(id) && indexedRow(db, result.source, result.id) !== undefined,
  );
  if (arrived?.result) return { status: 'inLibrary', progress: null, item: arrived.result };
  if (owned) return 'owned';
  return mine === undefined ? null : { status: 'failed', progress: null, item: null };
}
