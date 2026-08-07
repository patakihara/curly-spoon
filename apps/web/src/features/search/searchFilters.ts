/**
 * Pure state logic behind the Search view's two chip rows (docs/ROADMAP.md
 * §12b). Kept out of `SearchPage.tsx` for the same reason `searchStatus.ts`
 * is: the branching is worth testing as behaviour, not as JSX.
 *
 * Two rows, one dependency direction:
 *
 * - Row 1 ("primary") picks a content type: All / Music / Books / Podcasts.
 * - Row 2 ("secondary") only exists once a specific type is picked, and its
 *   options depend on which one — Music reveals Songs/Albums/Artists, Books
 *   reveals Books/Series/Authors. `secondaryFilterOptions` is what decides
 *   which set applies, and returns `[]` — no second row — for anything that
 *   doesn't have one, including "all" and any unrecognised value. That's the
 *   "degrade rather than throw" case: this module never assumes its caller
 *   only ever passes one of the four known primary values.
 *
 * Podcasts has no second row on purpose. Audiobookshelf's `/search` endpoint
 * (`rawSearchResponseSchema` in `packages/abs-client`) returns podcasts as a
 * single flat `podcast` bucket — whole shows, not episodes, and no other
 * podcast-shaped kind of match exists to filter between. A second row with
 * only "All" and one other option that means the same thing would be a
 * control that does nothing.
 *
 * `selectPrimaryFilter`/`selectSecondaryFilter` are what `SearchPage.tsx`
 * calls from each row's `onSelectedChange`. Both chip rows behave as
 * single-select toggles: clicking the already-active chip clears it back to
 * "all" rather than leaving the row with nothing selected. Selecting a new
 * primary always resets the secondary to "all" — the previous secondary
 * value may not even exist under the new primary's option set (e.g. "Series"
 * has no equivalent under Music) — and clearing the primary (selecting "all",
 * or toggling the active one off) clears the secondary as a consequence: its
 * value is never read once `visibleKinds` sees `primary === 'all'`.
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface SearchFilterState {
  primary: string;
  secondary: string;
}

export const DEFAULT_SEARCH_FILTER_STATE: SearchFilterState = { primary: 'all', secondary: 'all' };

export const PRIMARY_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'music', label: 'Music' },
  { value: 'books', label: 'Books' },
  { value: 'podcasts', label: 'Podcasts' },
];

const SECONDARY_FILTER_OPTIONS: Record<string, FilterOption[]> = {
  music: [
    { value: 'all', label: 'All' },
    { value: 'songs', label: 'Songs' },
    { value: 'albums', label: 'Albums' },
    { value: 'artists', label: 'Artists' },
  ],
  books: [
    { value: 'all', label: 'All' },
    { value: 'books', label: 'Books' },
    { value: 'series', label: 'Series' },
    { value: 'authors', label: 'Authors' },
  ],
};

/** Which second-row chips a given first-row selection reveals. `[]` means no
 * second row at all — "all" and "podcasts" both resolve here, along with any
 * value this module doesn't recognise. */
export function secondaryFilterOptions(primary: string): FilterOption[] {
  return SECONDARY_FILTER_OPTIONS[primary] ?? [];
}

export function selectPrimaryFilter(state: SearchFilterState, value: string): SearchFilterState {
  const nextPrimary = state.primary === value ? 'all' : value;
  return { primary: nextPrimary, secondary: 'all' };
}

export function selectSecondaryFilter(state: SearchFilterState, value: string): SearchFilterState {
  const nextSecondary = state.secondary === value ? 'all' : value;
  return { ...state, secondary: nextSecondary };
}

/** Which result kinds the current chip selection should render. Every field
 * defaults to `false` so a caller only has to name what it wants visible. */
export interface VisibleKinds {
  books: boolean;
  series: boolean;
  authors: boolean;
  podcasts: boolean;
  artists: boolean;
  albums: boolean;
  tracks: boolean;
}

const NONE_VISIBLE: VisibleKinds = {
  books: false,
  series: false,
  authors: false,
  podcasts: false,
  artists: false,
  albums: false,
  tracks: false,
};

/** The nothing-selected view: every kind grouped by its content type, with no
 * sub-filtering. Series/authors are deliberately excluded here — they only
 * ever surface once "Books" is explicitly selected (see this module's header
 * comment for the Books/Series/Authors row) — so the unfiltered view groups
 * at the same three content types it always has (Books, Podcasts, Music). */
const ALL_KINDS_VISIBLE: VisibleKinds = {
  ...NONE_VISIBLE,
  books: true,
  podcasts: true,
  artists: true,
  albums: true,
  tracks: true,
};

/** Resolves the current chip selection to which result kinds should render.
 * Total: an unrecognised `primary` (or a `secondary` that doesn't apply to
 * the given `primary`) degrades to the same "show everything" result as
 * `primary: 'all'`, rather than throwing or silently hiding results behind a
 * typo. */
export function visibleKinds(primary: string, secondary: string): VisibleKinds {
  switch (primary) {
    case 'books':
      switch (secondary) {
        case 'books':
          return { ...NONE_VISIBLE, books: true };
        case 'series':
          return { ...NONE_VISIBLE, series: true };
        case 'authors':
          return { ...NONE_VISIBLE, authors: true };
        default:
          return { ...NONE_VISIBLE, books: true, series: true, authors: true };
      }
    case 'music':
      switch (secondary) {
        case 'songs':
          return { ...NONE_VISIBLE, tracks: true };
        case 'albums':
          return { ...NONE_VISIBLE, albums: true };
        case 'artists':
          return { ...NONE_VISIBLE, artists: true };
        default:
          return { ...NONE_VISIBLE, artists: true, albums: true, tracks: true };
      }
    case 'podcasts':
      return { ...NONE_VISIBLE, podcasts: true };
    default:
      return ALL_KINDS_VISIBLE;
  }
}
