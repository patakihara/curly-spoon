/**
 * The request machine: where a request may go from where it stands. Pure, with no store or
 * upstream: the advance job and the request routes ask it, then save what it answers.
 *
 * Each medium's route is the one table the moves come from. A step moves a request to the next
 * status on its route, or past a `needsChoice` it does not need; only a choice leaves
 * `needsChoice`. Any working status may fail, keeping the step it failed in, and a retry goes
 * back to that step. On a route with a choice, a release that failed on its way in may also give
 * way to another: back to `needsChoice`, or straight on with one picked. `inLibrary` is the end.
 * A cancelled request is deleted, so it has no status.
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
 * the person retried it, chose a release, or asked to pick another after a failure.
 */
export type RequestEvent =
  | { type: 'moved'; to: RequestStatus; progress?: number }
  | { type: 'failed'; reason: RequestFailure }
  | { type: 'retry' }
  | { type: 'chose' }
  | { type: 'pickAnother' };

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

/** The steps a failure may leave behind for another release: a release was already under way. */
const PICK_ANOTHER_AFTER: readonly WorkingStatus[] = ['queued', 'downloading', 'importing'];

/** True when a medium's route has this status, and a failure's step. */
export function onRoute(medium: RequestMedium, state: RequestState): boolean {
  const route = ROUTES[medium];
  return state.status === 'failed'
    ? route.includes(state.failedStep)
    : route.includes(state.status);
}

/** Where a search's picked release goes next: on along the route, past any choice. */
export function afterPicked(medium: RequestMedium): RouteStatus {
  const route = ROUTES[medium];
  const found = route.slice(route.indexOf('searching') + 1).find((s) => s !== 'needsChoice');
  if (found === undefined) throw new Error(`invariant: nothing follows searching for ${medium}`);
  return found;
}

/** Where a failed request goes on an event: its failed step, or back to the choice of release. */
function fromFailed(
  medium: RequestMedium,
  state: Extract<RequestState, { status: 'failed' }>,
  event: RequestEvent,
): RequestState | null {
  if (event.type === 'retry') return enter(state.failedStep);
  if (event.type !== 'pickAnother') return null;
  const hasChoice = ROUTES[medium].includes('needsChoice');
  if (!hasChoice || !PICK_ANOTHER_AFTER.includes(state.failedStep)) return null;
  return enter('needsChoice');
}

/** Where a request goes on an event, or null when its medium's route does not allow the move. */
export function next(
  medium: RequestMedium,
  state: RequestState,
  event: RequestEvent,
): RequestState | null {
  if (!onRoute(medium, state)) return null;
  if (state.status === 'failed') return fromFailed(medium, state, event);
  switch (event.type) {
    case 'moved':
      if (event.to === 'failed' || !movesFrom(medium, state.status).includes(event.to)) return null;
      return enter(event.to, event.progress);
    case 'failed':
      if (state.status === 'inLibrary') return null;
      return { status: 'failed', failedStep: state.status, reason: event.reason };
    case 'chose':
      return state.status === 'needsChoice' ? enter(afterPicked(medium)) : null;
    case 'retry':
    case 'pickAnother':
      return null;
  }
}
