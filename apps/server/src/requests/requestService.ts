/**
 * Orchestrates the request pipeline: turn a book request into a chosen release, hand the
 * release to a download client, and watch the download through to an Audiobookshelf rescan.
 *
 * This module owns *no* provider logic — it drives `IndexerProvider`/`DownloadClientProvider`
 * (see `types.ts`) purely through their contract, built by the registries from whatever rows
 * `provider_configs` holds. That is deliberate: "support another indexer" must stay a new
 * file in `indexers/`, not a new branch in here.
 */

import { randomUUID } from 'node:crypto';
import type { AbsClient, FetchLike } from '@auralis/abs-client';
import type { Db } from '../db/connection.js';
import { listProviderConfigs } from '../db/providerConfigRepo.js';
import { getApprovalPolicy, getBookSavePath, getBookCategory } from '../db/appSettingsRepo.js';
import {
  createRequest as insertRequest,
  getRequest,
  listRequests,
  updateRequest,
  type BookRequest,
} from '../db/requestsRepo.js';
import { canTransition, type RequestStatus } from './requestStatus.js';
import {
  ProviderError,
  type DownloadClientProvider,
  type DownloadStatus,
  type IndexerProvider,
  type IndexerSearchQuery,
  type ProviderErrorKind,
  type Release,
  type ResolvedProviderConfig,
} from './types.js';
import { getIndexerFactory, indexerDescriptors } from './indexers/registry.js';
import { getDownloadClientFactory, downloadClientDescriptors } from './download/registry.js';

export interface RequestServiceDeps {
  db: Db;
  sessionSecret: string;
  fetch: FetchLike;
  /** Builds an Audiobookshelf client for a user — used for the post-import rescan. */
  absFor: (userId: string) => AbsClient;
  // No injected clock here on purpose. Every timestamp in this pipeline is written by
  // `requestsRepo`, which calls `Date.now()` itself, so a `now` on this interface would
  // advertise a determinism it cannot deliver. Anything built here that genuinely needs a
  // controllable clock — retry backoff, staleness — has to inject it into the repo first.
  /** Optional structured logger; default is a no-op. */
  logger?: { info(o: unknown, m?: string): void; warn(o: unknown, m?: string): void };
}

export interface SearchOutcome {
  releases: Release[];
  /** One entry per indexer that failed. The search still succeeds. */
  errors: Array<{ indexerId: string; kind: ProviderErrorKind; message: string }>;
}

export interface CreateBookRequestInput {
  userId: string;
  title: string;
  author?: string;
  release?: Release;
}

export interface RequestService {
  listIndexers(): IndexerProvider[];
  getDownloadClient(): DownloadClientProvider | null;
  searchReleases(query: IndexerSearchQuery): Promise<SearchOutcome>;
  createRequest(input: CreateBookRequestInput): BookRequest;
  approve(id: string): BookRequest;
  reject(id: string): BookRequest;
  retry(id: string): BookRequest;
  grab(id: string): Promise<BookRequest>;
  pollDownloads(): Promise<void>;
}

/** Thrown by `approve`/`reject`/`retry`/`grab` when the id has no matching row. */
export class RequestNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`request "${id}" not found`);
    this.name = 'RequestNotFoundError';
    this.id = id;
  }
}

/** Thrown when a status move is not in `requestStatus.ts`'s transition table, so the route
 * layer can answer 409 rather than silently corrupting the pipeline's state machine. */
export class RequestTransitionError extends Error {
  readonly from: RequestStatus;
  readonly to: RequestStatus;

  constructor(from: RequestStatus, to: RequestStatus) {
    super(`cannot move a request from "${from}" to "${to}"`);
    this.name = 'RequestTransitionError';
    this.from = from;
    this.to = to;
  }
}

type Logger = NonNullable<RequestServiceDeps['logger']>;

const NOOP_LOGGER: Logger = {
  info() {
    /* no-op */
  },
  warn() {
    /* no-op */
  },
};

/**
 * `seeders` descending, then `publishedAt` descending with nulls last.
 *
 * A full tie is broken in favour of Prowlarr: it reaches real trackers and reports real
 * seeder counts, whereas the AudiobookBay scraper cannot see that number at all and reports
 * zero for everything it lists. On a genuine tie the scraper's entry is therefore the less
 * informative of the two, so Prowlarr's copy of the same release ranks first.
 */
