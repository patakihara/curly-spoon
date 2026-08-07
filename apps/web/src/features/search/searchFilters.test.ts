import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_FILTER_STATE,
  secondaryFilterOptions,
  selectPrimaryFilter,
  selectSecondaryFilter,
  visibleKinds,
} from './searchFilters.js';

describe('secondaryFilterOptions', () => {
  it('reveals All/Songs/Albums/Artists for Music', () => {
    expect(secondaryFilterOptions('music')).toEqual([
      { value: 'all', label: 'All' },
      { value: 'songs', label: 'Songs' },
      { value: 'albums', label: 'Albums' },
      { value: 'artists', label: 'Artists' },
    ]);
  });

  it('reveals All/Books/Series/Authors for Books', () => {
    expect(secondaryFilterOptions('books')).toEqual([
      { value: 'all', label: 'All' },
      { value: 'books', label: 'Books' },
      { value: 'series', label: 'Series' },
      { value: 'authors', label: 'Authors' },
    ]);
  });

  it('has no second row for Podcasts — the search API only ever returns whole shows', () => {
    expect(secondaryFilterOptions('podcasts')).toEqual([]);
  });

  it('has no second row when nothing is selected', () => {
    expect(secondaryFilterOptions('all')).toEqual([]);
  });

  it('degrades to no second row for an unrecognised primary rather than throwing', () => {
    expect(secondaryFilterOptions('bogus')).toEqual([]);
  });
});

describe('selectPrimaryFilter', () => {
  it('selects a new primary and resets the secondary to all', () => {
    const afterMusic = selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, 'music');
    expect(afterMusic).toEqual({ primary: 'music', secondary: 'all' });

    const midway = selectSecondaryFilter(afterMusic, 'albums');
    expect(midway).toEqual({ primary: 'music', secondary: 'albums' });

    // Switching primary to Books drops the Music-only "albums" secondary —
    // it isn't even a valid Books option.
    const afterBooks = selectPrimaryFilter(midway, 'books');
    expect(afterBooks).toEqual({ primary: 'books', secondary: 'all' });
  });

  it('clicking the already-active primary clears the row back to all, clearing the secondary too', () => {
    const musicWithSongs = selectSecondaryFilter(
      selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, 'music'),
      'songs',
    );
    expect(musicWithSongs).toEqual({ primary: 'music', secondary: 'songs' });

    const cleared = selectPrimaryFilter(musicWithSongs, 'music');
    expect(cleared).toEqual({ primary: 'all', secondary: 'all' });
    // The secondary row is gone entirely once primary is 'all' — nothing
    // left over from the "songs" pick.
    expect(secondaryFilterOptions(cleared.primary)).toEqual([]);
  });

  it('selecting All directly clears both rows regardless of prior state', () => {
    const booksWithSeries = selectSecondaryFilter(
      selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, 'books'),
      'series',
    );
    expect(selectPrimaryFilter(booksWithSeries, 'all')).toEqual({
      primary: 'all',
      secondary: 'all',
    });
  });
});

describe('selectSecondaryFilter', () => {
  it('selects a secondary value', () => {
    const state = selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, 'books');
    expect(selectSecondaryFilter(state, 'authors')).toEqual({
      primary: 'books',
      secondary: 'authors',
    });
  });

  it('clicking the already-active secondary clears it back to all', () => {
    const state = selectSecondaryFilter(
      selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, 'books'),
      'authors',
    );
    expect(selectSecondaryFilter(state, 'authors')).toEqual({ primary: 'books', secondary: 'all' });
  });
});

describe('visibleKinds', () => {
  it('shows books, podcasts and all three music kinds when nothing is selected, but not series/authors', () => {
    expect(visibleKinds('all', 'all')).toEqual({
      books: true,
      series: false,
      authors: false,
      podcasts: true,
      artists: true,
      albums: true,
      tracks: true,
    });
  });

  it('Books + All shows books, series and authors together', () => {
    expect(visibleKinds('books', 'all')).toEqual({
      books: true,
      series: true,
      authors: true,
      podcasts: false,
      artists: false,
      albums: false,
      tracks: false,
    });
  });

  it.each([
    ['books', { books: true, series: false, authors: false }],
    ['series', { books: false, series: true, authors: false }],
    ['authors', { books: false, series: false, authors: true }],
  ])('Books + %s narrows to just that kind', (secondary, expected) => {
    const result = visibleKinds('books', secondary);
    expect(result.books).toBe(expected.books);
    expect(result.series).toBe(expected.series);
    expect(result.authors).toBe(expected.authors);
    expect(result.podcasts).toBe(false);
    expect(result.artists).toBe(false);
    expect(result.albums).toBe(false);
    expect(result.tracks).toBe(false);
  });

  it('Music + All shows artists, albums and tracks together', () => {
    expect(visibleKinds('music', 'all')).toEqual({
      books: false,
      series: false,
      authors: false,
      podcasts: false,
      artists: true,
      albums: true,
      tracks: true,
    });
  });

  it.each([
    ['songs', { artists: false, albums: false, tracks: true }],
    ['albums', { artists: false, albums: true, tracks: false }],
    ['artists', { artists: true, albums: false, tracks: false }],
  ])('Music + %s narrows to just that kind', (secondary, expected) => {
    const result = visibleKinds('music', secondary);
    expect(result.artists).toBe(expected.artists);
    expect(result.albums).toBe(expected.albums);
    expect(result.tracks).toBe(expected.tracks);
    expect(result.books).toBe(false);
    expect(result.series).toBe(false);
    expect(result.authors).toBe(false);
    expect(result.podcasts).toBe(false);
  });

  it('Podcasts shows only podcasts, regardless of secondary (it has no second row)', () => {
    expect(visibleKinds('podcasts', 'all')).toEqual({
      books: false,
      series: false,
      authors: false,
      podcasts: true,
      artists: false,
      albums: false,
      tracks: false,
    });
  });

  it('degrades an unrecognised primary to the same "show everything" result as all, rather than throwing', () => {
    expect(() => visibleKinds('bogus', 'all')).not.toThrow();
    expect(visibleKinds('bogus', 'all')).toEqual(visibleKinds('all', 'all'));
  });
});
