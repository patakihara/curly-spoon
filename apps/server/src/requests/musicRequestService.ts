/**
 * Orchestrates the music-request pipeline: list/search providers, persist a chosen
 * candidate as a request, hand it to slskd, and — once slskd reports the transfer done —
 * ask Jellyfin to pick the file up. Structurally a mirror of `requestService.ts` now:
 * `grab()` lands on `downloading` exactly as before, and `pollDownloads()`/`pollOne()`
 * carry a request the rest of the way, the same shape as the book pipeline's own polling.
 *
 * The one deliberate divergence is the terminal state `pollOne` lands on. Book's `pollOne`
 * finishes at `completed` after calling Audiobookshelf's `scanLibrary`; music's finishes at
 * `importRequested` after calling `JellyfinClient.refreshItem`, a **different** terminal
 * status, not just a different call. That call is verified fire-and-forget with no
 * completion signal at all (see `refreshItem`'s doc comment in
 * `packages/jellyfin-client/src/client.ts`) — Auralis has no way to learn whether Jellyfin
 * actually found the file. Calling that `completed` would assert something this codebase
 * cannot know; `requestStatus.ts`'s header comment has the full reasoning for why
 * `importRequested` exists as its own terminal status instead of reusing `completed`.
 *
 * The schema half of the original persistence blocker (`docs/ROADMAP.md` §9's "Create and
 * list are deliberately absent") is migration 4 in `db/migrations.ts` — a `media_type`
 * column on the shared `requests` table, not a sibling table; see that migration's own
 * comment for why.
 */

import { randomUUID } from 'node:crypto';
import type { FetchLike } from '@auralis/abs-client';
import type { JellyfinClient } from '@auralis/jellyfin-client';
import type { Db } from '../db/connection.js';
import { listProviderConfigs } from '../db/providerConfigRepo.js';
import { getApprovalPolicy, getMusicCategory, getMusicSavePath } from '../db/appSettingsRepo.js';
import {
  createRequest as insertRequest,
  getRequest,
  listRequests as listRequestRows,
  updateRequest,
  type MediaRequest,
} from '../db/requestsRepo.js';
import { canTransition, type RequestStatus } from './requestStatus.js';
import { RequestNotFoundError, RequestTransitionError } from './requestService.js';
import {
  ProviderError,
  type DownloadStatus,
  type MusicCandidate,
  type MusicRequestProvider,
  type MusicSearchQuery,
  type ProviderErrorKind,
  type ResolvedProviderConfig,
} from './types.js';
import { getMusicProviderFactory, musicProviderDescriptors } from './music/registry.js';

export interface MusicRequestServiceDeps {
  db: Db;
  sessionSecret: string;
  fetch: FetchLike;
  /** Builds a `JellyfinClient` for a user — used for the post-download library rescan,
   * mirrored from `requestService.ts`'s `absFor`. */
  jellyfinFor: (userId: string) => JellyfinClient;
  /** Optional structured logger; default is a no-op — mirrors `requestService.ts`'s. */
  logger?: { info(o: unknown, m?: string): void; warn(o: unknown, m?: string): void };
}

export interface MusicSearchOutcome {
  candidates: MusicCandidate[];
  /** One entry per provider that failed. The search still succeeds. */
  errors: Array<{ providerId: string; kind: ProviderErrorKind; message: string }>;
}

export interface CreateMusicRequestInput {
  userId: string;
  /** The specific file, held by the specific peer, the caller picked from a prior
   * `searchMusic` call. Required — see `schemas.ts`'s `createMusicRequestBodySchema` doc
   * comment for why there is no "search for this later" path here. */
  candidate: MusicCandidate;
}

