/**
 * Episode ordering for the podcast detail view. Kept as a pure sort, mirroring
 * `features/library/sorting.ts`'s split between pure data transforms and the page
 * that wires a control bar around them.
 *
 * A podcast listener wants newest first by default — that's the whole point of
 * subscribing rather than browsing a static archive — so `'newest'` is this
 * module's default, unlike `sortItems`'s neutral `title` default.
 */
import type { PodcastEpisode } from '../../api/types.js';

export type EpisodeOrder = 'newest' | 'oldest';

/**
 * `publishedAt: null` (a malformed or missing feed entry) always sorts last,
 * regardless of direction — an undated episode degrading to "least relevant"
 * rather than jumping to the top of either ordering.
 */
function compareEpisodes(a: PodcastEpisode, b: PodcastEpisode, order: EpisodeOrder): number {
  if (a.publishedAt === null && b.publishedAt === null) return 0;
  if (a.publishedAt === null) return 1;
  if (b.publishedAt === null) return -1;
  return order === 'newest' ? b.publishedAt - a.publishedAt : a.publishedAt - b.publishedAt;
}

export function sortEpisodes(
  episodes: PodcastEpisode[],
  order: EpisodeOrder = 'newest',
): PodcastEpisode[] {
  return [...episodes].sort((a, b) => compareEpisodes(a, b, order));
}
