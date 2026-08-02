/**
 * Search. Full cross-library, lyrics-aware search is Phase 8's job
 * (docs/ARCHITECTURE.md priority table + DESIGN.md's Spotify reference); this
 * phase wires the field, the `/` and `g h`/`g l` keyboard focus behaviour, and a
 * real search against whichever library the user has.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, SearchField } from '@auralis/ui';
import { useLibrariesQuery, useLibrarySearchQuery, useSetupQuery } from '../../api/queries.js';
import { useUiStore } from '../../state/uiStore.js';

export function SearchPage() {
  const [query, setQuery] = useState('');
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

  const results = [...(searchQuery.data?.books ?? []), ...(searchQuery.data?.podcasts ?? [])];

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
      ) : results.length === 0 ? (
        <p>No results for "{query}".</p>
      ) : (
        <div className="auralis-card-grid" data-testid="search-results">
          {results.map((item) => (
            <Card
              key={item.id}
              interactive
              variant="elevated"
              onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: item.id } })}
            >
              <h2>{item.media.title}</h2>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
