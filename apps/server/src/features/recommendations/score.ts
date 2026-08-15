/**
 * Scores a candidate list against a `TasteProfile`. Pure: takes exactly the
 * profile and the candidates, returns a ranked, reasoned, already-filtered list.
 * No `fetch`, no clock, no randomness.
 */
import type {
  AffinityKind,
  RecommendationCandidate,
  Reason,
  ScoredItem,
  TasteProfile,
} from './types.js';

function facetsOf(item: RecommendationCandidate): { kind: AffinityKind; value: string }[] {
  const facets: { kind: AffinityKind; value: string }[] = [];
  for (const genre of item.media.genres) facets.push({ kind: 'genre', value: genre });
  for (const author of item.media.authors) facets.push({ kind: 'author', value: author.name });
  for (const series of item.media.series) facets.push({ kind: 'series', value: series.name });
  if (item.media.narrator) facets.push({ kind: 'narrator', value: item.media.narrator });
  return facets;
}

export function scoreCandidates(
  profile: TasteProfile,
  candidates: RecommendationCandidate[],
): ScoredItem[] {
  // Cold start: no signal means no basis to rank anything. Returning the whole
  // catalogue "because we have nothing better" would be indistinguishable from a
  // broken profile to the user — an empty feed is the honest answer, and the
  // route layer is what decides whether to fall back to something else (e.g.
  // Audiobookshelf's own `/personalized`) on top of this.
  if (profile.totalSignal <= 0) return [];

  const known = new Set(profile.knownItemIds);
  const results: ScoredItem[] = [];

  for (const candidate of candidates) {
    if (known.has(candidate.id)) continue; // Never recommend what the user already has progress on.

    let score = 0;
    const reasons: Reason[] = [];
    for (const facet of facetsOf(candidate)) {
      const weight = profile.affinities[facet.kind][facet.value];
      if (!weight) continue; // Not a match — contributes nothing, not a throw.
      score += weight;
      const seed = profile.facetSeeds[facet.kind][facet.value] ?? null;
      reasons.push({ kind: facet.kind, value: facet.value, seedTitle: seed ? seed.title : null });
    }

    if (score <= 0 || reasons.length === 0) continue; // No matched facet: excluded entirely, per spec.
    results.push({ itemId: candidate.id, score, reasons });
  }

  // Deterministic total order: score descending, itemId ascending as the
  // tie-break. Without an explicit tie-break, sort stability would make the
  // order depend on the candidates array's own order (effectively object/array
  // insertion order upstream), which is not something callers should be able to
  // observe as "the ranking".
  results.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
  return results;
}
