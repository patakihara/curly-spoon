import { describe, expect, it } from 'vitest';
import { lookupLibraries, visibleDestinations } from './destinations.js';

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
