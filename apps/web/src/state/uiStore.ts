/**
 * Session-only UI state that has no business in React Query (it isn't server
 * data) and no business persisting across reloads (it isn't a preference).
 *
 * `searchFocusToken` is a counter rather than a boolean: `useKeyboardShortcuts`
 * bumps it on every `/` press, and `SearchField` watches it with a `useEffect` to
 * call `.focus()` — a counter fires that effect every time even if the field was
 * already focused-and-blurred between two presses, where a boolean toggling
 * true→true would not.
 *
 * `query` is the search box's text, shared for the same reason: the desktop
 * rail's always-visible search input (`Shell.tsx`) and `SearchPage`'s own field
 * are two views onto the same string, not two independent ones — a user can
 * reach `/search` from either (typing in the rail, or the `/` shortcut), and
 * whichever they used second must show what the other already typed. It lives
 * here rather than in `SearchPage`'s local state for the same reason
 * `searchFocusToken` does: it's cross-page UI state, not server data.
 */
import { create } from 'zustand';

export interface UiState {
  shortcutSheetOpen: boolean;
  openShortcutSheet: () => void;
  closeShortcutSheet: () => void;
  searchFocusToken: number;
  requestSearchFocus: () => void;
  query: string;
  setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  shortcutSheetOpen: false,
  openShortcutSheet: () => set({ shortcutSheetOpen: true }),
  closeShortcutSheet: () => set({ shortcutSheetOpen: false }),
  searchFocusToken: 0,
  requestSearchFocus: () => set((state) => ({ searchFocusToken: state.searchFocusToken + 1 })),
  query: '',
  setSearchQuery: (query) => set({ query }),
}));
