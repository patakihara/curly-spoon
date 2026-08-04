import { describe, expect, it } from 'vitest';
import type { JellyfinTrack } from '../../api/types.js';
import { albumQueue } from './queue.js';

function track(overrides: Partial<JellyfinTrack> = {}): JellyfinTrack {
  return {
    id: 'track-1',
    name: 'Track One',
    albumId: 'album-1',
    albumName: 'Album',
    artistNames: ['Artist'],
    trackNumber: 1,
    discNumber: null,
    durationSeconds: 180,
    imageTag: null,
    genres: [],
    ...overrides,
  };
}

describe('albumQueue', () => {
  it('lays tracks out end to end on one cumulative timeline', () => {
    const queue = albumQueue([
      track({ id: 't1', name: 'One', durationSeconds: 180 }),
      track({ id: 't2', name: 'Two', durationSeconds: 200 }),
      track({ id: 't3', name: 'Three', durationSeconds: 150 }),
    ]);

    expect(queue.audioTracks).toEqual([
      { index: 0, startOffset: 0, duration: 180, title: 'One', contentUrl: 't1', mimeType: null },
      {
        index: 1,
        startOffset: 180,
        duration: 200,
        title: 'Two',
        contentUrl: 't2',
        mimeType: null,
      },
      {
        index: 2,
        startOffset: 380,
        duration: 150,
        title: 'Three',
        contentUrl: 't3',
        mimeType: null,
      },
    ]);
    expect(queue.duration).toBe(530);
  });

  it('degrades a track with an unknown duration to zero seconds, rather than breaking every later offset', () => {
    const queue = albumQueue([
      track({ id: 't1', durationSeconds: 180 }),
      track({ id: 't2', durationSeconds: null }),
      track({ id: 't3', durationSeconds: 100 }),
    ]);

    expect(queue.audioTracks[1]).toMatchObject({ startOffset: 180, duration: 0 });
    expect(queue.audioTracks[2]).toMatchObject({ startOffset: 180 });
    expect(queue.duration).toBe(280);
  });

  it('returns an empty queue for an empty track list', () => {
    expect(albumQueue([])).toEqual({ audioTracks: [], duration: 0 });
  });
});
