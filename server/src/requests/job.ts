/**
 * The advance job: each run moves every working request one step through its medium's steps, each
 * in its own try, so one failure never stops another. A step that fails leaves its request failed
 * with the step and a reason. The last step is shared: a request is in the library only once the
 * index has found the item its import named, which is what "done means it plays" asks; past a cap
 * it fails `notIndexed`. All a run keeps is in the store, so a restart picks up where it stood.
 *
 * What a person does to a request (retry, choose, pick another) lives here too, as dropping a
 * failed download takes the same steps.
 */
import type { RequestFailure } from '@auralis/schema';
import type { JobLog } from '../jobs/schedule.js';
import { indexedRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import {
  getRequest,
  saveRequest,
  type RequestChange,
  type StoredRequest,
  workingRequests,
} from '../store/requests.js';
import { afterPicked, next, type RequestEvent, type WorkingStatus } from './machine.js';
import type { DownloadSteps, MediumSteps, StepsRegistry } from './steps.js';

export interface RequestJobDeps {
  db: Db;
  steps: StepsRegistry;
  log: JobLog;
  now: () => number;
  /** How long an imported item may stay out of the index before its request fails. */
  notIndexedAfterMs: number;
}

/** The reason a step that throws fails with. */
const THROWN: Record<WorkingStatus, RequestFailure> = {
  requested: 'searchFailed',
  searching: 'searchFailed',
  needsChoice: 'searchFailed',
  queued: 'downloadFailed',
  downloading: 'downloadFailed',
  importing: 'importFailed',
};

/** Moves a request by an event its route must allow, with what the step keeps. */
function apply(
  deps: RequestJobDeps,
  request: StoredRequest,
  event: RequestEvent,
  change: Omit<RequestChange, 'state'> = {},
): void {
  const state = next(request.medium, request.state, event);
  if (state === null) {
    throw new Error(`a ${request.medium} at ${request.state.status} cannot ${event.type}`);
  }
  saveRequest(deps.db, request.id, { ...change, state }, deps.now());
}

async function search(deps: RequestJobDeps, steps: MediumSteps, request: StoredRequest) {
  const found = await steps.search(request);
  if (found.kind === 'none') {
    apply(deps, request, { type: 'failed', reason: found.reason });
  } else if (found.kind === 'picked') {
    apply(
      deps,
      request,
      { type: 'moved', to: afterPicked(request.medium) },
      { release: found.release, candidates: found.others },
    );
  } else if (found.candidates.length === 0) {
    apply(deps, request, { type: 'failed', reason: 'noRelease' });
  } else {
    apply(deps, request, { type: 'moved', to: 'needsChoice' }, { candidates: found.candidates });
  }
}

/** Starts the release's download, or follows the one the store holds a handle to. */
async function download(deps: RequestJobDeps, steps: DownloadSteps, request: StoredRequest) {
  const { db, now } = deps;
  if (request.handle === null) {
    if (request.release === null) throw new Error('invariant: a download with no release');
    const handle = await steps.start(request, request.release);
    if (getRequest(db, request.id) === null) await steps.cancel(handle);
    else saveRequest(db, request.id, { state: request.state, handle }, now());
    return;
  }
  const polled = await steps.poll(request.handle);
  const waiting = request.state.status === 'queued';
  switch (polled.kind) {
    case 'queued':
      return;
    case 'downloading':
      apply(deps, request, { type: 'moved', to: 'downloading', progress: polled.progress });
      return;
    case 'done':
      apply(
        deps,
        request,
        waiting
          ? { type: 'moved', to: 'downloading', progress: 1 }
          : { type: 'moved', to: 'importing' },
      );
      return;
    case 'failed':
      apply(deps, request, { type: 'failed', reason: polled.reason });
  }
}

/** Imports once, then waits for the index to find what the import named, up to the cap. */
async function importing(deps: RequestJobDeps, steps: MediumSteps, request: StoredRequest) {
  if (request.result === null) {
    const { ref } = await steps.import(request);
    saveRequest(deps.db, request.id, { state: request.state, result: ref }, deps.now());
  } else if (indexedRow(deps.db, request.result.source, request.result.id) !== undefined) {
    apply(deps, request, { type: 'moved', to: 'inLibrary' });
  } else if (deps.now() - request.updatedAt >= deps.notIndexedAfterMs) {
    apply(deps, request, { type: 'failed', reason: 'notIndexed' });
  }
}

/** One step for one request. */
async function advance(deps: RequestJobDeps, steps: MediumSteps, request: StoredRequest) {
  switch (request.state.status) {
    case 'requested':
      apply(deps, request, { type: 'moved', to: 'searching' });
      return;
    case 'searching':
      await search(deps, steps, request);
      return;
    case 'queued':
    case 'downloading':
      if (steps.download === undefined) throw new Error('invariant: a download with no steps');
      await download(deps, steps.download, request);
      return;
    case 'importing':
      await importing(deps, steps, request);
      return;
    case 'needsChoice':
    case 'inLibrary':
    case 'failed':
  }
}

/** One run: every working request whose medium has steps moves one step. */
export async function advanceRequests(deps: RequestJobDeps): Promise<void> {
  for (const request of workingRequests(deps.db, deps.log)) {
    const steps = deps.steps.get(request.medium);
    if (steps === undefined) continue;
    const step = request.state.status;
    try {
      await advance(deps, steps, request);
    } catch (err) {
      deps.log.error({ request: request.id, step, err }, 'request step failed');
      try {
        if (step !== 'inLibrary' && step !== 'failed') {
          apply(deps, request, { type: 'failed', reason: THROWN[step] });
        }
      } catch (saveErr) {
        deps.log.error({ request: request.id, step, err: saveErr }, 'request failure not saved');
      }
    }
  }
}

/** Asks the medium to drop a failed download, so what follows never leaves two. A refusal is logged. */
async function dropDownload(deps: RequestJobDeps, request: StoredRequest): Promise<void> {
  if (request.handle === null) return;
  try {
    await deps.steps.get(request.medium)?.download?.cancel(request.handle);
  } catch (err) {
    deps.log.error({ request: request.id, err }, 'failed download not dropped');
  }
}

/** The candidates a failed request can still offer: all but the release that failed. */
const remaining = (request: StoredRequest) =>
  request.candidates.filter((candidate) => candidate.id !== request.release?.id);

/**
 * A retry: back to the step it failed in. A download starts afresh on the same release; an import
 * that was found wanting by the index keeps what it named and waits again. Null when refused.
 */
export async function retryRequest(
  deps: RequestJobDeps,
  id: string,
): Promise<StoredRequest | null> {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'retry' });
  if (!request || !state) return null;
  const restarts = state.status === 'queued' || state.status === 'downloading';
  if (restarts) await dropDownload(deps, request);
  saveRequest(deps.db, id, { state, ...(restarts ? { handle: null } : {}) }, deps.now());
  return getRequest(deps.db, id);
}

