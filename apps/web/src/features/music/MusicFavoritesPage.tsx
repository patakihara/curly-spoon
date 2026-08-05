/**
 * Favourited artists, albums and tracks (`/music/favorites`) — a dedicated route rather than
 * a section bolted onto `MusicHomePage`, which already juggles three states of its own
 * (loading, unconfigured, search-vs-browse) and has its own artist-grid pagination; a fourth,
 * unrelated concern there would make that file harder to reason about for no benefit, when
 * this app already puts every other music concern (an artist's albums, an album's tracks) in
 * its own page. Reached from a "Favourites" link on `MusicHomePage`, mirroring how that page
 * is itself reached from the nav rail's "Music" destination — no new top-level nav
 * destination is added; favourites is a view *within* music, not a sibling of it.
 *
 * Three independent listings, not one merged one: Jellyfin has no single "all my favourites"
 * endpoint (`GET /jellyfin/artists|albums|tracks?favoritesOnly=true` are three separate
 * `/Items` filters — see `useJellyfinFavoriteArtistsQuery`/`...AlbumsQuery`/`...TracksQuery`'s
 * own doc comments), and merging them into one list would need to invent a display order
 * across three unrelated item kinds that Jellyfin itself doesn't provide. Rendered as three
 * sections instead, same shape `MusicHomePage`'s own search results already use for
 * artists/albums/tracks.
 */
import { useNavigate } from '@tanstack/react-router';
import { Card, ListItem, Skeleton, Snackbar, useSnackbar } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import {
  useJellyfinFavoriteAlbumsQuery,
  useJellyfinFavoriteArtistsQuery,
  useJellyfinFavoriteTracksQuery,
} from '../../api/queries.js';
import { formatDuration } from '../player/playback.js';
import { FavoriteToggle } from './FavoriteToggle.js';

export function MusicFavoritesPage() {
  const navigate = useNavigate();
  const api = useApi();
  const snackbar = useSnackbar();

  const artistsQuery = useJellyfinFavoriteArtistsQuery();
  const albumsQuery = useJellyfinFavoriteAlbumsQuery();
  const tracksQuery = useJellyfinFavoriteTracksQuery();

  const artists = artistsQuery.data?.items ?? [];
  const albums = albumsQuery.data?.items ?? [];
  const tracks = tracksQuery.data?.items ?? [];

  const onFavoriteError = () =>
    snackbar.enqueue({ message: "Couldn't update favourite — try again." });

  const loading = artistsQuery.isLoading || albumsQuery.isLoading || tracksQuery.isLoading;
  const anyError = artistsQuery.isError || albumsQuery.isError || tracksQuery.isError;
  const isEmpty =
    !loading && !anyError && artists.length === 0 && albums.length === 0 && tracks.length === 0;

  return (
    <div className="auralis-page" data-testid="music-favorites-page">
      <h1>Favourites</h1>

      {loading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={180} />
          ))}
        </div>
      ) : anyError ? (
        <p role="alert" data-testid="music-favorites-error">
          Couldn't load your favourites.
        </p>
      ) : isEmpty ? (
        <p>Nothing favourited yet — tap the heart on an artist, album or track.</p>
      ) : (
        <>
          {artists.length > 0 ? (
            <section>
              <h2>Artists</h2>
              <div className="auralis-card-grid" data-testid="music-favorites-artists">
                {artists.map((artist) => (
                  <Card
                    key={artist.id}
                    interactive
                    variant="elevated"
                    data-testid={`music-favorites-artist-${artist.id}`}
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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <h3>{artist.name}</h3>
                      <FavoriteToggle
                        itemId={artist.id}
                        itemName={artist.name}
                        favorite={artist.favorite}
                        onError={onFavoriteError}
                        data-testid={`music-favorites-artist-toggle-${artist.id}`}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {albums.length > 0 ? (
            <section>
              <h2>Albums</h2>
              <div className="auralis-card-grid" data-testid="music-favorites-albums">
                {albums.map((album) => (
                  <Card
                    key={album.id}
                    interactive
                    variant="elevated"
                    data-testid={`music-favorites-album-${album.id}`}
                    onClick={() =>
                      void navigate({ to: '/music/album/$albumId', params: { albumId: album.id } })
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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <h3>{album.name}</h3>
                      <FavoriteToggle
                        itemId={album.id}
                        itemName={album.name}
                        favorite={album.favorite}
                        onError={onFavoriteError}
                        data-testid={`music-favorites-album-toggle-${album.id}`}
                      />
                    </div>
                    {album.artistName ? <p>{album.artistName}</p> : null}
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {tracks.length > 0 ? (
            <section>
              <h2>Tracks</h2>
              <div
                data-testid="music-favorites-tracks"
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                {tracks.map((track) => (
                  <ListItem
                    key={track.id}
                    data-testid={`music-favorites-track-${track.id}`}
                    // A favourited track opens its album — this page has no standalone
                    // single-track player entry point, same as `MusicHomePage`'s own search
                    // results (see that page's doc comment: "the only place a track can be
                    // acted on ... is its own album's track list").
                    aria-label={track.albumId ? `Open the album for ${track.name}` : track.name}
                    onClick={() => {
                      if (track.albumId) {
                        void navigate({
                          to: '/music/album/$albumId',
                          params: { albumId: track.albumId },
                        });
                      }
                    }}
                    headline={track.name}
                    supportingText={
                      [
                        track.artistNames.join(', '),
                        track.durationSeconds !== null
                          ? formatDuration(track.durationSeconds)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                    trailing={
                      <FavoriteToggle
                        itemId={track.id}
                        itemName={track.name}
                        favorite={track.favorite}
                        onError={onFavoriteError}
                        data-testid={`music-favorites-track-toggle-${track.id}`}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
      <Snackbar snackbar={snackbar.current} onDismiss={snackbar.dismiss} />
    </div>
  );
}
