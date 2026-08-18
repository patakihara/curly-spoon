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
import { AURALIS_SOURCE_COLOR, DEFAULT_ACCENT, type ThemeMode } from '@auralis/ui';

export const THEME_STORAGE_KEY = 'auralis:theme';

/**
 * Falls back to an in-memory `Map` outside a browser (SSR, or this file's own
 * Vitest unit tests, which run under Node with no `window`) rather than
 * throwing — persistence is a nicety, not something that should crash the store.
 */
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

export interface ThemeState {
  mode: ThemeMode;
  /**
   * Kept for API compatibility only — since wave 16c-2-W-1 this no longer drives any
   * `--m3-*` surface (`@auralis/ui`'s `color.ts` module doc comment). `accent` below is
   * the one colour Settings' picker still visibly changes.
   */
  sourceColor: string;
  /** Sonora's one customisable colour (`--accent`) — one of `@auralis/ui`'s `ACCENT_PRESETS`. */
  accent: string;
  setMode: (mode: ThemeMode) => void;
  /** Re-themes the shell — Phase 5 calls this with colour extracted from artwork. */
  setSourceColor: (hex: string) => void;
  /** Re-themes `--accent` — Settings' colour-swatch picker calls this. */
  setAccent: (hex: string) => void;
}

/**
 * The three values `ThemeMode` admits, as data — `ThemeMode` is a type, so it cannot be
 * enumerated at runtime and the list has to exist somewhere. Kept next to the validator
 * that is its only consumer.
 */
const THEME_MODES: readonly string[] = ['light', 'dark', 'system'];

/** Six-digit hex, the form every `ACCENT_PRESETS` entry and both defaults are written in. */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/**
 * Rehydration is the one place untrusted data enters this store: `localStorage` survives
 * upgrades, is editable by hand, and is shared with whatever else ran on this origin. An
 * unvalidated `mode` reaches `ThemeProvider`'s `data-theme` attribute and an unvalidated
 * `accent` is written straight into the `--accent` custom property, so a garbage value is
 * not merely wrong — it renders. Android already falls back explicitly (`16f-P` named the
 * divergence); this is web's half.
 *
 * Total by construction: anything it cannot vouch for is simply omitted, so `merge` leaves
 * the store's own default in place rather than throwing or clearing the whole key. One bad
 * field therefore costs only that field.
 *
 * `accent` is checked for hex **shape**, deliberately not for membership of `ACCENT_PRESETS`
 * — the presets are today's picker, not a permanent constraint, and rejecting an off-preset
 * colour would silently discard a custom accent the moment one is allowed. Shape is what
 * closes the hazard; the preset list is a product decision that does not belong here.
 */
export function sanitizePersistedTheme(
  persisted: unknown,
): Partial<Pick<ThemeState, 'mode' | 'sourceColor' | 'accent'>> {
  if (typeof persisted !== 'object' || persisted === null) return {};
  const raw = persisted as Record<string, unknown>;
  const clean: Partial<Pick<ThemeState, 'mode' | 'sourceColor' | 'accent'>> = {};

  if (typeof raw.mode === 'string' && THEME_MODES.includes(raw.mode)) {
    clean.mode = raw.mode as ThemeMode;
  }
  if (typeof raw.sourceColor === 'string' && HEX_COLOUR.test(raw.sourceColor)) {
    clean.sourceColor = raw.sourceColor;
  }
  if (typeof raw.accent === 'string' && HEX_COLOUR.test(raw.accent)) {
    clean.accent = raw.accent;
  }
  return clean;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      sourceColor: AURALIS_SOURCE_COLOR,
      accent: DEFAULT_ACCENT,
      setMode: (mode) => set({ mode }),
      setSourceColor: (hex) => set({ sourceColor: hex }),
      setAccent: (hex) => set({ accent: hex }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        mode: state.mode,
        sourceColor: state.sourceColor,
        accent: state.accent,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersistedTheme(persisted) }),
    },
  ),
);
