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
 * candidates for the person to choose from; or none.
 */
export type SearchOutcome =
  | { kind: 'picked'; release: Release; others: Release[] }
  | { kind: 'choose'; candidates: Release[] }
  | { kind: 'none'; reason: RequestFailure };

/** How a download stands: waiting in the client's queue, under way, finished, or failed. */
export type PollOutcome =
  | { kind: 'queued' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'done' }
  | { kind: 'failed'; reason: RequestFailure };

/** Starting, following and dropping a download, for a medium whose route downloads. */
export interface DownloadSteps {
  start(request: StoredRequest, release: Release): Promise<DownloadHandle>;
  poll(handle: DownloadHandle): Promise<PollOutcome>;
  cancel(handle: DownloadHandle): Promise<void>;
}

/**
 * One medium's steps: search for its target, download a release if its route downloads, and
 * import it, naming the item the index will find once it is in.
 */
export interface MediumSteps {
  readonly medium: RequestMedium;
  search(request: StoredRequest): Promise<SearchOutcome>;
  readonly download?: DownloadSteps;
  import(request: StoredRequest): Promise<{ ref: MediaRef }>;
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
