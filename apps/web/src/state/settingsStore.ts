/**
 * Playback preferences — currently just the ±skip intervals — shared across
 * audiobooks and podcasts (never gated on media kind: a podcast listener wants
 * the same back/forward controls a book listener does). Persisted the same way
 * `themeStore.ts` persists appearance: `zustand`'s `persist` middleware over a
 * storage shim that falls back to an in-memory `Map` outside a browser (this
 * store's own Vitest unit tests, and any future server-side use, run under Node
 * with no `window`).
 *
 * Kept apart from `playerStore.ts` deliberately: that store is the *session's*
 * state (what's loaded, playing, at what time) and should not survive a reload,
 * while this one is a durable preference — folding both into one `persist`
 * config would mean either persisting session state that shouldn't outlive the
 * tab, or hand-picking fields via `partialize` in a store that otherwise has no
 * use for it.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { isSkipInterval, type SkipInterval } from '../features/player/playback.js';

export const SETTINGS_STORAGE_KEY = 'auralis:settings';

const memoryFallback = new Map<string, string>();

const storage: StateStorage = {
  getItem: (name) =>
    typeof window !== 'undefined'
      ? window.localStorage.getItem(name)
      : (memoryFallback.get(name) ?? null),
  setItem: (name, value) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(name, value);
    else memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(name);
    else memoryFallback.delete(name);
  },
};

export interface SettingsState {
  skipBackSeconds: SkipInterval;
  skipForwardSeconds: SkipInterval;
  setSkipBackSeconds: (seconds: SkipInterval) => void;
  setSkipForwardSeconds: (seconds: SkipInterval) => void;
}

const DEFAULT_SKIP_SECONDS: SkipInterval = 30;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      skipBackSeconds: DEFAULT_SKIP_SECONDS,
      skipForwardSeconds: DEFAULT_SKIP_SECONDS,
      setSkipBackSeconds: (seconds) => set({ skipBackSeconds: seconds }),
      setSkipForwardSeconds: (seconds) => set({ skipForwardSeconds: seconds }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        skipBackSeconds: state.skipBackSeconds,
        skipForwardSeconds: state.skipForwardSeconds,
      }),
      // A hand-edited or stale-build localStorage value could hold anything —
      // `isSkipInterval` is the same guard `settingsStore` reads through on the
      // way in, applied here on the way out of storage too, so a corrupt value
      // degrades to the default instead of poisoning the store.
      merge: (persisted, current) => {
        const candidate = persisted as Partial<SettingsState> | undefined;
        return {
          ...current,
          skipBackSeconds: isSkipInterval(candidate?.skipBackSeconds)
            ? candidate.skipBackSeconds
            : current.skipBackSeconds,
          skipForwardSeconds: isSkipInterval(candidate?.skipForwardSeconds)
            ? candidate.skipForwardSeconds
            : current.skipForwardSeconds,
        };
      },
    },
  ),
);
