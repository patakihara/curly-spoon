/**
 * The podcast queue — one `createQueueStore.ts` instance, holding `PodcastQueueEntry` (
 * `features/player/queueEntries.ts`). Deliberately its own store rather than shared with
 * `audiobookQueueStore.ts` or `musicQueueStore.ts` (`docs/ROADMAP.md` §12f, requirement 1):
 * switching from a podcast to a song and back must not clear this queue, which a shared store
 * keyed by "the current queue" could not guarantee.
 */
import { createQueueStore } from './createQueueStore.js';
import type { PodcastQueueEntry } from '../features/player/queueEntries.js';

export const usePodcastQueueStore = createQueueStore<PodcastQueueEntry>();
