import { describe, expect, it } from 'vitest';
import { MUSIC_REQUEST_STATUS_LABEL } from './musicRequestStatusLabels.js';

/**
 * Mirrors `features/requests/statusLabels.test.ts` for the music-side map: every status
 * `RequestStatus` can carry must have a real label, checked at runtime against a
 * hand-written list rather than derived from the map (which would pass trivially) or
 * from the type (which would only be a second typecheck). This is the map that actually
 * missed `importRequested` — the status a music request reaches once Auralis has asked
 * Jellyfin to rescan (see `apps/server/src/requests/musicRequestService.ts`) — because it
 * was written before that status existed on the server.
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

describe('MUSIC_REQUEST_STATUS_LABEL', () => {
  it.each(ALL_REQUEST_STATUSES)('has a non-empty label for %s', (status) => {
    expect(MUSIC_REQUEST_STATUS_LABEL[status]).toBeTruthy();
  });
});
