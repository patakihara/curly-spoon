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

// Wave 15a — the external-candidate seam. No route or client consumes this yet; see
// `external/registry.test.ts` for how the interface is exercised today, and `ROADMAP.md`
// §15 (waves 15c/15e) for when a real caller arrives.
export type {
  ExternalCandidate,
  ExternalMedium,
  ExternalRecommendationProvider,
  RecommendationSeed,
} from './external/types.js';
export {
  externalProviderFactories,
  getExternalProvidersForMedium,
  type ExternalProviderDeps,
  type ExternalProviderFactory,
} from './external/registry.js';
export { createListenBrainzProvider, LISTENBRAINZ_PROVIDER_NAME } from './external/listenbrainz.js';
export { createOpenLibraryProvider, OPENLIBRARY_PROVIDER_NAME } from './external/openlibrary.js';

// Wave 15e-music — the reader `GET /music/recommended` uses to mix ListenBrainz candidates
// into the response. See `musicExternalDiscovery.ts`'s own header comment.
export {
  artistToOwnershipLibraryItem,
  externalCandidateToAlbumPlaceholder,
  externalCandidateToOwnershipItem,
  reasonForExternalShelf,
} from './musicExternalDiscovery.js';

// Wave 15e-books — the reader `GET /libraries/:id/recommended` uses to mix Open Library
// candidates into the response. See `bookExternalDiscovery.ts`'s own header comment.
export {
  bookLibraryItemToOwnershipLibraryItem,
  externalCandidateToLibraryItemPlaceholder,
  reasonForBookExternalShelf,
} from './bookExternalDiscovery.js';
