/**
 * Music home (`/music`): the artist grid, paginated with `pagination.ts`'s
 * `TotalRecordCount`-driven arithmetic, plus a search box across artists,
 * albums and tracks (submit-triggered, like `PodcastDiscoverPage`'s directory
 * search — this fans out to the real Jellyfin server, not an in-memory
 * filter, so it shouldn't run on every keystroke).
 *
 * An unconfigured Jellyfin renders a connect prompt instead of an empty grid —
 * see this wave's spec: "never show a destination that will only error", the
 * same rule `components/destinations.ts` already applies to Books/Podcasts.
 * The nav destination itself is hidden until Jellyfin is configured
 * (`destinations.ts`), but this page still guards independently since a user
 * can reach `/music` directly by URL regardless of what nav shows.
 *
 * Playback is out of scope for this wave — see `docs/HANDOVER.md` and this
 * page's cards: clicking an artist or album navigates to browse further in,
 * clicking a track in search results goes to that track's album (the only
 * place a track can be acted on in this wave is its own album's track list).
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Card, SearchField, Skeleton } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { ApiError } from '../../api/errors.js';
import {
  useJellyfinArtistsQuery,
  useJellyfinConfigQuery,
  useJellyfinSearchQuery,
} from '../../api/queries.js';
import { formatDuration } from '../player/playback.js';
import { summarizePage } from './pagination.js';

export function MusicHomePage() {
  const navigate = useNavigate();
  const api = useApi();
  const configQuery = useJellyfinConfigQuery();
  const configured = configQuery.data?.configured ?? false;

  const [startIndex, setStartIndex] = useState(0);
  const [term, setTerm] = useState('');
  const [submittedTerm, setSubmittedTerm] = useState('');

  const artistsQuery = useJellyfinArtistsQuery(startIndex, configured && submittedTerm === '');
  const searchQuery = useJellyfinSearchQuery(submittedTerm);

  const submitSearch = () => setSubmittedTerm(term.trim());
  const clearSearch = () => {
    setTerm('');
    setSubmittedTerm('');
  };

  if (configQuery.isLoading) {
    return (
      <div className="auralis-page" data-testid="music-page">
        <h1>Music</h1>
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={180} />
          ))}
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="auralis-page" data-testid="music-page">
        <h1>Music</h1>
        <p data-testid="music-unconfigured">Connect Jellyfin to browse and search your music.</p>
        <Button
          variant="filled"
          onClick={() => void navigate({ to: '/settings' })}
          data-testid="music-connect-cta"
        >
          Connect Jellyfin in Settings
        </Button>
      </div>
    );
  }

  const artists = artistsQuery.data?.items ?? [];
  const page = artistsQuery.data
    ? summarizePage({ startIndex, limit: 40 }, artistsQuery.data.total, artists.length)
    : null;

  const results = searchQuery.data;
  const hasSearchResults = Boolean(
    results &&
    (results.artists.length > 0 || results.albums.length > 0 || results.tracks.length > 0),
  );

  return (
    <div className="auralis-page" data-testid="music-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Music</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            variant="text"
            size="sm"
            onClick={() => void navigate({ to: '/music/playlists' })}
            data-testid="music-playlists-link"
          >
            Playlists
          </Button>
          <Button
            variant="text"
            size="sm"
            onClick={() => void navigate({ to: '/music/favorites' })}
            data-testid="music-favorites-link"
          >
            Favourites
          </Button>
        </div>
      </div>

      <div
        data-testid="music-search-field"
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <SearchField
          value={term}
          onChange={setTerm}
          onSubmit={submitSearch}
          placeholder="Search artists, albums, tracks"
          aria-label="Search your music library"
        />
        <Button
          variant="outlined"
          size="sm"
          onClick={submitSearch}
          data-testid="music-search-submit"
        >
          Search
        </Button>
        {submittedTerm ? (
          <Button variant="text" size="sm" onClick={clearSearch} data-testid="music-search-clear">
            Clear
          </Button>
        ) : null}
      </div>

      {submittedTerm ? (
        searchQuery.isLoading ? (
          <p>Searching…</p>
        ) : searchQuery.isError ? (
          <p role="alert" data-testid="music-search-error">
            {searchQuery.error instanceof ApiError
              ? searchQuery.error.message
              : 'Could not search your music library.'}
          </p>
        ) : !hasSearchResults ? (
          <p>No matches for "{submittedTerm}".</p>
        ) : (
          <div data-testid="music-search-results">
            {results!.artists.length > 0 ? (
              <section>
                <h2>Artists</h2>
                <div className="auralis-card-grid" data-testid="music-search-artists">
                  {results!.artists.map((artist) => (
                    <Card
                      key={artist.id}
                      interactive
                      variant="elevated"
                      data-testid={`music-search-artist-${artist.id}`}
                      onClick={() =>
                        void navigate({
                          to: '/music/artist/$artistId',
                          params: { artistId: artist.id },
                        })
                      }
                    >
                      {artist.imageTag ? (
                        <img
                          src={api.jellyfinArtworkUrl(artist.id)}
                          alt=""
                          width={120}
                          height={120}
                          style={{ borderRadius: 8, objectFit: 'cover' }}
                        />
                      ) : null}
                      <h3>{artist.name}</h3>
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}

            {results!.albums.length > 0 ? (
              <section>
                <h2>Albums</h2>
                <div className="auralis-card-grid" data-testid="music-search-albums">
                  {results!.albums.map((album) => (
                    <Card
                      key={album.id}
                      interactive
                      variant="elevated"
                      data-testid={`music-search-album-${album.id}`}
                      onClick={() =>
                        void navigate({
                          to: '/music/album/$albumId',
                          params: { albumId: album.id },
                        })
                      }
                    >
                      {album.imageTag ? (
                        <img
                          src={api.jellyfinArtworkUrl(album.id)}
                          alt=""
                          width={120}
                          height={120}
                          style={{ borderRadius: 8, objectFit: 'cover' }}
                        />
                      ) : null}
                      <h3>{album.name}</h3>
                      {album.artistName ? <p>{album.artistName}</p> : null}
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}

            {results!.tracks.length > 0 ? (
              <section>
                <h2>Tracks</h2>
                <ul
                  data-testid="music-search-tracks"
                  style={{ listStyle: 'none', margin: 0, padding: 0 }}
                >
                  {results!.tracks.map((track) => (
                    <li key={track.id}>
                      <Card
                        interactive={track.albumId !== null}
                        variant="elevated"
                        data-testid={`music-search-track-${track.id}`}
                        onClick={() => {
                          if (track.albumId) {
                            void navigate({
                              to: '/music/album/$albumId',
                              params: { albumId: track.albumId },
                            });
                          }
                        }}
                      >
                        <strong>{track.name}</strong>
                        <p>
                          {track.artistNames.join(', ')}
                          {track.albumName ? ` — ${track.albumName}` : ''}
                          {track.durationSeconds !== null
                            ? ` (${formatDuration(track.durationSeconds)})`
                            : ''}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )
      ) : artistsQuery.isLoading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={180} />
          ))}
        </div>
      ) : artistsQuery.isError ? (
        <p role="alert">Couldn't load your artists: {artistsQuery.error.message}</p>
      ) : artists.length === 0 ? (
        <p>No artists in your Jellyfin music library yet.</p>
      ) : (
        <>
          <div className="auralis-card-grid" data-testid="music-artist-cards">
            {artists.map((artist) => (
              <Card
                key={artist.id}
                interactive
                variant="elevated"
                data-testid={`music-artist-${artist.id}`}
                onClick={() =>
                  void navigate({ to: '/music/artist/$artistId', params: { artistId: artist.id } })
                }
              >
                {artist.imageTag ? (
                  <img
                    src={api.jellyfinArtworkUrl(artist.id)}
                    alt=""
                    width={120}
                    height={120}
                    style={{ borderRadius: 8, objectFit: 'cover' }}
                  />
                ) : null}
                <h3>{artist.name}</h3>
                {artist.albumCount !== null ? (
                  <p>
                    {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>

          {page ? (
            <div
              data-testid="music-artists-pagination"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasPrevious}
                onClick={() => setStartIndex(page.previousStartIndex ?? 0)}
                data-testid="music-artists-prev"
              >
                Previous
              </Button>
              <span>{page.rangeLabel}</span>
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasNext}
                onClick={() => setStartIndex(page.nextStartIndex ?? 0)}
                data-testid="music-artists-next"
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
