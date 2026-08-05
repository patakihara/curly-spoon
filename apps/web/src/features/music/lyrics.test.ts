import { describe, expect, it } from 'vitest';
import { activeLineIndex, activeLyric } from './lyrics.js';
import type { AudioTrack, JellyfinLyricLine } from '../../api/types.js';

const lines: JellyfinLyricLine[] = [
  { text: 'First line', startSeconds: 0 },
  { text: 'Second line', startSeconds: 10 },
  { text: 'Third line', startSeconds: 20 },
];

describe('activeLineIndex', () => {
  it('returns null on an empty line list', () => {
    expect(activeLineIndex([], 5)).toBeNull();
  });

  it('returns null before the first line’s start', () => {
    expect(activeLineIndex(lines, -1)).toBeNull();
  });

  it('activates a line exactly at its own start timestamp — the boundary is inclusive', () => {
    expect(activeLineIndex(lines, 10)).toBe(1);
  });

  it('stays on the last-passed line between two timestamps', () => {
    expect(activeLineIndex(lines, 15)).toBe(1);
  });

  it('resolves to the last line for a position past the end of the lyrics', () => {
    expect(activeLineIndex(lines, 999)).toBe(2);
  });

  it('resolves the only line of a single-line lyric once its start has passed', () => {
    const single: JellyfinLyricLine[] = [{ text: 'Only line', startSeconds: 5 }];
    expect(activeLineIndex(single, 0)).toBeNull();
    expect(activeLineIndex(single, 5)).toBe(0);
  });

  it('never selects an unsynced (null startSeconds) line, and does not let it reset the running answer', () => {
    // Malformed/hypothetical input — real Jellyfin responses are never a mix (see this
    // module's own doc comment) — but activeLineIndex must still degrade sanely rather
    // than throwing or mis-highlighting.
    const mixed: JellyfinLyricLine[] = [
      { text: 'Timed', startSeconds: 0 },
      { text: 'Untimed', startSeconds: null },
      { text: 'Also timed', startSeconds: 8 },
    ];
    expect(activeLineIndex(mixed, 3)).toBe(0);
    expect(activeLineIndex(mixed, 9)).toBe(2);
  });

  it('returns null throughout an entirely unsynced lyric (every line null)', () => {
    const unsynced: JellyfinLyricLine[] = [
      { text: 'a', startSeconds: null },
      { text: 'b', startSeconds: null },
    ];
    expect(activeLineIndex(unsynced, 0)).toBeNull();
    expect(activeLineIndex(unsynced, 1000)).toBeNull();
  });
});

/** Three tracks laid end to end on one cumulative timeline, same shape
 * `features/music/musicQueue.ts`'s `materialize` produces. `contentUrl` carries each track's
 * Jellyfin item id — see `AudioTrack.contentUrl`'s own doc comment. */
function queueTrack(
  index: number,
  startOffset: number,
  duration: number,
  itemId: string,
): AudioTrack {
  return {
    index,
    startOffset,
    duration,
    title: `Track ${index}`,
    contentUrl: itemId,
    mimeType: null,
  };
}

describe('activeLyric', () => {
  // track-a: 0s-200s, track-b: 200s-380s (180s long), track-c: 380s-600s.
  const audioTracks: AudioTrack[] = [
    queueTrack(0, 0, 200, 'track-a'),
    queueTrack(1, 200, 180, 'track-b'),
    queueTrack(2, 380, 220, 'track-c'),
  ];

  it('maps a queue-cumulative position in the middle track to that track’s own in-track offset, not the raw queue time', () => {
    // currentTime = 250 is 50s into track-b (200 + 50), never 250s into track-b's own
    // (180s) lyrics — the bug this test exists to catch is using 250 directly against
    // track-b's per-track timestamps, which would silently drift more the deeper into
    // an album playback goes.
    const trackBLines: JellyfinLyricLine[] = [
      { text: 'b line 1', startSeconds: 0 },
      { text: 'b line 2', startSeconds: 50 },
      { text: 'b line 3', startSeconds: 120 },
    ];
    const result = activeLyric(audioTracks, 250, trackBLines);
    expect(result).toEqual({ itemId: 'track-b', lineIndex: 1 });
  });

  it('resolves the first track at the very start of the queue', () => {
    const trackALines: JellyfinLyricLine[] = [{ text: 'a line 1', startSeconds: 0 }];
    expect(activeLyric(audioTracks, 0, trackALines)).toEqual({ itemId: 'track-a', lineIndex: 0 });
  });

  it('resolves the last track near the end of the queue', () => {
    // currentTime = 590 is 210s into track-c (380 + 210).
    const trackCLines: JellyfinLyricLine[] = [
      { text: 'c line 1', startSeconds: 0 },
      { text: 'c line 2', startSeconds: 205 },
    ];
    expect(activeLyric(audioTracks, 590, trackCLines)).toEqual({ itemId: 'track-c', lineIndex: 1 });
  });

  it('returns null lineIndex (not a crash) when the resolved track’s position is before its lyrics’ first timestamp', () => {
    const trackBLines: JellyfinLyricLine[] = [{ text: 'b line 1', startSeconds: 100 }];
    // currentTime = 210 -> 10s into track-b, before its only line's 100s start.
    expect(activeLyric(audioTracks, 210, trackBLines)).toEqual({
      itemId: 'track-b',
      lineIndex: null,
    });
  });

  it('returns null for an empty queue', () => {
    expect(activeLyric([], 10, lines)).toBeNull();
  });
});
