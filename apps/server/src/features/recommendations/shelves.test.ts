import { describe, expect, it } from 'vitest';
import { buildTasteProfile } from './profile.js';
import { scoreCandidates } from './score.js';
import { buildRecommendationShelves } from './shelves.js';
import { book, signal, library, DAY_MS, NOW } from './testFixtures.js';
import type { RecommendationCandidate } from './types.js';

/** A non-book candidate for wave 15c's dedupe/mixed-shelf tests — `testFixtures.ts`'s
 * `book()` helper has no way to set `kind`/`parentId`, and adding those to a helper
 * shared by three other test files is more blast radius than these tests need. */
function candidate(
  id: string,
  opts: {
    kind: RecommendationCandidate['media']['kind'];
    title: string;
    genres?: string[];
    authors?: string[];
    series?: string[];
    parentId?: string | null;
  },
): RecommendationCandidate {
  return {
    id,
    media: {
      kind: opts.kind,
      title: opts.title,
      genres: opts.genres ?? [],
      authors: (opts.authors ?? []).map((name) => ({ name })),
      series: (opts.series ?? []).map((name) => ({ name })),
      narrator: null,
      parentId: opts.parentId ?? null,
    },
  };
}

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

describe('buildRecommendationShelves — dedupe by parent (wave 15c, decision 2)', () => {
  it('collapses two episodes of one podcast to the higher-ranked one', () => {
    // Both episodes match genre:'SciFi'; 'ep-high' also matches author:'Nova Reyes',
    // so it scores strictly higher than 'ep-low' and must be the survivor. A third,
    // unrelated-show episode keeps the genre pool at >=2 after dedupe so a real shelf
    // is produced to assert on, rather than everything getting dropped by the
    // minimum-size rule for an unrelated reason.
    const items = [
      book('seed', { title: 'Seed Book', genres: ['SciFi'], authors: ['Nova Reyes'] }),
      candidate('ep-high', {
        kind: 'podcast',
        title: 'Episode Two',
        genres: ['SciFi'],
        authors: ['Nova Reyes'],
        parentId: 'show-orbit',
      }),
      candidate('ep-low', {
        kind: 'podcast',
        title: 'Episode One',
        genres: ['SciFi'],
        parentId: 'show-orbit',
      }),
      candidate('ep-other-show', {
        kind: 'podcast',
        title: 'Different Show',
        genres: ['SciFi'],
        parentId: 'show-other',
      }),
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

    const allItemIds = shelves.flatMap((s) => s.itemIds);
    expect(allItemIds).toContain('ep-high');
    expect(allItemIds).not.toContain('ep-low');
    expect(allItemIds).toContain('ep-other-show');
  });

  it('generalises to books sharing a series: only the higher-ranked book of the series survives', () => {
    const items = [
      book('seed', { title: 'Seed Book', genres: ['Mystery'], authors: ['Nova Reyes'] }),
      book('book-high', {
        title: 'Book Two',
        genres: ['Mystery'],
        authors: ['Nova Reyes'],
        series: ['Riverbend'],
      }),
      book('book-low', {
        title: 'Book Three',
        genres: ['Mystery'],
        series: ['Riverbend'],
      }),
      book('book-other-series', {
        title: 'Unrelated Mystery',
        genres: ['Mystery'],
        series: ['Otherbend'],
      }),
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

    const allItemIds = shelves.flatMap((s) => s.itemIds);
    expect(allItemIds).toContain('book-high');
    expect(allItemIds).not.toContain('book-low');
    expect(allItemIds).toContain('book-other-series');
  });

  it('never drops a parentless item against another parentless item', () => {
    // Two standalone albums, neither with a parentId or a series — a parent-key
    // implementation that falls back to a shared sentinel (e.g. '' or 'none') for
    // "no parent" would wrongly collide these two and drop one. Both must survive.
    const items = [
      book('seed', { title: 'Seed Book', genres: ['Ambient'] }),
      candidate('album-a', { kind: 'album', title: 'Album A', genres: ['Ambient'] }),
      candidate('album-b', { kind: 'album', title: 'Album B', genres: ['Ambient'] }),
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

    const allItemIds = shelves.flatMap((s) => s.itemIds);
    expect(allItemIds).toContain('album-a');
    expect(allItemIds).toContain('album-b');
  });

  it('drops a shelf reduced below the minimum by dedupe — the test that fails if dedupe is deleted', () => {
    // Only one genre pool exists ('Indie'), and its only two matching candidates are
    // two episodes of the *same* podcast. Dedupe must collapse them to one before the
    // minimum-size check runs, so no shelf is produced at all. Without the dedupe
    // call, this facet pool has two distinct itemIds and a shelf WOULD be built —
    // this assertion fails the moment `dedupeByParent` is removed from
    // `buildRecommendationShelves`.
    const items = [
      book('seed', { title: 'Seed Book', genres: ['Indie'] }),
      candidate('ep-1', {
        kind: 'podcast',
        title: 'Episode One',
        genres: ['Indie'],
        parentId: 'show-solo',
      }),
      candidate('ep-2', {
        kind: 'podcast',
        title: 'Episode Two',
        genres: ['Indie'],
        parentId: 'show-solo',
      }),
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
});

describe('buildRecommendationShelves — mixed-content shelves (wave 15c, decision 2)', () => {
  it('carries a type label for every item when a shelf spans more than one kind', () => {
    const items = [
      book('seed', { title: 'Seed Book', genres: ['Ambient'] }),
      book('book-match', { title: 'A Quiet Read', genres: ['Ambient'] }),
      candidate('album-match', { kind: 'album', title: 'A Quiet Album', genres: ['Ambient'] }),
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

    const mixed = shelves.find(
      (s) => s.itemIds.includes('book-match') && s.itemIds.includes('album-match'),
    );
    expect(mixed).toBeDefined();
    expect(mixed!.itemLabels).toBeDefined();
    for (const id of mixed!.itemIds) {
      expect(mixed!.itemLabels![id]).toEqual(expect.any(String));
    }
    const labelValues = new Set(Object.values(mixed!.itemLabels!));
    expect(labelValues.size).toBeGreaterThan(1);
    expect(mixed!.itemLabels!['book-match']).toBe('Audiobook');
    expect(mixed!.itemLabels!['album-match']).toBe('Album');
  });

  it('omits itemLabels for a single-kind shelf', () => {
    const { shelves } = (() => {
      const profile = buildTasteProfile(
        [signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS })],
        library,
        { now: NOW },
      );
      const scored = scoreCandidates(profile, library);
      return {
        shelves: buildRecommendationShelves(profile, scored, library, {
          maxShelves: 5,
          itemsPerShelf: 5,
        }),
      };
    })();
    expect(shelves.length).toBeGreaterThan(0);
    for (const shelf of shelves) {
      // The shared `library` fixture is books-only, so every shelf built from it is
      // single-kind and must carry no itemLabels at all.
      expect(shelf.itemLabels).toBeUndefined();
    }
  });
});
