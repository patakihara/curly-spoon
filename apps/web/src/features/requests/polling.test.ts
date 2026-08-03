/**
 * The request list's poll predicate — pure and independent of react-query so it
 * can be pinned exactly, without mounting a component or faking a timer.
 */
import { describe, expect, it } from 'vitest';
import type { BookRequest, RequestStatus } from '../../api/types.js';
import { shouldPollRequests } from './polling.js';

function request(status: RequestStatus): BookRequest {
  return {
    id: `req-${status}`,
    userId: 'user-1',
    title: 'A Book',
    author: null,
    status,
    statusDetail: null,
    release: null,
    indexerId: null,
    clientId: null,
    downloadHandle: null,
    progress: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('shouldPollRequests', () => {
  it('does not poll an empty list', () => {
    expect(shouldPollRequests([])).toBe(false);
  });

  it.each<RequestStatus>(['pending', 'approved', 'searching', 'downloading', 'importing'])(
    'polls while any request is %s',
    (status) => {
      expect(shouldPollRequests([request(status)])).toBe(true);
    },
  );

  it.each<RequestStatus>(['completed', 'rejected'])(
    'stops polling once every request is %s (terminal)',
    (status) => {
      expect(shouldPollRequests([request(status)])).toBe(false);
    },
  );

  it('does not poll a failed request — it will not progress on its own, only a retry moves it', () => {
    expect(shouldPollRequests([request('failed')])).toBe(false);
  });

  it('keeps polling if even one request out of many is still in flight', () => {
    expect(
      shouldPollRequests([request('completed'), request('failed'), request('downloading')]),
    ).toBe(true);
  });

  it('stops once a mix of only terminal and failed requests remains', () => {
    expect(shouldPollRequests([request('completed'), request('rejected'), request('failed')])).toBe(
      false,
    );
  });
});
