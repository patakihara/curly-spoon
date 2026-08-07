/**
 * Whether the Search view's "Available to request" groups should render at all
 * (docs/ROADMAP.md §12b: "requestable results appear only when a request could
 * actually be fulfilled").
 *
 * Books reuse the exact signal `components/destinations.ts`'s own doc comment
 * earmarked for this wave: `lookupProviders`' `hasEnabledIndexer` /
 * `hasEnabledDownloadClient`, both derived from `GET /api/v1/providers`. Both
 * must hold — a configured-but-disabled indexer, or an enabled indexer with no
 * download client to hand a grab to, both mean a request would sit unfulfillable
 * forever, which is exactly the outcome this module exists to prevent offering.
 *
 * Music has no `destinations.ts` equivalent to reuse: `lookupProviders` only
 * ever derives the two book-pipeline flags (its own doc comment says so), so
 * this module derives the music signal itself the same way — an enabled,
 * configured `'music'`-kind provider (slskd, today; the provider interface is
 * pluggable per `docs/HANDOVER.md`'s "decisions already made").
 *
 * Each group is further gated on the current chip selection actually showing
 * that content type (`visible` from `searchFilters.ts`) — offering to request a
 * book while the Books section itself is filtered out would separate the
 * request from any library context to compare it against.
 */
import type { ProviderKind } from '../../api/types.js';
import { lookupProviders } from '../../components/destinations.js';
import type { VisibleKinds } from './searchFilters.js';

/** The subset of `ProviderEntry` this module (and `lookupProviders`) actually reads. */
export interface SearchProviderEntry {
  kind: ProviderKind;
  configured: boolean;
  enabled: boolean;
}

export interface RequestabilitySections {
  showBookRequestable: boolean;
  showMusicRequestable: boolean;
}

function hasEnabledMusicProvider(providers: SearchProviderEntry[]): boolean {
  return providers.some((p) => p.kind === 'music' && p.configured && p.enabled);
}

/** Total: an empty or malformed-looking provider list degrades to "nothing
 * requestable" rather than throwing — the same "fail closed" choice
 * `lookupProviders` itself makes for the book flags. */
export function requestabilitySections(
  providers: SearchProviderEntry[],
  visible: VisibleKinds,
): RequestabilitySections {
  const { hasEnabledIndexer, hasEnabledDownloadClient } = lookupProviders(providers);
  const musicVisible = visible.artists || visible.albums || visible.tracks;

  return {
    showBookRequestable:
      visible.books && Boolean(hasEnabledIndexer) && Boolean(hasEnabledDownloadClient),
    showMusicRequestable: musicVisible && hasEnabledMusicProvider(providers),
  };
}
