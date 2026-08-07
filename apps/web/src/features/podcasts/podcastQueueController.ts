/**
 * Wires `state/podcastQueueStore.ts`'s pure queue model into the running player, mirroring
 * `features/music/musicQueueController.ts`'s shape: `handlePodcastQueueEnded` is what runs
 * when the loaded episode's `ended` event fires, and `attachPodcastQueueEndedHandler` installs
 * it onto `playerStore.onTrackEnded`.
 *
 * Unlike a music queue — whose entries are already-materialized `AudioTrack`s the player can
 * seek straight to — a queued podcast episode is a different library item's episode that has
 * never been fetched. Advancing the queue therefore needs a real network round trip (start a
 * new Audiobookshelf playback session for the next episode), which this controller can't do
 * itself: it has no `ApiClient`. That fetch is injected as `PodcastEpisodeLoader`, set once by
 * whichever page wires real playback (a later UI wave) via `setPodcastEpisodeLoader` — tests
 * inject a fake loader the same way. This mirrors how `musicQueueController.ts`'s own
 * `QueueFetcher` is injected per-queue via `musicQueueStore.ts`'s `fetcher` field; the
 * difference is that a podcast queue's loader doesn't vary per-queue (there is exactly one way
 * to "play this episode" for the whole app), so it lives as controller-module state instead of
 * per-queue store state.
 */
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { usePodcastQueueStore } from '../../state/podcastQueueStore.js';
import type { PlaybackSource } from '../player/playbackSource.js';
import type { PodcastQueueEntry } from '../player/queueEntries.js';

/** Fetches and starts an Audiobookshelf playback session for a queued episode — the
 *  podcast-queue analogue of `PodcastDetailPage.tsx`'s own `handlePlayEpisode`. */
export type PodcastEpisodeLoader = (entry: PodcastQueueEntry) => Promise<{
  item: LibraryItem;
  session: PlaybackSession;
  source: PlaybackSource;
}>;

let episodeLoader: PodcastEpisodeLoader | null = null;

/** Injects how to actually load a queued episode. `null` (the default) makes
 *  `handlePodcastQueueEnded` degrade to "pause" rather than throw — the same "not wired yet"
 *  degrade `attachMusicQueueEndedHandler`'s own defensive test exercises for a missing queue. */
export function setPodcastEpisodeLoader(loader: PodcastEpisodeLoader | null): void {
  episodeLoader = loader;
}

/** Call once, right after `playerStore.load()` for a podcast episode (and typically right
 *  before `play()`) — same ordering requirement as `attachMusicQueueEndedHandler`, since
 *  `load()` always resets `onTrackEnded` to `null` (see that field's own doc comment). */
export function attachPodcastQueueEndedHandler(): void {
  usePlayerStore.getState().setOnTrackEnded(() => {
    void handlePodcastQueueEnded();
  });
}

export async function handlePodcastQueueEnded(): Promise<void> {
  const entry = usePodcastQueueStore.getState().advance();
  if (!entry || !episodeLoader) {
    // No next entry (queue exhausted or nothing queued at all), or nothing installed to load
    // one with. Degrade exactly as the built-in "no next track" case does: stop rather than
    // leave `isPlaying` lying about silence.
    usePlayerStore.getState().pause();
    return;
  }
  try {
    const { item, session, source } = await episodeLoader(entry);
    usePlayerStore.getState().load(item, session, source);
    usePlayerStore.getState().play();
  } catch {
    // A network error mid-advance degrades to "stop" rather than retrying indefinitely against
    // a source that has already failed once — same policy as `musicQueueController.ts`'s
    // `resolveAdvance`.
    usePlayerStore.getState().pause();
  }
}
