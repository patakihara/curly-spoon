import { describe, expect, it } from 'vitest';
import { lookupLibraries, lookupProviders, visibleDestinations } from './destinations.js';

describe('visibleDestinations', () => {
  it('shows only For you and Search when nothing else is configured', () => {
    const keys = visibleDestinations({ audiobookshelfConfigured: false }).map((d) => d.key);
    expect(keys).toEqual(['forYou', 'search']);
  });

  it('hides Books and Podcasts when configured but no matching library exists yet', () => {
    const keys = visibleDestinations({ audiobookshelfConfigured: true }).map((d) => d.key);
    expect(keys).toEqual(['forYou', 'search']);
  });

  it('shows Books once a book library is known, linking to the stable /books path', () => {
    const destinations = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
    });
    const books = destinations.find((d) => d.key === 'books');
    // Not a library id baked into the link — router/routeTree.ts's `booksRoute`
    // resolves the real id from `GET /api/v1/libraries` at render time instead,
    // so a nav destination never hard-codes one.
    expect(books?.to).toBe('/books');
  });

  it('shows Podcasts once a podcast library is known, linking to the stable /podcasts path', () => {
    const destinations = visibleDestinations({
      audiobookshelfConfigured: true,
      podcastLibraryId: 'lib-podcasts',
    });
    const podcasts = destinations.find((d) => d.key === 'podcasts');
    expect(podcasts?.to).toBe('/podcasts');
  });

  it('hides Music until Jellyfin is configured', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
      podcastLibraryId: 'lib-podcasts',
      jellyfinConfigured: false,
    }).map((d) => d.key);
    expect(keys).not.toContain('music');
  });

  it('shows Music, linking to /music, once Jellyfin is configured', () => {
    const destinations = visibleDestinations({
      audiobookshelfConfigured: false,
      jellyfinConfigured: true,
    });
    const music = destinations.find((d) => d.key === 'music');
    expect(music?.to).toBe('/music');
  });

  it('shows Music independently of Audiobookshelf — the two upstreams are unrelated', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: false,
      jellyfinConfigured: true,
    }).map((d) => d.key);
    expect(keys).toContain('music');
  });

  it('always shows For you and Search, in a stable relative order — For you first, Search last', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
      podcastLibraryId: 'lib-podcasts',
      jellyfinConfigured: true,
    }).map((d) => d.key);
    expect(keys[0]).toBe('forYou');
    expect(keys[keys.length - 1]).toBe('search');
  });

  it('renders the full five in order — For you, Music, Books, Podcasts, Search — once everything is configured', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
      podcastLibraryId: 'lib-podcasts',
      jellyfinConfigured: true,
    }).map((d) => d.key);
    expect(keys).toEqual(['forYou', 'music', 'books', 'podcasts', 'search']);
  });

  it('never shows Settings — it is reachable, but not one of the five primary destinations', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
      podcastLibraryId: 'lib-podcasts',
      jellyfinConfigured: true,
      hasEnabledIndexer: true,
      hasEnabledDownloadClient: true,
    }).map((d) => d.key);
    expect(keys).not.toContain('settings');
  });

  it('never shows a separate Requests destination — Search absorbs it (§12a)', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      hasEnabledIndexer: true,
      hasEnabledDownloadClient: true,
    }).map((d) => d.key);
    expect(keys).not.toContain('requests');
  });
});

describe('lookupProviders', () => {
  it('is false for both flags with no providers at all', () => {
    expect(lookupProviders([])).toEqual({
      hasEnabledIndexer: false,
      hasEnabledDownloadClient: false,
    });
  });

  it('requires both configured and enabled — an enabled-but-unconfigured provider does not count', () => {
    const result = lookupProviders([{ kind: 'indexer', configured: false, enabled: true }]);
    expect(result.hasEnabledIndexer).toBe(false);
  });

  it('requires both configured and enabled — a configured-but-disabled provider does not count', () => {
    const result = lookupProviders([{ kind: 'indexer', configured: true, enabled: false }]);
    expect(result.hasEnabledIndexer).toBe(false);
  });

  it('is true once one provider of a kind is both configured and enabled, regardless of others', () => {
    const result = lookupProviders([
      { kind: 'indexer', configured: false, enabled: false },
      { kind: 'indexer', configured: true, enabled: true },
      { kind: 'download', configured: true, enabled: true },
    ]);
    expect(result).toEqual({ hasEnabledIndexer: true, hasEnabledDownloadClient: true });
  });
});

describe('lookupLibraries', () => {
  it('finds the first library of each media type', () => {
    const result = lookupLibraries([
      { id: 'lib-books', mediaType: 'book' },
      { id: 'lib-podcasts', mediaType: 'podcast' },
    ]);
    expect(result).toEqual({ bookLibraryId: 'lib-books', podcastLibraryId: 'lib-podcasts' });
  });

  it('leaves a lookup undefined when no library of that type exists', () => {
    const result = lookupLibraries([{ id: 'lib-books', mediaType: 'book' }]);
    expect(result.podcastLibraryId).toBeUndefined();
  });

  it('handles an empty list without throwing', () => {
    expect(lookupLibraries([])).toEqual({ bookLibraryId: undefined, podcastLibraryId: undefined });
  });
});
