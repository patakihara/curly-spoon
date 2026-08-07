import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOR_YOU_FILTER,
  FOR_YOU_FILTER_OPTIONS,
  selectForYouFilter,
} from './forYouFilters.js';

describe('FOR_YOU_FILTER_OPTIONS', () => {
  it("is All / Music / Podcasts / Audiobooks, in that order — the screenshots' own wording", () => {
    expect(FOR_YOU_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      'All',
      'Music',
      'Podcasts',
      'Audiobooks',
    ]);
  });

  it('uses the value "books" for the Audiobooks chip, matching the content type it filters', () => {
    expect(FOR_YOU_FILTER_OPTIONS.find((o) => o.label === 'Audiobooks')?.value).toBe('books');
  });
});

describe('selectForYouFilter', () => {
  it('selects a new filter from the default', () => {
    expect(selectForYouFilter(DEFAULT_FOR_YOU_FILTER, 'music')).toBe('music');
  });

  it('clicking the already-active chip clears back to "all"', () => {
    expect(selectForYouFilter('music', 'music')).toBe(DEFAULT_FOR_YOU_FILTER);
  });

  it('selecting a different filter replaces the previous one outright', () => {
    expect(selectForYouFilter('music', 'podcasts')).toBe('podcasts');
  });
});
