/**
 * UI-only theming state (docs/DESIGN.md § Colour): the user's light/dark/system
 * choice, and the source colour the shell themes from. Phase 5 will push freshly
 * extracted artwork colour in here as playback changes; this phase seeds it with
 * the Auralis fallback amber and wires persistence + the toggle in Settings.
 *
 * Server data (libraries, items, progress…) never lives here — that's React
 * Query's job, per CLAUDE.md's "keep server data in React Query" rule. This store
 * is purely client/session UI state.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { AURALIS_SOURCE_COLOR, type ThemeMode } from '@auralis/ui';

export const THEME_STORAGE_KEY = 'auralis:theme';

/**
 * Falls back to an in-memory `Map` outside a browser (SSR, or this file's own
 * Vitest unit tests, which run under Node with no `window`) rather than
 * throwing — persistence is a nicety, not something that should crash the store.
 */
const memoryFallback = new Map<string, string>();

const storage: StateStorage = {
  getItem: (name) =>
    typeof window !== 'undefined' ? window.localStorage.getItem(name) : (memoryFallback.get(name) ?? null),
  setItem: (name, value) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(name, value);
    else memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(name);
    else memoryFallback.delete(name);
  },
};

export interface ThemeState {
  mode: ThemeMode;
  sourceColor: string;
  setMode: (mode: ThemeMode) => void;
  /** Re-themes the shell — Phase 5 calls this with colour extracted from artwork. */
  setSourceColor: (hex: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      sourceColor: AURALIS_SOURCE_COLOR,
      setMode: (mode) => set({ mode }),
      setSourceColor: (hex) => set({ sourceColor: hex }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ mode: state.mode, sourceColor: state.sourceColor }),
    },
  ),
);
