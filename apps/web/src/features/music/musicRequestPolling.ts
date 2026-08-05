/**
 * Whether the music request list should keep polling `GET /music-requests`.
 *
 * Deliberately **not** a reuse of `features/requests/polling.ts`'s `shouldPollRequests`,
 * even though the two look similar: that function polls while a request is `downloading`,
 * because a book's `downloading` status is updated from the outside by
 * `requestService.ts`'s `pollDownloads` as the torrent progresses. The music pipeline has
 * no equivalent — `musicRequestService.ts`'s file comment explains why there is no
 * `pollDownloads` here — so once a music request reaches `downloading` nothing will ever
 * change it again except a person deleting it. Polling it would just be a phone burning
 * battery to refetch a row that cannot move, and `MusicRequestList.tsx` deliberately does
 * not render a progress bar for the same reason (there is no progress to show).
 *
 * `pending`/`approved`/`searching` are still worth polling for: this app auto-grabs a
 * request the moment it is created or approved (see `MusicRequestList.tsx` and
 * `MusicRequestSearchPanel.tsx`), so in the common single-tab case those states are
 * momentary. But `GET /music-requests` is unscoped by caller (a recorded product
 * decision, `docs/HANDOVER.md` §2) — a second signed-in user or tab can approve a request
 * this tab only sees as `pending`, and this tab should still notice.
 */
import type { MusicRequest, RequestStatus } from '../../api/types.js';

const PROGRESSING_STATUSES: ReadonlySet<RequestStatus> = new Set([
  'pending',
  'approved',
  'searching',
]);

export function shouldPollMusicRequests(requests: readonly MusicRequest[]): boolean {
  return requests.some((request) => PROGRESSING_STATUSES.has(request.status));
}

/** Same cadence as the book pipeline's `REQUEST_POLL_INTERVAL_MS` — no reason for the two
 * to drift apart. */
export const MUSIC_REQUEST_POLL_INTERVAL_MS = 5_000;
