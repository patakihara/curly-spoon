import { describe, expect, it } from 'vitest';
import { musicSearchViewState } from './musicSearchStatus.js';

describe('musicSearchViewState', () => {
  it('is idle before anything has been submitted', () => {
    expect(musicSearchViewState({ submittedTerm: '', isLoading: false, candidateCount: 0 })).toBe(
      'idle',
    );
  });

  it('is idle for a submitted term that is only whitespace', () => {
    expect(
      musicSearchViewState({ submittedTerm: '   ', isLoading: false, candidateCount: 0 }),
    ).toBe('idle');
  });

  it('is searching while the query has no answer yet, even with zero candidates so far', () => {
    expect(
      musicSearchViewState({ submittedTerm: 'dune', isLoading: true, candidateCount: 0 }),
    ).toBe('searching');
  });

  it('never reports empty while still loading — the in-flight-vs-settled trap this exists to avoid', () => {
    // A slow slskd search that has not yet returned must never look like "nothing
    // matched" — that is a false negative, not a legitimate empty result.
    expect(
      musicSearchViewState({ submittedTerm: 'dune', isLoading: true, candidateCount: 0 }),
    ).not.toBe('empty');
  });

  it('is results once settled with at least one candidate', () => {
    expect(
      musicSearchViewState({ submittedTerm: 'dune', isLoading: false, candidateCount: 3 }),
    ).toBe('results');
  });

  it('is empty once settled with zero candidates', () => {
    expect(
      musicSearchViewState({ submittedTerm: 'dune', isLoading: false, candidateCount: 0 }),
    ).toBe('empty');
  });
});
