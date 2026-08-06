/**
 * An album's tracks (`/music/album/$albumId`). Same "no single-item BFF route"
 * situation as `MusicArtistPage` — the header (album name, artist, cover) is
 * derived from the track list itself (`JellyfinTrack.albumName`/`artistNames`),
 * not a dedicated album fetch. An empty album (zero tracks, reachable if the
 * upstream library changed between browsing to it and this page loading)
 * degrades to "Album" rather than throwing.
 *
 * Clicking a row starts a `features/music/musicQueue.ts` queue at that row, through
 * `jellyfinSource` (`features/player/playbackSource.ts`) — `musicQueueController.ts`'s
 * `beginMusicQueue` lays this page's already-loaded tracks out end to end on one cumulative
 * timeline (exactly how a multi-file audiobook already plays through its own file
 * boundaries, and exactly what `queue.ts`'s older `albumQueue` used to do directly here), so
 * playing track 3 continues into track 4 with no separate "queue" concept in the player
 * itself. Unlike `ItemPage.tsx`, there is no `POST /items/:id/play` round-trip to open
 * first — Jellyfin's proxied stream route is stateless, so `playerStore.load()` is called
 * with a `LibraryItem`/`PlaybackSession` pair synthesized here, client-side, rather than one
 * fetched from the BFF. `MediaSummary.kind: 'track'` (widened for exactly this) is what
 * tells `playerDisplayMeta`/`playerArtworkUrl` (`features/player/playerUi.ts`) to bill and
 * illustrate this differently from a real Audiobookshelf item — see those functions' own
 * doc comments.
 *
 * Unlike the old `albumQueue`-only design, the queue is **not** scoped to this page's own
 * 40-track window: `beginMusicQueue` is given the album's real `total` and a `fetchMore`
 * closure over `api.getJellyfinTracks`, so `musicQueueController.ts`'s `handleTrackEnded`
 * fetches the rest of the album lazily, only once playback actually advances past what's
 * already loaded here — see that file's own header for why lazily rather than eagerly (a
 * library-artist "play all" must not stall on a giant upfront fetch before sound starts).
 * Shuffle and repeat live on `useMusicQueueStore`, driven from `NowPlaying.tsx`'s transport
 * controls; this page never reads or writes them directly.
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, ListItem, Skeleton, Snackbar, useSnackbar } from '@auralis/ui';
import type { JellyfinTrack, LibraryItem, PlaybackSession } from '../../api/types.js';
import { useApi } from '../../api/ApiContext.js';
import { CoverImage } from '../../components/CoverImage.js';
import {
  TRACK_ORDER_SORT_BY,
  useJellyfinAlbumQuery,
  useJellyfinTracksQuery,
} from '../../api/queries.js';
import { jellyfinSource } from '../player/playbackSource.js';
import { formatDuration } from '../player/playback.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { AddToPlaylistButton } from './AddToPlaylistButton.js';
import { FavoriteToggle } from './FavoriteToggle.js';
import { summarizePage } from './pagination.js';
import { attachMusicQueueEndedHandler, beginMusicQueue } from './musicQueueController.js';
import { toQueueTrack, type QueueTrack } from './musicQueue.js';

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
  const onPlaylistError = () =>
    snackbar.enqueue({ message: "Couldn't update that playlist — try again." });
  const onAdded = () => snackbar.enqueue({ message: 'Added to playlist.' });

  const playTrack = (clicked: JellyfinTrack) => {
    const queueTracks: QueueTrack[] = tracks.map(toQueueTrack);
    const clickedIndex = tracks.findIndex((track) => track.id === clicked.id);
    // `clickedIndex` always matches a real `queueTracks` entry — built from this same
    // `tracks` array, in the same order, one-to-one — so this only falls back to the queue's
    // own start if a row is somehow clicked after its track left `tracks` (e.g. a slow click
    // racing a page change), rather than throwing on a stale reference.
    const startIndex = clickedIndex === -1 ? 0 : clickedIndex;
    const total = tracksQuery.data?.total ?? tracks.length;
    const { audioTracks, duration, startTrack } = beginMusicQueue(
      queueTracks,
      total,
      startIndex,
      (fetchStartIndex, limit) =>
        api
          .getJellyfinTracks(
            { albumId, startIndex: fetchStartIndex, limit, sortBy: TRACK_ORDER_SORT_BY },
            undefined,
          )
          .then((page) => page.items.map(toQueueTrack)),
    );
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
      duration,
      currentTime: startTrack?.startOffset ?? 0,
      audioTracks,
      chapters: [],
    };
    // A getter, not `audioTracks` itself: `musicQueueStore.ts`'s `applyQueue` replaces
    // `playerStore.tracks` after shuffle/cross-page/repeat-wrap without ever reconstructing
    // this source, so the reporter must read the live array on every tick — see
    // `jellyfinSource`'s own doc comment in `playbackSource.ts`.
    usePlayerStore.getState().load(
      item,
      session,
      jellyfinSource(api, () => usePlayerStore.getState().tracks),
    );
    attachMusicQueueEndedHandler();
    usePlayerStore.getState().play();
  };

  return (
    <div className="auralis-page" data-testid="music-album-page">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <CoverImage src={api.jellyfinArtworkUrl(albumId)} size={96} fallbackIcon="music_note" />
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
        <AddToPlaylistButton
          tracks={tracks}
          label={albumName}
          stopPropagation={false}
          onError={onPlaylistError}
          onAdded={onAdded}
          data-testid="music-album-add-to-playlist"
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
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <AddToPlaylistButton
                      tracks={[track]}
                      label={track.name}
                      onError={onPlaylistError}
                      onAdded={onAdded}
                      data-testid={`music-track-add-to-playlist-${track.id}`}
                    />
                    <FavoriteToggle
                      itemId={track.id}
                      itemName={track.name}
                      favorite={track.favorite}
                      onError={onFavoriteError}
                      data-testid={`music-track-favorite-${track.id}`}
                    />
                  </div>
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
