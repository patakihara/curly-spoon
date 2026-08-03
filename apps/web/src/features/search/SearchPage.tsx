/**
 * Search. Full cross-library, lyrics-aware search is Phase 8's job
 * (docs/ARCHITECTURE.md priority table + DESIGN.md's Spotify reference); this
 * phase wires the field, the `/` and `g h`/`g l` keyboard focus behaviour, and a
 * real search against whichever library the user has.
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

      {!configured ? (
        <p>Connect Audiobookshelf in Settings to search your library.</p>
      ) : query.trim().length === 0 ? (
        <p>Start typing to search titles, authors and narrators.</p>
      ) : searchQuery.isLoading ? (
        <p>Searching…</p>
      ) : !hasResults ? (
        <p>No matches for "{query}".</p>
      ) : (
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
      )}
    </div>
  );
}
