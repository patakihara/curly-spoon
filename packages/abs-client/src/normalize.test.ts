import { describe, expect, it } from 'vitest';
import { rawLibraryItemSchema, rawShelfSchema, rawSearchResponseSchema } from './schemas/raw.js';
import { normalizeLibraryItem, normalizeShelf, normalizeSearchResults } from './normalize.js';

const minifiedBook = {
  id: 'item-1',
  libraryId: 'lib-1',
  mediaType: 'book' as const,
  addedAt: 1000,
  media: {
    metadata: {
      title: 'The Fellowship of the Ring',
      authorName: 'J.R.R. Tolkien',
      narratorName: 'Rob Inglis',
      seriesName: 'The Lord of the Rings',
      series: [{ id: 'series-1', name: 'The Lord of the Rings', sequence: '1' }],
      genres: ['Fantasy'],
      publishedYear: '1954',
    },
    coverPath: '/covers/item-1.jpg',
    duration: 36000,
    numTracks: 12,
  },
};

const expandedBook = {
  ...minifiedBook,
  media: {
    ...minifiedBook.media,
    tracks: [
      { index: 0, startOffset: 0, duration: 3000, contentUrl: '/audio/1', mimeType: 'audio/mp4' },
    ],
    chapters: [{ id: 1, start: 0, end: 3000, title: 'Chapter One' }],
  },
};

const minifiedPodcast = {
  id: 'item-2',
  libraryId: 'lib-2',
  mediaType: 'podcast' as const,
  media: {
    metadata: { title: 'A Great Podcast', author: 'Some Host' },
    coverPath: '/covers/item-2.jpg',
    numEpisodes: 42,
  },
};

const expandedPodcast = {
  ...minifiedPodcast,
  media: {
    ...minifiedPodcast.media,
    episodes: [
      {
        id: 'ep-1',
        title: 'Pilot',
        duration: 1800,
        audioTrack: { index: 0, startOffset: 0, duration: 1800, contentUrl: '/audio/ep-1' },
      },
    ],
  },
};

