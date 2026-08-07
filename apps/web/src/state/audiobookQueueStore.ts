/**
 * The audiobook queue — one `createQueueStore.ts` instance, holding `AudiobookQueueEntry`
 * (`features/player/queueEntries.ts`), which is why a chapter is queueable at all
 * (`docs/ROADMAP.md` §12f, requirement 3): the entry type itself, not just this store, is what
 * makes a chapter a valid queue member alongside a whole book. See `podcastQueueStore.ts`'s
 * header for why this is its own store rather than shared with the other two content types.
 */
import { createQueueStore } from './createQueueStore.js';
import type { AudiobookQueueEntry } from '../features/player/queueEntries.js';

export const useAudiobookQueueStore = createQueueStore<AudiobookQueueEntry>();
