import { describe, expect, it } from 'vitest';
import type { AudioTrack, Chapter } from '../../api/types.js';
import {
  chapterAt,
  clampSeek,
  fileIdFromContentUrl,
  formatDuration,
  isSkipInterval,
  nextRate,
  sleepTimerRemaining,
  trackAt,
} from './playback.js';

const chapters: Chapter[] = [
  { id: 1, start: 0, end: 630, title: 'Part One' },
  { id: 2, start: 630, end: 1260, title: 'Part Two' },
  { id: 3, start: 1260, end: 1800, title: 'Part Three' },
];

describe('chapterAt', () => {
  it('returns the chapter containing the given time', () => {
    expect(chapterAt(chapters, 700)).toEqual(chapters[1]);
  });

  it('returns the last chapter for a time past the final chapter start', () => {
    expect(chapterAt(chapters, 999_999)).toEqual(chapters[2]);
  });

  it('returns undefined for an empty chapter list', () => {
    expect(chapterAt([], 100)).toBeUndefined();
  });

  it('assigns a time exactly on a chapter boundary to the chapter starting there', () => {
    // 630 is simultaneously "Part One" ending and "Part Two" starting — the
    // starting chapter wins, matching how a scrub to a chapter's `start` should
    // land the reader inside that chapter, not the tail of the previous one.
    expect(chapterAt(chapters, 630)).toEqual(chapters[1]);
  });

  it('returns undefined for a time before the first chapter starts', () => {
    const laterStart: Chapter[] = [{ id: 1, start: 10, end: 20, title: 'Intro' }];
    expect(chapterAt(laterStart, 5)).toBeUndefined();
  });
});

const tracks: AudioTrack[] = [
  {
    index: 0,
    startOffset: 0,
    duration: 630,
    title: 'Part One',
    contentUrl: '/api/items/item-dune/file/file-dune-1',
    mimeType: 'audio/mp4',
  },
  {
    index: 1,
    startOffset: 630,
    duration: 630,
    title: 'Part Two',
    contentUrl: '/api/items/item-dune/file/file-dune-2',
    mimeType: 'audio/mp4',
  },
];

describe('trackAt', () => {
  it('returns the right track and the offset within it for a multi-track book', () => {
    expect(trackAt(tracks, 700)).toEqual({ track: tracks[1], offsetInTrack: 70 });
  });

  it('returns the first track with a zero offset at time zero', () => {
    expect(trackAt(tracks, 0)).toEqual({ track: tracks[0], offsetInTrack: 0 });
  });

  it('returns undefined for an empty track list', () => {
    expect(trackAt([], 100)).toBeUndefined();
  });
});

describe('clampSeek', () => {
  it('clamps to the [0, duration] range', () => {
    expect(clampSeek(-5, 100)).toBe(0);
    expect(clampSeek(150, 100)).toBe(100);
    expect(clampSeek(50, 100)).toBe(50);
  });

  it('returns 0 for a NaN duration', () => {
    expect(clampSeek(50, Number.NaN)).toBe(0);
  });

  it('returns 0 for a negative duration', () => {
    expect(clampSeek(50, -1)).toBe(0);
  });

  it('returns 0 for a NaN time', () => {
    expect(clampSeek(Number.NaN, 100)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('omits the hour segment under an hour', () => {
    expect(formatDuration(123)).toBe('2:03');
  });

  it('zero-pads minutes and seconds once an hour is included', () => {
    expect(formatDuration(3723)).toBe('1:02:03');
  });

  it('does not zero-pad the leading minute when under an hour', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('returns "0:00" for NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });

  it('returns "0:00" for a negative value', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('nextRate', () => {
  it('steps forward through the cycle', () => {
    expect(nextRate(1, 1)).toBe(1.25);
  });

  it('steps backward through the cycle', () => {
    expect(nextRate(1, -1)).toBe(0.75);
  });

  it('does not run off the top end', () => {
    expect(nextRate(2, 1)).toBe(2);
  });

  it('does not run off the bottom end', () => {
    expect(nextRate(0.75, -1)).toBe(0.75);
  });

  it('treats an unrecognised current rate as if it were 1x', () => {
    expect(nextRate(3, 1)).toBe(1.25);
  });
});

describe('sleepTimerRemaining', () => {
  it('returns null when no timer is set', () => {
    expect(sleepTimerRemaining(null, 1_000)).toBeNull();
  });

  it('returns the remaining milliseconds', () => {
    expect(sleepTimerRemaining(10_000, 4_000)).toBe(6_000);
  });

  it('never returns a negative number once the deadline has passed', () => {
    expect(sleepTimerRemaining(1_000, 5_000)).toBe(0);
  });
});

describe('isSkipInterval', () => {
  it.each([10, 15, 20, 30])('accepts %d as a valid skip interval', (n) => {
    expect(isSkipInterval(n)).toBe(true);
  });

  it('rejects a number outside the supported set', () => {
    expect(isSkipInterval(45)).toBe(false);
  });

  it('rejects a numeric string', () => {
    expect(isSkipInterval('30')).toBe(false);
  });

  it('rejects null', () => {
    expect(isSkipInterval(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isSkipInterval(undefined)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isSkipInterval(Number.NaN)).toBe(false);
  });
});

describe('fileIdFromContentUrl', () => {
  it('extracts the last path segment as the fileId', () => {
    expect(fileIdFromContentUrl('/api/items/item-dune/file/file-dune-1')).toBe('file-dune-1');
  });

  it('returns null for null input', () => {
    expect(fileIdFromContentUrl(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(fileIdFromContentUrl('')).toBeNull();
  });
});
