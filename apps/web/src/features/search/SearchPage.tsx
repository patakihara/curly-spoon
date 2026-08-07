/**
 * Unified search: one field over every library the user has connected —
 * Audiobookshelf's books and podcasts, and, once Jellyfin is configured,
 * artists/albums/tracks too. Wires the field itself, the `/` and `g h`/`g l`
 * keyboard focus behaviour, and fans one typed query out to whichever
 * upstreams are actually available.
 *
 * Accessibility (phase-10 audit): the status line — "Start typing…", "Searching…",
 * "No matches for …" — is the only feedback a user gets after typing, and none of
 * it was ever inside a live region, so a screen reader user typing into the field
 * heard nothing happen. `data-testid="search-status"` now carries
 * `aria-live="polite"` so each state change is announced without moving focus off
 * the input. The result *cards* below stay outside the live region deliberately:
 * announcing every card's content on each keystroke would be noisy, and the
 * count captured in the status line is what a listener actually needs. See
 * `searchStatus.ts` for the wording logic itself.
 *
 * Content-type filter chips (docs/ROADMAP.md §12b): two rows, driven by the pure
 * state machine in `searchFilters.ts`. Row 1 picks All/Music/Books/Podcasts; a
 * specific pick reveals row 2 (Music → Songs/Albums/Artists, Books →
 * Books/Series/Authors, Podcasts → nothing — see that module's header comment for
 * why). `visibleKinds(primary, secondary)` is the single place that decides which
 * of the seven result kinds below actually render; every section here is gated on
 * its own `visible.<kind>` flag rather than re-deriving the logic locally.
 *
 * Filter state is plain `useState`, not `uiStore` — it's local to this page (the
 * chips reset on a fresh visit, same as query used to reset if you left and came
 * back before `uiStore` started persisting it), and nothing else in the app reads
 * or writes it.
 *
 * Results render as `ListItem` rows, not the `Card` grid this used to be — the
 * spec calls for a "list", and grouping by content type already gives each
 * section its own heading, so a grid's extra columns were adding nothing. Series
 * and authors are new sections (Audiobookshelf's `/search` returns both
 * alongside books/podcasts — see `packages/abs-client`'s `SearchResults` — but
 * nothing rendered them before this wave); neither has a detail page anywhere in
 * this app yet, so their rows render inert (`interactive={false}`), matching the
 * existing pattern for a track search result with no `albumId` to navigate to.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Chip, ListItem, SearchField } from '@auralis/ui';
import {
  useJellyfinConfigQuery,
  useJellyfinSearchQuery,
  useLibrariesQuery,
  useLibrarySearchQuery,
  useProvidersQuery,
  useSetupQuery,
} from '../../api/queries.js';
import { useUiStore } from '../../state/uiStore.js';
import { searchStatus } from './searchStatus.js';
import {
  DEFAULT_SEARCH_FILTER_STATE,
  PRIMARY_FILTER_OPTIONS,
  secondaryFilterOptions,
  selectPrimaryFilter,
  selectSecondaryFilter,
  visibleKinds,
  type SearchFilterState,
} from './searchFilters.js';
import { requestabilitySections } from './searchRequestability.js';
import { RequestableBooksSection } from './RequestableBooksSection.js';
import { RequestableMusicSection } from './RequestableMusicSection.js';
import { useDebouncedValue } from './useDebouncedValue.js';

/** How long the unified search field must sit still before a debounced term feeds the
 * request-search fan-outs — see `useDebouncedValue.ts`'s header comment for why this
 * exists at all. 400ms mirrors a typical "user paused typing" debounce; there is no
 * spec'd number to match, so this is a judgement call, not a measured constant. */
const REQUEST_SEARCH_DEBOUNCE_MS = 400;

