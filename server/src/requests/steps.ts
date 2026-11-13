/**
 * What each medium does for a request, behind one interface, so the advance job runs every
 * medium the same way. A medium registers its steps when its item lands (books, albums, kept
 * songs, podcasts); a medium with none registered cannot be requested.
 *
 * Releases and download handles stay on the server: a client picks a candidate by the id the
 * server gave it, never by a URL.
 */
import type { MediaRef, RequestFailure, RequestMedium } from '@auralis/schema';
import { z } from 'zod';
import { ROUTES } from './machine.js';
import type { StoredRequest } from '../store/requests.js';

/**
 * One release a search found: the id a client picks it by, what a person sees of it (title,
 * where it came from, size in bytes), and the medium's own details for fetching it.
 */
export const Release = z
  .object({
    id: z.string().regex(/^[\w-]{1,64}$/),
    title: z.string(),
    source: z.string(),
    size: z.number().int().nonnegative().nullable(),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();
export type Release = z.infer<typeof Release>;

/** What a medium keeps to follow its download, such as a torrent's hash. */
export const DownloadHandle = z.record(z.string(), z.unknown());
export type DownloadHandle = z.infer<typeof DownloadHandle>;

/**
 * A search's answer: one release picked, with the others it passed over in case that one fails;
 * candidates for the person to choose from; none; or not yet, for a search that asks its upstream
 * a little each turn, as an album's asks one query a turn to stay inside the step's limit. A waiting
 * search saves nothing, and is called again next turn.
 */
export type SearchOutcome =
  | { kind: 'picked'; release: Release; others: Release[] }
  | { kind: 'choose'; candidates: Release[] }
  | { kind: 'none'; reason: RequestFailure }
  | { kind: 'waiting' };

/** How a download stands: waiting in the client's queue, under way, finished, or failed. */
export type PollOutcome =
  | { kind: 'queued' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'done' }
  | { kind: 'failed'; reason: RequestFailure };

/**
 * An import's answer: the item the index will find once it is in; that it is not ready to name one
 * yet, as when a server only assigns an id once it has seen the folder; or that the download is not
 * what was asked for, with the reason. A waiting import saves nothing, and is called again next turn
 * under the same key. A failed one ends the request as a poll's failure does: `wrongRelease` (an
 * album whose files fit none of its editions) gives way to the next release the search found.
 */
export type ImportOutcome =
  | { kind: 'arrived'; ref: MediaRef }
  | { kind: 'waiting' }
  | { kind: 'failed'; reason: RequestFailure };

/**
 * Thrown by a step for an upstream it could not reach: a refused connection, a time limit of its
 * own, a 5xx. It says nothing about the request, so the job holds it where it stands and asks again
 * next turn, failing it only once it has been held too long. A step's own limit must be below the
 * job's, which fails the request as any other throw does.
 */
export class StepUnavailable extends Error {
  override readonly name = 'StepUnavailable';
}

/**
 * The download a cancel drops: the one a handle names, or, when the answer of a `start` was lost so
 * no handle was saved, whatever that start made, by its key and the release it was given.
 */
export type DownloadTarget = { handle: DownloadHandle } | { key: string; release: Release };

/**
 * Starting, following and dropping a download, for a medium whose route downloads. `start` takes
 * the idempotency key `MediumSteps` describes.
 *
 * `cancel` by key must find what a `start` under that key made, from the release (a torrent's info
 * hash) or from the key itself if `start` left it upstream (a torrent's tag). A key no start reached
 * drops nothing, and a second cancel of the same download does no harm.
 *
 * A handle names a download, not the attempt that made it: a medium keyed by info hash answers the
 * same handle when a retry starts the same release again. It need not tell these attempts apart,
 * as the job keeps a late cancel away from a later start. Of two taps on one request, only the one
 * whose save wins sends a cancel; and each medium's starts and cancels go out one at a time, in the
 * order they were asked for, so a start waits for every cancel asked for before it, or for that
 * cancel's time limit.
 */
export interface DownloadSteps {
  start(request: StoredRequest, release: Release, key: string): Promise<DownloadHandle>;
  poll(handle: DownloadHandle): Promise<PollOutcome>;
  cancel(target: DownloadTarget): Promise<void>;
}

/**
 * One medium's steps: search for its target, download a release if its route downloads, and
 * import it, naming the item the index will find once it is in.
 *
 * The job saves an idempotency key on the request before it calls `start` or `import`, and passes
 * that key to the step. A crash can fall between the step and saving what it answered, so the same
 * key can come again: each medium must treat a repeat of a key as the same call and answer the same
 * result, doing nothing twice; an import may answer `waiting` until it can answer the rest. Real mediums get this cheaply from what they already have, such as
 * a torrent's info hash or a folder path.
 *
 * The job aborts `signal` when `import` passes its time limit. The request fails then, and the step
 * must not make its change after that: what it has not committed stays uncommitted.
 */
export interface MediumSteps {
  readonly medium: RequestMedium;
  /**
   * Moves on as soon as a step lets it, not at the job's next turn: a request whose status a turn
   * moved, or that `Wake` names, gets one more turn at once. A medium that waits on a slow upstream
   * anyway (a torrent) leaves this off and keeps the job's turns.
   */
  readonly prompt?: boolean;
  search(request: StoredRequest): Promise<SearchOutcome>;
  readonly download?: DownloadSteps;
  import(request: StoredRequest, key: string, signal?: AbortSignal): Promise<ImportOutcome>;
}

/** The registered steps, by medium. */
export type StepsRegistry = ReadonlyMap<RequestMedium, MediumSteps>;

/**
 * The registry of the given steps. Refuses two for one medium, and steps whose download does not
 * match their medium's route: a route with a download needs one, a route without has none.
 */
export function stepsRegistry(steps: readonly MediumSteps[]): StepsRegistry {
  const registry = new Map<RequestMedium, MediumSteps>();
  for (const one of steps) {
    if (registry.has(one.medium)) throw new Error(`two steps registered for ${one.medium}`);
    const downloads = ROUTES[one.medium].includes('downloading');
    if (downloads !== (one.download !== undefined)) {
      throw new Error(`${one.medium} steps ${downloads ? 'need' : 'have no'} download`);
    }
    registry.set(one.medium, one);
  }
  return registry;
}
