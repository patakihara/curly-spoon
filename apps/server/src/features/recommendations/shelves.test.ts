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

  it('never places one item in two shelves, and respects maxShelves/itemsPerShelf exactly', () => {
    const { shelves } = buildAll({ maxShelves: 2, itemsPerShelf: 1 });
    expect(shelves.length).toBeLessThanOrEqual(2);
    for (const shelf of shelves) {
      expect(shelf.itemIds.length).toBeLessThanOrEqual(1);
    }
    const seen = new Set<string>();
    for (const shelf of shelves) {
      for (const id of shelf.itemIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
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
