import type { RequestStatus } from '../../api/types.js';

/**
 * Human-readable label for each `RequestStatus`, shown as the status pill in
 * `MusicRequestList.tsx`. Extracted to its own module (rather than living inline in the
 * component, where it started) so `musicRequestStatusLabels.test.ts` can assert it stays
 * exhaustive without a React renderer — this repo's Vitest config has no jsdom, so
 * nothing inside a component can be exercised here at all.
 *
 * Exhaustive against the shared `RequestStatus` type, but `importing`/`completed` are
 * unreachable for a music row today — `musicRequestService.ts`'s `grab()` never moves a
 * request past `downloading` on its own, and nothing in production currently schedules
 * `pollOne` to advance it further (see `docs/HANDOVER.md`'s "pollDownloads is not wired to
 * any scheduler" note). Kept in the map anyway so this stays a total function rather than
 * a silent `undefined` in the UI if that gap closes.
 */
export const MUSIC_REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  searching: 'Searching',
  downloading: 'Downloading',
  importing: 'Importing',
  completed: 'Completed',
  // Says "requested", not "found" or "added" — Auralis has asked Jellyfin to rescan its
  // library at this point, but that call is fire-and-forget with no way to confirm the
  // rescan actually located the file (`musicRequestService.ts`'s header comment, and
  // `JellyfinClient.refreshItem`'s own doc comment). A label implying completion would be
  // a claim this codebase cannot back up.
  importRequested: 'Rescan requested',
  failed: 'Failed',
};
