/**
 * Folds a second medium's genre affinity into a `TasteProfile` that will go on to score
 * candidates of a *different* medium — wave 13e-2's cross-media requirement
 * (`docs/HANDOVER.md`: "personalized recommendations... [pull from] taste in one medium
 * informing another"). Pure: no I/O, no clock.
 *
 * **Genre only, deliberately.** `author`/`narrator`/`series` values from music are artist
 * names, which share no domain with a book's author/narrator/series — merging those facet
 * kinds would let a music artist's name accumulate weight as though it mattered to book
 * scoring, which is a category error, not a real signal. Genre is the one facet whose
 * *vocabulary* is sometimes shared across media (a book and a soundtrack album can both be
 * tagged "Fantasy"), so it's the only one this function touches.
 *
 * **Whether this actually does anything useful is unverified, and the doc comment says so
 * rather than overselling it.** Audiobookshelf's book genres ("Fantasy", "Science Fiction",
 * "Mystery") and Jellyfin's music genres ("Rock", "Jazz", "Synthwave") overlap thinly or not
 * at all in this project's fixtures, and nobody working on this wave has a real credential
 * to know how much they overlap in the user's actual ~231-item library (`docs/HANDOVER.md`).
 * The mechanism is built and tested against a fixture where a genre string genuinely
 * matches on both sides — that only proves the mechanism is correct, not that it is
 * effective on real data.
 *
 * **Why this is safe to ship rather than gate behind a flag.** The obvious failure mode —
 * a transferred genre "crowding out" a book-native shelf — does not actually happen:
 * `shelves.ts`'s `buildRecommendationShelves` only consumes a shelf slot for a facet that
 * produces at least two *real, matching book candidates* (`matchingItems.length < 2` is
 * skipped without costing a slot). A transferred music genre that matches zero or one book
 * costs nothing; one that matches two or more book candidates sharing that exact genre
 * string is, by construction, a real same-vocabulary signal worth surfacing. So this
 * function is folded in unconditionally whenever both profiles have signal — not opt-in —
 * but see `CROSS_MEDIA_GENRE_WEIGHT` below for why it is still down-weighted.
 */
import type { TasteProfile } from './types.js';

/**
 * Down-weights transferred genre affinity before folding it in. Not defending against the
 * shelf-crowding risk above (there isn't one, by construction) — this is a judgement call
 * that a same-medium genre affinity (built from actually finishing a book) should count for
 * more than an adjacent-medium hint (built from playing an album), at equal raw weight. No
 * real library exists to tune this against; 0.5 is a starting point that lets a matching
 * cross-media genre matter without letting it out-rank genuinely book-native evidence of the
 * same magnitude.
 */
export const CROSS_MEDIA_GENRE_WEIGHT = 0.5;

/**
 * Returns a new `TasteProfile` with `source`'s genre affinities added into `target`'s,
 * scaled by `weightFactor`. Everything else on `target` (author/narrator/series
 * affinities, `seeds`, `knownItemIds`) is untouched and returned as-is.
 *
 * `totalSignal` is deliberately **not** increased by the transferred weight.
 * `totalSignal` is what `scoreCandidates`/`buildRecommendationShelves` treat as the
 * cold-start gate (`<= 0` -> empty feed) for `target`'s own medium — inflating it with a
 * different medium's evidence would let a music-only listener who has never touched a
 * book pass the *books* route's cold-start gate, which is wrong: a user with zero book
 * signal should still see an empty book "for you" feed, however rich their music history.
 */
export function mergeGenreAffinity(
  target: TasteProfile,
  source: TasteProfile,
  options: { weightFactor: number } = { weightFactor: CROSS_MEDIA_GENRE_WEIGHT },
): TasteProfile {
  if (source.totalSignal <= 0) return target; // Nothing to transfer.

  const mergedGenre = { ...target.affinities.genre };
  const mergedFacetSeeds = { ...target.facetSeeds.genre };

  for (const [genre, weight] of Object.entries(source.affinities.genre)) {
    const scaled = weight * options.weightFactor;
    if (scaled <= 0) continue;
    mergedGenre[genre] = (mergedGenre[genre] ?? 0) + scaled;
    // Only borrow the source's seed if the target has no seed of its own for this
    // genre — a book-native seed (a book the user actually read) is always a more
    // relevant "because you..." reason than a cross-media one, when both exist.
    if (!mergedFacetSeeds[genre]) {
      const seed = source.facetSeeds.genre[genre];
      if (seed) mergedFacetSeeds[genre] = seed;
    }
  }

  return {
    ...target,
    affinities: { ...target.affinities, genre: mergedGenre },
    facetSeeds: { ...target.facetSeeds, genre: mergedFacetSeeds },
  };
}
