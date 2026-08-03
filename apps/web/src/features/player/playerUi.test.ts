import { describe, expect, it } from 'vitest';
import {
  defaultBookmarkTitle,
  endOfChapterMs,
  formatRemaining,
  remainingSeconds,
} from './playerUi.js';

const chapters = [
  { id: 1, start: 0, end: 100, title: 'Chapter One' },
  { id: 2, start: 100, end: 250, title: 'Chapter Two' },
];

describe('remainingSeconds', () => {
  it('subtracts elapsed time from duration', () => {
    expect(remainingSeconds(30, 100)).toBe(70);
  });

  it('never goes negative when currentTime overshoots duration', () => {
    expect(remainingSeconds(150, 100)).toBe(0);
  });

  it('is zero when nothing is loaded (duration 0)', () => {
    expect(remainingSeconds(0, 0)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('prefixes the formatted duration with a minus sign', () => {
    expect(formatRemaining(30, 100)).toBe('-1:10');
  });

  it('reads "-0:00" at the very end rather than "-0:00" flipping positive', () => {
    expect(formatRemaining(100, 100)).toBe('-0:00');
  });

  it('reads "-0:00" when duration is 0', () => {
    expect(formatRemaining(0, 0)).toBe('-0:00');
  });
});

describe('endOfChapterMs', () => {
  it('is the distance in ms to the current chapter’s end', () => {
    expect(endOfChapterMs(chapters, 40)).toBe(60_000);
  });

  it('is zero, not negative, exactly on a chapter boundary', () => {
    expect(endOfChapterMs(chapters, 250)).toBe(0);
  });

  it('is null when there is no current chapter', () => {
    expect(endOfChapterMs([], 40)).toBeNull();
  });
});

describe('defaultBookmarkTitle', () => {
  it('uses the current chapter’s title when one exists', () => {
    expect(defaultBookmarkTitle(chapters, 40)).toBe('Chapter One');
  });

  it('falls back to a formatted timestamp with no chapter data', () => {
    expect(defaultBookmarkTitle([], 90)).toBe('1:30');
  });
});
