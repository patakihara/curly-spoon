import { describe, expect, it } from 'vitest';
import { shouldPollMusicRequests } from './musicRequestPolling.js';
import type { MusicRequest, RequestStatus } from '../../api/types.js';

function requestWithStatus(status: RequestStatus): MusicRequest {
  return {
    id: `req-${status}`,
    userId: 'u1',
    title: 'Some Track',
    author: null,
    status,
    statusDetail: null,
    candidate: null,
    indexerId: null,
    clientId: null,
    downloadHandle: null,
    progress: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('shouldPollMusicRequests', () => {
  it('does not poll an empty list', () => {
    expect(shouldPollMusicRequests([])).toBe(false);
  });

  it('polls while a request is pending — another signed-in user might approve it', () => {
    expect(shouldPollMusicRequests([requestWithStatus('pending')])).toBe(true);
  });

  it('polls while a request is approved — nothing local guarantees the auto-grab already ran', () => {
    expect(shouldPollMusicRequests([requestWithStatus('approved')])).toBe(true);
  });

  it('polls while a request is searching', () => {
    expect(shouldPollMusicRequests([requestWithStatus('searching')])).toBe(true);
  });

  it('does not poll a downloading request — the music pipeline has no pollDownloads to move it', () => {
    expect(shouldPollMusicRequests([requestWithStatus('downloading')])).toBe(false);
  });

  it('does not poll requests that are only failed, rejected or completed', () => {
    expect(
      shouldPollMusicRequests([
        requestWithStatus('failed'),
        requestWithStatus('rejected'),
        requestWithStatus('completed'),
      ]),
    ).toBe(false);
  });

  it('polls if any one request in a mixed list is still progressing', () => {
    expect(
      shouldPollMusicRequests([requestWithStatus('completed'), requestWithStatus('pending')]),
    ).toBe(true);
  });
});
