import { describe, expect, it } from 'vitest';
import { rawLibraryItemSchema, rawShelfSchema, rawSearchResponseSchema } from './schemas/raw.js';
import { normalizeLibraryItem, normalizeShelf, normalizeSearchResults } from './normalize.js';
import type { Book } from './domain.js';

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

// wave 15a-0: `asin` is the identifier Audnexus/AudiMeta are keyed on. It lives on the same
// `metadata` object as `isbn`, which this codebase already carries through minified and
// expanded alike — see `oldMetadataToJSONMinified()` reasoning above, which only strips
// *structured* fields (`authors[]`/`series[]`), never scalar metadata like `isbn`/`asin`.
describe('Book.asin — the identifier phase 15 needs for provider matching', () => {
  it('carries `asin` through when the fixture has it', () => {
    const raw = rawLibraryItemSchema.parse({
      ...minifiedBook,
      media: {
        ...minifiedBook.media,
        metadata: { ...minifiedBook.media.metadata, asin: 'B002V1S3GY' },
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.asin).toBe('B002V1S3GY');
  });

  it('normalises to `null` when `asin` is absent, never throwing', () => {
    const raw = rawLibraryItemSchema.parse(minifiedBook);
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.asin).toBeNull();
  });

  // The exact bug class that broke playback for weeks: `.optional()` accepts `undefined`
  // but not a real server's literal `null`.
  it('normalises to `null` when the server sends an explicit `null`, never throwing', () => {
    const raw = rawLibraryItemSchema.parse({
      ...minifiedBook,
      media: {
        ...minifiedBook.media,
        metadata: { ...minifiedBook.media.metadata, asin: null },
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'book') throw new Error('expected book');
    expect(item.media.asin).toBeNull();
  });
});

/**
 * `Book.authors`/`Book.series` no longer admit an `id` field at the type level — see
 * `domain.ts`'s header. This is what makes the `findAuthorBooks`/`SeriesPage`
 * id-matching bug (`7bf6e49`, and `7e57a78` before it) impossible to reintroduce
 * *by construction*: code shaped like the original bug fails to compile rather than
 * relying on a reader having noticed the doc comment.
 *
 * A compile error can't turn a vitest assertion red, so this is a type-only check.
 * `Extract<keyof T, 'id'>` resolves to `'id'` when that key exists and to `never`
 * otherwise; `AssertNever<T extends never>` only accepts `never`, so
 * `AssertNever<Extract<...>>` fails to compile — TS2344, "Type 'id' does not satisfy
 * the constraint 'never'" — the moment `id` reappears on either element type.
 * **Verified by reverting**: temporarily restoring `id: string` on `AuthorBadge` in
 * `domain.ts` and rerunning `npx tsc -p packages/abs-client/tsconfig.json --noEmit`
 * turns this file red at exactly that line, confirming the guard actually guards
 * something rather than trivially passing.
 */
type AssertNever<T extends never> = T;
type _AuthorBadgeHasNoId = AssertNever<Extract<keyof Book['authors'][number], 'id'>>;
type _SeriesBadgeHasNoId = AssertNever<Extract<keyof Book['series'][number], 'id'>>;

describe('Book.authors / Book.series — wire compatibility for the fabricated fallback', () => {
  // The JSON response still carries the fabricated `id` at runtime (equal to the
  // display name on a minified item) even though the TypeScript type no longer
  // admits reading it — Android's `AuthorRef`/`SeriesSequence` Kotlin models declare
  // `id` as non-nullable with no default, so dropping the wire key would throw
  // `MissingFieldException` there. This test pins that runtime shape directly so a
  // future change to `normalizeMedia` can't silently drop the key without a test
  // going red, even though nothing in this package's own types would catch it.
  //
  // Note this test previously used `minifiedBook`, whose fixture carries a real
  // `series` array alongside `seriesName` — that is a passthrough of a genuine id
  // ('series-1'), not the fabricated fallback the test claimed to pin, and the
  // `authors` fallback (the one path `minifiedBook` *did* exercise) was never
  // asserted on at all. A fixture with neither `authors` nor `series` present — the
  // real shape of a minified list/shelf/browse response — is used below instead, so
  // both fabricated ids are actually exercised.
  it('still serialises a fabricated `id` (equal to the display name) on a minified fallback entry, for both authors and series', () => {
    const raw = rawLibraryItemSchema.parse({
      id: 'item-4',
      libraryId: 'lib-1',
      mediaType: 'book' as const,
      media: {
        metadata: {
          title: 'The Two Towers',
          authorName: 'J.R.R. Tolkien',
          seriesName: 'The Lord of the Rings #2',
          // no `authors`/`series` arrays — this is the real shape of a minified response.
        },
        coverPath: '/covers/item-4.jpg',
        duration: 36000,
        numTracks: 12,
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'book') throw new Error('expected book');

    // Cast through `unknown` — `Book.authors`/`Book.series` no longer type `id`, but the
    // runtime object still carries it (see this describe block's own comment). Assert
    // presence with `in`, not just the value with `toBe`, so a future change that sets
    // `id: undefined` instead of omitting the key entirely can't slip past this test —
    // `JSON.stringify` treats those two differently even though `toBe(undefined)` would not.
    const authorsWithId = item.media.authors as unknown as Array<{ id?: string; name: string }>;
    const seriesWithId = item.media.series as unknown as Array<{
      id?: string;
      name: string;
      sequence: string | null;
    }>;
    expect('id' in authorsWithId[0]!).toBe(true);
    expect(authorsWithId[0]?.id).toBe('J.R.R. Tolkien');
    expect('id' in seriesWithId[0]!).toBe(true);
    expect(seriesWithId[0]?.id).toBe('The Lord of the Rings #2');
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

// wave 15a-0: PodcastIndex is keyed on feed URL + episode GUID. Both were parsed for the
// unsubscribed-feed-preview shape already (`PodcastFeedPreview`/`PodcastFeedEpisode` in
// domain.ts) but silently dropped for a library item's own `Podcast`/`PodcastEpisode`.
describe('Podcast.feedUrl / PodcastEpisode.guid — the identifiers phase 15 needs for provider matching', () => {
  it('carries `feedUrl` through when the fixture has it', () => {
    const raw = rawLibraryItemSchema.parse({
      ...minifiedPodcast,
      media: {
        ...minifiedPodcast.media,
        metadata: { ...minifiedPodcast.media.metadata, feedUrl: 'https://example.com/feed.xml' },
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.feedUrl).toBe('https://example.com/feed.xml');
  });

  it('normalises `feedUrl` to `null` when absent, never throwing', () => {
    const raw = rawLibraryItemSchema.parse(minifiedPodcast);
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.feedUrl).toBeNull();
  });

  it('normalises `feedUrl` to `null` when the server sends an explicit `null`, never throwing', () => {
    const raw = rawLibraryItemSchema.parse({
      ...minifiedPodcast,
      media: {
        ...minifiedPodcast.media,
        metadata: { ...minifiedPodcast.media.metadata, feedUrl: null },
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.feedUrl).toBeNull();
  });

  it('carries an episode `guid` through when present on an expanded podcast', () => {
    const raw = rawLibraryItemSchema.parse({
      ...expandedPodcast,
      media: {
        ...expandedPodcast.media,
        episodes: [{ ...expandedPodcast.media.episodes[0], guid: 'urn:uuid:abc-123' }],
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.episodes?.[0]?.guid).toBe('urn:uuid:abc-123');
  });

  it('normalises episode `guid` to `null` when absent, never throwing', () => {
    const raw = rawLibraryItemSchema.parse(expandedPodcast);
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.episodes?.[0]?.guid).toBeNull();
  });

  it('normalises episode `guid` to `null` when the server sends an explicit `null`, never throwing', () => {
    const raw = rawLibraryItemSchema.parse({
      ...expandedPodcast,
      media: {
        ...expandedPodcast.media,
        episodes: [{ ...expandedPodcast.media.episodes[0], guid: null }],
      },
    });
    const item = normalizeLibraryItem(raw);
    if (item.media.kind !== 'podcast') throw new Error('expected podcast');
    expect(item.media.episodes?.[0]?.guid).toBeNull();
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
