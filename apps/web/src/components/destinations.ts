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
 * Music is served through Jellyfin, which this phase's BFF has no configuration
 * surface for at all (that lands in Phase 8) — so it is unconditionally hidden
 * for now, rather than shown pointing at a feature that doesn't exist yet.
 */

export type DestinationKey = 'home' | 'books' | 'podcasts' | 'music' | 'search' | 'settings';

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
  // Music (Jellyfin) is never shown yet — see the module doc comment.

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
