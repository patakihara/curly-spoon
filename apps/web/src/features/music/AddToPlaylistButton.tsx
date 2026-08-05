/**
 * "Add to a playlist" trigger, shared by every place this wave adds one: an album's own
 * header (adds the whole currently-loaded page of tracks, in order) and each of its track
 * rows (adds just that one track) — see `MusicAlbumPage.tsx`. Opens a `Dialog` listing the
 * user's existing playlists plus an inline "new playlist" name field, so creating a
 * playlist *while* adding to it (this wave's spec: "create a new playlist in that flow")
 * is one dialog, not a separate page-and-back-again round trip.
 *
 * Deliberately not added to `packages/ui` — same reasoning as `FavoriteToggle.tsx`: the
 * mutation calls here are this app's own API layer, not a design-system concern.
 *
 * Picking an existing playlist uses `useAddToJellyfinPlaylistMutation` (optimistic, see
 * that hook's doc comment); creating a new one seeds it with `tracks` directly via
 * `createJellyfinPlaylist`'s own `itemIds` parameter, in one request — no separate
 * add-after-create call needed.
 */
import { useState, type FormEvent } from 'react';
import { Button, Dialog, Icon, IconButton, ListItem } from '@auralis/ui';
import type { JellyfinTrack } from '../../api/types.js';
import {
  useAddToJellyfinPlaylistMutation,
  useCreateJellyfinPlaylistMutation,
  useJellyfinPlaylistsQuery,
} from '../../api/queries.js';

export interface AddToPlaylistButtonProps {
  /** The track(s) to add, in the order they should land in the playlist — a single track
   * for a track row, or a whole page's worth for an album header. */
  tracks: JellyfinTrack[];
  /** Used only to build accessible names ("Add Roygbiv to a playlist") and the dialog's own
   * title — never rendered as a heading elsewhere. */
  label: string;
  onError?: () => void;
  onAdded?: () => void;
  /** See `FavoriteToggle`'s identical prop for why this defaults to `true`: every current
   * call site nests this inside another clickable row or card. */
  stopPropagation?: boolean;
  'data-testid'?: string;
}

export function AddToPlaylistButton({
  tracks,
  label,
  onError,
  onAdded,
  stopPropagation = true,
  'data-testid': testId,
}: AddToPlaylistButtonProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const playlistsQuery = useJellyfinPlaylistsQuery();
  const addMutation = useAddToJellyfinPlaylistMutation();
  const createMutation = useCreateJellyfinPlaylistMutation();

  const close = () => {
    setOpen(false);
    setNewName('');
  };

  const addToExisting = (playlistId: string) => {
    addMutation.mutate(
      { playlistId, tracks },
      {
        onSuccess: () => {
          onAdded?.();
          close();
        },
        onError: () => onError?.(),
      },
    );
  };

  const createAndAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(
      { name, itemIds: tracks.map((track) => track.id) },
      {
        onSuccess: () => {
          onAdded?.();
          close();
        },
        onError: () => onError?.(),
      },
    );
  };

  const playlists = playlistsQuery.data?.items ?? [];

  return (
    <>
      <IconButton
        aria-label={`Add ${label} to a playlist`}
        aria-haspopup="dialog"
        data-testid={testId}
        disabled={tracks.length === 0}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="add" />
      </IconButton>
      <Dialog open={open} onOpenChange={setOpen} title={`Add "${label}" to a playlist`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {playlistsQuery.isLoading ? (
            <p>Loading playlists…</p>
          ) : playlistsQuery.isError ? (
            <p role="alert">Couldn't load your playlists.</p>
          ) : playlists.length === 0 ? (
            <p>No playlists yet — create one below.</p>
          ) : (
            <div
              data-testid="add-to-playlist-options"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              {playlists.map((playlist) => (
                <ListItem
                  key={playlist.id}
                  aria-label={`Add ${label} to ${playlist.name}`}
                  onClick={() => addToExisting(playlist.id)}
                  headline={playlist.name}
                  supportingText={
                    playlist.trackCount !== null
                      ? `${playlist.trackCount} ${playlist.trackCount === 1 ? 'track' : 'tracks'}`
                      : undefined
                  }
                  data-testid={`add-to-playlist-option-${playlist.id}`}
                />
              ))}
            </div>
          )}

          <form onSubmit={createAndAdd} data-testid="add-to-playlist-create-form">
            <label className="auralis-field" htmlFor="add-to-playlist-new-name">
              <span className="auralis-field__label">New playlist</span>
              <input
                id="add-to-playlist-new-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Playlist name"
                data-testid="add-to-playlist-new-name-input"
              />
            </label>
            <Button
              type="submit"
              variant="outlined"
              size="sm"
              disabled={newName.trim().length === 0 || createMutation.isPending}
              data-testid="add-to-playlist-create-submit"
            >
              Create &amp; add
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
