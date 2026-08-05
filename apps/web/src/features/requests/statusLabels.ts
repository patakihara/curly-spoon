import type { RequestStatus } from '../../api/types.js';

/**
 * Human-readable label for each `RequestStatus`, shown as the status pill in
 * `RequestList.tsx`. Extracted to its own module (rather than living inline in the
 * component, where it started) so `statusLabels.test.ts` can assert it stays exhaustive
 * without a React renderer — this repo's Vitest config has no jsdom, so nothing inside a
 * component can be exercised here at all.
 */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  searching: 'Searching',
  downloading: 'Downloading',
  importing: 'Importing',
  completed: 'Completed',
  // `importRequested` can't actually happen to a *book* request — it's music's own
  // terminal state (see `RequestStatus`'s doc comment in `api/types.ts`) — but
  // `RequestStatus` is one union shared by both request kinds, so `Record<RequestStatus,
  // string>` demands an entry here too. Worded identically to the music list's own label
  // for the same status, since one shared type should read the same everywhere it's shown.
  importRequested: 'Rescan requested',
  failed: 'Failed',
};
