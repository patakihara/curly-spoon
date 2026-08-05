import { describe, expect, it } from 'vitest';
import type { RequestStatus } from '../../api/types.js';
import { MUSIC_REQUEST_STATUS_LABEL } from './musicRequestStatusLabels.js';

/**
 * Mirrors `features/requests/statusLabels.test.ts` for the music-side map: every status
 * `RequestStatus` can carry must have a real label, checked at runtime against a
 * hand-written list rather than derived from the map (which would pass trivially). This
 * is the map that actually missed `importRequested` — the status a music request reaches
 * once Auralis has asked Jellyfin to rescan (see
 * `apps/server/src/requests/musicRequestService.ts`) — because it was written before that
 * status existed on the server.
 *
 * `_listIsExhaustive` pins the hand-written list to the `RequestStatus` type itself, so
 * this list can't go stale the same way the map once did: a status added to the union
 * without being added here breaks typecheck on this file.
 */
const ALL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'searching',
  'downloading',
  'importing',
  'completed',
  'importRequested',
  'failed',
] as const;

type Uncovered = Exclude<RequestStatus, (typeof ALL_REQUEST_STATUSES)[number]>;
// A status missing from `ALL_REQUEST_STATUSES` makes `Uncovered` non-`never`, which makes
// this type `false` — and assigning `true` to a `const` typed `false` fails typecheck.
const _listIsExhaustive: Uncovered extends never ? true : false = true;

describe('MUSIC_REQUEST_STATUS_LABEL', () => {
  it.each(ALL_REQUEST_STATUSES)('has a non-empty label for %s', (status) => {
    expect(MUSIC_REQUEST_STATUS_LABEL[status]).toBeTruthy();
  });
});
