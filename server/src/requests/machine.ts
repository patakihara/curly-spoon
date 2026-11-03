/**
 * The request machine: where a request may go from where it stands. Pure, with no store or
 * upstream: the advance job and the request routes ask it, then save what it answers.
 *
 * Each medium's route is the one table the moves come from. A step moves a request to the next
 * status on its route, or past a `needsChoice` it does not need; only a choice leaves
 * `needsChoice`. Any working status may fail, keeping the step it failed in, and a retry goes
 * back to that step. `inLibrary` is the end. A cancelled request is deleted, so it has no status.
 */
import type { RequestFailure, RequestMedium, RequestStatus } from '@auralis/schema';

/** The statuses a request works through: every status but the end and failure. */
export type WorkingStatus = Exclude<RequestStatus, 'inLibrary' | 'failed'>;

/** Where a request stands: its status, a download's progress, and a failure's step and reason. */
export type RequestState =
  | { status: 'downloading'; progress: number }
  | { status: Exclude<RequestStatus, 'downloading' | 'failed'> }
  | { status: 'failed'; failedStep: WorkingStatus; reason: RequestFailure };

/**
 * What happened to a request: a step moved it on (with a download's progress), a step failed,
 * the person retried it, or the person chose a release.
 */
export type RequestEvent =
  | { type: 'moved'; to: RequestStatus; progress?: number }
  | { type: 'failed'; reason: RequestFailure }
  | { type: 'retry' }
  | { type: 'chose' };

/**
 * Each medium's statuses in order. Books and albums may wait for a choice of release; a song
 * kept from YouTube Music matches its release, then downloads with no queue; a podcast resolves
 * its feed, then is subscribed to, with no download.
 */
export const ROUTES: Readonly<Record<RequestMedium, readonly RouteStatus[]>> = {
  book: [
    'requested',
    'searching',
    'needsChoice',
    'queued',
    'downloading',
    'importing',
    'inLibrary',
  ],
  album: [
    'requested',
    'searching',
    'needsChoice',
    'queued',
    'downloading',
    'importing',
    'inLibrary',
  ],
  song: ['requested', 'searching', 'downloading', 'importing', 'inLibrary'],
  podcast: ['requested', 'searching', 'importing', 'inLibrary'],
};

/** A status on a route: every status but failure. */
type RouteStatus = Exclude<RequestStatus, 'failed'>;

/** The state a request enters at a status on its route: a download starts at none done. */
function enter(status: RouteStatus, progress = 0): RequestState {
  return status === 'downloading' ? { status, progress } : { status };
}

/** The statuses a step may move a request to from where it stands on its medium's route. */
function movesFrom(medium: RequestMedium, status: RouteStatus): RouteStatus[] {
  const route = ROUTES[medium];
  const at = route.indexOf(status);
  const following = route[at + 1];
  if (at < 0 || following === undefined || status === 'needsChoice') return [];
  const moves = [following];
  const past = route[at + 2];
  if (following === 'needsChoice' && past !== undefined) moves.push(past);
  if (status === 'downloading') moves.push('downloading');
  return moves;
}

/** Where a request goes on an event, or null when its medium's route does not allow the move. */
export function next(
  medium: RequestMedium,
  state: RequestState,
  event: RequestEvent,
): RequestState | null {
  const route = ROUTES[medium];
  if (state.status === 'failed') {
    return event.type === 'retry' ? enter(state.failedStep) : null;
  }
  switch (event.type) {
    case 'moved':
      if (event.to === 'failed' || !movesFrom(medium, state.status).includes(event.to)) return null;
      return enter(event.to, event.progress);
    case 'failed':
      if (state.status === 'inLibrary' || !route.includes(state.status)) return null;
      return { status: 'failed', failedStep: state.status, reason: event.reason };
    case 'chose': {
      const queued = route[route.indexOf('needsChoice') + 1];
      return state.status === 'needsChoice' && queued !== undefined ? enter(queued) : null;
    }
    case 'retry':
      return null;
  }
}
