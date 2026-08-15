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
