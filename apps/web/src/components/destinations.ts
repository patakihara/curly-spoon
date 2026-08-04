/**
 * The shell's primary destinations, and which of them are visible.
 *
 * "Never show a section that will only error": Books and Podcasts are both
 * served through Audiobookshelf (docs/ARCHITECTURE.md's priority table), so
 * either is hidden unless the BFF reports Audiobookshelf configured *and* a
 * library of the matching media type actually exists on that server — a
 * configured-but-library-less server would otherwise show a destination that
 * immediately 404s. Library ids are never hard-coded: they come from whatever
 * `GET /api/v1/libraries` actually returns, so this holds for any real server,
 * not just the fixture used in tests.
 *
 * Music is served through Jellyfin, an independent upstream from Audiobookshelf
 * (its own base URL and its own per-user credential — see
 * `apps/server/src/routes/jellyfin.ts`) — so it's gated on its own
 * `jellyfinConfigured` flag, not on `audiobookshelfConfigured`, and shown at a
 * flat `/music` regardless of whether any Audiobookshelf library exists.
 *

 * Requests (Phase 6) follows the same rule with its own condition: a request can
 * be *created* the moment any indexer exists, but it can never be *fulfilled*
 * without a download client too — so the destination stays hidden until both an
 * indexer and a download client are configured and enabled, not just one.
 */

export type DestinationKey =
  'home' | 'books' | 'podcasts' | 'music' | 'requests' | 'search' | 'settings';

export interface Destination {
  key: DestinationKey;
  label: string;
  /** Route path this destination's nav item links to. */
  to: string;
}

export interface LibraryLookup {
  /** id of the first library with `mediaType: 'book'`, if any. */
  bookLibraryId?: string;
  /** id of the first library with `mediaType: 'podcast'`, if any. */
  podcastLibraryId?: string;
}

export interface DestinationContext extends LibraryLookup {
  /** Whether the BFF reports an Audiobookshelf connection (`GET /api/v1/setup`). */
  audiobookshelfConfigured: boolean;
  /** Whether at least one indexer provider is configured *and* enabled (`GET /api/v1/providers`). */
  hasEnabledIndexer?: boolean;
  /** Whether at least one download-client provider is configured *and* enabled. */
  hasEnabledDownloadClient?: boolean;
  /** Whether the BFF reports a working Jellyfin connection (`GET /api/v1/jellyfin/config`). */
  jellyfinConfigured?: boolean;
}

/** The destinations to render in nav, in a fixed order, filtered by what's actually usable. */
export function visibleDestinations(ctx: DestinationContext): Destination[] {
  const destinations: Destination[] = [{ key: 'home', label: 'Home', to: '/' }];

  if (ctx.audiobookshelfConfigured && ctx.bookLibraryId) {
    destinations.push({ key: 'books', label: 'Books', to: `/library/${ctx.bookLibraryId}` });
  }
  if (ctx.audiobookshelfConfigured && ctx.podcastLibraryId) {
    destinations.push({
      key: 'podcasts',
      label: 'Podcasts',
      to: `/library/${ctx.podcastLibraryId}`,
    });
  }
  if (ctx.jellyfinConfigured) {
    destinations.push({ key: 'music', label: 'Music', to: '/music' });
  }

  if (ctx.hasEnabledIndexer && ctx.hasEnabledDownloadClient) {
    destinations.push({ key: 'requests', label: 'Requests', to: '/requests' });
  }

  destinations.push({ key: 'search', label: 'Search', to: '/search' });
  destinations.push({ key: 'settings', label: 'Settings', to: '/settings' });
  return destinations;
}

/** Derives `LibraryLookup` from a plain list of `{ id, mediaType }` — the shape react-query caches. */
export function lookupLibraries(
  libraries: Array<{ id: string; mediaType: 'book' | 'podcast' }>,
): LibraryLookup {
  return {
    bookLibraryId: libraries.find((l) => l.mediaType === 'book')?.id,
    podcastLibraryId: libraries.find((l) => l.mediaType === 'podcast')?.id,
  };
}

/**
 * Derives the two `DestinationContext` provider flags from `GET /api/v1/providers`.
 * `configured` and `enabled` are independent on `ProviderEntry` (a provider can be
 * enabled with nothing filled in yet, or configured but switched off) — both must
 * hold for the provider to actually be usable.
 */
export function lookupProviders(
  providers: Array<{ kind: 'indexer' | 'download'; configured: boolean; enabled: boolean }>,
): Pick<DestinationContext, 'hasEnabledIndexer' | 'hasEnabledDownloadClient'> {
  const usable = (kind: 'indexer' | 'download') =>
    providers.some((p) => p.kind === kind && p.configured && p.enabled);
  return {
    hasEnabledIndexer: usable('indexer'),
    hasEnabledDownloadClient: usable('download'),
  };
}
