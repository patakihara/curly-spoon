/**
 * Ordering books within a series page (`SeriesPage.tsx`).
 *
 * Audiobookshelf's own `sequence` field is a free-text string ("3", "3.5", even
 * "3a" in the wild) rather than an index, so it is never safe to sort
 * lexicographically — "10" would sort before "2". Parse it as a number instead;
 * an entry whose sequence doesn't parse (or is entirely absent — a book can sit
 * in a series with no number assigned yet) goes to the end, in title order, so
 * "predictable" rather than "arbitrary" is the guarantee: re-rendering the same
 * input always produces the same output, even though there's no numeric
 * position to sort those entries by.
 */

export interface SeriesOrderableBook {
  id: string;
  title: string;
  /** `Book.series[].sequence` for the entry matching this page's series id, or
   * `null` when the book carries no sequence for this series. */
  seriesSequence: string | null;
}

/** Parses a sequence string as a number; `null`/unparseable both degrade to
 * `null` rather than throwing — a malformed sequence is display data, not an
 * error. */
function parsedSequence(seriesSequence: string | null): number | null {
  if (seriesSequence === null) return null;
  const n = Number(seriesSequence);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sorts by numeric sequence ascending; entries with no parseable sequence sort
 * after every numbered entry, ordered by title among themselves. Stable and
 * total — never throws, degrades unnumbered/unparseable entries to "last, by
 * title" rather than dropping or crashing on them.
 */
export function orderSeriesBooks<T extends SeriesOrderableBook>(books: readonly T[]): T[] {
  return [...books].sort((a, b) => {
    const seqA = parsedSequence(a.seriesSequence);
    const seqB = parsedSequence(b.seriesSequence);
    if (seqA !== null && seqB !== null) return seqA - seqB || a.title.localeCompare(b.title);
    if (seqA !== null) return -1;
    if (seqB !== null) return 1;
    return a.title.localeCompare(b.title);
  });
}
