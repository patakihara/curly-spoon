import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AURALIS_SOURCE_COLOR, DEFAULT_ACCENT } from '@auralis/ui';
import { sanitizePersistedTheme, THEME_STORAGE_KEY, useThemeStore } from './themeStore.js';

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({
      mode: 'system',
      sourceColor: AURALIS_SOURCE_COLOR,
      accent: DEFAULT_ACCENT,
    });
  });

  it('defaults to system mode and the Auralis fallback colour', () => {
    const state = useThemeStore.getState();
    expect(state.mode).toBe('system');
    expect(state.sourceColor).toBe(AURALIS_SOURCE_COLOR);
  });

  it('defaults accent to Sonora violet', () => {
    expect(useThemeStore.getState().accent).toBe(DEFAULT_ACCENT);
  });

  it('setMode updates the mode without touching sourceColor or accent', () => {
    useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState().sourceColor).toBe(AURALIS_SOURCE_COLOR);
    expect(useThemeStore.getState().accent).toBe(DEFAULT_ACCENT);
  });

  it('setSourceColor updates the colour Phase 5 will drive from artwork', () => {
    useThemeStore.getState().setSourceColor('#1B6EF3');
    expect(useThemeStore.getState().sourceColor).toBe('#1B6EF3');
  });

  it('setAccent updates --accent, the one colour Settings visibly changes today', () => {
    useThemeStore.getState().setAccent('#ef4444');
    expect(useThemeStore.getState().accent).toBe('#ef4444');
  });

  it('persists mode, sourceColor and accent to the injected storage under a stable key', async () => {
    vi.resetModules();
    const memory = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
    });

    const fresh = await import('./themeStore.js');
    fresh.useThemeStore.getState().setMode('light');
    fresh.useThemeStore.getState().setAccent('#22c55e');

    const raw = memory.get(THEME_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.mode).toBe('light');
    expect(parsed.state.accent).toBe('#22c55e');

    vi.unstubAllGlobals();
  });
});

describe('sanitizePersistedTheme', () => {
  it('keeps every field of a well-formed persisted payload', () => {
    expect(
      sanitizePersistedTheme({ mode: 'dark', sourceColor: '#1B6EF3', accent: '#22c55e' }),
    ).toEqual({ mode: 'dark', sourceColor: '#1B6EF3', accent: '#22c55e' });
  });

  it.each(['light', 'dark', 'system'])('admits %s as a mode', (mode) => {
    expect(sanitizePersistedTheme({ mode }).mode).toBe(mode);
  });

  it('drops a mode outside the union rather than letting it reach data-theme', () => {
    expect(sanitizePersistedTheme({ mode: 'midnight' })).toEqual({});
  });

  it('drops an accent that is not a hex colour, since it is written into --accent', () => {
    expect(sanitizePersistedTheme({ accent: 'red; content: url(x)' })).toEqual({});
    expect(sanitizePersistedTheme({ accent: '#fff' })).toEqual({});
  });

  it('drops a non-string field of the right name', () => {
    expect(sanitizePersistedTheme({ mode: 3, sourceColor: null, accent: ['#22c55e'] })).toEqual({});
  });

  it('keeps the good fields of a partly-corrupt payload rather than discarding all of it', () => {
    expect(sanitizePersistedTheme({ mode: 'midnight', accent: '#22c55e' })).toEqual({
      accent: '#22c55e',
    });
  });

  it('returns nothing for a payload that is not an object at all', () => {
    expect(sanitizePersistedTheme(null)).toEqual({});
    expect(sanitizePersistedTheme('dark')).toEqual({});
    expect(sanitizePersistedTheme(undefined)).toEqual({});
  });
});

describe('useThemeStore rehydration', () => {
  it('falls back to the defaults when storage holds a corrupt payload', async () => {
    vi.resetModules();
    const memory = new Map<string, string>([
      [
        THEME_STORAGE_KEY,
        JSON.stringify({
          state: { mode: 'midnight', sourceColor: 'not-a-colour', accent: 'javascript:0' },
          version: 0,
        }),
      ],
    ]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
    });

    const fresh = await import('./themeStore.js');
    const state = fresh.useThemeStore.getState();
    expect(state.mode).toBe('system');
    expect(state.sourceColor).toBe(AURALIS_SOURCE_COLOR);
    expect(state.accent).toBe(DEFAULT_ACCENT);

    vi.unstubAllGlobals();
  });

  it('still rehydrates a payload it can vouch for', async () => {
    vi.resetModules();
    const memory = new Map<string, string>([
      [
        THEME_STORAGE_KEY,
        JSON.stringify({ state: { mode: 'dark', accent: '#22c55e' }, version: 0 }),
      ],
    ]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
    });

    const fresh = await import('./themeStore.js');
    expect(fresh.useThemeStore.getState().mode).toBe('dark');
    expect(fresh.useThemeStore.getState().accent).toBe('#22c55e');

    vi.unstubAllGlobals();
  });
});
