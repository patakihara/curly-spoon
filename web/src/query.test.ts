import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchView } from './data/search';
import { createDraftStore, searchText, SETTLE_MS, submitSearch } from './query';

describe('the search draft', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('holds what is typed at once, and settles only once typing pauses', () => {
    const drafts = createDraftStore();
    drafts.type('r', '');
    expect(drafts.get()).toEqual({ text: 'r', over: '', settled: null, submitted: false });
    vi.advanceTimersByTime(SETTLE_MS - 1);
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(drafts.get()).toEqual({ text: 'ri', over: '', settled: null, submitted: false });
    vi.advanceTimersByTime(1);
    expect(drafts.get()).toEqual({ text: 'ri', over: '', settled: 'ri', submitted: false });
  });

  it('keeps what had settled while the next keystrokes wait to', () => {
    const drafts = createDraftStore();
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS);
    drafts.type('ris', '');
    expect(drafts.get()).toEqual({ text: 'ris', over: '', settled: 'ri', submitted: false });
  });

  it('starts afresh when typed over another search', () => {
    const drafts = createDraftStore();
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS);
    drafts.type('po', 'rise');
    expect(drafts.get()).toEqual({ text: 'po', over: 'rise', settled: null, submitted: false });
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

  it('drops a submitted draft once another search is shown, and keeps one only typed', () => {
    const drafts = createDraftStore();
    drafts.type('po', 'rise');
    drafts.dropSubmitted('po');
    expect(drafts.get()?.text).toBe('po');
    drafts.submit();
    drafts.dropSubmitted('rise');
    expect(drafts.get()?.submitted).toBe(true);
    drafts.dropSubmitted('po');
    expect(drafts.get()).toBeNull();
  });

  it('never settles a draft once submitted', () => {
    const drafts = createDraftStore();
    drafts.type('po', 'rise');
    drafts.submit();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(drafts.get()?.settled).toBeNull();
  });
});

describe('running a search', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('opens the new search while the draft still stands over the old, so the old is never asked again', () => {
    const drafts = createDraftStore();
    drafts.type('poems', 'rumours');
    const asked: unknown[] = [];
    const opened: string[] = [];
    submitSearch(
      'poems',
      'rumours',
      (to) => {
        opened.push(to);
        // Drawn before the address changes, the page still shows the draft over the old search.
        asked.push(searchView('rumours', drafts.get()).asks);
      },
      drafts,
    );
    expect(opened).toEqual(['/search?q=poems']);
    expect(asked).not.toContainEqual({ q: 'rumours' });
  });

  it('runs the search already shown by settling the field on it, opening nothing', () => {
    const drafts = createDraftStore();
    drafts.type('rumours', 'rumours');
    const opened: string[] = [];
    submitSearch('rumours ', 'rumours', (to) => opened.push(to), drafts);
    expect(opened).toEqual([]);
    expect(drafts.get()).toBeNull();
  });

  it('asks the search already shown again, so one that failed is tried anew, and only that one', () => {
    const again: string[] = [];
    const opened: string[] = [];
    const run = (text: string, shown: string) =>
      submitSearch(
        text,
        shown,
        (to) => opened.push(to),
        createDraftStore(),
        (q) => again.push(q),
      );
    run(' rumours', 'rumours');
    run('poems', 'rumours');
    expect(again).toEqual(['rumours']);
    expect(opened).toEqual(['/search?q=poems']);
  });

  it('opens Search with nothing for nothing but spaces', () => {
    const opened: string[] = [];
    submitSearch('   ', 'rise', (to) => opened.push(to), createDraftStore());
    expect(opened).toEqual(['/search']);
  });

  it('runs at most what the server takes: trimmed, 200 letters, an emoji never split', () => {
    const opened: string[] = [];
    const long = `${'a'.repeat(199)}🎵🎵`;
    submitSearch(`  ${long}  `, '', (to) => opened.push(to), createDraftStore());
    expect(opened).toEqual([`/search?${new URLSearchParams({ q: `${'a'.repeat(199)}🎵` })}`]);
  });
});

describe('the text searched for', () => {
  it('is trimmed and cut to 200 letters, counting an emoji as one, and trimmed again', () => {
    expect(searchText('  rise  ')).toBe('rise');
    expect([...searchText('🎵'.repeat(250))]).toHaveLength(200);
    expect(searchText(`${'a'.repeat(199)} b`)).toBe('a'.repeat(199));
    expect(searchText('x'.repeat(200))).toBe('x'.repeat(200));
  });
});
