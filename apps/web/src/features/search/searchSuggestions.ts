/**
 * Suggestion derivation for `SearchPage.tsx`'s field — `docs/design/screens/SEARCH.md` §6.2.
 * `packages/ui/src/components/SearchField.tsx` already has a complete, tested ARIA-combobox
 * suggestion mechanism (`suggestions`/`onSuggestionSelect`); nothing in the app has ever fed it
 * real data. This module is the "real data" half — it does not fetch anything of its own.
 *
 * Suggestions are built from the same `books`/`series`/`authors`/`podcasts` (Audiobookshelf) and
 * `artists`/`albums`/`tracks` (Jellyfin) arrays `SearchPage.tsx` already computes for the results
 * list below — no new query, no new debounce, so the list updates on exactly the cadence the
 * results list already does.
 *
 * Ordering and cap: concatenate in the fixed kind order the results list itself renders in —
 * Books, Series, Authors, Podcasts, Artists, Albums, Tracks — taking items in the order each
 * source returns them, until 8 total are collected across all kinds combined, then stop. A kind
 * with no candidates simply contributes nothing; slots are never reserved for it.
 *
 * A track with no `albumId` is excluded entirely (same "nowhere to go" rule the full results list
 * already applies to that row) — the caller is expected to have already filtered `sources.tracks`
 * to items that carry a non-null `albumId` (`SearchPage.tsx` does, since it needs the same filter
 * for the results list's own click targets).
 *
 * The label is `"{title} · {Kind}"` — U+00B7 MIDDLE DOT, the same separator convention
 * `ALBUM_DETAIL.md`'s meta line established, not a hyphen or em dash — so this is a literal pin,
 * not a formatting choice made locally.
 */

export type SearchSuggestionKind =
  'Book' | 'Series' | 'Author' | 'Podcast' | 'Artist' | 'Album' | 'Track';

/** One kind's worth of candidates, already reduced to just what this module needs — the caller
 * (`SearchPage.tsx`) maps its richer result-list item shapes down to this before calling in. */
export interface SuggestionSourceItem {
  id: string;
  title: string;
}

export interface SearchSuggestionSources {
  books: SuggestionSourceItem[];
  series: SuggestionSourceItem[];
  authors: SuggestionSourceItem[];
  podcasts: SuggestionSourceItem[];
  artists: SuggestionSourceItem[];
  albums: SuggestionSourceItem[];
  /** Already filtered to items with a non-null `albumId` by the caller — see the module doc
   * comment. `albumId` is carried through separately because a track's own navigation target is
   * its *album*, not itself (`SearchPage.tsx`'s existing click handler does the same thing). */
  tracks: (SuggestionSourceItem & { albumId: string })[];
}

/**
 * One derived suggestion. `id` is unique across the whole list (kind-prefixed, since a book and
 * an artist could otherwise coincidentally share an id) — a stable React key and the value
 * `SearchField` reports back through `aria-activedescendant`. `label` is the exact rendered
 * string (`"{title} · {Kind}"`); `title`/`kind`/`originalId`/`albumId` carry what `onSuggestionSelect`
 * needs to fulfil the selection rule (§6.2: set the field to the plain title, then navigate) —
 * `SearchField`'s own `suggestions` prop is structurally typed as `{ id, label }`, so passing this
 * richer shape through it and reading the extra fields back off the object `onSuggestionSelect`
 * hands back is safe without widening the primitive's own type.
 */
export interface SearchSuggestionEntry {
  id: string;
  kind: SearchSuggestionKind;
  originalId: string;
  /** Set only for `kind === 'Track'` — the album its navigation target actually points at. */
  albumId?: string;
  title: string;
  label: string;
}

const SUGGESTION_CAP = 8;

const SEPARATOR = '·'; // U+00B7 MIDDLE DOT

function labelFor(title: string, kind: SearchSuggestionKind): string {
  return `${title} ${SEPARATOR} ${kind}`;
}

/** Kind order fixed to match the results list below it — Books, Series, Authors, Podcasts,
 * Artists, Albums, Tracks (§6.2). */
export function deriveSearchSuggestions(sources: SearchSuggestionSources): SearchSuggestionEntry[] {
  const ordered: {
    kind: SearchSuggestionKind;
    items: (SuggestionSourceItem & { albumId?: string })[];
  }[] = [
    { kind: 'Book', items: sources.books },
    { kind: 'Series', items: sources.series },
    { kind: 'Author', items: sources.authors },
    { kind: 'Podcast', items: sources.podcasts },
    { kind: 'Artist', items: sources.artists },
    { kind: 'Album', items: sources.albums },
    { kind: 'Track', items: sources.tracks },
  ];

  const result: SearchSuggestionEntry[] = [];
  for (const { kind, items } of ordered) {
    for (const item of items) {
      if (result.length >= SUGGESTION_CAP) return result;
      result.push({
        id: `${kind.toLowerCase()}-${item.id}`,
        kind,
        originalId: item.id,
        albumId: kind === 'Track' ? item.albumId : undefined,
        title: item.title,
        label: labelFor(item.title, kind),
      });
    }
  }
  return result;
}
