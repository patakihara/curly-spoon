import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore.js';

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ shortcutSheetOpen: false, searchFocusToken: 0, query: '' });
  });

  it('starts with the shortcut sheet closed', () => {
    expect(useUiStore.getState().shortcutSheetOpen).toBe(false);
  });

  it('opens and closes the shortcut sheet', () => {
    useUiStore.getState().openShortcutSheet();
    expect(useUiStore.getState().shortcutSheetOpen).toBe(true);
    useUiStore.getState().closeShortcutSheet();
    expect(useUiStore.getState().shortcutSheetOpen).toBe(false);
  });

  it('bumps the search focus token on every request, including repeats', () => {
    const before = useUiStore.getState().searchFocusToken;
    useUiStore.getState().requestSearchFocus();
    useUiStore.getState().requestSearchFocus();
    expect(useUiStore.getState().searchFocusToken).toBe(before + 2);
  });

  it('starts with an empty search query', () => {
    expect(useUiStore.getState().query).toBe('');
  });

  it('shares the search query across every reader of the store', () => {
    // This is what keeps the desktop rail's search input (Shell.tsx) and
    // SearchPage's own field in sync: both read `query` from this one store,
    // so a write from either shows up to both.
    useUiStore.getState().setSearchQuery('dune');
    expect(useUiStore.getState().query).toBe('dune');
    useUiStore.getState().setSearchQuery('');
    expect(useUiStore.getState().query).toBe('');
  });
});
