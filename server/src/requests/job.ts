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
 * itself to the next release the search found, up to `MAX_AUTO_STARTS`; a person's own choices don't
 * count. A download whose files are not the release asked for (`wrongRelease`) gives way the same,
 * under the same count. Past that, or with none left, the request stays failed and offers what
 * remains. Listed
 * seeders can be false, so only bytes count. A look after an outage of any length, or a full limit
 * after the last one, has seen nothing stand still, so it restarts the clock: an outage can never
 * pass for a stall.
 *
 * What a person does to a request (retry, choose, pick another, cancel) lives here too, as dropping
 * a failed download takes the same steps. Each move is saved first, naming the version it read, so of
 * two taps only one goes on to drop a download.
 */
import { randomUUID } from 'node:crypto';
import type { MediaRef, RequestFailure, RequestMedium } from '@auralis/schema';
import type { JobLog } from '../jobs/schedule.js';
import { indexedRow, topLevelOf } from '../libraryIndex/store.js';
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

/** How many releases a request starts by itself after stalls. */
const MAX_AUTO_STARTS = 3;

/** The reason a step that throws fails with. */
const THROWN: Record<WorkingStatus, RequestFailure> = {
  requested: 'searchFailed',
  searching: 'searchFailed',
  needsChoice: 'searchFailed',
  queued: 'downloadFailed',
  downloading: 'downloadFailed',
  importing: 'importFailed',
};

