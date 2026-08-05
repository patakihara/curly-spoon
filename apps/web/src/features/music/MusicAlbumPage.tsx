/**
 * An album's tracks (`/music/album/$albumId`). Same "no single-item BFF route"
 * situation as `MusicArtistPage` — the header (album name, artist, cover) is
 * derived from the track list itself (`JellyfinTrack.albumName`/`artistNames`),
 * not a dedicated album fetch. An empty album (zero tracks, reachable if the
 * upstream library changed between browsing to it and this page loading)
 * degrades to "Album" rather than throwing.
 *
 * Clicking a row plays the *whole currently-loaded page of tracks* as one queue, starting
 * at that row, through `jellyfinSource` (`features/player/playbackSource.ts`) —
 * `features/music/queue.ts`'s `albumQueue` lays every track on this page out end to end on
 * one cumulative timeline (exactly how a multi-file audiobook already plays through its own
 * file boundaries), so playing track 3 continues into track 4 with no separate "queue"
 * concept in the player itself. Unlike `ItemPage.tsx`, there is no `POST /items/:id/play`
 * round-trip to open first — Jellyfin's proxied stream route is stateless, so
 * `playerStore.load()` is called with a `LibraryItem`/`PlaybackSession` pair synthesized
 * here, client-side, rather than one fetched from the BFF. `MediaSummary.kind: 'track'`
 * (widened for exactly this) is what tells `playerDisplayMeta`/`playerArtworkUrl`
 * (`features/player/playerUi.ts`) to bill and illustrate this differently from a real
 * Audiobookshelf item — see those functions' own doc comments.
 *
 * The queue is scoped to this page's own 40-track window, not the whole album across
 * pagination boundaries — most real albums fit on one page, and stitching queues across a
 * `Next` click is unbuilt scope, not a bug: see `queue.ts`'s own header for what a fuller
 * queue (that, plus shuffle/repeat/cross-source) would still need.
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, ListItem, Skeleton, Snackbar, useSnackbar } from '@auralis/ui';
import type { JellyfinTrack, LibraryItem, PlaybackSession } from '../../api/types.js';
import { useApi } from '../../api/ApiContext.js';
import { useJellyfinAlbumQuery, useJellyfinTracksQuery } from '../../api/queries.js';
import { jellyfinSource } from '../player/playbackSource.js';
import { formatDuration } from '../player/playback.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { FavoriteToggle } from './FavoriteToggle.js';
import { summarizePage } from './pagination.js';
import { albumQueue } from './queue.js';

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
  const snackbar = useSnackbar();

  const tracksQuery = useJellyfinTracksQuery(albumId, startIndex);
  const albumQuery = useJellyfinAlbumQuery(albumId);
  const tracks = tracksQuery.data?.items ?? [];
  const albumName = tracks[0]?.albumName ?? 'Album';
  const artistNames = tracks[0]?.artistNames.join(', ') ?? '';
  const albumFavorite = albumQuery.data?.items[0]?.favorite ?? false;
  const page = tracksQuery.data
    ? summarizePage({ startIndex, limit: 40 }, tracksQuery.data.total, tracks.length)
    : null;

  const onFavoriteError = () =>
    snackbar.enqueue({ message: "Couldn't update favourite — try again." });

  const playTrack = (clicked: JellyfinTrack) => {
    const queue = albumQueue(tracks);
    const clickedIndex = tracks.findIndex((track) => track.id === clicked.id);
    // `clickedIndex` always matches a real `audioTracks` entry — `queue`'s tracks are built
    // from this same `tracks` array, in the same order, one-to-one — so this only falls back
    // to the queue's own start if a row is somehow clicked after its track left `tracks`
    // (e.g. a slow click racing a page change), rather than throwing on a stale reference.
    const startTrack = queue.audioTracks[clickedIndex] ?? queue.audioTracks[0];
    const item: LibraryItem = {
      id: albumId,
      // Jellyfin has no "library id" surfaced to this page; inert, `load()` never reads it.
      libraryId: '',
      coverPath: null,
      media: { kind: 'track', title: albumName, author: artistNames || null },
      progress: null,
    };
    const session: PlaybackSession = {
      id: `jellyfin-album-${albumId}`,
      libraryItemId: albumId,
      episodeId: null,
      // Inert — `playerStore.load()` never reads `mediaType`; present only to satisfy the type.
      mediaType: 'book',
      displayTitle: startTrack?.title ?? albumName,
      duration: queue.duration,
      currentTime: startTrack?.startOffset ?? 0,
      audioTracks: queue.audioTracks,
      chapters: [],
    };
    usePlayerStore.getState().load(item, session, jellyfinSource(api, queue.audioTracks));
    usePlayerStore.getState().play();
  };

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
        <FavoriteToggle
          itemId={albumId}
          itemName={albumName}
          favorite={albumFavorite}
          stopPropagation={false}
          onError={onFavoriteError}
          data-testid="music-album-favorite"
        />
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
              <ListItem
                key={track.id}
                data-testid={`music-track-${track.id}`}
                aria-label={`Play ${track.name}`}
                onClick={() => playTrack(track)}
                leading={<span>{trackPosition(track.discNumber, track.trackNumber)}</span>}
                headline={track.name}
                supportingText={
                  track.durationSeconds !== null ? formatDuration(track.durationSeconds) : undefined
                }
                trailing={
                  <FavoriteToggle
                    itemId={track.id}
                    itemName={track.name}
                    favorite={track.favorite}
                    onError={onFavoriteError}
                    data-testid={`music-track-favorite-${track.id}`}
                  />
                }
              />
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
      <Snackbar snackbar={snackbar.current} onDismiss={snackbar.dismiss} />
    </div>
  );
}
