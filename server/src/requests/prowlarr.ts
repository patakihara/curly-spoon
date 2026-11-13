/**
 * The server's one Prowlarr, which books and albums share. Every search and every release link it
 * asks reaches the indexers' own sites, which set their own limits, so it asks one at a time for the
 * whole server, each starting at least 10 s after the one before it ended. A client each would let a
 * book search and an album search run against the sites at once.
 *
 * Which indexers list music is asked of Prowlarr alone, and waits for no turn.
 */
import type { FetchLike } from '../adapters/http/fetch.js';
import type { Clock } from '../adapters/musicbrainz/client.js';
import {
  ProwlarrClient,
  type ProwlarrDetails,
  type ProwlarrRelease,
  type ProwlarrSearchWithin,
  type ResolvedRelease,
} from '../adapters/prowlarr/client.js';
import type { AppConfig } from '../config.js';
import { readSecretFile } from '../secretFile.js';

export const PROWLARR_GAP_MS = 10_000;

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type ProwlarrCalls = Pick<ProwlarrClient, 'search' | 'resolve' | 'musicIndexers'>;

export class SharedProwlarr implements ProwlarrCalls {
  private readonly clock: Clock;
  /** The end of the queue: the turn asked last. */
  private tail: Promise<unknown> = Promise.resolve();
  /** When the last turn ended, so the next starts no sooner than the gap after it. */
  private lastEnded = Number.NEGATIVE_INFINITY;

  /** `client` is to be called only inside a turn: `inTurn` hands it over. */
  constructor(
    private readonly client: ProwlarrCalls,
    clock?: Clock,
  ) {
    this.clock = clock ?? realClock;
  }

  /** Runs `work` with the client once every turn before it has ended and the gap has passed. */
  inTurn<T>(work: (client: ProwlarrCalls) => Promise<T>): Promise<T> {
    const turn = this.tail.then(async () => {
      const wait = this.lastEnded + PROWLARR_GAP_MS - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      try {
        return await work(this.client);
      } finally {
        this.lastEnded = this.clock.now();
      }
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  search(query: string, within: ProwlarrSearchWithin): Promise<ProwlarrRelease[]> {
    return this.inTurn((client) => client.search(query, within));
  }

  resolve(details: ProwlarrDetails): Promise<ResolvedRelease> {
    return this.inTurn((client) => client.resolve(details));
  }

  musicIndexers(): Promise<number[]> {
    return this.client.musicIndexers();
  }
}

/** The one Prowlarr: null when it is not set up, or its key file holds no key. */
export function prowlarrOf(
  config: AppConfig,
  fetch: FetchLike,
  clock?: Clock,
): SharedProwlarr | null {
  const { prowlarr } = config.books;
  if (prowlarr === null) return null;
  let apiKey: string;
  try {
    apiKey = readSecretFile(prowlarr.keyFile, 'PROWLARR_API_KEY');
  } catch {
    return null;
  }
  return new SharedProwlarr(new ProwlarrClient({ baseUrl: prowlarr.url, apiKey, fetch }), clock);
}
