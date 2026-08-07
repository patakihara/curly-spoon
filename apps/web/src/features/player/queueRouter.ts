/**
 * Fixes a real bug: `playerStore.load()` nulls `onTrackEnded` on *every* call (see that
 * field's own doc comment — deliberate, so a book/podcast session never inherits a stale
 * music-queue handler). But nothing re-attached the right handler when a queue's own item got
 * reloaded after something else had played in between: play a music queue, then a podcast
 * episode, then come back to the same album, and auto-advance was silently dead — `load()`
 * cleared `onTrackEnded` and nothing ever set it back to the music controller's.
 *
 * `attachQueueForCurrentItem` is the fix: given whatever `playerStore.currentItem` now is, it
 * re-attaches whichever content type's `ended` handler belongs to it. `installQueueRouter`
 * subscribes it to every `currentItem` change, so it's automatic after any `load()` — this
 * file, not `playerStore.load()` itself, is what stays free of feature imports (the store
 * would otherwise have to import three controllers, one per content type, breaking the layering
 * `playerStore.ts`'s own header describes).
 */
import { usePlayerStore } from '../../state/playerStore.js';
import type { LibraryItem } from '../../api/types.js';
import { attachMusicQueueEndedHandler } from '../music/musicQueueController.js';
import { attachPodcastQueueEndedHandler } from '../podcasts/podcastQueueController.js';
import { attachAudiobookQueueEndedHandler } from './audiobookQueueController.js';
import type { QueueContentType } from './queueEntries.js';

/** Maps `playerStore.currentItem.media.kind` (`api/types.ts`'s `MediaSummary.kind`) onto this
 *  wave's `QueueContentType` — the same discriminator `NowPlaying.tsx` already gates its
 *  shuffle/repeat controls on (`currentItem.media.kind === 'track'`), not a new one. `null`
 *  for no loaded item at all. */
export function queueContentTypeOf(item: LibraryItem | null): QueueContentType | null {
  if (!item) return null;
  switch (item.media.kind) {
    case 'track':
      return 'music';
    case 'podcast':
      return 'podcast';
    case 'book':
      return 'audiobook';
  }
}

/** Re-attaches the `ended` handler belonging to whichever content type is now loaded.
 *  Idempotent — each attach call just overwrites `playerStore.onTrackEnded` with the same kind
 *  of closure again — so it's safe to call on every load, including a load of the same
 *  content type back to back. Returns the type it attached, or `null` if nothing is loaded. */
export function attachQueueForCurrentItem(): QueueContentType | null {
  const type = queueContentTypeOf(usePlayerStore.getState().currentItem);
  switch (type) {
    case 'music':
      attachMusicQueueEndedHandler();
      return 'music';
    case 'podcast':
      attachPodcastQueueEndedHandler();
      return 'podcast';
    case 'audiobook':
      attachAudiobookQueueEndedHandler();
      return 'audiobook';
    case null:
      return null;
  }
}

let unsubscribe: (() => void) | null = null;
let lastItem: LibraryItem | null = null;

/** Subscribes `attachQueueForCurrentItem` to every `playerStore.currentItem` change. Call once
 *  from wherever the app already installs playback side effects (alongside `useProgressSync`'s
 *  own wiring) — not from `playerStore.load()` itself, per this file's header. Idempotent: a
 *  second call is a no-op rather than a second subscription. */
export function installQueueRouter(): void {
  if (unsubscribe) return;
  lastItem = usePlayerStore.getState().currentItem;
  unsubscribe = usePlayerStore.subscribe((state) => {
    if (state.currentItem === lastItem) return;
    lastItem = state.currentItem;
    attachQueueForCurrentItem();
  });
}

/** Test-only escape hatch: `installQueueRouter`'s module-level guard means a second call in a
 *  later test would otherwise silently do nothing, leaking a subscription on `playerStore`
 *  (a module-level singleton store) across tests that each want their own. Not used by
 *  production code. */
export function resetQueueRouterForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  lastItem = null;
}
