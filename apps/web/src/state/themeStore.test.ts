import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AURALIS_SOURCE_COLOR, DEFAULT_ACCENT } from '@auralis/ui';
import { THEME_STORAGE_KEY, useThemeStore } from './themeStore.js';

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
