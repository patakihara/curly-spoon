import { describe, expect, it } from 'vitest';
import { summarizePage } from './pagination.js';

describe('summarizePage', () => {
  it('degrades to a no-pages summary for an empty library rather than throwing', () => {
    const summary = summarizePage({ startIndex: 0, limit: 40 }, 0, 0);
    expect(summary).toMatchObject({
      hasPrevious: false,
      hasNext: false,
      nextStartIndex: null,
      previousStartIndex: null,
      rangeLabel: '0 of 0',
    });
  });

  it('has no previous page and a next page on a full first page', () => {
    const summary = summarizePage({ startIndex: 0, limit: 20 }, 45, 20);
    expect(summary.hasPrevious).toBe(false);
    expect(summary.hasNext).toBe(true);
    expect(summary.nextStartIndex).toBe(20);
    expect(summary.previousStartIndex).toBeNull();
    expect(summary.rangeLabel).toBe('1–20 of 45');
  });

  it('has both a previous and next page in the middle', () => {
    const summary = summarizePage({ startIndex: 20, limit: 20 }, 45, 20);
    expect(summary.hasPrevious).toBe(true);
    expect(summary.hasNext).toBe(true);
    expect(summary.previousStartIndex).toBe(0);
    expect(summary.nextStartIndex).toBe(40);
    expect(summary.rangeLabel).toBe('21–40 of 45');
  });

  it('has no next page on a partial last page', () => {
    const summary = summarizePage({ startIndex: 40, limit: 20 }, 45, 5);
    expect(summary.hasNext).toBe(false);
    expect(summary.hasPrevious).toBe(true);
    expect(summary.rangeLabel).toBe('41–45 of 45');
  });

  it('clamps a negative startIndex to 0 rather than throwing', () => {
    const summary = summarizePage({ startIndex: -5, limit: 20 }, 45, 20);
    expect(summary.startIndex).toBe(0);
    expect(summary.hasPrevious).toBe(false);
  });

  it('clamps the previous startIndex at 0 when the current page is smaller than one full "back" step', () => {
    const summary = summarizePage({ startIndex: 10, limit: 20 }, 45, 20);
    expect(summary.previousStartIndex).toBe(0);
  });

  it('treats a negative total as zero rather than throwing', () => {
    const summary = summarizePage({ startIndex: 0, limit: 20 }, -3, 0);
    expect(summary.total).toBe(0);
    expect(summary.rangeLabel).toBe('0 of 0');
  });

  it('reports a single full page as having neither a previous nor a next page', () => {
    const summary = summarizePage({ startIndex: 0, limit: 40 }, 3, 3);
    expect(summary.hasPrevious).toBe(false);
    expect(summary.hasNext).toBe(false);
    expect(summary.rangeLabel).toBe('1–3 of 3');
  });
});
