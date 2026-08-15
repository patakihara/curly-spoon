/**
 * Types for the recommendations scoring core. Everything here is pure data — no
 * function in this feature reads `Date.now()`, performs I/O, or imports a client.
 * `now` is always passed in by the caller (wave 13b's route handler).
 */

/**
 * The candidate/library-item shape this feature depends on. Deliberately narrower
 * than `@auralis/abs-client`'s `LibraryItem`: only the fields the scorer actually
 * reads.
 *
 * **This is the *adapted* shape, not `LibraryItem` itself — and only half of
 * `LibraryItem` satisfies it directly.** `packages/abs-client/src/domain.ts`'s
 * `Media` is a discriminated union: `Book` carries `authors: AuthorBadge[]`,
 * `series: SeriesBadge[]` and `narrator: string | null`, so a `Book`-armed
 * `LibraryItem` structurally satisfies `RecommendationCandidate` with no cast —
 * pinned by the compile-time check in `profile.test.ts` (`expectTypeOf<LibraryItem
 * & { media: Book }>().toExtend<RecommendationCandidate>()`). `Podcast` has none
 * of those three fields, only a flat `author: string | null`, so a `Podcast`-armed
 * `LibraryItem` does **not** satisfy `RecommendationCandidate` as-is — also pinned,
 * as a `.not.toExtend<...>()` assertion on the full (`Book | Podcast`) `LibraryItem`.
 * Folding a podcast's `author` into a one-element `authors` array (so both media
 * kinds share one affinity path) is real adaptation work this module does not do —
 * it is wave 13b's, where a real `LibraryItem` is actually available to adapt.
 *
 * Every field here is guaranteed present even on Audiobookshelf's *minified* items
 * (the shape every shelf/browse/personalized response returns), once a `Book` has
 * been adapted:
 * - `genres` normalizes to `[]`, never absent (`normalizeMedia` in
 *   `packages/abs-client/src/normalize.ts` defaults `metadata.genres ?? []`).
 * - `authors`/`series` carry only `.name` (`AuthorBadge`/`SeriesBadge` deliberately
 *   declare no `id` — see that package's domain.ts header and `docs/HANDOVER.md`'s
 *   "minified-item bug" section). Affinities in this feature are therefore always
 *   keyed on NAME strings, never on an id.
 * - `narrator` is `string | null` directly on `Book`, always present as a field
 *   (possibly `null`).
 */
export interface RecommendationCandidate {
  id: string;
  media: {
    kind: 'book' | 'podcast';
    title: string;
    genres: string[];
    /** Book only, pre-adaptation — `[]` for a podcast that hasn't been folded (see
     * this interface's doc comment: wave 13b folds `Podcast.author` into a
     * one-element list before a podcast reaches this feature). */
    authors: { name: string }[];
    series: { name: string }[];
    narrator: string | null;
  };
}

/** One item's worth of listening evidence, already joined to the item it refers to. */
export interface ProgressSignal {
  itemId: string;
  progress: number; // 0..1
  isFinished: boolean;
  lastActivityAt: number | null; // epoch ms, null if unknown
}

export type AffinityKind = 'genre' | 'author' | 'narrator' | 'series';

export interface TasteProfile {
  /** kind -> facet value (a NAME string) -> weight. Plain records, not Maps: this
   * profile is intended to cross the BFF/route boundary as JSON in wave 13b. */
  affinities: Record<AffinityKind, Record<string, number>>;
  /** Items that produced the signal, strongest first. Used to phrase reasons. */
  seeds: { itemId: string; title: string; weight: number }[];
  /** Every item the user has any progress on — candidates must exclude these. */
  knownItemIds: string[];
  /** Sum of all seed weights. Zero means cold start. */
  totalSignal: number;
  /**
   * Additive to the spec's named fields (not in wave 13a's original request) —
   * needed so `score.ts` can populate `Reason.seedTitle` truthfully and
   * `shelves.ts` can group by "the seed that drove this shelf" without
   * re-deriving it. kind -> facet value -> the single strongest seed that
   * produced that facet's weight. Wave 13b is free to drop this before the
   * profile crosses the HTTP boundary if it doesn't want to serialize it.
   */
  facetSeeds: Record<AffinityKind, Record<string, { itemId: string; title: string }>>;
}

export interface Reason {
  kind: AffinityKind;
  value: string;
  seedTitle: string | null;
}

export interface ScoredItem {
  itemId: string;
  score: number;
  reasons: Reason[];
}

export interface RecommendationShelf {
  id: string;
  label: string;
  /** Human-readable "why", e.g. "Because you finished Ashes of Aeon". Never null. */
  reason: string;
  itemIds: string[];
}
