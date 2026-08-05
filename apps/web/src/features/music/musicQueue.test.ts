import { describe, expect, it } from 'vitest';
import {
  advance,
  appendTracks,
  createQueue,
  currentTrack,
  materialize,
  nextRepeatMode,
  setRepeatMode,
  setShuffled,
  toQueueTrack,
  type QueueTrack,
} from './musicQueue.js';

function tracks(n: number): QueueTrack[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `Track ${i}`,
    durationSeconds: 100,
  }));
}

/** Deterministic stand-in for `Math.random` — cycles through a fixed sequence so shuffle
 *  tests never flake, and so a broken (non-shuffling) implementation can't pass by accident:
 *  a constant `random` would make `fisherYates` always swap with index 0, which still counts
 *  as *a* permutation but hides bugs in the swap loop itself. */
function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length] ?? 0;
    i += 1;
    return value;
  };
}

describe('toQueueTrack', () => {
  it('maps a JellyfinTrack-shaped object to a QueueTrack, joining its artistNames', () => {
    expect(
      toQueueTrack({ id: 'a', name: 'A', durationSeconds: 42, artistNames: ['Radiohead'] }),
    ).toEqual({
      id: 'a',
      title: 'A',
      durationSeconds: 42,
      artist: 'Radiohead',
    });
  });

  it('joins multiple artistNames with ", "', () => {
    expect(
      toQueueTrack({
        id: 'b',
        name: 'B',
        durationSeconds: 10,
        artistNames: ['Artist One', 'Artist Two'],
      }).artist,
    ).toBe('Artist One, Artist Two');
  });

  // Regression guard: `[].join(', ')` is `''`, a *defined* value that would defeat a
  // `track.artist || fallback` check downstream (`playerUi.ts`'s `playerDisplayMeta`) and
  // produce a blank artist line instead of the intended album/playlist fallback — worse than
  // the bug this fix addresses. Must normalize to `null`, not `''`.
  it('normalizes an empty artistNames array to null, not an empty string', () => {
    expect(toQueueTrack({ id: 'c', name: 'C', durationSeconds: 5, artistNames: [] }).artist).toBe(
      null,
    );
  });
});

describe('createQueue', () => {
  it('starts unshuffled, repeat off, cursor at the given start index', () => {
    const state = createQueue(tracks(3), 3, 1);
    expect(state.shuffled).toBe(false);
    expect(state.repeat).toBe('off');
    expect(state.positions).toEqual([0, 1, 2]);
    expect(state.cursor).toBe(1);
    expect(currentTrack(state)?.id).toBe('t1');
  });

  it('clamps an out-of-range start index instead of producing an invalid cursor', () => {
    expect(createQueue(tracks(3), 3, 99).cursor).toBe(2);
    expect(createQueue(tracks(3), 3, -5).cursor).toBe(0);
    expect(createQueue([], 0, 0).cursor).toBe(0);
  });
});

