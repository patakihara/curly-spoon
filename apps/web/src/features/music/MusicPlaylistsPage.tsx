/**
 * Playlist listing (`/music/playlists`) — a flat sibling of `/music/favorites`, same
 * reasoning as that page's own doc comment: a fourth concern doesn't belong bolted onto
 * `MusicHomePage`, and this app already gives every other music concern its own page.
 * Reached from a "Playlists" link on `MusicHomePage`, mirroring the existing "Favourites"
 * link right next to it.
 *
 * The "New playlist" dialog here creates an *empty* playlist (no seed tracks) — adding
 * tracks while creating happens instead from wherever a track already is
 * (`AddToPlaylistButton`, used on `MusicAlbumPage`'s header and rows), which is where a
 * user already has something to add. This page's own create flow exists for the "start an
 * empty playlist and fill it in later" path, which `AddToPlaylistButton` alone can't reach
 * from here — there's no track in scope on this page to seed it with.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Card, Dialog, Icon, Skeleton } from '@auralis/ui';
import { useCreateJellyfinPlaylistMutation, useJellyfinPlaylistsQuery } from '../../api/queries.js';
import { summarizePage } from './pagination.js';

export function MusicPlaylistsPage() {
  const navigate = useNavigate();
  const [startIndex, setStartIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const playlistsQuery = useJellyfinPlaylistsQuery(startIndex);
  const createMutation = useCreateJellyfinPlaylistMutation();

  const playlists = playlistsQuery.data?.items ?? [];
  const page = playlistsQuery.data
    ? summarizePage({ startIndex, limit: 40 }, playlistsQuery.data.total, playlists.length)
    : null;

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: (result) => {
          setCreateOpen(false);
          setName('');
          void navigate({ to: '/music/playlist/$playlistId', params: { playlistId: result.id } });
        },
      },
    );
  };

  return (
    <div className="auralis-page" data-testid="music-playlists-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Playlists</h1>
        <Button
          variant="filled"
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="music-playlists-create"
        >
          <Icon name="add" /> New playlist
        </Button>
      </div>

      {playlistsQuery.isLoading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={180} />
          ))}
        </div>
      ) : playlistsQuery.isError ? (
        <p role="alert">Couldn't load your playlists.</p>
      ) : playlists.length === 0 ? (
        <p>No playlists yet — create one to get started.</p>
      ) : (
        <>
          <div className="auralis-card-grid" data-testid="music-playlist-cards">
            {playlists.map((playlist) => (
              <Card
                key={playlist.id}
                interactive
                variant="elevated"
                data-testid={`music-playlist-${playlist.id}`}
                onClick={() =>
                  void navigate({
                    to: '/music/playlist/$playlistId',
                    params: { playlistId: playlist.id },
                  })
                }
              >
                <h3>{playlist.name}</h3>
                {playlist.trackCount !== null ? (
                  <p>
                    {playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>

          {page ? (
            <div
              data-testid="music-playlists-pagination"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasPrevious}
                onClick={() => setStartIndex(page.previousStartIndex ?? 0)}
                data-testid="music-playlists-prev"
              >
                Previous
              </Button>
              <span>{page.rangeLabel}</span>
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasNext}
                onClick={() => setStartIndex(page.nextStartIndex ?? 0)}
                data-testid="music-playlists-next"
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="New playlist">
        <form onSubmit={submitCreate} data-testid="music-playlists-create-form">
          <label className="auralis-field" htmlFor="music-playlists-create-name">
            <span className="auralis-field__label">Name</span>
            <input
              id="music-playlists-create-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Playlist name"
              autoFocus
              data-testid="music-playlists-create-name-input"
            />
          </label>
          <Button
            type="submit"
            variant="filled"
            size="sm"
            disabled={name.trim().length === 0 || createMutation.isPending}
            data-testid="music-playlists-create-submit"
          >
            Create
          </Button>
        </form>
        {createMutation.isError ? (
          <p role="alert">Couldn't create the playlist — try again.</p>
        ) : null}
      </Dialog>
    </div>
  );
}
