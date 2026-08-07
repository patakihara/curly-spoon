/**
 * Holds the currently playing Jellyfin queue's `MusicQueueState` (`features/music/
 * musicQueue.ts`) — separate from `playerStore.ts` because it is a music-only concept with
 * no audiobook/podcast counterpart, and keeping it out of `playerStore` is what keeps that
 * file's diff (and its audiobook/podcast readers' mental model) unchanged by this wave. A
 * book or podcast session never touches this store at all: it stays `queue: null` for the
 * whole app lifetime outside of music playback, and nothing reads it unless it also checks
 * `playerStore`'s `currentItem.media.kind === 'track'` first (see `NowPlaying.tsx`) — so a
 * stale queue left over from a previous music session, while a book now plays, is inert by
 * construction rather than because anything actively clears it on an unrelated `load()`.
 *
 * `applyQueue` is the one place a new `MusicQueueState` gets turned into what the player
 * actually plays (`playerStore.setTracks`) — every mutation that can reorder or extend the
 * queue (`toggleShuffle` here, and `musicQueueController.ts`'s cross-page/repeat advance)
 * goes through it, so the two stores can't drift out of sync by one call site forgetting the
 * second write. `setRepeat` deliberately does *not* go through it: a repeat-mode change
 * never reorders `positions` (see `musicQueue.ts`'s `setRepeatMode`), so re-materializing and
 * handing the player a new `tracks` array for it would just be a same-content array-identity
 * churn for no behavioural gain.
 */
import { create } from 'zustand';
import { usePlayerStore } from './playerStore.js';
import {
  materialize,
  setRepeatMode,
  setShuffled,
  type MusicQueueState,
  type QueueTrack,
  type RepeatMode,
} from '../features/music/musicQueue.js';

/** Fetches more of this queue's source (an album or playlist) starting at `startIndex`, up
 *  to `limit` — the album/playlist-specific translation of "give me the rest", injected by
 *  whichever page started the queue (`MusicAlbumPage.tsx`/`MusicPlaylistPage.tsx`) so this
 *  store and `musicQueueController.ts` never need to know which BFF route to call. */
export type QueueFetcher = (startIndex: number, limit: number) => Promise<QueueTrack[]>;

interface MusicQueueStoreState {
  queue: MusicQueueState | null;
  fetcher: QueueFetcher | null;
  /** Installs a freshly started queue and how to fetch more of it (`musicQueueController.ts`'s
   *  `beginMusicQueue`), or a queue whose `advance` already produced a new state
   *  (`handleTrackEnded`, which passes `fetcher` as `undefined` to leave it as-is). `null`
   *  clears both — nothing in this wave calls it that way, but a future "stop this queue and
   *  return to browsing" affordance would. */
  setQueue: (queue: MusicQueueState | null, fetcher?: QueueFetcher | null) => void;
  toggleShuffle: () => void;
  setRepeat: (mode: RepeatMode) => void;
  /** Clears this queue only — `podcastQueueStore.ts`/`audiobookQueueStore.ts` are separate
   *  store instances and are never touched by this call (`docs/ROADMAP.md` §12f, requirement
   *  1: switching content types must never clear an unrelated queue). Added alongside those
   *  two stores' `createQueueStore.ts`-supplied `clearQueue` so all three content types have
   *  the same clearing affordance, without folding this store's own shuffle/repeat machinery
   *  into that shared factory. */
  clearQueue: () => void;
}

export const useMusicQueueStore = create<MusicQueueStoreState>((set, get) => ({
  queue: null,
  fetcher: null,

  setQueue: (queue, fetcher) => set({ queue, ...(fetcher !== undefined ? { fetcher } : {}) }),

  toggleShuffle: () => {
    const { queue } = get();
    if (!queue) return;
    applyQueue(setShuffled(queue, !queue.shuffled));
  },

  setRepeat: (mode) => {
    const { queue } = get();
    if (!queue) return;
    set({ queue: setRepeatMode(queue, mode) });
  },

  clearQueue: () => set({ queue: null, fetcher: null }),
}));

/** Writes a new `MusicQueueState` into this store *and* materializes it into `playerStore`'s
 *  `tracks`/`duration` — see this file's own header for why every reordering mutation must
 *  go through this one function rather than each call site doing both writes itself. */
export function applyQueue(queue: MusicQueueState): void {
  useMusicQueueStore.setState({ queue });
  const { audioTracks, duration } = materialize(queue);
  usePlayerStore.getState().setTracks(audioTracks, duration);
}
