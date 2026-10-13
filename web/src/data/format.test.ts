import { describe, expect, it } from 'vitest';
import { artAt, clock, day, emptied, span } from './format';

describe('[M1.shell] how the pages write times, lengths and dates', () => {
  it('writes a place in an item as a clock: minutes and seconds, with hours once there are any', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(5.04)).toBe('0:05');
    expect(clock(242)).toBe('4:02');
    expect(clock(3120)).toBe('52:00');
    expect(clock(3840)).toBe('1:04:00');
  });

  it('writes a length in words: seconds under a minute, then minutes, then hours and minutes', () => {
    expect(span(5.04)).toBe('5 s');
    expect(span(1080)).toBe('18 min');
    expect(span(3720)).toBe('1 h 2 m');
    expect(span(42_000)).toBe('11 h 40 m');
  });

  it('writes a publishing date as the day, the month and the year', () => {
    expect(day(Date.UTC(2026, 7, 12, 23, 30))).toBe('12 Aug 2026');
  });

  it('asks for art at the size it is drawn, and for none where there is none', () => {
    expect(artAt('/api/media/abs:b/art', 'medium')).toBe('/api/media/abs:b/art?size=medium');
    expect(artAt(null, 'small')).toBe('');
  });

  it('empties a page’s shape while it loads: no lists, no words, no numbers', () => {
    const page = {
      title: 'The Salt Road',
      progress: 0.4,
      rating: { value: 4.6, count: 12 },
      chapters: [{ title: 'One' }],
      series: { label: 'The Quartet', ref: 'q' },
      following: true,
      status: null,
    };
    expect(emptied(page)).toEqual({
      title: '',
      progress: 0,
      rating: { value: 0, count: 0 },
      chapters: [],
      series: { label: '', ref: '' },
      following: false,
      status: null,
    });
  });
});
