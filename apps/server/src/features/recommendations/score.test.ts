import { describe, expect, it } from 'vitest';
import { buildTasteProfile } from './profile.js';
import { scoreCandidates } from './score.js';
import { book, signal, library, DAY_MS, NOW } from './testFixtures.js';

function baseProfile() {
  return buildTasteProfile(
    [signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS })],
    library,
    { now: NOW },
  );
}

describe('scoreCandidates', () => {
  it('ranks an item sharing a genre with a high-weight seed above one sharing nothing', () => {
    const profile = baseProfile();
    const scored = scoreCandidates(profile, [
      library.find((i) => i.id === 'cand-genre-match')!,
      library.find((i) => i.id === 'cand-no-match')!,
    ]);
    const genreMatch = scored.find((s) => s.itemId === 'cand-genre-match');
    const noMatch = scored.find((s) => s.itemId === 'cand-no-match');
    expect(genreMatch).toBeDefined();
    expect(noMatch).toBeUndefined(); // zero-score items are excluded entirely
  });

  it('never returns an item that is in profile.knownItemIds', () => {
    const profile = buildTasteProfile(
      [
        signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS }),
        // The user has *some* progress on this candidate too — it must never come back.
        signal('cand-genre-match', {
          progress: 0.5,
          isFinished: false,
          lastActivityAt: NOW - DAY_MS,
        }),
      ],
      library,
      { now: NOW },
    );
    const scored = scoreCandidates(profile, library);
    expect(scored.some((s) => s.itemId === 'cand-genre-match')).toBe(false);
    expect(profile.knownItemIds).toContain('cand-genre-match');
  });

  it('gives every returned item at least one reason; zero-facet-match items score zero and are excluded', () => {
    const profile = baseProfile();
    const scored = scoreCandidates(profile, library);
    for (const item of scored) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.score).toBeGreaterThan(0);
    }
    expect(scored.some((s) => s.itemId === 'cand-no-match')).toBe(false);
    expect(scored.some((s) => s.itemId === 'cand-no-match-2')).toBe(false);
  });

  it('orders deterministically: equal scores tie-break on itemId ascending', () => {
    // Two candidates engineered to have the exact same score against the profile.
    const items = [
      book('z-item', { title: 'Z', genres: ['Fantasy'] }),
      book('a-item', { title: 'A', genres: ['Fantasy'] }),
    ];
    const profile = buildTasteProfile(
      [signal('seed', { progress: 1, isFinished: true, lastActivityAt: NOW - DAY_MS })],
      [book('seed', { title: 'Seed', genres: ['Fantasy'] }), ...items],
      { now: NOW },
    );
    const scored = scoreCandidates(profile, items);
    expect(scored.map((s) => s.itemId)).toEqual(['a-item', 'z-item']);
  });

  it('is deterministic across repeated calls with the same input (no Math.random)', () => {
    const profile = baseProfile();
    const first = scoreCandidates(profile, library).map((s) => s.itemId);
    const second = scoreCandidates(profile, library).map((s) => s.itemId);
    expect(first).toEqual(second);
  });

  it('returns [] for a cold-start profile (totalSignal === 0), never throwing', () => {
    const profile = buildTasteProfile([], library, { now: NOW });
    expect(profile.totalSignal).toBe(0);
    expect(() => scoreCandidates(profile, library)).not.toThrow();
    expect(scoreCandidates(profile, library)).toEqual([]);
  });
});
