import { describe, expect, it } from 'vitest';
import { searchStatus, type SearchStatusCounts } from './searchStatus.js';

const ZERO_COUNTS: SearchStatusCounts = { books: 0, podcasts: 0, artists: 0, albums: 0, tracks: 0 };

describe('searchStatus', () => {
  it('prompts to connect Audiobookshelf when nothing is configured, regardless of the query', () => {
    expect(
      searchStatus({
        absConfigured: false,
        jellyfinConfigured: false,
        query: 'dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('Connect Audiobookshelf in Settings to search your library.');
  });

  it('prompts to connect Audiobookshelf even when Jellyfin is configured but Audiobookshelf is not', () => {
    // Music only ever extends the result sentence — it never substitutes for
    // the priority-1 Audiobookshelf gate.
    expect(
      searchStatus({
        absConfigured: false,
        jellyfinConfigured: true,
        query: 'dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('Connect Audiobookshelf in Settings to search your library.');
  });

  it('prompts the user to start typing on an empty query, with only Audiobookshelf configured', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: '',
        trimmedQuery: '',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('Start typing to search titles, authors and narrators.');
  });

  it('prompts the user to start typing on an empty query, with Jellyfin also configured', () => {
    // Wording is identical to the Audiobookshelf-only case — no music mention
    // before there is even a query to search with.
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: '',
        trimmedQuery: '',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('Start typing to search titles, authors and narrators.');
  });

  it('announces "Searching…" while Audiobookshelf is still loading', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: 'dune',
        trimmedQuery: 'dune',
        absLoading: true,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('Searching…');
  });

  it('announces "Searching…" while Jellyfin is still loading even after Audiobookshelf has already returned', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: 'nebula',
        trimmedQuery: 'nebula',
        absLoading: false,
        jellyfinLoading: true,
        counts: { books: 2, podcasts: 0, artists: 0, albums: 0, tracks: 0 },
      }),
    ).toBe('Searching…');
  });

  it('does not wait on Jellyfin loading when Jellyfin is not configured', () => {
    // jellyfinLoading is meaningless (and should be ignored) when the source
    // it describes isn't even wired up.
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: 'dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: true,
        counts: { books: 1, podcasts: 0, artists: 0, albums: 0, tracks: 0 },
      }),
    ).toBe('1 book, 0 podcasts found for "dune".');
  });

  it('reports "No matches" verbatim when only Audiobookshelf is configured and nothing matched', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: 'zzz-no-such-book',
        trimmedQuery: 'zzz-no-such-book',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('No matches for "zzz-no-such-book".');
  });

  it('reports "No matches" when both are configured but nothing matched anywhere', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: 'zzz-no-such-thing',
        trimmedQuery: 'zzz-no-such-thing',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('No matches for "zzz-no-such-thing".');
  });

  it('announces the query exactly as typed, whitespace and all, even though the trimmed value drives the decision', () => {
    // A leading space is real user input a screen reader should echo back
    // verbatim — trimming is only for deciding whether the query counts as
    // empty and whether a request should fire, never for what gets displayed.
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: ' dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: false,
        counts: ZERO_COUNTS,
      }),
    ).toBe('No matches for " dune".');

    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: ' dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: false,
        counts: { books: 1, podcasts: 0, artists: 0, albums: 0, tracks: 0 },
      }),
    ).toBe('1 book, 0 podcasts found for " dune".');
  });

  it('omits the music clauses when Jellyfin is configured but no music matched, even though books/podcasts did', () => {
    // Five parts read aloud on every keystroke is the cost of the old
    // "list music whenever Jellyfin is configured" rule — the common case of
    // a query that only ever matches books shouldn't pay it.
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: 'dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: false,
        counts: { books: 2, podcasts: 1, artists: 0, albums: 0, tracks: 0 },
      }),
    ).toBe('2 books, 1 podcast found for "dune".');
  });

  it('reports counts in the original two-part wording when only Audiobookshelf is configured', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: false,
        query: 'dune',
        trimmedQuery: 'dune',
        absLoading: false,
        jellyfinLoading: false,
        counts: { books: 2, podcasts: 1, artists: 0, albums: 0, tracks: 0 },
      }),
    ).toBe('2 books, 1 podcast found for "dune".');
  });

  it('extends the sentence with artist/album/track counts once Jellyfin is configured', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: 'fields',
        trimmedQuery: 'fields',
        absLoading: false,
        jellyfinLoading: false,
        counts: { books: 0, podcasts: 0, artists: 1, albums: 1, tracks: 0 },
      }),
    ).toBe('0 books, 0 podcasts, 1 artist, 1 album, 0 tracks found for "fields".');
  });

  it('pluralises every count independently: 1 vs 2 for each of the five kinds', () => {
    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: 'x',
        trimmedQuery: 'x',
        absLoading: false,
        jellyfinLoading: false,
        counts: { books: 1, podcasts: 2, artists: 1, albums: 2, tracks: 1 },
      }),
    ).toBe('1 book, 2 podcasts, 1 artist, 2 albums, 1 track found for "x".');

    expect(
      searchStatus({
        absConfigured: true,
        jellyfinConfigured: true,
        query: 'x',
        trimmedQuery: 'x',
        absLoading: false,
        jellyfinLoading: false,
        counts: { books: 2, podcasts: 1, artists: 2, albums: 1, tracks: 2 },
      }),
    ).toBe('2 books, 1 podcast, 2 artists, 1 album, 2 tracks found for "x".');
  });
});
