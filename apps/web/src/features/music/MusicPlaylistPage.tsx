/**
 * One playlist's tracks (`/music/playlist/$playlistId`), in playlist order — never
 * re-sorted, see `JellyfinPlaylistItem`'s doc comment (`api/types.ts`) and
 * `useJellyfinPlaylistItemsQuery`'s. The album page (`MusicAlbumPage.tsx`) hit exactly this
 * bug once already (relying on an upstream default sort that turned out to be alphabetical
 * by title) — this page never asks the BFF to sort at all, it just renders what
 * `GET /jellyfin/playlists/:id/items` hands back.
 *
 * Clicking a row plays the whole currently-loaded list as one queue, starting at that row —
 * same mechanism as `MusicAlbumPage.tsx`: `features/music/queue.ts`'s `albumQueue` (reused
 * unchanged; it only ever needed a `JellyfinTrack[]`, and `items.map(i => i.track)` is
 * exactly that) lays every track out end to end on one cumulative timeline through
 * `jellyfinSource`. No second queueing mechanism was built for playlists — see this wave's
 * own report for confirmation this reuse was clean, not a near-miss.
 *
 * A row still marked `isOptimisticPlaylistItem` (added but not yet confirmed by the server —
 * see `playlists.ts`) has its remove control disabled: Jellyfin has never heard of a
 * client-only id, so removing by it would either no-op or error depending on how the BFF's
 * `entryIds` filter handles an unknown value, neither of which is worth surfacing to a user
 * who just clicked "add".
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { Button, IconButton, Icon, ListItem, Skeleton, Snackbar, useSnackbar } from '@auralis/ui';
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import { useApi } from '../../api/ApiContext.js';
import {
  useJellyfinPlaylistItemsQuery,
  useJellyfinPlaylistQuery,
  useRemoveFromJellyfinPlaylistMutation,
} from '../../api/queries.js';
import { jellyfinSource } from '../player/playbackSource.js';
import { formatDuration } from '../player/playback.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { isOptimisticPlaylistItem } from './playlists.js';
import { albumQueue } from './queue.js';

export function MusicPlaylistPage() {
  const { playlistId } = useParams({ from: '/music/playlist/$playlistId' });
  const navigate = useNavigate();
  const api = useApi();
  const snackbar = useSnackbar();

  const itemsQuery = useJellyfinPlaylistItemsQuery(playlistId);
  const playlistQuery = useJellyfinPlaylistQuery(playlistId);
  const removeMutation = useRemoveFromJellyfinPlaylistMutation();

  const items = itemsQuery.data?.items ?? [];
  const tracks = items.map((item) => item.track);
  const playlistName = playlistQuery.data?.items[0]?.name ?? 'Playlist';

  const onRemoveError = () =>
    snackbar.enqueue({ message: "Couldn't remove that track — try again." });

  const removeItem = (playlistItemId: string) => {
    removeMutation.mutate(
      { playlistId, playlistItemIds: [playlistItemId] },
      { onError: onRemoveError },
    );
  };

  const playFrom = (clickedPlaylistItemId: string) => {
    const queue = albumQueue(tracks);
    const clickedIndex = items.findIndex((item) => item.playlistItemId === clickedPlaylistItemId);
    // Same fallback reasoning as `MusicAlbumPage.tsx`'s `playTrack`: `clickedIndex` always
    // matches a real `audioTracks` entry (built from this same `items` array, one-to-one),
    // this only guards a row clicked after a slow click races a removal out from under it.
    const startTrack = queue.audioTracks[clickedIndex] ?? queue.audioTracks[0];
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
      duration: queue.duration,
      currentTime: startTrack?.startOffset ?? 0,
      audioTracks: queue.audioTracks,
      chapters: [],
    };
    usePlayerStore.getState().load(item, session, jellyfinSource(api, queue.audioTracks));
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
        <div
          data-testid="music-playlist-items"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {items.map((item) => {
            const optimistic = isOptimisticPlaylistItem(item.playlistItemId);
            return (
              <ListItem
                key={item.playlistItemId}
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
                }
              />
            );
          })}
        </div>
      )}
      <Snackbar snackbar={snackbar.current} onDismiss={snackbar.dismiss} />
    </div>
  );
}
