import { describe, expect, it } from 'vitest';
import { episodeProgressState, findEpisodeProgress } from './episodeProgress.js';
import type { MediaProgress } from '../../api/types.js';

function progress(overrides: Partial<MediaProgress>): MediaProgress {
  return {
    id: 'p1',
    libraryItemId: 'item-dailytech',
    episodeId: 'ep-1',
    duration: 300,
    currentTime: 0,
    progress: 0,
    isFinished: false,
    ...overrides,
  };
}

describe('episodeProgressState', () => {
  it('is "unplayed" when there is no progress record at all', () => {
    expect(episodeProgressState(undefined)).toBe('unplayed');
  });

  it('is "unplayed" when a record exists but nothing has played yet', () => {
    expect(episodeProgressState(progress({ currentTime: 0, isFinished: false }))).toBe('unplayed');
  });

  it('is "in-progress" once some time has played but it is not finished', () => {
    expect(episodeProgressState(progress({ currentTime: 42, isFinished: false }))).toBe(
      'in-progress',
    );
  });

  it('is "played" once Audiobookshelf has marked it finished, even if currentTime is stale', () => {
    expect(episodeProgressState(progress({ currentTime: 0, isFinished: true }))).toBe('played');
  });

  it('prefers "played" over "in-progress" when both would otherwise apply', () => {
    expect(episodeProgressState(progress({ currentTime: 42, isFinished: true }))).toBe('played');
  });
});

describe('findEpisodeProgress', () => {
  const records: MediaProgress[] = [
    progress({ id: 'p1', libraryItemId: 'item-dailytech', episodeId: 'ep-1', currentTime: 10 }),
    progress({ id: 'p2', libraryItemId: 'item-dailytech', episodeId: 'ep-2', currentTime: 20 }),
    // A book's progress record: no episodeId. Must never match an episode lookup.
    progress({ id: 'p3', libraryItemId: 'item-dune', episodeId: null, currentTime: 30 }),
  ];

  it('finds the record matching both the item and the episode', () => {
    const found = findEpisodeProgress(records, 'item-dailytech', 'ep-2');
    expect(found?.id).toBe('p2');
  });

  it('returns undefined when no record matches', () => {
    expect(findEpisodeProgress(records, 'item-dailytech', 'ep-3')).toBeUndefined();
  });

  it('never matches a book-level record (null episodeId) against an episode lookup', () => {
    expect(findEpisodeProgress(records, 'item-dune', 'ep-1')).toBeUndefined();
  });
});