describe('normalizeLibraryItem — books', () => {
  it('normalises a minified book, leaving tracks/chapters undefined', () => {
    const raw = rawLibraryItemSchema.parse(minifiedBook);
    const item = normalizeLibraryItem(raw);

    expect(item.media.kind).toBe('book');
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.title).toBe('The Fellowship of the Ring');
    expect(item.media.authors).toEqual([{ id: 'J.R.R. Tolkien', name: 'J.R.R. Tolkien' }]);
    expect(item.media.narrator).toBe('Rob Inglis');
    expect(item.media.series).toEqual([
      { id: 'series-1', name: 'The Lord of the Rings', sequence: '1' },
    ]);
    expect(item.media.tracks).toBeUndefined();
    expect(item.media.chapters).toBeUndefined();
    expect(item.coverPath).toBe('/covers/item-1.jpg');
  });

  it('normalises an expanded book, populating tracks and chapters', () => {
    const raw = rawLibraryItemSchema.parse(expandedBook);
    const item = normalizeLibraryItem(raw);

    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.tracks).toHaveLength(1);
    expect(item.media.tracks?.[0]).toEqual({
      index: 0,
      startOffset: 0,
      duration: 3000,
      title: null,
      contentUrl: '/audio/1',
      mimeType: 'audio/mp4',
    });
    expect(item.media.chapters).toEqual([{ id: 1, start: 0, end: 3000, title: 'Chapter One' }]);
  });

  it('prefers structured `authors`/`series` arrays over the flattened name fields when both are present', () => {
    const raw = rawLibraryItemSchema.parse({
      ...minifiedBook,
      media: {
        ...minifiedBook.media,
        metadata: {
          ...minifiedBook.media.metadata,
          authors: [{ id: 'author-1', name: 'J.R.R. Tolkien' }],
        },
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.authors).toEqual([{ id: 'author-1', name: 'J.R.R. Tolkien' }]);
  });

  // Regression test — verified against Audiobookshelf 2.36.0 source
  // (`server/models/Book.js` `oldMetadataToJSONMinified()`): the *real* minified
  // metadata shape (used by every list/shelf/personalized endpoint, i.e. everywhere
  // except a single item's `expanded=1` detail fetch) never includes a `series` array
  // at all — only the flattened `seriesName` string. `minifiedBook` above is not a
  // faithful minified fixture (it carries both), so it never exercised this path; every
  // existing test asserting on `.series` went through the structured-array branch.
  //
  // Before this fix, `normalizeMedia` had a `metadata.authorName` fallback for
  // `authors` but no equivalent fallback for `series`, so a real minified library item
  // that is actually in a series normalized to `series: []` — home-shelf and
  // library-browse cards would silently show no series badge for every book, since
  // those endpoints only ever return minified items.
  it('falls back to a `seriesName`-derived entry when `series` is absent, matching a real minified payload', () => {
    const raw = rawLibraryItemSchema.parse({
      id: 'item-3',
      libraryId: 'lib-1',
      mediaType: 'book' as const,
      media: {
        metadata: {
          title: 'The Two Towers',
          authorName: 'J.R.R. Tolkien',
          seriesName: 'The Lord of the Rings #2',
          // no `series` array — this is the real shape of a minified response.
        },
        coverPath: '/covers/item-3.jpg',
        duration: 36000,
        numTracks: 12,
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.series).toEqual([
      { id: 'The Lord of the Rings #2', name: 'The Lord of the Rings #2', sequence: null },
    ]);
  });
});

describe('normalizeLibraryItem — podcasts', () => {
  it('normalises a minified podcast, leaving episodes undefined', () => {
    const raw = rawLibraryItemSchema.parse(minifiedPodcast);
    const item = normalizeLibraryItem(raw);

    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.title).toBe('A Great Podcast');
    expect(item.media.author).toBe('Some Host');
    expect(item.media.numEpisodes).toBe(42);
    expect(item.media.episodes).toBeUndefined();
  });

  it('normalises an expanded podcast, populating episodes', () => {
    const raw = rawLibraryItemSchema.parse(expandedPodcast);
    const item = normalizeLibraryItem(raw);

    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.episodes).toHaveLength(1);
    expect(item.media.episodes?.[0]).toMatchObject({ id: 'ep-1', title: 'Pilot', duration: 1800 });
  });

  it('falls back to episodes.length when numEpisodes is absent', () => {
    const { numEpisodes: _drop, ...mediaWithoutCount } = expandedPodcast.media;
    const raw = rawLibraryItemSchema.parse({ ...expandedPodcast, media: mediaWithoutCount });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.numEpisodes).toBe(1);
  });
});

describe('normalizeShelf', () => {
  it('normalises item-shaped entities and silently drops entities that are not library items', () => {
    const raw = rawShelfSchema.parse({
      id: 'shelf-1',
      label: 'Continue Listening',
      type: 'book',
      entities: [minifiedBook, { unexpected: 'shape' }],
    });

    const shelf = normalizeShelf(raw);
    expect(shelf.label).toBe('Continue Listening');
    expect(shelf.items).toHaveLength(1);
    expect(shelf.items[0]?.id).toBe('item-1');
  });
});

describe('normalizeSearchResults', () => {
  it('flattens book/podcast/series/author matches into normalised lists', () => {
    const raw = rawSearchResponseSchema.parse({
      book: [{ libraryItem: minifiedBook, matchText: 'Fellowship' }],
      podcast: [{ libraryItem: minifiedPodcast }],
      series: [{ series: { id: 'series-1', name: 'The Lord of the Rings' } }],
      authors: [{ id: 'author-1', name: 'J.R.R. Tolkien' }],
    });

    const results = normalizeSearchResults(raw);
    expect(results.books).toHaveLength(1);
    expect(results.podcasts).toHaveLength(1);
    expect(results.series).toEqual([
      { id: 'series-1', name: 'The Lord of the Rings', description: null, books: [] },
    ]);
    expect(results.authors[0]).toMatchObject({ id: 'author-1', name: 'J.R.R. Tolkien' });
  });

  it('returns empty lists when a category is absent from the response', () => {
    const raw = rawSearchResponseSchema.parse({});
    const results = normalizeSearchResults(raw);
    expect(results).toEqual({ books: [], podcasts: [], series: [], authors: [] });
  });
});