function compareReleases(a: Release, b: Release): number {
  if (a.seeders !== b.seeders) return b.seeders - a.seeders;

  if (a.publishedAt !== b.publishedAt) {
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return b.publishedAt - a.publishedAt;
  }

  const aIsProwlarr = a.indexerId === 'prowlarr';
  const bIsProwlarr = b.indexerId === 'prowlarr';
  if (aIsProwlarr !== bIsProwlarr) return aIsProwlarr ? -1 : 1;

  return 0;
}

function hasUsableLink(release: Release): boolean {
  return release.magnetUri !== null || release.downloadUrl !== null;
}

export function createRequestService(deps: RequestServiceDeps): RequestService {
  const logger = deps.logger ?? NOOP_LOGGER;

  /**
   * Builds every enabled, known indexer provider from the current `provider_configs` rows.
   * Not cached — configuration can change between calls, and there is nothing here
   * expensive enough to be worth the staleness risk of caching it.
   */
  function buildIndexerProviders(): IndexerProvider[] {
    const configs = listProviderConfigs(deps.db, deps.sessionSecret, 'indexer');
    const providers: IndexerProvider[] = [];
    for (const config of configs) {
      const provider = buildProvider(config, getIndexerFactory, indexerDescriptors);
      if (provider) providers.push(provider);
    }
    return providers;
  }

  function buildDownloadClientProviders(): DownloadClientProvider[] {
    const configs = listProviderConfigs(deps.db, deps.sessionSecret, 'download');
    const providers: DownloadClientProvider[] = [];
    for (const config of configs) {
      const provider = buildProvider(config, getDownloadClientFactory, downloadClientDescriptors);
      if (provider) providers.push(provider);
    }
    return providers;
  }

  /**
   * Shared skip-and-warn logic for both provider kinds: an enabled row this build's registry
   * does not know, or one that needs a secret it does not have, must not take the whole
   * feature down — it is either an orphaned row from a downgrade, or a secret that failed to
   * decrypt (which already reads as `null` by design; see `providerConfigRepo.ts`) and the
   * user needs everything else to keep working while they re-enter it.
   */
  function buildProvider<P>(
    config: ResolvedProviderConfig,
    getFactory: (
      id: string,
    ) => ((deps: { config: ResolvedProviderConfig; fetch: FetchLike }) => P) | null,
    descriptors: Array<{ id: string; requiresSecret: boolean }>,
  ): P | null {
    if (!config.enabled) return null;

    const factory = getFactory(config.id);
    if (!factory) {
      logger.warn({ providerId: config.id }, `unknown provider "${config.id}" — skipping`);
      return null;
    }

    const descriptor = descriptors.find((d) => d.id === config.id);
    if (descriptor?.requiresSecret && config.secret === null) {
      logger.warn(
        { providerId: config.id },
        `provider "${config.id}" requires a secret but none is stored — skipping`,
      );
      return null;
    }

    return factory({ config, fetch: deps.fetch });
  }

  function listIndexers(): IndexerProvider[] {
    return buildIndexerProviders();
  }

  function getDownloadClient(): DownloadClientProvider | null {
    return buildDownloadClientProviders()[0] ?? null;
  }

  /**
   * Runs one indexer's search and never rejects — a failure is folded into the return value
   * instead, tagged with the indexer's own id. `Promise.allSettled` would work too, but it
   * hands back results paired with array *position*, and re-zipping that against `indexers`
   * runs straight into `noUncheckedIndexedAccess`; catching here avoids the zip entirely.
   */
  async function attemptSearch(
    indexer: IndexerProvider,
    query: IndexerSearchQuery,
  ): Promise<{ releases: Release[] } | { error: SearchOutcome['errors'][number] }> {
    try {
      return { releases: await indexer.search(query) };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { error: { indexerId: indexer.id, kind: err.kind, message: err.message } };
      }
      // An unexpected exception is still that indexer's fault, not the search's — it must
      // not fail the whole fan-out, only be reported against the indexer that threw it.
      const message = err instanceof Error ? err.message : String(err);
      return { error: { indexerId: indexer.id, kind: 'bad_response', message } };
    }
  }

  async function searchReleases(query: IndexerSearchQuery): Promise<SearchOutcome> {
    const indexers = listIndexers();
    const attempts = await Promise.all(indexers.map((indexer) => attemptSearch(indexer, query)));

    const releases: Release[] = [];
    const errors: SearchOutcome['errors'] = [];
    for (const attempt of attempts) {
      if ('releases' in attempt) releases.push(...attempt.releases);
      else errors.push(attempt.error);
    }

    releases.sort(compareReleases);
    return { releases, errors };
  }

  function createRequest(input: CreateBookRequestInput): BookRequest {
    const status: RequestStatus = getApprovalPolicy(deps.db) === 'auto' ? 'approved' : 'pending';
    return insertRequest(deps.db, {
      id: randomUUID(),
      userId: input.userId,
      title: input.title,
      author: input.author ?? null,
      status,
      release: input.release ?? null,
    });
  }

  function requireRequest(id: string): BookRequest {
    const request = getRequest(deps.db, id);
    if (!request) throw new RequestNotFoundError(id);
    return request;
  }

  function moveTo(
    request: BookRequest,
    to: RequestStatus,
    patch: Partial<Omit<Parameters<typeof updateRequest>[2], 'status'>> = {},
  ): BookRequest {
    if (!canTransition(request.status, to)) {
      throw new RequestTransitionError(request.status, to);
    }
    const updated = updateRequest(deps.db, request.id, { ...patch, status: to });
    // The row was just read above in the same connection; it cannot have vanished between
    // the read and this write.
    if (!updated) throw new RequestNotFoundError(request.id);
    return updated;
  }

  function approve(id: string): BookRequest {
    return moveTo(requireRequest(id), 'approved');
  }

  function reject(id: string): BookRequest {
    return moveTo(requireRequest(id), 'rejected');
  }

  function retry(id: string): BookRequest {
    // A retried request showing the previous failure reason is a lie — clear it explicitly
    // (not `undefined`, which `updateRequest` treats as "leave alone").
    return moveTo(requireRequest(id), 'searching', { statusDetail: null });
  }

  /** Writes a terminal-looking failure with an explanation. Always legal: every state this
   * is called from (`searching`, `downloading`) allows a move to `failed`. */
  function failRequest(id: string, statusDetail: string): BookRequest {
    const updated = updateRequest(deps.db, id, { status: 'failed', statusDetail });
    if (!updated) throw new RequestNotFoundError(id);
    return updated;
  }

  async function grab(id: string): Promise<BookRequest> {
    // Illegal starting state is the caller's mistake, not a provider failure — let it throw
    // before the try/catch below, which exists only to convert *provider* failures.
    //
    // A request already in `searching` is passed through rather than transitioned. The
    // transition table has no self-loop, so without this, the natural "try again" sequence
    // — `retry()` to clear the old failure, then `grab()` to act on it — would throw, and
    // the request would sit in `searching` with nothing driving it. Grabbing what is
    // already being searched for is a resumption, not an illegal move.
    const loaded = requireRequest(id);
    const request = loaded.status === 'searching' ? loaded : moveTo(loaded, 'searching');

    try {
      let release = request.release;
      let searchErrors: SearchOutcome['errors'] = [];
      if (!release) {
        const outcome = await searchReleases({
          term: request.title,
          author: request.author ?? undefined,
        });
        release = outcome.releases[0] ?? null;
        searchErrors = outcome.errors;
      }
      if (!release) {
        // Distinguish "the indexers answered, and none of them had it" from "the indexers
        // never answered". Reporting a broken Prowlarr as "nothing found" sends the user
        // hunting for a book that is there, instead of at the service that is down.
        const detail =
          searchErrors.length > 0
            ? `no releases found for "${request.title}" — ${searchErrors
                .map((e) => `${e.indexerId}: ${e.message}`)
                .join('; ')}`
            : `no releases found for "${request.title}"`;
        return failRequest(request.id, detail);
      }
      const chosen = release;

      // Complete the release generically: only the indexer that produced it knows how, and
      // only some indexers need to (see `IndexerProvider.resolveDownload`'s doc comment).
      // If that indexer is no longer enabled, fall back to the release as-is rather than
      // failing outright — it may already carry a usable link.
      const owningIndexer = listIndexers().find((indexer) => indexer.id === chosen.indexerId);
      const complete = owningIndexer
        ? ((await owningIndexer.resolveDownload?.(chosen)) ?? chosen)
        : chosen;

      if (!hasUsableLink(complete)) {
        return failRequest(
          request.id,
          'the chosen release has neither a magnet link nor a download URL',
        );
      }

      const client = getDownloadClient();
      if (!client) {
        return failRequest(request.id, 'no download client is configured');
      }

      const handle = await client.add(complete, {
        savePath: getBookSavePath(deps.db),
        category: getBookCategory(deps.db),
      });

      return moveTo(request, 'downloading', {
        release: complete,
        indexerId: complete.indexerId,
        clientId: client.id,
        downloadHandle: handle,
        statusDetail: null,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return failRequest(request.id, err.message);
      }
      throw err;
    }
  }

  async function tryRescan(userId: string): Promise<string | null> {
    try {
      const abs = deps.absFor(userId);
      const libraries = await abs.getLibraries();
      const bookLibrary = libraries.find((library) => library.mediaType === 'book');
      if (!bookLibrary) {
        return 'downloaded, but no book library was found to rescan';
      }
      await abs.scanLibrary(bookLibrary.id);
      return null;
    } catch (err) {
      logger.warn({ err }, 'post-download library rescan failed');
      return 'downloaded, but the library rescan failed to start';
    }
  }

  async function pollOne(request: BookRequest, handle: string): Promise<void> {
    const client = buildDownloadClientProviders().find((c) => c.id === request.clientId);
    if (!client) {
      updateRequest(deps.db, request.id, {
        status: 'failed',
        statusDetail: `download client "${String(request.clientId)}" is no longer configured`,
      });
      return;
    }

    let status: DownloadStatus;
    try {
      status = await client.status(handle);
    } catch (err) {
      if (err instanceof ProviderError) {
        updateRequest(deps.db, request.id, { status: 'failed', statusDetail: err.message });
        return;
      }
      throw err;
    }

    if (status.state === 'completed' || status.state === 'seeding') {
      // Idempotence: this write moves the row out of `downloading` *before* the rescan is
      // awaited, rather than after. `pollDownloads` selects on `status = 'downloading'` at
      // the start of each call, so any call whose selection runs after this write lands will
      // no longer see this row and cannot rescan it again — in particular, two *sequential*
      // `await`ed calls only ever rescan a given completed download once. (This does not by
      // itself defend against two calls running fully concurrently and both reading the row
      // before either writes; nothing here builds a lock for that case.)
      updateRequest(deps.db, request.id, { status: 'importing', progress: status.progress });
      const rescanNote = await tryRescan(request.userId);
      updateRequest(deps.db, request.id, {
        status: 'completed',
        statusDetail: rescanNote,
        progress: 1,
      });
      return;
    }

    if (status.state === 'error') {
      updateRequest(deps.db, request.id, {
        status: 'failed',
        statusDetail: status.errorMessage ?? 'the download client reported an error',
        progress: status.progress,
      });
      return;
    }

    if (status.state === 'missing') {
      updateRequest(deps.db, request.id, {
        status: 'failed',
        statusDetail: 'the download vanished from the download client',
      });
      return;
    }

    // 'queued' | 'downloading' | 'paused' — still in progress, just record where it stands.
    updateRequest(deps.db, request.id, { progress: status.progress });
  }

  async function pollDownloads(): Promise<void> {
    const inProgress = listRequests(deps.db, { status: 'downloading' }).filter(
      (r): r is BookRequest & { downloadHandle: string } => r.downloadHandle !== null,
    );

    for (const request of inProgress) {
      try {
        await pollOne(request, request.downloadHandle);
      } catch (err) {
        // One request's failure must not abort the loop for the others.
        logger.warn({ requestId: request.id, err }, 'pollDownloads: failed to poll a request');
      }
    }
  }

  return {
    listIndexers,
    getDownloadClient,
    searchReleases,
    createRequest,
    approve,
    reject,
    retry,
    grab,
    pollDownloads,
  };
}
