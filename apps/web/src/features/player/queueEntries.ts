/**
 * The entry shapes for the two "simple" per-content-type queues (`state/podcastQueueStore.ts`,
 * `state/audiobookQueueStore.ts`, both `createQueueStore.ts` instances) — kept out of
 * `api/types.ts` deliberately: these describe *client-side queue membership*, not anything the
 * BFF returns, and `api/types.ts` is owned by another agent this hour (see this wave's spec).
 */
import type { PodcastEpisode } from '../../api/types.js';

/** One queued podcast episode. `podcastTitle` is carried alongside `itemId` (the podcast's own
 *  library item id) rather than looked up again at play time, purely for display in a future
 *  queue-list UI — this wave adds no such UI, but the field costs nothing to carry now and
 *  saves a second fetch later. */
export interface PodcastQueueEntry {
  itemId: string;
  episodeId: string;
  title: string;
  podcastTitle: string | null;
}

/** `PodcastEpisode` (an item's own `media.episodes` entry, `api/types.ts`) already has
 *  everything a queue entry needs but the podcast's own title, which the caller (already
 *  holding the podcast `LibraryItem`) supplies separately. */
export function toPodcastQueueEntry(
  episode: PodcastEpisode,
  itemId: string,
  podcastTitle: string | null,
): PodcastQueueEntry {
  return { itemId, episodeId: episode.id, title: episode.title, podcastTitle };
}

/**
 * A whole book, or one chapter of one. A chapter has no URL of its own (`api/types.ts`'s
 * `Chapter` is a `{ start, end, title }` marker within a book's single timeline, not a
 * separate playable file) — so a chapter entry resolves to "load the book, then seek to
 * `start`" (`audiobookQueueController.ts`'s `handleAudiobookQueueEnded`), never to a direct
 * fetch of its own.
 */
export type AudiobookQueueEntry =
  | { kind: 'item'; itemId: string; title: string }
  | {
      kind: 'chapter';
      itemId: string;
      chapterId: string;
      title: string;
      bookTitle: string;
      start: number;
    };

export type QueueContentType = 'music' | 'podcast' | 'audiobook';