/**
 * Back to the choice of release after a failure, offering the rest of what the search found.
 * Null when refused: the route has no choice, or nothing else was found.
 */
export async function pickAnotherRelease(
  deps: RequestJobDeps,
  id: string,
): Promise<StoredRequest | null> {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'pickAnother' });
  if (!request || !state) return null;
  const candidates = remaining(request);
  if (candidates.length === 0) return null;
  await dropDownload(deps, request);
  saveRequest(
    deps.db,
    id,
    { state, candidates, release: null, handle: null, result: null },
    deps.now(),
  );
  return getRequest(deps.db, id);
}

/**
 * A person's choice of a candidate, while one is waited for or straight from a failure. Null when
 * refused: the request takes no choice now, or nobody offered that candidate.
 */
export async function chooseRelease(
  deps: RequestJobDeps,
  id: string,
  candidateId: string,
): Promise<StoredRequest | null> {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'chose' });
  if (!request || !state) return null;
  const candidates = request.state.status === 'failed' ? remaining(request) : request.candidates;
  const release = candidates.find((candidate) => candidate.id === candidateId);
  if (release === undefined) return null;
  await dropDownload(deps, request);
  saveRequest(deps.db, id, { state, candidates, release, handle: null, result: null }, deps.now());
  return getRequest(deps.db, id);
}