export interface MusicRequestService {
  listProviders(): MusicRequestProvider[];
  searchMusic(query: MusicSearchQuery): Promise<MusicSearchOutcome>;
  createRequest(input: CreateMusicRequestInput): MediaRequest;
  /** Newest first, this user's music requests only — `listRequestRows` is always called
   * with `mediaType: 'music'` here, so a book row can never leak into this list. */
  listRequests(status?: RequestStatus): MediaRequest[];
  approve(id: string): MediaRequest;
  reject(id: string): MediaRequest;
  retry(id: string): MediaRequest;
  /** Enqueues the request's already-chosen candidate with its owning provider and moves
   * the request to `downloading`. `pollDownloads` carries it the rest of the way. */
  grab(id: string): Promise<MediaRequest>;
  /** Advances every `downloading` music request one step: records progress, fails it on
   * error/vanished, or — once the provider reports the transfer done — asks Jellyfin to
   * rescan and lands on `importRequested`. Mirrors `requestService.ts`'s `pollDownloads`;
   * see this file's header comment for the one deliberate difference in terminal state. */
  pollDownloads(): Promise<void>;
}

type Logger = NonNullable<MusicRequestServiceDeps['logger']>;

const NOOP_LOGGER: Logger = {
  info() {
    /* no-op */
  },
  warn() {
    /* no-op */
  },
};

