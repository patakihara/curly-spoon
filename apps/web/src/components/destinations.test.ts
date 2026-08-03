import { describe, expect, it } from 'vitest';
import { lookupLibraries, lookupProviders, visibleDestinations } from './destinations.js';

describe('visibleDestinations', () => {
  it('shows only Home, Search and Settings when Audiobookshelf is not configured', () => {
    const keys = visibleDestinations({ audiobookshelfConfigured: false }).map((d) => d.key);
    expect(keys).toEqual(['home', 'search', 'settings']);
  });

  it('hides Books and Podcasts when configured but no matching library exists yet', () => {
    const keys = visibleDestinations({ audiobookshelfConfigured: true }).map((d) => d.key);
    expect(keys).toEqual(['home', 'search', 'settings']);
  });

  it('shows Books once a book library is known, linking to its real id', () => {
    const destinations = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
    });
    const books = destinations.find((d) => d.key === 'books');
    expect(books?.to).toBe('/library/lib-books');
  });

  it('shows Podcasts once a podcast library is known, linking to its real id', () => {
    const destinations = visibleDestinations({
      audiobookshelfConfigured: true,
      podcastLibraryId: 'lib-podcasts',
    });
    const podcasts = destinations.find((d) => d.key === 'podcasts');
    expect(podcasts?.to).toBe('/library/lib-podcasts');
  });

  it('never shows Music — Jellyfin has no configuration surface in this phase', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
      podcastLibraryId: 'lib-podcasts',
    }).map((d) => d.key);
    expect(keys).not.toContain('music');
  });

  it('always shows Home, Search and Settings, in a stable relative order', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: true,
      bookLibraryId: 'lib-books',
      podcastLibraryId: 'lib-podcasts',
    }).map((d) => d.key);
    expect(keys.indexOf('home')).toBeLessThan(keys.indexOf('search'));
    expect(keys.indexOf('search')).toBeLessThan(keys.indexOf('settings'));
  });
});

describe('visibleDestinations — Requests', () => {
  it('hides Requests when neither an indexer nor a download client is configured', () => {
    const keys = visibleDestinations({ audiobookshelfConfigured: false }).map((d) => d.key);
    expect(keys).not.toContain('requests');
  });

  it('hides Requests when only an indexer is enabled — a request could never be fulfilled', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: false,
      hasEnabledIndexer: true,
      hasEnabledDownloadClient: false,
    }).map((d) => d.key);
    expect(keys).not.toContain('requests');
  });

  it('hides Requests when only a download client is enabled — nothing could ever be found', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: false,
      hasEnabledIndexer: false,
      hasEnabledDownloadClient: true,
    }).map((d) => d.key);
    expect(keys).not.toContain('requests');
  });

  it('shows Requests once both an indexer and a download client are configured and enabled', () => {
    const destinations = visibleDestinations({
      audiobookshelfConfigured: false,
      hasEnabledIndexer: true,
      hasEnabledDownloadClient: true,
    });
    const requests = destinations.find((d) => d.key === 'requests');
    expect(requests?.to).toBe('/requests');
  });

  it('does not require Audiobookshelf to be configured — requests are independent of it', () => {
    const keys = visibleDestinations({
      audiobookshelfConfigured: false,
      hasEnabledIndexer: true,
      hasEnabledDownloadClient: true,
    }).map((d) => d.key);
    expect(keys).toContain('requests');
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
