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
import { useRef } from 'react';
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

  // Filtered to `favorite === true`, unlike every other listing in this app: this is the
  // *favourites* view, so a row must vanish the instant its own toggle is unfavourited —
  // synchronously with `useToggleJellyfinFavoriteMutation`'s optimistic cache write — rather
  // than waiting on the mutation's later `invalidateQueries` refetch to bring back a list
  // that no longer includes it. That immediacy is what `handleUnfavorited` below depends on:
  // it moves focus *before* calling the mutation, on the assumption that this row is about to
  // disappear on this same render pass.
  const artists = (artistsQuery.data?.items ?? []).filter((a) => a.favorite);
  const albums = (albumsQuery.data?.items ?? []).filter((a) => a.favorite);
  const tracks = (tracksQuery.data?.items ?? []).filter((t) => t.favorite);

  const onFavoriteError = () =>
    snackbar.enqueue({ message: "Couldn't update favourite — try again." });

  // Focus targets for `handleUnfavorited`, below. Both `tabIndex={-1}`: focusable
  // programmatically, but not part of the normal Tab order.
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const artistsHeadingRef = useRef<HTMLHeadingElement>(null);
  const albumsHeadingRef = useRef<HTMLHeadingElement>(null);
  const tracksHeadingRef = useRef<HTMLHeadingElement>(null);

  /**
   * Wired to `FavoriteToggle`'s `onToggle`, which fires synchronously *before* the mutation
   * starts — not to any mutation-resolution callback, which would fire only after this row has
   * already vanished (see the `filter` above) and the browser has already dropped focus to
   * `<body>`, exactly the bug the phase-10 a11y audit found. `remainingInSection` is this
   * section's count *before* removal, so `- 1` is what it will be right after: if that section
   * still has other favourites, its own `<h2>` is a stable, still-mounted landing spot; if this
   * was the last one, that `<h2>` is about to unmount along with the rest of its `<section>`
   * (see the `.length > 0` guards below), so focus falls back to the page's own `<h1>`, which is
   * unconditionally rendered regardless of how many sections remain.
   *
   * The announcement follows `AddToPlaylistButton`'s existing "Added to playlist." pattern
   * (a `Snackbar`, `role="status"`/`aria-live="polite"`) rather than a persistent `aria-live`
   * region — this is one discrete, user-triggered removal per click, not a running commentary
   * on the list (contrast `LyricsView`, which deliberately has no live region at all because it
   * would re-announce every few seconds).
   */
  const handleUnfavorited = (
    kind: 'artist' | 'album' | 'track',
    name: string,
    remainingInSection: number,
  ) => {
    snackbar.enqueue({ message: `${name} removed from favourites.` });
    const sectionRef =
      kind === 'artist'
        ? artistsHeadingRef
        : kind === 'album'
          ? albumsHeadingRef
          : tracksHeadingRef;
    const target = remainingInSection - 1 > 0 ? sectionRef.current : pageHeadingRef.current;
    target?.focus();
  };

  const loading = artistsQuery.isLoading || albumsQuery.isLoading || tracksQuery.isLoading;
  const anyError = artistsQuery.isError || albumsQuery.isError || tracksQuery.isError;
  const isEmpty =
    !loading && !anyError && artists.length === 0 && albums.length === 0 && tracks.length === 0;

  return (
    <div className="auralis-page" data-testid="music-favorites-page">
      <h1 ref={pageHeadingRef} tabIndex={-1}>
        Favourites
      </h1>

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
              <h2 ref={artistsHeadingRef} tabIndex={-1}>
                Artists
              </h2>
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
                        onToggle={(nextFavorite) => {
                          if (!nextFavorite)
                            handleUnfavorited('artist', artist.name, artists.length);
                        }}
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
              <h2 ref={albumsHeadingRef} tabIndex={-1}>
                Albums
              </h2>
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
                        onToggle={(nextFavorite) => {
                          if (!nextFavorite) handleUnfavorited('album', album.name, albums.length);
                        }}
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
              <h2 ref={tracksHeadingRef} tabIndex={-1}>
                Tracks
              </h2>
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
                        onToggle={(nextFavorite) => {
                          if (!nextFavorite) handleUnfavorited('track', track.name, tracks.length);
                        }}
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
