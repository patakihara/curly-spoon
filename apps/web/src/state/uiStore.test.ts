import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore.js';

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ shortcutSheetOpen: false, searchFocusToken: 0 });
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
});
