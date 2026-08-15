import { describe, expect, it } from 'vitest';
import { buildTasteProfile } from './profile.js';
import { scoreCandidates } from './score.js';
import { buildRecommendationShelves } from './shelves.js';
import { book, signal, library, DAY_MS, NOW } from './testFixtures.js';

function buildAll(opts: { maxShelves: number; itemsPerShelf: number }) {
  const profile = buildTasteProfile(
    [
      signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS }),
      signal('seed-abandoned', {
        progress: 0.1,
        isFinished: false,
        lastActivityAt: NOW - 500 * DAY_MS,
      }),
    ],
    library,
    { now: NOW },
  );
  const scored = scoreCandidates(profile, library);
  const shelves = buildRecommendationShelves(profile, scored, library, opts);
  return { profile, scored, shelves };
}

describe('buildRecommendationShelves', () => {
  it('groups shelves by the facet that drove them (genre, author, ...)', () => {
    const { shelves } = buildAll({ maxShelves: 5, itemsPerShelf: 5 });
    expect(shelves.length).toBeGreaterThan(0);
    // At least one shelf should read as genre-driven and one as author-driven,
    // given the fixture library's shared "Fantasy" genre and "Rin Calder" author.
    const labels = shelves.map((s) => s.label);
    expect(labels.some((l) => /fantasy/i.test(l))).toBe(true);
    expect(labels.some((l) => /rin calder/i.test(l))).toBe(true);
  });

  it('every shelf has a non-empty reason string', () => {
    const { shelves } = buildAll({ maxShelves: 5, itemsPerShelf: 5 });
    for (const shelf of shelves) {
      expect(typeof shelf.reason).toBe('string');
      expect(shelf.reason.length).toBeGreaterThan(0);
    }
  });

  it('never places one item in two shelves', () => {
    const { shelves } = buildAll({ maxShelves: 5, itemsPerShelf: 5 });
    const seen = new Set<string>();
    for (const shelf of shelves) {
      for (const id of shelf.itemIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('respects maxShelves and itemsPerShelf as reached bounds, not just upper bounds', () => {
    // The fixture library (with these two seed signals) has three independent
    // facet pools with >=2 matching, not-yet-used candidates each: genre:Fantasy
    // (cand-genre-match, cand-multi-match), author:Rin Calder (cand-author-match,
    // cand-author-match-2), and narrator:Jo Marsh (cand-narrator-match,
    // cand-narrator-match-2). That is strictly more than maxShelves:2, so an
    // implementation that ignored the cap (or ignored itemsPerShelf and always
    // returned zero/all shelves) cannot pass this by accident — it must actually
    // stop at 2 shelves and actually fill each one to 2 items.
    const { shelves } = buildAll({ maxShelves: 2, itemsPerShelf: 2 });
    expect(shelves.length).toBe(2);
    for (const shelf of shelves) {
      expect(shelf.itemIds.length).toBeLessThanOrEqual(2);
    }
    expect(shelves.some((s) => s.itemIds.length === 2)).toBe(true);
  });

  it('drops a shelf that would have fewer than 2 items', () => {
    // Only one candidate matches "series", so a series-only shelf must never appear
    // with itemsPerShelf large enough to have included it fully.
    const items = [
      book('seed', { title: 'Seed', series: ['LonelySeries'] }),
      book('only-match', { title: 'Only Match', series: ['LonelySeries'] }),
    ];
    const profile = buildTasteProfile(
      [signal('seed', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS })],
      items,
      { now: NOW },
    );
    const scored = scoreCandidates(profile, items);
    const shelves = buildRecommendationShelves(profile, scored, items, {
      maxShelves: 5,
      itemsPerShelf: 5,
    });
    expect(shelves).toEqual([]);
  });

  it('returns [] for a cold-start profile', () => {
    const profile = buildTasteProfile([], library, { now: NOW });
    const scored = scoreCandidates(profile, library);
    const shelves = buildRecommendationShelves(profile, scored, library, {
      maxShelves: 5,
      itemsPerShelf: 5,
    });
    expect(shelves).toEqual([]);
  });
});
