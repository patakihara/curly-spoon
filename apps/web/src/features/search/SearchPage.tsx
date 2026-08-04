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
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, SearchField } from '@auralis/ui';
import {
  useJellyfinConfigQuery,
  useJellyfinSearchQuery,
  useLibrariesQuery,
  useLibrarySearchQuery,
  useSetupQuery,
} from '../../api/queries.js';
import { useUiStore } from '../../state/uiStore.js';
import { searchStatus } from './searchStatus.js';

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

  useEffect(() => {
    inputRef.current?.focus();
  }, [searchFocusToken]);

  const books = searchQuery.data?.books ?? [];
  const podcasts = searchQuery.data?.podcasts ?? [];
  const artists = jellyfinConfigured ? (jellyfinSearchQuery.data?.artists ?? []) : [];
  const albums = jellyfinConfigured ? (jellyfinSearchQuery.data?.albums ?? []) : [];
  const tracks = jellyfinConfigured ? (jellyfinSearchQuery.data?.tracks ?? []) : [];
  const hasMusicResults = artists.length > 0 || albums.length > 0 || tracks.length > 0;
  const hasResults = books.length > 0 || podcasts.length > 0 || hasMusicResults;

  // One status line covers every state — unconfigured, empty query, loading, no
  // matches, or a result count — so screen reader users get the same feedback a
  // sighted user reads visually. Kept as a single always-rendered node (never
  // conditionally mounted/unmounted) so the live region itself never has to be
  // inserted into the DOM at the same moment as its first announcement, which
  // some screen readers miss.
  const statusMessage = searchStatus({
    absConfigured,
    jellyfinConfigured,
    trimmedQuery,
    absLoading: searchQuery.isLoading,
    jellyfinLoading: jellyfinSearchQuery.isLoading,
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

          {jellyfinConfigured ? (
            <section data-testid="search-results-music">
              <h2>Music</h2>

              {artists.length > 0 ? (
                <div data-testid="search-results-music-artists">
                  <h3>Artists</h3>
                  <div className="auralis-card-grid">
                    {artists.map((artist) => (
                      <Card
                        key={artist.id}
                        interactive
                        variant="elevated"
                        data-testid={`search-result-${artist.id}`}
                        onClick={() =>
                          void navigate({
                            to: '/music/artist/$artistId',
                            params: { artistId: artist.id },
                          })
                        }
                      >
                        <h4>{artist.name}</h4>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}

              {albums.length > 0 ? (
                <div data-testid="search-results-music-albums">
                  <h3>Albums</h3>
                  <div className="auralis-card-grid">
                    {albums.map((album) => (
                      <Card
                        key={album.id}
                        interactive
                        variant="elevated"
                        data-testid={`search-result-${album.id}`}
                        onClick={() =>
                          void navigate({
                            to: '/music/album/$albumId',
                            params: { albumId: album.id },
                          })
                        }
                      >
                        <h4>{album.name}</h4>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}

              {tracks.length > 0 ? (
                <div data-testid="search-results-music-tracks">
                  <h3>Tracks</h3>
                  <div className="auralis-card-grid">
                    {tracks.map((track) =>
                      // A track's search result carries no track list of its own to
                      // build a playback queue from (see this file's module doc / the
                      // wave spec's decision on this) — playing it needs the full
                      // album, so the card navigates to the album instead of playing
                      // directly. A track with no `albumId` has nowhere to navigate
                      // to, so it renders inert rather than as a dead click target.
                      track.albumId != null ? (
                        <Card
                          key={track.id}
                          interactive
                          variant="elevated"
                          data-testid={`search-result-${track.id}`}
                          onClick={() =>
                            void navigate({
                              to: '/music/album/$albumId',
                              params: { albumId: track.albumId! },
                            })
                          }
                        >
                          <h4>{track.name}</h4>
                        </Card>
                      ) : (
                        <Card
                          key={track.id}
                          variant="elevated"
                          data-testid={`search-result-${track.id}`}
                        >
                          <h4>{track.name}</h4>
                        </Card>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