/** A step's answer, or a failure once the limit has passed with none, which aborts the step. */
async function limited<T>(
  deps: RequestActDeps,
  name: string,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const controller = new AbortController();
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`no answer to ${name} in ${deps.stepTimeoutMs} ms`));
    }, deps.stepTimeoutMs);
  });
  try {
    return await Promise.race([call(controller.signal), limit]);
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
  if (found.kind === 'waiting') return;
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
 * if the poll before this one went unanswered, or if the last look was a full limit ago, as nothing
 * has been seen to stand still since then.
 */
function stallClock(deps: RequestJobDeps, request: StoredRequest, progress: number): number {
  const before = request.state.status === 'downloading' ? request.state.progress : 0;
  const unseen = request.heldSince !== null || deps.now() - request.updatedAt >= deps.stallAfterMs;
  if (progress > before || unseen || request.progressAt === null) return deps.now();
  return request.progressAt;
}

/** The failures of a download that make way for the next release the search found. */
const GIVES_WAY: ReadonlySet<RequestFailure> = new Set(['downloadStalled', 'wrongRelease']);

/** Fails a download that gives way, then drops it and starts the next release, if it may. */
async function givesWay(deps: RequestJobDeps, request: StoredRequest, reason: RequestFailure) {
  if (!apply(deps, request, { type: 'failed', reason })) return;
  const failed = getRequest(deps.db, request.id);
  if (failed === null || failed.autoStarts >= MAX_AUTO_STARTS) return;
  const following = otherReleases(failed)[0];
  if (following === undefined) return;
  if ((await pickAnotherRelease(deps, request.id)) !== null) {
    chooseRelease(deps, request.id, following.id, { autoStarts: failed.autoStarts + 1 });
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
        await givesWay(deps, request, 'downloadStalled');
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
      if (GIVES_WAY.has(polled.reason)) await givesWay(deps, request, polled.reason);
      else apply(deps, request, { type: 'failed', reason: polled.reason });
  }
}

/** Why an item counts as a person's own once their request for it arrives. */
export const ARRIVAL_CLAIM: Record<RequestMedium, ClaimReason> = {
  book: 'requested',
  album: 'requested',
  song: 'added',
  podcast: 'subscribed',
};

/**
 * Moves a request into the library and claims the item for everyone on it, together. What is
 * claimed is the top-level item, as a play claims it: a kept song's album, which the library lists.
 */
function arrive(deps: RequestJobDeps, request: StoredRequest, ref: MediaRef): void {
  deps.db.transaction(() => {
    if (!apply(deps, request, { type: 'moved', to: 'inLibrary' })) return;
    const held = topLevelOf(deps.db, ref);
    for (const person of peopleOn(deps.db, request.id)) {
      addClaim(deps.db, person, held, ARRIVAL_CLAIM[request.medium], deps.now());
    }
  })();
}

/** Imports once, then waits for the index to find what the import named, up to the cap. */
async function importing(deps: RequestJobDeps, steps: MediumSteps, request: StoredRequest) {
  if (request.result === null) {
    const ready = keyed(deps, request);
    if (ready?.stepKey == null) return;
    const { stepKey } = ready;
    const imported = await limited(deps, 'import', (signal) =>
      steps.import(ready, stepKey, signal),
    );
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
 * Whether a step moved a request on: to another status, or with a download started or an import
 * named. A poll that only counts bytes did not, so a download under way never spins the job.
 */
function movedOn(before: StoredRequest, after: StoredRequest | null): boolean {
  if (after === null) return false;
  return (
    after.state.status !== before.state.status ||
    (before.handle === null && after.handle !== null) ||
    (before.result === null && after.result !== null)
  );
}

/**
 * One run: every working request whose medium has steps moves one step, or with `only`, those of
 * the media it names. Each is read again just before its step, as the steps before it wait, and in
 * that wait it may have been cancelled. Answers the media whose requests a step moved on.
 */
export async function advanceRequests(
  deps: RequestJobDeps,
  only?: (medium: RequestMedium) => boolean,
): Promise<Set<RequestMedium>> {
  const moved = new Set<RequestMedium>();
  for (const { id, medium, state } of workingRequests(deps.db, deps.log)) {
    const steps = deps.steps.get(medium);
    if (steps === undefined || only?.(medium) === false) continue;
    let step = state.status;
    try {
      const request = getRequest(deps.db, id);
      if (request === null) continue;
      step = request.state.status;
      await advance(deps, steps, request);
      clearHeld(deps.db, id);
      if (movedOn(request, getRequest(deps.db, id))) moved.add(medium);
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
  return moved;
}

/**
 * Asks for a turn of the prompt media before the job that runs it exists: the steps and routes are
 * built first, and the job attaches itself once it is. Before that, and after the job stops, a wake
 * does nothing; the job's own turns come anyway.
 */
export class Wake {
  private run: (() => void) | null = null;

  attach(run: (() => void) | null): void {
    this.run = run;
  }

  now(): void {
    this.run?.();
  }
}

/**
 * The job's turns, one at a time. The interval's turn moves every medium, and is skipped while a
 * turn runs. A wake asks for one more turn of the prompt media after the running one, or at once
 * if none runs; wakes while one is waiting add nothing, so two turns never run at once and a burst
 * of wakes makes one turn. A turn that moved a prompt medium's request wakes again by itself, so
 * such a request walks its route in one go, each step as soon as the one before is saved.
 */
export class RequestTurns {
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private readonly prompt: (medium: RequestMedium) => boolean;

  constructor(private readonly deps: RequestJobDeps) {
    this.prompt = (medium) => deps.steps.get(medium)?.prompt === true;
  }

  /** The interval's turn, or the one running. */
  tick(): Promise<void> {
    return this.running ?? this.start();
  }

  wake(): void {
    if (this.stopped) return;
    if (this.running === null) void this.start(this.prompt);
    else this.again = true;
  }

  /** No more wakes; settles once the turn running, and any it asked for, is over. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.again = false;
    await this.running;
  }

  private start(only?: (medium: RequestMedium) => boolean): Promise<void> {
    const turn = advanceRequests(this.deps, only)
      .then((moved) => {
        if ([...moved].some(this.prompt)) this.again = true;
      })
      .catch((err: unknown) => this.deps.log.error({ job: 'requests', err }, 'job failed'))
      .finally(() => {
        this.running = null;
        if (this.again && !this.stopped) {
          this.again = false;
          void this.start(this.prompt);
        }
      });
    this.running = turn;
    return turn;
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
 * A retry: back to the step it failed in. A download starts afresh on the same release, except one
 * that only stalled, which is still in the client and may have come alive since: it keeps its bytes
 * and gets a full limit again. An import that was found wanting by the index keeps what it named and
 * waits again. Null when refused, as a
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
  const stalled = request.state.status === 'failed' && request.state.reason === 'downloadStalled';
  if (restarts && stalled && request.handle !== null) {
    const followed = { state, progressAt: deps.now() };
    return saveRequest(deps.db, id, followed, deps.now(), request.version)
      ? getRequest(deps.db, id)
      : null;
  }
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
 * A choice of a candidate while one is waited for: a person's, or the job's after a stall, which
 * passes on its count. Null when refused: the request takes no choice now, or nobody offered that
 * candidate.
 */
export function chooseRelease(
  deps: RequestActDeps,
  id: string,
  candidateId: string,
  change: Pick<RequestChange, 'autoStarts'> = {},
): StoredRequest | null {
  const request = getRequest(deps.db, id);
  const state = request && next(request.medium, request.state, { type: 'chose' });
  if (!request || !state) return null;
  const release = request.candidates.find((candidate) => candidate.id === candidateId);
  if (release === undefined) return null;
  saveRequest(deps.db, id, { ...change, state, release }, deps.now(), request.version);
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
