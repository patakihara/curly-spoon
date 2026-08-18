import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '@auralis/abs-client';
import {
  bookLibraryItemToOwnershipLibraryItem,
  externalCandidateToLibraryItemPlaceholder,
  reasonForBookExternalShelf,
} from './bookExternalDiscovery.js';
import type { ExternalCandidate } from './external/types.js';
import type { RecommendationSeed } from './external/types.js';

function bookItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-crimson',
    libraryId: 'lib-books',
    addedAt: null,
    updatedAt: null,
    coverPath: null,
    size: 0,
    media: {
      kind: 'book',
      title: 'The Crimson Ledger',
      subtitle: null,
      authors: [{ name: 'Mara Voss' }],
      narrator: 'Some Narrator',
      series: [],
      genres: ['Mystery'],
      publishedYear: null,
      description: null,
      isbn: '9780000000101',
      asin: null,
      duration: 3600,
      tracks: undefined,
      chapters: undefined,
    },
    progress: null,
    ...overrides,
  };
}

function podcastItem(): LibraryItem {
  return {
    id: 'item-podcast',
    libraryId: 'lib-podcasts',
    addedAt: null,
    updatedAt: null,
    coverPath: null,
    size: 0,
    media: {
      kind: 'podcast',
      title: 'Some Show',
      author: 'A Host',
      description: null,
      genres: [],
      numEpisodes: 0,
      episodes: [],
      feedUrl: null,
    },
    progress: null,
  };
}

describe('bookLibraryItemToOwnershipLibraryItem', () => {
  it('adapts a book, carrying its isbn/asin identifiers and author names', () => {
    expect(bookLibraryItemToOwnershipLibraryItem(bookItem())).toEqual({
      id: 'item-crimson',
      title: 'The Crimson Ledger',
      authors: ['Mara Voss'],
      identifiers: { asin: null, isbn: '9780000000101' },
    });
  });

  it('returns null for a non-book item rather than throwing', () => {
    expect(bookLibraryItemToOwnershipLibraryItem(podcastItem())).toBeNull();
  });
});

describe('externalCandidateToLibraryItemPlaceholder', () => {
  const candidate: ExternalCandidate = {
    providerName: 'openlibrary',
    providerId: '/works/OL1111111W',
    medium: 'book',
    title: 'Moonless Tide',
    authors: ['Mara Voss'],
    genres: [],
    identifiers: {},
    reason: 'Because you love Mara Voss',
  };

  it('namespaces the id and leaves every unknown field honestly blank', () => {
    const item = externalCandidateToLibraryItemPlaceholder(candidate, 'lib-books');

    expect(item.id).toBe('external:openlibrary:/works/OL1111111W');
    expect(item.libraryId).toBe('lib-books');
    expect(item.coverPath).toBeNull();
    expect(item.progress).toBeNull();
    expect(item.media.kind).toBe('book');
    if (item.media.kind !== 'book') throw new Error('unreachable');
    expect(item.media.title).toBe('Moonless Tide');
    expect(item.media.authors).toEqual([{ name: 'Mara Voss' }]);
    expect(item.media.isbn).toBeNull();
    expect(item.media.asin).toBeNull();
    expect(item.media.series).toEqual([]);
    expect(item.media.tracks).toBeUndefined();
    expect(item.media.chapters).toBeUndefined();
  });
});

describe('reasonForBookExternalShelf', () => {
  function seed(label: string): RecommendationSeed {
    return { label, identifiers: {} };
  }

  it('degrades to a generic line for an empty seed list', () => {
    expect(reasonForBookExternalShelf([])).toBe('Books to discover');
  });

  it('names the one seed used', () => {
    expect(reasonForBookExternalShelf([seed('Mara Voss')])).toBe('Because you love Mara Voss');
  });

  it('joins two or more seeds with an oxford-free "and"', () => {
    expect(reasonForBookExternalShelf([seed('Mara Voss'), seed('Doyle Ashworth')])).toBe(
      'Because you love Mara Voss and Doyle Ashworth',
    );
    expect(
      reasonForBookExternalShelf([
        seed('Mara Voss'),
        seed('Doyle Ashworth'),
        seed('Frank Herbert'),
      ]),
    ).toBe('Because you love Mara Voss, Doyle Ashworth and Frank Herbert');
  });
});
