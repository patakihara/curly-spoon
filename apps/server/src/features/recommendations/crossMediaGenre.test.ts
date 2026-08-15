import { describe, expect, it } from 'vitest';
import { buildTasteProfile } from './profile.js';
import { mergeGenreAffinity, CROSS_MEDIA_GENRE_WEIGHT } from './crossMediaGenre.js';
import { book, signal, NOW } from './testFixtures.js';
import type { RecommendationCandidate } from './types.js';

/** A minimal music candidate, shaped like `adaptMusic.ts`'s `albumToCandidate` output —
 * this test lives in the pure-core layer and doesn't need the real Jellyfin types. */
function album(id: string, genres: string[]): RecommendationCandidate {
  return {
    id,
    media: { kind: 'album', title: `Album ${id}`, genres, authors: [], series: [], narrator: null },
  };
}

describe('mergeGenreAffinity', () => {
  it('folds a matching genre from the source profile into the target, scaled by weightFactor', () => {
    // Fantasy is shared between a book seed and a music seed — the one case this
    // mechanism is meant to catch, per crossMediaGenre.ts's own doc comment about how
    // thin real-world overlap is expected to be.
    const bookProfile = buildTasteProfile(
      [signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW })],
      [book('seed-finished', { title: 'Ashes of Aeon', genres: ['Fantasy'] })],
      { now: NOW },
    );
    const musicProfile = buildTasteProfile(
      [signal('album-fantasy-soundtrack', { progress: 1, isFinished: true, lastActivityAt: NOW })],
      [album('album-fantasy-soundtrack', ['Fantasy'])],
      { now: NOW },
    );

    const bookGenreBefore = bookProfile.affinities.genre.Fantasy ?? 0;
    const musicGenreWeight = musicProfile.affinities.genre.Fantasy ?? 0;
    expect(bookGenreBefore).toBeGreaterThan(0);
    expect(musicGenreWeight).toBeGreaterThan(0);

    const merged = mergeGenreAffinity(bookProfile, musicProfile, {
      weightFactor: CROSS_MEDIA_GENRE_WEIGHT,
    });

    expect(merged.affinities.genre.Fantasy).toBeCloseTo(
      bookGenreBefore + musicGenreWeight * CROSS_MEDIA_GENRE_WEIGHT,
    );
  });

  it('does not increase totalSignal — cross-media evidence must not pass a same-medium cold-start gate', () => {
    const bookProfile = buildTasteProfile([], [], { now: NOW }); // cold start, totalSignal 0
    const musicProfile = buildTasteProfile(
      [signal('album-a', { progress: 1, isFinished: true, lastActivityAt: NOW })],
      [album('album-a', ['Rock'])],
      { now: NOW },
    );

    const merged = mergeGenreAffinity(bookProfile, musicProfile, { weightFactor: 1 });
    expect(merged.totalSignal).toBe(0);
  });

  it('leaves the target unchanged when the source has no signal', () => {
    const bookProfile = buildTasteProfile(
      [signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW })],
      [book('seed-finished', { title: 'Ashes of Aeon', genres: ['Fantasy'] })],
      { now: NOW },
    );
    const emptyMusicProfile = buildTasteProfile([], [], { now: NOW });

    const merged = mergeGenreAffinity(bookProfile, emptyMusicProfile, { weightFactor: 1 });
    expect(merged).toEqual(bookProfile);
  });

  it('never introduces an author/narrator/series affinity from the source — genre only', () => {
    const bookProfile = buildTasteProfile([], [], { now: NOW });
    const musicSignal = signal('album-a', { progress: 1, isFinished: true, lastActivityAt: NOW });
    const musicCandidate: RecommendationCandidate = {
      id: 'album-a',
      media: {
        kind: 'album',
        title: 'Album A',
        genres: ['Jazz'],
        authors: [{ name: 'Some Artist' }],
        series: [],
        narrator: null,
      },
    };
    const musicProfile = buildTasteProfile([musicSignal], [musicCandidate], { now: NOW });

    const merged = mergeGenreAffinity(bookProfile, musicProfile, { weightFactor: 1 });
    expect(merged.affinities.author).toEqual({});
    expect(merged.affinities.narrator).toEqual({});
    expect(merged.affinities.series).toEqual({});
    expect(merged.affinities.genre.Jazz).toBeGreaterThan(0);
  });

  it("prefers the target's own facet seed over the source's when both have one for the same genre", () => {
    const bookProfile = buildTasteProfile(
      [signal('seed-finished', { progress: 1, isFinished: true, lastActivityAt: NOW })],
      [book('seed-finished', { title: 'Ashes of Aeon', genres: ['Fantasy'] })],
      { now: NOW },
    );
    const musicProfile = buildTasteProfile(
      [signal('album-fantasy-soundtrack', { progress: 1, isFinished: true, lastActivityAt: NOW })],
      [album('album-fantasy-soundtrack', ['Fantasy'])],
      { now: NOW },
    );

    const merged = mergeGenreAffinity(bookProfile, musicProfile, { weightFactor: 1 });
    expect(merged.facetSeeds.genre.Fantasy?.itemId).toBe('seed-finished');
  });
});
