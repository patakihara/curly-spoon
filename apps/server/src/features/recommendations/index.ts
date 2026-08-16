/** Public surface of the recommendations feature. Wave 13b's route handler is the
 * intended (and, at this wave, only) consumer. */
export type {
  AffinityKind,
  ProgressSignal,
  Reason,
  RecommendationCandidate,
  RecommendationShelf,
  ScoredItem,
  TasteProfile,
} from './types.js';
export { buildTasteProfile } from './profile.js';
export { scoreCandidates } from './score.js';
export { buildRecommendationShelves } from './shelves.js';
export { albumToCandidate, buildMusicProgressSignals } from './adaptMusic.js';
export { mergeGenreAffinity, CROSS_MEDIA_GENRE_WEIGHT } from './crossMediaGenre.js';
export { matchOwnership } from './ownership.js';
export type {
  OwnershipIdentifierField,
  OwnershipIdentifiers,
  OwnershipItem,
  OwnershipLibraryItem,
  OwnershipMatchReason,
  OwnershipVerdict,
} from './ownership.js';
