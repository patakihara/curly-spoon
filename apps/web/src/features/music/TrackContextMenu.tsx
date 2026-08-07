/**
 * Wraps a song row with the long-press/right-click context menu from `docs/ROADMAP.md` §12e:
 * Play next, Play last, Go to album, Go to artist. `Menu`/`MenuTarget` (`@auralis/ui`) do the
 * actual right-click/long-press/keyboard mechanics (see `Menu.tsx`'s own doc comment); this
 * component supplies the track-specific menu items and their effects — queueing and
 * navigation — and nothing else.
 *
 * `renderRow` is a render prop rather than a plain `children` row, because the visible "more
 * actions" trigger button (`MenuTarget`'s child — what makes this menu openable by click or
 * keyboard, not just right-click/long-press) has to live *inside* that row's own trailing
 * slot, alongside whatever other per-row controls the caller already renders there
 * (`AddToPlaylistButton`, `FavoriteToggle`) — this component doesn't know that row's layout,
 * so it hands the trigger element back for the caller to place.
 *
 * **Play next/Play last only act on an already-playing music queue.** `applyQueue`
 * (`state/musicQueueStore.ts`) always calls `playerStore.setTracks`, which would clobber
 * whatever's currently loaded — including a *book or podcast*, since `usePlayerStore` has no
 * concept of "this load is music-only". `useMusicQueueStore`'s own header guarantees `queue`
 * stays `null` for the entire time anything other than music is playing (or nothing is), so
 * `queue === null` here means either "nothing is playing" or "something non-music is playing"
 * — this component can't and doesn't need to tell those apart: either way there is nothing
 * safe to enqueue into, so it reports the failure through `onError` rather than starting a
 * fresh one-track queue (which would have to guess at "is anything else about to be
 * interrupted" and risks silently stopping a book mid-chapter). A session picking up 12f (the
 * queue-model wave) may want to revisit this once there's a `playerStore`-level concept of
 * "safe to take over" — not decided here.
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Icon, IconButton, Menu, MenuTarget } from '@auralis/ui';
import { applyQueue, useMusicQueueStore } from '../../state/musicQueueStore.js';
import { insertTrackLast, insertTrackNext, type QueueTrack } from './musicQueue.js';
import { buildTrackMenuItems } from './trackContextMenu.js';

export interface TrackContextMenuTrack {
  id: string;
  name: string;
  albumId: string | null;
  /** See `trackContextMenu.ts`'s own `TrackMenuContext` doc comment — `JellyfinTrack` never
   *  carries this; a caller with one from elsewhere (e.g. the album it's rendering) passes it
   *  through, everyone else passes `null` and "Go to artist" is simply absent. */
  artistId: string | null;
}

export interface TrackContextMenuProps {
  track: TrackContextMenuTrack;
  /** Already built via `toQueueTrack` — what "Play next"/"Play last" insert. */
  queueTrack: QueueTrack;
  /** A snackbar-style one-line message — the failure case ("nothing is playing") and the
   *  success case (confirming what was queued and where) both go through this, matching
   *  `AddToPlaylistButton`'s `onAdded`/`onError` pair collapsed into one callback since both
   *  results here are equally "tell the user what happened", never a blocking dialog. The
   *  success confirmation is also this feature's only user-visible, Playwright-observable
   *  proof that "Play next"/"Play last" actually ran — there's no queue-order view yet
   *  (`docs/HANDOVER.md`'s wave 12f) and this app's e2e fixture audio never really plays (see
   *  `music-queue.spec.ts`'s own header), so a real reorder can't be watched end to end in the
   *  browser. The reordering itself — that "next" lands immediately after the current track
   *  and "last" lands after everything else, correctly under shuffle — is proven instead by
   *  `musicQueue.test.ts`'s `insertTrackNext`/`insertTrackLast` unit tests. */
  onMessage: (message: string) => void;
  /** Receives the "more actions" trigger to place inside the row's own trailing slot; must
   *  return exactly one element (this wraps it for right-click/long-press). */
  renderRow: (moreActionsButton: ReactNode) => ReactNode;
}

export function TrackContextMenu({
  track,
  queueTrack,
  onMessage,
  renderRow,
}: TrackContextMenuProps) {
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();

  const enqueue = (position: 'next' | 'last') => {
    const { queue } = useMusicQueueStore.getState();
    if (!queue) {
      onMessage(
        `Nothing is playing — play a track before adding "${queueTrack.title}" to the queue.`,
      );
      return;
    }
    applyQueue(
      position === 'next' ? insertTrackNext(queue, queueTrack) : insertTrackLast(queue, queueTrack),
    );
    onMessage(`Added "${queueTrack.title}" to play ${position}.`);
  };

  const items = buildTrackMenuItems(
    { albumId: track.albumId, artistId: track.artistId },
    {
      playNext: () => enqueue('next'),
      playLast: () => enqueue('last'),
      goToAlbum: (albumId) => void navigate({ to: '/music/album/$albumId', params: { albumId } }),
      goToArtist: (artistId) =>
        void navigate({ to: '/music/artist/$artistId', params: { artistId } }),
    },
  );

  const moreButton = (
    <MenuTarget>
      <IconButton
        aria-label={`More actions for ${track.name}`}
        data-testid={`music-track-menu-trigger-${track.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <Icon name="more_vert" />
      </IconButton>
    </MenuTarget>
  );

  return (
    <Menu
      opened={opened}
      onOpenChange={setOpened}
      items={items}
      aria-label={`Actions for ${track.name}`}
    >
      {renderRow(moreButton)}
    </Menu>
  );
}