export function createMusicRequestService(deps: MusicRequestServiceDeps): MusicRequestService {
  const logger = deps.logger ?? NOOP_LOGGER;

  /** Builds every enabled, known music provider from the current `provider_configs` rows.
   * Not cached — same reasoning as `requestService.ts`'s `buildIndexerProviders`. */
  function buildProviders(): MusicRequestProvider[] {
    const configs = listProviderConfigs(deps.db, deps.sessionSecret, 'music');
    const providers: MusicRequestProvider[] = [];
    for (const config of configs) {
      const provider = buildOne(config);
      if (provider) providers.push(provider);
    }
    return providers;
  }

  /** Shared skip-and-warn logic, identical in spirit to `requestService.ts`'s `buildProvider`:
   * an enabled row this build's registry does not know, or one missing a required secret,
   * must not take music search down for everyone — see that function's own comment. */
  function buildOne(config: ResolvedProviderConfig): MusicRequestProvider | null {
    if (!config.enabled) return null;

    const factory = getMusicProviderFactory(config.id);
    if (!factory) {
      logger.warn({ providerId: config.id }, `unknown music provider "${config.id}" — skipping`);
      return null;
    }

    const descriptor = musicProviderDescriptors.find((d) => d.id === config.id);
    if (descriptor?.requiresSecret && config.secret === null) {
      logger.warn(
        { providerId: config.id },
        `music provider "${config.id}" requires a secret but none is stored — skipping`,
      );
      return null;
    }

    return factory({ config, fetch: deps.fetch });
  }

  function listProviders(): MusicRequestProvider[] {
    return buildProviders();
  }

  /** Runs one provider's search and never rejects — same reasoning and shape as
   * `requestService.ts`'s `attemptSearch`. */
  async function attemptSearch(
    provider: MusicRequestProvider,
    query: MusicSearchQuery,
  ): Promise<{ candidates: MusicCandidate[] } | { error: MusicSearchOutcome['errors'][number] }> {
    try {
      return { candidates: await provider.search(query) };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { error: { providerId: provider.id, kind: err.kind, message: err.message } };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { error: { providerId: provider.id, kind: 'bad_response', message } };
    }
  }

  async function searchMusic(query: MusicSearchQuery): Promise<MusicSearchOutcome> {
    const providers = listProviders();
    const attempts = await Promise.all(providers.map((p) => attemptSearch(p, query)));

    const candidates: MusicCandidate[] = [];
    const errors: MusicSearchOutcome['errors'] = [];
    for (const attempt of attempts) {
      // Candidates are concatenated in provider order, each already ranked internally
      // (`slskd.ts`'s own peer-availability ranking) — unlike `requestService.ts`'s
      // `compareReleases`, there is no cross-provider axis (like torrent seeders) common to
      // every music provider to re-sort on, so this wave does not invent one.
      if ('candidates' in attempt) candidates.push(...attempt.candidates);
      else errors.push(attempt.error);
    }

    return { candidates, errors };
  }

  function createRequest(input: CreateMusicRequestInput): MediaRequest {
    const status: RequestStatus = getApprovalPolicy(deps.db) === 'auto' ? 'approved' : 'pending';
    return insertRequest(deps.db, {
      id: randomUUID(),
      userId: input.userId,
      // Derived from the candidate, not taken from the request body — see
      // `createMusicRequestBodySchema`'s doc comment for why there is no independent
      // client-supplied title/author here.
      title: input.candidate.title,
      author: input.candidate.artist,
      status,
      mediaType: 'music',
      candidate: input.candidate,
    });
  }

  function listRequests(status?: RequestStatus): MediaRequest[] {
    return listRequestRows(
      deps.db,
      status ? { status, mediaType: 'music' } : { mediaType: 'music' },
    );
  }

  /** Same guard in spirit as `requestService.ts`'s own `requireRequest`, mirrored rather
   * than shared: a book-request id must 404 here exactly as a nonexistent one would, not be
   * silently acted on by the music pipeline. */
  function requireRequest(id: string): MediaRequest {
    const request = getRequest(deps.db, id);
    if (!request || request.mediaType !== 'music') throw new RequestNotFoundError(id);
    return request;
  }

  function moveTo(
    request: MediaRequest,
    to: RequestStatus,
    patch: Partial<Omit<Parameters<typeof updateRequest>[2], 'status'>> = {},
  ): MediaRequest {
    if (!canTransition(request.status, to)) {
      throw new RequestTransitionError(request.status, to);
    }
    const updated = updateRequest(deps.db, request.id, { ...patch, status: to });
    if (!updated) throw new RequestNotFoundError(request.id);
    return updated;
  }

  function approve(id: string): MediaRequest {
    return moveTo(requireRequest(id), 'approved');
  }

  function reject(id: string): MediaRequest {
    return moveTo(requireRequest(id), 'rejected');
  }

  function retry(id: string): MediaRequest {
    return moveTo(requireRequest(id), 'searching', { statusDetail: null });
  }

  /** Writes a terminal-looking failure with an explanation. Always legal: every state this
   * is called from (`searching`) allows a move to `failed`. */
  function failRequest(id: string, statusDetail: string): MediaRequest {
    const updated = updateRequest(deps.db, id, { status: 'failed', statusDetail });
    if (!updated) throw new RequestNotFoundError(id);
    return updated;
  }

  async function grab(id: string): Promise<MediaRequest> {
    // Illegal starting state (e.g. still `pending` under manual approval) is the caller's
    // mistake, not a provider failure — let it throw before the try/catch below. Passing
    // through an already-`searching` request mirrors `requestService.ts`'s `grab()`: there
    // is no self-loop in `TRANSITIONS`, so a retry (`retry()` then `grab()`) would otherwise
    // throw on the second call. `searching` means "the pipeline is working on this", not
    // "a provider query is in flight" — book `grab()` already establishes that reading for
    // a request whose release was chosen ahead of time, which every music request's is.
    const loaded = requireRequest(id);
    const request = loaded.status === 'searching' ? loaded : moveTo(loaded, 'searching');

    // Not reachable through `createMusicRequestBodySchema` (candidate is required there),
    // but `MediaRequest.candidate` is still typed nullable — a hand-edited row, or a future
    // caller of `createRequest` that skips validation, must fail loudly rather than crash
    // on a null dereference below.
    if (!request.candidate) {
      return failRequest(request.id, 'this request has no chosen candidate to download');
    }
    const candidate = request.candidate;

    const provider = buildProviders().find((p) => p.id === candidate.providerId);
    if (!provider) {
      return failRequest(request.id, `music provider "${candidate.providerId}" is not configured`);
    }

    try {
      const handle = await provider.add(candidate, {
        savePath: getMusicSavePath(deps.db),
        category: getMusicCategory(deps.db),
      });

      // `indexerId`/`clientId` both name the same provider — slskd (like any
      // `MusicRequestProvider`) is one upstream doing what an indexer and a download
      // client split for books (`types.ts`'s file comment on `MusicRequestProvider`), so
      // there is no second id to record.
      return moveTo(request, 'downloading', {
        indexerId: provider.id,
        clientId: provider.id,
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

  /**
   * Asks Jellyfin to rescan the music library, scoped to whichever library
   * `JellyfinClient.getLibraries()` reports as `collectionType === 'music'` — mirrors
   * `requestService.ts`'s `tryRescan` finding the book library by `mediaType === 'book'`.
   * Returns a human-readable note when it could not, `null` on a plain success — "success"
   * here meaning only "the request was accepted", per this file's header comment; there is
   * no stronger claim this function is in a position to make. Every failure (no music
   * library found, `getLibraries`/`refreshItem` throwing — including the expected 403 a
   * non-admin Jellyfin account gets, see `refreshItem`'s doc comment) is caught here rather
   * than propagated: a rescan that could not be started must not make `pollOne` lose the
   * request or leave it stuck in `downloading` — see this function's caller.
   */
  async function tryRescan(userId: string): Promise<string | null> {
    try {
      const jellyfin = deps.jellyfinFor(userId);
      const libraries = await jellyfin.getLibraries();
      const musicLibrary = libraries.find((library) => library.collectionType === 'music');
      if (!musicLibrary) {
        return 'downloaded, but no music library was found to rescan';
      }
      await jellyfin.refreshItem(musicLibrary.id);
      return null;
    } catch (err) {
      logger.warn({ err }, 'post-download library rescan failed');
      return 'downloaded, but the library rescan failed to start';
    }
  }

  /** One request's worth of `pollDownloads` — mirrors `requestService.ts`'s `pollOne`
   * state-by-state, with the `completed`/`importRequested` divergence this file's header
   * comment explains. */
  async function pollOne(request: MediaRequest, handle: string): Promise<void> {
    const provider = buildProviders().find((p) => p.id === request.clientId);
    if (!provider) {
      updateRequest(deps.db, request.id, {
        status: 'failed',
        statusDetail: `music provider "${String(request.clientId)}" is no longer configured`,
      });
      return;
    }

    let status: DownloadStatus;
    try {
      status = await provider.status(handle);
    } catch (err) {
      if (err instanceof ProviderError) {
        updateRequest(deps.db, request.id, { status: 'failed', statusDetail: err.message });
        return;
      }
      throw err;
    }

    if (status.state === 'completed' || status.state === 'seeding') {
      // Idempotence: same reasoning as `requestService.ts`'s `pollOne` — this write moves
      // the row out of `downloading` *before* the rescan is awaited, so a `pollDownloads`
      // call whose `downloading` selection runs after this write lands cannot rescan the
      // same completed transfer twice.
      updateRequest(deps.db, request.id, { status: 'importing', progress: status.progress });
      const rescanNote = await tryRescan(request.userId);
      updateRequest(deps.db, request.id, {
        status: 'importRequested',
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
    // `mediaType: 'music'` is load-bearing, not decorative — same reasoning as
    // `requestService.ts`'s own `pollDownloads`: without it, a book request reaching
    // `downloading` would be picked up here too, this loop would look for its download
    // client's id among `buildProviders()` (music-only providers), find nothing, and fail
    // it with "music provider is not configured" — silently and wrongly.
    const inProgress = listRequestRows(deps.db, {
      status: 'downloading',
      mediaType: 'music',
    }).filter((r): r is MediaRequest & { downloadHandle: string } => r.downloadHandle !== null);

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
    listProviders,
    searchMusic,
    createRequest,
    listRequests,
    approve,
    reject,
    retry,
    grab,
    pollDownloads,
  };
}
