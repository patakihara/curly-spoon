/**
 * One playlist's tracks (`/music/playlist/$playlistId`), in playlist order — never
 * re-sorted, see `JellyfinPlaylistItem`'s doc comment (`api/types.ts`) and
 * `useJellyfinPlaylistItemsQuery`'s. The album page (`MusicAlbumPage.tsx`) hit exactly this
 * bug once already (relying on an upstream default sort that turned out to be alphabetical
 * by title) — this page never asks the BFF to sort at all, it just renders what
 * `GET /jellyfin/playlists/:id/items` hands back.
 *
 * Clicking a row starts a `features/music/musicQueue.ts` queue at that row — same mechanism
 * as `MusicAlbumPage.tsx`: `musicQueueController.ts`'s `beginMusicQueue` lays this page's
 * already-loaded tracks (`items.map(i => i.track)`, via `toQueueTrack`) out end to end on
 * one cumulative timeline through `jellyfinSource`. No second queueing mechanism was built
 * for playlists here either — same reuse `MusicAlbumPage.tsx`'s own header describes,
 * including the lazy cross-page fetch: `fetchMore` below closes over
 * `api.getJellyfinPlaylistItems` instead of `getJellyfinTracks`, which is the only thing
 * that differs between the two pages' queues.
 *
 * A row still marked `isOptimisticPlaylistItem` (added but not yet confirmed by the server —
 * see `playlists.ts`) has its remove control disabled: Jellyfin has never heard of a
 * client-only id, so removing by it would either no-op or error depending on how the BFF's
 * `entryIds` filter handles an unknown value, neither of which is worth surfacing to a user
 * who just clicked "add".
 *
 * Pagination is the same mechanism `MusicAlbumPage.tsx` already has, not a second one:
 * `startIndex` state, `summarizePage` (`./pagination.js`) for the range label and
 * next/previous availability, and matching Previous/Next `Button`s. Before this, a
 * playlist longer than one `JELLYFIN_PAGE_SIZE` page (40 tracks) silently showed only its
 * first 40 with no signal more existed — see the wave-review defect this fixes. Playing a
 * row now queues the *whole playlist*, not just the page it was clicked from — see the
 * queue-wave header above.
 *
 * Each row is also wrapped in `TrackContextMenu` (`docs/ROADMAP.md` §12e's follow-up scope
 * cut, recorded in `docs/HANDOVER.md`) — same component `MusicAlbumPage.tsx` uses, same
 * `toQueueTrack`/`insertTrackNext`/`insertTrackLast` reuse. Unlike that page, `artistId` is
 * always passed as `null` here: a playlist mixes tracks from many albums/artists, so there
 * is no single page-level artist id to borrow the way `MusicAlbumPage.tsx` borrows its
 * album's own `artistId` for every row. `JellyfinTrack` itself carries no `artistId` at all
 * (see `trackContextMenu.ts`'s own `TrackMenuContext` doc comment), and recovering a real
 * one here would mean an extra per-album fetch this follow-up's scope doesn't cover — "Go to
 * artist" simply doesn't render for these rows, which is `buildTrackMenuItems`' existing,
 * already-tested degrade rather than a new special case.
 */
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Button, IconButton, Icon, ListItem, Skeleton, Snackbar, useSnackbar } from '@auralis/ui';
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import { useApi } from '../../api/ApiContext.js';
import {
  JELLYFIN_PAGE_SIZE,
  useJellyfinPlaylistItemsQuery,
  useJellyfinPlaylistQuery,
  useRemoveFromJellyfinPlaylistMutation,
} from '../../api/queries.js';
import { jellyfinSource } from '../player/playbackSource.js';
import { formatDuration } from '../player/playback.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { isOptimisticPlaylistItem } from './playlists.js';
import { summarizePage } from './pagination.js';
import { attachMusicQueueEndedHandler, beginMusicQueue } from './musicQueueController.js';
import { toQueueTrack, type QueueTrack } from './musicQueue.js';
import { TrackContextMenu } from './TrackContextMenu.js';

