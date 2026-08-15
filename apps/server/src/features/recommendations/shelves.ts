/**
 * Turns a ranked, reasoned `ScoredItem[]` into `RecommendationShelf[]` — the
 * `Shelf`-shaped output the route layer (wave 13b) and both clients' existing
 * `shelfToCarousel` renderer can consume without new rendering code. Pure: no
 * I/O, no clock.
 */
import type {
  AffinityKind,
  RecommendationCandidate,
  RecommendationShelf,
  ScoredItem,
  TasteProfile,
} from './types.js';

function labelFor(kind: AffinityKind, value: string): string {
  switch (kind) {
    case 'genre':
      return `More ${value}`;
    case 'author':
      return `More from ${value}`;
    case 'narrator':
      return `More narrated by ${value}`;
    case 'series':
      return `Continue the ${value} series`;
  }
}

function reasonFor(kind: AffinityKind, value: string, seedTitle: string | null): string {
  const because = seedTitle ? ` — because you finished ${seedTitle}` : '';
  switch (kind) {
    case 'genre':
      return `Because you enjoy ${value}${because}`;
    case 'author':
      return `Because you liked books by ${value}${because}`;
    case 'narrator':
      return `Because you enjoyed narration by ${value}${because}`;
    case 'series':
      return `Because you're reading the ${value} series${because}`;
  }
}

/** Stable, URL/DOM-safe id fragment for a facet value. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildRecommendationShelves(
  profile: TasteProfile,
  scored: ScoredItem[],
  _items: RecommendationCandidate[],
  options: { maxShelves: number; itemsPerShelf: number },
): RecommendationShelf[] {
  if (profile.totalSignal <= 0) return [];
  if (scored.length === 0) return [];

  // Every (kind, facet value) that has any weight, ranked strongest-first — this
  // is the order shelves are considered in, so the most confident affinity wins
  // a slot before a weaker one when `maxShelves` is the limiting factor.
  const facetCandidates: { kind: AffinityKind; value: string; weight: number }[] = [];
  for (const kind of Object.keys(profile.affinities) as AffinityKind[]) {
    for (const [value, weight] of Object.entries(profile.affinities[kind])) {
      facetCandidates.push({ kind, value, weight });
    }
  }
  facetCandidates.sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));

  const used = new Set<string>();
  const shelves: RecommendationShelf[] = [];

  for (const facet of facetCandidates) {
    if (shelves.length >= options.maxShelves) break;

    const matchingItems = scored.filter(
      (item) =>
        !used.has(item.itemId) &&
        item.reasons.some((r) => r.kind === facet.kind && r.value === facet.value),
    );
    if (matchingItems.length < 2) continue; // A one-item carousel reads as a bug — drop it.

    const itemIds = matchingItems.slice(0, options.itemsPerShelf).map((i) => i.itemId);
    if (itemIds.length < 2) continue; // Cap may have trimmed below 2 — still drop.

    const seed = profile.facetSeeds[facet.kind][facet.value] ?? null;
    shelves.push({
      id: `shelf-${facet.kind}-${slug(facet.value)}`,
      label: labelFor(facet.kind, facet.value),
      reason: reasonFor(facet.kind, facet.value, seed ? seed.title : null),
      itemIds,
    });
    for (const id of itemIds) used.add(id);
  }

  return shelves;
}