export function SearchPage() {
  // `query` lives in `uiStore`, not local state: the desktop rail's own
  // always-visible search input (`Shell.tsx`) reads and writes the same value,
  // so typing in either one keeps both in sync, regardless of which one a
  // user reached `/search` from.
  const query = useUiStore((s) => s.query);
  const setQuery = useUiStore((s) => s.setSearchQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const searchFocusToken = useUiStore((s) => s.searchFocusToken);
  const trimmedQuery = query.trim();

  const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_SEARCH_FILTER_STATE);
  const visible = visibleKinds(filters.primary, filters.secondary);
  const secondaryOptions = secondaryFilterOptions(filters.primary);

  const setupQuery = useSetupQuery();
  const absConfigured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(absConfigured);
  const libraryId = librariesQuery.data?.libraries[0]?.id;
  const searchQuery = useLibrarySearchQuery(libraryId, query);

  // `useJellyfinSearchQuery` itself only gates on a non-empty term — it has no
  // idea whether Jellyfin is even connected. Gating the call here too means an
  // unconfigured Jellyfin never fires a doomed request on every keystroke.
  const jellyfinConfigQuery = useJellyfinConfigQuery();
  const jellyfinConfigured = jellyfinConfigQuery.data?.configured ?? false;
  const jellyfinSearchQuery = useJellyfinSearchQuery(jellyfinConfigured ? query : '');

  // Whether a book/music request could actually be fulfilled right now — see
  // `searchRequestability.ts`'s header comment. Gates whether the "Available to
  // request" groups render at all, independent of whether the debounced term below
  // has produced any candidates yet.
  const providersQuery = useProvidersQuery();
  const providers = providersQuery.data?.providers ?? [];
  // Gated on there being a query at all. `requestabilitySections` deliberately
  // does not look at the search term — it answers "could this kind be requested
  // on this server", not "is anything being searched for" — so without this an
  // empty box plus a selected content-type chip renders an "Available to
  // request / No book matches." block directly under the status line that says
  // "Start typing to search". Reachable in two clicks, and it was.
  const requestable = trimmedQuery
    ? requestabilitySections(providers, visible)
    : { showBookRequestable: false, showMusicRequestable: false };

  // The request-search fan-outs (real indexers, real Soulseek) are debounced
  // separately from the undebounced library search above — see
  // `useDebouncedValue.ts`'s header comment for why the two can't share one timing.
  const debouncedTrimmedQuery = useDebouncedValue(trimmedQuery, REQUEST_SEARCH_DEBOUNCE_MS);
  const bookRequestTerm = requestable.showBookRequestable ? debouncedTrimmedQuery : '';
  const musicRequestTerm = requestable.showMusicRequestable ? debouncedTrimmedQuery : '';

  // Books/podcasts/series/authors share one Audiobookshelf query and settle
  // together; music is a second, independent query that can resolve before or
  // after it. Each section below gates its own "no matches" placeholder on the
  // loading flag for the query that actually feeds it, so a fast source never
  // renders a negative claim about a slow one still in flight.
  const absLoading = searchQuery.isLoading;
  const jellyfinLoading = jellyfinSearchQuery.isLoading;

  useEffect(() => {
    inputRef.current?.focus();
  }, [searchFocusToken]);

  const books = searchQuery.data?.books ?? [];
  const podcasts = searchQuery.data?.podcasts ?? [];
  const series = searchQuery.data?.series ?? [];
  const authors = searchQuery.data?.authors ?? [];
  const artists = jellyfinConfigured ? (jellyfinSearchQuery.data?.artists ?? []) : [];
  const albums = jellyfinConfigured ? (jellyfinSearchQuery.data?.albums ?? []) : [];
  const tracks = jellyfinConfigured ? (jellyfinSearchQuery.data?.tracks ?? []) : [];
  const hasMusicResults = artists.length > 0 || albums.length > 0 || tracks.length > 0;
  const hasResults =
    books.length > 0 ||
    podcasts.length > 0 ||
    series.length > 0 ||
    authors.length > 0 ||
    hasMusicResults;

  // One status line covers every state — unconfigured, empty query, loading, no
  // matches, or a result count — so screen reader users get the same feedback a
  // sighted user reads visually. Kept as a single always-rendered node (never
  // conditionally mounted/unmounted) so the live region itself never has to be
  // inserted into the DOM at the same moment as its first announcement, which
  // some screen readers miss. Deliberately unaffected by the filter chips: it
  // reports what the query actually matched everywhere, not just what the
  // current chip selection happens to be showing.
  const statusMessage = searchStatus({
    absConfigured,
    jellyfinConfigured,
    query,
    trimmedQuery,
    absLoading,
    jellyfinLoading,
    counts: {
      books: books.length,
      podcasts: podcasts.length,
      artists: artists.length,
      albums: albums.length,
      tracks: tracks.length,
    },
  });

  return (
    <div className="auralis-page" data-testid="search-page">
      <h1>Search</h1>
      <div data-testid="search-field">
        <SearchField
          ref={inputRef}
          value={query}
          onChange={setQuery}
          placeholder="Search your library"
        />
      </div>

      <div
        data-testid="search-filter-primary"
        role="group"
        aria-label="Filter by content type"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        {PRIMARY_FILTER_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            variant="filter"
            selected={filters.primary === option.value}
            onSelectedChange={() => setFilters((prev) => selectPrimaryFilter(prev, option.value))}
            data-testid={`search-filter-primary-${option.value}`}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {secondaryOptions.length > 0 ? (
        <div
          data-testid="search-filter-secondary"
          role="group"
          aria-label={`Filter ${filters.primary} by`}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          {secondaryOptions.map((option) => (
            <Chip
              key={option.value}
              variant="filter"
              selected={filters.secondary === option.value}
              onSelectedChange={() =>
                setFilters((prev) => selectSecondaryFilter(prev, option.value))
              }
              data-testid={`search-filter-secondary-${option.value}`}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" data-testid="search-status">
        {statusMessage}
      </p>

      {hasResults || requestable.showBookRequestable || requestable.showMusicRequestable ? (
        <div data-testid="search-results">
          {visible.books ? (
            <section data-testid="search-results-books">
              <h2>Books</h2>
              {absLoading ? null : books.length === 0 ? (
                <p>No book matches.</p>
              ) : (
                <div className="auralis-result-list">
                  {books.map((item) => (
                    <ListItem
                      key={item.id}
                      data-testid={`search-result-${item.id}`}
                      headline={item.media.title}
                      onClick={() =>
                        void navigate({ to: '/item/$itemId', params: { itemId: item.id } })
                      }
                    />
                  ))}
                </div>
              )}
              {requestable.showBookRequestable ? (
                <RequestableBooksSection term={bookRequestTerm} />
              ) : null}
            </section>
          ) : null}

          {visible.series ? (
            <section data-testid="search-results-series">
              <h2>Series</h2>
              {absLoading ? null : series.length === 0 ? (
                <p>No series matches.</p>
              ) : (
                <div className="auralis-result-list">
                  {series.map((item) => (
                    <ListItem
                      key={item.id}
                      interactive={false}
                      data-testid={`search-result-${item.id}`}
                      headline={item.name}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {visible.authors ? (
            <section data-testid="search-results-authors">
              <h2>Authors</h2>
              {absLoading ? null : authors.length === 0 ? (
                <p>No author matches.</p>
              ) : (
                <div className="auralis-result-list">
                  {authors.map((item) => (
                    <ListItem
                      key={item.id}
                      interactive={false}
                      data-testid={`search-result-${item.id}`}
                      headline={item.name}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {visible.podcasts ? (
            <section data-testid="search-results-podcasts">
              <h2>Podcasts</h2>
              {absLoading ? null : podcasts.length === 0 ? (
                <p>No podcast matches.</p>
              ) : (
                <div className="auralis-result-list">
                  {podcasts.map((item) => (
                    <ListItem
                      key={item.id}
                      data-testid={`search-result-${item.id}`}
                      headline={item.media.title}
                      onClick={() =>
                        void navigate({ to: '/item/$itemId', params: { itemId: item.id } })
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {jellyfinConfigured && (visible.artists || visible.albums || visible.tracks) ? (
            <section data-testid="search-results-music">
              <h2>Music</h2>

              {jellyfinLoading ? null : !hasMusicResults ? (
                <p>No music matches.</p>
              ) : (
                <>
                  {visible.artists && artists.length > 0 ? (
                    <div data-testid="search-results-music-artists">
                      <h3>Artists</h3>
                      <div className="auralis-result-list">
                        {artists.map((artist) => (
                          <ListItem
                            key={artist.id}
                            data-testid={`search-result-${artist.id}`}
                            headline={artist.name}
                            onClick={() =>
                              void navigate({
                                to: '/music/artist/$artistId',
                                params: { artistId: artist.id },
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {visible.albums && albums.length > 0 ? (
                    <div data-testid="search-results-music-albums">
                      <h3>Albums</h3>
                      <div className="auralis-result-list">
                        {albums.map((album) => (
                          <ListItem
                            key={album.id}
                            data-testid={`search-result-${album.id}`}
                            headline={album.name}
                            onClick={() =>
                              void navigate({
                                to: '/music/album/$albumId',
                                params: { albumId: album.id },
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {visible.tracks && tracks.length > 0 ? (
                    <div data-testid="search-results-music-tracks">
                      <h3>Tracks</h3>
                      <div className="auralis-result-list">
                        {tracks.map((track) =>
                          // A track's search result carries no track list of its own to
                          // build a playback queue from (see this file's module doc / the
                          // wave spec's decision on this) — playing it needs the full
                          // album, so the card navigates to the album instead of playing
                          // directly. A track with no `albumId` has nowhere to navigate
                          // to, so it renders inert rather than as a dead click target.
                          track.albumId != null ? (
                            <ListItem
                              key={track.id}
                              data-testid={`search-result-${track.id}`}
                              headline={track.name}
                              onClick={() =>
                                void navigate({
                                  to: '/music/album/$albumId',
                                  params: { albumId: track.albumId! },
                                })
                              }
                            />
                          ) : (
                            <ListItem
                              key={track.id}
                              interactive={false}
                              data-testid={`search-result-${track.id}`}
                              headline={track.name}
                            />
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {requestable.showMusicRequestable ? (
                <RequestableMusicSection term={musicRequestTerm} />
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
