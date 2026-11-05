/**
 * The advance job: each run moves every working request one step through its medium's steps, each
 * in its own try, so one failure never stops another. A step that fails leaves its request failed
 * with the step and a reason. The last step is shared: a request is in the library only once the
 * index has found the item its import named, which is what "done means it plays" asks; past a cap
 * it fails `notIndexed`. All a run keeps is in the store, so a restart picks up where it stood.
 *
 * A step that waits can come back to a row that moved on, so each save names the version it read
 * and loses to a newer one. A step that must not happen twice (`start`, `import`) saves an
 * idempotency key first and passes it on, so a crash before its answer is saved repeats the same
 * call, which the medium answers the same.
 *
 * Every step the job asks of a medium has a time limit, so a hung upstream fails its own request
 * and nothing else: the run goes on to the next request, and the job's next turn comes. A step past
 * its limit fails as a step that throws does, so a `start` or `import` keeps its key: it may yet
 * land upstream, and a retry under that key cannot double it.
 *
 * A step that answers `StepUnavailable` is different: the upstream could not be reached, which says
 * nothing about the request. It stays where it stands, and fails with the step's usual reason only
 * once the upstream has been away that long. The hold is timed from the first refusal rather than
 * the last save, as a step that waits (an import) saves nothing for hours while all is well.
 *
 * A download whose bytes stand still for the stall limit fails `downloadStalled`, and goes on by
 * itself to the next release the search found, while any are left. Listed seeders can be false, so
 * only bytes count. A look that comes a full limit after the last one has seen nothing stand still,
 * so it restarts the clock: an outage can never pass for a stall.
 *
 * What a person does to a request (retry, choose, pick another, cancel) lives here too, as dropping
 * a failed download takes the same steps. Each move is saved first, naming the version it read, so of
 * two taps only one goes on to drop a download.
 */
import { randomUUID } from 'node:crypto';
import type { MediaRef, RequestFailure, RequestMedium } from '@auralis/schema';
import type { JobLog } from '../jobs/schedule.js';
import { indexedRow } from '../libraryIndex/store.js';
import { addClaim, type ClaimReason } from '../store/claims.js';
import type { Db } from '../store/connection.js';
import {
  clearHeld,
  deleteRequest,
  getRequest,
  leaveRequest,
  markHeld,
  peopleOn,
  saveRequest,
  type RequestChange,
  type StoredRequest,
  workingRequests,
} from '../store/requests.js';
import { afterPicked, next, type RequestEvent, type WorkingStatus } from './machine.js';
import {
  type DownloadSteps,
  type DownloadTarget,
  type MediumSteps,
  type Release,
  StepUnavailable,
  type StepsRegistry,
} from './steps.js';

export interface RequestJobDeps {
  db: Db;
  steps: StepsRegistry;
  log: JobLog;
  now: () => number;
  /** How long an imported item may stay out of the index before its request fails. */
  notIndexedAfterMs: number;
  /** How long any one call to a medium's steps may go unanswered before it counts as failed. */
  stepTimeoutMs: number;
  /** How long a download's bytes may stand still before its request fails. */
  stallAfterMs: number;
  /** How long an upstream that cannot be reached may hold a request before it fails. */
  holdAfterMs: number;
}

/** What acting on a request for a person takes. */
export type RequestActDeps = Omit<
  RequestJobDeps,
  'notIndexedAfterMs' | 'stallAfterMs' | 'holdAfterMs'
>;

/** The reason a step that throws fails with. */
const THROWN: Record<WorkingStatus, RequestFailure> = {
  requested: 'searchFailed',
  searching: 'searchFailed',
  needsChoice: 'searchFailed',
  queued: 'downloadFailed',
  downloading: 'downloadFailed',
  importing: 'importFailed',
};

