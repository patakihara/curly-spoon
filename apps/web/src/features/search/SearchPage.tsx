/**
 * Search. Full cross-library, lyrics-aware search is Phase 8's job
 * (docs/ARCHITECTURE.md priority table + DESIGN.md's Spotify reference); this
 * phase wires the field, the `/` and `g h`/`g l` keyboard focus behaviour, and a
 * real search against whichever library the user has.
 *
 * Accessibility (phase-10 audit): the status line — "Start typing…", "Searching…",
 * "No matches for …" — is the only feedback a user gets after typing, and none of
 * it was ever inside a live region, so a screen reader user typing into the field
 * heard nothing happen. `data-testid="search-status"` now carries
 * `aria-live="polite"` so each state change is announced without moving focus off
 * the input. The result *cards* below stay outside the live region deliberately:
 * announcing every card's content on each keystroke would be noisy, and the
 * count captured in the status line is what a listener actually needs.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, SearchField } from '@auralis/ui';
import { useLibrariesQuery, useLibrarySearchQuery, useSetupQuery } from '../../api/queries.js';
import { useUiStore } from '../../state/uiStore.js';

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

  const setupQuery = useSetupQuery();
  const configured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(configured);
  const libraryId = librariesQuery.data?.libraries[0]?.id;
  const searchQuery = useLibrarySearchQuery(libraryId, query);

  useEffect(() => {
    inputRef.current?.focus();
  }, [searchFocusToken]);

  const books = searchQuery.data?.books ?? [];
  const podcasts = searchQuery.data?.podcasts ?? [];
  const hasResults = books.length > 0 || podcasts.length > 0;

  // One status line covers every state — unconfigured, empty query, loading, no
  // matches, or a result count — so screen reader users get the same feedback a
  // sighted user reads visually. Kept as a single always-rendered node (never
  // conditionally mounted/unmounted) so the live region itself never has to be
  // inserted into the DOM at the same moment as its first announcement, which
  // some screen readers miss.
  const statusMessage = !configured
    ? 'Connect Audiobookshelf in Settings to search your library.'
    : query.trim().length === 0
      ? 'Start typing to search titles, authors and narrators.'
      : searchQuery.isLoading
        ? 'Searching…'
        : !hasResults
          ? `No matches for "${query}".`
          : `${books.length} book${books.length === 1 ? '' : 's'}, ${podcasts.length} podcast${podcasts.length === 1 ? '' : 's'} found for "${query}".`;

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

      <p aria-live="polite" data-testid="search-status">
        {statusMessage}
      </p>

      {hasResults ? (
        <div data-testid="search-results">
          <section data-testid="search-results-books">
            <h2>Books</h2>
            {books.length === 0 ? (
              <p>No book matches.</p>
            ) : (
              <div className="auralis-card-grid">
                {books.map((item) => (
                  <Card
                    key={item.id}
                    interactive
                    variant="elevated"
                    data-testid={`search-result-${item.id}`}
                    onClick={() =>
                      void navigate({ to: '/item/$itemId', params: { itemId: item.id } })
                    }
                  >
                    <h3>{item.media.title}</h3>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section data-testid="search-results-podcasts">
            <h2>Podcasts</h2>
            {podcasts.length === 0 ? (
              <p>No podcast matches.</p>
            ) : (
              <div className="auralis-card-grid">
                {podcasts.map((item) => (
                  <Card
                    key={item.id}
                    interactive
                    variant="elevated"
                    data-testid={`search-result-${item.id}`}
                    onClick={() =>
                      void navigate({ to: '/item/$itemId', params: { itemId: item.id } })
                    }
                  >
                    <h3>{item.media.title}</h3>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