export function MusicPlaylistPage() {
  const { playlistId } = useParams({ from: '/music/playlist/$playlistId' });
  const navigate = useNavigate();
  const api = useApi();
  const [startIndex, setStartIndex] = useState(0);
  const snackbar = useSnackbar();

  const itemsQuery = useJellyfinPlaylistItemsQuery(playlistId, startIndex);
  const playlistQuery = useJellyfinPlaylistQuery(playlistId);
  const removeMutation = useRemoveFromJellyfinPlaylistMutation();

  const items = itemsQuery.data?.items ?? [];
  const tracks = items.map((item) => item.track);
  const playlistName = playlistQuery.data?.items[0]?.name ?? 'Playlist';
  const page = itemsQuery.data
    ? summarizePage({ startIndex, limit: JELLYFIN_PAGE_SIZE }, itemsQuery.data.total, items.length)
    : null;

  const onRemoveError = () =>
    snackbar.enqueue({ message: "Couldn't remove that track — try again." });
  const onQueueMessage = (message: string) => snackbar.enqueue({ message });

  const removeItem = (playlistItemId: string) => {
    removeMutation.mutate(
      { playlistId, playlistItemIds: [playlistItemId] },
      { onError: onRemoveError },
    );
  };

  const playFrom = (clickedPlaylistItemId: string) => {
    const queueTracks: QueueTrack[] = tracks.map(toQueueTrack);
    const clickedIndex = items.findIndex((item) => item.playlistItemId === clickedPlaylistItemId);
    // Same fallback reasoning as `MusicAlbumPage.tsx`'s `playTrack`: `clickedIndex` always
    // matches a real `queueTracks` entry (built from this same `items` array, one-to-one),
    // this only guards a row clicked after a slow click races a removal out from under it.
    const startIndex = clickedIndex === -1 ? 0 : clickedIndex;
    const total = itemsQuery.data?.total ?? items.length;
    const { audioTracks, duration, startTrack } = beginMusicQueue(
      queueTracks,
      total,
      startIndex,
      (fetchStartIndex, limit) =>
        api
          .getJellyfinPlaylistItems(playlistId, { startIndex: fetchStartIndex, limit })
          .then((page) => page.items.map((entry) => toQueueTrack(entry.track))),
    );
    const item: LibraryItem = {
      id: playlistId,
      libraryId: '',
      coverPath: null,
      media: { kind: 'track', title: playlistName, author: null },
      progress: null,
    };
    const session: PlaybackSession = {
      id: `jellyfin-playlist-${playlistId}`,
      libraryItemId: playlistId,
      episodeId: null,
      mediaType: 'book',
      displayTitle: startTrack?.title ?? playlistName,
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
    <div className="auralis-page" data-testid="music-playlist-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 data-testid="music-playlist-name">{playlistName}</h1>
        <Button
          variant="text"
          size="sm"
          onClick={() => void navigate({ to: '/music/playlists' })}
          data-testid="music-playlist-back"
        >
          All playlists
        </Button>
      </div>

      {itemsQuery.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="rectangular" width="100%" height={56} />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        <p role="alert">Couldn't load this playlist: {itemsQuery.error.message}</p>
      ) : items.length === 0 ? (
        <p>This playlist is empty — add tracks from an album's track list.</p>
      ) : (
        <>
          <div
            data-testid="music-playlist-items"
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {items.map((item) => {
              const optimistic = isOptimisticPlaylistItem(item.playlistItemId);
              return (
                <TrackContextMenu
                  key={item.playlistItemId}
                  track={{
                    id: item.track.id,
                    name: item.track.name,
                    albumId: item.track.albumId,
                    // Always null here — see this file's own header for why a playlist has
                    // no single page-level artist id to borrow the way the album page does.
                    artistId: null,
                  }}
                  queueTrack={toQueueTrack(item.track)}
                  onMessage={onQueueMessage}
                  renderRow={(moreActionsButton) => (
                    <ListItem
                      data-testid={`music-playlist-item-${item.playlistItemId}`}
                      aria-label={`Play ${item.track.name}`}
                      onClick={() => playFrom(item.playlistItemId)}
                      headline={item.track.name}
                      supportingText={
                        [
                          item.track.artistNames.join(', '),
                          item.track.durationSeconds !== null
                            ? formatDuration(item.track.durationSeconds)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined
                      }
                      trailing={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <IconButton
                            aria-label={
                              optimistic
                                ? `${item.track.name} is still being added`
                                : `Remove ${item.track.name} from this playlist`
                            }
                            disabled={optimistic}
                            data-testid={`music-playlist-remove-${item.playlistItemId}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeItem(item.playlistItemId);
                            }}
                          >
                            <Icon name="close" />
                          </IconButton>
                          {moreActionsButton}
                        </div>
                      }
                    />
                  )}
                />
              );
            })}
          </div>

          {page ? (
            <div
              data-testid="music-playlist-tracks-pagination"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasPrevious}
                onClick={() => setStartIndex(page.previousStartIndex ?? 0)}
                data-testid="music-playlist-tracks-prev"
              >
                Previous
              </Button>
              <span>{page.rangeLabel}</span>
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasNext}
                onClick={() => setStartIndex(page.nextStartIndex ?? 0)}
                data-testid="music-playlist-tracks-next"
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