/** A step's answer, or a failure once the limit has passed with none. */
async function limited<T>(deps: RequestActDeps, name: string, call: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer to ${name} in ${deps.stepTimeoutMs} ms`)),
      deps.stepTimeoutMs,
    );
  });
  try {
    return await Promise.race([call(), limit]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Moves a request by an event its route must allow, with what the step keeps. Answers whether it
 * saved: not when the row moved on from the version the request was read at.
 */
function apply(
  deps: RequestJobDeps,
  request: StoredRequest,
  event: RequestEvent,
  change: Omit<RequestChange, 'state'> = {},
): boolean {
  const state = next(request.medium, request.state, event);
  if (state === null) {
    throw new Error(`a ${request.medium} at ${request.state.status} cannot ${event.type}`);
  }
  return saveRequest(deps.db, request.id, { ...change, state }, deps.now(), request.version);
}

/**
 * The request with the idempotency key of its next step saved on it, reusing one a crash left
 * there. Null when the row moved on and there is no step to take.
 */
function keyed(deps: RequestJobDeps, request: StoredRequest): StoredRequest | null {
  if (request.stepKey !== null) return request;
  const change = { state: request.state, stepKey: randomUUID() };
  const saved = saveRequest(deps.db, request.id, change, deps.now(), request.version);
  return saved ? getRequest(deps.db, request.id) : null;
}

async function search(deps: RequestJobDeps, steps: MediumSteps, request: StoredRequest) {
  const found = await limited(deps, 'search', () => steps.search(request));
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

/** The last start or cancel asked of each medium, which the next waits for. */
const turns = new WeakMap<DownloadSteps, Promise<void>>();

/**
 * Sends a medium's start or cancel once those asked for before it have answered or passed their
 * limit, at once if none is out, so a cancel still on its way can never drop a download started
 * after it was asked for, and a hung one holds up the rest no longer than its limit.
 */
function inTurn<T>(
  deps: RequestActDeps,
  steps: DownloadSteps,
  name: string,
  call: () => Promise<T>,
): Promise<T> {
  const before = turns.get(steps);
  const send = () => limited(deps, name, call);
  const answer = before === undefined ? send() : before.then(send);
  const settled = answer.then(
    () => undefined,
    () => undefined,
  );
  turns.set(steps, settled);
  void settled.then(() => {
    if (turns.get(steps) === settled) turns.delete(steps);
  });
  return answer;
}

/**
 * When the bytes last moved, as of a poll that found them at this progress: now if they have risen,
 * or if the last look was a full limit ago, as nothing has been seen to stand still since then.
 */
function stallClock(deps: RequestJobDeps, request: StoredRequest, progress: number): number {
  const before = request.state.status === 'downloading' ? request.state.progress : 0;
  const unseen = deps.now() - request.updatedAt >= deps.stallAfterMs;
  if (progress > before || unseen || request.progressAt === null) return deps.now();
  return request.progressAt;
}

/** Fails a download that stopped moving, then drops it and starts the next release, if any. */
async function stalled(deps: RequestJobDeps, request: StoredRequest) {
  if (!apply(deps, request, { type: 'failed', reason: 'downloadStalled' })) return;
  const failed = getRequest(deps.db, request.id);
  const following = failed && otherReleases(failed)[0];
  if (!following) return;
  if ((await pickAnotherRelease(deps, request.id)) !== null) {
    chooseRelease(deps, request.id, following.id);
  }
}

/** Starts the release's download, or follows the one the store holds a handle to. */
async function download(deps: RequestJobDeps, steps: DownloadSteps, request: StoredRequest) {
  const { db, now } = deps;
  if (request.handle === null) {
    if (request.release === null) throw new Error('invariant: a download with no release');
    const ready = keyed(deps, request);
    if (ready?.stepKey == null) return;
    const { release } = request;
    const { stepKey } = ready;
    const handle = await inTurn(deps, steps, 'start', () => steps.start(ready, release, stepKey));
    const change = { state: ready.state, handle, stepKey: null, progressAt: now() };
    if (!saveRequest(db, ready.id, change, now(), ready.version)) {
      await inTurn(deps, steps, 'cancel', () => steps.cancel({ handle }));
    }
    return;
  }
  const { handle } = request;
  const polled = await limited(deps, 'poll', () => steps.poll(handle));
  const waiting = request.state.status === 'queued';
  switch (polled.kind) {
    case 'queued':
      saveRequest(
        db,
        request.id,
        { state: request.state, progressAt: now() },
        now(),
        request.version,
      );
      return;
    case 'downloading': {
      const progressAt = stallClock(deps, request, polled.progress);
      if (!waiting && now() - progressAt >= deps.stallAfterMs) {
        await stalled(deps, request);
        return;
      }
      const moved = { type: 'moved', to: 'downloading', progress: polled.progress } as const;
      apply(deps, request, moved, { progressAt });
      return;
    }
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

/** Why an item counts as a person's own once their request for it arrives. */
export const ARRIVAL_CLAIM: Record<RequestMedium, ClaimReason> = {
  book: 'requested',
  album: 'requested',
  song: 'added',
  podcast: 'subscribed',
};

/** Moves a request into the library and claims the item for everyone on it, together. */
function arrive(deps: RequestJobDeps, request: StoredRequest, ref: MediaRef): void {
  deps.db.transaction(() => {
    if (!apply(deps, request, { type: 'moved', to: 'inLibrary' })) return;
    for (const person of peopleOn(deps.db, request.id)) {
      addClaim(deps.db, person, ref, ARRIVAL_CLAIM[request.medium], deps.now());
    }
  })();
}

/** Imports once, then waits for the index to find what the import named, up to the cap. */
async function importing(deps: RequestJobDeps, steps: MediumSteps, request: StoredRequest) {
  if (request.result === null) {
    const ready = keyed(deps, request);
    if (ready?.stepKey == null) return;
    const { stepKey } = ready;
    const imported = await limited(deps, 'import', () => steps.import(ready, stepKey));
    if (imported.kind === 'arrived') {
      const change = { state: ready.state, result: imported.ref, stepKey: null };
      saveRequest(deps.db, ready.id, change, deps.now(), ready.version);
    } else if (deps.now() - ready.updatedAt >= deps.notIndexedAfterMs) {
      apply(deps, ready, { type: 'failed', reason: 'notIndexed' });
    }
  } else if (indexedRow(deps.db, request.result.source, request.result.id) !== undefined) {
    arrive(deps, request, request.result);
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

/** Marks a step that threw as failed, if the request still stands where the step found it. */
function recordThrown(deps: RequestJobDeps, id: string, step: WorkingStatus): void {
  const current = getRequest(deps.db, id);
  if (current?.state.status === step)
    apply(deps, current, { type: 'failed', reason: THROWN[step] });
}

/**
 * Leaves a request an unreachable upstream holds where it stands, noting when the upstream went
 * away, until it has been away the hold limit; then it fails as a step that throws does.
 */
function recordHeld(deps: RequestJobDeps, id: string, step: WorkingStatus): void {
  const current = getRequest(deps.db, id);
  if (current?.state.status !== step) return;
  if (current.heldSince === null) markHeld(deps.db, id, deps.now());
  else if (deps.now() - current.heldSince >= deps.holdAfterMs) recordThrown(deps, id, step);
}

/**
 * One run: every working request whose medium has steps moves one step. Each is read again just
 * before its step, as the steps before it wait, and in that wait it may have been cancelled.
 */
export async function advanceRequests(deps: RequestJobDeps): Promise<void> {
  for (const { id, medium, state } of workingRequests(deps.db, deps.log)) {
    const steps = deps.steps.get(medium);
    if (steps === undefined) continue;
    let step = state.status;
    try {
      const request = getRequest(deps.db, id);
      if (request === null) continue;
      step = request.state.status;
      await advance(deps, steps, request);
      clearHeld(deps.db, id);
    } catch (err) {
      deps.log.error({ request: id, step, err }, 'request step failed');
      try {
        if (step === 'inLibrary' || step === 'failed') continue;
        if (err instanceof StepUnavailable) recordHeld(deps, id, step);
        else recordThrown(deps, id, step);
      } catch (saveErr) {
        deps.log.error({ request: id, step, err: saveErr }, 'request failure not saved');
      }
    }
  }
}

/**
 * What dropping a request's download asks for. A key at a download step means a start whose answer
 * was never saved, so only the key can name what it made; a key at the import step is the import's.
 */
function dropTarget(request: StoredRequest): DownloadTarget | null {
  const { state, stepKey, release, handle } = request;
  const importing =
    state.status === 'importing' || (state.status === 'failed' && state.failedStep === 'importing');
  if (!importing && stepKey !== null && release !== null) return { key: stepKey, release };
  return handle === null ? null : { handle };
}

/**
 * Asks the medium to drop a download, so what follows never leaves two. A refusal is logged. Its
 * turn is taken before the first wait, so a start the job asks for after the move goes behind it.
 */
async function dropDownload(
  deps: RequestActDeps,
  request: StoredRequest,
  target: DownloadTarget | null,
): Promise<void> {
  const download = deps.steps.get(request.medium)?.download;
  if (target === null || download === undefined) return;
  try {
    await inTurn(deps, download, 'cancel', () => download.cancel(target));
  } catch (err) {
    deps.log.error({ request: request.id, err }, 'download not dropped');
  }
}

/**
 * The other releases a failed request can go on to: what the search found but the release that
 * failed. None when the machine has no way back to a choice from where it failed.
 */
export function otherReleases(request: StoredRequest): Release[] {
  if (next(request.medium, request.state, { type: 'pickAnother' }) === null) return [];
  return request.candidates.filter((candidate) => candidate.id !== request.release?.id);
}

/**
 * A retry: back to the step it failed in. A download starts afresh on the same release; an import
 * that was found wanting by the index keeps what it named and waits again. Null when refused, as a
 * second tap is. A step that failed before saving its answer keeps its key, as it may have got
 * through upstream: the start under that key answers the same, so there is nothing to drop.
 */
export async function retryRequest(
  deps: RequestActDeps,
  id: string,
): Promise<StoredRequest | null> {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'retry' });
  if (!request || !state) return null;
  const restarts = state.status === 'queued' || state.status === 'downloading';
  const change = { state, ...(restarts ? { handle: null } : {}) };
  if (!saveRequest(deps.db, id, change, deps.now(), request.version)) return null;
  if (restarts && request.handle !== null) {
    await dropDownload(deps, request, { handle: request.handle });
  }
  return getRequest(deps.db, id);
}

/**
 * Back to the choice of release after a failure, offering the rest of what the search found.
 * Null when refused: the route has no choice, or nothing else was found.
 */
export async function pickAnotherRelease(
  deps: RequestActDeps,
  id: string,
): Promise<StoredRequest | null> {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'pickAnother' });
  if (!request || !state) return null;
  const candidates = otherReleases(request);
  if (candidates.length === 0) return null;
  const change = { state, candidates, release: null, handle: null, stepKey: null, result: null };
  if (!saveRequest(deps.db, id, change, deps.now(), request.version)) return null;
  await dropDownload(deps, request, dropTarget(request));
  return getRequest(deps.db, id);
}

/**
 * A person's choice of a candidate while one is waited for. Null when refused: the request takes
 * no choice now, or nobody offered that candidate.
 */
export function chooseRelease(
  deps: RequestActDeps,
  id: string,
  candidateId: string,
): StoredRequest | null {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'chose' });
  if (!request || !state) return null;
  const release = request.candidates.find((candidate) => candidate.id === candidateId);
  if (release === undefined) return null;
  saveRequest(deps.db, id, { state, release }, deps.now(), request.version);
  return getRequest(deps.db, id);
}

/**
 * Takes a person off a request. While anyone else is on it, that is all. The last to leave deletes
 * it and has the medium drop its download; a download still starting then finds the row gone and
 * drops itself.
 */
export async function cancelRequest(
  deps: RequestActDeps,
  request: StoredRequest,
  userId: string,
): Promise<void> {
  const others = peopleOn(deps.db, request.id).filter((person) => person !== userId);
  if (others.length > 0) {
    leaveRequest(deps.db, request.id, userId);
    return;
  }
  deleteRequest(deps.db, request.id);
  await dropDownload(deps, request, dropTarget(request));
}
