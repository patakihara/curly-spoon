/**
 * Per-episode listening state for the podcast detail view's episode list.
 *
 * Audiobookshelf tracks progress per (item, episode) pair, not per episode alone
 * — the BFF's `GET /me/progress` (`apps/server/src/routes/progress.ts`) returns
 * every `MediaProgress` record for the signed-in user across every item, books
 * included (a book's record has `episodeId: null`). `findEpisodeProgress` is the
 * total lookup that turns that flat list into "the one record for this episode,
 * if any" without ever accidentally matching a book's item-level record against
 * an episode id.
 */
import type { MediaProgress } from '../../api/types.js';

export type EpisodeProgressState = 'unplayed' | 'in-progress' | 'played';

/**
 * No record at all, or a record with nothing played yet, both read as
 * "unplayed" — a listener has no reason to distinguish "never opened" from
 * "opened, never pressed play" in the episode list. `isFinished` wins over a
 * stale `currentTime` (e.g. a finished episode whose position was later reset).
 */
export function episodeProgressState(progress: MediaProgress | undefined): EpisodeProgressState {
  if (!progress) return 'unplayed';
  if (progress.isFinished) return 'played';
  if (progress.currentTime > 0) return 'in-progress';
  return 'unplayed';
}

export function findEpisodeProgress(
  allProgress: MediaProgress[],
  itemId: string,
  episodeId: string,
): MediaProgress | undefined {
  return allProgress.find(
    (p) => p.libraryItemId === itemId && p.episodeId !== null && p.episodeId === episodeId,
  );
}
