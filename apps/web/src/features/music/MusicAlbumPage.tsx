/**
 * An album's tracks (`/music/album/$albumId`). Same "no single-item BFF route"
 * situation as `MusicArtistPage` — the header (album name, artist, cover) is
 * derived from the track list itself (`JellyfinTrack.albumName`/`artistNames`),
 * not a dedicated album fetch. An empty album (zero tracks, reachable if the
 * upstream library changed between browsing to it and this page loading)
 * degrades to "Album" rather than throwing.
 *
 * No play affordance on any row — playback is explicitly out of scope for this
 * wave (see `docs/HANDOVER.md`): the existing player is built around an
 * Audiobookshelf playback *session*
 * (`features/player/playback.ts`/`state/playerStore.ts`/`progressSync.ts`),
 * which a Jellyfin track has no equivalent of. Rows use `ListItem` with
 * `interactive={false}` for exactly that reason — present the data, wire
 * nothing that would silently no-op.
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, ListItem, Skeleton } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { useJellyfinTracksQuery } from '../../api/queries.js';
import { formatDuration } from '../player/playback.js';
import { summarizePage } from './pagination.js';

function trackPosition(discNumber: number | null, trackNumber: number | null): string {
  if (trackNumber === null) return '';
  return discNumber !== null && discNumber > 1
    ? `${discNumber}.${trackNumber}`
    : String(trackNumber);
}

export function MusicAlbumPage() {
  const { albumId } = useParams({ from: '/music/album/$albumId' });
  const api = useApi();
  const [startIndex, setStartIndex] = useState(0);

  const tracksQuery = useJellyfinTracksQuery(albumId, startIndex);
  const tracks = tracksQuery.data?.items ?? [];
  const albumName = tracks[0]?.albumName ?? 'Album';
  const artistNames = tracks[0]?.artistNames.join(', ') ?? '';
  const page = tracksQuery.data
    ? summarizePage({ startIndex, limit: 40 }, tracksQuery.data.total, tracks.length)
    : null;

  return (
    <div className="auralis-page" data-testid="music-album-page">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <img
          src={api.jellyfinArtworkUrl(albumId)}
          alt=""
          width={96}
          height={96}
          style={{ borderRadius: 8, objectFit: 'cover' }}
        />
        <div>
          <h1 data-testid="music-album-name">{albumName}</h1>
          {artistNames ? <p>{artistNames}</p> : null}
        </div>
      </div>

      {tracksQuery.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="rectangular" width="100%" height={56} />
          ))}
        </div>
      ) : tracksQuery.isError ? (
        <p role="alert">Couldn't load this album's tracks: {tracksQuery.error.message}</p>
      ) : tracks.length === 0 ? (
        <p>No tracks found for this album.</p>
      ) : (
        <>
          <div data-testid="music-track-list" style={{ display: 'flex', flexDirection: 'column' }}>
            {tracks.map((track) => (
              // `ListItem`'s non-interactive (`interactive={false}`) branch renders a plain
              // `Box` that doesn't spread its remaining props (see `packages/ui/src/components/
              // ListItem.tsx`) — `data-testid` would silently vanish if passed to `ListItem`
              // itself here, so the wrapping `div` carries it instead. Not touching
              // `packages/ui` to fix that spread is deliberate — out of this wave's scope.
              <div key={track.id} data-testid={`music-track-${track.id}`}>
                <ListItem
                  interactive={false}
                  leading={<span>{trackPosition(track.discNumber, track.trackNumber)}</span>}
                  headline={track.name}
                  supportingText={
                    track.durationSeconds !== null
                      ? formatDuration(track.durationSeconds)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>

          {page ? (
            <div
              data-testid="music-tracks-pagination"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasPrevious}
                onClick={() => setStartIndex(page.previousStartIndex ?? 0)}
                data-testid="music-tracks-prev"
              >
                Previous
              </Button>
              <span>{page.rangeLabel}</span>
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasNext}
                onClick={() => setStartIndex(page.nextStartIndex ?? 0)}
                data-testid="music-tracks-next"
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
