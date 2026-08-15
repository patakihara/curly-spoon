/**
 * Adapts a real `@auralis/abs-client` `LibraryItem` into this feature's narrower
 * `RecommendationCandidate` shape. Lives here (not in `packages/abs-client`)
 * because the scoring core is deliberately I/O- and client-free — see
 * `types.ts`'s header comment, which names this exact fold as wave 13b's job.
 *
 * Only `Podcast` needs real adaptation: `Book` structurally satisfies
 * `RecommendationCandidate` already (pinned by the `expectTypeOf` assertions in
 * `profile.test.ts`), so this function is a plain pass-through for books and a
 * fold for podcasts.
 */
import type { LibraryItem } from '@auralis/abs-client';
import type { RecommendationCandidate } from './types.js';

export function toCandidate(item: LibraryItem): RecommendationCandidate {
  const media = item.media;

  if (media.kind === 'book') {
    return {
      id: item.id,
      media: {
        kind: 'book',
        title: media.title,
        genres: media.genres,
        authors: media.authors,
        series: media.series,
        narrator: media.narrator,
      },
    };
  }

  // Podcast: fold the flat `author: string | null` into a one-element `authors`
  // array so genre/author affinity works uniformly across both media kinds — a
  // null or blank author yields `[]`, never a `[{ name: null }]` or a
  // `[{ name: '' }]`, which would otherwise let a blank string accumulate
  // affinity weight as if it were a real author name.
  const authors = media.author && media.author.trim().length > 0 ? [{ name: media.author }] : [];

  return {
    id: item.id,
    media: {
      kind: 'podcast',
      title: media.title,
      genres: media.genres,
      authors,
      series: [],
      narrator: null,
    },
  };
}
