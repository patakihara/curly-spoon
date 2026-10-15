import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftStore, SETTLE_MS } from './query';

describe('the search draft', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('holds what is typed at once, and settles only once typing pauses', () => {
    const drafts = createDraftStore();
    drafts.type('r', '');
    expect(drafts.get()).toEqual({ text: 'r', over: '', settled: null });
    vi.advanceTimersByTime(SETTLE_MS - 1);
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(drafts.get()).toEqual({ text: 'ri', over: '', settled: null });
    vi.advanceTimersByTime(1);
    expect(drafts.get()).toEqual({ text: 'ri', over: '', settled: 'ri' });
  });

  it('keeps what had settled while the next keystrokes wait to', () => {
    const drafts = createDraftStore();
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS);
    drafts.type('ris', '');
    expect(drafts.get()).toEqual({ text: 'ris', over: '', settled: 'ri' });
  });

  it('starts afresh when typed over another search', () => {
    const drafts = createDraftStore();
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS);
    drafts.type('po', 'rise');
    expect(drafts.get()).toEqual({ text: 'po', over: 'rise', settled: null });
  });

  it('is dropped when cleared, and a pause after never brings it back', () => {
    const drafts = createDraftStore();
    const heard = vi.fn();
    drafts.subscribe(heard);
    drafts.type('ri', '');
    drafts.clear();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(drafts.get()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
