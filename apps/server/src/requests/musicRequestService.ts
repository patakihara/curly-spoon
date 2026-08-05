/**
 * Orchestrates the music-request pipeline's **search** half. There is no `createRequest`/
 * `listRequests`/`grab`/`pollDownloads` here, unlike `requestService.ts` — two independent,
 * source-verified reasons, both worth stating plainly rather than leaving as a silent gap:
 *
 * 1. **No table to write a music request into.** `requestsRepo.ts`'s `requests` table
 *    (`db/migrations.ts`, migration 2) has no column distinguishing "a book someone asked
 *    for" from any other media type — `GET /requests` (the existing, shipped book route)
 *    reads every row with no filter beyond `status`. Writing a music request into that same
 *    table would make it appear, indistinguishably, in the book request list the very next
 *    time anyone loads it — a real regression to a route this wave must not change the
 *    behaviour of. Every workaround considered (an `indexer_id` string-prefix convention,
 *    an app-level allowlist) either still requires touching `routes/requests.ts`'s shared
 *    `GET /requests` filtering to keep the two apart, or relies on an undocumented string
 *    convention no schema enforces. Both are worse than the honest fix: a `media_type`
 *    column (default `'book'`, so every existing row stays correct with no backfill) or a
 *    sibling `music_requests` table. `apps/server/src/db/**` is off-limits for this wave, so
 *    that migration is not made here — it is a decision for whoever picks up persisted
 *    music-request create/list next.
 * 2. **`grab()`'s post-download step doesn't generalise.** `requestService.ts`'s `grab()`
 *    finishes by calling `tryRescan`, which is hard-wired to `deps.absFor` and a book
 *    library lookup (`libraries.find(l => l.mediaType === 'book')`) — Audiobookshelf, not
 *    Jellyfin. A music download completing has nothing analogous to call yet; wiring music
 *    through the book `grab()` as-is would either silently do nothing useful after a
 *    download finished, or require changing `requestService.ts`'s behaviour for books to
 *    make room for a media-type branch, which this wave's instructions rule out.
 *
 * What *is* here — provider listing and the search fan-out — needs neither a schema change
 * nor a `requestService.ts` edit, and is a real, usable slice of this feature: a caller can
 * search slskd today. See the wave's own report for the exact migration this file is
 * blocked on.
 */

import type { FetchLike } from '@auralis/abs-client';
import type { Db } from '../db/connection.js';
import { listProviderConfigs } from '../db/providerConfigRepo.js';
import {
  ProviderError,
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
  /** Optional structured logger; default is a no-op — mirrors `requestService.ts`'s. */
  logger?: { info(o: unknown, m?: string): void; warn(o: unknown, m?: string): void };
}

export interface MusicSearchOutcome {
  candidates: MusicCandidate[];
  /** One entry per provider that failed. The search still succeeds. */
  errors: Array<{ providerId: string; kind: ProviderErrorKind; message: string }>;
}

export interface MusicRequestService {
  listProviders(): MusicRequestProvider[];
  searchMusic(query: MusicSearchQuery): Promise<MusicSearchOutcome>;
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

  return { listProviders, searchMusic };
}
