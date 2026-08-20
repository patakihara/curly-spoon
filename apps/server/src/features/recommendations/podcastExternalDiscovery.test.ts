import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '@auralis/abs-client';
import {
  externalCandidateToPodcastLibraryItemPlaceholder,
  podcastLibraryItemToOwnershipLibraryItem,
  reasonForPodcastExternalShelf,
} from './podcastExternalDiscovery.js';
import type { ExternalCandidate } from './external/types.js';
import type { RecommendationSeed } from './external/types.js';

function podcastItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-dailytech',
    libraryId: 'lib-podcasts',
    addedAt: null,
    updatedAt: null,
    coverPath: null,
    size: 0,
    media: {
      kind: 'podcast',
      title: 'Daily Tech Briefing',
      author: 'Signal Media',
      description: null,
      genres: ['Technology', 'News'],
      numEpisodes: 2,
      episodes: undefined,
      feedUrl: 'https://feeds.example.com/dailytech.xml',
    },
    progress: null,
    ...overrides,
  };
}

function bookItem(): LibraryItem {
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
      narrator: null,
      series: [],
      genres: [],
      publishedYear: null,
      description: null,
      isbn: null,
      asin: null,
      duration: 0,
      tracks: undefined,
      chapters: undefined,
    },
    progress: null,
  };
}

describe('podcastLibraryItemToOwnershipLibraryItem', () => {
  it('adapts a podcast, carrying its real feedUrl and folded author', () => {
    expect(podcastLibraryItemToOwnershipLibraryItem(podcastItem())).toEqual({
      id: 'item-dailytech',
      title: 'Daily Tech Briefing',
      authors: ['Signal Media'],
      identifiers: { feedUrl: 'https://feeds.example.com/dailytech.xml' },
    });
  });

  it('folds a null author to an empty array, never a null/blank entry', () => {
    const item = podcastItem({
      media: {
        kind: 'podcast',
        title: 'Anonymous Show',
        author: null,
        description: null,
        genres: [],
        numEpisodes: 0,
        episodes: undefined,
        feedUrl: null,
      },
    });

    expect(podcastLibraryItemToOwnershipLibraryItem(item)).toEqual({
      id: 'item-dailytech',
      title: 'Anonymous Show',
      authors: [],
      identifiers: { feedUrl: null },
    });
  });

  it('returns null for a non-podcast item rather than throwing', () => {
    expect(podcastLibraryItemToOwnershipLibraryItem(bookItem())).toBeNull();
  });
});

describe('externalCandidateToPodcastLibraryItemPlaceholder', () => {
  const candidate: ExternalCandidate = {
    providerName: 'itunes',
    providerId: '284012446',
    medium: 'podcast',
    title: 'Discovery',
    authors: ['BBC World Service'],
    genres: ['Science'],
    identifiers: {},
    reason: 'Because you listen to Science podcasts',
  };

  it('namespaces the id and leaves every unknown field honestly blank', () => {
    const item = externalCandidateToPodcastLibraryItemPlaceholder(candidate, 'lib-podcasts');

    expect(item.id).toBe('external:itunes:284012446');
    expect(item.libraryId).toBe('lib-podcasts');
    expect(item.coverPath).toBeNull();
    expect(item.progress).toBeNull();
    expect(item.media.kind).toBe('podcast');
    if (item.media.kind !== 'podcast') throw new Error('unreachable');
    expect(item.media.title).toBe('Discovery');
    expect(item.media.author).toBe('BBC World Service');
    expect(item.media.genres).toEqual(['Science']);
    expect(item.media.numEpisodes).toBe(0);
    expect(item.media.episodes).toBeUndefined();
    // Deliberately null even though the real iTunes result carried a feedUrl — this is an
    // unverified placeholder, not a confirmed feed; see the function's own header comment.
    expect(item.media.feedUrl).toBeNull();
  });

  it('folds an empty authors list to a null author, never a blank string', () => {
    const item = externalCandidateToPodcastLibraryItemPlaceholder(
      { ...candidate, authors: [] },
      'lib-podcasts',
    );
    if (item.media.kind !== 'podcast') throw new Error('unreachable');
    expect(item.media.author).toBeNull();
  });
});

describe('reasonForPodcastExternalShelf', () => {
  function seed(label: string): RecommendationSeed {
    return { label, identifiers: {} };
  }

  it('degrades to a generic line for an empty seed list', () => {
    expect(reasonForPodcastExternalShelf([])).toBe('Podcasts to discover');
  });

  it('names the one seed used', () => {
    expect(reasonForPodcastExternalShelf([seed('Science')])).toBe(
      'Because you listen to Science podcasts',
    );
  });

  it('joins two or more seeds with an oxford-free "and"', () => {
    expect(reasonForPodcastExternalShelf([seed('Science'), seed('Comedy')])).toBe(
      'Because you listen to Science and Comedy podcasts',
    );
    expect(
      reasonForPodcastExternalShelf([seed('Science'), seed('Comedy'), seed('News')]),
    ).toBe('Because you listen to Science, Comedy and News podcasts');
  });
});
