/**
 * Builds a `TasteProfile` from raw progress signals and the items they refer to.
 * Pure: no I/O, no clock read — `now` is always the caller's `options.now`.
 */
import type {
  AffinityKind,
  ProgressSignal,
  RecommendationCandidate,
  TasteProfile,
} from './types.js';

/**
 * Half-life for recency decay, in milliseconds. 90 days: long enough that a book
 * finished a season ago still counts for something (this is a small, slow-moving
 * personal library, not a high-frequency feed), short enough that "what I'm into
 * right now" visibly outweighs old history within about a quarter. Not derived
 * from data — no real library was available to tune against (see
 * `docs/HANDOVER.md`'s "Audiobookshelf client... only partly verified" section) —
 * so treat this constant as a starting point to revisit once real usage exists.
 */
const RECENCY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Floor on the recency multiplier. Without a floor, an item finished years ago
 * decays to a weight indistinguishable from zero and vanishes from the profile
 * entirely, which is wrong for a library this small and slow-moving: old taste is
 * still real evidence, just weaker. Chosen so a maximally-stale signal still
 * contributes a tenth of what a fresh one would, rather than nothing.
 */
const MIN_RECENCY_FACTOR = 0.1;

/**
 * Base weight for a finished item, before recency decay. The unit against which
 * every other weight in this module is relative — 1.0 by construction.
 */
const FINISHED_BASE_WEIGHT = 1.0;

/**
 * Cap on the base weight an *unfinished* item can contribute, before recency
 * decay: `progress * IN_PROGRESS_BASE_CAP`. Set below `FINISHED_BASE_WEIGHT` so
 * that, at equal recency, no unfinished item — however far into it the listener
 * got — can ever outweigh a finished one. Finishing something is a stronger
 * endorsement than getting partway through it, however far; abandoning partway
 * through is not the same signal as choosing to finish.
 */
const IN_PROGRESS_BASE_CAP = 0.5;

function emptyAffinities(): TasteProfile['affinities'] {
  return { genre: {}, author: {}, narrator: {}, series: {} };
}

/** Exponential decay as a function of age. `ageMs` is clamped to `>= 0` — a
 * `lastActivityAt` in the future (clock skew, bad data) decays no more than "now". */
function recencyFactor(ageMs: number): number {
  const clampedAge = Math.max(0, ageMs);
  const raw = Math.pow(0.5, clampedAge / RECENCY_HALF_LIFE_MS);
  return Math.max(MIN_RECENCY_FACTOR, raw);
}

/** Clamp progress into `[0, 1]`, treating non-finite input (NaN, +-Infinity from a
 * malformed upstream payload) as "no progress" rather than propagating NaN through
 * every downstream weight — a total function degrades, it does not poison. */
function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/**
 * Weight for one progress signal, before it is attributed to any facet.
 *
 * `lastActivityAt: null` (upstream doesn't know) is treated as maximally stale —
 * the safer default: an unknown-recency signal should not be able to outrank a
 * signal we can positively confirm is recent.
 */
function signalWeight(signal: ProgressSignal, now: number): number {
  const ageMs =
    signal.lastActivityAt === null ? Number.POSITIVE_INFINITY : now - signal.lastActivityAt;
  const decay = recencyFactor(ageMs);
  const progress = clampProgress(signal.progress);
  const base = signal.isFinished ? FINISHED_BASE_WEIGHT : progress * IN_PROGRESS_BASE_CAP;
  return base * decay;
}

function facetsOf(item: RecommendationCandidate): { kind: AffinityKind; value: string }[] {
  const facets: { kind: AffinityKind; value: string }[] = [];
  for (const genre of item.media.genres) facets.push({ kind: 'genre', value: genre });
  for (const author of item.media.authors) facets.push({ kind: 'author', value: author.name });
  for (const series of item.media.series) facets.push({ kind: 'series', value: series.name });
  if (item.media.narrator) facets.push({ kind: 'narrator', value: item.media.narrator });
  return facets;
}

export function buildTasteProfile(
  signals: ProgressSignal[],
  items: RecommendationCandidate[],
  options: { now: number },
): TasteProfile {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const knownItemIds = new Set<string>();
  const affinities = emptyAffinities();
  const facetSeeds: TasteProfile['facetSeeds'] = {
    genre: {},
    author: {},
    narrator: {},
    series: {},
  };
  // Strongest weight seen per item, so a duplicate signal for the same item
  // (malformed upstream data) contributes once, not twice — take the best
  // evidence for that item rather than summing what may be the same event twice.
  const bestWeightByItem = new Map<string, number>();

  for (const signal of signals) {
    knownItemIds.add(signal.itemId);
    const weight = signalWeight(signal, options.now);
    const existing = bestWeightByItem.get(signal.itemId);
    if (existing === undefined || weight > existing) {
      bestWeightByItem.set(signal.itemId, weight);
    }
  }

  let totalSignal = 0;
  const seeds: TasteProfile['seeds'] = [];
  for (const [itemId, weight] of bestWeightByItem) {
    const item = itemsById.get(itemId);
    if (!item) continue; // Signal for an item outside the candidate set — skip, don't throw.
    totalSignal += weight;
    seeds.push({ itemId, title: item.media.title, weight });
    for (const facet of facetsOf(item)) {
      affinities[facet.kind][facet.value] = (affinities[facet.kind][facet.value] ?? 0) + weight;
      const currentSeed = facetSeeds[facet.kind][facet.value];
      if (!currentSeed || weight > (bestWeightByItem.get(currentSeed.itemId) ?? 0)) {
        facetSeeds[facet.kind][facet.value] = { itemId, title: item.media.title };
      }
    }
  }

  seeds.sort((a, b) => b.weight - a.weight || a.itemId.localeCompare(b.itemId));

  return {
    affinities,
    seeds,
    knownItemIds: Array.from(knownItemIds).sort(),
    totalSignal,
    facetSeeds,
  };
}
