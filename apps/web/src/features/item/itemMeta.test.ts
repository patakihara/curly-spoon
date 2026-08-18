import { describe, expect, it } from 'vitest';
import { composeItemMeta, formatDurationLong } from './itemMeta.js';

describe('formatDurationLong', () => {
  it('renders hours and minutes above an hour', () => {
    expect(formatDurationLong(19 * 3600 + 7 * 60)).toBe('19 h 07 m');
  });

  it('renders minutes only below an hour', () => {
    expect(formatDurationLong(7 * 60)).toBe('7 m');
  });

  it('rounds to the nearest minute', () => {
    expect(formatDurationLong(90)).toBe('2 m');
  });
});

describe('composeItemMeta', () => {
  it('joins every field, in order, matching the design example', () => {
    expect(
      composeItemMeta({
        narrator: 'Rob Inglis',
        durationSeconds: 19 * 3600 + 7 * 60,
        chapterCount: 24,
        progressPercent: 38,
      }),
    ).toBe('Narrated by Rob Inglis · 19 h 07 m · 24 chapters · 38% listened');
  });

  it('renders an empty string for an item with no fields at all', () => {
    expect(composeItemMeta({})).toBe('');
  });

  it('renders a single field with no separator artifacts', () => {
    expect(composeItemMeta({ chapterCount: 2 })).toBe('2 chapters');
  });

  it('omits missing fields with no stray "· ·" between the ones present', () => {
    expect(composeItemMeta({ narrator: 'Simon Vance', progressPercent: 0 })).toBe(
      'Narrated by Simon Vance · 0% listened',
    );
  });

  it('drops a zero duration rather than rendering "0 m"', () => {
    expect(composeItemMeta({ durationSeconds: 0, chapterCount: 1 })).toBe('1 chapter');
  });

  it('singularizes exactly one chapter', () => {
    expect(composeItemMeta({ chapterCount: 1 })).toBe('1 chapter');
  });
});
