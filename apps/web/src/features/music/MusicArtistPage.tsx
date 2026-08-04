/**
 * An artist's albums (`/music/artist/$artistId`). There is no dedicated
 * "fetch one artist" BFF route — only the list routes (`GET /jellyfin/artists`,
 * `GET /jellyfin/albums?artistId=`) — so the header name comes from the albums
 * themselves (`JellyfinAlbum.artistName`, populated on every album from its
 * `AlbumArtists`/`ArtistItems`), the same way `MusicAlbumPage` derives its own
 * header from its tracks. An artist with zero albums has nothing to derive a
 * name from; the header degrades to "Artist" rather than throwing.
 */
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Button, Card, Skeleton } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { useJellyfinAlbumsQuery } from '../../api/queries.js';
import { summarizePage } from './pagination.js';

export function MusicArtistPage() {
  const { artistId } = useParams({ from: '/music/artist/$artistId' });
  const navigate = useNavigate();
  const api = useApi();
  const [startIndex, setStartIndex] = useState(0);

  const albumsQuery = useJellyfinAlbumsQuery(artistId, startIndex);
  const albums = albumsQuery.data?.items ?? [];
  const artistName = albums[0]?.artistName ?? 'Artist';
  const page = albumsQuery.data
    ? summarizePage({ startIndex, limit: 40 }, albumsQuery.data.total, albums.length)
    : null;

  return (
    <div className="auralis-page" data-testid="music-artist-page">
      <h1 data-testid="music-artist-name">{artistName}</h1>

      {albumsQuery.isLoading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={220} />
          ))}
        </div>
      ) : albumsQuery.isError ? (
        <p role="alert">Couldn't load this artist's albums: {albumsQuery.error.message}</p>
      ) : albums.length === 0 ? (
        <p>No albums found for this artist.</p>
      ) : (
        <>
          <div className="auralis-card-grid" data-testid="music-album-cards">
            {albums.map((album) => (
              <Card
                key={album.id}
                interactive
                variant="elevated"
                data-testid={`music-album-${album.id}`}
                onClick={() =>
                  void navigate({ to: '/music/album/$albumId', params: { albumId: album.id } })
                }
              >
                {album.imageTag ? (
                  <img
                    src={api.jellyfinArtworkUrl(album.id)}
                    alt=""
                    width={160}
                    height={160}
                    style={{ borderRadius: 8, objectFit: 'cover' }}
                  />
                ) : null}
                <h3>{album.name}</h3>
                <p>
                  {album.productionYear ?? ''}
                  {album.trackCount !== null
                    ? `${album.productionYear ? ' · ' : ''}${album.trackCount} ${
                        album.trackCount === 1 ? 'track' : 'tracks'
                      }`
                    : ''}
                </p>
              </Card>
            ))}
          </div>

          {page ? (
            <div
              data-testid="music-albums-pagination"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasPrevious}
                onClick={() => setStartIndex(page.previousStartIndex ?? 0)}
                data-testid="music-albums-prev"
              >
                Previous
              </Button>
              <span>{page.rangeLabel}</span>
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasNext}
                onClick={() => setStartIndex(page.nextStartIndex ?? 0)}
                data-testid="music-albums-next"
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
