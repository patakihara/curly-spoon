/**
 * Pure state logic behind the For You view's content-type filter chips
 * (docs/ROADMAP.md §12d): "carries the same content-type filter chips the
 * Search view does". The *mechanism* is the same single-select-toggle idea
 * `features/search/searchFilters.ts` uses for its primary row — but the
 * option set itself is not identical, so this is its own small module rather
 * than an import across features:
 *
 * - The label is "Audiobooks" here, not "Books" — the reference screenshots
 *   (`docs/research/spec-addendum/01-for-you.jpg` through `04-for-you.jpg`)
 *   spell it out that way, and the roadmap's own wording for this wave quotes
 *   the row verbatim as "All / Music / Podcasts / Audiobooks".
 * - The order differs (Music, Podcasts, Audiobooks here; Music, Books,
 *   Podcasts in Search) — again taken directly from the screenshots.
 *
 * For You also has no second ("secondary") row at all — unlike Search, a
 * carousel is never narrowed further than "which content type", so there is
 * nothing here mirroring `secondaryFilterOptions`.
 */

export interface ForYouFilterOption {
  value: string;
  label: string;
}

export const DEFAULT_FOR_YOU_FILTER = 'all';

export const FOR_YOU_FILTER_OPTIONS: ForYouFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'music', label: 'Music' },
  { value: 'podcasts', label: 'Podcasts' },
  { value: 'books', label: 'Audiobooks' },
];

/** Single-select toggle, same behaviour as Search's primary row: clicking the
 * already-active chip clears the filter back to "all" rather than leaving
 * nothing selected. */
export function selectForYouFilter(current: string, value: string): string {
  return current === value ? DEFAULT_FOR_YOU_FILTER : value;
}
