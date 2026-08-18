/**
 * The external recommendation providers Auralis knows how to build — the per-medium
 * pluggable seam wave 15a exists to create. Same shape as
 * `apps/server/src/requests/indexers/registry.ts`: one map from provider name to factory, so
 * "support another provider" (ListenBrainz tier 2, PodcastIndex for podcasts named as the
 * next files by `docs/research/RECOMMENDATION_PROVIDERS.md`) is a new file plus a line here,
 * never an edit to `types.ts` or to whichever wave eventually calls this.
 */

import type { FetchLike } from '@auralis/abs-client';
import { createListenBrainzProvider, type ListenBrainzLogger } from './listenbrainz.js';
import { createOpenLibraryProvider } from './openlibrary.js';
import type { ExternalMedium, ExternalRecommendationProvider } from './types.js';

export interface ExternalProviderDeps {
  fetch: FetchLike;
  logger?: ListenBrainzLogger;
}

export type ExternalProviderFactory = (
  deps: ExternalProviderDeps,
) => ExternalRecommendationProvider;

/** Provider name -> factory. The key is what `ExternalCandidate.providerName` and
 * `ExternalRecommendationProvider.providerName` both carry, so a candidate can always be
 * traced back to the entry that produced it. */
export const externalProviderFactories: Record<string, ExternalProviderFactory> = {
  listenbrainz: createListenBrainzProvider,
  openlibrary: createOpenLibraryProvider,
};

/**
 * Builds every registered provider for one medium. Podcasts currently have no registered
 * provider (PodcastIndex is the next file `docs/research/RECOMMENDATION_PROVIDERS.md` §4
 * names), so this returns `[]` for that medium today — total, not an error, exactly like
 * `matchOwnership` degrading to `'new'` on an empty library.
 *
 * `factories` defaults to the real registry above and exists as a parameter so a test can
 * hand in a fake provider and exercise this function's dispatch logic — construct-then-filter
 * — without needing a real network-capable provider or mutating the shared registry object
 * (see `registry.test.ts`).
 */
export function getExternalProvidersForMedium(
  medium: ExternalMedium,
  deps: ExternalProviderDeps,
  factories: Record<string, ExternalProviderFactory> = externalProviderFactories,
): ExternalRecommendationProvider[] {
  return Object.values(factories)
    .map((factory) => factory(deps))
    .filter((provider) => provider.medium === medium);
}
