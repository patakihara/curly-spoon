import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDurationLong,
  formatRemaining,
  parseClock,
  percentOf,
  clampTime,
} from './time.js';

describe('formatClock', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(599)).toBe('9:59');
  });

  it('formats hour-and-over durations as h:mm:ss', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(36061)).toBe('10:01:01');
  });

  it('rounds down to the nearest second', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(3599.999)).toBe('59:59');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('formatDurationLong', () => {
  it('describes durations in human units', () => {
    expect(formatDurationLong(0)).toBe('0m');
    expect(formatDurationLong(59)).toBe('0m');
    expect(formatDurationLong(60)).toBe('1m');
    expect(formatDurationLong(3600)).toBe('1h');
    expect(formatDurationLong(3660)).toBe('1h 1m');
    expect(formatDurationLong(45296)).toBe('12h 34m');
  });

  it('never renders a bare hour count with zero minutes', () => {
    expect(formatDurationLong(7200)).toBe('2h');
  });
});

describe('formatRemaining', () => {
  it('reports the gap between position and duration', () => {
    expect(formatRemaining(0, 3600)).toBe('1h left');
    expect(formatRemaining(1800, 3600)).toBe('30m left');
    expect(formatRemaining(3600, 3600)).toBe('Finished');
  });

  it('treats an overrun position as finished', () => {
    expect(formatRemaining(4000, 3600)).toBe('Finished');
  });

  it('falls back gracefully when duration is unknown', () => {
    expect(formatRemaining(10, 0)).toBe('');
  });
});

describe('parseClock', () => {
  it('parses m:ss and h:mm:ss', () => {
    expect(parseClock('0:09')).toBe(9);
    expect(parseClock('1:05')).toBe(65);
    expect(parseClock('1:01:01')).toBe(3661);
  });

  it('parses bare seconds', () => {
    expect(parseClock('42')).toBe(42);
  });

  it('returns null for malformed input', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1:2:3:4')).toBeNull();
  });
});

describe('percentOf', () => {
  it('returns a 0..1 ratio', () => {
    expect(percentOf(50, 100)).toBe(0.5);
    expect(percentOf(0, 100)).toBe(0);
    expect(percentOf(100, 100)).toBe(1);
  });

  it('clamps out-of-range values and guards divide-by-zero', () => {
    expect(percentOf(150, 100)).toBe(1);
    expect(percentOf(-5, 100)).toBe(0);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe('clampTime', () => {
  it('keeps a seek position inside the media', () => {
    expect(clampTime(-10, 100)).toBe(0);
    expect(clampTime(50, 100)).toBe(50);
    expect(clampTime(120, 100)).toBe(100);
  });
});