describe('setShuffled', () => {
  it('does not change the current track', () => {
    const state = createQueue(tracks(6), 6, 2);
    const before = currentTrack(state);
    const shuffled = setShuffled(state, true, sequenceRandom([0.9, 0.1, 0.5, 0.2]));
    expect(currentTrack(shuffled)).toEqual(before);
    expect(shuffled.positions[shuffled.cursor]).toBe(state.positions[state.cursor]);
  });

  it('leaves history and the current track in their original positions', () => {
    const state = createQueue(tracks(6), 6, 2);
    const shuffled = setShuffled(state, true, sequenceRandom([0.9, 0.1, 0.5, 0.2]));
    expect(shuffled.positions.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it('actually reorders the upcoming tracks (not an identity no-op)', () => {
    const state = createQueue(tracks(8), 8, 0);
    const shuffled = setShuffled(state, true, sequenceRandom([0.9, 0.2, 0.7, 0.4, 0.1, 0.6, 0.3]));
    expect(shuffled.positions.slice(1)).not.toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Still a permutation of the same set — nothing dropped or duplicated.
    expect([...shuffled.positions].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('unshuffling restores the exact original order, including tracks already passed', () => {
    const state = createQueue(tracks(6), 6, 3);
    const shuffled = setShuffled(state, true, sequenceRandom([0.9, 0.1, 0.5]));
    const restored = setShuffled(shuffled, false);
    expect(restored.positions).toEqual([0, 1, 2, 3, 4, 5]);
    expect(restored.shuffled).toBe(false);
    expect(currentTrack(restored)?.id).toBe('t3');
    expect(restored.order).toEqual(state.order);
  });

  it('is idempotent — shuffling twice or unshuffling twice is a no-op', () => {
    const state = createQueue(tracks(4), 4, 0);
    const shuffled = setShuffled(state, true, sequenceRandom([0.5]));
    expect(setShuffled(shuffled, true)).toBe(shuffled);
    expect(setShuffled(state, false)).toBe(state);
  });
});

describe('setRepeatMode / nextRepeatMode', () => {
  it('cycles off -> all -> one -> off', () => {
    expect(nextRepeatMode('off')).toBe('all');
    expect(nextRepeatMode('all')).toBe('one');
    expect(nextRepeatMode('one')).toBe('off');
  });

  it('setRepeatMode is a plain setter, unaffected by shuffle', () => {
    const state = createQueue(tracks(3), 3, 0);
    expect(setRepeatMode(state, 'all').repeat).toBe('all');
  });
});

describe('advance', () => {
  it('walks forward through the loaded queue in order', () => {
    const state = createQueue(tracks(3), 3, 0);
    const first = advance(state);
    expect(first.kind).toBe('track');
    if (first.kind !== 'track') throw new Error('expected a track');
    expect(first.track.id).toBe('t1');
    const second = advance(first.state);
    if (second.kind !== 'track') throw new Error('expected a track');
    expect(second.track.id).toBe('t2');
  });

  it('repeat "one" always repeats the current track, without moving the cursor', () => {
    const state = setRepeatMode(createQueue(tracks(3), 3, 1), 'one');
    const result = advance(state);
    expect(result).toEqual({ kind: 'track', state, track: state.order[1] });
  });

  it('repeat "off" at the end of a fully-loaded queue reports nothing next', () => {
    const state = createQueue(tracks(2), 2, 1); // already at the last track
    expect(advance(state)).toEqual({ kind: 'none' });
  });

  it('repeat "all" wraps from the end back to the start', () => {
    const state = setRepeatMode(createQueue(tracks(2), 2, 1), 'all');
    const result = advance(state);
    if (result.kind !== 'track') throw new Error('expected a track');
    expect(result.track.id).toBe('t0');
    expect(result.state.cursor).toBe(0);
  });

  it('asks the caller to fetch more before reporting "none" when total exceeds what is loaded', () => {
    const state = createQueue(tracks(2), 5, 1); // 2 loaded, 5 total
    expect(advance(state)).toEqual({ kind: 'needsFetch' });
  });

  it('shuffle + repeat "all" does not replay a track before the cycle completes', () => {
    let state = setRepeatMode(
      setShuffled(createQueue(tracks(5), 5, 0), true, sequenceRandom([0.9, 0.2, 0.7, 0.4])),
      'all',
    );
    const seen = new Set<string>([currentTrack(state)?.id ?? '']);
    for (let i = 0; i < 4; i += 1) {
      const result = advance(state, sequenceRandom([0.1]));
      if (result.kind !== 'track') throw new Error('expected a track mid-cycle');
      seen.add(result.track.id);
      state = result.state;
    }
    // A full cycle (5 tracks) visited every track exactly once.
    expect(seen.size).toBe(5);

    // The next advance wraps into a new cycle — it may legitimately repeat a track from the
    // cycle that just finished, just not one from *this* one.
    const wrapped = advance(state, sequenceRandom([0.3, 0.6, 0.1]));
    expect(wrapped.kind).toBe('track');
  });
});

describe('appendTracks', () => {
  it('extends both the canonical order and the current play order at the tail', () => {
    const state = createQueue(tracks(2), 5, 0);
    const appended = appendTracks(
      state,
      tracks(3).map((t) => ({ ...t, id: `more-${t.id}` })),
    );
    expect(appended.order).toHaveLength(5);
    expect(appended.positions).toEqual([0, 1, 2, 3, 4]);
  });

  it('advancing past the loaded page continues into the newly appended tracks', () => {
    const state = createQueue(tracks(2), 5, 1); // loaded 2 of 5, at the last loaded one
    const needsFetch = advance(state);
    expect(needsFetch).toEqual({ kind: 'needsFetch' });

    const appended = appendTracks(
      state,
      tracks(3).map((t, i) => ({ ...t, id: `page2-${i}` })),
    );
    const result = advance(appended);
    if (result.kind !== 'track') throw new Error('expected a track after appending');
    expect(result.track.id).toBe('page2-0');
  });

  it('is a no-op for an empty append', () => {
    const state = createQueue(tracks(2), 2, 0);
    expect(appendTracks(state, [])).toBe(state);
  });
});

describe('materialize', () => {
  it('lays the current play order out end to end, matching albumQueue for an unshuffled queue', () => {
    const state = createQueue(
      [
        { id: 't1', title: 'One', durationSeconds: 180 },
        { id: 't2', title: 'Two', durationSeconds: 200 },
      ],
      2,
      0,
    );
    const { audioTracks, duration } = materialize(state);
    expect(audioTracks).toEqual([
      {
        index: 0,
        startOffset: 0,
        duration: 180,
        title: 'One',
        contentUrl: 't1',
        mimeType: null,
        artist: null,
      },
      {
        index: 1,
        startOffset: 180,
        duration: 200,
        title: 'Two',
        contentUrl: 't2',
        mimeType: null,
        artist: null,
      },
    ]);
    expect(duration).toBe(380);
  });

  // Regression coverage for the "every track credits the album/playlist artist" bug: a
  // fixture where the track's own artist genuinely differs from what the queue-level
  // fallback would be (`Led Zeppelin` vs `Various Artists`) — a fixture using the same value
  // in both positions would pass even with the fix reverted, which is exactly the false
  // positive this project has shipped before for this bug class.
  it("carries each track's own artist through into the materialized AudioTrack", () => {
    const state = createQueue(
      [
        { id: 't1', title: 'Immigrant Song', durationSeconds: 146, artist: 'Led Zeppelin' },
        { id: 't2', title: 'Unknown Artist Track', durationSeconds: 200, artist: null },
      ],
      2,
      0,
    );
    const { audioTracks } = materialize(state);
    expect(audioTracks[0]?.artist).toBe('Led Zeppelin');
    expect(audioTracks[1]?.artist).toBe(null);
  });

  it('lays tracks out in play order, not array order, once shuffled', () => {
    const state = createQueue(
      [
        { id: 't0', title: 'Zero', durationSeconds: 100 },
        { id: 't1', title: 'One', durationSeconds: 100 },
        { id: 't2', title: 'Two', durationSeconds: 100 },
      ],
      3,
      0,
    );
    const shuffled = { ...state, positions: [0, 2, 1], shuffled: true };
    const { audioTracks } = materialize(shuffled);
    expect(audioTracks.map((t) => t.contentUrl)).toEqual(['t0', 't2', 't1']);
    expect(audioTracks[1]).toMatchObject({ startOffset: 100, contentUrl: 't2' });
  });

  it('degrades a track with an unknown duration to zero seconds', () => {
    const state = createQueue(
      [
        { id: 't1', title: 'One', durationSeconds: 180 },
        { id: 't2', title: 'Two', durationSeconds: null },
      ],
      2,
      0,
    );
    const { audioTracks, duration } = materialize(state);
    expect(audioTracks[1]).toMatchObject({ startOffset: 180, duration: 0 });
    expect(duration).toBe(180);
  });
});
