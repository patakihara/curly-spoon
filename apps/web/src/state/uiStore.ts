/**
 * Session-only UI state that has no business in React Query (it isn't server
 * data) and no business persisting across reloads (it isn't a preference).
 *
 * `searchFocusToken` is a counter rather than a boolean: `useKeyboardShortcuts`
 * bumps it on every `/` press, and `SearchField` watches it with a `useEffect` to
 * call `.focus()` — a counter fires that effect every time even if the field was
 * already focused-and-blurred between two presses, where a boolean toggling
 * true→true would not.
 */
import { create } from 'zustand';

export interface UiState {
  shortcutSheetOpen: boolean;
  openShortcutSheet: () => void;
  closeShortcutSheet: () => void;
  searchFocusToken: number;
  requestSearchFocus: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  shortcutSheetOpen: false,
  openShortcutSheet: () => set({ shortcutSheetOpen: true }),
  closeShortcutSheet: () => set({ shortcutSheetOpen: false }),
  searchFocusToken: 0,
  requestSearchFocus: () => set((state) => ({ searchFocusToken: state.searchFocusToken + 1 })),
}));
