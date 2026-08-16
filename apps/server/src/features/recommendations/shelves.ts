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

/** Noun label a client renders as a mixed shelf's card subtitle (`docs/USER_DECISIONS.md`
 * decision 2: her Spotify reference disambiguates a mixed shelf by "Playlist • …" /
 * "Single • …"). Deliberately not the raw `media.kind` string, which is an internal id. */
const MEDIA_KIND_LABEL: Record<RecommendationCandidate['media']['kind'], string> = {
  book: 'Audiobook',
  podcast: 'Podcast',
  album: 'Album',
};

/**
 * The grouping key for the "at most one item per parent" rule (her words: "a carousel
 * should not show more than one episode of a given podcast", generalised per
 * `docs/ROADMAP.md` §15 to any parent/child relationship a shelf might contain).
 *
 * - An explicit `media.parentId` wins when present — the field a future episode/track
 *   candidate would set (see `types.ts`'s doc comment on it).
 * - Failing that, a book's first series name is the parent — the one such relationship
 *   expressible with today's fields (`media.series`), covering "two books of the same
 *   series" the same way the podcast rule covers episodes.
 * - Failing both, the candidate is its own parent: `item:${id}`, never a shared sentinel
 *   like `''` or `'none'`. Two unrelated parentless items (e.g. two standalone albums)
 *   must never collide onto the same key, or the rule would silently drop one of them.
 */
function parentKeyOf(candidate: RecommendationCandidate): string {
  if (candidate.media.parentId) return `parent:${candidate.media.parentId}`;
  const firstSeries = candidate.media.kind === 'book' ? candidate.media.series[0] : undefined;
  if (firstSeries) return `series:${firstSeries.name}`;
  return `item:${candidate.id}`;
}

/**
 * Keeps at most one item per `parentKeyOf` group, first-in-order wins. `items` must
 * already be in the order the shelf would otherwise use (rank order — see
 * `score.ts`'s deterministic sort), so "first" means "highest ranked", never
 * insertion- or iteration-order-dependent. Unknown candidates (should not happen —
 * every `ScoredItem` here originates from `items`) fall back to their own id, same as
 * `parentKeyOf`'s own no-parent case, so a lookup miss can never cause a false collision.
 */
function dedupeByParent(
  items: ScoredItem[],
  candidatesById: Map<string, RecommendationCandidate>,
): ScoredItem[] {
  const seenParents = new Set<string>();
  const result: ScoredItem[] = [];
  for (const item of items) {
    const candidate = candidatesById.get(item.itemId);
    const parentKey = candidate ? parentKeyOf(candidate) : `item:${item.itemId}`;
    if (seenParents.has(parentKey)) continue;
    seenParents.add(parentKey);
    result.push(item);
  }
  return result;
}

/** `RecommendationShelf.itemLabels`, populated only when `itemIds` span more than one
 * `media.kind` — see that field's doc comment in `types.ts`. */
function typeLabelsFor(
  itemIds: string[],
  candidatesById: Map<string, RecommendationCandidate>,
): Record<string, string> | undefined {
  const kinds = new Set<string>();
  for (const id of itemIds) {
    const candidate = candidatesById.get(id);
    if (candidate) kinds.add(candidate.media.kind);
  }
  if (kinds.size < 2) return undefined;

  const labels: Record<string, string> = {};
  for (const id of itemIds) {
    const candidate = candidatesById.get(id);
    if (candidate) labels[id] = MEDIA_KIND_LABEL[candidate.media.kind];
  }
  return labels;
}

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
    // Wave 13e-2 touch: was "Because you liked books by ${value}" — this shelf-building
    // core is now shared by the music route too (`routes/jellyfin.ts`'s
    // `/music/recommended`), where the author facet holds an artist name, not a book
    // author, and "liked books by Radiohead" would be a visible, wrong-medium string in
    // a real response. Generalizing away the word "books" costs nothing on the book side
    // (no test pins the old exact string — checked `shelves.test.ts` before changing this)
    // and makes the phrasing correct for both callers, which is preferable to duplicating
    // this whole shelf-building module per medium — see `docs/HANDOVER.md`'s "web and
    // Android... drifted once" for why a second implementation of shared logic is the
    // failure mode this phase avoids.
    case 'author':
      return `Because you liked ${value}${because}`;
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
  items: RecommendationCandidate[],
  options: { maxShelves: number; itemsPerShelf: number },
): RecommendationShelf[] {
  if (profile.totalSignal <= 0) return [];
  if (scored.length === 0) return [];

  const candidatesById = new Map(items.map((candidate) => [candidate.id, candidate]));

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

    // Dedupe-by-parent must run before the minimum-size check below, not after: a
    // facet pool of e.g. two episodes of the same podcast collapses to one item here,
    // and a shelf that would render with just that one item must disappear rather
    // than render — the same "one-item carousel reads as a bug" reasoning above,
    // reached through a different route.
    const deduped = dedupeByParent(matchingItems, candidatesById);
    if (deduped.length < 2) continue; // Dedupe may have reduced below 2 — still drop.

    const itemIds = deduped.slice(0, options.itemsPerShelf).map((i) => i.itemId);
    if (itemIds.length < 2) continue; // Cap may have trimmed below 2 — still drop.

    const seed = profile.facetSeeds[facet.kind][facet.value] ?? null;
    shelves.push({
      id: `shelf-${facet.kind}-${slug(facet.value)}`,
      label: labelFor(facet.kind, facet.value),
      reason: reasonFor(facet.kind, facet.value, seed ? seed.title : null),
      itemIds,
      itemLabels: typeLabelsFor(itemIds, candidatesById),
    });
    for (const id of itemIds) used.add(id);
  }

  return shelves;
}
