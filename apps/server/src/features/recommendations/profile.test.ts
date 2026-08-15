import type { Book, LibraryItem } from '@auralis/abs-client';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { buildTasteProfile } from './profile.js';
import type { RecommendationCandidate } from './types.js';
import { book, signal, DAY_MS, NOW } from './testFixtures.js';

describe('RecommendationCandidate against the real @auralis/abs-client LibraryItem', () => {
  it('a Book-armed LibraryItem structurally satisfies RecommendationCandidate with no cast', () => {
    expectTypeOf<LibraryItem & { media: Book }>().toExtend<RecommendationCandidate>();
  });

  it('a bare LibraryItem (Book | Podcast media) does NOT satisfy RecommendationCandidate — Podcast has no authors/series/narrator, only a flat `author` string, and needs 13b to adapt it', () => {
    expectTypeOf<LibraryItem>().not.toExtend<RecommendationCandidate>();
  });
});

describe('buildTasteProfile', () => {
  it('gives a finished item more weight than a 20%-progress item at the same recency', () => {
    const items = [
      book('finished', { title: 'A', genres: ['Fantasy'] }),
      book('partial', { title: 'B', genres: ['Sci-Fi'] }),
    ];
    const profile = buildTasteProfile(
      [
        signal('finished', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS }),
        signal('partial', { progress: 0.2, isFinished: false, lastActivityAt: NOW - DAY_MS }),
      ],
      items,
      { now: NOW },
    );
    const finishedWeight = profile.affinities.genre['Fantasy'] ?? 0;
    const partialWeight = profile.affinities.genre['Sci-Fi'] ?? 0;
    expect(finishedWeight).toBeGreaterThan(partialWeight);
  });

  it('decays weight by recency: a recent finish outweighs a stale finish', () => {
    const items = [
      book('recent', { title: 'A', genres: ['Fantasy'] }),
      book('stale', { title: 'B', genres: ['Sci-Fi'] }),
    ];
    const profile = buildTasteProfile(
      [
        signal('recent', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS }),
        signal('stale', { progress: 1, isFinished: true, lastActivityAt: NOW - 400 * DAY_MS }),
      ],
      items,
      { now: NOW },
    );
    expect(profile.affinities.genre['Fantasy'] ?? 0).toBeGreaterThan(
      profile.affinities.genre['Sci-Fi'] ?? 0,
    );
  });

  it('does not crash on lastActivityAt: null, and treats it as maximally stale', () => {
    const items = [
      book('known-recent', { title: 'A', genres: ['Fantasy'] }),
      book('unknown-time', { title: 'B', genres: ['Sci-Fi'] }),
    ];
    const profile = buildTasteProfile(
      [
        signal('known-recent', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS }),
        signal('unknown-time', { progress: 1, isFinished: true, lastActivityAt: null }),
      ],
      items,
      { now: NOW },
    );
    expect(profile.affinities.genre['Sci-Fi'] ?? 0).toBeGreaterThan(0);
    expect(profile.affinities.genre['Fantasy'] ?? 0).toBeGreaterThan(
      profile.affinities.genre['Sci-Fi'] ?? 0,
    );
  });

  it('weighs an abandoned item (low progress, stale) below a fresh low-progress item, and below any finished item', () => {
    const items = [
      book('finished', { title: 'F', genres: ['Horror'] }),
      book('fresh-low', { title: 'L', genres: ['Adventure'] }),
      book('abandoned', { title: 'A', genres: ['Cooking'] }),
    ];
    const profile = buildTasteProfile(
      [
        signal('finished', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS }),
        signal('fresh-low', { progress: 0.15, isFinished: false, lastActivityAt: NOW - DAY_MS }),
        signal('abandoned', {
          progress: 0.15,
          isFinished: false,
          lastActivityAt: NOW - 500 * DAY_MS,
        }),
      ],
      items,
      { now: NOW },
    );
    const finishedW = profile.affinities.genre['Horror'] ?? 0;
    const freshLowW = profile.affinities.genre['Adventure'] ?? 0;
    const abandonedW = profile.affinities.genre['Cooking'] ?? 0;
    expect(abandonedW).toBeLessThan(freshLowW);
    expect(abandonedW).toBeLessThan(finishedW);
    expect(freshLowW).toBeLessThan(finishedW);
  });

  it('includes every item with any signal in knownItemIds, finished or not', () => {
    const items = [book('finished', { title: 'A' }), book('partial', { title: 'B' })];
    const profile = buildTasteProfile(
      [
        signal('finished', { progress: 1, isFinished: true, lastActivityAt: NOW }),
        signal('partial', { progress: 0.05, isFinished: false, lastActivityAt: NOW }),
      ],
      items,
      { now: NOW },
    );
    expect(profile.knownItemIds.sort()).toEqual(['finished', 'partial']);
  });

  it('returns a valid empty profile for no signals, never throwing', () => {
    const profile = buildTasteProfile([], [], { now: NOW });
    expect(profile.totalSignal).toBe(0);
    expect(profile.knownItemIds).toEqual([]);
    expect(profile.seeds).toEqual([]);
    expect(profile.affinities.genre).toEqual({});
    expect(profile.affinities.author).toEqual({});
    expect(profile.affinities.narrator).toEqual({});
    expect(profile.affinities.series).toEqual({});
  });

  it('degrades malformed input rather than throwing: NaN progress, and duplicate signals for one item', () => {
    const items = [book('dup', { title: 'A', genres: ['Fantasy'] })];
    expect(() =>
      buildTasteProfile(
        [
          signal('dup', { progress: Number.NaN, isFinished: false, lastActivityAt: NOW }),
          signal('dup', { progress: 0.9, isFinished: false, lastActivityAt: NOW }),
        ],
        items,
        { now: NOW },
      ),
    ).not.toThrow();
    const profile = buildTasteProfile(
      [
        signal('dup', { progress: Number.NaN, isFinished: false, lastActivityAt: NOW }),
        signal('dup', { progress: 0.9, isFinished: false, lastActivityAt: NOW }),
      ],
      items,
      { now: NOW },
    );
    // The item appears exactly once in knownItemIds despite two signals.
    expect(profile.knownItemIds).toEqual(['dup']);
    expect(Number.isFinite(profile.affinities.genre['Fantasy'] ?? 0)).toBe(true);
  });

  it('skips signals for items not present in the candidate items list, without throwing', () => {
    const items = [book('known', { title: 'A', genres: ['Fantasy'] })];
    expect(() =>
      buildTasteProfile(
        [
          signal('known', { progress: 1, isFinished: true, lastActivityAt: NOW }),
          signal('missing-item', { progress: 1, isFinished: true, lastActivityAt: NOW }),
        ],
        items,
        { now: NOW },
      ),
    ).not.toThrow();
  });
});
