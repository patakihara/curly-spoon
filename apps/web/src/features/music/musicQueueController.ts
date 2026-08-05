/**
 * Wires `musicQueue.ts`'s pure queue model into the running player: what
 * `MusicAlbumPage.tsx`/`MusicPlaylistPage.tsx` call to start a queue (`beginMusicQueue`,
 * `attachMusicQueueEndedHandler`), and what actually runs when a track's native `ended`
 * event fires for one (`handleTrackEnded`, installed onto `playerStore.onTrackEnded` — see
 * that field's own doc comment for why a book/podcast session never runs any of this).
 *
 * This is the one place shuffle/repeat/cross-page policy touches the player at all. Once
 * `beginMusicQueue` hands the starting page's `AudioTrack[]` back to its caller, the caller
 * builds a normal `PlaybackSession` and calls `playerStore.load()` exactly as before this
 * wave — nothing about *starting* a queue changed. What's new is what happens when a loaded
 * track ends: instead of `useAudioElement.ts`'s built-in "next `AudioTrack` in the array, or
 * pause", `handleTrackEnded` asks `musicQueue.ts`'s `advance` what comes next, fetches more
 * of the queue if `advance` says there's more upstream than is loaded, and either way ends
 * by calling `playerStore.setTracks` (never `load()` — a mid-queue advance must not reset
 * `currentTime`/`isPlaying`/bookmarks) and `playerStore.seek()` to the new current track's
 * start. `useAudioElement.ts`'s own effects pick that `currentTime` change up exactly as
 * they would any other seek, including restarting the `<audio>` element — see that file's
 * "Resumes whenever..." comment for the mechanism that makes a same-track restart
 * (repeat-one) work despite no `src` change at all.
 */
import type { AudioTrack } from '../../api/types.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { applyQueue, useMusicQueueStore, type QueueFetcher } from '../../state/musicQueueStore.js';
import {
  advance,
  appendTracks,
  createQueue,
  materialize,
  type MusicQueueState,
  type QueueTrack,
} from './musicQueue.js';

export type { QueueFetcher };

/**
 * Starts a new queue from the caller's currently loaded page of tracks: `startIndex` is the
 * clicked row's index within `tracks`, `total` is the source's real upstream count (its
 * `JellyfinLibraryPage.total`), and `fetchMore` is how to fetch the rest of it, should
 * playback ever advance past what's already loaded — see `QueueFetcher`'s own doc comment.
 *
 * Returns exactly what the caller needs to build a `PlaybackSession` and call
 * `playerStore.load()` itself, same shape as the old `queue.ts`'s `albumQueue` this
 * replaces at both call sites: the full materialized `AudioTrack[]`, its `duration`, and the
 * `AudioTrack` the clicked row actually starts at (`startTrack`, `undefined` only for an
 * empty `tracks` — mirrors `albumQueue`'s own "empty in, empty out" degrade).
 *
 * Does *not* touch `playerStore` — `onTrackEnded` is still whatever the previous session left
 * it as until the caller calls `attachMusicQueueEndedHandler()`, which must happen *after*
 * `load()` (an every-load reset of `onTrackEnded` — see that field's doc comment — would
 * otherwise immediately undo an attach made before it).
 */
export function beginMusicQueue(
  tracks: QueueTrack[],
  total: number,
  startIndex: number,
  fetchMore: QueueFetcher,
): { audioTracks: AudioTrack[]; duration: number; startTrack: AudioTrack | undefined } {
  const state = createQueue(tracks, total, startIndex);
  useMusicQueueStore.getState().setQueue(state, fetchMore);
  const { audioTracks, duration } = materialize(state);
  return { audioTracks, duration, startTrack: audioTracks[state.cursor] };
}

/** Call once, right after `playerStore.load()` (and typically right before `play()`) — see
 *  `beginMusicQueue`'s own doc comment for why the ordering matters. */
export function attachMusicQueueEndedHandler(): void {
  usePlayerStore.getState().setOnTrackEnded(() => {
    void handleTrackEnded();
  });
}

async function handleTrackEnded(): Promise<void> {
  const { queue, fetcher } = useMusicQueueStore.getState();
  if (!queue || !fetcher) {
    // No active queue (shouldn't happen while `onTrackEnded` is attached — see this file's
    // header) or nothing to fetch more with. Degrade exactly as the built-in "no next track"
    // case does: stop rather than leave `isPlaying` lying about silence.
    usePlayerStore.getState().pause();
    return;
  }
  const settled = await resolveAdvance(queue, fetcher);
  if (!settled) {
    usePlayerStore.getState().pause();
    return;
  }
  applyQueue(settled.state);
  usePlayerStore.getState().seek(settled.startOffset);
}

/**
 * Runs `advance` and, when it asks for more of the queue than is loaded, fetches exactly the
 * missing tail once and retries — never loops. A `fetcher` that still can't produce enough
 * after one call (a short upstream page, a network error swallowed here) degrades to
 * "nothing more to play" rather than retrying indefinitely against a source that has already
 * said no.
 */
async function resolveAdvance(
  queue: MusicQueueState,
  fetcher: QueueFetcher,
): Promise<{ state: MusicQueueState; startOffset: number } | null> {
  let result = advance(queue);
  if (result.kind === 'needsFetch') {
    const startIndex = queue.order.length;
    const remaining = queue.total - startIndex;
    if (remaining <= 0) return null; // `total` disagreed with `advance`'s own check — degrade.
    try {
      const more = await fetcher(startIndex, remaining);
      const appended = appendTracks(queue, more);
      useMusicQueueStore.getState().setQueue(appended);
      result = advance(appended);
    } catch {
      return null;
    }
  }
  if (result.kind !== 'track') return null;
  const { audioTracks } = materialize(result.state);
  return { state: result.state, startOffset: audioTracks[result.state.cursor]?.startOffset ?? 0 };
}
