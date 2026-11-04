import { RequestStatus, type RequestMedium } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { next, ROUTES, type RequestEvent, type RequestState } from './machine.js';

const at = (status: Exclude<RequestStatus, 'downloading' | 'failed'>): RequestState => ({ status });
const downloading = (progress: number): RequestState => ({ status: 'downloading', progress });

/** Walks a medium's route by the moves its steps would report, choosing where it waits for one. */
function walk(medium: RequestMedium, choose: boolean): RequestStatus[] {
  const route: readonly RequestStatus[] = ROUTES[medium];
  const after = (status: RequestStatus, n = 1): RequestStatus => {
    const found = route[route.indexOf(status) + n];
    if (found === undefined) throw new Error(`nothing after ${status}`);
    return found;
  };
  let state: RequestState = at('requested');
  const seen: RequestStatus[] = [state.status];
  while (state.status !== 'inLibrary') {
    let event: RequestEvent;
    if (state.status === 'needsChoice') event = { type: 'chose' };
    else if (after(state.status) === 'needsChoice' && !choose)
      event = { type: 'moved', to: after(state.status, 2) };
    else event = { type: 'moved', to: after(state.status) };
    const moved = next(medium, state, event);
    if (moved === null) throw new Error(`refused ${state.status} → ${JSON.stringify(event)}`);
    state = moved;
    seen.push(state.status);
  }
  return seen;
}

describe('the request machine', () => {
  it('takes a book or an album through searching, a choice of release, the download and the import', () => {
    for (const medium of ['book', 'album'] as const) {
      expect(walk(medium, true)).toEqual([
        'requested',
        'searching',
        'needsChoice',
        'queued',
        'downloading',
        'importing',
        'inLibrary',
      ]);
      expect(walk(medium, false)).not.toContain('needsChoice');
    }
  });

  it('takes a kept song through matching its release, the download and the import, never queued or a choice', () => {
    expect(walk('song', false)).toEqual([
      'requested',
      'searching',
      'downloading',
      'importing',
      'inLibrary',
    ]);
  });

  it('takes a podcast from resolving its feed straight to subscribing, with no download', () => {
    expect(walk('podcast', false)).toEqual(['requested', 'searching', 'importing', 'inLibrary']);
  });

  it('covers every status but failed across the four media', () => {
    const covered = new Set<RequestStatus>(Object.values(ROUTES).flat());
    expect(RequestStatus.options.filter((s) => !covered.has(s))).toEqual(['failed']);
  });

  it('refuses a move off its medium’s route, a skipped step, and any move out of the library', () => {
    expect(next('book', at('requested'), { type: 'moved', to: 'downloading' })).toBeNull();
    expect(next('podcast', at('searching'), { type: 'moved', to: 'queued' })).toBeNull();
    expect(next('song', at('searching'), { type: 'moved', to: 'needsChoice' })).toBeNull();
    expect(next('album', at('importing'), { type: 'moved', to: 'searching' })).toBeNull();
    expect(next('book', at('inLibrary'), { type: 'moved', to: 'searching' })).toBeNull();
    expect(next('book', at('inLibrary'), { type: 'failed', reason: 'importFailed' })).toBeNull();
    expect(next('book', at('searching'), { type: 'moved', to: 'failed' })).toBeNull();
  });

  it('updates a download’s progress while it stays downloading', () => {
    expect(
      next('album', downloading(0.2), { type: 'moved', to: 'downloading', progress: 0.6 }),
    ).toEqual(downloading(0.6));
    expect(next('album', at('queued'), { type: 'moved', to: 'downloading' })).toEqual(
      downloading(0),
    );
  });

  it('fails from any working status with the step it failed in and why', () => {
    for (const [medium, route] of Object.entries(ROUTES) as [RequestMedium, RequestStatus[]][]) {
      for (const status of route.filter((s) => s !== 'inLibrary')) {
        const state = status === 'downloading' ? downloading(0.4) : at(status as never);
        expect(
          next(medium, state, { type: 'failed', reason: 'downloadFailed' }),
          `${medium} ${status}`,
        ).toEqual({
          status: 'failed',
          failedStep: status,
          reason: 'downloadFailed',
        });
      }
    }
  });

  it('retries a failed request at the step it failed in, not from the start', () => {
    const failed = next('book', downloading(0.7), { type: 'failed', reason: 'downloadFailed' });
    expect(next('book', failed!, { type: 'retry' })).toEqual(downloading(0));
    const importFailed = next('podcast', at('importing'), {
      type: 'failed',
      reason: 'importFailed',
    });
    expect(next('podcast', importFailed!, { type: 'retry' })).toEqual(at('importing'));
  });

  it('retries only a failed request, and a failed one moves no other way', () => {
    expect(next('book', at('searching'), { type: 'retry' })).toBeNull();
    const failed = next('book', at('searching'), { type: 'failed', reason: 'noRelease' })!;
    expect(next('book', failed, { type: 'moved', to: 'queued' })).toBeNull();
    expect(next('book', failed, { type: 'failed', reason: 'searchFailed' })).toBeNull();
    expect(next('book', failed, { type: 'chose' })).toBeNull();
  });

  it('takes a choice of release only while one is waited for', () => {
    expect(next('album', at('needsChoice'), { type: 'chose' })).toEqual(at('queued'));
    expect(next('album', at('searching'), { type: 'chose' })).toBeNull();
    expect(next('album', at('queued'), { type: 'chose' })).toBeNull();
    expect(next('album', at('needsChoice'), { type: 'moved', to: 'queued' })).toBeNull();
  });

  it('takes no choice of release for a medium whose route has no choice', () => {
    expect(next('song', at('needsChoice'), { type: 'chose' })).toBeNull();
    expect(next('podcast', at('needsChoice'), { type: 'chose' })).toBeNull();
  });

  it('retries only to a step on the medium’s own route', () => {
    const failedAt = (failedStep: 'downloading' | 'queued'): RequestState => ({
      status: 'failed',
      failedStep,
      reason: 'downloadFailed',
    });
    expect(next('podcast', failedAt('downloading'), { type: 'retry' })).toBeNull();
    expect(next('song', failedAt('queued'), { type: 'retry' })).toBeNull();
  });

  it('lets a person pick another release after a download fails, as the get diagram says', () => {
    for (const medium of ['book', 'album'] as const) {
      const failed = next(medium, downloading(0.7), { type: 'failed', reason: 'downloadFailed' })!;
      expect(next(medium, failed, { type: 'chose' }), medium).toEqual(at('queued'));
    }
  });

  it('goes back to the choice of release when a release failed at queued, downloading or importing', () => {
    for (const medium of ['book', 'album'] as const) {
      for (const failedStep of ['queued', 'downloading', 'importing'] as const) {
        const failed: RequestState = { status: 'failed', failedStep, reason: 'downloadFailed' };
        expect(next(medium, failed, { type: 'pickAnother' }), failedStep).toEqual(
          at('needsChoice'),
        );
      }
    }
  });

  it('has nothing else to pick when the search itself failed, or on a route with no choice', () => {
    const searchFailed: RequestState = {
      status: 'failed',
      failedStep: 'searching',
      reason: 'noRelease',
    };
    expect(next('book', searchFailed, { type: 'pickAnother' })).toBeNull();
    const songFailed: RequestState = {
      status: 'failed',
      failedStep: 'downloading',
      reason: 'downloadFailed',
    };
    expect(next('song', songFailed, { type: 'pickAnother' })).toBeNull();
    expect(next('song', songFailed, { type: 'chose' })).toBeNull();
    expect(next('book', at('queued'), { type: 'pickAnother' })).toBeNull();
  });
});
