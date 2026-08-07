/**
 * The shell's five primary destinations (`docs/ROADMAP.md` §12a), and which
 * of them are visible.
 *
 * "Never show a section that will only error": Books and Podcasts are both
 * served through Audiobookshelf (docs/ARCHITECTURE.md's priority table), so
 * either is hidden unless the BFF reports Audiobookshelf configured *and* a
 * library of the matching media type actually exists on that server — a
 * configured-but-library-less server would otherwise show a destination that
 * immediately 404s. Library ids are never hard-coded: they come from whatever
 * `GET /api/v1/libraries` actually returns, so this holds for any real server,
 * not just the fixture used in tests. (`Destination.to` for each is now a
 * stable `/books`/`/podcasts` path rather than a library id baked into the
 * link — see `router/routeTree.ts`'s `booksRoute`/`podcastsRoute` — but the
 * *visibility* rule is unchanged: still gated on a matching library existing.)
 *
 * Music is served through Jellyfin, an independent upstream from Audiobookshelf
 * (its own base URL and its own per-user credential — see
 * `apps/server/src/routes/jellyfin.ts`) — so it's gated on its own
 * `jellyfinConfigured` flag, not on `audiobookshelfConfigured`, and shown at a
 * flat `/music` regardless of whether any Audiobookshelf library exists.
 *
 * For you and Search are always visible — neither depends on any upstream
 * being configured. Search doubles as the requests view (§12a), so there is
 * no separate `requests` destination any more: `hasEnabledIndexer` /
 * `hasEnabledDownloadClient` gating is gone from this file. `lookupProviders`
 * stays, and still derives those two flags from `GET /api/v1/providers` —
 * `Shell.tsx` still calls it to build the context this module used to also
 * use for Requests visibility; whatever now decides when to show a "make a
 * request" affordance inside Search is out of this wave's scope.
 */

export type DestinationKey = 'forYou' | 'books' | 'podcasts' | 'music' | 'search';

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

/**
 * The destinations to render in nav, in a fixed order, filtered by what's
 * actually usable. Order: For you, Music, Books, Podcasts, Search — Search
 * last, so it lands at the far right of the compact bottom bar (§12a).
 */
export function visibleDestinations(ctx: DestinationContext): Destination[] {
  const destinations: Destination[] = [{ key: 'forYou', label: 'For you', to: '/' }];

  if (ctx.jellyfinConfigured) {
    destinations.push({ key: 'music', label: 'Music', to: '/music' });
  }
  if (ctx.audiobookshelfConfigured && ctx.bookLibraryId) {
    destinations.push({ key: 'books', label: 'Books', to: '/books' });
  }
  if (ctx.audiobookshelfConfigured && ctx.podcastLibraryId) {
    destinations.push({ key: 'podcasts', label: 'Podcasts', to: '/podcasts' });
  }

  destinations.push({ key: 'search', label: 'Search', to: '/search' });
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
 * Derives the two provider flags from `GET /api/v1/providers`. `configured`
 * and `enabled` are independent on `ProviderEntry` (a provider can be
 * enabled with nothing filled in yet, or configured but switched off) — both
 * must hold for the provider to actually be usable. No destination in this
 * file is gated on these any more (Search absorbed Requests, §12a) — kept
 * because `Shell.tsx` and other callers still use the flags for whatever
 * Search itself now decides to show.
 */
export function lookupProviders(
  // Accepts the full `ProviderKind` union (now including `'music'`, phase 9's slskd
  // provider) rather than the narrower `'indexer' | 'download'` this used to declare —
  // `Shell.tsx` passes the whole `GET /providers` list, which includes music providers
  // since `apps/server/src/routes/requests.ts`'s `allDescriptors()` already did. `usable`
  // below still only ever checks for `'indexer'`/`'download'`, so a music entry is simply
  // ignored here, exactly as it was before this type accepted it.
  providers: Array<{
    kind: 'indexer' | 'download' | 'music';
    configured: boolean;
    enabled: boolean;
  }>,
): Pick<DestinationContext, 'hasEnabledIndexer' | 'hasEnabledDownloadClient'> {
  const usable = (kind: 'indexer' | 'download') =>
    providers.some((p) => p.kind === kind && p.configured && p.enabled);
  return {
    hasEnabledIndexer: usable('indexer'),
    hasEnabledDownloadClient: usable('download'),
  };
}
