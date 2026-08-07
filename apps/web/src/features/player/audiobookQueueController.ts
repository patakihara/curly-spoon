/**
 * Wires `state/audiobookQueueStore.ts`'s pure queue model into the running player, mirroring
 * `features/music/musicQueueController.ts`'s shape — see `features/podcasts/
 * podcastQueueController.ts`'s header for why an injected loader (`AudiobookLoader`) is needed
 * here at all, rather than reusing this queue's advance the way a music queue's already-
 * materialized `AudioTrack`s can.
 *
 * The one thing this controller does that neither sibling does: an `AudiobookQueueEntry` of
 * `kind: 'chapter'` whose book (`entry.itemId`) is *already* the loaded item must **seek**
 * (`playerStore.seek`) rather than reload. Reloading would call `playerStore.load()` again,
 * which starts a brand-new Audiobookshelf playback session — and per `features/player/
 * progressSync.ts`'s own doc comment, `timeListened` is wall-clock time spent playing, folded
 * into the *session's* permanent listening stats on close. A same-book chapter jump isn't a
 * new listening session, it's a scrub within the one already open; reloading would close that
 * session mid-book and open a second one at the chapter marker, corrupting the stats the first
 * session should have kept accumulating. A chapter entry for a *different* book (or an `'item'`
 * entry) has no open session to protect, so it loads normally.
 */
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { useAudiobookQueueStore } from '../../state/audiobookQueueStore.js';
import type { PlaybackSource } from './playbackSource.js';

/** Fetches and starts an Audiobookshelf playback session for a queued book. */
export type AudiobookLoader = (itemId: string) => Promise<{
  item: LibraryItem;
  session: PlaybackSession;
  source: PlaybackSource;
}>;

let bookLoader: AudiobookLoader | null = null;

/** Injects how to actually load a queued book. `null` (the default) makes
 *  `handleAudiobookQueueEnded` degrade to "pause" for anything that needs a fresh load — the
 *  same "not wired yet" degrade `podcastQueueController.ts`'s `setPodcastEpisodeLoader` uses. */
export function setAudiobookLoader(loader: AudiobookLoader | null): void {
  bookLoader = loader;
}

/** Call once, right after `playerStore.load()` for a book (and typically right before
 *  `play()`) — same ordering requirement as `attachMusicQueueEndedHandler`. */
export function attachAudiobookQueueEndedHandler(): void {
  usePlayerStore.getState().setOnTrackEnded(() => {
    void handleAudiobookQueueEnded();
  });
}

export async function handleAudiobookQueueEnded(): Promise<void> {
  const entry = useAudiobookQueueStore.getState().advance();
  if (!entry) {
    usePlayerStore.getState().pause();
    return;
  }
  if (entry.kind === 'chapter' && usePlayerStore.getState().currentItem?.id === entry.itemId) {
    // Already-open session, same book — seek within it. See this file's header for why a
    // reload here would be wrong, not just wasteful.
    usePlayerStore.getState().seek(entry.start);
    usePlayerStore.getState().play();
    return;
  }
  if (!bookLoader) {
    usePlayerStore.getState().pause();
    return;
  }
  try {
    const { item, session, source } = await bookLoader(entry.itemId);
    usePlayerStore.getState().load(item, session, source);
    if (entry.kind === 'chapter') usePlayerStore.getState().seek(entry.start);
    usePlayerStore.getState().play();
  } catch {
    usePlayerStore.getState().pause();
  }
}
