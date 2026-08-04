/**
 * The single announcement `SearchPage.tsx` renders into its `aria-live="polite"`
 * status line. Pulled out of the component because the branching — unconfigured,
 * empty query, loading, no matches, or a result count, now across two independent
 * upstreams (Audiobookshelf and Jellyfin) instead of one — stopped being
 * readable as an inline ternary once music joined books and podcasts.
 *
 * Audiobookshelf is priority 1 in this product (docs/HANDOVER.md §1), so its
 * configured/empty/loading states gate the message on their own: an
 * unconfigured or not-yet-searched Audiobookshelf produces the same wording
 * whether or not Jellyfin happens to be connected. Music only ever *extends*
 * the result-count sentence, and only once it actually has something to
 * report — the three music clauses appear together the moment any one count
 * is non-zero, and stay out entirely otherwise (including when Jellyfin is
 * unconfigured, whose counts are always zero by the time they reach here).
 * A partial list — mentioning artists but not the always-zero tracks count —
 * is harder to parse than either "nothing" or "everything", and the common
 * case of a query that only ever matches books would otherwise force a
 * five-part sentence through a screen reader on every keystroke.
 */

export interface SearchStatusCounts {
  books: number;
  podcasts: number;
  artists: number;
  albums: number;
  tracks: number;
}

export interface SearchStatusInput {
  absConfigured: boolean;
  jellyfinConfigured: boolean;
  /** The raw, as-typed query — used only for the text a user sees/hears, so
   * whitespace they typed is echoed back exactly rather than silently
   * dropped. */
  query: string;
  /** Already trimmed by the caller — used for every *decision* (is the query
   * empty, is a source still loading for it) but never displayed directly.
   * This module makes no assumption about what counts as whitespace-only
   * input beyond `=== ''`. */
  trimmedQuery: string;
  absLoading: boolean;
  jellyfinLoading: boolean;
  counts: SearchStatusCounts;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function searchStatus(input: SearchStatusInput): string {
  const {
    absConfigured,
    jellyfinConfigured,
    query,
    trimmedQuery,
    absLoading,
    jellyfinLoading,
    counts,
  } = input;

  if (!absConfigured) {
    return 'Connect Audiobookshelf in Settings to search your library.';
  }

  if (trimmedQuery === '') {
    return 'Start typing to search titles, authors and narrators.';
  }

  const isLoading = absLoading || (jellyfinConfigured && jellyfinLoading);
  if (isLoading) {
    return 'Searching…';
  }

  const musicHasResults = counts.artists > 0 || counts.albums > 0 || counts.tracks > 0;
  const hasResults = counts.books > 0 || counts.podcasts > 0 || musicHasResults;

  if (!hasResults) {
    return `No matches for "${query}".`;
  }

  const parts = [plural(counts.books, 'book'), plural(counts.podcasts, 'podcast')];
  if (musicHasResults) {
    parts.push(
      plural(counts.artists, 'artist'),
      plural(counts.albums, 'album'),
      plural(counts.tracks, 'track'),
    );
  }

  return `${parts.join(', ')} found for "${query}".`;
}
